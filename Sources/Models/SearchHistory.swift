import Foundation

/// Search history: newest first, de-duplicated, last 50. Same rules as the web app's
/// searchHistory. Flat JSON in Application Support, mirrored to iCloud's key-value store so
/// iPhone and Mac share one list. iCloud only ever sees the question text and a timestamp.
@MainActor
@Observable
final class SearchHistory {
    static let maxEntries = 50
    static let cloudKey = "history"
    private struct Row: Codable { var q: String; var t: Double }  // t in ms, like the web app

    private(set) var entries: [(q: String, t: Date)] = []
    private let file: URL
    private let cloud: NSUbiquitousKeyValueStore?

    init(directory: URL? = nil, cloud: NSUbiquitousKeyValueStore? = .default) {
        self.cloud = cloud
        let base = directory
            ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
                .appendingPathComponent("Nimble", isDirectory: true)
            ?? FileManager.default.temporaryDirectory.appendingPathComponent("Nimble", isDirectory: true)
        file = base.appendingPathComponent("history.json")
        guard let data = try? Data(contentsOf: file), let rows = try? JSONDecoder().decode([Row].self, from: data) else { return }
        entries = rows.filter { !$0.q.isEmpty }.prefix(Self.maxEntries).map { ($0.q, Date(timeIntervalSince1970: $0.t / 1000)) }
        mergeFromCloud()
        if let cloud {
            NotificationCenter.default.addObserver(forName: NSUbiquitousKeyValueStore.didChangeExternallyNotification, object: cloud, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.mergeFromCloud() }
            }
            cloud.synchronize()
        }
    }

    /// Union of local and cloud rows, newest first, one per question. A clear on either
    /// device wins only for rows older than the clear, so the two sides converge.
    func mergeFromCloud() {
        guard let cloud, let data = cloud.data(forKey: Self.cloudKey),
              let rows = try? JSONDecoder().decode([Row].self, from: data) else { return }
        let clearedAt = cloud.double(forKey: Self.cloudKey + ".clearedAt")
        var merged = entries + rows.filter { !$0.q.isEmpty && $0.t > clearedAt }.map { ($0.q, Date(timeIntervalSince1970: $0.t / 1000)) }
        merged.sort { $0.t > $1.t }
        var seen = Set<String>()
        entries = merged.filter { seen.insert($0.q.lowercased()).inserted }.prefix(Self.maxEntries).map { $0 }
        save(toCloud: false)
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
        cloud?.set(Date().timeIntervalSince1970 * 1000, forKey: Self.cloudKey + ".clearedAt")
        save()
    }

    private func save(toCloud: Bool = true) {
        do {
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            let rows = entries.map { Row(q: $0.q, t: ($0.t.timeIntervalSince1970 * 1000).rounded()) }
            let data = try JSONEncoder().encode(rows)
            try data.write(to: file, options: .atomic)
            if toCloud, let cloud { cloud.set(data, forKey: Self.cloudKey) }
        } catch {
            // History is a nicety; never crash over it.
        }
    }
}
