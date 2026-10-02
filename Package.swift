// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "nimble-tui",
    platforms: [.macOS(.v14)],
    dependencies: [
        .package(url: "https://github.com/rensbreur/SwiftTUI", branch: "main")
    ],
    targets: [
        .executableTarget(
            name: "nimble-tui",
            dependencies: ["SwiftTUI"],
            path: ".",
            exclude: [
                "Resources",
                "Sources/iOS",
                "Sources/macOS",
                "Sources/Views",
                "Widget",
                "Tests",
                "docs",
                "functions",
                "worker",
                "kmp",
                "scripts",
                "test",
                ".github"
            ],
            sources: [
                "Sources/Models/QueryEngine.swift",
                "Sources/Models/QueryEngine+Cards.swift",
                "Sources/Models/QueryEngine+Compute.swift",
                "Sources/Models/QueryResult.swift",
                "Sources/Models/AIEngine.swift",
                "Sources/Models/Turns.swift",
                "Sources/Models/SearchHistory.swift",
                "tui/main.swift"
            ],
            resources: []
        )
    ]
)
