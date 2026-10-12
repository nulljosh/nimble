import SwiftUI
import ObjectiveC

@main
struct NimbleApp: App {
    @State private var appState = AppState()
    @Environment(\.openWindow) private var openWindow

    init() {
        // QA launches start from an empty suite (QASandbox.defaults wipes it on first use).
        if QASandbox.launch { _ = QASandbox.defaults }
    }

    var body: some Scene {
        Window("Nimble", id: "main") {
            SearchView()
                .environment(appState)
                .background(VisualEffectView(material: .hudWindow, blendingMode: .behindWindow))
                .onAppear {
                    // Screenshots: `-shotAppearance light|dark` pins this process only, never the system setting.
                    if let mode = UserDefaults.standard.string(forKey: "shotAppearance") {
                        NSApp.appearance = NSAppearance(named: mode == "light" ? .aqua : .darkAqua)
                    }
                    configureWindow()
                    GlobalHotkey.register { GlobalHotkey.toggleNimble { showMain() } }
                }
        }
        .windowStyle(.hiddenTitleBar)
        // Without this the window keeps a titlebar-sized strip above the search bar ,
        // the empty bar at the top of the HUD. `.contentSize` makes the frame hug the
        // view, which is also what lets it grow when a result appears.
        .windowResizability(.contentSize)
        .commands {
            CommandGroup(replacing: .appInfo) {
                Button("About Nimble") { NSApp.orderFrontStandardAboutPanel(nil) }            }
            // The one thing to create is a new question: Cmd-N clears the answer and puts the caret back.
            CommandGroup(replacing: .newItem) {
                Button("New Question") { appState.newQuestion() }
                    .keyboardShortcut("n")
            }
            // No help book to open, so the Help menu stays empty.
            CommandGroup(replacing: .help) {}
        }

        // Preferences belong in the app menu, not as a gear in the HUD chrome.
        // This scene is what puts "Settings…" under Nimble and binds Cmd-, to it.
        Settings {
            SettingsView().environment(appState)
        }

        // A window, not a menu: ask from the menu bar without summoning the HUD.
        MenuBarExtra("Nimble", systemImage: "magnifyingglass") {
            QuickAskView(openMain: showMain)
                .environment(appState)
        }
        .menuBarExtraStyle(.window)
    }

    private func showMain() {
        openWindow(id: "main")
        NSApp.activate(ignoringOtherApps: true)
    }

    /// A borderless window answers `canBecomeKey == false`, so an Opt+Space summon landed
    /// with no caret and typing went nowhere. Subclass the window's own class at runtime
    /// (SwiftUI's AppKitWindow, which a plain NSWindow subclass would replace) and say yes.
    private func makeKeyable(_ window: NSWindow) {
        let base: AnyClass = type(of: window)
        guard !NSStringFromClass(base).hasPrefix("NSKVONotifying") else { return }  // KVO already swapped the class
        let name = "NimbleKey_" + NSStringFromClass(base)
        let keyable: AnyClass = NSClassFromString(name) ?? {
            let sub = objc_allocateClassPair(base, name, 0)!
            let yes: @convention(block) (AnyObject) -> Bool = { _ in true }
            class_addMethod(sub, #selector(getter: NSWindow.canBecomeKey),
                            imp_implementationWithBlock(yes), "B@:")
            objc_registerClassPair(sub)
            return sub
        }()
        if type(of: window) != keyable { object_setClass(window, keyable) }
        window.makeKeyAndOrderFront(nil)
    }

    private func configureWindow() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            for window in NSApp.windows {
                // No buttons to hide any more, dropping .titled below takes the whole
                // titlebar with them. Dragging survives on the window background.
                window.isMovableByWindowBackground = true
                window.titlebarAppearsTransparent = true
                window.titleVisibility = .hidden
                window.backgroundColor = .clear
                window.isOpaque = false
                window.hasShadow = true
                // The pale strip above the search field was _NSTitlebarDecorationView
                // inside NSTitlebarContainerView. Transparency, hidden buttons and
                // hiding those views individually all failed, SwiftUI rebuilds them on
                // layout. Dropping .titled deletes the container outright, and the
                // window shrinks by exactly the 32pt the strip occupied.
                // ponytail: borderless means canBecomeKey == false; makeKeyable() below overrides that
                // so a summon lands with a caret. Dragging is the WindowDrag gesture in SearchView.
                window.styleMask = [.resizable, .fullSizeContentView]
                if window.title == "Nimble" { makeKeyable(window) }  // not the system remote-view windows in NSApp.windows
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

