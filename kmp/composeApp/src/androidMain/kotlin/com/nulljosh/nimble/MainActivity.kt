package com.nulljosh.nimble

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.remember
import com.nulljosh.nimble.AndroidAppContext

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        AndroidAppContext.context = applicationContext
        val history = SearchHistory(PrefsHistoryStorage(this), System::currentTimeMillis)
        setContent {
            MaterialTheme {
                SearchScreen(history, voice = rememberVoice(), packStore = remember { platformOfflinePackStore() })
            }
        }
    }
}
