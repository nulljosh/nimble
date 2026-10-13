import SwiftUI

struct SettingsView: View {
    @Environment(AppState.self) private var state

    var body: some View {
        @Bindable var state = state

        VStack(alignment: .leading, spacing: 16) {
            // Theme picker
            VStack(alignment: .leading, spacing: 8) {
                Text("THEME")
                    .font(.nimbleMicro)
                    .foregroundStyle(.secondary)
                    .tracking(1)

                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
                    ForEach(NimbleTheme.allCases, id: \.self) { theme in
                        Button(action: {
                            state.theme = theme
                            state.savePreferences()
                        }) {
                            VStack(spacing: 4) {
                                Circle()
                                    .fill(theme.color)
                                    .frame(width: 24, height: 24)
                                    .overlay {
                                        if state.theme == theme {
                                            Image(systemName: "checkmark")
                                                .font(.nimbleMicro)
                                                .foregroundStyle(theme == .yellow ? .black : .white)
                                                .accessibilityHidden(true)
                                        }
                                    }
                                Text(theme.displayName)
                                    .font(.nimbleMicro)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            Divider()

            // Preferences
            VStack(alignment: .leading, spacing: 6) {
                Text("PREFERENCES")
                    .font(.nimbleMicro)
                    .foregroundStyle(.secondary)
                    .tracking(1)

                HStack(spacing: 8) {
                    Text(String(localized: "Mascot"))
                    Spacer()
                    Picker(String(localized: "Mascot"), selection: $state.mascot) {
                        Text(verbatim: "Flit").tag("flit")
                        Text(verbatim: "Fen").tag("fen")
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    .frame(width: 120)
                    .onChange(of: state.mascot) { state.savePreferences() }
                    Image(state.mascotAsset)
                        .resizable()
                        .scaledToFit()
                        .frame(width: 28, height: 28)
                        .accessibilityHidden(true)
                }

                Toggle("Offline math", isOn: $state.mathEnabled)
                    .onChange(of: state.mathEnabled) { state.savePreferences() }

                Toggle("Private mode", isOn: $state.privateMode)
                    .onChange(of: state.privateMode) { state.savePreferences() }

                Toggle("Launch on Startup", isOn: $state.launchOnStartup)
                    .onChange(of: state.launchOnStartup) { state.savePreferences() }

                Toggle("Default Suggestions", isOn: $state.defaultSuggestions)
                    .onChange(of: state.defaultSuggestions) { state.savePreferences() }

                Toggle("AI Answers", isOn: Binding(
                    get: { state.aiConsent == true },
                    set: { state.aiConsent = $0; state.savePreferences() }
                ))
                Text("When on, the text you type is sent to \(state.aiRecipient). Nothing else is sent. When off, answers come from DuckDuckGo and Wikipedia only.")
                    .font(.nimbleMicro)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .font(.nimbleSmall)
            .toggleStyle(.switch)
            .controlSize(.small)

            Divider()

            VStack(alignment: .leading, spacing: 6) {
                Text("AI ENGINE")
                    .font(.nimbleMicro)
                    .foregroundStyle(.secondary)
                    .tracking(1)
                AIEngineSettings(state: state)
                    .textFieldStyle(.roundedBorder)
                    .labelsHidden()
            }
            .font(.nimbleSmall)
            .controlSize(.small)
            .onDisappear { state.savePreferences() }

            Divider()

            VStack(alignment: .leading, spacing: 6) {
                Text("OFFLINE ANSWERS")
                    .font(.nimbleMicro)
                    .foregroundStyle(.secondary)
                    .tracking(1)
                OfflineAnswersRow(store: state.offlinePack, compact: true)
            }

            Divider()

            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("Version")
                        .font(.nimbleSmall)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text(Bundle.main.marketingVersion)
                        .font(.nimbleSmall)
                        .foregroundStyle(.secondary)
                }            }

            Divider()

            Button("Quit Nimble") {
                NSApplication.shared.terminate(nil)
            }
            .font(.nimbleSmall)
            .foregroundStyle(.red)
            .buttonStyle(.plain)
        }
        .padding(16)
        .frame(width: 280)
    }
}
