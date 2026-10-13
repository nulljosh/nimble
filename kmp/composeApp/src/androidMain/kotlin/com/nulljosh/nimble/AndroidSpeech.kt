package com.nulljosh.nimble

import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext

/** Android's own TextToSpeech, on the device. Shut down when the screen leaves. */
@Composable
fun rememberSpeech(): Speech {
    val context = LocalContext.current
    val main = remember { Handler(Looper.getMainLooper()) }
    var pending: (() -> Unit)? = null
    val tts = remember { TextToSpeech(context.applicationContext) {} }
    DisposableEffect(tts) {
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(id: String?) {}
            override fun onDone(id: String?) { main.post { pending?.invoke(); pending = null } }
            @Deprecated("Deprecated in Java")
            override fun onError(id: String?) { main.post { pending?.invoke(); pending = null } }
        })
        onDispose { tts.stop(); tts.shutdown() }
    }
    return remember(tts) {
        Speech { text, onDone ->
            tts.stop()
            pending?.invoke()
            pending = null
            if (text == null) return@Speech
            pending = onDone
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "nimble-answer")
        }
    }
}
