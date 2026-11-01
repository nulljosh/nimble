package com.nulljosh.nimble

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** The same steps docs/engine.js workSteps() prints, line for line. */
class WorkStepsTest {
    @Test fun linear() = assertEquals(
        listOf("2x+3 = 11", "Move the x terms left and the numbers right: 2x = 8", "Divide both sides by 2: x = 4"),
        Calculus12.workSteps("solve 2x+3=11"))

    @Test fun halves() = assertEquals(listOf("x/2 = 3", "Multiply both sides by 2: x = 6"), Calculus12.workSteps("solve x/2 = 3"))

    @Test fun product() = assertEquals(
        listOf("Product rule on x^3 sin(x): (fg)' = f'g + fg'", "(x^3)' = 3x^2", "(sin(x))' = cos(x)", "So d/dx x^3 sin(x) = 3x^2 sin(x) + x^3 cos(x)"),
        Calculus12.workSteps("derivative of x^3*sin(x)"))

    @Test fun chain() = assertEquals(
        listOf("Let u = 2x, so u' = 2", "d/dx sin(2x) = 2cos(2x) (chain rule)"), Calculus12.workSteps("differentiate sin(2x)"))

    @Test fun nothingToExpand() { assertNull(Calculus12.workSteps("derivative of e^x")); assertNull(Calculus12.workSteps("solve x^2=4")) }
}
