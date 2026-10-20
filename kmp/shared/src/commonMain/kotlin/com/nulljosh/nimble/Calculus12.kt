package com.nulljosh.nimble

import com.nulljosh.nimble.Precalc.fixed
import com.nulljosh.nimble.Precalc.isInt
import com.nulljosh.nimble.Precalc.jsRound
import com.nulljosh.nimble.Precalc.pcFrac
import com.nulljosh.nimble.Precalc.pcNum
import com.nulljosh.nimble.Precalc.pcVal
import com.nulljosh.nimble.Precalc.prec
import kotlin.math.E
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.log10
import kotlin.math.pow
import kotlin.math.sign
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tan

private val LN10 = ln(10.0)

/**
 * BC Calculus 12 with no network. A small symbolic engine for expressions in x (parse, differentiate, simplify, print
 * the way a textbook does), integrals of the standard forms, definite integrals by Simpson's rule, limits from both
 * sides, critical points, concavity, motion and related rates. A port of `calc12()` and its helpers in docs/engine.js,
 * function for function. Precalc.answer asks it first.
 */
internal object Calculus12 {

    sealed class C {
        data class N(val v: Double) : C()
        object X : C() { override fun toString() = "X" }
        object Euler : C()
        data class Sum(val ts: List<C>) : C()
        data class Prod(val fs: List<C>) : C()
        data class Div(val a: C, val b: C) : C()
        data class Pow(val a: C, val b: C) : C()
        data class F(val f: String, val a: C) : C()
    }

    private val names = listOf("sqrt", "sin", "cos", "tan", "sec", "csc", "cot", "ln", "log", "exp", "abs", "pi", "e", "x")

    /** Null when it is not an expression in x. */
    fun parse(src: String): C? {
        val s = src.lowercase().replace(Regex("""\|([^|]+)\|"""), "abs($1)").replace("π", "pi").replace(Regex("""√\s*\("""), "sqrt(")
            .replace(Regex("""√\s*([a-z0-9.]+)"""), "sqrt($1)").replace(Regex("""\s+"""), "")
        return try { Parser(s).run { val v = sum(); if (i == s.length) v else null } } catch (_: IllegalArgumentException) { null }
    }

    private class Parser(val s: String) {
        var i = 0
        private fun fail(): Nothing = throw IllegalArgumentException()
        private fun at() = s.getOrNull(i)

        fun atom(): C {
            val c = at() ?: fail()
            if (c == '(') { i++; val v = sum(); if (s.getOrNull(i++) != ')') fail(); return v }
            Regex("""^(?:\d+\.?\d*|\.\d+)""").find(s.substring(i))?.let { i += it.value.length; return C.N(it.value.toDouble()) }
            val name = names.firstOrNull { s.startsWith(it, i) } ?: fail()
            i += name.length
            return when (name) {
                "x" -> C.X
                "pi" -> C.N(PI)
                "e" -> C.Euler
                else -> {
                    var pw: C? = null
                    if (at() == '^') { i++; pw = atom() }
                    val f = C.F(name, if (at() == '(') atom() else power())
                    if (pw != null) C.Pow(f, pw) else f
                }
            }
        }

        fun power(): C {
            val b = atom()
            if (at() == '^') { i++; val e = unary(); return if (b == C.Euler) C.F("exp", e) else C.Pow(b, e) }
            return if (b == C.Euler) C.N(E) else b
        }

        fun unary(): C = when (at()) {
            '-' -> { i++; C.Prod(listOf(C.N(-1.0), unary())) }
            '+' -> { i++; unary() }
            else -> power()
        }

        fun prod(): C {
            var a = unary()
            while (true) {
                val c = at()
                a = when {
                    c == '*' -> { i++; C.Prod(listOf(a, unary())) }
                    c == '/' -> { i++; C.Div(a, unary()) }
                    c != null && (c.isDigit() || c == '(' || c == '.' || c in 'a'..'z') -> C.Prod(listOf(a, power()))
                    else -> return a
                }
            }
        }

        fun sum(): C {
            val ts = mutableListOf(prod())
            while (at() == '+' || at() == '-') { val neg = s[i++] == '-'; val b = prod(); ts += if (neg) C.Prod(listOf(C.N(-1.0), b)) else b }
            return if (ts.size == 1) ts[0] else C.Sum(ts)
        }
    }

