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

    static func == (lhs: QueryResult, rhs: QueryResult) -> Bool {
        switch (lhs, rhs) {
        case (.none, .none), (.loading, .loading): return true
        case let (.math(a), .math(b)): return a == b
        case let (.error(a, _), .error(b, _)): return a == b
        case let (.color(a), .color(b)): return a == b
        case let (.convert(a, b, c, d), .convert(e, f, g, h)): return (a, b, c, d) == (e, f, g, h)
        case let (.graph(a, _), .graph(b, _)): return a == b
        default: return false
        }
    }
}
