// GSM8K: 200 grade-school math word problems sampled from OpenAI's public test set (test/fixtures/gsm8k-200.json).
// Correct when the gold final number is the last number in what Nimble says, or the number it leads with. Not part of
// `npm test`. Run:  OFFLINE=1 node test/exam-gsm8k.js   (online uses the Worker: read /stats first, it spends neurons)
// MISSES=path writes every miss as JSONL ({question, gold, got}) for Samantha's training data in turing.
const fs = require("fs"), path = require("path"), zlib = require("zlib");
const offline = !!process.env.OFFLINE;
global.localStorage = { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = v; }, removeItem(k) { delete this._[k]; } };
if (offline) global.fetch = async () => { throw new Error("offline"); };
const E = require("../docs/engine.js");
const { questions } = require("./fixtures/gsm8k-200.json");
const pack = offline ? JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, "..", "docs", "pack", "wikipedia-top-v1.json.gz")))) : null;

const nums = (s) => (String(s).replace(/(\d),(?=\d{3}\b)/g, "$1").match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
function correct(gold, got) {
  const n = nums(got), g = +gold;
  return n.length > 0 && (Math.abs(n[0] - g) < 1e-6 || Math.abs(n[n.length - 1] - g) < 1e-6);
}

(async () => {
  let right = 0, tried = 0; const misses = [];
  for (const { question, answer } of questions) {
    const r = await E.answer(question, offline ? { privateMode: true, pack } : { ifUnset: "yes" }).catch(() => null);
    const got = r ? [r.big, r.value, r.to, r.body, r.text, r.title].filter((x) => x != null).join(" ") : "";
    const attempted = !!(r && r.kind !== "none" && got.trim());
    tried += attempted;
    if (attempted && correct(answer, got)) right++; else misses.push({ question, gold: answer, got: got.slice(0, 300) });
  }
  const n = questions.length;
  console.log(`GSM8K ${offline ? "offline" : "online"}: ${right}/${n} correct (${Math.round(right / n * 100)}%), ${tried} attempted, ${right}/${tried || 1} of attempted (${Math.round(right / (tried || 1) * 100)}%)`);
  if (process.env.MISSES) fs.writeFileSync(process.env.MISSES, misses.map((m) => JSON.stringify(m)).join("\n") + "\n");
})();
