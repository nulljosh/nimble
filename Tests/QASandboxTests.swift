import XCTest
@testable import Nimble

/// QA launches must never touch the real history, prefs, shared answer or iCloud store.
@MainActor
final class QASandboxTests: XCTestCase {
    private let tempPrefix = URL(fileURLWithPath: NSTemporaryDirectory()).standardizedFileURL.path
    private let realSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        .appendingPathComponent("Nimble", isDirectory: true).standardizedFileURL.path

    func testAnyQAFlagActivatesSandbox() {
        for flag in QASandbox.flags {
            XCTAssertTrue(QASandbox.isActive(arguments: ["-\(flag)", "YES"], environment: [:]), "-\(flag) should sandbox")
        }
        XCTAssertTrue(QASandbox.isActive(arguments: ["-qaSandbox", "YES"], environment: [:]))
    }

    func testNoQAArgsKeepsRealPaths() {
        XCTAssertFalse(QASandbox.isActive(arguments: ["/Applications/Nimble.app/Contents/MacOS/Nimble"], environment: [:]))
        XCTAssertEqual(NimbleStorage.supportDirectory(qa: false).standardizedFileURL.path, realSupport)
        XCTAssertEqual(NimbleStorage.preferencesPath(qa: false), NSHomeDirectory() + "/.nimble-options.json")
        XCTAssertTrue(NimbleStorage.defaults(qa: false) === UserDefaults.standard)
    }

    func testQAHistoryIsUnderTempAndRealFileUntouched() throws {
        // The test host runs sandboxed (XCTest sets its environment), so the default path is the QA one.
        XCTAssertTrue(QASandbox.launch)
        let qaDir = NimbleStorage.supportDirectory().standardizedFileURL.path
        XCTAssertTrue(qaDir.hasPrefix(tempPrefix), qaDir)
        XCTAssertFalse(qaDir.hasPrefix(realSupport))

        let realHistory = URL(fileURLWithPath: realSupport).appendingPathComponent("history.json")
        let before = try? Data(contentsOf: realHistory)
        let history = SearchHistory()
        history.add("qa sandbox probe \(UUID().uuidString)")
        XCTAssertEqual(try? Data(contentsOf: realHistory), before, "real history.json changed during a QA run")
    }

    func testICloudSyncOffInQA() {
        XCTAssertNil(NimbleStorage.cloudStore(qa: true))
        XCTAssertNil(NimbleStorage.cloudStore())
        XCTAssertNotNil(NimbleStorage.cloudStore(qa: false))
    }

    func testQASettingsLiveInTempNotStandard() {
        XCTAssertFalse(NimbleStorage.defaults() === UserDefaults.standard)
        XCTAssertTrue(NimbleStorage.preferencesPath(qa: true).hasPrefix(tempPrefix))
        XCTAssertNotEqual(NimbleStorage.preferencesPath(qa: true), NimbleStorage.preferencesPath(qa: false))
    }
}
