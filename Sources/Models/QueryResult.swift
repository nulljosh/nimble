import Foundation
import CoreGraphics

/// One linked source behind a text answer: the name shown and the page it opens.
struct AnswerSource: Equatable, Hashable {
    let name: String
    let url: String
}

/// Multiple sources: a second source is listed only when its text backs the sentence. Same rule as
/// `agrees` in docs/engine.js; keep the two in step.
enum AnswerSources {
    static let glue: Set<String> = ["that", "this", "with", "from", "which", "were", "have", "they", "their", "also",
                                    "been", "into", "about", "after", "there", "these", "those", "when", "where",
                                    "while", "would", "could", "should", "will"]

    /// Words of four letters or more, lowercased, glue words dropped.
    static func keyWords(_ s: String) -> Set<String> {
        Set(s.lowercased().split(whereSeparator: { !($0.isASCII && $0.isLetter) }).map(String.init)
            .filter { $0.count >= 4 && !glue.contains($0) })
    }

    /// Most content words of the sentence must appear in the text, and every number in the sentence too.
    static func agrees(_ body: String, _ text: String) -> Bool {
        let want = keyWords(body)
        guard !want.isEmpty, !text.isEmpty else { return false }
        let have = keyWords(text)
        let hits = want.filter { have.contains($0) }.count
        let nums = body.split(whereSeparator: { !($0.isASCII && $0.isNumber) }).map(String.init)
        return hits >= Int((Double(want.count) * 0.6).rounded(.up)) && nums.allSatisfy { text.contains($0) }
    }

    /// Up to three linked sources, deduped by URL. `candidates` runs primary first: the first one needs
    /// no agreement, every other must back the sentence. Non-text results and unlinked ones are skipped.
    static func linked(body: String, candidates: [QueryResult]) -> [AnswerSource] {
        var out: [AnswerSource] = []
        for (index, candidate) in candidates.enumerated() {
            guard case .text(_, let cBody, let name, let url?, _, let grounding, _, _, _) = candidate,
                  out.count < 3, !out.contains(where: { $0.url == url }) else { continue }
            let text = grounding.flatMap { $0.isEmpty ? nil : $0 } ?? cBody
            if index == 0 || agrees(body, text) { out.append(AnswerSource(name: name, url: url)) }
        }
        return out
    }
}

/// One answer from a split: the answer text and the model that gave it, as the Worker names it ("Qwen3 30B").
struct DisputedAnswer: Equatable {
    let model: String
    let answer: String
}

/// One team in a game on the sports card. score is "" before kickoff; winner is ESPN's own flag.
struct SportsTeam: Equatable {
    let name: String
    let score: String
    let winner: Bool
}

/// One game: the teams (our team first, else away first), the status in words, and whether it has not kicked off.
struct SportsGame: Equatable {
    let teams: [SportsTeam]
    let isPre: Bool
    let status: String

    /// "Lakers 112, Warriors 104", or "Bills vs Rams" before kickoff. No bold, no markup.
    var line: String {
        if isPre && teams.count == 2 { return "\(teams[0].name) vs \(teams[1].name)" }
        return teams.map { $0.score.isEmpty ? $0.name : "\($0.name) \($0.score)" }.joined(separator: ", ")
    }
}

/// What the sports lookup found: games, no game on the days checked, or the request failed.
enum SportsOutcome: Equatable {
    case found
    case noGame(lastNight: Bool)
    case unavailable
}

/// The sports card. league is set for league scores ("NBA scores"); url is the page the card links to.
struct SportsCard: Equatable {
    static let source = "ESPN"
    let title: String
    let league: String?
    let games: [SportsGame]
    let outcome: SportsOutcome
    let url: String
    let asOf: Freshness?
}

extension String {
    /// The string, or nil when it is empty.
    var nonEmpty: String? { isEmpty ? nil : self }
}

/// A picture for a card, from Wikipedia, a site's share image or a news feed. https only.
struct AnswerPhoto: Equatable, Decodable {
    let url: String
    let width: Int?
    let height: Int?
    /// The Wikipedia page the picture belongs to: the "<Title> · Wikipedia" credit. Nil when there is none.
    var title: String? = nil

    /// A photo from any source, when the link is https; nil otherwise.
    static func https(_ url: String?, width: Int? = nil, height: Int? = nil, title: String? = nil) -> AnswerPhoto? {
        guard let url, url.lowercased().hasPrefix("https://") else { return nil }
        return AnswerPhoto(url: url, width: width, height: height, title: title)
    }

