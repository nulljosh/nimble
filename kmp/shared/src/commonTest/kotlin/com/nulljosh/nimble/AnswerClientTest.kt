package com.nulljosh.nimble

import kotlin.test.Test
import kotlin.test.assertTrue

/**
 * Exercises the real Gemma -> DDG -> Wikipedia chain. Mirrors testDDGQuery in
 * Tests/QueryEngineTests.swift: offline is a pass, because a Miss is the correct
 * behaviour with no network. What must never happen is a thrown exception.
 */
class AnswerClientTest {

    @Test
    fun mathShortCircuitsBeforeAnyNetworkCall() = runBlockingTest {
        val a = AnswerClient().query("sqrt(144)")
        assertTrue(a is Answer.Math && a.value == "12", "expected offline math, got $a")
    }

    @Test
    fun networkQueryReturnsAnAnswerOrACleanMiss() = runBlockingTest {
        val a = AnswerClient().query("Population of Canada")
        assertTrue(
            a is Answer.Text || a is Answer.Miss,
            "chain must resolve or miss cleanly, got $a"
        )
    }
}
