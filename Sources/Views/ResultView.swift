import SwiftUI

struct ResultView: View {
    @Environment(AppState.self) private var state
    @Environment(\.openURL) private var openURL

    var body: some View {
        switch state.result {
        case .none:
            EmptyView()

        case .loading:
            // The card appears at once with the chosen mascot in it; the answer replaces him in place.
            AnswerCard(shareText: nil) {
                FlitThinking()
            } footer: {
                EmptyView()
            }

        case .math(let value, let steps):
            AnswerCard(shareText: state.result.copyText) {
                MathResultView(value: value, steps: steps)
            } footer: {
                Text("computed offline")
            }

        case .text(let heading, let answer, let source, let sourceURL, let imageURL, let grounding, let sources, let photo, let background):
            TextAnswerView(heading: heading, answer: answer, source: source, sourceURL: sourceURL,
                           imageURL: imageURL, grounding: grounding, sources: sources, photo: photo, shareText: state.result.copyText,
                           aiError: state.aiError, background: background, asOf: state.textAsOf)

        case .list(let items, let source):
            AnswerCard(shareText: state.result.copyText) {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                        Text(item)
                            .font(.nimbleBody)
                            .lineSpacing(5.95)
                            .foregroundStyle(Color.text)
                            .textSelection(.enabled)
                    }
                }
            } footer: {
                link(String(localized: "powered by \(source)"), to: state.searchURL)
            }

        case .color(let hex):
            ColorResultView(hex: hex)
                .transition(.opacity.combined(with: .scale(scale: 0.9)))

        case .convert(let from, let to, let fromUnit, let toUnit):
            AnswerCard(shareText: state.result.copyText) {
                ConvertResultView(from: from, to: to, fromUnit: fromUnit, toUnit: toUnit)
            } footer: {
                Text("computed offline")
            }

        case .card(let big, let unit, let sub, let source, let url, let asOf):
            AnswerCard(shareText: state.result.copyText, freshness: asOf?.label()) {
                CardResultView(big: big, unit: unit, sub: sub)
            } footer: {
                link(String(localized: "powered by \(source)"), to: url ?? state.searchURL)
            }

        case .market(let title, let big, let change, let source, let url, let asOf):
            AnswerCard(shareText: state.result.copyText, freshness: big == nil ? nil : asOf?.label()) {
                MarketResultView(title: title, big: big, change: change)
            } footer: {
                link(String(localized: "powered by \(source)"), to: url)
            }

        case .sports(let card):
            AnswerCard(shareText: state.result.copyText, freshness: card.asOf?.label()) {
                SportsResultView(card: card)
            } footer: {
                if card.outcome == .found {
                    link(String(localized: "powered by \(SportsCard.source)"), to: card.url)
                }
            }

