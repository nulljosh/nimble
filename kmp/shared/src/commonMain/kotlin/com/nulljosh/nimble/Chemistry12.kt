package com.nulljosh.nimble

import com.nulljosh.nimble.Precalc.fixed
import com.nulljosh.nimble.Precalc.pcNum
import com.nulljosh.nimble.Precalc.prec
import com.nulljosh.nimble.Science10.by
import com.nulljosh.nimble.Science10.parse
import com.nulljosh.nimble.Science10.sub
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sqrt

/**
 * BC Chemistry 12 with no network: pH and pOH, strong and weak acids, conjugate pairs, Ka, titration, equilibrium
 * expressions and Keq, Le Chatelier, Ksp and solubility, oxidation numbers, redox agents, cell potentials and
 * half-reactions. A port of `chem12()` in docs/engine.js, using the Science10 tables. Precalc.answer asks it after
 * Science10.
 */
internal object Chemistry12 {

    private val strongAcid = mapOf("HCl" to 1, "HBr" to 1, "HI" to 1, "HNO3" to 1, "HClO4" to 1, "H2SO4" to 2)
    private val strongBase = mapOf("LiOH" to 1, "NaOH" to 1, "KOH" to 1, "RbOH" to 1, "CsOH" to 1, "Ca(OH)2" to 2, "Sr(OH)2" to 2, "Ba(OH)2" to 2)
    private val acidNames = mapOf("hydrochloric acid" to "HCl", "hydrobromic acid" to "HBr", "hydroiodic acid" to "HI", "nitric acid" to "HNO3", "perchloric acid" to "HClO4", "sulfuric acid" to "H2SO4", "acetic acid" to "HC2H3O2", "ethanoic acid" to "HC2H3O2", "hydrofluoric acid" to "HF", "carbonic acid" to "H2CO3", "phosphoric acid" to "H3PO4", "hydrocyanic acid" to "HCN", "formic acid" to "HCOOH", "sodium hydroxide" to "NaOH", "potassium hydroxide" to "KOH", "lithium hydroxide" to "LiOH", "calcium hydroxide" to "Ca(OH)2", "barium hydroxide" to "Ba(OH)2", "ammonia" to "NH3")
    /** Standard reduction potentials (V) at 25 °C, by the oxidized form. */
    private val potentials = listOf("Li+" to -3.04, "K+" to -2.93, "Ca2+" to -2.87, "Na+" to -2.71, "Mg2+" to -2.37, "Al3+" to -1.66, "Zn2+" to -0.76, "Fe2+" to -0.44, "Ni2+" to -0.25, "Sn2+" to -0.14, "Pb2+" to -0.13, "H+" to 0.0, "Cu2+" to 0.34, "I2" to 0.54, "Ag+" to 0.80, "Br2" to 1.07, "Cl2" to 1.36, "Au3+" to 1.50, "F2" to 2.87)
    private val ionCharge = mapOf("Li" to 1, "Na" to 1, "K" to 1, "Rb" to 1, "Cs" to 1, "Ag" to 1, "Be" to 2, "Mg" to 2, "Ca" to 2, "Sr" to 2, "Ba" to 2, "Zn" to 2, "Al" to 3, "F" to -1, "Cl" to -1, "Br" to -1, "I" to -1, "O" to -2, "S" to -2, "Se" to -2, "N" to -3, "P" to -3, "H" to 1)
    private val polys = listOf("NH4" to 1, "OH" to -1, "NO3" to -1, "NO2" to -1, "SO4" to -2, "SO3" to -2, "CO3" to -2, "HCO3" to -1, "PO4" to -3, "ClO3" to -1, "C2H3O2" to -1, "MnO4" to -1, "CrO4" to -2, "Cr2O7" to -2)
    private val otherCation = mapOf("Pb" to 2, "Fe" to 3, "Cu" to 2, "Ni" to 2, "Co" to 2, "Mn" to 2, "Sn" to 2, "Hg" to 2, "Cr" to 3)

    private fun sup(s: String) = s.map { c -> val i = "0123456789+-".indexOf(c); if (i >= 0) "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻"[i] else c }.joinToString("")
    private fun power(k: Int) = if (k > 1) sup("$k") else ""

