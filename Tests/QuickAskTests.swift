import XCTest
import SwiftUI
@testable import Nimble

@MainActor
final class QuickAskTests: XCTestCase {
    func testSharedAnswerRoundTrip() throws {
        guard let defaults = SharedAnswer.defaults else {
            throw XCTSkip("App group suite unavailable in this test host")
        }
        let before = SharedAnswer.load(from: defaults)
        defer {
            if let before { SharedAnswer.save(question: before.question, answer: before.answer, to: defaults) }
            else { defaults.removeObject(forKey: SharedAnswer.questionKey); defaults.removeObject(forKey: SharedAnswer.answerKey) }
        }
        SharedAnswer.save(question: "15% of 240", answer: "36", to: defaults)
        let back = try XCTUnwrap(SharedAnswer.load(from: UserDefaults(suiteName: SharedAnswer.suiteName)))
        XCTAssertEqual(back.question, "15% of 240")
        XCTAssertEqual(back.answer, "36")
    }

    func testNoDefaultsMeansNothingLoaded() {
        SharedAnswer.save(question: "q", answer: "a", to: nil)
        XCTAssertNil(SharedAnswer.load(from: nil))
    }

    /// No window: the quick-ask view goes straight to a PNG for a human to look at.
    func testQuickAskSnapshot() throws {
        let state = AppState()
        state.queryText = "15% of 240"
        state.performQuery()
        XCTAssertEqual(state.result, .math("36"))

        let view = QuickAskView(fieldStandIn: true).environment(state)
            .background(Color(nsColor: .windowBackgroundColor))
        let renderer = ImageRenderer(content: view)
        renderer.scale = 2
        let image = try XCTUnwrap(renderer.cgImage)
        XCTAssertEqual(image.width, 720)

        let rep = NSBitmapImageRep(cgImage: image)
        let data = try XCTUnwrap(rep.representation(using: .png, properties: [:]))
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("nimble-quickask.png")
        try data.write(to: url)
        print("QUICKASK_SNAPSHOT \(url.path)")
    }
}
