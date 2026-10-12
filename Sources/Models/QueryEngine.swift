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

/// The photo the answer proxy adds to an AI answer, when its page backs the sentence.
struct ProxyPhoto: Decodable {
    let image: AnswerPhoto?
}

struct WikiThumbnail: Codable {
    let source: String?
    let width: Int?
    let height: Int?
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
    private static let suggestions: [String] = {
        guard let url = Bundle.main.url(forResource: "suggestions", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let arr = try? JSONDecoder().decode([String].self, from: data) else {
            return defaultSuggestions
        }
        return arr
    }()

    private static let defaultSuggestions = [
        "(3 + 5) * 12",
        "1 mile to feet",
        "10 km to miles",
        "100 - 37",
        "1024 * 1024",
        "15% of 240",
        "180 C to F",
        "2 hours to seconds",
        "2^10",
        "255 in binary",
        "256 / 8",
        "3 cups to ml",
        "500 MB to GB",
        "7 factorial",
        "Atomic number of carbon"
    ]

    func classifyQuery(_ input: String) -> QueryType {
        let q = input.lowercased().trimmingCharacters(in: .whitespaces)

        if isMathQuery(q) { return .math }
        if isFactualQuestion(q) { return .factual }
        if isDefinition(q) { return .definition }
        return .generic
    }

    private func isMathQuery(_ q: String) -> Bool {
        // A math function name alone is decisive ("sqrt 9").
        if q.range(of: "\\b(square root|sqrt|sin|cos|tan|log|ln|absolute|power|exponent|factorial|percentage|modulo|mod)\\b", options: .regularExpression) != nil {
            return true
        }
        // Otherwise require BOTH an operator/operator-word AND a number/number-word
        // ("plus" alone or "9" alone isn't math), and reject phrasing that's asking
        // *about* math rather than doing it ("question about 9 plus 10").
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
        guard let expr = mathExpression(input), let value = Self.evaluateExpression(expr) else { return nil }
        return formatResult(value)
    }

    /// Show steps: one line per evaluation step ("3+4 = 7", "7*2 = 14"), or nil. A single
    /// operation has one step and nothing to expand, so "2+2" gets nil.
    func mathSteps(_ input: String) -> [String]? {
        guard let expr = mathExpression(input), let result = Self.evaluate(expr), result.steps.count >= 2 else { return nil }
        return result.steps
    }

    /// The expression a query means: the input as typed, or its natural-language reading.
    private func mathExpression(_ input: String) -> String? {
        // "15% of 240" -> "15/100*240"; bare % stays modulo.
        let expr = input.trimmingCharacters(in: .whitespaces)
            .replacingOccurrences(of: "([\\d.]+)\\s*%\\s*of\\s*", with: "$1/100*", options: [.regularExpression, .caseInsensitive])
        guard !expr.isEmpty else { return nil }

        // Parse the literal expression first; the parser must consume the whole
        // string, so trailing junk ("2 + 2 banana", "sqrt(9)log") is rejected
        // rather than silently ignored.
        if Self.evaluateExpression(expr) != nil { return expr }

        // Then natural language ("whats nine plus ten" -> "9 + 10").
        if let nl = parseNaturalLanguageMath(expr), Self.evaluateExpression(nl) != nil { return nl }
        return nil
    }

    /// Evaluates a complete arithmetic expression, or returns nil if the input is
    /// not one. Replaces NSExpression, which both ignored trailing junk and threw
    /// an uncatchable NSInvalidArgumentException on malformed input.
    static func evaluateExpression(_ input: String) -> Double? {
        evaluate(input)?.value
    }

    /// The value and the steps that reach it, or nil when the input is not a complete expression.
    static func evaluate(_ input: String) -> (value: Double, steps: [String])? {
        guard let tokens = MathLexer.tokenize(input) else { return nil }
        // A bare number is not a calculation ("42" must stay a search query).
        guard tokens.count > 1 else { return nil }
        var parser = MathParser(tokens: tokens)
        guard let node = parser.parseExpression(), parser.isAtEnd, node.value.isFinite else { return nil }
        return (node.value, parser.steps)
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

    /// A reduced piece of the expression: its display text ("7", or a typed "2") and its value.
    struct MathNode {
        let text: String
        let value: Double
        let isLiteral: Bool
    }

    /// expression := term (("+" | "-") term)*
    /// term       := power (("*" | "/" | "%") power)*
    /// power      := unary ("^" power)?        -- right associative
    /// unary      := ("+" | "-")* primary
    /// primary    := number | "(" expression ")" | function "(" expression ")"
    struct MathParser {
        let tokens: [MathToken]
        var pos = 0
        /// One line per operation, in evaluation order: "3+4 = 7".
        private(set) var steps: [String] = []

        init(tokens: [MathToken]) { self.tokens = tokens }

        var isAtEnd: Bool { pos >= tokens.count }
        private var current: MathToken? { pos < tokens.count ? tokens[pos] : nil }

        private mutating func match(_ operators: Set<Character>) -> Character? {
            if case let .op(c)? = current, operators.contains(c) { pos += 1; return c }
            return nil
        }

        /// Records "lhs op rhs = result" as a step and returns the reduced node.
        private mutating func reduce(_ lhs: MathNode, _ op: String, _ rhs: MathNode, _ value: Double) -> MathNode {
            let shown = QueryEngine.formatNumber(value)
            steps.append("\(lhs.text)\(op)\(rhs.text) = \(shown)")
            return MathNode(text: shown, value: value, isLiteral: false)
        }

        mutating func parseExpression() -> MathNode? {
            guard var lhs = parseTerm() else { return nil }
            while let op = match(["+", "-"]) {
                guard let rhs = parseTerm() else { return nil }
                lhs = reduce(lhs, String(op), rhs, op == "+" ? lhs.value + rhs.value : lhs.value - rhs.value)
            }
            return lhs
        }

        private mutating func parseTerm() -> MathNode? {
            guard var lhs = parsePower() else { return nil }
            while let op = match(["*", "/", "%"]) {
                guard let rhs = parsePower() else { return nil }
                switch op {
                case "*":
                    lhs = reduce(lhs, "*", rhs, lhs.value * rhs.value)
                case "/":
                    guard rhs.value != 0 else { return nil }
                    lhs = reduce(lhs, "/", rhs, lhs.value / rhs.value)
                default:
                    guard rhs.value != 0 else { return nil }
                    lhs = reduce(lhs, "%", rhs, lhs.value.truncatingRemainder(dividingBy: rhs.value))
                }
            }
            return lhs
        }

        private mutating func parsePower() -> MathNode? {
            guard let base = parseUnary() else { return nil }
            if match(["^"]) != nil {
                guard let exponent = parsePower() else { return nil }
                return reduce(base, "^", exponent, pow(base.value, exponent.value))
            }
            return base
        }

        private mutating func parseUnary() -> MathNode? {
            if let op = match(["+", "-"]) {
                guard let node = parseUnary() else { return nil }
                guard op == "-" else { return node }
                // A negated literal stays a literal. A negated result folds its sign in without a step.
                let value = -node.value
                if node.isLiteral { return MathNode(text: "-" + node.text, value: value, isLiteral: true) }
                return MathNode(text: QueryEngine.formatNumber(value), value: value, isLiteral: false)
            }
            return parsePrimary()
        }

        private mutating func parsePrimary() -> MathNode? {
            switch current {
            case let .number(value)?:
                pos += 1
                return MathNode(text: QueryEngine.formatNumber(value), value: value, isLiteral: true)
            case .lparen?:
                pos += 1
                guard let node = parseExpression(), current == .rparen else { return nil }
                pos += 1
                return node
            case let .function(name)?:
                pos += 1
                guard current == .lparen else { return nil }
                pos += 1
                guard let arg = parseExpression(), current == .rparen else { return nil }
                pos += 1
                guard let value = MathParser.apply(name, arg.value) else { return nil }
                let shown = QueryEngine.formatNumber(value)
                steps.append("\(name)(\(arg.text)) = \(shown)")
                return MathNode(text: shown, value: value, isLiteral: false)
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
        Self.formatNumber(value)
    }

    static func formatNumber(_ value: Double) -> String {
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
    private func queryLLM(_ input: String, session: URLSession, ai: AIConfig, turns: TurnBuffer, localTimeout: TimeInterval = 40) async -> QueryResult? {
        // On device never reaches the proxy below: a nil answer means no answer, and the question stays here.
        if ai.engine == .onDevice {
            guard let answer = await OnDeviceAnswers.answer(input, turns: turns) else { return nil }
            return .text(heading: nil, body: answer, source: "On device", sourceURL: nil, imageURL: nil)
        }
        #if os(macOS)
        // On a Mac running Samantha (oMLX on :8000), she is the default and the free proxy is the
        // fallback. Nobody else can reach localhost, so iOS and web stay on the proxy. 8s cap: a cold
        // model took 29s, and an instant-answer app can't wait that long when the proxy is right there.
        if ai.engine == .nimble, let local = await queryLLM(input, session: session, ai: AIConfig(engine: .samantha), turns: turns, localTimeout: 8) {
            return local
        }
        #endif
        // A misconfigured engine (Claude with no key) falls back to the free proxy.
        let context = (ai.engine == .ollama || ai.engine == .samantha) ? await wikiGrounding(input, session: session) : ""
        guard var req = ai.request(for: input, turns: turns, context: context) ?? AIConfig().request(for: input, turns: turns) else { return nil }
        if ai.engine == .ollama || ai.engine == .samantha { req.timeoutInterval = localTimeout } // a local 9B on a busy Mac is slow
        do {
            let (data, response) = try await session.data(for: req)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200,
                  let (answer, source) = ai.parse(data) else { return nil }
            // The proxy sends a photo only when the page behind its answer backs the sentence.
            let photo = (try? JSONDecoder().decode(ProxyPhoto.self, from: data))?.image.flatMap { AnswerPhoto.https($0.url, width: $0.width, height: $0.height) }
            return .text(heading: nil, body: answer, source: source, sourceURL: nil, imageURL: nil, photo: photo)
        } catch {
            return nil
        }
    }

    /// Top-3 Wikipedia search intros for `query`, as one block of text. Empty on any failure.
    private func wikiGrounding(_ query: String, session: URLSession) async -> String {
        guard let q = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: "https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrlimit=3&prop=extracts&exintro=1&explaintext=1&format=json&formatversion=2&gsrsearch=\(q)"),
              let (data, _) = try? await session.data(from: url),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let pages = (json["query"] as? [String: Any])?["pages"] as? [[String: Any]] else { return "" }
        let blocks = pages.compactMap { p -> String? in
            guard let title = p["title"] as? String, let extract = p["extract"] as? String else { return nil }
            let sentences = extract.components(separatedBy: ". ")
            let kept = sentences.prefix(4) + sentences.dropFirst(4).filter { $0.range(of: "\\b(current|incumbent|since)\\b", options: [.regularExpression, .caseInsensitive]) != nil }
            return "\(title): " + kept.joined(separator: ". ")
        }
        return String(blocks.joined(separator: "\n\n").prefix(6000))
    }

    /// "Who made you" is about Nimble, not the Wikipedia article the words happen to match.
    /// Mirrors `identity()` in docs/engine.js.
    func identityAnswer(_ input: String) -> QueryResult? {
        let pattern = "^(who (made|created|built|invented|wrote|developed|designed) (you|nimble)|who are you|what are you|who is (nimble|your (creator|maker)))\\s*\\??$"
        guard input.trimmingCharacters(in: .whitespaces).range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil else { return nil }
        return .text(heading: nil, body: "Nimble is an instant-answer app made by Joshua Trommel. More of his work is at jaybulb.com.", source: "Nimble", sourceURL: nil, imageURL: nil)
    }

    /// "What's primitive.dev?" is about a website; Wikipedia matched the nearest word instead.
    /// Mirrors `siteHost()` in docs/engine.js.
    func siteHost(_ input: String) -> String? {
        let tlds = "com|net|org|dev|io|ai|app|co|ca|me|xyz|tv|gg|so|sh|to|fm|cc|us|uk|info|biz|tech|cloud|site|online|page|wiki|design|studio"
        let pattern = "^(?:(?:what(?:['\u{2019}]s|\\s+is)|whats|who(?:['\u{2019}]s|\\s+is)|tell me about|about)\\s+)?(?:the\\s+)?(?:https?://)?(?:www\\.)?((?:[a-z0-9-]+\\.)+(?:\(tlds)))(?:/\\S*)?(?:\\s+(?:website|site|company|app))?\\s*\\??$"
        let q = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let re = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive),
              let m = re.firstMatch(in: q, range: NSRange(q.startIndex..., in: q)),
              let r = Range(m.range(at: 1), in: q) else { return nil }
        return q[r].lowercased()
    }

    /// Scrapes the site itself: meta description (or og:description), else headline plus first
    /// paragraph, else a note for pages that only render with JavaScript.
    private func querySite(_ input: String, session: URLSession) async -> QueryResult? {
        guard let host = siteHost(input), let url = URL(string: "https://\(host)/"),
              let (data, _) = try? await session.data(from: url) else { return nil }
        return parseSite(html: String(decoding: data.prefix(200_000), as: UTF8.self), host: host, pageURL: url.absoluteString)
    }

    /// Pure HTML-to-answer step, split out of `querySite` so it can be tested without a network.
    func parseSite(html: String, host: String, pageURL: String) -> QueryResult? {
        func grab(_ pattern: String) -> String {
            guard let re = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive, .dotMatchesLineSeparators]),
                  let m = re.firstMatch(in: html, range: NSRange(html.startIndex..., in: html)),
                  let r = Range(m.range(at: 1), in: html) else { return "" }
            return String(html[r]).replacingOccurrences(of: "<[^>]+>", with: " ", options: .regularExpression)
                .replacingOccurrences(of: "&amp;", with: "&").replacingOccurrences(of: "&#39;", with: "'")
                .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespaces)
        }
        let title = grab("<title[^>]*>([^<]*)</title>")
        var body = grab("<meta[^>]+name=[\"']description[\"'][^>]+content=[\"']([^\"']*)[\"']")
        if body.isEmpty { body = grab("<meta[^>]+property=[\"']og:description[\"'][^>]+content=[\"']([^\"']*)[\"']") }
        if body.isEmpty { body = [grab("<h1[^>]*>(.*?)</h1>"), grab("<p[^>]*>([^<]{60,})</p>")].filter { !$0.isEmpty }.joined(separator: ". ") }
        // Scripts but no words in the HTML: the page draws itself in JavaScript, so its <title> says nothing.
        if body.isEmpty { body = html.range(of: "<script", options: .caseInsensitive) != nil ? "This site loads with JavaScript." : title }
        guard !body.isEmpty else { return nil }
        // The page's own share image is the card photo; the favicon only stands in when there is none.
        let ogImage = grab("<meta[^>]+property=[\"']og:image(?::secure_url)?[\"'][^>]+content=[\"']([^\"']*)[\"']")
            .nonEmpty ?? grab("<meta[^>]+content=[\"']([^\"']*)[\"'][^>]+property=[\"']og:image(?::secure_url)?[\"']")
        let photo = ogImage.isEmpty ? nil : URL(string: ogImage, relativeTo: URL(string: "https://\(host)/"))
            .flatMap { AnswerPhoto.https($0.absoluteString) }
        return .text(heading: title.isEmpty ? host : title, body: firstSentence(body), source: host, sourceURL: pageURL,
                     imageURL: photo == nil ? "https://www.google.com/s2/favicons?domain=\(host)&sz=64" : nil, grounding: body, photo: photo)
    }