    fun hasX(n: C): Boolean = when (n) {
        C.X -> true
        is C.Sum -> n.ts.any(::hasX)
        is C.Prod -> n.fs.any(::hasX)
        is C.Div -> hasX(n.a) || hasX(n.b)
        is C.Pow -> hasX(n.a) || hasX(n.b)
        is C.F -> hasX(n.a)
        else -> false
    }

    private fun fn(f: String, v: Double) = when (f) {
        "sin" -> sin(v); "cos" -> cos(v); "tan" -> tan(v); "sec" -> 1 / cos(v); "csc" -> 1 / sin(v); "cot" -> 1 / tan(v)
        "ln" -> ln(v); "log" -> log10(v); "exp" -> exp(v); "sqrt" -> sqrt(v); else -> abs(v)
    }

    fun eval(n: C, x: Double): Double = when (n) {
        is C.N -> n.v
        C.X -> x
        is C.Sum -> n.ts.sumOf { eval(it, x) }
        is C.Prod -> n.fs.fold(1.0) { s, f -> s * eval(f, x) }
        is C.Div -> eval(n.a, x) / eval(n.b, x)
        is C.Pow -> eval(n.a, x).pow(eval(n.b, x))
        is C.F -> fn(n.f, eval(n.a, x))
        C.Euler -> E
    }

    private fun mul(vararg fs: C) = C.Prod(fs.toList())
    private fun add(vararg ts: C) = C.Sum(ts.toList())
    private fun num(v: Double) = C.N(v)

    fun d(n: C): C = when (n) {
        is C.N, C.Euler -> num(0.0)
        C.X -> num(1.0)
        is C.Sum -> C.Sum(n.ts.map(::d))
        is C.Prod -> C.Sum(n.fs.indices.map { i -> C.Prod(n.fs.mapIndexed { j, g -> if (i == j) d(g) else g }) })
        is C.Div -> C.Div(add(mul(d(n.a), n.b), mul(num(-1.0), n.a, d(n.b))), C.Pow(n.b, num(2.0)))
        is C.Pow -> when {
            !hasX(n.b) -> mul(n.b, C.Pow(n.a, add(n.b, num(-1.0))), d(n.a))
            !hasX(n.a) -> mul(n, C.F("ln", n.a), d(n.b))
            else -> mul(n, d(mul(n.b, C.F("ln", n.a))))
        }
        is C.F -> {
            val a = n.a
            val da = d(a)
            when (n.f) {
                "sin" -> mul(C.F("cos", a), da)
                "cos" -> mul(num(-1.0), C.F("sin", a), da)
                "tan" -> mul(C.Pow(C.F("sec", a), num(2.0)), da)
                "sec" -> mul(C.F("sec", a), C.F("tan", a), da)
                "csc" -> mul(num(-1.0), C.F("csc", a), C.F("cot", a), da)
                "cot" -> mul(num(-1.0), C.Pow(C.F("csc", a), num(2.0)), da)
                "exp" -> mul(n, da)
                "ln" -> C.Div(da, a)
                "log" -> C.Div(da, mul(a, num(LN10)))
                "sqrt" -> C.Div(da, mul(num(2.0), n))
                else -> mul(C.Div(a, n), da)
            }
        }
    }

    private fun key(n: C) = n.toString()

    /** A term as a coefficient and its other factors; like terms combine by their factors. */
    private fun split(n: C): Pair<Double, List<C>> = when (n) {
        is C.N -> n.v to emptyList()
        is C.Prod -> { var c = 1.0; val fs = mutableListOf<C>(); for (f in n.fs) if (f is C.N) c *= f.v else fs += f; c to fs }
        else -> 1.0 to listOf(n)
    }

    private fun build(c: Double, fs: List<C>): C = if (fs.isEmpty()) num(c) else if (c == 1.0 && fs.size == 1) fs[0] else C.Prod(if (c == 1.0) fs else listOf(num(c)) + fs)

    private fun isMono(f: C) = f == C.X || (f is C.Pow && f.a == C.X && f.b is C.N)

