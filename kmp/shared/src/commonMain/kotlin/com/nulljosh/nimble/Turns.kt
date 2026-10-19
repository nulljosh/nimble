package com.nulljosh.nimble

import kotlinx.serialization.Serializable

/**
 * Follow-up memory: the last three AI exchanges, in memory only, so "and in celsius?" has something to refer to.
 * Same rules as TurnBuffer in Sources/Models/Turns.swift and `turns` in docs/engine.js.
 */
class Turns {
    @Serializable
    data class Turn(val q: String, val a: String)

    private val turns = ArrayDeque<Turn>()

    fun add(q: String, a: String) {
        val tq = q.trim()
        val ta = a.trim()
        if (tq.isEmpty() || ta.isEmpty()) return
        turns.addLast(Turn(tq, ta))
        while (turns.size > MAX) turns.removeFirst()
    }

    fun clear() = turns.clear()

    /** The proxy's `turns` body field, oldest first. */
    fun list(): List<Turn> = turns.toList()

    companion object { const val MAX = 3 }
}
