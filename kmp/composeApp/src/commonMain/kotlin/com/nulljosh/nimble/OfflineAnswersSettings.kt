package com.nulljosh.nimble

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

/** The Offline answers section's state: what is on the device, or what the download is doing. */
private sealed class PackUi {
    data object Checking : PackUi()
    data class NotInstalled(val bytes: Long?) : PackUi()
    data class Downloading(val sent: Long, val total: Long) : PackUi()
    data class Ready(val count: Int, val builtAt: String) : PackUi()
    data object Failed : PackUi()
}

/** Settings: Private mode and the offline answers section. Nothing downloads until the user taps Download. */
@Composable
/** Settings. [store] is null where there is no offline pack store yet (desktop), and the offline section is left out. */
fun SettingsScreen(store: OfflinePackStore?, theme: NimbleTheme, onTheme: (NimbleTheme) -> Unit, onBack: () -> Unit, modifier: Modifier = Modifier) {
    val scope = rememberCoroutineScope()
    var ui by remember { mutableStateOf<PackUi>(PackUi.Checking) }
    var privateOn by remember { mutableStateOf(loadPrivateMode()) }

    LaunchedEffect(store) {
        if (store != null) ui = store.load()?.let { PackUi.Ready(it.count, it.builtAt) } ?: PackUi.NotInstalled(store.remoteBytes())
    }

    fun download() {
        store ?: return
        ui = PackUi.Downloading(0, -1)
        scope.launch {
            ui = try {
                val pack = store.download { sent, total -> ui = PackUi.Downloading(sent, total) }
                PackUi.Ready(pack.count, pack.builtAt)
            } catch (e: Exception) {
                PackUi.Failed
            }
        }
    }

    fun remove() {
        store ?: return
        scope.launch {
            store.remove()
            ui = PackUi.NotInstalled(store.remoteBytes())
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(theme.background)
            .safeDrawingPadding()
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Settings", color = theme.text, fontSize = 22.sp, fontWeight = FontWeight.Bold)
        }
        ToolButton("Back", theme, onBack)

        Text("Theme", color = theme.text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
        ThemeSwatches(selected = theme, onSelect = onTheme)

        Text("Private mode", color = theme.text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
        Text(
            "When on, no question leaves this device. Math and the offline answers still work.",
            color = theme.muted,
            fontSize = 15.sp,
        )
        ToolButton(if (privateOn) "Private mode: on" else "Private mode: off", theme) {
            privateOn = !privateOn
            savePrivateMode(privateOn)
        }

        if (store != null) {
        Text("Offline answers", color = theme.text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
        Text(
            "The opening lines of the 9,000 most-read Wikipedia articles. Download once, on your tap. Answers work with no network.",
            color = theme.muted,
            fontSize = 15.sp,
        )

        when (val s = ui) {
            PackUi.Checking -> Unit
            is PackUi.NotInstalled -> ToolButton(
                if (s.bytes != null) "Download (${megabytes(s.bytes)})" else "Download",
                theme,
            ) { download() }
            is PackUi.Downloading -> {
                if (s.total > 0) {
                    LinearProgressIndicator(
                        progress = { (s.sent.toFloat() / s.total).coerceIn(0f, 1f) },
                        modifier = Modifier.fillMaxWidth(),
                        color = theme.accent,
                    )
                    Text(
                        "Downloading. ${megabytes(s.sent)} of ${megabytes(s.total)}",
                        color = theme.muted,
                        fontSize = 15.sp,
                    )
                } else {
                    LinearProgressIndicator(modifier = Modifier.fillMaxWidth(), color = theme.accent)
                    Text("Downloading.", color = theme.muted, fontSize = 15.sp)
                }
            }
            is PackUi.Ready -> {
                Text(
                    "Ready. ${thousands(s.count)} articles, as of ${packAsOfLabel(s.builtAt) ?: s.builtAt}.",
                    color = theme.text,
                    fontSize = 16.sp,
                )
                Spacer(Modifier.height(4.dp))
                ToolButton("Remove", theme) { remove() }
            }
            PackUi.Failed -> {
                Text(
                    "Download failed. Check the connection and try again.",
                    color = theme.muted,
                    fontSize = 15.sp,
                )
                ToolButton("Download", theme) { download() }
            }
        }
    }
    }
}
