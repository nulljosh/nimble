import SwiftUI

@main
struct NimbleApp: App {
    @State private var appState = AppState()

    var body: some Scene {
        Window("Nimble", id: "main") {
            SearchView()
                .environment(appState)
                .background(VisualEffectView(material: .hudWindow, blendingMode: .behindWindow))
                .onAppear { configureWindow() }
        }
        .windowStyle(.hiddenTitleBar)
        // Without this the window keeps a titlebar-sized strip above the search bar —
        // the empty bar at the top of the HUD. `.contentSize` makes the frame hug the
        // view, which is also what lets it grow when a result appears.
        .windowResizability(.contentSize)
        .commands {
            CommandGroup(replacing: .appInfo) {
                Button("About Nimble") { NSApp.orderFrontStandardAboutPanel(nil) }
                Divider()
                Button("Check for Updates…") {
                    Task { await appState.checkForUpdatesNow() }
                }
                .disabled(appState.updates.isChecking)
            }
            // Nothing to create, and no help book to open — both menus were empty.
            CommandGroup(replacing: .newItem) {}
            CommandGroup(replacing: .help) {}
        }
    }

    private func configureWindow() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            for window in NSApp.windows {
                window.standardWindowButton(.closeButton)?.isHidden = true
                window.standardWindowButton(.miniaturizeButton)?.isHidden = true
                window.standardWindowButton(.zoomButton)?.isHidden = true
                window.isMovableByWindowBackground = true
                window.titlebarAppearsTransparent = true
                window.titleVisibility = .hidden
                window.backgroundColor = .clear
                window.isOpaque = false
                window.hasShadow = true
                // The three that actually remove the bar: content draws under the
                // titlebar, no toolbar row, no hairline where the titlebar ended.
                window.styleMask.insert(.fullSizeContentView)
                window.toolbar = nil
                window.titlebarSeparatorStyle = .none
            }
        }
    }
}
