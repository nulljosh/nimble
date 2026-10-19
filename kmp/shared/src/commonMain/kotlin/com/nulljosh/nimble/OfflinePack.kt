package com.nulljosh.nimble

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * The offline Wikipedia pack: the opening sentences of the 9,000 most-viewed English articles.
 * A port of the pack lookup in docs/engine.js (packTokens, packHits, packText, packAnswer) and of
 * Sources/Models/OfflinePack.swift. Same scores, thresholds and sentence breaks, so every platform
 * gives the same answer from the same pack. Format and license: docs/pack/README.md.
 */
@Serializable
internal data class PackEntry(
    val t: String,
    val d: String? = null,
    val e: String,
    val u: String,
    val a: List<String>? = null,
)

@Serializable
internal data class PackFile(
    val version: Int? = null,
    val builtAt: String? = null,
    val entries: List<PackEntry> = emptyList(),
)

/** One answer: the sentences that answer, the article link, and the pack's build date (yyyy-MM-dd). */
data class PackAnswer(val title: String, val text: String, val url: String, val builtAt: String)

class OfflinePack internal constructor(file: PackFile) {
    val builtAt: String = file.builtAt.orEmpty()
    val count: Int get() = entries.size

    private val entries: List<PackEntry> = file.entries
    private val index: List<Indexed> = entries.map { e ->
        val titleTokens = packTokens(e.t)
        Indexed(
            titleWords = packTokens(coreTitle(e.t)).filter { it !in STOP && it !in TITLE_FILLER },
            titleSet = (titleTokens + (e.a.orEmpty()).flatMap(::packTokens)).toSet(),
            descSet = packTokens(e.d.orEmpty()).toSet(),
            textSet = packTokens(e.e).toSet(),
        )
    }

    /** Lookup: the answer for a question, or null. A relation question takes only an entry whose text carries the relation. */
    fun answer(query: String): PackAnswer? {
        val rel = relationOf(query)
        for (hit in hits(rel?.subject ?: query)) {
            val e = entries[hit.index]
            val text = textFor(e, query, rel)
            if (text.isNotEmpty()) return PackAnswer(e.t, text, e.u, builtAt)
        }
        return null
    }

    private class Indexed(
        val titleWords: List<String>,   // stop words removed, duplicates kept
        val titleSet: Set<String>,      // title and aliases, every word
        val descSet: Set<String>,
        val textSet: Set<String>,
    )

    private class Hit(val index: Int, val score: Int, val len: Int)

    /** Every entry that matches the query, best first. A title match counts only when the title is about the query. */
    private fun hits(query: String): List<Hit> {
        val want = packTokens(query).toSet() - STOP
        if (want.isEmpty()) return emptyList()
        val sup = want.firstOrNull { it in SUPERLATIVES }
        val out = ArrayList<Hit>()
        index.forEachIndexed { i, ix ->
            // Same rule as docs/engine.js packHits: no stray title word, except one the question cannot name when the
            // lead sentence says the title "is the largest" (Pacific Ocean for "largest ocean"). "sinking" covers "sink".
            val extra = ix.titleWords.count { w -> want.none { q -> w == q || (q.length >= 4 && (w == q + "ing" || w == q + "ed")) } }
            val fits = extra == 0 || (extra == 1 && sup != null && leadSays(entries[i].e, sup))
            var score = 0
            var named = false
            for (w in want) {
                if (w in ix.titleSet) {
                    if (fits) { score += 3; named = true } else score += 1
                } else if (w in ix.descSet) {
                    score += 2
                } else if (w in ix.textSet) {
                    score += 1
                }
            }
            if (named && score >= MIN_SCORE) out.add(Hit(i, score, ix.titleWords.size))
        }
        // Ties go to the shorter title, then to the more-viewed entry (earlier in the pack).
        return out.sortedWith(compareByDescending<Hit> { it.score }.thenBy { it.len }.thenBy { it.index })
    }

