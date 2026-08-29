import Foundation

struct DDGResponse: Codable {
    let abstractText: String?
    let abstractSource: String?
    let abstractURL: String?
    let answer: String?
    let answerType: String?
    let definition: String?
    let definitionSource: String?
    let definitionURL: String?
    let heading: String?
    let image: String?
    let relatedTopics: [DDGTopic]?

    enum CodingKeys: String, CodingKey {
        case abstractText = "AbstractText"
        case abstractSource = "AbstractSource"
        case abstractURL = "AbstractURL"
        case answer = "Answer"
        case answerType = "AnswerType"
        case definition = "Definition"
        case definitionSource = "DefinitionSource"
        case definitionURL = "DefinitionURL"
        case heading = "Heading"
        case image = "Image"
        case relatedTopics = "RelatedTopics"
    }
}

struct DDGTopic: Codable {
    let text: String?
    let firstURL: String?
    let topics: [DDGSubTopic]?

    enum CodingKeys: String, CodingKey {
        case text = "Text"
        case firstURL = "FirstURL"
        case topics = "Topics"
    }
}

struct DDGSubTopic: Codable {
    let text: String?
    let firstURL: String?

    enum CodingKeys: String, CodingKey {
        case text = "Text"
        case firstURL = "FirstURL"
    }
}

struct WikiResponse: Codable {
    let title: String?
    let extract: String?
    let thumbnail: WikiThumbnail?
    let contentUrls: WikiContentURLs?

    enum CodingKeys: String, CodingKey {
        case title, extract, thumbnail
        case contentUrls = "content_urls"
    }
}

struct WikiThumbnail: Codable {
    let source: String?
}

struct WikiContentURLs: Codable {
    let desktop: WikiDesktopURL?
}

struct WikiDesktopURL: Codable {
    let page: String?
}

enum QueryType {
    case math, factual, definition, generic
}

final class QueryEngine: Sendable {
    // Gemma answer proxy (Cloudflare Worker holds the key; nothing secret ships here).
    private static let answerProxyURL = "https://nimble-answers.trommatic.workers.dev"

