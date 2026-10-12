import XCTest
@testable import Nimble

/// Live exam for Apple's on-device model. Skipped in normal runs: it needs NIMBLE_LIVE=1 and
/// Apple Intelligence turned on. Prints "ondevice exam: N/20" and passes at 18 or more.
final class OnDeviceExamTests: XCTestCase {
    /// Each answer lists the accepted alternatives separated by "|".
    private static let exam: [(question: String, accepts: String)] = [
        ("capital of france", "Paris"),
        ("who wrote hamlet", "Shakespeare"),
        ("chemical symbol for gold", "Au"),
        ("boiling point of water in celsius", "100"),
        ("largest planet", "Jupiter"),
        ("how many continents", "7|seven"),
        ("who painted the mona lisa", "Leonardo|Vinci"),
        ("speed of light", "299|300"),
        ("first person on the moon", "Armstrong"),
        ("capital of japan", "Tokyo"),
        ("what is DNA", "genetic|deoxyribonucleic"),
        ("longest river", "Nile|Amazon"),
        ("who discovered penicillin", "Fleming"),
        ("tallest mountain", "Everest"),
        ("how many bones in the human body", "206"),
        ("currency of japan", "yen"),
        ("largest ocean", "Pacific"),
        ("who founded apple", "Jobs|Wozniak"),
        ("what does cpu stand for", "central processing unit"),
        ("when did world war 2 end", "1945"),
    ]

    func testOnDeviceExam() async throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["NIMBLE_LIVE"] == "1",
                          "Set NIMBLE_LIVE=1 to run the on-device exam")
        try XCTSkipUnless(OnDeviceAnswers.isAvailable,
                          "Apple Intelligence is not available on this device, so the on-device exam was skipped")

        var correct = 0
        for (question, accepts) in Self.exam {
            guard let answer = await OnDeviceAnswers.answer(question, turns: TurnBuffer()) else {
                print("ondevice miss: \(question) -> (no answer)")
                continue
            }
            if Self.matches(answer, accepts) {
                correct += 1
            } else {
                print("ondevice miss: \(question) -> \(answer)")
            }
        }
        print("ondevice exam: \(correct)/\(Self.exam.count)")
        XCTAssertGreaterThanOrEqual(correct, 18, "on-device model passed \(correct)/\(Self.exam.count), needs 18")
    }

    /// Whole-word, case-insensitive, so "Au" does not match "because".
    private static func matches(_ answer: String, _ accepts: String) -> Bool {
        accepts.split(separator: "|").contains { alternative in
            let word = NSRegularExpression.escapedPattern(for: String(alternative))
            return answer.range(of: "\\b\(word)\\b", options: [.regularExpression, .caseInsensitive]) != nil
        }
    }
}
