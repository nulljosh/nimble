import Foundation

/// The iCloud key-value side of history. The app passes NSUbiquitousKeyValueStore; tests pass a fake.
protocol HistoryCloud: AnyObject {
    func data(forKey key: String) -> Data?
    func double(forKey key: String) -> Double
    func set(_ value: Any?, forKey key: String)
    @discardableResult func synchronize() -> Bool
}

extension NSUbiquitousKeyValueStore: HistoryCloud {}

/// Search history: newest first, de-duplicated, last 50. Same rules as the web app's
/// searchHistory. Flat JSON in Application Support, mirrored to iCloud's key-value store so
/// iPhone and Mac share one list. iCloud only ever sees the question text and a timestamp.
/// The saved answer (a short plain-text snippet) stays on the device that asked.
@MainActor
@Observable
final class SearchHistory {
    static let maxEntries = 50
    static let answerLimit = 280
    static let cloudKey = "history"
    static let removedKey = "history.removed"
    static let maxTombstones = 200

    struct Entry: Equatable {
        let q: String
        let t: Date
        /// Plain text of the answer, first 280 characters. Local only, never sent to iCloud.
        let a: String?
    }

    /// Codable on disk: `a` is optional, so files written before answers were saved still decode.
    private struct Row: Codable { var q: String; var t: Double; var a: String? }  // t in ms, like the web app

    private(set) var entries: [Entry] = []
    private let file: URL
    private let cloud: (any HistoryCloud)?

    init(directory: URL? = nil, cloud: (any HistoryCloud)? = NimbleStorage.cloudStore()) {
        self.cloud = cloud
        let base = directory ?? NimbleStorage.supportDirectory()
        file = base.appendingPathComponent("history.json")
        if let data = try? Data(contentsOf: file), let rows = try? JSONDecoder().decode([Row].self, from: data) {
            entries = rows.filter { !$0.q.isEmpty }.prefix(Self.maxEntries).map { Entry(q: $0.q, t: Date(timeIntervalSince1970: $0.t / 1000), a: $0.a) }
        }
        guard let cloud else { return }
        NotificationCenter.default.addObserver(forName: NSUbiquitousKeyValueStore.didChangeExternallyNotification, object: cloud as AnyObject, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.mergeFromCloud() }
        }
        cloud.synchronize()
        mergeFromCloud()
    }

    /// Union of local and cloud rows, newest first, one per question. A clear on either
    /// device wins only for rows older than the clear, and a removed question stays gone
    /// unless it was asked again after the removal, so the two sides converge.
    func mergeFromCloud() {
        guard let cloud else { return }
        let clearedAt = cloud.double(forKey: Self.cloudKey + ".clearedAt")
        let removed = readRemoved()
        let cloudRows = cloud.data(forKey: Self.cloudKey).flatMap { try? JSONDecoder().decode([Row].self, from: $0) } ?? []
        let fromCloud = cloudRows.filter { !$0.q.isEmpty }.map { Entry(q: $0.q, t: Date(timeIntervalSince1970: $0.t / 1000), a: nil) }

        // Answers never come from iCloud. Keep this device's answer for the same question.
        var answers: [String: String] = [:]
        for entry in entries { if let a = entry.a { answers[entry.q.lowercased()] = a } }

        var merged = (entries + fromCloud).filter { entry in
            let ms = entry.t.timeIntervalSince1970 * 1000
            return ms > clearedAt && ms > (removed[entry.q.lowercased()] ?? -.infinity)
        }
        merged.sort { $0.t > $1.t }
        var seen = Set<String>()
        entries = merged.filter { seen.insert($0.q.lowercased()).inserted }.prefix(Self.maxEntries).map { entry in
            Entry(q: entry.q, t: entry.t, a: entry.a ?? answers[entry.q.lowercased()])
        }
        save(toCloud: false)
    }

    /// Newest first. Asking the same question again moves it to the top and replaces its answer.
    func add(_ q: String, answer: String? = nil) {
        let q = q.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return }
        entries.removeAll { $0.q.lowercased() == q.lowercased() }
        let snippet = answer.map { String($0.trimmingCharacters(in: .whitespacesAndNewlines).prefix(Self.answerLimit)) }
        entries.insert(Entry(q: q, t: Date(), a: snippet?.isEmpty == false ? snippet : nil), at: 0)
        if entries.count > Self.maxEntries { entries.removeLast(entries.count - Self.maxEntries) }
        save()
    }

    /// Deletes the rows for these questions (matched ignoring case). The removal is recorded in
    /// iCloud as a tombstone, so another device's old copy of the list cannot bring them back.
    func remove(_ questions: Set<String>) {
        let keys = Set(questions.map { $0.lowercased() })
        guard !keys.isEmpty else { return }
        let now = (Date().timeIntervalSince1970 * 1000).rounded()
        var removed = readRemoved()
        for key in keys { removed[key] = now }
        let newest = removed.sorted { $0.value > $1.value }.prefix(Self.maxTombstones)
        writeRemoved(Dictionary(uniqueKeysWithValues: newest.map { ($0.key, $0.value) }))
        entries.removeAll { keys.contains($0.q.lowercased()) }
        save()
    }

    /// Plain text of the rows for these questions, in list order: each question, then its saved answer,
    /// blocks separated by a blank line. Matches questions ignoring case, like remove().
    func copyText(for questions: Set<String>) -> String {
        let keys = Set(questions.map { $0.lowercased() })
        return entries
            .filter { keys.contains($0.q.lowercased()) }
            .map { [$0.q, $0.a].compactMap { $0 }.joined(separator: "\n") }
            .joined(separator: "\n\n")
    }

    func clear() {
        entries = []
        cloud?.set(Date().timeIntervalSince1970 * 1000, forKey: Self.cloudKey + ".clearedAt")
        save()
    }

    /// Question (lowercased) to the time in ms it was removed.
    private func readRemoved() -> [String: Double] {
        cloud?.data(forKey: Self.removedKey).flatMap { try? JSONDecoder().decode([String: Double].self, from: $0) } ?? [:]
    }

    private func writeRemoved(_ removed: [String: Double]) {
        guard let data = try? JSONEncoder().encode(removed) else { return }
        cloud?.set(data, forKey: Self.removedKey)
    }

    private func save(toCloud: Bool = true) {
        do {
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            let rows = entries.map { Row(q: $0.q, t: ($0.t.timeIntervalSince1970 * 1000).rounded(), a: $0.a) }
            try JSONEncoder().encode(rows).write(to: file, options: .atomic)
            if toCloud, let cloud {
                // Questions and times only. The answer field is stripped before anything leaves the device.
                let cloudRows = rows.map { Row(q: $0.q, t: $0.t, a: nil) }
                cloud.set(try JSONEncoder().encode(cloudRows), forKey: Self.cloudKey)
            }
        } catch {
            // History is a nicety; never crash over it.
        }
    }
}
