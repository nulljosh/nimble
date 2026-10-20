package com.nulljosh.nimble

import kotlin.math.E
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.asin
import kotlin.math.atan
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.log10
import kotlin.math.log2
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * BC Pre-Calculus 12 with no network: log bases, exponential equations, geometric sequences, degrees and radians,
 * half-life, polynomials, asymptotes, exact trig values, trig equations, identities and transformations.
 * A line-for-line port of `precalc()` in docs/engine.js, branch for branch in the same order, so the web, the Apple
 * apps (which run engine.js in JavaScriptCore) and Kotlin answer alike. Android has no JavaScript engine to share.
 * Every answer is computed, never looked up. Null for anything else. Graded by OfflineExamJvmTest on test/exam-pc12.js.
 */
internal object Precalc {

    // --- Numbers the way JavaScript prints them ---

    /** `String(+v.toPrecision(p))`: p significant digits, trailing zeros trimmed. ponytail: no exponent form. */
    fun sig(v: Double, p: Int): String {
        if (v.isNaN()) return "NaN"
        if (v.isInfinite()) return if (v > 0) "Infinity" else "-Infinity"
        if (v == 0.0) return "0"
        val a = abs(v)
        val places = p - 1 - floor(log10(a)).toInt()
        val body = if (places >= 0) {
            val digits = floor(a * 10.0.pow(places) + 0.5).toLong().toString().padStart(places + 1, '0')
            val whole = digits.dropLast(places).ifEmpty { "0" }
            val frac = digits.takeLast(places).trimEnd('0')
            if (frac.isEmpty()) whole else "$whole.$frac"
        } else {
            floor(a / 10.0.pow(-places) + 0.5).toLong().toString() + "0".repeat(-places)
        }
        return if (v < 0 && body.any { it in "123456789" }) "-$body" else body
    }

    fun prec(v: Double, p: Int): Double = if (v.isFinite()) sig(v, p).toDouble() else v

    /** `String(v)` for a value worth showing. */
    fun js(v: Double): String = if (v == floor(v) && abs(v) < 1e15) v.toLong().toString() else sig(v, 15)

    /** `+v.toFixed(n)`. */
    fun fixed(v: Double, n: Int): Double = (if (v < 0) -1 else 1) * floor(abs(v) * 10.0.pow(n) + 0.5) / 10.0.pow(n)

    /** `v.toFixed(2)` as text, for money. */
    fun money(v: Double): String {
        val cents = floor(abs(v) * 100 + 0.5).toLong()
        return (if (v < 0) "-" else "") + (cents / 100) + "." + (cents % 100).toString().padStart(2, '0')
    }

    /** JavaScript's Math.round rounds halves up; kotlin.math.round rounds them to even. */
    fun jsRound(v: Double) = floor(v + 0.5)

    fun isInt(v: Double) = v.isFinite() && v == floor(v)

    /** `+s` for a regex group: "" is 0, junk is NaN. */
    fun n(s: String): Double = if (s.isBlank()) 0.0 else s.trim().toDoubleOrNull() ?: Double.NaN

    // --- tryMath ---

    private const val NAMES = "sqrt|sin|cos|tan|log2|log10|log|ln|abs|round|floor|ceil|cbrt"
    private val PERCENT_OF = Regex("""([\d.]+)\s*%\s*of\s*""")
    private val DIGIT_BEFORE_NAME = Regex("""(\d)\s+(?=(?:$NAMES|pi|e)\b)""")
    private val NAME = Regex("""\b(?:$NAMES|pi|e)\b""")
    private val HAS_NUMBER = Regex("""[0-9]|\b(?:pi|e)\b""")
    private val HAS_OP = Regex("""[+\-*/^]|\b(?:$NAMES)\b""")

    /** `tryMath` in docs/engine.js: an expression to a number, rounded to 12 digits, or null. */
    fun tryMath(s: String): Double? {
        val t = s.lowercase().trim().replace(PERCENT_OF, "$1/100*").replace(DIGIT_BEFORE_NAME, "$1*")
        if (!t.replace(NAME, "").all { it in "0123456789+-*/^(). ," }) return null
        if (!HAS_NUMBER.containsMatchIn(t) || !HAS_OP.containsMatchIn(t)) return null
        val v = Expr.eval(t) ?: return null
        return if (v.isFinite()) prec(v, 12) else null
    }

    // --- Helpers, as in engine.js ---

    fun pcNum(v: Double) = sig(v, 10)

    /** A number as a small fraction when it is one ("1/2", "-3"), else its decimal. */
    fun pcFrac(v: Double): String {
        for (d in 1..12) {
            val k = jsRound(v * d)
            if (abs(k / d - v) < 1e-9) return if (d == 1) js(k) else js(k) + "/" + d
        }
        return pcNum(v)
    }

    /** A multiple of pi as "5π/6", "π", "2π", or null when it is not a twelfth of pi. */
    fun pcPi(v: Double): String? {
        val f = pcFrac(v / PI)
        if (!Regex("""^-?\d+(/\d+)?$""").matches(f)) return null
        val parts = f.split("/")
        val num = parts[0]
        val k = if (num == "1") "" else if (num == "-1") "-" else num
        return if (num == "0") "0" else k + "π" + (if (parts.size > 1) "/" + parts[1] else "")
    }

    private val EXACT = listOf(
        0.0 to "0", 0.5 to "1/2", sqrt(2.0) / 2 to "√2/2", sqrt(3.0) / 2 to "√3/2", 1.0 to "1", sqrt(3.0) / 3 to "√3/3",
        sqrt(3.0) to "√3", 2.0 to "2", 2 / sqrt(3.0) to "2√3/3", sqrt(2.0) to "√2", (sqrt(6.0) - sqrt(2.0)) / 4 to "(√6 - √2)/4",
        (sqrt(6.0) + sqrt(2.0)) / 4 to "(√6 + √2)/4", 2 - sqrt(3.0) to "2 - √3", 2 + sqrt(3.0) to "2 + √3",
    )

    /** The exact form of a trig value at a standard angle ("-√3/2"), or null. */
    private fun pcExact(v: Double): String? {
        val hit = EXACT.firstOrNull { abs(abs(v) - it.first) < 1e-9 } ?: return null
        return (if (v < 0 && hit.second != "0") "-" else "") + hit.second
    }

    private val PLAIN_NUMBER = Regex("""^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$""")

    /** A typed number or expression: "5pi/6", "π/3", "0.5", "1/2". */
    fun pcVal(s: String): Double? {
        val t = s.trim().replace("π", "pi").replace(Regex("""(\d)\s*(?=pi\b)"""), "$1*").replace(Regex("^pi$"), "1*pi")
        return if (PLAIN_NUMBER.matches(t)) t.toDouble() else tryMath(t)
    }

    private val GLUE = Regex("""(?<=[\d)])(?=\()""")

    /** An expression in x at one value of x, with "2x" and "3(x+1)" read as products. */
    fun pcAt(expr: String, x: Double): Double? {
        val xs = if (x == floor(x) && abs(x) < 1e15) x.toLong().toString() else sig(x, 17)
        val s = expr.replace(Regex("[−–]"), "-").replace(Regex("""\s+"""), "").replace("x", "($xs)").replace(GLUE, "*")
        // "0+" keeps a bare value ("x" at 5) a calculation, which tryMath requires.
        return tryMath("0+($s)")
    }

    /** A polynomial of degree two or less as [a, b, c], read by evaluating it; null when it is not one. */
    fun pcQuad(expr: String): List<Double>? {
        if ('x' !in expr || Regex("""x\s*\^\s*(?:[3-9]|\d{2})""").containsMatchIn(expr)) return null
        val p = listOf(0.0, 1.0, -1.0, 2.0, 3.0).map { pcAt(expr, it) ?: return null }
        val c = p[0]
        val a = (p[1] + p[2]) / 2 - c
        val b = (p[1] - p[2]) / 2
        return if (listOf(2.0, 3.0).withIndex().all { (i, x) -> abs(a * x * x + b * x + c - p[i + 3]) < 1e-9 }) listOf(a, b, c) else null
    }

    fun pcRoots(co: List<Double>): List<Double> {
        val (a, b, c) = co
        if (abs(a) < 1e-12) return if (abs(b) < 1e-12) emptyList() else listOf(-c / b)
        val d = b * b - 4 * a * c
        if (d < -1e-12) return emptyList()
        val s = sqrt(max(d, 0.0))
        return listOf((-b - s) / (2 * a), (-b + s) / (2 * a)).map { prec(it, 12) }.distinct()
    }

    /** The real roots of a polynomial: the quadratic formula up to degree two, rational candidates p/q above it. */
    private fun pcPolyRoots(expr: String): List<Double>? {
        pcQuad(expr)?.let { return pcRoots(it) }
        if (pcAt(expr, 0.5) == null) return null
        return pcScanRoots(expr)
    }

    /** The highest power of x typed, the polynomial's degree as written. */
    private fun pcDegree(expr: String): Int =
        (listOf(if ('x' in expr) 1 else 0) + Regex("""x\s*\^\s*(\d+)""").findAll(expr).map { it.groupValues[1].toInt() }).max()

