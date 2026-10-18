import SwiftUI

extension View {
    /// Liquid Glass on iOS 26 and macOS 26. Older systems get a blurred material with a hairline edge.
    /// Glass is for the controls that float above content (the search field, Ask), never the answer card.
    /// `tint` colours the glass; `nil` leaves it clear.
    @ViewBuilder
    func glass<S: Shape>(in shape: S, tint: Color? = nil) -> some View {
        if #available(iOS 26, macOS 26, *) {
            glassEffect(tint.map { Glass.regular.tint($0).interactive() } ?? Glass.regular.interactive(), in: shape)
        } else if let tint {
            background(tint, in: shape)
        } else {
            background(.ultraThinMaterial, in: shape)
                .overlay(shape.stroke(Color.hairline, lineWidth: 1))
        }
    }
}
