import AVFoundation
import Observation

/// Listen: reads an answer aloud with the system voice, on the device. One answer at a time;
/// a second tap, a new answer or leaving the card stops it.
@MainActor @Observable
final class Speaker: NSObject, AVSpeechSynthesizerDelegate {
    static let shared = Speaker()

    /// The text being read now, or nil when quiet. The card compares it with its own text to show Stop.
    private(set) var speaking: String?
    @ObservationIgnored private let synth = AVSpeechSynthesizer()

    override init() {
        super.init()
        synth.delegate = self
    }

    /// Starts reading `text`, or stops when that same text is already playing.
    func toggle(_ text: String) {
        if speaking == text { stop(); return }
        synth.stopSpeaking(at: .immediate)
        let u = AVSpeechUtterance(string: text)
        u.voice = AVSpeechSynthesisVoice(language: Locale.preferredLanguages.first)
        speaking = text
        synth.speak(u)
    }

    func stop() {
        synth.stopSpeaking(at: .immediate)
        speaking = nil
    }

    nonisolated func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish u: AVSpeechUtterance) {
        let done = u.speechString
        Task { @MainActor in if self.speaking == done { self.speaking = nil } }
    }

    nonisolated func speechSynthesizer(_ s: AVSpeechSynthesizer, didCancel u: AVSpeechUtterance) {
        let done = u.speechString
        Task { @MainActor in if self.speaking == done { self.speaking = nil } }
    }
}
