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

/// Nimble Sans, the app's own face (fonts/README.md). The scale matches docs/tokens.css.
/// Each named step is tied to a text style, so Dynamic Type scales it on iOS. Headings take -0.02em tracking,
/// body copy a 1.35 line height (`lineSpacing(0.35 * size)`).
extension Font {
    enum NimbleWeight: String {
        case regular = "Regular", medium = "Medium", semibold = "SemiBold", bold = "Bold"
    }

    static func nimble(_ size: CGFloat, _ weight: NimbleWeight = .regular, relativeTo style: Font.TextStyle) -> Font {
        .custom("NimbleSans-\(weight.rawValue)", size: size, relativeTo: style)
    }

    // Web scale: 34 / 28 / 22 / 17 / 15 / 13 px, with the steps between them named for their use.
    static let nimbleDisplay = nimble(34, .bold, relativeTo: .largeTitle)
    static let nimbleTitle = nimble(28, .bold, relativeTo: .title)
    static let nimbleHeadline = nimble(22, .semibold, relativeTo: .title2)
    static let nimbleLead = nimble(19, .regular, relativeTo: .title3)
    static let nimbleLeadMedium = nimble(19, .medium, relativeTo: .title3)
    static let nimbleBody = nimble(17, .regular, relativeTo: .body)
    static let nimbleSubhead = nimble(15, .regular, relativeTo: .subheadline)
    static let nimbleSubheadMedium = nimble(15, .medium, relativeTo: .subheadline)
    static let nimbleSubheadBold = nimble(15, .bold, relativeTo: .subheadline)
    static let nimbleCallout = nimble(14, .regular, relativeTo: .callout)
    static let nimbleCalloutMedium = nimble(14, .medium, relativeTo: .callout)
    static let nimbleCalloutBold = nimble(14, .bold, relativeTo: .callout)
    static let nimbleCaption = nimble(13, .regular, relativeTo: .footnote)
    static let nimbleCaptionMedium = nimble(13, .medium, relativeTo: .footnote)
    static let nimbleSmall = nimble(12, .regular, relativeTo: .caption)
    static let nimbleFine = nimble(11, .regular, relativeTo: .caption2)
    static let nimbleEyebrow = nimble(11, .bold, relativeTo: .caption2)
    static let nimbleMicro = nimble(10, .semibold, relativeTo: .caption2)
}

#if canImport(UIKit)
extension View {
    /// Keeps the drawn size and layout, but makes the touch area at least 44pt. Negative padding cancels the layout.
    func minimumTapTarget() -> some View {
        padding(10).contentShape(Rectangle()).padding(-10)
    }
}
#else
extension View {
    func minimumTapTarget() -> some View { self }
}
#endif
