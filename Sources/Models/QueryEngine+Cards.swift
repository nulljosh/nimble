import Foundation

// Weather, currency and local time as cards: one big number, a small label, one quiet line.
// Same free sources as the web engine (Open-Meteo, Frankfurter), no key, no AI. A nil result
// means "not this kind of question" or the lookup failed, so the answer engine takes over.
extension QueryEngine {

    // MARK: - Routing

    private enum Ask {
        case weather(String), time(String), currency(amount: Double, from: String, to: String)
    }

    private static func ask(_ input: String) -> Ask? {
        let q = input.trimmingCharacters(in: .whitespacesAndNewlines)
        func groups(_ pattern: String) -> [String]? {
            guard let m = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive)
                .firstMatch(in: q, range: NSRange(q.startIndex..., in: q)) else { return nil }
            return (1..<m.numberOfRanges).map { (q as NSString).substring(with: m.range(at: $0)) }
        }
        if let g = groups(#"^(?:what(?:'s| is) the )?weather (?:in|for|at) (.+?)\??$"#) { return .weather(g[0]) }
        if let g = groups(#"^(?:what(?:'s| is) the )?(?:current )?time (?:in|at) (.+?)\??$"#) { return .time(g[0]) }
        if let g = groups(#"^(?:convert\s+)?(-?\d+(?:\.\d+)?)\s*([a-z]{3})\s+(?:to|in|into|as)\s+([a-z]{3})\??$"#),
           let amount = Double(g[0]) {
            return .currency(amount: amount, from: g[1].uppercased(), to: g[2].uppercased())
        }
        return nil
    }

    func isCardQuery(_ input: String) -> Bool { Self.ask(input) != nil }

    func card(_ input: String, session: URLSession = .shared) async -> QueryResult? {
        switch Self.ask(input) {
        case .weather(let place): return await weatherCard(place, session)
        case .time(let place): return await timeCard(place, session)
        case .currency(let amount, let from, let to): return await currencyCard(amount, from, to, session)
        case nil: return nil
        }
    }

    // MARK: - Builders (pure, so the tests need no network)

    static func weatherCard(place: String, country: String?, temp: Double, code: Int, wind: Double) -> QueryResult {
        let sky = [0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "overcast", 45: "fog", 48: "fog",
                   51: "drizzle", 53: "drizzle", 55: "drizzle", 61: "rain", 63: "rain", 65: "heavy rain",
                   71: "snow", 73: "snow", 75: "heavy snow", 80: "showers", 81: "showers", 82: "heavy showers",
                   95: "thunderstorm"][code]
        let parts = [place, country, sky, "wind \(Int(wind.rounded())) km/h"].compactMap { $0 }.filter { !$0.isEmpty }
        return .card(big: String(Int(temp.rounded())), unit: "°C", sub: parts.joined(separator: ", "),
                     source: "Open-Meteo", url: "https://open-meteo.com")
    }

    static func currencyCard(amount: Double, from: String, to: String, rate: Double, source: String, url: String) -> QueryResult {
        let money = NumberFormatter()
        money.locale = Locale(identifier: "en_US")
        money.numberStyle = .decimal
        money.minimumFractionDigits = 2
        money.maximumFractionDigits = 2
        let big = money.string(from: NSNumber(value: amount * rate)) ?? String(amount * rate)
        return .card(big: big, unit: to, sub: "\(trim(amount)) \(from) at today's rate", source: source, url: url)
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
                     source: "Open-Meteo", url: "https://open-meteo.com")
    }

    // MARK: - Fetchers

    private struct Geo: Decodable {
        struct Place: Decodable { let name: String; let country: String?; let latitude: Double; let longitude: Double; let timezone: String? }
        let results: [Place]?
    }
    private struct Forecast: Decodable {
        struct Now: Decodable {
            let temperature2m: Double, weatherCode: Int, windSpeed10m: Double
            enum CodingKeys: String, CodingKey { case temperature2m = "temperature_2m", weatherCode = "weather_code", windSpeed10m = "wind_speed_10m" }
        }
        let current: Now
    }
    private struct Rates: Decodable { let base: String?; let rates: [String: Double]? }

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
              let w = await fetch(Forecast.self, "https://api.open-meteo.com/v1/forecast?latitude=\(loc.latitude)&longitude=\(loc.longitude)&current=temperature_2m,weather_code,wind_speed_10m", session)
        else { return nil }
        return Self.weatherCard(place: loc.name, country: loc.country, temp: w.current.temperature2m,
                                code: w.current.weatherCode, wind: w.current.windSpeed10m)
    }

    private func timeCard(_ place: String, _ session: URLSession) async -> QueryResult? {
        guard let loc = await geocode(place, session), let id = loc.timezone, let zone = TimeZone(identifier: id) else { return nil }
        return Self.timeCard(place: loc.name, zone: zone, now: Date())
    }

    private func currencyCard(_ amount: Double, _ from: String, _ to: String, _ session: URLSession) async -> QueryResult? {
        if let d = await fetch(Rates.self, "https://api.frankfurter.dev/v1/latest?base=\(from)&symbols=\(to)", session), let rate = d.rates?[to] {
            return Self.currencyCard(amount: amount, from: from, to: to, rate: rate, source: "Frankfurter", url: "https://frankfurter.dev")
        }
        if let d = await fetch(Rates.self, "https://open.er-api.com/v6/latest/\(from)", session), let rate = d.rates?[to] {
            return Self.currencyCard(amount: amount, from: from, to: to, rate: rate, source: "ExchangeRate-API", url: "https://www.exchangerate-api.com")
        }
        return nil
    }
}
