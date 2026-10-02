import CoreGraphics

// Foundation/CoreGraphics only, no SwiftUI — shared with the terminal frontend (tui/),
// which imports SwiftTUI and can't also import SwiftUI in the same module.
enum QueryResult: Equatable {
    case none
    case loading
    case math(String)
    case text(heading: String?, body: String, source: String, sourceURL: String?, imageURL: String?)
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
        case let (.math(a), .math(b)): return a == b
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
        case .math(let s): return s
        case .text(_, let body, _, _, _): return body
        case .list(let items, _): return items.joined(separator: "\n")
        case .error(let msg, _): return msg
        case .color(let hex): return hex
        case .convert(let from, let to, let fromUnit, let toUnit): return "\(from) \(fromUnit) = \(to) \(toUnit)"
        case .graph(let expr, _): return "y = \(expr)"
        case .card(let big, let unit, let sub, _, _): return "\(big) \(unit), \(sub)"
        case .none, .loading: return nil
        }
    }
}