        case .disagree(let alts, let sources, let asOf):
            // The web's card: the title, both answers with their model quiet under each, and no photo or pick.
            AnswerCard(shareText: state.result.copyText, freshness: asOf?.label(), eyebrow: String(localized: "Sources disagree")) {
                VStack(alignment: .leading, spacing: 16) {
                    ForEach(Array(alts.enumerated()), id: \.offset) { _, alt in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(alt.answer)
                                .font(.nimble(22, .regular, relativeTo: .title2))
                                .foregroundStyle(Color.text)
                                .lineSpacing(4)
                                .fixedSize(horizontal: false, vertical: true)
                                .textSelection(.enabled)
                            Text(alt.model)
                                .font(.nimbleCaption)
                                .foregroundStyle(Color.soft)
                        }
                        .accessibilityElement(children: .combine)
                    }
                    if !sources.isEmpty {
                        HStack(spacing: 8) {
                            ForEach(Array(sources.enumerated()), id: \.offset) { index, item in
                                if index > 0 { Text("\u{00B7}").foregroundStyle(Color.soft) }
                                if let u = URL(string: item.url) {
                                    Button { openURL(u) } label: {
                                        Text(item.name)
                                            .font(.nimbleCaptionMedium)
                                            .foregroundStyle(Color.bulbDeep)
                                            .underline()
                                    }
                                    .buttonStyle(.plain)
                                    .minimumTapTarget()
                                }
                            }
                        }
                    }
                }
            } footer: {
                EmptyView()
            }

        case .news(let items, let source, let asOf):
            AnswerCard(shareText: state.result.copyText, freshness: asOf?.label()) {
                VStack(alignment: .leading, spacing: 16) {
                    ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                        HStack(alignment: .top, spacing: 12) {
                            // A story with a picture gets a 56px square beside its sentence; without one the row is plain.
                            if let image = item.image, let url = URL(string: image.url) {
                                AsyncImage(url: url) { phase in
                                    if case .success(let picture) = phase {
                                        picture.resizable().aspectRatio(contentMode: .fill)
                                            .frame(width: 56, height: 56)
                                            .clipShape(RoundedRectangle(cornerRadius: 12))
                                    } else {
                                        RoundedRectangle(cornerRadius: 12).fill(Color.bg2).frame(width: 56, height: 56)
                                    }
                                }
                                .accessibilityLabel(item.title)
                            }
                            VStack(alignment: .leading, spacing: 3) {
                                link(item.sentence, to: item.url)
                                    .font(.nimbleBody)
                                    .foregroundStyle(Color.text)
                                    .multilineTextAlignment(.leading)
                                Text(item.outlet)
                                    .font(.nimbleCaption)
                                    .foregroundStyle(Color.dim)
                            }
                        }
                    }
                }
            } footer: {
                link(String(localized: "powered by \(source)"), to: state.searchURL)
            }

        case .graph(let expr, let points):
            AnswerCard(shareText: state.result.copyText) {
                GraphResultView(expr: expr, points: points)
            } footer: {
                Text("computed offline")
            }

        case .error(let message, let searchURL):
            VStack(spacing: 10) {
                Text(message)
                    .font(.nimbleCallout)
                    .foregroundStyle(Color.dim)
                if let searchURL, URL(string: searchURL) != nil {
                    Button("Search on DuckDuckGo →") { state.openInDDG() }
                        .font(.nimbleCalloutMedium)
                        .foregroundStyle(Color.bulbDeep)
                        .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 18)
            .frame(maxWidth: .infinity)
            .transition(.opacity)
        }
    }

    /// The source line opens its page; without a URL it does nothing.
    @ViewBuilder
    private func link(_ label: String, to url: String) -> some View {
        if let u = URL(string: url) {
            Button { openURL(u) } label: { Text(label) }
                .buttonStyle(.plain)
                .minimumTapTarget()
                .accessibilityLabel(label)
        } else {
            Text(label)
        }
    }
}

/// A sourced text answer. The source line is the toggle for "Why this answer": the text the sentence
/// was cut from, with a link to the page. With nothing more to show, the source line just opens the page.
struct TextAnswerView: View {
    @Environment(AppState.self) private var state
    @Environment(\.openURL) private var openURL
    let heading: String?
    let answer: String
    let source: String
    let sourceURL: String?
    let imageURL: String?
    let grounding: String?
    /// Up to three linked sources; shown as a row under the sentence when there are two or more.
    let sources: [AnswerSource]
    /// The picture above the card; nil keeps the plain layout.
    let photo: AnswerPhoto?
    let shareText: String?
    /// The worker's reason the free AI gave no answer; shows the resting note under a Wikipedia fallback.
    var aiError: String? = nil
    /// The generic topic page for a specific question: the header says BACKGROUND and a caption leads the summary.
    var background: Bool = false
    /// When a live text answer was fetched, for a time-sensitive question: the quiet "as of" line. Nil for offline pack and timeless answers.
    var asOf: Freshness? = nil
    // Screenshots: `-shotWhy YES` opens the "Why this answer" block on launch.
    @State private var showWhy = UserDefaults.standard.bool(forKey: "shotWhy")

    /// The grounding text, only when it says more than the sentence did.
    private var whyText: String? {
        guard let g = grounding?.trimmingCharacters(in: .whitespacesAndNewlines), !g.isEmpty,
              g != answer.trimmingCharacters(in: .whitespacesAndNewlines) else { return nil }
        return g
    }

