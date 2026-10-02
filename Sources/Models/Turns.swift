import Foundation

/// Follow-up memory: the last three AI exchanges, in memory only, so "and in celsius?"
/// has something to refer to. Same rules as `turns` in docs/engine.js.
struct TurnBuffer: Equatable, Sendable {
    struct Turn: Equatable, Sendable { let q: String; let a: String }
    static let maxTurns = 3

    private(set) var turns: [Turn] = []

    mutating func add(_ q: String, _ a: String) {
        let q = q.trimmingCharacters(in: .whitespacesAndNewlines)
        let a = a.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty, !a.isEmpty else { return }
        turns.append(Turn(q: q, a: a))
        if turns.count > Self.maxTurns { turns.removeFirst(turns.count - Self.maxTurns) }
    }

    mutating func clear() { turns = [] }

    /// The proxy's `turns` body field.
    var payload: [[String: String]] { turns.map { ["q": $0.q, "a": $0.a] } }

    /// Earlier exchanges as chat messages, oldest first, for the vendor engines.
    var messages: [[String: String]] {
        turns.flatMap { [["role": "user", "content": $0.q], ["role": "assistant", "content": $0.a]] }
    }
}
