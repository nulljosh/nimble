import WidgetKit
import SwiftUI

struct AnswerEntry: TimelineEntry {
    let date: Date
    let question: String
    let answer: String

    static let empty = AnswerEntry(date: .now, question: "Ask anything", answer: "Tap to ask")
}

struct AnswerProvider: TimelineProvider {
    func placeholder(in context: Context) -> AnswerEntry {
        AnswerEntry(date: .now, question: "15% of 240", answer: "36")
    }

    func getSnapshot(in context: Context, completion: @escaping (AnswerEntry) -> Void) {
        completion(current())
    }

    // The app reloads timelines after every answer, so one entry and .never is enough.
    func getTimeline(in context: Context, completion: @escaping (Timeline<AnswerEntry>) -> Void) {
        completion(Timeline(entries: [current()], policy: .never))
    }

    private func current() -> AnswerEntry {
        guard let last = SharedAnswer.load() else { return .empty }
        return AnswerEntry(date: .now, question: last.question, answer: last.answer)
    }
}

struct NimbleWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: AnswerEntry

    private static let yellow = Color(red: 1.0, green: 0.792, blue: 0.188)  // #ffca30

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(entry.question)
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
                .lineLimit(1)
            Text(entry.answer)
                .font(.system(size: family == .systemSmall ? 28 : 34, weight: .bold))
                .foregroundStyle(.primary)
                .lineLimit(family == .systemSmall ? 3 : 2)
                .minimumScaleFactor(0.4)
            Spacer(minLength: 0)
            HStack(spacing: 5) {
                Circle().fill(Self.yellow).frame(width: 6, height: 6)
                Text("Nimble")
                    .font(.system(size: 12, weight: .semibold).smallCaps())
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .containerBackground(Color(uiColor: .systemBackground), for: .widget)
        .widgetURL(URL(string: "nimble://ask"))
    }
}

@main
struct NimbleWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "NimbleWidget", provider: AnswerProvider()) { entry in
            NimbleWidgetView(entry: entry)
        }
        .configurationDisplayName("Nimble")
        .description("Your last answer. Tap to ask another.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
