package com.nulljosh.nimble

/** The two-letter language the device is set to: "en", "fr", "es", "zh", "pa", and so on. */
expect fun systemLanguage(): String

/**
 * The English text, in the device's language when the catalog has it, else English as written. [args] fill the
 * named slots: `tr("Open {s}", "s" to name)`. The table is generated (scripts/i18n-gen.mjs), so a new string goes
 * into i18n/kotlin.json with all four translations and the generator is rerun.
 */
fun tr(en: String, vararg args: Pair<String, String>): String {
    var s = I18N_TABLE[en]?.get(systemLanguage()) ?: en
    for ((k, v) in args) s = s.replace("{$k}", v)
    return s
}