    fun simp(n: C): C {
        when (n) {
            is C.N, C.X, C.Euler -> return n
            is C.F -> {
                val a = simp(n.a)
                if (a is C.N) return num(fn(n.f, a.v))
                if (n.f == "exp" && a is C.F && a.f == "ln") return a.a
                return C.F(n.f, a)
            }
            is C.Pow -> {
                val a = simp(n.a)
                val b = simp(n.b)
                if (b is C.N && b.v == 0.0) return num(1.0)
                if (b is C.N && b.v == 1.0) return a
                if (a is C.N && b is C.N) return num(a.v.pow(b.v))
                if (a is C.Pow && a.b is C.N && b is C.N) return simp(C.Pow(a.a, num(a.b.v * b.v)))
                if (a is C.Prod && b is C.N && isInt(b.v)) return simp(C.Prod(a.fs.map { C.Pow(it, b) }))
                return C.Pow(a, b)
            }
            is C.Div -> {
                val a = simp(n.a)
                val b = simp(n.b)
                if (b is C.N) return simp(mul(num(1 / b.v), a))
                if (a is C.N && a.v == 0.0) return num(0.0)
                // Cancel numbers and powers of x shared by top and bottom: 2/(2x) is 1/x.
                val (ca, fa0) = split(a)
                val (cb, fb0) = split(b)
                val c = ca / cb
                fun xp(fs: List<C>) = fs.sumOf { if (it == C.X) 1.0 else if (it is C.Pow && it.a == C.X && it.b is C.N) it.b.v else 0.0 }
                fun rest(fs: List<C>) = fs.filter { !isMono(it) }.toMutableList()
                val k = xp(fa0) - xp(fb0)
                val fa = rest(fa0)
                val fb = rest(fb0)
                if (k > 0) fa += if (k == 1.0) C.X else C.Pow(C.X, num(k))
                if (k < 0) fb += if (k == -1.0) C.X else C.Pow(C.X, num(-k))
                if (fb.isEmpty()) return simp(build(c, fa))
                // A fractional number splits across the bar: 1/(2√x), not 1/2/√x.
                val parts = pcFrac(c).split("/")
                return C.Div(build(parts[0].toDouble(), fa), build(parts.getOrNull(1)?.toDouble() ?: 1.0, fb))
            }
            is C.Prod -> {
                var c = 1.0
                val pw = LinkedHashMap<String, Pair<C, Double>>()
                fun add(f: C) {
                    when (f) {
                        is C.N -> { c *= f.v; return }
                        is C.Prod -> { f.fs.forEach(::add); return }
                        // a/b inside a product is a times b^-1, so x · (1/x) cancels.
                        is C.Div -> { add(f.a); add(simp(C.Pow(f.b, num(-1.0)))); return }
                        else -> {}
                    }
                    val (base, e) = if (f is C.Pow && f.b is C.N) f.a to f.b.v else f to 1.0
                    val k = key(base)
                    pw[k] = base to ((pw[k]?.second ?: 0.0) + e)
                }
                n.fs.map(::simp).forEach(::add)
                if (c == 0.0) return num(0.0)
                val fs = pw.values.filter { it.second != 0.0 }.map { (b, e) -> if (e == 1.0) b else simp(C.Pow(b, num(e))) }
                // A number times a sum spreads over the sum, so like terms can meet.
                if (fs.size == 1 && fs[0] is C.Sum && c != 1.0) return simp(C.Sum((fs[0] as C.Sum).ts.map { mul(num(c), it) }))
                // So does a power of x: 2x(x + 1) is 2x^2 + 2x.
                val sums = fs.filterIsInstance<C.Sum>()
                if (sums.size == 1 && fs.size > 1 && fs.all { it is C.Sum || isMono(it) }) return simp(C.Sum(sums[0].ts.map { t -> C.Prod(listOf(num(c)) + fs.filter(::isMono) + t) }))
                // x powers first, then the rest: "2x sin(x)", "8x(x^2 + 1)^3".
                return build(prec(c, 12), fs.filter(::isMono) + fs.filter { !isMono(it) })
            }
            is C.Sum -> {
                val terms = LinkedHashMap<String, Pair<Double, List<C>>>()
                fun add(t: C) {
                    if (t is C.Sum) { t.ts.forEach(::add); return }
                    val (c, fs) = split(t)
                    val k = fs.toString()
                    terms[k] = ((terms[k]?.first ?: 0.0) + c) to fs
                }
                n.ts.map(::simp).forEach(::add)
                val ts = terms.values.filter { abs(it.first) > 1e-12 }.map { (c, fs) -> build(prec(c, 12), fs) }
                // Constants go last: "3x^2 + 4x - 5".
                val sorted = ts.filter { it !is C.N } + ts.filter { it is C.N }
                return if (sorted.isEmpty()) num(0.0) else if (sorted.size == 1) sorted[0] else C.Sum(sorted)
            }
        }
    }