    companion object {
        /** A title or description needs this many points to count as a hit (PACK_MIN). */
        const val MIN_SCORE = 3

        private val TITLE_FILLER = setOf("inc", "ltd", "corp", "co", "plc")
        private val SUPERLATIVES = setOf("largest", "longest", "deepest", "tallest", "highest", "biggest", "smallest", "oldest", "hottest", "coldest")

        /** The title without a trailing "(film)" or "(company)". "(TV series)" and "(2026 film)" stay: they are other things. */
        internal fun coreTitle(t: String): String {
            val open = t.lastIndexOf('(')
            if (!t.endsWith(")") || open < 0) return t
            val inside = t.substring(open).lowercase()
            if (inside.any { it.isDigit() } || "series" in inside) return t
            return t.substring(0, open).trim()
        }

        /** True when the lead sentence says "is the <superlative>" as words ("is the fifth-longest" does not). */
        internal fun leadSays(text: String, sup: String): Boolean =
            Regex("\\bis the $sup\\b", RegexOption.IGNORE_CASE).containsMatchIn(text.substringBefore(". "))

        /** Words that never count toward a match (PACK_STOP). */
        private val STOP: Set<String> = (
            "a an and are as at be by did do does for from how i in is it its of on or that the to was were what when where which who whom whose why with the"
            ).split(" ").toSet()

        private val json = Json { ignoreUnknownKeys = true }

        /** Parses the decompressed pack JSON. Null for anything that is not a pack. */
        fun parse(text: String): OfflinePack? =
            runCatching { OfflinePack(json.decodeFromString<PackFile>(text)) }.getOrNull()

        // Relation questions (relationOf in engine.js): the pattern, the sentence word, the excluded phrase.
        private class Shape(val re: Regex, val word: String, val not: String?, val verbGroup: Boolean)

        private val yearPattern = """\b(?:1[0-9]{3}|20[0-9]{2})\b"""
        private val shapes = listOf(
            Shape(
                Regex("""^(?:what(?:'s| is)(?: the)?\s+|the\s+)?capital(?:\s+city)?\s+of\s+(.+?)\s*\??$""", RegexOption.IGNORE_CASE),
                """\bcapital\b""", "capital punishment", false,
            ),
            Shape(
                Regex("""^who\s+(?:wrote|written|authored|painted|composed|directed|invented|discovered|founded|created)\s+(.+?)\s*\??$""", RegexOption.IGNORE_CASE),
                """\b(?:written|wrote|author|authored|composed|painted|directed|invented|discovered|founded|created)\b""", null, false,
            ),
            Shape(
                Regex("""^when\s+(?:was|did|were|is)\s+(.+?)(?:\s+(born|founded|built|invented|released|published|created|written|made|died|die))?\s*\??$""", RegexOption.IGNORE_CASE),
                yearPattern, null, true,
            ),
            Shape(
                Regex("""^population\s+of\s+(.+?)\s*\??$""", RegexOption.IGNORE_CASE),
                """\bpopulation (?:of|is|was|at|about|around|over|estimated)\b[^.]*\d""", null, false,
            ),
        )

        private class Relation(val subject: String, val word: (String) -> Boolean, val excluded: ((String) -> Boolean)?)

        private fun relationOf(query: String): Relation? {
            val q = query.trim()
            for (shape in shapes) {
                val m = shape.re.find(q) ?: continue
                val subject = Regex("""^the\s+""", RegexOption.IGNORE_CASE).replace(m.groupValues[1], "")
                val verb = if (shape.verbGroup) m.groups[2]?.value else null
                val wordRe = Regex(shape.word, RegexOption.IGNORE_CASE)
                val verbRe = verb?.let { Regex("""\b$it\b""", RegexOption.IGNORE_CASE) }
                val notRe = shape.not?.let { Regex(it, RegexOption.IGNORE_CASE) }
                val word: (String) -> Boolean = { s -> wordRe.containsMatchIn(s) && (verbRe == null || verbRe.containsMatchIn(s)) }
                val excluded: ((String) -> Boolean)? = notRe?.let { re -> { s: String -> re.containsMatchIn(s) } }
                return Relation(subject, word, excluded)
            }
            return null
        }

        // Splits after . ! or ? and whitespace, but not after "Apple Inc." or "St." (SENTENCE_BREAK in engine.js).
        private val sentenceBreak = Regex("""(?<!\b[A-Z][a-z]{0,2}\.)(?<=[.!?])\s+(?=[A-Z0-9"(])""")

        internal fun sentences(text: String): List<String> {
            val out = ArrayList<String>()
            var last = 0
            for (m in sentenceBreak.findAll(text)) {
                out.add(text.substring(last, m.range.first))
                last = m.range.last + 1
            }
            out.add(text.substring(last))
            return out.filter { it.isNotEmpty() }
        }

        /**
         * The sentences that answer. A relation question takes the lead sentence plus the first sentence with the relation
         * word; no such sentence means "", never a guess. Other questions take the one or two sentences sharing two of the
         * question's own words (all of them when it has fewer); a question that is only the title takes the first sentence,
         * and anything else with no such sentence is a miss ("Human penis" answered "how many bones in the human body").
         */
        private fun textFor(e: PackEntry, query: String, rel: Relation?): String {
            val sents = sentences(e.e)
            val first = sents.firstOrNull() ?: return ""
            if (rel != null) {
                val main = sents.firstOrNull { rel.word(it) && !(rel.excluded?.invoke(it) ?: false) } ?: return ""
                return if (first == main) main else "$first $main"
            }
            val titleWords = packTokens(e.t).toSet()
            val want = packTokens(query).filter { it !in STOP && it !in titleWords }.toSet()
            val best = sents.withIndex()
                .map { (i, s) -> Triple(s, i, packTokens(s).toSet().let { toks -> want.count { it in toks } }) }
                .filter { it.third >= maxOf(1, minOf(2, want.size)) }
                .sortedWith(compareByDescending<Triple<String, Int, Int>> { it.third }.thenBy { it.second })
                .take(2)
                .sortedBy { it.second }
            if (best.isEmpty()) return if (want.isEmpty()) first else ""
            return best.joinToString(" ") { it.first }
        }
    }
}

/** Lowercase, accents folded, every run of anything but a-z and 0-9 is a break. Exact words: no stemming. */
internal fun packTokens(s: String): List<String> {
    val out = ArrayList<String>()
    val cur = StringBuilder()
    for (c in nfkdLowercase(s)) {
        if (c.code in 0x300..0x36F) continue // combining marks fold away, like the accent in "Café"
        if (c in 'a'..'z' || c in '0'..'9') {
            cur.append(c)
        } else if (cur.isNotEmpty()) {
            out.add(cur.toString())
            cur.clear()
        }
    }
    if (cur.isNotEmpty()) out.add(cur.toString())
    return out
}
