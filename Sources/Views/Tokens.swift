import SwiftUI
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

/// The web app's palette (docs/app.html and the shared tokens), light and dark.
/// Answer screens use these instead of the system colors so iOS and Mac match the web.
extension Color {
    static let bg = adaptive(light: 0xf5f0e4, dark: 0x1c1a17)
    static let bg2 = adaptive(light: 0xebe4d3, dark: 0x26231f)
    static let text = adaptive(light: 0x1f1b16, dark: 0xf3ede0)
    /// Text at 72%.
    static let soft = adaptive(light: 0x1f1b16, dark: 0xf3ede0, alpha: 0.72)
    /// Text at 60%. Not named `secondary`, which would shadow SwiftUI's own.
    static let dim = adaptive(light: 0x1f1b16, dark: 0xf3ede0, alpha: 0.6)
    static let hairline = adaptive(light: 0xdcd2bd, dark: 0x3a352e)
    static let bulb = adaptive(light: 0xffca30, dark: 0xffca30)
    static let bulbDeep = adaptive(light: 0x8a6412, dark: 0xffca30)

    private static func adaptive(light: UInt32, dark: UInt32, alpha: CGFloat = 1) -> Color {
        func rgb(_ hex: UInt32) -> (CGFloat, CGFloat, CGFloat) {
            (CGFloat((hex >> 16) & 0xFF) / 255, CGFloat((hex >> 8) & 0xFF) / 255, CGFloat(hex & 0xFF) / 255)
        }
        #if canImport(UIKit)
        return Color(uiColor: UIColor { trait in
            let (r, g, b) = rgb(trait.userInterfaceStyle == .dark ? dark : light)
            return UIColor(red: r, green: g, blue: b, alpha: alpha)
        })
        #else
        return Color(nsColor: NSColor(name: nil) { appearance in
            let (r, g, b) = rgb(appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? dark : light)
            return NSColor(srgbRed: r, green: g, blue: b, alpha: alpha)
        })
        #endif
    }
}