    func query(_ input: String, ai: AIConfig = AIConfig(), useLLM: Bool = true, turns: TurnBuffer = TurnBuffer()) async -> QueryResult {
        if let me = identityAnswer(input) { return me }
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 15
        let session = URLSession(configuration: config)
        if let site = await querySite(input, session: session) { return site }

        // Gemma first for a crisp one-line answer; fall back to DDG/Wikipedia when the
        // key is unreachable or Gemma returns UNKNOWN (keeps a no-key offline degrade).
        // All three start together so a cold LLM call doesn't add a sequential hop in
        // front of Wikipedia, only the preference order (llm > ddg > wiki) is sequential.
        let (ddgInput, wikiInput) = preprocessQuery(input)
        // With the on-device model answering, the question sends nothing to DuckDuckGo or Wikipedia.
        let localOnly = useLLM && ai.engine == .onDevice && OnDeviceAnswers.isAvailable
        async let llm: QueryResult? = useLLM ? await queryLLM(input, session: session, ai: ai, turns: turns) : nil
        async let ddg: QueryResult? = localOnly ? nil : queryDDG(ddgInput, session: session)
        async let wiki: QueryResult? = localOnly ? nil : queryWikipedia(wikiInput, session: session)
        if let llmResult = await llm {
            // A model's number is a guess with no source. If DDG has a sourced answer
            // for a numeric question, prefer it; otherwise the one-liner stands.
            if case .text(_, let body, _, _, _, _, _, _) = llmResult, body.rangeOfCharacter(from: .decimalDigits) != nil,
               let sourced = await ddg { return withSources(sourced, others: [await wiki]) }
            return withSources(llmResult, others: [await ddg, await wiki])
        }

        if let ddgResult = await ddg { return withSources(ddgResult, others: [await wiki]) }
        if let wikiResult = await wiki { return withSources(wikiResult, others: []) }

        let encoded = input.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? input
        return .error("No instant answer found.", searchURL: "https://duckduckgo.com/?q=\(encoded)")
    }

