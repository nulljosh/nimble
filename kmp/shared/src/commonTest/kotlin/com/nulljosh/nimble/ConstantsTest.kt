package com.nulljosh.nimble

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Mirrors test/constants.test.js: constants answer offline with the value and NIST as the source. */
class ConstantsTest {
    @Test
    fun constantsAnswerWithTheValue() {
        for ((q, v) in listOf("what is the gravitational constant" to "6.67430 × 10⁻¹¹", "What’s Planck’s constant?" to "6.62607015",
            "avogadro's number" to "6.02214076", "the value of the gas constant" to "8.314462618", "acceleration due to gravity" to "9.80665")) {
            val a = assertNotNull(constantAnswer(q), q)
            assertTrue(a.body.contains(v), q)
            assertEquals("NIST", a.source)
        }
    }

    @Test
    fun otherQuestionsAreLeftAlone() {
        for (q in listOf("who measured the gravitational constant", "is the speed of light constant", "speed of light in water"))
            assertNull(constantAnswer(q), q)
    }
}
