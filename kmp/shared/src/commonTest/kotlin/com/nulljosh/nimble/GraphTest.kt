package com.nulljosh.nimble

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class GraphTest {
    @Test fun parsesOnlyGraphQuestions() {
        assertEquals("x^2", Graph.expr("plot x^2"))
        assertEquals("sin(x)", Graph.expr("y = sin(x)"))
        assertNull(Graph.expr("plot 2+2"))
        assertNull(Graph.expr("what is x"))
    }

    @Test fun samplesAnyWindow() {
        val pts = Graph.points("2x^2")
        assertEquals(201, pts.size)
        assertEquals(200.0, pts.first().second, 1e-9)
        val zoomed = Graph.points("x^2", -2.0, 2.0)
        assertEquals(-2.0, zoomed.first().first, 1e-12)
        assertEquals(4.0, zoomed.last().second, 1e-9)
    }

    @Test fun tinyXNeverReadsAsEuler() {
        assertEquals("0.000010000000", Graph.plain(1e-5))
        assertEquals("-3.500000000000", Graph.plain(-3.5))
        assertEquals(1e-5, Graph.value("x", 1e-5)!!, 1e-12)
        assertTrue(abs(Graph.value("3sin(x)", 0.0)!!) < 1e-12)
    }

    private fun abs(v: Double) = kotlin.math.abs(v)
}
