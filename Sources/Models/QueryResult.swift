import CoreGraphics

// Foundation/CoreGraphics only, no SwiftUI — shared with the terminal frontend (tui/),
// which imports SwiftTUI and can't also import SwiftUI in the same module.
enum QueryResult: Equatable {
    case none
    case loading
    /// steps is the "Show steps" list (one line per operation); empty when there is nothing to expand.
    case math(String, steps: [String] = [])
    /// grounding is the text the body sentence was cut from ("Why this answer"); nil when there is none.
    case text(heading: String?, body: String, source: String, sourceURL: String?, imageURL: String?, grounding: String? = nil)
    case list(items: [String], source: String)
    case error(String, searchURL: String?)
    case color(String)
    case convert(from: String, to: String, fromUnit: String, toUnit: String)
    case graph(expr: String, points: [CGPoint])
    /// One big number, a small label under it, one quiet line: weather, currency, local time.
    case card(big: String, unit: String, sub: String, source: String, url: String?)

    static func == (lhs: QueryResult, rhs: QueryResult) -> Bool {
        switch (lhs, rhs) {
        case (.none, .none), (.loading, .loading): return true
        case let (.math(a, _), .math(b, _)): return a == b
        case let (.error(a, _), .error(b, _)): return a == b
        case let (.color(a), .color(b)): return a == b
        case let (.convert(a, b, c, d), .convert(e, f, g, h)): return (a, b, c, d) == (e, f, g, h)
        case let (.graph(a, _), .graph(b, _)): return a == b
        case let (.card(a, b, c, d, e), .card(f, g, h, i, j)): return (a, b, c, d, e) == (f, g, h, i, j)
        default: return false
        }
    }

    /// What Copy Result puts on the pasteboard; nil when there is nothing to copy.
    var copyText: String? {
        switch self {
        case .math(let s, _): return s
        case .text(_, let body, _, _, _, _): return body
        case .list(let items, _): return items.joined(separator: "\n")
        case .error(let msg, _): return msg
        case .color(let hex): return hex
        case .convert(let from, let to, let fromUnit, let toUnit): return "\(from) \(fromUnit) = \(to) \(toUnit)"
        case .graph(let expr, _): return "y = \(expr)"
        case .card(let big, let unit, let sub, _, _): return "\(big) \(unit), \(sub)"
        case .none, .loading: return nil
        }
    }

    /// What the share image says and who gets the credit; nil when there is no answer to share.
    var shareContent: (text: String, source: String)? {
        guard let text = copyText else { return nil }
        switch self {
        case .none, .loading, .error: return nil
        case .math, .convert, .graph, .color: return (text, "Computed offline")
        case .text(_, _, let source, _, _, _), .list(_, let source), .card(_, _, _, let source, _): return (text, source)
        }
    }
}
