import XCTest

/// Xcode's accessibility audit on every iPhone tab, at the default and the largest accessibility text size.
@MainActor
final class AccessibilityAuditTests: XCTestCase {
    func testEveryTabPassesTheAudit() throws {
        for size in ["UICTContentSizeCategoryL", "UICTContentSizeCategoryAccessibilityXXXL"] {
            let app = XCUIApplication()
            app.launchArguments += ["-UIPreferredContentSizeCategoryName", size]
            app.launch()
            let tabs = app.tabBars.buttons
            for i in 0..<max(tabs.count, 1) {
                if tabs.count > i { tabs.element(boundBy: i).tap() }
                try app.performAccessibilityAudit { issue in
                    // Name the element so a failure says what to fix, not just which rule.
                    let e = issue.element
                    print("AUDIT [\(size) tab \(i)] \(issue.compactDescription): id=\(e?.identifier ?? "") label=\(e?.label ?? "") type=\(e?.elementType.rawValue ?? 0) frame=\(e?.frame ?? .zero)")
                    return false
                }
            }
            app.terminate()
        }
    }
}
