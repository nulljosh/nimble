package com.nulljosh.nimble

import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.ln
import kotlin.math.log10
import kotlin.math.pow
import kotlin.math.round
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tan
import kotlin.math.truncate

/**
 * Recursive-descent evaluator for the arithmetic Nimble supports.
 *
 * The Swift engine leans on NSExpression here, which has no Kotlin equivalent. Writing the
 * parser out also drops two hacks NSExpression forced on the Swift side: rewriting `x` to
 * `*` across the whole string (which corrupts any expression containing a variable-ish x)
 * and appending `.0` to every integer literal to force float division.
 *
 * Grammar, loosest binding first:
 *   expr   := term (('+' | '-') term)*
 *   term   := unary (('*' | '/' | '%') unary)*
 *   unary  := ('-' | '+')? power
 *   power  := atom ('^' unary)?          -- right-associative, binds tighter than unary
 *   atom   := number | const | func '(' expr ')' | '(' expr ')'
 */
internal object Expr {

    private val functions: Map<String, (Double) -> Double> = mapOf(
        "sqrt" to ::sqrt,
        "sin" to ::sin,
        "cos" to ::cos,
        "tan" to ::tan,
        "log" to ::log10,
        "ln" to ::ln,
        "abs" to ::abs,
    )

    /** Returns null on any malformed input rather than throwing. */
    fun eval(source: String): Double? {
        val p = Parser(source)
        return try {
            val v = p.expr()
            p.skipSpace()
            // Trailing junk means we did not understand the whole expression; reject it
            // rather than silently answering for a prefix ("2 + 2 banana" is not 4).
            if (!p.atEnd) null else if (v.isNaN() || v.isInfinite()) v else v
        } catch (_: IllegalArgumentException) {
            null
        }
    }

    private class Parser(private val s: String) {
        private var i = 0
        val atEnd get() = i >= s.length

        fun skipSpace() {
            while (i < s.length && (s[i] == ' ' || s[i] == ',')) i++
        }

        private fun peek(): Char? {
            skipSpace()
            return if (i < s.length) s[i] else null
        }

        private fun fail(): Nothing = throw IllegalArgumentException("bad expression")

        fun expr(): Double {
            var v = term()
            while (true) {
                when (peek()) {
                    '+' -> { i++; v += term() }
                    '-' -> { i++; v -= term() }
                    else -> return v
                }
            }
        }

        private fun term(): Double {
            var v = unary()
            while (true) {
                when (peek()) {
                    '*' -> { i++; v *= unary() }
                    '/' -> { i++; v /= unary() }
                    '%' -> {
                        i++
                        val rhs = unary()
                        // Swift used truncatingRemainder and bailed on a zero divisor.
                        if (rhs == 0.0) fail()
                        v -= truncate(v / rhs) * rhs
                    }
                    else -> return v
                }
            }
        }

        private fun unary(): Double = when (peek()) {
            '-' -> { i++; -unary() }
            '+' -> { i++; unary() }
            else -> power()
        }

        private fun power(): Double {
            val base = atom()
            // Right-associative, and the exponent may itself be signed: 2^-3.
            return if (peek() == '^') { i++; base.pow(unary()) } else base
        }

        private fun atom(): Double {
            val c = peek() ?: fail()

            if (c == '(') {
                i++
                val v = expr()
                if (peek() != ')') fail()
                i++
                return v
            }

            if (c.isDigit() || c == '.') return number()

            if (c.isLetter()) {
                val start = i
                while (i < s.length && s[i].isLetter()) i++
                val name = s.substring(start, i).lowercase()

                if (name == "pi") return kotlin.math.PI
                if (name == "e") return kotlin.math.E

                val fn = functions[name] ?: fail()
                if (peek() != '(') fail()
                i++
                val arg = expr()
                if (peek() != ')') fail()
                i++
                return fn(arg)
            }

            fail()
        }

        private fun number(): Double {
            skipSpace()
            val start = i
            while (i < s.length && (s[i].isDigit() || s[i] == '.')) i++
            // Scientific notation: 1e9, 2.5E-3
            if (i < s.length && (s[i] == 'e' || s[i] == 'E')) {
                val mark = i
                i++
                if (i < s.length && (s[i] == '+' || s[i] == '-')) i++
                if (i < s.length && s[i].isDigit()) {
                    while (i < s.length && s[i].isDigit()) i++
                } else {
                    i = mark // not an exponent after all; leave `e` for atom() to read
                }
            }
            return s.substring(start, i).toDoubleOrNull() ?: fail()
        }
    }

    /**
     * Matches Swift's formatResult: whole numbers print bare, everything else gets up to
     * 10 decimal places with trailing zeros trimmed.
     */
    fun format(value: Double): String {
        if (value.isNaN() || value.isInfinite()) return value.toString()
        if (value == round(value) && abs(value) < 1e15) {
            return value.toLong().toString()
        }
        val fixed = fixed(value, 10)
        return fixed.trimEnd('0').trimEnd('.')
    }

    /** kotlin has no printf in common code, so round to n places by hand. */
    private fun fixed(value: Double, places: Int): String {
        val neg = value < 0
        val v = abs(value)
        val factor = 10.0.pow(places)
        val scaled = round(v * factor)
        val whole = (scaled / factor).toLong()
        val frac = (scaled - whole * factor).toLong()
        val fracStr = frac.toString().padStart(places, '0')
        return (if (neg) "-" else "") + whole + "." + fracStr
    }
}
