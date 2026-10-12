import XCTest
@testable import Nimble

/// The worker's aiError, offline: it decodes when present, and the resting note shows only under a Wikipedia fallback.
final class AIErrorNoteTests: XCTestCase {
    func testProxyReplyDecodesAIError() throws {
        let json = #"{"answer":"UNKNOWN","aiError":"AiError: daily free allocation exceeded"}"#
        let reply = try JSONDecoder().decode(ProxyReply.self, from: Data(json.utf8))
        XCTAssertEqual(reply.aiError, "AiError: daily free allocation exceeded")
        XCTAssertNil(reply.topic)
    }

    func testProxyReplyWithoutAIErrorStillDecodes() throws {
        let json = #"{"answer":"Paris.","source":"Gemma + Qwen"}"#
        let reply = try JSONDecoder().decode(ProxyReply.self, from: Data(json.utf8))
        XCTAssertNil(reply.aiError)
    }

    func testRestingNoteShowsOnlyUnderWikipediaWithAnError() {
        XCTAssertEqual(QueryEngine.aiRestingNote(aiError: "capacity", source: "Wikipedia"),
                       "The free AI is resting, showing Wikipedia.")
        XCTAssertNil(QueryEngine.aiRestingNote(aiError: nil, source: "Wikipedia"))
        XCTAssertNil(QueryEngine.aiRestingNote(aiError: "capacity", source: "DuckDuckGo"))
    }

    func testFailureNoteStartsEmpty() {
        XCTAssertNil(AIFailureNote().aiError)
    }
}
