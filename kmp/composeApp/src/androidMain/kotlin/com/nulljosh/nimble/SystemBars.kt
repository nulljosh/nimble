package com.nulljosh.nimble

import android.app.Activity
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

// The app draws edge to edge, so the system picks icon colour from its own dark setting: a light theme on a dark
// system got white icons on cream. Light icons only when the app's own background is dark.
@Composable
actual fun SystemBarsStyle(darkTheme: Boolean) {
    val view = LocalView.current
    SideEffect {
        val window = (view.context as? Activity)?.window ?: return@SideEffect
        WindowCompat.getInsetsController(window, view).apply {
            isAppearanceLightStatusBars = !darkTheme
            isAppearanceLightNavigationBars = !darkTheme
        }
    }
}
