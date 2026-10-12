import Foundation

// Sports scores as a card: ESPN's keyless scoreboard. Same detection, league and team tables, day order
// and states as `sports()` in docs/engine.js, so a query means the same thing on the web and in the apps.
// Today first, then yesterday; "last night" is yesterday only. A failed request is "Scores unavailable right
// now", never "no game". A score is never guessed, and the AI never runs for one.
extension QueryEngine {

    /// A sports question: a league ("nfl scores") or a team with the leagues it plays in, folded for matching.
    struct SportsAsk: Equatable {
        let league: String?
        let team: String?
        /// League key to the team's folded names in that league, in league order ("kings" is NBA then NHL).
        let teams: [SportsLeagueKeys]
        let lastNight: Bool
    }

    struct SportsLeagueKeys: Equatable {
        let league: String
        let keys: Set<String>
    }

    struct SportsLeague {
        let path: String
        let name: String
        let url: String
        /// The period word and count for live status ("3rd quarter 4:12"). Nil where ESPN's own text is used.
        let unit: String?
        let periods: Int
    }

    static let sportsTimeout: TimeInterval = 4

    /// Order matters: it is the order the day's boards are checked in.
    static let sportsLeagueOrder = ["nba", "nfl", "mlb", "nhl", "epl", "mls"]
    static let sportsLeagues: [String: SportsLeague] = [
        "nba": SportsLeague(path: "basketball/nba", name: "NBA", url: "https://www.espn.com/nba/scoreboard", unit: "quarter", periods: 4),
        "nfl": SportsLeague(path: "football/nfl", name: "NFL", url: "https://www.espn.com/nfl/scoreboard", unit: "quarter", periods: 4),
        "mlb": SportsLeague(path: "baseball/mlb", name: "MLB", url: "https://www.espn.com/mlb/scoreboard", unit: nil, periods: 0),
        "nhl": SportsLeague(path: "hockey/nhl", name: "NHL", url: "https://www.espn.com/nhl/scoreboard", unit: "period", periods: 3),
        "epl": SportsLeague(path: "soccer/eng.1", name: "Premier League", url: "https://www.espn.com/soccer/league/_/name/eng.1", unit: nil, periods: 0),
        "mls": SportsLeague(path: "soccer/usa.1", name: "MLS", url: "https://www.espn.com/soccer/league/_/name/usa.1", unit: nil, periods: 0),
    ]