    private static let suggestions: [String] = {
        guard let url = Bundle.main.url(forResource: "suggestions", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let arr = try? JSONDecoder().decode([String].self, from: data) else {
            return defaultSuggestions
        }
        return arr
    }()

    private static let defaultSuggestions = [
        "256 / 8",
        "How big is the Atlantic Ocean?",
        "Distance from Earth to Mars",
        "Population of Canada",
        "Speed of light in km/h",
        "What is the meaning of life?",
        "21st digit of pi?",
        "Convert 100 Fahrenheit to Celsius",
        "GDP of Japan",
        "Who founded Apple?",
        "Atomic weight of gold",
        "How far is the moon?",
        "Binary representation of 255"
    ]

    func classifyQuery(_ input: String) -> QueryType {
        let q = input.lowercased().trimmingCharacters(in: .whitespaces)

        if isMathQuery(q) { return .math }
        if isFactualQuestion(q) { return .factual }
        if isDefinition(q) { return .definition }
        return .generic
    }

    private func isMathQuery(_ q: String) -> Bool {
        if q.range(of: "\\b(square root|sqrt|sin|cos|tan|log|ln|absolute|power|exponent|factorial|percentage|modulo|mod)\\b", options: .regularExpression) != nil {
            return true
        }
        let hasOperator = q.range(of: "[+\\-*/^%]|times|divided|multiplied|plus|minus|squared|cubed", options: .regularExpression) != nil
        let hasNumber = q.range(of: "\\d|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million", options: .regularExpression) != nil
        return hasOperator && hasNumber && q.range(of: "^(ask|answer|question|about|to)\\b", options: .regularExpression) == nil
    }

    private func isFactualQuestion(_ q: String) -> Bool {
        return q.range(of: "^(who|what|when|where|why|how)\\b", options: .regularExpression) != nil ||
               q.range(of: "\\b(is|was|are|were)\\s+(the\\s+)?", options: .regularExpression) != nil
    }

    private func isDefinition(_ q: String) -> Bool {
        return q.range(of: "^(define|what is|what does|what's|whats|definition|meaning)", options: .regularExpression) != nil
    }

    func evaluateMath(_ input: String) -> String? {
        let expr = input.trimmingCharacters(in: .whitespaces)
        guard !expr.isEmpty else { return nil }

        // Parse the literal expression first; the parser must consume the whole
        // string, so trailing junk ("2 + 2 banana", "sqrt(9)log") is rejected
        // rather than silently ignored.
        if let value = Self.evaluateExpression(expr) { return formatResult(value) }

        // Then natural language ("whats nine plus ten" -> "9 + 10").
        if let nl = parseNaturalLanguageMath(expr), let value = Self.evaluateExpression(nl) {
            return formatResult(value)
        }
        return nil
    }

    /// Evaluates a complete arithmetic expression, or returns nil if the input is
    /// not one. Replaces NSExpression, which both ignored trailing junk and threw
    /// an uncatchable NSInvalidArgumentException on malformed input.
    static func evaluateExpression(_ input: String) -> Double? {
        guard let tokens = MathLexer.tokenize(input) else { return nil }
        // A bare number is not a calculation ("42" must stay a search query).
        guard tokens.count > 1 else { return nil }
        var parser = MathParser(tokens: tokens)
        guard let value = parser.parseExpression(), parser.isAtEnd, value.isFinite else { return nil }
        return value
    }

    enum MathToken: Equatable {
        case number(Double)
        case op(Character)      // + - * / % ^
        case function(String)   // sqrt sin cos tan log ln abs
        case lparen, rparen
    }

    enum MathLexer {
        static let functions = ["sqrt", "sin", "cos", "tan", "log", "ln", "abs"]

        /// Returns nil on the first character that is not part of a math
        /// expression -- this is what makes trailing junk a hard failure.
        static func tokenize(_ input: String) -> [MathToken]? {
            var tokens: [MathToken] = []
            let chars = Array(input.lowercased())
            var i = 0
            while i < chars.count {
                let c = chars[i]
                if c == " " || c == "," || c == "_" { i += 1; continue }
                if c.isNumber || c == "." {
                    var j = i
                    while j < chars.count, chars[j].isNumber || chars[j] == "." { j += 1 }
                    // Scientific notation: 1e5, 2.5e-3
                    if j < chars.count, chars[j] == "e",
                       j + 1 < chars.count,
                       chars[j + 1].isNumber || ((chars[j + 1] == "+" || chars[j + 1] == "-")
                                                 && j + 2 < chars.count && chars[j + 2].isNumber) {
                        j += chars[j + 1].isNumber ? 1 : 2
                        while j < chars.count, chars[j].isNumber { j += 1 }
                    }
                    guard let value = Double(String(chars[i..<j])) else { return nil }
                    tokens.append(.number(value))
                    i = j
                    continue
                }
                if c.isLetter {
                    var j = i
                    while j < chars.count, chars[j].isLetter { j += 1 }
                    let word = String(chars[i..<j])
                    if functions.contains(word) {
                        tokens.append(.function(word))
                    } else if word == "pi" {
                        tokens.append(.number(Double.pi))
                    } else if word == "e" {
                        tokens.append(.number(M.E))
                    } else if word == "x" {
                        // "2 x 3" spelling of multiplication
                        tokens.append(.op("*"))
                    } else if word == "mod" {
                        tokens.append(.op("%"))
                    } else {
                        return nil
                    }
                    i = j
                    continue
                }
                switch c {
                case "+", "-", "*", "/", "%", "^": tokens.append(.op(c))
                case "(": tokens.append(.lparen)
                case ")": tokens.append(.rparen)
                default: return nil
                }
                i += 1
            }
            return tokens.isEmpty ? nil : tokens
        }
    }

    /// expression := term (("+" | "-") term)*
    /// term       := power (("*" | "/" | "%") power)*
    /// power      := unary ("^" power)?        -- right associative
    /// unary      := ("+" | "-")* primary
    /// primary    := number | "(" expression ")" | function "(" expression ")"
    struct MathParser {
        let tokens: [MathToken]
        var pos = 0

        init(tokens: [MathToken]) { self.tokens = tokens }

        var isAtEnd: Bool { pos >= tokens.count }
        private var current: MathToken? { pos < tokens.count ? tokens[pos] : nil }

        private mutating func match(_ operators: Set<Character>) -> Character? {
            if case let .op(c)? = current, operators.contains(c) { pos += 1; return c }
            return nil
        }

        mutating func parseExpression() -> Double? {
            guard var lhs = parseTerm() else { return nil }
            while let op = match(["+", "-"]) {
                guard let rhs = parseTerm() else { return nil }
                lhs = op == "+" ? lhs + rhs : lhs - rhs
            }
            return lhs
        }

        private mutating func parseTerm() -> Double? {
            guard var lhs = parsePower() else { return nil }
            while let op = match(["*", "/", "%"]) {
                guard let rhs = parsePower() else { return nil }
                switch op {
                case "*": lhs *= rhs
                case "/":
                    guard rhs != 0 else { return nil }
                    lhs /= rhs
                default:
                    guard rhs != 0 else { return nil }
                    lhs = lhs.truncatingRemainder(dividingBy: rhs)
                }
            }
            return lhs
        }

        private mutating func parsePower() -> Double? {
            guard let base = parseUnary() else { return nil }
            if match(["^"]) != nil {
                guard let exponent = parsePower() else { return nil }
                return pow(base, exponent)
            }
            return base
        }

        private mutating func parseUnary() -> Double? {
            if let op = match(["+", "-"]) {
                guard let value = parseUnary() else { return nil }
                return op == "-" ? -value : value
            }
            return parsePrimary()
        }

        private mutating func parsePrimary() -> Double? {
            switch current {
            case let .number(value)?:
                pos += 1
                return value
            case .lparen?:
                pos += 1
                guard let value = parseExpression(), current == .rparen else { return nil }
                pos += 1
                return value
            case let .function(name)?:
                pos += 1
                guard current == .lparen else { return nil }
                pos += 1
                guard let arg = parseExpression(), current == .rparen else { return nil }
                pos += 1
                return MathParser.apply(name, arg)
            default:
                return nil
            }
        }

        private static func apply(_ name: String, _ x: Double) -> Double? {
            switch name {
            case "sqrt": return x < 0 ? nil : sqrt(x)
            case "sin": return sin(x)
            case "cos": return cos(x)
            case "tan": return tan(x)
            case "log": return x <= 0 ? nil : log10(x)
            case "ln": return x <= 0 ? nil : log(x)
            case "abs": return abs(x)
            default: return nil
            }
        }
    }

    private func formatResult(_ value: Double) -> String {
        if value.isNaN || value.isInfinite { return String(value) }
        if value == value.rounded() && abs(value) < 1e15 {
            return String(format: "%.0f", value)
        }
        // Up to 10 decimal places, trim trailing zeros
        let formatted = String(format: "%.10f", value)
        let trimmed = formatted.replacingOccurrences(of: "0+$", with: "", options: .regularExpression)
            .replacingOccurrences(of: "\\.$", with: "", options: .regularExpression)
        return trimmed
    }

    private enum M {
        static let E = 2.718281828459045
    }

    private func preprocessQuery(_ raw: String) -> (ddgQuery: String, wikiQuery: String) {
        var q = raw.trimmingCharacters(in: .whitespaces)
        while q.hasSuffix("?") { q = String(q.dropLast()).trimmingCharacters(in: .whitespaces) }

        let patterns: [(String, (String) -> (String, String)?)] = [
            (#"(?i)^who\s+(?:is|was|are|were)\s+(?:the\s+)?(.+)$"#, { s in
                guard let r = s.range(of: #"(?i)^who\s+(?:is|was|are|were)\s+(?:the\s+)?"#, options: .regularExpression) else { return nil }
                let rest = String(s[r.upperBound...]).trimmingCharacters(in: .whitespaces)
                return rest.isEmpty ? nil : (rest, rest)
            }),
            (#"(?i)^what(?:'s|\s+is|\s+was)\s+(?:the\s+)?(.+)$"#, { s in
                guard let r = s.range(of: #"(?i)^what(?:'s|\s+is|\s+was)\s+(?:the\s+)?"#, options: .regularExpression) else { return nil }
                let rest = String(s[r.upperBound...]).trimmingCharacters(in: .whitespaces)
                return rest.isEmpty ? nil : (rest, rest)
            }),
            (#"(?i)^where\s+is\s+(.+?)(?:\s+located)?$"#, { s in
                guard let r = s.range(of: #"(?i)^where\s+is\s+"#, options: .regularExpression) else { return nil }
                var rest = String(s[r.upperBound...]).trimmingCharacters(in: .whitespaces)
                rest = rest.replacingOccurrences(of: #"\s+located$"#, with: "", options: .regularExpression)
                return rest.isEmpty ? nil : ("\(rest) location", rest)
            }),
            (#"(?i)^how\s+(much|many|tall|old|big|far|long|wide|deep|large|small|fast|heavy)\s+is\s+(.+)$"#, { s in
                guard let m = try? NSRegularExpression(pattern: #"(?i)^how\s+(\w+)\s+is\s+(.+)$"#).firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) else { return nil }
                let adj = (s as NSString).substring(with: m.range(at: 1)).lowercased()
                let entity = (s as NSString).substring(with: m.range(at: 2)).trimmingCharacters(in: .whitespaces)
                return entity.isEmpty ? nil : ("\(entity) \(adj)", entity)
            }),
        ]

        for (_, transform) in patterns {
            if let result = transform(q) { return (ddgQuery: result.0, wikiQuery: result.1) }
        }
        return (ddgQuery: raw, wikiQuery: raw)
    }

    // General answer engine: one Gemma call for any factual question. Replaces the
    // old per-shape Wikidata handlers (which dumped every historical officeholder).
    private struct ProxyResponse: Codable { let answer: String?; let source: String? }

    private func queryLLM(_ input: String, session: URLSession) async -> QueryResult? {
        guard let url = URL(string: Self.answerProxyURL) else { return nil }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["q": input])

        do {
            let (data, response) = try await session.data(for: req)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return nil }
            let decoded = try JSONDecoder().decode(ProxyResponse.self, from: data)
            guard let answer = decoded.answer?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !answer.isEmpty, answer.uppercased() != "UNKNOWN" else { return nil }
            // The proxy names the models that answered; "Nimble" covers a worker that
            // predates the source field.
            return .text(heading: nil, body: answer, source: decoded.source ?? "Nimble", sourceURL: nil, imageURL: nil)
        } catch {
            return nil
        }
    }

