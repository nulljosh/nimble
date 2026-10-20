package com.nulljosh.nimble

import com.nulljosh.nimble.Precalc.fixed
import com.nulljosh.nimble.Precalc.jsRound
import com.nulljosh.nimble.Precalc.pcNum
import com.nulljosh.nimble.Science10.by
import com.nulljosh.nimble.Science10.formula
import com.nulljosh.nimble.Science10.mass
import com.nulljosh.nimble.Science10.parse
import com.nulljosh.nimble.Science10.sub
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.pow

/**
 * BC Chemistry 11 with no network: significant figures, scientific notation, density, the mole, percent composition,
 * empirical formulas, solutions, gases at STP, stoichiometry from a balanced equation, limiting reactants and yield,
 * electron configurations, periodic trends, bonding, VSEPR shape and polarity, and simple organic names. A port of
 * `chem11()` in docs/engine.js, using the Science10 tables. Precalc.answer asks it after Science10.
 */
internal object Chemistry11 {

    private const val NA = 6.02214076e23
    private val order = listOf("1s", "2s", "2p", "3s", "3p", "4s", "3d", "4p", "5s", "4d", "5p", "6s", "4f", "5d", "6p", "7s", "5f", "6d", "7p")
    private fun sup(n: Int) = n.toString().map { "⁰¹²³⁴⁵⁶⁷⁸⁹"[it - '0'] }.joinToString("")
    private fun supE(e: Int) = (if (e < 0) "⁻" else "") + sup(abs(e))

    /** Pauling electronegativity for the main groups and the first transition row. */
    private val en = mapOf("H" to 2.20, "Li" to 0.98, "Be" to 1.57, "B" to 2.04, "C" to 2.55, "N" to 3.04, "O" to 3.44, "F" to 3.98, "Na" to 0.93, "Mg" to 1.31, "Al" to 1.61, "Si" to 1.90, "P" to 2.19, "S" to 2.58, "Cl" to 3.16, "K" to 0.82, "Ca" to 1.00, "Sc" to 1.36, "Ti" to 1.54, "V" to 1.63, "Cr" to 1.66, "Mn" to 1.55, "Fe" to 1.83, "Co" to 1.88, "Ni" to 1.91, "Cu" to 1.90, "Zn" to 1.65, "Ga" to 1.81, "Ge" to 2.01, "As" to 2.18, "Se" to 2.55, "Br" to 2.96, "Kr" to 3.00, "Rb" to 0.82, "Sr" to 0.95, "Ag" to 1.93, "Sn" to 1.96, "I" to 2.66, "Xe" to 2.60, "Cs" to 0.79, "Ba" to 0.89, "Au" to 2.54, "Pb" to 2.33)
    private val alk = listOf("", "meth", "eth", "prop", "but", "pent", "hex", "hept", "oct", "non", "dec")
    private val shapes = mapOf("2,0" to "linear", "3,0" to "trigonal planar", "3,1" to "bent", "4,0" to "tetrahedral", "4,1" to "trigonal pyramidal", "4,2" to "bent", "5,0" to "trigonal bipyramidal", "5,1" to "seesaw", "5,2" to "T-shaped", "5,3" to "linear", "6,0" to "octahedral", "6,1" to "square pyramidal", "6,2" to "square planar")
    private val symmetric = setOf("2,0", "3,0", "4,0", "5,0", "6,0", "6,2", "5,3")
    private val nonmetal = "H He C N O F Ne P S Cl Ar Se Br Kr I Xe Rn".split(" ").toSet()
    private val ionCharge = mapOf("Li" to 1, "Na" to 1, "K" to 1, "Rb" to 1, "Cs" to 1, "Ag" to 1, "Be" to 2, "Mg" to 2, "Ca" to 2, "Sr" to 2, "Ba" to 2, "Zn" to 2, "Al" to 3, "F" to -1, "Cl" to -1, "Br" to -1, "I" to -1, "O" to -2, "S" to -2, "Se" to -2, "N" to -3, "P" to -3, "H" to 1)
    private val ide = mapOf("F" to "fluoride", "Cl" to "chloride", "Br" to "bromide", "I" to "iodide", "O" to "oxide", "S" to "sulfide", "Se" to "selenide", "N" to "nitride", "P" to "phosphide", "H" to "hydride", "C" to "carbide")

