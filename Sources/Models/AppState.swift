import SwiftUI
import Network
#if os(macOS)
import ServiceManagement
#else
import UIKit
import WidgetKit
#endif

// Started once at launch; currentPath is live from then on.
private let pathMonitor: NWPathMonitor = {
    let m = NWPathMonitor()
    m.start(queue: .global(qos: .utility))
    return m
}()

enum NimbleTheme: String, CaseIterable, Codable {
    case orange, red, yellow, green, blue, purple, pink, contrast

    var color: Color {
        switch self {
        case .orange: Color(red: 1.0, green: 0.55, blue: 0.07)
        case .red: Color(red: 0.86, green: 0, blue: 0)
        case .yellow: Color(red: 1.0, green: 0.79, blue: 0.19)
        case .green: Color(red: 0.46, green: 0.75, blue: 0.13)
        case .blue: Color(red: 0.16, green: 0.49, blue: 0.91)
        case .purple: Color(red: 0.38, green: 0.02, blue: 0.69)
        case .pink: Color(red: 0.82, green: 0.02, blue: 0.63)
        case .contrast: Color.primary
        }
    }

    /// The accent as text, links and the selected tab. Light mode gets a deep shade that reads on the cream
    /// (at least 4.5:1); dark mode keeps the bright color. Fills keep `color`.
    var ink: Color {
        switch self {
        case .orange: Color.adaptive(light: 0x9a4a00, dark: 0xff8c12)
        case .red: Color.adaptive(light: 0xb00000, dark: 0xdb0000)
        case .yellow: Color.adaptive(light: 0x8a6412, dark: 0xffca30)  // the same as Color.bulbDeep
        case .green: Color.adaptive(light: 0x3f6e0a, dark: 0x75bf21)
        case .blue: Color.adaptive(light: 0x1d5bb8, dark: 0x297de8)
        case .purple: Color.adaptive(light: 0x6105b0, dark: 0x6105b0)
        case .pink: Color.adaptive(light: 0xa3085f, dark: 0xd105a1)
        case .contrast: color
        }
    }

    /// nil follows the system light/dark setting; only Contrast pins dark.
    var colorScheme: ColorScheme? {
        self == .contrast ? .dark : nil
    }

    var displayName: String {
        rawValue.capitalized
    }
}


@MainActor
@Observable
final class AppState {
    var theme: NimbleTheme = .yellow  // brand yellow #FFCA30, same ink as tokens.css --yellow
    var mathEnabled: Bool = true
    /// Private mode: no request leaves the device. Answers come from math, units, graphs, the offline pack and the on-device model.
    var privateMode = false
    var launchOnStartup: Bool = false
    var centerWindow: Bool = false
    var defaultSuggestions: Bool = true
    /// Only acted on by the Mac build, the iOS app updates through the App Store , 
    /// but stored on both so the preferences file has one shape.
    var automaticUpdates: Bool = true
    private var lastUpdateCheck: Double = 0
    var ai: AIConfig = AIConfig()
    /// App Review 5.1.2(i): no query reaches an AI service until the user says yes.
    /// nil = not asked yet, false = answers come from DuckDuckGo and Wikipedia only.
    var aiConsent: Bool? = nil
    var askingAIConsent = false
    /// Which mascot sits in the empty state and the loading card: "flit" (default) or "fen".
    var mascot: String = "flit"
    /// Shape of the shared answer card: "wide" (default), "square" or "story".
    var cardShape: String = "wide"
    #if os(macOS)
    #endif

    var queryText: String = ""
    var result: QueryResult = .none {
        // Voice loop: a question asked out loud gets its answer read back, through the same voice Listen uses.
        didSet {
            guard speakNextAnswer, result != .loading, result != .none else { return }
            speakNextAnswer = false
            if let text = result.copyText { Speaker.shared.toggle(text) }
        }
    }
    /// Set when the mic hands over a question; the next real answer is spoken, then it clears.
    var speakNextAnswer = false
    /// When a live text answer to a time-sensitive question was fetched; the card shows it as "as of". Nil otherwise.
    var textAsOf: Freshness? = nil
    /// Why the free AI gave no answer for the current result, when its call failed. Nil otherwise.
    var aiError: String?
    var currentPlaceholder: String = ""
    var searchURL: String = ""
    /// Bumped by newQuestion(), so the field can take focus from SwiftUI (iOS and Mac).
    private(set) var focusRequest = 0
    /// Bumped by every query and by newQuestion(). A slow answer that arrives after either is dropped.
    private var queryGeneration = 0

    private let queryEngine = QueryEngine()
    private let prefs = Preferences()
    let history = SearchHistory()
    /// The offline Wikipedia pack. Downloaded only on a tap in Settings; answers offline when it is there.
    let offlinePack = OfflinePackStore()
    /// Last three AI exchanges for follow-ups. Memory only, never saved.
    private(set) var turns = TurnBuffer()
    private var placeholderTimer: Timer?
    #if canImport(Speech)
    /// The mic: words stream into the field, the question runs when you stop.
    let voice = Voice()
    #endif