    /// Teams split by ";". A "|" lists the names a fan types (the first is the ESPN display name). Without one,
    /// the big four also answer to the last word ("Lakers"); soccer names are listed in full.
    static let sportsTeamTable: [String: String] = [
        "nba": "Atlanta Hawks;Boston Celtics;Brooklyn Nets;Charlotte Hornets;Chicago Bulls;Cleveland Cavaliers;Dallas Mavericks;Denver Nuggets;Detroit Pistons;Golden State Warriors;Houston Rockets;Indiana Pacers;LA Clippers|Clippers;Los Angeles Lakers;Memphis Grizzlies;Miami Heat;Milwaukee Bucks;Minnesota Timberwolves;New Orleans Pelicans;New York Knicks;Oklahoma City Thunder;Orlando Magic;Philadelphia 76ers|76ers|Sixers;Phoenix Suns;Portland Trail Blazers|Trail Blazers;Sacramento Kings;San Antonio Spurs;Toronto Raptors;Utah Jazz;Washington Wizards",
        "nfl": "Arizona Cardinals;Atlanta Falcons;Baltimore Ravens;Buffalo Bills;Carolina Panthers;Chicago Bears;Cincinnati Bengals;Cleveland Browns;Dallas Cowboys;Denver Broncos;Detroit Lions;Green Bay Packers;Houston Texans;Indianapolis Colts;Jacksonville Jaguars;Kansas City Chiefs;Las Vegas Raiders;Los Angeles Chargers;Los Angeles Rams;Miami Dolphins;Minnesota Vikings;New England Patriots;New Orleans Saints;New York Giants;New York Jets;Philadelphia Eagles;Pittsburgh Steelers;San Francisco 49ers;Seattle Seahawks;Tampa Bay Buccaneers;Tennessee Titans;Washington Commanders",
        "mlb": "Arizona Diamondbacks;Atlanta Braves;Baltimore Orioles;Boston Red Sox|Red Sox;Chicago Cubs;Chicago White Sox|White Sox;Cincinnati Reds;Cleveland Guardians;Colorado Rockies;Detroit Tigers;Houston Astros;Kansas City Royals;Los Angeles Angels;Los Angeles Dodgers;Miami Marlins;Milwaukee Brewers;Minnesota Twins;New York Mets;New York Yankees;Athletics;Philadelphia Phillies;Pittsburgh Pirates;San Diego Padres;San Francisco Giants;Seattle Mariners;St. Louis Cardinals;Tampa Bay Rays;Texas Rangers;Toronto Blue Jays|Blue Jays;Washington Nationals",
        "nhl": "Anaheim Ducks;Boston Bruins;Buffalo Sabres;Calgary Flames;Carolina Hurricanes;Chicago Blackhawks;Colorado Avalanche;Columbus Blue Jackets|Blue Jackets;Dallas Stars;Detroit Red Wings|Red Wings;Edmonton Oilers;Florida Panthers;Los Angeles Kings;Minnesota Wild;Montreal Canadiens;Nashville Predators;New Jersey Devils;New York Islanders;New York Rangers;Ottawa Senators;Philadelphia Flyers;Pittsburgh Penguins;San Jose Sharks;Seattle Kraken;St. Louis Blues;Tampa Bay Lightning;Toronto Maple Leafs|Maple Leafs;Utah Mammoth|Utah Hockey Club|Mammoth;Vancouver Canucks;Vegas Golden Knights|Golden Knights;Washington Capitals;Winnipeg Jets",
        "epl": "Arsenal;Aston Villa|Villa;AFC Bournemouth|Bournemouth;Brentford;Brighton & Hove Albion|Brighton;Burnley;Chelsea;Crystal Palace|Palace;Everton;Fulham;Leeds United|Leeds;Liverpool;Manchester City|Man City;Manchester United|Man United|Man Utd;Newcastle United|Newcastle;Nottingham Forest|Nottingham;Sunderland;Tottenham Hotspur|Tottenham|Spurs;West Ham United|West Ham;Wolverhampton Wanderers|Wolves",
        "mls": "Atlanta United FC|Atlanta United;Austin FC;CF Montréal|CF Montreal|Montreal;Charlotte FC;Chicago Fire FC|Chicago Fire;FC Cincinnati|Cincinnati;Colorado Rapids|Rapids;Columbus Crew|Columbus Crew SC;D.C. United|DC United;FC Dallas|Dallas FC;Houston Dynamo FC|Houston Dynamo;Inter Miami CF|Inter Miami;LA Galaxy|Galaxy;Los Angeles FC|LAFC;Minnesota United FC|Minnesota United;Nashville SC|Nashville;New England Revolution|Revolution;New York City FC|NYCFC;New York Red Bulls|Red Bulls;Orlando City SC|Orlando City;Philadelphia Union;Portland Timbers|Timbers;Real Salt Lake|Salt Lake;San Diego FC;San Jose Earthquakes|Earthquakes;Seattle Sounders FC|Sounders|Seattle Sounders;Sporting Kansas City|Sporting KC;St. Louis City SC|St. Louis City;Toronto FC;Vancouver Whitecaps FC|Whitecaps|Vancouver Whitecaps",
    ]

    /// Nicknames that are also everyday words: these match only with a score word, never alone.
    static let sportsCommon: Set<String> = Set("heat magic jazz thunder wild kings nets suns spurs warriors hawks bulls bears giants cardinals panthers rangers jets stars rockets nuggets pelicans clippers wizards hornets pistons titans chiefs chargers raiders packers vikings lions cowboys eagles falcons saints rams dolphins patriots colts broncos bills ravens steelers texans jaguars browns bengals seahawks commanders buccaneers lightning flames senators bruins blues ducks sharks devils hurricanes capitals islanders flyers avalanche predators kraken coyotes canadiens sabres athletics guardians orioles royals rays tigers twins angels reds cubs mets braves astros padres nationals mariners pirates phillies yankees brewers rockies marlins diamondbacks dodgers wolves villa palace crew union revolution timbers galaxy rapids dynamo sounders whitecaps earthquakes mammoth blazers sixers raptors cavaliers bucks grizzlies pacers".split(separator: " ").map(String.init))

