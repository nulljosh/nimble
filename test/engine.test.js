// node --test  (offline by default; LIVE=1 node --test hits the real sources)
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("../docs/engine.js");

test("math", () => {
  assert.equal(E.tryMath("2+2"), 4);
  assert.equal(E.tryMath("sqrt(16)*2"), 8);
  assert.equal(E.tryMath("2^10"), 1024);
  assert.equal(E.tryMath("12% of 250"), 30);
  assert.deepEqual(E.tryConvert("180 C to F"), {from:"180", to:"356", fromUnit:"\u00B0C", toUnit:"\u00B0F"});
  assert.equal(E.tryMath("hello"), null);
  assert.equal(E.tryMath("process.exit()"), null);
  assert.equal(E.tryMath("1/0"), null);
});

test("spoken math and identity", async () => {
  assert.equal(E.tryMath("What's nine plus ten?"), 19);
  assert.equal(E.tryMath("what is 9 times 3"), 27);
  assert.equal(E.tryMath("who is the one"), null);
  // Everyday phrasing stays offline instead of spending an AI call.
  assert.equal(E.tryMath("half of 250"), 125);
  assert.equal(E.tryMath("what is a third of 90"), 30);
  assert.equal(E.tryMath("15 percent tip on 60"), 9);
  assert.equal(E.tryMath("25% off 80"), 60);
  assert.equal(E.tryMath("average of 2, 4 and 9"), 5);
  assert.equal(E.tryMath("half of the class"), null);
  assert.equal(E.tryMath("one hundred minus seven"), 93);
  assert.equal(E.tryMath("what percent is 20 of 80"), 25);
  assert.equal(E.tryMath("20 is what percent of 80"), 25);
  assert.equal(E.tryMath("increase 50 by 10%"), 55);
  assert.equal(E.tryMath("what is 15% of 1,000"), 150);
  assert.equal(E.tryMath("double 36"), 72);
  assert.equal(E.tryMath("triple 15"), 45);
  assert.equal(E.tryMath("how much is a 20% tip on 85"), 17);
  assert.equal(E.tryMath("split 120 four ways"), 30);
  assert.equal(E.tryMath("triple h"), null);
  assert.equal(E.tryMath("twenty one plus one"), 22);
  assert.equal(E.tryMath("0.1 + 0.2"), 0.3);
  assert.equal(E.tryMath("7% of 200"), 14);
  assert.match(String(E.tryMath("sqrt 2")), /^1\.414/);
  assert.match((await E.identity("Who created you")).body, /Joshua Trommel/);
  assert.equal(await E.identity("who created the telephone"), null);
  for(const q of ["what's your name", "Are you ChatGPT?", "what model are you", "who made this app", "how do you work"]) assert.match((await E.identity(q)).body, /Joshua Trommel/, q);
  for(const q of ["what is your name in french", "are you open"]) assert.equal(await E.identity(q), null, q);
});

test("geography terms leave everyday words alone", () => {
  for(const q of ["what is a stack", "what is a depression", "what is a cyclone", "what is an arch"]) assert.equal(E.precalc(q), null, q);
  assert.match(E.precalc("if it is 9 am at 75 degrees west what time is it at 0 degrees").body, /^2 pm/);
  assert.match(E.precalc("on a 1:50000 map, 4 cm represents how many kilometres").body, /^2 km/);
});

test("units", () => {
  assert.equal(E.tryConvert("10 km to miles").to, "6.213712");
  assert.equal(E.tryConvert("how many cups in 2 liters").to, "8.453506");
  assert.equal(E.tryConvert("100 c to f").to, "212");
  assert.equal(E.tryConvert("5 kg to miles"), null);
  assert.equal(E.tryConvert("5 usd to eur"), null);
});

test("currency expr", () => {
  assert.deepEqual(E.currencyExpr("100 usd to eur"), {v:100, from:"USD", to:"EUR", pair:false});
  assert.deepEqual(E.currencyExpr("1 euro to usd"), {v:1, from:"EUR", to:"USD", pair:false});
  assert.equal(E.currencyExpr("1 pound to kg"), null);
  assert.equal(E.currencyExpr("100 km to mi"), null);
});

