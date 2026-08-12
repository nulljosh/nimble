import SwiftUI

struct SearchView: View {
    @Environment(AppState.self) private var state
    @FocusState private var isInputFocused: Bool
    @AppStorage("whats_new_seen_version") private var whatsNewSeenVersion = ""

    var body: some View {
        @Bindable var state = state

        NavigationStack {
            VStack(spacing: 0) {
                HStack(spacing: 12) {
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

                    TextField("", text: $state.queryText, prompt: Text(state.currentPlaceholder).foregroundStyle(.tertiary))
                        .textFieldStyle(.plain)
                        .font(.system(size: 22, weight: .light))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .focused($isInputFocused)
                        .onSubmit { state.performQuery() }
                        .submitLabel(.search)

                    if state.result == .loading {
                        Circle()
                            .trim(from: 0, to: 0.75)
                            .stroke(state.theme.color, lineWidth: 2)
                            .frame(width: 18, height: 18)
                            .rotationEffect(.degrees(-90))
                            .animation(.linear(duration: 0.7).repeatForever(autoreverses: false), value: state.result == .loading)
                    }
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 13)

                if state.result != .none {
                    Divider().opacity(0.1)

                    ResultView()
                        .environment(state)
                        .animation(.spring(duration: 0.3), value: state.result == .loading)

                    if sourceText != "" {
                        HStack {
                            Spacer()
                            Text(sourceText)
                                .font(.system(size: 10))
                                .foregroundStyle(.tertiary)
                                .onTapGesture { openSource() }
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 8)
                        .padding(.top, 2)
                    }
                }

                Spacer()

                HStack {
                    ThemePickerView()
                        .environment(state)
                    Spacer()
                    HStack(spacing: 14) {
                        Button(action: { state.copyResultText() }) {
                            Image(systemName: "doc.on.doc")
                                .font(.system(size: 14))
                                .foregroundStyle(.secondary)
                        }
                        .accessibilityLabel("Copy result")
                        NavigationLink {
                            PreferencesView().environment(state)
                        } label: {
                            Image(systemName: "gearshape")
                                .font(.system(size: 14))
                                .foregroundStyle(.secondary)
                        }
                        .accessibilityLabel("Settings")
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .overlay(alignment: .top) { Divider().opacity(0.07) }
            }
            // Mirrors the web app: the theme owns the surface, and `.primary`/`.secondary`
            // follow it via colorScheme instead of every view hardcoding white-on-dark.
            .background(state.theme.backgroundColor.ignoresSafeArea())
            .environment(\.colorScheme, state.theme.colorScheme)
            .onAppear {
                guard whatsNewSeenVersion == whatsNewVersion else { return }
                isInputFocused = true
            }
        }
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
            if let url, let u = URL(string: url) { UIApplication.shared.open(u) }
        default:
            state.openInDDG()
        }
    }
}
