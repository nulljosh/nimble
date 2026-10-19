import Foundation
import Security

/// The user's own AI key (Claude, OpenAI) lives in the Keychain, not in the prefs file: on the Mac that file is
/// ~/.nimble-options.json, readable by anything running as the user. Off in QA launches and tests, so they never
/// touch the real Keychain; there the key stays in the (sandboxed) prefs file as before.
enum KeyStore {
    static let enabled = !QASandbox.launch && NSClassFromString("XCTestCase") == nil

    private static var item: [String: Any] { [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "com.nulljosh.nimble",
        kSecAttrAccount as String: "ai.apiKey",
    ] }

    /// Fills in the key from the Keychain. A key an older build saved in the prefs file moves there first: true then.
    static func load(into ai: inout AIConfig) -> Bool {
        guard enabled else { return false }
        let moved = !ai.apiKey.isEmpty
        if moved { write(ai.apiKey) }
        ai.apiKey = read()
        return moved
    }

    /// The config as the prefs file keeps it: the key goes to the Keychain, the file gets none.
    static func forFile(_ ai: AIConfig) -> AIConfig {
        guard enabled else { return ai }
        write(ai.apiKey)
        var copy = ai
        copy.apiKey = ""
        return copy
    }

    static func read() -> String {
        var query = item
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return "" }
        return String(decoding: data, as: UTF8.self)
    }

    /// Replaces the stored key; an empty key removes it.
    static func write(_ key: String) {
        guard key != read() else { return }
        SecItemDelete(item as CFDictionary)
        guard !key.isEmpty else { return }
        var add = item
        add[kSecValueData as String] = Data(key.utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(add as CFDictionary, nil)
    }
}
