import XCTest
@testable import Nimble

@MainActor
final class SpeakerTests: XCTestCase {
    func testToggleStartsThenStopsTheSameText() {
        let s = Speaker()
        s.toggle("Paris is the capital of France.")
        XCTAssertEqual(s.speaking, "Paris is the capital of France.")
        s.toggle("Paris is the capital of France.")
        XCTAssertNil(s.speaking)
    }

    func testANewTextReplacesTheOldOne() {
        let s = Speaker()
        s.toggle("one")
        s.toggle("two")
        XCTAssertEqual(s.speaking, "two")
        s.stop()
        XCTAssertNil(s.speaking)
    }
}
