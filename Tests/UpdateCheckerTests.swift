import XCTest
@testable import Nimble

@MainActor
final class UpdateCheckerTests: XCTestCase {

    // MARK: - Tag normalization

    func testNormalizeStripsLeadingV() {
        XCTAssertEqual(UpdateChecker.normalize("v1.2.3"), "1.2.3")
        XCTAssertEqual(UpdateChecker.normalize("V1.2.3"), "1.2.3")
        XCTAssertEqual(UpdateChecker.normalize(" 1.2.3 "), "1.2.3")
        XCTAssertEqual(UpdateChecker.normalize("1.2.3"), "1.2.3")
    }

    // MARK: - Version comparison

    func testNewerPatchAndMinorAndMajor() {
        XCTAssertTrue(UpdateChecker.version("1.0.1", isNewerThan: "1.0.0"))
        XCTAssertTrue(UpdateChecker.version("1.1.0", isNewerThan: "1.0.9"))
        XCTAssertTrue(UpdateChecker.version("2.0.0", isNewerThan: "1.9.9"))
    }

    func testSameVersionIsNotNewer() {
        XCTAssertFalse(UpdateChecker.version("1.0.0", isNewerThan: "1.0.0"))
        XCTAssertFalse(UpdateChecker.version("v1.0.0", isNewerThan: "1.0.0"))
    }

    func testOlderVersionIsNotNewer() {
        XCTAssertFalse(UpdateChecker.version("1.0.0", isNewerThan: "1.0.1"))
        XCTAssertFalse(UpdateChecker.version("0.9.0", isNewerThan: "1.0.0"))
    }

    /// The case a plain string compare gets wrong.
    func testDoubleDigitComponentsCompareNumerically() {
        XCTAssertTrue(UpdateChecker.version("1.10.0", isNewerThan: "1.9.0"))
        XCTAssertFalse(UpdateChecker.version("1.9.0", isNewerThan: "1.10.0"))
    }

    func testMissingComponentsCountAsZero() {
        XCTAssertTrue(UpdateChecker.version("1.1", isNewerThan: "1.0.9"))
        XCTAssertFalse(UpdateChecker.version("1.0", isNewerThan: "1.0.0"))
        XCTAssertTrue(UpdateChecker.version("1.0.1", isNewerThan: "1.0"))
    }

    // MARK: - Automatic check scheduling

    func testCheckIsSkippedWhenOneRanRecently() async {
        let checker = UpdateChecker(currentVersion: "1.0.0")
        let justNow = Date().timeIntervalSince1970
        let result = await checker.checkIfDue(lastCheck: justNow)
        XCTAssertNil(result, "a check inside the interval should not hit the network")
        XCTAssertEqual(checker.status, .idle)
    }

    // MARK: - Status

    func testIdleStatusTextShowsCurrentVersion() {
        let checker = UpdateChecker(currentVersion: "1.2.3")
        XCTAssertEqual(checker.statusText, "Nimble 1.2.3")
        XCTAssertNil(checker.availableVersion)
        XCTAssertFalse(checker.isChecking)
    }
}
