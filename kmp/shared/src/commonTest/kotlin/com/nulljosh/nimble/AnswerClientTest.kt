package com.nulljosh.nimble

import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Exercises the real Gemma -> DDG -> Wikipedia chain. Mirrors testDDGQuery in
 * Tests/QueryEngineTests.swift: offline is a pass, because a Miss is the correct
 * behaviour with no network. What must never happen is a thrown exception.
 */
class AnswerClientTest {

    @Test
    fun mathShortCircuitsBeforeAnyNetworkCall() = runBlockingTest {
        val a = AnswerClient().query("sqrt(144)")
        assertTrue(a is Answer.Math && a.value == "12", "expected offline math, got $a")
    }

    @Test
    fun networkQueryReturnsAnAnswerOrACleanMiss() = runBlockingTest {
        val a = AnswerClient().query("Population of Canada")
        assertTrue(
            a is Answer.Text || a is Answer.Miss,
            "chain must resolve or miss cleanly, got $a"
        )
    }

    @Test
    fun siteHostMatchesBareDomainQuestions() {
        assertEquals("primitive.dev", siteHost("What's primitive.dev?"))
        assertEquals("primitive.dev", siteHost("What’s primitive.dev?"))
        assertEquals("stripe.com", siteHost("what is stripe.com"))
        assertEquals("linear.app", siteHost("tell me about linear.app"))
        assertEquals("vercel.com", siteHost("vercel.com"))
        assertEquals("vercel.com", siteHost("https://www.Vercel.com/pricing"))
    }

    @Test
    fun siteHostIgnoresQuestionsAboutThingsThatAreNotSites() {
        assertNull(siteHost("what is node.js"))
        assertNull(siteHost("who is the ceo of apple.com in 2020"))
    }

    @Test
    fun siteBodyPrefersMetaDescription() {
        val d = decodeSite(
            """{"host":"primitive.dev","title":"Primitive","siteName":"Primitive",
               "description":"Build tools. Ship fast.","h1":"Hello","text":"Long page text."}"""
        )
        val a = siteAnswer("primitive.dev", d) as Answer.Text
        assertEquals("Build tools.", a.body)
        assertEquals("Primitive", a.heading)
        assertEquals("primitive.dev", a.source)
        assertEquals("https://primitive.dev", a.sourceUrl)
    }

    @Test
    fun siteBodyFallsBackToHeadlineAndTextThenTitle() {
        val withText = decodeSite("""{"title":"Acme Page","h1":"Acme makes rockets","text":"We ship. Often."}""")
        val a = siteAnswer("acme.io", withText) as Answer.Text
        assertEquals("Acme makes rockets.", a.body)
        assertEquals("Acme Page", a.heading)

        val titleOnly = decodeSite("""{"title":"Only A Title"}""")
        assertEquals("Only A Title", (siteAnswer("acme.io", titleOnly) as Answer.Text).body)

        val nothing = decodeSite("""{"host":"acme.io"}""")
        assertNull(siteAnswer("acme.io", nothing))
    }

    @Test
    fun siteHeadingFallsBackToHost() {
        val d = decodeSite("""{"description":"A tool."}""")
        assertEquals("acme.io", (siteAnswer("acme.io", d) as Answer.Text).heading)
    }

    @Test
    fun jsOnlyPageSaysSoInsteadOfEchoingTitle() {
        val d = decodeSite("""{"title":"App","js":true}""")
        val a = siteAnswer("app.io", d) as Answer.Text
        assertEquals("This site loads with JavaScript.", a.body)
        assertEquals("App", a.heading)
    }

    @Test
    fun siteAnswerCarriesFavicon() {
        val a = siteAnswer("stripe.com", decodeSite("""{"description":"Payments."}""")) as Answer.Text
        assertEquals("https://www.google.com/s2/favicons?domain=stripe.com&sz=64", a.imageUrl)
    }

    @Test
    fun listArticlesAreNeverAnswers() {
        assertNull(articleTitle("List of Canadian provinces"))
        assertNull(articleTitle("list of rivers"))
        assertEquals("Canada", articleTitle("Canada"))
        assertNull(articleTitle(null))
    }

    private fun decodeSite(json: String): AnswerClient.SiteResponse =
        Json { ignoreUnknownKeys = true; isLenient = true }.decodeFromString(json)
}
