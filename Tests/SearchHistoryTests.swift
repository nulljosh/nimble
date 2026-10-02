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
        let h = SearchHistory(directory: dir)
        h.add("2+2")
        h.add("5 miles to km")
        XCTAssertEqual(h.entries.map(\.q), ["5 miles to km", "2+2"])
    }

    func testDuplicateMovesToTopIgnoringCase() {
        let h = SearchHistory(directory: dir)
        h.add("pi")
        h.add("sqrt 9")
        h.add("PI")
        XCTAssertEqual(h.entries.map(\.q), ["PI", "sqrt 9"])
    }

    func testBlankIsIgnored() {
        let h = SearchHistory(directory: dir)
        h.add("   ")
        XCTAssertTrue(h.entries.isEmpty)
    }

    func testCapsAtFifty() {
        let h = SearchHistory(directory: dir)
        for i in 0..<60 { h.add("q\(i)") }
        XCTAssertEqual(h.entries.count, 50)
        XCTAssertEqual(h.entries.first?.q, "q59")
        XCTAssertEqual(h.entries.last?.q, "q10")
    }

    func testClearEmptiesAndPersists() {
        let h = SearchHistory(directory: dir)
        h.add("a")
        h.clear()
        XCTAssertTrue(h.entries.isEmpty)
        XCTAssertTrue(SearchHistory(directory: dir).entries.isEmpty)
    }

    func testPersistsAcrossInstances() {
        let first = SearchHistory(directory: dir)
        first.add("one")
        first.add("two")
        let second = SearchHistory(directory: dir)
        XCTAssertEqual(second.entries.map(\.q), ["two", "one"])
    }
}
