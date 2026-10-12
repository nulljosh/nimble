package com.nulljosh.nimble

import io.ktor.http.decodeURLPart
import io.ktor.http.encodeURLPathPart
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** The Wikipedia fallback when the free AI is unavailable, offline: every request is answered by a stub TextFetch. */
class WikiFallbackTest {
    private val france = "France, officially the French Republic, is a country primarily located in Western Europe. Its capital, largest city and main cultural and economic centre is Paris, with a metropolitan population of over 13 million."
    private val hamlet = "The Tragedy of Hamlet, Prince of Denmark, often shortened to Hamlet (), is a tragedy written by William Shakespeare sometime between 1599 and 1601. It is Shakespeare's longest play."

    private fun esc(s: String) = s.replace("\\", "\\\\").replace("\"", "\\\"")

    /** hits: search titles. intros: canonical title to lead text. summaries: REST title to extract (a photo-free page). */
    private fun stub(hits: List<String>, intros: Map<String, String> = emptyMap(), summaries: Map<String, String> = emptyMap()): TextFetch = { url ->
        when {
            url.contains("list=search") ->
                """{"query":{"search":[${hits.joinToString(",") { "{\"title\":\"${esc(it)}\"}" }}]}}"""
            url.contains("prop=extracts") -> {
                val t = url.substringAfter("titles=").decodeURLPart()
                val key = intros.keys.firstOrNull { it.equals(t, ignoreCase = true) }
                if (key != null) """{"query":{"pages":[{"title":"$key","extract":"${esc(intros.getValue(key))}"}]}}"""
                else """{"query":{"pages":[{"title":"$t","missing":true}]}}"""
            }
            url.contains("/page/summary/") -> {
                val t = url.substringAfter("/page/summary/").decodeURLPart().replace("_", " ")
                summaries[t]?.let { """{"title":"$t","extract":"${esc(it)}","content_urls":{"desktop":{"page":"https://en.wikipedia.org/wiki/${t.replace(" ", "_")}"}}}""" }
            }
            else -> null
        }
    }

    @Test
    fun relationShapesParseTheSubject() {
        assertEquals("france", WikiFallback.relationOf("capital of france")?.subject)
        assertEquals("France", WikiFallback.relationOf("What is the capital of France?")?.subject)
        assertEquals("hamlet", WikiFallback.relationOf("who wrote hamlet")?.subject)
        assertEquals("eiffel tower", WikiFallback.relationOf("when was the eiffel tower built")?.subject)
        assertNull(WikiFallback.relationOf("fraser river"))
    }

    @Test
    fun capitalOfFranceAnswersWithParisFromFrancesOwnPage() = runBlockingTest {
        val a = WikiFallback.answer("capital of france", stub(
            hits = listOf("List of capitals of France", "Capital punishment in France"),
            intros = mapOf("France" to france),
        ))
        assertEquals("France", a?.heading)
        assertEquals("Its capital, largest city and main cultural and economic centre is Paris, with a metropolitan population of over 13 million.", a?.body)
        assertEquals("https://en.wikipedia.org/wiki/France", a?.sourceUrl)
        assertEquals("Wikipedia", a?.source)
    }

    @Test
    fun capitalPunishmentHitNeverAnswersTheCapitalQuestion() = runBlockingTest {
        val a = WikiFallback.answer("capital of france", stub(
            hits = listOf("List of capitals of France", "Capital punishment in France"),
            intros = mapOf("Capital punishment in France" to "Capital punishment in France is banned by the Constitution."),
        ))
        assertNull(a)
    }

    @Test
    fun searchHitThatNamesFranceAndTheCapitalAnswers() = runBlockingTest {
        val a = WikiFallback.answer("capital of france", stub(
            hits = listOf("List of capitals of France", "Paris"),
            intros = mapOf("Paris" to "Paris is the capital and most populous city of France."),
        ))
        assertEquals("Paris is the capital and most populous city of France.", a?.body)
    }

    @Test
    fun whoWroteHamletGivesShakespeareWithoutThePronunciationBrackets() = runBlockingTest {
        val a = WikiFallback.answer("who wrote hamlet", stub(hits = listOf("Hamlet (film)"), intros = mapOf("Hamlet" to hamlet)))
        assertEquals("The Tragedy of Hamlet, Prince of Denmark, often shortened to Hamlet, is a tragedy written by William Shakespeare sometime between 1599 and 1601.", a?.body)
    }

    @Test
    fun listOnlyResultsGiveNoAnswer() = runBlockingTest {
        assertNull(WikiFallback.answer("capital of france", stub(hits = listOf("List of capitals of France", "List of French capitals"))))
    }

    @Test
    fun unshapedQuestionSkipsListsAndTakesTheNextUsableHit() = runBlockingTest {
        val a = WikiFallback.answer("fraser river", stub(
            hits = listOf("List of rivers of Canada", "Fraser River"),
            summaries = mapOf("Fraser River" to "The Fraser River is the longest river in British Columbia. It flows south."),
        ))
        assertEquals("Fraser River", a?.heading)
        assertEquals("The Fraser River is the longest river in British Columbia.", a?.body)
        assertTrue(a?.sourceUrl?.endsWith("Fraser_River") == true)
    }
}
