package com.nulljosh.nimble

import com.nulljosh.nimble.Precalc.fixed
import com.nulljosh.nimble.Precalc.jsRound
import com.nulljosh.nimble.Precalc.pcNum
import kotlin.math.abs

/**
 * BC Science 10 with no network: the periodic table (protons, neutrons, electrons, ions, molar mass), compound names
 * both ways, balancing equations by search, reaction types, pH, energy, work and power, radiation, DNA and Punnett
 * squares, and the universe. A port of `sci10()` and its helpers in docs/engine.js. Precalc.answer asks it first.
 */
internal object Science10 {

    class El(val s: String, val n: String, val m: Double, val z: Int)

    /** Symbol, name, atomic mass; the atomic number is the position (H is 1). Then a few heavy elements with their own. */
    val elements: List<El> = ("H,hydrogen,1.008;He,helium,4.003;Li,lithium,6.94;Be,beryllium,9.012;B,boron,10.81;C,carbon,12.011;N,nitrogen,14.007;O,oxygen,15.999;F,fluorine,18.998;Ne,neon,20.180;" +
        "Na,sodium,22.990;Mg,magnesium,24.305;Al,aluminum,26.982;Si,silicon,28.085;P,phosphorus,30.974;S,sulfur,32.06;Cl,chlorine,35.45;Ar,argon,39.948;K,potassium,39.098;Ca,calcium,40.078;" +
        "Sc,scandium,44.956;Ti,titanium,47.867;V,vanadium,50.942;Cr,chromium,51.996;Mn,manganese,54.938;Fe,iron,55.845;Co,cobalt,58.933;Ni,nickel,58.693;Cu,copper,63.546;Zn,zinc,65.38;" +
        "Ga,gallium,69.723;Ge,germanium,72.630;As,arsenic,74.922;Se,selenium,78.971;Br,bromine,79.904;Kr,krypton,83.798").split(";").mapIndexed { i, r -> val (s, n, m) = r.split(","); El(s, n, m.toDouble(), i + 1) } +
        listOf(
            El("Rb", "rubidium", 85.468, 37), El("Sr", "strontium", 87.62, 38), El("Ag", "silver", 107.87, 47), El("Sn", "tin", 118.71, 50), El("I", "iodine", 126.90, 53),
            El("Xe", "xenon", 131.29, 54), El("Cs", "cesium", 132.91, 55), El("Ba", "barium", 137.33, 56), El("Pt", "platinum", 195.08, 78), El("Au", "gold", 196.97, 79),
            El("Hg", "mercury", 200.59, 80), El("Pb", "lead", 207.2, 82), El("Rn", "radon", 222.0, 86), El("Ra", "radium", 226.0, 88), El("U", "uranium", 238.03, 92), El("Pu", "plutonium", 244.0, 94),
        )

    fun by(k: String): El? {
        val l = k.lowercase()
        return elements.firstOrNull { it.s.lowercase() == l || it.n == l || (it.n == "aluminum" && l == "aluminium") || (it.n == "sulfur" && l == "sulphur") || (it.n == "cesium" && l == "caesium") }
    }

