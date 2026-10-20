package com.nulljosh.nimble

import com.nulljosh.nimble.Precalc.fixed
import com.nulljosh.nimble.Precalc.money
import com.nulljosh.nimble.Precalc.pcAt
import com.nulljosh.nimble.Precalc.pcFrac
import com.nulljosh.nimble.Precalc.pcNum
import com.nulljosh.nimble.Precalc.pcQuad
import com.nulljosh.nimble.Precalc.pcVal
import com.nulljosh.nimble.Precalc.prec
import kotlin.math.abs
import kotlin.math.pow
import kotlin.math.sqrt

/**
 * BC Foundations of Mathematics 11 with no network: statistics and the normal curve, polygons and angles, reasoning
 * (counterexamples, next terms), scale, the rule of 72 and card interest, projectiles, and test points for
 * inequalities. A port of `fom11()` in docs/engine.js, branch for branch. Precalc.answer asks it after Precalc10.
 */
internal object Foundations11 {

    private val polygon = mapOf("triangle" to 3, "quadrilateral" to 4, "pentagon" to 5, "hexagon" to 6, "heptagon" to 7, "octagon" to 8, "nonagon" to 9, "decagon" to 10, "hendecagon" to 11, "dodecagon" to 12)
    private val spelled = mapOf("one" to 1, "two" to 2, "three" to 3, "1" to 1, "2" to 2, "3" to 3)
    private val toCm = mapOf("mm" to 0.1, "cm" to 1.0, "m" to 100.0, "km" to 100000.0)

    /** The next term of a list: arithmetic, geometric, Fibonacci-like, then a polynomial by finite differences. */
    fun next(n: List<Double>): Double? {
        val d = n.zipWithNext { a, b -> b - a }
        if (d.all { abs(it - d[0]) < 1e-9 }) return n.last() + d[0]
        val r = n[1] / n[0]
        if (n[0] != 0.0 && n.indices.all { it == 0 || abs(n[it] - n[it - 1] * r) < 1e-9 }) return n.last() * r
        if (n.size >= 4 && n.indices.all { it < 2 || abs(n[it] - n[it - 1] - n[it - 2]) < 1e-9 }) return n.last() + n[n.size - 2]
        val rows = mutableListOf(n)
        while (rows.last().size > 2) {
            val nxt = rows.last().zipWithNext { a, b -> b - a }
            rows += nxt
            if (nxt.size >= 2 && nxt.all { abs(it - nxt[0]) < 1e-9 }) return rows.sumOf { it.last() }
        }
        return null
    }

    private fun out(body: String) = Answer.Text(heading = null, body = body, source = "Nimble math")
    private fun find(pattern: String, s: String): List<String>? = Regex(pattern).find(s)?.groupValues
    private fun has(pattern: String, s: String) = Regex(pattern).containsMatchIn(s)
    private fun list(s: String) = Regex("""-?\d+(?:\.\d+)?""").findAll(s).map { it.value.toDouble() }.toList()

    private fun isPrime(n: Double): Boolean {
        if (n < 2 || n != kotlin.math.floor(n)) return false
        var k = 2
        while (k.toDouble() * k <= n) { if (n % k == 0.0) return false; k++ }
        return true
    }

