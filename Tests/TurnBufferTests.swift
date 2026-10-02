import XCTest
@testable import Nimble

final class TurnBufferTests: XCTestCase {
    func testKeepsOnlyTheLastThreeOldestFirst() {
        var b = TurnBuffer()
        for n in 1...5 { b.add("q\(n)", "a\(n)") }
        XCTAssertEqual(b.turns.map(\.q), ["q3", "q4", "q5"])
        XCTAssertEqual(b.turns.map(\.a), ["a3", "a4", "a5"])
    }

    func testBlankSidesAreDropped() {
        var b = TurnBuffer()
        b.add("  ", "a")
        b.add("q", "")
        XCTAssertTrue(b.turns.isEmpty)
    }

    func testClearForgetsEverything() {
        var b = TurnBuffer()
        b.add("q", "a")
        b.clear()
        XCTAssertTrue(b.turns.isEmpty)
    }

    func testProxyBodyCarriesTurnsThenTheNewQuestion() throws {
        var b = TurnBuffer()
        b.add("boiling point of water in fahrenheit", "212 F.")
        let req = try XCTUnwrap(AIConfig().request(for: "and in celsius?", turns: b))
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: try XCTUnwrap(req.httpBody)) as? [String: Any])
        XCTAssertEqual(body["q"] as? String, "and in celsius?")
        let sent = try XCTUnwrap(body["turns"] as? [[String: String]])
        XCTAssertEqual(sent, [["q": "boiling point of water in fahrenheit", "a": "212 F."]])
    }
}
