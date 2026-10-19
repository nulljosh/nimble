package com.nulljosh.nimble

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.UriHandler

/** Every link the app opens goes through here: http(s) only. A javascript:, file: or intent: link from a feed or a
 *  page is dropped, wherever in the UI it was tapped. Same rule as hrefOf() in docs/engine.js. */
@Composable
fun WebOnlyLinks(content: @Composable () -> Unit) {
    val system = LocalUriHandler.current
    val webOnly = remember(system) {
        object : UriHandler {
            override fun openUri(uri: String) {
                if (isWebUrl(uri)) system.openUri(uri)
            }
        }
    }
    CompositionLocalProvider(LocalUriHandler provides webOnly, content = content)
}
