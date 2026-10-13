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

@MainActor
final class VoiceLoopTests: XCTestCase {
    func testASpokenQuestionsAnswerIsReadBackOnce() {
        let state = AppState()
        state.speakNextAnswer = true
        state.result = .loading
        XCTAssertTrue(state.speakNextAnswer, "loading is not the answer yet")
        state.result = .math("10", steps: [])
        XCTAssertEqual(Speaker.shared.speaking, "10")
        XCTAssertFalse(state.speakNextAnswer)
        Speaker.shared.stop()
        state.result = .math("20", steps: [])
        XCTAssertNil(Speaker.shared.speaking, "a typed question is not read aloud")
    }
}
