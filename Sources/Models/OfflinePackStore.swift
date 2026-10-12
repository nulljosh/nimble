import Foundation
import Observation

/// Keeps the offline pack on this device. Nothing here runs on its own: `download()` is called from a tap in Settings.
/// The file lives in Application Support/Nimble (the QA root in a QA launch), decompressed, so it loads without gunzip.
@MainActor
@Observable
final class OfflinePackStore {
    enum Phase: Equatable {
        case absent
        case downloading(Double)
        case ready
        case failed
    }

    static let packURL = URL(string: "https://nimble.jaybulb.com/pack/wikipedia-top-v1.json.gz")!
    static let indexURL = URL(string: "https://nimble.jaybulb.com/pack/index.json")!
    static let fileName = "wikipedia-top-v1.json"

    private(set) var pack: OfflinePack?
    private(set) var phase: Phase = .absent
    /// Size of the .gz from index.json, for the Download label. Nil until the index loads.
    private(set) var downloadBytes: Int64?

    private let directory: URL
    private let session: URLSession

    init(directory: URL = NimbleStorage.supportDirectory(), session: URLSession = .shared) {
        self.directory = directory
        self.session = session
    }

    var fileURL: URL { directory.appendingPathComponent(Self.fileName) }

    /// Reads a pack already on disk. The decode runs off the main thread.
    func load() {
        let url = fileURL
        guard FileManager.default.fileExists(atPath: url.path) else { return }
        Task.detached(priority: .utility) {
            let loaded = (try? Data(contentsOf: url)).flatMap { try? JSONDecoder().decode(OfflinePack.File.self, from: $0) }
            await MainActor.run { [weak self] in
                guard let self, let loaded else { return }
                self.pack = OfflinePack(file: loaded)
                self.phase = .ready
            }
        }
    }

    /// The size of the .gz, read from index.json (a few hundred bytes; the pack itself waits for a tap).
    func loadSize() async {
        guard downloadBytes == nil else { return }
        struct Index: Decodable { let bytes: Int64? }
        if let (data, _) = try? await session.data(from: Self.indexURL),
           let index = try? JSONDecoder().decode(Index.self, from: data) {
            downloadBytes = index.bytes
        }
    }

    /// Downloads, gunzips, checks and keeps the pack. A failure leaves any earlier state alone and shows .failed.
    func download() async {
        if case .downloading = phase { return }
        phase = .downloading(0)
        do {
            let gz = try await fetch(Self.packURL) { [weak self] fraction in
                Task { @MainActor in self?.phase = .downloading(fraction) }
            }
            try await install(gz: gz)
        } catch {
            phase = .failed
        }
    }

    /// Checks a downloaded .gz, writes the decompressed JSON, and makes it the live pack.
    func install(gz: Data) async throws {
        let dir = directory
        let file = fileURL
        let built: (Data, OfflinePack) = try await Task.detached(priority: .utility) {
            guard let json = OfflinePack.gunzip(gz) else { throw URLError(.cannotDecodeContentData) }
            let decoded = try JSONDecoder().decode(OfflinePack.File.self, from: json)
            guard !decoded.entries.isEmpty else { throw URLError(.cannotParseResponse) }
            return (json, OfflinePack(file: decoded))
        }.value
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try built.0.write(to: file, options: .atomic)
        pack = built.1
        phase = .ready
    }

    #if DEBUG
    /// QA only: installs a pack from a .gz right away, so a screenshot's first query never races the install.
    func installForQA(gz: Data) {
        guard let json = OfflinePack.gunzip(gz),
              let file = try? JSONDecoder().decode(OfflinePack.File.self, from: json) else { return }
        pack = OfflinePack(file: file)
        phase = .ready
    }
    #endif

    /// Removes the pack from this device. The next answer offline says it is not in the pack.
    func remove() {
        try? FileManager.default.removeItem(at: fileURL)
        pack = nil
        phase = .absent
    }

    /// The offline answer for a question, when a pack is loaded.
    func answer(_ query: String) -> OfflinePack.Answer? {
        pack?.answer(query)
    }

    /// Downloads one URL with progress (0...1), using the task's own progress so the total is the server's length.
    private func fetch(_ url: URL, progress: @escaping @Sendable (Double) -> Void) async throws -> Data {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Data, Error>) in
            let holder = ObservationHolder()
            let task = session.downloadTask(with: url) { tmp, response, error in
                holder.observation = nil
                if let error { cont.resume(throwing: error); return }
                guard let tmp, (response as? HTTPURLResponse)?.statusCode == 200, let data = try? Data(contentsOf: tmp) else {
                    cont.resume(throwing: URLError(.badServerResponse))
                    return
                }
                cont.resume(returning: data)
            }
            holder.observation = task.progress.observe(\.fractionCompleted, options: [.new]) { p, _ in
                progress(p.fractionCompleted)
            }
            task.resume()
        }
    }
}

/// Holds the progress observation for one download, released when that download completes.
private final class ObservationHolder: @unchecked Sendable {
    var observation: NSKeyValueObservation?
}
