import XCTest
@testable import Nimble

final class AskServiceTests: XCTestCase {
    func testQuestionFromLink() {
        XCTAssertEqual(AskService.question(from: URL(string: "nimble://ask?q=capital%20of%20france")!), "capital of france")
        XCTAssertNil(AskService.question(from: URL(string: "nimble://ask")!))
        XCTAssertNil(AskService.question(from: URL(string: "https://example.com/?q=x")!))
    }

    func testCleanTrimsAndCaps() {
        XCTAssertEqual(AskService.clean("  hi \n"), "hi")
        XCTAssertEqual(AskService.clean(String(repeating: "a", count: 500)).count, 300)
    }
}

@MainActor
final class AskServiceHookTests: XCTestCase {
    func testQuestionBeforeHookIsKept() {
        let service = AskService()
        service.ask("early")
        var got: [String] = []
        service.hook { got.append($0) }
        service.ask("late")
        XCTAssertEqual(got, ["early", "late"])
    }
}
