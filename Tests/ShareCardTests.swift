import XCTest
import ImageIO
@testable import Nimble

@MainActor
final class ShareCardTests: XCTestCase {
    func testShareContentPerKind() {
        XCTAssertEqual(QueryResult.math("36").shareContent?.text, "36")
        XCTAssertEqual(QueryResult.math("36").shareContent?.source, "Computed offline")
        XCTAssertEqual(QueryResult.convert(from: "5", to: "8.04672", fromUnit: "mi", toUnit: "km").shareContent?.source, "Computed offline")
        XCTAssertEqual(QueryResult.graph(expr: "x^2", points: []).shareContent?.text, "y = x^2")
        let text = QueryResult.text(heading: nil, body: "Ottawa is the capital of Canada.", source: "Wikipedia", sourceURL: nil, imageURL: nil)
        XCTAssertEqual(text.shareContent?.text, "Ottawa is the capital of Canada.")
        XCTAssertEqual(text.shareContent?.source, "Wikipedia")
        let card = QueryResult.card(big: "12", unit: "°C", sub: "Vancouver", source: "Open-Meteo", url: nil)
        XCTAssertEqual(card.shareContent?.source, "Open-Meteo")
    }

    func testNothingToShareWithoutAnAnswer() {
        XCTAssertNil(QueryResult.none.shareContent)
        XCTAssertNil(QueryResult.loading.shareContent)
        XCTAssertNil(QueryResult.error("offline", searchURL: nil).shareContent)
    }

    func testCardRendersAt1200By630() throws {
        let data = try XCTUnwrap(ShareCardRenderer.png(question: "15% of 240", answer: "36", source: "Computed offline"))
        let src = try XCTUnwrap(CGImageSourceCreateWithData(data as CFData, nil))
        let image = try XCTUnwrap(CGImageSourceCreateImageAtIndex(src, 0, nil))
        XCTAssertEqual(image.width, 1200)
        XCTAssertEqual(image.height, 630)
        // Kept in the temp folder so the render can be looked at after a run.
        try data.write(to: FileManager.default.temporaryDirectory.appendingPathComponent("nimble-share-test.png"))
    }
}
