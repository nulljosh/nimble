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

        case .math(let value):
            AnswerCard(shareText: state.result.copyText) {
                MathResultView(value: value)
            } footer: {
                Text("computed offline")
            }

        case .text(let heading, let body, let source, let sourceURL, let imageURL):
            AnswerCard(shareText: state.result.copyText) {
                HStack(alignment: .top, spacing: 14) {
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
                                .nimbleFont(15, weight: .bold)
                                .foregroundStyle(Color.soft)
                        }
                        Text(body)
                            .nimbleFont(19)
                            .foregroundStyle(Color.text)
                            .lineSpacing(7)
                            .textSelection(.enabled)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            } footer: {
                // AI answers have no source page, so the link falls back to a web search.
                link(String(localized: "powered by \(source)"), to: sourceURL ?? state.searchURL)
            }

        case .list(let items, let source):
            AnswerCard(shareText: state.result.copyText) {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                        Text(item)
                            .nimbleFont(17)
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

        case .card(let big, let unit, let sub, let source, let url):
            AnswerCard(shareText: state.result.copyText) {
                CardResultView(big: big, unit: unit, sub: sub)
            } footer: {
                link(String(localized: "powered by \(source)"), to: url ?? state.searchURL)
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
                    .nimbleFont(14)
                    .foregroundStyle(Color.dim)
                if let searchURL, URL(string: searchURL) != nil {
                    Button("Search on DuckDuckGo →") { state.openInDDG() }
                        .nimbleFont(14, weight: .medium)
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
                .accessibilityLabel(label)
        } else {
            Text(label)
        }
    }
}

// MARK: - Shared cards (web app: .card, .field, the eyebrow and the Ask button)

/// The answer card: hairline border, 22pt padding, an eyebrow, the answer, then one row with the source and Share.
struct AnswerCard<Content: View, Footer: View>: View {
    let shareText: String?
    let content: Content
    let footer: Footer

    init(shareText: String?, @ViewBuilder content: () -> Content, @ViewBuilder footer: () -> Footer) {
        self.shareText = shareText
        self.content = content()
        self.footer = footer()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // One VoiceOver stop for the eyebrow and the answer. The footer row stays apart so Share and the source link remain buttons.
            VStack(alignment: .leading, spacing: 16) {
                Eyebrow(text: "Answer")
                content
            }
            .accessibilityElement(children: .combine)
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                footer
                    .nimbleFont(12)
                    .foregroundStyle(Color.dim)
                Spacer(minLength: 8)
                if let shareText, !shareText.isEmpty {
                    ShareLink(item: shareText) {
                        Text("Share")
                            .nimbleFont(12)
                            .foregroundStyle(Color.dim)
                            .underline()
                    }
                    .accessibilityLabel("Share")
                }
            }
        }
        .padding(22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.hairline, lineWidth: 1))
        .transition(.opacity.combined(with: .move(edge: .top)))
    }
}

/// Small caps label in the accent: "ANSWER", "BEFORE I ANSWER", "RECENT".
struct Eyebrow: View {
    let text: LocalizedStringKey

    var body: some View {
        Text(text)
            .nimbleFont(11, weight: .bold)
            .tracking(1.3)
            .textCase(.uppercase)
            .foregroundStyle(Color.bulbDeep)
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

        return VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 14) {
                Eyebrow(text: "Before I answer")
                Text("Send your question to an AI service?")
                    .nimbleFont(15, weight: .bold)
                    .foregroundStyle(Color.soft)
                Text("To answer, Nimble sends the text you type, and nothing else, to \(state.aiRecipient). No account, contacts, location or identifiers are sent, and Nimble keeps no record of it. If you don't allow this, answers come from DuckDuckGo and Wikipedia only. You can change this in Settings.")
                    .nimbleFont(17)
                    .foregroundStyle(Color.text)
                    .lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityElement(children: .combine)
            buttons {
                Button("Allow") { state.answerAIConsent(true) }
                    .nimbleFont(15, weight: .bold)
                    .foregroundStyle(.black)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 10)
                    .background(Color.bulb, in: RoundedRectangle(cornerRadius: 10))
                    .buttonStyle(.plain)
                Button("Don't Allow") { state.answerAIConsent(false) }
                    .nimbleFont(15, weight: .medium)
                    .foregroundStyle(Color.text)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 10)
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.hairline, lineWidth: 1))
                    .buttonStyle(.plain)
            }
        }
        .padding(22)
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
                        .nimbleFont(12)
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
                        .nimbleFont(size)
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
                .nimbleFont(14, weight: .medium)
                .foregroundStyle(Color.soft)
                .textSelection(.enabled)
        }
    }
}

// MARK: - Math, convert, card

private struct MathResultView: View {
    let value: String
    @State private var appeared = false

    var body: some View {
        Text(value)
            .nimbleFont(34, weight: .bold)
            .foregroundStyle(Color.text)
            .textSelection(.enabled)
            .scaleEffect(appeared ? 1.0 : 0.88)
            .opacity(appeared ? 1.0 : 0)
            .onAppear {
                withAnimation(.spring(duration: 0.35, bounce: 0.4)) { appeared = true }
            }
    }
}

private struct ConvertResultView: View {
    let from: String
    let to: String
    let fromUnit: String
    let toUnit: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("\(to) \(toUnit)")
                .nimbleFont(34, weight: .bold)
                .foregroundStyle(Color.text)
                .textSelection(.enabled)
            Text("\(from) \(fromUnit)")
                .nimbleFont(18)
                .foregroundStyle(Color.soft)
        }
    }
}

private struct CardResultView: View {
    let big: String
    let unit: String
    let sub: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(big)
                .nimbleFont(34, weight: .bold)
                .foregroundStyle(Color.text)
            if !unit.isEmpty {
                Text(unit)
                    .nimbleFont(13)
                    .foregroundStyle(Color.dim)
                    .textCase(.uppercase)
                    .tracking(0.5)
            }
            Text(sub)
                .nimbleFont(18)
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
            Text(label).nimbleFont(11, weight: .bold).foregroundStyle(Color.bulbDeep).frame(minWidth: 30)
            Text(value).nimbleFont(14).foregroundStyle(Color.text)
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
