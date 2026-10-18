# Nimble brand kit and design system

Nimble answers a question instantly. The mark is a lightbulb. The mascot is Nim.

## The mark
One bold flat glyph on a tile. No text, no outline, no emblem.

- `../Nimble.icon` is the source of truth (Icon Composer). `../icon.svg` is the flat copy for READMEs (80 px). `nimble-icon-1024.png` is the App Store icon, no alpha.
- `mark.svg` is the glyph alone in `currentColor`. Clear space equals the thickest stroke. Smallest size 16 px.

## Colour
| Role | Value |
|---|---|
| Bulb yellow | `#ffca30` |
| Gold (text on cream) | `#8a6412` |
| Page | `#f5f0e4` light, `#1c1a17` dark |
| Text | `#1f1b16` light, near-white dark |
| Line | `#dcd2bd` |

Yellow and black carry the look, cream holds the page. Never purple or teal, no gradients. `docs/tokens.css` is the source.

## Type
Nimble Sans for every word, system font fallback. Scale 34/41 bold, 22/28, 17/24, 15/20, 13/18.

## Space and shape
- 8 point grid: 4, 8, 12, 16, 24, 32, 48. Side margin 20. Column 680.
- Radii: cards 28, grouped lists 20, controls fully round. Controls are 48 point capsules.
- Liquid Glass on the search field and Ask button (iOS 26, macOS 26), material below. Motion 0.2 s, honours reduced motion.

## Nim and Fen
Nim is a calm adult in a leather jacket, gold hoops and a choker, on a yellow disc. Four poses: wave (empty), think (loading), cheer (answer), doze (resting, not placed yet). Edit `scripts/nim-poses.py`, never the SVGs. Fen is the fennec fox alternative. Keep both whole.
