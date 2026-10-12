import XCTest
@testable import Nimble

@MainActor
final class SearchHistoryTests: XCTestCase {
    private var dir: URL!

    override func setUp() {
        dir = FileManager.default.temporaryDirectory.appendingPathComponent("nimble-history-\(UUID().uuidString)")
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: dir)
    }

    func testAddKeepsNewestFirst() {
        let h = SearchHistory(directory: dir, cloud: nil)
        h.add("2+2")
        h.add("5 miles to km")
        XCTAssertEqual(h.entries.map(\.q), ["5 miles to km", "2+2"])
    }

    func testDuplicateMovesToTopIgnoringCase() {
        let h = SearchHistory(directory: dir, cloud: nil)
        h.add("pi")
        h.add("sqrt 9")
        h.add("PI")
        XCTAssertEqual(h.entries.map(\.q), ["PI", "sqrt 9"])
    }

    func testBlankIsIgnored() {
        let h = SearchHistory(directory: dir, cloud: nil)
        h.add("   ")
        XCTAssertTrue(h.entries.isEmpty)
    }

    func testCapsAtFifty() {
        let h = SearchHistory(directory: dir, cloud: nil)
        for i in 0..<60 { h.add("q\(i)") }
        XCTAssertEqual(h.entries.count, 50)
        XCTAssertEqual(h.entries.first?.q, "q59")
        XCTAssertEqual(h.entries.last?.q, "q10")
    }

    func testClearEmptiesAndPersists() {
        let h = SearchHistory(directory: dir, cloud: nil)
        h.add("a")
        h.clear()
        XCTAssertTrue(h.entries.isEmpty)
        XCTAssertTrue(SearchHistory(directory: dir, cloud: nil).entries.isEmpty)
    }

    func testPersistsAcrossInstances() {
        let first = SearchHistory(directory: dir, cloud: nil)
        first.add("one")
        first.add("two")
        let second = SearchHistory(directory: dir, cloud: nil)
        XCTAssertEqual(second.entries.map(\.q), ["two", "one"])
    }

    // MARK: Answers

    func testFileWrittenBeforeAnswersStillDecodes() throws {
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let old = #"[{"q":"2+2","t":1700000000000},{"q":"pi","t":1700000001000}]"#
        try Data(old.utf8).write(to: dir.appendingPathComponent("history.json"))
        let h = SearchHistory(directory: dir, cloud: nil)
        XCTAssertEqual(h.entries.map(\.q), ["2+2", "pi"])
        XCTAssertNil(h.entries.first?.a)
    }

    func testAnswerIsSavedLocallyAndCapped() {
        let h = SearchHistory(directory: dir, cloud: nil)
        h.add("long", answer: String(repeating: "a", count: 500))
        XCTAssertEqual(h.entries.first?.a?.count, SearchHistory.answerLimit)
        XCTAssertEqual(SearchHistory(directory: dir, cloud: nil).entries.first?.a?.count, SearchHistory.answerLimit)
    }

    func testCloudPayloadHoldsQuestionsAndTimesOnly() throws {
        let cloud = FakeCloud()
        let h = SearchHistory(directory: dir, cloud: cloud)
        h.add("5 miles to km", answer: "8.05 km secret-answer-text")
        let payload = try XCTUnwrap(cloud.data(forKey: SearchHistory.cloudKey))
        let text = try XCTUnwrap(String(data: payload, encoding: .utf8))
        XCTAssertFalse(text.contains("secret-answer-text"))
        XCTAssertFalse(text.contains("\"a\""))
        let rows = try XCTUnwrap(JSONSerialization.jsonObject(with: payload) as? [[String: Any]])
        XCTAssertEqual(rows.first?["q"] as? String, "5 miles to km")
        XCTAssertNil(rows.first?["a"])
    }

    func testMergeKeepsLocalAnswerWhenCloudRowIsNewer() throws {
        let cloud = FakeCloud()
        let h = SearchHistory(directory: dir, cloud: cloud)
        h.add("pi", answer: "3.14159")
        // Another device asked the same question later. Its row wins the dedupe but has no answer.
        let later = (Date().timeIntervalSince1970 + 60) * 1000
        cloud.set(try JSONSerialization.data(withJSONObject: [["q": "PI", "t": later]]), forKey: SearchHistory.cloudKey)
        h.mergeFromCloud()
        XCTAssertEqual(h.entries.map(\.q), ["PI"])
        XCTAssertEqual(h.entries.first?.a, "3.14159")
    }

    // MARK: Remove

    func testRemovedRowDoesNotReturnAfterOldCloudDataMerges() throws {
        let cloud = FakeCloud()
        let h = SearchHistory(directory: dir, cloud: cloud)
        h.add("keep")
        h.add("drop me")
        let oldPayload = try XCTUnwrap(cloud.data(forKey: SearchHistory.cloudKey))  // still lists "drop me"

        h.remove(["drop me"])
        XCTAssertEqual(h.entries.map(\.q), ["keep"])

        // The other device's stale list arrives after the removal.
        cloud.set(oldPayload, forKey: SearchHistory.cloudKey)
        h.mergeFromCloud()
        XCTAssertEqual(h.entries.map(\.q), ["keep"])

        // And a fresh launch on the same store agrees.
        XCTAssertEqual(SearchHistory(directory: dir, cloud: cloud).entries.map(\.q), ["keep"])
    }

    func testRemoveIgnoresCaseAndSurvivesRestart() {
        let cloud = FakeCloud()
        let h = SearchHistory(directory: dir, cloud: cloud)
        h.add("Pi")
        h.add("two")
        h.remove(["pi"])
        XCTAssertEqual(h.entries.map(\.q), ["two"])
        XCTAssertEqual(SearchHistory(directory: dir, cloud: cloud).entries.map(\.q), ["two"])
    }

    func testAskingARemovedQuestionAgainBringsItBack() {
        let cloud = FakeCloud()
        let h = SearchHistory(directory: dir, cloud: cloud)
        h.add("again")
        h.remove(["again"])
        Thread.sleep(forTimeInterval: 0.01)
        h.add("again")
        XCTAssertEqual(SearchHistory(directory: dir, cloud: cloud).entries.map(\.q), ["again"])
    }
}

/// In-memory stand-in for iCloud's key-value store. The tests never touch the real one.
private final class FakeCloud: HistoryCloud {
    private var store: [String: Any] = [:]

    func data(forKey key: String) -> Data? { store[key] as? Data }
    func double(forKey key: String) -> Double { store[key] as? Double ?? 0 }
    func set(_ value: Any?, forKey key: String) { store[key] = value }
    @discardableResult func synchronize() -> Bool { true }
}
