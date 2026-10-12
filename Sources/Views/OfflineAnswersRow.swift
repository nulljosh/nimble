import SwiftUI

/// The "Offline answers" controls in Settings: download once on a tap, progress while it runs, remove when it is there.
/// Shared by the iPhone Settings list and the Mac Settings panel.
struct OfflineAnswersRow: View {
    let store: OfflinePackStore
    /// The Mac panel is narrow and uses its small type; the iPhone list uses the body size.
    var compact = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("The opening lines of the 9,000 most-read Wikipedia articles. Download once, on your tap. Answers work with no network.")
                .font(compact ? .nimbleSmall : .nimbleSubhead)
                .foregroundStyle(Color.dim)
                .fixedSize(horizontal: false, vertical: true)

            switch store.phase {
            case .absent, .failed:
                if store.phase == .failed {
                    Text("Could not download the offline pack. Try again on a connection.")
                        .font(compact ? .nimbleSmall : .nimbleSubhead)
                        .foregroundStyle(Color.dim)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Button(downloadLabel) {
                    Task { await store.download() }
                }
                .font(compact ? .nimbleSmall : .nimbleSubheadMedium)
                .foregroundStyle(Color.text)
                .frame(minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
                .accessibilityHint("Downloads the offline Wikipedia pack")

            case .downloading(let fraction):
                ProgressView(value: fraction)
                    .tint(Color.bulbDeep)
                Text("Downloading \(Int((fraction * 100).rounded())) percent")
                    .font(compact ? .nimbleSmall : .nimbleSubhead)
                    .foregroundStyle(Color.dim)
                    .monospacedDigit()
                    .frame(minHeight: 44, alignment: .leading)

            case .ready:
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(readyLabel)
                        .font(compact ? .nimbleSmall : .nimbleSubhead)
                        .foregroundStyle(Color.text)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 8)
                    Button("Remove", role: .destructive) {
                        store.remove()
                    }
                    .font(compact ? .nimbleSmall : .nimbleSubheadMedium)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
            }
        }
        .task { await store.loadSize() }
    }

    private var downloadLabel: String {
        guard let bytes = store.downloadBytes else { return "Download offline answers" }
        return "Download offline answers (\(ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file)))"
    }

    /// "Ready. 9,000 articles, as of Oct 12." The date is the pack's build date.
    private var readyLabel: String {
        let count = store.pack?.entries.count ?? 0
        let articles = "Ready. \(count.formatted()) articles"
        guard let built = store.pack?.builtAt, let asOf = OfflinePack.asOfLabel(built) else { return articles + "." }
        return "\(articles), as of \(asOf)."
    }
}