    private var pageURL: String { sourceURL ?? state.searchURL }

    /// The "Why this answer" link: "<Title> · Wikipedia" when it opens a Wikipedia article, else the source name.
    private var whyLabel: String {
        guard let u = URL(string: pageURL), u.host == "en.wikipedia.org", u.path.hasPrefix("/wiki/"),
              let title = u.lastPathComponent.removingPercentEncoding?.replacingOccurrences(of: "_", with: " "),
              !title.isEmpty else { return source }
        return "\(title) \u{00B7} Wikipedia"
    }

    var body: some View {
        AnswerCard(shareText: shareText, freshness: asOf?.label(), eyebrow: QueryResult.eyebrow(background: background),
                   lead: QueryResult.leadLines(background: background, aiError: aiError, source: source)) {
            VStack(alignment: .leading, spacing: 16) {
                if let photo, let url = URL(string: photo.url) {
                    // 16:9 box reserved up front, the cream placeholder until the picture loads, so nothing jumps.
                    // Fill and anchor to the top: the picture covers the box and crops from the bottom, so heads stay in frame.
                    Color.clear
                        .aspectRatio(16.0 / 9.0, contentMode: .fit)
                        .frame(maxWidth: .infinity)
                        .overlay {
                            GeometryReader { geo in
                                AsyncImage(url: url) { phase in
                                    if case .success(let image) = phase {
                                        image.resizable().aspectRatio(contentMode: .fill)
                                            .frame(width: geo.size.width, height: geo.size.height, alignment: .top)
                                    } else {
                                        Color.bg2
                                    }
                                }
                                .frame(width: geo.size.width, height: geo.size.height)
                                .clipped()
                            }
                        }
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .accessibilityLabel(heading ?? source)
                    if let title = photo.title {
                        Text("\(title) \u{00B7} Wikipedia")
                            .font(.nimbleCaption)
                            .foregroundStyle(Color.soft)
                    }
                }
                HStack(alignment: .top, spacing: 16) {
                    if let imageURL, let url = URL(string: imageURL) {
                        AsyncImage(url: url) { phase in
                            if case .success(let image) = phase {
                                image.resizable().aspectRatio(contentMode: .fill)
                                    .frame(width: 56, height: 56)
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                            }
                        }
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        if let heading, !heading.isEmpty {
                            Text(heading)
                                .font(.nimbleSubheadBold)
                                .tracking(-0.3)
                                .foregroundStyle(Color.soft)
                        }
                        Text(answer)
                            .font(.nimbleLead)
                            .foregroundStyle(Color.text)
                            .lineSpacing(6.65)
                            .textSelection(.enabled)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                if sources.count > 1 {
                    HStack(spacing: 8) {
                        ForEach(Array(sources.enumerated()), id: \.offset) { index, item in
                            if index > 0 { Text("\u{00B7}").foregroundStyle(Color.soft) }
                            if let u = URL(string: item.url) {
                                Button { openURL(u) } label: {
                                    Text(item.name)
                                        .font(.nimbleCaptionMedium)
                                        .foregroundStyle(Color.bulbDeep)
                                        .underline()
                                }
                                .buttonStyle(.plain)
                                .minimumTapTarget()
                            }
                        }
                    }
                }
                if showWhy, let whyText {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(whyText)
                            .font(.nimbleSubhead)
                            .foregroundStyle(Color.soft)
                            .lineSpacing(5.25)
                            .textSelection(.enabled)
                            .fixedSize(horizontal: false, vertical: true)
                        if let u = URL(string: pageURL) {
                            Button { openURL(u) } label: {
                                Text(whyLabel)
                                    .font(.nimbleCaptionMedium)
                                    .foregroundStyle(Color.bulbDeep)
                                    .underline()
                            }
                            .buttonStyle(.plain)
                            .minimumTapTarget()
                        }
                    }
                    .transition(.opacity)
                }
            }
        } footer: {
            if whyText != nil {
                Button {
                    withAnimation(.easeOut(duration: 0.2)) { showWhy.toggle() }
                } label: {
                    HStack(spacing: 8) {
                        Text("powered by \(source)")
                        Image(systemName: showWhy ? "chevron.up" : "chevron.down")
                            .font(.nimbleMicro)
                    }
                }
                .buttonStyle(.plain)
                .minimumTapTarget()
                .accessibilityLabel(String(localized: "powered by \(source)"))
            } else if let u = URL(string: pageURL) {
                Button { openURL(u) } label: { Text("powered by \(source)") }
                    .buttonStyle(.plain)
                    .minimumTapTarget()
                    .accessibilityLabel(String(localized: "powered by \(source)"))
            } else {
                Text("powered by \(source)")
            }
        }
    }
}

// MARK: - Shared cards (web app: .card, .field, the eyebrow and the Ask button)

/// The answer card: hairline border, 24pt padding, an eyebrow, the answer, then one row with the source and Share.
struct AnswerCard<Content: View, Footer: View>: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    /// Source label and the Copy, Listen and Share links: one row, stacked at accessibility sizes so no word breaks mid-letter.
    private var footerRow: AnyLayout {
        dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 12))
    }
    let shareText: String?
    @State private var copied = false
    /// The quiet "as of" line under the answer, at the same left edge as the source row. Nil when there is none.
    let freshness: String?
    /// The header word: "Answer" by default, "Background" for the generic topic page.
    var eyebrow: String = "Answer"
    /// Quiet dim lines directly under the header, before the content (the resting note, the background caption).
    var lead: [String] = []
    let content: Content
    let footer: Footer

    init(shareText: String?, freshness: String? = nil, eyebrow: String = "Answer", lead: [String] = [],
         @ViewBuilder content: () -> Content, @ViewBuilder footer: () -> Footer) {
        self.shareText = shareText
        self.freshness = freshness
        self.eyebrow = eyebrow
        self.lead = lead
        self.content = content()
        self.footer = footer()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // One VoiceOver stop for the eyebrow and the answer. The footer row stays apart so Share and the source link remain buttons.
            VStack(alignment: .leading, spacing: 16) {
                Eyebrow(text: LocalizedStringKey(eyebrow))
                if !lead.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(Array(lead.enumerated()), id: \.offset) { _, line in
                            // Soft, not dim: the 60% ink is 4.3:1 on the light card; soft is 6.3:1 light and 8.2:1 dark.
                            HStack(spacing: 12) {
                                // Nim dozes beside the resting note: the free AI is out for the day.
                                if line == QueryEngine.restingNote {
                                    Image("NimDoze").resizable().frame(width: 32, height: 32).accessibilityHidden(true)
                                }
                                Text(line)
                                    .font(.nimbleCaption)
                                    .foregroundStyle(Color.soft)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                }
                content
                if let freshness {
                    Text(String(localized: "as of \(freshness)"))
                        .font(.nimbleCaption)
                        .foregroundStyle(Color.dim)
                }
            }
            .accessibilityElement(children: .combine)
            footerRow {
                footer
                    .font(.nimbleSmall)
                    .foregroundStyle(Color.dim)
                if !dynamicTypeSize.isAccessibilitySize { Spacer(minLength: 8) }
                if let shareText, !shareText.isEmpty {
                    Button {
                        #if os(iOS)
                        UIPasteboard.general.string = shareText
                        #else
                        NSPasteboard.general.clearContents()
                        NSPasteboard.general.setString(shareText, forType: .string)
                        #endif
                        copied = true
                        Task { try? await Task.sleep(for: .seconds(1)); copied = false }
                    } label: {
                        Text(copied ? String(localized: "Copied") : String(localized: "Copy"))
                            .font(.nimbleSmall)
                            .foregroundStyle(Color.dim)
                            .underline()
                    }
                    .buttonStyle(.plain)
                    .minimumTapTarget()
                    .accessibilityLabel("Copy")
                    let listening = Speaker.shared.speaking == shareText
                    Button { Speaker.shared.toggle(shareText) } label: {
                        Text(listening ? String(localized: "Stop") : String(localized: "Listen"))
                            .font(.nimbleSmall)
                            .foregroundStyle(Color.dim)
                            .underline()
                    }
                    .buttonStyle(.plain)
                    .minimumTapTarget()
                    .accessibilityLabel(listening ? "Stop reading" : "Read the answer aloud")
                    ShareLink(item: shareText) {
                        Text("Share")
                            .font(.nimbleSmall)
                            .foregroundStyle(Color.dim)
                            .underline()
                    }
                    .buttonStyle(.plain)  // the Mac drew a grey bezel the other two links don't have
                    .minimumTapTarget()
                    .accessibilityLabel("Share")
                }
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.hairline, lineWidth: 1))
        .transition(.opacity.combined(with: .move(edge: .top)))
        // A new answer or a new question takes this card away; its reading stops with it.
        .onDisappear { if let shareText, Speaker.shared.speaking == shareText { Speaker.shared.stop() } }
    }
}

