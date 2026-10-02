#if canImport(Speech)
import AVFoundation
import Observation
import Speech

/// Speak the question. One mic, one recognizer, nothing recorded: audio goes to the
/// recognizer and is dropped. The words stream out as you talk, and the question
/// runs after 1.5 seconds of quiet or a second tap.
@MainActor
@Observable
final class Voice {
    enum Permission: Equatable { case notDetermined, granted, denied }

    private(set) var listening = false
    private(set) var transcript = ""
    private(set) var permission: Permission

    /// Every partial, so the field fills as you speak.
    @ObservationIgnored var onTranscript: (String) -> Void = { _ in }
    /// The words you ended on, once, after you stop.
    @ObservationIgnored var onFinish: (String) -> Void = { _ in }

    @ObservationIgnored private let provider: () -> Permission
    @ObservationIgnored private let supported: Bool
    @ObservationIgnored private var engine: AVAudioEngine?
    @ObservationIgnored private var request: SFSpeechAudioBufferRecognitionRequest?
    @ObservationIgnored private var task: SFSpeechRecognitionTask?
    @ObservationIgnored private var timer: Task<Void, Never>?

    static let silence: Double = 1.5
    static let noSpeech: Double = 8

    init(permission provider: @escaping () -> Permission = Voice.systemPermission) {
        self.provider = provider
        self.permission = provider()
        self.supported = (SFSpeechRecognizer(locale: .current) ?? SFSpeechRecognizer()) != nil
    }

    /// Ready to listen right now. Only a read: never asks, so a fresh install is false here.
    var available: Bool {
        guard supported, permission == .granted else { return false }
        return (SFSpeechRecognizer(locale: .current) ?? SFSpeechRecognizer())?.isAvailable ?? false
    }

    /// Whether the mic button shows. Not asked yet still shows (the tap asks); denied hides it.
    var offered: Bool { supported && permission != .denied }

    nonisolated static func systemPermission() -> Permission {
        combine(speech: SFSpeechRecognizer.authorizationStatus(), mic: AVCaptureDevice.authorizationStatus(for: .audio))
    }

    nonisolated static func combine(speech: SFSpeechRecognizerAuthorizationStatus, mic: AVAuthorizationStatus) -> Permission {
        if speech == .denied || speech == .restricted || mic == .denied || mic == .restricted { return .denied }
        if speech == .authorized && mic == .authorized { return .granted }
        return .notDetermined
    }

    func toggle() { listening ? stop() : start() }

    func start() {
        guard !listening else { return }
        permission = provider()
        switch permission {
        case .denied: return
        case .granted: begin()
        case .notDetermined:
            Task {
                // The system prompts show here, and only here: on the first tap.
                let speech = await Voice.askSpeech()
                let mic = speech ? await Voice.askMic() : false
                permission = provider()
                if speech && mic && permission == .granted { begin() }
            }
        }
    }

    /// Stop listening and run what was said.
    func stop() {
        guard listening else { return }
        let text = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        teardown()
        if !text.isEmpty { onFinish(text) }
    }

    /// Stop without asking anything.
    func cancel() { teardown() }

    // MARK: - Private

    private func begin() {
        guard supported, let recognizer = SFSpeechRecognizer(locale: .current) ?? SFSpeechRecognizer(), recognizer.isAvailable else { return }
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        // On the device when the language is there, so the audio never leaves it.
        if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }

        #if os(iOS)
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch { return }
        #endif

        let engine = AVAudioEngine()
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0 else { return }
        input.installTap(onBus: 0, bufferSize: 1024, format: format, block: Voice.tap(for: request))
        engine.prepare()
        do { try engine.start() } catch {
            input.removeTap(onBus: 0)
            return
        }

        transcript = ""
        self.engine = engine
        self.request = request
        task = recognizer.recognitionTask(with: request, resultHandler: Voice.results(for: self))
        listening = true
        arm(after: Voice.noSpeech)
    }

    private func heard(_ text: String?, done: Bool) {
        guard listening else { return }
        if let text, !text.isEmpty {
            transcript = text
            onTranscript(text)
            arm(after: Voice.silence)
        }
        if done { stop() }
    }

    private func arm(after seconds: Double) {
        timer?.cancel()
        timer = Task { [weak self] in
            try? await Task.sleep(for: .seconds(seconds))
            guard !Task.isCancelled else { return }
            self?.stop()  // nothing said just closes the mic, no question runs
        }
    }

    private func teardown() {
        timer?.cancel()
        timer = nil
        if let engine {
            engine.stop()
            engine.inputNode.removeTap(onBus: 0)
        }
        request?.endAudio()
        task?.cancel()
        engine = nil
        request = nil
        task = nil
        if listening {
            listening = false
            #if os(iOS)
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            #endif
        }
    }

    // The tap runs on the audio thread and the recognizer calls back on its own queue.
    // Closures built inside a main-actor method would inherit the actor and trap there,
    // so both are made out here and hop back with a Task.
    private struct Sink: @unchecked Sendable { let request: SFSpeechAudioBufferRecognitionRequest }

    nonisolated private static func tap(for request: SFSpeechAudioBufferRecognitionRequest) -> AVAudioNodeTapBlock {
        let sink = Sink(request: request)
        return { buffer, _ in sink.request.append(buffer) }
    }

    nonisolated private static func results(for voice: Voice) -> @Sendable (SFSpeechRecognitionResult?, Error?) -> Void {
        { result, error in
            let text = result?.bestTranscription.formattedString
            let done = (result?.isFinal ?? false) || error != nil
            Task { @MainActor in voice.heard(text, done: done) }
        }
    }

    nonisolated private static func askSpeech() async -> Bool {
        await withCheckedContinuation { c in
            SFSpeechRecognizer.requestAuthorization { c.resume(returning: $0 == .authorized) }
        }
    }

    nonisolated private static func askMic() async -> Bool {
        await AVCaptureDevice.requestAccess(for: .audio)
    }
}
#endif
