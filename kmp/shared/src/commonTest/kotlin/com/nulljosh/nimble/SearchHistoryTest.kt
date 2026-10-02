package com.nulljosh.nimble

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class SearchHistoryTest {

    private class MemoryStorage(var text: String = "") : HistoryStorage {
        override fun read() = text
        override fun write(text: String) { this.text = text }
    }

    private fun history(storage: HistoryStorage = MemoryStorage()): SearchHistory {
        var clock = 0L
        return SearchHistory(storage) { ++clock }
    }

    private fun SearchHistory.queries() = list().map { it.q }

    @Test fun startsEmpty() = assertTrue(history().list().isEmpty())

    @Test fun newestFirst() {
        val h = history()
        h.add("one"); h.add("two"); h.add("three")
        assertEquals(listOf("three", "two", "one"), h.queries())
    }

    @Test fun dedupeIsCaseInsensitiveAndMovesToTop() {
        val h = history()
        h.add("Pi"); h.add("tokyo"); h.add("pi")
        assertEquals(listOf("pi", "tokyo"), h.queries())
        assertEquals(3L, h.list().first().t)
    }

    @Test fun blankIsIgnoredAndTrimmed() {
        val h = history()
        h.add("   "); h.add(""); h.add("  2 + 2 ")
        assertEquals(listOf("2 + 2"), h.queries())
    }

    @Test fun capsAtFifty() {
        val h = history()
        for (i in 1..60) h.add("q$i")
        val q = h.queries()
        assertEquals(50, q.size)
        assertEquals("q60", q.first())
        assertEquals("q11", q.last())
    }

    @Test fun clearEmptiesIt() {
        val h = history()
        h.add("a"); h.add("b")
        h.clear()
        assertTrue(h.list().isEmpty())
    }

    @Test fun survivesReload() {
        val storage = MemoryStorage()
        history(storage).apply { add("a"); add("b") }
        assertEquals(listOf("b", "a"), history(storage).queries())
    }

    @Test fun tabsAndNewlinesCannotBreakTheFormat() {
        val h = history()
        h.add("a\tb\nc")
        assertEquals(listOf("a b c"), h.queries())
    }

    @Test fun garbageLinesAreSkipped() {
        val h = history(MemoryStorage("no tab here\n\t5\nok\t7\n"))
        assertEquals(listOf("ok"), h.queries())
    }
}
