import Foundation

// Weather, currency and local time as cards: one big number, a small label, one quiet line.
// Same free sources as the web engine (Open-Meteo, Frankfurter), no key, no AI. A nil result
// means "not this kind of question" or the lookup failed, so the answer engine takes over.
extension QueryEngine {

    // MARK: - Routing

    private enum Ask {
        case weather(String), time(String), currency(amount: Double, from: String, to: String), etymology(String)
        case news(place: String)
    }

    private static func ask(_ input: String) -> Ask? {
        // Spoken currency names, as on the web: "1 euro to usd". Not "pound": that is a weight.
        let names = ["euro": "eur", "euros": "eur", "dollar": "usd", "dollars": "usd", "yen": "jpy", "yuan": "cny", "rupee": "inr", "rupees": "inr", "peso": "mxn", "pesos": "mxn"]
        let q = input.trimmingCharacters(in: .whitespacesAndNewlines)
        let money = q.split(separator: " ", omittingEmptySubsequences: false).map { names[$0.lowercased()] ?? String($0) }.joined(separator: " ")
        func groups(_ pattern: String, in text: String? = nil) -> [String]? {
            let s = text ?? q
            guard let m = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive)
                .firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) else { return nil }
            return (1..<m.numberOfRanges).map { (s as NSString).substring(with: m.range(at: $0)) }
        }
        if let g = groups(#"^(?:origin|etymology|root|where\s+does\s+the\s+word)\s+(?:of\s+)?(?:the\s+word\s+)?(.+?)(?:\s+come\s+from)?\s*\??$"#) { return .etymology(g[0].trimmingCharacters(in: .whitespacesAndNewlines)) }
        // "news" and "what's happening" with no place are the world feed; a place is the search.
        if groups(#"^(?:(?:latest|top|breaking)\s+)?news\s*\??$|^what(?:'s|\u2019s| is) happening\s*\??$"#) != nil { return .news(place: "") }
        if let g = groups(#"^(?:(?:latest|top|breaking)\s+)?news\s+(?:in|from|for|around)\s+(.+?)\s*\??$"#) { return .news(place: g[0].trimmingCharacters(in: .whitespacesAndNewlines)) }
        if let g = groups(#"^what(?:'s|\u2019s| is) happening\s+(?:in|at|around)\s+(.+?)\s*\??$"#) { return .news(place: g[0].trimmingCharacters(in: .whitespacesAndNewlines)) }
        if let g = groups(#"^(?:what(?:'s| is) the )?(?:weather|forecast) (?:in|for|at) (.+?)\??$"#) { return .weather(g[0]) }
        // "vancouver weather". A leading question word is not a place ("how is the weather").
        if let g = groups(#"^(?!(?:what|how|is|the|will|does)\b)([a-z][a-z .'-]+?) (?:weather|forecast)(?: today| now)?\??$"#) { return .weather(g[0]) }
        if let g = groups(#"^(?:what(?:'s|’s| is) the |what )?(?:current |local )?time (?:is it |now )?(?:in|at) (.+?)(?: right now| now)?\??$"#) { return .time(g[0]) }
        if let g = groups(#"^(?:convert\s+)?(-?\d+(?:\.\d+)?)\s*([a-z]{3})\s+(?:to|in|into|as)\s+([a-z]{3})\??$"#, in: money),
           let amount = Double(g[0]) {
            return .currency(amount: amount, from: g[1].uppercased(), to: g[2].uppercased())
        }
        return nil
    }

    func isCardQuery(_ input: String) -> Bool { Self.ask(input) != nil || Self.sportsAsk(input) != nil || Self.marketAsk(input) != nil }

    func card(_ input: String, session: URLSession = .shared) async -> QueryResult? {
        // A sports question gets a card before a market one, so a league name in capitals never reads as a ticker.
        if let ask = Self.sportsAsk(input) { return .sports(await sportsCard(ask, session: session)) }
        // A market question always gets a card, even a failed one, so it never falls through to the AI.
        if let market = Self.marketAsk(input) { return await marketCard(market, session) }
        switch Self.ask(input) {
        case .etymology(let word): return await etymologyCard(word, session)
        case .news(let place): return await newsCard(place, session)
        case .weather(let place): return await weatherCard(place, session)
        case .time(let place): return await timeCard(place, session)
        case .currency(let amount, let from, let to): return await currencyCard(amount, from, to, session)
        case nil: return nil
        }
    }

    // MARK: - Builders (pure, so the tests need no network)

    static let langNames: [String: String] = ["enm": "Middle English", "ang": "Old English", "la": "Latin", "fr": "French", "fro": "Old French", "frm": "Middle French", "grc": "Ancient Greek", "el": "Greek", "non": "Old Norse", "de": "German", "gmh": "Middle High German", "goh": "Old High German", "nl": "Dutch", "dum": "Middle Dutch", "it": "Italian", "es": "Spanish", "pt": "Portuguese", "ar": "Arabic", "he": "Hebrew", "sa": "Sanskrit", "ja": "Japanese", "zh": "Chinese", "gem-pro": "Proto-Germanic", "ine-pro": "Proto-Indo-European", "itc-pro": "Proto-Italic"]

    static func etymologyCard(word: String, ancestor: String, relation: String, langCode: String) -> QueryResult {
        let relationCapitalized = relation.prefix(1).uppercased() + relation.dropFirst()
        // The language belongs in the sub line as a name, not inline after the word as a code.
        let lang = langNames[langCode] ?? langCode
        let sub = "\(relationCapitalized) from \(ancestor)" + (lang.isEmpty ? "" : ", \(lang)")
        return .card(big: word, unit: "", sub: sub, source: "Wordroot", url: "https://wordroot.jaybulb.com/#search=\(word.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? word)")
    }

    /// The next 12 hours as a range, "next 12 h 8 to 12°C", or one figure when it holds; nil when there are none.
    static func next12(_ temps: [Double]) -> String? {
        let v = temps.filter(\.isFinite).map { Int($0.rounded()) }
        guard let lo = v.min(), let hi = v.max() else { return nil }
        return "next 12 h \(lo == hi ? "\(lo)" : "\(lo) to \(hi)")°C"
    }

    static func weatherCard(place: String, country: String?, temp: Double, code: Int, wind: Double, next: [Double] = [], asOf: Freshness? = nil) -> QueryResult {
        let sky = [0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "overcast", 45: "fog", 48: "fog",
                   51: "drizzle", 53: "drizzle", 55: "drizzle", 61: "rain", 63: "rain", 65: "heavy rain",
                   71: "snow", 73: "snow", 75: "heavy snow", 80: "showers", 81: "showers", 82: "heavy showers",
                   95: "thunderstorm"][code]
        let parts = [place, country, sky, "wind \(Int(wind.rounded())) km/h", next12(next)].compactMap { $0 }.filter { !$0.isEmpty }
        return .card(big: String(Int(temp.rounded())), unit: "°C", sub: parts.joined(separator: ", "),
                     source: "Open-Meteo", url: "https://open-meteo.com", asOf: asOf)
    }

    static func currencyCard(amount: Double, from: String, to: String, rate: Double, source: String, url: String, asOf: Freshness? = nil) -> QueryResult {
        let money = NumberFormatter()
        money.locale = Locale(identifier: "en_US")
        money.numberStyle = .decimal
        money.minimumFractionDigits = 2
        money.maximumFractionDigits = 2
        let big = money.string(from: NSNumber(value: amount * rate)) ?? String(amount * rate)
        return .card(big: big, unit: to, sub: "\(trim(amount)) \(from) at today's rate", source: source, url: url, asOf: asOf)
    }

    static func timeCard(place: String, zone: TimeZone, now: Date) -> QueryResult {
        func fmt(_ pattern: String) -> String {
            let f = DateFormatter()
            f.locale = Locale(identifier: "en_US_POSIX")
            f.timeZone = zone
            f.dateFormat = pattern
            return f.string(from: now)
        }
        return .card(big: fmt("HH:mm"), unit: place, sub: "\(fmt("EEEE, MMMM d")), \(zone.identifier)",
                     source: "Open-Meteo", url: "https://open-meteo.com", asOf: Freshness(date: now, isDay: false))
    }

    // MARK: - Fetchers

    private struct Etymology: Decodable {
        struct Ancestor: Decodable {
            let relation: String, langCode: String, ancestor: String
        }
        let word: String, language: String, etymology: [Ancestor]
    }
    private struct Geo: Decodable {
        struct Place: Decodable { let name: String; let country: String?; let latitude: Double; let longitude: Double; let timezone: String? }
        let results: [Place]?
    }
    private struct Forecast: Decodable {
        struct Now: Decodable {
            let temperature2m: Double, weatherCode: Int, windSpeed10m: Double
            enum CodingKeys: String, CodingKey { case temperature2m = "temperature_2m", weatherCode = "weather_code", windSpeed10m = "wind_speed_10m" }
        }
        struct Hours: Decodable {
            let temperature2m: [Double]
            enum CodingKeys: String, CodingKey { case temperature2m = "temperature_2m" }
        }
        let current: Now
        let hourly: Hours?
    }
    private struct Rates: Decodable { let base: String?; let date: String?; let rates: [String: Double]? }

    private func fetch<T: Decodable>(_ type: T.Type, _ url: String, _ session: URLSession) async -> T? {
        guard let u = URL(string: url), let (data, response) = try? await session.data(from: u),
              (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    private func geocode(_ place: String, _ session: URLSession) async -> Geo.Place? {
        let name = place.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? place
        return await fetch(Geo.self, "https://geocoding-api.open-meteo.com/v1/search?name=\(name)&count=1&language=en", session)?.results?.first
    }

    private func weatherCard(_ place: String, _ session: URLSession) async -> QueryResult? {
        guard let loc = await geocode(place, session),
              let w = await fetch(Forecast.self, "https://api.open-meteo.com/v1/forecast?latitude=\(loc.latitude)&longitude=\(loc.longitude)&current=temperature_2m,weather_code,wind_speed_10m&hourly=temperature_2m&forecast_hours=12", session)
        else { return nil }
        return Self.weatherCard(place: loc.name, country: loc.country, temp: w.current.temperature2m,
                                code: w.current.weatherCode, wind: w.current.windSpeed10m, next: w.hourly?.temperature2m ?? [], asOf: Freshness(date: Date(), isDay: false))
    }

    private func timeCard(_ place: String, _ session: URLSession) async -> QueryResult? {
        guard let loc = await geocode(place, session), let id = loc.timezone, let zone = TimeZone(identifier: id) else { return nil }
        return Self.timeCard(place: loc.name, zone: zone, now: Date())
    }

    private func currencyCard(_ amount: Double, _ from: String, _ to: String, _ session: URLSession) async -> QueryResult? {
        if let d = await fetch(Rates.self, "https://api.frankfurter.dev/v1/latest?base=\(from)&symbols=\(to)", session), let rate = d.rates?[to] {
            // Frankfurter's rate is a daily value, so its freshness is the day it is for.
            let day = d.date.flatMap { Self.utcDay($0) }.map { Freshness(date: $0, isDay: true) }
            return Self.currencyCard(amount: amount, from: from, to: to, rate: rate, source: "Frankfurter", url: "https://frankfurter.dev", asOf: day)
        }
        if let d = await fetch(Rates.self, "https://open.er-api.com/v6/latest/\(from)", session), let rate = d.rates?[to] {
            return Self.currencyCard(amount: amount, from: from, to: to, rate: rate, source: "ExchangeRate-API", url: "https://www.exchangerate-api.com")
        }
        return nil
    }

    /// The worker's keyless RSS route: it already cleans the text and filters by place.
    private func newsCard(_ place: String, _ session: URLSession) async -> QueryResult? {
        let encoded = place.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? place
        guard let u = URL(string: "https://nimble-answers.trommatic.workers.dev/?news=\(encoded)"),
              let (data, response) = try? await session.data(from: u),
              (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return Self.newsResult(json: data, asOf: Freshness(date: Date(), isDay: false))
    }

    /// Pure, so the tests need no network. Nil when the feed had no usable story.
    static func newsResult(json data: Data, asOf: Freshness? = nil) -> QueryResult? {
        struct Payload: Decodable { let items: [NewsItem] }
        guard let payload = try? JSONDecoder().decode(Payload.self, from: data) else { return nil }
        let top = Array(payload.items.filter { !$0.sentence.isEmpty && ($0.url.hasPrefix("https://") || $0.url.hasPrefix("http://")) }.prefix(3))
        guard !top.isEmpty else { return nil }
        var outlets: [String] = []
        for item in top where !outlets.contains(item.outlet) { outlets.append(item.outlet) }
        return .news(items: top, source: outlets.joined(separator: ", "), asOf: asOf)
    }

    private func etymologyCard(_ word: String, _ session: URLSession) async -> QueryResult? {
        let encoded = word.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? word
        guard let e = await fetch(Etymology.self, "https://wordroot.jaybulb.com/api/etymology/\(encoded)", session),
              let first = e.etymology.first else { return nil }
        return Self.etymologyCard(word: word, ancestor: first.ancestor, relation: first.relation, langCode: first.langCode)
    }
}
