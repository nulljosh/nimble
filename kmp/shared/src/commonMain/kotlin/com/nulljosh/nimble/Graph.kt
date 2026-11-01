package com.nulljosh.nimble

import kotlin.math.abs
import kotlin.math.roundToLong

/** `graphExpr`, `evalAt` and `samplePoints` in docs/engine.js: "plot x^2" to points, offline, through the calculator's parser. */
object Graph {
    private val VERB = Regex("""^(plot|graph|draw|sketch)\s+""")
    private val Y = Regex("""^(y|f\(x\))\s*=\s*""")
    private val SAFE = Regex("""^[0-9a-z+\-*/^(). ]+$""")
    private val IMPLICIT = Regex("""(?<=[0-9)])\s*(?=[a-z(])""")

    /** The bare expression behind "plot sin(x)" or "y = 2x+1", or null when it is not a graph question. */
    fun expr(input: String): String? {
        var q = input.trim().lowercase()
        val verb = VERB.containsMatchIn(q); q = q.replace(VERB, "")
        val y = Y.containsMatchIn(q); q = q.replace(Y, "")
        return if ((verb || y) && 'x' in q && SAFE.matches(q)) q else null
    }

    /** x as plain digits: Double.toString writes 1.0E-5, and the parser would read that e as Euler's number. */
    fun plain(v: Double): String {
        val n = (abs(v) * 1e12).roundToLong()
        val s = n.toString().padStart(13, '0')
        return (if (v < 0 && n != 0L) "-" else "") + s.dropLast(12) + "." + s.takeLast(12)
    }

    /** y at one x: substitute x, then make implicit multiplication explicit: 2(x), (x)(x), 3sin(x). */
    // ponytail: "0+" because tryMath turns down a lone number ("plot x" at x = 3 is just "(3)").
    fun value(expr: String, x: Double): Double? = Precalc.tryMath("0+(" + expr.replace("x", "(${plain(x)})").replace(IMPLICIT, "*") + ")")

    /** 201 samples across [x0, x1]; the graph view resamples as you pan and zoom. */
    fun points(expr: String, x0: Double = -10.0, x1: Double = 10.0): List<Pair<Double, Double>> =
        (0..200).mapNotNull { i -> val x = x0 + (x1 - x0) * i / 200; value(expr, x)?.let { x to it } }
}
