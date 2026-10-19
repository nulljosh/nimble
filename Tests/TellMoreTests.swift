import XCTest
@testable import Nimble

/// Tell me more, offline: the worker's three sentences come back as the answer, and UNKNOWN or a failure is nil
/// (the one-liner then stands). Same cases as test/tell-more.test.js.
final class TellMoreTests: XCTestCase {
    private final class Stub: URLProtocol {
        nonisolated(unsafe) static var reply: [String: Any] = [:]
        override class func canInit(with request: URLRequest) -> Bool { true }
        override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
        override func startLoading() {
            let data = try! JSONSerialization.data(withJSONObject: Stub.reply)
            client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        }
        override func stopLoading() {}
    }

    private func session() -> URLSession {
        let c = URLSessionConfiguration.ephemeral
        c.protocolClasses = [Stub.self]
        return URLSession(configuration: c)
    }

    func testThreeSentencesComeBack() async {
        Stub.reply = ["answer": "Paris is the capital of France. It sits on the Seine. About two million live there.", "source": "Groq"]
        let more = await QueryEngine.tellMore("capital of france", session: session())
        XCTAssertEqual(more, "Paris is the capital of France. It sits on the Seine. About two million live there.")
    }

    func testUnknownIsNil() async {
        Stub.reply = ["answer": "UNKNOWN"]
        let more = await QueryEngine.tellMore("asdfgh", session: session())
        XCTAssertNil(more)
    }
}