    private val nonmetal = "H He C N O F Ne P S Cl Ar Se Br Kr I Xe Rn".split(" ").toSet()
    private val charge = mapOf("Li" to 1, "Na" to 1, "K" to 1, "Rb" to 1, "Cs" to 1, "Ag" to 1, "Be" to 2, "Mg" to 2, "Ca" to 2, "Sr" to 2, "Ba" to 2, "Zn" to 2, "Al" to 3, "F" to -1, "Cl" to -1, "Br" to -1, "I" to -1, "O" to -2, "S" to -2, "Se" to -2, "N" to -3, "P" to -3, "H" to 1)
    private val ide = mapOf("F" to "fluoride", "Cl" to "chloride", "Br" to "bromide", "I" to "iodide", "O" to "oxide", "S" to "sulfide", "Se" to "selenide", "N" to "nitride", "P" to "phosphide", "H" to "hydride", "C" to "carbide")
    private val poly = listOf(Triple("NH4", "ammonium", 1), Triple("OH", "hydroxide", -1), Triple("NO3", "nitrate", -1), Triple("NO2", "nitrite", -1), Triple("SO4", "sulfate", -2), Triple("SO3", "sulfite", -2), Triple("CO3", "carbonate", -2), Triple("HCO3", "hydrogen carbonate", -1), Triple("PO4", "phosphate", -3), Triple("ClO3", "chlorate", -1), Triple("C2H3O2", "acetate", -1), Triple("MnO4", "permanganate", -1))
    private val common = listOf("water" to "H2O", "table salt" to "NaCl", "salt" to "NaCl", "carbon dioxide" to "CO2", "carbon monoxide" to "CO", "ammonia" to "NH3", "methane" to "CH4", "ethane" to "C2H6", "propane" to "C3H8", "butane" to "C4H10", "glucose" to "C6H12O6", "sucrose" to "C12H22O11", "table sugar" to "C12H22O11", "ethanol" to "C2H5OH", "hydrogen peroxide" to "H2O2", "ozone" to "O3", "oxygen gas" to "O2", "hydrogen gas" to "H2", "nitrogen gas" to "N2", "sulfuric acid" to "H2SO4", "hydrochloric acid" to "HCl", "nitric acid" to "HNO3", "acetic acid" to "HC2H3O2", "vinegar" to "HC2H3O2", "baking soda" to "NaHCO3", "sodium hydroxide" to "NaOH", "lye" to "NaOH", "calcium carbonate" to "CaCO3", "limestone" to "CaCO3", "rust" to "Fe2O3")
    private val prefix = listOf("", "mono", "di", "tri", "tetra", "penta", "hexa", "hepta", "octa", "nona", "deca")
    private val nicknames = setOf("table salt", "salt", "vinegar", "lye", "limestone", "rust", "table sugar")

    fun sub(f: String) = f.map { if (it.isDigit()) "₀₁₂₃₄₅₆₇₈₉"[it - '0'] else it }.joinToString("")

    /** A formula as element counts: Ca(OH)2 is Ca 1, O 2, H 2. Null when a symbol is not an element. */
    fun parse(f: String): Map<String, Int>? {
        val s = f.map { c -> val k = "₀₁₂₃₄₅₆₇₈₉".indexOf(c); if (k >= 0) '0' + k else c }.joinToString("")
        var i = 0
        fun group(): MutableMap<String, Int> {
            val c = LinkedHashMap<String, Int>()
            while (i < s.length && s[i] != ')') {
                val part: Map<String, Int>
                if (s[i] == '(') { i++; part = group(); i++ } else {
                    val m = Regex("^[A-Z][a-z]?").find(s.substring(i))?.value ?: throw IllegalArgumentException()
                    if (by(m) == null) throw IllegalArgumentException()
                    i += m.length
                    part = mapOf(m to 1)
                }
                val n = Regex("""^\d+""").find(s.substring(i))?.value
                val k = n?.toInt() ?: 1
                if (n != null) i += n.length
                for ((e, v) in part) c[e] = (c[e] ?: 0) + v * k
            }
            return c
        }
        return try { val c = group(); if (i == s.length && c.isNotEmpty()) c else null } catch (_: Exception) { null }
    }

    fun mass(c: Map<String, Int>) = c.entries.sumOf { by(it.key)!!.m * it.value }