    /// Alias (folded) to the leagues and folded names it stands for, in league order.
    static let sportsIndex: [String: [(league: String, keys: Set<String>)]] = {
        var index: [String: [(league: String, keys: Set<String>)]] = [:]
        for league in sportsLeagueOrder {
            for raw in (sportsTeamTable[league] ?? "").split(separator: ";") {
                let parts = raw.split(separator: "|", omittingEmptySubsequences: false).map { $0.trimmingCharacters(in: .whitespaces) }
                let bigFour = ["nba", "nfl", "mlb", "nhl"].contains(league)
                let names = parts.count > 1 || !bigFour ? parts : [parts[0], String(parts[0].split(separator: " ").last ?? "")]
                let keys = Set(names.map(sportsFold))
                for key in keys { index[key, default: []].append((league, keys)) }
            }
        }
        return index
    }()

    /// One alternation over every alias, longest first, so the team is found the way the web finds it.
    static let sportsAliasPattern: String = {
        let escaped = sportsIndex.keys.sorted { $0.count > $1.count }.map { key in
            String(key.flatMap { "\\.*+?^${}()|[]".contains($0) ? ["\\", $0] : [$0] })
        }
        return "(?:^|[^a-z0-9])(" + escaped.joined(separator: "|") + ")(?![a-z0-9])"
    }()

    static let sportsLeaguePattern = #"^(?:(?:today's|todays|latest|recent|last night's)\s+)?(nba|nfl|mlb|nhl|mls|epl|premier league)\s+(?:scores?|results?|games?)$"#
    /// A score word. "win" and "game" count; "history" and "coach" do not, so they never reach a scoreboard.
    static let sportsIntentPattern = #"\b(scores?|scored|won|wins?|winner|lose|loses|lost|loss|beat|beats|beaten|games?|results?|final|finals|playing|match|tonight|last night)\b"#
    /// Questions about the future, opinions, rosters and news are never a score lookup.
    static let sportsNegPattern = #"\b(will|would|should|could|might|why|how many|how much|how to|how do|odds|predict\w*|bet|best|worst|trade|traded|draft|drafted|sign|signed|coach|roster|news|history|rumou?rs?)\b"#

