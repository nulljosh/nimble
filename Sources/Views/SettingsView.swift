import SwiftUI

struct SettingsView: View {
    @Environment(AppState.self) private var state

    var body: some View {
        @Bindable var state = state

        VStack(alignment: .leading, spacing: 16) {
            // Theme picker
            VStack(alignment: .leading, spacing: 8) {
                Text("THEME")
                    .font(.system(size: 10, weight: .semibold))
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
                                                .font(.system(size: 10, weight: .bold))
                                                .foregroundStyle(theme == .yellow ? .black : .white)
                                        }
                                    }
                                Text(theme.displayName)
                                    .font(.system(size: 9))
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
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .tracking(1)

                Toggle("Offline Math (mathjs)", isOn: $state.mathEnabled)
                    .onChange(of: state.mathEnabled) { state.savePreferences() }

                Toggle("Launch on Startup", isOn: $state.launchOnStartup)
                    .onChange(of: state.launchOnStartup) { state.savePreferences() }

                Toggle("Default Suggestions", isOn: $state.defaultSuggestions)
                    .onChange(of: state.defaultSuggestions) { state.savePreferences() }            }
            .font(.system(size: 12))
            .toggleStyle(.switch)
            .controlSize(.small)

            Divider()

            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("Version")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text(Bundle.main.marketingVersion)
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                }            }

            Divider()

            Button("Quit Nimble") {
                NSApplication.shared.terminate(nil)
            }
            .font(.system(size: 12))
            .foregroundStyle(.red)
            .buttonStyle(.plain)
        }
        .padding(16)
        .frame(width: 280)
    }
}