/// Small caps label in the accent: "ANSWER", "BEFORE I ANSWER", "RECENT".
struct Eyebrow: View {
    let text: LocalizedStringKey

    var body: some View {
        Text(text)
            .font(.nimbleEyebrow)
            .tracking(1.3)
            .textCase(.uppercase)
            .foregroundStyle(Color.bulbDeep)
            .accessibilityAddTraits(.isHeader)
    }
}

/// Asked before the first AI answer. Same card as an answer, with Allow and Don't Allow.
struct ConsentCard: View {
    @Environment(AppState.self) private var state
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        // Side by side normally; stacked at accessibility sizes so the two buttons never squeeze.
        let buttons = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 10))
            : AnyLayout(HStackLayout(spacing: 10))

        return VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 16) {
                Eyebrow(text: "Before I answer")
                Text("Use AI to answer?")
                    .font(.nimbleSubheadBold)
                    .foregroundStyle(Color.soft)
                Text("Nimble sends your question text, and nothing else, to \(state.aiRecipient). No account or personal data, and no record is kept. Change this any time in settings.")
                    .font(.nimbleBody)
                    .foregroundStyle(Color.text)
                    .lineSpacing(5.95)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityElement(children: .combine)
            buttons {
                Button("Allow") { state.answerAIConsent(true) }
                    .font(.nimbleSubheadBold)
                    .foregroundStyle(.black)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 10)
                    .background(Color.bulb, in: RoundedRectangle(cornerRadius: 10))
                    .buttonStyle(.plain)
                Button("Don't Allow") { state.answerAIConsent(false) }
                    .font(.nimbleSubheadMedium)
                    .foregroundStyle(Color.text)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 10)
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.hairline, lineWidth: 1))
                    .buttonStyle(.plain)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.hairline, lineWidth: 1))
    }
}

