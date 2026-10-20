package com.nulljosh.nimble

import com.nulljosh.nimble.Calculus12.C
import com.nulljosh.nimble.Calculus12.add
import com.nulljosh.nimble.Calculus12.d
import com.nulljosh.nimble.Calculus12.eval
import com.nulljosh.nimble.Calculus12.hasX
import com.nulljosh.nimble.Calculus12.mul
import com.nulljosh.nimble.Calculus12.num
import com.nulljosh.nimble.Calculus12.parse
import com.nulljosh.nimble.Calculus12.simp
import com.nulljosh.nimble.Calculus12.simpson
import com.nulljosh.nimble.Calculus12.snap
import com.nulljosh.nimble.Calculus12.split
import com.nulljosh.nimble.Calculus12.str
import com.nulljosh.nimble.Calculus12.zeros
import com.nulljosh.nimble.Precalc.fixed
import com.nulljosh.nimble.Precalc.isInt
import com.nulljosh.nimble.Precalc.jsRound
import com.nulljosh.nimble.Precalc.pcNum
import com.nulljosh.nimble.Precalc.pcVal
import kotlin.math.E
import kotlin.math.abs
import kotlin.math.cbrt
import kotlin.math.ln
import kotlin.math.pow
import kotlin.math.sqrt

/**
 * University Calculus I with no network: what first-year calculus adds to Calculus 12. The theorems in words, log
 * bases, implicit differentiation, linearization, Newton's method, the mean value theorem, ladder rates, optimization,
 * Riemann sums and the derivative of an integral. A port of `calc1()` in docs/engine.js, on the Calculus12 engine.
 */
internal object Calculus1 {

    private val facts = listOf(
        """\bepsilon[- ]delta\b|\b(?:formal|precise|rigorous) definition of (?:a |the )?limit\b""" to "The limit of f(x) as x approaches a is L when for every ε > 0 there is a δ > 0 such that 0 < |x - a| < δ implies |f(x) - L| < ε: f(x) can be kept as close to L as you like by taking x close enough to a.",
        """\bl'?\s?h[oô]pital'?s? rule\b""" to "For an indeterminate form 0/0 or ∞/∞, the limit of f(x)/g(x) equals the limit of f'(x)/g'(x), when that limit exists. Differentiate top and bottom separately, not as a quotient.",
        """\bintermediate value theorem\b""" to "If f is continuous on [a, b] and N is any number between f(a) and f(b), then f(c) = N for some c in (a, b). So a continuous function that changes sign has a root in between.",
        """\brolle'?s theorem\b""" to "If f is continuous on [a, b], differentiable on (a, b), and f(a) = f(b), then f'(c) = 0 for some c in (a, b): somewhere the tangent is horizontal.",
        """^(?:what is |what does )?(?:the )?mean value theorem(?: say| state)?$""" to "If f is continuous on [a, b] and differentiable on (a, b), then f'(c) = (f(b) - f(a))/(b - a) for some c in (a, b): somewhere the tangent is parallel to the secant.",
        """\bfundamental theorem of calculus\b""" to "Part 1: if F(x) is the integral from a to x of f(t) dt, then F'(x) = f(x). Part 2: if F is any antiderivative of f, the integral from a to b of f(x) dx = F(b) - F(a). Differentiation and integration undo each other.",
        """^(?:the )?(?:limit )?definition of (?:the |a )?derivative$""" to "f'(x) = the limit as h approaches 0 of (f(x + h) - f(x))/h, the slope of the secant as it becomes the tangent.",
        """^implicit differentiation$""" to "Differentiating both sides of an equation in x and y with respect to x, treating y as a function of x (so y^2 becomes 2y·dy/dx), then solving for dy/dx.",
        """\bremovable discontinuity\b""" to "A hole in the graph: the limit exists at x = a but f(a) is undefined or different, so redefining f(a) as the limit makes f continuous there. Example: (x^2 - 1)/(x - 1) at x = 1.",
        """\bsqueeze theorem\b|\bsandwich theorem\b""" to "If g(x) ≤ f(x) ≤ h(x) near a and g and h have the same limit L at a, then f has limit L too. It shows the limit of x sin(1/x) at 0 is 0.",
        """\bextreme value theorem\b""" to "A function continuous on a closed interval [a, b] has an absolute maximum and an absolute minimum there, at critical points or at the endpoints.",
        """^(?:a )?riemann sum$""" to "An approximation of the area under a curve: split [a, b] into n pieces of width Δx, take f at a point in each (left, right or midpoint), and add up f(x)·Δx. As n grows it tends to the definite integral.",
        """^(?:a )?vertical asymptote$""" to "A vertical line x = a that the graph approaches as f(x) grows without bound (to ∞ or -∞) near a, usually where a denominator is zero and the top is not. Example: x = 0 for 1/x.",
        """^(?:what does it mean )?(?:for )?(?:a )?function (?:to be )?continuous at a point$|^continuity at a point$""" to "f is continuous at x = a when f(a) is defined, the limit of f(x) as x approaches a exists, and the limit equals f(a): no hole, jump or break there.",
        """^(?:a )?critical (?:point|number)(?: of a function| in calculus)?$""" to "In calculus, a point x = c in the domain where f'(c) = 0 or the derivative is undefined: the candidates for local maxima and minima. (In thermodynamics, a critical point is where the liquid and gas phases stop being distinct.)",
        """^(?:the )?second derivative test$""" to "At a critical point c with f'(c) = 0: if f''(c) > 0 the graph is concave up there, a local minimum; if f''(c) < 0 it is concave down, a local maximum; if f''(c) = 0 the test says nothing.",
        """^(?:a |an )?antiderivative$""" to "A function F whose derivative is f. Any two differ by a constant, which is why an indefinite integral ends in + C.",
    ).map { (re, body) -> Regex(re) to body }

