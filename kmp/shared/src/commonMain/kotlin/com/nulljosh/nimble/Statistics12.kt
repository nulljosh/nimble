package com.nulljosh.nimble

import com.nulljosh.nimble.Precalc.fixed
import com.nulljosh.nimble.Precalc.money
import com.nulljosh.nimble.Precalc.pcNum
import com.nulljosh.nimble.Precalc.pcVal
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.exp
import kotlin.math.pow
import kotlin.math.sqrt

/**
 * BC Statistics 12 with no network: quartiles and outliers, the normal model both ways, binomial probability,
 * expected value, correlation and least squares, confidence intervals and sample size, conditional probability, and
 * the words of inference and sampling. A port of `stats12()` in docs/engine.js. Precalc.answer asks it after Calculus12.
 */
internal object Statistics12 {

    /** The standard normal CDF (Abramowitz and Stegun 7.1.26, good to about 1e-7). */
    fun phi(z: Double): Double {
        val t = 1 / (1 + 0.3275911 * abs(z) / sqrt(2.0))
        val y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-z * z / 2)
        return if (z >= 0) (1 + y) / 2 else (1 - y) / 2
    }

    fun inv(p: Double): Double {
        var lo = -10.0
        var hi = 10.0
        repeat(100) { val mid = (lo + hi) / 2; if (phi(mid) < p) lo = mid else hi = mid }
        return (lo + hi) / 2
    }

    private fun median(s: List<Double>) = if (s.size % 2 == 1) s[(s.size - 1) / 2] else (s[s.size / 2 - 1] + s[s.size / 2]) / 2

    /** Q1 and Q3 as the medians of the lower and upper halves, leaving out the middle value when there is one. */
    private fun quart(s: List<Double>): Pair<Double, Double> { val h = s.size / 2; return median(s.subList(0, h)) to median(s.subList(s.size - h, s.size)) }

    private fun choose(n: Int, k: Int): Long { var r = 1L; for (i in 0 until k) r = r * (n - i) / (i + 1); return r }
    private tailrec fun gcd(a: Long, b: Long): Long = if (b == 0L) abs(a) else gcd(b, a % b)
    private fun ratio(n: Long, d: Long): String {
        val g = gcd(n, d).takeIf { it != 0L } ?: 1L
        val a = n / g
        val b = d / g
        return if (b == 1L) "$a" else "$a/$b" + if (b > 12) " ≈ " + pcNum(fixed(a.toDouble() / b, 4)) else ""
    }

    private val zStar = mapOf(80 to 1.282, 90 to 1.645, 95 to 1.96, 98 to 2.326, 99 to 2.576)

    private val facts = listOf(
        """^(?:what is )?(?:a )?type (?:i|1) error$""" to "Rejecting the null hypothesis when it is actually true (a false positive). Its chance is the significance level α.",
        """^(?:what is )?(?:a )?type (?:ii|2) error$""" to "Failing to reject the null hypothesis when it is actually false (a false negative). Its chance is β.",
        """^(?:what is )?(?:a |the )?p-?value$""" to "The probability, if the null hypothesis were true, of getting a result at least as extreme as the one observed. Small p-values are evidence against the null.",
        """^(?:what is )?(?:the )?null hypothesis$""" to "H₀, the claim of no effect or no difference (for example, the two means are equal). A test looks for evidence against it.",
        """^(?:what is )?(?:the )?alternative hypothesis$""" to "H₁ or Hₐ, the claim that there is an effect or a difference (not equal, greater or less). It is what the test hopes to support.",
        """^(?:what is )?(?:a )?simple random sample$|^(?:what is )?simple random sampling$""" to "Every group of n people in the population has the same chance of being the sample, as if names were drawn from a hat.",
        """^(?:what is )?(?:a )?stratified (?:random )?sampl(?:e|ing)$""" to "The population is split into groups (strata) that share a trait, and a random sample is taken from each group.",
        """^(?:what is )?(?:a )?cluster sampl(?:e|ing)$""" to "The population is split into groups (clusters), some clusters are chosen at random, and everyone in the chosen clusters is sampled.",
        """^(?:what is )?(?:a )?systematic sampl(?:e|ing)$""" to "Choose a random start, then take every kth member of the list (for example every 10th name).",
        """^(?:what is )?(?:a )?convenience sampl(?:e|ing)$""" to "Sampling whoever is easiest to reach, such as people nearby. It is quick but rarely represents the population.",
        """^(?:what is )?(?:a )?voluntary response (?:sample|bias)$""" to "People choose themselves to respond, so those with strong opinions are overrepresented.",
        """^(?:what is )?(?:sampling |selection )?bias$|^(?:what is )?sampling bias$""" to "A sampling method that systematically favours some outcomes, so the sample does not represent the population.",
    ).map { Regex(it.first) to it.second }

    private fun out(body: String) = Answer.Text(heading = null, body = body, source = "Nimble math")
    private fun find(pattern: String, s: String): List<String>? = Regex(pattern).find(s)?.groupValues
    private fun has(pattern: String, s: String) = Regex(pattern).containsMatchIn(s)
    private fun nums(s: String) = Regex("""-?\d+(?:\.\d+)?""").findAll(s).map { it.value.toDouble() }.toList()
    private fun d4(v: Double) = pcNum(fixed(v, 4))

    fun answer(q: String): Answer? {
        for ((re, body) in facts) if (re.containsMatchIn(q)) return out(body)
        var m: List<String>?
        // summaries and outliers
        m = find("""^(?:the )?(five[- ]number summary|interquartile range|iqr|quartiles|first quartile|third quartile|q1|q3) (?:of|for) (?:the data )?(-?[\d.]+(?:\s*,\s*-?[\d.]+)+)$""", q)
        if (m != null) {
            val s = nums(m[2]).sorted()
            val (q1, q3) = quart(s)
            if (m[1].startsWith("five")) return out("Minimum ${pcNum(s.first())}, Q1 ${pcNum(q1)}, median ${pcNum(median(s))}, Q3 ${pcNum(q3)}, maximum ${pcNum(s.last())}.")
            if (m[1].startsWith("interquartile") || m[1] == "iqr") return out(pcNum(q3 - q1))
            if (m[1] == "quartiles") return out("Q1 = ${pcNum(q1)}, Q3 = ${pcNum(q3)}")
            return out(pcNum(if (m[1].startsWith("first") || m[1] == "q1") q1 else q3))
        }
        m = find("""^is (-?[\d.]+) an outlier in (?:the data )?(-?[\d.]+(?:\s*,\s*-?[\d.]+)+)$""", q)
        if (m != null) {
            val v = m[1].toDouble()
            val (q1, q3) = quart(nums(m[2]).sorted())
            val k = 1.5 * (q3 - q1)
            val lo = q1 - k
            val hi = q3 + k
            return out((if (v < lo || v > hi) "Yes. " else "No. ") + "The fences are Q1 - 1.5·IQR = ${pcNum(lo)} and Q3 + 1.5·IQR = ${pcNum(hi)}.")
        }
        m = find("""^(?:the )?(sample|population) (standard deviation|variance) of (?:the data )?(-?[\d.]+(?:\s*,\s*-?[\d.]+)+)$""", q)
        if (m != null) {
            val n = nums(m[3])
            val mean = n.sum() / n.size
            val v = n.sumOf { (it - mean).pow(2) } / (n.size - if (m[1] == "sample") 1 else 0)
            return out(d4(if (m[2] == "variance") v else sqrt(v)))
        }
        // the normal model
        m = find("""\bprobability (?:that )?z (?:is )?(less than|below|under|<|greater than|more than|above|over|>)\s*(-?[\d.]+)$""", q)
        if (m != null) { val p = phi(m[2].toDouble()); return out(d4(if (has("less|below|under|<", m[1])) p else 1 - p)) }
        m = find("""\bprobability (?:that )?z (?:is )?between (-?[\d.]+) and (-?[\d.]+)$""", q) ?: find("""\bprobability (?:that )?(-?[\d.]+)\s*<\s*z\s*<\s*(-?[\d.]+)$""", q)
        if (m != null) return out(d4(phi(m[2].toDouble()) - phi(m[1].toDouble())))
        m = find("""\bnormal\b.*?\bmean (?:of |is |=\s*)?(-?[\d.]+).*?\bstandard deviation (?:of |is |=\s*)?([\d.]+).*?\b(taller|greater|more|above|over|higher|heavier|longer|below|less|under|shorter|lower|lighter)(?: than)? ([\d.]+)""", q)
        if (m != null) {
            val z = (m[4].toDouble() - m[1].toDouble()) / m[2].toDouble()
            val p = if (has("below|less|under|shorter|lower|lighter", m[3])) phi(z) else 1 - phi(z)
            return out(pcNum(fixed(p * 100, 2)) + "% (z = " + pcNum(fixed(z, 2)) + ")")
        }
        m = find("""\bz-?score\b.*?\b(\d+(?:\.\d+)?)(?:st|nd|rd|th) percentile\b|\b(\d+(?:\.\d+)?)(?:st|nd|rd|th) percentile\b.*?\bz-?score\b""", q)
        if (m != null) return out("z = " + d4(inv(m[1].ifEmpty { m[2] }.toDouble() / 100)))
        m = find("""\bpercentile (?:rank )?(?:of |for )?(?:a score |a value )?(?:with )?z\s*=\s*(-?[\d.]+)""", q)
        if (m != null) return out(pcNum(fixed(phi(m[1].toDouble()) * 100, 2)) + "th percentile")
        // binomial, at least one, expected value
        m = find("""\bexactly (\d+) (successes|heads|tails|sixes|[a-z]+s?) in (\d+) (?:trials|(?:coin )?flips|tosses|rolls|tries)\b""", q)
        if (m != null) {
            val k = m[1].toInt()
            val n = m[3].toInt()
            val coin = has("heads|tails", m[2]) || has("""\bcoin|flips?\b""", q)
            val die = has("""sixes|\brolls?\b|\bdie\b""", q) && !coin
            val p = find("""\bp\s*=\s*([\d.]+)""", q)?.get(1)?.toDouble() ?: if (coin) 0.5 else if (die) 1.0 / 6 else return null
            if (coin) {
                val c = choose(n, k)
                val all = 1L shl n
                return out(ratio(c, all) + if (all / gcd(c, all) <= 12) " = " + d4(c.toDouble() / all) else "")
            }
            return out(d4(choose(n, k) * p.pow(k) * (1 - p).pow(n - k)))
        }
        m = find("""\bprobability of at least one (six|head|tail|[a-z]+) in (\d+) (?:coin |die )?(rolls|flips|tosses|tries|trials)\b""", q)
        if (m != null) {
            val n = m[2].toInt()
            val coin = has("head|tail", m[1]) || has("flips|tosses", m[3])
            return out(if (coin) ratio((1L shl n) - 1, 1L shl n) + " = " + d4(1 - 0.5.pow(n)) else d4(1 - (5.0 / 6).pow(n)))
        }
        m = find("""\b(mean|expected value|standard deviation|variance) of (?:a |the )?binomial(?: distribution| random variable)? with n\s*=\s*(\d+) and p\s*=\s*([\d.]+)""", q)
        if (m != null) {
            val n = m[2].toDouble()
            val p = m[3].toDouble()
            return out(d4(if (m[1] == "standard deviation") sqrt(n * p * (1 - p)) else if (m[1] == "variance") n * p * (1 - p) else n * p))
        }
        m = find("""\bexpected value\b.*?\bwin \$?([\d.]+) with (?:a )?probability (?:of )?([\d./]+)\b.*?\blose \$?([\d.]+) with (?:a )?probability (?:of )?([\d./]+)""", q)
        if (m != null) {
            val v = m[1].toDouble() * (pcVal(m[2]) ?: return null) - m[3].toDouble() * (pcVal(m[4]) ?: return null)
            return out((if (v < 0) "-$" else "$") + money(abs(v)) + " per game")
        }
        // correlation and least squares
        m = find("""\bx\s*=\s*(-?[\d.]+(?:\s*,\s*-?[\d.]+)+)\s*,?\s*and\s*y\s*=\s*(-?[\d.]+(?:\s*,\s*-?[\d.]+)+)""", q)
        if (m != null) {
            val x = nums(m[1])
            val y = nums(m[2])
            if (x.size != y.size || x.size < 2) return null
            val mx = x.average()
            val my = y.average()
            val sxy = x.indices.sumOf { (x[it] - mx) * (y[it] - my) }
            val sxx = x.sumOf { (it - mx).pow(2) }
            val syy = y.sumOf { (it - my).pow(2) }
            if (has("""\bcorrelation\b|\br\b""", q)) return out("r = " + d4(sxy / sqrt(sxx * syy)))
            if (has("""\b(best fit|regression|least squares|trend line)\b""", q)) {
                val k = sxy / sxx
                val b = my - k * mx
                val ks = d4(k)
                return out("y = " + if (ks == "0") d4(b) else (if (ks == "1") "" else if (ks == "-1") "-" else ks) + "x" + if (abs(b) < 1e-9) "" else if (b > 0) " + " + d4(b) else " - " + d4(-b))
            }
        }
        m = find("""^what does (?:an? )?r(?: value)?(?: of)?\s*=?\s*(-?[\d.]+) (?:mean|tell you|show)$""", q)
        if (m != null) {
            val r = m[1].toDouble()
            val a = abs(r)
            val str = if (a >= 0.7) "strong" else if (a >= 0.3) "moderate" else if (a > 0) "weak" else null
            return out(if (str == null) "No linear relationship." else "A $str ${if (r > 0) "positive" else "negative"} linear relationship: as x increases, y tends to ${if (r > 0) "increase" else "decrease"}.")
        }
        m = find("""\bcoefficient of determination\b.*?\br\s*=\s*(-?[\d.]+)""", q)
        if (m != null) return out("r² = " + d4(m[1].toDouble().pow(2)))
        // intervals, margins and sample size
        val conf = find("""\b(80|90|95|98|99)\s*%""", q)?.get(1)?.toInt() ?: 95
        val zs = zStar.getValue(conf)
        m = find("""\bconfidence interval for (?:a |the )?proportion (?:of |p\s*=\s*)?([\d.]+)\b.*?\bn\s*=\s*(\d+)""", q)
        if (m != null) {
            val p = m[1].toDouble()
            val e = zs * sqrt(p * (1 - p) / m[2].toDouble())
            return out(pcNum(fixed(p - e, 3)) + " to " + pcNum(fixed(p + e, 3)) + " (" + pcNum(p) + " ± " + pcNum(fixed(e, 3)) + ")")
        }
        m = find("""\bsample size\b.*?\bmargin of error (?:of )?([\d.]+)\b""", q)
        if (m != null) {
            val p = find("""\bp\s*=\s*([\d.]+)""", q)?.get(1)?.toDouble() ?: 0.5
            return out(ceil(fixed((zs / m[1].toDouble()).pow(2) * p * (1 - p), 6)).toLong().toString())
        }
        m = find("""\bmargin of error\b.*?\bp\s*=\s*([\d.]+)\b.*?\bn\s*=\s*(\d+)""", q)
        if (m != null) return out(pcNum(fixed(zs * sqrt(m[1].toDouble() * (1 - m[1].toDouble()) / m[2].toDouble()), 4)))
        m = find("""\bmean of (?:a |the )?sample is (-?[\d.]+) with (?:a )?standard error (?:of )?([\d.]+)""", q)
        if (m != null && has("""\bconfidence interval\b""", q)) {
            val e = zs * m[2].toDouble()
            return out(pcNum(fixed(m[1].toDouble() - e, 2)) + " to " + pcNum(fixed(m[1].toDouble() + e, 2)))
        }
        m = find("""\bstandard error\b.*?\bs\s*=\s*([\d.]+)\b.*?\bn\s*=\s*(\d+)""", q)
        if (m != null) return out(d4(m[1].toDouble() / sqrt(m[2].toDouble())))
        // conditional probability and independence
        fun p(pattern: String) = find(pattern, q)?.get(1)?.let { pcVal(it) }
        if (has("""\bgiven\b""", q) && has("""p\(a and b\)|p\(a ∩ b\)""", q)) {
            val ab = p("""p\(a (?:and|∩) b\)\s*=\s*([\d./]+)""")
            val b = p("""p\(b\)\s*=\s*([\d./]+)""")
            if (ab != null && b != null && b != 0.0) return out(d4(ab / b))
        }
        if (has("""^(?:are|is) (?:events )?a and b independent\b""", q)) {
            val a = p("""p\(a\)\s*=\s*([\d./]+)""")
            val b = p("""p\(b\)\s*=\s*([\d./]+)""")
            val ab = p("""p\(a (?:and|∩) b\)\s*=\s*([\d./]+)""")
            if (a != null && b != null && ab != null) {
                val same = abs(a * b - ab) < 1e-9
                return out((if (same) "Yes: " else "No: ") + "P(A)·P(B) = " + d4(a * b) + (if (same) ", which equals" else ", but") + " P(A and B) = " + d4(ab) + ".")
            }
        }
        m = find("""^how many ways (?:are there )?to (?:choose|select|pick) (\d+) (?:\w+ )?(?:from|out of) (\d+)""", q)
        if (m != null) return out(choose(m[2].toInt(), m[1].toInt()).toString())
        if (has("""\bmean is (greater|more|larger|bigger|less|smaller) than the median\b""", q)) return out(if (has("greater|more|larger|bigger", q)) "Skewed right (positively skewed): a long tail of high values pulls the mean up." else "Skewed left (negatively skewed): a long tail of low values pulls the mean down.")
        if (has("""\bbias\b""", q) && has("""\bonly (?:the )?(?:people|those)\b.*\b(care|choose|want|volunteer)\b""", q)) return out("Voluntary response bias: people who choose to respond tend to hold strong opinions.")
        m = find("""^what does a p-?value of ([\d.]+) mean$""", q)
        if (m != null) {
            val pv = m[1].toDouble()
            return out("If the null hypothesis were true, there would be a ${pcNum(fixed(pv * 100, 2))}% chance of a result at least this extreme. " + if (pv <= 0.01) "That is strong evidence against the null." else if (pv <= 0.05) "That is evidence against the null at the 5% level." else "That is not strong evidence against the null.")
        }
        return null
    }
}
