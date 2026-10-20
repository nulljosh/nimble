// One BC course exam from test/courses/<course>.js, graded by regex like test/exam.js and not part of `npm test`.
// Run:  COURSE=pc11 node test/exam-course.js   (OFFLINE=1: no network; FORM=B: one form only)
const fs = require("fs"), path = require("path"), zlib = require("zlib");
global.localStorage = { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = v; }, removeItem(k) { delete this._[k]; } };
const offline = !!process.env.OFFLINE;
if (offline) global.fetch = async () => { throw new Error("offline"); };
const E = require("../docs/engine.js");
const pack = offline ? JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, "..", "docs", "pack", "wikipedia-top-v1.json.gz")))) : null;
const course = require(path.join(__dirname, "courses", (process.env.COURSE || "pc11") + ".js"));

(async () => {
  const score = {}, fail = [];
  for (const [form, Q] of Object.entries(course.forms)) {
    if (process.env.FORM && process.env.FORM !== form) continue;
    score[form] = [0, Q.length];
    for (const [q, re] of Q) {
      // The free AI allows about 20 calls a minute; local answers need no wait.
      if (!offline && !E.tryMath(q) && !E.tryConvert(q) && !E.precalc(q)) await new Promise((ok) => setTimeout(ok, 3200));
      let r; try { r = await E.answer(q, offline ? { privateMode: true, pack } : { ifUnset: "yes" }); } catch (e) { r = { kind: "throw", body: String(e) }; }
      // Typographic minus signs and hyphens read as "-".
      const text = [r.title, r.body, r.value, r.to, r.toUnit, r.big, r.unit, r.sub, r.text].filter((x) => x != null).join(" ").replace(/[−‑–]/g, "-");
      const ok = re.test(text); ok ? score[form][0]++ : fail.push(form + ": " + q);
      console.log((ok ? "PASS" : "FAIL") + " | " + form + " | " + q + " => " + r.kind + " | " + text.slice(0, 110).replace(/\n/g, " "));
    }
  }
  console.log(`\n${course.name}${offline ? " offline" : ""}: ` + Object.entries(score).map(([f, [p, n]]) => `form ${f} ${p}/${n}`).join(", ") + `\nFAIL: ${fail.join(" ; ")}`);
})();
