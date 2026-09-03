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
                Button("About Nimble") { NSApp.orderFrontStandardAboutPanel(nil) }            }
            // Nothing to create, and no help book to open — both menus were empty.
            CommandGroup(replacing: .newItem) {}
            CommandGroup(replacing: .help) {}
        }

        // Preferences belong in the app menu, not as a gear in the HUD chrome.
        // This scene is what puts "Settings…" under Nimble and binds Cmd-, to it.
        Settings {
            SettingsView().environment(appState)
        }

        MenuBarExtra("Nimble", systemImage: "magnifyingglass") {
            Button("Open Nimble") { showMain() }
                .keyboardShortcut(" ", modifiers: .option)
            SettingsLink { Text("Settings…") }
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
                // No buttons to hide any more — dropping .titled below takes the whole
                // titlebar with them. Dragging survives on the window background.
                window.isMovableByWindowBackground = true
                window.titlebarAppearsTransparent = true
                window.titleVisibility = .hidden
                window.backgroundColor = .clear
                window.isOpaque = false
                window.hasShadow = true
                // The pale strip above the search field was _NSTitlebarDecorationView
                // inside NSTitlebarContainerView. Transparency, hidden buttons and
                // hiding those views individually all failed — SwiftUI rebuilds them on
                // layout. Dropping .titled deletes the container outright, and the
                // window shrinks by exactly the 32pt the strip occupied.
                // ponytail: this leaves canBecomeKey == false, as it does for any
                // borderless window. Clicking the window still focuses the field, but
                // if an Opt+Space summon ever lands without a caret, the fix is an
                // NSPanel that can override canBecomeKey — see roadmap.md.
                window.styleMask = [.resizable, .fullSizeContentView]
                window.toolbar = nil
                window.titlebarSeparatorStyle = .none
                // Borderless means nothing rounds the window any more, so the
                // square visual-effect view showed as white slivers outside the card's
                // corners. 14 matches SearchView's clipShape radius.
                window.contentView?.wantsLayer = true
                window.contentView?.layer?.cornerRadius = 14
                window.contentView?.layer?.masksToBounds = true
            }
        }
    }
}