    /**
     * An ion as formula and charge. A number before the sign is the charge on a one-element ion (Cu2+) or after a space
     * or ^ (CO3 2-, SO4^2-); otherwise it belongs to the formula (HCO3-, NH4+).
     */
    fun ion(s: String): Pair<String, Int> {
        val t = s.trim()
        val m = Regex("""^(.+?)(\s+|\^)?(\d*)([+-])$""").find(t)?.groupValues ?: return t to 0
        if (!m[1].any { it.isLetter() }) return t to 0
        val sign = if (m[4] == "+") 1 else -1
        val one = Regex("^[A-Z][a-z]?$").matches(m[1])
        if (m[3].isNotEmpty() && m[2].isEmpty() && !one) return m[1] + m[3] to sign
        return m[1] to sign * m[3].ifEmpty { "1" }.toInt()
    }

    private fun show(f: String, c: Int) = sub(f) + if (c != 0) sup((if (abs(c) > 1) "${abs(c)}" else "") + if (c > 0) "+" else "-") else ""

    /** Sci notation with a clean mantissa: 1 × 10⁻⁵, 1.34 × 10⁻⁵. */
    private fun sci(v: Double): String {
        val e = floor(log10(abs(v)) + 1e-12).toInt()
        return pcNum(prec(v / 10.0.pow(e), 3)) + " × 10" + sup("$e")
    }

    /** A typed number: "1 x 10^-3", "1.8 × 10^-5", "1e-3", "0.001". */
    private fun num(s: String): Double? {
        val m = Regex("""^([\d.]+)\s*(?:[x×*]\s*10\s*\^\s*(-?\d+)|e(-?\d+))?$""", RegexOption.IGNORE_CASE).find(s.trim())?.groupValues ?: return null
        return m[1].toDouble() * 10.0.pow(m[2].ifEmpty { m[3] }.ifEmpty { "0" }.toInt())
    }

    private const val N = """([\d.]+(?:\s*[x×*]\s*10\s*\^\s*-?\d+|e-?\d+)?)"""

    /** Oxidation number of one element in a formula with a charge, by the usual rules for everything else. */
    private fun ox(target: String, f: String, charge: Int): Double? {
        val c = parse(f) ?: return null
        val k = c[target] ?: return null
        if (c.size == 1) return charge.toDouble() / k
        val peroxide = Regex("^(H2O2|Na2O2|K2O2|BaO2|Li2O2)$").matches(f)
        val metalHydride = c["H"] != null && c.keys.any { it in setOf("Li", "Na", "K", "Rb", "Cs", "Mg", "Ca", "Sr", "Ba") } && c["O"] == null
        fun rule(e: String): Int? = when {
            e == "F" -> -1
            e in setOf("Li", "Na", "K", "Rb", "Cs") -> 1
            e in setOf("Be", "Mg", "Ca", "Sr", "Ba") -> 2
            e == "Al" -> 3
            e == "H" -> if (metalHydride) -1 else 1
            e == "O" -> if (peroxide) -1 else if (c["F"] != null) 2 else -2
            e in setOf("Cl", "Br", "I") && c["O"] == null -> -1
            else -> null
        }
        var sum = 0
        for ((e, n) in c) { if (e == target) continue; sum += (rule(e) ?: return null) * n }
        return (charge - sum).toDouble() / k
    }

    private fun sign(v: Double) = (if (v > 0) "+" else if (v < 0) "-" else "") + pcNum(abs(fixed(v, 3)))

    private class Term(val k: Int, val f: String, val charge: Int, val state: String)

    private fun side(s: String) = s.split(Regex("""\s+\+\s+""")).map { t ->
        val m = Regex("""^(\d*)\s*(.+?)(?:\s*\((s|l|g|aq)\))?$""").find(t.trim())!!.groupValues
        val (f, ch) = ion(m[2])
        Term(m[1].ifEmpty { "1" }.toInt(), f, ch, m[3])
    }

    private val arrow = Regex("""\s*(?:<->|<=>|⇌|↔|->|→|=)\s*""")

