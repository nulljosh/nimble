package com.nulljosh.nimble

import io.ktor.http.encodeURLParameter
import io.ktor.http.encodeURLPathPart
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject

/** Fetches a URL's body as text, or null on any failure or a non-200 reply. */
typealias TextFetch = suspend (String) -> String?

/** The Wikipedia topic an answer names: its picture with the "<Title> · Wikipedia" credit, and the intro and page behind it. */
data class TopicLookup(val photoUrl: String?, val photoCredit: String?, val extract: String?, val page: String?)

/**
 * Same rules as Swift's `QueryEngine.topicLookup` and `docs/engine.js` `topicFor`. An AI answer with no proxy photo
 * takes the picture of the Wikipedia topic its sentence names; "Why this answer" takes that page's intro.
 */
object TopicPhoto {
    /** Math, units, weather and time never look for a photo. */
    private val noPhotoQuery = Regex(
        """\b(weather|forecast|temperature|time|clock|convert|math|sum|plus|minus|times|divided|percent)\b|\d""",
        RegexOption.IGNORE_CASE
    )

    /** Capitalised runs the answer names: "Paris" in "The capital of France is Paris." */
    private val entityPattern = Regex("""\b\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+){0,3}""")

    /** Sentence starters and pronouns are never topics. */
    private val notEntity = setOf(
        "The", "A", "An", "It", "This", "That", "In", "On", "At", "As", "Its", "He", "She", "They", "There",
        "Yes", "No", "I", "Of", "For", "And", "But", "If", "When", "Where", "Who", "What", "From", "With",
        "By", "To", "Is", "Was", "These", "Those", "We", "You",
    )

    private val topicJson = Json { ignoreUnknownKeys = true; isLenient = true }

    /**
     * Candidates, in order: the proper nouns the answer names (two), then the top Wikipedia search hits for the question
     * (two, not lists). The first with a real picture gives the photo; the first with text and a page gives the intro.
     * Null when nothing comes back. A page with no picture gives no picture, never a guess.
     */
    suspend fun lookup(query: String, body: String, get: TextFetch): TopicLookup? {
        if (noPhotoQuery.containsMatchIn(query)) return null
        val q = query.lowercase()
        val ents = mutableListOf<String>()
        for (m in entityPattern.findAll(body)) {
            val e = m.value
            if (e !in notEntity && !q.contains(e.lowercase()) && e !in ents) ents.add(e)
        }
        val hits = searchTitles(query, get)
            .filter { !it.startsWith("list of", ignoreCase = true) && it !in ents }
            .take(2)
        val candidates = ents.take(2) + hits
        val summaries = coroutineScope {
            candidates.map { title -> async { topicSummary(title, get) } }.awaitAll()
        }.filterNotNull()

        val pic = summaries.firstNotNullOfOrNull { s ->
            leadPhoto(s.thumbnail?.source)?.let { url -> url to s.title }
        }
        val text = summaries.firstOrNull { it.extract != null && pageOf(it) != null }
        if (pic == null && text == null) return null
        return TopicLookup(
            photoUrl = pic?.first,
            photoCredit = pic?.second?.let { "$it · Wikipedia" },
            extract = text?.extract,
            page = text?.let { pageOf(it) },
        )
    }

    /**
     * The answer with its topic filled in: a missing picture, and when nothing else backs the answer, the intro
     * ("Why this answer") and the Wikipedia page as its link. An answer that already has a photo is returned as it is.
     */
    suspend fun withTopic(answer: Answer.Text, query: String, get: TextFetch): Answer.Text {
        if (answer.photoUrl != null) return answer
        val topic = lookup(query, answer.body, get) ?: return answer
        return answer.copy(
            sourceUrl = topic.page ?: answer.sourceUrl,
            photoUrl = topic.photoUrl,
            photoCredit = topic.photoCredit,
            grounding = answer.grounding ?: topic.extract,
        )
    }

    /** The top Wikipedia search titles for the question. Empty on any failure. */
    private suspend fun searchTitles(query: String, get: TextFetch): List<String> {
        val body = get(
            "https://en.wikipedia.org/w/api.php?action=query&list=search" +
                "&srsearch=${query.encodeURLParameter()}&format=json&srlimit=3"
        ) ?: return emptyList()
        return runCatching {
            topicJson.parseToJsonElement(body).jsonObject["query"]?.jsonObject?.get("search")?.jsonArray
                ?.mapNotNull { (it.jsonObject["title"] as? JsonPrimitive)?.takeIf { p -> p.isString }?.content }
                .orEmpty()
        }.getOrDefault(emptyList())
    }

    /** One Wikipedia page's REST summary. Null for a missing page, a disambiguation page or no title. */
    private suspend fun topicSummary(title: String, get: TextFetch): WikiSummary? {
        val body = get(
            "https://en.wikipedia.org/api/rest_v1/page/summary/${title.replace(" ", "_").encodeURLPathPart()}"
        ) ?: return null
        val s = runCatching { topicJson.decodeFromString<WikiSummary>(body) }.getOrNull() ?: return null
        return s.takeIf { it.type != "disambiguation" && it.title != null }
    }

    private fun pageOf(s: WikiSummary): String? =
        s.contentUrls?.desktop?.page?.takeIf { it.startsWith("https://") }
}