test("graph expr", () => {
  assert.equal(E.graphExpr("plot x^2"), "x^2");
  assert.equal(E.graphExpr("y = sin(x)"), "sin(x)");
  assert.equal(E.graphExpr("plot 2+2"), null);
});

test("app link builder", () => {
  assert.equal(E.appLink("5 miles to km"), "/app?q=5%20miles%20to%20km");
  assert.equal(E.appLink("what is pi?"), "/app?q=what%20is%20pi%3F");
  assert.equal(E.appLink("2^10"), "/app?q=2%5E10");
});

test("first sentence", () => {
  assert.equal(E.first("Tim Cook is CEO. He joined in 1998."), "Tim Cook is CEO.");
  assert.equal(E.first("Ver. 2.0 shipped. Then more."), "Ver. 2.0 shipped.");
});

test("getJSON never throws", async () => {
  assert.equal(await E.getJSON("http://127.0.0.1:1/nope"), null);
  assert.equal(await E.getJSON("https://en.wikipedia.org/api/rest_v1/page/summary/definitely-not-a-page-zz9"), null);
});

test("offline answer kinds", async () => {
  assert.equal((await E.answer("3*3")).kind, "math");
  assert.equal((await E.answer("1 mile to km")).kind, "convert");
});

test("live sources", { skip: !process.env.LIVE }, async () => {
  const cur = await E.answer("100 usd to eur"); assert.equal(cur.kind, "card"); assert.match(cur.big, /^[\d,]+\.\d\d$/);
  assert.equal((await E.answer("weather in Vancouver")).src, "Open-Meteo");
  assert.match((await E.answer("time in Tokyo")).big, /^\d\d:\d\d$/);
  assert.equal((await E.answer("define nimble")).src, "Wiktionary");
  assert.equal((await E.answer("Alan Turing")).kind, "text");
});

test("graph samples offline", () => {
  const pts = E.samplePoints("2x^2");
  assert.equal(pts.length, 201);
  assert.equal(pts[0].y, 200);
  assert.ok(Math.abs(E.samplePoints("3sin(x)")[100].y) < 1e-9);
});

test("a bare domain question reads the site, not Wikipedia", async () => {
  assert.equal(E.siteHost("What\u2019s primitive.dev?"), "primitive.dev");
  assert.equal(E.siteHost("what is https://www.Stripe.com/docs"), "stripe.com");
  assert.equal(E.siteHost("tell me about linear.app"), "linear.app");
  assert.equal(E.siteHost("vercel.com"), "vercel.com");
  assert.equal(E.siteHost("what is node.js"), null);
  assert.equal(E.siteHost("what is e.g. a div"), null);
  assert.equal(E.siteHost("who is the ceo of apple.com in 2020"), null);
  const real = global.fetch;
  global.fetch = async u => new Response(JSON.stringify(/site=primitive\.dev/.test(u) ? {title:"Primitive", description:"Email infrastructure for AI agents."} : {}));
  try {
    const r = await E.site("What's primitive.dev?");
    assert.equal(r.body, "Email infrastructure for AI agents.");
    assert.equal(r.src, "primitive.dev");
    assert.equal(await E.site("what is the moon"), null);
    global.fetch = async () => new Response(JSON.stringify({title:"Acme", h1:"Ship faster", text:"Acme builds tools that help small teams ship software without any ops work at all."}));
    assert.match((await E.site("acme.dev")).body, /^Ship faster\./);
    global.fetch = async () => new Response(JSON.stringify({title:"Acme App", js:true}));
    const spa = await E.site("acme.app");
    assert.equal(spa.body, "This site loads with JavaScript.");
    assert.equal(spa.title, "Acme App");
    assert.equal(spa.icon, "https://www.google.com/s2/favicons?domain=acme.app&sz=64");
    global.fetch = async () => new Response(JSON.stringify({}));
    assert.equal(await E.site("acme.dev"), null);
  } finally { global.fetch = real; }
});

test("spoken powers and roots are math", () => {
  assert.equal(E.tryMath("12 squared"), 144);
  assert.equal(E.tryMath("3 cubed"), 27);
  assert.equal(E.tryMath("cube root of 27"), 3);
  assert.equal(E.tryMath("what is the square root of 16"), 4);
  assert.equal(E.tryMath("sqrt of 81"), 9);
  assert.equal(E.tryMath("what is the capital of france"), null);
});