    private val facts = listOf(
        """\bkw\b(?: at 25 ?°? ?c)?$|\bion product of water\b""" to "Kw = [H⁺][OH⁻] = 1.0 × 10⁻¹⁴ at 25 °C.",
        """^(?:what is )?(?:the )?ph of pure water""" to "7.00 at 25 °C: [H⁺] = [OH⁻] = 1.0 × 10⁻⁷ M.",
        """^(?:what is )?(?:a )?br[øo]nsted[- ]lowry acid$""" to "A proton (H⁺) donor.",
        """^(?:what is )?(?:a )?br[øo]nsted[- ]lowry base$""" to "A proton (H⁺) acceptor.",
        """^(?:what is )?(?:an? )?arrhenius acid$""" to "A substance that makes H⁺ (H₃O⁺) in water.",
        """^(?:what is )?(?:an? )?arrhenius base$""" to "A substance that makes OH⁻ in water.",
        """^(?:what is )?(?:an? )?amphoteric(?: substance)?$|^(?:what is )?amphiprotic$""" to "A substance that can act as an acid or a base, such as water or HCO₃⁻.",
        """^(?:what is )?(?:a )?buffer(?: solution)?$""" to "A mix of a weak acid and its conjugate base (or a weak base and its conjugate acid) that resists changes in pH when small amounts of acid or base are added.",
        """^(?:what is )?(?:the )?equivalence point$""" to "The point in a titration where the moles of acid equal the moles of base added, so it is exactly neutralized.",
        """^(?:what is )?(?:the )?end ?point(?: of a titration)?$""" to "The point where the indicator changes colour; a good indicator puts it at the equivalence point.",
        """\bindicator\b.*\bstrong acid\b.*\bstrong base\b|\bindicator\b.*\bstrong base\b.*\bstrong acid\b""" to "Bromothymol blue (or phenolphthalein): the equivalence point is at pH 7.",
        """\bindicator\b.*\bweak acid\b.*\bstrong base\b""" to "Phenolphthalein: the equivalence point is above pH 7.",
        """\bindicator\b.*\bstrong acid\b.*\bweak base\b""" to "Methyl orange (or methyl red): the equivalence point is below pH 7.",
        """^(?:what is )?activation energy$""" to "The minimum energy colliding particles need to react: the energy needed to start a reaction. A catalyst (an enzyme in the body) lowers it.",
        """\bhow does a catalyst\b|\bwhat does a catalyst do\b|^(?:what is )?a catalyst$""" to "It speeds up a reaction by giving it a pathway with a lower activation energy, and it is not used up.",
        """\bdoes a catalyst change (?:the )?(?:equilibrium|position|value of k|k\b|keq)""" to "No. A catalyst speeds up the forward and reverse reactions equally, so equilibrium comes sooner but its position and K do not change.",
        """\bfactors (?:that )?affect (?:the )?(?:reaction )?rate\b|\bwhat affects (?:the )?rate\b""" to "Temperature, concentration (or pressure for gases), surface area, the nature of the reactants, and a catalyst.",
        """^(?:what is )?collision theory$""" to "Particles react only when they collide with enough energy (the activation energy) and the right orientation.",
        """^(?:what is )?(?:the )?rate of (?:a )?reaction$|^(?:what is )?reaction rate$""" to "The change in the amount or concentration of a reactant or product per unit of time.",
        """\bwhy does (?:increasing |raising )?temperature increase (?:the )?(?:reaction )?rate\b""" to "Particles move faster, so they collide more often and more of the collisions have enough energy to react.",
        """\bhow does surface area affect (?:the )?(?:reaction )?rate\b""" to "More surface area exposes more particles, so there are more collisions and the reaction goes faster.",
        """^(?:what is )?(?:a )?reaction mechanism$""" to "The series of elementary steps that make up the overall reaction. The slowest step sets the rate.",
        """^(?:what is )?(?:the )?rate[- ]determining step$""" to "The slowest step in a mechanism, which sets the overall rate.",
        """\bprecipitate\b.*\bq\b.*\b(?:greater|more|larger|bigger) than ksp\b|\bq\s*>\s*ksp\b""" to "Yes. When the trial ion product Q is greater than Ksp, the solution is supersaturated and a precipitate forms.",
        """\bprecipitate\b.*\bq\b.*\b(?:less|smaller|lower) than ksp\b|\bq\s*<\s*ksp\b""" to "No. When Q is less than Ksp, the solution is unsaturated and more can dissolve.",
        """^(?:what is )?oxidation$""" to "Loss of electrons (the oxidation number goes up). LEO the lion says GER.",
        """^(?:what is )?reduction$""" to "Gain of electrons (the oxidation number goes down).",
        """^(?:what is )?(?:an? )?oxidizing agent$""" to "The substance that is reduced: it takes electrons from something else.",
        """^(?:what is )?(?:a )?reducing agent$""" to "The substance that is oxidized: it gives electrons to something else.",
        """\b(?:happens )?at the anode\b|^(?:what is )?(?:the )?anode$""" to "Oxidation. In a galvanic cell the anode is negative; in an electrolytic cell it is positive.",
        """\b(?:happens )?at the cathode\b|^(?:what is )?(?:the )?cathode$""" to "Reduction. In a galvanic cell the cathode is positive; in an electrolytic cell it is negative.",
        """^(?:what is )?electrolysis$""" to "Using electricity to drive a non-spontaneous redox reaction, such as splitting water or plating a metal.",
        """^(?:what is )?(?:a )?(?:galvanic|voltaic) cell$""" to "A cell where a spontaneous redox reaction turns chemical energy into electrical energy.",
        """^(?:what is )?(?:an? )?electrolytic cell$""" to "A cell where an outside power source drives a non-spontaneous redox reaction.",
        """^(?:what is )?(?:a |the )?salt bridge$""" to "It connects the two half-cells and lets ions move to keep each side neutral, so current keeps flowing.",
        """\bexothermic\b.*\btemperature (?:increases|is increased|rises|goes up)|\bincrease (?:the )?temperature\b.*\bexothermic\b""" to "It shifts left, toward the reactants: heat is a product, so adding heat favours the reverse reaction, and K gets smaller.",
        """\bexothermic\b.*\btemperature (?:decreases|is decreased|falls|drops|goes down)""" to "It shifts right, toward the products, and K gets larger.",
        """\bendothermic\b.*\btemperature (?:increases|is increased|rises|goes up)|\bincrease (?:the )?temperature\b.*\bendothermic\b""" to "It shifts right, toward the products: heat is a reactant, so adding heat favours the forward reaction, and K gets larger.",
        """\bendothermic\b.*\btemperature (?:decreases|is decreased|falls|drops|goes down)""" to "It shifts left, toward the reactants, and K gets smaller.",
    ).map { Regex(it.first) to it.second }

