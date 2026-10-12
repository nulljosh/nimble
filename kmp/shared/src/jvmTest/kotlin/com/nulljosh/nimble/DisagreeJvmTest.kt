package com.nulljosh.nimble

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** "Sources disagree" on the JVM, offline. The replies are stubbed (STUBBED labels); nothing calls the Worker. */
class DisagreeJvmTest {
    /** The split reply the Worker sends once deployed. */
    private val split = """{"answer":"Kamloops, British Columbia","source":"Gemma + Qwen","disagree":true,"alts":[{"model":"Qwen3 30B","answer":"Kamloops, British Columbia"},{"model":"Gemma 4 26B","answer":"Nelson, British Columbia"}],"refs":[{"title":"Kamloops","url":"https://en.wikipedia.org/wiki/Kamloops","extract":"Kamloops is a city."}]}"""
    /** Today's live probe: UNKNOWN with the quota error. */
    private val probe = """{"answer":"UNKNOWN","aiError":"4006: you have used up your daily free allocation of 10,000 neurons"}"""
    /** A normal answer from before the change. */
    private val plain = """{"answer":"Paris.","source":"Gemma + Qwen","refs":[{"title":"Paris","url":"https://en.wikipedia.org/wiki/Paris","extract":"Paris is the capital of France."}]}"""

    @Test
    fun splitDecodesBothAnswersWithTheirModels() {
        val d = proxyDisputed(split)
        assertEquals(
            listOf(
                DisputedAnswer("Qwen3 30B", "Kamloops, British Columbia"),
                DisputedAnswer("Gemma 4 26B", "Nelson, British Columbia"),
            ),
            d?.alts,
        )
        assertEquals(listOf(DisputeSource("Kamloops", "https://en.wikipedia.org/wiki/Kamloops")), d?.sources)
    }

    @Test
    fun replyWithoutTheNewFieldsIsUnchanged() {
        assertNull(proxyDisputed(probe))
        assertNull(proxyDisputed(plain))
        assertEquals("Paris.", proxyAnswer(plain)?.body)
        assertEquals("4006: you have used up your daily free allocation of 10,000 neurons", proxyAiError(probe))
        assertNull(proxyAnswer(probe))
    }

    @Test
    fun disagreeFalseOrOneAlternativeIsNoSplit() {
        assertNull(proxyDisputed("""{"answer":"Paris.","disagree":false,"alts":[{"model":"A","answer":"Paris"},{"model":"B","answer":"Lyon"}]}"""))
        assertNull(proxyDisputed("""{"answer":"Paris.","disagree":true,"alts":[{"model":"A","answer":"Paris"}]}"""))
    }

    @Test
    fun malformedAlternativeDropsOnlyItself() {
        // A number for the answer, a bare string for the element, and a blank answer: none counts.
        assertNull(proxyDisputed("""{"answer":"Paris.","disagree":true,"alts":[{"model":"A","answer":7},"x",{"model":"B","answer":"Lyon"},{"model":"C","answer":"  "}]}"""))
        val two = proxyDisputed("""{"answer":"Paris.","disagree":true,"alts":[{"model":"A","answer":7},"x",{"model":"B","answer":"Lyon"},{"model":"C","answer":"Nice"}]}""")
        assertEquals(listOf("B", "C"), two?.alts?.map { it.model })
    }

    @Test
    fun historyKeepsOnlyTheFirstAnswer() {
        val card = Answer.Disagree(listOf(DisputedAnswer("Qwen3 30B", "Kamloops"), DisputedAnswer("Gemma 4 26B", "Nelson")))
        assertEquals("Kamloops", historySnippet(card))
    }

    @Test
    fun backingRuleMatchesTheSwiftRule() {
        assertTrue(backsAnswer("Kamloops, British Columbia", "Kamloops is a city in British Columbia."))
        assertFalse(backsAnswer("Kamloops, British Columbia", "Nelson is a city in BC."))
        assertFalse(backsAnswer("Mars has 2 moons", "Mars has two moons."))
    }
}
