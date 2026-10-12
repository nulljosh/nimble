package com.nulljosh.nimble

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class HistoryAnswerTest {

    private class MemoryStorage(var text: String = "") : HistoryStorage {
        override fun read() = text
        override fun write(text: String) { this.text = text }
    }

    private fun history(storage: HistoryStorage = MemoryStorage()): SearchHistory {
        var clock = 0L
        return SearchHistory(storage) { ++clock }
    }

    @Test fun answerIsSavedAndReadBack() {
        val storage = MemoryStorage()
        history(storage).add("capital of france", "Paris is the capital of France.")
        val e = history(storage).list().single()
        assertEquals("capital of france", e.q)
        assertEquals("Paris is the capital of France.", e.answer)
    }

    @Test fun answerIsCappedAt280Characters() {
        val h = history()
        h.add("long", "a".repeat(400))
        assertEquals(280, h.list().single().answer?.length)
    }

    @Test fun blankAnswerIsNoAnswer() {
        val h = history()
        h.add("q", "   ")
        assertNull(h.list().single().answer)
    }

    @Test fun answerLineBreaksAreFolded() {
        val h = history()
        h.add("q", "one\ttwo\nthree\r\nfour")
        assertEquals("one two three  four", h.list().single().answer)
        assertEquals(1, h.list().size)
    }

    @Test fun askingAgainReplacesTheAnswer() {
        val h = history()
        h.add("q", "first")
        h.add("Q", "second")
        assertEquals(listOf("second"), h.list().map { it.answer })
        h.add("q")
        assertNull(h.list().single().answer)
    }

    @Test fun oldFileWithoutAnswersStillDecodes() {
        val storage = MemoryStorage("pi\t1700000000000\ntokyo\t1699999999999\n")
        val rows = history(storage).list()
        assertEquals(listOf("pi", "tokyo"), rows.map { it.q })
        assertEquals(listOf(1700000000000L, 1699999999999L), rows.map { it.t })
        assertEquals(listOf(null, null), rows.map { it.answer })
    }

    @Test fun mixedOldAndNewLinesDecode() {
        val storage = MemoryStorage("old\t5\nnew\t6\tAn answer\n")
        val rows = history(storage).list()
        assertEquals(listOf(null, "An answer"), rows.map { it.answer })
    }

    @Test fun removeDeletesTheWholeSelection() {
        val h = history()
        h.add("a"); h.add("b"); h.add("c")
        h.remove(setOf("A", "c"))
        assertEquals(listOf("b"), h.list().map { it.q })
    }

    @Test fun removeOfNothingIsHarmless() {
        val h = history()
        h.add("a")
        h.remove(emptySet())
        assertEquals(listOf("a"), h.list().map { it.q })
    }

    @Test fun copyTextIsQuestionThenAnswerInListOrder() {
        val h = history()
        h.add("one", "First answer.")
        h.add("two")
        h.add("three", "Third answer.")
        assertEquals(
            "three\nThird answer.\n\none\nFirst answer.",
            h.copyText(setOf("ONE", "three")),
        )
        assertEquals("two", h.copyText(setOf("two")))
    }

    @Test fun relativeAgeReadsInPlainWords() {
        val now = 10_000_000_000L
        assertEquals("just now", relativeAge(now - 30_000, now))
        assertEquals("12 min ago", relativeAge(now - 12 * 60_000L, now))
        assertEquals("3 h ago", relativeAge(now - 3 * 3_600_000L, now))
        assertEquals("yesterday", relativeAge(now - 30 * 3_600_000L, now))
        assertEquals("5 days ago", relativeAge(now - 5 * 86_400_000L, now))
    }

    @Test fun snippetKeepsTextAnswersOnly() {
        assertEquals("4", historySnippet(Answer.Math("4")))
        assertEquals("Paris.", historySnippet(Answer.Text("France", "Paris.", "Wikipedia")))
        assertNull(historySnippet(Answer.Miss("No instant answer found.", "https://example.com")))
    }
}
