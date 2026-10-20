package com.nulljosh.nimble

import com.nulljosh.nimble.Precalc.fixed
import com.nulljosh.nimble.Precalc.money
import com.nulljosh.nimble.Precalc.pcFrac
import com.nulljosh.nimble.Precalc.pcNum
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.pow

/**
 * BC Workplace Mathematics 10 with no network: perimeter, area and volume with units in the question, mixed units,
 * sales tax, discounts and tips, unit price and the better buy, exchange rates, overtime and percent deductions,
 * ratios, rates, and the rise over a run. A port of `work10()` in docs/engine.js. Precalc.answer asks it after
 * Statistics12.
 */
internal object Workplace10 {

    private const val U = """\s*(?:mm|cm|m|km|in|inches|ft|feet|foot|yd|yards?)?\s*"""
    private val two = Regex("""([\d.]+)$U(?:by|x|×)\s*([\d.]+)$U""")
    private val three = Regex("""([\d.]+)$U(?:by|x|×)\s*([\d.]+)$U(?:by|x|×)\s*([\d.]+)""")

    /** Two units that are often said together, and how many of the small one make the big one. */
    private val mixed = listOf(
        listOf("(?:feet|foot|ft)", "(?:inches|inch|in)", "12", "inches"),
        listOf("(?:yards?|yd)", "(?:feet|foot|ft)", "3", "feet"),
        listOf("(?:hours?|hrs?|h)", "(?:minutes?|mins?)", "60", "minutes"),
        listOf("(?:minutes?|mins?)", "(?:seconds?|secs?|s)", "60", "seconds"),
        listOf("(?:pounds?|lbs?)", "(?:ounces?|oz)", "16", "ounces"),
        listOf("(?:metres?|meters?|m)", "(?:centimetres?|centimeters?|cm)", "100", "cm"),
    )

    private tailrec fun gcd(a: Long, b: Long): Long = if (b == 0L) abs(a) else gcd(b, a % b)
    private fun out(body: String) = Answer.Text(heading = null, body = body, source = "Nimble math")
    private fun find(pattern: String, s: String): List<String>? = Regex(pattern).find(s)?.groupValues
    private fun has(pattern: String, s: String) = Regex(pattern).containsMatchIn(s)
    private fun dollars(v: Double) = "$" + money(v)
    private fun n(s: String) = s.replace(",", "").toDouble()

