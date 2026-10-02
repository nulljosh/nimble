import SwiftUI
import ImageIO
import UniformTypeIdentifiers

/// The answer as a 1200x630 card: brand yellow, the question top-left, the answer big and
/// centred vertically, the source bottom-left, the bulb bottom-right. Same layout as the web card.
struct ShareCard: View {
    static let size = CGSize(width: 1200, height: 630)
    private static let margin: CGFloat = 72

    let question: String
    let answer: String
    let source: String

    // Long answers step down in size instead of clipping; the scale factor catches the rest.
    private var answerSize: CGFloat {
        switch answer.count {
        case ...10: return 96
        case ...20: return 80
        case ...40: return 64
        case ...80: return 48
        default: return 36
        }
    }

    var body: some View {
        ZStack {
            Color(red: 1, green: 202.0 / 255, blue: 48.0 / 255)

            Text(answer)
                .font(.system(size: answerSize, weight: .bold))
                .tracking(-answerSize * 0.02)
                .lineSpacing(0)
                .minimumScaleFactor(0.5)
                .foregroundStyle(.black)
                .frame(width: Self.size.width - 2 * Self.margin, height: 280, alignment: .leading)

            VStack(alignment: .leading, spacing: 0) {
                Text(question)
                    .font(.system(size: 36, weight: .regular))
                    .foregroundStyle(.black)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Spacer(minLength: 0)
                HStack(alignment: .center) {
                    Text(source.uppercased())
                        .font(.system(size: 20, weight: .medium))
                        .tracking(1.6)
                        .foregroundStyle(.black.opacity(0.6))
                    Spacer(minLength: 0)
                    mark
                }
            }
            .padding(Self.margin)
        }
        .frame(width: Self.size.width, height: Self.size.height)
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
    /// PNG bytes of the card at exactly 1200x630, or nil if rendering fails.
    static func png(question: String, answer: String, source: String) -> Data? {
        let renderer = ImageRenderer(content: ShareCard(question: question, answer: answer, source: source))
        renderer.scale = 1
        renderer.proposedSize = ProposedViewSize(ShareCard.size)
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
              let data = ShareCardRenderer.png(question: queryText, answer: content.text, source: content.source) else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setData(data, forType: .png)
        if let downloads = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first {
            try? data.write(to: downloads.appendingPathComponent("nimble-answer.png"), options: .atomic)
        }
    }
}
#endif

#if os(iOS)
/// Sits next to Copy in the bottom bar and opens the share sheet with the card as a PNG.
struct ShareAnswerButton: View {
    @Environment(AppState.self) private var state
    @State private var file: URL?

    // One render per answer, not per redraw: the key only moves when the answer does.
    private var key: String { state.searchURL + "\n" + (state.result.shareContent?.text ?? "") }

    var body: some View {
        Group {
            if let file {
                ShareLink(item: file) {
                    Image(systemName: "square.and.arrow.up")
                        .font(.system(size: 14))
                        .foregroundStyle(.secondary)
                }
                .accessibilityLabel("Share answer as image")
            }
        }
        .task(id: key) {
            guard let content = state.result.shareContent,
                  let data = ShareCardRenderer.png(question: state.queryText, answer: content.text, source: content.source) else { file = nil; return }
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("nimble-answer.png")
            file = (try? data.write(to: url, options: .atomic)) == nil ? nil : url
        }
    }
}
#endif
