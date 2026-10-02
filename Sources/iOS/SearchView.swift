import SwiftUI

struct SearchView: View {
    @Environment(AppState.self) private var state
    @FocusState private var isInputFocused: Bool
    @AppStorage("whats_new_seen_version") private var whatsNewSeenVersion = ""
    @State private var tries: [String] = []

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

                    TextField("", text: $state.queryText, prompt: Text(state.currentPlaceholder).foregroundStyle(.secondary))
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
                    // ponytail: result sits mid-screen instead of hugging the field over a wall of white
                    Spacer()

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
                } else {
                    // Empty state: a few real questions to tap, instead of a blank wall.
                    VStack(alignment: .leading, spacing: 10) {
                        Text("TRY")
                            .font(.system(size: 11, weight: .bold))
                            .tracking(1.2)
                            .foregroundStyle(state.theme.color)
                        ForEach(tries, id: \.self) { q in
                            Button {
                                state.queryText = q
                                state.performQuery()
                            } label: {
                                Text(q)
                                    .font(.system(size: 17))
                                    .foregroundStyle(.secondary)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 18)
                    .padding(.top, 28)
                    .onAppear {
                        if tries.isEmpty { tries = Array(Set((0..<12).map { _ in state.randomSuggestion() })).prefix(4).map { $0 } }
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
            .onAppear {
                // Screenshots: `-shot "5 miles to km"` launches straight onto an answer.
                if let q = UserDefaults.standard.string(forKey: "shot") { state.queryText = q; state.performQuery() }
                guard whatsNewSeenVersion == whatsNewVersion else { return }
                isInputFocused = true
            }
            // No title on the root screen, so the empty bar was only ever a black
            // strip above the search field.
            .toolbar(.hidden, for: .navigationBar)
            .alert("Send your question to an AI service?", isPresented: $state.askingAIConsent) {
                Button("Allow") { state.answerAIConsent(true) }
                Button("Don't Allow", role: .cancel) { state.answerAIConsent(false) }
            } message: {
                Text("To answer, Nimble sends the text you type, and nothing else, to \(state.aiRecipient). No account, contacts, location or identifiers are sent, and Nimble keeps no record of it. If you don't allow this, answers come from DuckDuckGo and Wikipedia only. You can change this in Settings.")
            }
        }
        // Light/dark follows the system, like the web app; the theme is only the accent.
        // On the NavigationStack rather than its content — inside, the status-bar area
        // stayed unpainted and rendered black.
        .background(Color(uiColor: .systemBackground).ignoresSafeArea())
        .preferredColorScheme(state.theme.colorScheme)
        .tint(state.theme.color)  // caret and toolbar in the theme accent, not system blue
    }

    private var sourceText: String {
        switch state.result {
        case .math, .convert: return "Computed offline"
        case .text(_, _, let source, _, _): return source
        case .list(_, let source): return source
        case .graph: return "Computed offline"
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
