import SwiftUI

// ponytail: read from the bundle so this can't drift from MARKETING_VERSION again -
// it was pinned at "1.2.0" while the project shipped 1.0.0, a version that never existed.
let whatsNewVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
private let whatsNewBullets = [
    "Three tabs: Ask, History and Settings",
    "Works offline: the opening lines of 9,000 Wikipedia articles, downloaded once",
    "When sources disagree, you see both answers, and live answers say how fresh they are",
    "Ask Nimble from Siri, Spotlight, Shortcuts and the Action button",
    "Private mode in Settings: nothing leaves your phone",
    "Share text or a link to Ask Nimble, and the app answers it when you open it",
]

struct WhatsNewSheet: View {
    @AppStorage("whats_new_seen_version", store: NimbleStorage.defaults()) private var seenVersion = ""
    @State private var isPresented = false
    @State private var contentHeight: CGFloat = 220

    var body: some View {
        Color.clear
            .onAppear {
                guard !CommandLine.arguments.contains(where: { $0.hasPrefix("UITEST_") }) else { return }
                // QA: any shot launch skips the overlay so the screen under it is what the shot shows.
                isPresented = seenVersion != whatsNewVersion && !QASandbox.launch
            }
            .sheet(isPresented: $isPresented) {
                // Scrolls and can grow to full height, so accessibility text sizes never clip the last line or the button.
                ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("What's new in \(whatsNewVersion)")
                        .font(.nimbleHeadline)

                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(whatsNewBullets, id: \.self) { bullet in
                            HStack(alignment: .top, spacing: 8) {
                                Circle().fill(Color.bulb).frame(width: 6, height: 6).padding(.top, 8)
                                Text(bullet)
                            }
                        }
                    }
                    .font(.nimbleBody)
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
                    .tint(Color.bulb)  // brand yellow, not system blue
                    .foregroundStyle(.black)
                    .controlSize(.large)
                }
                .padding(.horizontal, 28)
                .padding(.top, 36)  // clears the grabber
                .padding(.bottom, 24)
                // The old preference-key measure never reached the sheet, so it opened at the 220pt default and cut off the button.
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
                }
                .presentationDetents([.height(contentHeight + 34), .large]) // ponytail: +34 covers the home-indicator inset
                .presentationDragIndicator(.visible)
            }
    }
}
