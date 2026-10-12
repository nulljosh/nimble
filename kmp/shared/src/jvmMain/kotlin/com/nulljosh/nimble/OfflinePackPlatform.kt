package com.nulljosh.nimble

import java.text.Normalizer

// Desktop has no offline pack yet: the network is treated as up, and Settings hides the section.
actual fun networkAvailable(): Boolean = true

internal actual fun nfkdLowercase(s: String): String =
    Normalizer.normalize(s.lowercase(), Normalizer.Form.NFKD)

actual fun platformOfflinePackStore(): OfflinePackStore? = null
