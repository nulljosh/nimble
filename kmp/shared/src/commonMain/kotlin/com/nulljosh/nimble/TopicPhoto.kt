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

/** A proper-noun run the answer names. [echo] is true when the question says it too. */
internal data class AnswerEntity(val name: String, val echo: Boolean)

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

    /** Capitalised runs the answer names, with lowercase particles inside a run ("Leonardo da Vinci"). */
    private val entityPattern = Regex(
        """\b\p{Lu}[\p{L}'’-]+(?:\s+(?:(?:da|de|del|della|der|di|du|la|le|van|von|of|the)\s+)?\p{Lu}[\p{L}'’-]+){0,3}"""
    )

    /** Sentence starters, months and weekdays are never a photo's entity. */
    private val notEntity = setOf(
        "The", "A", "An", "It", "This", "That", "In", "On", "At", "As", "Its", "He", "She", "They", "There",
        "Yes", "No", "I", "Of", "For", "And", "But", "If", "When", "Where", "Who", "What", "From", "With",
        "By", "To", "Is", "Was", "These", "Those", "We", "You",
        "January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
        "November", "December", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
    )

    private val determiners = setOf("the", "a", "an", "its", "his", "her", "their", "our")
    private val prepositions = setOf("of", "in", "from", "at", "on", "near", "into", "across", "between", "among", "within")

    private val glue = setOf(
        "that", "this", "with", "from", "which", "were", "have", "they", "their", "also", "been", "into", "about",
        "after", "there", "these", "those", "when", "where", "while", "would", "could", "should", "will",
    )

    private val topicJson = Json { ignoreUnknownKeys = true; isLenient = true }

    /**
     * The photo comes only from the entities the answer names (see [photoFromEntity]). The intro ("Why this answer")
     * comes from those entities first, then the top Wikipedia search hits for the question (two, not lists).
     * Null when nothing comes back. No entity, or no page that passes, gives no picture, never a guess.
     */
    suspend fun lookup(query: String, body: String, get: TextFetch): TopicLookup? {
        if (noPhotoQuery.containsMatchIn(query)) return null
        val ents = answerEntities(query, body)
        val names = ents.map { it.name }
        val hits = searchTitles(query, get)
            .filter { !it.startsWith("list of", ignoreCase = true) && it !in names }
            .take(2)
        val entSummaries = coroutineScope {
            ents.map { e -> async { topicSummary(e.name, get) } }.awaitAll()
        }
        val hitSummaries = coroutineScope {
            hits.map { title -> async { topicSummary(title, get) } }.awaitAll()
        }.filterNotNull()

        val answerWords = keyWords(body)
        val pic = ents.indices.firstNotNullOfOrNull { i ->
            val s = entSummaries[i] ?: return@firstNotNullOfOrNull null
            if (!photoFromEntity(s, ents[i], answerWords)) return@firstNotNullOfOrNull null
            leadPhoto(s.thumbnail?.source)?.let { url -> url to s.title }
        }
        val text = (entSummaries.filterNotNull() + hitSummaries).firstOrNull { it.extract != null && pageOf(it) != null }
        if (pic == null && text == null) return null
        return TopicLookup(
            photoUrl = pic?.first,
            photoCredit = pic?.second?.let { "$it · Wikipedia" },
            extract = text?.extract,
            page = text?.let { pageOf(it) },
        )
    }

    /** The entity's summary gives the photo: a real picture, its page contains the entity, and an echoed entity also shares a content word with the answer. */
    internal fun photoFromEntity(s: WikiSummary, entity: AnswerEntity, answerWords: Set<String>): Boolean {
        if (leadPhoto(s.thumbnail?.source) == null) return false
        val extract = s.extract ?: return false
        val lower = extract.lowercase()
        if (!entity.name.lowercase().split(Regex("\\s+")).all { it in lower }) return false
        if (!entity.echo) return true
        val own = keyWords(entity.name)
        val lead = keyWords(extract)
        return answerWords.any { it !in own && it in lead }
    }

    /**
     * Answer entities in photo order. A name after a preposition is never the subject ("the largest planet in the Solar
     * System is Jupiter" gives Jupiter, and the Solar System is dropped). The question's own words count only when the
     * answer names nothing else. Max three.
     */
    internal fun answerEntities(query: String, answer: String): List<AnswerEntity> {
        val q = query.lowercase()
        val out = mutableListOf<Pair<AnswerEntity, Boolean>>()
        for (m in entityPattern.findAll(answer)) {
            val words = m.value.split(Regex("\\s+")).toMutableList()
            while (words.isNotEmpty() && words.first() in notEntity) words.removeAt(0)
            val name = words.joinToString(" ")
            if (name.isEmpty() || out.any { it.first.name == name }) continue
            val prior = answer.substring(0, m.range.first).trim().split(Regex("\\s+")).map { it.lowercase() }.dropLastWhile { it in determiners }
            val previous = prior.lastOrNull()
            out.add(AnswerEntity(name, q.contains(name.lowercase())) to (previous != null && previous in prepositions))
        }
        val pool = if (out.any { !it.first.echo }) out.filter { !it.first.echo } else out
        return pool.filter { !it.second }.map { it.first }.take(3)
    }

    /** Lowercase content words of four or more letters, minus the glue words. */
    internal fun keyWords(s: String): Set<String> =
        Regex("[a-z]{4,}").findAll(s.lowercase()).map { it.value }.filter { it !in glue }.toSet()

    /**
     * A Wikipedia page is on topic for an answer when every word of its title (a parenthesized qualifier dropped) is a word of
     * the question or of the answer's own proper nouns; a disambiguated page must be an entity the answer names.
     * Same rule as `onTopic` in docs/engine.js and Swift.
     */
    fun onTopic(title: String, query: String, body: String): Boolean {
        val words = keyWords(title.replace(Regex("""\s*\(.*?\)"""), ""))
        if (words.isEmpty()) return false
        val entityWords = keyWords(entityPattern.findAll(body).map { it.value }.filter { it !in notEntity }.joinToString(" "))
        val pool = if (Regex("""\(.*?\)""").containsMatchIn(title)) entityWords else keyWords(query) + entityWords
        return words.all { it in pool }
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
