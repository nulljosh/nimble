package com.nulljosh.nimble

import kotlin.test.Test
import kotlin.test.assertEquals

/** Same rules as Tests/TurnBufferTests.swift and the web's turns: last three, trimmed, blanks ignored. */
class TurnsTest {
    @Test
    fun keepsTheLastThreeOldestFirst() {
        val t = Turns()
        for (i in 1..5) t.add("q$i", "a$i")
        assertEquals(listOf("q3", "q4", "q5"), t.list().map { it.q })
    }

    @Test
    fun trimsAndIgnoresBlanks() {
        val t = Turns()
        t.add("  weather in paris ", " 14 C ")
        t.add("", "x")
        t.add("q", "   ")
        assertEquals(listOf(Turns.Turn("weather in paris", "14 C")), t.list())
        t.clear()
        assertEquals(emptyList(), t.list())
    }
}