    /// Wikipedia's lead image, unless it is a logo, flag, icon or SVG drawing, or not a png, jpg, jpeg or webp.
    /// A raw .svg is never a photo; an SVG diagram's rendered ".svg.png" is. Same rule as `wikiPhoto` in docs/engine.js.
    static func wikipediaLead(_ url: String?, width: Int? = nil, height: Int? = nil, title: String? = nil) -> AnswerPhoto? {
        guard let photo = https(url, width: width, height: height),
              photo.url.range(of: #"\.svg(\?|$)|logo|flag|icon|coat[_ ]of[_ ]arms|seal|map|commons-"#,
                              options: [.regularExpression, .caseInsensitive]) == nil,
              photo.url.range(of: #"\.(png|jpe?g|webp)(\?|$)"#, options: [.regularExpression, .caseInsensitive]) != nil
        else { return nil }
        return AnswerPhoto(url: photo.url, width: width, height: height, title: title)
    }
}

/// One story on the news card: one sentence, the outlet that ran it, the link, and a picture when the feed has one.
struct NewsItem: Equatable, Decodable {
    let sentence: String
    let outlet: String
    let url: String
    /// The headline; the picture's alt text.
    var title: String = ""
    var image: AnswerPhoto? = nil
}

/// When a live answer was true: "as of Oct 12, 3:41 pm" for a moment, "as of Oct 9" for a daily value.
/// Pure: the label comes from the value and the zone it is given, never from the clock.
struct Freshness: Equatable {
    let date: Date
    /// A daily value (an exchange rate, a close): the label is the day only.
    let isDay: Bool

    func label(in zone: TimeZone = .current) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        if isDay {
            f.timeZone = TimeZone(identifier: "UTC")
            f.dateFormat = "MMM d"
            return f.string(from: date)
        }
        f.timeZone = zone
        f.dateFormat = "MMM d, h:mm a"
        // "3:41 PM" reads as "3:41 pm" in the freshness line, same as the web.
        return f.string(from: date).replacingOccurrences(of: " AM", with: " am").replacingOccurrences(of: " PM", with: " pm")
    }
}

// Foundation/CoreGraphics only, no SwiftUI, shared with the terminal frontend (tui/),
// which imports SwiftTUI and can't also import SwiftUI in the same module.
enum QueryResult: Equatable {
    case none
    case loading
    /// steps is the "Show steps" list (one line per operation); empty when there is nothing to expand.
    case math(String, steps: [String] = [])
    /// grounding is the text the body sentence was cut from ("Why this answer"); nil when there is none.
    /// sources is the linked list under the sentence (up to three); sourceURL and source stay the primary.
    /// photo is the picture above the card (Wikipedia, a site's share image); imageURL stays the small icon.
    /// background is true when the text is the generic topic page for a specific question: the card says BACKGROUND, not ANSWER.
    case text(heading: String?, body: String, source: String, sourceURL: String?, imageURL: String?, grounding: String? = nil, sources: [AnswerSource] = [], photo: AnswerPhoto? = nil, background: Bool = false)
    case list(items: [String], source: String)
    case error(String, searchURL: String?)
    case color(String)
    case convert(from: String, to: String, fromUnit: String, toUnit: String)
    case graph(expr: String, points: [CGPoint])
    /// One big number, a small label under it, one quiet line: weather, currency, local time.
    /// asOf is the freshness line; it is not part of equality.
    case card(big: String, unit: String, sub: String, source: String, url: String?, asOf: Freshness? = nil)
    /// The top three headlines for "news" or "what's happening in <place>"; source lists the outlets.
    case news(items: [NewsItem], source: String, asOf: Freshness? = nil)
    /// A price or rate: the title, the big number, the change in words. big is nil when the quote failed,
    /// and the card then says "Quote unavailable right now". Never a number we did not get.
    case market(title: String, big: String?, change: String?, source: String, url: String, asOf: Freshness? = nil)
    /// Scores from ESPN's scoreboard. Words carry the winner and the status; a missing game or a failed request is said in words.
    case sports(SportsCard)
    /// The models split and no source settled it: both answers, each with the model that gave it, and no pick.
    /// sources is the linked row under the answers (up to two); asOf is the freshness line.
    case disagree(alts: [DisputedAnswer], sources: [AnswerSource] = [], asOf: Freshness? = nil)

