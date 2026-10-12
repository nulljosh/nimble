package com.nulljosh.nimble

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

// The same queries as test/time-sensitive.test.js (web) and Tests/QueryEngineTests.swift, so the platforms agree.
class TimeSensitiveTest {
    @Test
    fun timeSensitiveQueriesAreTrue() {
        listOf(
            "who is the current prime minister of canada", "who is the ceo of apple", "current president of france",
            "latest iphone", "population of japan", "who holds the world record for the 100m", "who won the last world cup",
            "who is the premier of ontario", "what is the price of gold", "who is the mayor of vancouver",
            "who is the governor of california", "who is the leader of the opposition", "who is the champion of wimbledon",
            "what is the population of canada now", "what is the price of bitcoin today", "who is the incumbent senator for texas",
            "what is the newest macbook", "how much does a tesla model 3 cost",
        ).forEach { assertTrue(isTimeSensitive(it), it) }
    }

    @Test
    fun historyAndTimelessQueriesAreFalse() {
        listOf(
            "who was the first president of the united states", "when was the eiffel tower built", "when was abraham lincoln born",
            "who discovered penicillin", "who invented the telephone", "what is the capital of france", "what is the speed of light",
            "how tall is mount everest", "who was the first prime minister of canada", "what year did world war 2 end",
        ).forEach { assertFalse(isTimeSensitive(it), it) }
    }

    @Test
    fun ignoresCaseAndEmpty() {
        assertTrue(isTimeSensitive("Who Is The CEO of Apple"))
        assertFalse(isTimeSensitive(""))
    }
}
