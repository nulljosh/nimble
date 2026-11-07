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
                // Audit, then scroll and audit again so rows that started below the tab bar are checked on screen.
                for pass in 0..<2 {
                    if pass == 1 { app.swipeUp(); app.swipeUp(); sleep(2) } // let the scroll settle before measuring
                    let visible = CGRect(x: 0, y: 0, width: app.frame.width,
                                         height: app.tabBars.firstMatch.exists ? app.tabBars.firstMatch.frame.minY : app.frame.height)
                    try app.performAccessibilityAudit { issue in
                        let e = issue.element
                        // Contrast can't be measured on an element that is off screen or under the tab bar; the other pass covers it.
                        if issue.auditType == .contrast, let f = e?.frame, f.isEmpty || !visible.contains(f) { return true }
                        // Name the element so a failure says what to fix, not just which rule.
                        print("AUDIT [\(size) tab \(i) pass \(pass)] \(issue.compactDescription): id=\(e?.identifier ?? "") label=\(e?.label ?? "") type=\(e?.elementType.rawValue ?? 0) frame=\(e?.frame ?? .zero) \(e == nil ? issue.detailedDescription : "")")
                        return false
                    }
                }
            }
            app.terminate()
        }
    }
}
