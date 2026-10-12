import XCTest
@testable import Nimble

/// Rich results, offline: a photo rides on the card only when its rules pass, and news stories carry their own picture.
final class RichPhotoTests: XCTestCase {
    let engine = QueryEngine()

    func testWikipediaLeadPhotoKeepsSizeAndSkipsLogos() {
        let photo = AnswerPhoto.wikipediaLead("https://upload.wikimedia.org/wikipedia/commons/thumb/e/ev/Everest.jpg", width: 800, height: 533)
        XCTAssertEqual(photo, AnswerPhoto(url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ev/Everest.jpg", width: 800, height: 533))
        XCTAssertNil(AnswerPhoto.wikipediaLead("https://upload.wikimedia.org/wikipedia/en/thumb/b/ba/Eiffel_Tower_logo.svg/330px-Eiffel_Tower_logo.svg.png"))
        XCTAssertNil(AnswerPhoto.wikipediaLead("https://upload.wikimedia.org/wikipedia/en/thumb/c/c3/Flag_of_France.svg/960px-Flag.svg.png"))
        XCTAssertNil(AnswerPhoto.wikipediaLead(nil))
    }

    func testPhotosAreHttpsOnly() {
        XCTAssertNil(AnswerPhoto.https("http://example.com/x.jpg"))
        XCTAssertNil(AnswerPhoto.https(nil))
        XCTAssertNotNil(AnswerPhoto.https("https://example.com/x.jpg"))
    }

    func testNewsDecodesEachStoryPicture() {
        let json = """
        {"items":[
          {"title":"Story one","sentence":"First story happened today.","outlet":"BBC","url":"https://www.bbc.com/news/1","image":{"url":"https://ichef.bbci.co.uk/a.jpg","width":240,"height":135}},
          {"title":"Story two","sentence":"Second story happened.","outlet":"CBC","url":"https://www.cbc.ca/news/2","image":null},
          {"title":"Story three","sentence":"Third story happened.","outlet":"NPR","url":"https://www.npr.org/3"}
        ]}
        """
        guard case let .news(items, _)? = QueryEngine.newsResult(json: Data(json.utf8)) else { return XCTFail("expected a news card") }
        XCTAssertEqual(items[0].image, AnswerPhoto(url: "https://ichef.bbci.co.uk/a.jpg", width: 240, height: 135))
        XCTAssertEqual(items[0].title, "Story one")
        XCTAssertNil(items[1].image)
        XCTAssertNil(items[2].image)
    }

    func testSiteOpenGraphImageBecomesThePhotoAndTheFaviconSteps() {
        let html = "<title>Acme</title><meta property=\"og:image\" content=\"https://acme.io/share.png\"><meta name=\"description\" content=\"Ship faster.\">"
        guard case .text(_, _, _, _, let icon, _, _, let photo)? = engine.parseSite(html: html, host: "acme.io", pageURL: "https://acme.io/") else { return XCTFail("no answer") }
        XCTAssertEqual(photo?.url, "https://acme.io/share.png")
        XCTAssertNil(icon)
    }

    func testRelativeOpenGraphImageResolvesAgainstTheHost() {
        let html = "<title>Acme</title><meta content=\"/share.png\" property=\"og:image\"><meta name=\"description\" content=\"Ship faster.\">"
        guard case .text(_, _, _, _, _, _, _, let photo)? = engine.parseSite(html: html, host: "acme.io", pageURL: "https://acme.io/") else { return XCTFail("no answer") }
        XCTAssertEqual(photo?.url, "https://acme.io/share.png")
    }

    func testSiteWithoutImageKeepsTheFavicon() {
        let html = "<title>Acme</title><meta name=\"description\" content=\"Ship faster.\">"
        guard case .text(_, _, _, _, let icon, _, _, let photo)? = engine.parseSite(html: html, host: "acme.io", pageURL: "https://acme.io/") else { return XCTFail("no answer") }
        XCTAssertNil(photo)
        XCTAssertEqual(icon, "https://www.google.com/s2/favicons?domain=acme.io&sz=64")
    }

    func testHttpOpenGraphImageIsRefused() {
        let html = "<title>Acme</title><meta property=\"og:image\" content=\"http://acme.io/share.png\"><meta name=\"description\" content=\"Ship faster.\">"
        guard case .text(_, _, _, _, _, _, _, let photo)? = engine.parseSite(html: html, host: "acme.io", pageURL: "https://acme.io/") else { return XCTFail("no answer") }
        XCTAssertNil(photo)
    }

    func testAnswerPhotoComesFromThePageThatBacksTheSentence() {
        let everest = AnswerPhoto(url: "https://upload.wikimedia.org/wikipedia/commons/e/ev/Everest.jpg", width: 800, height: 533)
        let pages = [
            GroundingPage(title: "Flag", extract: "The flag of Nepal has a crimson border and a blue frame.", photo: AnswerPhoto(url: "https://upload.wikimedia.org/wikipedia/commons/n/Flag_of_Nepal.svg.png", width: 800, height: 600)),
            GroundingPage(title: "Mount Everest", extract: "Mount Everest is Earth's highest mountain above sea level, 8,848 meters tall.", photo: everest),
        ]
        XCTAssertEqual(QueryEngine.answerPhoto("Mount Everest is 8,848.86 meters tall.", pages: pages), everest)
    }

    func testAnswerPhotoIsNilWhenNoPageBacksTheSentenceOrHasAPhoto() {
        let unrelated = GroundingPage(title: "Hamlet", extract: "Hamlet is a tragedy written by William Shakespeare.", photo: AnswerPhoto(url: "https://upload.wikimedia.org/hamlet.jpg", width: nil, height: nil))
        XCTAssertNil(QueryEngine.answerPhoto("Mount Everest is 8,848.86 meters tall.", pages: [unrelated]))
        let bare = GroundingPage(title: "Mount Everest", extract: "Mount Everest is 8,848 meters tall.", photo: nil)
        XCTAssertNil(QueryEngine.answerPhoto("Mount Everest is 8,848.86 meters tall.", pages: [bare]))
        XCTAssertNil(QueryEngine.answerPhoto("UNKNOWN", pages: [unrelated]))
    }

    func testKeepingPhotoFillsOnlyAnEmptySlot() {
        let llm = QueryResult.text(heading: nil, body: "Mount Everest is 8,848 meters tall.", source: "Qwen", sourceURL: nil, imageURL: nil,
                                   photo: AnswerPhoto(url: "https://upload.wikimedia.org/everest.jpg", width: nil, height: nil))
        let ddg = QueryResult.text(heading: "Everest", body: "8,848 m", source: "Britannica", sourceURL: "https://example.com", imageURL: nil)
        guard case .text(_, _, _, _, _, _, _, let filled) = QueryEngine.keepingPhoto(ddg, from: llm) else { return XCTFail("no text") }
        XCTAssertEqual(filled?.url, "https://upload.wikimedia.org/everest.jpg")
        let own = QueryResult.text(heading: nil, body: "8,848 m", source: "DDG", sourceURL: nil, imageURL: nil, photo: AnswerPhoto(url: "https://a.org/own.jpg", width: nil, height: nil))
        guard case .text(_, _, _, _, _, _, _, let kept) = QueryEngine.keepingPhoto(own, from: llm) else { return XCTFail("no text") }
        XCTAssertEqual(kept?.url, "https://a.org/own.jpg")
    }

    /// The proxy names its Wikipedia page; older proxies send no topic, and a non-Wikipedia link is refused.
    func testProxyTopicDecodesAndNamesItsPage() throws {
        let json = """
        {"answer":"Hamlet was written by William Shakespeare.","source":"Gemma + Qwen",
         "image":{"url":"https://upload.wikimedia.org/h.jpg","width":800,"height":600},
         "refs":[{"title":"Hamlet","url":"https://en.wikipedia.org/wiki/Hamlet","extract":"Hamlet is a tragedy by William Shakespeare."}],
         "topic":"Hamlet","topicUrl":"https://en.wikipedia.org/wiki/Hamlet"}
        """
        let reply = try JSONDecoder().decode(ProxyReply.self, from: Data(json.utf8))
        let named = try XCTUnwrap(reply.namedTopic)
        XCTAssertEqual(named.title, "Hamlet")
        XCTAssertEqual(named.url, "https://en.wikipedia.org/wiki/Hamlet")
        XCTAssertEqual(named.grounding, "Hamlet is a tragedy by William Shakespeare.")
    }

    func testOldProxyReplyWithoutTopicStillDecodes() throws {
        let json = #"{"answer":"Paris.","source":"Qwen","refs":[{"title":"Paris","url":"https://en.wikipedia.org/wiki/Paris","extract":"Paris is a city."}]}"#
        let reply = try JSONDecoder().decode(ProxyReply.self, from: Data(json.utf8))
        XCTAssertNil(reply.namedTopic)
        XCTAssertEqual(reply.refs?.first?.title, "Paris")
    }

    func testProxyTopicRefusesNonWikipediaLinks() throws {
        let json = #"{"answer":"Paris.","topic":"Paris","topicUrl":"https://evil.example/Paris"}"#
        let reply = try JSONDecoder().decode(ProxyReply.self, from: Data(json.utf8))
        XCTAssertNil(reply.namedTopic)
    }
}
