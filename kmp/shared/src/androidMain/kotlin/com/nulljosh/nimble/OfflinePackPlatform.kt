package com.nulljosh.nimble

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import io.ktor.client.HttpClient
import io.ktor.client.plugins.onDownload
import io.ktor.client.plugins.timeout
import io.ktor.client.request.get
import io.ktor.client.request.prepareGet
import io.ktor.client.statement.bodyAsText
import io.ktor.client.statement.readRawBytes
import java.io.File
import java.text.Normalizer
import java.util.zip.GZIPInputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** The application context, set once by MainActivity. Used for the connection check and the pack's files. */
object AndroidAppContext {
    var context: Context? = null
}

actual fun networkAvailable(): Boolean {
    val ctx = AndroidAppContext.context ?: return true
    val cm = ctx.getSystemService(ConnectivityManager::class.java) ?: return true
    val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
    return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
}

private fun prefs() = AndroidAppContext.context?.getSharedPreferences("nimble", Context.MODE_PRIVATE)

actual fun loadPrivateMode(): Boolean = prefs()?.getBoolean("private_mode", false) ?: false

actual fun savePrivateMode(on: Boolean) {
    prefs()?.edit()?.putBoolean("private_mode", on)?.apply()
}

actual fun loadThemeName(): String? = prefs()?.getString("theme", null)

actual fun saveThemeName(name: String) {
    prefs()?.edit()?.putString("theme", name)?.apply()
}

internal actual fun nfkdLowercase(s: String): String =
    Normalizer.normalize(s.lowercase(), Normalizer.Form.NFKD)

actual fun platformOfflinePackStore(): OfflinePackStore? =
    AndroidAppContext.context?.let { AndroidOfflinePackStore(it, AnswerClient.defaultClient()) }

/**
 * Keeps the decompressed pack as a JSON file in the app's private files directory. The gzip file is only read through
 * GZIPInputStream on download; nothing is written until the whole pack has parsed.
 */
class AndroidOfflinePackStore(context: Context, private val http: HttpClient) : OfflinePackStore {
    private val dir = File(context.applicationContext.filesDir, "offline-pack")
    private val file = File(dir, "wikipedia-top-v1.json")
    @Volatile private var cached: OfflinePack? = null

    override suspend fun load(): OfflinePack? {
        cached?.let { return it }
        if (!file.exists()) return null
        val pack = withContext(Dispatchers.Default) { runCatching { OfflinePack.parse(file.readText()) }.getOrNull() }
        cached = pack
        return pack
    }

    override suspend fun remoteBytes(): Long? = try {
        val text = http.get(OFFLINE_PACK_INDEX_URL).bodyAsText()
        Regex("\"bytes\"\\s*:\\s*(\\d+)").find(text)?.groupValues?.get(1)?.toLongOrNull()
    } catch (e: Exception) {
        null
    }

    override suspend fun download(onProgress: (Long, Long) -> Unit): OfflinePack {
        // A 1.9 MB body on a slow connection can outrun the client's 8 s default, so this one request gets 2 minutes.
        val gz: ByteArray = http.prepareGet(OFFLINE_PACK_URL) {
            timeout { requestTimeoutMillis = 120_000 }
            onDownload { sent, total -> onProgress(sent, total ?: -1L) }
        }.execute { it.readRawBytes() }
        return withContext(Dispatchers.Default) {
            val text = GZIPInputStream(gz.inputStream()).bufferedReader().use { it.readText() }
            val pack = OfflinePack.parse(text) ?: error("The offline pack did not parse.")
            dir.mkdirs()
            val tmp = File(dir, "wikipedia-top-v1.tmp")
            tmp.writeText(text)
            if (!tmp.renameTo(file)) { tmp.copyTo(file, overwrite = true); tmp.delete() }
            cached = pack
            pack
        }
    }

    override suspend fun remove() {
        cached = null
        withContext(Dispatchers.Default) { file.delete() }
    }
}

actual fun systemLanguage(): String = java.util.Locale.getDefault().language