    private fun numStr(v: Double) = when {
        isInt(fixed(v, 9)) -> jsRound(v).toLong().toString()
        abs(v - E) < 1e-12 -> "e"
        abs(v - PI) < 1e-12 -> "π"
        abs(v - LN10) < 1e-12 -> "ln 10"
        else -> pcFrac(v)
    }

    private val sup = mapOf(2.0 to "²", 3.0 to "³")

    fun str(n: C): String = when (n) {
        is C.N -> numStr(n.v)
        C.X -> "x"
        C.Euler -> "e"
        is C.Sum -> n.ts.mapIndexed { i, t ->
            val (c, fs) = split(t)
            val s = str(if (c < 0) build(-c, fs) else t)
            if (i == 0) (if (c < 0) "-" else "") + s else (if (c < 0) " - " else " + ") + s
        }.joinToString("")
        is C.Div -> {
            val top = str(n.a)
            val bot = str(n.b)
            (if (n.a is C.Sum) "($top)" else top) + "/" + if (n.b is C.Sum || (n.b is C.Prod && n.b.fs.size != 1)) "($bot)" else bot
        }
        is C.Pow -> {
            val e = (n.b as? C.N)?.v
            val a = n.a
            if (a is C.F && e != null && sup[e] != null && a.f != "exp" && a.f != "sqrt" && a.f != "abs") a.f + sup.getValue(e) + "(" + str(a.a) + ")"
            else {
                val base = if (a == C.X || (a is C.N && a.v >= 0) || a is C.F) str(a) else "(" + str(a) + ")"
                base + "^" + if (e != null && isInt(e) && e >= 0) jsRound(e).toLong().toString() else if (n.b == C.X) "x" else "(" + str(n.b) + ")"
            }
        }
        is C.Prod -> {
            val (c, fs) = split(n)
            val top = mutableListOf<C>()
            val bot = mutableListOf<C>()
            for (f in fs) if (f is C.Pow && f.b is C.N && f.b.v < 0 && isInt(f.b.v)) bot += if (f.b.v == -1.0) f.a else C.Pow(f.a, num(-f.b.v)) else top += f
            fun part(f: C) = if (f is C.Sum) "(" + str(f) + ")" else str(f)
            val body = top.map(::part).foldIndexed("") { i, s, p -> s + (if (i == 0 || p.startsWith("(")) "" else " ") + p }
            val coef = if (c == 1.0) "" else if (c == -1.0) "-" else if (isInt(fixed(c, 9)) || body.isEmpty()) numStr(c) else "(" + numStr(c) + ")"
            val whole = if (c == -1.0) "-1" else numStr(c)
            val numer = if (body.isNotEmpty()) coef + body else whole
            if (bot.isEmpty()) numer else numer + "/" + bot.map(::part).joinToString(" ").let { if (bot.size > 1) "($it)" else it }
        }
        is C.F -> when {
            n.f == "exp" -> "e^" + if (n.a == C.X) "x" else "(" + str(n.a) + ")"
            n.f == "sqrt" -> "√" + if (n.a == C.X) "x" else "(" + str(n.a) + ")"
            n.f == "abs" -> "|" + str(n.a) + "|"
            n.f == "ln" && n.a is C.F && n.a.f == "abs" -> "ln" + str(n.a)
            else -> n.f + "(" + str(n.a) + ")"
        }
    }

