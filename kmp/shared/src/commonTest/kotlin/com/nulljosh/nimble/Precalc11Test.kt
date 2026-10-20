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

    // Calculus 12 (Calculus12.kt)
    @Test fun productRule() = assertEquals("2x sin(x) + x^2 cos(x)", pc("derivative of x^2 sin(x)"))
    @Test fun quotientRule() = assertEquals("1/(x + 1)^2", pc("derivative of x/(x + 1)"))
    @Test fun chainRule() = assertEquals("8x(x^2 + 1)^3", pc("derivative of (x^2 + 1)^4"))
    @Test fun rootRule() = assertEquals("1/(2√x)", pc("derivative of sqrt(x)"))
    @Test fun integralOfReciprocal() = assertEquals("2ln|x| + C", pc("integral of 2/x"))
    @Test fun areaBetween() = assertEquals("1/6", pc("area between y = x and y = x^2 from 0 to 1"))
    @Test fun corner() = assertEquals("No: the slope is -1 from the left and 1 from the right (a corner).", pc("is f(x) = |x| differentiable at x = 0"))

    // Statistics 12 (Statistics12.kt)
    @Test fun fiveNumberSummary() = assertEquals("Minimum 2, Q1 4.5, median 7.5, Q3 11, maximum 15.", pc("five number summary of 2, 4, 5, 7, 8, 10, 12, 15"))
    @Test fun normalTail() = assertEquals("6.68% (z = 1.5)", pc("if heights are normal with mean 170 and standard deviation 10, what percent are taller than 185"))
    @Test fun binomial() = assertEquals("0.3241", pc("binomial probability of exactly 2 successes in 6 trials with p = 0.3"))
    @Test fun leastSquares() = assertEquals("y = 2x + 1", pc("line of best fit for x = 0, 1, 2, 3 and y = 1, 3, 5, 7"))
    @Test fun independence() = assertEquals("No: P(A)·P(B) = 0.18, but P(A and B) = 0.25.", pc("are A and B independent if P(A) = 0.3, P(B) = 0.6 and P(A and B) = 0.25"))

    // Workplace Mathematics 10 (Workplace10.kt)
    @Test fun salesTax() = assertEquals("$44.80 ($4.80 in tax)", pc("total cost of a $40 item with 5% GST and 7% PST"))
    @Test fun betterBuy() = assertEquals("750 g for $4.80 is the better buy: $0.0064 per g against $0.0070.", pc("which is the better buy, 500 g for $3.50 or 750 g for $4.80"))
    @Test fun percentDeductions() = assertEquals("$936.00 ($264.00 deducted)", pc("net pay if gross is $1200 and deductions are 22%"))
    @Test fun mixedUnits() = assertEquals("42 inches", pc("convert 3 feet 6 inches to inches"))
    @Test fun ratio() = assertEquals("2:3", pc("simplify the ratio 12:18"))

    // Apprenticeship and Workplace Mathematics 12 (Apprenticeship12.kt)
    @Test fun mixedNumbers() = assertEquals("3 7/8 (31/8) = 3.875", pc("2 1/4 + 1 5/8"))
    @Test fun squareCorner() = assertEquals("No: the diagonal should be 10, not 10.2.", pc("check if a corner is square with sides 6 ft and 8 ft and diagonal 10.2 ft"))
    @Test fun ohm() = assertEquals("3 A (I = V/R)", pc("current if voltage is 120 V and resistance is 40 ohms"))
    @Test fun marbles() = assertEquals("3/8 = 0.375", pc("probability of drawing a red marble from 3 red and 5 blue"))
    @Test fun repeatingDecimalStaysPrecalc() = assertEquals("1/3", pc("write 0.333... as a fraction"))

    // Science 10 (Science10.kt)
    @Test fun balancePropane() = assertEquals("C₃H₈ + 5O₂ → 3CO₂ + 4H₂O", pc("balance C3H8 + O2 -> CO2 + H2O"))
    @Test fun ironThreeOxide() = assertEquals("Iron(III) oxide.", pc("name the compound Fe2O3"))
    @Test fun hydroxideParens() = assertEquals("Ca(OH)₂", pc("formula for calcium hydroxide"))
    @Test fun tetroxide() = assertEquals("N₂O₄", pc("formula for dinitrogen tetroxide"))
    @Test fun molarMass() = assertEquals("44.01 g/mol (CO₂)", pc("What is the molar mass of CO2"))
    @Test fun dihybrid() = assertEquals("1/16 ≈ 0.0625 (6.25%) of the offspring are aabb.", pc("punnett square AaBb x AaBb, what fraction are aabb"))

    // Chemistry 11 (Chemistry11.kt)
    @Test fun moles() = assertEquals("2.00 mol (H₂O is 18.02 g/mol)", pc("how many moles in 36 g of water"))
    @Test fun stoichiometry() = assertEquals("43.89 g of CO₂ (0.997 mol)", pc("how many grams of CO2 from 16 g of methane burning"))
    @Test fun limiting() = assertEquals("H₂ is the limiting reactant; N₂ is in excess (the equation is N₂ + 3H₂ → 2NH₃).", pc("limiting reactant when 3 mol N2 reacts with 6 mol H2 to make ammonia"))
    @Test fun lowestIonization() = assertEquals("Sodium (Na).", pc("which element has the lowest ionization energy in period 3"))
    @Test fun polarity() = assertEquals("Nonpolar: 4 bonded atoms and 0 lone pairs on C, and the symmetric shape cancels the bond dipoles.", pc("is CCl4 polar or nonpolar"))
    @Test fun scientificNotation() = assertEquals("3.45 × 10⁻⁴", pc("write 0.000345 in scientific notation"))

    // Chemistry 12 (Chemistry12.kt)
    @Test fun conjugateOfBicarbonate() = assertEquals("CO₃²⁻", pc("conjugate base of HCO3-"))
    @Test fun conjugateOfHydroxide() = assertEquals("H₂O", pc("conjugate acid of OH-"))
    @Test fun weakAcidShortcut() = assertEquals("pH = 2.87 ([H⁺] = 1.34 × 10⁻³ M, from x = √(Ka·C))", pc("pH of 0.1 M acetic acid with Ka = 1.8 x 10^-5"))
    @Test fun kspExpression() = assertEquals("Ksp = [Ca²⁺]³[PO₄³⁻]²", pc("Ksp expression for Ca3(PO4)2"))
    @Test fun leChatelierPressure() = assertEquals("It shifts right, toward the products, the side with fewer moles of gas (4 on the left, 2 on the right).", pc("what happens to N2 + 3H2 <-> 2NH3 if pressure increases"))
    @Test fun reducingAgent() = assertEquals("Zn is the reducing agent: it is oxidized (0 to +2).", pc("what is the reducing agent in Zn + Cu2+ -> Zn2+ + Cu"))

    // Physics 11 (Physics11.kt)
    @Test fun kinematicsFromRest() = assertEquals("24 m", pc("distance traveled by a car accelerating from rest at 3 m/s2 for 4 s"))
    @Test fun kinematicsOverDistance() = assertEquals("8.72 m/s", pc("final velocity if initial velocity is 4 m/s, acceleration is 3 m/s2 over 10 m"))
    @Test fun freeFall() = assertEquals("9.9 m/s (v = √(2gh))", pc("speed of a 2 kg object dropped from 5 m just before it hits the ground"))
    @Test fun parallel() = assertEquals("5 Ω (1/R = 1/R₁ + 1/R₂ + ...)", pc("total resistance of two 10 ohm resistors in parallel"))
    @Test fun electricEnergy() = assertEquals("1080000 J (0.3 kWh)", pc("how much energy does a 60 W bulb use in 5 hours"))

    // Physics 12 (Physics12.kt)
    @Test fun resultant() = assertEquals("5 N at 53.1° north of east", pc("resultant of 3 N east and 4 N north"))
    @Test fun projectileRange() = assertEquals("40.8 m (R = v² sin 2θ / g)", pc("range of a projectile launched at 20 m/s at 45 degrees"))
    @Test fun coulomb() = assertEquals("0.899 N (F = kq₁q₂/r²)", pc("electric force between two 1 microcoulomb charges 0.1 m apart"))
    @Test fun orbit() = assertEquals("7.55 km/s (7546 m/s, v = √(GM/r))", pc("orbital speed of a satellite 7000 km from the center of Earth"))
    @Test fun inverseSquare() = assertEquals("It becomes 1/4 as large (a quarter).", pc("what happens to gravitational force if the distance doubles"))

    // Life Sciences 11 (LifeSciences11.kt)
    @Test fun magnification() = assertEquals("400× (10× eyepiece times 40× objective)", pc("total magnification with a 10x eyepiece and a 40x objective lens"))
    @Test fun fieldOfView() = assertEquals("0.4 mm (field of view × magnification stays the same)", pc("field of view at 400x if it is 4 mm at 40x"))
    @Test fun bacterialGrowth() = assertEquals("640 bacteria (6 doublings: 10 × 2^6)", pc("a bacterium divides every 30 minutes, how many bacteria after 3 hours starting with 10"))
    @Test fun scientificName() = assertEquals("Felis catus.", pc("what is the scientific name for cats"))
    @Test fun lyticVsLysogenic() = assertEquals(true, pc("what is the difference between the lytic and lysogenic cycle")?.contains("prophage"))
    @Test fun populationGrowthStaysPrecalc() = assertEquals("3200", pc("a population of 200 doubles every 3 hours, how many after 12 hours"))
}
