package com.nulljosh.nimble

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Gates and card builders from canned bodies. No network, same cases as the Swift and JS tests. */
class CardsTest {

    // MARK: Gates

    @Test
    fun etymologyGate() {
        for (q in listOf("origin of salary", "etymology of the word salary", "where does the word salary come from?", "Root salary")) {
            assertEquals(Ask.Etymology("salary"), Cards.ask(q), q)
        }
        assertNull(Cards.ask("what is salary"))
        assertNull(Cards.ask("salary origin"))
    }

    @Test
    fun weatherGate() {
        assertEquals(Ask.Weather("Paris"), Cards.ask("weather in Paris"))
        assertEquals(Ask.Weather("Vancouver"), Cards.ask("what's the weather in Vancouver?"))
        assertEquals(Ask.Weather("Oslo"), Cards.ask("What is the weather for Oslo"))
        assertNull(Cards.ask("weather"))
        assertNull(Cards.ask("weather tomorrow"))
    }

    @Test
    fun timeGate() {
        assertEquals(Ask.Time("Tokyo"), Cards.ask("time in Tokyo"))
        assertEquals(Ask.Time("New York"), Cards.ask("what is the current time in New York?"))
        assertEquals(Ask.Time("Lima"), Cards.ask("what's the time at Lima"))
        assertNull(Cards.ask("time flies"))
        assertNull(Cards.ask("what time is it"))
    }

    @Test
    fun currencyGate() {
        assertEquals(Ask.Currency(100.0, "USD", "EUR"), Cards.ask("100 usd to eur"))
        assertEquals(Ask.Currency(2.5, "CAD", "JPY"), Cards.ask("convert 2.5 cad in jpy"))
        assertEquals(Ask.Currency(-5.0, "GBP", "USD"), Cards.ask("-5 GBP into USD?"))
        assertNull(Cards.ask("100 to eur"))
        assertNull(Cards.ask("5 dollars to euros"))
        assertNull(Cards.ask("1000 usd"))
    }

    @Test
    fun plainQuestionsAreNotCards() {
        for (q in listOf("population of canada", "2+2", "who wrote hamlet", "")) {
            assertNull(Cards.ask(q), q)
            assertTrue(!Cards.isCardQuery(q), q)
        }
    }

    // MARK: Etymology

    @Test
    fun etymologyCardNamesTheLanguage() {
        val body = """{"word":"salary","language":"en","etymology":[{"relation":"inherited","langCode":"enm","ancestor":"salarie"},{"relation":"borrowed","langCode":"la","ancestor":"salarium"}]}"""
        assertEquals(
            Card("salary", "", "Inherited from salarie, Middle English", "Wordroot", "https://wordroot.heyitsmejosh.com/#search=salary"),
            Cards.etymologyFromJson("salary", body),
        )
    }

    @Test
    fun etymologyKeepsAnUnknownLanguageCode() {
        val c = Cards.etymologyCard("thing", "thing", "inherited", "xx")
        assertEquals("Inherited from thing, xx", c.sub)
    }

    @Test
    fun etymologyMissesCleanly() {
        assertNull(Cards.etymologyFromJson("zzz", """{"word":"zzz","etymology":[]}"""))
        assertNull(Cards.etymologyFromJson("zzz", """{"error":"not found"}"""))
        assertNull(Cards.etymologyFromJson("zzz", "<html>502</html>"))
    }

    // MARK: Weather

    private val vancouver = """{"results":[{"id":6173331,"name":"Vancouver","latitude":49.24966,"longitude":-123.11934,"timezone":"America/Vancouver","country":"Canada"}]}"""

    @Test
    fun placeFromGeocodingBody() {
        val p = assertNotNull(Cards.placeFromJson(vancouver))
        assertEquals("Vancouver", p.name)
        assertEquals("Canada", p.country)
        assertEquals("America/Vancouver", p.timezone)
        assertEquals(49.24966, p.latitude)
        assertEquals(-123.11934, p.longitude)
        // An unknown place comes back with no "results" key at all.
        assertNull(Cards.placeFromJson("""{"generationtime_ms":0.4}"""))
    }