    /** The name of a formula: polyatomic ions, metal plus nonmetal, or two nonmetals with prefixes. */
    fun name(f: String): String? {
        common.firstOrNull { it.second == f }?.let { if (it.first !in nicknames) return it.first }
        for ((p, pn, _) in poly) {
            Regex("""^([A-Z][a-z]?)(\d*)\(?$p\)?(\d*)$""").find(f)?.groupValues?.let { m -> by(m[1])?.let { return it.n + " " + pn } }
            if (p == "NH4") Regex("""^\(?NH4\)?(\d*)([A-Z][a-z]?)(\d*)$""").find(f)?.groupValues?.let { n -> ide[n[2]]?.let { return "ammonium $it" } }
        }
        val m = Regex("""^([A-Z][a-z]?)(\d*)([A-Z][a-z]?)(\d*)$""").find(f)?.groupValues ?: return null
        if (by(m[1]) == null || by(m[3]) == null || ide[m[3]] == null) return null
        val a = m[1]
        val na = m[2].ifEmpty { "1" }.toInt()
        val b = m[3]
        val nb = m[4].ifEmpty { "1" }.toInt()
        if (a !in nonmetal) {
            if (charge[a] != null) return by(a)!!.n + " " + ide.getValue(b)
            val c = nb * -charge.getValue(b) / na
            return by(a)!!.n + "(" + listOf("", "I", "II", "III", "IV", "V", "VI", "VII")[c] + ") " + ide.getValue(b)
        }
        return (if (na > 1) prefix[na] else "") + by(a)!!.n + " " + (prefix[nb] + ide.getValue(b)).replaceFirst("ao", "o").replaceFirst("oo", "o")
    }

    /** The formula of a name: common names, ionic names by charges, covalent names by prefixes. */
    fun formula(nameIn: String): String? {
        val n = nameIn.trim().lowercase()
        common.firstOrNull { it.first == n }?.let { return it.second }
        val words = n.split(Regex("""\s+"""))
        if (words.size != 2 && !(words.size == 3 && words[1] == "hydrogen")) return null
        val first = words[0]
        val last = words.drop(1).joinToString(" ")
        // A prefix may drop its last vowel before "oxide": tetroxide, monoxide.
        fun pre(w: String): Pair<Int, String> {
            for (p in prefix.drop(1).sortedByDescending { it.length }) {
                if (w.startsWith(p) && w.length > p.length) return prefix.indexOf(p) to w.substring(p.length)
                if ((p.endsWith("a") || p.endsWith("o")) && w.startsWith(p.dropLast(1) + "o") && !w.startsWith(p)) return prefix.indexOf(p) to w.substring(p.length - 1)
            }
            return 1 to w
        }
        val polyHit = poly.firstOrNull { it.second == last }
        val ideHit = ide.entries.firstOrNull { it.value == last.replace(Regex("^(mono|di|tri|tetra|penta|hexa)"), "").replace(Regex("^xide"), "oxide") }
        val cat: Pair<String, Int>? = if (first == "ammonium") "NH4" to 1 else Regex("""^([a-z]+)(?:\((i{1,3}|iv|v|vi)\))?$""").find(first)?.groupValues?.let { m ->
            val e = by(m[1]) ?: return@let null
            val r = if (m[2].isNotEmpty()) mapOf("i" to 1, "ii" to 2, "iii" to 3, "iv" to 4, "v" to 5, "vi" to 6).getValue(m[2]) else charge[e.s]
            r?.let { e.s to it }
        }
        if (cat != null && cat.first !in nonmetal && (polyHit != null || ideHit != null)) {
            val (an, ac) = if (polyHit != null) polyHit.first to -polyHit.third else ideHit!!.key to -charge.getValue(ideHit.key)
            tailrec fun gcd(a: Int, b: Int): Int = if (b == 0) abs(a) else gcd(b, a % b)
            val g = gcd(cat.second, ac)
            val x = ac / g
            val y = cat.second / g
            fun part(s: String, k: Int, multi: Boolean) = if (k == 1) s else (if (multi) "($s)" else s) + k
            return part(cat.first, x, cat.first.length > 2) + part(an, y, polyHit != null)
        }
        // covalent: dinitrogen tetroxide is N2O4
        val (k1, w1) = pre(first)
        val (k2, w2) = pre(last)
        val e1 = by(w1)
        val an2 = ide.entries.firstOrNull { it.value == w2 || it.value == "o$w2" || it.value.removePrefix("o") == w2 }
        if (e1 != null && an2 != null && e1.s in nonmetal) return e1.s + (if (k1 > 1) "$k1" else "") + an2.key + (if (k2 > 1) "$k2" else "")
        return null
    }

