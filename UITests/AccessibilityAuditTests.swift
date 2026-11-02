import XCTest

/// Xcode's accessibility audit on every iPhone tab, at the default and the largest accessibility text size.
final class AccessibilityAuditTests: XCTestCase {
    func testEveryTabPassesTheAudit() throws {
        for size in ["UICTContentSizeCategoryL", "UICTContentSizeCategoryAccessibilityXXXL"] {
            let app = XCUIApplication()
            app.launchArguments += ["-UIPreferredContentSizeCategoryName", size]
            app.launch()
            let tabs = app.tabBars.buttons
            for i in 0..<max(tabs.count, 1) {
                if tabs.count > i { tabs.element(boundBy: i).tap() }
                try app.performAccessibilityAudit()
            }
            app.terminate()
        }
    }
}
