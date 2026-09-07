import XCTest
@testable import Nimble

final class PreferencesTests: XCTestCase {
    func testDefaultPreferences() {
        let defaults = PreferencesData()
        XCTAssertEqual(defaults.theme, "orange")
        XCTAssertTrue(defaults.mathEnabled)
        XCTAssertFalse(defaults.launchOnStartup)
        XCTAssertFalse(defaults.centerWindow)
        XCTAssertTrue(defaults.defaultSuggestions)
    }

    func testPreferencesEncoding() throws {
        let prefs = PreferencesData(
            theme: "blue",
            mathEnabled: false,
            launchOnStartup: true,
            centerWindow: true,
            defaultSuggestions: false
        )
        let data = try JSONEncoder().encode(prefs)
        let decoded = try JSONDecoder().decode(PreferencesData.self, from: data)
        XCTAssertEqual(decoded.theme, "blue")
        XCTAssertFalse(decoded.mathEnabled)
        XCTAssertTrue(decoded.launchOnStartup)
        XCTAssertTrue(decoded.centerWindow)
        XCTAssertFalse(decoded.defaultSuggestions)
    }

    func testOldPrefsFileWithoutAIDecodes() throws {
        let data = Data(#"{"theme":"blue","mathEnabled":true,"launchOnStartup":false,"centerWindow":false,"defaultSuggestions":true,"automaticUpdates":true,"lastUpdateCheck":0}"#.utf8)
        let decoded = try JSONDecoder().decode(PreferencesData.self, from: data)
        XCTAssertNil(decoded.ai)
    }

    func testAIConfigRequests() throws {
        XCTAssertNil(AIConfig(engine: .claude).request(for: "hi"), "no key = no request, caller falls back")
        let claude = try XCTUnwrap(AIConfig(engine: .claude, apiKey: "k").request(for: "hi"))
        XCTAssertEqual(claude.url?.absoluteString, "https://api.anthropic.com/v1/messages")
        XCTAssertEqual(claude.value(forHTTPHeaderField: "x-api-key"), "k")
        let ollama = try XCTUnwrap(AIConfig(engine: .ollama, baseURL: "http://box:11434").request(for: "hi"))
        XCTAssertEqual(ollama.url?.absoluteString, "http://box:11434/v1/chat/completions")
        XCTAssertNotNil(AIConfig().request(for: "hi"))
    }

    func testAIConfigParse() {
        let claude = AIConfig(engine: .claude, apiKey: "k")
        XCTAssertEqual(claude.parse(Data(#"{"content":[{"type":"text","text":" Paris. "}]}"#.utf8))?.0, "Paris.")
        XCTAssertNil(claude.parse(Data(#"{"content":[{"type":"text","text":"UNKNOWN"}]}"#.utf8)))
        let openai = AIConfig(engine: .openai, apiKey: "k")
        XCTAssertEqual(openai.parse(Data(#"{"choices":[{"message":{"content":"Paris."}}]}"#.utf8))?.1, "gpt-5")
        XCTAssertEqual(AIConfig().parse(Data(#"{"answer":"Paris.","source":"Gemma"}"#.utf8))?.1, "Gemma")
    }

    func testThemeAllCases() {
        XCTAssertEqual(NimbleTheme.allCases.count, 8)
        for theme in NimbleTheme.allCases {
            XCTAssertFalse(theme.displayName.isEmpty)
        }
    }

    func testThemeColors() {
        for theme in NimbleTheme.allCases {
            // Just verify these don't crash
            _ = theme.color
            _ = theme.backgroundColor
            _ = theme.textColor
            _ = theme.inputTextColor
        }
    }

    func testQueryResultEquatable() {
        XCTAssertEqual(QueryResult.none, QueryResult.none)
        XCTAssertEqual(QueryResult.loading, QueryResult.loading)
        XCTAssertEqual(QueryResult.math("42"), QueryResult.math("42"))
        XCTAssertNotEqual(QueryResult.math("42"), QueryResult.math("43"))
        XCTAssertNotEqual(QueryResult.none, QueryResult.loading)
    }
}