    func query(_ input: String) async -> QueryResult {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 8
        let session = URLSession(configuration: config)

        // Gemma first for a crisp one-line answer; fall back to DDG/Wikipedia when the
        // key is unreachable or Gemma returns UNKNOWN (keeps a no-key offline degrade).
        if let llm = await queryLLM(input, session: session) { return llm }

        let (ddgInput, wikiInput) = preprocessQuery(input)
        async let ddg = queryDDG(ddgInput, session: session)
        async let wiki = queryWikipedia(wikiInput, session: session)
        if let ddgResult = await ddg { return ddgResult }
        if let wikiResult = await wiki { return wikiResult }

        let encoded = input.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? input
        return .error("No instant answer found.", searchURL: "https://duckduckgo.com/?q=\(encoded)")
    }

    private func queryDDG(_ input: String, session: URLSession = .shared) async -> QueryResult? {
        guard let encoded = input.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: "https://api.duckduckgo.com/?q=\(encoded)&format=json&no_html=1&skip_disambig=1") else {
            return nil
        }

        do {
            let (data, _) = try await session.data(from: url)
            let ddg = try JSONDecoder().decode(DDGResponse.self, from: data)

            if let answer = ddg.answer, !answer.isEmpty {
                let clean = answer.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
                return .text(heading: nil, body: clean, source: "DuckDuckGo", sourceURL: nil, imageURL: nil)
            }

            if let definition = ddg.definition, !definition.isEmpty {
                return .text(heading: ddg.heading, body: definition, source: ddg.definitionSource ?? "DuckDuckGo", sourceURL: ddg.definitionURL, imageURL: nil)
            }

            if let abstract = ddg.abstractText, !abstract.isEmpty {
                let source = ddg.abstractSource ?? "DuckDuckGo"
                let sourceURL = ddg.abstractURL
                let imageURL = ddg.image.flatMap { $0.isEmpty ? nil : "https://duckduckgo.com\($0)" }
                return .text(heading: ddg.heading, body: abstract, source: source, sourceURL: sourceURL, imageURL: imageURL)
            }

            if let topics = ddg.relatedTopics, !topics.isEmpty {
                var items: [String] = []
                for topic in topics.prefix(5) {
                    if let text = topic.text, !text.isEmpty {
                        items.append(text)
                    }
                    if let subs = topic.topics {
                        for sub in subs.prefix(2) {
                            if let text = sub.text, !text.isEmpty {
                                items.append(text)
                            }
                        }
                    }
                }
                if !items.isEmpty {
                    return .list(items: items, source: "DuckDuckGo")
                }
            }

            return nil
        } catch {
            return nil
        }
    }

    private func queryWikipedia(_ input: String, session: URLSession = .shared) async -> QueryResult? {
        // First try direct page summary
        let searchTerm = input.replacingOccurrences(of: " ", with: "_")
        if let encoded = searchTerm.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
           let url = URL(string: "https://en.wikipedia.org/api/rest_v1/page/summary/\(encoded)"),
           let result = await fetchWikiSummary(url: url, session: session) {
            return result
        }

        // Fall back to Wikipedia search API to find the right article
        guard let searchEncoded = input.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let searchURL = URL(string: "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=\(searchEncoded)&format=json&srlimit=1") else {
            return nil
        }

        do {
            let (data, _) = try await session.data(from: searchURL)
            if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
               let query = json["query"] as? [String: Any],
               let search = query["search"] as? [[String: Any]],
               let first = search.first,
               let title = first["title"] as? String {
                let articleTitle = title.replacingOccurrences(of: " ", with: "_")
                guard let titleEncoded = articleTitle.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
                      let summaryURL = URL(string: "https://en.wikipedia.org/api/rest_v1/page/summary/\(titleEncoded)") else {
                    return nil
                }
                return await fetchWikiSummary(url: summaryURL, session: session)
            }
        } catch {}

        return nil
    }

    private func fetchWikiSummary(url: URL, session: URLSession = .shared) async -> QueryResult? {
        guard let url = Optional(url) else { return nil }

        do {
            let (data, response) = try await session.data(from: url)
            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                return nil
            }
            let wiki = try JSONDecoder().decode(WikiResponse.self, from: data)
            guard let extract = wiki.extract, !extract.isEmpty else { return nil }

            return .text(
                heading: wiki.title,
                body: extract,
                source: "Wikipedia",
                sourceURL: wiki.contentUrls?.desktop?.page,
                imageURL: wiki.thumbnail?.source
            )
        } catch {
            return nil
        }
    }

    private static let wordNumbers: [String: String] = [
        "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4",
        "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9",
        "ten": "10", "eleven": "11", "twelve": "12", "thirteen": "13",
        "fourteen": "14", "fifteen": "15", "sixteen": "16", "seventeen": "17",
        "eighteen": "18", "nineteen": "19", "twenty": "20", "thirty": "30",
        "forty": "40", "fifty": "50", "sixty": "60", "seventy": "70",
        "eighty": "80", "ninety": "90", "hundred": "100", "thousand": "1000",
        "million": "1000000"
    ]

    private static let wordOperators: [String: String] = [
        "plus": "+", "add": "+", "added to": "+",
        "minus": "-", "subtract": "-", "less": "-",
        "times": "*", "multiplied by": "*", "x": "*",
        "divided by": "/", "over": "/",
        "to the power of": "^", "squared": "^2", "cubed": "^3"
    ]

    private static let fillerPatterns = [
        "what is ", "whats ", "what's ", "calculate ", "how much is ",
        "compute ", "solve ", "evaluate ", "the answer to ", "result of "
    ]

    func parseNaturalLanguageMath(_ input: String) -> String? {
        var text = input.lowercased().trimmingCharacters(in: .whitespaces)

        // Must contain at least one word-number and one word-operator
        let hasWordNumber = Self.wordNumbers.keys.contains(where: { text.contains($0) })
        let hasWordOp = Self.wordOperators.keys.contains(where: { text.contains($0) })
        guard hasWordNumber && hasWordOp else { return nil }

        // Strip filler
        for filler in Self.fillerPatterns {
            if text.hasPrefix(filler) {
                text = String(text.dropFirst(filler.count))
            }
        }
        text = text.replacingOccurrences(of: "?", with: "").trimmingCharacters(in: .whitespaces)

        // Replace multi-word operators first
        for (word, op) in Self.wordOperators.sorted(by: { $0.key.count > $1.key.count }) {
            text = text.replacingOccurrences(of: word, with: " \(op) ")
        }

        // Replace word numbers
        for (word, num) in Self.wordNumbers {
            text = text.replacingOccurrences(of: "\\b\(word)\\b", with: num, options: .regularExpression)
        }

        // Clean up whitespace
        text = text.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)

        // Verify it looks like a math expression now
        let mathChars = CharacterSet(charactersIn: "0123456789.+-*/^%() ").union(.whitespaces)
        let isMath = text.unicodeScalars.allSatisfy { mathChars.contains($0) }
        guard isMath else { return nil }

        return text
    }

    func randomSuggestion(useDefaults: Bool) -> String {
        let pool = useDefaults ? Self.suggestions : Self.defaultSuggestions
        return pool.randomElement() ?? "Search anything..."
    }
}
