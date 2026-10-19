package com.nulljosh.nimble

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** Tell me more's reply, the same cases as test/tell-more.test.js and Tests/TellMoreTests.swift. */
class TellMoreTest {
    @Test
    fun threeSentencesComeBack() = assertEquals(
        "Paris is the capital of France. It sits on the Seine.",
        moreAnswer("""{"answer":"Paris is the capital of France. It sits on the Seine.","source":"Groq"}"""),
    )

    @Test
    fun unknownIsNull() = assertNull(moreAnswer("""{"answer":"UNKNOWN"}"""))

    @Test
    fun junkIsNull() = assertNull(moreAnswer("not json"))
}