/// Past questions (or the starter questions when there are none). Hairline between rows.
struct RecentList: View {
    @Environment(AppState.self) private var state
    let title: LocalizedStringKey
    let items: [String]
    var size: CGFloat = 16
    var onClear: (() -> Void)?
    /// Past searches get the "Asks this again" hint. The starter questions do not.
    var isHistory = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Eyebrow(text: title)
                Spacer()
                if let onClear {
                    Button("Clear", action: onClear)
                        .font(.nimbleSmall)
                        .foregroundStyle(Color.dim)
                        .buttonStyle(.plain)
                }
            }
            .padding(.bottom, 8)
            ForEach(Array(items.enumerated()), id: \.offset) { index, q in
                if index > 0 {
                    Rectangle().fill(Color.hairline).frame(height: 1).accessibilityHidden(true)
                }
                Button {
                    state.queryText = q
                    state.performQuery()
                } label: {
                    Text(q)
                        .font(.nimble(size, .regular, relativeTo: .body))
                        .foregroundStyle(Color.text)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, size * 0.6)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHint(isHistory ? String(localized: "Asks this again") : "")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Graph

private struct GraphResultView: View {
    let expr: String
    let points: [CGPoint]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Canvas { ctx, size in
                let xs = points.map(\.x), ys = points.map(\.y)
                guard let x0 = xs.min(), let x1 = xs.max(), let y0 = ys.min(), let y1 = ys.max(), x1 > x0 else { return }
                let ySpan = max(y1 - y0, 1e-9)
                func pt(_ p: CGPoint) -> CGPoint {
                    CGPoint(x: (p.x - x0) / (x1 - x0) * size.width,
                            y: size.height - (p.y - y0) / ySpan * size.height)
                }
                var axes = Path()
                if y0 <= 0, y1 >= 0 { let y = pt(CGPoint(x: x0, y: 0)).y; axes.move(to: CGPoint(x: 0, y: y)); axes.addLine(to: CGPoint(x: size.width, y: y)) }
                if x0 <= 0, x1 >= 0 { let x = pt(CGPoint(x: 0, y: y0)).x; axes.move(to: CGPoint(x: x, y: 0)); axes.addLine(to: CGPoint(x: x, y: size.height)) }
                ctx.stroke(axes, with: .color(Color.dim), lineWidth: 1)
                var curve = Path()
                // Break the line where sampled neighbours are far apart (asymptotes).
                var pen = false
                for (i, p) in points.enumerated() {
                    let jump = i > 0 && abs(p.x - points[i - 1].x) > (x1 - x0) / 50
                    if !pen || jump { curve.move(to: pt(p)); pen = true } else { curve.addLine(to: pt(p)) }
                }
                ctx.stroke(curve, with: .color(Color.bulbDeep), style: StrokeStyle(lineWidth: 2, lineJoin: .round))
            }
            .frame(height: 160)
            .accessibilityHidden(true)
            Text("y = \(expr)")
                .font(.nimbleCalloutMedium)
                .foregroundStyle(Color.soft)
                .textSelection(.enabled)
        }
    }
}