    init() {
        _ = pathMonitor
        #if canImport(Speech)
        voice.onTranscript = { [weak self] in self?.queryText = $0 }
        voice.onFinish = { [weak self] in self?.queryText = $0; self?.speakNextAnswer = true; self?.performQuery() }
        #endif
        loadPreferences()
        rotatePlaceholder()
        startPlaceholderTimer()
        offlinePack.load()
        #if DEBUG
        // QA only: `-shotOfflinePack <path to the .gz>` installs a pack into the sandbox, so the offline shots can run.
        if QASandbox.launch, let path = UserDefaults.standard.string(forKey: "shotOfflinePack"),
           let gz = try? Data(contentsOf: URL(fileURLWithPath: path)) {
            offlinePack.installForQA(gz: gz)
        }
        #endif
    }

    /// Asset name of the chosen mascot. Flit is the default; anything but "fen" falls back to him.
    var mascotAsset: String { mascot == "fen" ? "Fen" : "Flit" }

    func loadPreferences() {
        let p = prefs.load()
        theme = NimbleTheme(rawValue: p.theme) ?? .yellow
        mathEnabled = p.mathEnabled
        launchOnStartup = p.launchOnStartup
        centerWindow = p.centerWindow
        defaultSuggestions = p.defaultSuggestions
        automaticUpdates = p.automaticUpdates
        lastUpdateCheck = p.lastUpdateCheck
        ai = p.ai ?? AIConfig()
        aiConsent = p.aiConsent
        mascot = p.mascot ?? "flit"
        cardShape = p.cardShape ?? "wide"
        privateMode = p.privateMode ?? false
    }

    func savePreferences() {
        let p = PreferencesData(
            theme: theme.rawValue,
            mathEnabled: mathEnabled,
            launchOnStartup: launchOnStartup,
            centerWindow: centerWindow,
            defaultSuggestions: defaultSuggestions,
            automaticUpdates: automaticUpdates,
            lastUpdateCheck: lastUpdateCheck,
            ai: ai,
            aiConsent: aiConsent,
            mascot: mascot,
            privateMode: privateMode,
            cardShape: cardShape
        )
        prefs.save(p)
        applyLaunchOnStartup()
    }