    private val arrow = Regex("""\s*(?:->|→|=>|=)\s*""")

    /** Balance by searching small whole-number coefficients; the first set that conserves every element wins. */
    fun balance(eq: String): String? {
        val sides = eq.split(arrow)
        if (sides.size != 2) return null
        val terms = sides.map { s -> s.split(Regex("""\s*\+\s*""")).map { it.trim().replaceFirst(Regex("""^\d+(?=[A-Z(])"""), "") } }
        val parsed = terms.map { side -> side.map { parse(it) ?: return null } }
        val all = parsed.flatten()
        val left = parsed[0].size
        val els = all.flatMap { it.keys }.distinct()
        val n = all.size
        if (n > 6) return null
        val k = IntArray(n) { 1 }
        fun ok() = els.all { e -> all.indices.sumOf { i -> (if (i < left) 1 else -1) * (all[i][e] ?: 0) * k[i] } == 0 }
        fun rec(i: Int): Boolean { if (i == n) return ok(); for (v in 1..12) { k[i] = v; if (rec(i + 1)) return true }; return false }
        if (!rec(0)) return null
        var j = 0
        fun show(side: List<String>) = side.joinToString(" + ") { t -> (if (k[j] > 1) "${k[j]}" else "") + sub(t).also { j++ } }
        return show(terms[0]) + " → " + show(terms[1])
    }

    fun type(eq: String): String? {
        val sides = eq.split(arrow)
        if (sides.size != 2) return null
        val (l, r) = sides.map { s -> s.split(Regex("""\s*\+\s*""")).map { it.trim().replaceFirst(Regex("""^\d+"""), "") } }
        fun element(t: String) = Regex("""^[A-Z][a-z]?\d*$""").matches(t) && (by(t.replace(Regex("""\d+$"""), "")) != null || t.length == 1)
        if ("O2" in l && "CO2" in r && "H2O" in r) return "Combustion: a fuel burns in oxygen to make carbon dioxide and water."
        val l0 = l.getOrElse(0) { "" }
        val l1 = l.getOrElse(1) { "" }
        if ((Regex("""^(H[A-Z]|H\d)""").containsMatchIn(l0) && l1.endsWith("OH")) || (l0.endsWith("OH") && l1.startsWith("H"))) return "Neutralization: an acid and a base make a salt and water."
        if (l.size >= 2 && r.size == 1) return "Synthesis (combination): two or more reactants join into one product."
        if (l.size == 1 && r.size >= 2) return "Decomposition: one compound breaks into simpler substances."
        if (l.size == 2 && r.size == 2 && l.any(::element) && r.any(::element)) return "Single replacement (displacement): one element takes another's place in a compound."
        if (l.size == 2 && r.size == 2) return "Double replacement (displacement): two compounds swap partners."
        return null
    }

