import SwiftUI
import ImageIO
import UniformTypeIdentifiers

/// The three card shapes: wide for links and feeds, square for posts, story for full-screen.
/// Story keeps clear of the top and bottom strips the story apps cover with their own buttons.
enum ShareCardShape: String, CaseIterable {
    case wide, square, story

    var size: CGSize {
        switch self {
        case .wide: return CGSize(width: 1200, height: 630)
        case .square: return CGSize(width: 1080, height: 1080)
        case .story: return CGSize(width: 1080, height: 1920)
        }
    }
    var top: CGFloat { self == .story ? 220 : 72 }
    var bottom: CGFloat { self == .story ? 260 : 72 }
    /// Type scale: the tall shapes are read smaller on a phone, so their type is a fifth bigger.
    var scale: CGFloat { self == .wide ? 1 : 1.2 }
    /// Height the answer may use between the question and the source line.
    var answerHeight: CGFloat { self == .wide ? 280 : min(size.height - top - bottom - 2 * (88 * scale + 60), 1000) }
}

/// The answer as a card: brand yellow, the question top-left, the answer big and
/// centred vertically, the source bottom-left, the bulb bottom-right. Same layout as the web card.
struct ShareCard: View {
    private static let margin: CGFloat = 72

    let question: String
    let answer: String
    let source: String
    var shape: ShareCardShape = .wide

    // Long answers step down in size instead of clipping; the scale factor catches the rest.
    private var answerSize: CGFloat {
        let base: CGFloat
        switch answer.count {
        case ...10: base = 96
        case ...20: base = 80
        case ...40: base = 64
        case ...80: base = 48
        default: base = 36
        }
        return base * shape.scale
    }

    var body: some View {
        ZStack {
            Color(red: 1, green: 202.0 / 255, blue: 48.0 / 255)

            Text(answer)
                .font(.nimble(answerSize, .bold, relativeTo: .body))
                .tracking(-answerSize * 0.02)
                .lineSpacing(0)
                .minimumScaleFactor(0.5)
                .foregroundStyle(.black)
                .frame(width: shape.size.width - 2 * Self.margin, height: shape.answerHeight, alignment: .leading)

            VStack(alignment: .leading, spacing: 0) {
                Text(question)
                    .font(.nimbleDisplay)
                    .foregroundStyle(.black)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Spacer(minLength: 0)
                HStack(alignment: .center) {
                    Text(source.uppercased())
                        .font(.nimbleLeadMedium)
                        .tracking(1.6)
                        .foregroundStyle(.black.opacity(0.6))
                    Spacer(minLength: 0)
                    mark
                }
            }
            .padding(.horizontal, Self.margin)
            .padding(.top, shape.top)
            .padding(.bottom, shape.bottom)
        }
        .frame(width: shape.size.width, height: shape.size.height)
        .environment(\.colorScheme, .light)
    }

    @ViewBuilder private var mark: some View {
        if let image = Self.markImage {
            image.resizable().interpolation(.high).frame(width: 56, height: 56)
        } else {
            Color.clear.frame(width: 56, height: 56)
        }
    }

    // The bulb from docs/icon-512.png, bundled as a resource. No text in it.
    private static var markImage: Image? {
        guard let url = Bundle.main.url(forResource: "icon-512", withExtension: "png") else { return nil }
        #if os(macOS)
        return NSImage(contentsOf: url).map { Image(nsImage: $0) }
        #else
        return UIImage(contentsOfFile: url.path).map { Image(uiImage: $0) }
        #endif
    }
}

@MainActor
enum ShareCardRenderer {
    /// PNG bytes of the card at exactly the shape's size (wide is 1200x630), or nil if rendering fails.
    static func png(question: String, answer: String, source: String, shape: ShareCardShape = .wide) -> Data? {
        let renderer = ImageRenderer(content: ShareCard(question: question, answer: answer, source: source, shape: shape))
        renderer.scale = 1
        renderer.proposedSize = ProposedViewSize(shape.size)
        guard let image = renderer.cgImage else { return nil }
        let data = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil) else { return nil }
        CGImageDestinationAddImage(dest, image, nil)
        return CGImageDestinationFinalize(dest) ? data as Data : nil
    }
}

#if os(macOS)
extension AppState {
    /// Share on the Mac: the card goes on the pasteboard as a PNG and into ~/Downloads/nimble-answer.png.
    func shareResultImage() {
        guard let content = result.shareContent,
              let data = ShareCardRenderer.png(question: queryText, answer: content.text, source: content.source, shape: ShareCardShape(rawValue: cardShape) ?? .wide) else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setData(data, forType: .png)
        if let downloads = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first {
            try? data.write(to: downloads.appendingPathComponent("nimble-answer.png"), options: .atomic)
        }
    }
}
#endif
