package com.nulljosh.nimble

import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

internal actual fun zoneClock(epochMillis: Long, zoneId: String?, pattern: String): String {
    val zone = zoneId?.let { ZoneId.of(it) } ?: ZoneId.systemDefault()
    return DateTimeFormatter.ofPattern(pattern, Locale.US).withZone(zone).format(Instant.ofEpochMilli(epochMillis))
}

internal actual fun formatAsOf(epochMillis: Long, isDay: Boolean, zoneId: String?): String {
    val at = Instant.ofEpochMilli(epochMillis)
    if (isDay) return DateTimeFormatter.ofPattern("MMM d", Locale.US).withZone(ZoneOffset.UTC).format(at)
    val zone = zoneId?.let { ZoneId.of(it) } ?: ZoneId.systemDefault()
    // "3:41 PM" reads as "3:41 pm" in the freshness line, same as the web and Swift.
    return DateTimeFormatter.ofPattern("MMM d, h:mm a", Locale.US).withZone(zone).format(at)
        .replace(" AM", " am").replace(" PM", " pm")
}