// MARK: - Math, convert, card

private struct MathResultView: View {
    let value: String
    let steps: [String]
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var showSteps = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(value)
                .font(.nimbleDisplay)
                .monospacedDigit()
                .tracking(-0.68)
                .foregroundStyle(Color.text)
                .textSelection(.enabled)
                .scaleEffect(appeared ? 1.0 : 0.88)
                .opacity(appeared ? 1.0 : 0)
                .onAppear {
                    if reduceMotion { appeared = true } else { withAnimation(.spring(duration: 0.35, bounce: 0.4)) { appeared = true } }
                }
            if !steps.isEmpty {
                DisclosureGroup("Show steps", isExpanded: $showSteps) {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(Array(steps.enumerated()), id: \.offset) { _, step in
                            Text(step.replacingOccurrences(of: "*", with: "×"))
                                .font(.nimbleSubhead)
                                .monospacedDigit()
                                .foregroundStyle(Color.dim)
                                .textSelection(.enabled)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 4)
                }
                .font(.nimbleCalloutMedium)
                .foregroundStyle(Color.bulbDeep)
            }
        }
    }
}

private struct ConvertResultView: View {
    let from: String
    let to: String
    let fromUnit: String
    let toUnit: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("\(to) \(toUnit)")
                .font(.nimbleDisplay)
                .monospacedDigit()
                .tracking(-0.68)
                .foregroundStyle(Color.text)
                .textSelection(.enabled)
            Text("\(from) \(fromUnit)")
                .font(.nimbleLead)
                .monospacedDigit()
                .foregroundStyle(Color.soft)
        }
    }
}

/// A price or rate: the title, the big number, the change in words. A failed quote is the calm state, no number.
private struct MarketResultView: View {
    let title: String
    let big: String?
    let change: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.nimbleSubheadMedium)
                .foregroundStyle(Color.dim)
            if let big {
                Text(big)
                    .font(.nimbleDisplay)
                    .tracking(-0.68)
                    .foregroundStyle(Color.text)
                if let change {
                    Text(change)
                        .font(.nimbleLead)
                        .foregroundStyle(Color.soft)
                }
            } else {
                Text(String(localized: "Quote unavailable right now"))
                    .font(.nimbleLead)
                    .foregroundStyle(Color.soft)
            }
        }
        .textSelection(.enabled)
        .accessibilityElement(children: .combine)
    }
}