    /// Attaches the linked sources to a text answer. `others` are results already fetched for the same question.
    private func withSources(_ result: QueryResult, others: [QueryResult?]) -> QueryResult {
        guard case .text(let heading, let body, let source, let sourceURL, let imageURL, let grounding, _, let photo) = result else { return result }
        let sources = AnswerSources.linked(body: body, candidates: [result] + others.compactMap { $0 })
        return .text(heading: heading, body: body, source: source, sourceURL: sourceURL, imageURL: imageURL,
                     grounding: grounding, sources: sources, photo: photo)
    }

    /// The lead photo of a Wikipedia article named by a DuckDuckGo abstract. Nil for any other link.
    private func wikipediaArticlePhoto(_ url: String?, session: URLSession) async -> AnswerPhoto? {
        let prefix = "https://en.wikipedia.org/wiki/"
        guard let url, url.hasPrefix(prefix) else { return nil }
        let title = String(url.dropFirst(prefix.count)).components(separatedBy: CharacterSet(charactersIn: "?#")).first ?? ""
        guard !title.isEmpty, let summary = URL(string: "https://en.wikipedia.org/api/rest_v1/page/summary/\(title)"),
              let (data, response) = try? await session.data(from: summary),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let wiki = try? JSONDecoder().decode(WikiResponse.self, from: data) else { return nil }
        return AnswerPhoto.wikipediaLead(wiki.thumbnail?.source, width: wiki.thumbnail?.width, height: wiki.thumbnail?.height)
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
                // An abstract from Wikipedia brings that article's lead photo; the small DuckDuckGo icon steps aside.
                let photo = await wikipediaArticlePhoto(sourceURL, session: session)
                return .text(heading: ddg.heading, body: firstSentence(abstract), source: source, sourceURL: sourceURL,
                             imageURL: photo == nil ? imageURL : nil, grounding: abstract, photo: photo)
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
                body: firstSentence(extract),
                source: "Wikipedia",
                sourceURL: wiki.contentUrls?.desktop?.page,
                imageURL: nil,
                grounding: extract,
                photo: AnswerPhoto.wikipediaLead(wiki.thumbnail?.source, width: wiki.thumbnail?.width, height: wiki.thumbnail?.height)
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

// ponytail: encyclopedia paragraphs are not answers; keep the first sentence.
func firstSentence(_ text: String) -> String {
    let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
    if let r = t.range(of: #"(?<=[.!?])\s+(?=[A-Z0-9"(])"#, options: .regularExpression) {
        return String(t[..<r.lowerBound])
    }
    return t
}
