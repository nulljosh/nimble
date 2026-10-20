package com.nulljosh.nimble

import com.nulljosh.nimble.Precalc.fixed
import com.nulljosh.nimble.Precalc.js
import com.nulljosh.nimble.Precalc.money
import com.nulljosh.nimble.Precalc.pcAt
import com.nulljosh.nimble.Precalc.pcCoeffs
import com.nulljosh.nimble.Precalc.pcDivide
import com.nulljosh.nimble.Precalc.pcFrac
import com.nulljosh.nimble.Precalc.pcNum
import com.nulljosh.nimble.Precalc.pcPoly
import com.nulljosh.nimble.Precalc.pcQuad
import com.nulljosh.nimble.Precalc.pcRoots
import com.nulljosh.nimble.Precalc.pcScanRoots
import com.nulljosh.nimble.Precalc.pcVal
import com.nulljosh.nimble.Precalc.prec
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.asin
import kotlin.math.atan
import kotlin.math.cos
import kotlin.math.sign
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * BC Pre-Calculus 11 with no network: radicals, absolute value, quadratics in vertex form, inequalities, systems,
 * rational expressions, the sine and cosine laws and simple interest. A port of `pc11()` in docs/engine.js, branch for
 * branch. Precalc.answer asks it first; null means "not mine". Graded by `COURSE=pc11 node test/exam-course.js`.
 */
internal object Precalc11 {

    /** √n as k√m with m square-free: √50 is 5√2. */
    private fun radical(n: Long): Pair<Long, Long> {
        var k = 1L
        var m = n
        var f = 2L
        while (f * f <= m) { while (m % (f * f) == 0L) { m /= f * f; k *= f }; f++ }
        return k to m
    }

    private fun radText(k: Long, m: Long) = if (m == 1L) "$k" else (if (k == 1L) "" else "$k") + "√" + m

    private tailrec fun gcd(a: Long, b: Long): Long = if (b == 0L) abs(a) else gcd(b, a % b)

    /** The real zeros of an expression in x: exact for a quadratic, small fractions otherwise. */
    private fun zeros(e: String) = pcQuad(e)?.let { pcRoots(it).sorted() } ?: pcScanRoots(e)

    /** a(x - h)² + k, written the way a textbook does. */
    private fun vertexForm(a: Double, h: Double, k: Double) =
        (if (a == 1.0) "" else if (a == -1.0) "-" else pcFrac(a)) +
            (if (h == 0.0) "x²" else "(x " + (if (h < 0) "+ " + pcFrac(-h) else "- " + pcFrac(h)) + ")²") +
            (if (k == 0.0) "" else if (k < 0) " - " + pcFrac(-k) else " + " + pcFrac(k))

    private fun out(body: String) = Answer.Text(heading = null, body = body, source = "Nimble math")

    private fun find(pattern: String, s: String): List<String>? = Regex(pattern).find(s)?.groupValues

    private const val T = """(\d*)\s*(?:√|sqrt)\s*\(?\s*(\d+)\s*\)?"""
    private const val F = """(?:y\s*=\s*|f\(x\)\s*=\s*)?(.+?)(?:\s*=\s*0)?"""