    private class Salt(val cat: String, val x: Int, val cc: Int, val an: String, val y: Int, val ac: Int)

    private fun salt(f: String): Salt? {
        val m = Regex("""^([A-Z][a-z]?)(\d*)(.+)$""").find(f)?.groupValues ?: return null
        val cat = m[1]
        val x = m[2].ifEmpty { "1" }.toInt()
        val rest = m[3]
        val cc = ionCharge[cat]?.takeIf { it > 0 } ?: otherCation[cat] ?: return null
        val an: String
        val y: Int
        val p = Regex("""^\((.+)\)(\d+)$""").find(rest)?.groupValues
        if (p != null) { an = p[1]; y = p[2].toInt() }
        else if (polys.any { it.first == rest }) { an = rest; y = 1 }
        else {
            val t = Regex("""^([A-Z][a-z]?)(\d*)$""").find(rest)?.groupValues
            if (t != null) { an = t[1]; y = t[2].ifEmpty { "1" }.toInt() } else { an = rest; y = 1 }
        }
        val ac = polys.firstOrNull { it.first == an }?.second ?: ionCharge[an] ?: return null
        if (ac >= 0 || cc * x + ac * y != 0) return null
        return Salt(cat, x, cc, an, y, ac)
    }

    private fun out(body: String) = Answer.Text(heading = null, body = body, source = "Nimble science")
    private fun find(pattern: String, s: String): List<String>? = Regex(pattern).find(s)?.groupValues
    private fun findI(pattern: String, s: String): List<String>? = Regex(pattern, RegexOption.IGNORE_CASE).find(s)?.groupValues
    private fun has(pattern: String, s: String) = Regex(pattern).containsMatchIn(s)
    private fun hasI(pattern: String, s: String) = Regex(pattern, RegexOption.IGNORE_CASE).containsMatchIn(s)

