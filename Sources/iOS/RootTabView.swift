import SwiftUI
import UIKit

/// The iPhone shell: Ask, History and Settings in the system tab bar.
struct RootTabView: View {
    @Environment(AppState.self) private var state

    init() {
        // Tab labels in the Nimble face at the web's small size. The bar itself stays cream, like the screens.
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
        .tint(state.theme.ink)
        .preferredColorScheme(state.theme.colorScheme)
        .onAppear {
            guard QASandbox.launch, UserDefaults.standard.bool(forKey: "shotHistory") else { return }
            for stub in QASandbox.historyStubs.reversed() { state.history.add(stub.q, answer: stub.a) }
        }
    }
}
