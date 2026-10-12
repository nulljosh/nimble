#if os(macOS)
import XCTest
@testable import Nimble

final class SamanthaStatusTests: XCTestCase {
    func testParsesFirstModelID() {
        let body = #"{"object":"list","data":[{"id":"Qwen3.5-9B-OptiQ-4bit","object":"model","owned_by":"omlx"},{"id":"second","object":"model"}]}"#
        XCTAssertEqual(SamanthaStatus.parse(Data(body.utf8)), "Qwen3.5-9B-OptiQ-4bit")
    }

    func testEmptyModelListIsNil() {
        XCTAssertNil(SamanthaStatus.parse(Data(#"{"object":"list","data":[]}"#.utf8)))
    }

    func testGarbageIsNil() {
        XCTAssertNil(SamanthaStatus.parse(Data("<html>not json</html>".utf8)))
        XCTAssertNil(SamanthaStatus.parse(Data("{}".utf8)))
    }
}
#endif
