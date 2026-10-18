import SwiftUI

/// The chosen mascot in the answer card while an answer loads: Nim in her thinking pose (eyes up, an unlit
/// bulb overhead) or Fen. Both bob slowly; Reduce Motion leaves them still.
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
            Image(state.mascot == "fen" ? "Fen" : "NimThink")
                .resizable()
                .scaledToFit()
                .frame(width: size, height: size)
                .offset(y: reduceMotion ? 0 : (isLoading ? -5 : 0))
                .animation(reduceMotion ? nil : .easeInOut(duration: 0.6).repeatForever(autoreverses: true), value: isLoading)
                .accessibilityHidden(true)

            Text("Thinking…")
                .font(.nimbleLead)
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
