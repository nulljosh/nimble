import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// "Ask Nimble" in the share sheet. It parks the shared text or link in the app group, and the app
/// asks it the next time it comes forward (RootTabView.runParkedQuestion).
// ponytail: no responder-chain trick to open the app; Apple blocks openURL from share extensions
// and the workaround breaks between iOS releases. Revisit if Apple adds a sanctioned way.
final class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        Task { @MainActor in
            let question = await sharedText().map { String($0.trimmingCharacters(in: .whitespacesAndNewlines).prefix(300)) } ?? ""
            if !question.isEmpty {
                UserDefaults(suiteName: SharedAnswer.suiteName)?.set(question, forKey: "pending_question")
            }
            let host = UIHostingController(rootView: ShareCardView(question: question) { [weak self] in
                self?.extensionContext?.completeRequest(returningItems: nil)
            })
            addChild(host)
            host.view.frame = view.bounds
            host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            view.addSubview(host.view)
            host.didMove(toParent: self)
        }
    }

    /// A link wins over text, so sharing a page asks about the page.
    private func sharedText() async -> String? {
        let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
        for p in providers where p.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
            if let url = try? await p.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL { return url.absoluteString }
        }
        for p in providers where p.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
            if let text = try? await p.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String { return text }
        }
        return nil
    }
}

private struct ShareCardView: View {
    let question: String
    let done: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Ask Nimble").font(.title2.bold()).foregroundStyle(Color.text)
            if question.isEmpty {
                Text("Nothing to ask here. Share some text or a link.").foregroundStyle(Color.soft)
            } else {
                Text(question)
                    .lineLimit(4)
                    .foregroundStyle(Color.text)
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.bg2, in: RoundedRectangle(cornerRadius: 12))
                Text("Saved. Open Nimble and it answers this first.").foregroundStyle(Color.soft)
            }
            Spacer()
            Button(action: done) {
                Text("Done").font(.headline).frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color.bulb)
            .foregroundStyle(.black)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color.bg.ignoresSafeArea())
    }
}
