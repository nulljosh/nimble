// Weather, currency and local time come back as cards, not sentences. Offline: fetch is stubbed
// with canned Open-Meteo and Frankfurter JSON, localStorage is a Map, nothing leaves the machine.
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("../docs/engine.js");

const realFetch = globalThis.fetch;
const canned = {
  "geocoding-api.open-meteo.com": { results: [{ name: "Vancouver", country: "Canada", latitude: 49.25, longitude: -123.12, timezone: "America/Vancouver" }] },
  "api.open-meteo.com": { current: { temperature_2m: 11.6, weather_code: 3, wind_speed_10m: 12.2 } },
  "api.frankfurter.dev": { base: "USD", rates: { CAD: 1.3712 } },
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
    assert.deepEqual(a, { kind: "card", big: "12", unit: "°C", sub: "Vancouver, Canada, overcast, wind 12 km/h", src: "Open-Meteo", url: "https://open-meteo.com" });
    const r = await E.renderAnswer("weather in Vancouver");
    assert.match(r.h, /mockup-big">12°C</);
    assert.match(r.h, /<p>Vancouver, Canada, overcast, wind 12 km\/h<\/p>/);
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
    assert.match(r.h, /mockup-big">137\.12 CAD</);
    assert.match(r.h, /<p>100 USD at today's rate<\/p>/);
    assert.equal(r.credit, "powered by Frankfurter");
  } finally { teardown(); }
});

test("local time is a card", async () => {
  setup();
  try {
    const a = await E.answer("time in Vancouver");
    assert.equal(a.kind, "card");
    assert.match(a.big, /^\d\d:\d\d$/);
    assert.equal(a.unit, "Vancouver");
    assert.match(a.sub, /^\w+, \w+ \d+, America\/Vancouver$/);
    assert.equal(a.src, "Open-Meteo");
    const r = await E.renderAnswer("time in Vancouver");
    assert.match(r.h, /mockup-big">\d\d:\d\d Vancouver</);
    assert.match(r.h, /href="https:\/\/open-meteo\.com"/);
  } finally { teardown(); }
});

test("a failed lookup is not a card", async () => {
  setup();
  globalThis.fetch = async () => ({ ok: false });
  try { assert.notEqual((await E.answer("weather in Nowhere", { ifUnset: "no" })).kind, "card"); }
  finally { teardown(); }
});
