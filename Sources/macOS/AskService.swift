import AppKit

/// "Ask Nimble" from the Services menu on any selected text, and nimble://ask?q= links.
/// Both land in `ask`, which NimbleApp points at the HUD.
@MainActor
final class AskService: NSObject {
    static let shared = AskService()
    var ask: (String) -> Void = { _ in }

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
