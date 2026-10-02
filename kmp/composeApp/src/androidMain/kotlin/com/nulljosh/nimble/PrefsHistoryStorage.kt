package com.nulljosh.nimble

import android.content.Context

/** Android: private SharedPreferences, so the history stays inside the app's sandbox. */
class PrefsHistoryStorage(context: Context) : HistoryStorage {
    private val prefs = context.applicationContext.getSharedPreferences("nimble", Context.MODE_PRIVATE)

    override fun read(): String = prefs.getString("history", "") ?: ""

    override fun write(text: String) {
        prefs.edit().putString("history", text).apply()
    }
}
