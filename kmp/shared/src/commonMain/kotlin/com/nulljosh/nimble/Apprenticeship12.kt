package com.nulljosh.nimble

import com.nulljosh.nimble.Precalc.fixed
import com.nulljosh.nimble.Precalc.jsRound
import com.nulljosh.nimble.Precalc.money
import com.nulljosh.nimble.Precalc.pcFrac
import com.nulljosh.nimble.Precalc.pcNum
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.pow

/**
 * BC Apprenticeship and Workplace Mathematics 12 with no network: mixed numbers and inch fractions, tolerance and
 * precision, board feet and concrete, squaring a corner, gears, Ohm's law, rates of change and linear cost models,
 * composite areas, budgets, studs, roof pitch, paint, and marbles. A port of `aw12()` in docs/engine.js.
 * Precalc.answer asks it after Statistics12.
 */
internal object Apprenticeship12 {

    private val polygon = mapOf("triangle" to 3, "quadrilateral" to 4, "pentagon" to 5, "hexagon" to 6, "heptagon" to 7, "octagon" to 8, "nonagon" to 9, "decagon" to 10, "dodecagon" to 12)
    private const val F = """(-?\d+\s+\d+/\d+|-?\d+/\d+|-?\d+)"""

    private tailrec fun gcd(a: Long, b: Long): Long = if (b == 0L) abs(a) else gcd(b, a % b)

    /** A number as numerator and denominator: "2 1/4" is 9/4, "5/16" is 5/16, "3" is 3/1. */
    private fun frac(s: String): Pair<Long, Long>? {
        val t = s.trim()
        Regex("""^(-?)(\d+)\s+(\d+)/(\d+)$""").find(t)?.groupValues?.let { return (if (it[1].isNotEmpty()) -1 else 1) * (it[2].toLong() * it[4].toLong() + it[3].toLong()) to it[4].toLong() }
        Regex("""^(-?\d+)/(\d+)$""").find(t)?.groupValues?.let { return it[1].toLong() to it[2].toLong() }
        return if (Regex("""^-?\d+$""").matches(t)) t.toLong() to 1L else null
    }

    /** A fraction as "3 7/8", or "7/8", or "3". */
    private fun mixed(f: Pair<Long, Long>): String {
        val g = gcd(f.first, f.second).takeIf { it != 0L } ?: 1L
        var n = f.first / g
        var d = f.second / g
        if (d < 0) { n = -n; d = -d }
        if (d == 1L) return "$n"
        val w = n / d
        val r = abs(n % d)
        return if (w == 0L) "$n/$d" else "$w $r/$d"
    }

    private fun ratio(n: Long, d: Long): String {
        val g = gcd(n, d).takeIf { it != 0L } ?: 1L
        val a = n / g
        val b = d / g
        return if (b == 1L) "$a" else "$a/$b" + if (b > 12) " ≈ " + pcNum(fixed(a.toDouble() / b, 4)) else ""
    }

    private fun out(body: String) = Answer.Text(heading = null, body = body, source = "Nimble math")
    private fun find(pattern: String, s: String): List<String>? = Regex(pattern).find(s)?.groupValues
    private fun has(pattern: String, s: String) = Regex(pattern).containsMatchIn(s)
    private fun dollars(v: Double) = "$" + money(v)
    private fun num(s: String) = s.replace(",", "").toDouble()

