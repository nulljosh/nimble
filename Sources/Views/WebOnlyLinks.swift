import SwiftUI

extension View {
    /// Every link the app opens goes through here: http(s) only. A javascript:, file: or custom-scheme link from a
    /// feed or a page is dropped, wherever it was tapped. Same rule as hrefOf() in docs/engine.js.
    func webOnlyLinks() -> some View {
        environment(\.openURL, OpenURLAction { url in
            ["http", "https"].contains(url.scheme?.lowercased() ?? "") ? .systemAction : .discarded
        })
    }
}
