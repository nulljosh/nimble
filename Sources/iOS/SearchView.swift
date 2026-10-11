import SwiftUI

struct SearchView: View {
    @Environment(AppState.self) private var state
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @FocusState private var isInputFocused: Bool
    @AppStorage("whats_new_seen_version") private var whatsNewSeenVersion = ""
    @State private var tries: [String] = []

    var body: some View {
        @Bindable var state = state

        NavigationStack {
            VStack(spacing: 0) {
                ScrollView {
                    VStack(spacing: 0) {
                        Text("Ask anything.")
                            .nimbleFont(28, weight: .bold)
                            .tracking(-0.56)
                            .foregroundStyle(Color.text)
                            .frame(maxWidth: .infinity)
                            .accessibilityAddTraits(.isHeader)
                            .padding(.top, 28)
                            .padding(.bottom, 24)

                        searchField

                        Group {
                            if state.askingAIConsent {
                                ConsentCard()
                            } else if state.result != .none {
                                ResultView()
                            } else {
                                recent
                            }
                        }
                        .padding(.top, 24)
                        .animation(.spring(duration: 0.3), value: state.result == .loading)

                        Text("Math, units and graphs work offline. Everything else gets one sentence and a source.")
                            .nimbleFont(12)
                            .foregroundStyle(Color.dim)
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: .infinity)
                            .padding(.top, 28)
                    }
                    .padding(.horizontal, 18)
                    .padding(.bottom, 24)
                }
                .scrollDismissesKeyboard(.interactively)

                HStack {
                    ThemePickerView()
                        .environment(state)
                    Spacer()
                    HStack(spacing: 14) {
                        ShareAnswerButton()
                            .environment(state)
                        Button(action: { state.copyResultText() }) {
                            Image(systemName: "doc.on.doc")
                                .nimbleFont(14)
                                .foregroundStyle(Color.dim)
                        }
                        .accessibilityLabel("Copy result")
                        NavigationLink {
                            PreferencesView().environment(state)
                        } label: {
                            Image(systemName: "gearshape")
                                .nimbleFont(14)
                                .foregroundStyle(Color.dim)
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
            // The consent card's Allow button sat behind the keyboard; drop it while the card shows.
            .onChange(of: state.askingAIConsent) { _, asking in if asking { isInputFocused = false } }
            // No title on the root screen, so the empty bar was only ever a black
            // strip above the search field.
            .toolbar(.hidden, for: .navigationBar)
            // Light/dark follows the system, like the web app; the theme is only the accent.
            // Painted here, on the content: the NavigationStack's own system background
            // sits above a background set on the stack and turned the cream white.
            .background(Color.bg.ignoresSafeArea())
        }
        .preferredColorScheme(state.theme.colorScheme)
        // nimble://ask from the widget: land with the caret in the field.
        .onOpenURL { url in
            guard url.scheme == "nimble" else { return }
            Task { try? await Task.sleep(for: .milliseconds(300)); isInputFocused = true }
        }
        .tint(state.theme.color)  // caret and toolbar in the theme accent, not system blue
    }

    /// The web app's field: rounded, soft fill, hairline that turns into a yellow ring when focused, Ask at the end.
    private var searchField: some View {
        @Bindable var state = state
        let placeholder = state.voice.listening ? String(localized: "Listening") : state.currentPlaceholder

        // At accessibility sizes glyph, field, mic and Ask no longer fit one row: the field takes the top, the buttons sit below it.
        let stacked = dynamicTypeSize.isAccessibilitySize
        let layout = stacked ? AnyLayout(VStackLayout(alignment: .leading, spacing: 10)) : AnyLayout(HStackLayout(spacing: 10))

        return layout {
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .nimbleFont(18, weight: .medium)
                    .foregroundStyle(Color.bulbDeep)
                    .accessibilityHidden(true)

                TextField("", text: $state.queryText, prompt: Text(placeholder).foregroundStyle(Color.dim))
                    .textFieldStyle(.plain)
                    .nimbleFont(18)
                    .foregroundStyle(Color.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .focused($isInputFocused)
                    .onSubmit { state.performQuery() }
                    .submitLabel(.search)
            }

            HStack(spacing: 10) {
                if state.result == .loading {
                    Circle()
                        .trim(from: 0, to: 0.75)
                        .stroke(state.theme.color, lineWidth: 2)
                        .frame(width: 18, height: 18)
                        .rotationEffect(.degrees(-90))
                        .animation(.linear(duration: 0.7).repeatForever(autoreverses: false), value: state.result == .loading)
                        .accessibilityHidden(true)
                }

                MicButton().environment(state)

                Button("Ask") { state.performQuery() }
                    .nimbleFont(14, weight: .bold)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .foregroundStyle(.black)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 9)
                    .background(Color.bulb, in: RoundedRectangle(cornerRadius: 10))
                    .minimumTapTarget()
                    .buttonStyle(.plain)
                    .accessibilityLabel("Ask")
            }
            .frame(maxWidth: stacked ? .infinity : nil, alignment: .trailing)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: 16).fill(Color.bg2))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(isInputFocused ? Color.bulbDeep : Color.hairline, lineWidth: isInputFocused ? 2 : 1)
        )
    }

    /// Starter questions until there is history, then the last eight searches.
    @ViewBuilder
    private var recent: some View {
        if state.history.entries.isEmpty {
            RecentList(title: "TRY", items: tries)
                .onAppear {
                    if tries.isEmpty { tries = Array(Set((0..<12).map { _ in state.randomSuggestion() })).prefix(4).map { $0 } }
                }
        } else {
            RecentList(title: "RECENT", items: state.history.entries.prefix(8).map(\.q), onClear: { state.clearHistory() }, isHistory: true)
        }
    }
}
