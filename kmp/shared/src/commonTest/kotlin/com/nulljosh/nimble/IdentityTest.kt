package com.nulljosh.nimble

import kotlin.test.Test
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class IdentityTest {
    @Test
    fun answersQuestionsAboutNimble() {
        for (q in listOf("Who made you?", "who are you", "what's your name", "Are you ChatGPT?", "what model are you", "how do you work")) {
            assertTrue(assertNotNull(identityAnswer(q), q).body.contains("Joshua Trommel"), q)
        }
    }

    @Test
    fun leavesOtherQuestionsAlone() {
        for (q in listOf("who created the telephone", "what is your name in french", "are you open")) assertNull(identityAnswer(q), q)
    }
}