    private val facts = listOf(
        """\bcharge (?:of|on) (?:an? |the )?electron\b""" to "-1 (−1.602 × 10⁻¹⁹ C). Electrons are negative.",
        """\bcharge (?:of|on) (?:an? |the )?proton\b""" to "+1 (+1.602 × 10⁻¹⁹ C). Protons are positive.",
        """\bcharge (?:of|on) (?:an? |the )?neutron\b""" to "0. Neutrons have no charge.",
        """^(?:what is )?(?:an? )?isotope$""" to "Atoms of the same element with different numbers of neutrons, such as carbon-12 and carbon-14.",
        """^(?:what is )?(?:an? )?ion$""" to "An atom or group of atoms with a charge, from gaining or losing electrons.",
        """^(?:what is )?(?:the )?(?:law of )?conservation of energy$|^(?:what is )?the law of conservation of energy$""" to "Energy cannot be created or destroyed, only changed from one form to another.",
        """^(?:what is )?(?:the )?(?:law of )?conservation of mass$|^(?:what is )?the law of conservation of mass$""" to "Mass is neither created nor destroyed in a chemical reaction: the products weigh the same as the reactants.",
        """\b(?:si )?units? (?:of|for) energy\b""" to "The joule (J).",
        """\b(?:si )?units? (?:of|for) power\b""" to "The watt (W), one joule per second.",
        """\b(?:si )?units? (?:of|for) force\b""" to "The newton (N).",
        """\b(?:si )?units? (?:of|for) work\b""" to "The joule (J).",
        """\bformula for kinetic energy\b""" to "KE = ½mv² (half the mass times the speed squared).",
        """\bformula for (?:gravitational )?potential energy\b""" to "PE = mgh (mass times g, 9.8 m/s², times height).",
        """\bformula for (?:work)\b""" to "W = F·d (force times distance).",
        """\bformula for power\b""" to "P = W/t (work divided by time).",
        """^(?:what is )?(?:the )?ph of (?:a |pure )?(?:neutral solution|pure water|water)$""" to "7, which is neutral.",
        """^(?:what is )?(?:the )?ph of (?:a )?strong acid$""" to "Low, about 0 to 2: well below 7.",
        """^(?:what is )?(?:the )?ph of (?:a )?strong base$""" to "High, about 12 to 14: well above 7.",
        """\bacid and (?:a )?base (?:produce|make|form)|\bproducts? of (?:a )?neutralization\b""" to "A salt and water. That is a neutralization reaction.",
        """^(?:what is )?(?:a )?neutralization(?: reaction)?$""" to "An acid and a base react to make a salt and water, and the pH moves toward 7.",
        """\bproducts? of (?:the )?combustion of (?:methane|propane|a hydrocarbon|gasoline|wood|natural gas)\b|\bcombustion of methane\b""" to "Carbon dioxide and water (CO₂ and H₂O).",
        """\bproducts? of photosynthesis\b""" to "Glucose and oxygen, from carbon dioxide, water and light energy.",
        """\bproducts? of (?:cellular )?respiration\b""" to "Carbon dioxide, water and energy (ATP), from glucose and oxygen.",
        """^(?:what is )?(?:an? )?alpha (?:particle|radiation|decay)$""" to "A helium nucleus: 2 protons and 2 neutrons. It is stopped by paper or skin.",
        """^(?:what is )?(?:an? )?beta (?:particle|radiation|decay)$""" to "A fast electron (or positron) given off by a nucleus. It is stopped by a few millimetres of aluminum.",
        """^(?:what is )?(?:an? )?gamma (?:ray|rays|radiation)$""" to "High-energy electromagnetic radiation from a nucleus. It is the most penetrating and needs thick lead or concrete to stop.",
        """\b(?:most|strongest|highest) penetrat""" to "Gamma radiation.",
        """\b(?:least|weakest|lowest) penetrat""" to "Alpha radiation.",
        """^(?:what is )?(?:nuclear )?fission$""" to "A heavy nucleus such as uranium-235 splits into smaller nuclei, releasing energy and neutrons. Nuclear power plants use it.",
        """^(?:what is )?(?:nuclear )?fusion$""" to "Light nuclei such as hydrogen join into a heavier one, releasing energy. It powers the Sun.",
        """\bwhat powers (?:the sun|stars)\b|\benergy (?:source )?of the sun\b""" to "Nuclear fusion of hydrogen into helium in the core.",
        """^(?:what is )?radioactive decay$|^(?:what is )?radioactivity$""" to "An unstable nucleus breaks down and gives off radiation (alpha, beta or gamma) to become more stable.",
        """^(?:what is )?(?:a )?half-?life$""" to "The time it takes for half of the nuclei in a radioactive sample to decay.",
        """\bwhat does dna stand for\b""" to "Deoxyribonucleic acid.",
        """\bwhat does rna stand for\b""" to "Ribonucleic acid.",
        """\b(?:four |4 )?(?:dna )?(?:bases|nitrogen bases|nucleotides) (?:in|of) dna\b|\bfour dna bases\b""" to "Adenine, thymine, cytosine and guanine (A, T, C, G).",
        """\bpairs? with adenine\b""" to "Thymine in DNA (uracil in RNA).",
        """\bpairs? with thymine\b""" to "Adenine.",
        """\bpairs? with guanine\b""" to "Cytosine.",
        """\bpairs? with cytosine\b""" to "Guanine.",
        """^(?:what is )?(?:the )?shape of dna$""" to "A double helix.",
        """\bhow many chromosomes (?:do )?humans have\b|\bhuman chromosomes\b""" to "46, in 23 pairs.",
        """^(?:what is )?(?:a )?gene$""" to "A section of DNA that codes for a protein, which shapes a trait.",
        """^(?:what is )?(?:a )?chromosome$""" to "A long, coiled molecule of DNA with many genes, packed with proteins.",
        """^(?:what is )?(?:an? )?allele$""" to "One version of a gene, such as the allele for brown eyes or for blue.",
        """^(?:what is )?(?:a )?dominant (?:allele|trait|gene)$""" to "An allele that shows in the trait even with one copy; it masks the recessive allele.",
        """^(?:what is )?(?:a )?recessive (?:allele|trait|gene)$""" to "An allele that is masked by a dominant one; it only shows when there are two copies.",
        """^(?:what is )?(?:a )?genotype$""" to "The alleles an organism carries, such as Aa.",
        """^(?:what is )?(?:a )?phenotype$""" to "The trait you can observe, such as eye colour.",
        """^(?:what is )?homozygous$""" to "Two identical alleles for a gene (AA or aa).",
        """^(?:what is )?heterozygous$""" to "Two different alleles for a gene (Aa).",
        """^(?:what is )?(?:a )?mutation$""" to "A change in the DNA sequence. It can be harmful, helpful or have no effect.",
        """^(?:what is )?natural selection$""" to "Organisms with traits that suit their environment survive and reproduce more, so those traits become more common over generations.",
        """^(?:what is )?evolution$""" to "The change in the inherited traits of a population over many generations.",
        """\bhow old is the universe\b|\bage of the universe\b""" to "About 13.8 billion years.",
        """\bhow old is (?:the )?earth\b|\bage of (?:the )?earth\b""" to "About 4.54 billion years.",
        """^(?:what is )?(?:a )?light[- ]year$""" to "The distance light travels in one year, about 9.46 trillion km.",
        """\bevidence (?:for|supports?|of) (?:the )?big bang\b|\bbig bang evidence\b""" to "Redshift of distant galaxies (the universe is expanding), the cosmic microwave background radiation, and the amounts of hydrogen and helium.",
        """^(?:what is )?(?:the )?big bang(?: theory)?$""" to "The universe began about 13.8 billion years ago from an extremely hot, dense state and has been expanding ever since.",
        """^(?:what is )?(?:a )?red ?shift$""" to "Light from an object moving away is stretched to longer, redder wavelengths. Distant galaxies are redshifted, so the universe is expanding.",
        """^(?:what is )?(?:a )?galaxy$""" to "A huge system of billions of stars, gas and dust held together by gravity, like the Milky Way.",
        """^(?:what is )?(?:a )?nebula$""" to "A cloud of gas and dust in space where stars form.",
        """\bclosest star to (?:the )?earth\b|\bnearest star to (?:the )?earth\b""" to "The Sun. After it, Proxima Centauri, about 4.2 light-years away.",
        """\blargest planet\b""" to "Jupiter.",
        """\bsmallest planet\b""" to "Mercury.",
        """\bclosest planet to the sun\b""" to "Mercury.",
        """\bhottest planet\b""" to "Venus.",
        """\blife cycle of (?:a )?(?:star|sun-like star)\b""" to "Nebula, main-sequence star, red giant, then a white dwarf. A massive star ends as a supernova, then a neutron star or black hole.",
        """^(?:what is )?(?:a )?black hole$""" to "A region where gravity is so strong that nothing, not even light, can escape.",
    ).map { Regex(it.first) to it.second }

