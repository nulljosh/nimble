# Offline Wikipedia pack

`wikipedia-top-v1.json.gz` is a short list of Wikipedia article intros. Nimble downloads it once, on your tap, and answers from it when there is no network.

It holds the opening sentences of the 4,000 most-viewed English Wikipedia articles from last month, plus a link to each article. It is rebuilt once a month by `scripts/build-offline-pack.mjs`. `index.json` next to it says when it was built and how big it is.

## Format

Gzipped plain JSON. Any client can read it: decompress, then parse.

```
{
  "version": 1,
  "builtAt": "2026-10-12",
  "source": "Wikipedia, CC BY-SA 4.0",
  "pageviews": "2026-09",
  "count": 4000,
  "entries": [
    { "t": "title", "d": "short description", "e": "first sentences", "u": "article link", "a": ["aliases"], "i": "thumbnail URL, optional" }
  ]
}
```

- `t` title, `d` the Wikipedia short description, `e` the first two sentences (cut to 320 characters), `u` the canonical article URL.
- `a` lowercase aliases: the title without parentheses, and the "the X" form.
- `i` a thumbnail URL as text. Images are not stored in the pack.

## License

The text comes from Wikipedia and is licensed CC BY-SA 4.0 by the Wikipedia contributors. Each entry links to its article (`u`), and that link is the attribution. Anything you show from the pack must keep that credit and the same license.

## What it cannot answer

- Live facts: today's prices, scores, weather, news.
- Anything outside the top 4,000 articles. If it is not in the pack, Nimble says so and does not guess.
- Long articles. Each entry is two sentences.

Math, unit conversions and graphs need no pack. They are computed on the device and always work offline.
