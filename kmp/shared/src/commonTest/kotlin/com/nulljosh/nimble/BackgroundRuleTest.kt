package com.nulljosh.nimble

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class BackgroundRuleTest {

    private fun wiki(title: String, aiNote: String? = null) =
        Answer.Text(title, "A body sentence.", "Wikipedia", aiNote = aiNote)

    @Test fun liamWrongTopicIsBackground() {
        assertTrue(QueryEngine.isSpecificQuestion("what was the first color photograph of a rainbow", "Rainbow"))
    }

    @Test fun aCapitalQuestionIsNotBackground() {
        assertFalse(QueryEngine.isSpecificQuestion("capital of france", "France"))
    }

    @Test fun aQuestionThatOnlyNamesTheTopicIsNotBackground() {
        assertFalse(QueryEngine.isSpecificQuestion("what is a rainbow", "Rainbow"))
    }

    @Test fun aNonQuestionIsNeverBackground() {
        assertFalse(QueryEngine.isSpecificQuestion("first color photograph of a rainbow", "Rainbow"))
    }

    @Test fun labelMarksOnlyWikipediaAnswers() {
        val q = "what was the first color photograph of a rainbow"
        assertTrue(QueryEngine.labelIfGeneric(wiki("Rainbow"), q).background)
        val ddg = wiki("Rainbow").copy(source = "DuckDuckGo")
        assertFalse(QueryEngine.labelIfGeneric(ddg, q).background)
    }

    @Test fun leadLineMergesNoteAndCaptionIntoOneLine() {
        val note = "The free AI is out of answers for today, so this is from Wikipedia. It resets in the evening."
        assertEquals(
            listOf("$note ${QueryEngine.BACKGROUND_CAPTION}"),
            QueryEngine.leadLines(background = true, aiNote = note),
        )
    }

    @Test fun leadLineIsCaptionAloneOrNoteAlone() {
        assertEquals(listOf(QueryEngine.BACKGROUND_CAPTION), QueryEngine.leadLines(background = true, aiNote = null))
        assertEquals(listOf("note"), QueryEngine.leadLines(background = false, aiNote = "note"))
        assertEquals(emptyList(), QueryEngine.leadLines(background = false, aiNote = null))
    }
}
