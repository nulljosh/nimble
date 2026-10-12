import XCTest
@testable import Nimble

/// Answer topics: the Wikipedia page an answer names supplies its picture and its "Why" text. The network is a
/// URLProtocol stub, so these run offline and count every request they would have made.
final class TopicPhotoTests: XCTestCase {
    private final class StubProtocol: URLProtocol {
        /// Wikipedia page title to REST summary JSON; a search returns `searchTitles`.
        nonisolated(unsafe) static var summaries: [String: [String: Any]] = [:]
        nonisolated(unsafe) static var searchTitles: [String] = []
        nonisolated(unsafe) static var requested: [URL] = []

        override class func canInit(with request: URLRequest) -> Bool { true }
        override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

        override func startLoading() {
            guard let url = request.url else {
                client?.urlProtocol(self, didFailWithError: URLError(.badURL))
                return
            }
            StubProtocol.requested.append(url)
            var code = 404
            var data = Data()
            if url.absoluteString.contains("list=search") {
                code = 200
                data = try! JSONSerialization.data(withJSONObject: ["query": ["search": StubProtocol.searchTitles.map { ["title": $0] }]])
            } else if let range = url.absoluteString.range(of: "/page/summary/") {
                let title = String(url.absoluteString[range.upperBound...]).removingPercentEncoding ?? ""
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

    private let paris: [String: Any] = [
        "title": "Paris",
        "extract": "Paris is the capital and most populous city of France.",
        "thumbnail": ["source": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/Paris.jpg/800px-Paris.jpg", "width": 800, "height": 533],
        "content_urls": ["desktop": ["page": "https://en.wikipedia.org/wiki/Paris"]],
    ]

    private var session: URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubProtocol.self]
        return URLSession(configuration: config)
    }

    override func setUp() {
        super.setUp()
        StubProtocol.summaries = [:]
        StubProtocol.searchTitles = []
        StubProtocol.requested = []
    }

    func testTopicPhotoComesFromTheNamedEntityWithItsCredit() async {
        StubProtocol.summaries["Paris"] = paris
        let topic = await QueryEngine.topicLookup(query: "What is the capital of France?", body: "The capital of France is Paris.", session: session)
        XCTAssertEqual(topic?.photo?.title, "Paris")
        XCTAssertEqual(topic?.photo?.url, "https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/Paris.jpg/800px-Paris.jpg")
        XCTAssertEqual(topic?.extract, "Paris is the capital and most populous city of France.")
        XCTAssertEqual(topic?.page, "https://en.wikipedia.org/wiki/Paris")
    }

    func testMathUnitsWeatherAndTimeNeverLookForAPhoto() async {
        StubProtocol.summaries["Paris"] = paris
        for query in ["what is 2 plus 3", "convert 5 miles to km", "weather in Paris", "what time is it in Paris"] {
            let topic = await QueryEngine.topicLookup(query: query, body: "Paris is the answer.", session: session)
            XCTAssertNil(topic, query)
        }
        XCTAssertTrue(StubProtocol.requested.isEmpty)
    }

    func testALogoOnlyTopicGivesTheTextAndNoPicture() async {
        StubProtocol.summaries["Paris"] = [
            "title": "Paris",
            "extract": "Paris is the capital of France.",
            "thumbnail": ["source": "https://upload.wikimedia.org/wikipedia/en/thumb/b/ba/Paris_logo.svg/330px-Paris_logo.svg.png", "width": 330, "height": 423],
            "content_urls": ["desktop": ["page": "https://en.wikipedia.org/wiki/Paris"]],
        ]
        let topic = await QueryEngine.topicLookup(query: "What is the capital of France?", body: "The capital of France is Paris.", session: session)
        XCTAssertNil(topic?.photo)
        XCTAssertEqual(topic?.extract, "Paris is the capital of France.")
    }

    func testADisambiguationPageIsSkipped() async {
        StubProtocol.summaries["Paris"] = ["title": "Paris", "type": "disambiguation", "extract": "Paris may refer to:", "content_urls": ["desktop": ["page": "https://en.wikipedia.org/wiki/Paris"]]]
        let topic = await QueryEngine.topicLookup(query: "What is the capital of France?", body: "The capital of France is Paris.", session: session)
        XCTAssertNil(topic)
    }

    func testTheSearchHitsGiveTheTextButNeverThePhotoWhenTheAnswerNamesNothing() async {
        StubProtocol.searchTitles = ["List of rivers", "Paris"]
        StubProtocol.summaries["Paris"] = paris
        let topic = await QueryEngine.topicLookup(query: "largest city in france", body: "It is big.", session: session)
        XCTAssertNil(topic?.photo)
        XCTAssertEqual(topic?.page, "https://en.wikipedia.org/wiki/Paris")
    }

    func testThePhotoIsTheAnswersEntityNotTheEarthPageTheQuestionFound() async {
        StubProtocol.searchTitles = ["Earth"]
        StubProtocol.summaries["Earth"] = ["title": "Earth", "extract": "Earth is the third planet from the Sun.",
                                           "thumbnail": ["source": "https://upload.wikimedia.org/earth.jpg", "width": 800, "height": 600]]
        StubProtocol.summaries["Jupiter"] = ["title": "Jupiter", "extract": "Jupiter is the largest planet in the Solar System.",
                                             "thumbnail": ["source": "https://upload.wikimedia.org/jupiter.jpg", "width": 800, "height": 600],
                                             "content_urls": ["desktop": ["page": "https://en.wikipedia.org/wiki/Jupiter"]]]
        let topic = await QueryEngine.topicLookup(query: "largest planet", body: "Jupiter is the largest planet.", session: session)
        XCTAssertEqual(topic?.photo?.title, "Jupiter")
        XCTAssertEqual(topic?.photo?.url, "https://upload.wikimedia.org/jupiter.jpg")
    }

    func testAPageThatNeverNamesTheEntityGivesNoPhoto() async {
        StubProtocol.summaries["Jupiter"] = ["title": "Jupiter", "extract": "A gas giant with a ring system.",
                                             "thumbnail": ["source": "https://upload.wikimedia.org/jupiter.jpg", "width": 800, "height": 600]]
        let topic = await QueryEngine.topicLookup(query: "largest planet", body: "Jupiter is the largest planet.", session: session)
        XCTAssertNil(topic?.photo)
    }

    func testWithTopicFillsTheWhyTextAndLinksThePageWhenNothingElseBacksTheAnswer() async {
        StubProtocol.summaries["Paris"] = paris
        let answer = QueryResult.text(heading: nil, body: "The capital of France is Paris.", source: "Gemma + Qwen",
                                      sourceURL: nil, imageURL: nil)
        let result = await QueryEngine.withTopic(answer, query: "What is the capital of France?", session: session, enabled: true)
        guard case .text(_, _, _, let sourceURL, _, let grounding, _, let photo, _) = result else { return XCTFail("no text answer") }
        XCTAssertEqual(grounding, "Paris is the capital and most populous city of France.")
        XCTAssertEqual(sourceURL, "https://en.wikipedia.org/wiki/Paris")
        XCTAssertEqual(photo?.title, "Paris")
    }

    func testWithTopicKeepsTheAnswersOwnPhotoAndTextAndFetchesNothing() async {
        StubProtocol.summaries["Paris"] = paris
        let own = AnswerPhoto(url: "https://example.org/own.jpg", width: nil, height: nil)
        let answer = QueryResult.text(heading: nil, body: "The capital of France is Paris.", source: "Gemma + Qwen", sourceURL: nil,
                                      imageURL: nil, grounding: "Its own text.", photo: own)
        let result = await QueryEngine.withTopic(answer, query: "What is the capital of France?", session: session, enabled: true)
        guard case .text(_, _, _, _, _, let grounding, _, let kept, _) = result else { return XCTFail("no text answer") }
        XCTAssertEqual(grounding, "Its own text.")
        XCTAssertEqual(kept, own)
        XCTAssertTrue(StubProtocol.requested.isEmpty)
    }

    func testWithTopicDoesNothingWhenItIsNotAllowed() async {
        StubProtocol.summaries["Paris"] = paris
        let answer = QueryResult.text(heading: nil, body: "The capital of France is Paris.", source: "Wikipedia", sourceURL: nil, imageURL: nil)
        let result = await QueryEngine.withTopic(answer, query: "What is the capital of France?", session: session, enabled: false)
        guard case .text(_, _, _, let sourceURL, _, let grounding, _, let photo, _) = result else { return XCTFail("no text answer") }
        XCTAssertNil(sourceURL)
        XCTAssertNil(grounding)
        XCTAssertNil(photo)
        XCTAssertTrue(StubProtocol.requested.isEmpty)
    }

    func testAnSVGDiagramsRenderedPNGIsAPhotoButARawSVGIsNot() {
        XCTAssertNotNil(AnswerPhoto.wikipediaLead("https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Photosynthesis_diagram.svg/800px-Photosynthesis_diagram.svg.png", width: 800, height: 600))
        XCTAssertNil(AnswerPhoto.wikipediaLead("https://upload.wikimedia.org/wikipedia/commons/a/a4/Photosynthesis_diagram.svg"))
        XCTAssertNil(AnswerPhoto.wikipediaLead("https://upload.wikimedia.org/wikipedia/commons/a/a4/Diagram.gif"))
    }
}
