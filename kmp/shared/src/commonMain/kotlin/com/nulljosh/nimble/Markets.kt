package com.nulljosh.nimble

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlin.math.abs
import kotlin.math.roundToLong

/**
 * Markets as cards: crypto prices (CoinGecko simple/price) and currency pairs (the Frankfurter series).
 * Same detection and same answers as `market()` in docs/engine.js and Sources/Models/QueryEngine+Markets.swift,
 * so a query means the same thing on every platform. Both sources are keyless. Stocks have no keyless source
 * that works, so a stock question is the calm "Quote unavailable right now" state with no request at all.
 * The AI never runs for a price question.
 */
sealed class MarketAsk {
    data class Crypto(val id: String, val name: String, val symbol: String) : MarketAsk()
    data class Pair(val from: String, val to: String) : MarketAsk()
    data class Stock(val symbol: String) : MarketAsk()
}

object Markets {

    const val QUOTE_TIMEOUT_MS = 4_000L

    private data class Coin(val id: String, val name: String, val symbol: String)

    private val coins = mapOf(
        "bitcoin" to Coin("bitcoin", "Bitcoin", "BTC"), "btc" to Coin("bitcoin", "Bitcoin", "BTC"),
        "ethereum" to Coin("ethereum", "Ethereum", "ETH"), "eth" to Coin("ethereum", "Ethereum", "ETH"),
        "solana" to Coin("solana", "Solana", "SOL"), "sol" to Coin("solana", "Solana", "SOL"),
        "dogecoin" to Coin("dogecoin", "Dogecoin", "DOGE"), "doge" to Coin("dogecoin", "Dogecoin", "DOGE"),
    )
    private const val COIN_KEYS = "bitcoin|btc|ethereum|eth|solana|sol|dogecoin|doge"

    // "bitcoin price", "price of bitcoin", "what's the current price of ethereum", or a bare "btc" (the short names only).
    private val cryptoPattern = Regex(
        "^(?:(?:what(?:'s|’s| is) the )?(?:current )?price (?:of |for )?($COIN_KEYS)|($COIN_KEYS) price|(btc|eth|sol|doge))\\s*\\??$",
        RegexOption.IGNORE_CASE,
    )

    // "100 usd to eur" is an amount. "eur to usd" and "eur to usd rate" have no amount: those are a pair quote.
    private val pairPattern = Regex(
        "^(?:convert\\s+)?(?:(-?\\d+(?:\\.\\d+)?)\\s*)?([a-z]{3})\\s+(?:to|in|into|as)\\s+([a-z]{3})(\\s+rate)?\\??$",
        RegexOption.IGNORE_CASE,
    )
    private val currencies = setOf(
        "USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "CNY", "INR", "MXN", "BRL", "KRW", "SEK", "NOK", "DKK", "NZD",
        "SGD", "HKD", "ZAR", "TRY", "PLN", "CZK", "HUF", "ILS", "THB", "PHP", "IDR", "MYR", "ISK", "RON", "BGN",
    )

    // "AAPL", "$AAPL", "AAPL stock", "stock price of MSFT", "aapl price". A bare word needs the capitals (so "who is apple" never matches).
    private val stockPattern = Regex(
        "^(?:(?:what(?:'s|’s| is) the )?(?:stock )?(?:price|quote) (?:of |for )?)?\\$?([A-Za-z]{1,5})(?: (?:stock|stock price|share price|shares?|price|quote))?\\s*\\??$",
        RegexOption.IGNORE_CASE,
    )
    private val capsShape = Regex("^\\$?[A-Z]{2,5}$")

    // Capitals that are words or acronyms: a bare "AI" or "US" is never a stock lookup.
    private val notTicker = setOf(
        "AI", "US", "UK", "EU", "OK", "TV", "IT", "ID", "PC", "CEO", "CFO", "NASA", "USA", "GDP", "CPU", "GPU", "API", "URL",
        "DNA", "HTML", "CSS", "JS", "FAQ", "NYC", "UN", "OR", "AND", "THE", "ARE", "NOT", "ALL", "ANY", "NEW", "CAN", "PDF",
        "SMS", "VPN", "RAM", "SSD", "USB", "TBD", "WHO", "HOW", "WHY", "YES", "NO", "DJ", "MP", "PM", "AM", "TO", "OF", "IN",
        "IS", "ON", "AT", "BY", "DO", "GO", "UP",
    )

    /** The market question a query asks, or null when it is not one (math, normal questions, plain words). */
    fun ask(input: String): MarketAsk? {
        val q = input.trim()
        cryptoPattern.find(q)?.let { m ->
            val key = m.groups.drop(1).firstNotNullOfOrNull { it?.value }
            key?.lowercase()?.let { coins[it] }?.let { return MarketAsk.Crypto(it.id, it.name, it.symbol) }
        }
        pairAsk(q)?.let { return it }
        stockSymbol(q)?.let { return MarketAsk.Stock(it) }
        return null
    }

    /** "eur to usd", "eur to usd rate": both codes must be currencies. Amounts ("100 usd to eur") are not pairs. */
    internal fun pairAsk(query: String): MarketAsk.Pair? {
        val m = pairPattern.find(query.trim()) ?: return null
        if (m.groups[1] != null) return null
        val from = m.groupValues[2].uppercase()
        val to = m.groupValues[3].uppercase()
        if (from !in currencies || to !in currencies) return null
        return MarketAsk.Pair(from, to)
    }

    /** The ticker in a stock question, uppercased, or null. Math and ordinary questions never match. */
    internal fun stockSymbol(query: String): String? {
        val s = query.trim()
        val m = stockPattern.find(s) ?: return null
        val sym = m.groupValues[1]
        val bare = s == sym || s == "$" + sym
        if (bare && !(capsShape.matches(s) && sym !in notTicker)) return null
        return sym.uppercase()
    }