    /** A polynomial's degree read from how fast it grows, so "(x - 1)(x + 2)(x - 3)" counts as 3. */
    private fun pcDeg(expr: String): Int? {
        val a = pcAt(expr, 1e4) ?: return null
        val b = pcAt(expr, 2e4) ?: return null
        if (a == 0.0) return null
        val d = log2(abs(b / a))
        return if (abs(d - jsRound(d)) < 0.01 && d > -0.01 && d < 8.5) jsRound(d).toInt() else null
    }

    /** A polynomial's coefficients, highest power first, solved from its values at 0..n. Null when it is not one. */
    fun pcCoeffs(expr: String): List<Double>? {
        val n = pcDeg(expr) ?: return null
        val a = MutableList(n + 1) { i -> MutableList(n + 1) { j -> i.toDouble().pow(n - j) } }
        val ys = MutableList(n + 1) { i -> pcAt(expr, i.toDouble()) ?: return null }
        for (c in 0..n) {
            val p = (c..n).firstOrNull { abs(a[it][c]) > 1e-12 } ?: return null
            a[c] = a[p].also { a[p] = a[c] }
            ys[c] = ys[p].also { ys[p] = ys[c] }
            for (r in 0..n) if (r != c) {
                val f = a[r][c] / a[c][c]
                for (k in c..n) a[r][k] -= f * a[c][k]
                ys[r] -= f * ys[c]
            }
        }
        val co = ys.mapIndexed { i, y -> fixed(y / a[i][i], 9) }
        val at = n + 1.5
        val check = pcAt(expr, at) ?: return null
        if (abs(co.fold(0.0) { s, c -> s * at + c } - check) > 1e-6 * max(1.0, abs(check))) return null
        return co
    }

    /** Coefficients back to text: [1, 0, -1] is "x^2 - 1". */
    fun pcPoly(co: List<Double>): String {
        val n = co.size - 1
        val parts = mutableListOf<String>()
        co.forEachIndexed { i, c ->
            if (abs(c) < 1e-12) return@forEachIndexed
            val p = n - i
            val mag = abs(c)
            val num = pcFrac(mag)
            val body = if (p == 0) num else (if (mag == 1.0) "" else num) + "x" + (if (p > 1) "^$p" else "")
            parts += if (parts.isNotEmpty()) (if (c < 0) "- " else "+ ") + body else (if (c < 0) "-" else "") + body
        }
        return parts.joinToString(" ").ifEmpty { "0" }
    }

    /** Long division of coefficient lists: quotient and remainder. */
    fun pcDivide(num: List<Double>, den: List<Double>): Pair<List<Double>, List<Double>> {
        val q = mutableListOf<Double>()
        val r = num.toMutableList()
        while (r.size >= den.size) {
            val f = r[0] / den[0]
            q += f
            den.forEachIndexed { i, d -> r[i] -= f * d }
            r.removeAt(0)
        }
        return q.ifEmpty { listOf(0.0) } to r.ifEmpty { listOf(0.0) }
    }

    /** The roots of any expression in x that are small fractions p/q, found by trying them. Exact zeros only. */
    fun pcScanRoots(expr: String): List<Double> {
        val found = LinkedHashSet<Double>()
        for (d in 1..6) for (k in -60 * d..60 * d) {
            val x = k.toDouble() / d
            val v = pcAt(expr, x)
            if (v != null && abs(v) < 1e-9) found += prec(x, 12)
        }
        return found.sorted()
    }

    private fun pcShift(h: Double, k: Double) = "f(x" + (if (h != 0.0) (if (h > 0) " - " + pcNum(h) else " + " + pcNum(-h)) else "") + ")" +
        (if (k != 0.0) (if (k > 0) " + " + pcNum(k) else " - " + pcNum(-k)) else "")

    private fun pcSign(r: Double) = if (r < 0) "+ " + pcFrac(-r) else "- " + pcFrac(r)

    private fun shifts(text: String): Pair<Double, Double> {
        var h = 0.0
        var k = 0.0
        for (m in Regex("""(\d+(?:\.\d+)?)\s*(?:units?\s*)?(left|right|up|down)\b""").findAll(text)) {
            val v = m.groupValues[1].toDouble()
            when (m.groupValues[2]) { "left" -> h -= v; "right" -> h += v; "up" -> k += v; else -> k -= v }
        }
        return h to k
    }

    private fun geometric(n: List<Double>, r: Double) = n.indices.all { it == 0 || abs(n[it] - n[it - 1] * r) < 1e-9 }

    private fun compounding(s: String): Int = when (Regex("""compounded (daily|weekly|monthly|quarterly|semi-?annually|annually|yearly)""").find(s)?.groupValues?.get(1)) {
        "daily" -> 365; "weekly" -> 52; "monthly" -> 12; "quarterly" -> 4; "semi-annually", "semiannually" -> 2; else -> 1
    }

    private val FACTS = listOf(
        """^(?:what is )?(?:the )?reciprocal of sine$""" to "Cosecant: csc x = 1/sin x.",
        """^(?:what is )?(?:the )?reciprocal of cosine$""" to "Secant: sec x = 1/cos x.",
        """^(?:what is )?(?:the )?reciprocal of tangent$""" to "Cotangent: cot x = 1/tan x.",
        """^sin\s*\^?\s*2\s*\(?x\)?\s*\+\s*cos\s*\^?\s*2\s*\(?x\)?$""" to "1 (the Pythagorean identity).",
        """^(?:what is )?(?:the )?change of base (?:formula|rule)(?: for logarithms| for logs)?$""" to "logᵦ(x) = log(x)/log(b), using any base for the logs on the right.",
        """^(?:what are )?(?:the )?(?:laws|rules) of (?:logarithms|logs)$""" to "log(ab) = log(a) + log(b), log(a/b) = log(a) - log(b), log(aⁿ) = n·log(a).",
        """^(?:what is )?(?:a )?polynomial of degree (?:3|three) called$""" to "A cubic.",
        """^(?:what is )?(?:a )?polynomial of degree (?:4|four) called$""" to "A quartic.",
        """^(?:what is )?(?:a )?polynomial of degree (?:5|five) called$""" to "A quintic.",
        """^(?:what is )?(?:a )?polynomial of degree (?:2|two) called$""" to "A quadratic.",
        """^simplify sin\s*\(?x\)?\s*\/\s*cos\s*\(?x\)?$""" to "tan x.",
        """^simplify cos\s*\(?x\)?\s*\/\s*sin\s*\(?x\)?$""" to "cot x.",
        """^simplify 1\s*\/\s*cos\s*\(?x\)?$""" to "sec x.",
        """^simplify 1\s*\/\s*sin\s*\(?x\)?$""" to "csc x.",
        """^simplify 1\s*-\s*sin\s*\^?\s*2\s*\(?x\)?$""" to "cos²x.",
        """^simplify 1\s*-\s*cos\s*\^?\s*2\s*\(?x\)?$""" to "sin²x.",
        """^simplify 1\s*\+\s*tan\s*\^?\s*2\s*\(?x\)?$""" to "sec²x.",
        """^(?:the )?(?:cos\s*\(?a\s*\+\s*b\)?|cosine sum)\s*(?:identity|formula)?$|^(?:the )?(?:sum|addition) (?:identity|formula) for cos(?:ine)?$""" to "cos(a + b) = cos a cos b - sin a sin b.",
        """^(?:the )?(?:cos\s*\(?a\s*-\s*b\)?)\s*(?:identity|formula)?$|^(?:the )?difference (?:identity|formula) for cos(?:ine)?$""" to "cos(a - b) = cos a cos b + sin a sin b.",
        """^(?:the )?(?:sin\s*\(?a\s*\+\s*b\)?)\s*(?:identity|formula)?$|^(?:the )?(?:sum|addition) (?:identity|formula) for sin(?:e)?$""" to "sin(a + b) = sin a cos b + cos a sin b.",
        """^(?:the )?(?:sin\s*\(?a\s*-\s*b\)?)\s*(?:identity|formula)?$|^(?:the )?difference (?:identity|formula) for sin(?:e)?$""" to "sin(a - b) = sin a cos b - cos a sin b.",
        """^(?:the )?double[- ]angle (?:identity|formula) for sin(?:e)?$|^sin\s*\(?2x\)?\s*(?:identity|formula)$""" to "sin 2x = 2 sin x cos x.",
        """^(?:the )?double[- ]angle (?:identity|formula|identities|formulas) for cos(?:ine)?$|^cos\s*\(?2x\)?\s*(?:identity|formula)$""" to "cos 2x = cos²x - sin²x = 2cos²x - 1 = 1 - 2sin²x.",
        """^(?:the )?double[- ]angle (?:identity|formula) for tan(?:gent)?$|^tan\s*\(?2x\)?\s*(?:identity|formula)$""" to "tan 2x = 2 tan x/(1 - tan²x).",
        """^(?:what is )?(?:the (?:number|constant) )?e$|^(?:what is )?euler'?s number$""" to "e ≈ 2.718281828, the base of the natural logarithm.",
        """^(?:what is )?(?:the )?remainder theorem$""" to "When a polynomial P(x) is divided by x - a, the remainder is P(a).",
        """^(?:what is )?(?:the )?factor theorem$""" to "x - a is a factor of P(x) exactly when P(a) = 0.",
        """^(?:what is )?(?:the )?domain of (?:y\s*=\s*|f\(x\)\s*=\s*)?(?:log|ln)(?:_?\d+)?\s*\(?x\)?$""" to "x > 0. A logarithm is defined only for positive numbers.",
        """^(?:what is )?(?:the )?range of (?:y\s*=\s*|f\(x\)\s*=\s*)?(?:log|ln)(?:_?\d+)?\s*\(?x\)?$""" to "All real numbers.",
        """^(?:what is )?(?:the )?domain of (?:y\s*=\s*|f\(x\)\s*=\s*)?\d+\s*\^\s*x$""" to "All real numbers.",
        """^(?:what is )?(?:the )?range of (?:y\s*=\s*|f\(x\)\s*=\s*)?\d+\s*\^\s*x$""" to "y > 0.",
        """^(?:what is )?(?:the )?formula for the sum of (?:a |the first n terms of a )?geometric (?:series|sequence)$""" to "Sₙ = a(1 - rⁿ)/(1 - r), for r ≠ 1.",
        """^(?:what is )?(?:the )?formula for (?:the )?(?:sum of )?(?:an |the )?infinite geometric series$""" to "S = a/(1 - r), when |r| < 1.",
    ).map { Regex(it.first) to it.second }

