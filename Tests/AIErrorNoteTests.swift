import XCTest
@testable import Nimble

/// The worker's aiError, offline: it decodes when present, and the resting note shows only under a Wikipedia fallback.
/// The end-to-end case stubs the worker and Wikipedia, so nothing touches the network.
final class AIErrorNoteTests: XCTestCase {
    private static let note = "The free AI is out of answers for today, so this is from Wikipedia. It resets in the evening."

    /// Answers the worker with a quota-out reply and serves one Wikipedia summary; everything else is a 404.
    private final class StubProtocol: URLProtocol {
        nonisolated(unsafe) static var workerReply: [String: Any] = [:]
        nonisolated(unsafe) static var summaries: [String: [String: Any]] = [:]
        nonisolated(unsafe) static var searchTitles: [String] = []
        nonisolated(unsafe) static var ddgReply: [String: Any] = [:]

        override class func canInit(with request: URLRequest) -> Bool { true }
        override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

        override func startLoading() {
            guard let url = request.url else {
                client?.urlProtocol(self, didFailWithError: URLError(.badURL))
                return
            }
            let s = url.absoluteString
            var code = 404
            var data = Data()
            if url.host == "api.duckduckgo.com" {
                code = 200
                data = try! JSONSerialization.data(withJSONObject: StubProtocol.ddgReply)
            } else if url.host == "nimble-answers.trommatic.workers.dev" {
                code = 200
                data = try! JSONSerialization.data(withJSONObject: StubProtocol.workerReply)
            } else if s.contains("list=search") {
                code = 200
                data = try! JSONSerialization.data(withJSONObject: ["query": ["search": StubProtocol.searchTitles.map { ["title": $0] }]])
            } else if let range = s.range(of: "/page/summary/") {
                let title = (String(s[range.upperBound...]).removingPercentEncoding ?? "").replacingOccurrences(of: "_", with: " ")
                if let summary = StubProtocol.summaries[title] {
                    code = 200
                    data = try! JSONSerialization.data(withJSONObject: summary)
                }
            }
            let response = HTTPURLResponse(url: url, statusCode: code, httpVersion: nil, headerFields: nil)!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        }

        override func stopLoading() {}
    }

    private var session: URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubProtocol.self]
        return URLSession(configuration: config)
    }

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
        XCTAssertEqual(QueryEngine.aiRestingNote(aiError: "capacity", source: "Wikipedia"), Self.note)
        XCTAssertNil(QueryEngine.aiRestingNote(aiError: nil, source: "Wikipedia"))
        XCTAssertNil(QueryEngine.aiRestingNote(aiError: "capacity", source: "DuckDuckGo"))
    }

    func testRestingNoteTextIsTheApprovedWording() {
        XCTAssertEqual(QueryEngine.aiRestingNote(aiError: "capacity", source: "Wikipedia"),
                       "The free AI is out of answers for today, so this is from Wikipedia. It resets in the evening.")
    }

    /// The quota-out path end to end: the worker's aiError reaches the failure note, and a plain factual
    /// question that falls back to Wikipedia carries the note text the card shows.
    func testQuotaOutFallbackCarriesTheRestingNote() async {
        StubProtocol.workerReply = ["answer": "UNKNOWN", "aiError": "AiError: daily free allocation exceeded"]
        StubProtocol.searchTitles = ["Fraser River"]
        StubProtocol.summaries = ["Fraser River": ["title": "Fraser River", "extract": "The Fraser River is the longest river in British Columbia."]]
        let note = AIFailureNote()
        let result = await QueryEngine().query("fraser river", ai: AIConfig(), useLLM: true, note: note, session: session)
        guard case .text(_, _, let source, _, _, _, _, _, _) = result else { return XCTFail("expected text, got \(result)") }
        XCTAssertEqual(source, "Wikipedia")
        XCTAssertEqual(note.aiError, "AiError: daily free allocation exceeded")
        XCTAssertEqual(QueryEngine.aiRestingNote(aiError: note.aiError, source: source), Self.note)
    }

    /// Liam's question on the DuckDuckGo path: the abstract is the generic Rainbow page, the AI is out.
    /// It must be labeled as background, and the resting note must show under it.
    func testGenericDuckDuckGoAbstractForASpecificQuestionIsLabeled() async {
        StubProtocol.workerReply = ["answer": "UNKNOWN", "aiError": "AiError: daily free allocation exceeded"]
        StubProtocol.ddgReply = ["Heading": "Rainbow", "AbstractText": "A rainbow is an optical phenomenon caused by refraction, internal reflection and dispersion of light in water droplets.", "AbstractSource": "Wikipedia", "AbstractURL": "https://en.wikipedia.org/wiki/Rainbow"]
        let note = AIFailureNote()
        let result = await QueryEngine().query("What was the first color photograph of a rainbow?", ai: AIConfig(), useLLM: true, note: note, session: session)
        guard case .text(let heading, let body, let source, _, _, _, _, _, let background) = result else { return XCTFail("expected text, got \(result)") }
        XCTAssertEqual(heading, "Rainbow")
        XCTAssertEqual(source, "Wikipedia")
        XCTAssertTrue(background, "the generic page for a specific question is background")
        XCTAssertTrue(body.hasPrefix("A rainbow is an optical phenomenon caused by refraction, internal reflection and dispersion"), body)
        XCTAssertFalse(body.contains("Not a direct answer"), "the caption is a card line, never body text")
        XCTAssertEqual(QueryEngine.aiRestingNote(aiError: note.aiError, source: source), Self.note)
    }

    func testFailureNoteStartsEmpty() {
        XCTAssertNil(AIFailureNote().aiError)
    }
}
