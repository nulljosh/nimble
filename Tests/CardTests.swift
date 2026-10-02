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

    func testCurrencyCard() {
        let card = QueryEngine.currencyCard(amount: 100, from: "USD", to: "CAD", rate: 1.3712, source: "Frankfurter", url: "https://frankfurter.dev")
        XCTAssertEqual(card, .card(big: "137.12", unit: "CAD", sub: "100 USD at today's rate",
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
        XCTAssertEqual(card, .card(big: "nimble", unit: "enm", sub: "Derived from nymyl",
                                   source: "Wordroot", url: "https://wordroot.heyitsmejosh.com/#search=nimble"))
    }

    func testCardRouting() {
        let engine = QueryEngine()
        XCTAssertTrue(engine.isCardQuery("weather in Vancouver"))
        XCTAssertTrue(engine.isCardQuery("What's the time in Tokyo?"))
        XCTAssertTrue(engine.isCardQuery("100 usd to cad"))
        XCTAssertTrue(engine.isCardQuery("etymology of nimble"))
        XCTAssertTrue(engine.isCardQuery("origin of nimble"))
        XCTAssertTrue(engine.isCardQuery("root of nimble"))
        XCTAssertTrue(engine.isCardQuery("where does the word nimble come from"))
        XCTAssertFalse(engine.isCardQuery("who wrote Dune"))
    }
}
