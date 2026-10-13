package com.nulljosh.nimble

/** Text shared into Nimble from another app, trimmed and cut to 300 characters (the iPhone and Mac cap). Null when empty. */
fun sharedQuestion(text: String?): String? = text?.trim()?.take(300)?.ifEmpty { null }
