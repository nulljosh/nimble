package com.nulljosh.nimble

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

internal actual fun zonedClock(zoneId: String, epochMillis: Long?): ZonedClock? = try {
    val at = Instant.ofEpochMilli(epochMillis ?: System.currentTimeMillis()).atZone(ZoneId.of(zoneId))
    ZonedClock(
        time = DateTimeFormatter.ofPattern("HH:mm", Locale.US).format(at),
        day = DateTimeFormatter.ofPattern("EEEE, MMMM d", Locale.US).format(at),
    )
} catch (_: Exception) {
    null
}
