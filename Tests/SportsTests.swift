import XCTest
@testable import Nimble

/// Answers ESPN's scoreboard offline. Each request is recorded as "league|dates" in order, so a test can show
/// which days were asked. Mirrors the fetch stub in test/sports.test.js.
final class SportsStub: URLProtocol {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var routes: [String: Result<Data, Error>] = [:]
    nonisolated(unsafe) private static var calls: [String] = []

    /// A route is a body, a failure, or (absent) an empty day with no games.
    static func reset(_ routes: [String: Result<Data, Error>]) {
        lock.lock(); defer { lock.unlock() }
        self.routes = routes
        calls = []
    }

    static func requested() -> [String] {
        lock.lock(); defer { lock.unlock() }
        return calls
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let url = request.url!
        let league = url.path.replacingOccurrences(of: "/apis/site/v2/sports/", with: "").replacingOccurrences(of: "/scoreboard", with: "")
        let dates = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "dates" }?.value ?? ""
        let key = "\(league)|\(dates)"
        SportsStub.lock.lock()
        SportsStub.calls.append(key)
        let route = SportsStub.routes[key]
        SportsStub.lock.unlock()
        switch route {
        case .failure(let error)?:
            client?.urlProtocol(self, didFailWithError: error)
        case .success(let data)?:
            respond(data)
        case nil:
            respond(Data(#"{"events":[]}"#.utf8))
        }
    }

    private func respond(_ data: Data) {
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

final class SportsTests: XCTestCase {
    private let tz = TimeZone(identifier: "America/Vancouver")!
    /// Oct 12, 2026, 1:00 pm in Vancouver.
    private let now = ISO8601DateFormatter().date(from: "2026-10-12T20:00:00Z")!

    private func fixture(_ name: String) -> Data {
        let url = Bundle(for: SportsTests.self).url(forResource: name, withExtension: "json")!
        return try! Data(contentsOf: url)
    }

    private var nfl1011: Data { fixture("espn-nfl-20261011") }   // Final, Final, Final/OT (Commanders and Giants tied)
    private var nfl1012: Data { fixture("espn-nfl-20261012") }   // Rams and Bills, not yet played
    /// ESPN's default scoreboard (no dates), saved live on Oct 12: Bucs 24 at Cowboys 16 (Final, Thu Oct 8 ET), Bears 7 at Packers 31, Bills at Rams.
    private var nflDefault: Data { fixture("espn-nfl-default") }
    /// ESPN's default NBA scoreboard, saved live on Oct 12: two preseason games, no Lakers.
    private var nbaDefault: Data { fixture("espn-nba-default") }

    private func session() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [SportsStub.self]
        return URLSession(configuration: config)
    }

    /// Runs one question against the stub with the routes given, at the fixed clock.
    private func lookup(_ query: String, _ routes: [String: Result<Data, Error>]) async -> SportsCard? {
        SportsStub.reset(routes)
        let engine = QueryEngine()
        return await engine.sports(query, now: now, tz: tz, session: session())
    }

    private func event(_ json: String) -> SportsEvent {
        try! JSONDecoder().decode(SportsEvent.self, from: Data(json.utf8))
    }

    private func board(_ events: Data, _ index: Int) -> SportsEvent {
        try! JSONDecoder().decode(SportsEvent.Board.self, from: events).events[index]
    }

    private func isSports(_ query: String) -> Bool { QueryEngine.sportsAsk(query) != nil }

    // MARK: - Detection

    func testTeamAndLeagueDetection() {
        for q in ["lakers score", "did the canucks win", "who won the lakers game", "canucks game last night", "lakers", "the canucks",
                  "bills score", "did the lakers win", "who won the bills game", "Lakers!?", "man city score", "kings score"] {
            XCTAssertNotNil(QueryEngine.sportsAsk(q), q)
        }
        XCTAssertEqual(QueryEngine.sportsAsk("canucks game last night")?.lastNight, true)
        XCTAssertEqual(QueryEngine.sportsAsk("lakers score")?.lastNight, false)
        for q in ["nfl scores", "premier league scores", "epl results", "NFL scores", "last night's nba scores"] {
            XCTAssertNotNil(QueryEngine.sportsAsk(q)?.league, q)
        }
        XCTAssertEqual(QueryEngine.sportsAsk("premier league scores")?.league, "epl")
    }

    func testDetectionNeverHijacksOtherQuestions() {
        for q in ["who won the war", "who won the world cup", "who is the president", "a+b", "2 + 2", "5 miles to km",
                  "bitcoin price", "AAPL", "AAPL stock", "NFL", "NBA", "weather in vancouver", "what is apple", "is apple good",
                  "heat", "jazz", "magic", "kings", "nets", "the sun", "bills due", "chicken nuggets", "how to heat soup",
                  "give me a magic trick", "lakers history", "who is the lakers coach", "news about the lakers", "lakers news yesterday",
                  "will the lakers win the title", "should I bet on the lakers", "why did the lakers lose", "how many wins do the lakers have"] {
            XCTAssertFalse(isSports(q), q)
        }
    }

    func testLeagueCodesStayOutOfTheTickerLookup() {
        for code in ["NFL", "NBA", "MLB", "NHL", "MLS", "EPL"] {
            XCTAssertNil(QueryEngine.stockSymbol(code), code)
        }
    }

    func testMathStillAnswersBeforeSports() {
        XCTAssertNil(QueryEngine.sportsAsk("2 + 2"))
        XCTAssertNotNil(QueryEngine().evaluateMath("2 + 2"))
    }

    // MARK: - Parsing a game

    func testFinishedGameHasOurTeamFirstAndTheWinnerMarked() {
        let ev = board(nfl1011, 0)
        let ours = QueryEngine.sportsFind([ev], keys: ["jacksonville jaguars", "jaguars"])!.index
        let game = QueryEngine.gameRow(ev, ours: ours, league: "nfl", now: now, tz: tz)
        XCTAssertEqual(game.teams, [SportsTeam(name: "Jaguars", score: "19", winner: true),
                                    SportsTeam(name: "Eagles", score: "17", winner: false)])
        XCTAssertEqual(game.status, "Final")
        XCTAssertFalse(game.isPre)
        XCTAssertEqual(game.line, "Jaguars 19, Eagles 17")
    }

    func testOvertimeTieSaysSoInWordsWithNoWinner() {
        let ev = board(nfl1011, 2)
        let ours = QueryEngine.sportsFind([ev], keys: ["washington commanders", "commanders"])!.index
        let game = QueryEngine.gameRow(ev, ours: ours, league: "nfl", now: now, tz: tz)
        XCTAssertEqual(game.status, "Final/OT, tied")
        XCTAssertTrue(game.teams.allSatisfy { !$0.winner })
    }

    func testGameBeforeKickoffShowsTheTimeInTheZoneAndNoScore() {
        let ev = board(nfl1012, 0)
        let ours = QueryEngine.sportsFind([ev], keys: ["buffalo bills", "bills"])!.index
        let game = QueryEngine.gameRow(ev, ours: ours, league: "nfl", now: now, tz: tz)
        XCTAssertEqual(game.status, "Scheduled for 5:15 pm")
        XCTAssertEqual(game.teams.map(\.name), ["Bills", "Rams"])
        XCTAssertTrue(game.teams.allSatisfy { $0.score.isEmpty })
        XCTAssertEqual(game.line, "Bills vs Rams")
    }

    func testKickoffOnAnotherDayNamesTheDay() {
        XCTAssertEqual(QueryEngine.kickoffLabel("2026-10-13T00:15Z", now: ISO8601DateFormatter().date(from: "2026-10-11T20:00:00Z")!, tz: tz), "Oct 12, 5:15 pm")
        XCTAssertEqual(QueryEngine.kickoffLabel("not a date", now: now, tz: tz), "")
    }

    func testLiveStatusInWordsForQuartersAndPeriodsAndESPNTextForTheRest() {
        func live(_ league: String, _ status: String) -> String {
            let ev = event(#"{"date":"2026-10-12T20:15Z","status":\#(status)}"#)
            return QueryEngine.sportsStatus(ev, league: league, now: now, tz: tz)
        }
        XCTAssertEqual(live("nfl", #"{"period":3,"displayClock":"4:12","type":{"name":"STATUS_IN_PROGRESS","state":"in","detail":"3rd Quarter - 4:12","shortDetail":"4:12 - 3rd"}}"#), "3rd quarter 4:12")
        XCTAssertEqual(live("nhl", #"{"period":2,"displayClock":"12:04","type":{"name":"STATUS_IN_PROGRESS","state":"in","detail":"2nd Period - 12:04","shortDetail":"2nd 12:04"}}"#), "2nd period 12:04")
        XCTAssertEqual(live("nfl", #"{"period":5,"displayClock":"3:00","type":{"name":"STATUS_IN_PROGRESS","state":"in","detail":"OT - 3:00","shortDetail":"3:00 - OT"}}"#), "3:00 - OT")
        XCTAssertEqual(live("nfl", #"{"period":2,"displayClock":"0:00","type":{"name":"STATUS_HALFTIME","state":"in","detail":"Halftime","shortDetail":"Halftime"}}"#), "Halftime")
        XCTAssertEqual(live("mlb", #"{"period":5,"displayClock":"0:00","type":{"name":"STATUS_FINAL","state":"post","detail":"Final/OT","shortDetail":"Final/OT"}}"#), "Final/OT")
        XCTAssertEqual(live("epl", #"{"period":1,"displayClock":"32'","type":{"name":"STATUS_IN_PROGRESS","state":"in","detail":"32'","shortDetail":"32'"}}"#), "32'")
    }

    // MARK: - Days asked

    func testTodayHasTheGameWithOneBoardCall() async {
        let card = await lookup("bills score", ["football/nfl|20261012": .success(nfl1012)])
        XCTAssertEqual(card?.title, "Bills")
        XCTAssertEqual(card?.games.first?.teams.first?.name, "Bills")
        XCTAssertEqual(card?.games.first?.isPre, true)
        XCTAssertEqual(SportsStub.requested(), ["football/nfl|20261012"])
    }

    func testDateFallbackAsksTodayThenYesterday() async {
        let card = await lookup("did the jaguars win", ["football/nfl|20261011": .success(nfl1011)])
        // The Final is followed by one call for the team's next game (none listed, so one row).
        XCTAssertEqual(SportsStub.requested(), ["football/nfl|20261012", "football/nfl|20261011", "football/nfl/teams/30|"])
        XCTAssertEqual(card?.games.count, 1)
        XCTAssertEqual(card?.games.first?.teams.first?.name, "Jaguars")
        XCTAssertEqual(card?.games.first?.teams.first?.winner, true)
        XCTAssertEqual(card?.games.first?.status, "Final")
        XCTAssertEqual(card?.outcome, .found)
    }

    func testLastNightIsYesterdayOnlyThenTheLookBack() async {
        let card = await lookup("canucks game last night", ["hockey/nhl|20261011": .success(Data(#"{"events":[]}"#.utf8))])
        XCTAssertEqual(Array(SportsStub.requested().prefix(2)), ["hockey/nhl|20261011", "hockey/nhl|"])
        XCTAssertFalse(SportsStub.requested().contains("hockey/nhl|20261012"))
        XCTAssertEqual(card?.outcome, .noGame(lastNight: true))
    }

    func testTeamInTwoLeaguesIsCheckedInEachBeforeCalledMissing() async {
        let card = await lookup("kings score", [:])
        XCTAssertEqual(Array(SportsStub.requested().prefix(4)), ["basketball/nba|20261012", "hockey/nhl|20261012",
                                                                 "basketball/nba|20261011", "hockey/nhl|20261011"])
        XCTAssertEqual(card?.outcome, .noGame(lastNight: false))
    }

    func testNoGameInTheLastWeekChecksEverySevenDaysBack() async {
        let card = await lookup("lakers score", ["basketball/nba|": .success(nbaDefault)])
        XCTAssertEqual(card?.outcome, .noGame(lastNight: false))
        XCTAssertEqual(card?.title, "Lakers")
        XCTAssertNil(card?.league)
        let days = (5...10).map { "basketball/nba|202610\(String(format: "%02d", $0))" }
        XCTAssertEqual(SportsStub.requested(), ["basketball/nba|20261012", "basketball/nba|20261011", "basketball/nba|"] + days.reversed())
        XCTAssertEqual(card?.asOf?.date, now)
    }

    func testCowboysOnTheCurrentBoardIsFinalAndDatedInWords() async {
        let card = await lookup("cowboys score", ["football/nfl|": .success(nflDefault)])
        XCTAssertEqual(SportsStub.requested(), ["football/nfl|20261012", "football/nfl|20261011", "football/nfl|", "football/nfl/teams/6|"])
        XCTAssertEqual(card?.outcome, .found)
        XCTAssertEqual(card?.games.first?.line, "Cowboys 16, Buccaneers 24")
        XCTAssertEqual(card?.games.first?.status, "Final, Thursday, Oct 8")
        XCTAssertEqual(card?.asOf?.label(in: tz), "Oct 12, 1:00 pm")
    }

    func testLookBackFindsTheGameOnTheFourthDayBackAndStopsThere() async {
        let card = await lookup("cowboys score", ["football/nfl|20261008": .success(nflDefault)])
        XCTAssertEqual(SportsStub.requested(), ["football/nfl|20261012", "football/nfl|20261011", "football/nfl|",
                                                "football/nfl|20261010", "football/nfl|20261009", "football/nfl|20261008", "football/nfl/teams/6|"])
        XCTAssertEqual(card?.games.first?.status, "Final, Thursday, Oct 8")
    }

    func testGameStillToComeOnTheCurrentBoardShowsItsKickoff() async {
        let root = try! JSONSerialization.jsonObject(with: nflDefault) as! [String: Any]
        let events = root["events"] as! [Any]
        let data = try! JSONSerialization.data(withJSONObject: ["events": [events[2]]])
        let card = await lookup("bills score", ["football/nfl|": .success(data)])
        XCTAssertEqual(card?.games.first?.isPre, true)
        XCTAssertEqual(card?.games.first?.status, "Scheduled for 5:15 pm")
    }

    func testLeagueWithNoGameTodayOrYesterdayShowsTheLatestDayOnTheCurrentBoard() async {
        let card = await lookup("nfl scores", ["football/nfl|": .success(nflDefault)])
        XCTAssertEqual(card?.games.count, 1)
        XCTAssertEqual(card?.games.first?.status, "Final, Sunday, Oct 11")
    }

    func testFailedRequestIsUnavailableNeverNoGame() async {
        let down = URLError(.timedOut)
        let card = await lookup("lakers score", ["basketball/nba|20261012": .failure(down), "basketball/nba|20261011": .failure(down)])
        XCTAssertEqual(card?.outcome, .unavailable)
        XCTAssertNil(card?.asOf)
        XCTAssertTrue(card?.games.isEmpty ?? false)
    }

    func testOneDayFailedAndTheOtherEmptyIsStillUnavailable() async {
        let card = await lookup("lakers score", ["basketball/nba|20261012": .success(Data(#"{"events":[]}"#.utf8)),
                                                  "basketball/nba|20261011": .failure(URLError(.timedOut))])
        XCTAssertEqual(card?.outcome, .unavailable)
    }

    func testLeagueScoresListTodaysGamesOneRowEach() async {
        let card = await lookup("nfl scores", ["football/nfl|20261012": .success(nfl1012)])
        XCTAssertEqual(card?.title, "NFL scores")
        XCTAssertEqual(card?.league, "NFL")
        XCTAssertEqual(card?.games.count, 1)
        XCTAssertEqual(card?.games.first?.line, "Bills vs Rams")
        XCTAssertEqual(SportsStub.requested(), ["football/nfl|20261012"])
    }

    func testLeagueWithNothingOnEitherDaySaysSo() async {
        let card = await lookup("nba scores", [:])
        XCTAssertEqual(card?.outcome, .noGame(lastNight: false))
        XCTAssertEqual(card?.league, "NBA")
    }

    // MARK: - The card and its words

    func testScoreCardCarriesTheScoreStatusFreshnessAndSource() async {
        let card = await lookup("jaguars score", ["football/nfl|20261011": .success(nfl1011)])
        XCTAssertEqual(card?.games.first?.line, "Jaguars 19, Eagles 17")
        XCTAssertEqual(card?.url, "https://www.espn.com/nfl/scoreboard")
        XCTAssertEqual(card?.asOf?.label(in: tz), "Oct 12, 1:00 pm")
        XCTAssertEqual(SportsCard.source, "ESPN")
        let shareable = QueryResult.sports(card!).copyText
        XCTAssertEqual(shareable, "Jaguars 19, Eagles 17, Final")
        XCTAssertFalse(shareable?.contains("\u{2014}") ?? true)
    }

    func testUnavailableAndNoGameHaveNothingToCopy() async {
        let none = await lookup("lakers score", [:])
        XCTAssertNil(QueryResult.sports(none!).copyText)
        let down = await lookup("lakers score", ["basketball/nba|20261012": .failure(URLError(.timedOut)), "basketball/nba|20261011": .failure(URLError(.timedOut))])
        XCTAssertNil(QueryResult.sports(down!).copyText)
    }

    func testAfterAFinalTheTeamsNextGameIsASecondRow() async {
        let page = Data(#"{"team":{"nextEvent":[{"date":"2026-10-18T17:00Z","competitions":[{"status":{"type":{"state":"pre"}},"competitors":[{"homeAway":"home","team":{"id":"30","shortDisplayName":"Jaguars"}},{"homeAway":"away","team":{"id":"11","shortDisplayName":"Colts"}}]}]}]}}"#.utf8)
        let card = await lookup("did the jaguars win", ["football/nfl|20261011": .success(nfl1011), "football/nfl/teams/30|": .success(page)])
        XCTAssertEqual(card?.games.count, 2)
        XCTAssertEqual(card?.games.last?.teams.map(\.name), ["Jaguars", "Colts"])
        XCTAssertEqual(card?.games.last?.status, "Scheduled for Oct 18, 10:00 am")
    }

    func testOnlyESPNIsCalled() async {
        _ = await lookup("jaguars score", ["football/nfl|20261011": .success(nfl1011)])
        XCTAssertTrue(SportsStub.requested().allSatisfy { $0.contains("|") })
    }

    func testTitleCaseCapitalisesEachWord() {
        XCTAssertEqual(QueryEngine.titleCase("lakers"), "Lakers")
        XCTAssertEqual(QueryEngine.titleCase("st. louis"), "St. Louis")
        XCTAssertEqual(QueryEngine.titleCase("man city"), "Man City")
    }
}
