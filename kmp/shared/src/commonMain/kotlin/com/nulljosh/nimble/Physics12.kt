package com.nulljosh.nimble

import com.nulljosh.nimble.Precalc.fixed
import com.nulljosh.nimble.Precalc.jsRound
import com.nulljosh.nimble.Precalc.pcNum
import com.nulljosh.nimble.Precalc.prec
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.log10
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * BC Physics 12 with no network: vectors and relative motion, projectiles, circular motion, gravitation and orbits,
 * momentum and collisions, torque and balance, inclines, electrostatics, and magnetic force, with g = 9.8 m/s²,
 * G = 6.674 × 10⁻¹¹ and k = 8.99 × 10⁹. A port of `phys12()` in docs/engine.js. Precalc.answer asks it before
 * Physics11.
 */
internal object Physics12 {

    private const val BIG_G = 6.674e-11
    private const val K = 8.99e9
    private const val EARTH_MASS = 5.972e24
    private const val EARTH_RADIUS = 6371e3
    private const val G = 9.8
    private const val RAD = PI / 180
    private val dir = mapOf("east" to (1 to 0), "west" to (-1 to 0), "north" to (0 to 1), "south" to (0 to -1), "right" to (1 to 0), "left" to (-1 to 0), "up" to (0 to 1), "down" to (0 to -1))
    private val field = mapOf("earth" to 9.8, "moon" to 1.62, "mars" to 3.71, "jupiter" to 24.8, "venus" to 8.87, "mercury" to 3.7, "saturn" to 10.4, "sun" to 274.0)
    private val prefix = mapOf("micro" to 1e-6, "μ" to 1e-6, "u" to 1e-6, "nano" to 1e-9, "n" to 1e-9, "milli" to 1e-3, "m" to 1e-3, "pico" to 1e-12, "p" to 1e-12)
    private const val N = """([\d.]+(?:\s*[x×*]\s*10\s*\^\s*-?\d+)?)"""

    private fun sup(s: String) = s.map { c -> val i = "0123456789+-".indexOf(c); if (i >= 0) "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻"[i] else c }.joinToString("")
    private fun sci(v: Double): String { val e = floor(log10(abs(v)) + 1e-12).toInt(); return pcNum(prec(v / 10.0.pow(e), 3)) + " × 10" + sup("$e") }
    private fun s3(v: Double) = if (abs(v) >= 1e5 || (abs(v) < 1e-3 && v != 0.0)) sci(v) else pcNum(prec(v, 3))
    private fun num(s: String): Double? {
        val m = Regex("""^([\d.]+)\s*(?:[x×*]\s*10\s*\^\s*(-?\d+))?$""").find(s.trim())?.groupValues ?: return null
        return m[1].toDouble() * 10.0.pow(m[2].ifEmpty { "0" }.toInt())
    }
    private fun charge(v: String, p: String) = (num(v) ?: Double.NaN) * if (p.isNotEmpty()) prefix[p] ?: 1.0 else 1.0

    private val facts = listOf(
        // The constants table answers "the gravitational constant" with NIST's value; these are the wordings it does not take.
        """^(?:what is )?(?:the )?(?:universal )?gravitational constant,? g$|^(?:the )?value of (?:big )?g$""" to "G = 6.674 × 10⁻¹¹ N·m²/kg² (6.67430 × 10⁻¹¹ exactly, from NIST).",
        """\bspeed of light in (?:m/s|metres per second|meters per second|km/s)$""" to "3.00 × 10⁸ m/s (299,792,458 m/s exactly).",
        """\bcoulomb'?s constant\b""" to "k = 8.99 × 10⁹ N·m²/C².",
        """\bconserved in an elastic collision\b""" to "Both momentum and kinetic energy.",
        """\bconserved in an? (?:perfectly )?inelastic collision\b""" to "Momentum. Some kinetic energy turns into heat, sound or deformation, so kinetic energy is not conserved.",
        """\bconditions? for (?:static )?equilibrium\b""" to "The net force is zero and the net torque is zero.",
        """^(?:what is )?torque$""" to "The turning effect of a force: τ = F·r·sinθ, the force times its perpendicular distance (lever arm) from the pivot.",
        """^(?:what is )?(?:an? )?electric field$""" to "The region around a charge where another charge feels a force; its strength is the force per unit charge, E = F/q.",
        """^(?:what is )?electric potential$""" to "The electric potential energy per unit charge at a point, V = E_p/q, measured in volts.",
        """^(?:what is )?(?:electromagnetic )?induction$""" to "A changing magnetic field through a conductor induces a voltage (emf), which drives a current if the circuit is closed.",
        """\blenz'?s law\b""" to "The induced current flows in the direction that opposes the change in magnetic flux that caused it.",
        """^(?:what is )?(?:a )?transformer$""" to "Two coils on an iron core. A changing current in one induces a voltage in the other, stepping the voltage up or down by the ratio of turns.",
        """\bright[- ]hand rule\b""" to "The direction of the magnetic field around a current, or of the magnetic force on a moving positive charge or a current in a field.",
    ).map { Regex(it.first) to it.second }

