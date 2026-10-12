package com.nulljosh.nimble

/**
 * True when the answer can change over time, so a text answer shows its fetch time.
 * The same word lists as the web (docs/engine.js) and Swift (QueryEngine.isTimeSensitive). Lowercase, no AI.
 */
fun isTimeSensitive(query: String): Boolean {
    val s = query.lowercase()
    if (Regex("""\b(current|currently|latest|now|today|tonight|right now|this year|this week|this month|as of|newest|recent|recently|incumbent|last)\b""").containsMatchIn(s)) return true
    val role = Regex("""\b(ceo|cfo|chairman|president|prime minister|premier|mayor|governor|leader|champion|record|holds|population|price|cost|worth|winner|won|king|queen|monarch|ruler|chancellor|pope|head of)\b""").containsMatchIn(s)
    val past = Regex("""^(who|when|where) (was|were)\b|\b(first|originally|founded|born|died|invented|discovered|history|historical|ancient|medieval)\b|\b(1[0-9]{3}|20[0-1][0-9]|202[0-4])\b""").containsMatchIn(s)
    return role && !past
}

/** The fetch time for a live text answer to a time-sensitive question, or null. Never a made-up date. */
internal fun asOfForText(query: String): Freshness? = if (isTimeSensitive(query)) Freshness.now() else null
