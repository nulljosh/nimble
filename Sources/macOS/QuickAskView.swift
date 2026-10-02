import SwiftUI

/// The menu bar window: ask without opening the HUD. Same AppState as the HUD,
/// so an answer here is the answer there too.
struct QuickAskView: View {
    @Environment(AppState.self) private var state
    @FocusState private var focused: Bool
    var openMain: () -> Void = {}
    /// ImageRenderer cannot draw AppKit-backed fields, so snapshots get a Text in the same slot.
    var fieldStandIn = false

    var body: some View {
        @Bindable var state = state

        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.secondary)
                if fieldStandIn {
                    Text(state.queryText).font(.system(size: 15))
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    TextField(state.currentPlaceholder, text: $state.queryText)
                        .textFieldStyle(.plain)
                        .font(.system(size: 15))
                        .focused($focused)
                        .onSubmit { state.performQuery() }
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 11)

            if state.result != .none {
                Divider().opacity(0.4)
                ResultView()
                    .environment(state)
            }

            Divider().opacity(0.4)
            HStack(spacing: 14) {
                Button("Open Nimble", action: openMain)
                SettingsLink { Text("Settings…") }
                Spacer()
                Button("Quit") { NSApp.terminate(nil) }
                    .keyboardShortcut("q")
            }
            .buttonStyle(.plain)
            .font(.system(size: 12))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
        }
        .frame(width: 360)
        .fixedSize(horizontal: false, vertical: true)
        // Follows the system appearance, same as the HUD.
        .preferredColorScheme(state.theme.colorScheme)
        .onAppear { focused = true }
    }
}
