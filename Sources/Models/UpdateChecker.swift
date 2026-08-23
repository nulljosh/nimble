#if os(macOS)
import Foundation
import AppKit

/// Update checks for the Mac build, which ships from GitHub Releases rather than the
/// App Store and therefore has to look for its own updates.
///
/// Deliberately check-and-notify, not self-replacing: swapping a running .app bundle
/// safely needs a helper process and a signed appcast (Sparkle's job). See roadmap.md.
@MainActor
@Observable
final class UpdateChecker {
    enum Status: Equatable {
        case idle
        case checking
        case upToDate
        case available(version: String, page: URL, download: URL?)
        case failed(String)
    }

    /// How long an automatic check waits before looking again.
    static let automaticInterval: TimeInterval = 60 * 60 * 24

    private(set) var status: Status = .idle

    /// Version of the running bundle, e.g. "1.0.0".
    let currentVersion: String

    private let endpoint: URL
    private let session: URLSession

    init(
        currentVersion: String = Bundle.main.marketingVersion,
        endpoint: URL = URL(string: "https://api.github.com/repos/nulljosh/nimble/releases/latest")!,
        session: URLSession = .shared
    ) {
        self.currentVersion = currentVersion
        self.endpoint = endpoint
        self.session = session
    }

    /// The newer version if one was found, otherwise nil. Drives the badge in the UI.
    var availableVersion: String? {
        if case let .available(version, _, _) = status { return version }
        return nil
    }

    var isChecking: Bool { status == .checking }

    /// Human-readable one-liner for the settings pane and the menu.
    var statusText: String {
        switch status {
        case .idle: return "Nimble \(currentVersion)"
        case .checking: return "Checking…"
        case .upToDate: return "Up to date (\(currentVersion))"
        case let .available(version, _, _): return "Version \(version) is available"
        case let .failed(message): return message
        }
    }

    func check() async {
        guard status != .checking else { return }
        status = .checking

        do {
            var request = URLRequest(url: endpoint)
            // GitHub rejects API requests without a User-Agent, and pins the schema by Accept.
            request.setValue("Nimble/\(currentVersion)", forHTTPHeaderField: "User-Agent")
            request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
            request.timeoutInterval = 15

            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                status = .failed("Could not reach GitHub")
                return
            }

            let release = try JSONDecoder().decode(Release.self, from: data)
            guard !release.draft, !release.prerelease else {
                status = .upToDate
                return
            }

            let latest = Self.normalize(release.tagName)
            guard Self.version(latest, isNewerThan: currentVersion),
                  let page = URL(string: release.htmlURL) else {
                status = .upToDate
                return
            }

            status = .available(version: latest, page: page, download: release.macDownloadURL)
        } catch {
            status = .failed("Could not check for updates")
        }
    }

    /// Runs a check only if one has not run within `automaticInterval`.
    /// Returns the timestamp to persist, or nil when the check was skipped.
    func checkIfDue(lastCheck: TimeInterval, now: Date = Date()) async -> TimeInterval? {
        guard now.timeIntervalSince1970 - lastCheck >= Self.automaticInterval else { return nil }
        await check()
        return now.timeIntervalSince1970
    }

    /// Opens the downloadable asset when the release has one, else the release page.
    func openUpdate() {
        guard case let .available(_, page, download) = status else { return }
        NSWorkspace.shared.open(download ?? page)
    }

    // MARK: - Version comparison

    /// Strips a leading "v" and any surrounding whitespace from a release tag.
    static func normalize(_ tag: String) -> String {
        var trimmed = tag.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.first == "v" || trimmed.first == "V" { trimmed.removeFirst() }
        return trimmed
    }

    /// Numeric, component-wise comparison so "1.10.0" beats "1.9.0" — a plain string
    /// compare gets that backwards.
    static func version(_ lhs: String, isNewerThan rhs: String) -> Bool {
        let left = components(lhs), right = components(rhs)
        for index in 0..<max(left.count, right.count) {
            let l = index < left.count ? left[index] : 0
            let r = index < right.count ? right[index] : 0
            if l != r { return l > r }
        }
        return false
    }

    private static func components(_ version: String) -> [Int] {
        normalize(version)
            .split(separator: ".")
            .map { Int($0.prefix(while: \.isNumber)) ?? 0 }
    }

    // MARK: - GitHub payload

    private struct Release: Decodable {
        let tagName: String
        let htmlURL: String
        let draft: Bool
        let prerelease: Bool
        let assets: [Asset]

        struct Asset: Decodable {
            let name: String
            let browserDownloadURL: String

            enum CodingKeys: String, CodingKey {
                case name
                case browserDownloadURL = "browser_download_url"
            }
        }

        enum CodingKeys: String, CodingKey {
            case tagName = "tag_name"
            case htmlURL = "html_url"
            case draft, prerelease, assets
        }

        /// The Mac artifact, if the release carries one — .dmg preferred over .zip.
        var macDownloadURL: URL? {
            let mac = assets.filter { $0.name.hasSuffix(".dmg") || $0.name.hasSuffix(".zip") }
            let preferred = mac.first { $0.name.hasSuffix(".dmg") } ?? mac.first
            return preferred.flatMap { URL(string: $0.browserDownloadURL) }
        }
    }
}

extension Bundle {
    /// CFBundleShortVersionString, falling back to the version the project ships at.
    var marketingVersion: String {
        infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
    }
}
#endif
