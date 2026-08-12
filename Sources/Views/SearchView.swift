import SwiftUI

struct SearchView: View {
    @Environment(AppState.self) private var state
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @FocusState private var isInputFocused: Bool

    var body: some View {
        @Bindable var state = state

        VStack(spacing: 0) {
            // Search bar
            HStack(spacing: 12) {
                // Accent-colored search icon
                Canvas { ctx, size in
                    let accent = state.theme.color
                    let c = Path(ellipseIn: CGRect(x: 2, y: 2, width: 12, height: 12))
                    ctx.stroke(c, with: .color(accent.opacity(0.9)), lineWidth: 1.5)
                    var line = Path()
                    line.move(to: CGPoint(x: 13, y: 13))
                    line.addLine(to: CGPoint(x: 18, y: 18))
                    ctx.stroke(line, with: .color(accent.opacity(0.9)), style: StrokeStyle(lineWidth: 1.5, lineCap: .round))
                }
                .frame(width: 20, height: 20)

                TextField(state.currentPlaceholder, text: $state.queryText)
                    .textFieldStyle(.plain)
                    .font(.system(size: 22, weight: .light))
                    .foregroundStyle(Color.white.opacity(0.92))
                    .focused($isInputFocused)
                    .onSubmit { state.performQuery() }
                    .onKeyPress(.tab) {
                        if state.queryText.isEmpty { state.queryText = state.currentPlaceholder }
                        return .handled
                    }

                if state.result == .loading {
                    Circle()
                        .trim(from: 0, to: 0.75)
                        .stroke(state.theme.color, lineWidth: 2)
                        .frame(width: 18, height: 18)
                        .rotationEffect(.degrees(-90))
                        .animation(reduceMotion ? nil : .linear(duration: 0.7).repeatForever(autoreverses: false), value: state.result == .loading)
                } else if !state.queryText.isEmpty {
                    Text("↩")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(Color.white.opacity(0.3))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.white.opacity(0.07))
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                        .overlay(RoundedRectangle(cornerRadius: 4).stroke(Color.white.opacity(0.1), lineWidth: 1))
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 13)

            // Results
            if state.result != .none {
                Divider().opacity(0.1).padding(.horizontal, 0)

                ResultView()
                    .environment(state)
                    .animation(.spring(duration: 0.3), value: state.result == .loading)

                if sourceText != "" {
                    HStack {
                        Spacer()
                        Button(action: openSource) {
                            Text(sourceText)
                                .font(.system(size: 10))
                                .foregroundStyle(Color.white.opacity(0.2))
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 8)
                    .padding(.top, 2)
                }
            }

            // Bottom bar
            HStack {
                ThemePickerView()
                    .environment(state)
                Spacer()
                Text("Nimble v1.0")
                    .font(.system(size: 9, weight: .medium))
                    .foregroundStyle(Color.white.opacity(0.2))
                    .tracking(0.8)
                    .textCase(.uppercase)
                Spacer()
                HStack(spacing: 10) {
                    Button(action: { state.copyResultText() }) {
                        Text("⎘")
                            .font(.system(size: 13))
                            .foregroundStyle(Color.white.opacity(0.3))
                    }
                    .buttonStyle(.plain)
                    .help("Copy Result")
                    .accessibilityLabel("Copy Result")
                    Button(action: {}) {
                        Text("⚙")
                            .font(.system(size: 13))
                            .foregroundStyle(Color.white.opacity(0.3))
                    }
                    .buttonStyle(.plain)
                    .help("Preferences")
                    .accessibilityLabel("Preferences")
                    .contextMenu {
                        ContextMenuView().environment(state)
                    }
                    Button(action: { NSApplication.shared.terminate(nil) }) {
                        Text("✕")
                            .font(.system(size: 11))
                            .foregroundStyle(Color.red.opacity(0.7))
                    }
                    .buttonStyle(.plain)
                    .help("Quit Nimble")
                    .accessibilityLabel("Quit Nimble")
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .overlay(alignment: .top) {
                Divider().opacity(0.07)
            }
        }
        .frame(width: 660)
        .fixedSize(horizontal: false, vertical: true)
        .background(
            ZStack {
                VisualEffectView(material: .hudWindow, blendingMode: .behindWindow)
                Color(red: 0.07, green: 0.07, blue: 0.118).opacity(0.78)
            }
        )
        // The macOS popover is always the dark HUD surface regardless of theme, so pin
        // the subtree's scheme — that keeps `.primary`/`.secondary` in the shared
        // ResultView resolving light-on-dark here while iOS follows its theme.
        .environment(\.colorScheme, .dark)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.1), lineWidth: 1))
        .onAppear { isInputFocused = true }
        .contextMenu { ContextMenuView().environment(state) }
    }

    private var sourceText: String {
        switch state.result {
        case .math: return "mathjs"
        case .text(_, _, let source, _, _): return source
        case .list(_, let source): return source
        default: return ""
        }
    }

    private func openSource() {
        switch state.result {
        case .text(_, _, _, let url, _):
            if let url, let u = URL(string: url) { NSWorkspace.shared.open(u) }
        default:
            state.openInDDG()
        }
    }
}
