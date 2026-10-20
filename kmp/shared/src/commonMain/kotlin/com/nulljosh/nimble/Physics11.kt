package com.nulljosh.nimble

import com.nulljosh.nimble.Precalc.pcNum
import com.nulljosh.nimble.Precalc.prec
import kotlin.math.abs
import kotlin.math.sqrt

/**
 * BC Physics 11 with no network: kinematics by the four constant-acceleration equations, free fall, Newton's laws,
 * weight, friction, net force, efficiency, waves, series and parallel resistors, electric power and energy, and km/h
 * to m/s, with g = 9.8 m/s². A port of `phys11()` in docs/engine.js. Precalc.answer asks it after Science10.
 */
internal object Physics11 {

    private const val G = 9.8
    private val vector = mapOf("velocity" to true, "displacement" to true, "acceleration" to true, "force" to true, "momentum" to true, "weight" to true, "impulse" to true, "speed" to false, "distance" to false, "mass" to false, "time" to false, "energy" to false, "work" to false, "power" to false, "temperature" to false, "volume" to false, "density" to false)
    private val count = mapOf("one" to 1, "two" to 2, "three" to 3, "four" to 4, "five" to 5)
    private val opposite = mapOf("right" to "left", "left" to "right", "forward" to "backward", "backward" to "forward", "up" to "down", "down" to "up", "east" to "west", "west" to "east", "north" to "south", "south" to "north")

    private val facts = listOf(
        """\bdifference between distance and displacement\b""" to "Distance is how far something travels along its path, a scalar. Displacement is the straight-line change in position with a direction, a vector.",
        """\bdifference between speed and velocity\b""" to "Speed is how fast, a scalar. Velocity is speed with a direction, a vector.",
        """\bnewton'?s first law\b""" to "An object stays at rest or keeps moving at a constant velocity unless a net force acts on it (the law of inertia).",
        """\bnewton'?s second law\b""" to "F = ma: the net force equals mass times acceleration.",
        """\bnewton'?s third law\b""" to "For every action force there is an equal and opposite reaction force on the other object.",
        """^(?:what is )?inertia$""" to "An object's tendency to resist a change in its motion. More mass means more inertia.",
        """\bspeed of sound(?: in air)?$""" to "About 343 m/s in air at 20 °C (331 m/s at 0 °C).",
        """^(?:what is )?constructive interference$""" to "Two waves meet in phase and add, making a larger wave.",
        """^(?:what is )?destructive interference$""" to "Two waves meet out of phase and cancel, making a smaller wave or none.",
        """^(?:what is )?(?:a )?transverse wave$""" to "A wave where the medium moves perpendicular to the direction the wave travels, like a wave on a rope or light.",
        """^(?:what is )?(?:a )?longitudinal wave$""" to "A wave where the medium moves parallel to the direction the wave travels, in compressions and rarefactions, like sound.",
        """\bacceleration (?:due to|of) gravity\b|^(?:what is )?(?:the value of )?g on earth$""" to "9.8 m/s² near Earth's surface.",
        """\bwavelength\b.*\bfrequency (?:doubles|is doubled)\b|\bfrequency (?:doubles|is doubled)\b.*\bwavelength\b""" to "The wavelength halves, since v = fλ and v stays the same.",
        """\bwavelength\b.*\bfrequency (?:halves|is halved)\b|\bfrequency (?:halves|is halved)\b.*\bwavelength\b""" to "The wavelength doubles, since v = fλ and v stays the same.",
    ).map { Regex(it.first) to it.second }

    /** Three significant figures, the way a physics answer is written. */
    private fun n(v: Double) = pcNum(prec(v, 3))
    private fun out(body: String) = Answer.Text(heading = null, body = body, source = "Nimble science")
    private fun find(pattern: String, s: String): List<String>? = Regex(pattern).find(s)?.groupValues
    private fun has(pattern: String, s: String) = Regex(pattern).containsMatchIn(s)

