import Foundation

// Markets as cards: crypto prices (CoinGecko simple/price), currency pairs (the Frankfurter series).
// Same answers as `market()` in docs/engine.js, and the same detection rules, so a query means the same
// thing on the web and in the apps. Both sources are keyless. Stocks have no keyless source that works,
// so a stock question is the calm "Quote unavailable right now" state: no request goes out, no price is
// made up, and the AI never runs for a price question.
extension QueryEngine {

    enum MarketAsk: Equatable {
        case crypto(id: String, name: String, symbol: String)
        case pair(from: String, to: String)
        case stock(String)
    }

    static let quoteTimeout: TimeInterval = 4

    /// Coin words and their CoinGecko ids. The order matches the web regex, which decides what a bare word matches.
    static let coins: [String: (id: String, name: String, symbol: String)] = [
        "bitcoin": ("bitcoin", "Bitcoin", "BTC"), "btc": ("bitcoin", "Bitcoin", "BTC"),
        "ethereum": ("ethereum", "Ethereum", "ETH"), "eth": ("ethereum", "Ethereum", "ETH"),
        "solana": ("solana", "Solana", "SOL"), "sol": ("solana", "Solana", "SOL"),
        "dogecoin": ("dogecoin", "Dogecoin", "DOGE"), "doge": ("dogecoin", "Dogecoin", "DOGE"),
    ]
    private static let coinKeys = "bitcoin|btc|ethereum|eth|solana|sol|dogecoin|doge"

    // "bitcoin price", "price of bitcoin", "what's the current price of ethereum", or a bare "btc" (the short names only).
    private static let cryptoPattern = #"^(?:(?:what(?:'s|’s| is) the )?(?:current )?price (?:of |for )?("# + coinKeys + #")|("# + coinKeys + #") price|(btc|eth|sol|doge))\s*\??$"#

    // "100 usd to eur" is an amount. "eur to usd" and "eur to usd rate" have no amount: those are a pair quote.
    private static let pairPattern = #"^(?:convert\s+)?(?:(-?\d+(?:\.\d+)?)\s*)?([a-z]{3})\s+(?:to|in|into|as)\s+([a-z]{3})(\s+rate)?\??$"#
    private static let currencies: Set<String> = Set("USD EUR GBP JPY CAD AUD CHF CNY INR MXN BRL KRW SEK NOK DKK NZD SGD HKD ZAR TRY PLN CZK HUF ILS THB PHP IDR MYR ISK RON BGN".split(separator: " ").map(String.init))

    // "AAPL", "$AAPL", "AAPL stock", "stock price of MSFT", "aapl price". A bare word needs the capitals (so "who is apple" never matches).
    private static let stockPattern = #"^(?:(?:what(?:'s|’s| is) the )?(?:stock )?(?:price|quote) (?:of |for )?)?\$?([A-Za-z]{1,5})(?: (?:stock|stock price|share price|shares?|price|quote))?\s*\??$"#
    // Capitals that are words or acronyms: a bare "AI" or "US" is never a stock lookup.
    private static let notTicker: Set<String> = Set("NFL NBA MLB NHL MLS EPL AI US UK EU OK TV IT ID PC CEO CFO NASA USA GDP CPU GPU API URL DNA HTML CSS JS FAQ NYC UN OR AND THE ARE NOT ALL ANY NEW CAN PDF SMS VPN RAM SSD USB TBD WHO HOW WHY YES NO DJ MP PM AM TO OF IN IS ON AT BY DO GO UP".split(separator: " ").map(String.init))

    /// The market question a query asks, or nil when it is not one (math, normal questions, plain words).
    static func marketAsk(_ input: String) -> MarketAsk? {
        let q = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if let g = captures(cryptoPattern, q, ignoreCase: true), let key = g.compactMap({ $0 }).first,
           let coin = coins[key.lowercased()] {
            return .crypto(id: coin.id, name: coin.name, symbol: coin.symbol)
        }
        if let pair = pairAsk(q) { return .pair(from: pair.from, to: pair.to) }
        if let sym = stockSymbol(q) { return .stock(sym) }
        return nil
    }

    /// "eur to usd", "eur to usd rate": both codes must be currencies, and neither a unit word ("km to in" is units).
    static func pairAsk(_ query: String) -> (from: String, to: String)? {
        guard let g = captures(pairPattern, query.trimmingCharacters(in: .whitespacesAndNewlines), ignoreCase: true),
              g[0] == nil, let fromRaw = g[1], let toRaw = g[2] else { return nil }
        let from = fromRaw.uppercased(), to = toRaw.uppercased()
        guard units[fromRaw.lowercased()] == nil, units[toRaw.lowercased()] == nil,
              currencies.contains(from), currencies.contains(to) else { return nil }
        return (from, to)
    }

