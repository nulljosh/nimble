package com.nulljosh.nimble

/**
 * The downloaded pack on this device. Nothing is fetched until the user taps Download in Settings.
 * Null from [platformOfflinePackStore] on platforms without offline answers yet (the section is then hidden).
 */
interface OfflinePackStore {
    /** The installed pack, or null when none is downloaded. Read once, then kept in memory until [remove]. */
    suspend fun load(): OfflinePack?

    /** The pack's size in bytes as the server lists it, or null when the list cannot be reached. */
    suspend fun remoteBytes(): Long?

    /**
     * Fetches, gunzips, checks and stores the pack. [onProgress] gets bytes so far and the total (or -1 when unknown).
     * Throws when the download or the pack is bad; nothing is stored then.
     */
    suspend fun download(onProgress: (Long, Long) -> Unit): OfflinePack

    /** Deletes the stored pack. */
    suspend fun remove()
}

/** The pack's public address: the same file the web and Mac/iPhone apps read. */
const val OFFLINE_PACK_URL = "https://nimble.jaybulb.com/pack/wikipedia-top-v1.json.gz"
const val OFFLINE_PACK_INDEX_URL = "https://nimble.jaybulb.com/pack/index.json"

/** True when the device has a network connection. Offline answers take over when it does not. */
expect fun networkAvailable(): Boolean

/** NFKD of the lowercased text, the same normalization as the Swift and web lookup (accents split off, then dropped). */
internal expect fun nfkdLowercase(s: String): String

/** The store for this platform, or null when it has none. */
expect fun platformOfflinePackStore(): OfflinePackStore?

/** "2026-10-12" to "Oct 12", read as a plain date so the day never shifts with the zone. */
fun packAsOfLabel(builtAt: String): String? {
    val months = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
    val parts = builtAt.split("-")
    if (parts.size != 3) return null
    val month = parts[1].toIntOrNull() ?: return null
    val day = parts[2].toIntOrNull() ?: return null
    if (month !in 1..12) return null
    return "${months[month - 1]} $day"
}

/** 1948983 to "1.9 MB". */
fun megabytes(bytes: Long): String {
    val tenths = (bytes * 10 + 524_288) / 1_048_576
    return "${tenths / 10}.${tenths % 10} MB"
}

/** 9000 to "9,000". */
fun thousands(n: Int): String {
    val digits = n.toString()
    return digits.reversed().chunked(3).joinToString(",").reversed()
}
