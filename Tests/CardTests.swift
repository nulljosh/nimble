import XCTest
@testable import Nimble

final class CardTests: XCTestCase {
    func testCardCopyText() {
        let card = QueryResult.card(big: "12", unit: "°C", sub: "Vancouver, Canada, overcast, wind 12 km/h", source: "Open-Meteo", url: nil)
        XCTAssertEqual(card.copyText, "12 °C, Vancouver, Canada, overcast, wind 12 km/h")
    }

    func testWeatherCard() {
        let card = QueryEngine.weatherCard(place: "Vancouver", country: "Canada", temp: 11.6, code: 3, wind: 12.2)
        XCTAssertEqual(card, .card(big: "12", unit: "°C", sub: "Vancouver, Canada, overcast, wind 12 km/h",
                                   source: "Open-Meteo", url: "https://open-meteo.com"))
    }

    func testWeatherCardNext12Hours() {
        let card = QueryEngine.weatherCard(place: "Vancouver", country: "Canada", temp: 11.6, code: 3, wind: 12.2, next: [11.6, 9.4, 8.2, 12.1])
        XCTAssertEqual(card, .card(big: "12", unit: "°C", sub: "Vancouver, Canada, overcast, wind 12 km/h, next 12 h 8 to 12°C",
                                   source: "Open-Meteo", url: "https://open-meteo.com"))
        XCTAssertNil(QueryEngine.next12([]))
    }

    func testCurrencyCard() {
        let card = QueryEngine.currencyCard(amount: 100, from: "USD", to: "CAD", rate: 1.3712, source: "Frankfurter", url: "https://frankfurter.dev")
        XCTAssertEqual(card, .card(big: "137.12", unit: "CAD", sub: "100 USD at today's rate",
                                   source: "Frankfurter", url: "https://frankfurter.dev"))
    }

    func testCurrencyCardFromTheLastSavedRate() {
        let card = QueryEngine.currencyCard(amount: 100, from: "USD", to: "CAD", rate: 1.3712, source: "Frankfurter", url: "https://frankfurter.dev", saved: true)
        XCTAssertEqual(card, .card(big: "137.12", unit: "CAD", sub: "100 USD at the last saved rate",
                                   source: "Frankfurter", url: "https://frankfurter.dev"))
    }

    func testTimeCard() throws {
        let zone = try XCTUnwrap(TimeZone(identifier: "Asia/Tokyo"))
        // 2026-10-02 05:05 UTC is 14:05 in Tokyo.
        let now = Date(timeIntervalSince1970: 1_790_917_500)
        let card = QueryEngine.timeCard(place: "Tokyo", zone: zone, now: now)
        XCTAssertEqual(card, .card(big: "14:05", unit: "Tokyo", sub: "Friday, October 2, Asia/Tokyo",
                                   source: "Open-Meteo", url: "https://open-meteo.com"))
    }

    func testEtymologyCard() {
        let card = QueryEngine.etymologyCard(word: "nimble", ancestor: "nymyl", relation: "derived", langCode: "enm")
        XCTAssertEqual(card, .card(big: "nimble", unit: "", sub: "Derived from nymyl, Middle English",
                                   source: "Wordroot", url: "https://wordroot.jaybulb.com/#search=nimble"))
    }

    func testCardRouting() {
        let engine = QueryEngine()
        XCTAssertTrue(engine.isCardQuery("weather in Vancouver"))
        XCTAssertTrue(engine.isCardQuery("What's the time in Tokyo?"))
        XCTAssertTrue(engine.isCardQuery("100 usd to cad"))
        XCTAssertTrue(engine.isCardQuery("what time is it in london"))
        XCTAssertTrue(engine.isCardQuery("1 euro to usd"))
        XCTAssertTrue(engine.isCardQuery("etymology of nimble"))
        XCTAssertTrue(engine.isCardQuery("origin of nimble"))
        XCTAssertTrue(engine.isCardQuery("root of nimble"))
        XCTAssertTrue(engine.isCardQuery("where does the word nimble come from"))
        XCTAssertFalse(engine.isCardQuery("who wrote Dune"))
    }

    // MARK: - News

    func testNewsRouting() {
        let engine = QueryEngine()
        XCTAssertTrue(engine.isCardQuery("news"))
        XCTAssertTrue(engine.isCardQuery("Latest news"))
        XCTAssertTrue(engine.isCardQuery("what's happening in Vancouver?"))
        XCTAssertTrue(engine.isCardQuery("what is happening in Ottawa"))
        XCTAssertFalse(engine.isCardQuery("newsroom"))
        XCTAssertFalse(engine.isCardQuery("what is the capital of france"))
    }

    func testNewsDecodesTopThreeWithOutlets() {
        let json = """
        {"items":[
          {"title":"A","sentence":"First story happened today.","outlet":"BBC","url":"https://www.bbc.com/news/1"},
          {"title":"B","sentence":"Second story happened.","outlet":"CBC","url":"https://www.cbc.ca/news/2"},
          {"title":"C","sentence":"Bad link.","outlet":"Nope","url":"javascript:alert(1)"},
          {"title":"D","sentence":"Third story.","outlet":"NPR","url":"http://www.npr.org/3"},
          {"title":"E","sentence":"Fourth story is cut.","outlet":"Guardian","url":"https://www.theguardian.com/4"}
        ]}
        """
        let result = QueryEngine.newsResult(json: Data(json.utf8))
        guard case let .news(items, source, _)? = result else { return XCTFail("expected a news card") }
        XCTAssertEqual(items.map(\.outlet), ["BBC", "CBC", "NPR"])
        XCTAssertEqual(source, "BBC, CBC, NPR")
        XCTAssertEqual(items[0].url, "https://www.bbc.com/news/1")
    }

    func testNewsEmptyFeedIsNil() {
        XCTAssertNil(QueryEngine.newsResult(json: Data("{\"items\":[]}".utf8)))
        XCTAssertNil(QueryEngine.newsResult(json: Data("not json".utf8)))
    }

    func testNewsCopyAndShare() {
        let items = [NewsItem(sentence: "First story.", outlet: "BBC", url: "https://www.bbc.com/news/1"),
                     NewsItem(sentence: "Second story.", outlet: "CBC", url: "https://www.cbc.ca/news/2")]
        let news = QueryResult.news(items: items, source: "BBC, CBC")
        XCTAssertEqual(news.copyText, "First story. (BBC)\nSecond story. (CBC)")
        XCTAssertEqual(news.shareContent?.text, "First story.")
        XCTAssertEqual(news.shareContent?.source, "BBC, CBC")
    }
}
