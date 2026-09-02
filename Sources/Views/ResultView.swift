import SwiftUI

struct ResultView: View {
    @Environment(AppState.self) private var state

    var body: some View {
        switch state.result {
        case .none, .loading:
            EmptyView()

        case .math(let value):
            MathResultView(value: value, accent: state.theme.color)

        case .text(let heading, let body, _, _, let imageURL):
            ScrollView {
                HStack(alignment: .top, spacing: 14) {
                    if let imageURL, let url = URL(string: imageURL) {
                        AsyncImage(url: url) { phase in
                            if case .success(let image) = phase {
                                image.resizable().aspectRatio(contentMode: .fill)
                                    .frame(width: 56, height: 56)
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                                    .opacity(0.9)
                            }
                        }
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        if let heading, !heading.isEmpty {
                            Text(heading)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(.primary)
                        }
                        Text(body)
                            .font(.system(size: 13))
                            .foregroundStyle(.secondary)
                            .textSelection(.enabled)
                            .lineSpacing(3)
                            .lineLimit(nil)
                    }
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 14)
            }
            .frame(maxHeight: 300)
            .transition(.opacity.combined(with: .move(edge: .top)))

        case .list(let items, _):
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                        HStack(spacing: 12) {
                            Text("\(index + 1)")
                                .font(.system(size: 9, weight: .semibold))
                                .foregroundStyle(state.theme.color.opacity(0.7))
                                .frame(width: 16)
                            Text(item)
                                .font(.system(size: 13))
                                .foregroundStyle(.secondary)
                                .textSelection(.enabled)
                                .lineLimit(3)
                        }
                        .padding(.horizontal, 18)
                        .padding(.vertical, 9)
                        if index < items.count - 1 {
                            Divider().padding(.leading, 46).opacity(0.3)
                        }
                    }
                }
                .padding(.vertical, 6)
            }
            .frame(maxHeight: 300)
            .transition(.opacity.combined(with: .move(edge: .top)))

        case .color(let hex):
            ColorResultView(hex: hex, accent: state.theme.color)

        case .convert(let from, let to, let fromUnit, let toUnit):
            ConvertResultView(from: from, to: to, fromUnit: fromUnit, toUnit: toUnit, accent: state.theme.color)

        case .graph(let expr, let points):
            GraphResultView(expr: expr, points: points, accent: state.theme.color)

        case .error(let message, let searchURL):
            VStack(spacing: 10) {
                Text(message)
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                if let searchURL, URL(string: searchURL) != nil {
                    Button("Search on DuckDuckGo →") { state.openInDDG() }
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(state.theme.color.opacity(0.85))
                        .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 18)
            .frame(maxWidth: .infinity)
            .transition(.opacity)
        }
    }
}

// MARK: - Graph

private struct GraphResultView: View {
    let expr: String
    let points: [CGPoint]
    let accent: Color

    var body: some View {
        VStack(spacing: 6) {
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
                ctx.stroke(axes, with: .color(.secondary.opacity(0.4)), lineWidth: 1)
                var curve = Path()
                // Break the line where sampled neighbours are far apart (asymptotes).
                var pen = false
                for (i, p) in points.enumerated() {
                    let jump = i > 0 && abs(p.x - points[i - 1].x) > (x1 - x0) / 50
                    if !pen || jump { curve.move(to: pt(p)); pen = true } else { curve.addLine(to: pt(p)) }
                }
                ctx.stroke(curve, with: .color(accent), style: StrokeStyle(lineWidth: 2, lineJoin: .round))
            }
            .frame(height: 160)
            .padding(.horizontal, 20)
            Text("y = \(expr)")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.secondary)
                .textSelection(.enabled)
        }
        .padding(.vertical, 14)
        .transition(.opacity)
    }
}

// MARK: - Math

private struct MathResultView: View {
    let value: String
    let accent: Color
    @State private var appeared = false

    var body: some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.system(size: 42, weight: .semibold))
                .foregroundStyle(.primary)
                .textSelection(.enabled)
                .letterSpacing(-0.03)
            Text("RESULT")
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(accent.opacity(0.7))
                .tracking(1.2)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 18)
        .padding(.horizontal, 20)
        .scaleEffect(appeared ? 1.0 : 0.88)
        .opacity(appeared ? 1.0 : 0)
        .onAppear {
            withAnimation(.spring(duration: 0.35, bounce: 0.4)) { appeared = true }
        }
    }
}

// MARK: - Color (roadmap)

private struct ColorResultView: View {
    let hex: String
    let accent: Color

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
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.primary.opacity(0.1), lineWidth: 1))
            VStack(alignment: .leading, spacing: 5) {
                colorRow(label: "HEX", value: hex.uppercased(), accent: accent)
                colorRow(label: "RGB", value: "rgb(\(c.r), \(c.g), \(c.b))", accent: accent)
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .transition(.opacity.combined(with: .scale(scale: 0.9)))
    }

    private func colorRow(label: String, value: String, accent: Color) -> some View {
        HStack(spacing: 8) {
            Text(label).font(.system(size: 9, weight: .semibold)).foregroundStyle(accent.opacity(0.7)).frame(width: 30)
            Text(value).font(.system(size: 12)).foregroundStyle(.primary)
        }
    }
}

// MARK: - Convert (roadmap)

private struct ConvertResultView: View {
    let from: String
    let to: String
    let fromUnit: String
    let toUnit: String
    let accent: Color
    @State private var appeared = false

    var body: some View {
        HStack(spacing: 20) {
            VStack(spacing: 2) {
                Text(from).font(.system(size: 32, weight: .light)).foregroundStyle(.secondary)
                Text(fromUnit).font(.system(size: 11)).foregroundStyle(.secondary).tracking(0.5)
            }
            Text("→").font(.system(size: 18, weight: .light)).foregroundStyle(accent.opacity(0.5))
            VStack(spacing: 2) {
                Text(to).font(.system(size: 40, weight: .semibold)).foregroundStyle(.primary)
                    .scaleEffect(appeared ? 1.0 : 0.88)
                    .onAppear { withAnimation(.spring(duration: 0.35, bounce: 0.4)) { appeared = true } }
                Text(toUnit).font(.system(size: 11)).foregroundStyle(accent.opacity(0.6)).tracking(0.5)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .padding(.horizontal, 20)
        .transition(.opacity.combined(with: .move(edge: .top)))
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

// MARK: - Tracking modifier helper

private extension View {
    func letterSpacing(_ value: Double) -> some View {
        self
    }
}
