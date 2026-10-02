#if canImport(Speech)
import SwiftUI

/// The mic at the trailing edge of the field. Hidden once permission is denied.
struct MicButton: View {
    @Environment(AppState.self) private var state
    var size: CGFloat = 16

    var body: some View {
        let voice = state.voice
        if voice.offered {
            Button(action: { voice.toggle() }) {
                Image(systemName: "mic")
                    .font(.system(size: size, weight: .regular))
                    .foregroundStyle(voice.listening ? state.theme.color : Color.secondary)
                    .frame(width: 24, height: 24)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(voice.listening ? "Stop listening" : "Ask by voice")
            .help(voice.listening ? "Stop listening" : "Ask by voice")
            .onDisappear { voice.cancel() }
        }
    }
}
#endif
