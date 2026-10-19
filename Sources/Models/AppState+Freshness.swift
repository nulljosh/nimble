import Foundation

extension AppState {
    /// When the shown live answer was fetched (a card, a market, a score, a time-sensitive text), else nil.
    /// A daily value (a rate's day, a close) is nil: asking again would not change it.
    var resultAsOf: Date? {
        switch result {
        case .card(_, _, _, _, _, let asOf), .market(_, _, _, _, _, let asOf): return asOf.flatMap { $0.isDay ? nil : $0.date }
        case .sports(let card): return card.asOf?.date
        case .text: return textAsOf?.date
        default: return nil
        }
    }

    /// Back to the app after a while: a live answer older than ten minutes asks again, so "as of" never goes stale.
    /// Same rule as the web page's visibilitychange.
    func refreshIfStale(now: Date = Date()) {
        guard let asOf = resultAsOf, now.timeIntervalSince(asOf) > 600, !answeredQuery.isEmpty,
              queryText.trimmingCharacters(in: .whitespacesAndNewlines) == answeredQuery else { return }
        performQuery()
    }
}
