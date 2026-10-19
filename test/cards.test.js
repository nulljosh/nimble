// Weather, currency and local time come back as cards, not sentences. Offline: fetch is stubbed
// with canned Open-Meteo and Frankfurter JSON, localStorage is a Map, nothing leaves the machine.
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("../docs/engine.js");

const realFetch = globalThis.fetch;
const canned = {
  "geocoding-api.open-meteo.com": { results: [{ name: "Vancouver", country: "Canada", latitude: 49.25, longitude: -123.12, timezone: "America/Vancouver" }] },
  "api.open-meteo.com": { current: { temperature_2m: 11.6, weather_code: 3, wind_speed_10m: 12.2 } },
  "api.frankfurter.dev": { base: "USD", rates: { CAD: 1.3712 } },
  "wordroot.jaybulb.com": { word: "nimble", language: "English", etymology: [{ relation: "derived", langCode: "enm", ancestor: "nymyl" }] },
};

function setup() {
  const store = new Map();
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  globalThis.fetch = async url => {
    const body = canned[new URL(url).host];
    return body ? { ok: true, json: async () => body } : { ok: false };
  };
}
function teardown() { delete globalThis.localStorage; globalThis.fetch = realFetch; }

test("weather is a card", async () => {
  setup();
  try {
    const a = await E.answer("weather in Vancouver");
    const { asOf, ...weatherCard } = a; // the time it was asked is checked on its own: it is the clock
    assert.ok(!isNaN(Date.parse(asOf)));
    assert.deepEqual(weatherCard, { kind: "card", big: "12", unit: "°C", sub: "Vancouver, Canada, overcast, wind 12 km/h", src: "Open-Meteo", url: "https://open-meteo.com" });
    const r = await E.renderAnswer("weather in Vancouver");
    assert.match(r.h, /mockup-big num">12 °C</);
    assert.match(r.h, /<p class="num">Vancouver, Canada, overcast, wind 12 km\/h<\/p>/);
    assert.equal(r.credit, "powered by Open-Meteo");
    assert.equal(r.kind, "card");
  } finally { teardown(); }
});

test("currency is a card", async () => {
  setup();
  try {
    const a = await E.answer("100 usd to cad");
    assert.deepEqual(a, { kind: "card", big: "137.12", unit: "CAD", sub: "100 USD at today's rate", src: "Frankfurter", url: "https://frankfurter.dev" });
    const r = await E.renderAnswer("100 usd to cad");
    assert.match(r.h, /mockup-big num">137\.12 CAD</);
    assert.match(r.h, /<p class="num">100 USD at today's rate<\/p>/);
    assert.equal(r.credit, "powered by Frankfurter");
  } finally { teardown(); }
});

test("local time is a card, from the device's zone list with no network", async () => {
  setup();
  globalThis.fetch = async () => { throw new Error("no network"); };
  try {
    const a = await E.answer("time in Vancouver");
    assert.equal(a.kind, "card");
    assert.match(a.big, /^\d\d:\d\d$/);
    assert.equal(a.unit, "Vancouver");
    assert.match(a.sub, /^\w+, \w+ \d+, America\/Vancouver$/);
    assert.equal(a.src, "IANA time zones");
    assert.equal((await E.answer("what time is it in new york")).unit, "New York");
  } finally { teardown(); }
});

test("a place the zone list does not name goes to the geocoder", async () => {
  setup();
  try {
    const a = await E.answer("time in Whistler");
    assert.equal(a.src, "Open-Meteo");
    assert.match(a.sub, /America\/Vancouver$/);
    const r = await E.renderAnswer("time in Whistler");
    assert.match(r.h, /href="https:\/\/open-meteo\.com"/);
  } finally { teardown(); }
});

test("a failed lookup is not a card", async () => {
  setup();
  globalThis.fetch = async () => ({ ok: false });
  try { assert.notEqual((await E.answer("weather in Nowhere", { ifUnset: "no" })).kind, "card"); }
  finally { teardown(); }
});

test("etymology is a card", async () => {
  setup();
  try {
    const a = await E.answer("etymology of nimble");
    assert.deepEqual(a, { kind: "card", big: "nimble", unit: "", sub: "Derived from nymyl, Middle English", src: "Wordroot", url: "https://wordroot.jaybulb.com/#search=nimble" });
    const r = await E.renderAnswer("etymology of nimble");
    assert.match(r.h, /mockup-big num">nimble</);
    assert.match(r.h, /<p class="num">Derived from nymyl, Middle English<\/p>/);
    assert.equal(r.credit, "powered by Wordroot");
    assert.equal(r.kind, "card");
  } finally { teardown(); }
});

test("etymology matches origin, root, where does the word patterns", async () => {
  setup();
  try {
    const tests = ["origin of nimble", "etymology of nimble", "root of nimble", "where does the word nimble come from"];
    for (const q of tests) {
      const a = await E.answer(q);
      assert.equal(a.kind, "card", `Failed for: ${q}`);
      assert.equal(a.big, "nimble");
    }
  } finally { teardown(); }
});

test("'vancouver weather' is a weather card too, with the next 12 hours as a range", async () => {
  setup();
  const cur = canned["api.open-meteo.com"];
  canned["api.open-meteo.com"] = { ...cur, hourly: { temperature_2m: [11.6, 9.4, 8.2, 12.1] } };
  try {
    const a = await E.answer("vancouver weather");
    assert.equal(a.kind, "card");
    assert.match(a.sub, /next 12 h 8 to 12°C$/);
    assert.notEqual((await E.answer("how is the weather")).src, "Open-Meteo");
  } finally { canned["api.open-meteo.com"] = cur; teardown(); }
});

test("currency offline falls back to the last saved rate, labelled with its day", async () => {
  setup();
  try {
    const live = await E.answer("100 usd to cad");
    assert.equal(live.big, "137.12");
    globalThis.fetch = async () => ({ ok: false });
    const off = await E.answer("100 usd to cad");
    assert.equal(off.big, "137.12");
    assert.match(off.sub, /last saved rate/);
    assert.equal(off.asOfDay, true);
  } finally { teardown(); }
});

test("number facts offline: factorials exactly, bases in capitals, nothing else", () => {
  assert.equal(E.numberFact("7 factorial"), "5,040");
  assert.equal(E.numberFact("7!"), "5,040");
  assert.equal(E.numberFact("factorial of 20"), "2,432,902,008,176,640,000");
  assert.equal(E.numberFact("255 in binary"), "11111111");
  assert.equal(E.numberFact("255 in hex"), "FF");
  assert.equal(E.numberFact("8 to octal"), "10");
  assert.equal(E.numberFact("21 factorial"), null);
  assert.equal(E.numberFact("7 dogs"), null);
  assert.equal(E.numberFact("10 km to miles"), null);
});
