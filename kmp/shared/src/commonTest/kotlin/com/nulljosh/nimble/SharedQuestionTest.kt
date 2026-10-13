package com.nulljosh.nimble

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class SharedQuestionTest {
    @Test fun trimsAndCaps() {
        assertEquals("capital of france", sharedQuestion("  capital of france \n"))
        assertEquals(300, sharedQuestion("a".repeat(500))!!.length)
    }

    @Test fun emptyIsNull() {
        assertNull(sharedQuestion(null))
        assertNull(sharedQuestion("   "))
    }
}
