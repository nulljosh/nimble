import SwiftUI
import UIKit

/// The iPhone shell: Ask, History and Settings in the system tab bar.
struct RootTabView: View {
    @Environment(AppState.self) private var state
    @Environment(\.scenePhase) private var scenePhase

    init() {
        // Tab labels in the Nimble face at the web's small size. The bar takes the screens' background.
        let font = UIFont(name: "NimbleSans-Regular", size: 12) ?? .systemFont(ofSize: 12)
        let appearance = UITabBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = UIColor(Color.bg)
        for item in [appearance.stackedLayoutAppearance, appearance.inlineLayoutAppearance, appearance.compactInlineLayoutAppearance] {
            item.normal.titleTextAttributes = [.font: font]
            item.selected.titleTextAttributes = [.font: font]
        }
        UITabBar.appearance().standardAppearance = appearance
        UITabBar.appearance().scrollEdgeAppearance = appearance
    }

    /// QA only: `-shotSettings YES` opens straight on Settings, `-shotHistory YES` on History (stubbed rows).
    @State private var tab = QASandbox.launch ? (UserDefaults.standard.bool(forKey: "shotSettings") ? 2 : UserDefaults.standard.bool(forKey: "shotHistory") ? 1 : 0) : 0

    var body: some View {
        TabView(selection: $tab) {
            SearchView()
                .tabItem { Label("Ask", systemImage: "magnifyingglass") }
                .tag(0)

            NavigationStack {
                HistoryView()
            }
            .tabItem { Label("History", systemImage: "clock.arrow.circlepath") }
            .tag(1)

            NavigationStack {
                PreferencesView()
            }
            .tabItem { Label("Settings", systemImage: "gearshape") }
            .tag(2)
        }
        .environment(state)
        .webOnlyLinks()
        .tint(state.theme.ink)
        .preferredColorScheme(state.theme.colorScheme)
        // A question parked by the "Ask Nimble" intent (Siri, Spotlight, Shortcuts, Action button) runs on the Ask tab.
        // Back in the app: a parked question runs, else a live answer older than ten minutes asks again.
        .onChange(of: scenePhase) { _, phase in if phase == .active { runParkedQuestion(); state.refreshIfStale() } }
        .onAppear {
            runParkedQuestion()
            guard QASandbox.launch, UserDefaults.standard.bool(forKey: "shotHistory") else { return }
            for stub in QASandbox.historyStubs.reversed() { state.history.add(stub.q, answer: stub.a) }
        }
    }

    private func runParkedQuestion() {
        // The intent parks in the app's own defaults; the share extension can only reach the app group.
        let stores = [NimbleStorage.defaults(), NimbleStorage.sharedDefaults()].compactMap { $0 }
        guard let store = stores.first(where: { !($0.string(forKey: AskNimbleIntent.pendingKey) ?? "").isEmpty }),
              let q = store.string(forKey: AskNimbleIntent.pendingKey)?.trimmingCharacters(in: .whitespacesAndNewlines), !q.isEmpty else { return }
        store.removeObject(forKey: AskNimbleIntent.pendingKey)
        tab = 0
        state.queryText = q
        state.performQuery()
    }
}