    /** An antiderivative of the standard forms, term by term, or null. */
    fun integrate(n: C): C? {
        val ts = if (n is C.Sum) n.ts else listOf(n)
        val out = mutableListOf<C>()
        fun lin(a: C): Double? { if (a == C.X) return 1.0; val (ca, fa) = split(a); return if (fa.size == 1 && fa[0] == C.X) ca else null }
        for (t in ts) {
            val (c, fs) = split(t)
            if (fs.isEmpty()) { out += mul(num(c), C.X); continue }
            if (fs.size != 1) return null
            val f = fs[0]
            val k = if (f == C.X) 1.0 else if (f is C.Pow && f.a == C.X && f.b is C.N) f.b.v else null
            if (k != null) { out += if (k == -1.0) mul(num(c), C.F("ln", C.F("abs", C.X))) else mul(num(c / (k + 1)), C.Pow(C.X, num(k + 1))); continue }
            if (f is C.F && f.f in setOf("sin", "cos", "exp")) {
                val a = lin(f.a)
                if (a != null) { out += mul(num((if (f.f == "sin") -c else c) / a), C.F(if (f.f == "sin") "cos" else if (f.f == "cos") "sin" else "exp", f.a)); continue }
            }
            if (f is C.Pow && f.a is C.F && f.a.f == "sec" && f.b is C.N && f.b.v == 2.0) {
                val a = lin(f.a.a)
                if (a != null) { out += mul(num(c / a), C.F("tan", f.a.a)); continue }
            }
            if (f is C.Div && f.a is C.N && f.b == C.X) { out += mul(num(c * f.a.v), C.F("ln", C.F("abs", C.X))); continue }
            return null
        }
        return simp(C.Sum(out))
    }

    /** A value as a small fraction when it is one, else to four places. */
    fun snap(v: Double): String {
        for (dd in 1..12) { val k = jsRound(v * dd); if (abs(v * dd - k) < 1e-7) return if (dd == 1) k.toLong().toString() else "${k.toLong()}/$dd" }
        return pcNum(fixed(v, 4))
    }

    private fun simpson(f: (Double) -> Double, a: Double, b: Double): Double {
        val n = 2000
        val h = (b - a) / n
        var s = f(a) + f(b)
        for (i in 1 until n) s += (if (i % 2 == 1) 4 else 2) * f(a + i * h)
        return s * h / 3
    }

    /** The zeros of a function on [-50, 50]: sign changes found on a grid, then bisected. */
    fun zeros(f: (Double) -> Double): List<Double> {
        val zs = mutableListOf<Double>()
        fun push(z: Double) { if (zs.none { abs(it - z) < 1e-6 }) zs += z }
        var px = -50.0
        var pv = f(px)
        for (k in 1..2000) {
            val x = -50 + k * 0.05
            val v = f(x)
            if (abs(pv) < 1e-12) push(px)
            if (v.isFinite() && pv.isFinite() && pv * v < 0) {
                var lo = px
                var hi = x
                repeat(80) { val mid = (lo + hi) / 2; if (f(lo) * f(mid) <= 0) hi = mid else lo = mid }
                if (abs(f((lo + hi) / 2)) < 1e-6) push((lo + hi) / 2)
            }
            px = x
            pv = v
        }
        return zs.map { z -> (1..12).firstNotNullOfOrNull { dd -> val k = jsRound(z * dd); if (abs(z * dd - k) < 1e-6) k / dd else null } ?: z }.sorted()
    }

    /** Where a function is positive (sign 1) or negative (-1), as inequalities between its zeros. */
    private fun where(f: (Double) -> Double, s: Int): String {
        val cuts = listOf(Double.NEGATIVE_INFINITY) + zeros(f) + Double.POSITIVE_INFINITY
        val parts = mutableListOf<String>()
        for (i in 0 until cuts.size - 1) {
            val lo = cuts[i]
            val hi = cuts[i + 1]
            val mid = if (lo.isInfinite()) (if (hi.isInfinite()) 0.0 else hi - 1) else if (hi.isInfinite()) lo + 1 else (lo + hi) / 2
            if (sign(f(mid)).toInt() == s) parts += when {
                lo.isInfinite() && hi.isInfinite() -> "all real x"
                lo.isInfinite() -> "x < " + snap(hi)
                hi.isInfinite() -> "x > " + snap(lo)
                else -> snap(lo) + " < x < " + snap(hi)
            }
        }
        return if (parts.isNotEmpty()) parts.joinToString(" or ") else "nowhere"
    }