    @Test
    fun weatherCardReadsTheForecast() {
        val place = assertNotNull(Cards.placeFromJson(vancouver))
        val body = """{"current":{"time":"2026-10-01T20:00","temperature_2m":13.4,"weather_code":61,"wind_speed_10m":12.6}}"""
        assertEquals(
            Card("13", "°C", "Vancouver, Canada, rain, wind 13 km/h", "Open-Meteo", "https://open-meteo.com"),
            Cards.weatherFromJson(place, body),
        )
    }

    @Test
    fun weatherRoundingAndGaps() {
        // Half rounds up like Math.round on the web; a negative that rounds to zero is "0", not "-0".
        assertEquals("3", Cards.weatherCard("X", null, 2.5, 0, 0.0).big)
        assertEquals("0", Cards.weatherCard("X", null, -0.4, 0, 0.0).big)
        assertEquals("-8", Cards.weatherCard("X", null, -7.6, 0, 0.0).big)
        // No country and a code with no word: both drop out of the line.
        assertEquals("Oslo, wind 4 km/h", Cards.weatherCard("Oslo", null, 1.0, 99, 4.0).sub)
        assertNull(Cards.weatherFromJson(assertNotNull(Cards.placeFromJson(vancouver)), """{"error":true}"""))
    }

    // MARK: Time

    @Test
    fun timeCardUsesTheGeocodedZone() {
        val at = 1790910300000L // 2026-10-02 03:05 UTC
        assertEquals(
            Card("12:05", "Tokyo", "Friday, October 2, Asia/Tokyo", "Open-Meteo", "https://open-meteo.com"),
            Cards.timeCard("Tokyo", "Asia/Tokyo", at),
        )
        // Still the evening before in Vancouver: the day rolls with the zone.
        val van = assertNotNull(Cards.timeCard("Vancouver", "America/Vancouver", at))
        assertEquals("20:05", van.big)
        assertEquals("Thursday, October 1, America/Vancouver", van.sub)
        assertNull(Cards.timeCard("Nowhere", "Mars/Olympus", at))
    }

    // MARK: Currency

    @Test
    fun currencyCardFromFrankfurter() {
        val body = """{"amount":1.0,"base":"USD","date":"2026-10-01","rates":{"EUR":0.92}}"""
        assertEquals(
            Card("92.00", "EUR", "100 USD at today's rate", "Frankfurter", "https://frankfurter.dev"),
            Cards.currencyFromJson(100.0, "USD", "EUR", body, "Frankfurter", "https://frankfurter.dev"),
        )
    }

    @Test
    fun currencyCardFromTheFallbackShape() {
        val body = """{"result":"success","base_code":"CAD","rates":{"CAD":1,"JPY":108.5}}"""
        val c = assertNotNull(Cards.currencyFromJson(2.5, "CAD", "JPY", body, "ExchangeRate-API", "https://www.exchangerate-api.com"))
        assertEquals("271.25", c.big)
        assertEquals("2.5 CAD at today's rate", c.sub)
        assertEquals("ExchangeRate-API", c.source)
    }

    @Test
    fun currencyMissesCleanly() {
        assertNull(Cards.currencyFromJson(1.0, "USD", "ZZZ", """{"rates":{"EUR":0.9}}""", "Frankfurter", "u"))
        assertNull(Cards.currencyFromJson(1.0, "USD", "EUR", """{"rates":{"EUR":0}}""", "Frankfurter", "u"))
        assertNull(Cards.currencyFromJson(1.0, "USD", "EUR", """{"message":"not found"}""", "Frankfurter", "u"))
    }

    @Test
    fun numberFormatting() {
        assertEquals("0.50", Cards.money(0.5))
        assertEquals("1,234,567.89", Cards.money(1234567.891))
        assertEquals("2,250.00", Cards.money(2500 * 0.9))
        assertEquals("-12.30", Cards.money(-12.3))
        assertEquals("100", Cards.trim(100.0))
        assertEquals("2.5", Cards.trim(2.5))
        assertEquals("0.3", Cards.trim(0.1 + 0.2))
        assertEquals("-5", Cards.trim(-5.0))
    }

    @Test
    fun languageTableMatchesSwift() {
        assertEquals(25, Cards.langNames.size)
        assertEquals("Proto-Indo-European", Cards.langNames["ine-pro"])
        assertEquals("Middle High German", Cards.langNames["gmh"])
    }
}
