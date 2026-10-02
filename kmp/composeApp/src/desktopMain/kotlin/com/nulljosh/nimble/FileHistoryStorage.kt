package com.nulljosh.nimble

import java.io.File

/** Windows, Mac and Linux desktop: a small text file in ~/.nimble, written atomically. */
class FileHistoryStorage(
    private val file: File = File(System.getProperty("user.home"), ".nimble/history.txt"),
) : HistoryStorage {
    override fun read(): String = if (file.isFile) file.readText() else ""

    override fun write(text: String) {
        file.parentFile?.mkdirs()
        val tmp = File(file.path + ".tmp")
        tmp.writeText(text)
        if (!tmp.renameTo(file)) {
            file.writeText(text)
            tmp.delete()
        }
    }
}