    /// Lowercase, no accents, curly apostrophes straight, one space between words. Same as sportsFold in docs/engine.js.
    static func sportsFold(_ s: String) -> String {
        let plain = String(String.UnicodeScalarView(s.decomposedStringWithCanonicalMapping.unicodeScalars.filter { !(0x300...0x36F).contains($0.value) }))
        let straight = plain.lowercased().replacingOccurrences(of: "\u{2018}", with: "'").replacingOccurrences(of: "\u{2019}", with: "'")
        return straight.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// The sports question in a query, or nil when it is not one (math, markets, weather and ordinary questions never match).
    static func sportsAsk(_ input: String) -> SportsAsk? {
        var q = sportsFold(input).replacingOccurrences(of: #"[?!.]+$"#, with: "", options: .regularExpression)
        q = q.trimmingCharacters(in: .whitespaces)
        let lastNight = q.contains("last night")
        if let g = captures(sportsLeaguePattern, q, ignoreCase: false), let raw = g[0] {
            return SportsAsk(league: raw == "premier league" ? "epl" : raw, team: nil, teams: [], lastNight: lastNight)
        }
        if captures(sportsNegPattern, q, ignoreCase: false) != nil { return nil }
        guard let m = captures(sportsAliasPattern, q, ignoreCase: false), let team = m[0] else { return nil }
        let intent = captures(sportsIntentPattern, q, ignoreCase: false) != nil
        // A bare name, or "the" and the name, and nothing else. A bare common word is never a score.
        if !intent && q != team && q != "the " + team { return nil }
        if !intent && sportsCommon.contains(team) { return nil }
        var order: [String] = []
        var keysBy: [String: Set<String>] = [:]
        for entry in sportsIndex[team] ?? [] {
            if keysBy[entry.league] == nil { order.append(entry.league); keysBy[entry.league] = [] }
            keysBy[entry.league]?.formUnion(entry.keys)
        }
        return SportsAsk(league: nil, team: team, teams: order.map { SportsLeagueKeys(league: $0, keys: keysBy[$0] ?? []) }, lastNight: lastNight)
    }

    /// "lakers" to "Lakers", "st. louis" to "St. Louis": a capital at the start of each word.
    static func titleCase(_ s: String) -> String {
        var out = ""
        var inWord = false
        for ch in s {
            let word = ch.isASCII && (ch.isLetter || ch.isNumber || ch == "_")
            out += word && !inWord ? ch.uppercased() : String(ch)
            inWord = word
        }
        return out
    }

    /// The day as YYYYMMDD in the zone asked for (ESPN's ?dates= wants this shape).
    static func sportsYMD(_ date: Date, tz: TimeZone?) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = tz ?? .current
        f.dateFormat = "yyyyMMdd"
        return f.string(from: date)
    }

    /// The day `back` days before now, as YYYYMMDD.
    static func sportsDay(_ now: Date, back: Int, tz: TimeZone?) -> String {
        sportsYMD(now.addingTimeInterval(-Double(back) * 86_400), tz: tz)
    }

    /// The game's own day in words, "Thursday, Oct 8", in the zone asked for.
    static func sportsDayWords(_ iso: String?, tz: TimeZone?) -> String {
        guard let iso, let d = espnDate(iso) else { return "" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = tz ?? .current
        f.dateFormat = "EEEE, MMM d"
        return f.string(from: d)
    }

    /// ESPN's dates: "2026-10-13T00:15Z" (no seconds) or with them, or with fractions.
    static func espnDate(_ s: String) -> Date? {
        let normalized = s.replacingOccurrences(of: #"T(\d{2}:\d{2})Z$"#, with: "T$1:00Z", options: .regularExpression)
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        if let d = f.date(from: normalized) { return d }
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: normalized)
    }

    private static func ordinal(_ n: Int) -> String {
        let suffix: String
        if n % 10 == 1 && n % 100 != 11 { suffix = "st" }
        else if n % 10 == 2 && n % 100 != 12 { suffix = "nd" }
        else if n % 10 == 3 && n % 100 != 13 { suffix = "rd" }
        else { suffix = "th" }
        return "\(n)\(suffix)"
    }

    /// "7:30 pm" today, "Oct 13, 7:30 pm" on another day. The clock reads in the zone asked for.
    static func kickoffLabel(_ iso: String, now: Date, tz: TimeZone?) -> String {
        guard let d = espnDate(iso) else { return "" }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = tz ?? .current
        let parts = cal.dateComponents([.hour, .minute], from: d)
        let hour = parts.hour ?? 0, minute = parts.minute ?? 0
        let clock = "\(hour % 12 == 0 ? 12 : hour % 12):\(String(format: "%02d", minute)) \(hour < 12 ? "am" : "pm")"
        if cal.isDate(d, inSameDayAs: now) { return clock }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = cal.timeZone
        f.dateFormat = "MMM d"
        return f.string(from: d) + ", " + clock
    }

    /// "Final", "Final/OT", "3rd quarter 4:12", "Scheduled for 7:30 pm". Soccer and baseball use ESPN's own short text.
    static func sportsStatus(_ ev: SportsEvent, league: String, now: Date, tz: TimeZone?) -> String {
        let t = ev.status?.type
        let state = t?.state
        if state == "post" { return firstText(t?.detail, t?.shortDetail) ?? "Final" }
        if state == "pre" { return "Scheduled for " + kickoffLabel(ev.date ?? "", now: now, tz: tz) }
        if t?.name == "STATUS_HALFTIME" { return "Halftime" }
        if state == "in", let l = sportsLeagues[league], let unit = l.unit, let period = ev.status?.period,
           period >= 1, period <= l.periods, let clock = firstText(ev.status?.displayClock) {
            return "\(ordinal(period)) \(unit) \(clock)"
        }
        return firstText(t?.shortDetail, t?.detail) ?? "In progress"
    }

    private static func firstText(_ values: String?...) -> String? {
        values.compactMap { $0 }.first { !$0.isEmpty }
    }

    /// One game as a row: our team first, the winner marked, a tie said in words. ESPN gives no score before kickoff.
    /// dated: a final found by the look-back says its day ("Final, Thursday, Oct 8").
    static func gameRow(_ ev: SportsEvent, ours: Int?, league: String, now: Date, tz: TimeZone?, dated: Bool = false) -> SportsGame {
        let comps = ev.competitions?.first?.competitors ?? []
        let order: [SportsEvent.Competitor]
        if let ours, comps.indices.contains(ours) {
            order = [comps[ours]] + comps.enumerated().filter { $0.offset != ours }.map(\.element)
        } else {
            // Away first, the rest in ESPN's order (a stable partition, as the web's sort gives).
            order = comps.filter { $0.homeAway == "away" } + comps.filter { $0.homeAway != "away" }
        }
        let state = ev.status?.type?.state
        let teams = order.map { c in
            SportsTeam(name: firstText(c.team?.shortDisplayName, c.team?.name) ?? "",
                       score: state == "pre" ? "" : (c.score?.text ?? ""),
                       winner: c.winner == true)
        }
        let tied = state == "post" && !teams.contains { $0.winner }
        let day = dated && state == "post" ? ", " + sportsDayWords(ev.date, tz: tz) : ""
        return SportsGame(teams: teams, isPre: state == "pre",
                          status: sportsStatus(ev, league: league, now: now, tz: tz) + day + (tied ? ", tied" : ""))
    }

    /// Every event where the team plays, with the team's side, found by any of its names.
    static func sportsHits(_ events: [SportsEvent], keys: Set<String>) -> [(event: SportsEvent, index: Int)] {
        events.compactMap { ev in
            let comps = ev.competitions?.first?.competitors ?? []
            let index = comps.firstIndex { c in
                [c.team?.displayName, c.team?.shortDisplayName, c.team?.name].contains { name in
                    name.map { keys.contains(sportsFold($0)) } ?? false
                }
            }
            return index.map { (ev, $0) }
        }
    }

    /// The event where the team plays, and that team's index in the event, found by any of its names.
    static func sportsFind(_ events: [SportsEvent], keys: Set<String>) -> (event: SportsEvent, index: Int)? {
        sportsHits(events, keys: keys).first
    }

    static func sportsState(_ ev: SportsEvent) -> String? { ev.status?.type?.state }
    static func sportsTime(_ ev: SportsEvent) -> Date { espnDate(ev.date ?? "") ?? .distantPast }

    /// The team's most recent game on one board: the latest Final, else one in progress, else the next scheduled.
    static func sportsRecent(_ events: [SportsEvent], keys: Set<String>) -> (event: SportsEvent, index: Int)? {
        let hits = sportsHits(events, keys: keys)
        if let final = hits.filter({ sportsState($0.event) == "post" }).max(by: { sportsTime($0.event) < sportsTime($1.event) }) {
            return final
        }
        if let live = hits.first(where: { sportsState($0.event) == "in" }) { return live }
        return hits.filter { sportsState($0.event) == "pre" }.min { sportsTime($0.event) < sportsTime($1.event) }
    }

    /// A league's most recent day on its current scoreboard: the latest Final's day, else a game in progress, else the
    /// next scheduled day. Returns that day's games (possibly none).
    static func sportsRecentDay(_ events: [SportsEvent], tz: TimeZone?) -> [SportsEvent] {
        let pick = events.filter { sportsState($0) == "post" }.max { sportsTime($0) < sportsTime($1) }
            ?? events.first { sportsState($0) == "in" }
            ?? events.filter { sportsState($0) == "pre" }.min { sportsTime($0) < sportsTime($1) }
        guard let pick else { return [] }
        let day = sportsYMD(sportsTime(pick), tz: tz)
        return events.filter { sportsYMD(sportsTime($0), tz: tz) == day }
    }

    /// The sports card for a question. The order is fixed: today, then yesterday ("last night" is yesterday only), by the
    /// day's board; then the current scoreboard with no date (the most recent game, Final, else in progress, else next);
    /// then each day back to seven days ago. A failed request with no game found is unavailable, never no game.
    /// now and tz are for tests.
    func sportsCard(_ ask: SportsAsk, now: Date = Date(), tz: TimeZone? = nil, session: URLSession = .shared) async -> SportsCard {
        let days = ask.lastNight ? [1] : [0, 1]
        let fresh = Freshness(date: now, isDay: false)
        var failed = false
        if let league = ask.league, let l = Self.sportsLeagues[league] {
            let title = "\(l.name) scores"
            func card(_ events: [SportsEvent], dated: Bool) -> SportsCard {
                let games = events.prefix(8).map { Self.gameRow($0, ours: nil, league: league, now: now, tz: tz, dated: dated) }
                return SportsCard(title: title, league: l.name, games: games, outcome: .found, url: l.url, asOf: fresh)
            }
            for back in days {
                guard let events = await sportsBoard(league, Self.sportsDay(now, back: back, tz: tz), session) else { failed = true; continue }
                if !events.isEmpty { return card(events, dated: false) }
            }
            if let board = await sportsBoard(league, nil, session) {
                let events = Self.sportsRecentDay(board, tz: tz)
                if !events.isEmpty { return card(events, dated: true) }
            } else { failed = true }
            for back in 2...7 {
                guard let events = await sportsBoard(league, Self.sportsDay(now, back: back, tz: tz), session) else { failed = true; continue }
                if !events.isEmpty { return card(events, dated: true) }
            }
            return SportsCard(title: title, league: l.name, games: [],
                              outcome: failed ? .unavailable : .noGame(lastNight: ask.lastNight), url: l.url,
                              asOf: failed ? nil : fresh)
        }
        let title = Self.titleCase(ask.team ?? "")
        func card(_ league: String, _ hit: (event: SportsEvent, index: Int), dated: Bool) -> SportsCard {
            let game = Self.gameRow(hit.event, ours: hit.index, league: league, now: now, tz: tz, dated: dated)
            return SportsCard(title: title, league: nil, games: [game], outcome: .found,
                              url: Self.sportsLeagues[league]?.url ?? "https://www.espn.com", asOf: fresh)
        }
        for back in days {
            for entry in ask.teams {
                guard let events = await sportsBoard(entry.league, Self.sportsDay(now, back: back, tz: tz), session) else { failed = true; continue }
                if let hit = Self.sportsFind(events, keys: entry.keys) { return card(entry.league, hit, dated: false) }
            }
        }
        for entry in ask.teams {
            guard let events = await sportsBoard(entry.league, nil, session) else { failed = true; continue }
            if let hit = Self.sportsRecent(events, keys: entry.keys) { return card(entry.league, hit, dated: true) }
        }
        for back in 2...7 {
            for entry in ask.teams {
                guard let events = await sportsBoard(entry.league, Self.sportsDay(now, back: back, tz: tz), session) else { failed = true; continue }
                if let hit = Self.sportsFind(events, keys: entry.keys) { return card(entry.league, hit, dated: true) }
            }
        }
        return SportsCard(title: title, league: nil, games: [],
                          outcome: failed ? .unavailable : .noGame(lastNight: ask.lastNight),
                          url: "https://www.espn.com", asOf: failed ? nil : fresh)
    }

    /// A query's sports card, or nil when the query is not about sports.
    func sports(_ query: String, now: Date = Date(), tz: TimeZone? = nil, session: URLSession = .shared) async -> SportsCard? {
        guard let ask = Self.sportsAsk(query) else { return nil }
        return await sportsCard(ask, now: now, tz: tz, session: session)
    }

    /// One league's events for one day (ymd), or the current scoreboard when ymd is nil: an array (possibly empty),
    /// or nil when the request failed.
    private func sportsBoard(_ league: String, _ ymd: String?, _ session: URLSession) async -> [SportsEvent]? {
        guard let l = Self.sportsLeagues[league],
              let url = URL(string: "https://site.api.espn.com/apis/site/v2/sports/\(l.path)/scoreboard" + (ymd.map { "?dates=\($0)" } ?? "")) else { return nil }
        var request = URLRequest(url: url)
        request.timeoutInterval = Self.sportsTimeout
        guard let (data, response) = try? await session.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let board = try? JSONDecoder().decode(SportsEvent.Board.self, from: data) else { return nil }
        return board.events
    }
}

/// The parts of ESPN's scoreboard the card reads. Every field is optional, so a game with a missing part still shows.
struct SportsEvent: Decodable {
    let date: String?
    let status: Status?
    let competitions: [Competition]?

    struct Board: Decodable { let events: [SportsEvent] }
    struct Status: Decodable {
        let period: Int?
        let displayClock: String?
        let type: StatusType?
    }
    struct StatusType: Decodable {
        let name: String?
        let state: String?
        let detail: String?
        let shortDetail: String?
    }
    struct Competition: Decodable { let competitors: [Competitor]? }
    struct Competitor: Decodable {
        let homeAway: String?
        let score: LooseText?
        let winner: Bool?
        let team: Team?
    }
    struct Team: Decodable {
        let displayName: String?
        let shortDisplayName: String?
        let name: String?
    }
}

/// ESPN sends a score as a string ("19"); a number is read the same way. Anything else is no score.
struct LooseText: Decodable {
    let text: String

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let s = try? c.decode(String.self) { text = s }
        else if let n = try? c.decode(Double.self) { text = n.rounded() == n ? String(Int(n)) : String(n) }
        else { text = "" }
    }
}
