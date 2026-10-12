import XCTest
@testable import Nimble

@MainActor
final class NewQuestionTests: XCTestCase {
    func testNewQuestionClearsFieldAnswerAndRequestsFocus() {
        let state = AppState()
        state.queryText = "2+2"
        state.performQuery()
        XCTAssertNotEqual(state.result, .none)
        let focus = state.focusRequest

        state.newQuestion()

        XCTAssertEqual(state.queryText, "")
        XCTAssertEqual(state.result, .none)
        XCTAssertEqual(state.focusRequest, focus + 1)
    }

    func testAnsweredQuestionIsSavedWithItsAnswer() {
        let state = AppState()
        state.queryText = "5 miles to km"
        state.performQuery()
        XCTAssertEqual(state.history.entries.first?.q, "5 miles to km")
        XCTAssertNotNil(state.history.entries.first?.a)
    }
}