    fun answer(q: String, raw: String): Answer? {
        val r = raw.trim().replace(Regex("[?!]+$"), "")
        val typed = r.replaceFirst(Regex("""^(?:what(?:'s|’s| is)\s+)?(?:the\s+)?""", RegexOption.IGNORE_CASE), "")
        for ((re, body) in facts) if (re.containsMatchIn(q)) return out(body)
        var m: List<String>?
        // pH, pOH, [H+] and [OH-]
        m = find("""\bph\b.*?\[h\+?\]\s*(?:=|of|is)?\s*$N""", q)
        if (m != null) num(m[1])?.let { if (it > 0) return out("pH = " + pcNum(fixed(-log10(it), 2))) }
        m = find("""\bph\b.*?\[oh-?\]\s*(?:=|of|is)?\s*$N""", q)
        if (m != null) num(m[1])?.let { if (it > 0) return out("pH = " + pcNum(fixed(14 + log10(it), 2))) }
        m = find("""\bpoh\b.*?\bph (?:of |=\s*|is )?([\d.]+)""", q)
        if (m != null) return out("pOH = " + pcNum(fixed(14 - m[1].toDouble(), 2)))
        m = find("""^(?:the )?ph\b.*?\bpoh (?:of |=\s*|is )?([\d.]+)""", q)
        if (m != null) return out("pH = " + pcNum(fixed(14 - m[1].toDouble(), 2)))
        m = find("""^\[(h\+|h3o\+|oh-)\]\s*(?:of|in|for) (?:a )?(?:solution )?(?:with )?(?:a )?ph (?:of |=\s*)?([\d.]+)""", q)
        if (m != null) {
            val ph = m[2].toDouble()
            val oh = "oh" in m[1]
            return out("[" + (if (oh) "OH⁻" else "H⁺") + "] = " + sci(10.0.pow(-(if (oh) 14 - ph else ph))) + " M")
        }
        m = findI("""^(?:the )?ph of (?:a )?$N\s*m\s+(?:solution of )?(.+?)(?: solution)?(?:\s+with ka\s*=\s*$N)?$""", typed)
        if (m != null) {
            val c = num(m[1]) ?: return null
            val name = m[2].trim()
            val f = acidNames[name.lowercase()] ?: (if (parse(name) != null) name else null) ?: return null
            if (f in strongAcid) return out("pH = " + pcNum(fixed(-log10(c), 2)) + " (" + sub(f) + " is a strong acid, so [H⁺] = " + sci(c) + " M)")
            strongBase[f]?.let { k ->
                val oh = c * k
                return out("pH = " + pcNum(fixed(14 + log10(oh), 2)) + " ([OH⁻] = " + sci(oh) + " M, pOH = " + pcNum(fixed(-log10(oh), 2)) + ")")
            }
            // The square-root shortcut when it passes the 5% rule, as a textbook does; the quadratic when it does not.
            if (m[3].isNotEmpty()) {
                val ka = num(m[3]) ?: return null
                val approx = sqrt(ka * c)
                val short = approx / c < 0.05
                val x = if (short) approx else (-ka + sqrt(ka * ka + 4 * ka * c)) / 2
                return out("pH = " + pcNum(fixed(-log10(x), 2)) + " ([H⁺] = " + sci(x) + " M" + (if (short) ", from x = √(Ka·C)" else ", from the quadratic, since x is more than 5% of C") + ")")
            }
        }
        // strong or weak, conjugate pairs, Ka
        m = findI("""^is (.+?) (?:a )?(strong or weak|weak or strong) (acid|base)$""", typed)
        if (m != null) {
            val n = m[1].trim()
            val f = acidNames[n.lowercase()] ?: (if (parse(n) != null) n else null) ?: return null
            val strong = if (m[3].lowercase() == "acid") f in strongAcid else f in strongBase
            return out(if (strong) "Strong: it ionizes completely in water." else "Weak: it only partly ionizes in water, so it sets up an equilibrium.")
        }
        m = findI("""^conjugate (base|acid) (?:of|for) (.+)$""", typed)
        if (m != null) {
            var (f, c) = ion(m[2].trim())
            if (parse(f) == null) return null
            if (m[1].lowercase() == "base") {
                val lead = Regex("^H(\\d*)").find(f)
                if (lead != null) {
                    val k = lead.groupValues[1].ifEmpty { "1" }.toInt()
                    f = (if (k > 2) "H${k - 1}" else if (k == 2) "H" else "") + f.substring(lead.value.length)
                } else {
                    val t = Regex("H(\\d*)$").find(f) ?: return null
                    val k = t.groupValues[1].ifEmpty { "1" }.toInt() - 1
                    f = f.substring(0, t.range.first) + if (k > 0) "H" + (if (k > 1) "$k" else "") else ""
                }
                c -= 1
            } else {
                val inner = if (Regex("^[A-Z][a-z]?H").containsMatchIn(f)) Regex("H(\\d*)").find(f.substring(1)) else null
                if (f.startsWith("H")) {
                    val lead = Regex("^H(\\d*)").find(f)!!
                    f = "H" + (lead.groupValues[1].ifEmpty { "1" }.toInt() + 1) + f.substring(lead.value.length)
                } else if (inner != null) {
                    val k = inner.groupValues[1].ifEmpty { "1" }.toInt() + 1
                    f = f[0] + (if (f.length > 1 && f[1].isLowerCase()) "${f[1]}" else "") + "H$k" + f.substring(inner.range.first + 1 + inner.value.length)
                } else f = "H$f"
                c += 1
            }
            f = f.replaceFirst(Regex("^H1(?=[A-Z])"), "H")
            if (f == "OH2") f = "H2O" // ponytail: OH⁻ gains H⁺ to make water, written H₂O
            return out(show(f, c))
        }
        m = findI("""^ka expression for (.+)$""", typed)
        if (m != null) {
            val f = m[1].trim()
            if (!f.startsWith("H") || parse(f) == null) return null
            val lead = Regex("^H(\\d*)").find(f)!!
            val k = lead.groupValues[1].ifEmpty { "1" }.toInt()
            val base = (if (k > 2) "H${k - 1}" else if (k == 2) "H" else "") + f.substring(lead.value.length)
            return out("Ka = [H⁺][" + show(base, -1) + "]/[" + sub(f) + "]")
        }
        // titration
        m = findI("""\bhow many (ml|l) of ([\d.]+)\s*m (.+?) (?:to|will|are needed to|is needed to) neutrali[sz]e ([\d.]+)\s*(ml|l) of ([\d.]+)\s*m (.+)$""", typed)
        if (m != null) {
            fun eq(f: String) = strongAcid[f] ?: strongBase[f] ?: 1
            val moles = m[6].toDouble() * m[4].toDouble() / (if (m[5].equals("ml", true)) 1000 else 1) * eq(m[7].trim())
            val v = moles / (m[2].toDouble() * eq(m[3].trim())) * if (m[1].equals("ml", true)) 1000 else 1
            return out(pcNum(fixed(v, 3)) + " " + if (m[1].equals("ml", true)) "mL" else "L")
        }
        // equilibrium: expressions, Keq, Le Chatelier
        val t = """\d*[A-Z][A-Za-z0-9()]*(?:\s*\((?:s|l|g|aq)\))?"""
        val s = """$t(?:\s*\+\s*$t)*"""
        val eqm = Regex("""($s\s*(?:<->|<=>|⇌|↔)\s*$s)""").find(typed)?.groupValues?.get(1)
        val sides = eqm?.split(arrow)?.map(::side)
        fun term(x: Term) = "[" + sub(x.f) + "]" + power(x.k)
        fun gas(x: Term) = x.state != "s" && x.state != "l"
        if (sides != null && sides.size == 2) {
            if (hasI("""\b(?:equilibrium constant expression|keq expression|k expression|expression for k|expression for keq)\b""", typed)) {
                val top = sides[1].filter(::gas).joinToString("") { term(it) }
                val bot = sides[0].filter(::gas).map { term(it) }
                return out("Keq = $top/" + if (bot.size > 1) "(" + bot.joinToString("") + ")" else bot.joinToString(""))
            }
            if (hasI("""\bkeq\b|\bk\s*=|\bequilibrium constant\b""", typed) && has("""\[[A-Za-z0-9]+\]\s*=""", typed)) {
                val conc = Regex("""\[([A-Za-z0-9]+)\]\s*=\s*([\d.]+(?:\s*[x×*]\s*10\s*\^\s*-?\d+)?)""").findAll(typed).associate { it.groupValues[1] to num(it.groupValues[2]) }
                fun prod(side: List<Term>) = side.filter(::gas).fold(1.0) { a, x -> a * (conc[x.f] ?: Double.NaN).pow(x.k) }
                val k = prod(sides[1]) / prod(sides[0])
                if (k.isFinite()) return out("Keq = " + if (k >= 1e4 || k < 1e-3) sci(k) else pcNum(prec(k, 4)))
            }
            if (hasI("""\bwhat happens\b|\bwhich way\b|\bshift\b""", typed)) {
                fun where(f: String) = if (sides[0].any { it.f.equals(f, true) }) "left" else if (sides[1].any { it.f.equals(f, true) }) "right" else null
                fun say(dir: String, why: String) = out("It shifts $dir, toward the " + (if (dir == "right") "products" else "reactants") + ", $why.")
                val st = find("""\b(?:more |extra )?([A-Z][A-Za-z0-9]*) is (added|increased|removed|decreased)\b|\b(add(?:ing)?|remov(?:e|ing)) (?:more |some )?([A-Z][A-Za-z0-9]*)\b|\bmore ([A-Z][A-Za-z0-9]*) is added\b""", typed)
                if (st != null) {
                    val f = st[1].ifEmpty { st[4] }.ifEmpty { st[5] }
                    val add = has("add|increas", st[2].ifEmpty { st[3] }.ifEmpty { "added" })
                    val w = where(f) ?: return null
                    val dir = if (add) (if (w == "left") "right" else "left") else w
                    return say(dir, (if (add) "to use up the added " else "to replace the removed ") + sub(f))
                }
                val pr = findI("""\b(pressure|volume) (increases|is increased|rises|goes up|decreases|is decreased|drops|goes down)\b""", typed)
                if (pr != null) {
                    val up = has("increas|rises|up", pr[2]) == (pr[1].lowercase() == "pressure")
                    fun count(side: List<Term>) = side.filter { it.state !in setOf("s", "l", "aq") }.sumOf { it.k }
                    val l = count(sides[0])
                    val rr = count(sides[1])
                    if (l == rr) return out("No shift: both sides have $l moles of gas, so pressure changes do not move the equilibrium.")
                    val dir = if (up) (if (l > rr) "right" else "left") else (if (l > rr) "left" else "right")
                    return say(dir, (if (up) "the side with fewer" else "the side with more") + " moles of gas ($l on the left, $rr on the right)")
                }
                if (hasI("""\bcatalyst\b""", typed)) return out("No shift: a catalyst speeds up both directions equally.")
            }
        }
        // solubility: Ksp expressions, molar solubility, Ksp from solubility
        m = findI("""^ksp expression for ([A-Za-z0-9()]+)$""", typed)
        if (m != null) salt(m[1])?.let { x -> return out("Ksp = [" + show(x.cat, x.cc) + "]" + power(x.x) + "[" + show(x.an, x.ac) + "]" + power(x.y)) }
        m = findI("""\bmolar solubility of ([A-Za-z0-9()]+)\b.*?\bksp\s*(?:=|is|of)\s*$N""", typed)
        if (m != null) {
            val x = salt(m[1])
            val k = num(m[2])
            if (x != null && k != null) {
                val n = x.x + x.y
                val f = x.x.toDouble().pow(x.x) * x.y.toDouble().pow(x.y)
                return out(sci((k / f).pow(1.0 / n)) + " M (Ksp = " + (if (f > 1) Precalc.js(f) else "") + "s" + power(n) + ")")
            }
        }
        m = findI("""\bksp of ([A-Za-z0-9()]+)\b.*?\bmolar solubility (?:is|of|=)\s*$N""", typed)
        if (m != null) {
            val x = salt(m[1])
            val v = num(m[2])
            if (x != null && v != null) return out("Ksp = " + sci(x.x.toDouble().pow(x.x) * x.y.toDouble().pow(x.y) * v.pow(x.x + x.y)))
        }
        // redox: oxidation numbers, what is oxidized, agents, cells, half-reactions
        m = findI("""^oxidation (?:number|state) of ([A-Z][a-z]?) in (.+)$""", typed)
        if (m != null) {
            val (f, c) = ion(m[2])
            ox(m[1], f, c)?.takeIf { it.isFinite() }?.let { return out(sign(it)) }
        }
        m = findI("""^(?:in )?(.+?(?:->|→).+?),?\s+(?:what|which) (?:is|species is|substance is|element is) (oxidized|reduced|the oxidizing agent|the reducing agent)$""", typed)
            ?: findI("""^(?:(?:what|which) is )?(?:the )?(oxidized|reduced|oxidizing agent|reducing agent)(?: species)? in (.+?(?:->|→).+)$""", typed)?.let { listOf(it[0], it[2], it[1]) }
        if (m != null) {
            val (l, rr) = m[1].split(Regex("""\s*(?:->|→)\s*""")).map(::side)
            val want = m[2].lowercase().removePrefix("the ")
            fun oxAll(x: Term): Map<String, Double> { val c = parse(x.f) ?: return emptyMap(); return c.keys.mapNotNull { e -> ox(e, x.f, x.charge)?.let { e to it } }.toMap() }
            for (a in l) for ((e, v) in oxAll(a)) {
                val b = rr.firstOrNull { oxAll(it)[e] != null } ?: continue
                val w = oxAll(b).getValue(e)
                if (w == v) continue
                val up = w > v
                val label = show(a.f, a.charge)
                if ((want == "oxidized" && up) || (want == "reduced" && !up)) return out("$label (${by(e)!!.n}) is " + (if (up) "oxidized" else "reduced") + ": its oxidation number goes from ${sign(v)} to ${sign(w)}.")
                if ((want == "reducing agent" && up) || (want == "oxidizing agent" && !up)) return out("$label is the $want: it is " + (if (up) "oxidized" else "reduced") + " (${sign(v)} to ${sign(w)}).")
            }
        }
        if (hasI("""\b(?:standard )?(?:cell )?potential\b|\be°?\s*cell\b""", typed)) {
            val given = Regex("""\((-?[\d.]+)\s*v\)""", RegexOption.IGNORE_CASE).findAll(typed).map { it.groupValues[1].toDouble() }.toList()
            if (given.size == 2) return out("E°cell = " + pcNum(fixed(given.max() - given.min(), 2)) + " V (cathode minus anode)")
            val named = potentials.filter { (k, _) -> val e = by(ion(k).first.removeSuffix("2")); e != null && hasI("""\b(${e.n}|${e.s})\b""", typed) }
            if (named.size == 2) {
                val a = named[0].second
                val b = named[1].second
                return out("E°cell = " + pcNum(fixed(max(a, b) - min(a, b), 2)) + " V (" + pcNum(max(a, b)) + " V minus " + pcNum(min(a, b)) + " V)")
            }
        }
        m = findI("""\bhalf[- ]reaction for the (oxidation|reduction) of (?:an? )?([a-z]+)(?:\s*\((i{1,3}|iv)\))?(?: ion| metal| atom| gas)?$""", typed)
        if (m != null) {
            val e = by(m[2]) ?: return null
            val ch = if (m[3].isNotEmpty()) mapOf("i" to 1, "ii" to 2, "iii" to 3, "iv" to 4).getValue(m[3].lowercase()) else ionCharge[e.s] ?: potentials.map { ion(it.first) }.firstOrNull { it.first == e.s }?.second ?: return null
            val diatomic = e.s in setOf("F", "Cl", "Br", "I", "O", "N", "H") && ch < 0
            val n = abs(ch) * if (diatomic) 2 else 1
            val atom = if (diatomic) sub(e.s + "2") else e.s
            val ionText = (if (diatomic) "2" else "") + show(e.s, ch)
            val el = "${n}e⁻"
            val oxidation = m[1].lowercase() == "oxidation"
            if (ch > 0) return out(if (oxidation) "$atom → $ionText + $el" else "$ionText + $el → $atom")
            return out(if (!oxidation) "$atom + $el → $ionText" else "$ionText → $atom + $el")
        }
        return null
    }
}
