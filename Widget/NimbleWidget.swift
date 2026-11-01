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

    static let brand = Color(red: 1.0, green: 0.792, blue: 0.188)  // #ffca30

    private var accessory: Bool { [.accessoryInline, .accessoryCircular, .accessoryRectangular].contains(family) }

    var body: some View {
        Group {
            switch family {
            // Lock screen: the answer in a line, the bulb in a circle, or question over answer in the rectangle.
            case .accessoryInline:
                Text(entry.answer)
            case .accessoryCircular:
                ZStack {
                    AccessoryWidgetBackground()
                    Image(systemName: "lightbulb.fill").font(.title2)
                }
                .accessibilityLabel("Ask Nimble")
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 2) {
                    Text(entry.question).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                    Text(entry.answer).font(.headline).lineLimit(2).minimumScaleFactor(0.7)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            default:
                home
            }
        }
        .containerBackground(for: .widget) { accessory ? Color.clear : Color(uiColor: .systemBackground) }
        .widgetURL(URL(string: "nimble://ask"))
    }

    private var home: some View {
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
                Circle().fill(Self.brand).frame(width: 6, height: 6)
                Text("Nimble")
                    .font(.system(size: 12, weight: .semibold).smallCaps())
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

@main
struct NimbleWidgets: WidgetBundle {
    var body: some Widget {
        NimbleWidget()
        AskWidget()
        QuestionOfTheDayWidget()
    }
}

struct NimbleWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "NimbleWidget", provider: AnswerProvider()) { entry in
            NimbleWidgetView(entry: entry)
        }
        .configurationDisplayName("Nimble")
        .description("Your last answer. Tap to ask another.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryInline, .accessoryCircular, .accessoryRectangular])
    }
}

// MARK: Ask box: a field on the home screen, one tap to the caret.

struct AskWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "NimbleAsk", provider: AnswerProvider()) { _ in AskBoxView() }
            .configurationDisplayName("Ask")
            .description("A box on your home screen. Tap it and type.")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct AskBoxView: View {
    @Environment(\.widgetFamily) private var family
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 5) {
                Circle().fill(NimbleWidgetView.brand).frame(width: 6, height: 6)
                Text("Nimble").font(.system(size: 12, weight: .semibold).smallCaps()).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                Text(family == .systemSmall ? "Ask" : "Ask anything").foregroundStyle(.secondary)
                Spacer(minLength: 0)
            }
            .font(.system(size: 15))
            .padding(.horizontal, 12).frame(height: 40)
            .background(Color(uiColor: .secondarySystemFill), in: Capsule())
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .containerBackground(for: .widget) { Color(uiColor: .systemBackground) }
        .widgetURL(URL(string: "nimble://ask"))
        .accessibilityLabel("Ask Nimble")
    }
}

// MARK: Question of the day: one fact a day, the same for everyone, tap to ask it.

struct DailyEntry: TimelineEntry { let date: Date; let question: String; let answer: String }

struct DailyProvider: TimelineProvider {
    /// Facts that do not change with the news, so the answer printed here can never go stale.
    static let facts: [(String, String)] = [
        ("How many bones are in the human body?", "206"),
        ("What is the chemical symbol for gold?", "Au"),
        ("How far is the Moon?", "About 384,400 km"),
        ("Who wrote Hamlet?", "William Shakespeare"),
        ("What is the speed of light?", "299,792 km per second"),
        ("When did the Berlin Wall fall?", "1989"),
        ("What is the largest ocean?", "The Pacific"),
        ("Who discovered penicillin?", "Alexander Fleming, 1928"),
        ("How many feet are in a mile?", "5,280"),
        ("What is the atomic number of carbon?", "6"),
        ("Who painted the Mona Lisa?", "Leonardo da Vinci"),
        ("What is 255 in binary?", "11111111"),
        ("When did Canada become a country?", "1867"),
        ("What is the capital of Australia?", "Canberra"),
        ("Who invented the telephone?", "Alexander Graham Bell"),
        ("How many minutes are in a week?", "10,080"),
        ("What is the boiling point of water in Fahrenheit?", "212 °F"),
        ("What is the currency of Japan?", "The yen"),
        ("Who created Linux?", "Linus Torvalds, 1991"),
        ("What does DNA stand for?", "Deoxyribonucleic acid"),
        ("How many hearts does an octopus have?", "Three"),
        ("What is the tallest mountain above sea level?", "Mount Everest, 8,849 m"),
        ("What is 7 factorial?", "5,040"),
        ("When was the Declaration of Independence signed?", "1776"),
        ("What is the hardest natural material?", "Diamond"),
        ("How many players are on a soccer team on the field?", "Eleven"),
        ("What gas do plants take in?", "Carbon dioxide"),
        ("What is the smallest prime number?", "2"),
        ("Which planet is closest to the Sun?", "Mercury"),
        ("How many keys are on a standard piano?", "88"),
        ("What is the square root of 144?", "12"),
    ]

    static func entry(for date: Date) -> DailyEntry {
        let day = Calendar.current.ordinality(of: .day, in: .era, for: date) ?? 0
        let (q, a) = facts[day % facts.count]
        return DailyEntry(date: date, question: q, answer: a)
    }

    func placeholder(in context: Context) -> DailyEntry { Self.entry(for: .now) }
    func getSnapshot(in context: Context, completion: @escaping (DailyEntry) -> Void) { completion(Self.entry(for: .now)) }

    /// Today's fact, then a fresh one just after midnight.
    func getTimeline(in context: Context, completion: @escaping (Timeline<DailyEntry>) -> Void) {
        let tomorrow = Calendar.current.startOfDay(for: .now.addingTimeInterval(86_400)).addingTimeInterval(60)
        completion(Timeline(entries: [Self.entry(for: .now)], policy: .after(tomorrow)))
    }
}

struct QuestionOfTheDayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "NimbleDaily", provider: DailyProvider()) { e in DailyView(entry: e) }
            .configurationDisplayName("Question of the day")
            .description("A new question every day, with its answer.")
            .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}

struct DailyView: View {
    @Environment(\.widgetFamily) private var family
    let entry: DailyEntry
    private var link: URL? {
        var c = URLComponents(string: "nimble://ask"); c?.queryItems = [.init(name: "q", value: entry.question)]; return c?.url
    }
    var body: some View {
        Group {
            if family == .accessoryRectangular {
                VStack(alignment: .leading, spacing: 2) {
                    Text(entry.question).font(.caption2).foregroundStyle(.secondary).lineLimit(2)
                    Text(entry.answer).font(.headline).lineLimit(1).minimumScaleFactor(0.7)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Today").font(.system(size: 12, weight: .semibold).smallCaps()).foregroundStyle(.secondary)
                    Text(entry.question).font(.system(size: 14, weight: .medium)).lineLimit(3)
                    Spacer(minLength: 0)
                    Text(entry.answer)
                        .font(.system(size: family == .systemSmall ? 20 : 24, weight: .bold))
                        .lineLimit(2).minimumScaleFactor(0.5)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
        }
        .containerBackground(for: .widget) { family == .accessoryRectangular ? Color.clear : Color(uiColor: .systemBackground) }
        .widgetURL(link)
    }
}
