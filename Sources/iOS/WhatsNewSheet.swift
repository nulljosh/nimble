import SwiftUI

// ponytail: read from the bundle so this can't drift from MARKETING_VERSION again -
// it was pinned at "1.2.0" while the project shipped 1.0.0, a version that never existed.
let whatsNewVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
private let whatsNewBullets = [
    "Recent questions, on every surface, never leaving the device",
    "Follow-ups: ask \"and in celsius?\" and Nimble remembers",
    "Clear your history any time",
]

struct WhatsNewSheet: View {
    @AppStorage("whats_new_seen_version") private var seenVersion = ""
    @State private var isPresented = false
    @State private var contentHeight: CGFloat = 220

    var body: some View {
        Color.clear
            .onAppear {
                guard !CommandLine.arguments.contains(where: { $0.hasPrefix("UITEST_") }) else { return }
                isPresented = seenVersion != whatsNewVersion
            }
            .sheet(isPresented: $isPresented) {
                VStack(alignment: .leading, spacing: 20) {
                    Text("What's new in \(whatsNewVersion)")
                        .font(.title2.bold())

                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(whatsNewBullets, id: \.self) { bullet in
                            HStack(alignment: .top, spacing: 8) {
                                Circle().fill(Color(red: 1.0, green: 0.79, blue: 0.19)).frame(width: 6, height: 6).padding(.top, 8)
                                Text(bullet)
                            }
                        }
                    }
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                    Button {
                        seenVersion = whatsNewVersion
                        isPresented = false
                    } label: {
                        Text("Got it")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color(red: 1.0, green: 0.79, blue: 0.19))  // brand yellow, not system blue
                    .foregroundStyle(.black)
                    .controlSize(.large)
                }
                .padding(24)
                .background(GeometryReader { geo in
                    Color.clear.preference(key: SheetHeightKey.self, value: geo.size.height)
                })
                .onPreferenceChange(SheetHeightKey.self) { contentHeight = $0 }
                .presentationDetents([.height(contentHeight + 34)]) // ponytail: +34 covers home-indicator safe area GeometryReader doesn't include
            }
    }
}

private struct SheetHeightKey: PreferenceKey {
    nonisolated(unsafe) static var defaultValue: CGFloat = 220
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}
