package com.nulljosh.nimble

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Cases carried over from Tests/QueryEngineTests.swift -- that file is the spec. */
class QueryEngineTest {

    private fun math(s: String) = QueryEngine.evaluateMath(s)

    @Test fun basicAddition() = assertEquals("4", math("2 + 2"))
    @Test fun multiplication() = assertEquals("42", math("6 * 7"))
    @Test fun division() = assertEquals("25", math("100 / 4"))
    @Test fun subtraction() = assertEquals("63", math("100 - 37"))
    @Test fun complexExpression() = assertEquals("30", math("(10 + 5) * 2"))
    @Test fun negativeResult() = assertEquals("-5", math("5 - 10"))
    @Test fun modulo() = assertEquals("2", math("17 % 5"))
    @Test fun power() = assertEquals("1024", math("2^10"))
    @Test fun sqrtOf144() = assertEquals("12", math("sqrt(144)"))
    @Test fun sinZero() = assertEquals("0", math("sin(0)"))
    @Test fun cosZero() = assertEquals("1", math("cos(0)"))
    @Test fun log10Of100() = assertEquals("2", math("log(100)"))
    @Test fun absOfNegative() = assertEquals("42", math("abs(-42)"))

    @Test
    fun decimalResult() {
        val r = math("10 / 3")
        assertNotNull(r)
        val v = r.toDouble()
        assertTrue(abs(v - 10.0 / 3.0) < 0.0001, "expected ~3.3333, got $r")
    }

    // Rejection: these must not be answered offline.
    @Test fun prose() = assertNull(math("hello world"))
    @Test fun empty() = assertNull(math(""))
    @Test fun sentence() = assertNull(math("what is the population of canada"))
    @Test fun bareNumber() = assertNull(math("42"))

    // Regressions the Kotlin evaluator must not reintroduce: NSExpression's string munging
    // let a trailing word slip through, and integer division truncated without the .0 hack.
    @Test fun trailingJunkRejected() = assertNull(math("2 + 2 banana"))
    @Test fun unbalancedParenRejected() = assertNull(math("(10 + 5"))
    @Test fun integerDivisionIsFloat() = assertEquals("2.5", math("5 / 2"))
    @Test fun negativeExponent() = assertEquals("0.125", math("2^-3"))
    @Test fun precedence() = assertEquals("14", math("2 + 3 * 4"))
    @Test fun unaryMinus() = assertEquals("-8", math("-3 - 5"))

    @Test
    fun naturalLanguageMath() {
        assertEquals("19", math("whats nine plus ten"))
        assertEquals("50", math("what is five times ten"))
    }

    @Test
    fun classification() {
        assertEquals(QueryType.MATH, QueryEngine.classify("2 + 2"))
        assertEquals(QueryType.FACTUAL, QueryEngine.classify("who founded Apple"))
        assertEquals(QueryType.DEFINITION, QueryEngine.classify("define nimble"))
    }

    @Test
    fun preprocessStripsQuestionForm() {
        assertEquals("population of Canada", QueryEngine.preprocess("What is the population of Canada?").first)
        val (ddg, wiki) = QueryEngine.preprocess("Where is Mount Fuji located?")
        assertEquals("Mount Fuji location", ddg)
        assertEquals("Mount Fuji", wiki)
    }

    @Test
    fun suggestionsAreNotEmpty() = assertTrue(QueryEngine.randomSuggestion().isNotEmpty())
}
