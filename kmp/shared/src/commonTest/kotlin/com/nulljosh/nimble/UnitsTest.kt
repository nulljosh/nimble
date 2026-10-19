package com.nulljosh.nimble

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** Offline units and the math phrasings the offline exam caught (same answers as docs/engine.js). */
class UnitsTest {
    @Test
    fun conversions() {
        assertEquals("10 km = 6.213712 miles", Units.convert("10 km to miles"))
        assertEquals("180 °C = 356 °F", Units.convert("180 C to F"))
        assertEquals("1 mile = 5280 feet", Units.convert("how many feet in 1 mile"))
        assertEquals("500 mb = 0.5 gb", Units.convert("500 MB to GB"))
        assertNull(Units.convert("10 km to kg"), "different kinds")
        assertNull(Units.convert("capital of france"))
    }

    @Test
    fun mathPhrasings() {
        assertEquals("27", QueryEngine.evaluateMath("what is 9 times 3"))
        assertEquals("144", QueryEngine.evaluateMath("12 squared"))
        assertEquals("3", QueryEngine.evaluateMath("cube root of 27"))
        assertEquals("3", QueryEngine.evaluateMath("log10(1000)"))
        assertNull(QueryEngine.evaluateMath("top 10 movies over 2020"))
    }
}
