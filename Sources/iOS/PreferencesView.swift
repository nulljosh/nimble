import SwiftUI

struct PreferencesView: View {
    @Environment(AppState.self) private var state

    var body: some View {
        @Bindable var state = state

        List {
            Section("Theme") {
                ForEach(NimbleTheme.allCases, id: \.self) { theme in
                    Button {
                        state.theme = theme
                        state.savePreferences()
                    } label: {
                        HStack {
                            Text(theme.displayName)
                            Spacer()
                            if state.theme == theme {
                                Image(systemName: "checkmark")
                            }
                        }
                    }
                    .foregroundStyle(.primary)
                }
            }

            Section("Preferences") {
                Toggle("Offline Math", isOn: Binding(
                    get: { state.mathEnabled },
                    set: { state.mathEnabled = $0; state.savePreferences() }
                ))
                Toggle("Default Suggestions", isOn: Binding(
                    get: { state.defaultSuggestions },
                    set: { state.defaultSuggestions = $0; state.savePreferences() }
                ))
            }

            Section {
                Toggle("AI Answers", isOn: Binding(
                    get: { state.aiConsent == true },
                    set: { state.aiConsent = $0; state.savePreferences() }
                ))
            } footer: {
                Text("When on, the text you type is sent to \(state.aiRecipient). Nothing else is sent. When off, answers come from DuckDuckGo and Wikipedia only.")
            }

            Section("AI Engine") {
                AIEngineSettings(state: state)
            }
            .onDisappear { state.savePreferences() }

            Section {
                Button("Copy Result") { state.copyResultText() }
                Button("Copy Search Link") { state.copySearchLink() }
                Button("Open in DuckDuckGo") { state.openInDDG() }
            }
        }
        .navigationTitle("Preferences")
    }
}
