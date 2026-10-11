import SwiftUI

struct SearchView: View {
    @Environment(AppState.self) private var state
    @FocusState private var isInputFocused: Bool

    var body: some View {
        @Bindable var state = state

        VStack(spacing: 0) {
            HStack(spacing: 10) {
                // Close sits top-left, where every other Mac window puts it, it used
                // to be the last item in the bottom-right status row.
                Button(action: { NSApplication.shared.terminate(nil) }) {
                    Text("✕")
                        .font(.system(size: 11))
                        .foregroundStyle(Color.red.opacity(0.7))
                }
                .buttonStyle(.plain)
                .help("Quit Nimble")
                .accessibilityLabel("Quit Nimble")

                searchField
            }
            .padding(.horizontal, 18)
            .padding(.top, 16)
            .padding(.bottom, 14)

            // Inline rather than an alert: the HUD is a borderless window with nothing to hang a sheet on.
            if state.askingAIConsent {
                ConsentCard()
                    .padding(.horizontal, 18)
                    .padding(.bottom, 14)
            }

            if state.result != .none {
                ResultView()
                    .environment(state)
                    .padding(.horizontal, 18)
                    .padding(.bottom, 14)
                    .animation(.spring(duration: 0.3), value: state.result == .loading)
            } else if !state.askingAIConsent, !state.history.entries.isEmpty {
                // Recent searches, only while the HUD has no answer on screen.
                RecentList(title: "RECENT", items: state.history.entries.prefix(5).map(\.q), size: 14, onClear: { state.clearHistory() })
                    .environment(state)
                    .padding(.horizontal, 18)
                    .padding(.bottom, 14)
            } else if !state.askingAIConsent {
                // Empty HUD: the chosen mascot sits where the recent searches would go. Decorative, so VoiceOver skips him.
                Image(state.mascotAsset)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 64, height: 64)
                    .frame(maxWidth: .infinity)
                    .padding(.bottom, 14)
                    .accessibilityHidden(true)
            }

            // Bottom bar
            HStack {
                // Theme lives in Settings only, the swatch here duplicated the grid
                // in SettingsView. (iOS keeps its inline picker: no menu bar there.)
                Spacer()
                Text("Nimble v\(Bundle.main.marketingVersion)")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(Color.dim)
                    .tracking(0.8)
                    .textCase(.uppercase)
                Spacer()
                HStack(spacing: 10) {
                    Button(action: { state.copyResultText() }) {
                        Text("⎘")
                            .font(.system(size: 13))
                            .foregroundStyle(Color.dim)
                    }
                    .buttonStyle(.plain)
                    .help("Copy Result")
                    .accessibilityLabel("Copy Result")
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .overlay(alignment: .top) {
                Rectangle().fill(Color.hairline).frame(height: 1)
            }
        }
        .frame(width: 660)
        .fixedSize(horizontal: false, vertical: true)
        .background(Color.bg)
        // Follows the system appearance; the cream palette adapts with it.
        .preferredColorScheme(state.theme.colorScheme)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.hairline, lineWidth: 1))
        .onAppear {
            // Screenshots: `-shot "5 miles to km"` launches straight onto an answer.
            if let q = UserDefaults.standard.string(forKey: "shot") { state.queryText = q; state.performQuery() }
            isInputFocused = true
        }
        .contextMenu { ContextMenuView().environment(state) }
        .contentShape(Rectangle())
        .gesture(WindowDrag())
    }

    /// The web app's field: rounded, soft fill, hairline that turns into a yellow ring when focused.
    /// Return submits, so the Mac keeps its return-key hint in place of an Ask button.
    private var searchField: some View {
        @Bindable var state = state

        return HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(Color.bulbDeep)
                .accessibilityHidden(true)

            TextField(state.voice.listening ? String(localized: "Listening") : state.currentPlaceholder, text: $state.queryText)
                .textFieldStyle(.plain)
                .font(.system(size: 18))
                .foregroundStyle(Color.text)
                .focused($isInputFocused)
                .onSubmit { state.performQuery() }
                .onKeyPress(.tab) {
                    if state.queryText.isEmpty { state.queryText = state.currentPlaceholder }
                    return .handled
                }

            if state.result != .loading, !state.queryText.isEmpty {
                Text("↩")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(Color.dim)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.hairline.opacity(0.5))
                    .clipShape(RoundedRectangle(cornerRadius: 4))
                    .overlay(RoundedRectangle(cornerRadius: 4).stroke(Color.hairline, lineWidth: 1))
            }

            MicButton().environment(state)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        .background(RoundedRectangle(cornerRadius: 16).fill(Color.bg2))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(isInputFocused ? Color.bulbDeep : Color.hairline, lineWidth: isInputFocused ? 2 : 1)
        )
    }
}

/// The borderless HUD ignored `isMovableByWindowBackground`: SwiftUI's hosting view eats the
/// mouse-down before AppKit can start a window drag. Hand the drag to AppKit's own loop
/// instead, the same one a titlebar uses, so it tracks the cursor exactly.
private struct WindowDrag: Gesture {
    @State private var dragging = false

    var body: some Gesture {
        DragGesture(minimumDistance: 2, coordinateSpace: .global)
            .onChanged { _ in
                guard !dragging, let window = NSApp.keyWindow, let event = NSApp.currentEvent else { return }
                dragging = true
                window.performDrag(with: event)
            }
            .onEnded { _ in dragging = false }
    }
}
