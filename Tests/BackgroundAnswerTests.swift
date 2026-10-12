import XCTest
@testable import Nimble

/// Background answers: the generic topic page for a specific question is flagged, not presented as the answer.
/// The card's header word, its caption and the resting note's place are model-level, so they test without a view.
final class BackgroundAnswerTests: XCTestCase {
    private static let note = "The free AI is out of answers for today, so this is from Wikipedia. It resets in the evening."
    private static let rainbow = "A rainbow is an optical phenomenon caused by refraction, internal reflection and dispersion of light in water droplets."

    private func wikiText(heading: String, body: String) -> QueryResult {
        .text(heading: heading, body: body, source: "Wikipedia", sourceURL: "https://en.wikipedia.org/wiki/\(heading)", imageURL: nil)
    }

    func testGenericTopicForASpecificQuestionIsBackground() {
        let labeled = QueryEngine.labeledIfGeneric(wikiText(heading: "Rainbow", body: Self.rainbow),
                                                   question: "What was the first color photograph of a rainbow?")
        guard case .text(_, let body, _, _, _, _, _, _, let background) = labeled else { return XCTFail("expected text") }
        XCTAssertTrue(background)
        XCTAssertEqual(body, Self.rainbow, "the body is the page's sentence, unchanged")
    }

    func testADirectQuestionStaysAnAnswer() {
        let kept = QueryEngine.labeledIfGeneric(wikiText(heading: "Speed of light", body: "Light travels at 299,792 km/s."),
                                                question: "What is the speed of light?")
        guard case .text(_, _, _, _, _, _, _, _, let background) = kept else { return XCTFail("expected text") }
        XCTAssertFalse(background)
    }

    func testPlainTextDefaultsToAnAnswer() {
        guard case .text(_, _, _, _, _, _, _, _, let background) = wikiText(heading: "Ottawa", body: "Ottawa is the capital.") else {
            return XCTFail("expected text")
        }
        XCTAssertFalse(background)
    }

    func testKeepingAPhotoKeepsTheBackgroundFlag() {
        let bg = QueryEngine.labeledIfGeneric(wikiText(heading: "Rainbow", body: Self.rainbow),
                                              question: "What was the first color photograph of a rainbow?")
        let photo = AnswerPhoto(url: "https://upload.wikimedia.org/rainbow.jpg", width: nil, height: nil)
        let other = QueryResult.text(heading: nil, body: "x", source: "Wikipedia", sourceURL: nil, imageURL: nil, photo: photo)
        guard case .text(_, _, _, _, _, _, _, let kept, let background) = QueryEngine.keepingPhoto(bg, from: other) else {
            return XCTFail("expected text")
        }
        XCTAssertEqual(kept, photo)
        XCTAssertTrue(background, "filling the photo must not drop the background flag")
    }

    func testHeaderReadsBackgroundOnlyForBackground() {
        XCTAssertEqual(QueryResult.eyebrow(background: true), "Background")
        XCTAssertEqual(QueryResult.eyebrow(background: false), "Answer")
    }

    func testLeadLinesMergeTheRestingNoteAndTheCaptionIntoOneLine() {
        let both = QueryResult.leadLines(background: true, aiError: "capacity", source: "Wikipedia")
        XCTAssertEqual(both, [Self.note + " " + QueryResult.backgroundCaption])
        XCTAssertEqual(QueryResult.backgroundCaption, "Not a direct answer to your question. Background from Wikipedia:")
    }

    func testLeadLinesForEachCase() {
        XCTAssertEqual(QueryResult.leadLines(background: false, aiError: "capacity", source: "Wikipedia"), [Self.note])
        XCTAssertEqual(QueryResult.leadLines(background: true, aiError: nil, source: "Wikipedia"), [QueryResult.backgroundCaption])
        XCTAssertEqual(QueryResult.leadLines(background: false, aiError: nil, source: "Wikipedia"), [])
        XCTAssertEqual(QueryResult.leadLines(background: false, aiError: "capacity", source: "DuckDuckGo"), [])
    }

    func testTheCaptionNeverEntersTheCopiedOrSharedText() {
        let bg = QueryEngine.labeledIfGeneric(wikiText(heading: "Rainbow", body: Self.rainbow),
                                              question: "What was the first color photograph of a rainbow?")
        XCTAssertEqual(bg.copyText, Self.rainbow)
        XCTAssertFalse(bg.copyText?.contains("Not a direct") ?? true)
    }
}
