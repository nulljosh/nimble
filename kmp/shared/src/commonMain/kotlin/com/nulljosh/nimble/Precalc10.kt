package com.nulljosh.nimble

import com.nulljosh.nimble.Precalc.fixed
import com.nulljosh.nimble.Precalc.isInt
import com.nulljosh.nimble.Precalc.jsRound
import com.nulljosh.nimble.Precalc.money
import com.nulljosh.nimble.Precalc.pcAt
import com.nulljosh.nimble.Precalc.pcCoeffs
import com.nulljosh.nimble.Precalc.pcFrac
import com.nulljosh.nimble.Precalc.pcNum
import com.nulljosh.nimble.Precalc.pcPoly
import com.nulljosh.nimble.Precalc.pcVal
import com.nulljosh.nimble.Precalc.prec
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.asin
import kotlin.math.atan
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.log2
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.sign
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * BC Foundations of Mathematics and Pre-Calculus 10 with no network: primes, factors and multiples, exponent laws,
 * expanding and common factors, area and volume, right-triangle trigonometry, lines, and pay. A port of `fm10()` in
 * docs/engine.js, branch for branch. Precalc.answer asks it after Precalc11; null means "not mine".
 */
internal object Precalc10 {

    private fun sup(n: Long) = n.toString().map { "⁻⁰¹²³⁴⁵⁶⁷⁸⁹"["-0123456789".indexOf(it)] }.joinToString("")
    private fun pow(v: String, n: Long) = if (n == 0L) "" else v + if (n == 1L) "" else sup(n)
    private tailrec fun gcd(a: Long, b: Long): Long = if (b == 0L) abs(a) else gcd(b, a % b)

    /** ax + by = c, read by evaluating both sides at three points and checked at a fourth; null when not a line. */
    fun line(e: String): List<Double>? {
        val sides = e.split("=")
        if (sides.size != 2) return null
        fun f(x: Double, y: Int) = pcAt("(${sides[0]})-(${sides[1]})".replace("y", "($y)"), x)
        val c = f(0.0, 0) ?: return null
        val a = f(1.0, 0) ?: return null
        val b = f(0.0, 1) ?: return null
        val t = f(1.0, 1) ?: return null
        return if (abs(t - (a + b - c)) > 1e-9) null else listOf(a - c, b - c, -c)
    }

    private fun lineOf(s: String) = line(if ('=' in s) s else "y = $s")

    private fun out(body: String) = Answer.Text(heading = null, body = body, source = "Nimble math")
    private fun find(pattern: String, s: String): List<String>? = Regex(pattern).find(s)?.groupValues
    private fun has(pattern: String, s: String) = Regex(pattern).containsMatchIn(s)
    private fun dollars(v: Double) = "$" + money(v)

