import SwiftUI
#if os(macOS)
import ServiceManagement
#else
import UIKit
#endif

enum NimbleTheme: String, CaseIterable, Codable {
    case orange, red, yellow, green, blue, purple, pink, contrast

    var color: Color {
        switch self {
        case .orange: Color(red: 1.0, green: 0.55, blue: 0.07)
        case .red: Color(red: 0.86, green: 0, blue: 0)
        case .yellow: Color(red: 1.0, green: 0.79, blue: 0.19)
        case .green: Color(red: 0.46, green: 0.75, blue: 0.13)
        case .blue: Color(red: 0.16, green: 0.49, blue: 0.91)
        case .purple: Color(red: 0.38, green: 0.02, blue: 0.69)
        case .pink: Color(red: 0.82, green: 0.02, blue: 0.63)
        case .contrast: Color.white
        }
    }

    var backgroundColor: Color {
        self == .contrast ? .black : .white
    }

    var textColor: Color {
        self == .contrast ? .white : .primary
    }

    var inputTextColor: Color {
        .white
    }

    /// Drives SwiftUI's semantic colors (`.primary`/`.secondary`) so views can stop
    /// hardcoding white and still read correctly on each theme's own background.
    var colorScheme: ColorScheme {
        self == .contrast ? .dark : .light
    }

    var displayName: String {
        rawValue.capitalized
    }
}

enum QueryResult: Equatable {
    case none
    case loading
    case math(String)
    case text(heading: String?, body: String, source: String, sourceURL: String?, imageURL: String?)
    case list(items: [String], source: String)
    case error(String, searchURL: String?)
    case color(String)
    case convert(from: String, to: String, fromUnit: String, toUnit: String)
    case graph(expr: String, points: [CGPoint])

    static func == (lhs: QueryResult, rhs: QueryResult) -> Bool {
        switch (lhs, rhs) {
        case (.none, .none), (.loading, .loading): return true
        case let (.math(a), .math(b)): return a == b
        case let (.error(a, _), .error(b, _)): return a == b
        case let (.color(a), .color(b)): return a == b
        case let (.convert(a, b, c, d), .convert(e, f, g, h)): return (a, b, c, d) == (e, f, g, h)
        case let (.graph(a, _), .graph(b, _)): return a == b
        default: return false
        }
    }
}

@MainActor
@Observable
final class AppState {
    var theme: NimbleTheme = .yellow  // brand yellow #FFCA30, same ink as tokens.css --yellow
    var mathEnabled: Bool = true
    var launchOnStartup: Bool = false
    var centerWindow: Bool = false
    var defaultSuggestions: Bool = true
    /// Only acted on by the Mac build — the iOS app updates through the App Store —
    /// but stored on both so the preferences file has one shape.
    var automaticUpdates: Bool = true
    private var lastUpdateCheck: Double = 0
    #if os(macOS)
    let updates = UpdateChecker()
    #endif

    var queryText: String = ""
    var result: QueryResult = .none
    var currentPlaceholder: String = ""
    var searchURL: String = ""

    private let queryEngine = QueryEngine()
    private let prefs = Preferences()
    private var placeholderTimer: Timer?

    init() {
        loadPreferences()
        rotatePlaceholder()
        startPlaceholderTimer()
    }

    func loadPreferences() {
        let p = prefs.load()
        theme = NimbleTheme(rawValue: p.theme) ?? .yellow
        mathEnabled = p.mathEnabled
        launchOnStartup = p.launchOnStartup
        centerWindow = p.centerWindow
        defaultSuggestions = p.defaultSuggestions
        automaticUpdates = p.automaticUpdates
        lastUpdateCheck = p.lastUpdateCheck
    }

    func savePreferences() {
        let p = PreferencesData(
            theme: theme.rawValue,
            mathEnabled: mathEnabled,
            launchOnStartup: launchOnStartup,
            centerWindow: centerWindow,
            defaultSuggestions: defaultSuggestions,
            automaticUpdates: automaticUpdates,
            lastUpdateCheck: lastUpdateCheck
        )
        prefs.save(p)
        applyLaunchOnStartup()
    }

    #if os(macOS)
    /// Launch-time check: silent, at most once per `UpdateChecker.automaticInterval`,
    /// and only when the user has left automatic checks on.
    func checkForUpdatesIfDue() async {
        guard automaticUpdates else { return }
        if let checkedAt = await updates.checkIfDue(lastCheck: lastUpdateCheck) {
            lastUpdateCheck = checkedAt
            savePreferences()
        }
    }

    /// The "Check for Updates…" button: always runs, and reports even when up to date.
    func checkForUpdatesNow() async {
        await updates.check()
        lastUpdateCheck = Date().timeIntervalSince1970
        savePreferences()
    }
    #endif

    func applyLaunchOnStartup() {
        #if os(macOS)
        if #available(macOS 13.0, *) {
            do {
                if launchOnStartup {
                    try SMAppService.mainApp.register()
                } else {
                    try SMAppService.mainApp.unregister()
                }
            } catch {
                // Silently fail -- sandboxed app may not have permission
            }
        }
        #endif
    }

    func performQuery() {
        let text = queryText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        let encoded = text.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? text
        searchURL = "https://duckduckgo.com/?q=\(encoded)"

        // Units, then math, both offline
        if let converted = queryEngine.convert(text) {
            result = converted
            return
        }
        if mathEnabled {
            if let mathResult = queryEngine.evaluateMath(text) {
                result = .math(mathResult)
                return
            }
        }

        result = .loading
        let engine = queryEngine
        let graphExpr = queryEngine.graphExpression(text)
        Task { @MainActor [weak self] in
            if let graphExpr, let graph = await engine.sampleGraph(graphExpr) {
                self?.result = graph
                return
            }
            self?.result = await engine.query(text)
        }
    }

    func rotatePlaceholder() {
        currentPlaceholder = queryEngine.randomSuggestion(useDefaults: defaultSuggestions)
    }

    func onPopoverOpen() {
        // Called when popover appears -- focus the input
    }

    func copyResultText() {
        let text: String
        switch result {
        case .math(let s): text = s
        case .text(_, let body, _, _, _): text = body
        case .list(let items, _): text = items.joined(separator: "\n")
        case .error(let msg, _): text = msg
        case .color(let hex): text = hex
        case .convert(let from, let to, let fromUnit, let toUnit): text = "\(from) \(fromUnit) = \(to) \(toUnit)"
        case .graph(let expr, _): text = "y = \(expr)"
        default: return
        }
        #if os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        #else
        UIPasteboard.general.string = text
        #endif
    }

    func copySearchLink() {
        #if os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(searchURL, forType: .string)
        #else
        UIPasteboard.general.string = searchURL
        #endif
    }

    func openInDDG() {
        guard let url = URL(string: searchURL) else { return }
        #if os(macOS)
        NSWorkspace.shared.open(url)
        #else
        UIApplication.shared.open(url)
        #endif
    }

    private func startPlaceholderTimer() {
        placeholderTimer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.rotatePlaceholder()
            }
        }
    }
}
