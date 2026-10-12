# Nimble Sans

Nimble Sans is derived from Inter 4.1 by Rasmus Andersson and The Inter Project Authors (https://github.com/rsms/inter), licensed under the SIL Open Font License 1.1. The license text is in `OFL.txt`.

It is renamed to "Nimble Sans" because the OFL's Reserved Font Name rule requires a modified font to drop the original name. Inter's name is no longer used for the file or any family name.

## What changed from Inter 4.1

- Feature `cv11` (single-storey a) frozen on, so it is the default `a`.
- Subset to Basic Latin, Latin-1, general punctuation, arrows, and the math signs used in the app (minus, approximately, not-equal, less/greater-or-equal, root, infinity). Layout features kept: kern, liga, calt, case, tnum, ccmp, locl, mark, mkmk, fractions, super/subscripts, and cv11.
- Name table: family "Nimble Sans", PostScript names NimbleSans-Regular, -Medium, -SemiBold, -Bold, copyright line adds "Modified by Nimble". Inter's copyright and the OFL text are kept.
- Open digits were tried (cv02, cv03, cv04) and dropped. Open 6 and 9 broke tabular figures, so tnum stays on the standard digits.
- Glyph shapes, metrics and kerning are otherwise unchanged.

## Licence

The OFL requires that the font itself stays under the OFL, and that derivative fonts keep the license text. Apps built with Nimble Sans can still be sold. The restriction is on redistributing the font file on its own under a different license.

## Files

- `NimbleSans-*.ttf`: installable and bundled into the iOS and macOS apps.
- `../docs/fonts/NimbleSans-*.woff2`: web, loaded by `docs/app.html` and `docs/index.html`.
- Type scale: 34 / 28 / 22 / 17 / 15 / 13 px, defined in `docs/tokens.css` and mirrored in `Sources/Views/Tokens.swift`.
