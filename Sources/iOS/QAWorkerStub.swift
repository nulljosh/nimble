#if DEBUG
import Foundation

/// QA only (Debug builds, launched with `-shotStub YES`): the free Worker answers with the quota-out reply,
/// so the resting note can be shot without spending the daily allocation. Every other host is untouched.
final class QAWorkerStub: URLProtocol {
    static func install() {
        URLProtocol.registerClass(QAWorkerStub.self)
    }

    override class func canInit(with request: URLRequest) -> Bool {
        request.url?.host == "nimble-answers.trommatic.workers.dev"
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let url = request.url else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL))
            return
        }
        let body = #"{"answer":"UNKNOWN","aiError":"AiError: daily free allocation exceeded"}"#
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
#endif