    private fun out(body: String) = Answer.Text(heading = null, body = body, source = "Nimble science")
    private fun find(pattern: String, s: String): List<String>? = Regex(pattern).find(s)?.groupValues
    private fun has(pattern: String, s: String) = Regex(pattern).containsMatchIn(s)
    private tailrec fun gcd(a: Long, b: Long): Long = if (b == 0L) abs(a) else gcd(b, a % b)
    private fun ratio(n: Long, d: Long): String {
        val g = gcd(n, d).takeIf { it != 0L } ?: 1L
        val a = n / g
        val b = d / g
        return if (b == 1L) "$a" else "$a/$b" + if (b > 12) " ≈ " + pcNum(fixed(a.toDouble() / b, 4)) else ""
    }

    fun answer(q: String, raw: String): Answer? {
        val r = raw.trim().replace(Regex("[?.!]+$"), "")
        for ((re, body) in facts) if (re.containsMatchIn(q)) return out(body)
        var m: List<String>?
        // atoms and ions
        m = find("""^(?:the )?atomic (number|mass) (?:of|for) ([a-z]+)$""", q)
        if (m != null) by(m[2])?.let { e -> return out(if (m[1] == "number") "${e.z}" else pcNum(e.m) + " u (g/mol)") }
        m = find("""^how many (protons|electrons|neutrons) (?:does|do|are in|in) (?:an? |the )?(?:atom of )?([a-z]+)(?:-(\d+))?(?: atom)?(?: have)?$""", q)
        if (m != null) by(m[2])?.let { e ->
            if (m[1] == "neutrons") {
                val a = if (m[3].isNotEmpty()) m[3].toInt() else jsRound(e.m).toInt()
                return out("${a - e.z}" + if (m[3].isNotEmpty()) "" else " (in the most common isotope, mass number $a)")
            }
            return out("${e.z}")
        }
        m = find("""\bhow many neutrons (?:does|do|are in|in) (?:an? |the )?([a-z]+)-(\d+)""", q)
        if (m != null) by(m[1])?.let { return out("${m[2].toInt() - it.z}") }
        m = find("""\bhow many electrons (?:does|do|are in|in) (?:an? |the )?(?:[a-z]+ )?ion ([A-Z][a-z]?)(\d*)([+-])""", r) ?: find("""\bhow many electrons (?:does|do|are in|in) (?:an? |the )?([A-Z][a-z]?)(\d*)([+-])""", r)
        if (m != null) {
            val e = by(m[1]) ?: return null
            val c = (if (m[3] == "+") 1 else -1) * m[2].ifEmpty { "1" }.toInt()
            return out("${e.z - c}")
        }
        // compounds
        m = find("""^(?:the )?(?:chemical )?formula (?:for|of) ([a-z() ]+)$""", q)
        if (m != null) formula(m[1].removePrefix("the "))?.let { return out(sub(it)) }
        // Case matters for formulas (Co is cobalt, CO is carbon monoxide), so these read the question as typed.
        val typed = r.replaceFirst(Regex("""^(?:what(?:'s|’s| is)\s+)?(?:the\s+)?""", RegexOption.IGNORE_CASE), "")
        Regex("""^(?:name|name of) (?:the )?(?:compound |molecule )?([A-Z][A-Za-z0-9()]*)$""", RegexOption.IGNORE_CASE).find(typed)?.groupValues?.let { g ->
            name(g[1])?.let { n -> return out(n.replaceFirstChar { it.uppercase() } + ".") }
        }
        Regex("""^(?:molar|molecular|formula) mass (?:of|for) (.+)$""", RegexOption.IGNORE_CASE).find(typed)?.groupValues?.let { g ->
            val nm = g[1].trim()
            val f = if (parse(nm) != null) nm else formula(nm.lowercase())
            val c = f?.let { parse(it) }
            if (f != null && c != null) return out(pcNum(fixed(mass(c), 2)) + " g/mol (" + sub(f) + ")")
        }
        // reactions
        Regex("""^balance (?:the equation )?(.+)$""", RegexOption.IGNORE_CASE).find(r)?.groupValues?.let { g -> balance(g[1])?.let { return out(it) } }
        Regex("""^what (?:type|kind) of reaction is (.+)$""", RegexOption.IGNORE_CASE).find(r)?.groupValues?.let { g -> type(g[1])?.let { return out(it) } }
        m = find("""^is (?:a )?ph (?:of )?([\d.]+) (?:an? )?(?:acidic|basic|acid|base|neutral)""", q)
        if (m != null) {
            val p = m[1].toDouble()
            return out(if (p < 7) "Acidic (below 7)." else if (p > 7) "Basic, or alkaline (above 7)." else "Neutral (exactly 7).")
        }
        // energy, work and power
        fun v(p: String) = find(p, q)?.get(1)?.toDouble()
        if (has("""\bkinetic energy\b""", q)) {
            val kg = v("""([\d.]+)\s*kg\b""")
            val sp = v("""([\d.]+)\s*m/s\b""")
            if (kg != null && sp != null) return out(pcNum(fixed(0.5 * kg * sp * sp, 3)) + " J (KE = ½mv²)")
        }
        if (has("""\bpotential energy\b""", q)) {
            val kg = v("""([\d.]+)\s*kg\b""")
            val h = v("""([\d.]+)\s*m\b(?!/)""")
            if (kg != null && h != null) return out(pcNum(fixed(kg * 9.8 * h, 3)) + " J (PE = mgh, with g = 9.8 m/s²)")
        }
        if (has("""\bwork\b""", q) && !has("""\bpower\b""", q)) {
            val f = v("""([\d.]+)\s*n\b""")
            val d = v("""([\d.]+)\s*m\b(?!/)""")
            if (f != null && d != null) return out(pcNum(fixed(f * d, 3)) + " J (W = Fd)")
        }
        if (has("""\bpower\b""", q)) {
            val w = v("""([\d.]+)\s*(?:j|joules)\b""")
            val t = v("""([\d.]+)\s*(?:s|seconds?)\b""")
            if (w != null && t != null && t != 0.0) return out(pcNum(fixed(w / t, 3)) + " W (P = W/t)")
        }
        m = find("""\b(?:speed|velocity)\b.*?\btravels? ([\d.]+)\s*(m|km)\b.*?\bin ([\d.]+)\s*(s|seconds?|h|hours?|min|minutes?)\b""", q)
        if (m != null) {
            val u = m[2] + "/" + if (m[4].startsWith("s")) "s" else if (m[4].startsWith("h")) "h" else "min"
            return out(pcNum(fixed(m[1].toDouble() / m[3].toDouble(), 3)) + " " + u)
        }
        // genetics: Punnett squares for one or two genes
        m = find("""\b([A-Za-z]{2}(?:[A-Za-z]{2})?)\s*(?:x|×|by|and)\s*([A-Za-z]{2}(?:[A-Za-z]{2})?)\b.*?\b(?:fraction|percent|probability|chance|proportion|ratio)\b.*?\b(?:are|is|be|of)\s+([A-Za-z]{2}(?:[A-Za-z]{2})?)\b""", r)
        if (m != null && m[1].length == m[2].length && m[1].length == m[3].length) {
            fun gam(g: String) = if (g.length == 2) listOf("${g[0]}", "${g[1]}") else listOf("${g[0]}${g[2]}", "${g[0]}${g[3]}", "${g[1]}${g[2]}", "${g[1]}${g[3]}")
            fun norm(g: String) = if (g.length == 2) g.toList().sorted().joinToString("") else g.take(2).toList().sorted().joinToString("") + g.drop(2).toList().sorted().joinToString("")
            val kids = mutableListOf<String>()
            for (a in gam(m[1])) for (b in gam(m[2])) kids += if (m[1].length == 2) a + b else "${a[0]}${b[0]}${a[1]}${b[1]}"
            val want = norm(m[3])
            val hit = kids.count { norm(it) == want }
            return out(ratio(hit.toLong(), kids.size.toLong()) + " (" + pcNum(fixed(hit * 100.0 / kids.size, 2)) + "%) of the offspring are " + m[3] + ".")
        }
        return null
    }
}
