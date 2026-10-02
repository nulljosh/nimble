import Foundation

/// The last question and answer, kept in the app group so the iOS widget can show it.
/// Plain strings only: the widget never runs a query, it just reads what the app left.
enum SharedAnswer {
    static let suiteName = "group.com.nulljosh.nimble"
    static let questionKey = "lastQuestion"
    static let answerKey = "lastAnswer"

    static var defaults: UserDefaults? { UserDefaults(suiteName: suiteName) }

    static func save(question: String, answer: String, to defaults: UserDefaults? = SharedAnswer.defaults) {
        guard let defaults else { return }
        defaults.set(question, forKey: questionKey)
        defaults.set(answer, forKey: answerKey)
    }

    static func load(from defaults: UserDefaults? = SharedAnswer.defaults) -> (question: String, answer: String)? {
        guard let defaults,
              let q = defaults.string(forKey: questionKey),
              let a = defaults.string(forKey: answerKey) else { return nil }
        return (q, a)
    }
}
