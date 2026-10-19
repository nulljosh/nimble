import Foundation

/// The offline Wikipedia pack: the opening sentences of the 9,000 most-viewed English articles.
/// A port of the pack lookup in docs/engine.js (packTokens, packHits, packText, packAnswer). Same scores, same
/// thresholds, same sentence breaks, so the web, iPhone and Mac give the same answer from the same pack.
/// Format and license: docs/pack/README.md.
struct OfflinePack: Sendable {
    struct Entry: Decodable, Sendable {
        let t: String
        let d: String?
        let e: String
        let u: String
        let a: [String]?
    }

    struct File: Decodable, Sendable {
        let version: Int?
        let builtAt: String?
        let entries: [Entry]
    }

    /// One answer: the sentences that answer, the article, and the pack's build date (yyyy-MM-dd).
    struct Answer: Equatable, Sendable {
        let title: String
        let text: String
        let url: String
        let builtAt: String
    }

    struct Relation {
        let subject: String
        let word: (String) -> Bool
        let excluded: ((String) -> Bool)?
    }

    /// A title or description needs this many points to count as a hit (PACK_MIN in engine.js).
    static let minScore = 3
    static let titleFiller: Set<String> = ["inc", "ltd", "corp", "co", "plc"]
    static let superlatives: Set<String> = ["largest", "longest", "deepest", "tallest", "highest", "biggest", "smallest", "oldest", "hottest", "coldest"]

    /// The title without a trailing "(film)" or "(company)". "(TV series)" and "(2026 film)" stay: they are other things.
    static func coreTitle(_ t: String) -> String {
        guard t.hasSuffix(")"), let open = t.lastIndex(of: "(") else { return t }
        let inside = t[open...].lowercased()
        if inside.contains(where: \.isNumber) || inside.contains("series") { return t }
        return String(t[..<open]).trimmingCharacters(in: .whitespaces)
    }

    /// True when the lead sentence says "is the <superlative>" as words ("is the fifth-longest" does not).
    static func leadSays(_ text: String, _ sup: String) -> Bool {
        let lead = text.components(separatedBy: ". ").first ?? text
        return lead.range(of: "\\bis the \(sup)\\b", options: [.regularExpression, .caseInsensitive]) != nil
    }
    /// Words that never count toward a match (PACK_STOP in engine.js).
    static let stop: Set<String> = Set(
        "a an and are as at be by did do does for from how i in is it its of on or that the to was were what when where which who whom whose why with the"
            .split(separator: " ").map(String.init))

    let builtAt: String
    let entries: [Entry]
    private let index: [Indexed]

    private struct Indexed: Sendable {
        let titleWords: [String]   // stop words removed, duplicates kept
        let titleSet: Set<String>  // title and aliases, every word
        let descSet: Set<String>
        let textSet: Set<String>
    }

    struct Hit {
        let entry: Entry
        let score: Int
        let index: Int
        let len: Int
    }

    init(file: File) {
        builtAt = file.builtAt ?? ""
        entries = file.entries
        index = file.entries.map { e in
            let titleTokens = Self.tokens(e.t)
            return Indexed(
                titleWords: Self.tokens(Self.coreTitle(e.t)).filter { !Self.stop.contains($0) && !Self.titleFiller.contains($0) },
                titleSet: Set(titleTokens + (e.a ?? []).flatMap(Self.tokens)),
                descSet: Set(Self.tokens(e.d ?? "")),
                textSet: Set(Self.tokens(e.e)))
        }
    }

    // MARK: - Lookup

    /// Lowercase, accents folded, every run of anything but a-z and 0-9 is a break. Exact words: no stemming.
    static func tokens(_ s: String) -> [String] {
        var out: [String] = []
        var cur = ""
        for u in s.lowercased().decomposedStringWithCompatibilityMapping.unicodeScalars {
            let v = u.value
            if (0x300...0x36F).contains(v) { continue }
            if (0x61...0x7A).contains(v) || (0x30...0x39).contains(v) {
                cur.unicodeScalars.append(u)
            } else if !cur.isEmpty {
                out.append(cur)
                cur = ""
            }
        }
        if !cur.isEmpty { out.append(cur) }
        return out
    }

