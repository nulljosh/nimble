import XCTest
@testable import Nimble

@MainActor
final class PrivateModeTests: XCTestCase {
    func testPrivateModeSavesAndOldFilesStillDecode() throws {
        var p = PreferencesData()
        p.privateMode = true
        let back = try JSONDecoder().decode(PreferencesData.self, from: JSONEncoder().encode(p))
        XCTAssertEqual(back.privateMode, true)
        let old = try JSONDecoder().decode(PreferencesData.self, from: Data(#"{"theme":"blue","mathEnabled":true,"launchOnStartup":false,"centerWindow":false,"defaultSuggestions":true,"automaticUpdates":true,"lastUpdateCheck":0}"#.utf8))
        XCTAssertNil(old.privateMode)
    }

    func testPrivateModeStillDoesMathAndUnits() {
        let state = AppState()
        state.privateMode = true
        state.queryText = "2+2"
        state.performQuery()
        XCTAssertNotEqual(state.result, .none)
        XCTAssertNotEqual(state.result, .loading)
    }

    func testPrivateModeFactQuestionNeverGoesOnline() throws {
        try XCTSkipIf(OnDeviceAnswers.isAvailable, "the on-device model answers asynchronously here")
        let state = AppState()
        state.privateMode = true
        state.queryText = "who wrote hamlet"
        state.performQuery()
        // A synchronous private miss, never a loading spinner waiting on a request.
        guard case .error(let message, let searchURL) = state.result else { return XCTFail("expected a private-mode message, got \(state.result)") }
        XCTAssertTrue(message.contains("Private mode is on") || message.contains("Not in the offline pack"), message)
        XCTAssertNil(searchURL)
    }
}