    /// The ticker in a stock question, uppercased, or nil. Math and ordinary questions never match.
    static func stockSymbol(_ query: String) -> String? {
        let s = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let g = captures(stockPattern, s, ignoreCase: true), let sym = g[0] else { return nil }
        let bare = s == sym || s == "$" + sym
        if bare {
            // A bare word needs the capitals: "AAPL" yes, "aapl" and "apple" no.
            let capsShape = s.range(of: #"^\$?[A-Z]{2,5}$"#, options: .regularExpression) != nil
            if !(capsShape && !notTicker.contains(sym)) { return nil }
        }
        return sym.uppercased()
    }

    /// "Up 0.56% in the last 24 hours", "Down 1.20% on Oct 9", "Flat today". Words carry the direction, not colour.
    static func changeText(_ pct: Double?, _ when: String) -> String {
        guard let pct, pct.isFinite else { return "" }
        let a = String(format: "%.2f", abs(pct))
        return a == "0.00" ? "Flat \(when)" : "\(pct > 0 ? "Up" : "Down") \(a)% \(when)"
    }

    /// Dollars with two decimals, four when the price is under a dollar.
    static func usd(_ n: Double) -> String {
        let f = NumberFormatter()
        f.locale = Locale(identifier: "en_US")
        f.numberStyle = .currency
        f.currencyCode = "USD"
        f.minimumFractionDigits = 2
        f.maximumFractionDigits = n < 1 ? 4 : 2
        return f.string(from: NSNumber(value: n)) ?? String(format: "$%.2f", n)
    }

    /// A "yyyy-MM-dd" day as UTC midnight, or nil.
    static func utcDay(_ day: String) -> Date? {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f.date(from: day)
    }

    static func isoDay(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    /// The market card for a question. Every market question gets one, including a failed quote.
    func marketCard(_ ask: MarketAsk, _ session: URLSession) async -> QueryResult {
        switch ask {
        case .crypto(let id, let name, let sym): return await cryptoCard(id, name, sym, session)
        case .pair(let from, let to): return await pairCard(from, to, session)
        case .stock(let sym): return stockCard(sym)
        }
    }

    // MARK: - Builders for each market (the fetch happens here, the parsing in the tests)

    private struct Series: Decodable { let rates: [String: [String: Double]]? }

    private func cryptoCard(_ id: String, _ name: String, _ sym: String, _ session: URLSession) async -> QueryResult {
        let title = "\(name) (\(sym))", source = "CoinGecko", url = "https://www.coingecko.com"
        let d = await quoteJSON([String: [String: Double]].self,
            "https://api.coingecko.com/api/v3/simple/price?ids=\(id)&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true", session)
        guard let q = d?[id], let price = q["usd"], price.isFinite else {
            return .market(title: title, big: nil, change: nil, source: source, url: url)
        }
        let when = q["last_updated_at"] ?? Date().timeIntervalSince1970
        return .market(title: title, big: Self.usd(price),
                       change: Self.changeText(q["usd_24h_change"], "in the last 24 hours").nonEmpty,
                       source: source, url: url, asOf: Freshness(date: Date(timeIntervalSince1970: when), isDay: false))
    }

    private func pairCard(_ from: String, _ to: String, _ session: URLSession) async -> QueryResult {
        let title = "\(from) to \(to)", source = "Frankfurter", url = "https://frankfurter.dev"
        let start = Self.isoDay(Date().addingTimeInterval(-14 * 86_400))
        let d = await quoteJSON(Series.self, "https://api.frankfurter.dev/v1/\(start)..?base=\(from)&symbols=\(to)", session)
        // The last two days with a rate give the value and the day's change. Fewer than two is unavailable.
        let days = (d?.rates ?? [:]).compactMap { day, rates in rates[to] != nil ? day : nil }.sorted()
        guard days.count >= 2, let lastDay = days.last, let prevDay = days.dropLast().last,
              let last = d?.rates?[lastDay]?[to], let prev = d?.rates?[prevDay]?[to], prev > 0,
              let day = Self.utcDay(lastDay) else {
            return .market(title: title, big: nil, change: nil, source: source, url: url)
        }
        let pct = (last - prev) / prev * 100
        let dayText = Freshness(date: day, isDay: true).label()
        return .market(title: title, big: String(format: "%.4f", last) + " " + to,
                       change: Self.changeText(pct, "on \(dayText)").nonEmpty,
                       source: source, url: url, asOf: Freshness(date: day, isDay: true))
    }

    /// Stocks: no keyless source works, so no request goes out. The calm state, never a made-up price.
    private func stockCard(_ sym: String) -> QueryResult {
        .market(title: sym, big: nil, change: nil, source: "Stooq", url: "https://stooq.com/q/?s=\(sym.lowercased()).us")
    }

    private func quoteJSON<T: Decodable>(_ type: T.Type, _ url: String, _ session: URLSession) async -> T? {
        guard let u = URL(string: url) else { return nil }
        var request = URLRequest(url: u)
        request.timeoutInterval = Self.quoteTimeout
        guard let (data, response) = try? await session.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    /// Capture groups of the first match (nil for a group that did not take part), or nil when there is no match.
    static func captures(_ pattern: String, _ s: String, ignoreCase: Bool) -> [String?]? {
        guard let re = try? NSRegularExpression(pattern: pattern, options: ignoreCase ? .caseInsensitive : []),
              let m = re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) else { return nil }
        return (1..<m.numberOfRanges).map { i in
            let r = m.range(at: i)
            return r.location == NSNotFound ? nil : (s as NSString).substring(with: r)
        }
    }
}
