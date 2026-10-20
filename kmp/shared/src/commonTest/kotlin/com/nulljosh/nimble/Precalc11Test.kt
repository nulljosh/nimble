package com.nulljosh.nimble

import kotlin.test.Test
import kotlin.test.assertEquals

/** The Kotlin port of pc11() in docs/engine.js, on answers the web gives. The full exam is OfflineExamJvmTest. */
class Precalc11Test {
    private fun pc(q: String) = when (val a = Precalc.answer(q)) {
        is Answer.Text -> a.body
        is Answer.Math -> a.value
        else -> null
    }

    @Test fun radicalSum() = assertEquals("5√3 ≈ 8.660254038", pc("sqrt(12) + sqrt(27)"))
    @Test fun rationalize() = assertEquals("√2/2 ≈ 0.7071067812", pc("rationalize 1/sqrt(2)"))
    @Test fun absoluteValue() = assertEquals("x = -4 or x = 3", pc("solve |2x + 1| = 7"))
    @Test fun vertex() = assertEquals("(3, -4)", pc("vertex of y = x^2 - 6x + 5"))
    @Test fun completeTheSquare() = assertEquals("y = (x + 3)² - 7", pc("complete the square for x^2 + 6x + 2"))
    @Test fun quadraticInequality() = assertEquals("x ≤ -2 or x ≥ 3", pc("solve x^2 - x - 6 >= 0"))
    @Test fun linearSystem() = assertEquals("x = 7, y = 3", pc("solve x + y = 10 and x - y = 4"))
    @Test fun cancel() = assertEquals("x + 3, x ≠ 3", pc("simplify (x^2 - 9)/(x - 3)"))
    @Test fun cosineLaw() = assertEquals("c ≈ 8.185", pc("triangle with a = 7, b = 9, angle C = 60 degrees, find c"))
    @Test fun ambiguousCase() = assertEquals("C ≈ 49.89° (or 130.11°, the ambiguous case)", pc("angle C if c = 8, a = 6, angle A = 35 degrees"))
    @Test fun simpleInterest() = assertEquals("$180.00 in interest, for $1680.00 in all (I = Prt).", pc("simple interest on $1500 at 4% for 3 years"))
}