    fun answer(q: String): Answer? {
        var m: List<String>?
        // shapes, with or without units after each number
        m = find("""^(?:the )?(perimeter|area) of (?:a |the )?(rectangle|rectangular [a-z]+|room|yard|garden|field|lot|square)\b(.*)$""", q)
        if (m != null) {
            val dims = two.find(m[3])?.groupValues
            val side = find("""\bside (?:of |length )?([\d.]+)""", m[3]) ?: if (m[2] == "square") find("""([\d.]+)""", m[3]) else null
            val (l, w) = if (dims != null) dims[1].toDouble() to dims[2].toDouble() else if (side != null) side[1].toDouble() to side[1].toDouble() else return null
            return out(pcNum(if (m[1] == "area") l * w else 2 * (l + w)))
        }
        m = find("""^(?:the )?area of (?:a |the )?triangle\b.*?\bbase (?:of |is )?([\d.]+).*?\bheight (?:of |is )?([\d.]+)""", q)
        if (m != null) return out(pcNum(m[1].toDouble() * m[2].toDouble() / 2))
        m = find("""^(?:the )?area of (?:a |the )?trapezoid\b.*?\bbases? (?:of )?([\d.]+)\s*(?:and|,)\s*([\d.]+).*?\bheight (?:of |is )?([\d.]+)""", q)
        if (m != null) return out(pcNum((m[1].toDouble() + m[2].toDouble()) * m[3].toDouble() / 2))
        m = find("""^(?:the )?(circumference|perimeter|area) of (?:a |the )?circle\b.*?\b(radius|diameter) (?:of |is )?([\d.]+)""", q)
        if (m != null) {
            val r = if (m[2] == "radius") m[3].toDouble() else m[3].toDouble() / 2
            val k = if (m[1] == "area") r * r else 2 * r
            return out(pcFrac(k) + "π ≈ " + pcNum(fixed(k * PI, 2)))
        }
        m = find("""^(?:the )?volume of (?:a |the )?(?:rectangular prism|box|room|tank|container)\b(.*)$""", q)
        if (m != null) three.find(m[1])?.groupValues?.let { return out(pcNum(it[1].toDouble() * it[2].toDouble() * it[3].toDouble())) }
        m = find("""^how many square (feet|metres|meters|yards|inches|cm|m|ft)\b.*?\b(?:in|is|for) (?:a |the )?[a-z ]*?([\d.]+)\s*[a-z]*\s*(?:by|x|×)\s*([\d.]+)""", q)
        if (m != null) return out(pcNum(m[2].toDouble() * m[3].toDouble()) + " square " + m[1])
        m = find("""^how many ([a-z]+)\b.*?\b([\d.]+) square [a-z]+ (?:per|each|a|for each) [a-z]+\b.*?\bcover ([\d.]+)""", q)
        if (m != null) {
            val r = m[3].toDouble() / m[2].toDouble()
            return out(ceil(fixed(r, 6)).toLong().toString() + " " + m[1] + " (" + pcNum(fixed(r, 2)) + ", rounded up)")
        }
        m = find("""\bcost to fence\b.*?([\d.]+)\s*[a-z]*\s*(?:by|x|×)\s*([\d.]+)\s*[a-z]*\b.*?\$\s*([\d.]+) (?:per|a|for each) ([a-z]+)""", q)
        if (m != null) {
            val p = 2 * (m[1].toDouble() + m[2].toDouble())
            return out(dollars(p * m[3].toDouble()) + " for " + pcNum(p) + " " + m[4] + "s of fence")
        }
        // mixed units: 3 feet 6 inches, 2 hours 45 minutes
        for ((big, small, k, name) in mixed) {
            find("""^(?:convert )?([\d.]+)\s*$big\s*(?:and\s*)?([\d.]+)\s*$small\s+(?:to|in|into)\s+$small$""", q)?.let {
                return out(pcNum(it[1].toDouble() * k.toDouble() + it[2].toDouble()) + " " + name)
            }
        }
        // money: taxes, discounts, tips, unit prices, exchange. Tax and discount are one step: a word problem with more
        // numbers than that ("Job A pays $15 an hour for 2000 hours...") is not theirs to answer.
        val oneStep = Regex("""\d+(?:\.\d+)?""").findAll(q).count() <= 3
        m = find("""\$\s*([\d,.]+)\b.*?\bwith\b(.*)$""", q)
        if (oneStep && m != null && has("""\b(gst|pst|hst|tax)\b""", q) && has("""\b(total|cost|price|pay)\b""", q)) {
            val rates = Regex("""([\d.]+)\s*%""").findAll(m[2]).map { it.groupValues[1].toDouble() }.toList()
            if (rates.isEmpty()) return null
            val p = n(m[1])
            val tax = p * rates.sum() / 100
            return out(dollars(p + tax) + " (" + dollars(tax) + " in tax)")
        }
        m = find("""\b(?:price|cost)\b.*?\b([\d.]+)\s*% (?:discount|off)\b.*?\$\s*([\d,.]+)""", q)
            ?: find("""\$\s*([\d,.]+)\b.*?\b([\d.]+)\s*% (?:discount|off)\b""", q)?.let { listOf(it[0], it[2], it[1]) }
        if (oneStep && m != null) {
            val d = m[1].toDouble()
            val p = n(m[2])
            return out(dollars(p * (1 - d / 100)) + " (" + dollars(p * d / 100) + " off)")
        }
        m = find("""\b([\d.]+)\s*% tip (?:on|for) (?:a |the )?\$\s*([\d,.]+)""", q)
        if (m != null) {
            val t = n(m[2]) * m[1].toDouble() / 100
            return out(dollars(t) + " tip, " + dollars(n(m[2]) + t) + " in all")
        }
        m = find("""\bunit (?:price|cost|rate) (?:of|for) (\d+(?:\.\d+)?)\s*([a-z]+)? (?:for|at|cost(?:s|ing)?) \$\s*([\d,.]+)""", q)
        if (m != null) return out(dollars(n(m[3]) / m[1].toDouble()) + " per " + if (m[2].isNotEmpty()) m[2].replace(Regex("(es|s)$"), "") else "item")
        m = find("""\bbetter (?:buy|deal|value)\b.*?([\d.]+)\s*([a-z]+) for \$\s*([\d.]+)\s*(?:,|or)\s*(?:or\s*)?([\d.]+)\s*([a-z]+) for \$\s*([\d.]+)""", q)
        if (m != null) {
            fun scale(u: String) = when (u) { "kg" -> 1000.0; "l" -> 1000.0; else -> 1.0 }
            val a = m[3].toDouble() / (m[1].toDouble() * scale(m[2]))
            val b = m[6].toDouble() / (m[4].toDouble() * scale(m[5]))
            val pick = if (a <= b) listOf(m[1], m[2], m[3]) else listOf(m[4], m[5], m[6])
            val unit = if (m[2] == "kg" || m[2] == "g") "g" else if (m[2] == "l" || m[2] == "ml") "mL" else m[2]
            fun four(v: Double): String { val s = floor(v * 10000 + 0.5).toLong().toString().padStart(5, '0'); return s.dropLast(4) + "." + s.takeLast(4) }
            return out(pick[0] + " " + (if (pick[1] == "l") "L" else pick[1]) + " for $" + pick[2] + " is the better buy: $" + four(minOf(a, b)) + " per " + unit + " against $" + four(maxOf(a, b)) + ".")
        }
        m = find("""^(?:convert )?\$?\s*([\d,.]+) ([a-z]+(?: [a-z]+)?) (?:dollars? )?(?:to|into) ([a-z]+(?: [a-z]+)?) (?:at|with a rate of|at a rate of) ([\d.]+)$""", q)
        if (m != null) return out(money(n(m[1]) * m[4].toDouble()) + " " + m[3])
        // pay: overtime said after the hours, deductions as a percent
        m = find("""\b([\d.]+)\s*hours?\b.*?\b(time and a half|double time)\b.*?\$\s*([\d.]+)""", q)
        if (m != null) return out(dollars(m[1].toDouble() * m[3].toDouble() * if ("half" in m[2]) 1.5 else 2.0))
        m = find("""\bnet pay\b.*?\bgross(?: pay)? (?:is |of |=\s*)?\$?\s*([\d,.]+)\b.*?\bdeductions? (?:are |is |of |total )?([\d.]+)\s*%""", q)
        if (m != null) {
            val g = n(m[1])
            return out(dollars(g * (1 - m[2].toDouble() / 100)) + " (" + dollars(g * m[2].toDouble() / 100) + " deducted)")
        }
        // ratios and rates
        m = find("""^(?:simplify|reduce) (?:the )?ratio ([\d.]+(?:\s*:\s*[\d.]+)+)$""", q)
        if (m != null) {
            val p = m[1].split(Regex("""\s*:\s*"""))
            val k = 10.0.pow(p.maxOf { it.substringAfter(".", "").length })
            val v = p.map { Precalc.jsRound(it.toDouble() * k).toLong() }
            val g = v.reduce(::gcd)
            return out(v.joinToString(":") { (it / g).toString() })
        }
        m = find("""\bif (\d+(?:\.\d+)?) [a-z ]+? cost(?:s)? \$\s*([\d,.]+),? (?:how much|what) (?:do|does|would|will) (\d+(?:\.\d+)?)\b""", q)
        if (m != null) return out(dollars(n(m[2]) / m[1].toDouble() * m[3].toDouble()))
        m = find("""\btravels? ([\d.]+)\s*(km|miles|m)\b.*?\bin ([\d.]+)\s*(hours?|h|minutes?|min)\b""", q)
        if (m != null && has("""\b(speed|fast|rate|average)\b""", q)) {
            val t = if (m[4].startsWith("min")) m[3].toDouble() / 60 else m[3].toDouble()
            return out(pcNum(fixed(m[1].toDouble() / t, 2)) + " " + if (m[2] == "miles") "mph" else m[2] + "/h")
        }
        m = find("""^how long (?:does it take )?to (?:drive|travel|go|ride|walk|fly|cycle) ([\d.]+)\s*(km|miles|m)\b.*?\bat ([\d.]+)\s*(?:km/h|kph|mph|km per hour|miles per hour)""", q)
        if (m != null) {
            val t = m[1].toDouble() / m[3].toDouble()
            val h = floor(t + 1e-9).toLong()
            val min = Precalc.jsRound((t - h) * 60).toLong()
            return out(pcNum(fixed(t, 2)) + " hours" + if (min != 0L) " ($h h $min min)" else "")
        }
        m = find("""\brises? ([\d.]+)\s*[a-z]*\s*(?:over|for|in) (?:a (?:run|horizontal distance|distance) of )?([\d.]+)""", q)
        if (m != null) {
            val r = m[1].toDouble() / m[2].toDouble()
            if (has("""\bangle\b""", q)) return out(pcNum(fixed(atan(r) * 180 / PI, 2)) + "°")
            if (has("""\bgrade\b""", q)) return out(pcNum(fixed(r * 100, 2)) + "%")
            if (has("""\b(slope|pitch)\b""", q)) return out(pcFrac(r) + if ("/" in pcFrac(r)) " ≈ " + pcNum(fixed(r, 4)) else "")
        }
        return null
    }
}
