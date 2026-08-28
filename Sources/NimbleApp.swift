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
                // There is no titlebar to style away: the pale strip was
                // _NSTitlebarDecorationView inside NSTitlebarContainerView, and hiding
                // those views does not stick because SwiftUI rebuilds them on layout.
                // Dropping .titled deletes the container outright. .resizable stays in
                // the mask because NSWindow only returns canBecomeKey for a titled or
                // resizable window, and without key status the search field cannot
                // focus — the window still hugs its content via .windowResizability.
                window.styleMask = [.resizable, .fullSizeContentView]
                window.toolbar = nil
                window.titlebarSeparatorStyle = .none
                // TEMP DIAGNOSTIC
                guard window.contentView != nil else { continue }
                var log = "WIN \(window.className) frame=\(window.frame) content=\(window.contentView!.frame) mask=\(window.styleMask.rawValue)\n"
                log += "canBecomeKey=\(window.canBecomeKey) isKey=\(window.isKeyWindow)\n"
                func dump(_ v: NSView, _ d: Int) {
                    log += String(repeating: "  ", count: d) + "\(v.className) frame=\(v.frame) hidden=\(v.isHidden) opaque=\(v.isOpaque)\n"
                    if d < 3 { for sub in v.subviews { dump(sub, d + 1) } }
                }
                if let themeFrame = window.contentView?.superview { dump(themeFrame, 0) }
                try? log.appendOrWrite(to: "/tmp/nimble-diag.txt")
                let w = window
                DispatchQueue.main.asyncAfter(deadline: .now() + 10) {
                    let f = w.firstResponder?.className ?? "nil"
                    try? "LATER isKey=\(w.isKeyWindow) canBecomeKey=\(w.canBecomeKey) firstResponder=\(f)\n".appendOrWrite(to: "/tmp/nimble-diag.txt")
                }
            }
        }
    }
}

private extension String {
    func appendOrWrite(to path: String) throws {
        let existing = (try? String(contentsOfFile: path, encoding: .utf8)) ?? ""
        try (existing + self).write(toFile: path, atomically: true, encoding: .utf8)
    }
}
