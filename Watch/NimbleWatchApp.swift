import SwiftUI

/// Nimble on the wrist: say a question, read one sentence back. Same engine as the iPhone and Mac apps.
@main
struct NimbleWatchApp: App {
    var body: some Scene {
        WindowGroup { WatchAsk() }
    }
}
