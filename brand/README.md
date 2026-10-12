# Nimble brand kit

Nimble is a yellow bulb on black, a hummingbird called Flit, and one plain sentence of voice: ask a question, get one sentence back. Everything is flat. Yellow and black carry the look, cream holds the page, and Nimble Sans sets every word. The live version of this kit is at [nimble.jaybulb.com/brand](https://nimble.jaybulb.com/brand).

| Token | Value | Use |
|---|---|---|
| `--yellow` | #ffca30 | Brand yellow. The icon bulb, the hero block, the social image |
| `--yellow-deep` | #8a6412 | Gold for text and links on cream |
| `--black` | #000 | Icon tile, ink on yellow |
| `--white` | #fff | Ink on black |
| `--bg` | #f5f0e4 | Cream page |
| `--text` | #1f1b16 | Body ink |
| `--text-mid` | rgba(31,27,22,0.72) | Secondary copy |
| `--line` | #dcd2bd | Hairlines and dividers |
| `--flit-belly` | #ffe27a | Flit's belly highlight |
| `--flit-cheek` | #e07a3f | Flit's cheek |
| `--flit-wing` | #a67c1e | Flit's wing and beak |
| `--flit-glint` | #fff8e1 | Flit's eye glint |

Source of truth: `docs/tokens.css`. The values above are the ones it resolves to today.

Files: `nimble-icon-1024.png` (app icon), `wordmark.svg` (outlined Nimble Sans, tracked at -0.02em), `flit.svg`, `fen.svg`, `github-social-1280x640.png` (repo social preview: the app icon beside the wordmark, no mascot), `og-1200x630.png` (link preview, same lockup).

The app icon is Apple-rendered artwork and the only exception to the flat rule. Every other file here is flat.

This folder is the source. The site serves copies at `docs/brand/` (plus `docs/og-1200x630.png`, the og:image), copied by hand in 5.13.1 with no build step. When a file here changes, copy it there too. The README stays here only.