    /// Every entry that matches the query, best first. A title match counts only when the title is about the query.
    func hits(_ query: String) -> [Hit] {
        let want = Set(Self.tokens(query)).subtracting(Self.stop)
        guard !want.isEmpty else { return [] }
        let sup = want.first { Self.superlatives.contains($0) }
        var out: [Hit] = []
        for (i, ix) in index.enumerated() {
            // Same rule as docs/engine.js packHits: no stray title word, except one the question cannot name when the
            // lead sentence says the title "is the largest" (Pacific Ocean for "largest ocean"). "sinking" covers "sink".
            let extra = ix.titleWords.filter { w in !want.contains { q in w == q || (q.count >= 4 && (w == q + "ing" || w == q + "ed")) } }.count
            let fits = extra == 0 || (extra == 1 && sup.map { Self.leadSays(entries[i].e, $0) } == true)
            var score = 0
            var named = false
            for w in want {
                if ix.titleSet.contains(w) {
                    if fits { score += 3; named = true } else { score += 1 }
                } else if ix.descSet.contains(w) {
                    score += 2
                } else if ix.textSet.contains(w) {
                    score += 1
                }
            }
            if named && score >= Self.minScore {
                out.append(Hit(entry: entries[i], score: score, index: i, len: ix.titleWords.count))
            }
        }
        // Ties go to the shorter title, then to the more-viewed entry (earlier in the pack).
        return out.sorted {
            if $0.score != $1.score { return $0.score > $1.score }
            if $0.len != $1.len { return $0.len < $1.len }
            return $0.index < $1.index
        }
    }

    /// The answer for a question, or nil. A relation question takes only an entry whose text carries the relation.
    func answer(_ query: String) -> Answer? {
        let rel = Self.relation(query)
        for hit in hits(rel?.subject ?? query) {
            let text = Self.text(hit.entry, query: query, rel: rel)
            if !text.isEmpty {
                return Answer(title: hit.entry.t, text: text, url: hit.entry.u, builtAt: builtAt)
            }
        }
        return nil
    }

    // MARK: - Text

    /// The sentences that answer. A relation question takes the lead sentence plus the first sentence with the relation
    /// word; no such sentence means "", never a guess. Other questions take the one or two sentences sharing two of the
    /// question's own words (all of them when it has fewer); a question that is only the title takes the first sentence,
    /// and anything else with no such sentence is a miss ("Human penis" answered "how many bones in the human body").
    static func text(_ e: Entry, query: String, rel: Relation?) -> String {
        let sents = sentences(e.e)
        guard let first = sents.first else { return "" }
        if let rel {
            guard let main = sents.first(where: { rel.word($0) && !(rel.excluded?($0) ?? false) }) else { return "" }
            return first == main ? main : first + " " + main
        }
        let titleWords = Set(tokens(e.t))
        let want = Set(tokens(query)).filter { !stop.contains($0) && !titleWords.contains($0) }
        var scored: [(sentence: String, index: Int, n: Int)] = []
        for (i, s) in sents.enumerated() {
            let toks = Set(tokens(s))
            let n = want.reduce(0) { $0 + (toks.contains($1) ? 1 : 0) }
            if n >= max(1, min(2, want.count)) { scored.append((s, i, n)) }
        }
        // The two sentences with the most shared words, read back in their order in the intro.
        let best = scored
            .sorted { a, b in a.n != b.n ? a.n > b.n : a.index < b.index }
            .prefix(2)
            .sorted { a, b in a.index < b.index }
        if best.isEmpty { return want.isEmpty ? first : "" }
        return best.map { $0.sentence }.joined(separator: " ")
    }

    /// Splits after . ! or ? and whitespace, but not after "Apple Inc." or "St." (SENTENCE_BREAK in engine.js).
    private static let sentenceBreak = try! NSRegularExpression(
        pattern: #"(?<!\b[A-Z][a-z]{0,2}\.)(?<=[.!?])\s+(?=[A-Z0-9"(])"#)

    static func sentences(_ text: String) -> [String] {
        let ns = text as NSString
        var out: [String] = []
        var last = 0
        for m in sentenceBreak.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            out.append(ns.substring(with: NSRange(location: last, length: m.range.location - last)))
            last = m.range.location + m.range.length
        }
        out.append(ns.substring(from: last))
        return out.filter { !$0.isEmpty }
    }

    // MARK: - Relation questions (relationOf in engine.js)