    /** Orbital filling in Aufbau order, with chromium and copper taking a half-filled or full d. */
    fun config(z: Int): List<Pair<String, Int>> {
        val cells = mutableListOf<Pair<String, Int>>()
        var left = z
        for (o in order) {
            if (left <= 0) break
            val cap = mapOf('s' to 2, 'p' to 6, 'd' to 10, 'f' to 14).getValue(o[1])
            val k = minOf(cap, left)
            cells += o to k
            left -= k
        }
        if (z == 24 || z == 29) {
            val s = cells.indexOfFirst { it.first == "4s" }
            val d = cells.indexOfFirst { it.first == "3d" }
            cells[s] = "4s" to 1
            cells[d] = "3d" to cells[d].second + 1
        }
        return cells
    }

    private fun valence(z: Int): Int { val c = config(z); val n = c.maxOf { it.first[0] - '0' }; return c.filter { it.first[0] - '0' == n }.sumOf { it.second } }
    private fun period(z: Int) = config(z).maxOf { it.first[0] - '0' }

    /** Species named in a sentence, as formulas: "hydrogen gas" is H2, "methane" is CH4, "CO2" stays. */
    private fun species(s: String): String? {
        val t = s.trim().replaceFirst(Regex("^(?:the |a |an )", RegexOption.IGNORE_CASE), "").replace(Regex("""\s+(?:gas|molecules?)$""", RegexOption.IGNORE_CASE), "")
        if (parse(t) != null) return t
        by(t)?.let { return if (it.s in setOf("H", "N", "O", "F", "Cl", "Br", "I")) it.s + "2" else it.s }
        return formula(t)
    }

    /** Coefficients of a balanced equation, by the same small search as Science10.balance. */
    private fun coef(left: List<String>, right: List<String>): IntArray? {
        val all = (left + right).map { parse(it) ?: return null }
        val els = all.flatMap { it.keys }.distinct()
        val n = all.size
        if (n > 6) return null
        val k = IntArray(n) { 1 }
        fun ok() = els.all { e -> all.indices.sumOf { i -> (if (i < left.size) 1 else -1) * (all[i][e] ?: 0) * k[i] } == 0 }
        fun rec(i: Int): Boolean { if (i == n) return ok(); for (v in 1..12) { k[i] = v; if (rec(i + 1)) return true }; return false }
        return if (rec(0)) k else null
    }

    private class Shape(val name: String, val polar: Boolean, val why: String)

    /** VSEPR from a formula: one central atom, single bonds to H and halogens, double bonds to O and S. */
    private fun shape(c: Map<String, Int>): Shape? {
        val els = c.keys.toList()
        val total = c.values.sum()
        if (total == 2) {
            val polar = els.size == 2 && abs((en[els[0]] ?: 0.0) - (en[els[1]] ?: 0.0)) > 0.4
            return Shape("linear", polar, if (polar) "a diatomic molecule of two different atoms has one polar bond." else "two identical atoms share electrons equally.")
        }
        val center = els.firstOrNull { c[it] == 1 && it != "H" } ?: els.firstOrNull { c[it] == 1 } ?: return null
        val ligands = els.filter { it != center }
        val n = ligands.sumOf { c.getValue(it) }
        fun ord(e: String) = if (e == "O" || e == "S") 2 else if (e == "N" && ligands.size == 1 && n == 1) 3 else 1
        var used = ligands.sumOf { ord(it) * c.getValue(it) }
        val v = valence(by(center)!!.z)
        if (used > v) used = n // ponytail: an oxygen that cannot take a double bond here takes a single one
        val lone = max(0, (v - used) / 2)
        val key = "${n + lone},$lone"
        val name = shapes[key] ?: return null
        val same = ligands.size == 1
        val dipole = ligands.any { abs((en[it] ?: 0.0) - (en[center] ?: 0.0)) > 0.4 }
        val polar = dipole && !(key in symmetric && same)
        return Shape(name, polar, "$n bonded atoms and $lone lone pair${if (lone == 1) "" else "s"} on $center" + if (polar) ", so the bond dipoles do not cancel." else if (dipole) ", and the symmetric shape cancels the bond dipoles." else ", and the bonds are not polar.")
    }