    private fun out(body: String) = Answer.Text(heading = null, body = body, source = "Nimble science")
    private fun find(pattern: String, s: String): List<String>? = Regex(pattern).find(s)?.groupValues
    private fun has(pattern: String, s: String) = Regex(pattern).containsMatchIn(s)

    fun answer(q: String, raw: String): Answer? {
        for ((re, body) in facts) if (re.containsMatchIn(q)) return out(body)
        var m: List<String>?
        // inverse-square scaling for gravity and electricity
        m = find("""\bwhat happens to (?:the )?(gravitational|electric|electrostatic|coulomb) force if (the distance|the separation|both (?:masses|charges)|one (?:mass|charge)|the mass|the charge) (doubles?|triples?|quadruples?|(?:is|are) (?:doubled|tripled|quadrupled|halved)|halves|halve)\b""", q)
        if (m != null) {
            val k = if ("doubl" in m[3]) 2.0 else if ("tripl" in m[3]) 3.0 else if ("quadrupl" in m[3]) 4.0 else 0.5
            val f = if (has("distance|separation", m[2])) 1 / (k * k) else if ("both" in m[2]) k * k else k
            return out(if (f >= 1) "It becomes ${pcNum(f)} times larger." else "It becomes 1/${pcNum(1 / f)} as large" + (if (f == 0.25) " (a quarter)" else if (abs(f - 1.0 / 9) < 1e-12) " (a ninth)" else "") + ".")
        }
        // vectors
        m = find("""\bresultant\b.*?([\d.]+)\s*([a-z/]+)?\s*(east|west|north|south)\b.*?([\d.]+)\s*[a-z/]*\s*(east|west|north|south)\b""", q)
        if (m != null) {
            val (dx1, dy1) = dir.getValue(m[3])
            val (dx2, dy2) = dir.getValue(m[5])
            val x = dx1 * m[1].toDouble() + dx2 * m[4].toDouble()
            val y = dy1 * m[1].toDouble() + dy2 * m[4].toDouble()
            val mag = hypot(x, y)
            val unit = if (m[2].isNotEmpty() && m[2] !in dir) " " + (if (m[2] == "n") "N" else m[2]) else ""
            if (y == 0.0 || x == 0.0) return out(s3(mag) + unit + " " + if (x > 0) "east" else if (x < 0) "west" else if (y > 0) "north" else "south")
            val ang = atan(abs(y) / abs(x)) / RAD
            return out(s3(mag) + unit + " at " + pcNum(fixed(ang, 1)) + "° " + (if (y > 0) "north" else "south") + " of " + if (x > 0) "east" else "west")
        }
        m = find("""\b(horizontal|vertical|x|y)[- ]component of (?:a |an )?([\d.]+)\s*([a-z/]+)\b.*?\bat ([\d.]+)\s*(?:°|degrees?)""", q)
        if (m != null) {
            val th = m[4].toDouble() * RAD
            val v = m[2].toDouble() * if (m[1] == "horizontal" || m[1] == "x") cos(th) else sin(th)
            return out(s3(v) + " " + if (m[3] == "n") "N" else m[3])
        }
        m = find("""\b(?:flies|flying|travels|swims|moves|rows|paddles)\b.*?([\d.]+)\s*(km/h|m/s)\b.*?([\d.]+)\s*(?:km/h|m/s)\b""", q)
        if (m != null && has("""\b(ground speed|resultant|actual speed|speed relative)\b""", q)) {
            val a = m[1].toDouble()
            val b = m[3].toDouble()
            if (has("""\bacross\b""", q)) return out(s3(hypot(a, b)) + " " + m[2] + " (at " + pcNum(fixed(atan(b / a) / RAD, 1)) + "° downstream from straight across)")
            val w = find("""\b(north|south|east|west)\b.*\bwind from the (north|south|east|west)\b""", q)
            val head = has("""\bheadwind\b|\binto\b|\bagainst\b""", q) || (w != null && w[1] == w[2])
            return out(s3(if (head) a - b else a + b) + " " + if ("km/h" in q) "km/h" else "m/s")
        }
        // projectiles
        m = find("""\b(?:thrown|kicked|launched|rolls|fired|shot|driven)\b.*?\bhorizontally at ([\d.]+)\s*m/s\b.*?\b([\d.]+)\s*m\b(?!/)""", q)
        if (m != null) {
            val v = m[1].toDouble()
            val t = sqrt(2 * m[2].toDouble() / G)
            if (has("""\bhow long\b|\btime\b""", q)) return out(s3(t) + " s")
            if (has("""\b(speed|velocity|how fast)\b.*\b(land|ground|hit)""", q)) return out(s3(hypot(v, G * t)) + " m/s")
            return out(s3(v * t) + " m from the base (it falls for " + s3(t) + " s)")
        }
        m = find("""\b(range|maximum height|max height|time of flight|how high|how far|how long)\b.*?\blaunched at ([\d.]+)\s*m/s at ([\d.]+)\s*(?:°|degrees?)""", q)
            ?: find("""\blaunched at ([\d.]+)\s*m/s at ([\d.]+)\s*(?:°|degrees?)\b.*?\b(range|maximum height|max height|time of flight|how high|how far|how long)\b""", q)?.let { listOf(it[0], it[3], it[1], it[2]) }
        if (m != null) {
            val v = m[2].toDouble()
            val th = m[3].toDouble() * RAD
            if (has("range|how far", m[1])) return out(s3(v * v * sin(2 * th) / G) + " m (R = v² sin 2θ / g)")
            if (has("height|how high", m[1])) return out(s3((v * sin(th)).pow(2) / (2 * G)) + " m")
            return out(s3(2 * v * sin(th) / G) + " s")
        }
        // circular motion
        m = find("""\bcentripetal (acceleration|force)\b.*?(?:([\d.]+)\s*kg\b.*?)?\b([\d.]+)\s*m/s\b.*?\bradius (?:of )?([\d.]+)\s*m\b""", q)
        if (m != null) {
            val a = m[3].toDouble().pow(2) / m[4].toDouble()
            if (m[1] == "force") { if (m[2].isEmpty()) return null; return out(s3(m[2].toDouble() * a) + " N (F = mv²/r)") }
            return out(s3(a) + " m/s² (a = v²/r)")
        }
        m = find("""\bperiod\b.*?\bcircle of radius ([\d.]+)\s*m\b.*?\bat ([\d.]+)\s*m/s\b""", q) ?: find("""\bperiod\b.*?([\d.]+)\s*m/s\b.*?\bradius (?:of )?([\d.]+)\s*m\b""", q)?.let { listOf(it[0], it[2], it[1]) }
        if (m != null) return out(s3(2 * PI * m[1].toDouble() / m[2].toDouble()) + " s (T = 2πr/v)")
        // gravitation
        m = find("""\bgravitational force between\b(.*)$""", q)
        if (m != null) {
            val rest = m[1]
            val ms = Regex("""([\d.]+(?:\s*[x×*]\s*10\s*\^\s*-?\d+)?)\s*kg\b""").findAll(rest).mapNotNull { num(it.groupValues[1]) }.toList()
            val two = find("""\btwo ([\d.]+)\s*kg\b""", rest)
            val r = find("""([\d.]+)\s*(m|km)\s*apart\b""", rest) ?: return null
            val a = two?.get(1)?.toDouble() ?: ms.getOrNull(0) ?: return null
            val b = two?.get(1)?.toDouble() ?: ms.getOrNull(1) ?: return null
            val d = r[1].toDouble() * if (r[2] == "km") 1000 else 1
            return out(sci(BIG_G * a * b / (d * d)) + " N (F = Gm₁m₂/r²)")
        }
        m = find("""\bgravitational field strength\b.*?\b(?:surface of|on) (?:the )?(earth|moon|mars|jupiter|venus|mercury|saturn|sun)\b""", q)
        if (m != null) { val v = Precalc.js(field.getValue(m[1])); return out("$v N/kg (the same as $v m/s²)") }
        m = find("""\bgravitational field strength\b.*?\b([\d.]+) earth radii\b""", q)
        if (m != null) return out(s3(9.8 / m[1].toDouble().pow(2)) + " N/kg (g falls with 1/r²)")
        m = find("""\borbital (?:speed|velocity)\b.*?([\d.,]+)\s*(km|m)\b\s*(from the cent(?:er|re)|above the surface|above earth|altitude)""", q)
        if (m != null) {
            val r = m[1].replace(",", "").toDouble() * (if (m[2] == "km") 1000 else 1) + if (has("above|altitude", m[3])) EARTH_RADIUS else 0.0
            val v = sqrt(BIG_G * EARTH_MASS / r)
            return out(s3(v / 1000) + " km/s (" + jsRound(v).toLong() + " m/s, v = √(GM/r))")
        }
        // momentum, impulse, collisions
        m = find("""^(?:the )?momentum of (?:a |an )?([\d.]+)\s*kg\b.*?\b([\d.]+)\s*m/s\b""", q)
        if (m != null) return out(s3(m[1].toDouble() * m[2].toDouble()) + " kg·m/s (p = mv)")
        m = find("""\bimpulse\b.*?\b([\d.]+)\s*n force acts? for ([\d.]+)\s*s\b""", q)
        if (m != null) return out(s3(m[1].toDouble() * m[2].toDouble()) + " N·s (J = FΔt)")
        m = find("""([\d.]+)\s*kg\b.*?\bchanges? (?:its )?velocity from (-?[\d.]+)\s*m/s to (-?[\d.]+)\s*m/s\b""", q)
        if (m != null && has("""\bmomentum|impulse\b""", q)) {
            val dp = m[1].toDouble() * (m[3].toDouble() - m[2].toDouble())
            return out(s3(dp) + " kg·m/s (a change of " + s3(abs(dp)) + " in size)")
        }
        m = find("""\b([\d.]+)\s*kg\b[^,]*?\bat ([\d.]+)\s*m/s\b.*?\b([\d.]+)\s*kg\b[^,]*?\b(?:at rest|at ([\d.]+)\s*m/s)\b""", q)
        if (m != null) {
            val m1 = m[1].toDouble()
            val v1 = m[2].toDouble()
            val m2 = m[3].toDouble()
            val v2 = m[4].ifEmpty { "0" }.toDouble()
            if (has("""\bstick\b|\binelastic\b|\bcouple\b|\btogether\b""", q)) return out(s3((m1 * v1 + m2 * v2) / (m1 + m2)) + " m/s (momentum is conserved)")
            if (has("""\belastic""", q)) {
                val u1 = ((m1 - m2) * v1 + 2 * m2 * v2) / (m1 + m2)
                val u2 = ((m2 - m1) * v2 + 2 * m1 * v1) / (m1 + m2)
                val second = has("""\bsecond\b""", q)
                return out(s3(if (second) u2 else u1) + " m/s (the " + (if (second) "second" else "first") + " ball; the other moves at " + s3(if (second) u1 else u2) + " m/s)")
            }
        }
        // torque, balance, inclines
        m = find("""\btorque\b.*?([\d.]+)\s*n\b(?: force)?.*?([\d.]+)\s*m\b(?: from (?:the|a) pivot)?(?:.*?([\d.]+)\s*(?:°|degrees?))?""", q)
        if (m != null) {
            val th = if (m[3].isNotEmpty()) m[3].toDouble() * RAD else PI / 2
            return out(s3(m[1].toDouble() * m[2].toDouble() * sin(th)) + " N·m (τ = Fr sinθ)")
        }
        m = find("""\b([\d.]+)\s*kg\b.*?\b([\d.]+)\s*m from (?:the )?pivot\b.*?\b([\d.]+)\s*kg\b""", q)
        if (m != null && has("""\bbalance\b""", q)) return out(s3(m[1].toDouble() * m[2].toDouble() / m[3].toDouble()) + " m from the pivot (m₁r₁ = m₂r₂)")
        m = find("""\b([\d.]+)\s*(?:degree|°)\s*(?:incline|ramp|slope|hill)\b""", q) ?: find("""\b(?:incline|ramp|slope) (?:of |at )?([\d.]+)\s*(?:°|degrees?)""", q)
        if (m != null) {
            val th = m[1].toDouble() * RAD
            val kg = find("""([\d.]+)\s*kg\b""", q)?.get(1)?.toDouble()
            val mu = find("""\bcoefficient (?:of (?:kinetic )?friction )?(?:is |of )?([\d.]+)""", q)?.get(1)?.toDouble()
            if (has("""\bnormal force\b""", q) && kg != null) return out(s3(kg * G * cos(th)) + " N (mg cos θ)")
            if (has("""\baccelerat""", q)) return out(s3(G * (sin(th) - (mu ?: 0.0) * cos(th))) + " m/s² (g sin θ" + (if (mu != null) " - μg cos θ" else "") + ")")
            if (has("""\b(force|push|pull)\b""", q) && kg != null) return out(s3(kg * G * (sin(th) + (mu ?: 0.0) * cos(th))) + " N (mg sin θ" + (if (mu != null) " + μmg cos θ" else "") + ")")
        }
        // electrostatics and magnetism, read as typed so μC stays μC
        val r2 = raw.lowercase()
        m = find("""\belectric (?:force|attraction|repulsion) between\b.*?\btwo $N\s*(micro|nano|milli|pico|μ|n|m|p|u)?\s*(?:coulombs?|c)\b.*?\b([\d.]+)\s*(m|cm)\s*apart\b""", r2)
        if (m != null) {
            val qv = charge(m[1], m[2])
            val d = m[3].toDouble() / if (m[4] == "cm") 100 else 1
            return out(s3(K * qv * qv / (d * d)) + " N (F = kq₁q₂/r²)")
        }
        m = find("""\belectric field\b.*?\b([\d.]+)\s*(m|cm)\s*from (?:a |an )?$N\s*(micro|nano|milli|pico|μ|n|m|p|u)?\s*(?:coulombs?|c)\b""", r2)
        if (m != null) {
            val d = m[1].toDouble() / if (m[2] == "cm") 100 else 1
            return out(s3(K * charge(m[3], m[4]) / (d * d)) + " N/C (E = kq/r²)")
        }
        m = find("""\bwork\b.*?\b([\d.]+)\s*c charge\b.*?\b([\d.]+)\s*v\b""", q)
        if (m != null) return out(s3(m[1].toDouble() * m[2].toDouble()) + " J (W = qV)")
        m = find("""\bmagnetic force on a wire ([\d.]+)\s*m long carrying ([\d.]+)\s*a in a ([\d.]+)\s*t field\b""", q)
        if (m != null) return out(s3(m[1].toDouble() * m[2].toDouble() * m[3].toDouble()) + " N (F = BIL)")
        m = find("""\bmagnetic force on (?:a |an )?$N\s*c charge moving at $N\s*m/s in a ([\d.]+)\s*t field\b""", q)
        if (m != null) {
            val qv = num(m[1]) ?: return null
            val v = num(m[2]) ?: return null
            return out(sci(qv * v * m[3].toDouble()) + " N (F = qvB)")
        }
        return null
    }
}
