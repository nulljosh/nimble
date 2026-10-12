import SwiftUI

@main
struct NimbleApp: App {
    @State private var appState = AppState()

    init() {
        #if DEBUG
        // QA only: `-shotStub YES` answers the free Worker with the quota-out reply (Sources/iOS/QAWorkerStub.swift).
        if UserDefaults.standard.bool(forKey: "shotStub") { QAWorkerStub.install() }
        #endif
    }

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environment(appState)
                .overlay { WhatsNewSheet() }
        }
    }
}
