package com.nulljosh.nimble

import androidx.compose.ui.graphics.Color

/** The 8 themes, RGB values lifted from NimbleTheme in Sources/Models/AppState.swift. */
enum class NimbleTheme(val accent: Color) {
    Orange(Color(1.0f, 0.55f, 0.07f)),
    Red(Color(0.86f, 0f, 0f)),
    Yellow(Color(1.0f, 0.79f, 0.19f)),
    Green(Color(0.46f, 0.75f, 0.13f)),
    Blue(Color(0.16f, 0.49f, 0.91f)),
    Purple(Color(0.38f, 0.02f, 0.69f)),
    Pink(Color(0.82f, 0.02f, 0.63f)),
    Contrast(Color.White),
    // Not a swatch: the start theme when the system is dark (brand yellow on near-black).
    Night(Color(1.0f, 0.79f, 0.19f));

    val isDark get() = this == Contrast || this == Night
    // The web and Swift palette: warm cream paper, warm ink. Contrast is the true-black option.
    val background get() = if (this == Contrast) Color.Black else if (this == Night) Color(0xFF1C1A17) else Color(0xFFF5F0E4)
    val surface get() = if (isDark) Color(0xFF1C1C1E) else Color(0xFFEBE4D3)
    val hairline get() = if (isDark) Color(0xFF3A352E) else Color(0xFFDCD2BD)
    val text get() = if (isDark) Color.White else Color(0xFF1F1B16)
    val muted get() = if (isDark) Color(0.65f, 0.65f, 0.65f) else Color(0xFF6B6559)
    val label get() = name
}
