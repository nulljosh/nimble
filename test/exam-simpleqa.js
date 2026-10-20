// SimpleQA: 200 hard short-answer fact questions sampled from OpenAI's public set (test/fixtures/simpleqa-200.json).
// Graded by match, not by a model: an answer is correct when every part of the gold answer (names split on "and", a
// date's day, month and year, or the whole normalized string) shows up in what Nimble says. Not part of `npm test`.
// Run:  OFFLINE=1 node test/exam-simpleqa.js   (online uses the Worker: read /stats first, it spends neurons)
// MISSES=path writes every miss as JSONL ({question, gold, got}) for Samantha's training data in turing.
const fs = require("fs"), path = require("path"), zlib = require("zlib");
const offline = !!process.env.OFFLINE;
global.localStorage = { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = v; }, removeItem(k) { delete this._[k]; } };
if (offline) global.fetch = async () => { throw new Error("offline"); };
const E = require("../docs/engine.js");
const { questions } = require("./fixtures/simpleqa-200.json");
const pack = offline ? JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, "..", "docs", "pack", "wikipedia-top-v1.json.gz")))) : null;

const norm = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const MONTHS = "january february march april may june july august september october november december".split(" ");
function correct(gold, got) {
  const g = norm(gold), t = " " + norm(got) + " ";
  if (t.includes(" " + g + " ")) return true;
  const date = /^(?:([a-z]+) (\d{1,2}) (\d{4})|(\d{1,2}) ([a-z]+) (\d{4}))$/.exec(g);
  if (date) { const [m, d, y] = date[1] ? [date[1], date[2], date[3]] : [date[5], date[4], date[6]]; return MONTHS.includes(m) && [m, d, y].every((p) => t.includes(" " + p + " ")); }
  const parts = g.split(/ and | & /).filter(Boolean);
  return parts.length > 1 && parts.every((p) => t.includes(" " + p + " "));
}

(async () => {
  let right = 0, tried = 0; const misses = [];
  for (const { problem, answer } of questions) {
    const r = await E.answer(problem, offline ? { privateMode: true, pack } : { ifUnset: "yes" }).catch(() => null);
    const got = r ? [r.title, r.body, r.value, r.to, r.big, r.unit, r.sub, r.text].filter((x) => x != null).join(" ") : "";
    const attempted = !!(r && r.kind !== "none" && got.trim());
    tried += attempted;
    if (correct(answer, got)) right++; else misses.push({ question: problem, gold: answer, got: got.slice(0, 300) });
  }
  const n = questions.length;
  console.log(`SimpleQA ${offline ? "offline" : "online"}: ${right}/${n} correct (${Math.round(right / n * 100)}%), ${tried} attempted, ${right}/${tried || 1} of attempted (${Math.round(right / (tried || 1) * 100)}%)`);
  if (process.env.MISSES) fs.writeFileSync(process.env.MISSES, misses.map((m) => JSON.stringify(m)).join("\n") + "\n");
})();
