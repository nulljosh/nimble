package com.nulljosh.nimble

import java.util.Locale
import kotlin.test.Test
import kotlin.test.assertEquals

class I18nJvmTest {
    private fun inLocale(l: Locale, block: () -> Unit) {
        val old = Locale.getDefault()
        Locale.setDefault(l)
        try { block() } finally { Locale.setDefault(old) }
    }

    @Test
    fun translatesToTheDeviceLanguageAndFillsSlots() = inLocale(Locale.FRENCH) {
        assertEquals("Annuler", tr("Cancel"))
        assertEquals("Ouvrir ESPN", tr("Open {s}", "s" to "ESPN"))
        assertEquals("Téléchargement. 1 sur 2", tr("Downloading. {a} of {b}", "a" to "1", "b" to "2"))
    }

    @Test
    fun englishAndUnknownStringsComeBackAsWritten() {
        inLocale(Locale.ENGLISH) { assertEquals("Cancel", tr("Cancel")) }
        inLocale(Locale.FRENCH) { assertEquals("Not in the catalog", tr("Not in the catalog")) }
        inLocale(Locale("sv")) { assertEquals("Cancel", tr("Cancel")) } // a language we do not ship
    }

    @Test
    fun everyShippedLanguageWorks() {
        inLocale(Locale.SIMPLIFIED_CHINESE) { assertEquals("取消", tr("Cancel")) }
        inLocale(Locale("pa")) { assertEquals("ਰੱਦ ਕਰੋ", tr("Cancel")) }
        inLocale(Locale.GERMAN) { assertEquals("Abbrechen", tr("Cancel")) }
        inLocale(Locale("pt")) { assertEquals("Cancelar", tr("Cancel")) }
        inLocale(Locale("hi")) { assertEquals("रद्द करें", tr("Cancel")) }
        inLocale(Locale.JAPANESE) { assertEquals("キャンセル", tr("Cancel")) }
    }
}
