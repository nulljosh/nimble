package com.nulljosh.nimble

/** Where the history text lives. Android uses SharedPreferences, desktop a file; never the network. */
interface HistoryStorage {
    fun read(): String
    fun write(text: String)
}

/** One saved question. [answer] is the plain text of its answer, first 280 characters, or null. Local only. */
class HistoryEntry(val q: String, val t: Long, val answer: String? = null)

/**
 * Local search history: newest first, case-insensitive de-dupe moves to the top, last 50.
 * Same rules as searchHistory in docs/engine.js and Sources/Models/SearchHistory.swift.
 * One line per entry: "q<TAB>t" or "q<TAB>t<TAB>answer", t in ms. Lines written before answers
 * were saved still decode (no answer). Tabs and newlines are folded to spaces, so the format holds.
 * Never leaves the device.
 */
class SearchHistory(
    private val storage: HistoryStorage,
    private val now: () -> Long,
) {
    companion object {
        const val MAX_ENTRIES = 50
        const val ANSWER_LIMIT = 280
        private val LINE_BREAKS = setOf('\t', '\n', '\r')
    }

    fun list(): List<HistoryEntry> {
        val text = try { storage.read() } catch (_: Throwable) { return emptyList() }
        return text.lineSequence()
            .mapNotNull { line ->
                val parts = line.split('\t')
                if (parts.size < 2) return@mapNotNull null
                val q = parts[0]
                if (q.isBlank()) return@mapNotNull null
                HistoryEntry(q, parts[1].toLongOrNull() ?: 0L, parts.getOrNull(2)?.takeIf { it.isNotBlank() })
            }
            .take(MAX_ENTRIES)
            .toList()
    }

    /**
     * Asks [query] (newest first, de-duplicated). The saved [answer] replaces any older one for the same question;
     * asking again without an answer clears it, the same as the Swift app.
     */
    fun add(query: String, answer: String? = null) {
        val q = fold(query).trim()
        if (q.isEmpty()) return
        val snippet = answer?.let { fold(it).trim().take(ANSWER_LIMIT) }?.takeIf { it.isNotEmpty() }
        val rest = list().filter { !it.q.equals(q, ignoreCase = true) }
        save(listOf(HistoryEntry(q, now(), snippet)) + rest)
    }

    /** Deletes the rows for these questions, matched ignoring case. */
    fun remove(questions: Set<String>) {
        val keys = questions.map { it.lowercase() }.toSet()
        if (keys.isEmpty()) return
        save(list().filter { it.q.lowercase() !in keys })
    }

    /**
     * Plain text of the rows for these questions, in list order: each question, then its saved answer,
     * blocks separated by a blank line. Same format as SearchHistory.copyText in Swift.
     */
    fun copyText(questions: Set<String>): String {
        val keys = questions.map { it.lowercase() }.toSet()
        return list()
            .filter { it.q.lowercase() in keys }
            .joinToString("\n\n") { listOfNotNull(it.q, it.answer).joinToString("\n") }
    }

    fun clear() = save(emptyList())

    private fun fold(s: String): String = s.map { if (it in LINE_BREAKS) ' ' else it }.joinToString("")

    private fun save(entries: List<HistoryEntry>) {
        try {
            storage.write(entries.take(MAX_ENTRIES).joinToString("\n") { e ->
                listOfNotNull(e.q, e.t.toString(), e.answer).joinToString("\t")
            })
        } catch (_: Throwable) {
            // History is a nicety; never crash over it.
        }
    }
}

/** The age of a saved question in plain words: "just now", "12 min ago", "3 h ago", "yesterday", "5 days ago". */
fun relativeAge(then: Long, now: Long): String {
    val s = ((now - then) / 1000).coerceAtLeast(0)
    return when {
        s < 60 -> "just now"
        s < 3_600 -> "${s / 60} min ago"
        s < 86_400 -> "${s / 3_600} h ago"
        s < 172_800 -> "yesterday"
        else -> "${s / 86_400} days ago"
    }
}

/** The plain text of an answer that a history row keeps, or null when the answer has no text to keep. */
fun historySnippet(answer: Answer): String? = when (answer) {
    is Answer.Math -> answer.value
    is Answer.Text -> answer.body
    is Answer.News -> answer.items.joinToString(" ") { it.sentence }
    else -> null
}
