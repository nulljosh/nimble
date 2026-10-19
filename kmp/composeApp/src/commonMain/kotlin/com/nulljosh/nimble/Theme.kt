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
    // The web and Swift palette: white and true black (the 2026-10-18 Apple pass). Contrast keeps pure white text.
    val background get() = if (isDark) Color.Black else Color.White
    val surface get() = if (isDark) Color(0xFF1C1C1E) else Color(0xFFF5F5F7)
    val hairline get() = if (isDark) Color(0xFF38383A) else Color(0xFFE5E5EA)
    val text get() = if (this == Contrast) Color.White else if (isDark) Color(0xFFF5F5F7) else Color(0xFF1D1D1F)
    val muted get() = if (isDark) Color(0.65f, 0.65f, 0.65f) else Color(0xFF6E6E73)
    val label get() = name
}
