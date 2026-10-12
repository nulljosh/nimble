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
            guard case .text(_, let cBody, let name, let url?, _, let grounding, _, _) = candidate,
                  out.count < 3, !out.contains(where: { $0.url == url }) else { continue }
            let text = grounding.flatMap { $0.isEmpty ? nil : $0 } ?? cBody
            if index == 0 || agrees(body, text) { out.append(AnswerSource(name: name, url: url)) }
        }
        return out
    }
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
    static func https(_ url: String?, width: Int? = nil, height: Int? = nil) -> AnswerPhoto? {
        guard let url, url.lowercased().hasPrefix("https://") else { return nil }
        return AnswerPhoto(url: url, width: width, height: height)
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
    case text(heading: String?, body: String, source: String, sourceURL: String?, imageURL: String?, grounding: String? = nil, sources: [AnswerSource] = [], photo: AnswerPhoto? = nil)
    case list(items: [String], source: String)
    case error(String, searchURL: String?)
    case color(String)
    case convert(from: String, to: String, fromUnit: String, toUnit: String)
    case graph(expr: String, points: [CGPoint])
    /// One big number, a small label under it, one quiet line: weather, currency, local time.
    case card(big: String, unit: String, sub: String, source: String, url: String?)
    /// The top three headlines for "news" or "what's happening in <place>"; source lists the outlets.
    case news(items: [NewsItem], source: String)

    static func == (lhs: QueryResult, rhs: QueryResult) -> Bool {
        switch (lhs, rhs) {
        case (.none, .none), (.loading, .loading): return true
        case let (.math(a, _), .math(b, _)): return a == b
        case let (.error(a, _), .error(b, _)): return a == b
        case let (.color(a), .color(b)): return a == b
        case let (.convert(a, b, c, d), .convert(e, f, g, h)): return (a, b, c, d) == (e, f, g, h)
        case let (.graph(a, _), .graph(b, _)): return a == b
        case let (.card(a, b, c, d, e), .card(f, g, h, i, j)): return (a, b, c, d, e) == (f, g, h, i, j)
        case let (.news(a, _), .news(b, _)): return a == b
        default: return false
        }
    }

    /// What Copy Result puts on the pasteboard; nil when there is nothing to copy.
    var copyText: String? {
        switch self {
        case .math(let s, _): return s
        case .text(_, let body, _, _, _, _, _, _): return body
        case .list(let items, _): return items.joined(separator: "\n")
        case .error(let msg, _): return msg
        case .color(let hex): return hex
        case .convert(let from, let to, let fromUnit, let toUnit): return "\(from) \(fromUnit) = \(to) \(toUnit)"
        case .graph(let expr, _): return "y = \(expr)"
        case .card(let big, let unit, let sub, _, _): return "\(big) \(unit), \(sub)"
        case .news(let items, _): return items.map { "\($0.sentence) (\($0.outlet))" }.joined(separator: "\n")
        case .none, .loading: return nil
        }
    }

    /// What the share image says and who gets the credit; nil when there is no answer to share.
    var shareContent: (text: String, source: String)? {
        guard let text = copyText else { return nil }
        switch self {
        case .none, .loading, .error: return nil
        case .math, .convert, .graph, .color: return (text, "Computed offline")
        // The share image carries one sentence, not the whole list.
        case .news(let items, let source): return items.first.map { ($0.sentence, source) }
        case .text(_, _, let source, _, _, _, _, _), .list(_, let source), .card(_, _, _, let source, _): return (text, source)
        }
    }
}