    fun answer(q: String): Answer? {
        var m: List<String>?
        // mixed numbers: 2 1/4 + 1 5/8
        m = find("""^(?:what is |evaluate |simplify |add |subtract )?$F\s*([+\-×*÷]|plus|minus|times|divided by)\s*$F$""", q)
        if (m != null && has(""" \d+/\d+|\d/\d""", q) && !has("""^-?\d+/\d+\s*[+\-*×÷]\s*-?\d+/\d+$""", q.replaceFirst(Regex("^(?:what is |evaluate |simplify )"), ""))) {
            val a = frac(m[1]) ?: return null
            val b = frac(m[3]) ?: return null
            val op = m[2]
            val r = when {
                op == "+" || op == "plus" -> a.first * b.second + b.first * a.second to a.second * b.second
                op == "-" || op == "minus" -> a.first * b.second - b.first * a.second to a.second * b.second
                op == "*" || op == "×" || op == "times" -> a.first * b.first to a.second * b.second
                else -> a.first * b.second to a.second * b.first
            }
            val g = gcd(r.first, r.second).takeIf { it != 0L } ?: 1L
            val n = r.first / g
            val d = r.second / g
            return out(mixed(r) + (if (abs(n) > abs(d) && d != 1L) " ($n/$d)" else "") + if (d != 1L) " = " + pcNum(n.toDouble() / d) else "")
        }
        m = find("""^(?:convert |write )?(\d*\.?\d+)\s*(?:inches|inch|in|")?\s+(?:to|as) a fraction(?: of an inch)?$""", q)
        if (m != null) {
            val v = m[1].toDouble()
            for (d in listOf(2L, 4L, 8L, 16L, 32L, 64L)) { val k = jsRound(v * d).toLong(); if (abs(k.toDouble() / d - v) < 1e-9) return out(mixed(k to d)) }
            return out(pcFrac(v))
        }
        m = find("""^(?:convert )?$F\s*(?:inches|inch|in|")\s+(?:to|in|into)\s+(mm|millimetres?|millimeters?|cm|centimetres?|centimeters?)$""", q)
        if (m != null) {
            val f = frac(m[1]) ?: return null
            val mm = f.first.toDouble() / f.second * 25.4
            return out(if (m[2].startsWith("c")) pcNum(fixed(mm / 10, 4)) + " cm" else pcNum(fixed(mm, 4)) + " mm")
        }
        // tolerance and precision
        m = find("""\btolerance\b.*?([\d.]+)\s*([a-z"]*)\s*(?:±|\+/-|plus or minus)\s*([\d.]+)""", q)
        if (m != null) {
            val v = m[1].toDouble()
            val t = m[3].toDouble()
            val u = if (m[2].isNotEmpty()) " " + m[2] else ""
            return out(pcNum(fixed(v - t, 6)) + u + " to " + pcNum(fixed(v + t, 6)) + u)
        }
        m = find("""\bprecision of (?:a |the )?(?:measurement|reading|value) (?:of )?([\d.]+)\s*([a-z]*)""", q)
        if (m != null) {
            val d = m[1].substringAfter(".", "").length
            return out("±" + (if (d > 0) "0." + "0".repeat(d - 1) + "1" else "1") + (if (m[2].isNotEmpty()) " " + m[2] else "") + ": the smallest unit it was measured to.")
        }
        if (has("""^(?:what is )?(?:the difference between )?accuracy (?:vs\.?|versus|and) precision$|^(?:what is )?accuracy in measurement$|^(?:what is )?accuracy$""", q))
            return out("Accuracy is how close a measurement is to the true value. Precision is how fine the measurement is, and how closely repeated measurements agree.")
        // lumber, concrete, corners, studs, roofs, paint
        m = find("""\bboard feet\b.*?([\d.]+)\s*(?:inches|inch|in|")?\s*(?:by|x|×)\s*([\d.]+)\s*(?:inches|inch|in|")?\s*(?:by|x|×)\s*([\d.]+)\s*(?:feet|foot|ft|')""", q)
        if (m != null) return out(pcNum(fixed(m[1].toDouble() * m[2].toDouble() * m[3].toDouble() / 12, 3)) + " board feet")
        m = find("""\bcubic yards\b.*?([\d.]+)\s*(?:ft|feet|')\s*(?:by|x|×)\s*([\d.]+)\s*(?:ft|feet|')\s*(?:by|x|×)\s*([\d.]+)\s*(inches|inch|in|"|ft|feet)""", q)
        if (m != null) {
            val depth = if (m[4].startsWith("in") || m[4] == "\"") m[3].toDouble() / 12 else m[3].toDouble()
            return out(pcNum(fixed(m[1].toDouble() * m[2].toDouble() * depth / 27, 2)) + " cubic yards")
        }
        m = find("""\bsquare\b.*?\bsides? (?:of )?([\d.]+)\s*[a-z']*\s*and\s*([\d.]+)\s*[a-z']*\s*and (?:a )?diagonal (?:of )?([\d.]+)""", q)
        if (m != null) {
            val a = m[1].toDouble()
            val b = m[2].toDouble()
            val c = m[3].toDouble()
            val want = hypot(a, b)
            return out(if (abs(want - c) < 0.005 * want) "Yes: ${pcNum(a)}² + ${pcNum(b)}² = ${pcNum(c)}²." else "No: the diagonal should be ${pcNum(fixed(want, 3))}, not ${pcNum(c)}.")
        }
        m = find("""^(?:the )?diagonal of (?:a |the )?([\d.]+)\s*[a-z']*\s*(?:by|x|×)\s*([\d.]+)""", q)
        if (m != null) return out(pcNum(fixed(hypot(m[1].toDouble(), m[2].toDouble()), 3)))
        m = find("""\bstuds?\b.*?\b([\d.]+)\s*(?:ft|feet|foot|')\s*wall\b.*?\b([\d.]+)\s*(?:inch|in|")\s*(?:spacing|on cent(?:er|re)|apart|o\.?c\.?)""", q)
        if (m != null) return out((floor(m[1].toDouble() * 12 / m[2].toDouble() + 1e-9).toLong() + 1).toString() + " studs")
        m = find("""\b([\d.]+)\s*(?:in|:)\s*12 pitch\b""", q)
        if (m != null && has("""\bangle\b""", q)) return out(pcNum(fixed(atan(m[1].toDouble() / 12) * 180 / PI, 2)) + "°")
        m = find("""\bhow many (litres|liters|gallons|cans)\b.*?\bfor ([\d.]+) square [a-z]+\b.*?\bcovers? ([\d.]+) square""", q)
        if (m != null) {
            val k = m[2].toDouble() / m[3].toDouble()
            return out(ceil(fixed(k, 6)).toLong().toString() + " " + m[1] + if (fixed(k, 6) == floor(fixed(k, 6))) "" else " (" + pcNum(fixed(k, 2)) + ", rounded up)")
        }
        // gears and Ohm's law
        m = find("""\bgear ratio\b.*?\bdriv(?:er|ing gear) has (\d+) teeth\b.*?\bdriven gear has (\d+) teeth""", q)
        if (m != null) {
            val a = m[1].toLong()
            val b = m[2].toLong()
            val g = gcd(a, b)
            return out("${b / g}:${a / g} (the driver turns ${pcNum(b.toDouble() / a)} times for each turn of the driven gear)")
        }
        m = find("""\b(\d+)[- ]tooth gear turns at ([\d.]+)\s*rpm\b.*?\b(\d+)[- ]tooth gear\b""", q)
        if (m != null) return out(pcNum(fixed(m[2].toDouble() * m[1].toDouble() / m[3].toDouble(), 3)) + " rpm")
        if (has("""\b(ohm|ohms|Ω|volts?|amps?|current|resistance|voltage)\b""", q) && (has("""\bohm'?s law\b""", q) || has("""\b(voltage|current|resistance)\b.*\b(if|with|when)\b""", q))) {
            fun v(p: String) = find(p, q)?.get(1)?.toDouble()
            val volts = v("""\b(?:voltage (?:is |of )?)?([\d.]+)\s*(?:v|volts?)\b""")
            val amps = v("""\b(?:current (?:is |of )?)?([\d.]+)\s*(?:a|amps?|amperes?)\b""")
            val ohms = v("""\b(?:resistance (?:is |of )?)?([\d.]+)\s*(?:ohms?|Ω)""")
            val ask = find("""^(?:ohm'?s law )?(?:the )?(voltage|current|resistance)\b""", q)?.get(1) ?: if (volts == null) "voltage" else if (amps == null) "current" else "resistance"
            if (ask == "voltage" && amps != null && ohms != null) return out(pcNum(fixed(amps * ohms, 4)) + " V (V = IR)")
            if (ask == "current" && volts != null && ohms != null) return out(pcNum(fixed(volts / ohms, 4)) + " A (I = V/R)")
            if (ask == "resistance" && volts != null && amps != null) return out(pcNum(fixed(volts / amps, 4)) + " Ω (R = V/I)")
        }
        // rates of change and linear cost models
        if (has("""\brate of change\b""", q)) {
            val pts = Regex("""\$?([\d.]+)\s*([a-z]*)\s+at\s+([\d.]+)\s*([a-z]+)""").findAll(q).map { it.groupValues }.toList()
            if (pts.size == 2) {
                val (a, b) = pts
                val r = (b[1].toDouble() - a[1].toDouble()) / (b[3].toDouble() - a[3].toDouble())
                val unit = if ('$' in q) "$" else ""
                return out((if (r < 0) "-" else "") + unit + pcNum(fixed(abs(r), 4)) + (if (a[2].isNotEmpty() && unit.isEmpty()) " " + (if (a[2] == "l") "L" else a[2]) else "") + " per " + b[4].removeSuffix("s"))
            }
        }
        m = find("""\bcharges? \$\s*([\d.]+)\s*(?:plus|and|\+)\s*\$\s*([\d.]+) (?:per|an|a|each) ([a-z]+)\b.*?\bfor ([\d.]+) ([a-z]+)""", q)
        if (m != null) return out(dollars(m[1].toDouble() + m[2].toDouble() * m[4].toDouble()))
        m = find("""\bequation\b.*?\$\s*([\d.]+)\b[^$]*?\bplus \$\s*([\d.]+) (?:per|an|a|each) ([a-z]+)""", q)
        if (m != null) {
            val v = mapOf("hour" to "h", "hr" to "h", "km" to "d", "kilometre" to "d", "kilometer" to "d", "mile" to "d", "day" to "t", "item" to "n", "person" to "n")[m[3]] ?: m[3].take(1)
            return out("C = ${pcNum(m[2].toDouble())}$v + ${pcNum(m[1].toDouble())}, where $v is the number of ${m[3]}s")
        }
        // composite areas and semicircles
        m = find("""\bsemicircle\b.*?\b(radius|diameter) (?:of |is )?([\d.]+)""", q)
        if (m != null && has("""\barea\b""", q)) {
            val r = if (m[1] == "radius") m[2].toDouble() else m[2].toDouble() / 2
            val half = PI * r * r / 2
            val rect = if (has("""\brectangle\b""", q)) find("""([\d.]+)\s*[a-z]*\s*(?:by|x|×)\s*([\d.]+)""", q) else null
            if (rect != null) {
                val base = rect[1].toDouble() * rect[2].toDouble()
                return out(pcNum(fixed(if (has("""\b(minus|remove|cut out|without)\b""", q)) base - half else base + half, 2)))
            }
            return out(pcNum(r * r / 2) + "π ≈ " + pcNum(fixed(half, 2)))
        }
        // budgets
        val income = Regex("""\bincome (?:of |is )?\$\s*([\d,.]+)""").find(q)
        if (income != null && has("""\b(left|remaining|remains|leftover|left over)\b""", q)) {
            val spent = Regex("""\$\s*([\d,.]+)""").findAll(q.substring(income.range.last + 1)).sumOf { num(it.groupValues[1]) }
            return out(dollars(num(income.groupValues[1]) - spent) + " left")
        }
        m = find("""^what percent(?:age)? of (?:a |the )?\$\s*([\d,.]+)\s*[a-z ]*? is \$\s*([\d,.]+)""", q)
        if (m != null) return out(pcNum(fixed(num(m[2]) / num(m[1]) * 100, 2)) + "%")
        m = find("""\bscale\b.*?\b1\s*(inch|in|cm|mm)\s*=\s*([\d.]+)\s*(feet|ft|m|metres?|meters?|km|yards?)\b.*?\b([\d.]+)\s*(?:inch|in|cm|mm)\b""", q)
        if (m != null) return out(pcNum(fixed(m[4].toDouble() * m[2].toDouble(), 4)) + " " + m[3])
        // marbles, polygons, right triangles, unit prices with "of"
        m = find("""\b(probability|odds(?: in favou?r)?|odds against|chance) (?:of )?(?:drawing|picking|choosing|pulling) (?:a |an )?([a-z]+) (?:marble|ball|candy|card|chip|token|sock)s? (?:from|out of) (.+)$""", q)
        if (m != null) {
            val groups = Regex("""(\d+) ([a-z]+)""").findAll(m[3]).map { it.groupValues[2] to it.groupValues[1].toLong() }.toList()
            val total = groups.sumOf { it.second }
            val hit = groups.firstOrNull { it.first == m[2] }?.second ?: return null
            val g = gcd(hit, total - hit).takeIf { it != 0L } ?: 1L
            if (m[1].startsWith("odds against")) return out("${(total - hit) / g}:${hit / g}")
            if (m[1].startsWith("odds")) return out("${hit / g}:${(total - hit) / g}")
            return out(ratio(hit, total) + " = " + pcNum(fixed(hit.toDouble() / total, 4)))
        }
        m = find("""\bsum of (?:the )?(?:interior )?angles (?:in|of) (?:a |an )?(triangle|quadrilateral|pentagon|hexagon|heptagon|octagon|nonagon|decagon|dodecagon)\b""", q)
        if (m != null) return out(pcNum((polygon.getValue(m[1]) - 2) * 180.0) + "°")
        m = find("""^is (?:a )?triangle with sides ([\d.]+),\s*([\d.]+),?\s*and\s*([\d.]+) a right triangle$""", q)
        if (m != null) {
            val s = listOf(m[1].toDouble(), m[2].toDouble(), m[3].toDouble()).sorted()
            val ok = abs(s[0].pow(2) + s[1].pow(2) - s[2].pow(2)) < 1e-9
            return out((if (ok) "Yes: " else "No: ") + "${pcNum(s[0])}² + ${pcNum(s[1])}² = ${pcNum(s[0].pow(2) + s[1].pow(2))}" + (if (ok) " = " else ", not ") + "${pcNum(s[2])}² = ${pcNum(s[2].pow(2))}.")
        }
        m = find("""\bunit (?:price|cost) (?:of|for) ([\d.]+)\s*([a-z]+) of [a-z ]+? (?:for|at|costing) \$\s*([\d,.]+)""", q)
        if (m != null) return out(dollars(num(m[3]) / m[1].toDouble()) + " per " + if (m[2] == "l") "L" else m[2])
        return null
    }
}
