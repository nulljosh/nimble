package com.nulljosh.nimble

import java.text.Normalizer

// Desktop has no offline pack yet: the network is treated as up, and Settings hides the section.
actual fun networkAvailable(): Boolean = true

internal actual fun nfkdLowercase(s: String): String =
    Normalizer.normalize(s.lowercase(), Normalizer.Form.NFKD)

actual fun platformOfflinePackStore(): OfflinePackStore? = null

private val prefs by lazy { java.util.prefs.Preferences.userRoot().node("com.nulljosh.nimble") }
actual fun loadPrivateMode(): Boolean = prefs.getBoolean("private_mode", false)
actual fun savePrivateMode(on: Boolean) { prefs.putBoolean("private_mode", on) }
actual fun loadThemeName(): String? = prefs.get("theme", null)
actual fun saveThemeName(name: String) { prefs.put("theme", name) }

actual fun systemLanguage(): String = java.util.Locale.getDefault().language
