package com.nulljosh.nimble

import com.nulljosh.nimble.Precalc.fixed
import com.nulljosh.nimble.Precalc.money
import com.nulljosh.nimble.Precalc.pcFrac
import com.nulljosh.nimble.Precalc.pcNum
import com.nulljosh.nimble.Precalc.pcVal
import kotlin.math.abs
import kotlin.math.ln
import kotlin.math.pow
import kotlin.math.sqrt

/**
 * BC Foundations of Mathematics 12 with no network: counting, probability with dice, cards and coins, sets, if-then
 * logic, annuities and loan payments, growth or decay, circles, and fractals. A port of `fom12()` in docs/engine.js,
 * branch for branch. Precalc.answer asks it after Foundations11.
 */
internal object Foundations12 {

    private fun fact(n: Int): Double = if (n <= 1) 1.0 else n * fact(n - 1)
    private fun perm(n: Int, r: Int) = if (r > n) 0.0 else fact(n) / fact(n - r)
    private fun choose(n: Int, r: Int) = if (r > n) 0.0 else Precalc.jsRound(fact(n) / (fact(r) * fact(n - r)))
    private tailrec fun gcd(a: Long, b: Long): Long = if (b == 0L) abs(a) else gcd(b, a % b)
    private fun js(v: Double) = Precalc.js(v)

    /** An exact fraction, reduced, with its decimal when it is not a simple one: "25/102 ≈ 0.2451". */
    private fun ratio(n: Long, d: Long): String {
        val g = gcd(n, d).takeIf { it != 0L } ?: 1L
        val a = n / g
        val b = d / g
        return if (b == 1L) "$a" else "$a/$b" + if (b > 12) " ≈ " + pcNum(fixed(a.toDouble() / b, 4)) else ""
    }

    private class Event(val all: List<Int>, val hit: List<Int>)

    private val cardRank = mapOf("ace" to listOf(1), "king" to listOf(13), "queen" to listOf(12), "jack" to listOf(11), "face" to listOf(11, 12, 13))
    private val cardSuit = mapOf("heart" to listOf(0), "diamond" to listOf(1), "club" to listOf(2), "spade" to listOf(3), "red" to listOf(0, 1), "black" to listOf(2, 3))

    /** One event as the set of outcomes it covers: a die (1 to 6) or a card (0 to 51, rank 1 to 13 times suit). */
    private fun event(s: String): Event? {
        if (has("""\b(?:die|dice)\b|\broll""", s) && !has("""\btwo dice\b|\bsum\b|\bdoubles\b""", s)) {
            val all = (1..6).toList()
            find("""\b(?:a|an) ([1-6])\b""", s)?.let { return Event(all, listOf(it[1].toInt())) }
            if (has("""\beven\b""", s)) return Event(all, listOf(2, 4, 6))
            if (has("""\bodd\b""", s)) return Event(all, listOf(1, 3, 5))
            if (has("""\bprime\b""", s)) return Event(all, listOf(2, 3, 5))
            find("""\b(?:greater|more|higher) than ([0-6])\b""", s)?.let { m -> return Event(all, all.filter { it > m[1].toInt() }) }
            find("""\b(?:less|lower|fewer) than ([1-7])\b""", s)?.let { m -> return Event(all, all.filter { it < m[1].toInt() }) }
        }
        if (has("""\bcard|\bdeck\b|\bdraw""", s)) {
            val all = (0 until 52).toList()
            val r = find("""\b(ace|king|queen|jack|face)s?\b""", s)?.get(1)
            val u = find("""\b(heart|diamond|club|spade|red|black)s?\b""", s)?.get(1)
            if (r != null || u != null) return Event(all, all.filter { c -> (r == null || c % 13 + 1 in cardRank.getValue(r)) && (u == null || c / 13 in cardSuit.getValue(u)) })
        }
        return null
    }

