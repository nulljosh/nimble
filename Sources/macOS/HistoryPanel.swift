import SwiftUI
import AppKit

/// Every question asked on this Mac, newest first, with its saved answer and time. It takes the
/// place of the answer in the search window (the window is borderless, so there is no sheet to hang it on).
/// Click asks the question again. Cmd-click or Edit selects rows; Delete removes the selection;
/// Copy and Share act on it. Escape goes back to the search.
struct HistoryPanel: View {
    @Environment(AppState.self) private var state
    /// Back to the search, from Back, Escape and after a row is asked again.
    let onClose: () -> Void
    @State private var editing = false
    @State private var selection = Set<String>()
    @FocusState private var focused: Bool
    /// Delete and Escape are read from the window, not from focus: a focused row or the field would otherwise swallow them.
    @State private var keys: Any?

    private var entries: [SearchHistory.Entry] { state.history.entries }
    /// Circles show while editing, and stay up once anything is selected (Cmd-click works without Edit).
    private var selecting: Bool { editing || !selection.isEmpty }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Button("Back", action: onClose)
                    .buttonStyle(.plain)
                    .font(.nimbleSubhead)
                    .foregroundStyle(Color.soft)
                Spacer()
                Text("History")
                    .font(.nimbleSubheadBold)
                    .foregroundStyle(Color.text)
                Spacer()
                Button(editing ? "Done" : "Edit") { toggleEditing() }
                    .buttonStyle(.plain)
                    .font(.nimbleSubhead)
                    .foregroundStyle(Color.soft)
                    .disabled(entries.isEmpty)
            }
            .padding(.bottom, 10)

            if entries.isEmpty {
                Text("No questions yet.")
                    .font(.nimbleSubhead)
                    .foregroundStyle(Color.dim)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 24)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(entries, id: \.q) { entry in
                            Rectangle().fill(Color.hairline).frame(height: 1).accessibilityHidden(true)
                            row(entry)
                        }
                        Rectangle().fill(Color.hairline).frame(height: 1).accessibilityHidden(true)
                    }
                }
                .frame(maxHeight: 340)
            }

            if editing && !entries.isEmpty {
                HStack(spacing: 14) {
                    Button("Select all") { selection = Set(entries.map(\.q)) }
                        .buttonStyle(.plain)
                    Spacer()
                    Button("Copy selected") { copySelected() }
                        .buttonStyle(.plain)
                        .disabled(selection.isEmpty)
                    ShareLink(item: state.history.copyText(for: selection)) {
                        Text("Share selected")
                    }
                    .buttonStyle(.plain)
                    .disabled(selection.isEmpty)
                    Button("Delete selected", role: .destructive) { deleteSelected() }
                        .buttonStyle(.plain)
                        .disabled(selection.isEmpty)
                }
                .font(.nimbleSmall)
                .foregroundStyle(Color.soft)
                .padding(.top, 12)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 14)
        .focusable()
        .focused($focused)
        .onAppear {
            focused = true
            keys = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in handleKey(event) }
        }
        .onDisappear {
            if let keys { NSEvent.removeMonitor(keys) }
            keys = nil
        }
    }

    /// Escape goes back to the search. Delete (backspace or forward delete) removes the selection, unless the caret
    /// is in the search field, where it edits the text as usual.
    private func handleKey(_ event: NSEvent) -> NSEvent? {
        let typing = NSApp.keyWindow?.firstResponder is NSTextView
        switch event.keyCode {
        case 53:
            onClose()
            return nil
        case 51, 117:
            guard !typing, !selection.isEmpty else { return event }
            deleteSelected()
            return nil
        default:
            return event
        }
    }

    @ViewBuilder
    private func row(_ entry: SearchHistory.Entry) -> some View {
        let picked = selection.contains(entry.q)
        Button { tap(entry.q) } label: {
            HStack(alignment: .top, spacing: 10) {
                if selecting {
                    Image(systemName: picked ? "checkmark.circle.fill" : "circle")
                        .font(.nimbleHeadline)
                        .foregroundStyle(picked ? Color.bulbDeep : Color.dim)
                        .accessibilityHidden(true)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text(entry.q)
                        .font(.nimbleSubhead)
                        .foregroundStyle(Color.text)
                        .fixedSize(horizontal: false, vertical: true)
                    if let answer = entry.a {
                        Text(answer)
                            .font(.nimbleCaption)
                            .foregroundStyle(Color.soft)
                            .lineLimit(2)
                    }
                    Text(entry.t, format: .relative(presentation: .named, unitsStyle: .abbreviated))
                        .font(.nimbleCaption)
                        .foregroundStyle(Color.dim)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(picked ? .isSelected : [])
        .accessibilityHint(String(localized: "Asks this again"))
    }

    /// Edit mode and Cmd-click select; a plain click asks the question again.
    private func tap(_ question: String) {
        if editing || NSEvent.modifierFlags.contains(.command) {
            if selection.contains(question) { selection.remove(question) } else { selection.insert(question) }
            return
        }
        state.queryText = question
        state.performQuery()
        onClose()
    }

    private func copySelected() {
        let text = state.history.copyText(for: selection)
        guard !text.isEmpty else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
    }

    private func deleteSelected() {
        guard !selection.isEmpty else { return }
        state.history.remove(selection)
        selection.removeAll()
        if entries.isEmpty { editing = false }
    }

    private func toggleEditing() {
        editing.toggle()
        if !editing { selection.removeAll() }
    }
}
