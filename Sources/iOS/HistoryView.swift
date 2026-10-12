import SwiftUI

/// Every question asked on this iPhone, newest first, with its saved answer underneath.
/// Tap a row to ask it again. Edit turns on multi-select: Delete and Share act on the selection.
struct HistoryView: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    @State private var editMode: EditMode = .inactive
    @State private var selection = Set<String>()

    private var entries: [SearchHistory.Entry] { state.history.entries }
    private var editing: Bool { editMode.isEditing }

    var body: some View {
        Group {
            if entries.isEmpty {
                Text("No questions yet.")
                    .font(.nimbleBody)
                    .foregroundStyle(Color.dim)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(selection: $selection) {
                    ForEach(entries, id: \.q) { entry in
                        row(entry)
                            .listRowBackground(Color.bg)
                    }
                    .onDelete { offsets in
                        state.history.remove(Set(offsets.map { entries[$0].q }))
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .listRowSeparatorTint(Color.hairline)
                .environment(\.editMode, $editMode)
            }
        }
        .background(Color.bg.ignoresSafeArea())
        .navigationTitle("History")
        .navigationBarTitleDisplayMode(.inline)
        // Editing owns the bottom edge for Select All, Share and Delete, so the tab bar steps away.
        .toolbar(editing ? .hidden : .visible, for: .tabBar)
        .toolbarBackground(Color.bg, for: .navigationBar, .bottomBar)
        .toolbarBackground(.visible, for: .navigationBar, .bottomBar)
        .toolbar {
            if !entries.isEmpty {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(editing ? "Done" : "Edit") { toggleEditing() }
                        .font(.nimbleCalloutMedium)
                        .minimumTapTarget()
                        .accessibilityLabel(editing ? "Done" : "Edit")
                }
            }
            if editing {
                ToolbarItemGroup(placement: .bottomBar) {
                    Button("Select All") { selection = Set(entries.map(\.q)) }
                        .font(.nimbleCalloutMedium)
                    Spacer()
                    ShareLink(item: shareText) {
                        Label("Share", systemImage: "square.and.arrow.up")
                            .font(.nimbleCalloutMedium)
                    }
                    .disabled(selection.isEmpty)
                    Button(role: .destructive) {
                        deleteSelected()
                    } label: {
                        Label("Delete", systemImage: "trash")
                            .font(.nimbleCalloutMedium)
                    }
                    .disabled(selection.isEmpty)
                }
            }
        }
    }

    @ViewBuilder
    private func row(_ entry: SearchHistory.Entry) -> some View {
        let content = VStack(alignment: .leading, spacing: 6) {
            Text(entry.q)
                .font(.nimbleBody)
                .foregroundStyle(Color.text)
            if let answer = entry.a {
                Text(answer)
                    .font(.nimbleCallout)
                    .foregroundStyle(Color.dim)
                    .lineLimit(2)
            }
            Text(entry.t, format: .relative(presentation: .named, unitsStyle: .abbreviated))
                .font(.nimbleSmall)
                .foregroundStyle(Color.dim)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 8)
        .contentShape(Rectangle())

        Group {
            if editing {
                // In edit mode the row itself is the selection target, so it is not a button.
                content
            } else {
                Button { ask(entry.q) } label: { content }
                    .buttonStyle(.plain)
                    .accessibilityHint(String(localized: "Asks this again"))
            }
        }
        .tag(entry.q)
    }

    /// Plain text of the selected rows, newest first: question, then answer, blocks separated by a blank line.
    private var shareText: String {
        entries
            .filter { selection.contains($0.q) }
            .map { [$0.q, $0.a].compactMap { $0 }.joined(separator: "\n") }
            .joined(separator: "\n\n")
    }

    private func ask(_ question: String) {
        state.queryText = question
        state.performQuery()
        dismiss()
    }

    private func deleteSelected() {
        state.history.remove(selection)
        selection.removeAll()
    }

    private func toggleEditing() {
        withAnimation {
            if editing {
                editMode = .inactive
                selection.removeAll()
            } else {
                editMode = .active
            }
        }
    }
}