private struct CardResultView: View {
    let big: String
    let unit: String
    let sub: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // A temperature reads as one headline, "11 °C"; other units stay a small caption.
            Text(unit.hasPrefix("°") ? "\(big) \(unit)" : big)
                .font(.nimbleDisplay)
                .monospacedDigit()
                .tracking(-0.68)
                .foregroundStyle(Color.text)
            if !unit.isEmpty && !unit.hasPrefix("°") {
                Text(unit)
                    .font(.nimbleCaption)
                    .foregroundStyle(Color.dim)
                    .textCase(.uppercase)
                    .tracking(0.5)
            }
            Text(sub)
                .font(.nimbleLead)
                .monospacedDigit()
                .foregroundStyle(Color.soft)
        }
        .textSelection(.enabled)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Color (roadmap)

private struct ColorResultView: View {
    let hex: String

    private var components: (r: Int, g: Int, b: Int) {
        let h = hex.replacingOccurrences(of: "#", with: "")
        let v = Int(h, radix: 16) ?? 0
        return ((v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF)
    }

    var body: some View {
        let c = components
        HStack(spacing: 16) {
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(hex: hex) ?? .orange)
                .frame(width: 56, height: 56)
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.hairline, lineWidth: 1))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 5) {
                colorRow(label: "HEX", value: hex.uppercased())
                colorRow(label: "RGB", value: "rgb(\(c.r), \(c.g), \(c.b))")
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .accessibilityElement(children: .combine)
    }

    private func colorRow(label: String, value: String) -> some View {
        HStack(spacing: 8) {
            Text(label).font(.nimbleEyebrow).foregroundStyle(Color.bulbDeep).frame(minWidth: 30)
            Text(value).font(.nimbleCallout).monospacedDigit().foregroundStyle(Color.text)
        }
    }
}

// MARK: - Hex Color extension

private extension Color {
    init?(hex: String) {
        let h = hex.replacingOccurrences(of: "#", with: "")
        guard let v = Int(h, radix: 16) else { return nil }
        self.init(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
    }
}

/// Scores: the score in words with the winner in a heavier weight, the status under it. A missing game or a failed
/// request is one calm line. Words carry the winner and the status, never colour alone.
private struct SportsResultView: View {
    let card: SportsCard

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(card.title)
                .font(.nimbleSubheadMedium)
                .foregroundStyle(Color.dim)
            switch card.outcome {
            case .unavailable:
                Text(String(localized: "Scores unavailable right now"))
                    .font(.nimbleLead)
                    .foregroundStyle(Color.soft)
            case .noGame:
                Text(Self.noGameLine(card))
                    .font(.nimbleLead)
                    .foregroundStyle(Color.soft)
            case .found:
                VStack(alignment: .leading, spacing: 16) {
                    ForEach(Array(card.games.enumerated()), id: \.offset) { _, game in
                        VStack(alignment: .leading, spacing: 4) {
                            Self.scoreText(game)
                                .foregroundStyle(Color.text)
                            Text(game.status)
                                .font(.nimbleCaption)
                                .foregroundStyle(Color.dim)
                        }
                    }
                }
            }
        }
        .textSelection(.enabled)
        .accessibilityElement(children: .combine)
    }

    /// "Lakers 112, Warriors 104", the winner heavier (semibold against regular, so it reads without color); "Bills vs Rams" before kickoff.
    private static func scoreText(_ game: SportsGame) -> Text {
        if game.isPre && game.teams.count == 2 {
            return Text("\(game.teams[0].name) vs \(game.teams[1].name)").font(.nimbleHeadline)
        }
        return game.teams.enumerated().reduce(Text("")) { line, pair in
            let team = pair.element
            let label = (pair.offset > 0 ? ", " : "") + (team.score.isEmpty ? team.name : "\(team.name) \(team.score)")
            let piece = Text(label).font(team.winner ? .nimbleScore : .nimbleScoreRegular)
            return line + piece
        }
    }

    /// The calm line when no game was found in the last seven days. Unavailable is a separate line.
    private static func noGameLine(_ card: SportsCard) -> String {
        if let league = card.league {
            return String(localized: "No \(league) games in the last week")
        }
        return String(localized: "No game found for the \(card.title) in the last week")
    }
}