    fun answer(q: String): Answer? {
        var m: List<String>?
        // statistics
        m = find("""^(?:the )?(median|mode|range|standard deviation|variance|mean|average) of (?:the )?(?:data |numbers |values |set )?(-?[\d.]+(?:\s*(?:,|and)\s*-?[\d.]+)+)$""", q)
        if (m != null) {
            val n = list(m[2])
            val size = n.size
            val mean = n.sum() / size
            val s = n.sorted()
            if (m[1] == "mean" || m[1] == "average") return out(pcNum(mean))
            if (m[1] == "median") return out(pcNum(if (size % 2 == 1) s[(size - 1) / 2] else (s[size / 2 - 1] + s[size / 2]) / 2))
            if (m[1] == "range") return out(pcNum(s.last() - s.first()))
            if (m[1] == "mode") {
                val c = LinkedHashMap<Double, Int>()
                n.forEach { c[it] = (c[it] ?: 0) + 1 }
                val top = c.values.max()
                return out(if (top == 1) "None: every value appears once." else c.filter { it.value == top }.keys.joinToString(" and ") { pcNum(it) })
            }
            val ss = n.sumOf { (it - mean).pow(2) }
            if (m[1] == "variance") return out("σ² = ${pcNum(fixed(ss / size, 4))} (population), s² = ${pcNum(fixed(ss / (size - 1), 4))} (sample)")
            return out("σ = ${pcNum(fixed(sqrt(ss / size), 4))} (population), s = ${pcNum(fixed(sqrt(ss / (size - 1)), 4))} (sample)")
        }
        m = find("""\bz-?score\b.*?(-?[\d.]+)\b.*?\bmean (?:of |is |=\s*)?(-?[\d.]+).*?(?:standard deviation|sd|σ) (?:of |is |=\s*)?([\d.]+)""", q)
        if (m != null) return out("z = " + pcNum(fixed((m[1].toDouble() - m[2].toDouble()) / m[3].toDouble(), 4)))
        if (has("""\bnormal (?:distribution|curve)\b""", q)) {
            m = find("""\b(one|two|three|1|2|3) standard deviations?\b""", q)
            if (m != null) {
                val k = spelled.getValue(m[1])
                if (has("""\bwithin\b""", q)) return out(listOf("68%", "95%", "99.7%")[k - 1] + " of the data.")
                if (has("""\b(above|more than|greater than|higher than|below|less than|lower than)\b""", q)) return out(listOf("16%", "2.5%", "0.15%")[k - 1] + " of the data.")
            }
        }
        m = find("""(\d+(?:\.\d+)?)\s*%.*?margin of error (?:of )?(?:±\s*)?(\d+(?:\.\d+)?)\s*(%|percent|percentage points?)?""", q)
        if (m != null && has("""\b(confidence interval|interval|range)\b""", q)) return out(pcNum(m[1].toDouble() - m[2].toDouble()) + "% to " + pcNum(m[1].toDouble() + m[2].toDouble()) + "%")
        // polygons and angles
        val poly = find("""\b(triangle|quadrilateral|pentagon|hexagon|heptagon|octagon|nonagon|decagon|hendecagon|dodecagon|(\d+)-(?:gon|sided polygon))\b""", q)
        val sides = poly?.let { if (it[2].isNotEmpty()) it[2].toInt() else polygon[it[1]] }
        if (sides != null && has("""\b(?:sum of (?:the )?interior angles|interior angle sum|angle sum)\b""", q)) return out(pcNum((sides - 2) * 180.0) + "°")
        if (sides != null && has("""\b(?:each|one|an?) interior angle\b""", q)) return out(pcNum(fixed((sides - 2) * 180.0 / sides, 2)) + "°")
        if (sides != null && has("""\b(?:each|one|an?) exterior angle\b""", q)) return out(pcNum(fixed(360.0 / sides, 2)) + "°")
        if (has("""\bhow many sides\b""", q)) {
            find("""\binterior angles? (?:summing to|sum(?:s| of)?|add(?:ing)? (?:up )?to|total(?:ling)?) (?:of )?([\d.]+)""", q)?.let { return out(pcNum(it[1].toDouble() / 180 + 2)) }
            find("""\binterior angles? (?:of |measuring |is |are )?([\d.]+)""", q)?.let { return out(pcNum(fixed(360 / (180 - it[1].toDouble()), 4))) }
            find("""\bexterior angles? (?:of |measuring |is |are )?([\d.]+)""", q)?.let { return out(pcNum(fixed(360 / it[1].toDouble(), 4))) }
        }
        m = find("""^(?:the )?(supplement|complement)(?: angle)? (?:of|to) (?:an angle of )?([\d.]+)\s*(?:°|degrees?)?$""", q)
        if (m != null) return out(pcNum((if (m[1] == "supplement") 180 else 90) - m[2].toDouble()) + "°")
        m = find("""\btwo angles of a triangle (?:are|measure) ([\d.]+)\s*(?:°|degrees?)? and ([\d.]+)""", q)
        if (m != null) return out(pcNum(180 - m[1].toDouble() - m[2].toDouble()) + "°")
        // reasoning
        if (has("""^(?:what is )?(?:a )?counter-?example$""", q)) return out("An example that shows a statement is false. One counterexample is enough to disprove a general claim.")
        if (has("""^(?:what is )?(?:a )?conjecture$""", q)) return out("A statement believed to be true, based on a pattern or evidence, but not yet proven.")
        if (has("""^(?:what is )?inductive reasoning$""", q)) return out("Reasoning from specific examples or observed patterns to a general conclusion (a conjecture), which may be false.")
        if (has("""^(?:what is )?deductive reasoning$""", q)) return out("Reasoning from general statements that are known to be true (premises) to a specific conclusion that must be true.")
        m = find("""\bcounter-?example (?:to|for) (?:the (?:statement|claim|conjecture) )?(?:that )?all ([a-z ]+?) (?:are|is) ([a-z0-9 ]+)$""", q)
        if (m != null) {
            val subj = m[1].trim()
            val claim = m[2].trim()
            val square = has("^squares? of (?:numbers|integers)|^square numbers|^numbers squared", subj)
            val domain = when {
                subj.startsWith("prime") -> (0 until 100).map { it.toDouble() }.filter { isPrime(it) }
                subj.startsWith("odd") -> (0 until 50).map { 2.0 * it + 1 }
                subj.startsWith("even") -> (0 until 50).map { 2.0 * it }
                has("^(whole|natural|counting)", subj) -> (0..100).map { it.toDouble() }
                else -> listOf(-3.0, -2.0, -1.0, 0.0, 0.5, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0)
            }
            fun f(x: Double) = if (square) x * x else x
            val k = find("""(\d+)""", claim)?.get(1)?.toDouble()
            val test: ((Double, Double) -> Boolean)? = when {
                claim.startsWith("odd") -> { v, _ -> abs(v % 2) == 1.0 }
                claim.startsWith("even") -> { v, _ -> v % 2 == 0.0 }
                claim.startsWith("prime") -> { v, _ -> isPrime(v) }
                claim.startsWith("positive") -> { v, _ -> v > 0 }
                has("^(?:greater|bigger|larger) than (?:the )?(?:number|original)", claim) -> { v, x -> v > x }
                has("^(?:less|smaller) than (?:the )?(?:number|original)", claim) -> { v, x -> v < x }
                claim.startsWith("divisible by") && k != null -> { v, _ -> v % k == 0.0 }
                has("^(?:greater|bigger|more) than", claim) && k != null -> { v, _ -> v > k }
                else -> null
            }
            if (test != null) domain.firstOrNull { !test(f(it), it) }?.let { x ->
                return out(pcNum(x) + if (square) ": ${pcNum(x)}² = ${pcNum(x * x)}." else " is a counterexample.")
            }
        }
        m = find("""^(?:what (?:is|comes) )?(?:the )?next (?:term|number) (?:in|of|for) (?:the (?:sequence|pattern) )?(-?[\d.]+(?:\s*,\s*-?[\d.]+){2,})""", q)
            ?: find("""^(-?[\d.]+(?:\s*,\s*-?[\d.]+){2,}),?\s*(?:\.\.\.|…)?,?\s*what comes next$""", q)
        if (m != null) return next(list(m[1]))?.let { out(pcNum(it)) }
        // scale
        m = find("""\bscale factor\b.*?\b([\d.]+)\s*(mm|cm|m|km)\b.*?\b(?:represents?|is|stands for|equals?)\s*([\d.]+)\s*(mm|cm|m|km)\b""", q)
        if (m != null) {
            val k = m[3].toDouble() * toCm.getValue(m[4]) / (m[1].toDouble() * toCm.getValue(m[2]))
            return out(if (k >= 1) "1:" + pcNum(fixed(k, 4)) else pcNum(fixed(1 / k, 4)) + ":1")
        }
        m = find("""\bscale factor (?:is |of )?([\d./]+)\b.*?\b(area|volume|perimeter|length)\b""", q)
            ?: find("""\b(area|volume|perimeter)\b.*?\bscale factor (?:is |of )?([\d./]+)""", q)?.let { listOf(it[0], it[2], it[1]) }
        if (m != null) {
            val k = pcVal(m[1]) ?: return null
            val p = if (m[2] == "area") 2 else if (m[2] == "volume") 3 else 1
            return out("It is multiplied by " + pcFrac(prec(k.pow(p), 12)) + if (p > 1) " (" + pcFrac(k) + (if (p == 2) "²" else "³") + ")." else ".")
        }
        m = find("""\bscale (?:is |of )?1\s*:\s*([\d,]+)\b.*?\b([\d.]+)\s*(mm|cm)\b""", q)
        if (m != null) {
            val real = m[2].toDouble() * toCm.getValue(m[3]) * m[1].replace(",", "").toDouble()
            val unit = find("""\b(km|m|cm)\b(?=[^\d]*$)""", q.replaceFirst(Regex("""\b[\d.]+\s*(mm|cm)\b"""), ""))?.get(1) ?: if (real >= 100000) "km" else "m"
            return out(pcNum(fixed(real / toCm.getValue(unit), 4)) + " " + unit)
        }
        // money: the rule of 72, a month of card interest
        if (has("""\brule of 72\b""", q)) find("""([\d.]+)\s*%""", q)?.let { return out(pcNum(fixed(72 / it[1].toDouble(), 2)) + " years") }
        m = find("""\bbalance of \$?\s*([\d,.]+)\b.*?\b([\d.]+)\s*%.*?\b(?:one|1|a) month\b""", q)
        if (m != null) return out("$" + money(m[1].replace(",", "").toDouble() * m[2].toDouble() / 100 / 12))
        // projectiles: h = -5t^2 + 20t + 2
        m = find("""\bh\s*(?:\(t\))?\s*=\s*([-+.\d\st^*()]+?t[-+.\d\st^*()]*?)(?:,|\s+(?:what|when|find|how|at|reach)\b|$)""", q)
        if (m != null) {
            val co = pcQuad(m[1].replace("t", "x"))
            if (co != null && co[0] < 0) {
                val (a, b, c) = co
                val t = -b / (2 * a)
                val top = c - b * b / (4 * a)
                val unit = if (has("""\bm\b|\bmetres?\b|\bmeters?\b""", q)) " m" else ""
                if (has("""\bwhen\b|\bwhat time\b|\bhow long\b.*\bmaximum\b""", q)) return out("t = " + pcNum(fixed(t, 4)) + if (unit.isNotEmpty()) " s" else "")
                if (has("""\bmax(?:imum)?\b|\bhighest\b|\bhow high\b""", q)) return out(pcNum(fixed(top, 4)) + unit)
            }
        }
        // test points and boundary lines for inequalities
        m = find("""^is \(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\) (?:a solution (?:of|to)|in the solution (?:set|region) of|on) (.+?)\s*(<=|>=|≤|≥|<|>)\s*(.+)$""", q)
        if (m != null) {
            val x = m[1].toDouble()
            val y = m[2]
            fun v(e: String) = pcAt(e.replace("y", "($y)"), x)
            val l = v(m[3]) ?: return null
            val r = v(m[5]) ?: return null
            val op = when (m[4]) { "<=" -> "≤"; ">=" -> "≥"; else -> m[4] }
            val ok = when (op) { "<" -> l < r; ">" -> l > r; "≤" -> l <= r + 1e-12; else -> l >= r - 1e-12 }
            return out((if (ok) "Yes: " else "No: ") + pcNum(l) + (if (ok) " $op " else " is not $op ") + pcNum(r) + ".")
        }
        if (has("""\bsolid or (?:dashed|broken|dotted)\b|\b(?:dashed|broken|dotted) or solid\b""", q)) find("(<=|>=|≤|≥|<|>)", q)?.let {
            return out(if (has("[=≤≥]", it[1])) "Solid: the points on the line are part of the solution." else "Dashed: the points on the line are not part of the solution.")
        }
        return null
    }
}
