import AppIntents

/// "Ask Nimble" in Siri, Spotlight, Shortcuts and the Action button. The intent only parks the question;
/// RootTabView picks it up when the app comes forward and runs it on the Ask tab.
struct AskNimbleIntent: AppIntent {
    static let title: LocalizedStringResource = "Ask Nimble"
    static let description = IntentDescription("Ask Nimble a question and get one sentence and a source.")
    static let openAppWhenRun = true

    @Parameter(title: "Question", requestValueDialog: "What do you want to know?")
    var question: String

    static let pendingKey = "pending_question"

    func perform() async throws -> some IntentResult {
        NimbleStorage.defaults().set(question, forKey: Self.pendingKey)
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
