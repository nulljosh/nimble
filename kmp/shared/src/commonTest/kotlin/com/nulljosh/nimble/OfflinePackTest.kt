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

    /** Same title rule as docs/engine.js packHits, on four entries. */
    @Test
    fun strayTitleWordIsNotTheAnswer() {
        val pack = assertNotNull(OfflinePack.parse("""{"builtAt": "2026-10-19", "entries": [{"t": "Alexander the Great", "d": "King of Macedon", "e": "Alexander III of Macedon, most commonly known as Alexander the Great, was a king of ancient Macedon. He was a great general.", "u": "https://en.wikipedia.org/wiki/Alexander_the_Great", "a": []}, {"t": "Pacific Ocean", "d": "Largest ocean", "e": "The Pacific Ocean is the largest and deepest of Earth's five oceanic divisions.", "u": "https://en.wikipedia.org/wiki/Pacific_Ocean", "a": []}, {"t": "Don (river)", "d": "River in Russia", "e": "The Don is the fifth-longest river in Europe. It flows into the Sea of Azov.", "u": "https://en.wikipedia.org/wiki/Don_(river)", "a": []}, {"t": "Jaws (film)", "d": "1975 film", "e": "Jaws is a 1975 American thriller film directed by Steven Spielberg.", "u": "https://en.wikipedia.org/wiki/Jaws_(film)", "a": []}]}"""))
        assertNull(pack.answer("who wrote the great gatsby"))
        assertNull(pack.answer("longest river in europe"), "the fifth-longest is not the longest")
        assertEquals("Pacific Ocean", pack.answer("largest ocean")?.title)
        assertEquals("Jaws (film)", pack.answer("who directed jaws")?.title)
    }
}
