import SwiftUI

/// One screen: the text field (dictation is one tap away on the watch), the answer under it. Permission for the AI
/// service is asked once, on first launch, with the same words as the iPhone's consent card, never mid-question.
struct WatchAsk: View {
    /// 0 = not asked yet, 1 = allowed, 2 = declined. Math, units and weather never need it.
    @AppStorage("aiConsent") private var consent = 0
    @State private var question = ""
    @State private var answer: String?
    @State private var loading = false
    @State private var holding: String?
    private let engine = QueryEngine()

    private let recipient = "Nimble's answer service (open models from OpenAI, Alibaba and Google, run on Groq and Cloudflare)"
    private let ink = Color(red: 0.54, green: 0.39, blue: 0.07)

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                if consent == 0 {
                    consentCard(for: holding)
                } else {
                    TextField("Ask Nimble", text: $question)
                        .submitLabel(.search)
                        .onSubmit { ask(question) }
                    if loading { ProgressView().frame(maxWidth: .infinity) }
                    if let answer {
                        Text(answer)
                            .font(.body)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .accessibilityLabel("Answer: \(answer)")
                    }
                }
            }
            .padding(.horizontal, 4)
        }
        .navigationTitle("Nimble")
        // QA hook, like the other apps: `-shot "question"` asks it on launch so a screenshot can show an answer.
        .onAppear {
            let args = ProcessInfo.processInfo.arguments
            if let i = args.firstIndex(of: "-shot"), i + 1 < args.count {
                question = args[i + 1]
                ask(question)
            }
        }
    }

    private func consentCard(for held: String?) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Use AI to answer?").font(.headline)
            Text("Nimble sends your question text, and nothing else, to \(recipient). No account or personal data, and no record is kept.")
                .font(.footnote)
            Button("Allow") { consent = 1; holding = nil; if let held { ask(held) } }
                .tint(ink)
            Button("Don't Allow") { consent = 2; holding = nil; if let held { ask(held) } }
        }
    }

    private func ask(_ raw: String) {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        answer = nil
        // Same order as AppState.performQuery on iPhone and Mac: units, then math, both offline and instant.
        if let converted = engine.convert(text) {
            answer = converted.copyText
            return
        }
        if engine.classifyQuery(text) == .math, let value = engine.evaluateMath(text) {
            answer = value
            return
        }
        // Weather, currency and local time are plain lookups with no AI, so they never need permission.
        let card = engine.isCardQuery(text)
        // Only a question that would reach the AI needs permission.
        if !card, consent == 0, engine.siteHost(text) == nil {
            holding = text
            return
        }
        loading = true
        Task {
            var result = card ? await engine.card(text) : nil
            if result == nil { result = await engine.query(text, useLLM: consent == 1) }
            answer = result?.copyText ?? String(localized: "No answer")
            loading = false
        }
    }
}
