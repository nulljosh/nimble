import XCTest
@testable import Nimble

/// Multiple sources per answer. Offline: the rule is tested on plain values, no network.
final class SourcesTests: XCTestCase {
    private func text(_ body: String, url: String?, source: String, grounding: String? = nil) -> QueryResult {
        .text(heading: nil, body: body, source: source, sourceURL: url, imageURL: nil, grounding: grounding)
    }

    func testAgreesWithAParaphraseAndRejectsUnrelatedOrWrongNumbers() {
        XCTAssertTrue(AnswerSources.agrees("Ottawa is the capital of Canada.", "Ottawa is the capital city of Canada, in Ontario."))
        XCTAssertFalse(AnswerSources.agrees("Ottawa is the capital of Canada.", "Paris is in France."))
        XCTAssertFalse(AnswerSources.agrees("It costs 40 dollars.", "It costs about dollars."))
        XCTAssertFalse(AnswerSources.agrees("Anything.", ""))
    }

    func testPrimaryComesFirstDedupedByURLAndCappedAtThree() {
        let body = "Ottawa is the capital of Canada."
        let candidates: [QueryResult] = [
            text(body, url: "https://en.wikipedia.org/wiki/Ottawa", source: "Wikipedia"),
            text(body, url: "https://en.wikipedia.org/wiki/Ottawa", source: "Wikipedia"),
            text("Ottawa is the capital city of Canada.", url: "https://britannica.example/ottawa", source: "Britannica"),
            text("Bananas are a yellow fruit.", url: "https://other.example/x", source: "Other"),
            text("Ottawa is the capital of Canada.", url: "https://fourth.example/y", source: "Fourth"),
            text("Ottawa is the capital of Canada.", url: "https://fifth.example/z", source: "Fifth"),
        ]
        let sources = AnswerSources.linked(body: body, candidates: candidates)
        XCTAssertEqual(sources.map(\.name), ["Wikipedia", "Britannica", "Fourth"])
    }

    func testAnUnlinkedModelAnswerTakesTheAgreeingLinkOnly() {
        let model = QueryResult.text(heading: nil, body: "Ottawa is the capital of Canada.", source: "Gemma + Qwen", sourceURL: nil, imageURL: nil)
        let ddg = text("Ottawa is the capital city of Canada, in Ontario.", url: "https://en.wikipedia.org/wiki/Ottawa", source: "Wikipedia")
        XCTAssertEqual(AnswerSources.linked(body: "Ottawa is the capital of Canada.", candidates: [model, ddg]),
                       [AnswerSource(name: "Wikipedia", url: "https://en.wikipedia.org/wiki/Ottawa")])
        let unrelated = text("Bananas are a yellow fruit.", url: "https://example.org/banana", source: "Fruit")
        XCTAssertEqual(AnswerSources.linked(body: "Ottawa is the capital of Canada.", candidates: [model, unrelated]), [])
    }

    func testTextResultsWithoutLinksProduceNoSources() {
        let plain = text("Only a sentence.", url: nil, source: "On device")
        XCTAssertEqual(AnswerSources.linked(body: "Only a sentence.", candidates: [plain]), [])
    }

    func testOldPositionalFieldsStillReadTheSamePrimary() {
        let result = QueryResult.text(heading: "Acme", body: "Payments.", source: "acme.io", sourceURL: "https://acme.io",
                                      imageURL: nil, grounding: nil, sources: [AnswerSource(name: "acme.io", url: "https://acme.io")])
        XCTAssertEqual(result.copyText, "Payments.")
        XCTAssertEqual(result.shareContent?.source, "acme.io")
    }
}