    private fun out(body: String) = Answer.Text(heading = null, body = body, source = "Nimble math")

    private fun has(pattern: String, s: String) = Regex(pattern).containsMatchIn(s)

    /** Groups of the first match, "" for a group that took no part (JavaScript's undefined), or null. */
    private fun find(pattern: String, s: String): List<String>? = Regex(pattern).find(s)?.groupValues

    private fun say(text: List<String>) = out("It " + text.joinToString(", then ") + ".")

    private fun stretch(a: Double) = (if (a > 1) "stretches it vertically by a factor of " else "compresses it vertically by a factor of ") + pcNum(a)

    private fun infiniteSum(a: Double, r: Double) =
        if (abs(r) < 1) pcNum(a / (1 - r)) else "It diverges: the ratio is " + pcFrac(r) + ", and an infinite sum needs |r| < 1."

    private fun angle(v: Double, deg: Boolean) = if (deg) pcNum(v * 180 / PI) + "°" else pcPi(v) ?: pcNum(v)

    fun answer(query: String): Answer? {
        var q = query.trim().lowercase().replace(Regex("[?.!]+$"), "").replace(Regex("[−–]"), "-")
            .replaceFirst(Regex("^(?:what(?:'s|’s| is) |find |calculate |determine )(?:the )?"), "")
        for ((re, body) in FACTS) if (re.containsMatchIn(q)) return out(body)
        Science10.answer(q, query)?.let { return it }
        Chemistry11.answer(q, query)?.let { return it }
        Calculus12.answer(q)?.let { return it }
        Statistics12.answer(q)?.let { return it }
        Apprenticeship12.answer(q)?.let { return it }
        Workplace10.answer(q)?.let { return it }
        Precalc11.answer(q)?.let { return it }
        Precalc10.answer(q)?.let { return it }
        Foundations11.answer(q)?.let { return it }
        Foundations12.answer(q)?.let { return it }
        var m: List<String>?
        // how many roots does a degree 4 (or quartic) polynomial have
        m = find("""^how many (?:roots|zeros|solutions) (?:does|can) (?:a |an )?(?:degree[- ](\d+)|(linear|quadratic|cubic|quartic|quintic)) polynomial have$""", q)
        if (m != null) {
            val k = if (m[1].isNotEmpty()) m[1].toInt() else listOf("linear", "quadratic", "cubic", "quartic", "quintic").indexOf(m[2]) + 1
            return out("$k, counting repeated and complex roots (the fundamental theorem of algebra). At most $k are real.")
        }
        // evaluate log3(1/9), simplify log(100) - log(10): the rest is plain arithmetic
        m = find("""^(?:evaluate|simplify|compute)\s+(.+)$""", q)
        if (m != null) {
            tryMath(m[1])?.let { return Answer.Math(Expr.format(it)) }
            q = m[1]
        }
        // log 8 base 2
        m = find("""^log\s*(?:of\s*)?([\d.]+(?:\s*/\s*[\d.]+)?)\s*(?:to the |in )?base\s*(\d+(?:\.\d+)?)$""", q)
        if (m != null) {
            val v = (pcVal(m[1]) ?: Double.NaN).let { ln(it) / ln(n(m[2])) }
            return if (v.isFinite()) out(pcFrac(prec(v, 12))) else null
        }
        // write 2^5 = 32 in log form; write log3(9) = 2 in exponential form
        m = find("""^(?:write|express|convert|rewrite)\s+(\d+(?:\.\d+)?)\s*\^\s*\(?(-?[\d./]+)\)?\s*=\s*([\d./]+)\s+(?:in|as|to)\s+(?:log|logarithmic)(?: form)?$""", q)
        if (m != null) return out("log${m[1]}(${m[3]}) = ${m[2]}, read as log base ${m[1]} of ${m[3]}.")
        m = find("""^(?:write|express|convert|rewrite)\s+log\s*(?:_\s*)?(\d+(?:\.\d+)?)\s*\(\s*([\d./]+)\s*\)\s*=\s*(-?[\d./]+)\s+(?:in|as|to)\s+exponential(?: form)?$""", q)
        if (m != null) return out("${m[1]}^${m[3]} = ${m[2]}")
        // pH and the Richter scale: base-10 logs with a name
        m = find("""\bph\b.*?(?:concentration|\[h\+?\])\s*(?:of |is |=\s*)?([\d.e-]+(?:\s*[x×]\s*10\s*\^\s*-?\d+)?)""", q)
        if (m != null) {
            val c = pcVal(m[1].replaceFirst(Regex("""\s*[x×]\s*10\s*\^\s*"""), "*10^")) ?: return null
            return if (c > 0) out("pH = " + pcNum(-log10(c))) else null
        }
        m = find("""magnitude\s*([\d.]+).*?(?:times|stronger|more powerful|more intense).*?magnitude\s*([\d.]+)""", q)
            ?: find("""magnitude\s*([\d.]+).*?magnitude\s*([\d.]+).*?(?:times|stronger)""", q)
        if (m != null) return out(pcNum(10.0.pow(abs(n(m[1]) - n(m[2])))) + " times")
        // the transformation y = f(x) shifted 3 left and 2 down
        if (has("""\bshift(?:ed|s)?\b|\btranslated\b|\bmoved\b""", q) && has("""\bf\(x\)""", q) && has("""\b(left|right|up|down)\b""", q)) {
            val (h, k) = shifts(q)
            if (h != 0.0 || k != 0.0) return out("y = " + pcShift(h, k))
        }
        // what transformation maps y = x^2 to y = 3(x - 5)^2 + 1
        m = find("""maps? y\s*=\s*(.+?)\s+(?:to|onto)\s+y\s*=\s*(-?)\s*([\d./]*)\s*\(\s*x\s*([+-])\s*([\d.]+)\s*\)\s*(\^\s*\d+)?\s*(?:([+-])\s*([\d.]+))?$""", q)
        if (m != null) {
            val s = mutableListOf<String>()
            val a = if (m[3].isNotEmpty()) pcVal(m[3]) ?: return null else 1.0
            if (m[2].isNotEmpty()) s += "reflects it across the x-axis"
            if (a != 1.0) s += stretch(a)
            s += "shifts it " + pcNum(n(m[5])) + " units " + (if (m[4] == "-") "right" else "left")
            if (m[7].isNotEmpty()) s += "shifts it " + pcNum(n(m[8])) + " units " + (if (m[7] == "+") "up" else "down")
            return say(s)
        }
        // what happens to y = sqrt(x) when it becomes y = sqrt(x - 3) + 2: read the last equation's a, b, h, k
        if (has("""\b(becomes?|maps?|changes? to|transform(?:ed|s)? (?:in)?to|turns? into)\b""", q)) {
            m = find("""y\s*=\s*(-?)\s*([\d./]*)\s*(?:sqrt|√|log|ln|sin|cos|tan|abs)?\s*([(|])\s*(-?)\s*([\d./]*)\s*\(?\s*x\s*(?:([+-])\s*([\d.]+))?\s*\)?\s*[)|]\s*(?:\^\s*\d+)?\s*(?:([+-])\s*([\d.]+))?\s*$""", q)
            if (m != null) {
                val s = mutableListOf<String>()
                val a = if (m[2].isNotEmpty()) pcVal(m[2]) ?: return null else 1.0
                val b = if (m[5].isNotEmpty()) pcVal(m[5]) ?: return null else 1.0
                if (m[1].isNotEmpty()) s += "reflects it across the x-axis"
                if (m[4].isNotEmpty()) s += "reflects it across the y-axis"
                if (a != 1.0) s += stretch(a)
                if (b != 1.0) s += "compresses it horizontally by a factor of 1/" + pcNum(b)
                if (m[6].isNotEmpty()) s += "shifts it " + pcNum(n(m[7])) + " units " + (if (m[6] == "-") "right" else "left")
                if (m[8].isNotEmpty()) s += "shifts it " + pcNum(n(m[9])) + " units " + (if (m[8] == "+") "up" else "down")
                if (s.isNotEmpty()) return say(s)
            }
        }
        // y = x^3 translated 4 units up
        m = find("""^(?:y\s*=\s*|f\(x\)\s*=\s*)(.+?)\s+(?:is )?(?:translated|shifted|moved)\s+(.+)$""", q)
        if (m != null) {
            val (h, k) = shifts(m[2])
            if (h != 0.0 || k != 0.0) {
                val inner = if (h != 0.0) m[1].replace("x", "(x " + (if (h > 0) "- " + pcNum(h) else "+ " + pcNum(-h)) + ")") else m[1]
                return out("y = " + inner + (if (k != 0.0) (if (k > 0) " + " + pcNum(k) else " - " + pcNum(-k)) else ""))
            }
        }
        // y = |x| reflected in the x-axis (or y-axis)
        m = find("""^(?:y\s*=\s*|f\(x\)\s*=\s*)(.+?)\s+(?:is )?reflected (?:in|across|over|about) the ([xy])-?axis$""", q)
        if (m != null) return out(if (m[2] == "x") "y = -(${m[1]})" else "y = " + m[1].replace("x", "(-x)"))
        // domain of y = sqrt(x - 4), log(x + 2), 1/(x - 3)
        m = find("""^(?:the )?domain of (?:y\s*=\s*|f\(x\)\s*=\s*)?(sqrt|√|log|ln)\s*\(\s*([^()]+)\s*\)$""", q)
            ?: find("""^(?:the )?domain of (?:y\s*=\s*|f\(x\)\s*=\s*)?(\d+)\s*/\s*\(\s*([^()]+)\s*\)$""", q)
        if (m != null) {
            val b = pcAt(m[2], 0.0) ?: return null
            val k = (pcAt(m[2], 1.0) ?: return null) - b
            val two = pcAt(m[2], 2.0) ?: return null
            if (abs(two - b - 2 * k) > 1e-9 || k == 0.0) return null
            val x0 = pcFrac(-b / k)
            val up = k > 0
            if (m[1][0].isDigit()) return out("x ≠ $x0.")
            return out("x " + (if (has("sqrt|√", m[1])) (if (up) "≥ " else "≤ ") else (if (up) "> " else "< ")) + x0 + ".")
        }
        // if f(x) = 2x - 1, find f^-1(5) (or f(5))
        m = find("""f\(x\)\s*=\s*(.+?),?\s+(?:find|what is|evaluate|calculate)\s+(?:the value of )?f\s*(\^\s*\(?-1\)?|⁻¹|inverse)?\s*\(\s*(-?[\d./]+)\s*\)$""", q)
        if (m != null) {
            val a = pcVal(m[3]) ?: return null
            if (m[2].isEmpty()) return pcAt(m[1], a)?.let { out(pcFrac(prec(it, 12))) }
            val xs = pcScanRoots("(${m[1]})-(${js(a)})")
            return if (xs.size == 1) out(pcFrac(xs[0])) else null
        }
        // is the inverse of y = x^2 a function
        if (has("""^is the inverse of (?:y|f\(x\))\s*=\s*x\s*\^\s*2 a function$""", q))
            return out("No. y = x² fails the horizontal line test, so its inverse is a function only if the domain is restricted, such as x ≥ 0.")
        // write 0.333... as a fraction
        val plain = query.trim().lowercase().replaceFirst(Regex("""\?$"""), "").replaceFirst(Regex("^(?:what is |write |convert |express )"), "")
        m = find("""^0\.(\d+)(?:\.\.\.|…)(?: as a fraction| to a fraction| in fraction form)?$""", plain)
        if (m != null && m[1].length <= 15) {
            // The shortest lead-in, then the shortest block that repeats at least twice to the end ("0.1666..." is 1, then 6).
            val d = m[1]
            var pre: String? = null
            var rep = ""
            var lead = 0
            while (lead < d.length && pre == null) {
                val t = d.substring(lead)
                for (k in 1..(t.length / 2)) {
                    val b = t.substring(0, k)
                    if (t.indices.all { t[it] == b[it % k] }) { pre = d.substring(0, lead); rep = b; break }
                }
                lead++
            }
            if (pre == null) return null
            val num = (pre + rep).toLong() - (pre.toLongOrNull() ?: 0L)
            val den = (10.0.pow(rep.length).toLong() - 1) * 10.0.pow(pre.length).toLong()
            tailrec fun gcd(a: Long, b: Long): Long = if (b == 0L) a else gcd(b, a % b)
            val g = gcd(num, den)
            return out("${num / g}/${den / g}")
        }
        // general term and which term, from a geometric list
        val gl = find("""(-?\d+(?:\.\d+)?(?:\s*,\s*-?\d+(?:\.\d+)?){2,})""", q)
        m = find("""^(?:the )?(general term|nth term|explicit formula|which term)\b""", q)
        if (gl != null && m != null) {
            val ns = gl[1].split(Regex("""\s*,\s*""")).map { it.toDouble() }
            val r = ns[1] / ns[0]
            if (!geometric(ns, r)) return null
            if (m[1] == "which term") {
                val t = find("""\bis\s+(-?[\d.]+)$""", q)?.get(1) ?: return null
                val k = prec(ln(n(t) / ns[0]) / ln(r) + 1, 9)
                return if (isInt(k)) out("Term ${js(k)}.") else out("None. It falls between terms.")
            }
            return out("tₙ = " + pcNum(ns[0]) + "·" + (if (r < 0) "(" + pcFrac(r) + ")" else pcFrac(r)) + "^(n - 1)")
        }
        // sum of a geometric series with a = 5, r = 3, n = 4
        if (has("""\bgeometric\b""", q)) {
            m = find("""\ba\s*=\s*(-?[\d./]+).*?\br\s*=\s*(-?[\d./]+)(?:.*?\bn\s*=\s*(\d+))?""", q)
            if (m != null) {
                val a = pcVal(m[1]) ?: return null
                val r = pcVal(m[2]) ?: return null
                if (m[3].isNotEmpty()) return out(pcNum(if (r == 1.0) a * n(m[3]) else a * (1 - r.pow(n(m[3]))) / (1 - r)))
                if ("infinite" in q) return out(if (abs(r) < 1) pcNum(a / (1 - r)) else "It diverges: an infinite geometric sum needs |r| < 1.")
            }
        }
        // infinite sum of 12 - 6 + 3 - ...
        val sumText = query.trim().lowercase().replace(Regex("[−–]"), "-").replaceFirst(Regex("^(?:what is |find )(?:the )?"), "").replaceFirst(Regex("""\?$"""), "")
        m = find("""^(?:the )?(?:infinite )?sum of\s+(-?\s*\d+(?:\.\d+)?(?:/\d+)?(?:\s*[+-]\s*\d+(?:\.\d+)?(?:/\d+)?){2,})\s*[+-]?\s*(?:\.\.\.|…)?$""", sumText)
        if (m != null && has("""(\.\.\.|…|infinite)""", query)) {
            val ns = Regex("""([+-]?)\s*(\d+(?:\.\d+)?(?:/\d+)?)""").findAll(m[1]).map { (if (it.groupValues[1] == "-") -1 else 1) * (pcVal(it.groupValues[2]) ?: Double.NaN) }.toList()
            val r = ns[1] / ns[0]
            if (geometric(ns, r)) return out(if (abs(r) < 1) pcNum(ns[0] / (1 - r)) else "It diverges: the ratio is " + pcFrac(r) + ", and an infinite sum needs |r| < 1.")
        }
        // divide x^3 - 1 by x - 1
        m = find("""^divide\s+(.+?)\s+by\s+(.+)$""", q) ?: find("""^\(?(.+?)\)?\s*(?:÷|divided by)\s*\(?(.+?)\)?$""", q)
        if (m != null) {
            val a = pcCoeffs(m[1])
            val b = pcCoeffs(m[2])
            if (a != null && b != null && a.size >= b.size && 'x' in m[1] && 'x' in m[2]) {
                val (qt, rm) = pcDivide(a, b)
                val rest = if (rm.all { abs(it) < 1e-9 }) "" else ", remainder " + pcPoly(rm.map { fixed(it, 9) })
                return out(pcPoly(qt.map { fixed(it, 9) }) + rest)
            }
        }
        // find k if x - 2 is a factor of x^2 + kx - 6
        m = find("""^(?:the value of )?k\b.*?\bif\s+\(?\s*x\s*([+-])\s*([\d.]+)\s*\)?\s+is a factor of\s+(.+)$""", q.replaceFirst(Regex("""^find\s+"""), ""))
            ?: find("""^(?:find )?k\b.*?\bif\s+\(?\s*x\s*([+-])\s*([\d.]+)\s*\)?\s+is a factor of\s+(.+)$""", q)
        if (m != null) {
            val a = (if (m[1] == "-") 1 else -1) * n(m[2])
            val poly = m[3]
            fun at(k: Int) = pcAt(poly.replace(Regex("""\bk\b|(?<=\d)k|k(?=x)"""), "($k)"), a)
            val p0 = at(0) ?: return null
            val p1 = at(1) ?: return null
            if (p1 == p0) return null
            return out("k = " + pcFrac(prec(-p0 / (p1 - p0), 12)))
        }
        // multiplicity of the root x = 2 in (x - 2)^3
        m = find("""multiplicity of (?:the )?(?:root|zero)\s*(?:x\s*=\s*)?(-?[\d.]+)\s+in\s+(.+)$""", q)
        if (m != null) {
            val a = n(m[1])
            var c = pcCoeffs(m[2]) ?: return null
            var k = 0
            while (c.size > 1) {
                val (qt, rm) = pcDivide(c, listOf(1.0, -a))
                if (abs(rm[0]) > 1e-9) break
                c = qt
                k++
            }
            return out(if (k > 0) "$k" else "0. It is not a root.")
        }
        // y-intercept
        m = find("""^(?:the )?y-?intercept of (?:y\s*=\s*|f\(x\)\s*=\s*)?(.+)$""", q)
        if (m != null) return pcAt(m[1], 0.0)?.let { out("y = " + pcNum(it)) }
        // oblique asymptote and holes of a rational function
        m = find("""^(?:the )?(oblique|slant) asymptote of (?:y\s*=\s*|f\(x\)\s*=\s*)?\(?(.+?)\)?\s*/\s*\(?([^()]+)\)?$""", q)
        if (m != null) {
            val a = pcCoeffs(m[2]) ?: return null
            val b = pcCoeffs(m[3]) ?: return null
            if (a.size != b.size + 1) return out("None. An oblique asymptote needs the top to be one degree higher than the bottom.")
            return out("y = " + pcPoly(pcDivide(a, b).first.map { fixed(it, 9) }))
        }
        m = find("""\bholes?\b.*?(?:y\s*=\s*|f\(x\)\s*=\s*)\(?(.+?)\)?\s*/\s*\(([^()]+)\)$""", q)
        if (m != null) {
            val top = m[1]
            val bottom = m[2]
            val holes = pcScanRoots(bottom).filter { abs(pcAt(top, it) ?: 1.0) < 1e-9 }
            fun f(x: Double) = (pcAt(top, x) ?: Double.NaN) / (pcAt(bottom, x) ?: Double.NaN)
            fun y(r: Double) = pcFrac(fixed((f(r + 1e-7) + f(r - 1e-7)) / 2, 6))
            return out(if (holes.isNotEmpty()) holes.joinToString("; ") { "x = ${pcFrac(it)}, at the point (${pcFrac(it)}, ${y(it)})" } else "None.")
        }
        // phase shift, vertical displacement and range of y = a sin(b(x - c)) + d
        m = find("""^(phase shift|horizontal shift|vertical (?:displacement|shift|translation)|midline|range|max(?:imum)?|min(?:imum)?) of (?:y\s*=\s*|f\(x\)\s*=\s*)?(-?[\d.]*)\s*(sin|cos)\s*\(\s*(?:([\d.]*)\s*\(\s*)?(?:([\d.]*)\s*)?x\s*(?:([+-])\s*([\dπpi./ ]+?))?\s*\)?\s*\)\s*(?:([+-])\s*([\d.]+))?$""", q)
        if (m != null) {
            val a = if (m[2] == "") 1.0 else if (m[2] == "-") -1.0 else n(m[2])
            val d = if (m[8].isNotEmpty()) (if (m[8] == "-") -1 else 1) * n(m[9]) else 0.0
            val b = (if (m[4].isNotEmpty()) n(m[4]) else 1.0) * (if (m[5].isNotEmpty()) n(m[5]) else 1.0)
            val c0 = if (m[6].isNotEmpty()) pcVal(m[7]) ?: return null else 0.0
            val c = (if (m[6] == "-") 1 else -1) * c0 / (if (m[4].isNotEmpty()) 1.0 else b)
            if (has("^(phase|horizontal)", m[1])) return out(if (c == 0.0) "None." else (pcPi(abs(c)) ?: pcNum(abs(c))) + " to the " + (if (c > 0) "right" else "left") + ".")
            if (has("^(vertical|midline)", m[1])) return out(if (m[1].startsWith("midline")) "y = " + pcNum(d) else if (d == 0.0) "None." else pcNum(abs(d)) + " " + (if (d > 0) "up" else "down") + ".")
            if (m[1].startsWith("max")) return out(pcNum(d + abs(a)))
            if (m[1].startsWith("min")) return out(pcNum(d - abs(a)))
            return out(pcNum(d - abs(a)) + " ≤ y ≤ " + pcNum(d + abs(a)))
        }
        // solve sin^2 x = 1/4: sin x = ±1/2
        m = find("""^solve\s+([\d.]*)\s*(sin|cos|tan)\s*\^\s*2\s*\(?x\)?\s*(?:([+-])\s*([\d.]+))?\s*=\s*(-?[\d./]+)(.*)$""", q)
        if (m != null) {
            val rhs = pcVal(m[5]) ?: return null
            val k = (rhs - (if (m[3].isNotEmpty()) (if (m[3] == "-") -1 else 1) * n(m[4]) else 0.0)) / (if (m[1].isNotEmpty()) n(m[1]) else 1.0)
            if (k < 0) return out("No solution: a square is never negative.")
            val f = m[2]
            val two = 2 * PI
            val xs = LinkedHashSet<Double>()
            for (s in listOf(sqrt(k), -sqrt(k))) {
                val base = when (f) { "sin" -> asin(s); "cos" -> acos(s); else -> atan(s) }
                if (base.isNaN()) continue
                val pair = when (f) { "sin" -> listOf(base, PI - base); "cos" -> listOf(base, two - base); else -> listOf(base, base + PI) }
                pair.forEach { xs += prec(((it % two) + two) % two, 12) }
            }
            val deg = has("deg|°|360", m[6])
            return out(if (xs.isNotEmpty()) xs.sorted().joinToString(" or ") { "x = " + angle(it, deg) } else "No solution.")
        }
        // log base 3 of 81, log 5 of 125, log_2(32)
        m = find("""^log(?:arithm)?\s*(?:base\s*|_\s*)?(\d+(?:\.\d+)?)\s*(?:of\s*|\(\s*)([\d.]+(?:\s*/\s*[\d.]+)?)\s*\)?$""", q)
        if (m != null) {
            val v = (pcVal(m[2]) ?: Double.NaN).let { ln(it) / ln(n(m[1])) }
            return if (v.isFinite()) out(pcFrac(prec(v, 12))) else null
        }
        // solve log(x) = 2, log2(x) = 5, ln(x) = 1
        m = find("""^solve\s+([\d.]*)\s*(log|ln)\s*(?:_\s*)?(\d*)\s*\(?\s*x\s*\)?\s*=\s*(-?[\d.]+)$""", q)
        if (m != null) {
            val c = n(m[4]) / (if (m[1].isNotEmpty()) n(m[1]) else 1.0)
            val b = if (m[2] == "ln") E else if (m[3].isNotEmpty()) n(m[3]) else 10.0
            val x = b.pow(c)
            return out("x = " + if (m[2] == "ln") "e^" + pcNum(c) + " ≈ " + pcNum(x) else pcNum(x))
        }
        // expand log(ab), log(a/b), log(a^3)
        m = find("""^expand (log|ln)\s*\(\s*([a-z])\s*(\*|/|\^)?\s*([a-z0-9])\s*\)$""", q)
        if (m != null) {
            val (f, a, op, b) = m.drop(1)
            return out(if (op == "/") "$f($a) - $f($b)" else if (op == "^") "$b·$f($a)" else "$f($a) + $f($b)")
        }
        // solve 3^(x+1) = 27, 2^x = 16, 5^(2x-1) = 125
        m = find("""^(?:solve\s+(?:for x:?\s*)?)?(\d+(?:\.\d+)?)\s*\^\s*\(?\s*(-?\d*(?:\.\d+)?)\s*x\s*(?:([+-])\s*(\d+(?:\.\d+)?))?\s*\)?\s*=\s*(\d+(?:\.\d+)?)$""", q)
        if (m != null) {
            val k = if (m[2] == "") 1.0 else if (m[2] == "-") -1.0 else n(m[2])
            val shift = if (m[3].isNotEmpty()) (if (m[3] == "-") -1 else 1) * n(m[4]) else 0.0
            val x = (ln(n(m[5])) / ln(n(m[1])) - shift) / k
            return if (x.isFinite()) out("x = " + pcFrac(x)) else null
        }
        // the first term is 4 and the common ratio is 1/2: the 6th term, or the sum of the first n
        m = find("""first term (?:is |of |=\s*)?(-?[\d./]+)\b.*?(?:common )?ratio (?:is |of |=\s*)?(-?[\d./]+)""", q)
        if (m != null) {
            val a = pcVal(m[1])
            val r = pcVal(m[2])
            val t = find("""\b(\d+)(?:st|nd|rd|th) term\b""", q)
            val sn = find("""\bsum of (?:the )?first (\d+)""", q)
            if (a != null && r != null && t != null) return out(pcFrac(prec(a * r.pow(n(t[1]) - 1), 12)))
            if (a != null && r != null && sn != null) return out(pcNum(if (r == 1.0) a * n(sn[1]) else a * (1 - r.pow(n(sn[1]))) / (1 - r)))
        }
        // how many terms are in 3, 6, 12, ..., 384 (geometric or arithmetic)
        m = find("""how many terms\b.*?(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(?:\.\.\.|…)\s*,\s*(-?[\d.]+)""", query.lowercase())
        if (m != null) {
            val (a, b, c, z) = m.drop(1).map { n(it) }
            val k = if (b - a == c - b) (z - a) / (b - a) + 1 else if (abs(c / b - b / a) < 1e-9) ln(z / a) / ln(b / a) + 1 else Double.NaN
            val kp = prec(k, 9)
            return if (isInt(kp) && k > 0) out("${js(kp)} terms") else null
        }
        // a town of 15000 grows 2% per year; a car worth $30000 depreciates 15% per year. Value after n.
        m = find("""([\d,]+(?:\.\d+)?)\b.*?\b(grows?|increases?|appreciates?|rises?|decays?|decreases?|depreciates?|loses?|declines?|drops?|falls?)\b(?: by| at)?\s*([\d.]+)\s*%\s*(?:per|a|each|every)\s*([a-z]+).*?after ([\d.]+)""", q)
        if (m != null) {
            val down = has("^(decay|decreas|depreciat|los|declin|drop|fall)", m[2])
            val v = n(m[1].replace(",", "")) * (1 + (if (down) -1 else 1) * n(m[3]) / 100).pow(n(m[5]))
            return out(if ('$' in q) "$" + money(v) else pcNum(fixed(v, 1)))
        }
        // how long for 100 g to decay to 25 g with a half-life of 6 hours
        m = find("""how long\b.*?([\d.]+)\s*[a-zµ]*\s*to (?:decay |drop |fall |reduce |shrink )?to ([\d.]+).*?half[- ]life (?:of |is )?([\d.]+)\s*([a-z]+)""", q)
        if (m != null) {
            val t = n(m[3]) * ln(n(m[2]) / n(m[1])) / ln(0.5)
            return if (t.isFinite() && t > 0) out(pcNum(fixed(t, 4)) + " " + m[4]) else null
        }
        // first term of a geometric sequence with r = 2 and 5th term 48
        m = find("""\bfirst term\b.*?\br\s*(?:=|is)\s*(-?[\d./]+).*?\b(\d+)(?:st|nd|rd|th) term (?:is |of |=\s*)?(-?[\d.]+)""", q)
        if (m != null) {
            val r = pcVal(m[1]) ?: return null
            return out(pcFrac(prec(n(m[3]) / r.pow(n(m[2]) - 1), 12)))
        }
        // a list of numbers, then what to do with it
        val num = """-?\d+(?:\.\d+)?(?:/\d+)?"""
        val list = Regex("""($num(?:\s*[,+]\s*$num){2,})""").find(q)?.groupValues
            ?: if (has("""\b(?:common ratio|terms? of|term in)\b""", q)) Regex("""($num\s*,\s*$num)""").find(q)?.groupValues else null
        if (list != null && (has("""\b(?:geometric|common ratio|terms? of|term in|series|converge|diverge)\b""", q) || has("""^sum of\b.*(\.\.\.|…)""", query.lowercase()))) {
            val ns = list[1].split(Regex("""\s*[,+]\s*""")).map { pcVal(it) ?: return null }
            val r = ns[1] / ns[0]
            val geo = r.isFinite() && geometric(ns, r)
            if (has("""^is\b""", q)) return out(
                if (geo) "Yes. Each term is ${pcFrac(r)} times the one before."
                else "No. The ratios between terms are not equal (" + ns.drop(1).mapIndexed { i, v -> pcNum(v / ns[i]) }.joinToString(", ") + ")."
            )
            if (!geo) return null
            if (has("""\b(?:converge|diverge)""", q)) return out(
                if (abs(r) < 1) "Yes. The ratio is ${pcFrac(r)}, so it converges to ${pcNum(ns[0] / (1 - r))}."
                else "No. It diverges: the ratio is ${pcFrac(r)}, and it needs |r| < 1."
            )
            if (has("""(\.\.\.|…)\s*\??$""", query.trim()) && !has("""\bfirst \d+ terms\b""", q)) return out(infiniteSum(ns[0], r))
            if ("common ratio" in q) return out(pcFrac(r))
            find("""\b(\d+)(?:st|nd|rd|th) term\b""", q)?.let { return out(pcNum(ns[0] * r.pow(n(it[1]) - 1))) }
            find("""\bsum of (?:the )?first (\d+) terms\b""", q)?.let {
                return out(pcNum(if (r == 1.0) ns[0] * n(it[1]) else ns[0] * (1 - r.pow(n(it[1]))) / (1 - r)))
            }
            if (has("""\binfinite\b""", q)) return out(infiniteSum(ns[0], r))
        }
        if (has("""\binfinite geometric\b""", q)) {
            m = find("""first term (?:of |is )?(-?[\d.]+).*?ratio (?:of |is )?(-?[\d./]+)""", q)
            if (m != null) {
                val a = n(m[1])
                val r = pcVal(m[2])
                if (r != null) return out(if (abs(r) < 1) pcNum(a / (1 - r)) else "It diverges: an infinite geometric sum needs |r| < 1.")
            }
        }
        // decays from 80 g to 10 g in 12 days: the half-life (or doubling time) from two amounts
        m = find("""from ([\d.]+)\s*([a-zµ]*)\s*to ([\d.]+)\s*[a-zµ]*\s*(?:in|over|after) ([\d.]+)\s*([a-z]+)""", q)
        if (m != null && has("half[- ]life|doubling time", q)) {
            val r = n(m[3]) / n(m[1])
            val t = n(m[4]) * ln(if ("half" in q) 0.5 else 2.0) / ln(r)
            return if (t.isFinite() && t > 0) out(pcNum(fixed(t, 4)) + " " + m[5]) else null
        }
        // 100 g with a half life of 5 years; a population of 200 doubles every 3 hours. How much after T?
        // "What fraction is left" needs no amount; a number glued to a name ("carbon-14") is never the amount.
        m = find("""(?:.*?(?<![-\w.])([\d.]+)\s*([a-zµ]+)?\b|^).*?(half[- ]life (?:of |is )?|doubles every |triples every )([\d.]+)\s*([a-z]+).*?after ([\d.]+)""", q)
        val share = has("""\b(fraction|percent|proportion)\b""", q)
        if (m != null && (m[1].isNotEmpty() || share)) {
            val k = if (m[3].startsWith("half")) 0.5 else if (m[3].startsWith("doubles")) 2.0 else 3.0
            val f = k.pow(n(m[6]) / n(m[4]))
            if (m[1].isEmpty() || share) return out(pcFrac(f) + " (" + pcNum(f * 100) + "%)")
            val left = n(m[1]) * f
            return out(pcNum(left) + if (m[2].isNotEmpty() && !has("^(with|has|of|doubles|triples|grows|is)$", m[2])) " " + m[2] else "")
        }
        // how long until $1000 doubles at 7% compounded annually
        m = find("""^how (?:long|many years)\b.*?\$?\s*([\d,]+(?:\.\d+)?)\s*(?:to )?(?:grows?|increases?|becomes?)?\s*(?:to )\$?\s*([\d,]+(?:\.\d+)?)\b.*? at ([\d.]+)\s*%(.*)$""", q)
        if (m != null) {
            val k = compounding(m[4])
            val t = ln(n(m[2].replace(",", "")) / n(m[1].replace(",", ""))) / (k * ln(1 + n(m[3]) / 100 / k))
            if (t.isFinite() && t > 0) return out(pcNum(fixed(t, 2)) + " years")
        }
        m = find("""^how (?:long|many years)\b.*?\b(doubles?|triples?)\b.*? at ([\d.]+)\s*%(.*)$""", q)
        if (m != null) {
            val k = compounding(m[3])
            val t = ln(if (m[1].startsWith("d")) 2.0 else 3.0) / (k * ln(1 + n(m[2]) / 100 / k))
            return out(pcNum(fixed(t, 2)) + " years")
        }
        // $500 invested at 4% compounded monthly for 3 years
        m = find("""(?:\$\s*([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s*dollars)\D*?(?:after|for|over|in) ([\d.]+) years?\s*(?:at|with) ([\d.]+)\s*%(.*)$""", q)
        if (m != null) {
            val k = compounding(m[5])
            return out("$" + money(n(m[1].ifEmpty { m[2] }.replace(",", "")) * (1 + n(m[4]) / 100 / k).pow(k * n(m[3]))))
        }
        m = find("""(?:\$\s*([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s*dollars)\s*(?:[a-z]+ ){0,4}?at ([\d.]+)\s*%(.*?)\b(?:for|after|over) ([\d.]+) years?""", q)
        if (m != null) {
            val k = compounding(m[4])
            return out("$" + money(n(m[1].ifEmpty { m[2] }.replace(",", "")) * (1 + n(m[3]) / 100 / k).pow(k * n(m[5]))))
        }
        // degrees and radians
        m = find("""^(?:convert )?(.+?)\s*(?:degrees?|deg|°)\s+(?:to|in|into)\s+radians?$""", q)
        if (m != null) {
            val d = pcVal(m[1]) ?: return null
            val pi = pcPi(d * PI / 180)
            return out((if (pi != null) "$pi ≈ " else "") + pcNum(d * PI / 180) + " radians")
        }
        m = find("""^(?:convert )?(.+?)\s*(?:radians?|rad)\s+(?:to|in|into)\s+degrees?$""", q)
            ?: find("""^(?:convert )?(.+?)\s+(?:to|in|into)\s+degrees?$""", q)?.takeIf { has("π|pi", it[1]) }
        if (m != null) return pcVal(m[1])?.let { out(pcNum(it * 180 / PI) + "°") }
        // remainder when x^3 - 2x + 1 is divided by x - 2
        m = find("""^(?:the )?remainder (?:when |of )?(.+?) (?:is )?divided by \(?\s*x\s*([+-])\s*([\d.]+)\s*\)?$""", q)
        if (m != null) return pcAt(m[1], (if (m[2] == "-") 1 else -1) * n(m[3]))?.let { out(pcNum(it)) }
        // is x - 1 a factor of x^3 - 1
        m = find("""^is \(?\s*x\s*([+-])\s*([\d.]+)\s*\)? a factor of (.+)$""", q)
        if (m != null) {
            val a = (if (m[1] == "-") 1 else -1) * n(m[2])
            val v = pcAt(m[3], a) ?: return null
            return out(if (abs(v) < 1e-9) "Yes. P(${pcNum(a)}) = 0." else "No. P(${pcNum(a)}) = ${pcNum(v)}, so that is the remainder.")
        }
        // horizontal asymptote and end behaviour, read from far out along x
        m = find("""^horizontal asymptotes? of (?:y\s*=\s*|f\(x\)\s*=\s*)?(.+)$""", q)
        if (m != null) {
            val a = pcAt(m[1], 1e6) ?: return null
            val b = pcAt(m[1], 1e7) ?: return null
            return out(if (abs(a - b) < 1e-3 * max(1.0, abs(b))) "y = " + pcFrac(fixed(b, 4)) else "None. It grows without bound.")
        }
        m = find("""^end behaviou?r of (?:y\s*=\s*|f\(x\)\s*=\s*)?(.+)$""", q)
        if (m != null) {
            val hi = pcAt(m[1], 1e6) ?: return null
            val lo = pcAt(m[1], -1e6) ?: return null
            fun to(v: Double) = if (abs(v) < 1e3) pcNum(fixed(v, 4)) else if (v > 0) "∞" else "-∞"
            return out("As x → ∞, y → ${to(hi)}. As x → -∞, y → ${to(lo)}.")
        }
        // roots, zeros, solving and factoring a polynomial
        val rootsOf = """^(?:roots?|zeros?|solve|factor|x-intercepts?)\s+(?:of\s+)?(?:y\s*=\s*|f\(x\)\s*=\s*)?(.+?)(?:\s*=\s*0)?$"""
        val eq = Regex("""^([^=]+)=([^=]+)$""")
        m = find(rootsOf, q)
        if (m != null) {
            val e = m[1].replace(eq, "($1)-($2)")
            if (has("""x\s*\^\s*[3-6]""", e) || (pcDeg(e) ?: 0) > 2) {
                val roots = pcPolyRoots(e) ?: return null
                val deg = pcDeg(e) ?: pcDegree(e)
                val lead = jsRound((pcAt(e, 1e4) ?: 0.0) / 1e4.pow(deg))
                if (q.startsWith("factor")) {
                    val co = pcCoeffs(e)
                    if (co != null && roots.isNotEmpty() && roots.size < deg && isInt(roots[0])) {
                        val (rest, rm) = pcDivide(co, listOf(1.0, -roots[0]))
                        if (abs(rm[0]) < 1e-9 && rest.all { isInt(fixed(it, 9)) }) return out("(x " + pcSign(roots[0]) + ")(" + pcPoly(rest.map { fixed(it, 9) }) + ")")
                    }
                    if (roots.size != deg || roots.any { !isInt(it) }) return out(
                        if (roots.isNotEmpty()) "Its rational roots are " + roots.joinToString(", ") { pcFrac(it) } + ", but it does not split into integer factors."
                        else "It has no rational roots."
                    )
                    val head = if (lead == 1.0) "" else if (lead == -1.0) "-" else js(lead)
                    return out(head + roots.sortedBy { if (it == 0.0) 0 else 1 }.joinToString("") { if (it == 0.0) "x" else "(x " + pcSign(it) + ")" })
                }
                return out(if (roots.isNotEmpty()) roots.joinToString(", ") { "x = " + pcFrac(it) } else "No rational roots.")
            }
            if (has("""x\s*\^\s*2|x²""", e)) {
                val co = pcQuad(e.replace("x²", "x^2")) ?: return null
                val roots = pcRoots(co)
                if (q.startsWith("factor")) {
                    // Each rational root p/q is a factor (qx - p); what is left over of the leading coefficient leads.
                    val parts = (if (roots.size == 1) listOf(roots[0], roots[0]) else roots).map { r ->
                        pcFrac(r).split("/").map { it.toDouble() }.let { it[0] to (it.getOrNull(1) ?: 1.0) }
                    }
                    if (roots.isEmpty() || parts.any { (p, d) -> !isInt(p) || !isInt(d) }) return out("It does not factor over the integers.")
                    val k = co[0] / parts.fold(1.0) { a, (_, d) -> a * d }
                    if (!isInt(prec(k, 12))) return out("It does not factor over the integers.")
                    val head = if (k == 1.0) "" else if (k == -1.0) "-" else pcNum(k)
                    return out(head + parts.joinToString("") { (p, d) -> "(" + (if (d == 1.0) "" else js(d)) + "x " + (if (p < 0) "+ " + js(-p) else "- " + js(p)) + ")" })
                }
                return out(if (roots.isNotEmpty()) roots.joinToString(" and ") { "x = " + pcFrac(it) } else "No real roots.")
            }
        }
        m = find("""^(?:roots?|zeros?|solve|x-intercepts?)\s+(?:of\s+)?(?:y\s*=\s*|f\(x\)\s*=\s*)?(.+?)(?:\s*=\s*0)?$""", q)
        if (m != null && 'x' in m[1] && !has("""\b(sin|cos|tan|log|ln)\b""", m[1])) {
            val roots = pcScanRoots(m[1].replace(eq, "($1)-($2)"))
            if (roots.size in 1..6) return out(roots.joinToString(", ") { "x = " + pcFrac(it) })
        }
        // vertical asymptote of y = 1/(x - 3)
        m = find("""^vertical asymptotes? of (?:y\s*=\s*|f\(x\)\s*=\s*)?(.+?)\s*/\s*\((.+)\)$""", q)
        if (m != null) {
            val top = m[1]
            val co = pcQuad(m[2]) ?: return null
            val xs = pcRoots(co).filter { abs(pcAt(top, it) ?: 1.0) > 1e-9 }
            return out(if (xs.isNotEmpty()) xs.joinToString(" and ") { "x = " + pcFrac(it) } else "None.")
        }
        // amplitude and period of y = 3sin(2x)
        m = find("""^(amplitude and period|period and amplitude|amplitude|period) of (?:y\s*=\s*|f\(x\)\s*=\s*)?(-?[\d.]*)\s*(sin|cos|tan)\s*\(?\s*(-?[\d.]*\s*(?:π|pi)?)\s*x\s*(?:/\s*([\d.]+))?""", q)
        if (m != null) {
            val tan = m[3] == "tan"
            val a = if (m[2] == "" || m[2] == "-") 1.0 else abs(n(m[2]))
            val b0 = m[4].trim()
            val b = (if (b0 == "" || b0 == "-") 1.0 else abs(pcVal(b0) ?: Double.NaN)) / (if (m[5].isNotEmpty()) n(m[5]) else 1.0)
            val amp = if (tan) "none (tangent has no amplitude)" else pcNum(a)
            val p = (if (tan) PI else 2 * PI) / b
            val per = (pcPi(p) ?: pcNum(p)) + (if (pcPi(p) != null) " ≈ " + pcNum(p) else "")
            if (m[1] == "amplitude") return out(if (tan) "None: tangent has no amplitude." else amp)
            if (m[1] == "period") return out(per)
            return out("Amplitude $amp, period $per.")
        }
        // solve sin x = 1/2 for 0 ≤ x < 2π
        m = find("""^solve\s+(-?[\d.]*)\s*(sin|cos|tan)\s*\(?x\)?\s*(?:([+-])\s*([\d.]+))?\s*=\s*(-?[^\s,]+)(.*)$""", q)
        if (m != null) {
            val coef = if (m[1] == "") 1.0 else if (m[1] == "-") -1.0 else n(m[1])
            val shift = if (m[3].isNotEmpty()) (if (m[3] == "-") -1 else 1) * n(m[4]) else 0.0
            val rhs = pcVal(m[5].replace(Regex("""√(\d)"""), "sqrt($1)")) ?: return null
            val k = (rhs - shift) / coef
            val f = m[2]
            val base = when (f) { "sin" -> asin(k); "cos" -> acos(k); else -> atan(k) }
            if (base.isNaN()) return out("No solution: sine and cosine stay between -1 and 1.")
            val two = 2 * PI
            val pair = when (f) { "sin" -> listOf(base, PI - base); "cos" -> listOf(base, two - base); else -> listOf(base, base + PI) }
            val xs = pair.map { prec(((it % two) + two) % two, 12) }.distinct().sorted()
            val deg = has("deg|°|360", m[6])
            return out(xs.joinToString(" or ") { "x = " + angle(it, deg) })
        }
        // sin 30 degrees, exact value of cos(5pi/6), tan(45°)
        m = find("""^(?:the )?(exact value of )?(sin|cos|tan|csc|sec|cot)(?![a-z])\s*\(?\s*([^)°]+?)\s*(°|degrees?|deg)?\s*\)?\s*(°|degrees?|deg)?$""", q)
        if (m != null) {
            val a = pcVal(m[3]) ?: return null
            val rad = if (m[4].isNotEmpty() || m[5].isNotEmpty()) a * PI / 180 else a
            val s = sin(rad)
            val c = cos(rad)
            val v = when (m[2]) { "sin" -> s; "cos" -> c; "tan" -> s / c; "csc" -> 1 / s; "sec" -> 1 / c; else -> c / s }
            if (!v.isFinite() || abs(v) > 1e12) return out("Undefined at that angle.")
            val exact = pcExact(v)
            return out(if (exact != null && exact != pcNum(v)) "$exact ≈ ${pcNum(v)}" else pcNum(v))
        }
        // quadrant, coterminal and reference angles, in degrees (or radians when the angle names pi)
        m = find("""^(?:what |which )?(quadrant|coterminal angles?|reference angle)\s+(?:is |of |for |does )?(?:the angle )?(-?[\d.]+\s*(?:π|pi)?(?:\s*/\s*\d+)?)\s*(°|degrees?|deg|radians?)?(?: in| lie in| fall in)?$""", q)
            ?: find("""^(?:what |which )?(quadrant) (?:is |does )?(-?[\d.]+)\s*(°|degrees?|deg)? (?:in|lie in)$""", q)
        if (m != null) {
            val rad = has("π|pi", m[2]) || m[3].startsWith("rad")
            val a = pcVal(m[2]) ?: return null
            val deg = if (rad) a * 180 / PI else a
            val d = ((deg % 360) + 360) % 360
            fun show(v: Double) = if (rad) pcPi(v * PI / 180) ?: pcNum(v * PI / 180) else pcNum(v) + "°"
            if (m[1].startsWith("quadrant")) return out(if (d % 90 == 0.0) "None. It lies on an axis." else "Quadrant " + listOf("I", "II", "III", "IV")[floor(d / 90).toInt()] + ".")
            if (m[1].startsWith("coterminal")) return out(show(if (abs(d - deg) < 1e-9) deg - 360 else d) + " and " + show(deg + 360) + " (any multiple of " + (if (rad) "2π" else "360°") + " away).")
            return out(show(if (d <= 90) d else if (d <= 180) 180 - d else if (d <= 270) d - 180 else 360 - d))
        }
        // prove tan x cos x = sin x: checked at many points, then the method
        m = find("""^(?:prove|verify|show)(?: that)?\s+(.+?)\s*=\s*(.+)$""", q)
        if (m != null && has("""\b(sin|cos|tan|sec|csc|cot)\b""", m[0])) {
            fun t(e: String) = e.replace(Regex("""\b(sin|cos|tan|sec|csc|cot)\s*\^\s*(\d)\s*\(?\s*x\s*\)?"""), "($1(x))^$2")
                .replace(Regex("""\b(sin|cos|tan|sec|csc|cot)\s*\(?\s*x\s*\)?"""), "$1(x)")
                .replace("sec(x)", "(1/cos(x))").replace("csc(x)", "(1/sin(x))").replace("cot(x)", "(cos(x)/sin(x))")
                .replace(Regex("""\)\s*(?=[a-z(\d])"""), ")*").replace(Regex("""(\d)\s*(?=[a-z(])"""), "$1*")
            fun at(e: String, x: Double) = tryMath("0+(" + t(e).replace(Regex("""\bx\b"""), "(${js(x)})") + ")")
            val left = m[1]
            val right = m[2]
            fun same(x: Double): Boolean {
                val a = at(left, x)
                val b = at(right, x)
                return a != null && b != null && abs(a - b) < 1e-9
            }
            val xs = listOf(0.3, 0.7, 1.1, 2.0, 2.9, 4.2, 5.5)
            return out(
                if (xs.all { same(it) }) "True wherever both sides are defined. To prove it, write everything in sin and cos (tan x = sin x/cos x, sec x = 1/cos x, csc x = 1/sin x, cot x = cos x/sin x) and simplify one side until it matches the other."
                else "Not an identity: the two sides differ, for example at x = ${js(xs.first { !same(it) })}."
            )
        }
        // solve 1/x = 4, or any equation in x whose roots are small fractions
        m = find("""^solve\s+(?:for x:?\s*)?([^=]*x[^=]*)=\s*([^=]+)$""", q)
        if (m != null && !has("""\b(sin|cos|tan|log|ln)\b""", q)) {
            val roots = pcScanRoots("(${m[1]})-(${m[2]})")
            if (roots.size in 1..6) return out(roots.joinToString(" or ") { "x = " + pcFrac(it) })
        }
        // sector area with radius 4 and angle pi/2
        m = find("""^(?:the )?(?:area of (?:a |the )?sector|sector area)\b.*?radius (?:of |is )?([\d.]+).*?angle (?:of |is )?([\d.π/pi ]+?)\s*(radians?|rad|degrees?|°)?$""", q)
        if (m != null) {
            val t0 = pcVal(m[2]) ?: return null
            val t = if (has("^d|°", m[3])) t0 * PI / 180 else t0
            val area = n(m[1]).pow(2) * t / 2
            return out((pcPi(area)?.let { "$it ≈ " } ?: "") + pcNum(area))
        }
        // arc length with radius 5 and angle 2 radians
        m = find("""^arc length\b.*?radius (?:of |is )?([\d.]+).*?angle (?:of |is )?([\d.π/pi ]+?)\s*(radians?|rad|degrees?|°)?$""", q)
        if (m != null) {
            val t = pcVal(m[2]) ?: return null
            return out(pcNum(n(m[1]) * if (has("^d|°", m[3])) t * PI / 180 else t))
        }
        // inverse of y = 2x + 3
        m = find("""^(?:the )?inverse (?:function )?of (?:y|f\(x\))\s*=\s*([-+*/.\d x()]+)$""", q)
        if (m != null && 'x' in m[1]) {
            val b = pcAt(m[1], 0.0) ?: return null
            val k0 = pcAt(m[1], 1.0) ?: return null
            val k2 = pcAt(m[1], 2.0) ?: return null
            if (abs((k2 - b) - 2 * (k0 - b)) > 1e-9 || k0 == b) return null
            // f⁻¹(x) = (x - b)/k, written over one whole-number denominator: (3x - 1)/2, not decimals.
            val k = k0 - b
            val slope = 1 / k
            val cut = -b / k
            fun den(v: Double) = pcFrac(prec(v, 9)).split("/").getOrNull(1)?.toDouble() ?: 1.0
            val l = (1..12).firstOrNull { it % den(slope) == 0.0 && it % den(cut) == 0.0 }
                ?: return out("f⁻¹(x) = (x - ${pcNum(b)})/${pcNum(k)}")
            val a = jsRound(slope * l).toLong()
            val c = jsRound(cut * l).toLong()
            val top = (if (a == 1L) "" else if (a == -1L) "-" else "$a") + "x" + (if (c != 0L) (if (c > 0) " + $c" else " - ${-c}") else "")
            return out("f⁻¹(x) = " + if (l == 1) top else (if (c != 0L) "($top)" else top) + "/" + l)
        }
        // what does y = -2f(3(x - 1)) + 4 do to the graph
        m = find("""y\s*=\s*(-?)\s*([\d./]*)\s*f\s*\(\s*x\s*/\s*(\d+(?:\.\d+)?)\s*\)""", q)
        if (m != null && has("""\b(do|does|graph|describe|change|changes|effect)\b""", q)) return out("It stretches it horizontally by a factor of ${pcNum(n(m[3]))}.")
        m = find("""y\s*=\s*(-?)\s*([\d./]*)\s*f\s*\(\s*(-?)\s*([\d./]*)\s*(?:\(\s*)?x\s*(?:([+-])\s*([\d.]+))?\s*\)?\s*\)\s*(?:([+-])\s*([\d.]+))?""", q)
        if (m != null && has("""\b(do|does|graph|transform|transformation|effect|describe|change|changes|related|relate|compare)\b""", q)) {
            val a = if (m[2].isNotEmpty()) pcVal(m[2]) ?: Double.NaN else null
            val b = if (m[4].isNotEmpty()) pcVal(m[4]) ?: Double.NaN else null
            val s = mutableListOf<String>()
            if (m[1].isNotEmpty()) s += "reflects it across the x-axis"
            if (m[3].isNotEmpty()) s += "reflects it across the y-axis"
            if (a != null && a != 1.0) s += stretch(a)
            if (b != null && b != 1.0) s += "compresses it horizontally by a factor of 1/" + pcNum(b) + (if (b < 1) " (a stretch)" else "")
            if (m[5].isNotEmpty()) s += "shifts it " + pcNum(n(m[6])) + " units " + (if (m[5] == "-") "right" else "left")
            if (m[7].isNotEmpty()) s += "shifts it " + pcNum(n(m[8])) + " units " + (if (m[7] == "+") "up" else "down")
            if (s.isNotEmpty()) return say(s)
        }
        return null
    }
}
