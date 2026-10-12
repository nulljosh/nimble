import SwiftUI

@main
struct NimbleApp: App {
    @State private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environment(appState)
                .overlay { WhatsNewSheet() }
        }
    }
}
