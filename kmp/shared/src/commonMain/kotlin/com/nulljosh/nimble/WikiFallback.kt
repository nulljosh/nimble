package com.nulljosh.nimble

import io.ktor.http.encodeURLParameter
import io.ktor.http.encodeURLPathPart
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * The Wikipedia fallback when the free AI is unavailable. Offline-testable: every request goes through [TextFetch].
 *
 * A relation question ("capital of X", "who wrote X", "when was X") answers only from an intro sentence that carries
 * the relation word. The subject's own page goes first, then the top five search hits. A list article never answers,
 * and a loose hit never answers a relation question. Same rule as `wiki()` in docs/engine.js and the Swift QueryEngine.
 */
internal object WikiFallback {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    /** The relation shape of a question: the subject, the word an answer sentence must carry, and a word that disqualifies it. */
    internal data class Relation(val subject: String, val word: Regex, val excluded: Regex?)

    private val shapes = listOf(
        Triple(
            Regex("""^(?:what(?:'s|\s+is)(?:\s+the)?\s+|the\s+)?capital(?:\s+city)?\s+of\s+(.+?)\s*\??$""", RegexOption.IGNORE_CASE),
            Regex("""\bcapital\b""", RegexOption.IGNORE_CASE),
            Regex("capital punishment", RegexOption.IGNORE_CASE),
        ),
        Triple(
            Regex("""^who\s+(?:wrote|written|authored|painted|composed|directed|invented|discovered|founded|created)\s+(.+?)\s*\??$""", RegexOption.IGNORE_CASE),
            Regex("""\b(?:written|wrote|author|authored|composed|painted|directed|invented|discovered|founded|created)\b""", RegexOption.IGNORE_CASE),
            null,
        ),
        Triple(
            Regex("""^when\s+(?:was|did|were|is)\s+(.+?)(?:\s+(?:born|founded|built|invented|released|published|created|written|made|died|die))?\s*\??$""", RegexOption.IGNORE_CASE),
            Regex("""\b(?:1[0-9]{3}|20[0-9]{2})\b"""),
            null,
        ),
    )

    fun relationOf(query: String): Relation? {
        val q = query.trim()
        for ((pattern, word, excluded) in shapes) {
            val subject = pattern.find(q)?.groupValues?.get(1) ?: continue
            return Relation(subject.removePrefix("the ").removePrefix("The "), word, excluded)
        }
        return null
    }

    @Serializable private data class SearchResponse(val query: SearchQuery? = null)
    @Serializable private data class SearchQuery(val search: List<SearchHit> = emptyList())
    @Serializable private data class SearchHit(val title: String? = null)
    @Serializable private data class IntroResponse(val query: IntroQuery? = null)
    @Serializable private data class IntroQuery(val pages: List<IntroPage> = emptyList())
    @Serializable private data class IntroPage(val title: String? = null, val extract: String? = null, val missing: Boolean? = null)

    private data class Intro(val title: String, val extract: String)

    private fun isList(title: String?): Boolean = title?.startsWith("List of ", ignoreCase = true) == true

    /** Top search titles for the question, list articles removed. Empty on any failure. */
    private suspend fun searchHits(query: String, get: TextFetch): List<String> {
        val body = get(
            "https://en.wikipedia.org/w/api.php?action=query&list=search" +
                "&srsearch=${query.encodeURLParameter()}&format=json&srlimit=5&origin=*"
        ) ?: return emptyList()
        return runCatching {
            json.decodeFromString<SearchResponse>(body).query?.search.orEmpty()
                .mapNotNull { it.title }.filter { !isList(it) }.take(5)
        }.getOrDefault(emptyList())
    }

    /** A page's lead text. Null for a missing page, a list or a disambiguation page. */
    private suspend fun introOf(title: String, get: TextFetch): Intro? {
        val body = get(
            "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1" +
                "&format=json&formatversion=2&origin=*&titles=${title.encodeURLParameter()}"
        ) ?: return null
        val page = runCatching { json.decodeFromString<IntroResponse>(body).query?.pages?.firstOrNull() }.getOrNull() ?: return null
        val t = page.title ?: return null
        val extract = page.extract?.takeIf { it.isNotEmpty() } ?: return null
        if (page.missing == true || isList(t) || extract.take(300).contains("may refer to", ignoreCase = true)) return null
        return Intro(t, extract)
    }

    /** The first sentence with the relation word. A search hit (not [ownPage]) must also name the subject's words. */
    internal fun relationSentence(extract: String, rel: Relation, ownPage: Boolean): String? {
        val subjectWords = keyWordsOf(rel.subject)
        for (raw in extract.split(Regex("""(?<=[.!?])\s+"""))) {
            val s = raw.replace(Regex("""\s*\(\s*\)"""), "").replace(Regex("""\s+,"""), ",").trim()
            if (!rel.word.containsMatchIn(s)) continue
            if (rel.excluded?.containsMatchIn(s) == true) continue
            if (ownPage) return s
            val named = if (subjectWords.isEmpty()) s.lowercase().contains(rel.subject.lowercase())
                else subjectWords.all { it in keyWordsOf(s) }
            if (named) return s
        }
        return null
    }

    /** Content words of four letters or more, lower case. */
    private fun keyWordsOf(s: String): Set<String> = Regex("""[a-z]{4,}""").findAll(s.lowercase()).map { it.value }.toSet()

    private fun pageUrl(title: String): String = "https://en.wikipedia.org/wiki/" + title.replace(" ", "_").encodeURLPathPart()

    /** The answer for [query] from Wikipedia, or null. Relation questions never fall back to a loose search hit. */
    suspend fun answer(query: String, get: TextFetch): Answer.Text? {
        relationOf(query)?.let { rel ->
            val hits = searchHits(query, get)
            val pages = listOf(introOf(rel.subject, get)) + hits.map { introOf(it, get) }
            pages.forEachIndexed { i, page ->
                if (page == null) return@forEachIndexed
                val body = relationSentence(page.extract, rel, ownPage = i == 0) ?: return@forEachIndexed
                return Answer.Text(page.title, body, "Wikipedia", pageUrl(page.title), grounding = page.extract)
            }
            return null
        }
        // Any other question: the exact article first, then the top hits. The first usable page answers.
        val direct = summary(query.replace(" ", "_").encodeURLPathPart(), get)
        if (direct != null) return direct
        for (title in searchHits(query, get)) {
            summary(title.replace(" ", "_").encodeURLPathPart(), get)?.let { return it }
        }
        return null
    }

    /** A REST summary: the title, first sentence, page link and lead photo. Disambiguation and list pages are skipped. */
    private suspend fun summary(titlePath: String, get: TextFetch): Answer.Text? {
        val body = get("https://en.wikipedia.org/api/rest_v1/page/summary/$titlePath") ?: return null
        val w = runCatching { json.decodeFromString<WikiSummary>(body) }.getOrNull() ?: return null
        if (w.type == "disambiguation" || isList(w.title)) return null
        val extract = w.extract?.takeIf { it.isNotEmpty() } ?: return null
        return Answer.Text(w.title, firstSentence(extract), "Wikipedia", w.contentUrls?.desktop?.page, photoUrl = leadPhoto(w.thumbnail?.source))
    }
}