    private fun out(body: String) = Answer.Text(heading = null, body = body, source = "Nimble math")
    private fun find(pattern: String, s: String): List<String>? = Regex(pattern).find(s)?.groupValues
    private fun has(pattern: String, s: String) = Regex(pattern).containsMatchIn(s)
    private fun fx(s: String): C? = parse(s)?.takeIf(::hasX)

    fun answer(q: String): Answer? {
        var m: List<String>?
        // derivatives
        m = find("""^(?:the )?(second |2nd )?derivative of (?:y\s*=\s*|f\(x\)\s*=\s*)?(.+)$|^(?:differentiate|d/dx)\s+(?:y\s*=\s*|f\(x\)\s*=\s*)?(.+)$|^dy/dx (?:if|for|of) y\s*=\s*(.+)$""", q)
        if (m != null) {
            val t = fx(m[2].ifEmpty { m[3] }.ifEmpty { m[4] }) ?: return null
            var dv = simp(d(t))
            if (m[1].isNotEmpty()) dv = simp(d(dv))
            return out(str(dv))
        }
        // f'(a), tangent slopes and tangent lines
        m = find("""\bf\(x\)\s*=\s*(.+?),?\s+(?:find|what is|evaluate)\s+f'\s*\(\s*(-?[\d./]+)\s*\)$""", q)
            ?: find("""^f'\s*\(\s*(-?[\d./]+)\s*\) (?:if|for|when) f\(x\)\s*=\s*(.+)$""", q)?.let { listOf(it[0], it[2], it[1]) }
        if (m != null) {
            val t = fx(m[1]) ?: return null
            val a = pcVal(m[2]) ?: return null
            return out(snap(eval(simp(d(t)), a)))
        }
        m = find("""\b(slope|equation)\b.*?\btangent(?: line)? (?:to|of|at)\s+(?:the curve |the graph of )?(?:y\s*=\s*|f\(x\)\s*=\s*)(.+?)\s+(?:at|where|when)\s+x\s*=\s*(-?[\d./]+)$""", q)
        if (m != null) {
            val t = fx(m[2]) ?: return null
            val a = pcVal(m[3]) ?: return null
            val k = eval(simp(d(t)), a)
            val b = eval(t, a) - k * a
            val ks = snap(k)
            if (m[1] == "slope") return out(ks)
            return out("y = " + if (abs(k) < 1e-12) snap(b) else (if (ks == "1") "" else if (ks == "-1") "-" else ks) + "x" + if (abs(b) < 1e-12) "" else if (b > 0) " + " + snap(b) else " - " + snap(-b))
        }
        // critical points, extrema, concavity, inflection, increasing and decreasing
        m = find("""^(?:the )?(critical points?|critical numbers?|local (?:maximum|minimum|max|min|extrema)|relative (?:maximum|minimum)|inflection points?|points? of inflection) (?:of|for) (?:y\s*=\s*|f\(x\)\s*=\s*)?(.+)$""", q)
        if (m != null) {
            val t = fx(m[2]) ?: return null
            val d1 = simp(d(t))
            val d2 = simp(d(d1))
            val f1 = { v: Double -> eval(d1, v) }
            val f2 = { v: Double -> eval(d2, v) }
            fun pt(v: Double) = "(" + snap(v) + ", " + snap(eval(t, v)) + ")"
            val kindOf = m[1]
            if ("inflection" in kindOf) {
                val zs = zeros(f2).filter { sign(f2(it - 1e-3)) != sign(f2(it + 1e-3)) }
                return out(if (zs.isNotEmpty()) zs.joinToString(", ") { pt(it) } else "None.")
            }
            val cs = zeros(f1)
            if (kindOf.startsWith("critical")) return out(if (cs.isNotEmpty()) cs.joinToString(", ") { "x = " + snap(it) } else "None.")
            fun kind(z: Double): String {
                val s = f2(z)
                return if (s < -1e-9) "max" else if (s > 1e-9) "min" else if (sign(f1(z - 1e-3)) > sign(f1(z + 1e-3))) "max" else if (sign(f1(z - 1e-3)) < sign(f1(z + 1e-3))) "min" else "neither"
            }
            val want = if ("max" in kindOf) listOf("max") else if ("min" in kindOf) listOf("min") else listOf("max", "min")
            val hits = cs.filter { kind(it) in want }
            return out(if (hits.isNotEmpty()) hits.joinToString("; ") { z -> (if (want.size > 1) "local " + kind(z) + " at " else "") + pt(z) + if (want.size == 1) ", at x = " + snap(z) else "" } else "None.")
        }
        m = find("""^(?:where|on what interval|for what (?:values of )?x) (?:is|are|does) (?:y\s*=\s*|f\(x\)\s*=\s*)?(.+?) (concave up|concave down|increasing|decreasing)$""", q)
        if (m != null) {
            val t = fx(m[1]) ?: return null
            val d1 = simp(d(t))
            val g = if ("concave" in m[2]) simp(d(d1)) else d1
            return out(where({ eval(g, it) }, if (has("up|increasing", m[2])) 1 else -1))
        }
        // limits
        m = find("""^(?:the )?(?:limit|lim) (?:of )?(.+?) as x (?:approaches|goes to|tends to|->|→)\s*(-?∞|-?infinity|[-\d./π\spi]+)$""", q)
        if (m != null) {
            val t = fx(m[1]) ?: return null
            fun f(v: Double) = eval(t, v)
            val a0 = m[2].trim()
            if (has("∞|infinity", a0)) {
                val s = if (a0.startsWith("-")) -1 else 1
                val v1 = f(s * 1e6)
                val v2 = f(s * 1e7)
                if (abs(v2) > 1e5 && abs(v2) > abs(v1)) return out((if (v2 > 0) "∞" else "-∞") + ": it grows without bound, so the limit does not exist as a number.")
                return if (v2.isFinite()) out(snap(fixed(v2, 5))) else null
            }
            val a = pcVal(a0) ?: return null
            val l = f(a - 1e-7)
            val r = f(a + 1e-7)
            if (abs(l) > 1e5 || abs(r) > 1e5) return out("Does not exist: it heads to " + (if (l > 0) "∞" else "-∞") + " from the left and " + (if (r > 0) "∞" else "-∞") + " from the right.")
            if (abs(l - r) > 1e-4) return out("Does not exist: the left limit is " + snap(fixed(l, 4)) + " and the right limit is " + snap(fixed(r, 4)) + ".")
            return out(snap(fixed((l + r) / 2, 5)))
        }
        m = find("""^is (?:y\s*=\s*|f\(x\)\s*=\s*)?(.+?) (differentiable|continuous) at x\s*=\s*(-?[\d./]+)$""", q)
        if (m != null) {
            val t = fx(m[1]) ?: return null
            val a = pcVal(m[3]) ?: return null
            val h = 1e-6
            val fa = eval(t, a)
            val l = eval(t, a - h)
            val r = eval(t, a + h)
            val cont = fa.isFinite() && abs(l - fa) < 1e-4 && abs(r - fa) < 1e-4
            if (m[2] == "continuous") return out(if (cont) "Yes: the limit as x approaches ${snap(a)} equals f(${snap(a)}) = ${snap(fa)}." else "No: the function breaks at x = ${snap(a)}.")
            if (!cont) return out("No: it is not even continuous there.")
            val sl = (fa - l) / h
            val sr = (r - fa) / h
            return out(if (abs(sl - sr) < 1e-3) "Yes: the slope is ${snap(fixed((sl + sr) / 2, 4))} from both sides." else "No: the slope is ${snap(fixed(sl, 3))} from the left and ${snap(fixed(sr, 3))} from the right (a corner).")
        }
        // integrals and area
        fun range(s: String): Pair<Double, Double>? {
            val r = find("""\bfrom\s+(-?[\d./π\spi]+?)\s+to\s+(-?[\d./π\spi]+)$""", s) ?: find("""\bon\s*\[\s*(-?[^,\]]+?)\s*,\s*(-?[^\]]+?)\s*\]$""", s) ?: return null
            return (pcVal(r[1].trim()) ?: return null) to (pcVal(r[2].trim()) ?: return null)
        }
        m = find("""^(?:the )?(?:definite )?(?:integral|antiderivative|anti-derivative) of (.+?)(?:\s+dx)?(\s+(?:from|on)\s+.+)?$""", q)
        if (m != null) {
            val body = m[1].replace(Regex("""\s+dx$"""), "")
            val t = fx(body) ?: (if (Regex("""^[\d.]+$""").matches(m[1])) num(m[1].toDouble()) else null) ?: return null
            if (m[2].isNotEmpty()) { val (a, b) = range(m[2].trim()) ?: return null; return out(snap(simpson({ eval(t, it) }, a, b))) }
            return integrate(simp(t))?.let { out(str(it) + " + C") }
        }
        m = find("""^(?:the )?area (?:under|below|beneath) (?:the curve )?(?:y\s*=\s*|f\(x\)\s*=\s*)?(.+?)\s+((?:from|on)\s+.+)$""", q)
        if (m != null) {
            val t = fx(m[1]) ?: return null
            val (a, b) = range(m[2]) ?: return null
            return out(snap(simpson({ abs(eval(t, it)) }, a, b)))
        }
        m = find("""^(?:the )?area between (?:y\s*=\s*)?(.+?) and (?:y\s*=\s*)?(.+?)\s+((?:from|on)\s+.+)$""", q)
        if (m != null) {
            val f = fx(m[1]) ?: return null
            val g = fx(m[2]) ?: return null
            val (a, b) = range(m[3]) ?: return null
            return out(snap(simpson({ abs(eval(f, it) - eval(g, it)) }, a, b)))
        }
        m = find("""^(?:the )?average value of (?:y\s*=\s*|f\(x\)\s*=\s*)?(.+?)\s+((?:from|on)\s+.+)$""", q)
        if (m != null) {
            val t = fx(m[1]) ?: return null
            val (a, b) = range(m[2]) ?: return null
            if (a == b) return null
            return out(snap(simpson({ eval(t, it) }, a, b) / (b - a)))
        }
        // motion: s(t) to velocity and acceleration
        m = find("""\b(?:position|height|displacement)\b.*?\b[sh]\(t\)\s*=\s*(.+?),?\s+(?:what is |find )?(?:its |the )?(velocity|speed|acceleration)\b.*?\bt\s*=\s*([\d./]+)""", q)
        if (m != null) {
            val t = fx(m[1].replace("t", "x")) ?: return null
            var dv = simp(d(t))
            if (m[2] == "acceleration") dv = simp(d(dv))
            val v = eval(dv, m[3].toDouble())
            return out(snap(if (m[2] == "speed") abs(v) else v))
        }
        // related rates for circles, squares, spheres and cubes
        if (has("""\bhow fast\b|\brate\b""", q)) {
            m = find("""\b(radius|side|edge)\b.*?\b(?:grows|increases|expands|is increasing|changes)\s+(?:at|by)\s+([\d.]+)\s*([a-z]+)?(?:/|\s+per\s+)([a-z]+)""", q)
            if (m != null) {
                val rate = m[2].toDouble()
                val unit = m[3].ifEmpty { "units" }
                val tu = m[4]
                val v = find("""\b(?:r|s)\s*=\s*([\d.]+)|\b(?:radius|side|edge) is ([\d.]+)""", q)?.drop(1)?.firstOrNull { it.isNotEmpty() }?.toDouble() ?: return null
                val circle = has("""\bcircle\b""", q)
                val sphere = has("""\bsphere\b|\bballoon\b""", q)
                val cube = has("""\bcube\b""", q)
                val square = has("""\bsquare\b""", q)
                if (circle && has("""\barea\b""", q)) return out(pcFrac(2 * v * rate) + "π ≈ " + pcNum(fixed(2 * PI * v * rate, 2)) + " $unit²/$tu")
                if (circle && has("""\bcircumference\b""", q)) return out(pcFrac(2 * rate) + "π ≈ " + pcNum(fixed(2 * PI * rate, 2)) + " $unit/$tu")
                if (sphere && has("""\bvolume\b""", q)) return out(pcFrac(4 * v * v * rate) + "π ≈ " + pcNum(fixed(4 * PI * v * v * rate, 2)) + " $unit³/$tu")
                if (cube && has("""\bvolume\b""", q)) return out(pcNum(3 * v * v * rate) + " $unit³/$tu")
                if (square && has("""\barea\b""", q)) return out(pcNum(2 * v * rate) + " $unit²/$tu")
                if (square && has("""\bperimeter\b""", q)) return out(pcNum(4 * rate) + " $unit/$tu")
            }
        }
        return null
    }
}