    /** Negate a simple clause: "it rains" is "it does not rain", "a shape is a square" is "a shape is not a square". */
    private fun not(c: String): String {
        if (has("""\b(?:is|are|was|were|can|will)\b""", c)) return c.replaceFirst(Regex("""\b(is|are|was|were|can|will)\b"""), "$1 not")
        if (has("""\bhas\b""", c)) return c.replaceFirst(Regex("""\bhas\b"""), "does not have")
        if (has("""\bhave\b""", c)) return c.replaceFirst(Regex("""\bhave\b"""), "do not have")
        val w = c.split(" ").toMutableList()
        if (w.size < 2) return "not $c"
        val i = if (w[0] in setOf("a", "an", "the")) 2 else 1
        val v = w.getOrNull(i) ?: return "not $c"
        w[i] = (if (w[0] in setOf("it", "he", "she") || i == 2) "does not " else "do not ") + v.replace(Regex("ies$"), "y").replace(Regex("(?<=[^s])s$"), "")
        return w.joinToString(" ")
    }

    private fun out(body: String) = Answer.Text(heading = null, body = body, source = "Nimble math")
    private fun find(pattern: String, s: String): List<String>? = Regex(pattern).find(s)?.groupValues
    private fun has(pattern: String, s: String) = Regex(pattern).containsMatchIn(s)
    private fun dollars(v: Double) = "$" + money(v)

