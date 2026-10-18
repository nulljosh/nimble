package com.nulljosh.nimble

import androidx.compose.runtime.Composable

/** Status and navigation bar icons that contrast with the app's own theme, not the system's light or dark setting. */
@Composable
expect fun SystemBarsStyle(darkTheme: Boolean)