    private fun sciStr(v: Double): String {
        val e = floor(log10(abs(v))).toInt()
        return pcNum(Precalc.prec(v / 10.0.pow(e), 4)) + " × 10" + supE(e)
    }

    private fun cap(s: String) = s.replaceFirstChar { it.uppercase() }
    private fun out(body: String) = Answer.Text(heading = null, body = body, source = "Nimble science")
    private fun find(pattern: String, s: String): List<String>? = Regex(pattern).find(s)?.groupValues
    private fun findI(pattern: String, s: String): List<String>? = Regex(pattern, RegexOption.IGNORE_CASE).find(s)?.groupValues
    private fun has(pattern: String, s: String) = Regex(pattern).containsMatchIn(s)

    private val facts = listOf(
        """^(?:what is )?avogadro'?s (?:number|constant)$|^how many (?:particles|atoms|molecules) (?:are )?in (?:one|1|a) mole$""" to "6.022 × 10²³ particles per mole.",
        """^(?:what is )?(?:a )?mole(?: in chemistry)?$""" to "An amount of substance: 6.022 × 10²³ particles (Avogadro's number), just as a dozen is 12.",
        """^(?:what is )?(?:the )?molar mass$""" to "The mass of one mole of a substance, in grams per mole (g/mol). Water's is 18.02 g/mol.",
        """^(?:what is )?(?:the )?molar volume(?: of (?:a |an ideal )?gas)?(?: at stp)?$""" to "22.4 L per mole at STP.",
        """^(?:what is )?stp$|^(?:what is )?standard temperature and pressure$""" to "Standard temperature and pressure: 0 °C (273.15 K) and 101.3 kPa (1 atm).",
        """^(?:what is )?(?:an? )?ionic bond$""" to "Electrons transfer from a metal to a nonmetal; the ions that form attract each other.",
        """^(?:what is )?(?:a )?polar covalent bond$""" to "A covalent bond with unequal sharing: the more electronegative atom pulls the electrons closer and carries a partial negative charge.",
        """^(?:what is )?(?:a )?(?:nonpolar )?covalent bond$""" to "Two nonmetal atoms share a pair of electrons.",
        """^(?:what is )?(?:a )?metallic bond$""" to "Metal cations held in a sea of delocalized electrons, which is why metals conduct.",
        """\bmost electronegative element\b""" to "Fluorine (3.98 on the Pauling scale).",
        """\bleast electronegative element\b""" to "Francium, with cesium close behind (about 0.7 to 0.8).",
        """\bwhat group (?:are|is) (?:the )?noble gases\b|\bnoble gases (?:are )?in (?:which|what) group\b""" to "Group 18.",
        """\bwhat group (?:are|is) (?:the )?halogens\b""" to "Group 17.",
        """\bwhat group (?:are|is) (?:the )?alkali metals\b""" to "Group 1.",
        """\bwhat group (?:are|is) (?:the )?alkaline earth metals\b""" to "Group 2.",
        """\belements in group 1 called\b|\bgroup 1 elements\b""" to "The alkali metals (hydrogen sits above them but is not one).",
        """\belements in group 2 called\b|\bgroup 2 elements\b""" to "The alkaline earth metals.",
        """\belements in group 17 called\b|\bgroup 17 elements\b""" to "The halogens.",
        """\belements in group 18 called\b|\bgroup 18 elements\b""" to "The noble gases.",
    ).map { Regex(it.first) to it.second }