    static func == (lhs: QueryResult, rhs: QueryResult) -> Bool {
        switch (lhs, rhs) {
        case (.none, .none), (.loading, .loading): return true
        case let (.math(a, _), .math(b, _)): return a == b
        case let (.error(a, _), .error(b, _)): return a == b
        case let (.color(a), .color(b)): return a == b
        case let (.convert(a, b, c, d), .convert(e, f, g, h)): return (a, b, c, d) == (e, f, g, h)
        case let (.graph(a, _), .graph(b, _)): return a == b
        case let (.card(a, b, c, d, e, _), .card(f, g, h, i, j, _)): return (a, b, c, d, e) == (f, g, h, i, j)
        case let (.news(a, _, _), .news(b, _, _)): return a == b
        case let (.market(a, b, c, d, e, _), .market(f, g, h, i, j, _)): return (a, b, c, d, e) == (f, g, h, i, j)
        case let (.sports(a), .sports(b)): return (a.title, a.league, a.games, a.outcome, a.url) == (b.title, b.league, b.games, b.outcome, b.url)
        case let (.disagree(a, _, _), .disagree(b, _, _)): return a == b
        default: return false
        }
    }

    /// What Copy Result puts on the pasteboard; nil when there is nothing to copy.
    var copyText: String? {
        switch self {
        case .math(let s, _): return s
        case .text(_, let body, _, _, _, _, _, _, _): return body
        case .list(let items, _): return items.joined(separator: "\n")
        case .error(let msg, _): return msg
        case .color(let hex): return hex
        case .convert(let from, let to, let fromUnit, let toUnit): return "\(from) \(fromUnit) = \(to) \(toUnit)"
        case .graph(let expr, _): return "y = \(expr)"
        case .card(let big, let unit, let sub, _, _, _): return "\(big) \(unit), \(sub)"
        // An unavailable quote has nothing to copy or share.
        case .market(_, nil, _, _, _, _): return nil
        case .market(let title, let big?, let change, _, _, _): return [title + " " + big, change].compactMap { $0 }.joined(separator: ", ")
        case .news(let items, _, _): return items.map { "\($0.sentence) (\($0.outlet))" }.joined(separator: "\n")
        // A score is copied line by line; a missing game or a failed request has nothing to copy.
        case .sports(let card): return card.games.isEmpty ? nil : card.games.map { "\($0.line), \($0.status)" }.joined(separator: "\n")
        // Both answers, each with its model: "A (Qwen3 30B) / B (Gemma 4 26B)". No pick between them.
        case .disagree(let alts, _, _): return alts.map { "\($0.answer) (\($0.model))" }.joined(separator: " / ")
        case .none, .loading: return nil
        }
    }

    /// What History and the widget keep: the copy text, except a split keeps only its first answer.
    var historyText: String? {
        if case .disagree(let alts, _, _) = self { return alts.first?.answer }
        return copyText
    }

    /// What the share image says and who gets the credit; nil when there is no answer to share.
    var shareContent: (text: String, source: String)? {
        guard let text = copyText else { return nil }
        switch self {
        case .none, .loading, .error: return nil
        case .math, .convert, .graph, .color: return (text, "Computed offline")
        // The share image carries one sentence, not the whole list.
        case .news(let items, let source, _): return items.first.map { ($0.sentence, source) }
        case .text(_, _, let source, _, _, _, _, _, _), .list(_, let source), .card(_, _, _, let source, _, _), .market(_, _, _, let source, _, _): return (text, source)
        case .sports: return (text, SportsCard.source)
        case .disagree(let alts, _, _): return (text, alts.map(\.model).joined(separator: " / "))
        }
    }
}

extension QueryResult {
    /// The caption above a background answer: the generic topic page, not an answer to the question.
    static let backgroundCaption = "Not a direct answer to your question. Background from Wikipedia:"

    /// The header word over a text answer: BACKGROUND for the generic topic page, else ANSWER.
    static func eyebrow(background: Bool) -> String { background ? "Background" : "Answer" }

    /// The quiet line under the header. One line, never two stacked: the resting note first when the free AI
    /// is out for today, then the background caption on the generic topic page. Empty when neither applies.
    static func leadLines(background: Bool, aiError: String?, source: String) -> [String] {
        let note = QueryEngine.aiRestingNote(aiError: aiError, source: source)
        if background { return [[note, backgroundCaption].compactMap { $0 }.joined(separator: " ")] }
        return note.map { [$0] } ?? []
    }
}