    fun answer(q: String): Answer? {
        for ((re, body) in facts) if (re.containsMatchIn(q)) return out(body)
        fun v(p: String) = find(p, q)?.get(1)?.toDouble()
        var m: List<String>?
        m = find("""^is (?:a |an )?([a-z]+) (?:a )?(?:vector or (?:a )?scalar|scalar or (?:a )?vector)(?: quantity)?$""", q)
        if (m != null) vector[m[1]]?.let { return out(if (it) "A vector: it has a size and a direction." else "A scalar: it has a size but no direction.") }
        // free fall, then the four constant-acceleration equations
        m = find("""\bdropped from ([\d.]+)\s*m\b""", q)
        if (m != null) {
            val h = m[1].toDouble()
            if (has("""\bhow long\b|\btime\b""", q)) return out(n(sqrt(2 * h / G)) + " s (t = √(2h/g))")
            if (has("""\b(speed|velocity|how fast)\b""", q)) return out(n(sqrt(2 * G * h)) + " m/s (v = √(2gh))")
        }
        m = find("""\bafter falling for ([\d.]+)\s*s\b""", q)
        if (m != null && has("""\b(velocity|speed|how fast)\b""", q)) return out(n(G * m[1].toDouble()) + " m/s (v = gt)")
        m = find("""\bfalls? for ([\d.]+)\s*s\b""", q)
        if (m != null && has("""\b(distance|how far)\b""", q)) return out(n(G * m[1].toDouble() * m[1].toDouble() / 2) + " m (d = ½gt²)")
        m = find("""\bthrown (?:straight )?up(?:ward)? at ([\d.]+)\s*m/s\b""", q)
        if (m != null) {
            val sp = m[1].toDouble()
            if (has("""\bhow high\b|\bmax(?:imum)? height\b""", q)) return out(n(sp * sp / (2 * G)) + " m (h = v²/2g)")
            if (has("""\bhow long\b""", q)) return out(n(2 * sp / G) + " s to come back down (" + n(sp / G) + " s to the top)")
        }
        val ask = find("""\b(acceleration|final velocity|final speed|initial velocity|displacement|distance|time|how long|how far)\b""", q)?.get(1)
        if (ask != null && has("""\b(m/s|accelerat|from rest)\b""", q) && !has("""\bkg\b|\bnet force\b""", q)) {
            val vi = if (has("""\bfrom rest\b|\bstarts? at rest\b""", q)) 0.0 else v("""\binitial (?:velocity|speed) (?:is |of )?(-?[\d.]+)""") ?: v("""\bfrom (-?[\d.]+)\s*m/s\b""") ?: v("""\bgoes from (-?[\d.]+)\b""")
            val vf = v("""\bfinal (?:velocity|speed) (?:is |of )?(-?[\d.]+)""") ?: v("""\bto (-?[\d.]+)\s*m/s\b""")
            // Acceleration is the number in m/s² wherever it sits; the others go by their words.
            val a = v("""(-?[\d.]+)\s*m/s(?:2|²|\^2|/s)""")
            val t = v("""\b(?:in|for|time is|after|over)\s+([\d.]+)\s*(?:s|seconds?)\b""")
            val d = v("""\b(?:over|for|displacement(?: is| of)?|distance(?: is| of)?)\s+([\d.]+)\s*m\b(?!/)""")
            val want = when {
                ask.startsWith("accel") -> "a"
                ask.startsWith("final") -> "vf"
                ask.startsWith("initial") -> "vi"
                ask.startsWith("time") || ask.startsWith("how long") -> "t"
                else -> "d"
            }
            val known = mapOf("vi" to vi, "vf" to vf, "a" to a, "t" to t, "d" to d).filterKeys { it != want }
            if (known.values.count { it != null } >= 3) {
                val r: Double? = when (want) {
                    "a" -> if (vi != null && vf != null && t != null && t != 0.0) (vf - vi) / t else if (vi != null && vf != null && d != null && d != 0.0) (vf * vf - vi * vi) / (2 * d) else if (vi != null && t != null && t != 0.0 && d != null) 2 * (d - vi * t) / (t * t) else null
                    "vf" -> if (vi != null && a != null && t != null) vi + a * t else if (vi != null && a != null && d != null) sqrt(vi * vi + 2 * a * d) else null
                    "vi" -> if (vf != null && a != null && t != null) vf - a * t else null
                    "d" -> if (vi != null && a != null && t != null) vi * t + a * t * t / 2 else if (vi != null && vf != null && t != null) (vi + vf) / 2 * t else if (vi != null && vf != null && a != null && a != 0.0) (vf * vf - vi * vi) / (2 * a) else null
                    else -> if (vi != null && vf != null && a != null && a != 0.0) (vf - vi) / a else null
                }
                if (r != null && r.isFinite()) return out(n(r) + " " + mapOf("a" to "m/s²", "vf" to "m/s", "vi" to "m/s", "d" to "m", "t" to "s").getValue(want))
            }
        }
        m = find("""\b(?:average )?speed\b.*?\b(?:goes|travels|runs|moves|covers) ([\d.]+)\s*(m|km)\b.*?\bin ([\d.]+)\s*(s|seconds?|h|hours?)\b""", q)
        if (m != null) return out(n(m[1].toDouble() / m[3].toDouble()) + " " + m[2] + "/" + if (m[4].startsWith("s")) "s" else "h")
        // forces
        m = find("""\bnet force\b.*?([\d.]+)\s*kg\b.*?\baccelerat\w* (?:at )?([\d.]+)\s*m/s""", q)
        if (m != null) return out(n(m[1].toDouble() * m[2].toDouble()) + " N (F = ma)")
        m = find("""\baccelerat\w*\b.*?([\d.]+)\s*kg\b.*?\b(?:net )?force (?:of )?([\d.]+)\s*n\b""", q)
        if (m != null) return out(n(m[2].toDouble() / m[1].toDouble()) + " m/s² (a = F/m)")
        m = find("""\bweight of (?:a |an )?([\d.]+)\s*kg\b""", q)
        if (m != null) return out(n(m[1].toDouble() * G) + " N (W = mg)")
        m = find("""\bnormal force (?:on|of) (?:a |an )?([\d.]+)\s*kg\b.*?\b(?:flat|level|horizontal)\b""", q)
        if (m != null) return out(n(m[1].toDouble() * G) + " N (it balances the weight, mg)")
        m = find("""\bmass of (?:an? )?(?:object|thing|box|person)? ?that weighs ([\d.]+)\s*n\b""", q)
        if (m != null) return out(n(m[1].toDouble() / G) + " kg (m = W/g)")
        m = find("""\bfriction\b.*?\bcoefficient (?:of (?:kinetic |static )?friction )?(?:is |of )?([\d.]+)\b.*?\bnormal force (?:is |of )?([\d.]+)\s*n\b""", q)
        if (m != null) return out(n(m[1].toDouble() * m[2].toDouble()) + " N (F = μN)")
        m = find("""\bnet force\b.*?([\d.]+)\s*n (?:of [a-z]+ )?acts? (right|left|forward|backward|up|down|east|west|north|south)\b.*?([\d.]+)\s*n (?:of [a-z]+ )?acts? (right|left|forward|backward|up|down|east|west|north|south)\b""", q)
        if (m != null) {
            val a = m[1].toDouble()
            val b = m[3].toDouble()
            if (opposite[m[2]] != m[4]) return out(n(a + b) + " N " + m[2])
            return out(if (a == b) "0 N: the forces balance." else n(abs(a - b)) + " N " + if (a > b) m[2] else m[4])
        }
        // energy, efficiency, waves
        m = find("""\befficiency\b.*?([\d.]+)\s*j\b.*?\binput\b.*?([\d.]+)\s*j\b|\befficiency\b.*?\binput (?:energy )?(?:of |is )?([\d.]+)\s*j\b.*?([\d.]+)\s*j\b""", q)
        if (m != null) {
            val inp = m[1].ifEmpty { m[3] }.toDouble()
            val use = m[2].ifEmpty { m[4] }.toDouble()
            return out(n(use / inp * 100) + "% (useful output over input)")
        }
        m = find("""\bwave ?speed\b.*?\bfrequency (?:is |of )?([\d.]+)\s*hz\b.*?\bwavelength (?:is |of )?([\d.]+)\s*m\b""", q) ?: find("""\bwave ?speed\b.*?\bwavelength (?:is |of )?([\d.]+)\s*m\b.*?\bfrequency (?:is |of )?([\d.]+)\s*hz\b""", q)
        if (m != null) return out(n(m[1].toDouble() * m[2].toDouble()) + " m/s (v = fλ)")
        m = find("""\bwavelength\b.*?([\d.]+)\s*hz\b.*?\b(?:speed|velocity)[a-z ]*? (?:is |of )?([\d.]+)\s*m/s\b""", q)
        if (m != null) return out(n(m[2].toDouble() / m[1].toDouble()) + " m (λ = v/f)")
        m = find("""\bfrequency\b.*?\b(?:speed|velocity)[a-z ]*? (?:is |of )?([\d.]+)\s*m/s\b.*?\bwavelength (?:is |of )?([\d.]+)\s*m\b""", q)
        if (m != null) return out(n(m[1].toDouble() / m[2].toDouble()) + " Hz (f = v/λ)")
        m = find("""\bperiod\b.*?\bfrequency (?:is |of )?([\d.]+)\s*hz\b""", q)
        if (m != null) return out(n(1 / m[1].toDouble()) + " s (T = 1/f)")
        m = find("""\bfrequency\b.*?\bperiod (?:is |of )?([\d.]+)\s*s\b""", q)
        if (m != null) return out(n(1 / m[1].toDouble()) + " Hz (f = 1/T)")
        // circuits: series, parallel, power, energy
        if (has("""\btotal resistance\b|\bequivalent resistance\b""", q)) {
            val rs = Regex("""\b(one|two|three|four|five)?\s*([\d.]+)\s*(?:ohm|ω|Ω)s?\b""", RegexOption.IGNORE_CASE).findAll(q).flatMap { t -> List(count[t.groupValues[1]] ?: 1) { t.groupValues[2].toDouble() } }.toList()
            if (rs.size >= 2) {
                val par = has("""\bparallel\b""", q)
                val r = if (par) 1 / rs.sumOf { 1 / it } else rs.sum()
                return out(n(r) + " Ω" + if (par) " (1/R = 1/R₁ + 1/R₂ + ...)" else " (R = R₁ + R₂ + ...)")
            }
        }
        m = find("""\bpower\b.*?([\d.]+)\s*v\b.*?([\d.]+)\s*a\b""", q) ?: find("""\bpower\b.*?([\d.]+)\s*a\b.*?([\d.]+)\s*v\b""", q)?.let { listOf(it[0], it[2], it[1]) }
        if (m != null) return out(n(m[1].toDouble() * m[2].toDouble()) + " W (P = VI)")
        m = find("""\b(?:energy|how much energy)\b.*?([\d.]+)\s*w\b.*?\bin ([\d.]+)\s*(hours?|h|minutes?|min|seconds?|s)\b""", q)
        if (m != null) {
            val sec = m[2].toDouble() * if (m[3].startsWith("h")) 3600 else if (m[3].startsWith("m")) 60 else 1
            val j = m[1].toDouble() * sec
            return out(n(j) + " J (" + n(j / 3.6e6) + " kWh)")
        }
        // km/h and m/s
        m = find("""^(?:convert )?([\d.]+)\s*(km/h|kph|m/s)\s+(?:to|in|into)\s+(km/h|kph|m/s)$""", q)
        if (m != null && m[2] != m[3]) return out(n(if (m[2] == "m/s") m[1].toDouble() * 3.6 else m[1].toDouble() / 3.6) + " " + m[3])
        return null
    }
}
