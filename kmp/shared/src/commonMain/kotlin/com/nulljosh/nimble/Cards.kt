package com.nulljosh.nimble

import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.encodeURLParameter
import io.ktor.http.encodeURLPathPart
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlin.coroutines.cancellation.CancellationException
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlin.math.roundToLong

/** One big number, a small label under it, one quiet line, and where it came from. */
data class Card(val big: String, val unit: String, val sub: String, val source: String, val url: String)

/** Which card a question is asking for. A null from [Cards.ask] means "not this kind of question". */
sealed class Ask {
    data class Etymology(val word: String) : Ask()
    data class Weather(val place: String) : Ask()
    data class Time(val place: String) : Ask()
    data class Currency(val amount: Double, val from: String, val to: String) : Ask()
}

/** A geocoded place, the one lookup weather and local time share. */
data class Place(val name: String, val country: String?, val latitude: Double, val longitude: Double, val timezone: String?)

/** Wall clock in a zone: "14:05" and "Friday, October 2". */
class ZonedClock(val time: String, val day: String)

/** java.time on both JVM targets; null for a zone id the platform does not know. epochMillis null means now. */
internal expect fun zonedClock(zoneId: String, epochMillis: Long? = null): ZonedClock?

/**
 * Etymology, weather, local time and currency as cards. Same gates, same free sources
 * (wordroot, Open-Meteo, Frankfurter with the open.er-api fallback) and same wording as
 * docs/engine.js and Sources/Models/QueryEngine+Cards.swift. The builders are pure so the
 * tests need no network.
 */
object Cards {

    private val etymologyGate = Regex("""^(?:origin|etymology|root|where\s+does\s+the\s+word)\s+(?:of\s+)?(?:the\s+word\s+)?(.+?)(?:\s+come\s+from)?\s*\??$""", RegexOption.IGNORE_CASE)
    private val weatherGate = Regex("""^(?:what(?:'s| is) the )?weather (?:in|for|at) (.+?)\??$""", RegexOption.IGNORE_CASE)
    private val timeGate = Regex("""^(?:what(?:'s| is) the )?(?:current )?time (?:in|at) (.+?)\??$""", RegexOption.IGNORE_CASE)
    private val currencyGate = Regex("""^(?:convert\s+)?(-?\d+(?:\.\d+)?)\s*([a-z]{3})\s+(?:to|in|into|as)\s+([a-z]{3})\??$""", RegexOption.IGNORE_CASE)

    // MARK: Routing, in the web order: etymology, weather, time, currency.

    fun ask(input: String): Ask? {
        val q = input.trim()
        etymologyGate.find(q)?.let { return Ask.Etymology(it.groupValues[1].trim()) }
        weatherGate.find(q)?.let { return Ask.Weather(it.groupValues[1]) }
        timeGate.find(q)?.let { return Ask.Time(it.groupValues[1]) }
        currencyGate.find(q)?.let { m ->
            val amount = m.groupValues[1].toDoubleOrNull() ?: return null
            return Ask.Currency(amount, m.groupValues[2].uppercase(), m.groupValues[3].uppercase())
        }
        return null
    }

    fun isCardQuery(input: String): Boolean = ask(input) != null

    // MARK: Builders

    val langNames: Map<String, String> = mapOf(
        "enm" to "Middle English", "ang" to "Old English", "la" to "Latin", "fr" to "French",
        "fro" to "Old French", "frm" to "Middle French", "grc" to "Ancient Greek", "el" to "Greek",
        "non" to "Old Norse", "de" to "German", "gmh" to "Middle High German", "goh" to "Old High German",
        "nl" to "Dutch", "dum" to "Middle Dutch", "it" to "Italian", "es" to "Spanish", "pt" to "Portuguese",
        "ar" to "Arabic", "he" to "Hebrew", "sa" to "Sanskrit", "ja" to "Japanese", "zh" to "Chinese",
        "gem-pro" to "Proto-Germanic", "ine-pro" to "Proto-Indo-European", "itc-pro" to "Proto-Italic",
    )

    private val sky = mapOf(
        0 to "clear", 1 to "mostly clear", 2 to "partly cloudy", 3 to "overcast", 45 to "fog", 48 to "fog",
        51 to "drizzle", 53 to "drizzle", 55 to "drizzle", 61 to "rain", 63 to "rain", 65 to "heavy rain",
        71 to "snow", 73 to "snow", 75 to "heavy snow", 80 to "showers", 81 to "showers", 82 to "heavy showers",
        95 to "thunderstorm",
    )

    fun etymologyCard(word: String, ancestor: String, relation: String, langCode: String): Card {
        val relationCapitalized = relation.replaceFirstChar { it.uppercase() }
        // The language belongs in the sub line as a name, not inline after the word as a code.
        val lang = langNames[langCode] ?: langCode
        val sub = "$relationCapitalized from $ancestor" + if (lang.isEmpty()) "" else ", $lang"
        return Card(word, "", sub, "Wordroot", "https://wordroot.heyitsmejosh.com/#search=${word.encodeURLParameter()}")
    }

    fun weatherCard(place: String, country: String?, temp: Double, code: Int?, wind: Double): Card {
        val parts = listOfNotNull(place, country, code?.let { sky[it] }, "wind ${wind.roundToInt()} km/h").filter { it.isNotEmpty() }
        return Card(temp.roundToInt().toString(), "°C", parts.joinToString(", "), "Open-Meteo", "https://open-meteo.com")
    }

    fun currencyCard(amount: Double, from: String, to: String, rate: Double, source: String, url: String): Card =
        Card(money(amount * rate), to, "${trim(amount)} $from at today's rate", source, url)

