import SwiftUI

struct ThemePickerView: View {
    @Environment(AppState.self) private var state
    @State private var showPopover = false

    var body: some View {
        Button(action: { showPopover.toggle() }) {
            Circle()
                .fill(state.theme.color)
                .frame(width: 22, height: 22)
                .overlay(Circle().stroke(Color.primary.opacity(0.3), lineWidth: 2))
        }
        .buttonStyle(.plain)
        .scaleEffect(showPopover ? 1.1 : 1.0)
        .animation(.spring(duration: 0.2, bounce: 0.4), value: showPopover)
        .popover(isPresented: $showPopover, arrowEdge: .bottom) {
            LazyVGrid(columns: Array(repeating: GridItem(.fixed(26)), count: 4), spacing: 8) {
                ForEach(NimbleTheme.allCases, id: \.self) { t in
                    Button(action: {
                        state.theme = t
                        state.savePreferences()
                        showPopover = false
                    }) {
                        Circle()
                            .fill(t.color)
                            .frame(width: 22, height: 22)
                            .overlay(Circle().stroke(state.theme == t ? Color.primary : Color.clear, lineWidth: 2))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(10)
        }
    }
}
