import Foundation

/// QA launches (the screenshot hooks) run against a throwaway store, never the real user's data.
/// Any hook flag puts the whole process in sandbox mode: history, preferences, the shared answer
/// and the UserDefaults suite all move to a fresh temp root, and iCloud sync stays off.
enum QASandbox {
    /// Launch flags that mark a QA run. `-qaSandbox YES` is the explicit switch; the hooks imply it.
    static let flags = ["shot", "shotAppearance", "shotWhy", "shotStub", "qaSandbox"]
    static let suiteName = "com.nulljosh.nimble.qa"

    /// True when a QA flag is on the command line. Also true under XCTest: the test host is
    /// Nimble.app, so its AppState would otherwise read and rewrite the real history and prefs.
    /// A normal user launch never sets XCTestConfigurationFilePath, so that part is test-only.
    static func isActive(arguments: [String] = ProcessInfo.processInfo.arguments,
                         environment: [String: String] = ProcessInfo.processInfo.environment) -> Bool {
        if environment["XCTestConfigurationFilePath"] != nil { return true }
        return arguments.contains { arg in flags.contains { arg == "-" + $0 } }
    }

    /// Decided once per process: the launch picks the storage for the whole run.
    static let launch: Bool = isActive()

    /// A fresh directory per launch under the temp dir.
    static let root: URL = {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
            .appendingPathComponent("nimble-qa-\(UUID().uuidString)", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }()

    /// The QA suite, wiped on first use so nothing carries over from an earlier QA run.
    /// The name is never the app's own bundle id, so the init cannot come back nil.
    nonisolated(unsafe) static let defaults: UserDefaults = {
        let suite = UserDefaults(suiteName: suiteName)!
        suite.removePersistentDomain(forName: suiteName)
        return suite
    }()
}

/// Where the app keeps its files: the real locations in a normal launch, the QA root in QA mode.
enum NimbleStorage {
    /// Folder for history.json. Application Support/Nimble normally, the QA root in QA mode.
    static func supportDirectory(qa: Bool = QASandbox.launch) -> URL {
        if qa { return QASandbox.root }
        return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
            .appendingPathComponent("Nimble", isDirectory: true)
            ?? FileManager.default.temporaryDirectory.appendingPathComponent("Nimble", isDirectory: true)
    }

    /// Settings suite: the standard domain normally, the QA suite in QA mode.
    static func defaults(qa: Bool = QASandbox.launch) -> UserDefaults {
        qa ? QASandbox.defaults : .standard
    }

    /// Shared answer suite for the widget: the app group normally, the QA suite in QA mode.
    static func sharedDefaults(qa: Bool = QASandbox.launch) -> UserDefaults? {
        qa ? QASandbox.defaults : UserDefaults(suiteName: SharedAnswer.suiteName)
    }

    /// iCloud key-value mirror for history. Nil in QA mode, so nothing syncs.
    static func cloudStore(qa: Bool = QASandbox.launch) -> NSUbiquitousKeyValueStore? {
        qa ? nil : .default
    }

    /// Preferences file: ~/.nimble-options.json normally, a file in the QA root in QA mode.
    static func preferencesPath(qa: Bool = QASandbox.launch) -> String {
        qa ? QASandbox.root.appendingPathComponent("nimble-options.json").path
           : NSHomeDirectory() + "/.nimble-options.json"
    }
}
