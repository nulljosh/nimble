import Foundation

/// QA only. Off unless a screenshot launch passes `-shotStub YES`. Answers the ESPN scoreboard and CoinGecko
/// with fixed JSON so a screenshot shows the same card on every run. Nothing else is intercepted.
final class QAStubProtocol: URLProtocol {
    private static let nba = #"""
    {"events":[{"id":"qa1","date":"2026-10-12T02:30Z","name":"Golden State Warriors at Los Angeles Lakers","shortName":"GS @ LAL",
    "status":{"period":4,"displayClock":"0:00","type":{"name":"STATUS_FINAL","state":"post","completed":true,"description":"Final","detail":"Final","shortDetail":"Final"}},
    "competitions":[{"competitors":[
    {"homeAway":"home","winner":true,"score":"112","team":{"name":"Lakers","displayName":"Los Angeles Lakers","shortDisplayName":"Lakers"}},
    {"homeAway":"away","winner":false,"score":"104","team":{"name":"Warriors","displayName":"Golden State Warriors","shortDisplayName":"Warriors"}}]}]}]}
    """#

    /// Registers the stub for every session that uses the shared protocol list. Called once, from the QA launch only.
    static func install() {
        URLProtocol.registerClass(QAStubProtocol.self)
    }

    override class func canInit(with request: URLRequest) -> Bool {
        let host = request.url?.host ?? ""
        return host == "site.api.espn.com" || host == "api.coingecko.com"
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let url = request.url!
        let body: String
        if url.host == "api.coingecko.com" {
            let now = Date().timeIntervalSince1970
            body = #"{"bitcoin":{"usd":64215.4,"usd_24h_change":1.82,"last_updated_at":\#(Int(now))}}"#
        } else if url.path.contains("basketball/nba") {
            body = Self.nba
        } else {
            body = #"{"events":[]}"#
        }
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil,
                                       headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
