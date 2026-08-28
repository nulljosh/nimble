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
    Contrast(Color.White);

    val isDark get() = this == Contrast
    val background get() = if (isDark) Color.Black else Color.White
    val text get() = if (isDark) Color.White else Color(0.1f, 0.1f, 0.1f)
    val muted get() = if (isDark) Color(0.65f, 0.65f, 0.65f) else Color(0.45f, 0.45f, 0.45f)
    val label get() = name
}