    fun answer(q: String, raw: String): Answer? {
        val r = raw.trim().replace(Regex("[?!]+$"), "")
        // Formulas are case-sensitive (Co is cobalt, CO is carbon monoxide), so those branches read the question as typed.
        val typed = r.replaceFirst(Regex("""^(?:what(?:'s|’s| is)\s+)?(?:the\s+)?""", RegexOption.IGNORE_CASE), "")
        for ((re, body) in facts) if (re.containsMatchIn(q)) return out(body)
        var m: List<String>?
        // significant figures and scientific notation
        m = find("""\bhow many sig(?:nificant)? (?:figures|figs|digits) (?:are )?(?:in|does) ([\d.,]+)""", q)
        if (m != null) {
            val s = m[1].replace(",", "")
            val digits = s.replaceFirst(".", "").trimStart('0')
            val dot = '.' in s
            val n = if (dot) digits.length else digits.trimEnd('0').length
            return out("$n" + if (!dot && s.endsWith("0")) " (trailing zeros with no decimal point are not counted; write $s. to count them)" else "")
        }
        m = find("""\b(?:write|express|convert|put) ([\d.,]+) (?:in|into|to|as) scientific notation\b""", q)
        if (m != null) {
            val s = m[1].replace(",", "")
            val v = s.toDoubleOrNull() ?: return null
            if (v == 0.0) return null
            val core = s.replaceFirst(".", "").trimStart('0')
            val sigs = if ('.' in s) core.length else core.trimEnd('0').length
            val e = floor(log10(v)).toInt()
            return out(toPrecision(v / 10.0.pow(e), max(1, sigs)) + " × 10" + supE(e))
        }
        // density
        if (has("""\bdensity\b""", q)) find("""\bmass (?:of )?([\d.]+)\s*(kg|g)\b.*?\bvolume (?:of )?([\d.]+)\s*(ml|cm3|cm³|l|m3)\b""", q)?.let {
            return out(pcNum(fixed(it[1].toDouble() / it[3].toDouble(), 4)) + " " + it[2] + "/" + it[4].replace("ml", "mL").replace("cm3", "cm³").replace(Regex("^l$"), "L"))
        }
        // the mole
        fun mm(s: String): Pair<String, Double>? { val f = species(s) ?: return null; val c = parse(f) ?: return null; return f to mass(c) }
        // Moles to three significant figures, the way a chemistry answer is written: 2.00 mol.
        m = findI("""^how many moles (?:are )?(?:in|of) ([\d.]+)\s*(?:g|grams) (?:of )?(.+)$""", typed)
        if (m != null) mm(m[2])?.let { x -> return out(toPrecision(m[1].toDouble() / x.second, 3) + " mol (" + sub(x.first) + " is " + pcNum(fixed(x.second, 2)) + " g/mol)") }
        m = findI("""^mass of ([\d.]+)\s*(?:mol|moles) (?:of )?(.+)$""", typed)
        if (m != null) mm(m[2])?.let { x -> return out(pcNum(fixed(m[1].toDouble() * x.second, 2)) + " g") }
        m = find("""\bhow many (molecules|atoms|particles|ions|formula units) (?:are )?in ([\d.]+) (?:mol|moles)\b""", q)
        if (m != null) return out(sciStr(m[2].toDouble() * NA) + " " + m[1])
        m = findI("""\b(?:percent|percentage|%) (?:composition |by mass )?of ([a-z]+) in ([A-Za-z0-9()]+)""", typed)
        if (m != null) {
            val e = by(m[1])
            val c = species(m[2])?.let { parse(it) }
            if (e != null && c != null && c[e.s] != null) return out(pcNum(fixed(c.getValue(e.s) * e.m / mass(c) * 100, 2)) + "%")
        }
        if (has("""\bempirical formula\b""", q)) {
            val parts = Regex("""([\d.]+)\s*%\s*([a-z]+)""").findAll(q).map { by(it.groupValues[2]) to it.groupValues[1].toDouble() }.toList()
            if (parts.size >= 2 && parts.all { it.first != null }) {
                val mol = parts.map { (e, p) -> e!!.s to p / e.m }
                val low = mol.minOf { it.second }
                for (k in 1..6) {
                    val n = mol.map { (s, v) -> s to v / low * k }
                    if (n.all { abs(it.second - jsRound(it.second)) < 0.1 }) {
                        val ord = listOf("C", "H") + n.map { it.first }.filter { it != "C" && it != "H" }.sorted()
                        return out(sub(ord.filter { s -> n.any { it.first == s } }.joinToString("") { s -> val v = jsRound(n.first { it.first == s }.second).toInt(); s + if (v > 1) "$v" else "" }))
                    }
                }
            }
        }
        // solutions and gases
        m = find("""\bmolarity\b.*?([\d.]+)\s*(?:mol|moles)\b.*?\bin ([\d.]+)\s*(l|ml)\b""", q)
        if (m != null) return out(pcNum(fixed(m[1].toDouble() / (m[2].toDouble() / if (m[3] == "ml") 1000 else 1), 4)) + " M (mol/L)")
        m = findI("""\bhow many grams of ([A-Za-z0-9()]+)\b.*?\bmake ([\d.]+)\s*(ml|l)\b.*?\b([\d.]+)\s*m\b""", typed)
        if (m != null) mm(m[1])?.let { x ->
            val n = m[4].toDouble() * m[2].toDouble() / if (m[3].equals("ml", ignoreCase = true)) 1000 else 1
            return out(pcNum(fixed(n * x.second, 2)) + " g (" + pcNum(fixed(n, 4)) + " mol)")
        }
        m = find("""\bdilut\w*\b.*?([\d.]+)\s*(ml|l)\b.*?([\d.]+)\s*m\b.*?\bto ([\d.]+)\s*m\b""", q)
        if (m != null) return out(pcNum(fixed(m[1].toDouble() * m[3].toDouble() / m[4].toDouble(), 3)) + " " + (if (m[2] == "ml") "mL" else "L") + " (C₁V₁ = C₂V₂)")
        if (has("""\bstp\b""", q)) {
            find("""\bvolume of ([\d.]+) (?:mol|moles)\b""", q)?.let { return out(pcNum(fixed(it[1].toDouble() * 22.4, 3)) + " L") }
            find("""\b(?:moles|mol) (?:are )?in ([\d.]+)\s*l\b""", q)?.let { return out(pcNum(fixed(it[1].toDouble() / 22.4, 4)) + " mol") }
        }
        // stoichiometry and the limiting reactant
        m = findI("""\bhow many grams of (.+?) (?:are |is )?(?:made |produced |formed )?from ([\d.]+)\s*g (?:of )?(.+?)(?: (?:reacting|that reacts|reacts|burning|burns|burned|combusting) ?(?:with (.+?))?)?$""", typed)
        if (m != null) {
            val p = species(m[1])
            val rr = species(m[3])
            val w = if (m[4].isNotEmpty()) species(m[4]) else null
            val burn = has("""\b(burning|burns|burned|combusting)\b""", q)
            if (p != null && rr != null) {
                val left = listOf(rr) + (if (w != null) listOf(w) else if (burn) listOf("O2") else emptyList())
                val right0 = if (burn) listOf("CO2", "H2O") else listOf(p)
                val right = if (p in right0) right0 else right0 + p
                coef(left, right)?.let { k ->
                    val all = left + right
                    val mol = m[2].toDouble() / mass(parse(rr)!!) * k[all.indexOf(p)] / k[0]
                    return out(pcNum(fixed(mol * mass(parse(p)!!), 2)) + " g of " + sub(p) + " (" + pcNum(fixed(mol, 3)) + " mol)")
                }
            }
        }
        m = findI("""\blimiting (?:reactant|reagent)\b.*?([\d.]+)\s*mol(?:es)? (?:of )?([A-Za-z0-9]+)\b.*?([\d.]+)\s*mol(?:es)? (?:of )?([A-Za-z0-9]+)\b.*?\b(?:make|form|produce)s? (.+)$""", typed)
        if (m != null) {
            val a = species(m[2])
            val b = species(m[4])
            val p = species(m[5].lowercase())
            val k = if (a != null && b != null && p != null) coef(listOf(a, b), listOf(p)) else null
            if (k != null) {
                val ra = m[1].toDouble() / k[0]
                val rb = m[3].toDouble() / k[1]
                val lim = if (ra <= rb) a!! else b!!
                val other = if (ra <= rb) b!! else a!!
                fun c(i: Int) = if (k[i] > 1) "${k[i]}" else ""
                return out(sub(lim) + " is the limiting reactant; " + sub(other) + " is in excess (the equation is " + c(0) + sub(a!!) + " + " + c(1) + sub(b!!) + " → " + c(2) + sub(p!!) + ").")
            }
        }
        m = find("""\bpercent yield\b.*?\btheoretical yield (?:is |of )?([\d.]+)\s*g\b.*?\bactual yield (?:is |of )?([\d.]+)""", q)
            ?: find("""\bpercent yield\b.*?\bactual yield (?:is |of )?([\d.]+)\s*g\b.*?\btheoretical yield (?:is |of )?([\d.]+)""", q)?.let { listOf(it[0], it[2], it[1]) }
        if (m != null) return out(pcNum(fixed(m[2].toDouble() / m[1].toDouble() * 100, 2)) + "%")
        // atoms: configurations, valence, trends, ion charges
        m = find("""^(?:the )?(?:electron )?configuration (?:of|for) ([a-z]+)$""", q)
        if (m != null) by(m[1])?.let { e -> return out(config(e.z).joinToString(" ") { it.first + sup(it.second) }) }
        m = find("""^how many valence electrons (?:does|do|are in|in) (?:an? )?(?:atom of )?([a-z]+)(?: atom)?(?: have)?$""", q)
        if (m != null) by(m[1])?.let { return out("${valence(it.z)}") }
        m = find("""^which (?:has|is) (?:a )?(larger|bigger|smaller|more electronegative|less electronegative|higher ionization energy|lower ionization energy)(?: atomic radius| radius)?,? ([a-z]+) or ([a-z]+)$""", q)
        if (m != null) {
            val a = by(m[2])
            val b = by(m[3])
            if (a != null && b != null) {
                fun size(e: Science10.El) = period(e.z) * 100 - e.z
                fun neg(e: Science10.El) = en[e.s] ?: 0.0
                val w = m[1]
                val pick = when {
                    has("larger|bigger|lower ionization", w) -> if (size(a) >= size(b)) a else b
                    has("smaller|higher ionization", w) -> if (size(a) >= size(b)) b else a
                    "more" in w -> if (neg(a) >= neg(b)) a else b
                    else -> if (neg(a) >= neg(b)) b else a
                }
                return out(cap(pick.n) + ".")
            }
        }
        m = find("""\bwhich element has the (largest|smallest|highest|lowest) (atomic radius|electronegativity|ionization energy) in period (\d)\b""", q)
        if (m != null) {
            val p = m[3].toInt()
            val noble = setOf("He", "Ne", "Ar", "Kr")
            val row = Science10.elements.filter { period(it.z) == p && it.z <= 36 && (it.s !in noble || has("radius|ionization", m[2])) }.sortedBy { it.z }
            if (row.isEmpty()) return null
            // Radius is largest at the start of a period; electronegativity and ionization energy are lowest there.
            val first = if ("radius" in m[2]) has("largest|highest", m[1]) else has("smallest|lowest", m[1])
            val e = if (first) row.first() else row.last()
            return out(cap(e.n) + " (" + e.s + ").")
        }
        m = find("""\bcharge (?:of|on) (?:an? |the )?([a-z]+) ion\b""", q)
        if (m != null) {
            val word = m[1]
            val e = by(word) ?: ide.entries.firstOrNull { it.value == word }?.let { by(it.key) }
            val c = e?.let { ionCharge[it.s] }
            if (e != null && c != null) {
                val ion = if (by(word) != null) e.n + " ion" else "$word ion"
                return out((if (c > 0) "+" else "-") + abs(c) + " (" + e.s + (if (abs(c) > 1) sup(abs(c)) else "") + (if (c > 0) "⁺" else "⁻") + "), for the $ion.")
            }
        }
        // bonds, shape and polarity
        m = findI("""^is ([A-Za-z0-9()]+) (ionic or covalent|covalent or ionic|polar or nonpolar|nonpolar or polar|polar or non-polar)$""", typed)
        if (m != null) {
            val c = species(m[1])?.let { parse(it) } ?: return null
            val els = c.keys
            if ("ionic" in m[2].lowercase()) return out(if (els.any { it !in nonmetal } && els.any { it in nonmetal }) "Ionic: a metal and a nonmetal." else if (els.all { it in nonmetal }) "Covalent: nonmetals share electrons." else "Metallic.")
            val sh = shape(c) ?: return null
            return out(if (sh.polar) "Polar: " + sh.why else "Nonpolar: " + sh.why)
        }
        m = findI("""^(?:molecular )?(?:shape|geometry) of (?:an? )?(.+?)(?: molecule)?$""", typed)
        if (m != null) {
            val dd = findI("""(\d+) bonding (?:pairs|domains)\b.*?\b(no|\d+) lone pairs?""", m[1])
            if (dd != null) {
                val bp = dd[1].toInt()
                val lp = if (dd[2].equals("no", ignoreCase = true)) 0 else dd[2].toInt()
                return shapes["${bp + lp},$lp"]?.let { out(cap(it) + ".") }
            }
            val f = if (parse(m[1]) != null) m[1] else species(m[1].lowercase())
            val sh = f?.let { parse(it) }?.let { shape(it) }
            if (sh != null) return out(cap(sh.name) + " (" + sh.why.removeSuffix(".") + ").")
        }
        // simple organic names
        m = findI("""^name (?:the )?(?:alkane|alkene|alkyne|hydrocarbon|compound) (C\d*H\d+)$""", typed)
        if (m != null) {
            val c = parse(m[1])
            if (c != null && c["C"] != null && c["H"] != null && c.size == 2 && c.getValue("C") <= 10) {
                val n = c.getValue("C")
                val h = c.getValue("H")
                val end = if (h == 2 * n + 2) "ane" else if (h == 2 * n && n >= 2) "ene" else if (h == 2 * n - 2 && n >= 2) "yne" else null
                if (end != null) return out(cap(alk[n]) + end + ".")
            }
        }
        m = find("""^(?:the )?(?:chemical |molecular )?formula (?:for|of) (meth|eth|prop|but|pent|hex|hept|oct|non|dec)(ane|ene|yne)$""", q)
        if (m != null) {
            val n = alk.indexOf(m[1])
            val h = if (m[2] == "ane") 2 * n + 2 else if (m[2] == "ene") 2 * n else 2 * n - 2
            if (n > 0 && h > 0) return out(sub("C" + (if (n > 1) "$n" else "") + "H$h"))
        }
        return null
    }

    /** JavaScript's toPrecision for the plain range a chemistry answer needs. */
    private fun toPrecision(v: Double, p: Int): String {
        val e = floor(log10(abs(v))).toInt()
        val places = max(0, p - 1 - e)
        val scaled = floor(abs(v) * 10.0.pow(places) + 0.5).toLong().toString().padStart(places + 1, '0')
        val body = if (places == 0) scaled else scaled.dropLast(places) + "." + scaled.takeLast(places)
        return (if (v < 0) "-" else "") + body
    }
}
