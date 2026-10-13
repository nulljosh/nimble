import SwiftUI

struct PreferencesView: View {
    @Environment(AppState.self) private var state

    var body: some View {
        @Bindable var state = state

        List {
            Section("Accent") {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: 4) {
                    ForEach(NimbleTheme.allCases, id: \.self) { theme in
                        Button {
                            state.theme = theme
                            state.savePreferences()
                        } label: {
                            Circle()
                                .fill(theme.color)
                                .frame(width: 30, height: 30)
                                .overlay(Circle().stroke(Color.hairline, lineWidth: 1))
                                .overlay {
                                    if state.theme == theme {
                                        Circle().stroke(Color.text, lineWidth: 2).frame(width: 38, height: 38)
                                    }
                                }
                                .frame(width: 44, height: 44)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(theme.displayName)
                        .accessibilityAddTraits(state.theme == theme ? .isSelected : [])
                    }
                }
                .padding(.vertical, 4)
            }

            Section(String(localized: "Mascot")) {
                HStack(spacing: 12) {
                    Picker(String(localized: "Mascot"), selection: $state.mascot) {
                        Text(verbatim: "Flit").tag("flit")
                        Text(verbatim: "Fen").tag("fen")
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    .onChange(of: state.mascot) { state.savePreferences() }

                    Image(state.mascotAsset)
                        .resizable()
                        .scaledToFit()
                        .frame(width: 28, height: 28)
                        .accessibilityHidden(true)
                }
            }

            Section("Preferences") {
                Toggle("Offline Math", isOn: Binding(
                    get: { state.mathEnabled },
                    set: { state.mathEnabled = $0; state.savePreferences() }
                ))
                Toggle("Private mode", isOn: Binding(
                    get: { state.privateMode },
                    set: { state.privateMode = $0; state.savePreferences() }
                ))
                Toggle("Default Suggestions", isOn: Binding(
                    get: { state.defaultSuggestions },
                    set: { state.defaultSuggestions = $0; state.savePreferences() }
                ))
            }

            Section("Offline answers") {
                OfflineAnswersRow(store: state.offlinePack)
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
        .navigationTitle("Settings")
    }
}
