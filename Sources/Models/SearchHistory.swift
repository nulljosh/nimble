import Foundation

/// Local search history: newest first, de-duplicated, last 50. Same rules as the web
/// app's searchHistory. Flat JSON in Application Support, never leaves the device.
@MainActor
@Observable
final class SearchHistory {
    static let maxEntries = 50
    private struct Row: Codable { var q: String; var t: Double }  // t in ms, like the web app

    private(set) var entries: [(q: String, t: Date)] = []
    private let file: URL

    init(directory: URL? = nil) {
        let base = directory
            ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
                .appendingPathComponent("Nimble", isDirectory: true)
            ?? FileManager.default.temporaryDirectory.appendingPathComponent("Nimble", isDirectory: true)
        file = base.appendingPathComponent("history.json")
        guard let data = try? Data(contentsOf: file), let rows = try? JSONDecoder().decode([Row].self, from: data) else { return }
        entries = rows.filter { !$0.q.isEmpty }.prefix(Self.maxEntries).map { ($0.q, Date(timeIntervalSince1970: $0.t / 1000)) }
    }

    func add(_ q: String) {
        let q = q.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return }
        entries.removeAll { $0.q.lowercased() == q.lowercased() }
        entries.insert((q, Date()), at: 0)
        if entries.count > Self.maxEntries { entries.removeLast(entries.count - Self.maxEntries) }
        save()
    }

    func clear() {
        entries = []
        save()
    }

    private func save() {
        do {
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            let rows = entries.map { Row(q: $0.q, t: ($0.t.timeIntervalSince1970 * 1000).rounded()) }
            try JSONEncoder().encode(rows).write(to: file, options: .atomic)
        } catch {
            // History is a nicety; never crash over it.
        }
    }
}
