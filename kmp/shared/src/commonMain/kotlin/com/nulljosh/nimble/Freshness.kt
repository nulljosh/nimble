package com.nulljosh.nimble

import kotlin.time.Clock

/** When a value was true: a moment, or a day (an exchange rate, a close) shown as the day alone. Ported from Freshness in Sources/Models/QueryResult.swift. */
data class Freshness(val epochMillis: Long, val isDay: Boolean) {
    /** "Oct 12, 3:41 pm" in the zone given (the device zone when null), or "Oct 9" for a day. */
    fun label(zoneId: String? = null): String = formatAsOf(epochMillis, isDay, zoneId)

    companion object {
        fun now(): Freshness = Freshness(Clock.System.now().toEpochMilliseconds(), false)
    }
}

/** The label for a moment or a day. java.time on both JVM targets. */
internal expect fun formatAsOf(epochMillis: Long, isDay: Boolean, zoneId: String?): String

/** UTC midnight of a "yyyy-MM-dd" day in epoch millis, or null for anything else. Pure, no clock. */
internal fun utcDayMillis(day: String): Long? {
    val m = Regex("""^(\d{4})-(\d{2})-(\d{2})$""").find(day.trim()) ?: return null
    val y = m.groupValues[1].toInt()
    val mo = m.groupValues[2].toInt()
    val d = m.groupValues[3].toInt()
    if (mo !in 1..12 || d !in 1..31) return null
    return daysFromCivil(y, mo, d) * 86_400_000L
}

/** The UTC "yyyy-MM-dd" of an epoch millis. */
internal fun isoDayUtc(epochMillis: Long): String {
    val z = epochMillis.floorDiv(86_400_000L) + 719_468
    val era = z.floorDiv(146_097L)
    val doe = z - era * 146_097L
    val yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365
    val doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
    val mp = (5 * doy + 2) / 153
    val d = doy - (153 * mp + 2) / 5 + 1
    val m = if (mp < 10) mp + 3 else mp - 9
    val y = yoe + era * 400 + if (m <= 2) 1 else 0
    return y.toString().padStart(4, '0') + "-" + m.toString().padStart(2, '0') + "-" + d.toString().padStart(2, '0')
}

// Howard Hinnant's days_from_civil: days since 1970-01-01 for a proleptic Gregorian date.
private fun daysFromCivil(year: Int, month: Int, day: Int): Long {
    val y = (if (month <= 2) year - 1 else year).toLong()
    val era = y.floorDiv(400L)
    val yoe = y - era * 400
    val mp = (month + 9) % 12
    val doy = (153 * mp + 2) / 5 + day - 1
    val doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
    return era * 146_097 + doe - 719_468
}

/** True for an http(s) link, the only kind the apps open. */
fun isWebUrl(url: String): Boolean = url.startsWith("https://", ignoreCase = true) || url.startsWith("http://", ignoreCase = true)
