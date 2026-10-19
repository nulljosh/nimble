// The question exam with no network at all: math, units, constants, the device's time zones and the offline pack.
// Same questions and grading as test/exam.js. Not part of `npm test`.  Run:  node test/exam-offline.js
// Prints the score and every pack answer that was wrong (a confident wrong answer is worse than "not in the pack").
const fs = require("fs"), path = require("path"), zlib = require("zlib");
global.localStorage = { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = v; }, removeItem(k) { delete this._[k]; } };
global.fetch = async () => { throw new Error("offline"); };
const E = require("../docs/engine.js");
const src = fs.readFileSync(path.join(__dirname, "exam.js"), "utf8");
const Q = eval(src.slice(src.indexOf("const Q=[") + 8, src.indexOf("];\n(async") + 1));
const pack = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, "..", "docs", "pack", "wikipedia-top-v1.json.gz"))));
(async () => {
  let pass = 0; const kinds = {}, wrong = [];
  for (const [q, re] of Q) {
    const r = await E.answer(q, { privateMode: true, pack }).catch(() => ({ kind: "throw" }));
    const text = [r.title, r.body, r.value, r.to, r.toUnit, r.big, r.unit, r.sub, r.text].filter((x) => x != null).join(" ");
    const ok = re.test(text);
    pass += ok; kinds[r.kind] = (kinds[r.kind] || 0) + 1;
    if (!ok && r.kind === "pack") wrong.push(`${q} => ${text.slice(0, 70)}`);
  }
  console.log(`${pass}/${Q.length} pass offline (pack: ${pack.entries.length} entries)`, JSON.stringify(kinds));
  console.log(`pack answered wrong: ${wrong.length}\n` + wrong.join("\n"));
})();
