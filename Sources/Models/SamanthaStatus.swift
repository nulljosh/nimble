#if os(macOS)
import Foundation
import Observation

/// Whether Samantha (oMLX on localhost:8000) is up, which model she serves, and how fast she last answered.
@MainActor @Observable
final class SamanthaStatus {
    enum State: Equatable {
        case unknown
        case running(model: String)
        case down
    }

    private(set) var state: State = .unknown
    private(set) var lastLatency: TimeInterval?

    private static let baseURL = "http://localhost:8000"
    private static let omlxPath = "/opt/homebrew/bin/omlx"

    /// The first model id in an OpenAI-style `/v1/models` body, or nil when the body is anything else.
    nonisolated static func parse(_ data: Data) -> String? {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let models = json["data"] as? [[String: Any]],
              let id = models.first?["id"] as? String, !id.isEmpty else { return nil }
        return id
    }

    func refresh() async {
        guard let url = URL(string: Self.baseURL + "/v1/models") else { state = .down; return }
        var req = URLRequest(url: url)
        req.timeoutInterval = 2
        do {
            let (data, _) = try await URLSession.shared.data(for: req)
            if let model = Self.parse(data) {
                state = .running(model: model)
            } else {
                state = .down
            }
        } catch {
            state = .down
        }
    }

    /// One-token chat completion, timed. Thinking is off so the token budget is spent on the answer.
    func ping() async {
        if case .running = state {} else { await refresh() }
        guard case .running(let model) = state, let url = URL(string: Self.baseURL + "/v1/chat/completions") else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 30
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        let body: [String: Any] = [
            "model": model,
            "max_tokens": 1,
            "messages": [["role": "user", "content": "Say OK."]],
            "chat_template_kwargs": ["enable_thinking": false],
        ]
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        let started = Date()
        do {
            _ = try await URLSession.shared.data(for: req)
            lastLatency = Date().timeIntervalSince(started)
        } catch {
            await refresh()
        }
    }

    /// Starts oMLX without a shell and ignores its output, then looks again after it has had a moment.
    func start() {
        guard FileManager.default.isExecutableFile(atPath: Self.omlxPath) else { return }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: Self.omlxPath)
        process.arguments = ["start"]
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        do { try process.run() } catch { return }
        Task {
            try? await Task.sleep(for: .seconds(3))
            await self.refresh()
        }
    }
}
#endif
