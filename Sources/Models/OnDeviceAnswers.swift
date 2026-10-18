import Foundation
#if canImport(FoundationModels) && !os(watchOS)
import FoundationModels
#endif

/// Apple's on-device model (Apple Intelligence). It answers with no network at all, so it is the
/// offline answer engine and the "On device" choice in Settings. A nil answer means it could not
/// answer: not available, UNKNOWN, an error, or no reply within 10 seconds.
enum OnDeviceAnswers {
    /// True when Apple Intelligence is on and the model is ready on this device.
    static var isAvailable: Bool {
        #if canImport(FoundationModels) && !os(watchOS)
        if #available(iOS 26, macOS 26, *) {
            if case .available = SystemLanguageModel.default.availability { return true }
        }
        #endif
        return false
    }

    static func answer(_ question: String, turns: TurnBuffer) async -> String? {
        #if canImport(FoundationModels) && !os(watchOS)
        if #available(iOS 26, macOS 26, *) {
            guard isAvailable else { return nil }
            let contextual = prompt(for: question, turns: turns)
            return await withDeadline(seconds: 10) { await modelReply(contextual) }
        }
        #endif
        return nil
    }

    /// Last exchanges as plain text, so "and in celsius?" has something to refer to.
    private static func prompt(for question: String, turns: TurnBuffer) -> String {
        guard !turns.turns.isEmpty else { return question }
        let context = turns.turns.map { "Q: \($0.q)\nA: \($0.a)" }.joined(separator: "\n")
        return "Earlier in this conversation:\n\(context)\n\nQuestion: \(question)"
    }

    #if canImport(FoundationModels) && !os(watchOS)
    /// The session is made inside the call so nothing crosses task boundaries.
    @available(iOS 26, macOS 26, *)
    private static func modelReply(_ prompt: String) async -> String? {
        do {
            let session = LanguageModelSession(instructions: AIConfig.systemPrompt)
            let text = try await session.respond(to: prompt).content
            return cleaned(text)
        } catch {
            return nil
        }
    }
    #endif

    /// Same UNKNOWN rule as AIConfig.parse, plus a trailing period ("UNKNOWN.").
    static func cleaned(_ text: String) -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let bare = trimmed.hasSuffix(".") ? String(trimmed.dropLast()) : trimmed
        guard !trimmed.isEmpty, bare.uppercased() != "UNKNOWN" else { return nil }
        return trimmed
    }

    /// Runs `work` and gives up after `seconds`. A slow model call is abandoned, not waited on.
    private static func withDeadline<T: Sendable>(seconds: Double, _ work: @escaping @Sendable () async -> T?) async -> T? {
        await withCheckedContinuation { (continuation: CheckedContinuation<T?, Never>) in
            let gate = ResumeOnce(continuation)
            Task {
                gate.resume(await work())
            }
            Task {
                try? await Task.sleep(for: .seconds(seconds))
                gate.resume(nil)
            }
        }
    }
}

/// Resumes a continuation exactly once, whichever racer gets there first.
private final class ResumeOnce<T: Sendable>: @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<T?, Never>?

    init(_ continuation: CheckedContinuation<T?, Never>) {
        self.continuation = continuation
    }

    func resume(_ value: T?) {
        lock.lock()
        let pending = continuation
        continuation = nil
        lock.unlock()
        pending?.resume(returning: value)
    }
}