    private fun swap(n: C): C = when (n) {
        C.X -> C.Y
        C.Y -> C.X
        is C.Sum -> C.Sum(n.ts.map(::swap))
        is C.Prod -> C.Prod(n.fs.map(::swap))
        is C.Div -> C.Div(swap(n.a), swap(n.b))
        is C.Pow -> C.Pow(swap(n.a), swap(n.b))
        is C.F -> C.F(n.f, swap(n.a))
        else -> n
    }

    /** dy/dx = -Fx/Fy for F(x, y) = left - right, tidied: (2y - x^2)/(y^2 - 2x). */
    private fun implicit(src: String): C? {
        val sides = src.split("=")
        if (sides.size != 2) return null
        val l = parse(sides[0], allowY = true) ?: return null
        val r = parse(sides[1], allowY = true) ?: return null
        val f = add(l, mul(num(-1.0), r))
        val dv = simp(C.Div(mul(num(-1.0), d(f)), swap(d(swap(f)))))
        if (dv !is C.Div) return dv
        fun terms(x: C) = if (x is C.Sum) x.ts else listOf(x)
        val cs = (terms(dv.a) + terms(dv.b)).map { abs(split(it).first) }
        fun gcd(a: Long, b: Long): Long = if (b == 0L) a else gcd(b, a % b)
        val g = if (cs.all(::isInt)) cs.map { it.toLong() }.reduce(::gcd) else 1L
        fun tidy(x: C): C {
            val y = if (g > 1) simp(mul(num(1.0 / g), x)) else x
            if (y !is C.Sum) return y
            val i = y.ts.indexOfFirst { split(it).first > 0 }
            return if (i > 0) C.Sum(listOf(y.ts[i]) + y.ts.filterIndexed { j, _ -> j != i }) else y
        }
        return C.Div(tidy(dv.a), tidy(dv.b))
    }

