import Foundation

struct PreferencesData: Codable {
    var theme: String = "orange"
    var mathEnabled: Bool = true
    var launchOnStartup: Bool = false
    var centerWindow: Bool = false
    var defaultSuggestions: Bool = true
    var automaticUpdates: Bool = true
    /// Unix time of the last successful update check; 0 means "never checked".
    var lastUpdateCheck: Double = 0
    /// Which model answers questions and, for paid engines, the user's own key.
    /// Optional so prefs files written before this field still decode.
    var ai: AIConfig? = nil
}

final class Preferences {
    private let path: String

    init() {
        path = NSHomeDirectory() + "/.nimble-options.json"
    }

    func load() -> PreferencesData {
        guard let data = FileManager.default.contents(atPath: path) else {
            return PreferencesData()
        }
        do {
            return try JSONDecoder().decode(PreferencesData.self, from: data)
        } catch {
            return PreferencesData()
        }
    }

    func save(_ prefs: PreferencesData) {
        do {
            let data = try JSONEncoder().encode(prefs)
            let json = try JSONSerialization.jsonObject(with: data)
            let pretty = try JSONSerialization.data(withJSONObject: json, options: .prettyPrinted)
            try pretty.write(to: URL(fileURLWithPath: path))
        } catch {
            // Silent fail
        }
    }
}

extension Bundle {
    var marketingVersion: String {
        infoDictionary?["CFBundleShortVersionString"] as? String ?? "0"
    }
}
