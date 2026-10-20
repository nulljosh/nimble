import XCTest
@testable import Nimble

/// The web's offline exam (test/exam-offline.js) on the Apple engine: the same 154 questions from test/exam.js, no
/// network, the real offline pack. Tests/Fixtures/exam.js and the pack are symlinks into test/ and docs/pack/, so the
/// exam always reads the current files. A measurement, not a gate: it prints the score and every wrong pack answer.
/// Runs only with TEST_RUNNER_NIMBLE_EXAM=1 on the xcodebuild line, since it reads the 3 MB pack.
final class OfflineExamTests: XCTestCase {
    func testOfflineExam() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["NIMBLE_EXAM"] == "1", "Set TEST_RUNNER_NIMBLE_EXAM=1")
        let bundle = Bundle(for: Self.self)
        let src = try String(contentsOf: XCTUnwrap(bundle.url(forResource: "exam", withExtension: "js")), encoding: .utf8)
        let gz = try Data(contentsOf: XCTUnwrap(bundle.url(forResource: "wikipedia-top-v1.json", withExtension: "gz")))
        let pack = OfflinePack(file: try JSONDecoder().decode(OfflinePack.File.self, from: XCTUnwrap(OfflinePack.gunzip(gz))))

        // Each question is ["text",/regex/flags] in test/exam.js; JS and ICU regexes agree on everything the exam uses.
        let re = try NSRegularExpression(pattern: #"\["((?:[^"\\]|\\.)*)",/((?:[^/\\\n]|\\.)+)/([a-z]*)\]"#)
        let questions = re.matches(in: src, range: NSRange(src.startIndex..., in: src)).compactMap { m -> (String, NSRegularExpression)? in
            let g = (1...3).map { Range(m.range(at: $0), in: src).map { String(src[$0]) } ?? "" }
            guard let grade = try? NSRegularExpression(pattern: g[1], options: g[2].contains("i") ? .caseInsensitive : []) else { return nil }
            return (g[0].replacingOccurrences(of: "\\\"", with: "\""), grade)
        }
        XCTAssertGreaterThan(questions.count, 100)

        let engine = QueryEngine()
        var pass = 0
        var wrong: [String] = [], missed: [String] = []
        for (question, grade) in questions {
            let local = engine.localAnswer(question)
            let hit = local == nil ? pack.answer(question) : nil
            let shown: String
            switch local {
            case .math(let v, _): shown = v
            case .convert(_, let to, _, let toUnit): shown = "\(to) \(toUnit)"
            case .card(let big, let unit, let sub, _, _, _): shown = "\(big) \(unit) \(sub)"
            case .text(let heading, let body, _, _, _, _, _, _, _): shown = [heading, body].compactMap { $0 }.joined(separator: " ")
            default: shown = hit.map { "\($0.title) \($0.text)" } ?? ""
            }
            if grade.firstMatch(in: shown, range: NSRange(shown.startIndex..., in: shown)) != nil { pass += 1 }
            else if hit != nil { wrong.append("\(question) => \(shown.prefix(70))") }
            else { missed.append("\(question) (\(shown.prefix(40)))") }
        }
        print("offline exam: \(pass)/\(questions.count) pass (Apple, pack: \(pack.entries.count) entries)")
        print("pack answered wrong: \(wrong.count)\n" + wrong.joined(separator: "\n"))
        print("missed:\n" + missed.joined(separator: "\n"))
    }
}
