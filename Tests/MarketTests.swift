import XCTest
@testable import Nimble

/// Answers the market requests offline. Every host is recorded, so a test can show which requests went out
/// (a stock question sends none). Mirrors the fetch stub in test/markets.test.js.
final class MarketStub: URLProtocol {
    struct Reply {
        let status: Int
        let body: String
        var error: Error? = nil
    }

    private static let lock = NSLock()
    nonisolated(unsafe) private static var replies: [String: Reply] = [:]
    nonisolated(unsafe) private static var hosts: [String] = []

    static func reset(_ routes: [String: Reply]) {
        lock.lock(); defer { lock.unlock() }
        replies = routes
        hosts = []
    }

    static func requestedHosts() -> [String] {
        lock.lock(); defer { lock.unlock() }
        return hosts
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let host = request.url?.host ?? ""
        MarketStub.lock.lock()
        MarketStub.hosts.append(host)
        let reply = MarketStub.replies[host]
        MarketStub.lock.unlock()
        guard let reply else {
            client?.urlProtocol(self, didFailWithError: URLError(.cannotFindHost))
            return
        }
        if let error = reply.error {
            client?.urlProtocol(self, didFailWithError: error)
            return
        }
        let response = HTTPURLResponse(url: request.url!, statusCode: reply.status, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(reply.body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

final class MarketTests: XCTestCase {
    private func stubbedSession() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MarketStub.self]
        return URLSession(configuration: config)
    }

    private let coingecko = #"{"bitcoin":{"usd":83405,"usd_24h_change":0.5632,"last_updated_at":1791800345}}"#
    private let frankfurterSeries = #"{"base":"EUR","rates":{"2026-10-08":{"USD":1.08},"2026-10-09":{"USD":1.0812}}}"#

    // MARK: - Detection

    func testStockSymbolsTickersInMathAndNormalQuestionsOut() {
        for q in ["AAPL", "AAPL stock", "$TSLA", "aapl price", "stock price of MSFT", "AAPL stock price", "what is the price of AAPL"] {
            XCTAssertNotNil(QueryEngine.stockSymbol(q), q)
        }
        for q in ["a+b", "who is apple", "what is apple", "is apple good", "apple", "aapl", "AI", "US", "price", "2 + 2", "5 miles to km"] {
            XCTAssertNil(QueryEngine.stockSymbol(q), q)
        }
    }

    func testCryptoAndPairQueriesAreRecognised() {
        XCTAssertEqual(QueryEngine.marketAsk("bitcoin price"), .crypto(id: "bitcoin", name: "Bitcoin", symbol: "BTC"))
        XCTAssertEqual(QueryEngine.marketAsk("BTC"), .crypto(id: "bitcoin", name: "Bitcoin", symbol: "BTC"))
        XCTAssertEqual(QueryEngine.marketAsk("price of bitcoin"), .crypto(id: "bitcoin", name: "Bitcoin", symbol: "BTC"))
        XCTAssertEqual(QueryEngine.marketAsk("what's the current price of ethereum"), .crypto(id: "ethereum", name: "Ethereum", symbol: "ETH"))
        XCTAssertEqual(QueryEngine.marketAsk("eth"), .crypto(id: "ethereum", name: "Ethereum", symbol: "ETH"))
        XCTAssertEqual(QueryEngine.marketAsk("eur to usd rate"), .pair(from: "EUR", to: "USD"))
        XCTAssertEqual(QueryEngine.marketAsk("eur to usd"), .pair(from: "EUR", to: "USD"))
        XCTAssertEqual(QueryEngine.marketAsk("AAPL stock"), .stock("AAPL"))
    }

    func testNormalQuestionsAreNotMarkets() {
        for q in ["what is bitcoin", "bitcoin", "who is apple", "a+b", "the to and", "100 usd to eur", "AI", "apple", "aapl"] {
            XCTAssertNil(QueryEngine.marketAsk(q), q)
        }
        XCTAssertNil(QueryEngine.pairAsk("100 usd to eur"))
        XCTAssertNil(QueryEngine.pairAsk("the to and"))
        XCTAssertNil(QueryEngine.pairAsk("km to in"))
    }

    func testCardLeavesNonMarketQuestionsAloneWithoutAnyRequest() async {
        MarketStub.reset([:])
        let engine = QueryEngine()
        let session = stubbedSession()
        for q in ["a+b", "who is apple", "what is bitcoin", "bitcoin", "is apple good", "the to and", "AI"] {
            let result = await engine.card(q, session: session)
            XCTAssertNil(result, q)
        }
        XCTAssertEqual(MarketStub.requestedHosts(), [])
    }

    // MARK: - Crypto

    func testBitcoinPriceFromCoinGecko() async {
        MarketStub.reset(["api.coingecko.com": .init(status: 200, body: coingecko)])
        let result = await QueryEngine().card("bitcoin price", session: stubbedSession())
        guard case let .market(title, big, change, source, url, asOf)? = result else {
            return XCTFail("expected a market card, got \(String(describing: result))")
        }
        XCTAssertEqual(title, "Bitcoin (BTC)")
        XCTAssertEqual(big, "$83,405.00")
        XCTAssertEqual(change, "Up 0.56% in the last 24 hours")
        XCTAssertEqual(source, "CoinGecko")
        XCTAssertEqual(url, "https://www.coingecko.com")
        XCTAssertEqual(asOf?.date, Date(timeIntervalSince1970: 1791800345))
        XCTAssertEqual(asOf?.isDay, false)
        XCTAssertEqual(MarketStub.requestedHosts(), ["api.coingecko.com"])
    }

    func testChangeIsWordsNotColour() {
        XCTAssertEqual(QueryEngine.changeText(-1.2, "today"), "Down 1.20% today")
        XCTAssertEqual(QueryEngine.changeText(0.004, "today"), "Flat today")
        XCTAssertEqual(QueryEngine.changeText(nil, "today"), "")
        XCTAssertEqual(QueryEngine.changeText(.nan, "today"), "")
    }

    func testUsdKeepsTwoDecimalsAndFourUnderADollar() {
        XCTAssertEqual(QueryEngine.usd(83405), "$83,405.00")
        XCTAssertEqual(QueryEngine.usd(0.1234), "$0.1234")
    }

    func testFailedCryptoQuoteIsTheCalmStateNotANumber() async {
        MarketStub.reset(["api.coingecko.com": .init(status: 429, body: "")])
        let result = await QueryEngine().card("btc", session: stubbedSession())
        guard case let .market(title, big, _, _, _, _)? = result else {
            return XCTFail("expected a market card")
        }
        XCTAssertNil(big)
        XCTAssertEqual(title, "Bitcoin (BTC)")
        XCTAssertNil(result?.copyText)
        XCTAssertNil(result?.shareContent)
    }

    func testCryptoBodyWithoutUsdPriceIsUnavailableNotZero() async {
        MarketStub.reset(["api.coingecko.com": .init(status: 200, body: #"{"bitcoin":{}}"#)])
        let result = await QueryEngine().card("bitcoin price", session: stubbedSession())
        guard case let .market(_, big, _, _, _, _)? = result else { return XCTFail("expected a market card") }
        XCTAssertNil(big)
    }

    // MARK: - Stock

    func testStockFromTheProxyQuoteNamedWithTheDaysChange() async {
        let quote = #"{"symbol":"AAPL","name":"Apple Inc.","price":205,"currency":"USD","pct":2.5,"time":"2026-10-09T20:00:00.000Z","ts":1791576000}"#
        MarketStub.reset(["nimble-answers.trommatic.workers.dev": .init(status: 200, body: quote)])
        let result = await QueryEngine().card("apple stock", session: stubbedSession())
        guard case let .market(title, big, change, source, _, asOf)? = result else { return XCTFail("expected a market card") }
        XCTAssertEqual(title, "Apple Inc. (AAPL)")
        XCTAssertEqual(big, "$205.00")
        XCTAssertEqual(change, "Up 2.50% today")
        XCTAssertEqual(source, "Yahoo Finance")
        XCTAssertNotNil(asOf)
    }

    func testStockWithoutAPriceIsUnavailableNeverMadeUp() async {
        MarketStub.reset(["nimble-answers.trommatic.workers.dev": .init(status: 200, body: #"{"error":"no quote"}"#)])
        let result = await QueryEngine().card("AAPL", session: stubbedSession())
        guard case let .market(title, big, _, _, _, asOf)? = result else { return XCTFail("AAPL should be a market card, not an AI question") }
        XCTAssertEqual(title, "AAPL")
        XCTAssertNil(big, "never a made-up price")
        XCTAssertNil(asOf)
    }

    // MARK: - Currency pairs

    func testPairFromTheFrankfurterSeriesWithTheDaysChange() async {
        MarketStub.reset(["api.frankfurter.dev": .init(status: 200, body: frankfurterSeries)])
        let result = await QueryEngine().card("eur to usd rate", session: stubbedSession())
        guard case let .market(title, big, change, source, _, asOf)? = result else {
            return XCTFail("expected a market card")
        }
        XCTAssertEqual(title, "EUR to USD")
        XCTAssertEqual(big, "1.0812 USD")
        XCTAssertEqual(change, "Up 0.11% on Oct 9")
        XCTAssertEqual(source, "Frankfurter")
        XCTAssertEqual(asOf?.label(), "Oct 9")
        XCTAssertEqual(asOf?.isDay, true)
    }

    func testPairNeedsTwoDaysOfRates() async {
        MarketStub.reset(["api.frankfurter.dev": .init(status: 200, body: #"{"rates":{"2026-10-09":{"USD":1.08}}}"#)])
        let result = await QueryEngine().card("eur to usd", session: stubbedSession())
        guard case let .market(_, big, _, _, _, _)? = result else { return XCTFail("expected a market card") }
        XCTAssertNil(big)
    }

    func testPairFailureIsUnavailable() async {
        MarketStub.reset(["api.frankfurter.dev": .init(status: 503, body: "")])
        let result = await QueryEngine().card("eur to usd", session: stubbedSession())
        guard case let .market(_, big, _, _, _, _)? = result else { return XCTFail("expected a market card") }
        XCTAssertNil(big)
    }

    func testAmountConversionStillUsesTheFXCardWithADayFreshness() async {
        MarketStub.reset(["api.frankfurter.dev": .init(status: 200, body: #"{"base":"USD","date":"2026-10-09","rates":{"EUR":0.92}}"#)])
        let result = await QueryEngine().card("100 usd to eur", session: stubbedSession())
        guard case let .card(big, _, _, _, _, asOf)? = result else { return XCTFail("expected a card") }
        XCTAssertEqual(big, "92.00")
        XCTAssertEqual(asOf?.label(), "Oct 9")
        XCTAssertEqual(asOf?.isDay, true)
    }

    // MARK: - Freshness

    func testDailyFreshnessIsTheDayOnly() {
        let day = QueryEngine.utcDay("2026-10-09")!
        XCTAssertEqual(Freshness(date: day, isDay: true).label(), "Oct 9")
    }

    func testMomentFreshnessIsTimeInTheZoneItIsGiven() {
        let moment = Date(timeIntervalSince1970: 1791800345) // Oct 12, 2026, 10:19 UTC
        XCTAssertEqual(Freshness(date: moment, isDay: false).label(in: TimeZone(identifier: "UTC")!), "Oct 12, 10:19 am")
        XCTAssertEqual(Freshness(date: moment, isDay: false).label(in: TimeZone(identifier: "America/Vancouver")!), "Oct 12, 3:19 am")
    }

    func testTimeAndWeatherCardsCarryTheirFreshness() {
        let now = Date(timeIntervalSince1970: 1791800345)
        let time = QueryEngine.timeCard(place: "Tokyo", zone: TimeZone(identifier: "Asia/Tokyo")!, now: now)
        guard case let .card(_, _, _, _, _, timeAsOf) = time else { return XCTFail("expected a card") }
        XCTAssertEqual(timeAsOf, Freshness(date: now, isDay: false))

        let weather = QueryEngine.weatherCard(place: "Vancouver", country: "Canada", temp: 11.6, code: 3, wind: 12.2,
                                              asOf: Freshness(date: now, isDay: false))
        guard case let .card(_, _, _, _, _, weatherAsOf) = weather else { return XCTFail("expected a card") }
        XCTAssertEqual(weatherAsOf, Freshness(date: now, isDay: false))
    }

    func testNewsCarriesItsFreshness() {
        let json = Data(#"{"items":[{"sentence":"Rates held steady.","outlet":"BBC","url":"https://example.com/a","title":"Rates"}]}"#.utf8)
        let now = Freshness(date: Date(timeIntervalSince1970: 1791800345), isDay: false)
        guard case let .news(items, _, asOf)? = QueryEngine.newsResult(json: json, asOf: now) else {
            return XCTFail("expected news")
        }
        XCTAssertEqual(items.count, 1)
        XCTAssertEqual(asOf, now)
    }

    // MARK: - Market copy

    func testMarketCopyTextAndUnavailableHasNone() {
        let priced = QueryResult.market(title: "Bitcoin (BTC)", big: "$1", change: "Flat today", source: "CoinGecko", url: "https://www.coingecko.com")
        XCTAssertEqual(priced.copyText, "Bitcoin (BTC) $1, Flat today")
        let failed = QueryResult.market(title: "AAPL", big: nil, change: nil, source: "Yahoo Finance", url: "https://finance.yahoo.com")
        XCTAssertNil(failed.copyText)
        XCTAssertNil(failed.shareContent)
    }
}