    fun answer(q: String): Answer? {
        var m: List<String>?
        // primes, factors and multiples
        m = find("""^(?:the )?prime factori[sz]ation of (\d+)$""", q)
        if (m != null && m[1].length < 13 && m[1].toLong() > 1) {
            var n = m[1].toLong()
            val parts = mutableListOf<String>()
            var p = 2L
            while (p * p <= n) { var k = 0L; while (n % p == 0L) { n /= p; k++ }; if (k > 0) parts += pow("$p", k); p++ }
            if (n > 1) parts += "$n"
            return out(parts.joinToString(" × ") + if (parts.size == 1 && !has("[⁰-⁹]", parts[0])) ", a prime" else "")
        }
        m = find("""^(?:the )?(greatest common (?:factor|divisor)|gcf|gcd|highest common factor|hcf|least common multiple|lcm|lowest common multiple) of ([\d,\s]+(?:and\s+\d+)?)$""", q)
        if (m != null) {
            val n = Regex("""\d+""").findAll(m[2]).map { it.value.toLong() }.toList()
            if (n.size < 2) return null
            return out((if (m[1][0] == 'g' || m[1][0] == 'h') n.reduce(::gcd) else n.reduce { a, b -> a / gcd(a, b) * b }).toString())
        }
        m = find("""^is (\d+) a perfect (square|cube)$""", q)
        if (m != null) {
            val n = m[1].toDouble()
            val k = if (m[2] == "square") 2L else 3L
            val r = jsRound(n.pow(1.0 / k))
            val mark = if (k == 2L) "√" else "∛"
            return out(if (r.pow(k.toInt()) == n) "Yes. ${r.toLong()}${sup(k)} = ${m[1]}." else "No. $mark${m[1]} ≈ ${pcNum(n.pow(1.0 / k))}, not a whole number.")
        }
        m = find("""^(?:write|express|rewrite)\s+(\d+)\s*\^\s*\(?\s*-\s*(\d+)\s*\)?\s+(?:as a fraction|with a positive exponent)$""", q)
        if (m != null) return out("1/" + Precalc.js(m[1].toDouble().pow(m[2].toDouble())))
        // exponent laws on one variable: x^3 * x^5, (2x^3)^2, x^7 / x^3
        m = find("""^simplify\s+([\d\s()^*/·×.a-z-]+)$""", q)
        if (m != null) {
            val letters = Regex("[a-z]").findAll(m[1]).map { it.value }.toList()
            if (letters.isNotEmpty() && letters.all { it == letters[0] } && !has("""[+]|\s-\s""", m[1])) {
                val v = letters[0]
                val e = m[1].replace(Regex("[·×]"), "*").replace(v, "x").replace(Regex("""(?<=[\dx)])\s*(?=x)"""), "*")
                val c = pcAt(e, 1.0)
                val t = pcAt(e, 2.0)
                val u = pcAt(e, 3.0)
                if (c == null || t == null || u == null || c == 0.0) return null
                val n = jsRound(log2(t / c)).toLong()
                if (abs(c * 3.0.pow(n.toInt()) - u) > 1e-9 * max(1.0, abs(u))) return null
                val k = if (c == 1.0) "" else if (c == -1.0) "-" else pcFrac(c)
                return out(if (n == 0L) pcFrac(c) else if (n > 0) k + pow(v, n) else (if (c < 0) "-" else "") + pcFrac(abs(c)) + "/" + pow(v, -n))
            }
        }
        // expand (x + 3)(x - 5), (2x - 1)^2
        m = find("""^(?:expand|multiply|simplify)\s+(.*\(.*x.*)$""", q)
        if (m != null && '/' !in m[1]) pcCoeffs(m[1].replace(Regex("""\)\s*\("""), ")*("))?.let { co -> return out(pcPoly(co.map { fixed(it, 9) })) }
        // factor out the common factor first: 6x^2 + 9x is 3x(2x + 3), 2x^2 - 50 is 2(x - 5)(x + 5)
        m = find("""^factor\s+(?:completely\s+)?(?:y\s*=\s*)?(.+)$""", q)
        if (m != null && 'x' in m[1]) {
            val co = pcCoeffs(m[1])
            if (co != null && co.size > 1 && co.all { isInt(it) }) {
                var p = 0
                while (p < co.size - 1 && co[co.size - 1 - p] == 0.0) p++
                val rest = co.subList(0, co.size - p).map { it.toLong() }
                val g = rest.reduce(::gcd) * sign(rest[0].toDouble()).toLong()
                if (abs(g) > 1 || p > 0) {
                    val r = rest.map { (it / g).toDouble() }
                    val lead = (if (g == 1L) "" else if (g == -1L) "-" else "$g") + pow("x", p.toLong())
                    if (r.size == 1) return out(lead.ifEmpty { "1" })
                    val inner = if (r.size == 3) (Precalc.answer("factor " + pcPoly(r)) as? Answer.Text)?.body else null
                    return out(lead + if (inner != null && inner.startsWith("(")) inner else "(" + pcPoly(r) + ")")
                }
            }
        }
        // area and volume
        val shape = find("""\b(hemisphere|sphere|cylinder|cone|cube|rectangular prism|square pyramid|square-based pyramid|box)\b""", q)?.get(1)
        val what = find("""\b(surface area|volume)\b""", q)?.get(1)
        if (shape != null && what != null) {
            fun num(p: String) = find(p, q)?.get(1)?.toDouble()
            val d = num("""diameter (?:of |is |=\s*)?([\d.]+)""")
            val r = num("""radius (?:of |is |=\s*)?([\d.]+)""") ?: d?.let { it / 2 }
            val h = num("""height (?:of |is |=\s*)?([\d.]+)""")
            val s = num("""(?:side|edge)(?: length)? (?:of |is |=\s*)?([\d.]+)""") ?: num("""base (?:side )?(?:of |is |=\s*)?([\d.]+)""")
            val box = find("""([\d.]+)\s*(?:by|x|×)\s*([\d.]+)\s*(?:by|x|×)\s*([\d.]+)""", q)
            val vol = what == "volume"
            fun piAns(k: Double) = out((if (isInt(fixed(k, 9)) || "/" in pcFrac(k)) pcFrac(fixed(k, 9)) + "π ≈ " else "") + pcNum(fixed(k * PI, 2)))
            if (shape == "sphere" && r != null) return piAns(if (vol) 4.0 / 3 * r.pow(3) else 4 * r * r)
            if (shape == "hemisphere" && r != null) return piAns(if (vol) 2.0 / 3 * r.pow(3) else 3 * r * r)
            if (shape == "cylinder" && r != null && h != null) return piAns(if (vol) r * r * h else 2 * r * r + 2 * r * h)
            if (shape == "cone" && r != null && h != null) return if (vol) piAns(r * r * h / 3) else out(pcNum(fixed(PI * r * r + PI * r * hypot(r, h), 2)))
            if (shape == "cube" && s != null) return out(pcNum(if (vol) s.pow(3) else 6 * s * s))
            if ("pyramid" in shape && s != null && h != null) return out(pcNum(fixed(if (vol) s * s * h / 3 else s * s + 2 * s * hypot(h, s / 2), 2)))
            if (("prism" in shape || shape == "box") && box != null) {
                val (l, w, t) = box.drop(1).map { it.toDouble() }
                return out(pcNum(if (vol) l * w * t else 2 * (l * w + l * t + w * t)))
            }
        }
        // right triangles: SOH CAH TOA, Pythagoras, ladders, elevation and depression
        if (has("^soh ?cah ?toa$", q)) return out("sin = opposite/hypotenuse, cos = adjacent/hypotenuse, tan = opposite/adjacent.")
        m = find("""^what (?:does|is) (sine|cosine|tangent)(?: mean)?(?: in a right triangle)?$""", q)
        if (m != null) return out(when (m[1]) { "sine" -> "sin θ = opposite/hypotenuse."; "cosine" -> "cos θ = adjacent/hypotenuse."; else -> "tan θ = opposite/adjacent." })
        m = find("""\bhypotenuse\b.*?\blegs? (?:of )?([\d.]+)\s*(?:and|,)\s*([\d.]+)""", q)
        if (m != null) return out(pcNum(fixed(hypot(m[1].toDouble(), m[2].toDouble()), 4)))
        m = find("""\b(?:missing |other |third )?(?:leg|side)\b.*?\bhypotenuse (?:of |is )?([\d.]+)\s*(?:and|,)\s*(?:a |one )?(?:leg|side) (?:of |is )?([\d.]+)""", q)
        if (m != null && m[1].toDouble() > m[2].toDouble()) return out(pcNum(fixed(sqrt(m[1].toDouble().pow(2) - m[2].toDouble().pow(2)), 4)))
        if (has("""\bright triangle\b""", q) && has("""\bangle\b""", q)) {
            fun side(k: String) = find("""\b$k(?: side)? (?:is |of |=\s*)?([\d.]+)""", q)?.get(1)?.toDouble()
            val o = side("opposite")
            val a = side("adjacent")
            val h = side("hypotenuse")
            val t = if (o != null && h != null) asin(o / h) else if (a != null && h != null) acos(a / h) else if (o != null && a != null) atan(o / a) else Double.NaN
            if (t.isFinite()) return out(pcNum(fixed(t * 180 / PI, 2)) + "°")
        }
        m = find("""\bladder\s+([\d.]+)\s*[a-z]*\s*long\b.*?([\d.]+)\s*(?:degrees?|°)(?: angle)? with the (ground|floor|wall)""", q)
        if (m != null) {
            val len = m[1].toDouble()
            val t = m[2].toDouble() * PI / 180
            val high = has("""\bhigh|height|up the wall\b""", q)
            val up = if (m[3] == "wall") cos(t) else sin(t)
            val across = if (m[3] == "wall") sin(t) else cos(t)
            return out(pcNum(fixed(len * if (high) up else across, 2)) + " " + if (has("""\b(\d+(?:\.\d+)?)\s*m\b""", q)) "m" else "units")
        }
        if (has("""\bangle of (elevation|depression)\b""", q) || has("""\b(rises|climbs)\b.*\bhorizontal\b""", q)) {
            val n = Regex("""\d+(?:\.\d+)?""").findAll(q).map { it.value.toDouble() }.toList()
            if (n.size == 2) return out(pcNum(fixed(atan(n[0] / n[1]) * 180 / PI, 2)) + "°")
        }
        // lines: slope, equation, intercepts, parallel and perpendicular, midpoint, distance
        val pts = Regex("""\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)""").findAll(q).map { it.groupValues[1].toDouble() to it.groupValues[2].toDouble() }.toList()
        if (pts.size == 2 && has("""^(?:the )?midpoint\b""", q)) return out("(" + pcFrac((pts[0].first + pts[1].first) / 2) + ", " + pcFrac((pts[0].second + pts[1].second) / 2) + ")")
        if (pts.size == 2 && has("""^(?:the )?(?:distance|length)\b""", q)) {
            val dx = pts[1].first - pts[0].first
            val dy = pts[1].second - pts[0].second
            val d = hypot(dx, dy)
            return out(if (isInt(fixed(d, 9))) pcNum(d) else "√" + pcFrac(dx * dx + dy * dy) + " ≈ " + pcNum(fixed(d, 4)))
        }
        fun yForm(k: Double, b: Double) = "y = " + if (k == 0.0) pcFrac(b) else (if (k == 1.0) "" else if (k == -1.0) "-" else pcFrac(k)) + "x" + (if (b == 0.0) "" else if (b > 0) " + " + pcFrac(b) else " - " + pcFrac(-b))
        if (pts.size == 2 && has("""\bslope\b""", q) && !has("""\bequation\b""", q)) {
            val dx = pts[1].first - pts[0].first
            return out(if (dx == 0.0) "Undefined: the line is vertical." else pcFrac((pts[1].second - pts[0].second) / dx))
        }
        if (has("""\bequation of (?:the |a )?line\b""", q) && pts.isNotEmpty()) {
            val s = find("""\bslope (?:of |is |=\s*)?(-?[\d./]+)""", q)?.get(1)
            val k = if (s != null) pcVal(s) else if (pts.size == 2 && pts[1].first != pts[0].first) (pts[1].second - pts[0].second) / (pts[1].first - pts[0].first) else null
            if (k == null) return if (pts.size == 2) out("x = " + pcFrac(pts[0].first)) else null
            return out(yForm(prec(k, 12), prec(pts[0].second - k * pts[0].first, 12)))
        }
        m = find("""^(?:the )?slope of (?:a |the )?line (perpendicular|parallel) to (.+)$""", q)
        if (m != null) {
            val l = lineOf(m[2]) ?: return null
            if (l[1] == 0.0) return null
            val k = -l[0] / l[1]
            return out(if (m[1] == "parallel") pcFrac(k) else if (k == 0.0) "Undefined: the line is vertical." else pcFrac(-1 / k))
        }
        m = find("""^(?:the )?(slope|y-?intercept|x-?intercept) of (.+)$""", q)
        if (m != null && 'y' in m[2] && '=' in m[2]) {
            val (a, b, c) = line(m[2]) ?: return null
            if (m[1].startsWith("slope")) return out(if (b == 0.0) "Undefined: the line is vertical." else pcFrac(-a / b))
            if (m[1].startsWith("y")) return out(if (b == 0.0) "None: the line is vertical." else "(0, " + pcFrac(c / b) + ")")
            return out(if (a == 0.0) "None: the line is horizontal." else "(" + pcFrac(c / a) + ", 0)")
        }
        m = find("""^(?:the )?(domain|range) of (?:y\s*=\s*|f\(x\)\s*=\s*)(.+)$""", q)
        if (m != null) {
            val co = pcCoeffs(m[2]) ?: return null
            if (m[1] == "domain" || co.size % 2 == 0) return out("All real numbers.")
            if (co.size == 3) {
                val (a, b, c) = co
                return out("y " + (if (a > 0) "≥ " else "≤ ") + pcFrac(prec(c - b * b / (4 * a), 12)))
            }
            return if (co.size == 1) out("y = " + pcFrac(co[0])) else null
        }
        // pay: hourly with overtime, net, commission
        m = find("""\b(?:pay|earn|earnings|wages?)\b.*?([\d.]+)\s*hours?\s*(?:at|of)\s*\$?\s*([\d.]+)""", q)
            ?: find("""\b(time and a half|double time)\b.*?([\d.]+)\s*hours?\s*(?:at|of)\s*\$?\s*([\d.]+)""", q)?.let { listOf(it[0], it[2], it[3]) }
        if (m != null) {
            val k = if ("time and a half" in q) 1.5 else if ("double time" in q) 2.0 else 1.0
            return out(dollars(m[1].toDouble() * m[2].toDouble() * k))
        }
        m = find("""\bnet pay\b.*?gross(?: pay)? (?:is |of |=\s*)?\$?\s*([\d,.]+)\b.*?deductions? (?:are |is |of |total |=\s*)?\$?\s*([\d,.]+)""", q)
        if (m != null) return out(dollars(m[1].replace(",", "").toDouble() - m[2].replace(",", "").toDouble()))
        m = find("""\bcommission\b.*?([\d.]+)\s*%.*?\$\s*([\d,.]+)""", q)
        if (m != null) return out(dollars(m[1].toDouble() / 100 * m[2].replace(",", "").toDouble()))
        return null
    }
}
