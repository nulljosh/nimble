// BC Pre-Calculus 12, the way a student types it: transformations, exponents and logs, geometric
// sequences and series, polynomials and rational functions, and trigonometry. Graded by regex like
// test/exam.js and not part of `npm test`.  Run:  node test/exam-pc12.js   (OFFLINE=1: no network)
const fs = require("fs"), path = require("path"), zlib = require("zlib");
global.localStorage = { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = v; }, removeItem(k) { delete this._[k]; } };
const offline = !!process.env.OFFLINE;
if (offline) global.fetch = async () => { throw new Error("offline"); };
const E = require("../docs/engine.js");
const pack = offline ? JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, "..", "docs", "pack", "wikipedia-top-v1.json.gz")))) : null;

const Q = [
  // transformations
  ["what does y = f(x - 2) do to the graph", /right/i],
  ["inverse of y = 2x + 3", /\(x\s*[-−]\s*3\)\s*[\/⁄]\s*2|x\s*\/\s*2\s*[-−]\s*(3\/2|1\.5)/i],
  ["what does y = -f(x) do to a graph", /reflect.*x.axis|x.axis.*reflect/i],
  ["what does y = f(2x) do to a graph", /horizontal.*(compress|1\/2|half)|(compress|half).*horizontal/i],
  // exponents and logarithms
  ["log2(32)", /^5$/],
  ["log base 3 of 81", /\b4\b/],
  ["ln(e)", /^1$/],
  ["log(1000)", /^3$/],
  ["2^-3", /0\.125/],
  ["log2(8) + log2(4)", /^5$/],
  ["solve 2^x = 16", /x\s*=\s*4\b|\s4\.?$/],
  ["solve 3^(x+1) = 27", /x\s*=\s*2\b|\s2\.?$/],
  ["1000 * 1.05^10", /1,?628\.89/],
  ["100 g with a half life of 5 years, how much is left after 15 years", /12\.5/],
  ["domain of y = log(x)", /x\s*>\s*0|positive/i],
  ["what is a logarithm", /exponent|power/i],
  // geometric sequences and series
  ["common ratio of 4, 12, 36", /\b3\b/],
  ["10th term of the geometric sequence 2, 6, 18", /39,?366/],
  ["sum of the first 8 terms of 3, 6, 12", /\b765\b/],
  ["sum of the infinite geometric series with first term 10 and ratio 0.5", /\b20\b/],
  ["formula for the sum of a geometric series", /1\s*[-−]\s*r|r\s*[-−]\s*1/i],
  // polynomial and rational functions
  ["remainder when x^3 - 2x + 1 is divided by x - 2", /\b5\b/],
  ["factor x^2 - 5x + 6", /\(x\s*[-−]\s*2\)|\(x\s*[-−]\s*3\)/],
  ["roots of x^2 - 5x + 6", /\b2\b[^\d]+\b3\b|\b3\b[^\d]+\b2\b/],
  ["vertical asymptote of y = 1/(x - 3)", /x\s*=\s*3|\b3\b/],
  ["what is the remainder theorem", /remainder|f\(a\)|p\(a\)/i],
  // trigonometry
  ["sin(pi/6)", /^0\.5$|\s0\.5\.?$|1\/2/],
  ["cos(pi)", /^-1$/],
  ["tan(pi/4)", /^1$/],
  ["sin 30 degrees", /0\.5/],
  ["convert 180 degrees to radians", /3\.14|π|\bpi\b/i],
  ["convert pi/3 radians to degrees", /\b60\b/],
  ["period of y = sin(2x)", /π|\bpi\b|3\.14/i],
  ["amplitude of y = 3sin(2x)", /\b3\b/],
  ["sin^2(x) + cos^2(x)", /\b1\b/],
  ["solve sin x = 1/2 for 0 ≤ x < 2π", /π\s*\/\s*6|pi\s*\/\s*6|\b30\b/i],
  ["exact value of cos(5pi/6)", /√3|sqrt\s*\(?3|0\.866/i],
  ["reciprocal of sine", /cosecant|csc/i],
  ["arc length with radius 5 and angle 2 radians", /\b10\b/],
  ["what is a radian", /radius|arc|unit of angle/i],
  // Form B: written after the solver, never tuned against. This half is the honest grade.
  ["describe the transformation y = f(x) + 5", /up|vertical.*5/i],
  ["how does y = 3f(x) change the graph", /vertical.*stretch|stretch.*vertical/i],
  ["what is the effect of y = f(-x)", /reflect.*y.axis/i],
  ["inverse of f(x) = 5x - 2", /\(x\s*\+\s*2\)\s*[\/⁄]\s*5|x\s*\/\s*5\s*\+/],
  ["log_2(64)", /\b6\b/],
  ["log base 2 of 1/8", /-3\b/],
  ["solve 5^x = 125", /x\s*=\s*3\b|\s3\.?$/],
  ["solve 2^(3x) = 64", /x\s*=\s*2\b|\s2\.?$/],
  ["ln(1)", /^0$/],
  ["log(0.01)", /^-2$/],
  ["e^2", /7\.389/],
  ["$500 invested at 4% compounded annually for 3 years", /562\.43/],
  ["a population of 200 doubles every 3 hours, how many after 12 hours", /3,?200/],
  ["expand log(ab)", /log\s*\(?a\)?\s*\+\s*log\s*\(?b\)?/i],
  ["change of base formula for logarithms", /log.*\/.*log|ln.*\/.*ln/i],
  ["common ratio of 81, 27, 9", /1\/3|0\.333/],
  ["8th term of 5, 10, 20", /\b640\b/],
  ["sum of the first 6 terms of the geometric series 2 + 6 + 18", /\b728\b/],
  ["sum of the infinite series 8 + 4 + 2 + 1", /\b16\b/],
  ["is 1, 4, 9, 16 a geometric sequence", /\bno\b|\bnot\b/i],
  ["solve x^2 + 2x - 15 = 0", /-5[^\d]+3\b|\b3[^\d]+-5/],
  ["factor x^2 - 9", /\(x\s*[-−+]\s*3\)/],
  ["remainder of x^4 - 3x^2 + 2 divided by x + 1", /\b0\b/],
  ["zeros of x^3 - x", /-1[^\d]+0[^\d]+1|0[^\d]+-1[^\d]+1|0[^\d]+1[^\d]+-1/],
  ["horizontal asymptote of y = 1/x", /y\s*=\s*0/],
  ["is x - 1 a factor of x^3 - 1", /\byes\b/i],
  ["end behaviour of y = -x^3", /rise|fall|up|down|∞|infinity/i],
  ["cos 60 degrees", /0\.5|1\/2/],
  ["tan(45°)", /\b1\b/],
  ["sin(3pi/2)", /-1\b/],
  ["convert 270 degrees to radians", /3π\/2|4\.71/],
  ["convert 2 radians to degrees", /114\.59/],
  ["period of y = tan(4x)", /π\s*\/\s*4|0\.785/],
  ["amplitude of y = -2cos(x)", /\b2\b/],
  ["solve cos x = 0 for 0 ≤ x < 2π", /π\s*\/\s*2.*3π\s*\/\s*2/],
  ["solve 2sin x - 1 = 0", /π\s*\/\s*6/],
  ["exact value of sin(5pi/4)", /√2\s*\/\s*2|0\.707/],
  ["what is sec(0)", /\b1\b/],
  ["what quadrant is 200 degrees in", /\bIII\b|third|3rd/i],
  ["coterminal angle of 400 degrees", /\b40\b/],
  ["reference angle for 150 degrees", /\b30\b/],
  // Form C: written 2026-10-20 after form B was fixed, before any run. The honest grade now.
  ["if f(x) = x^2, describe y = f(x + 4) - 1", /left/i],
  ["what does y = 1/2 f(x) do", /vertical.*(compress|1\/2|half)|(compress|half).*vertical/i],
  ["inverse of y = x/3 + 1", /3\s*\(?x\s*[-−]\s*1\)?|3x\s*[-−]\s*3/],
  ["log base 4 of 64", /\b3\b/],
  ["log_5(1/25)", /-2\b/],
  ["solve 10^x = 1000", /x\s*=\s*3\b|\s3\.?$/],
  ["solve 2^x = 10", /3\.32/],
  ["solve log(x) = 2", /\b100\b/],
  ["solve log2(x) = 5", /\b32\b/],
  ["log(5) + log(2)", /^1$/],
  ["ln(e^3)", /^3$/],
  ["$2000 at 5% interest compounded quarterly for 10 years", /3,?2(86|87)\./],
  ["a 50 mg sample has a half-life of 8 days, how much is left after 24 days", /6\.25/],
  ["how long until $1000 doubles at 7% compounded annually", /10\.2|10\.24/],
  ["domain of y = 2^x", /all real|ℝ|-∞/i],
  ["first term of a geometric sequence with r = 2 and 5th term 48", /\b3\b/],
  ["6th term of 1, -3, 9", /-243/],
  ["sum of the first 10 terms of 1, 2, 4", /\b1,?023\b/],
  ["does the series 1 + 2 + 4 + 8 converge", /\bno\b|diverge/i],
  ["sum of 3 + 1 + 1/3 + ...", /4\.5|9\/2/],
  ["solve x^2 - 4x - 5 = 0", /-1[^\d]+5\b|\b5[^\d]+-1/],
  ["factor 2x^2 + 7x + 3", /\(2x\s*\+\s*1\)|\(x\s*\+\s*3\)/],
  ["remainder when x^3 + 4x^2 - 3 is divided by x + 2", /\b5\b/],
  ["roots of x^3 - 4x", /-2[^\d]+0[^\d]+2|0[^\d]+-?2/],
  ["vertical asymptotes of y = 3/(x^2 - 9)", /-3[^\d]+3|3[^\d]+-3/],
  ["horizontal asymptote of y = (3x^2 + 1)/(x^2 - 4)", /y\s*=\s*3\b/],
  ["x-intercepts of y = x^2 - 16", /-4[^\d]+4|4[^\d]+-4/],
  ["what is a polynomial of degree 3 called", /cubic/i],
  ["cos(2pi/3)", /-0\.5\b|-1\/2/],
  ["sin 150°", /0\.5|1\/2/],
  ["tan 135 degrees", /-1\b/],
  ["convert 5pi/6 to degrees", /\b150\b/],
  ["convert 45 degrees to radians", /π\s*\/\s*4|0\.785/],
  ["period of y = cos(x/2)", /4π|12\.56/],
  ["amplitude and period of y = 4sin(3x)", /4.*2π\s*\/\s*3|2π\s*\/\s*3.*4/],
  ["solve tan x = 1 for 0 ≤ x < 2π", /π\s*\/\s*4.*5π\s*\/\s*4/],
  ["solve 2cos x + 1 = 0", /2π\s*\/\s*3.*4π\s*\/\s*3/],
  ["exact value of tan(pi/3)", /√3|1\.73/],
  ["simplify sin x / cos x", /tan/i],
  ["sector area with radius 4 and angle pi/2", /2π|6\.28/],
];

(async () => {
  let pass = 0, passB = 0, passC = 0; const fail = [];
  for (const [i, [q, re]] of Q.entries()) {
    if (!offline && !E.tryMath(q) && !E.tryConvert(q)) await new Promise((ok) => setTimeout(ok, 3200));
    let r; try { r = await E.answer(q, offline ? { privateMode: true, pack } : { ifUnset: "yes" }); } catch (e) { r = { kind: "throw", body: String(e) }; }
    const text = [r.title, r.body, r.value, r.to, r.toUnit, r.big, r.unit, r.sub, r.text].filter((x) => x != null).join(" ");
    const ok = re.test(text); ok ? pass++ : fail.push(q); if (ok && i >= 40 && i < 81) passB++; if (ok && i >= 81) passC++;
    console.log((ok ? "PASS" : "FAIL") + " | " + q + " => " + r.kind + " | " + text.slice(0, 110).replace(/\n/g, " "));
  }
  console.log(`\n${pass}/${Q.length} pass${offline ? " offline" : ""} (form A ${pass - passB - passC}/40, form B ${passB}/41, form C ${passC}/${Q.length - 81}). FAIL: ${fail.join(" ; ")}`);
})();
