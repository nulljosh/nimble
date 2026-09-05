// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "nimble-tui",
    platforms: [.macOS(.v13)],
    dependencies: [
        .package(url: "https://github.com/rensbreur/SwiftTUI", branch: "main")
    ],
    targets: [
        .executableTarget(
            name: "nimble-tui",
            dependencies: ["SwiftTUI"],
            path: ".",
            sources: ["Sources/Models/QueryEngine.swift", "Sources/Models/QueryResult.swift", "tui/main.swift"]
        )
    ]
)