    private fun out(body: String) = Answer.Text(heading = null, body = body, source = "Nimble math")
    private fun find(pattern: String, s: String): List<String>? = Regex(pattern).find(s)?.groupValues
    private fun has(pattern: String, s: String) = Regex(pattern).containsMatchIn(s)
    private fun fx(s: String): C? = parse(s)?.takeIf(::hasX)
    private fun n4(v: Double) = pcNum(fixed(v, 6))
    private fun withDecimal(v: Double): String { val f = snap(v); return f + if ("/" in f) " = " + pcNum(v) else "" }

    private fun subX(n: C, g: C): C = when (n) {
        C.X -> g
        is C.Sum -> C.Sum(n.ts.map { subX(it, g) })
        is C.Prod -> C.Prod(n.fs.map { subX(it, g) })
        is C.Div -> C.Div(subX(n.a, g), subX(n.b, g))
        is C.Pow -> C.Pow(subX(n.a, g), subX(n.b, g))
        is C.F -> C.F(n.f, subX(n.a, g))
        else -> n
    }

    fun answer(q: String): Answer? {
        for ((re, body) in facts) if (re.containsMatchIn(q)) return out(body)
        var m: List<String>?
        // one-sided limits, and limits in a variable other than x
        m = find("""^(?:the )?(?:limit|lim) (?:of )?(.+?) as ([a-z]) (?:approaches|goes to|tends to|->|→)\s*(-?∞|-?infinity|[-\d./π\spi]+?)(?: from the (right|left|above|below)|([+-]))?$""", q)
        if (m != null && (m[4].isNotEmpty() || m[5].isNotEmpty() || m[2] != "x")) {
            val v = m[2]
            val t = fx(if (v == "x") m[1] else m[1].replace("x", "#").replace(v, "x")) ?: return null
            if ("#" in m[1].replace("exp", "")) return null
            val a0 = m[3].trim()
            val dir = m[4].ifEmpty { m[5] }
            val side = if (has("""right|above|\+""", dir)) 1 else if (has("left|below|-", dir)) -1 else 0
            val value = if (has("∞|infinity", a0)) eval(t, (if (a0.startsWith("-")) -1 else 1) * 1e7)
            else { val a = pcVal(a0) ?: return null; if (side != 0) eval(t, a + side * 1e-9) else (eval(t, a - 1e-9) + eval(t, a + 1e-9)) / 2 }
            if (!value.isFinite() || abs(value) > 1e5) return out(if (value > 0) "∞: it grows without bound." else "-∞: it falls without bound.")
            return out(if (abs(value - E) < 1e-5) "e ≈ 2.71828" else snap(fixed(value, 5)))
        }
        // derivative of log base b of x
        m = find("""^(?:the )?derivative of log(?:arithm)? (?:base |_)\s*(\d+(?:\.\d+)?) of (.+)$""", q)
        if (m != null) {
            val t = fx(m[2]) ?: return null
            val dv = str(simp(d(C.F("ln", t))))
            val b = m[1]
            return out(if (Regex("""^1/[^/]+$""").matches(dv)) "1/(" + dv.substring(2).replace(Regex("""^\((.*)\)$"""), "$1") + " ln " + b + ")" else "($dv)/ln $b")
        }
        // implicit differentiation
        m = find("""^(?:find )?dy/dx (?:if|for|when|given) (.+=.+)$|^(?:implicitly differentiate|differentiate implicitly) (.+=.+)$""", q)
        if (m != null) return implicit(m[1].ifEmpty { m[2] })?.let { out("dy/dx = " + str(it)) }
        // linearization at x = a, and estimating a value with it
        m = find("""^(?:the )?(?:linear approximation|linearization|tangent line approximation) (?:of|to|for) (?:y\s*=\s*|f\(x\)\s*=\s*)?(.+?) (?:at|near|about) x\s*=\s*(-?[\d./]+)$""", q)
        if (m != null) {
            val t = fx(m[1]) ?: return null
            val a = pcVal(m[2]) ?: return null
            val fa = eval(t, a)
            val k = eval(simp(d(t)), a)
            val b = fa - k * a
            return out("L(x) = " + snap(fa) + " + (" + snap(k) + ")(x - " + snap(a) + "), which is " + snap(k) + "x" + (if (abs(b) < 1e-12) "" else if (b > 0) " + " + snap(b) else " - " + snap(-b)) + ".")
        }
        if (has("""\b(?:linear approximation|linearization|differentials?|tangent line)\b""", q)) {
            m = find("""\bestimate\s+(sqrt|√|ln|cbrt)\s*\(?\s*([\d.]+)\s*\)?""", q)
            if (m != null) {
                val v = m[2].toDouble()
                val f: (Double) -> Double = when (m[1]) { "ln" -> ::ln; "cbrt" -> ::cbrt; else -> ::sqrt }
                // the nearest point where the function is a whole number
                var a: Double? = null
                var dd = 0.0
                while (dd <= maxOf(2.0, v) && a == null) {
                    for (c in listOf(jsRound(v) - dd, jsRound(v) + dd)) if (c > 0 && abs(f(c) - jsRound(f(c))) < 1e-9) { a = c; break }
                    dd += 0.5
                }
                val a0 = a ?: return null
                val h = 1e-6
                val k = (f(a0 + h) - f(a0 - h)) / (2 * h)
                val est = f(a0) + k * (v - a0)
                val gap = pcNum(fixed(v - a0, 6))
                return out("About " + n4(est) + ": " + m[1].replace("√", "sqrt") + "(" + pcNum(v) + ") ≈ f(" + pcNum(a0) + ") + f'(" + pcNum(a0) + ")(" + gap + ") = " + n4(f(a0)) + " + " + n4(k) + " × " + gap + ".")
            }
        }
        // Newton's method
        if (has("""\bnewton'?s method\b""", q)) {
            m = find("""\b(?:for|on|to|of)\s+(?:f\(x\)\s*=\s*)?(.+?)(?:\s*=\s*0)?,?\s+(?:starting|start|beginning|with x0|from)\b.*?x\s*(?:_?0|₀)?\s*=\s*(-?[\d.]+)""", q)
            if (m != null) {
                val t = fx(m[1]) ?: return null
                var x = m[2].toDouble()
                val dv = simp(d(t))
                val steps = find("""\b(\d+) (?:steps|iterations)\b""", q)?.get(1) ?: find("""\b(two|three) (?:steps|iterations)\b""", q)?.get(1) ?: "1"
                val n = mapOf("two" to 2, "three" to 3)[steps] ?: steps.toInt()
                val xs = mutableListOf<Double>()
                repeat(n) { val s = eval(dv, x); if (s == 0.0 || s.isNaN()) return null; x -= eval(t, x) / s; xs += x }
                return out(xs.mapIndexed { i, v -> "x" + (i + 1) + " = " + n4(v) }.joinToString(", ") + ", from x(n+1) = x(n) - f(x(n))/f'(x(n)).")
            }
        }
        // the c of the mean value theorem
        if (has("""\bmean value theorem\b""", q)) {
            m = find("""\bf\(x\)\s*=\s*(.+?)\s+on\s*\[\s*(-?[\d./]+)\s*,\s*(-?[\d./]+)\s*\]""", q)
            if (m != null) {
                val t = fx(m[1]) ?: return null
                val a = pcVal(m[2]) ?: return null
                val b = pcVal(m[3]) ?: return null
                val s = (eval(t, b) - eval(t, a)) / (b - a)
                val dv = simp(d(t))
                val cs = zeros { eval(dv, it) - s }.filter { it > a && it < b }
                return if (cs.isEmpty()) null else out(cs.joinToString(", ") { "c = " + if (isInt(it)) jsRound(it).toLong().toString() else n4(it) } + ", where f'(c) equals the secant slope " + snap(s) + ".")
            }
        }
        // a ladder sliding down a wall
        if (has("""\bladder\b""", q)) {
            m = find("""\b(?:ladder (?:is )?(\d+(?:\.\d+)?)\s*(ft|feet|m|metres?|meters?)|(\d+(?:\.\d+)?)[- ]?(ft|feet|m|metres?|meters?)[- ]?(?:long )?ladder)\b""", q)
            if (m != null) {
                val l = m[1].ifEmpty { m[3] }.toDouble()
                val u = m[2].ifEmpty { m[4] }.replace(Regex("^feet$"), "ft").replace(Regex("^met.*"), "m")
                val rate = find("""\bat\s+([\d.]+)\s*[a-z]*\s*(?:/|per)\s*(s|sec|second|min|minute)""", q) ?: return null
                val dd = find("""\bbottom (?:of the ladder )?is\s+([\d.]+)""", q) ?: return null
                if (dd[1].toDouble() >= l) return null
                val y = sqrt(l * l - dd[1].toDouble().pow(2))
                val v = dd[1].toDouble() * rate[1].toDouble() / y
                val tu = if (rate[2].startsWith("m")) "min" else "s"
                return out("The top slides down at " + n4(v) + " " + u + "/" + tu + " (dy/dt = -" + n4(v) + "): from x² + y² = " + pcNum(l) + "², dy/dt = -(x/y)·dx/dt with x = " + dd[1] + " and y = " + n4(y) + ".")
            }
        }
        // optimization classics
        m = find("""\btwo (?:positive )?numbers whose product is (\d+(?:\.\d+)?) and whose sum is (?:a |the )?min""", q)
        if (m != null) { val h = sqrt(m[1].toDouble()); return out(pcNum(fixed(h, 6)) + " and " + pcNum(fixed(h, 6)) + ", sum " + pcNum(fixed(2 * h, 6)) + ".") }
        // an open box from a sheet with squares cut from the corners
        if (has("""\bbox\b""", q) && has("""\bcorners?\b""", q)) {
            m = find("""\b(\d+(?:\.\d+)?)\s*(?:by|x|×)\s*(\d+(?:\.\d+)?)""", q)
            if (m != null) {
                val w = m[1].toDouble()
                val l = m[2].toDouble()
                val x = (w + l - sqrt((w + l).pow(2) - 3 * w * l)) / 6
                return out("Cut squares of side " + pcNum(fixed(x, 4)) + ", for a volume of " + pcNum(fixed(x * (w - 2 * x) * (l - 2 * x), 4)) + ": V = x(" + pcNum(w) + " - 2x)(" + pcNum(l) + " - 2x), V'(x) = 0.")
            }
        }
        m = find("""\btwo (?:positive )?numbers whose sum is (\d+(?:\.\d+)?) and whose product is (?:a |the )?max""", q)
        if (m != null) { val h = m[1].toDouble() / 2; return out(pcNum(h) + " and " + pcNum(h) + ", product " + pcNum(h * h) + ".") }
        m = find("""\b(?:max(?:imum)? area|largest area|greatest area)\b.*\brectangle\b.*\bperimeter (?:of |is )?(\d+(?:\.\d+)?)\b""", q)
        if (m != null) { val p = m[1].toDouble(); return out(pcNum(p * p / 16) + ": a square with side " + pcNum(p / 4) + ".") }
        if (has("""\bfenc""", q) && has("""\bmaxim""", q)) {
            m = find("""([\d.]+)\s*(m|ft|feet|metres?|meters?|yards?)\b""", q)
            if (m != null) {
                val p = m[1].toDouble()
                val u = m[2].replace(Regex("^feet$"), "ft").replace(Regex("^met.*"), "m")
                if (has("""\briver\b|\bthree sides\b|\bbarn\b|\bwall\b""", q)) return out(pcNum(p / 4) + " " + u + " by " + pcNum(p / 2) + " " + u + " (the long side parallel to the river), area " + pcNum(p * p / 8) + " " + u + "².")
                return out("A square, " + pcNum(p / 4) + " " + u + " by " + pcNum(p / 4) + " " + u + ", area " + pcNum(p * p / 16) + " " + u + "².")
            }
        }
        // left, right and midpoint Riemann sums
        m = find("""^(left|right|midpoint)(?:[- ]endpoint)? riemann sum (?:of|for) (?:y\s*=\s*|f\(x\)\s*=\s*)?(.+?) (?:on|over) \[\s*(-?[\d./]+)\s*,\s*(-?[\d./]+)\s*\] (?:with|using) n\s*=\s*(\d+)(?: (?:rectangles|subintervals))?$""", q)
        if (m != null) {
            val t = fx(m[2]) ?: return null
            val a = pcVal(m[3]) ?: return null
            val b = pcVal(m[4]) ?: return null
            val n = m[5].toInt()
            if (n == 0) return null
            val h = (b - a) / n
            val off = mapOf("left" to 0.0, "right" to 1.0, "midpoint" to 0.5).getValue(m[1])
            val xs = (0 until n).map { a + (it + off) * h }
            val s = xs.sumOf { eval(t, it) } * h
            return out(withDecimal(fixed(s, 10)) + ": Δx = " + snap(h) + ", sum of f at x = " + xs.joinToString(", ") { snap(fixed(it, 10)) } + ", times Δx.")
        }
        m = find("""^(?:the )?(trapezoidal|trapezoid|simpson'?s?) rule (?:for|of|on) (?:y\s*=\s*|f\(x\)\s*=\s*)?(.+?) (?:on|over|from) \[\s*(-?[\d./]+)\s*,\s*(-?[\d./]+)\s*\] (?:with|using) n\s*=\s*(\d+)(?: (?:subintervals|intervals))?$""", q)
        if (m != null) {
            val t = fx(m[2]) ?: return null
            val a = pcVal(m[3]) ?: return null
            val b = pcVal(m[4]) ?: return null
            val n = m[5].toInt()
            if (n == 0) return null
            val h = (b - a) / n
            val ys = (0..n).map { eval(t, a + it * h) }
            val simpsons = m[1].startsWith("simp")
            if (simpsons && n % 2 == 1) return out("Simpson's rule needs an even n.")
            val s = if (simpsons) h / 3 * ys.foldIndexed(0.0) { i, z, y -> z + y * (if (i == 0 || i == n) 1 else if (i % 2 == 1) 4 else 2) }
            else h / 2 * ys.foldIndexed(0.0) { i, z, y -> z + y * (if (i == 0 || i == n) 1 else 2) }
            return out(withDecimal(fixed(s, 10)) + ": Δx = " + snap(h) + ".")
        }
        // area between two curves, between where they cross
        m = find("""^(?:the )?area (?:between|enclosed by|bounded by) (?:the curves )?(?:y\s*=\s*)?(.+?) and (?:y\s*=\s*)?(.+?)$""", q)
        if (m != null && !has("""\b(?:from|on)\b""", q)) {
            val f = fx(m[1]) ?: return null
            val g = fx(m[2]) ?: return null
            val zs = zeros { eval(f, it) - eval(g, it) }
            if (zs.size < 2) return null
            val s = (0 until zs.size - 1).sumOf { i -> simpson({ abs(eval(f, it) - eval(g, it)) }, zs[i], zs[i + 1]) }
            val fr = snap(fixed(s, 8))
            return out(fr + (if ("/" in fr) " ≈ " + pcNum(fixed(s, 4)) else "") + ": the curves cross at x = " + zs.joinToString(" and ") { snap(it) } + ".")
        }
        // d/dx of an integral with a variable upper limit
        m = find("""^(?:the )?(?:d/dx|derivative) (?:of )?(?:the )?integral from (-?[\d.]+) to (.+?) of (.+?) dt$""", q)
        if (m != null) {
            val g = fx(m[2]) ?: return null
            val f = parse(m[3].replace("t", "x")) ?: return null
            val r = if (g == C.X) f else mul(subX(f, g), d(g))
            return out(str(simp(r)) + ", by the fundamental theorem of calculus" + if (g == C.X) "." else " and the chain rule.")
        }
        return null
    }

}
