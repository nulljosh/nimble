#if canImport(Speech)
import SwiftUI

/// The mic at the trailing edge of the field. Hidden once permission is denied.
struct MicButton: View {
    @Environment(AppState.self) private var state
    var size: CGFloat = 16

    /// A ternary of two literals is a plain String, which the catalog never sees.
    private func micLabel(_ listening: Bool) -> String {
        listening ? String(localized: "Stop listening") : String(localized: "Ask by voice")
    }

    var body: some View {
        let voice = state.voice
        if voice.offered {
            Button(action: { voice.toggle() }) {
                Image(systemName: "mic")
                    .font(.nimble(size, .regular, relativeTo: .body))
                    .foregroundStyle(voice.listening ? state.theme.ink : Color.dim)
                    .frame(minWidth: 24, minHeight: 24)
                    .minimumTapTarget()
            }
            .buttonStyle(.plain)
            // The label stays fixed and the value carries the state, so VoiceOver reads "Ask by voice, Listening".
            .accessibilityLabel(String(localized: "Ask by voice"))
            .accessibilityValue(voice.listening ? String(localized: "Listening") : "")
            .help(micLabel(voice.listening))
            .onDisappear { voice.cancel() }
        }
    }
}
#endif
