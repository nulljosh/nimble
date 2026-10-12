// The news card's worker route, offline: fetch is stubbed with canned RSS per host.
// Covers CDATA, HTML descriptions, entities, double-encoded entities, dropped javascript: links,
// em dashes, a dead feed, outlet interleaving and place filtering.
import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/worker.js";

const realFetch = globalThis.fetch;
const rss = items => `<?xml version="1.0"?><rss><channel>${items.map(i => `<item>${i}</item>`).join("")}</channel></rss>`;
const feeds = {
  "feeds.bbci.co.uk": rss([
    `<title>Ceasefire talks resume in Cairo</title><link>https://www.bbc.com/news/1</link><description>Negotiators met again on Tuesday in the Egyptian capital. Details stayed private.</description>`,
    `<title>Markets close higher</title><link>https://www.bbc.com/news/2</link><description>Stocks rose.</description>`,
  ]),
  "www.cbc.ca": rss([
    `<title><![CDATA[Vancouver rain &amp; wind warning]]></title><link>https://www.cbc.ca/news/3</link><description><![CDATA[<img src="x.jpg"/><p>Heavy rain is expected in Vancouver through Friday &amp; the weekend.</p>]]></description>`,
    `<title>Double encoded</title><link>https://www.cbc.ca/news/4</link><description>Caf&amp;amp;eacute; opens &amp;lt;b&amp;gt; in town today ok.</description>`,
    `<title>Bad link</title><link>javascript:alert(1)</link><description>Should never show up.</description>`,
  ]),
  "feeds.npr.org": rss([
    `<title>Senate passes budget — finally</title><link>https://www.npr.org/5</link><description>The vote was close — 51 to 49 — and late on Thursday night.</description>`,
  ]),
  "www.theguardian.com": "<html>not a feed</html>",
};

function stub(overrides = {}) {
  globalThis.fetch = async url => {
    const u = new URL(url);
    if (overrides[u.host]) return overrides[u.host](u);
    if (u.host === "globalnews.ca") throw new Error("network down");
    const body = feeds[u.host];
    if (body === undefined) return { ok: false, text: async () => "" };
    return { ok: true, text: async () => body };
  };
}
const call = async q => {
  const r = await worker.fetch(new Request(`https://w.example/?news=${encodeURIComponent(q)}`), {});
  assert.equal(r.status, 200);
  return r.json();
};
test.afterEach(() => { globalThis.fetch = realFetch; });

test("world news: three items, outlets interleaved, clean text", async () => {
  stub();
  const { items } = await call("");
  assert.equal(items.length, 3);
  assert.deepEqual(items.map(i => i.outlet), ["BBC", "CBC", "NPR"]);
  assert.equal(items[0].sentence, "Negotiators met again on Tuesday in the Egyptian capital.");
  assert.equal(items[0].url, "https://www.bbc.com/news/1");
  assert.equal(items[1].title, "Vancouver rain & wind warning");
  assert.equal(items[1].sentence, "Heavy rain is expected in Vancouver through Friday & the weekend.");
  assert.equal(items[2].title, "Senate passes budget, finally");
  assert.equal(items[2].sentence, "The vote was close, 51 to 49, and late on Thursday night.");
  for (const i of items) {
    assert.doesNotMatch(JSON.stringify(i), /[–—]/);
    assert.match(i.url, /^https?:\/\//);
  }
});

test("double-encoded entities and javascript links are dropped", async () => {
  stub();
  const { items } = await call("");
  assert.equal(items.some(i => i.url.startsWith("javascript:")), false);
  assert.equal(items.some(i => /Should never show up/.test(i.sentence)), false);
});

test("a place keeps only items that name it, and tops up from Google News", async () => {
  stub({
    "news.google.com": u => {
      assert.equal(u.searchParams.get("q"), "Vancouver");
      return { ok: true, text: async () => rss([
        `<title>Ferry delays hit Vancouver commuters - The Province</title><link>https://theprovince.com/ferry</link><source url="https://theprovince.com">The Province</source><description>Sailings cut.</description>`,
      ]) };
    },
  });
  const { items } = await call("Vancouver");
  assert.equal(items.length, 2);
  assert.equal(items[0].outlet, "CBC");
  assert.equal(items[0].title, "Vancouver rain & wind warning");
  assert.equal(items[1].outlet, "The Province");
  assert.equal(items[1].title, "Ferry delays hit Vancouver commuters");
  assert.equal(items.some(i => /Cairo|budget/.test(i.title)), false);
});

test("a place with no matches returns nothing rather than unrelated headlines", async () => {
  stub({ "news.google.com": () => ({ ok: false, text: async () => "" }) });
  const { items } = await call("Atlantis");
  assert.deepEqual(items, []);
});

test("every feed down gives an empty list, not an error", async () => {
  globalThis.fetch = async () => { throw new Error("offline"); };
  const { items } = await call("");
  assert.deepEqual(items, []);
});
