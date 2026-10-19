package com.nulljosh.nimble

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/**
 * Markets and freshness, offline. Mirrors Tests/MarketTests.swift and test/markets.test.js: the fetch is a fake
 * that answers per host and records every host it was asked for, so "a stock question sends no request" is an
 * empty host list. No ktor mock engine: the client is the lambda seam [Markets.quote] takes.
 */
class MarketsTest {

    /** Answers per host. A null route is a failed request (no body), like a non-200 in production. */
    private class FakeHttp(private val routes: Map<String, String?>) {
        val hosts = mutableListOf<String>()
        val fetch: suspend (String) -> String? = { url ->
            val host = url.substringAfter("://").substringBefore("/")
            hosts.add(host)
            routes[host]
        }
    }

    private val coingecko = """{"bitcoin":{"usd":83405,"usd_24h_change":0.5632,"last_updated_at":1791800345}}"""
    private val frankfurterPair = """{"base":"EUR","rates":{"2026-10-08":{"USD":1.08},"2026-10-09":{"USD":1.0812}}}"""
    private val now = 1791800345_000L

    // MARK: Detection

    @Test
    fun marketQueriesAreRecognised() {
        assertEquals(MarketAsk.Crypto("bitcoin", "Bitcoin", "BTC"), Markets.ask("bitcoin price"))
        assertEquals(MarketAsk.Crypto("bitcoin", "Bitcoin", "BTC"), Markets.ask("BTC"))
        assertEquals(MarketAsk.Crypto("bitcoin", "Bitcoin", "BTC"), Markets.ask("price of bitcoin"))
        assertEquals(MarketAsk.Crypto("ethereum", "Ethereum", "ETH"), Markets.ask("what's the current price of ethereum"))
        assertEquals(MarketAsk.Crypto("ethereum", "Ethereum", "ETH"), Markets.ask("eth"))
        assertEquals(MarketAsk.Pair("EUR", "USD"), Markets.ask("eur to usd"))
        assertEquals(MarketAsk.Pair("EUR", "USD"), Markets.ask("eur to usd rate"))
        assertEquals(MarketAsk.Stock("AAPL"), Markets.ask("AAPL"))
        assertEquals(MarketAsk.Stock("AAPL"), Markets.ask("AAPL stock"))
        assertEquals(MarketAsk.Stock("TSLA"), Markets.ask("\$TSLA"))
        assertEquals(MarketAsk.Stock("MSFT"), Markets.ask("stock price of MSFT"))
    }

    @Test
    fun stockSymbolTickersInMathAndNormalQuestionsOut() {
        for (q in listOf("AAPL", "AAPL stock", "\$TSLA", "aapl price", "stock price of MSFT", "AAPL stock price", "what is the price of AAPL")) {
            assertNotNull(Markets.stockSymbol(q), q)
        }
        for (q in listOf("a+b", "who is apple", "what is apple", "is apple good", "apple", "aapl", "AI", "US", "price", "2 + 2", "5 miles to km")) {
            assertNull(Markets.stockSymbol(q), q)
        }
    }

    @Test
    fun normalQuestionsAreNotMarkets() {
        for (q in listOf("a+b", "who is apple", "what is apple", "is apple good", "apple", "aapl", "AI", "US", "price", "2 + 2", "5 miles to km", "what is bitcoin", "bitcoin", "the to and")) {
            assertNull(Markets.ask(q), q)
        }
        assertNull(Markets.pairAsk("100 usd to eur"))
        assertNull(Markets.pairAsk("the to and"))
        assertNull(Markets.pairAsk("km to in"))
    }

    @Test
    fun marketQuestionsSendNoRequestWhenTheyAreNotMarkets() = runBlockingTest {
        val http = FakeHttp(emptyMap())
        for (q in listOf("a+b", "who is apple", "what is bitcoin", "bitcoin", "is apple good", "the to and")) {
            assertNull(Markets.ask(q), q)
        }
        assertEquals(emptyList(), http.hosts)
    }

    // MARK: Crypto

    @Test
    fun bitcoinPriceFromCoinGecko() = runBlockingTest {
        val http = FakeHttp(mapOf("api.coingecko.com" to coingecko))
        val a = Markets.quote(MarketAsk.Crypto("bitcoin", "Bitcoin", "BTC"), now, http.fetch)
        assertEquals("Bitcoin (BTC)", a.title)
        assertEquals("$83,405.00", a.big)
        assertEquals("Up 0.56% in the last 24 hours", a.change)
        assertEquals("CoinGecko", a.source)
        assertEquals("https://www.coingecko.com", a.url)
        assertEquals(Freshness(1791800345_000L, false), a.asOf)
        assertEquals(listOf("api.coingecko.com"), http.hosts)
    }

    @Test
    fun failedCryptoQuoteIsTheCalmStateNotANumber() = runBlockingTest {
        val http = FakeHttp(mapOf("api.coingecko.com" to null))
        val a = Markets.quote(MarketAsk.Crypto("bitcoin", "Bitcoin", "BTC"), now, http.fetch)
        assertEquals("Bitcoin (BTC)", a.title)
        assertNull(a.big)
        assertNull(a.change)
    }

