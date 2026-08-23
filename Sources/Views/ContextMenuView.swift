import SwiftUI

struct ContextMenuView: View {
    @Environment(AppState.self) private var state

    var body: some View {
        Group {
            // Theme submenu
            Menu("Theme") {
                ForEach(NimbleTheme.allCases, id: \.self) { theme in
                    Button(action: {
                        state.theme = theme
                        state.savePreferences()
                    }) {
                        HStack {
                            Text(theme.displayName)
                            if state.theme == theme {
                                Image(systemName: "checkmark")
                            }
                        }
                    }
                }
            }

            Divider()

            // Preferences submenu
            Menu("Preferences") {
                Toggle("Offline Math", isOn: Binding(
                    get: { state.mathEnabled },
                    set: { state.mathEnabled = $0; state.savePreferences() }
                ))
                Toggle("Launch on Startup", isOn: Binding(
                    get: { state.launchOnStartup },
                    set: { state.launchOnStartup = $0; state.savePreferences() }
                ))
                Toggle("Default Suggestions", isOn: Binding(
                    get: { state.defaultSuggestions },
                    set: { state.defaultSuggestions = $0; state.savePreferences() }
                ))
                Toggle("Check for Updates Automatically", isOn: Binding(
                    get: { state.automaticUpdates },
                    set: { state.automaticUpdates = $0; state.savePreferences() }
                ))
            }

            Divider()

            if let newVersion = state.updates.availableVersion {
                Button("Download Nimble \(newVersion)…") { state.updates.openUpdate() }
            } else {
                Button(state.updates.isChecking ? "Checking for Updates…" : "Check for Updates…") {
                    Task { await state.checkForUpdatesNow() }
                }
                .disabled(state.updates.isChecking)
            }

            Divider()

            Button("Copy Result") { state.copyResultText() }
            Button("Copy Search Link") { state.copySearchLink() }
            Button("Open in DuckDuckGo") { state.openInDDG() }

            Divider()

            Button("Quit Nimble") { NSApplication.shared.terminate(nil) }
        }
    }
}