    private static let yearPattern = #"\b(?:1[0-9]{3}|20[0-9]{2})\b"#

    /// Pattern, the sentence word, the excluded phrase, and whether the second group is a verb the year sentence must carry.
    private static let shapes: [(re: String, word: String, not: String?, verbGroup: Bool)] = [
        (#"^(?:what(?:'s| is)(?: the)?\s+|the\s+)?capital(?:\s+city)?\s+of\s+(.+?)\s*\??$"#, #"\bcapital\b"#, "capital punishment", false),
        (#"^who\s+(?:wrote|written|authored|painted|composed|directed|invented|discovered|founded|created)\s+(.+?)\s*\??$"#,
         #"\b(?:written|wrote|author|authored|composed|painted|directed|invented|discovered|founded|created)\b"#, nil, false),
        (#"^when\s+(?:was|did|were|is)\s+(.+?)(?:\s+(born|founded|built|invented|released|published|created|written|made|died|die))?\s*\??$"#,
         yearPattern, nil, true),
        (#"^population\s+of\s+(.+?)\s*\??$"#, #"\bpopulation (?:of|is|was|at|about|around|over|estimated)\b[^.]*\d"#, nil, false),
    ]

    static func relation(_ query: String) -> Relation? {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        for shape in shapes {
            guard let re = try? NSRegularExpression(pattern: shape.re, options: [.caseInsensitive]),
                  let m = re.firstMatch(in: q, range: NSRange(q.startIndex..., in: q)),
                  let r = Range(m.range(at: 1), in: q) else { continue }
            let subject = String(q[r]).replacingOccurrences(of: #"^the\s+"#, with: "", options: [.regularExpression, .caseInsensitive])
            var verb: String?
            if shape.verbGroup, let vr = Range(m.range(at: 2), in: q) { verb = String(q[vr]) }
            let wordRe = compile(shape.word)
            let verbRe = verb.flatMap { compile(#"\b\#($0)\b"#) }
            let notRe = shape.not.flatMap(compile)
            let word: (String) -> Bool = { s in
                matches(wordRe, s) && (verbRe == nil || matches(verbRe, s))
            }
            let excluded: ((String) -> Bool)? = notRe.map { re in { s in matches(re, s) } }
            return Relation(subject: subject, word: word, excluded: excluded)
        }
        return nil
    }

    private static func compile(_ pattern: String) -> NSRegularExpression? {
        try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive])
    }

    private static func matches(_ re: NSRegularExpression?, _ s: String) -> Bool {
        guard let re else { return false }
        return re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) != nil
    }

    // MARK: - Files

    /// Gunzips a .gz file. Foundation's .zlib is raw deflate, so the gzip header and trailer are stripped by hand.
    /// Nil for anything that is not a complete gzip member.
    static func gunzip(_ data: Data) -> Data? {
        let b = [UInt8](data)
        guard b.count > 18, b[0] == 0x1f, b[1] == 0x8b, b[2] == 0x08 else { return nil }
        let flags = b[3]
        var i = 10
        if flags & 0x04 != 0 {
            guard i + 2 <= b.count else { return nil }
            i += 2 + (Int(b[i]) | (Int(b[i + 1]) << 8))
        }
        if flags & 0x08 != 0 { while i < b.count && b[i] != 0 { i += 1 }; i += 1 }
        if flags & 0x10 != 0 { while i < b.count && b[i] != 0 { i += 1 }; i += 1 }
        if flags & 0x02 != 0 { i += 2 }
        guard i < b.count - 8 else { return nil }
        let body = data.subdata(in: i..<(data.count - 8))
        return try? (body as NSData).decompressed(using: .zlib) as Data
    }

    /// "2026-10-12" to "Oct 12", read and written in UTC so the day never shifts with the local zone.
    static func asOfLabel(_ builtAt: String) -> String? {
        let parse = DateFormatter()
        parse.locale = Locale(identifier: "en_US_POSIX")
        parse.timeZone = TimeZone(identifier: "UTC")
        parse.dateFormat = "yyyy-MM-dd"
        guard let date = parse.date(from: builtAt) else { return nil }
        let out = DateFormatter()
        out.locale = Locale(identifier: "en_US_POSIX")
        out.timeZone = TimeZone(identifier: "UTC")
        out.dateFormat = "MMM d"
        return out.string(from: date)
    }
}
