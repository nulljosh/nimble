import XCTest
@testable import Nimble

/// "Sources disagree": the proxy's optional `disagree` and `alts` fields, offline. A reply without them must
/// decode and answer exactly as before. Stubbed replies only; nothing touches the Worker or the network.
final class DisagreeTests: XCTestCase {
    /// The worker's split reply, as the Worker sends it once the change is deployed (STUBBED).
    private static let split = #"{"answer":"Kamloops, British Columbia","source":"Gemma + Qwen","disagree":true,"alts":[{"model":"Qwen3 30B","answer":"Kamloops, British Columbia"},{"model":"Gemma 4 26B","answer":"Nelson, British Columbia"}],"refs":[{"title":"Kamloops","url":"https://en.wikipedia.org/wiki/Kamloops","extract":"Kamloops is a city."}]}"#
    /// Today's live probe: UNKNOWN with the quota error. No disagree, no alts.
    private static let probe = #"{"answer":"UNKNOWN","aiError":"4006: you have used up your daily free allocation of 10,000 neurons"}"#
    /// A normal answer from before the change: no new fields at all.
    private static let plain = #"{"answer":"Paris.","source":"Gemma + Qwen","refs":[{"title":"Paris","url":"https://en.wikipedia.org/wiki/Paris","extract":"Paris is the capital of France."}]}"#

    /// Serves one worker body and one DuckDuckGo body; everything else is a 404.
    private final class DisagreeStub: URLProtocol {
        nonisolated(unsafe) static var workerBody = Data()
        nonisolated(unsafe) static var ddgBody = Data("{}".utf8)

        override class func canInit(with request: URLRequest) -> Bool { true }
        override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

        override func startLoading() {
            guard let url = request.url else {
                client?.urlProtocol(self, didFailWithError: URLError(.badURL))
                return
            }
            var code = 404
            var data = Data()
            if url.host == "nimble-answers.trommatic.workers.dev" {
                code = 200
                data = DisagreeStub.workerBody
            } else if url.host == "api.duckduckgo.com" {
                code = 200
                data = DisagreeStub.ddgBody
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
        config.protocolClasses = [DisagreeStub.self]
        return URLSession(configuration: config)
    }

    private func decode(_ json: String) throws -> ProxyReply {
        try JSONDecoder().decode(ProxyReply.self, from: Data(json.utf8))
    }

    private func ask(worker: String, ddg: String = "{}") async -> QueryResult {
        DisagreeStub.workerBody = Data(worker.utf8)
        DisagreeStub.ddgBody = Data(ddg.utf8)
        return await QueryEngine().query("Where is the Winter Lantern Festival held?", ai: AIConfig(), useLLM: true, session: session)
    }

    // MARK: Decoding

    func testSplitReplyDecodesBothAnswersWithTheirModels() throws {
        let reply = try decode(Self.split)
        XCTAssertEqual(reply.disputed, [
            DisputedAnswer(model: "Qwen3 30B", answer: "Kamloops, British Columbia"),
            DisputedAnswer(model: "Gemma 4 26B", answer: "Nelson, British Columbia"),
        ])
        XCTAssertEqual(reply.refs?.count, 1)
    }

    func testReplyWithoutTheNewFieldsIsUnchanged() throws {
        for json in [Self.probe, Self.plain] {
            let reply = try decode(json)
            XCTAssertNil(reply.disagree)
            XCTAssertNil(reply.alts)
            XCTAssertNil(reply.disputed)
        }
        let probe = try decode(Self.probe)
        XCTAssertEqual(probe.aiError, "4006: you have used up your daily free allocation of 10,000 neurons")
        let plain = try decode(Self.plain)
        XCTAssertEqual(plain.refs?.first?.title, "Paris")
    }

    func testDisagreeFalseOrOneAlternativeIsNoSplit() throws {
        let no = try decode(#"{"answer":"Paris.","disagree":false,"alts":[{"model":"A","answer":"Paris"},{"model":"B","answer":"Lyon"}]}"#)
        XCTAssertNil(no.disputed)
        let one = try decode(#"{"answer":"Paris.","disagree":true,"alts":[{"model":"A","answer":"Paris"}]}"#)
        XCTAssertNil(one.disputed)
    }

    func testMalformedAlternativeDropsOnlyItselfAndKeepsTheRest() throws {
        // A number where a string belongs, and an empty answer: neither counts, and the reply still decodes.
        let json = #"{"answer":"Paris.","image":null,"disagree":true,"alts":[{"model":"A","answer":7},{"model":"B","answer":"Lyon"},{"model":"C","answer":"   "}],"aiError":"x"}"#
        let reply = try decode(json)
        XCTAssertNil(reply.disputed, "one usable alternative is not a split")
        XCTAssertEqual(reply.aiError, "x")
        let two = try decode(#"{"answer":"Paris.","disagree":true,"alts":[{"model":"A","answer":7},{"model":"B","answer":"Lyon"},{"model":"C","answer":"Nice"}]}"#)
        XCTAssertEqual(two.disputed?.map(\.model), ["B", "C"])
    }

    // MARK: Result

    func testSplitCopiesBothAnswersAndHistoryKeepsTheFirst() {
        let card = QueryResult.disagree(alts: [
            DisputedAnswer(model: "Qwen3 30B", answer: "Kamloops"),
            DisputedAnswer(model: "Gemma 4 26B", answer: "Nelson"),
        ])
        XCTAssertEqual(card.copyText, "Kamloops (Qwen3 30B) / Nelson (Gemma 4 26B)")
        XCTAssertEqual(card.historyText, "Kamloops")
        XCTAssertEqual(card.shareContent?.source, "Qwen3 30B / Gemma 4 26B")
    }

    // MARK: Query flow

    func testSplitReachesTheCardWhenNoSourceSettlesIt() async {
        let result = await ask(worker: Self.split)
        guard case .disagree(let alts, let sources, _) = result else { return XCTFail("expected a split, got \(result)") }
        XCTAssertEqual(alts.map(\.model), ["Qwen3 30B", "Gemma 4 26B"])
        XCTAssertEqual(sources.map(\.name), ["Kamloops"])
    }

    func testSourceThatBacksOneAnswerSettlesItAsBefore() async {
        let ddg = #"{"AbstractText":"Kamloops is a city in British Columbia.","AbstractSource":"Wikipedia","AbstractURL":"https://en.wikipedia.org/wiki/Kamloops","Heading":"Kamloops"}"#
        let result = await ask(worker: Self.split, ddg: ddg)
        if case .disagree = result { XCTFail("a source that backs one answer must settle it") }
    }

    func testReplyWithoutTheFieldsStaysATextAnswer() async {
        let result = await ask(worker: Self.plain)
        guard case .text(_, let body, _, _, _, _, _, _, _) = result else { return XCTFail("expected text, got \(result)") }
        XCTAssertEqual(body, "Paris.")
    }
}
