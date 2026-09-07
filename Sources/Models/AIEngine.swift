import Foundation

/// Which model answers factual questions. `nimble` is the free house proxy (no key);
/// the rest call the vendor directly with the user's own key, which never leaves the device.
enum AIEngine: String, Codable, CaseIterable, Sendable {
    case nimble, claude, openai, ollama

    var displayName: String {
        switch self {
        case .nimble: return "Nimble (free)"
        case .claude: return "Claude"
        case .openai: return "OpenAI"
        case .ollama: return "Ollama (local)"
        }
    }

    var needsKey: Bool { self == .claude || self == .openai }

    var defaultModel: String {
        switch self {
        case .nimble: return ""
        case .claude: return "claude-opus-5"
        case .openai: return "gpt-5"
        case .ollama: return "llama3.1:8b"
        }
    }

    /// Default base URL; Ollama is the only one users typically change.
    var defaultBaseURL: String {
        switch self {
        case .nimble: return "https://nimble-answers.trommatic.workers.dev"
        case .claude: return "https://api.anthropic.com"
        case .openai: return "https://api.openai.com"
        case .ollama: return "http://localhost:11434"
        }
    }
}

struct AIConfig: Codable, Equatable, Sendable {
    var engine: AIEngine = .nimble
    var apiKey: String = ""
    var model: String = ""
    var baseURL: String = ""

    var resolvedModel: String { model.isEmpty ? engine.defaultModel : model }
    var resolvedBaseURL: String { baseURL.isEmpty ? engine.defaultBaseURL : baseURL }

    static let systemPrompt = "Answer in one short factual sentence. No preamble, no markdown. If you do not know, reply exactly UNKNOWN."

    /// Builds the vendor request for `question`. Nil when the engine has no usable config
    /// (e.g. Claude picked but no key) so the caller can fall back to the free proxy.
    func request(for question: String) -> URLRequest? {
        if engine.needsKey && apiKey.isEmpty { return nil }
        let base = resolvedBaseURL
        var req: URLRequest
        var body: [String: Any]
        switch engine {
        case .nimble:
            guard let url = URL(string: base) else { return nil }
            req = URLRequest(url: url)
            body = ["q": question]
        case .claude:
            guard let url = URL(string: base + "/v1/messages") else { return nil }
            req = URLRequest(url: url)
            req.setValue(apiKey, forHTTPHeaderField: "x-api-key")
            req.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
            body = ["model": resolvedModel, "max_tokens": 256, "system": Self.systemPrompt,
                    "messages": [["role": "user", "content": question]]]
        case .openai, .ollama:
            // Ollama speaks the OpenAI chat shape at /v1, so one branch covers both.
            guard let url = URL(string: base + "/v1/chat/completions") else { return nil }
            req = URLRequest(url: url)
            if !apiKey.isEmpty { req.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization") }
            body = ["model": resolvedModel, "max_tokens": 256,
                    "messages": [["role": "system", "content": Self.systemPrompt],
                                 ["role": "user", "content": question]]]
        }
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        return req
    }

    /// Pulls the answer text out of whichever vendor shape came back. Returns (answer, source).
    func parse(_ data: Data) -> (String, String)? {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        var text: String?
        var source = engine.displayName
        switch engine {
        case .nimble:
            text = json["answer"] as? String
            source = json["source"] as? String ?? "Nimble"
        case .claude:
            let blocks = json["content"] as? [[String: Any]] ?? []
            text = blocks.compactMap { $0["type"] as? String == "text" ? $0["text"] as? String : nil }.joined()
        case .openai, .ollama:
            let choices = json["choices"] as? [[String: Any]] ?? []
            text = (choices.first?["message"] as? [String: Any])?["content"] as? String
        }
        guard let t = text?.trimmingCharacters(in: .whitespacesAndNewlines),
              !t.isEmpty, t.uppercased() != "UNKNOWN" else { return nil }
        if engine != .nimble { source = resolvedModel }
        return (t, source)
    }
}
