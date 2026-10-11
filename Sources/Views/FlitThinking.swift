import SwiftUI

/// The chosen mascot (Flit or Fen) in the answer card while an answer loads. The asset is one flat
/// PNG, so Flit's wing beat is a quick rock of the whole bird and the bob is a slow lift. Fen has no
/// wings, so she only bobs. Reduce Motion leaves them still.
struct FlitThinking: View {
    @Environment(AppState.self) private var state
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isLoading = false

    private var size: CGFloat {
        #if os(iOS)
        56
        #else
        40
        #endif
    }

    var body: some View {
        HStack(spacing: 16) {
            Image(state.mascotAsset)
                .resizable()
                .scaledToFit()
                .frame(width: size, height: size)
                .rotationEffect(.degrees(reduceMotion || state.mascot == "fen" ? 0 : (isLoading ? 6 : -6)), anchor: UnitPoint(x: 0.3, y: 0.5))
                .animation(reduceMotion ? nil : .easeInOut(duration: 0.11).repeatForever(autoreverses: true), value: isLoading)
                .offset(y: reduceMotion ? 0 : (isLoading ? -5 : 0))
                .animation(reduceMotion ? nil : .easeInOut(duration: 0.6).repeatForever(autoreverses: true), value: isLoading)
                .accessibilityHidden(true)

            Text("Thinking…")
                .nimbleFont(19)
                .foregroundStyle(Color.text)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Thinking")
        .onAppear {
            // Starts on the next pass so the card's insert transaction does not swallow the first flip.
            guard !reduceMotion else { return }
            DispatchQueue.main.async { isLoading = true }
        }
    }
}