    /** "Up 0.56% in the last 24 hours", "Down 1.20% on Oct 9", "Flat today". Words carry the direction, not colour. */
    fun changeText(pct: Double?, whenText: String): String {
        if (pct == null || pct.isNaN() || pct.isInfinite()) return ""
        val units = (abs(pct) * 100).roundToLong()
        if (units == 0L) return "Flat $whenText"
        return (if (pct > 0) "Up " else "Down ") + fixed(units, 2) + "% " + whenText
    }

    /** Dollars: two decimals, four when the price is under a dollar, thousands separated. */
    fun usd(n: Double): String {
        val decimals = if (n < 1) 4 else 2
        val scale = if (decimals == 4) 10_000L else 100L
        val units = (abs(n) * scale).roundToLong()
        val whole = (units / scale).toString().reversed().chunked(3).joinToString(",").reversed()
        val frac = (units % scale).toString().padStart(decimals, '0').trimEnd('0').padEnd(2, '0')
        return (if (n < 0 && units > 0) "-$" else "$") + whole + "." + frac
    }

    // A fixed-point number from scaled integer units: 0.5632 at two decimals is 56 units -> "0.56".
    private fun fixed(units: Long, decimals: Int): String {
        var scale = 1L
        repeat(decimals) { scale *= 10 }
        return (units / scale).toString() + "." + (units % scale).toString().padStart(decimals, '0')
    }

    /** A value at a fixed number of decimals, the way "%.4f" prints it. */
    internal fun decimals(v: Double, digits: Int): String {
        var scale = 1L
        repeat(digits) { scale *= 10 }
        val units = (abs(v) * scale).roundToLong()
        return (if (v < 0 && units > 0) "-" else "") + fixed(units, digits)
    }

    /**
     * The market answer for a question. Every market question gets one, including a failed quote, which is the
     * calm state (big null) and never a number we did not get. [fetch] returns a 200 body or null.
     */
    suspend fun quote(ask: MarketAsk, now: Long = Freshness.now().epochMillis, fetch: suspend (String) -> String?): Answer.Market =
        when (ask) {
            is MarketAsk.Crypto -> cryptoQuote(ask, fetch)
            is MarketAsk.Pair -> pairQuote(ask, now, fetch)
            is MarketAsk.Stock -> stockQuote(ask.symbol)
        }

    private suspend fun cryptoQuote(ask: MarketAsk.Crypto, fetch: suspend (String) -> String?): Answer.Market {
        val title = "${ask.name} (${ask.symbol})"
        val source = "CoinGecko"
        val url = "https://www.coingecko.com"
        val body = fetch(
            "https://api.coingecko.com/api/v3/simple/price?ids=${ask.id}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true"
        )
        val q = body?.let { parse(it) }?.get(ask.id) as? JsonObject
        val price = q?.get("usd").num()
        if (price == null || price.isNaN() || price.isInfinite()) {
            return Answer.Market(title, null, null, source, url, null)
        }
        val change = changeText(q?.get("usd_24h_change").num(), "in the last 24 hours").ifEmpty { null }
        val priced = q?.get("last_updated_at").num()?.let { Freshness((it * 1000).toLong(), false) }
            ?: Freshness.now()
        return Answer.Market(title, usd(price), change, source, url, priced)
    }

    private suspend fun pairQuote(ask: MarketAsk.Pair, now: Long, fetch: suspend (String) -> String?): Answer.Market {
        val title = "${ask.from} to ${ask.to}"
        val source = "Frankfurter"
        val url = "https://frankfurter.dev"
        val start = isoDayUtc(now - 14 * 86_400_000L)
        val body = fetch("https://api.frankfurter.dev/v1/$start..?base=${ask.from}&symbols=${ask.to}")
        val rates = (body?.let { parse(it) }?.get("rates") as? JsonObject)
        // The last two days with a rate give the value and the day's change. Fewer than two is unavailable.
        val days = rates?.keys?.filter { rates.get(it).rateFor(ask.to) != null }?.sorted() ?: emptyList()
        if (days.size < 2) return Answer.Market(title, null, null, source, url, null)
        val lastDay = days[days.size - 1]
        val prevDay = days[days.size - 2]
        val last = rates?.get(lastDay).rateFor(ask.to) ?: return Answer.Market(title, null, null, source, url, null)
        val prev = rates?.get(prevDay).rateFor(ask.to) ?: return Answer.Market(title, null, null, source, url, null)
        val day = utcDayMillis(lastDay) ?: return Answer.Market(title, null, null, source, url, null)
        if (prev <= 0) return Answer.Market(title, null, null, source, url, null)
        val pct = (last - prev) / prev * 100
        val dayFresh = Freshness(day, true)
        return Answer.Market(
            title,
            decimals(last, 4) + " " + ask.to,
            changeText(pct, "on " + dayFresh.label()).ifEmpty { null },
            source,
            url,
            dayFresh,
        )
    }

    /** Stocks: no keyless source works, so no request goes out. The calm state, never a made-up price. */
    private fun stockQuote(sym: String): Answer.Market =
        Answer.Market(sym, null, null, "Stooq", "https://stooq.com/q/?s=${sym.lowercase()}.us", null)

    // MARK: JSON helpers (lenient, a bad body is just "no quote")

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private fun parse(text: String): JsonObject? = try { json.parseToJsonElement(text) as? JsonObject } catch (_: Exception) { null }

    private fun JsonElement?.num(): Double? = (this as? JsonPrimitive)?.doubleOrNull

    private fun JsonElement?.rateFor(code: String): Double? =
        ((this as? JsonObject)?.get(code)).num()?.takeIf { it.isFinite() }
}
