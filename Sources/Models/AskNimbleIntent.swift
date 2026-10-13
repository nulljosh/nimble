import AppIntents

/// "Ask Nimble" in Siri, Spotlight, Shortcuts and the Action button. On iPhone the intent parks the question
/// and RootTabView runs it on the Ask tab; on the Mac it goes straight to the HUD through AskService.
struct AskNimbleIntent: AppIntent {
    static let title: LocalizedStringResource = "Ask Nimble"
    static let description = IntentDescription("Ask Nimble a question and get one sentence and a source.")
    static let openAppWhenRun = true

    @Parameter(title: "Question", requestValueDialog: "What do you want to know?")
    var question: String

    static let pendingKey = "pending_question"

    @MainActor
    func perform() async throws -> some IntentResult {
        #if os(macOS)
        AskService.shared.ask(AskService.clean(question))
        #else
        NimbleStorage.defaults().set(question, forKey: Self.pendingKey)
        #endif
        return .result()
    }
}

struct NimbleShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: AskNimbleIntent(),
                    phrases: ["Ask \(.applicationName)", "Ask \(.applicationName) a question"],
                    shortTitle: "Ask Nimble",
                    systemImageName: "magnifyingglass")
    }
}
