import Foundation
import SwiftTUI

// ponytail: static render, not a REPL. `nimble-tui <query>` prints the answer as a
// terminal card and exits — same QueryEngine the macOS/iOS apps use. A REPL is a
// bigger UI (input handling, redraw loop) than this pilot needs; add one if this
// becomes the primary way people use Nimble from a terminal.

func describe(_ result: QueryResult) -> String {
    switch result {
    case .none: return "No answer."
    case .loading: return "..."
    case .math(let value): return value
    case .text(let heading, let body, let source, _, _):
        return [heading, body, "— \(source)"].compactMap { $0 }.joined(separator: "\n")
    case .list(let items, let source):
        return items.joined(separator: "\n") + "\n— \(source)"
    case .error(let message, _): return message
    case .color(let value): return value
    case .convert(let from, let to, let fromUnit, let toUnit):
        return "\(from) \(fromUnit) = \(to) \(toUnit)"
    case .graph(let expr, _): return "graph: \(expr)"
    }
}

struct AnswerCard: View {
    let query: String
    let answer: String

    var body: some View {
        VStack(alignment: .leading) {
            Text(query).bold()
            Text(answer)
        }
        .padding()
        .border()
    }
}

let args = CommandLine.arguments.dropFirst()
guard !args.isEmpty else {
    print("usage: nimble-tui <query>")
    exit(1)
}
let query = args.joined(separator: " ")

let semaphore = DispatchSemaphore(value: 0)
var answer = ""
Task {
    answer = describe(await QueryEngine().query(query))
    semaphore.signal()
}
semaphore.wait()

Application(rootView: AnswerCard(query: query, answer: answer)).start()