    @Test
    fun cryptoBodyWithoutUsdPriceIsUnavailableNotZero() = runBlockingTest {
        val http = FakeHttp(mapOf("api.coingecko.com" to """{"bitcoin":{"eur":70000}}"""))
        val a = Markets.quote(MarketAsk.Crypto("bitcoin", "Bitcoin", "BTC"), now, http.fetch)
        assertNull(a.big)
    }

    // MARK: Stock

    @Test
    fun stockFromTheProxyQuoteNamedWithTheDaysChange() = runBlockingTest {
        val http = FakeHttp(mapOf("nimble-answers.trommatic.workers.dev" to """{"symbol":"AAPL","name":"Apple Inc.","price":205,"currency":"USD","pct":2.5,"ts":1791576000}"""))
        val a = Markets.quote(MarketAsk.Stock("APPLE"), now, http.fetch)
        assertEquals("Apple Inc. (AAPL)", a.title)
        assertEquals("$205.00", a.big)
        assertEquals("Up 2.50% today", a.change)
        assertEquals("Yahoo Finance", a.source)
    }

    @Test
    fun stockWithoutAPriceIsUnavailableNeverMadeUp() = runBlockingTest {
        val http = FakeHttp(mapOf("nimble-answers.trommatic.workers.dev" to """{"error":"no quote"}"""))
        val a = Markets.quote(MarketAsk.Stock("AAPL"), now, http.fetch)
        assertEquals("AAPL", a.title)
        assertNull(a.big, "never a made-up price")
        assertNull(a.asOf)
    }

    // MARK: Pair

    @Test
    fun pairFromTheFrankfurterSeriesWithTheDaysChange() = runBlockingTest {
        val http = FakeHttp(mapOf("api.frankfurter.dev" to frankfurterPair))
        val a = Markets.quote(MarketAsk.Pair("EUR", "USD"), now, http.fetch)
        assertEquals("EUR to USD", a.title)
        assertEquals("1.0812 USD", a.big)
        assertEquals("Up 0.11% on Oct 9", a.change)
        assertEquals("Frankfurter", a.source)
        assertEquals("Oct 9", a.asOf?.label())
        assertEquals(true, a.asOf?.isDay)
        assertEquals(listOf("api.frankfurter.dev"), http.hosts)
    }

    @Test
    fun pairNeedsTwoDaysOfRates() = runBlockingTest {
        val oneDay = """{"rates":{"2026-10-09":{"USD":1.0812}}}"""
        val a = Markets.quote(MarketAsk.Pair("EUR", "USD"), now, FakeHttp(mapOf("api.frankfurter.dev" to oneDay)).fetch)
        assertNull(a.big)
    }

    @Test
    fun pairFailureIsUnavailable() = runBlockingTest {
        val a = Markets.quote(MarketAsk.Pair("EUR", "USD"), now, FakeHttp(mapOf("api.frankfurter.dev" to null)).fetch)
        assertNull(a.big)
        assertNull(a.change)
    }

    @Test
    fun amountConversionTakesTheRatesDateAsDayFreshness() {
        val body = """{"amount":1.0,"base":"USD","date":"2026-10-09","rates":{"EUR":0.92}}"""
        val card = Cards.currencyFromJson(100.0, "USD", "EUR", body, "Frankfurter", "https://frankfurter.dev")
        assertEquals("92.00", card?.big)
        assertEquals("Oct 9", card?.asOf?.label())
        assertEquals(true, card?.asOf?.isDay)
    }

    // MARK: Change, money and freshness

    @Test
    fun changeIsWordsNotColour() {
        assertEquals("Down 1.20% today", Markets.changeText(-1.2, "today"))
        assertEquals("Flat today", Markets.changeText(0.004, "today"))
        assertEquals("", Markets.changeText(null, "today"))
        assertEquals("", Markets.changeText(Double.NaN, "today"))
    }

    @Test
    fun usdKeepsTwoDecimalsAndFourUnderADollar() {
        assertEquals("$83,405.00", Markets.usd(83405.0))
        assertEquals("$0.1234", Markets.usd(0.1234))
        assertEquals("$1.50", Markets.usd(1.5))
    }

    @Test
    fun dailyFreshnessIsTheDayOnly() {
        val day = utcDayMillis("2026-10-09")
        assertNotNull(day)
        assertEquals("Oct 9", Freshness(day, true).label())
        assertEquals("2026-10-09", isoDayUtc(day))
        assertEquals("2028-02-29", isoDayUtc(utcDayMillis("2028-02-29")!!))
    }

    @Test
    fun momentFreshnessIsTimeInTheZoneItIsGiven() {
        val moment = Freshness(now, false)
        assertEquals("Oct 12, 10:19 am", moment.label("UTC"))
        assertEquals("Oct 12, 3:19 am", moment.label("America/Vancouver"))
    }
}
