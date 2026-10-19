package com.nulljosh.nimble

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.nulljosh.nimble.AndroidAppContext

class MainActivity : ComponentActivity() {
    /** Text from the share sheet ("Nimble" under Share), asked on arrival. */
    private var shared by mutableStateOf<String?>(null)
    /** Bumped on every return to the front, so a stale live answer asks again. */
    private var resumed by mutableIntStateOf(0)

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        AndroidAppContext.context = applicationContext
        shared = sharedText(intent)
        val history = SearchHistory(PrefsHistoryStorage(this), System::currentTimeMillis)
        setContent {
            MaterialTheme {
                WebOnlyLinks {
                    SearchScreen(history, voice = rememberVoice(), speech = rememberSpeech(), packStore = remember { platformOfflinePackStore() },
                        sharedQuestion = shared, resumed = resumed)
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        resumed++
    }

    // singleTop: a second share lands here instead of stacking another Nimble.
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        sharedText(intent)?.let { shared = it }
    }

    private fun sharedText(intent: Intent?): String? =
        if (intent?.action == Intent.ACTION_SEND && intent.type?.startsWith("text/") == true)
            sharedQuestion(intent.getStringExtra(Intent.EXTRA_TEXT))
        else null
}
