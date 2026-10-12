package com.nulljosh.nimble

import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class OfflinePackTest {
    // A tiny pack in the docs/pack/README.md format: one article, one title with an alias.
    private val fixture = """
        {
          "version": 1,
          "builtAt": "2026-10-12",
          "source": "Wikipedia, CC BY-SA 4.0",
          "count": 2,
          "entries": [
            {"t":"France","d":"Country in Western Europe","e":"France, officially the French Republic, is a country in Western Europe. Its capital and largest city is Paris.","u":"https://en.wikipedia.org/wiki/France","a":["the French Republic"]},
            {"t":"Photosynthesis","d":"Process used by plants","e":"Photosynthesis is a process used by plants and other organisms to convert light energy into chemical energy. It releases oxygen.","u":"https://en.wikipedia.org/wiki/Photosynthesis","a":[]}
          ]
        }
    """.trimIndent()

    @Test
    fun capitalOfFranceAnswersFromThePack() {
        val pack = assertNotNull(OfflinePack.parse(fixture))
        val hit = assertNotNull(pack.answer("capital of france"))
        assertContains(hit.text, "Paris")
        assertEquals("France", hit.title)
        assertEquals("https://en.wikipedia.org/wiki/France", hit.url)
        assertEquals("2026-10-12", hit.builtAt)
    }

    @Test
    fun gibberishIsAMiss() {
        val pack = assertNotNull(OfflinePack.parse(fixture))
        assertNull(pack.answer("zxqv blorp wumbo"))
    }

    @Test
    fun badJsonIsNotAPack() {
        assertNull(OfflinePack.parse("not a pack"))
    }

    @Test
    fun asOfLabelReadsAsPlainDate() {
        assertEquals("Oct 12", packAsOfLabel("2026-10-12"))
        assertEquals("9,000", thousands(9000))
        assertEquals("1.9 MB", megabytes(1_948_983L))
    }
}
