import Foundation

struct PreferencesData: Codable {
    var theme: String = "yellow"  // brand yellow, same ink as tokens.css --yellow
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
    /// Answer to the AI data-sharing prompt; nil means "not asked yet".
    var aiConsent: Bool? = nil
    /// "nim" (default) or "fen"; "flit" from before 6.21.0 reads as "nim". Optional so prefs files written before this field still decode;
    /// a non-optional field would throw on old files and load() would drop every other setting.
    var mascot: String? = nil
    /// Private mode: nothing leaves the device. Optional for the same reason as `mascot`.
    var privateMode: Bool? = nil
    /// Share card shape on the Mac: "wide" (default), "square" or "story". Optional for the same reason as `mascot`.
    var cardShape: String? = nil
}

final class Preferences {
    private let path: String

    init(path: String = NimbleStorage.preferencesPath()) {
        self.path = path
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

    @discardableResult
    func save(_ prefs: PreferencesData) -> Bool {
        do {
            let data = try JSONEncoder().encode(prefs)
            let json = try JSONSerialization.jsonObject(with: data)
            let pretty = try JSONSerialization.data(withJSONObject: json, options: .prettyPrinted)
            // A fresh install has no folder yet; without this the first save fails and nothing persists.
            let file = URL(fileURLWithPath: path)
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            try pretty.write(to: file, options: .atomic)
            return true
        } catch {
            return false
        }
    }
}

extension Bundle {
    var marketingVersion: String {
        infoDictionary?["CFBundleShortVersionString"] as? String ?? "0"
    }
}