    fun answer(q: String): Answer? {
        var m: List<String>?
        if (Regex("""^(?:the )?quadratic formula$""").matches(q)) return out("x = (-b ± √(b² - 4ac))/2a, the roots of ax² + bx + c = 0.")
        if (Regex("""^(?:the )?(?:law|rule) of sines?$|^(?:the )?sine law$""").matches(q)) return out("a/sin A = b/sin B = c/sin C: each side over the sine of the angle across from it.")
        if (Regex("""^(?:the )?(?:law|rule) of cosines?$|^(?:the )?cosine law$""").matches(q)) return out("c² = a² + b² - 2ab cos C, where C is the angle between sides a and b.")
        // Radicals: √50, √12 + √27, 3√2 · 4√6, 1/√2
        val r = q.replaceFirst(Regex("""^(?:simplify|rationalize|evaluate)\s+"""), "")
        fun rad(c: String, n: String): Pair<Long, Long> { val (k, s) = radical(n.toLong()); return (if (c == "") 1L else c.toLong()) * k to s }
        fun approx(k: Long, s: Long) = radText(k, s) + if (s == 1L) "" else " ≈ " + pcNum(k * sqrt(s.toDouble()))
        m = find("^$T$", r)
        if (m != null) { val (k, s) = rad(m[1], m[2]); return out(approx(k, s)) }
        m = find("""^$T\s*([+-])\s*$T$""", r)
        if (m != null) {
            val (k1, s1) = rad(m[1], m[2])
            val (k2, s2) = rad(m[4], m[5])
            val sg = if (m[3] == "-") -1 else 1
            if (s1 == s2) { val k = k1 + sg * k2; return out(if (k == 0L) "0" else approx(k, s1)) }
            return out(radText(k1, s1) + (if (sg < 0) " - " else " + ") + radText(k2, s2) + " ≈ " + pcNum(k1 * sqrt(s1.toDouble()) + sg * k2 * sqrt(s2.toDouble())))
        }
        m = find("""^$T\s*[*×·]\s*$T$""", r)
        if (m != null) {
            val c = (if (m[1] == "") 1L else m[1].toLong()) * (if (m[3] == "") 1L else m[3].toLong())
            val (k, s) = radical(m[2].toLong() * m[4].toLong())
            return out(approx(c * k, s))
        }
        m = find("""^(\d+)\s*/\s*$T$""", r)
        if (m != null) {
            val (k, s) = rad(m[2], m[3])
            val top = m[1].toLong()
            val g = gcd(top, k * s)
            val n = top / g
            val d = k * s / g
            return out(if (s == 1L) pcFrac(top.toDouble() / k) else (if (n == 1L) "" else "$n") + "√" + s + (if (d == 1L) "" else "/$d") + " ≈ " + pcNum(top / (k * sqrt(s.toDouble()))))
        }
        // |-7| + |3|, then solve |2x + 1| = 7
        if ('|' in q && 'x' !in q) Precalc.tryMath(r.replace(Regex("""\|([^|]+)\|"""), "abs($1)"))?.let { return Answer.Math(Expr.format(it)) }
        m = find("""^solve\s+\|\s*([^|]*x[^|]*)\|\s*=\s*(-?[\d.]+)$""", q)
        if (m != null) {
            val c = m[2].toDouble()
            if (c < 0) return out("No solution: an absolute value is never negative.")
            val xs = (pcScanRoots("(${m[1]})-(${js(c)})") + pcScanRoots("(${m[1]})+(${js(c)})")).distinct().sorted()
            return if (xs.isNotEmpty()) out(xs.joinToString(" or ") { "x = " + pcFrac(it) }) else null
        }
        // vertex, axis of symmetry, maximum or minimum, discriminant, vertex form, number of real roots
        m = find("^(vertex form|vertex|axis of symmetry|maximum value|minimum value|maximum|minimum|discriminant) of $F$", q)
            ?: find("^complete the square (?:for|of|on) $F$", q)?.let { listOf(it[0], "vertex form", it[1]) }
            ?: find("^how many (?:real )?(?:roots|solutions|zeros|x-intercepts) (?:does|do|has) $F have$", q)?.let { listOf(it[0], "count", it[1]) }
        if (m != null) {
            val co = pcQuad(m[2].replace("x²", "x^2")) ?: return null
            if (abs(co[0]) < 1e-12) return null
            val (a, b, c) = co
            val h = prec(-b / (2 * a), 12)
            val k = prec(c - b * b / (4 * a), 12)
            val d = prec(b * b - 4 * a * c, 12)
            val f = m[1]
            if (f == "vertex") return out("(${pcFrac(h)}, ${pcFrac(k)})")
            if (f == "axis of symmetry") return out("x = " + pcFrac(h))
            if (f == "discriminant") return out("b² - 4ac = " + pcNum(d) + if (d > 0) ", so two real roots." else if (d == 0.0) ", so one real root." else ", so no real roots.")
            if (f == "count") return out(if (d > 0) "2 real roots (the discriminant is ${pcNum(d)})." else if (d == 0.0) "1, a double root (the discriminant is 0)." else "None. The discriminant is ${pcNum(d)}, so it has no real roots.")
            if (f.startsWith("max")) return out(if (a < 0) "${pcFrac(k)}, at x = ${pcFrac(h)}." else "None: it opens upward. Its minimum is ${pcFrac(k)}.")
            if (f.startsWith("min")) return out(if (a > 0) "${pcFrac(k)}, at x = ${pcFrac(h)}." else "None: it opens downward. Its maximum is ${pcFrac(k)}.")
            return out("y = " + vertexForm(a, h, k))
        }
        // linear and quadratic inequalities
        m = find("""^solve\s+([^<>≤≥=]*x[^<>≤≥=]*?)\s*(<=|>=|=<|=>|≤|≥|<|>)\s*([^<>≤≥=]+)$""", q)
        if (m != null) {
            val op = when (m[2]) { "<=", "=<" -> "≤"; ">=", "=>" -> "≥"; else -> m[2] }
            val co = pcQuad("(${m[1]})-(${m[3]})".replace("x²", "x^2")) ?: return null
            val (a, b, c) = co
            val strict = op == "<" || op == ">"
            val want = if (op == "<" || op == "≤") -1.0 else 1.0
            val le = if (strict) "<" else "≤"
            val ge = if (strict) ">" else "≥"
            if (abs(a) < 1e-12) {
                if (abs(b) < 1e-12) return null
                return out("x " + (if ((want > 0) == (b > 0)) ge else le) + " " + pcFrac(prec(-c / b, 12)))
            }
            // s > 0: the answer lies outside the roots, where the parabola has the sign of a.
            val rs = pcRoots(co).sorted()
            val s = sign(a) * want
            if (rs.size < 2) {
                if (s > 0) return out(if (rs.isNotEmpty() && strict) "x ≠ " + pcFrac(rs[0]) else "All real numbers.")
                return out(if (rs.isNotEmpty() && !strict) "x = " + pcFrac(rs[0]) else "No solution.")
            }
            val r1 = pcFrac(rs[0])
            val r2 = pcFrac(rs[1])
            return out(if (s > 0) "x $le $r1 or x $ge $r2" else "$r1 $le x $le $r2")
        }
        // systems: y = x^2 and y = x + 2, or x + y = 10 and x - y = 4
        m = find("""^solve\s+(?:the system\s+)?([^=]+=[^=]+?)\s*(?:\band\b|,|;)\s*([^=]+=[^=]+)$""", q)
        if (m != null && 'x' in q) {
            val ys = listOf(m[1], m[2]).map { find("""^y\s*=\s*(.+)$""", it.trim())?.get(1) }
            val y0 = ys[0]
            val y1 = ys[1]
            if (y0 != null && y1 != null && 'y' !in y0 + y1) {
                val pts = zeros("($y0)-($y1)").map { x -> x to (pcAt(y0, x) ?: return null) }
                return out(if (pts.isNotEmpty()) pts.joinToString(" and ") { (x, y) -> "(${pcFrac(x)}, ${pcFrac(prec(y, 12))})" } else "No solution: the graphs never meet.")
            }
            // Each equation as Ax + By = C, read by evaluating it at three points and checked at a fourth.
            fun line(e: String): List<Double>? {
                val sides = e.split("=")
                fun f(x: Double, y: Int) = pcAt("(${sides[0]})-(${sides[1]})".replace("y", "($y)"), x)
                val c = f(0.0, 0) ?: return null
                val a = f(1.0, 0) ?: return null
                val b = f(0.0, 1) ?: return null
                val t = f(1.0, 1) ?: return null
                return if (abs(t - (a + b - c)) > 1e-9) null else listOf(a - c, b - c, -c)
            }
            val p = line(m[1]) ?: return null
            val u = line(m[2]) ?: return null
            val det = p[0] * u[1] - p[1] * u[0]
            if (abs(det) < 1e-12) return out("No single solution: the lines are parallel or the same line.")
            return out("x = " + pcFrac(prec((p[2] * u[1] - p[1] * u[2]) / det, 12)) + ", y = " + pcFrac(prec((p[0] * u[2] - p[2] * u[0]) / det, 12)))
        }
        // rational expressions: add over x, cancel common factors, name the values x cannot take
        m = find("""^simplify\s+((?:\s*[+-]?\s*\d+\s*/\s*\(?\s*\d*\s*x\s*\)?\s*)+)$""", q)
        if (m != null) {
            val s = Regex("""([+-]?)\s*(\d+)\s*/\s*\(?\s*(\d*)\s*x\s*\)?""").findAll(m[1]).sumOf {
                val (sg, a, b) = it.destructured
                (if (sg == "-") -1 else 1) * a.toDouble() / (if (b == "") 1.0 else b.toDouble())
            }
            val f = pcFrac(prec(s, 12)).split("/")
            return out(if (s == 0.0) "0" else f[0] + "/" + (if (f.size > 1) "(" + f[1] + "x)" else "x") + ", x ≠ 0")
        }
        m = find("""^simplify\s+\(?([^()]*x[^()]*)\)?\s*/\s*\(([^()]*x[^()]*)\)$""", q) ?: find("""^simplify\s+\(?([^()]*x[^()]*)\)?\s*/\s*([^()/]*x[^()/]*)$""", q)
        if (m != null) {
            var top = pcCoeffs(m[1]) ?: return null
            var bot = pcCoeffs(m[2]) ?: return null
            val bad = zeros(m[2])
            for (z in bad) while (top.size > 1 && bot.size > 1) {
                val (qt, rt) = pcDivide(top, listOf(1.0, -z))
                val (qb, rb) = pcDivide(bot, listOf(1.0, -z))
                if (abs(rt[0]) > 1e-9 || abs(rb[0]) > 1e-9) break
                top = qt
                bot = qb
            }
            fun poly(co: List<Double>) = pcPoly(co.map { fixed(it, 9) })
            fun wrap(s: String) = if (Regex("""\s[+-]\s""").containsMatchIn(s)) "($s)" else s
            val body = if (bot.size == 1) (if (abs(bot[0] - 1) < 1e-12) poly(top) else wrap(poly(top)) + "/" + pcFrac(bot[0])) else wrap(poly(top)) + "/" + wrap(poly(bot))
            return out(body + if (bad.isNotEmpty()) ", x ≠ " + bad.joinToString(", ") { pcFrac(it) } else "")
        }
        m = find("""^(?:the )?(?:non-?permissible values|restrictions?|excluded values)(?: on| of| for)?\s+(.+)$""", q)
        if (m != null) {
            val d = find("""/\s*\(([^()]+)\)\s*$""", m[1]) ?: find("""/\s*([^()/]+)$""", m[1]) ?: return null
            val xs = zeros(d[1])
            return out(if (xs.isNotEmpty()) xs.joinToString(", ") { "x ≠ " + pcFrac(it) } else "None: the denominator is never zero.")
        }
        // triangles: the cosine law for a side or an angle, the sine law (with its ambiguous case), the third angle
        m = find("""angle opposite (?:the )?(?:side )?(?:of (?:length )?)?([\d.]+)\b.*?\bsides? (?:of )?([\d.]+)\s*,\s*([\d.]+)\s*,?\s*and\s*([\d.]+)""", q)
        if (m != null) {
            val s = m[1].toDouble()
            val all = mutableListOf(m[2].toDouble(), m[3].toDouble(), m[4].toDouble())
            if (!all.remove(s)) return null
            val (p, t) = all
            val c = (p * p + t * t - s * s) / (2 * p * t)
            return out(if (abs(c) > 1) "No triangle has those sides." else pcNum(fixed(acos(c) * 180 / PI, 2)) + "°")
        }
        if (Regex("""\btriangle\b|\bangle [abc]\b""").containsMatchIn(q) && Regex("""\b[abc]\s*=\s*[\d.]+""").containsMatchIn(q)) {
            val ang = mutableMapOf<String, Double>()
            val side = mutableMapOf<String, Double>()
            val deg = PI / 180
            val letters = listOf("a", "b", "c")
            val rest = Regex("""\bangle\s*([abc])\s*=\s*([\d.]+)\s*(?:°|degrees?|deg)?""").replace(q) { ang[it.groupValues[1]] = it.groupValues[2].toDouble(); " " }
            for (mr in Regex("""\b([abc])\s*=\s*([\d.]+)""").findAll(rest)) side[mr.groupValues[1]] = mr.groupValues[2].toDouble()
            val want = find("""\b(?:find|what is)\s+(?:side\s+)?([abc])$""", rest.trim())?.get(1)
            val wantAng = find("""\bangle\s*([abc])\b(?!\s*=)""", q)?.get(1)
            if (ang.size == 2) ang[letters.first { it !in ang }] = 180 - ang.values.sum()
            val pair = letters.firstOrNull { it in side && it in ang }
            if (want != null && want !in side && want in ang) {
                val (p, t) = letters.filter { it != want }
                val sp = side[p]
                val st = side[t]
                if (sp != null && st != null) return out("$want ≈ " + pcNum(fixed(sqrt(sp * sp + st * st - 2 * sp * st * cos(ang.getValue(want) * deg)), 3)))
                if (pair != null) return out("$want ≈ " + pcNum(fixed(side.getValue(pair) * sin(ang.getValue(want) * deg) / sin(ang.getValue(pair) * deg), 3)))
            }
            if (wantAng != null) {
                val a = wantAng.uppercase()
                ang[wantAng]?.let { return out("$a = ${pcNum(it)}°") }
                if (letters.all { it in side }) {
                    val (p, t) = letters.filter { it != wantAng }.map { side.getValue(it) }
                    val w = side.getValue(wantAng)
                    val c = (p * p + t * t - w * w) / (2 * p * t)
                    return out(if (abs(c) > 1) "No triangle has those sides." else "$a ≈ " + pcNum(fixed(acos(c) / deg, 2)) + "°")
                }
                val w = side[wantAng]
                if (pair != null && w != null) {
                    val s = w * sin(ang.getValue(pair) * deg) / side.getValue(pair)
                    if (s > 1) return out("No triangle: that side is too short to reach.")
                    val a1 = asin(s) / deg
                    val a2 = 180 - a1
                    return out("$a ≈ " + pcNum(fixed(a1, 2)) + "°" + if (a2 + ang.getValue(pair) < 180 && abs(a2 - a1) > 1e-9) " (or " + pcNum(fixed(a2, 2)) + "°, the ambiguous case)" else "")
                }
            }
        }
        // the angle in a quadrant with a given sine, cosine or tangent
        m = find("""\b(sin|cos|tan)\s*\(?\s*(?:theta|θ|x|a|t)\s*\)?\s*=\s*(-?√\d\s*/\s*\d|-?[\d./]+)\b.*?\bquadrant\s+(iv|i{1,3}|[1-4])\b""", q)
        if (m != null) {
            val v = pcVal(m[2].replaceFirst(Regex("""√(\d)"""), "sqrt($1)")) ?: return null
            val ref = when (m[1]) { "sin" -> asin(abs(v)); "cos" -> acos(abs(v)); else -> atan(abs(v)) } * 180 / PI
            val n = when (m[3]) { "i" -> 1; "ii" -> 2; "iii" -> 3; "iv" -> 4; else -> m[3].toInt() }
            if (!ref.isFinite()) return out("No angle: sine and cosine stay between -1 and 1.")
            return out(pcNum(fixed(listOf(ref, 180 - ref, 180 + ref, 360 - ref)[n - 1], 2)) + "°")
        }
        // simple interest, I = Prt
        m = find("""simple interest\b.*?\$?\s*([\d,]+(?:\.\d+)?)\D*?([\d.]+)\s*%.*?([\d.]+)\s*(years?|months?)""", q)
        if (m != null) {
            val p = m[1].replace(",", "").toDouble()
            val i = p * m[2].toDouble() / 100 * m[3].toDouble() / (if (m[4].startsWith("m")) 12 else 1)
            return out("$" + money(i) + " in interest, for $" + money(p + i) + " in all (I = Prt).")
        }
        return null
    }
}
