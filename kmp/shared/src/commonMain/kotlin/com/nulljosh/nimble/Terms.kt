package com.nulljosh.nimble

import kotlin.math.abs

/**
 * Course terms, shared by the fact-heavy BC courses. A port of `termAsk()` in docs/engine.js. Each course has a table
 * of (regex for the whole term, description, pattern source) and a list of kinds (question noun, regex over pattern
 * sources). It answers "what is X", "function of X", "what does X do", "how are X formed", "what happens at X",
 * "what causes X" and "what is X made of" from the table, and "which organelle makes ATP" by the term of that kind
 * whose description shares the most words with the question, a word counting less the more of those descriptions use it.
 */
internal object Terms {
    private val asks = listOf(
        """^(?:what (?:is|are) )?(?:the )?(?:main )?(?:functions?|roles?|jobs?|purposes?) of (?:the |a |an )?(.+)$""",
        """^what (?:does|do) (?:the |a |an )?(.+?) (?:do|carry|transport|make|produce|release|secrete|store|control|contain)$""",
        """^how (?:are|is|do|does) (?:the |a |an )?(.+?) (?:formed|form|made|created|forms)$""",
        """^what happens (?:at|in|during) (?:the |a |an )?(.+)$""",
        """^what causes (?:the |a |an )?(.+)$""",
        """^(?:what (?:is|are) )?(?:the |a |an )?(.+?) made (?:up )?of$""",
        """^(?:what (?:is|are|was|were) |define )?(?:the |a |an )?(.+)$""",
    ).map { Regex(it) }
    private val stop = "the a an of in is are does do which what that and to from for it its with by on into".split(" ").toSet()

    /** A term's plain name from its pattern: optional parts dropped, the first choice of each group kept. */
    private fun name(s: String) = s.replace(Regex("""\(\?:[^()]*\)\?"""), "").replace(Regex("""\(\?:([^|()]*)[^()]*\)"""), "$1")
        .split("|")[0].replace(Regex(""".\?"""), "").replaceFirstChar { it.uppercase() }

    fun answer(q: String, terms: List<Triple<Regex, String, String>>, kinds: List<Pair<String, String>>): String? {
        for (re in asks) {
            val m = re.find(q) ?: continue
            val t = m.groupValues[1].replace(Regex(""" (?:in|of) (?:the )?(?:body|cell|human body)$"""), "")
            for ((tre, body) in terms) if (tre.containsMatchIn(t)) return body
        }
        for ((kind, names) in kinds) {
            val k = Regex("^(?:in |on |at )?(?:what|which) (?:$kind) (.+)$").find(q)?.groupValues ?: continue
            val words = k[1].split(Regex("[^a-z0-9]+")).filter { it.length > 2 && it !in stop }.map { it.take(5) }
            val nre = Regex(names)
            val pool = terms.filter { nre.containsMatchIn(it.third) }.map { Triple(it.third, it.second, it.second.lowercase()) }
            fun weight(w: String): Double { val n = pool.count { w in it.third }; return if (n > 0) 1.0 / n else 0.0 }
            var best: Triple<String, String, String>? = null
            var top = 0.0
            var tie = false
            for (t in pool) {
                val n = words.sumOf { if (it in t.third) weight(it) else 0.0 }
                if (n > top + 1e-9) { best = t; top = n; tie = false } else if (abs(n - top) < 1e-9 && n > 0) tie = true
            }
            if (best != null && !tie) return name(best.first) + ". " + best.second
            break
        }
        return null
    }
}
