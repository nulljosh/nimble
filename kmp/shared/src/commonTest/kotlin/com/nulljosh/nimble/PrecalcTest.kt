package com.nulljosh.nimble

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** The Kotlin port of precalc() in docs/engine.js, on the cases test/precalc.test.js checks. The full exam is OfflineExamJvmTest. */
class PrecalcTest {
    private fun pc(q: String) = when (val a = Precalc.answer(q)) {
        is Answer.Text -> a.body
        is Answer.Math -> a.value
        else -> null
    }

    @Test fun logBase() = assertEquals("4", pc("log base 3 of 81"))
    @Test fun exponentialEquation() = assertEquals("x = 2", pc("solve 3^(x+1) = 27"))
    @Test fun quadraticRoots() = assertEquals("x = 2 and x = 3", pc("solve x^2 - 5x + 6 = 0"))
    @Test fun factorQuadratic() = assertEquals("(x - 2)(x - 3)", pc("factor x^2 - 5x + 6"))
    @Test fun exactTrig() = assertEquals("-√3/2 ≈ -0.8660254038", pc("exact value of cos(5pi/6)"))
    @Test fun period() = assertEquals("π ≈ 3.141592654", pc("period of y = 3sin(2x)"))
    @Test fun degreesToRadians() = assertEquals("π/6 ≈ 0.5235987756 radians", pc("convert 30 degrees to radians"))
    @Test fun remainder() = assertEquals("5", pc("remainder when x^3 - 2x + 1 is divided by x - 2"))
    @Test fun geometricSum() = assertEquals("200", pc("sum of a geometric series with a = 5, r = 3, n = 4"))
    @Test fun halfLife() = assertEquals("12.5 g", pc("100 g with a half-life of 5 years, how much is left after 15 years"))
    @Test fun inverse() = assertEquals("f⁻¹(x) = (x - 3)/2", pc("inverse of y = 2x + 3"))
    @Test fun trigEquation() = assertEquals("x = π/6 or x = 5π/6", pc("solve sin x = 1/2"))
    @Test fun repeatingDecimal() = assertEquals("1/6", pc("0.1666... as a fraction"))
    @Test fun notPrecalc() = assertNull(pc("who wrote hamlet"))
    @Test fun printsLikeJavaScript() {
        assertEquals("0.3", Precalc.sig(0.1 + 0.2, 12))
        assertEquals("-1.5", Precalc.sig(-1.5, 10))
        assertEquals("1000000", Precalc.js(1e6))
        assertEquals("3", Precalc.tryMath("3 log(10)")?.let { Precalc.js(it) })
        assertEquals("0", Precalc.tryMath("tan(pi)")?.let { Precalc.js(it) })
    }
}