    fun answer(q: String): Answer? {
        var m: List<String>?
        // counting
        m = find("""^(\d+)\s*p\s*(\d+)$|^(?:the number of )?permutations of (\d+) (?:things|items|objects|people)?\s*taken (\d+) at a time$|^p\((\d+),\s*(\d+)\)$""", q)
        if (m != null) {
            val (n, r) = (if (m[1].isNotEmpty()) listOf(m[1], m[2]) else if (m[3].isNotEmpty()) listOf(m[3], m[4]) else listOf(m[5], m[6])).map { it.toInt() }
            return out(js(perm(n, r)))
        }
        m = find("""^(\d+)\s*c\s*(\d+)$|^(?:the number of )?combinations of (\d+) (?:things|items|objects|people)?\s*taken (\d+) at a time$|^(\d+) choose (\d+)$|^c\((\d+),\s*(\d+)\)$""", q)
        if (m != null) {
            val (n, r) = (if (m[1].isNotEmpty()) listOf(m[1], m[2]) else if (m[3].isNotEmpty()) listOf(m[3], m[4]) else if (m[5].isNotEmpty()) listOf(m[5], m[6]) else listOf(m[7], m[8])).map { it.toInt() }
            return out(js(choose(n, r)))
        }
        m = find("""^how many ways can (?:a |an )?(?:committee|team|group|set|hand|panel|selection) of (\d+) be (?:chosen|selected|formed|picked|made) from (\d+)""", q)
        if (m != null) return out(js(choose(m[2].toInt(), m[1].toInt())))
        m = find("""^how many ways can (\d+) [a-z]+ (?:line up|be arranged|be ordered|sit in a row|stand in a line|finish a race)""", q)
        if (m != null) return out(js(fact(m[1].toInt())))
        m = find("""\barrangements? of (?:all )?the letters (?:in|of) (?:the word )?([a-z]+)$""", q)
        if (m != null) {
            val counts = m[1].groupingBy { it }.eachCount().values
            return out(js(Precalc.jsRound(counts.fold(fact(m[1].length)) { s, k -> s / fact(k) })))
        }
        m = find("""\b(\d+) letters?\b.*?\b(\d+) (?:digits?|numbers?)\b""", q)
        if (m != null && has("""\bplates?\b|\bcodes?\b|\bpasswords?\b""", q)) return out(js(26.0.pow(m[1].toInt()) * 10.0.pow(m[2].toInt())))
        if (has("""^how many (?:different )?(?:outfits|meals|combos|choices|options|sandwiches|combinations)\b""", q) && !has("""\btaken\b""", q)) {
            val n = Regex("""\d+""").findAll(q).map { it.value.toDouble() }.toList()
            if (n.size >= 2) return out(js(n.fold(1.0) { a, b -> a * b }))
        }
        m = find("""^(?:the )?row (\d+) of pascal'?s triangle$""", q)
        if (m != null && m[1].toInt() <= 30) { val row = m[1].toInt(); return out((0..row).joinToString(", ") { js(choose(row, it)) }) }
        // probability
        m = find("""\bp\(a\)\s*=\s*([\d.]+)\b.*?\bp\(b\)\s*=\s*([\d.]+)""", q)
        if (m != null) {
            val a = m[1].toDouble()
            val b = m[2].toDouble()
            val both = find("""\bp\(a (?:and|∩) b\)\s*=\s*([\d.]+)""", q)?.get(1)
            if (has("""\bindependent\b""", q) && has("""\band b\b|\bboth\b""", q.replace("p(b)", ""))) return out(pcNum(fixed(a * b, 6)))
            if (has("""\bmutually exclusive\b""", q) && has("""\bor\b""", q)) return out(pcNum(fixed(a + b, 6)))
            if (has("""\bor\b""", q) && both != null) return out(pcNum(fixed(a + b - both.toDouble(), 6)))
            if (has("""\bor\b""", q) && has("""\bindependent\b""", q)) return out(pcNum(fixed(a + b - a * b, 6)))
        }
        m = find("""^(?:if )?the probability (?:is|of an event is) ([\d./]+)\b.*\bodds (in favou?r|against)""", q)
        if (m != null) {
            val p = pcVal(m[1]) ?: return null
            if (p <= 0 || p >= 1) return null
            val f = pcFrac(p).split("/").map { it.toDouble() }
            val (a, b) = if (f.size == 2) f else listOf(p * 100, 100.0)
            return out(if (m[2].startsWith("in")) "${js(a)}:${js(b - a)}" else "${js(b - a)}:${js(a)}")
        }
        m = find("""\bodds (in favou?r|against)(?: of an event)? (?:are|is) (\d+)\s*:\s*(\d+)\b.*\bprobability\b""", q)
        if (m != null) {
            val a = m[2].toLong()
            val b = m[3].toLong()
            return out(ratio(if (m[1].startsWith("in")) a else b, a + b))
        }
        m = find("""^(?:are|is) (.+?) and (.+?) mutually exclusive$""", q)
        if (m != null) {
            val a = event(m[1]) ?: event(m[1] + " " + q) ?: return null
            val b = event(m[2]) ?: event(m[2] + " " + q) ?: return null
            val shared = a.hit.filter { it in b.hit }
            return out(if (shared.isNotEmpty()) "No. They can happen together (${shared.size} shared outcome${if (shared.size > 1) "s" else ""})." else "Yes. They cannot happen at the same time.")
        }
        m = find("""\bodds (in favou?r of|against) (.+)$""", q)
        if (m != null) event(m[2])?.let { e ->
            val h = e.hit.size.toLong()
            val n = e.all.size - h
            val g = gcd(h, n).takeIf { it != 0L } ?: 1L
            return out(if (m[1].startsWith("in")) "${h / g}:${n / g}" else "${n / g}:${h / g}")
        }
        if (has("""^(?:the )?probability\b""", q)) {
            find("""\bflipping (\d+|two|three|four) (heads|tails)(?: in a row)?\b""", q)?.let {
                val k = when (it[1]) { "two" -> 2; "three" -> 3; "four" -> 4; else -> it[1].toInt() }
                return out(ratio(1, 1L shl k))
            }
            if (has("""\btwo dice\b|\bpair of dice\b""", q)) {
                find("""\bsum of (\d+)\b""", q)?.let { s ->
                    var c = 0L
                    for (a in 1..6) for (b in 1..6) if (a + b == s[1].toInt()) c++
                    return out(ratio(c, 36))
                }
                if (has("""\bdoubles\b""", q)) return out(ratio(6, 36))
            }
            event(q)?.let { e ->
                val h = e.hit.size.toLong()
                val total = e.all.size.toLong()
                find("""\b(two|2|three|3) .*?\b(without|with) replacement\b""", q)?.let { r ->
                    val k = if (r[1] == "two" || r[1] == "2") 2 else 3
                    var num = 1L
                    var den = 1L
                    for (i in 0 until k) { num *= if (r[2] == "with") h else h - i; den *= if (r[2] == "with") total else total - i }
                    return out(ratio(num, den))
                }
                return out(ratio(h, total))
            }
        }
        // sets and logic
        m = find("""\bn\(a (∪|∩|union|intersection|or|and) b\) (?:if|when|given)\b""", q)
        if (m != null) {
            fun v(p: String) = find(p, q)?.get(1)?.toLong()
            val a = v("""\bn\(a\)\s*=\s*(\d+)""")
            val b = v("""\bn\(b\)\s*=\s*(\d+)""")
            val u = v("""\bn\(a (?:∪|union|or) b\)\s*=\s*(\d+)""")
            val i = v("""\bn\(a (?:∩|intersection|and) b\)\s*=\s*(\d+)""")
            val r = if (a == null || b == null) null else if (has("∪|union|or", m[1])) i?.let { a + b - it } else u?.let { a + b - it }
            if (r != null) return out(r.toString())
        }
        m = find("""\b(\d+)\b\D*?\b(\d+)\b\D*?\b(\d+)\b\D*?\b(\d+)\b[^\d]*?\bboth\b.*\bneither\b""", q)
        if (m != null && m[1].toLong() >= m[2].toLong()) return out((m[1].toLong() - (m[2].toLong() + m[3].toLong() - m[4].toLong())).toString())
        val sets = Regex("""\{([^{}]*)\}""").findAll(q).map { t -> t.groupValues[1].split(",").map { it.trim() }.filter { it.isNotEmpty() } }.toList()
        m = find("""^(?:the )?(union|intersection) of\b""", q)
        if (sets.size == 2 && m != null) {
            val (a, b) = sets
            val r = if (m[1] == "union") (a + b).distinct() else a.filter { it in b }
            return out("{" + r.joinToString(", ") + "}")
        }
        if (has("""^(?:what is )?(?:the )?complement of a set$""", q)) return out("Everything in the universal set that is not in the set. The complement of A is written A′.")
        if (has("""^(?:what is )?(?:the |an )?empty set$""", q)) return out("The set with no elements, written ∅ or { }.")
        m = find("""^(?:the |what is the )?(converse|inverse|contrapositive) of (?:the statement )?"?if (.+?),? then (.+?)"?$""", q)
        if (m != null) {
            val p = m[2].trim()
            val c = m[3].trim()
            // A pronoun in the "then" part points back at the "if" part's noun; when the order flips, the noun goes first.
            val pn = find("""^(it|they)\b""", c)?.get(1)
            val noun = find("""^((?:a|an|the) [a-z]+|[a-z]+)\b""", p)?.get(1)
            val swap = pn != null && noun != null && has("^(a|an|the) ", noun)
            val cFirst = if (swap) c.replaceFirst(Regex("""^(it|they)\b"""), noun!!) else c
            val pLast = if (swap) p.replaceFirst(noun!!, pn!!) else p
            fun cap(s: String) = s.replaceFirstChar { it.uppercase() }
            if (m[1] == "converse") return out(cap("if $cFirst, then $pLast."))
            if (m[1] == "inverse") return out(cap("if ${not(p)}, then ${not(c)}."))
            return out(cap("if ${not(cFirst)}, then ${not(pLast)}."))
        }
        // annuities and loan payments, before the one-deposit compound-interest branch
        val per = mapOf("monthly" to 12, "each month" to 12, "every month" to 12, "per month" to 12, "a month" to 12, "weekly" to 52, "quarterly" to 4, "annually" to 1, "yearly" to 1, "each year" to 1, "per year" to 1, "every year" to 1)
        m = find("""\$\s*([\d,.]+) (?:is )?(?:deposited|invested|saved|contributed|put away|paid in) (monthly|weekly|quarterly|annually|yearly|each month|every month|per month|a month|each year|per year|every year) for (\d+) years? at ([\d.]+)\s*%""", q)
        if (m != null) {
            val k = per.getValue(m[2])
            val i = m[4].toDouble() / 100 / k
            val n = k * m[3].toInt()
            return out(dollars(m[1].replace(",", "").toDouble() * ((1 + i).pow(n) - 1) / i))
        }
        m = find("""\bpayments?\b.*?\$\s*([\d,.]+)\s*(loan|mortgage|car loan)?\b.*?\bat ([\d.]+)\s*%.*?\b(?:for|over) (\d+) years?""", q)
        if (m != null) {
            val pv = m[1].replace(",", "").toDouble()
            val n = 12 * m[4].toInt()
            fun pay(i: Double) = i * pv / (1 - (1 + i).pow(-n))
            val monthly = pay(m[3].toDouble() / 1200)
            if ("mortgage" in q) return out(dollars(monthly) + " a month compounded monthly; " + dollars(pay((1 + m[3].toDouble() / 200).pow(1.0 / 6) - 1)) + " with the semi-annual compounding Canadian mortgages use.")
            return out(dollars(monthly) + " a month (" + dollars(monthly * n - pv) + " in interest over the loan).")
        }
        // functions, circles, fractals
        m = find("""\by\s*=\s*(-?[\d.]*)\s*\(?\s*([\d.]+)\s*\)?\s*\^\s*\(?\s*-?x\s*\)?""", q)
        if (m != null && has("""\bgrowth or decay\b|\bdecay or growth\b""", q)) {
            val b = m[2].toDouble()
            val neg = has("""\^\s*\(?\s*-x""", q)
            if (b <= 0 || b == 1.0) return null
            return out(if ((b > 1) != neg) "Growth: the base ${pcNum(b)} is greater than 1." else "Decay: the base ${pcNum(b)} is between 0 and 1.")
        }
        m = find("""\bcircle\b.*?\bcent(?:er|re) (?:at |of )?\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\).*?\bradius (?:of |is )?([\d.]+)""", q)
        if (m != null && has("""\bequation\b""", q)) {
            fun t(v: String, n: String) = if (n.toDouble() == 0.0) "$v²" else "(" + v + (if (n.toDouble() > 0) " - $n" else " + " + n.removePrefix("-")) + ")²"
            return out(t("x", m[1]) + " + " + t("y", m[2]) + " = " + pcNum(m[3].toDouble().pow(2)))
        }
        m = find("""^(?:the )?cent(?:er|re) and radius of (.+?)=\s*([\d.]+)$""", q)
        if (m != null) {
            val left = m[1]
            fun term(v: String): Double? {
                find("""\(\s*$v\s*([+-])\s*([\d.]+)\s*\)\s*(?:\^\s*2|²)""", left)?.let { return (if (it[1] == "-") 1 else -1) * it[2].toDouble() }
                return if (has("""\b$v\s*(?:\^\s*2|²)""", left)) 0.0 else null
            }
            val h = term("x") ?: return null
            val k = term("y") ?: return null
            val r2 = m[2].toDouble()
            val r = sqrt(r2)
            return out("Center (${pcNum(h)}, ${pcNum(k)}), radius " + (if (r == kotlin.math.floor(r)) pcNum(r) else "√${m[2]} ≈ " + pcNum(fixed(r, 4))) + ".")
        }
        val fractal = mapOf("koch curve" to Triple(4, 3, "segments"), "koch snowflake" to Triple(4, 3, "segments"), "sierpinski triangle" to Triple(3, 2, "triangles"), "sierpinski gasket" to Triple(3, 2, "triangles"), "sierpinski carpet" to Triple(8, 3, "squares"), "cantor set" to Triple(2, 3, "segments"))
        fractal.keys.firstOrNull { it in q }?.let { fr ->
            val (n, s, unit) = fractal.getValue(fr)
            if (has("""\bdimension\b""", q)) return out("log $n/log $s ≈ " + pcNum(fixed(ln(n.toDouble()) / ln(s.toDouble()), 4)))
            val stage = find("""\bstage (\d+)\b""", q)
            if (stage != null && has("""\bhow many\b""", q)) return out(js(n.toDouble().pow(stage[1].toInt())) + " " + unit)
        }
        return null
    }
}
