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
}
