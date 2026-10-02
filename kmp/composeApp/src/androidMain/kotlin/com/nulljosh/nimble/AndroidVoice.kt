package com.nulljosh.nimble

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.speech.RecognizerIntent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue

/**
 * The system speech dialog through RecognizerIntent: no RECORD_AUDIO permission, since the
 * recognizer app owns the mic. Launching straight away and catching the missing-activity case
 * means no manifest <queries> entry. A phone with no recognizer simply does nothing.
 */
@Composable
fun rememberVoice(): Voice {
    var waiting by remember { mutableStateOf<((String) -> Unit)?>(null) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val heard = if (result.resultCode == Activity.RESULT_OK) {
            result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()?.trim()
        } else null
        if (!heard.isNullOrEmpty()) waiting?.invoke(heard)
        waiting = null
    }
    return remember(launcher) {
        Voice { onHeard ->
            waiting = onHeard
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_PROMPT, "Ask Nimble")
            try {
                launcher.launch(intent)
            } catch (_: ActivityNotFoundException) {
                waiting = null
            }
        }
    }
}
