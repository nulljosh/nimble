#!/usr/bin/env node
// nimble "question": the one-sentence answer and its source, from the public API. Same shareText as every other surface.
const { shareText } = require("../docs/engine.js");
const q = process.argv.slice(2).join(" ").trim();
if (!q) { console.error('Usage: nimble "question"'); process.exit(2); }
(async () => {
  const r = await (await fetch("https://nimble.jaybulb.com/api/answer?q=" + encodeURIComponent(q))).json();
  const line = shareText(r);
  if (!line) { console.error("No answer for that one."); process.exit(1); }
  const src = (r.sources && r.sources[0]) || {};
  console.log(line + (src.name ? `\n${src.name}${src.url ? " " + src.url : ""}` : r.src ? `\n${r.src}` : ""));
})().catch(() => { console.error("Offline. Try again when you're connected."); process.exit(1); });