    func applyLaunchOnStartup() {
        #if os(macOS)
        if #available(macOS 13.0, *) {
            do {
                if launchOnStartup {
                    try SMAppService.mainApp.register()
                } else {
                    try SMAppService.mainApp.unregister()
                }
            } catch {
                // Silently fail -- sandboxed app may not have permission
            }
        }
        #endif
    }

    /// Starts over: the field empties, the answer goes, the field takes focus. Follow-up context is
    /// dropped too, so the next question is not read as a follow-up to the last one.
    func newQuestion() {
        queryGeneration += 1
        queryText = ""
        result = .none
        aiError = nil
        askingAIConsent = false
        turns.clear()
        focusRequest += 1
    }

    /// The network is up. A DEBUG QA launch can force offline with `-shotOffline YES`, for the offline screenshots.
    private var isOnline: Bool {
        #if DEBUG
        if QASandbox.launch, UserDefaults.standard.bool(forKey: "shotOffline") { return false }
        #endif
        return pathMonitor.currentPath.status == .satisfied
    }

    func performQuery() {
        let text = queryText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        queryGeneration += 1
        let generation = queryGeneration
        textAsOf = nil

        let encoded = text.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? text
        searchURL = "https://duckduckgo.com/?q=\(encoded)"

        // Units, then math, both offline
        if let converted = queryEngine.convert(text) {
            result = converted
            remember(text)
            return
        }
        if mathEnabled {
            if let mathResult = queryEngine.evaluateMath(text) {
                result = .math(mathResult, steps: queryEngine.mathSteps(text) ?? [])
                remember(text)
                return
            }
        }

        if let graphExpr = queryEngine.graphExpression(text), let graph = queryEngine.sampleGraph(graphExpr) {
            result = graph
            remember(text)
            return
        }

        // Fail fast offline instead of spinning through three request timeouts. With Apple's on-device
        // model ready, a question still gets an answer, and nothing leaves the device to get it.
        if !isOnline || privateMode {
            let offline = privateMode
                ? "Private mode is on, so nothing leaves this device. Math, units and graphs work. Download the offline answers to look up facts."
                : "You're offline. Math, units and graphs still work."
            // The offline pack answers first, when it is on this device. A miss says so, in the pack's own words.
            var packMiss = offline
            if offlinePack.pack != nil {
                packMiss = "Not in the offline pack. Math, units and graphs still work offline."
                if let hit = offlinePack.answer(text) {
                    let asOf = OfflinePack.asOfLabel(hit.builtAt).map { " · as of \($0)" } ?? ""
                    result = .text(heading: hit.title, body: hit.text, source: "Offline pack · Wikipedia (CC BY-SA)" + asOf,
                                   sourceURL: hit.url, imageURL: nil)
                    remember(text)
                    return
                }
            }
            guard OnDeviceAnswers.isAvailable, !queryEngine.isCardQuery(text) else {
                result = .error(packMiss, searchURL: nil)
                return
            }
            result = .loading
            let turns = self.turns
            Task { @MainActor [weak self] in
                let answer = await OnDeviceAnswers.answer(text, turns: turns)
                guard let self, generation == self.queryGeneration else { return }
                if let answer {
                    self.result = .text(heading: nil, body: answer, source: "On device", sourceURL: nil, imageURL: nil)
                    self.textAsOf = QueryEngine.isTimeSensitive(text) ? Freshness(date: Date(), isDay: false) : nil
                    self.turns.add(text, answer)
                    self.remember(text)
                } else {
                    self.result = .error(packMiss, searchURL: nil)
                }
            }
            return
        }

        // Weather, currency and local time are plain lookups, no AI, so no consent is needed.
        // If the lookup misses, the normal answer path takes over.
        if queryEngine.isCardQuery(text) {
            result = .loading
            let engine = queryEngine
            Task { @MainActor [weak self] in
                let card = await engine.card(text)
                guard let self, generation == self.queryGeneration else { return }
                if let card {
                    self.result = card
                    self.remember(text)
                } else {
                    self.result = .none
                    self.askAnswerEngine(text, generation: generation)
                }
            }
            return
        }
        askAnswerEngine(text, generation: generation)
    }

    private func askAnswerEngine(_ text: String, generation: Int) {
        // A website question is answered from the site itself, no AI involved, so it never needs
        // consent (the web app already behaves this way).
        if aiConsent == nil && queryEngine.siteHost(text) == nil {
            askingAIConsent = true
            return
        }
        let useLLM = aiConsent == true

        result = .loading
        aiError = nil
        let engine = queryEngine
        let ai = self.ai
        let turns = self.turns
        Task { @MainActor [weak self] in
            let note = AIFailureNote()
            let answer = await engine.query(text, ai: ai, useLLM: useLLM, turns: turns, note: note)
            guard let self, generation == self.queryGeneration else { return }
            self.result = answer
            if case .text = answer, QueryEngine.isTimeSensitive(text) { self.textAsOf = Freshness(date: Date(), isDay: false) }
            self.aiError = note.aiError
            switch answer {
            case .error, .none, .loading: break
            default: self.remember(text)
            }
            if useLLM, case .text(_, let body, _, _, _, _, _, _, _) = answer { self.turns.add(text, body) }
        }
    }

    /// Every answered question goes to history with its answer text, and on iOS to the widget too.
    /// Called only after `result` is set, so the answer is the current result's copy text.
    private func remember(_ text: String) {
        history.add(text, answer: result.historyText)
        #if os(iOS)
        if let answer = result.historyText {
            SharedAnswer.save(question: text, answer: answer)
            WidgetCenter.shared.reloadAllTimelines()
        }
        #endif
    }

    /// Clearing history also forgets the follow-up context.
    func clearHistory() {
        history.clear()
        turns.clear()
    }

    func answerAIConsent(_ allowed: Bool) {
        aiConsent = allowed
        askingAIConsent = false
        savePreferences()
        performQuery()
    }

    /// Who receives the query, named in the consent prompt.
    var aiRecipient: String {
        switch ai.engine {
        case .nimble: return "Nimble's answer service (Google Gemma and Alibaba Qwen on Cloudflare)"
        case .onDevice: return "Apple Intelligence on this device, nothing leaves it"
        case .claude: return "Anthropic (Claude)"
        case .openai: return "OpenAI"
        case .ollama: return "your own Ollama server"
        case .samantha: return "Samantha, running on this Mac"
        }
    }

    func randomSuggestion() -> String { queryEngine.randomSuggestion(useDefaults: defaultSuggestions) }

    func rotatePlaceholder() {
        currentPlaceholder = queryEngine.randomSuggestion(useDefaults: defaultSuggestions)
    }

    func onPopoverOpen() {
        // Called when popover appears -- focus the input
    }

    func copyResultText() {
        guard let text = result.copyText else { return }
        #if os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        #else
        UIPasteboard.general.string = text
        #endif
    }

    func copySearchLink() {
        #if os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(searchURL, forType: .string)
        #else
        UIPasteboard.general.string = searchURL
        #endif
    }

    func openInDDG() {
        guard let url = URL(string: searchURL) else { return }
        #if os(macOS)
        NSWorkspace.shared.open(url)
        #else
        UIApplication.shared.open(url)
        #endif
    }

    private func startPlaceholderTimer() {
        placeholderTimer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.rotatePlaceholder()
            }
        }
    }
}
