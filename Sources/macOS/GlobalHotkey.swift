import AppKit
import Carbon.HIToolbox

/// Registers a system-wide chord to summon Nimble.
///
/// Carbon's `RegisterEventHotKey` is the only global-hotkey API that needs neither an
/// Accessibility permission prompt (`NSEvent.addGlobalMonitorForEvents` does) nor a
/// third-party package. SwiftUI's `.keyboardShortcut` only fires when Nimble is already
/// frontmost, which is useless for summoning it.
///
/// ponytail: the chord is hardcoded to ⌥Space. Make it configurable in Preferences only
/// if it needs to be — every other Nimble setting predates a reason to.
@MainActor
enum GlobalHotkey {
    private static var ref: EventHotKeyRef?
    private static var handler: (() -> Void)?

    static func register(_ action: @escaping @MainActor () -> Void) {
        guard ref == nil else { return }
        handler = action

        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard),
                                 eventKind: UInt32(kEventHotKeyPressed))
        // The C callback cannot capture, so the action lives in `handler`.
        // Carbon delivers hot-key events on the main run loop, so the isolation
        // assumption below holds; the callback is nonisolated only because it is C.
        InstallEventHandler(GetApplicationEventTarget(), { _, _, _ in
            MainActor.assumeIsolated { GlobalHotkey.handler?() }
            return noErr
        }, 1, &spec, nil, nil)

        let id = EventHotKeyID(signature: OSType(0x4E4D424C), id: 1) // 'NMBL'
        RegisterEventHotKey(UInt32(kVK_Space), UInt32(optionKey), id,
                            GetApplicationEventTarget(), 0, &ref)
    }

    /// One chord, both directions: summon it, or dismiss it if it is already frontmost.
    static func toggleNimble(open: () -> Void) {
        if NSApp.isActive {
            NSApp.hide(nil)
        } else {
            open()
            NSApp.activate(ignoringOtherApps: true)
        }
    }
}
