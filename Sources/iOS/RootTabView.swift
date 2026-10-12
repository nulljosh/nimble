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

    var body: some View {
        TabView {
            SearchView()
                .tabItem { Label("Ask", systemImage: "magnifyingglass") }

            NavigationStack {
                HistoryView()
            }
            .tabItem { Label("History", systemImage: "clock.arrow.circlepath") }

            NavigationStack {
                PreferencesView()
            }
            .tabItem { Label("Settings", systemImage: "gearshape") }
        }
        .environment(state)
        .tint(state.theme.ink)
        .preferredColorScheme(state.theme.colorScheme)
    }
}
