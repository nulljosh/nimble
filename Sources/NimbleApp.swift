import SwiftUI

@main
struct NimbleApp: App {
    @State private var appState = AppState()
    @Environment(\.openWindow) private var openWindow

    var body: some Scene {
        Window("Nimble", id: "main") {
            SearchView()
                .environment(appState)
                .background(VisualEffectView(material: .hudWindow, blendingMode: .behindWindow))
                .onAppear {
                    configureWindow()
                    GlobalHotkey.register { GlobalHotkey.toggleNimble { showMain() } }
                }
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

        MenuBarExtra("Nimble", systemImage: "magnifyingglass") {
            Button("Open Nimble") { showMain() }
                .keyboardShortcut(" ", modifiers: .option)
            Divider()
            Button("Quit Nimble") { NSApp.terminate(nil) }
                .keyboardShortcut("q")
        }
    }

    private func showMain() {
        openWindow(id: "main")
        NSApp.activate(ignoringOtherApps: true)
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
                // The pale strip above the search field was the titlebar container
                // still drawing its own material. Transparent titlebar + hidden buttons
                // is not enough; the container view itself has to be hidden. Walk up
                // from a button rather than naming a private class.
                // Hide ONLY the container — every other ancestor up the chain is
                // shared with the content view, so hiding them blanks the window.
                var view = window.standardWindowButton(.closeButton)?.superview
                while let current = view {
                    if current.className.contains("TitlebarContainer") {
                        current.isHidden = true
                        break
                    }
                    view = current.superview
                }
            }
        }
    }
}
