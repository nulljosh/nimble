package com.nulljosh.nimble

/** Where the history text lives. Android uses SharedPreferences, desktop a file; never the network. */
interface HistoryStorage {
    fun read(): String
    fun write(text: String)
}

class HistoryEntry(val q: String, val t: Long)

/**
 * Local search history: newest first, case-insensitive de-dupe moves to the top, last 50.
 * Same rules as searchHistory in docs/engine.js and Sources/Models/SearchHistory.swift.
 * One line per entry, "q<TAB>t" with t in ms, so no serialization dependency is needed.
 * Never leaves the device.
 */
class SearchHistory(
    private val storage: HistoryStorage,
    private val now: () -> Long,
) {
    companion object {
        const val MAX_ENTRIES = 50
    }

    fun list(): List<HistoryEntry> {
        val text = try { storage.read() } catch (_: Throwable) { return emptyList() }
        return text.lineSequence()
            .mapNotNull { line ->
                val tab = line.lastIndexOf('\t')
                if (tab <= 0) return@mapNotNull null
                val q = line.substring(0, tab)
                if (q.isBlank()) return@mapNotNull null
                HistoryEntry(q, line.substring(tab + 1).toLongOrNull() ?: 0L)
            }
            .take(MAX_ENTRIES)
            .toList()
    }

    fun add(query: String) {
        // A tab or newline would break the line format, so fold them to spaces.
        val q = query.map { if (it == '\t' || it == '\n' || it == '\r') ' ' else it }.joinToString("").trim()
        if (q.isEmpty()) return
        val rest = list().filter { !it.q.equals(q, ignoreCase = true) }
        save(listOf(HistoryEntry(q, now())) + rest)
    }

    fun clear() = save(emptyList())

    private fun save(entries: List<HistoryEntry>) {
        try {
            storage.write(entries.take(MAX_ENTRIES).joinToString("\n") { "${it.q}\t${it.t}" })
        } catch (_: Throwable) {
            // History is a nicety; never crash over it.
        }
    }
}
