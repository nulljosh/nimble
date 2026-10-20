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

/// A Wikipedia REST summary, as the topic lookup reads it.
struct TopicSummary: Decodable {
    let title: String?
    let extract: String?
    let type: String?
    let thumbnail: WikiThumbnail?
    let contentUrls: WikiContentURLs?

    enum CodingKeys: String, CodingKey {
        case title, extract, type, thumbnail
        case contentUrls = "content_urls"
    }

    /// The article's desktop link, https only.
    var page: String? {
        guard let page = contentUrls?.desktop?.page, page.hasPrefix("https://") else { return nil }
        return page
    }
}

/// Why the proxy's AI gave no answer. queryLLM fills it on a failed AI call; the caller reads it once after the query.
final class AIFailureNote: @unchecked Sendable {
    var aiError: String?
}

/// The answer proxy's extras: the photo it adds when its page backs the sentence, and the Wikipedia pages
/// behind the answer (`refs`, each with the intro that backed it). Same fields docs/engine.js reads.
struct ProxyReply: Decodable {
    let image: AnswerPhoto?
    let refs: [ProxyRef]?
    /// The Wikipedia page the proxy names for its answer and photo. Optional: older proxies never send it.
    let topic: String?
    let topicUrl: String?
    /// Why the AI gave no answer, when an AI call failed (quota, capacity, outage). Set only on UNKNOWN from a failure.
    let aiError: String?
    /// Set only when the two house models clash and no source settles it. Optional: the live Worker does not send it yet.
    let disagree: Bool?
    /// The two answers that clash, each with its model. Lossy per element (see ProxyAlt), so one bad alt cannot drop the reply.
    let alts: [ProxyAlt]?
    /// A compare ("paris vs london population"): the two sides as label and value. Lossy per element, like alts.
    let rows: [ProxyRow]?

    /// The compare as two "Paris: 2.1 million (2023)" lines, or nil. Same rule as docs/engine.js: exactly two good rows.
    var compareRows: [String]? {
        let usable = (rows ?? []).compactMap { r -> String? in
            guard let label = r.label?.nonEmpty, let value = r.value?.nonEmpty else { return nil }
            return "\(label): \(value)"
        }
        return usable.count == 2 ? usable : nil
    }

    /// The answers to show as a split, or nil. Same rule as docs/engine.js: `disagree` is true and two alternatives
    /// each name a model and carry a non-empty answer.
    var disputed: [DisputedAnswer]? {
        guard disagree == true, let alts else { return nil }
        let usable = alts.compactMap { alt -> DisputedAnswer? in
            guard let model = alt.model, let answer = alt.answer?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty else { return nil }
            return DisputedAnswer(model: model, answer: answer)
        }
        return usable.count >= 2 ? usable : nil
    }

    /// The named page, when the proxy sent a Wikipedia link for it, with its intro from `refs` when there is one.
    var namedTopic: (title: String, url: String, grounding: String?)? {
        guard let title = topic?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let url = topicUrl, url.lowercased().hasPrefix("https://en.wikipedia.org/wiki/") else { return nil }
        return (title, url, refs?.first { $0.url == url }?.extract?.nonEmpty)
    }
}

/// One side of a compare. Each field is read on its own, like ProxyAlt.
struct ProxyRow: Decodable {
    let label: String?
    let value: String?

    private enum Keys: String, CodingKey { case label, value }

    init(from decoder: Decoder) throws {
        let c = try? decoder.container(keyedBy: Keys.self)
        label = c.flatMap { try? $0.decodeIfPresent(String.self, forKey: .label) }
        value = c.flatMap { try? $0.decodeIfPresent(String.self, forKey: .value) }
    }
}

/// One alternative in a split. Each field is read on its own, so a malformed field leaves the rest of the reply intact.
struct ProxyAlt: Decodable {
    let model: String?
    let answer: String?

    private enum Keys: String, CodingKey { case model, answer }

    init(from decoder: Decoder) throws {
        let c = try? decoder.container(keyedBy: Keys.self)
        model = c.flatMap { try? $0.decodeIfPresent(String.self, forKey: .model) }
        answer = c.flatMap { try? $0.decodeIfPresent(String.self, forKey: .answer) }
    }
}

#if DEBUG
extension QueryEngine {
    /// STUBBED: the split the Worker sends when its two models clash. Used only by the `-shotDisagree` QA launch.
    static let qaSplitReply = #"{"answer":"Kamloops, British Columbia","source":"Gemma + Qwen","disagree":true,"alts":[{"model":"Qwen3 30B","answer":"Kamloops, British Columbia"},{"model":"Gemma 4 26B","answer":"Nelson, British Columbia"}],"refs":[]}"#
}
#endif

struct ProxyRef: Decodable {
    let title: String?
    let url: String?
    let extract: String?
}

