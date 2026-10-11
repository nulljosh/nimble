import Foundation

/// Which model answers factual questions. `nimble` is the free house proxy (no key);
/// the rest call the vendor directly with the user's own key, which never leaves the device.
enum AIEngine: String, Codable, CaseIterable, Sendable {
    case nimble, claude, openai, ollama, samantha

    var displayName: String {
        switch self {
        case .nimble: return "Nimble (free)"
        case .claude: return "Claude"
        case .openai: return "OpenAI"
        case .ollama: return "Ollama (local)"
        case .samantha: return "Samantha (local)"
        }
    }

    var needsKey: Bool { self == .claude || self == .openai }

    var defaultModel: String {
        switch self {
        case .nimble: return ""
        case .claude: return "claude-opus-5-5"
        case .openai: return "gpt-5"
        case .ollama: return "llama3.1:8b"
        case .samantha: return "Qwen3.5-9B-OptiQ-4bit"
        }
    }

    /// Default base URL; Ollama is the only one users typically change.
    var defaultBaseURL: String {
        switch self {
        case .nimble: return "https://nimble-answers.trommatic.workers.dev"
        case .claude: return "https://api.anthropic.com"
        case .openai: return "https://api.openai.com"
        case .ollama: return "http://localhost:11434"
        case .samantha: return "http://localhost:8000"
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

    /// Local engines get live Wikipedia intros plus today's date, like the free proxy, because
    /// model weights are frozen ("Justin Trudeau" in 2026). Mirrors `grounding()` in docs/engine.js.
    static func groundingSuffix(_ context: String) -> String {
        guard !context.isEmpty else { return "" }
        let today = ISO8601DateFormatter().string(from: Date()).prefix(10)
        return " Today is \(today). Your training data is out of date; when the reference text below covers the question, trust it over your memory. Never mention the reference text.\n\nReference (live Wikipedia):\n\(context)"
    }

    /// Builds the vendor request for `question`. Nil when the engine has no usable config
    /// (e.g. Claude picked but no key) so the caller can fall back to the free proxy.
    func request(for question: String, turns: TurnBuffer = TurnBuffer(), context: String = "") -> URLRequest? {
        if engine.needsKey && apiKey.isEmpty { return nil }
        let base = resolvedBaseURL
        var req: URLRequest
        var body: [String: Any]
        switch engine {
        case .nimble:
            guard let url = URL(string: base) else { return nil }
            req = URLRequest(url: url)
            body = ["q": question, "turns": turns.payload]
        case .claude:
            guard let url = URL(string: base + "/v1/messages") else { return nil }
            req = URLRequest(url: url)
            req.setValue(apiKey, forHTTPHeaderField: "x-api-key")
            req.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
            body = ["model": resolvedModel, "max_tokens": 256, "system": Self.systemPrompt,
                    "messages": turns.messages + [["role": "user", "content": question]]]
        case .openai, .ollama, .samantha:
            // Ollama and Samantha (oMLX) speak the OpenAI chat shape at /v1, so one branch covers both.
            guard let url = URL(string: base + "/v1/chat/completions") else { return nil }
            req = URLRequest(url: url)
            if !apiKey.isEmpty { req.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization") }
            body = ["model": resolvedModel, "max_tokens": 256,
                    "messages": [["role": "system", "content": Self.systemPrompt + Self.groundingSuffix(context)]] + turns.messages
                                 + [["role": "user", "content": question]]]
            // Samantha's Qwen3.5 base reasons at length by default and would eat the token budget.
            if engine == .samantha { body["chat_template_kwargs"] = ["enable_thinking": false] }
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
        case .openai, .ollama, .samantha:
            let choices = json["choices"] as? [[String: Any]] ?? []
            text = (choices.first?["message"] as? [String: Any])?["content"] as? String
        }
        guard let t = text?.trimmingCharacters(in: .whitespacesAndNewlines),
              !t.isEmpty, t.uppercased() != "UNKNOWN" else { return nil }
        if engine == .samantha { source = "Samantha" } else if engine != .nimble { source = resolvedModel }
        return (t, source)
    }
}
