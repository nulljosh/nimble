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

    // Foundations and Pre-Calculus 10 (Precalc10.kt)
    @Test fun primeFactors() = assertEquals("2³ × 3² × 5", pc("prime factorization of 360"))
    @Test fun commonFactorFirst() = assertEquals("3x(2x + 3)", pc("factor 6x^2 + 9x"))
    @Test fun commonFactorThenDifferenceOfSquares() = assertEquals("2(x + 5)(x - 5)", pc("factor 2x^2 - 50"))
    @Test fun exponentLaws() = assertEquals("4x⁶", pc("simplify (2x^3)^2"))
    @Test fun sphereVolume() = assertEquals("288π ≈ 904.78", pc("volume of a sphere with radius 6"))
    @Test fun lineThroughTwoPoints() = assertEquals("y = 3x - 1", pc("equation of the line through (1, 2) and (3, 8)"))
    @Test fun overtime() = assertEquals("$180.00", pc("time and a half for 6 hours at $20 per hour"))

    // Foundations of Mathematics 11 (Foundations11.kt)
    @Test fun nextSquare() = assertEquals("36", pc("next number in 1, 4, 9, 16, 25"))
    @Test fun standardDeviation() = assertEquals("σ = 2 (population), s = 2.1381 (sample)", pc("standard deviation of 2, 4, 4, 4, 5, 5, 7, 9"))
    @Test fun counterexample() = assertEquals("2 is a counterexample.", pc("find a counterexample to all prime numbers are odd"))
    @Test fun mapScale() = assertEquals("3 km", pc("a map scale is 1:50000, how many km is 6 cm"))
    @Test fun testPoint() = assertEquals("No: 5 is not < 4.", pc("is (1, 5) a solution of y < x + 3"))

    // Foundations of Mathematics 12 (Foundations12.kt)
    @Test fun lettersWithRepeats() = assertEquals("12", pc("how many arrangements of the letters in BOOK"))
    @Test fun twoRedCards() = assertEquals("25/102 ≈ 0.2451", pc("probability of drawing two red cards without replacement"))
    @Test fun contrapositive() = assertEquals("If a shape does not have four sides, then it is not a square.", pc("contrapositive of if a shape is a square then it has four sides"))
    @Test fun annuity() = assertEquals("$13954.01", pc("future value of $200 deposited monthly for 5 years at 6% compounded monthly"))
    @Test fun koch() = assertEquals("log 4/log 3 ≈ 1.2619", pc("what is the fractal dimension of the koch curve"))
}