/// A Wikipedia page from the grounding search: its intro, and its lead photo when the photo passes the rules.
struct GroundingPage {
    let title: String
    let extract: String
    let photo: AnswerPhoto?
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
        if let fact = Self.numberFact(input) { return fact }
        guard let expr = mathExpression(input), let value = Self.evaluateExpression(expr) else { return nil }
        return formatResult(value)
    }

    /// "7 factorial", "7!", "255 in binary", "255 in hex": exact, offline, as text. Factorials stop at 20!, the largest
    /// that fits 64 bits. Mirrors numberFact() in docs/engine.js.
    static func numberFact(_ input: String) -> String? {
        var q = input.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if q.hasSuffix("?") { q.removeLast() }
        func groups(_ pattern: String) -> [String]? {
            guard let m = try? NSRegularExpression(pattern: pattern).firstMatch(in: q, range: NSRange(q.startIndex..., in: q)) else { return nil }
            return (1..<m.numberOfRanges).compactMap { Range(m.range(at: $0), in: q).map { String(q[$0]) } }
        }
        if let g = groups(#"^(?:what is )?(\d{1,2})\s*(?:!|factorial)$|^(?:what is )?(?:the )?factorial (?:of )?(\d{1,2})$"#),
           let n = g.first.flatMap({ UInt64($0) }), n <= 20 {
            let value = (1...max(n, 1)).reduce(UInt64(1), *)
            let f = NumberFormatter()
            f.locale = Locale(identifier: "en_US")
            f.numberStyle = .decimal
            return f.string(from: NSNumber(value: value))
        }
        if let g = groups(#"^(?:convert )?(\d{1,15}) (?:in|to|into) (binary|hex|hexadecimal|octal)$"#), g.count == 2, let n = Int64(g[0]) {
            return String(n, radix: ["binary": 2, "octal": 8][g[1]] ?? 16).uppercased()
        }
        return nil
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
            .replacingOccurrences(of: "([\\d.]+)\\s*%\\s*of\\b\\s*", with: "$1/100*", options: [.regularExpression, .caseInsensitive])
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
        static let functions = ["sqrt", "cbrt", "sin", "cos", "tan", "log", "log2", "log10", "ln", "abs"]

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
                    // "log2" and "log10" carry their base in the name, as on the web.
                    if String(chars[i..<j]) == "log" {
                        for base in ["10", "2"] where String(chars[j..<min(j + base.count, chars.count)]) == base { j += base.count; break }
                    }
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
            case "cbrt": return cbrt(x)
            case "sin": return sin(x)
            case "cos": return cos(x)
            case "tan": return tan(x)
            case "log", "log10": return x <= 0 ? nil : log10(x)
            case "log2": return x <= 0 ? nil : log2(x)
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
    private func queryLLM(_ input: String, session: URLSession, ai: AIConfig, turns: TurnBuffer, localTimeout: TimeInterval = 40, note: AIFailureNote? = nil) async -> QueryResult? {
        #if DEBUG
        // QA only: `-shotDisagree YES` answers with the STUBBED split reply below, with no network call, so the card can be shot.
        if UserDefaults.standard.bool(forKey: "shotDisagree"), ai.engine == .nimble,
           let reply = try? JSONDecoder().decode(ProxyReply.self, from: Data(Self.qaSplitReply.utf8)), let split = reply.disputed {
            return .disagree(alts: split, sources: [], asOf: Freshness(date: Date(), isDay: false))
        }
        #endif
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
        let local = ai.engine == .ollama || ai.engine == .samantha
        let (context, _) = local ? await wikiGrounding(input, session: session) : ("", [])
        guard var req = ai.request(for: input, turns: turns, context: context) ?? AIConfig().request(for: input, turns: turns) else { return nil }
        if local { req.timeoutInterval = localTimeout } // a local 9B on a busy Mac is slow
        do {
            let (data, response) = try await session.data(for: req)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return nil }
            // The house models split and no source settled it: both answers, no pick. Only the free proxy sends this.
            if ai.engine == .nimble, let reply = try? JSONDecoder().decode(ProxyReply.self, from: data), let split = reply.disputed {
                let row = (reply.refs ?? []).compactMap { r -> AnswerSource? in
                    guard let url = r.url, url.lowercased().hasPrefix("https://"), let title = r.title?.nonEmpty else { return nil }
                    return AnswerSource(name: title, url: url)
                }
                return .disagree(alts: split, sources: Array(row.prefix(2)), asOf: Freshness(date: Date(), isDay: false))
            }
            guard let (answer, source) = ai.parse(data) else {
                // UNKNOWN from the proxy: keep the reason only when the worker says an AI call failed.
                note?.aiError = (try? JSONDecoder().decode(ProxyReply.self, from: data))?.aiError
                return nil
            }
            // The proxy sends a photo only when the page behind its answer backs the sentence. A local
            // model gets the same rule against the Wikipedia pages it was grounded on.
            // Same rules as docs/engine.js gemma(): the photo's credit is the first on-topic Wikipedia page, and
            // the linked row is the first two on-topic pages. No match, no credit and no link.
            let reply = try? JSONDecoder().decode(ProxyReply.self, from: data)
            // A compare shows its two sides as two rows, the web's compare card.
            if ai.engine == .nimble, let rows = reply?.compareRows { return .list(items: rows, source: source) }
            let refs: [(title: String, url: String)] = (reply?.refs ?? []).compactMap { r in
                guard let url = r.url, url.lowercased().hasPrefix("https://"), let title = r.title?.nonEmpty, r.extract?.nonEmpty != nil else { return nil }
                return (title, url)
            }
            // The named topic (the proxy's own page) credits the photo and links the Why text; otherwise the first on-topic ref does.
            let named = reply?.namedTopic
            let topic = named.map { (title: $0.title, url: $0.url) }
                ?? refs.first { Self.onTopic($0.title, query: input, body: "") } ?? refs.first { Self.onTopic($0.title, query: input, body: answer) }
            let proxyPhoto = reply?.image.flatMap { AnswerPhoto.https($0.url, width: $0.width, height: $0.height, title: topic?.title) }
            // No proxy photo: withTopic looks up the picture of the entity the answer names.
            let photo = proxyPhoto
            let sources = refs.filter { Self.onTopic($0.title, query: input, body: answer) }.prefix(2).map { AnswerSource(name: $0.title, url: $0.url) }
            return .text(heading: nil, body: answer, source: source, sourceURL: named?.url, imageURL: nil, grounding: named?.grounding, sources: Array(sources), photo: photo)
        } catch {
            return nil
        }
    }

    /// Top-3 Wikipedia search intros for `query`, as one block of text, plus each page's lead photo.
    /// Empty on any failure.
    private func wikiGrounding(_ query: String, session: URLSession) async -> (context: String, pages: [GroundingPage]) {
        guard let q = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: "https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrlimit=3&prop=extracts%7Cpageimages&exintro=1&explaintext=1&piprop=thumbnail&pithumbsize=800&format=json&formatversion=2&gsrsearch=\(q)"),
              let (data, _) = try? await session.data(from: url),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let raw = (json["query"] as? [String: Any])?["pages"] as? [[String: Any]] else { return ("", []) }
        let pages = raw.compactMap { p -> GroundingPage? in
            guard let title = p["title"] as? String, let extract = p["extract"] as? String else { return nil }
            let thumb = p["thumbnail"] as? [String: Any]
            let photo = AnswerPhoto.wikipediaLead(thumb?["source"] as? String, width: thumb?["width"] as? Int, height: thumb?["height"] as? Int)
            return GroundingPage(title: title, extract: extract, photo: photo)
        }
        let blocks = pages.map { p -> String in
            let sentences = p.extract.components(separatedBy: ". ")
            let kept = sentences.prefix(4) + sentences.dropFirst(4).filter { $0.range(of: "\\b(current|incumbent|since)\\b", options: [.regularExpression, .caseInsensitive]) != nil }
            return "\(p.title): " + kept.joined(separator: ". ")
        }
        return (String(blocks.joined(separator: "\n\n").prefix(6000)), pages)
    }

    /// A Wikipedia page is on topic for an answer when every word of its title (minus a parenthesis) is a word of
    /// the question or of the answer's own proper nouns. Same rule as `onTopic` in docs/engine.js.
    static func onTopic(_ title: String, query: String, body: String) -> Bool {
        let stripped = title.replacingOccurrences(of: #"\s*\(.*?\)"#, with: "", options: .regularExpression)
        let words = AnswerSources.keyWords(stripped)
        guard !words.isEmpty else { return false }
        let qualified = title.range(of: #"\(.*?\)"#, options: .regularExpression) != nil
        var allowed = AnswerSources.keyWords(query)
        var ents: [String] = []
        if let re = try? NSRegularExpression(pattern: entityPattern) {
            for m in re.matches(in: body, range: NSRange(body.startIndex..., in: body)) {
                guard let r = Range(m.range, in: body) else { continue }
                let e = String(body[r])
                if !notEntity.contains(e) { ents.append(e) }
            }
        }
        let entityWords = AnswerSources.keyWords(ents.joined(separator: " "))
        allowed.formUnion(entityWords)
        // A disambiguated page ("Capital (French magazine)") must be an entity the answer names, not just a word of the question.
        return words.allSatisfy { (qualified ? entityWords : allowed).contains($0) }
    }

    /// Gives a result the photo from another result when it has none of its own.
    /// True when the answer can change over time, so a text answer shows its fetch time. Same word lists in web, Swift and Kotlin.
    static func isTimeSensitive(_ query: String) -> Bool {
        let s = query.lowercased()
        if s.range(of: #"\b(current|currently|latest|now|today|tonight|right now|this year|this week|this month|as of|newest|recent|recently|incumbent|last)\b"#, options: .regularExpression) != nil { return true }
        let role = s.range(of: #"\b(ceo|cfo|chairman|president|prime minister|premier|mayor|governor|leader|champion|record|holds|population|price|cost|worth|winner|won|king|queen|monarch|ruler|chancellor|pope|head of)\b"#, options: .regularExpression) != nil
        let past = s.range(of: #"^(who|when|where) (was|were)\b|\b(first|originally|founded|born|died|invented|discovered|history|historical|ancient|medieval)\b|\b(1[0-9]{3}|20[0-1][0-9]|202[0-4])\b"#, options: .regularExpression) != nil
        return role && !past
    }

    static func keepingPhoto(_ result: QueryResult, from other: QueryResult) -> QueryResult {
        guard case .text(let h, let b, let s, let su, let iu, let g, let srcs, nil, let bg) = result,
              case .text(_, _, _, _, _, _, _, let photo?, _) = other else { return result }
        return .text(heading: h, body: b, source: s, sourceURL: su, imageURL: iu, grounding: g, sources: srcs, photo: photo, background: bg)
    }

    /// Math, units, weather and time never look for a photo (same as `NO_PHOTO_Q` in docs/engine.js).
    private static let noPhotoQuery = #"\b(weather|forecast|temperature|time|clock|convert|math|sum|plus|minus|times|divided|percent)\b|\d"#
    /// Capitalised runs the answer names, with lowercase particles inside a run ("Leonardo da Vinci").
    private static let answerEntityPattern = #"\b\p{Lu}[\p{L}'\x{2019}-]+(?:\s+(?:(?:da|de|del|della|der|di|du|la|le|van|von|of|the)\s+)?\p{Lu}[\p{L}'\x{2019}-]+){0,3}"#
    /// Sentence starters, months and weekdays are never a photo's entity.
    private static let prepositions: Set<String> = ["of", "in", "from", "at", "on", "near", "into", "across", "between", "among", "within"]
    private static let photoStopWords: Set<String> = notEntity.union(["January", "February", "March", "April", "May", "June", "July", "August",
                                                                       "September", "October", "November", "December", "Monday", "Tuesday", "Wednesday",
                                                                       "Thursday", "Friday", "Saturday", "Sunday"])
    /// Capitalised runs the answer names: "Paris" in "The capital of France is Paris." Not sentence starters.
    private static let entityPattern = #"\b\p{Lu}[\p{L}'\x{2019}-]+(?:\s+\p{Lu}[\p{L}'\x{2019}-]+){0,3}"#
    private static let notEntity: Set<String> = ["The", "A", "An", "It", "This", "That", "In", "On", "At", "As", "Its", "He", "She", "They", "There",
                                                 "Yes", "No", "I", "Of", "For", "And", "But", "If", "When", "Where", "Who", "What", "From", "With",
                                                 "By", "To", "Is", "Was", "These", "Those", "We", "You"]

    /// The Wikipedia topic an answer names: its picture, and the intro behind it. What the web's `topicFor` does.
    struct TopicLookup: Equatable {
        let photo: AnswerPhoto?
        let extract: String?
        let page: String?
    }

    /// Fills a missing picture from the answer's Wikipedia topic, and, when nothing else backs the answer, the
    /// Wikipedia intro and page behind it ("Why this answer"). Only for answers that went to an AI or to the
    /// Wikipedia fallback: `enabled` is false when nothing may leave the device or the user said no.
    static func withTopic(_ result: QueryResult, query: String, session: URLSession, enabled: Bool,
                          searching: Task<[String], Never>? = nil) async -> QueryResult {
        guard enabled,
              case .text(let heading, let body, let source, let sourceURL, let imageURL, let grounding, let sources, let photo, let bg) = result,
              photo == nil || grounding == nil,
              let topic = await topicLookup(query: query, body: body, session: session, searching: searching) else { return result }
        let fromTopic = grounding == nil && topic.extract != nil
        return .text(heading: heading, body: body, source: source,
                     sourceURL: fromTopic ? (topic.page ?? sourceURL) : sourceURL, imageURL: imageURL,
                     grounding: grounding ?? topic.extract, sources: sources, photo: photo ?? topic.photo, background: bg)
    }

    /// The photo comes only from the entities the answer names (see `photoFromEntity`). The intro ("Why this answer")
    /// comes from those entities first, then the top Wikipedia search hits for the question (two, not lists).
    /// Nil when nothing comes back. No entity or no passing page means no picture, never a guess.
    /// `searching` is the question's Wikipedia search, already started by query() next to the AI call (it needs
    /// only the question); without it the search runs here, after the answer, as before.
    static func topicLookup(query: String, body: String, session: URLSession, searching: Task<[String], Never>? = nil) async -> TopicLookup? {
        if query.range(of: noPhotoQuery, options: [.regularExpression, .caseInsensitive]) != nil { return nil }
        let ents = answerEntities(query: query, answer: body)
        let names = ents.map(\.name)
        let found: [String]
        if let searching { found = await searching.value } else { found = await topSearchTitles(query, session: session) }
        let searchTitles = found
            .filter { !$0.lowercased().hasPrefix("list of") && !names.contains($0) }.prefix(2)
        let candidates = names + Array(searchTitles)
        let summaries = await withTaskGroup(of: (Int, TopicSummary?).self, returning: [TopicSummary?].self) { group in
            for (i, title) in candidates.enumerated() {
                group.addTask { (i, await topicSummary(title, session: session)) }
            }
            var out = [TopicSummary?](repeating: nil, count: candidates.count)
            for await (i, s) in group { out[i] = s }
            return out
        }
        let answerWords = AnswerSources.keyWords(body)
        var pic: AnswerPhoto?
        for (i, entity) in ents.enumerated() {
            guard let s = summaries[i], photoFromEntity(s, entity: entity, answerWords: answerWords),
                  let photo = AnswerPhoto.wikipediaLead(s.thumbnail?.source, width: s.thumbnail?.width, height: s.thumbnail?.height, title: s.title)
            else { continue }
            pic = photo
            break
        }
        let text = summaries.compactMap { $0 }.first { $0.extract != nil && $0.page != nil }
        if pic == nil && text == nil { return nil }
        return TopicLookup(photo: pic, extract: text?.extract, page: text?.page)
    }

    /// Capitalised runs the answer names, in photo order. A name after a preposition is never the subject
    /// ("the largest planet in the Solar System is Jupiter" gives Jupiter, and the Solar System is dropped). The question's own words count only when the
    /// answer names nothing else. Leading sentence words and dates are dropped; a lowercase particle keeps a name whole.
    /// Same rule as `answerEntities` in docs/engine.js.
    static func answerEntities(query: String, answer: String) -> [(name: String, echo: Bool)] {
        let q = query.lowercased()
        var out: [(name: String, echo: Bool, prep: Bool)] = []
        if let re = try? NSRegularExpression(pattern: answerEntityPattern) {
            for m in re.matches(in: answer, range: NSRange(answer.startIndex..., in: answer)) {
                guard let r = Range(m.range, in: answer) else { continue }
                var words = answer[r].split(whereSeparator: { $0.isWhitespace }).map(String.init)
                while let first = words.first, photoStopWords.contains(first) { words.removeFirst() }
                let name = words.joined(separator: " ")
                guard !name.isEmpty, !out.contains(where: { $0.name == name }) else { continue }
                var prior = answer[..<r.lowerBound].split(whereSeparator: { $0.isWhitespace }).map { String($0).lowercased() }
                while let last = prior.last, ["the", "a", "an", "its", "his", "her", "their", "our"].contains(last) { prior.removeLast() }
                let previous = prior.last
                out.append((name: name, echo: q.contains(name.lowercased()), prep: previous.map { prepositions.contains($0) } ?? false))
            }
        }
        let nonEcho = out.filter { !$0.echo }
        let pool = nonEcho.isEmpty ? out : nonEcho
        return Array(pool.filter { !$0.prep }.prefix(3)).map { (name: $0.name, echo: $0.echo) }
    }

    /// The entity's summary gives the photo: a real picture, the page contains the entity, and an echoed entity also
    /// shares a content word with the answer (its own words do not count). Same rule as `photoFromEntity` in docs/engine.js.
    static func photoFromEntity(_ s: TopicSummary, entity: (name: String, echo: Bool), answerWords: Set<String>) -> Bool {
        guard let extract = s.extract, s.thumbnail?.source != nil else { return false }
        let lower = extract.lowercased()
        guard entity.name.lowercased().split(whereSeparator: { $0.isWhitespace }).allSatisfy({ lower.contains($0) }) else { return false }
        guard entity.echo else { return true }
        let own = AnswerSources.keyWords(entity.name), lead = AnswerSources.keyWords(extract)
        return answerWords.contains { !own.contains($0) && lead.contains($0) }
    }

    /// The top Wikipedia search titles for the question. Empty on any failure.
    private static func topSearchTitles(_ query: String, session: URLSession) async -> [String] {
        guard let q = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=\(q)&format=json&srlimit=3"),
              let (data, response) = try? await session.data(from: url),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let hits = (json["query"] as? [String: Any])?["search"] as? [[String: Any]] else { return [] }
        return hits.compactMap { $0["title"] as? String }
    }

    /// One Wikipedia page's REST summary. Nil for a missing page or a disambiguation page.
    private static func topicSummary(_ title: String, session: URLSession) async -> TopicSummary? {
        guard let encoded = title.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
              let url = URL(string: "https://en.wikipedia.org/api/rest_v1/page/summary/\(encoded)"),
              let (data, response) = try? await session.data(from: url),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let s = try? JSONDecoder().decode(TopicSummary.self, from: data),
              s.type != "disambiguation", s.title != nil else { return nil }
        return s
    }

    /// "Who made you" is about Nimble, not the Wikipedia article the words happen to match.
    /// Mirrors `identity()` in docs/engine.js.
    func identityAnswer(_ input: String) -> QueryResult? {
        let pattern = "^(who (made|created|built|invented|wrote|developed|designed) (you|nimble)|who are you|what are you|who is (nimble|your (creator|maker)))\\s*\\??$"
        guard input.trimmingCharacters(in: .whitespaces).range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil else { return nil }
        return .text(heading: nil, body: "Nimble is an instant-answer app made by Joshua Trommel. More of his work is at jaybulb.com.", source: "Nimble", sourceURL: nil, imageURL: nil)
    }

    /// Physical constants from a table, no network: the models gave "the gravitational constant" as a definition
    /// with no number. Mirrors `constant()` in docs/engine.js; keep the two tables in step.
    static let constants: [(pattern: String, title: String, value: String)] = [
        ("^(?:newton'?s )?(?:universal )?(?:gravitational constant|constant of gravitation|big g)$", "Gravitational constant", "6.67430 × 10⁻¹¹ m³⋅kg⁻¹⋅s⁻²"),
        ("^speed of light(?: in (?:a )?vacuum)?$", "Speed of light", "299,792,458 m/s"),
        ("^planck'?s? constant$", "Planck constant", "6.62607015 × 10⁻³⁴ J⋅s"),
        ("^avogadro'?s? (?:number|constant)$", "Avogadro constant", "6.02214076 × 10²³ per mole"),
        ("^boltzmann'?s? constant$", "Boltzmann constant", "1.380649 × 10⁻²³ J/K"),
        ("^(?:elementary charge|charge (?:of|on) an? (?:electron|proton))$", "Elementary charge", "1.602176634 × 10⁻¹⁹ C"),
        ("^(?:ideal |universal |molar )?gas constant$", "Gas constant", "8.314462618 J/(mol⋅K)"),
        ("^(?:standard gravity|acceleration (?:due to|of) gravity(?: on earth)?|gravitational acceleration(?: on earth)?)$", "Standard gravity", "9.80665 m/s²"),
    ]

    func constantAnswer(_ input: String) -> QueryResult? {
        let q = input.trimmingCharacters(in: .whitespaces).lowercased().replacingOccurrences(of: "’", with: "'")
            .replacingOccurrences(of: "[?.!]+$", with: "", options: .regularExpression)
            .replacingOccurrences(of: "^(?:what(?:'s| is) |value of |tell me )?(?:the )?(?:value of (?:the )?)?", with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
        guard let hit = Self.constants.first(where: { q.range(of: $0.pattern, options: .regularExpression) != nil }) else { return nil }
        let nist = "https://physics.nist.gov/cuu/Constants/"
        return .text(heading: hit.title, body: hit.value, source: "NIST", sourceURL: nist, imageURL: nil, sources: [AnswerSource(name: "NIST", url: nist)])
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

    /// Cards, Tell me more and reports: a hung source gives up after 10 seconds, not URLSession's default 60.
    static let quick: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 10
        return URLSession(configuration: config)
    }()

    func query(_ input: String, ai: AIConfig = AIConfig(), useLLM: Bool = true, turns: TurnBuffer = TurnBuffer(), note: AIFailureNote? = nil, session injected: URLSession? = nil) async -> QueryResult {
        if let me = identityAnswer(input) { return me }
        if let k = constantAnswer(input) { return k }
        let session: URLSession
        if let injected {
            session = injected
        } else {
            let config = URLSessionConfiguration.default
            config.timeoutIntervalForRequest = 15
            session = URLSession(configuration: config)
        }
        if let site = await querySite(input, session: session) { return site }

        // Gemma first for a crisp one-line answer; fall back to DDG/Wikipedia when the
        // key is unreachable or Gemma returns UNKNOWN (keeps a no-key offline degrade).
        // All three start together so a cold LLM call doesn't add a sequential hop in
        // front of Wikipedia, only the preference order (llm > ddg > wiki) is sequential.
        let (ddgInput, wikiInput) = preprocessQuery(input)
        // With the on-device model answering, the question sends nothing to DuckDuckGo or Wikipedia.
        let localOnly = useLLM && ai.engine == .onDevice && OnDeviceAnswers.isAvailable
        async let llm: QueryResult? = useLLM ? await queryLLM(input, session: session, ai: ai, turns: turns, note: note) : nil
        async let ddg: QueryResult? = localOnly ? nil : queryDDG(ddgInput, session: session)
        async let wiki: QueryResult? = localOnly ? nil : queryWikipedia(wikiInput, session: session, question: input)
        // The answer's Wikipedia topic fills a missing picture and the "Why this answer" text. Only when the
        // user allowed an AI (useLLM) and nothing stayed on device; a "no" answer is DDG and Wikipedia only.
        let topicOK = useLLM && !localOnly
        // The topic's Wikipedia search needs only the question: started now, it no longer waits for the AI (up to 0.7 s).
        let searching: Task<[String], Never>? = topicOK && input.range(of: Self.noPhotoQuery, options: [.regularExpression, .caseInsensitive]) == nil
            ? Task { await Self.topSearchTitles(input, session: session) } : nil
        var llmResult = await llm
        if let split = llmResult, case .disagree(let alts, _, _) = split {
            // DDG's sourced answer that backs one of the two settles it, as on the web: the AI answer is dropped and the normal path runs.
            let backing = Self.settlingText(await ddg)
            if !alts.contains(where: { AnswerSources.agrees($0.answer, backing) }) { return split }
            llmResult = nil
        }
        if let llmResult {
            // A model's number is a guess with no source. If DDG has a sourced answer with a number
            // of its own, prefer it; otherwise the one-liner stands ("speed of sound" lost 343 m/s to a definition).
            if case .text(_, let body, _, _, _, _, _, _, _) = llmResult, body.rangeOfCharacter(from: .decimalDigits) != nil,
               let sourced = await ddg, case .text(_, let sourcedBody, _, _, _, _, _, _, _) = sourced,
               sourcedBody.rangeOfCharacter(from: .decimalDigits) != nil {
                return await Self.withTopic(withSources(Self.keepingPhoto(sourced, from: llmResult), others: [await wiki]), query: input, session: session, enabled: topicOK, searching: searching)
            }
            return await Self.withTopic(withSources(llmResult, others: [await ddg, await wiki]), query: input, session: session, enabled: topicOK, searching: searching)
        }

        if let ddgResult = await ddg { return await Self.withTopic(withSources(Self.labeledIfGeneric(ddgResult, question: input), others: [await wiki]), query: input, session: session, enabled: topicOK, searching: searching) }
        if let wikiResult = await wiki { return await Self.withTopic(withSources(wikiResult, others: []), query: input, session: session, enabled: topicOK, searching: searching) }

        let encoded = input.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? input
        return .error("No instant answer found.", searchURL: "https://duckduckgo.com/?q=\(encoded)")
    }

    /// The text a sourced answer is checked against: its grounding when it has one, else its sentence. Empty for no answer.
    static func settlingText(_ result: QueryResult?) -> String {
        guard case .text(_, let body, _, _, _, let grounding, _, _, _)? = result else { return "" }
        return grounding?.nonEmpty ?? body
    }

    /// The quiet line under a Wikipedia fallback when the AI's call failed. Nil when there is nothing to say.
    static func aiRestingNote(aiError: String?, source: String) -> String? {
        guard aiError != nil, source == "Wikipedia" else { return nil }
        return restingNote
    }

    static let restingNote = "The free AI is out of answers for today, so this is from Wikipedia. It resets in the evening."

    /// Attaches the linked sources to a text answer. `others` are results already fetched for the same question.
    private func withSources(_ result: QueryResult, others: [QueryResult?]) -> QueryResult {
        guard case .text(let heading, let body, let source, let sourceURL, let imageURL, let grounding, _, let photo, let bg) = result else { return result }
        let sources = AnswerSources.linked(body: body, candidates: [result] + others.compactMap { $0 })
        return .text(heading: heading, body: body, source: source, sourceURL: sourceURL, imageURL: imageURL,
                     grounding: grounding, sources: sources, photo: photo, background: bg)
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

    private func queryDDG(_ input: String, session: URLSession = QueryEngine.quick) async -> QueryResult? {
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

    /// "capital of X", "who wrote X", "when was X": a relation word and a subject. Only an intro sentence that carries
    /// the relation word answers it, so a list or a loose search hit never does. Same rule as `wiki()` in docs/engine.js.
    struct WikiRelation: Equatable {
        let subject: String
        let word: String
        let excluded: String?

        private static let shapes: [(pattern: String, word: String, excluded: String?)] = [
            (#"(?i)^(?:what(?:'s|\s+is)(?:\s+the)?\s+|the\s+)?capital(?:\s+city)?\s+of\s+(.+?)\s*\??$"#, #"(?i)\bcapital\b"#, #"(?i)capital punishment"#),
            (#"(?i)^who\s+(?:wrote|written|authored|painted|composed|directed|invented|discovered|founded|created)\s+(.+?)\s*\??$"#,
             #"(?i)\b(?:written|wrote|author|authored|composed|painted|directed|invented|discovered|founded|created)\b"#, nil),
            (#"(?i)^when\s+(?:was|did|were|is)\s+(.+?)(?:\s+(?:born|founded|built|invented|released|published|created|written|made|died|die))?\s*\??$"#,
             #"\b(?:1[0-9]{3}|20[0-9]{2})\b"#, nil),
        ]

        static func of(_ query: String) -> WikiRelation? {
            let q = query.trimmingCharacters(in: .whitespaces)
            for shape in shapes {
                guard let re = try? NSRegularExpression(pattern: shape.pattern),
                      let m = re.firstMatch(in: q, range: NSRange(q.startIndex..., in: q)),
                      let r = Range(m.range(at: 1), in: q) else { continue }
                var subject = String(q[r])
                if subject.lowercased().hasPrefix("the ") { subject = String(subject.dropFirst(4)) }
                return WikiRelation(subject: subject, word: shape.word, excluded: shape.excluded)
            }
            return nil
        }

        /// The first sentence of an intro that carries the relation word. A search hit (not ownPage) must also name the subject.
        func sentence(in extract: String, ownPage: Bool) -> String? {
            let subjectWords = Set(WikiRelation.words(subject))
            for raw in WikiRelation.sentences(extract) {
                var s = raw.replacingOccurrences(of: #"\s*\(\s*\)"#, with: "", options: .regularExpression)
                s = s.replacingOccurrences(of: #"\s+,"#, with: ",", options: .regularExpression).trimmingCharacters(in: .whitespaces)
                guard s.range(of: word, options: .regularExpression) != nil else { continue }
                if let excluded, s.range(of: excluded, options: .regularExpression) != nil { continue }
                if ownPage { return s }
                let named = subjectWords.isEmpty
                    ? s.lowercased().contains(subject.lowercased())
                    : subjectWords.isSubset(of: Set(WikiRelation.words(s)))
                if named { return s }
            }
            return nil
        }

        /// Sentences split after . ! or ? and whitespace, the same break as the web's `first()`.
        static func sentences(_ text: String) -> [String] {
            guard let re = try? NSRegularExpression(pattern: #"(?<=[.!?])\s+"#) else { return [text] }
            var out: [String] = [], last = text.startIndex
            for m in re.matches(in: text, range: NSRange(text.startIndex..., in: text)) {
                guard let r = Range(m.range, in: text) else { continue }
                out.append(String(text[last..<r.lowerBound]))
                last = r.upperBound
            }
            out.append(String(text[last...]))
            return out
        }

        /// Content words of four letters or more, lower case (the web's keyWords).
        static func words(_ s: String) -> [String] {
            s.lowercased().components(separatedBy: CharacterSet.letters.inverted).filter { $0.count >= 4 }
        }
    }

    private struct IntroResponse: Decodable {
        struct Query: Decodable {
            struct Page: Decodable { let title: String?; let extract: String?; let missing: Bool? }
            let pages: [Page]?
        }
        let query: Query?
    }

    private struct SearchTitlesResponse: Decodable {
        struct Query: Decodable {
            struct Hit: Decodable { let title: String }
            let search: [Hit]?
        }
        let query: Query?
    }

    /// A relation question's intro: the page's lead text, its title and link. Nil for a missing page, a list or a disambiguation page.
    private static func introOf(_ title: String, session: URLSession) async -> (title: String, extract: String)? {
        guard let enc = title.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&format=json&formatversion=2&origin=*&titles=\(enc)"),
              let (data, response) = try? await session.data(from: url),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let page = try? JSONDecoder().decode(IntroResponse.self, from: data).query?.pages?.first,
              page.missing != true, let t = page.title, let extract = page.extract, !extract.isEmpty,
              !t.lowercased().hasPrefix("list of"),
              !extract.prefix(300).lowercased().contains("may refer to") else { return nil }
        return (t, extract)
    }

    /// The top search titles for a question, list articles removed. Empty on any failure.
    private static func searchHits(_ query: String, session: URLSession) async -> [String] {
        guard let enc = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=\(enc)&format=json&srlimit=5&origin=*"),
              let (data, _) = try? await session.data(from: url),
              let titles = try? JSONDecoder().decode(SearchTitlesResponse.self, from: data).query?.search?.map(\.title) else { return [] }
        return titles.filter { !$0.lowercased().hasPrefix("list of") }.prefix(5).map { $0 }
    }

    /// `question` is the user's own words when `input` is a preprocessed search ("what was the" stripped), so the
    /// generic-topic label checks what was actually asked.
    func queryWikipedia(_ input: String, session: URLSession = QueryEngine.quick, question: String? = nil) async -> QueryResult? {
        if let rel = WikiRelation.of(input) {
            // A relation question never falls back to a loose search hit: the subject's own page first, then the top hits.
            let hits = await Self.searchHits(input, session: session)
            let own = await Self.introOf(rel.subject, session: session)
            var pages: [(title: String, extract: String)?] = [own]
            for t in hits { pages.append(await Self.introOf(t, session: session)) }
            for (i, page) in pages.enumerated() {
                guard let page, let body = rel.sentence(in: page.extract, ownPage: i == 0) else { continue }
                let slug = page.title.replacingOccurrences(of: " ", with: "_")
                return .text(heading: page.title, body: body, source: "Wikipedia",
                             sourceURL: "https://en.wikipedia.org/wiki/" + (slug.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? slug),
                             imageURL: nil, grounding: page.extract, sources: [], photo: nil)
            }
            return nil
        }

        // Any other question: the exact article first, then the top search hits; the first usable one answers.
        let searchTerm = input.replacingOccurrences(of: " ", with: "_")
        if let encoded = searchTerm.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
           let url = URL(string: "https://en.wikipedia.org/api/rest_v1/page/summary/\(encoded)"),
           let result = await fetchWikiSummary(url: url, session: session) {
            if case .text(let heading, _, _, _, _, _, _, _, _) = result, !(heading ?? "").lowercased().hasPrefix("list of") { return result }
        }
        for title in await Self.searchHits(input, session: session) {
            guard let encoded = title.replacingOccurrences(of: " ", with: "_").addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
                  let url = URL(string: "https://en.wikipedia.org/api/rest_v1/page/summary/\(encoded)"),
                  let result = await fetchWikiSummary(url: url, session: session) else { continue }
            if case .text(let heading, _, _, _, _, _, _, _, _) = result, !(heading ?? "").lowercased().hasPrefix("list of") {
                return Self.labeledIfGeneric(result, question: question ?? input)
            }
        }
        return nil
    }

    /// A specific question ("what was the first color photograph of a rainbow") that only a generic topic page
    /// comes back for. The topic page is background: the body stays the page's own sentence, and the flag tells the
    /// card to say BACKGROUND and show the "Not a direct answer" caption instead of ANSWER.
    static func labeledIfGeneric(_ result: QueryResult, question: String) -> QueryResult {
        guard case .text(let heading, let body, let source, let sourceURL, let imageURL, let grounding, let sources, let photo, _) = result,
              source == "Wikipedia", let topic = heading, isSpecificQuestion(question, topic: topic) else { return result }
        return .text(heading: heading, body: body, source: source,
                     sourceURL: sourceURL, imageURL: imageURL, grounding: grounding, sources: sources, photo: photo, background: true)
    }

    /// True when a question word opens the question and it names something beyond the topic's title.
    /// "what is the speed of light" against "Speed of light" has nothing extra, so it stays a direct answer.
    static func isSpecificQuestion(_ question: String, topic: String) -> Bool {
        func tokens(_ s: String) -> [String] {
            s.lowercased().components(separatedBy: CharacterSet.letters.inverted).filter { !$0.isEmpty }
        }
        let words = tokens(question)
        let questionWords: Set<String> = ["what", "who", "when", "where", "which", "how"]
        let filler: Set<String> = questionWords.union(["was", "is", "are", "were", "the", "a", "an", "of", "in", "on", "to", "did", "does", "do", "it", "its", "that"])
        guard let first = words.first, questionWords.contains(first) else { return false }
        let topicWords = Set(tokens(topic))
        return words.contains { !filler.contains($0) && !topicWords.contains($0) }
    }

    private func fetchWikiSummary(url: URL, session: URLSession = QueryEngine.quick) async -> QueryResult? {
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

    /// "Tell me more": three sentences from the free proxy, or nil when it has nothing more. Mirrors tellMore() in docs/engine.js.
    static func tellMore(_ question: String, session: URLSession = QueryEngine.quick) async -> String? {
        guard let url = URL(string: AIEngine.nimble.defaultBaseURL) else { return nil }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["q": question, "more": true])
        guard let (data, _) = try? await session.data(for: req),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let answer = (json["answer"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
              !answer.isEmpty, answer != "UNKNOWN" else { return nil }
        return answer
    }

    /// "This is wrong": the question and the answer text go to the review list, nothing else. Mirrors reportWrong() in docs/engine.js.
    static func reportWrong(_ question: String, answer: String, session: URLSession = QueryEngine.quick) async -> Bool {
        guard let url = URL(string: AIEngine.nimble.defaultBaseURL + "/report") else { return false }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["q": question, "answer": String(answer.prefix(500))])
        guard let (data, _) = try? await session.data(for: req),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
        return json["ok"] as? Bool == true
    }

    private static let fractionDivisors = ["half": "2", "third": "3", "quarter": "4"]

    /// "half of 250", "25% off 80", "15 percent tip on 60", "average of 2, 4 and 9". Mirrors docs/engine.js.
    static func everydayMath(_ s: String) -> String {
        // "1,000" is one thousand; "2, 4 and 9" (comma then space) stays a list.
        var t = s.replacingOccurrences(of: #"(\d),(\d{3})\b"#, with: "$1$2", options: .regularExpression)
        // "split 120 four ways", "double 36", "what percent is 20 of 80", "20 is what percent of 80", "increase 50 by 10%".
        for (word, num) in wordNumbers { t = t.replacingOccurrences(of: "^split ([\\d.]+) \(word) ways$", with: "split $1 \(num) ways", options: .regularExpression) }
        t = t.replacingOccurrences(of: #"^split ([\d.]+) ([\d.]+) ways$"#, with: "($1/$2)", options: .regularExpression)
            .replacingOccurrences(of: #"^(double|twice) ([\d.]+)$"#, with: "($2*2)", options: .regularExpression)
            .replacingOccurrences(of: #"^triple ([\d.]+)$"#, with: "($1*3)", options: .regularExpression)
            .replacingOccurrences(of: #"^(?:what )?percent(?:age)? is ([\d.]+) of ([\d.]+)$"#, with: "($1/$2*100)", options: .regularExpression)
            .replacingOccurrences(of: #"^([\d.]+) is what percent(?:age)? of ([\d.]+)$"#, with: "($1/$2*100)", options: .regularExpression)
            .replacingOccurrences(of: #"^(?:increase|raise) ([\d.]+) by ([\d.]+) ?(?:%|percent)$"#, with: "($1*(1+$2/100))", options: .regularExpression)
            .replacingOccurrences(of: #"^(?:decrease|reduce) ([\d.]+) by ([\d.]+) ?(?:%|percent)$"#, with: "($1*(1-$2/100))", options: .regularExpression)
            .replacingOccurrences(of: #"^an? (?=\d)"#, with: "", options: .regularExpression)
        if let r = try? Regex(#"\b(?:a |one )?(half|third|quarter) of ([\d.]+)"#) {
            t = t.replacing(r) { m in
                "(\(m.output[2].substring ?? "")/\(fractionDivisors[String(m.output[1].substring ?? "")] ?? "1"))"
            }
        }
        t = t.replacingOccurrences(of: #"([\d.]+)\s*(?:%|percent)\s*off\s*([\d.]+)"#, with: "($2-$2*$1/100)", options: .regularExpression)
        t = t.replacingOccurrences(of: #"([\d.]+)\s*(?:%|percent)\s*(?:tip\s+)?(?:of|on)\s*"#, with: "$1/100*", options: .regularExpression)
        if let r = try? Regex(#"\b(?:the )?(?:average|mean) of ([\d.]+(?:\s*(?:,\s*and\b|,|\band\b)\s*[\d.]+)+)"#),
           let sep = try? Regex(#"\s*(?:,|\band\b)\s*"#) {
            t = t.replacing(r) { m in
                let n = String(m.output[1].substring ?? "").split(separator: sep)
                return "((\(n.joined(separator: "+")))/\(n.count))"
            }
        }
        return t
    }

    func parseNaturalLanguageMath(_ input: String) -> String? {
        // The iPhone keyboard types a curly apostrophe: "What’s 9+10".
        var text = input.lowercased().replacingOccurrences(of: "’", with: "'").trimmingCharacters(in: .whitespaces)

        // Strip filler ("what is the ...")
        for filler in Self.fillerPatterns where text.hasPrefix(filler) {
            text = String(text.dropFirst(filler.count))
        }
        text = text.replacingOccurrences(of: "^the\\s+", with: "", options: .regularExpression)
        text = text.replacingOccurrences(of: "?", with: "").trimmingCharacters(in: .whitespaces)

        let everyday = Self.everydayMath(text)
        if everyday == text {
            // Must contain a number (digit or word) and an operator word or a root ("12 squared", "cube root of 27").
            let rootPattern = "\\b(square root|sqrt|cube root|cbrt)(?: of)?\\s+"
            let hasNumber = text.range(of: "\\d", options: .regularExpression) != nil || Self.wordNumbers.keys.contains(where: { text.contains($0) })
            let hasOperator = Self.wordOperators.keys.contains(where: { text.contains($0) }) || text.range(of: "\\d\\s*[+*/^%-]\\s*[\\d(]", options: .regularExpression) != nil || text.range(of: rootPattern, options: .regularExpression) != nil
            guard hasNumber && hasOperator else { return nil }
        }
        text = everyday

        // Replace multi-word operators first, whole words only so "six" is not "si" times
        for (word, op) in Self.wordOperators.sorted(by: { $0.key.count > $1.key.count }) {
            text = text.replacingOccurrences(of: "\\b\(word)\\b", with: " \(op) ", options: .regularExpression)
        }

        // Replace word numbers
        for (word, num) in Self.wordNumbers {
            text = text.replacingOccurrences(of: "\\b\(word)\\b", with: num, options: .regularExpression)
        }

        // "twenty one" is 21, "one hundred" is 100, "two thousand" is 2000 (as on the web).
        if let r = try? Regex(#"\b([2-9]0) ([1-9])\b"#) { text = text.replacing(r) { m in String((Int(m.output[1].substring ?? "") ?? 0) + (Int(m.output[2].substring ?? "") ?? 0)) } }
        if let r = try? Regex(#"\b(\d+) (100|1000|1000000)\b"#) { text = text.replacing(r) { m in String((Int(m.output[1].substring ?? "") ?? 0) * (Int(m.output[2].substring ?? "") ?? 0)) } }

        // Roots: "square root of 49" and "sqrt 2" -> "sqrt(49)", "sqrt(2)"
        text = text.replacingOccurrences(of: "\\b(square root|sqrt)(?: of)?\\s+([0-9.]+)", with: "sqrt($2)", options: .regularExpression)
        text = text.replacingOccurrences(of: "\\b(cube root|cbrt)(?: of)?\\s+([0-9.]+)", with: "cbrt($2)", options: .regularExpression)

        // Clean up whitespace
        text = text.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)

        // Verify it looks like a math expression now
        let mathChars = CharacterSet(charactersIn: "0123456789.+-*/^%() ").union(.whitespaces)
        let isMath = text.replacingOccurrences(of: "sqrt|cbrt", with: "", options: .regularExpression).unicodeScalars.allSatisfy { mathChars.contains($0) }
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
        return String(t[..<r.lowerBound]).replacingOccurrences(of: #"\s{2,}"#, with: " ", options: .regularExpression)
    }
    return t.replacingOccurrences(of: #"\s{2,}"#, with: " ", options: .regularExpression)
}
