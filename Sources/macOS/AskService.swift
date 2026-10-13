import AppKit

/// "Ask Nimble" from the Services menu on any selected text, and nimble://ask?q= links.
/// Both land in `ask`, which NimbleApp points at the HUD.
@MainActor
final class AskService: NSObject {
    static let shared = AskService()
    /// Until the HUD hooks in, a question waits here, so a Shortcut run at launch is not lost.
    private var handler: ((String) -> Void)?
    private var waiting: String?

    func ask(_ q: String) {
        if let handler { handler(q) } else { waiting = q }
    }

    func hook(_ handler: @escaping (String) -> Void) {
        self.handler = handler
        if let q = waiting { waiting = nil; handler(q) }
    }

    /// The question from a nimble://ask?q= link, or nil for any other link.
    nonisolated static func question(from url: URL) -> String? {
        guard url.scheme == "nimble" else { return nil }
        return URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "q" }?.value
    }

    /// Long selections are cut to 300 characters, the same cap as the iPhone share sheet.
    nonisolated static func clean(_ text: String) -> String {
        String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(300))
    }

    @objc func askNimble(_ pboard: NSPasteboard, userData: String?, error: AutoreleasingUnsafeMutablePointer<NSString?>) {
        let q = Self.clean(pboard.string(forType: .string) ?? "")
        if !q.isEmpty { ask(q) }
    }
}