    fun timeCard(place: String, zoneId: String, epochMillis: Long? = null): Card? {
        val clock = zonedClock(zoneId, epochMillis) ?: return null
        return Card(clock.time, place, "${clock.day}, $zoneId", "Open-Meteo", "https://open-meteo.com")
    }

    // MARK: Builders from the raw API bodies

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private fun parse(text: String): JsonObject? = try { json.parseToJsonElement(text) as? JsonObject } catch (_: Exception) { null }
    private fun JsonElement?.str(): String? = (this as? JsonPrimitive)?.takeIf { it.isString }?.content
    private fun JsonElement?.num(): Double? = (this as? JsonPrimitive)?.doubleOrNull

    /** wordroot: {"word", "language", "etymology": [{"relation", "langCode", "ancestor"}]}. */
    fun etymologyFromJson(word: String, body: String): Card? {
        val first = (parse(body)?.get("etymology") as? JsonArray)?.firstOrNull() as? JsonObject ?: return null
        return etymologyCard(
            word,
            ancestor = first["ancestor"].str() ?: return null,
            relation = first["relation"].str() ?: return null,
            langCode = first["langCode"].str() ?: "",
        )
    }

    /** Open-Meteo geocoding: the first of "results", or null when the place is unknown. */
    fun placeFromJson(body: String): Place? {
        val p = (parse(body)?.get("results") as? JsonArray)?.firstOrNull() as? JsonObject ?: return null
        return Place(
            name = p["name"].str() ?: return null,
            country = p["country"].str(),
            latitude = p["latitude"].num() ?: return null,
            longitude = p["longitude"].num() ?: return null,
            timezone = p["timezone"].str(),
        )
    }

    /** Open-Meteo forecast: "current" holds temperature_2m, weather_code and wind_speed_10m. */
    fun weatherFromJson(place: Place, body: String): Card? {
        val c = parse(body)?.get("current") as? JsonObject ?: return null
        return weatherCard(
            place.name, place.country,
            temp = c["temperature_2m"].num() ?: return null,
            code = c["weather_code"].num()?.toInt(),
            wind = c["wind_speed_10m"].num() ?: return null,
        )
    }

    /** Frankfurter and open.er-api share the shape {"rates": {"EUR": 0.92}}. */
    fun currencyFromJson(amount: Double, from: String, to: String, body: String, source: String, url: String): Card? {
        val rate = (parse(body)?.get("rates") as? JsonObject)?.get(to).num()?.takeIf { it != 0.0 } ?: return null
        return currencyCard(amount, from, to, rate, source, url)
    }

    // MARK: Number formatting (no String.format in common code)

    /** "1,234.50": two decimals, thousands separated. */
    internal fun money(v: Double): String {
        val cents = (abs(v) * 100).roundToLong()
        val whole = (cents / 100).toString().reversed().chunked(3).joinToString(",").reversed()
        return (if (v < 0 && cents > 0) "-" else "") + whole + "." + (cents % 100).toString().padStart(2, '0')
    }

    /** "100", "2.5": up to six decimals, trailing zeros dropped, same as the Swift trim. */
    internal fun trim(v: Double): String {
        val micro = (abs(v) * 1_000_000).roundToLong()
        val frac = (micro % 1_000_000).toString().padStart(6, '0').trimEnd('0')
        return (if (v < 0 && micro > 0) "-" else "") + (micro / 1_000_000) + if (frac.isEmpty()) "" else ".$frac"
    }
}

/** Runs the four lookups. Every failure is a null, so the answer chain just carries on. */
class CardClient(private val http: HttpClient) {

    suspend fun card(input: String): Card? = when (val a = Cards.ask(input)) {
        is Ask.Etymology -> etymology(a.word)
        is Ask.Weather -> weather(a.place)
        is Ask.Time -> time(a.place)
        is Ask.Currency -> currency(a.amount, a.from, a.to)
        null -> null
    }

    private suspend fun fetch(url: String): String? = try {
        val res = http.get(url)
        if (res.status.value == 200) res.bodyAsText() else null
    } catch (e: CancellationException) {
        throw e
    } catch (_: Throwable) {
        null
    }

    private suspend fun geocode(place: String): Place? =
        fetch("https://geocoding-api.open-meteo.com/v1/search?name=${place.encodeURLParameter()}&count=1&language=en")
            ?.let(Cards::placeFromJson)

    private suspend fun etymology(word: String): Card? {
        val body = fetch("https://wordroot.heyitsmejosh.com/api/etymology/${word.lowercase().encodeURLPathPart()}") ?: return null
        return Cards.etymologyFromJson(word, body)
    }

    private suspend fun weather(place: String): Card? {
        val loc = geocode(place) ?: return null
        val body = fetch(
            "https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}" +
                "&current=temperature_2m,weather_code,wind_speed_10m"
        ) ?: return null
        return Cards.weatherFromJson(loc, body)
    }

    private suspend fun time(place: String): Card? {
        val loc = geocode(place) ?: return null
        return Cards.timeCard(loc.name, loc.timezone ?: return null)
    }

    private suspend fun currency(amount: Double, from: String, to: String): Card? {
        fetch("https://api.frankfurter.dev/v1/latest?base=$from&symbols=$to")?.let { body ->
            Cards.currencyFromJson(amount, from, to, body, "Frankfurter", "https://frankfurter.dev")?.let { return it }
        }
        val body = fetch("https://open.er-api.com/v6/latest/$from") ?: return null
        return Cards.currencyFromJson(amount, from, to, body, "ExchangeRate-API", "https://www.exchangerate-api.com")
    }
}
