import XCTest
@testable import Nimble

/// The Wikipedia fallback when the free AI is unavailable. The network is a URLProtocol stub, so these run offline.
/// A relation question ("capital of X", "who wrote X", "when was X") answers only from an intro sentence that carries
/// the relation word. A list page or a loose search hit never answers it.
final class WikiFallbackTests: XCTestCase {
    private final class StubProtocol: URLProtocol {
        /// Search titles for every search request.
        nonisolated(unsafe) static var searchTitles: [String] = []
        /// Canonical title to lead text (the exintro request); a title missing here is a missing page.
        nonisolated(unsafe) static var intros: [String: String] = [:]
        /// REST summary by title, for the non-relation path.
        nonisolated(unsafe) static var summaries: [String: [String: Any]] = [:]

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
            if s.contains("list=search") {
                code = 200
                data = try! JSONSerialization.data(withJSONObject: ["query": ["search": StubProtocol.searchTitles.map { ["title": $0] }]])
            } else if s.contains("prop=extracts") {
                let titleParam = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "titles" }?.value ?? ""
                code = 200
                let key = StubProtocol.intros.keys.first { $0.lowercased() == titleParam.lowercased() }
                let page: [String: Any] = key.map { ["title": $0, "extract": StubProtocol.intros[$0]!] } ?? ["title": titleParam, "missing": true]
                data = try! JSONSerialization.data(withJSONObject: ["query": ["pages": [page]]])
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

    private let france = "France, officially the French Republic, is a country primarily located in Western Europe. Its capital, largest city and main cultural and economic centre is Paris, with a metropolitan population of over 13 million."
    private let hamlet = "The Tragedy of Hamlet, Prince of Denmark, often shortened to Hamlet (), is a tragedy written by William Shakespeare sometime between 1599 and 1601. It is Shakespeare's longest play."

    private var session: URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubProtocol.self]
        return URLSession(configuration: config)
    }

    override func setUp() {
        super.setUp()
        StubProtocol.searchTitles = []
        StubProtocol.intros = [:]
        StubProtocol.summaries = [:]
    }

    func testRelationParsesThePatternsAndStripsThePrefix() {
        XCTAssertEqual(QueryEngine.WikiRelation.of("capital of france")?.subject, "france")
        XCTAssertEqual(QueryEngine.WikiRelation.of("What is the capital of France?")?.subject, "France")
        XCTAssertEqual(QueryEngine.WikiRelation.of("who wrote hamlet")?.subject, "hamlet")
        XCTAssertEqual(QueryEngine.WikiRelation.of("when was the eiffel tower built")?.subject, "eiffel tower")
        XCTAssertNil(QueryEngine.WikiRelation.of("fraser river"))
    }

    func testCapitalOfFranceAnswersWithParisFromFrancesOwnPage() async {
        StubProtocol.searchTitles = ["List of capitals of France", "Capital punishment in France"]
        StubProtocol.intros = ["France": france]
        let result = await QueryEngine().queryWikipedia("capital of france", session: session)
        guard case .text(let heading, let body, let source, let url, _, _, _, _)? = result else { return XCTFail("expected text, got \(String(describing: result))") }
        XCTAssertEqual(heading, "France")
        XCTAssertEqual(body, "Its capital, largest city and main cultural and economic centre is Paris, with a metropolitan population of over 13 million.")
        XCTAssertEqual(source, "Wikipedia")
        XCTAssertEqual(url, "https://en.wikipedia.org/wiki/France")
    }

    func testCapitalPunishmentHitNeverAnswersTheCapitalQuestion() async {
        StubProtocol.searchTitles = ["List of capitals of France", "Capital punishment in France"]
        StubProtocol.intros = ["Capital punishment in France": "Capital punishment in France is banned by the Constitution."]
        let result = await QueryEngine().queryWikipedia("capital of france", session: session)
        XCTAssertNil(result)
    }

    func testListOnlyResultsGiveNoAnswer() async {
        StubProtocol.searchTitles = ["List of capitals of France", "List of French capitals"]
        let result = await QueryEngine().queryWikipedia("capital of france", session: session)
        XCTAssertNil(result)
    }

    func testWhoWroteHamletGivesShakespeareWithoutThePronunciationBrackets() async {
        StubProtocol.searchTitles = ["Hamlet (film)"]
        StubProtocol.intros = ["Hamlet": hamlet]
        let result = await QueryEngine().queryWikipedia("who wrote hamlet", session: session)
        guard case .text(_, let body, _, _, _, _, _, _)? = result else { return XCTFail("expected text") }
        XCTAssertEqual(body, "The Tragedy of Hamlet, Prince of Denmark, often shortened to Hamlet, is a tragedy written by William Shakespeare sometime between 1599 and 1601.")
    }

    func testUnshapedQuestionSkipsListsAndTakesTheNextHit() async {
        StubProtocol.searchTitles = ["List of rivers of Canada", "Fraser River"]
        StubProtocol.summaries = ["Fraser River": ["title": "Fraser River", "extract": "The Fraser River is the longest river in British Columbia."]]
        let result = await QueryEngine().queryWikipedia("fraser river", session: session)
        guard case .text(let heading, let body, _, _, _, _, _, _)? = result else { return XCTFail("expected text") }
        XCTAssertEqual(heading, "Fraser River")
        XCTAssertEqual(body, "The Fraser River is the longest river in British Columbia.")
    }
}
