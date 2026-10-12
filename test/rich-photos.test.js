// Rich results in the web engine, offline: fetch is stubbed per URL. Photos come from Wikipedia's
// lead image (logos skipped), a site's og:image, each news story, and the proxy's AI answer.
// No photo means today's layout.
const test = require("node:test"), assert = require("node:assert/strict");

// Outside a browser the engine treats consent as "yes", so give it a small localStorage with the choice.
let consent = "no";
globalThis.localStorage = {
  getItem: (k) => (k === "nimble.aiConsent" ? consent : null),
  setItem() {}, removeItem() {},
};
const E = require("../docs/engine.js");

const realFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = realFetch; consent = "no"; });

const json = (o) => ({ ok: true, json: async () => o });
const PHOTO = { source: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ev/Everest.jpg/800px-Everest.jpg", width: 800, height: 533 };
const LOGO = { source: "https://upload.wikimedia.org/wikipedia/en/thumb/b/ba/Eiffel_Tower_logo.svg/330px.png", width: 330, height: 423 };

// Wikipedia search finds the title; the REST summary carries the thumbnail.
function wikiStub(thumbnail, title = "Mount Everest") {
  globalThis.fetch = async (url) => {
    url = String(url);
    if (url.includes("list=search")) return json({ query: { search: [{ title }] } });
    if (url.includes("/page/summary/")) return json({ title, extract: "Mount Everest is the highest mountain above sea level, on the Nepal and China border.", thumbnail, content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Mount_Everest" } } });
    return { ok: false };
  };
}

test("a Wikipedia answer carries its lead photo, with width and height", async () => {
  wikiStub(PHOTO);
  const a = await E.answer("Mount Everest");
  assert.equal(a.kind, "text");
  assert.deepEqual(a.image, { url: PHOTO.source, width: 800, height: 533 });
});

test("a logo is not a photo: the answer keeps its text and drops the picture", async () => {
  wikiStub(LOGO);
  const a = await E.answer("Mount Everest");
  assert.equal(a.kind, "text");
  assert.equal(a.image, null);
});

test("a photo never reaches the answer over plain http", async () => {
  wikiStub({ source: "http://example.com/x.jpg", width: 1, height: 1 });
  const a = await E.answer("Mount Everest");
  assert.equal(a.image, null);
});

test("the card renders the photo on top, with the title as alt text", async () => {
  wikiStub(PHOTO);
  const r = await E.renderAnswer("Mount Everest");
  assert.match(r.h, /<span class="mockup-photo"><img src="https:\/\/upload\.wikimedia\.org[^"]*" alt="Mount Everest" loading="lazy"/);
  assert.ok(r.h.indexOf("mockup-photo") < r.h.indexOf("<p>"), "photo sits above the text");
});

test("alt text is escaped, so a quote in the title cannot break the attribute", async () => {
  wikiStub(PHOTO, 'Mount "Everest"');
  const r = await E.renderAnswer('Mount "Everest"');
  assert.match(r.h, /alt="Mount &quot;Everest&quot;"/);
});

test("no photo means today's layout: no photo element at all", async () => {
  wikiStub(null);
  const r = await E.renderAnswer("Mount Everest");
  assert.doesNotMatch(r.h, /mockup-photo/);
  assert.match(r.h, /<p>Mount Everest is the highest mountain/);
});

test("a site's og:image is the card photo and the favicon steps aside", async () => {
  globalThis.fetch = async (url) => String(url).includes("site=acme.com")
    ? json({ host: "acme.com", title: "Acme", description: "Ship faster with Acme tools.", image: { url: "https://acme.com/share.png", width: null, height: null } })
    : { ok: false };
  const a = await E.answer("what is acme.com");
  assert.equal(a.kind, "text");
  assert.equal(a.image.url, "https://acme.com/share.png");
  assert.equal(a.icon, null);
  const r = await E.renderAnswer("what is acme.com");
  assert.match(r.h, /mockup-photo/);
  assert.doesNotMatch(r.h, /mockup-icon/);
});

test("a site with no og:image keeps the favicon exactly as before", async () => {
  globalThis.fetch = async (url) => String(url).includes("site=acme.com")
    ? json({ host: "acme.com", title: "Acme", description: "Ship faster with Acme tools." })
    : { ok: false };
  const a = await E.answer("what is acme.com");
  assert.ok(!a.image);
  assert.match(a.icon, /google\.com\/s2\/favicons\?domain=acme\.com/);
  const r = await E.renderAnswer("what is acme.com");
  assert.doesNotMatch(r.h, /mockup-photo/);
  assert.match(r.h, /mockup-icon/);
});

test("news: a story with a picture gets a 56px square beside it, the others stay plain", async () => {
  globalThis.fetch = async (url) => String(url).includes("?news=")
    ? json({ items: [
        { title: "Story one", sentence: "First story happened today.", outlet: "BBC", url: "https://www.bbc.com/news/1", image: { url: "https://ichef.bbci.co.uk/a.jpg", width: 240, height: 135 } },
        { title: "Story two", sentence: "Second story happened.", outlet: "CBC", url: "https://www.cbc.ca/news/2", image: null },
      ] })
    : { ok: false };
  const r = await E.renderAnswer("news");
  assert.equal((r.h.match(/class="news-thumb"/g) || []).length, 1);
  assert.match(r.h, /<img class="news-thumb" src="https:\/\/ichef\.bbci\.co\.uk\/a\.jpg" alt="Story one" width="56" height="56"/);
  assert.match(r.h, /<li class="has-thumb">/);
  assert.match(r.h, /<li><div><a href="https:\/\/www\.cbc\.ca\/news\/2"/);
});

test("news: no picture anywhere is today's list", async () => {
  globalThis.fetch = async (url) => String(url).includes("?news=")
    ? json({ items: [{ title: "A", sentence: "A happened.", outlet: "NPR", url: "https://www.npr.org/a" }] })
    : { ok: false };
  const r = await E.renderAnswer("news");
  assert.doesNotMatch(r.h, /news-thumb|has-thumb/);
});

test("the proxy's AI answer keeps its photo, and a non-https photo is dropped", async () => {
  consent = "yes";
  const reply = (image) => async (url, opts) => {
    if (String(url).includes("nimble-answers") && opts && opts.method === "POST")
      return json({ answer: "William Shakespeare wrote Hamlet.", source: "Gemma + Qwen", image });
    return { ok: false };
  };
  globalThis.fetch = reply({ url: "https://upload.wikimedia.org/hamlet.jpg", width: 800, height: 600 });
  const a = await E.answer("who wrote hamlet");
  assert.equal(a.kind, "text");
  assert.equal(a.body, "William Shakespeare wrote Hamlet.");
  assert.deepEqual(a.image, { url: "https://upload.wikimedia.org/hamlet.jpg", width: 800, height: 600 });

  globalThis.fetch = reply({ url: "http://insecure.example/x.jpg", width: 1, height: 1 });
  const b = await E.answer("who wrote hamlet");
  assert.equal(b.body, "William Shakespeare wrote Hamlet.");
  assert.ok(!b.image);
});

test("a numeric AI answer keeps its photo when DDG supplies the sourced number", async () => {
  consent = "yes";
  globalThis.fetch = async (url, opts) => {
    url = String(url);
    if (url.includes("nimble-answers") && opts && opts.method === "POST")
      return json({ answer: "Mount Everest is 8,848.86 meters tall.", source: "Qwen", image: { url: PHOTO.source, width: 800, height: 533 } });
    if (url.includes("nimble-answers") && url.includes("ddg="))
      return json({ Heading: "Mount Everest", AbstractText: "Mount Everest is 8,848 meters tall.", AbstractSource: "Britannica", AbstractURL: "https://www.britannica.com/place/Mount-Everest" });
    return { ok: false };
  };
  const a = await E.answer("how tall is mount everest");
  assert.equal(a.src, "Britannica");
  assert.equal(a.image.url, PHOTO.source);
});

// AI answers (the proxy's sentence, consent given). The proxy sends no photo, so the engine looks for the
// Wikipedia topic the sentence names. Every fetch is routed; anything unlisted is a miss.
function aiStub({ answer, proxyImage = null, proxyExtra = {}, search = [], pages = {} }) {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    url = String(url); calls.push(url);
    if (url.startsWith("https://nimble-answers") && opts?.method === "POST") return json({ answer, source: "Qwen", ...(proxyImage ? { image: proxyImage } : {}), ...proxyExtra });
    if (url.includes("list=search")) return json({ query: { search: search.map((title) => ({ title })) } });
    const m = /\/page\/summary\/(.+)$/.exec(url);
    if (m && pages[decodeURIComponent(m[1])]) {
      const title = decodeURIComponent(m[1]);
      return json({ title, ...pages[title], content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/" + title } } });
    }
    return { ok: false };
  };
  return calls;
}
const PARIS = { thumbnail: PHOTO, extract: "Paris is the capital and most populous city of France. It has a population of over two million people." };

test("an AI answer with no proxy photo takes the Wikipedia topic its sentence names", async () => {
  consent = "yes";
  aiStub({ answer: "The capital of France is Paris.", search: ["List of capitals of France"], pages: { Paris: PARIS } });
  const a = await E.answer("capital of france");
  assert.equal(a.kind, "text");
  assert.deepEqual(a.image, { url: PHOTO.source, width: 800, height: 533, title: "Paris" });
});

test("the photo credit names the page and the Why expander opens the page's text", async () => {
  consent = "yes";
  aiStub({ answer: "The capital of France is Paris.", search: [], pages: { Paris: PARIS } });
  const r = await E.renderAnswer("capital of france");
  assert.match(r.h, /<span class="photo-credit">Paris · Wikipedia<\/span>/);
  assert.match(r.h, /<details class="why">/);
  assert.match(r.h, /<p>Paris is the capital and most populous city of France\./);
});

test("the proxy's photo wins, and the topic still supplies the grounding and its link", async () => {
  consent = "yes";
  const calls = aiStub({ answer: "The capital of France is Paris.", proxyImage: { url: "https://example.org/p.jpg" }, pages: { Paris: PARIS } });
  const a = await E.answer("capital of france");
  assert.equal(a.image.url, "https://example.org/p.jpg");
  assert.equal(a.image.title, undefined);
  assert.equal(a.grounding, PARIS.extract);
  assert.equal(a.groundingUrl, "https://en.wikipedia.org/wiki/Paris");
  assert.ok(calls.some((u) => u.includes("/page/summary/Paris")));
  const r = await E.renderAnswer("capital of france");
  assert.match(r.h, /<details class="why">/);
  assert.match(r.h, /<a href="https:\/\/en\.wikipedia\.org\/wiki\/Paris" target="_blank" rel="noopener">Paris \u00B7 Wikipedia<\/a>/);
  assert.doesNotMatch(r.h.slice(r.h.indexOf("<details")), /duckduckgo/, "the Why link goes to the Wikipedia page, not a search");
});

test("a topic with text but no picture gives grounding and no image", async () => {
  consent = "yes";
  aiStub({ answer: "The capital of France is Paris.", search: [], pages: { Paris: { extract: PARIS.extract } } });
  const a = await E.answer("capital of france");
  assert.equal(a.image, undefined);
  assert.equal(a.grounding, PARIS.extract);
  assert.equal(a.groundingTitle, "Paris");
});

const DIAGRAM = { source: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Photosynthesis_en.svg/330px-Photosynthesis_en.svg.png", width: 330, height: 330 };
const PHOTOSYNTHESIS = "Photosynthesis is a system of biological processes by which organisms convert light energy into chemical energy.";

test("photosynthesis: the lead image is an SVG diagram, so its PNG render is the photo, credited to the page", async () => {
  consent = "yes";
  aiStub({ answer: "Photosynthesis turns light into chemical energy.", search: ["Photosynthesis"], pages: { Photosynthesis: { thumbnail: DIAGRAM, extract: PHOTOSYNTHESIS } } });
  const a = await E.answer("what is photosynthesis");
  assert.deepEqual(a.image, { url: DIAGRAM.source, width: 330, height: 330, title: "Photosynthesis" });
  assert.match(a.grounding, /^Photosynthesis is a system/);
  assert.equal(a.groundingTitle, "Photosynthesis");
  const r = await E.renderAnswer("what is photosynthesis");
  assert.match(r.h, /<span class="photo-credit">Photosynthesis · Wikipedia<\/span>/);
});

test("the SVG fallback takes only a rendered raster: a raw .svg is never a photo", async () => {
  consent = "yes";
  const RAW = { source: "https://upload.wikimedia.org/wikipedia/commons/5/55/Photosynthesis_en.svg", width: 330, height: 330 };
  aiStub({ answer: "Photosynthesis turns light into chemical energy.", search: ["Photosynthesis"], pages: { Photosynthesis: { thumbnail: RAW, extract: PHOTOSYNTHESIS } } });
  const a = await E.answer("what is photosynthesis");
  assert.equal(a.image, undefined);
  assert.match(a.grounding, /^Photosynthesis is a system/, "the text still grounds the answer");
});

test("the Hamlet proxy photo is credited to its on-topic Wikipedia page", async () => {
  consent = "yes";
  const HAMLET_PIC = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Hamlet_skull.jpg/800px-Hamlet_skull.jpg";
  const refs = [
    { title: "William Shakespeare", url: "https://en.wikipedia.org/wiki/William_Shakespeare", extract: "William Shakespeare was an English playwright. He wrote Hamlet." },
    { title: "Hamlet", url: "https://en.wikipedia.org/wiki/Hamlet", extract: "Hamlet is a tragedy written by William Shakespeare." },
  ];
  globalThis.fetch = async (url, opts) => (String(url).startsWith("https://nimble-answers") && opts?.method === "POST")
    ? json({ answer: "William Shakespeare wrote Hamlet.", source: "Qwen", image: { url: HAMLET_PIC, width: 800, height: 600 }, refs })
    : { ok: false };
  const a = await E.answer("who wrote hamlet");
  assert.equal(a.image.url, HAMLET_PIC);
  assert.equal(a.image.title, "Hamlet");
  const r = await E.renderAnswer("who wrote hamlet");
  assert.match(r.h, /<span class="photo-credit">Hamlet · Wikipedia<\/span>/);
});

test("the proxy photo gets no credit when no Wikipedia page on the answer's topic names it", async () => {
  consent = "yes";
  aiStub({ answer: "The capital of France is Paris.", proxyImage: { url: "https://example.org/p.jpg" }, pages: {} });
  const a = await E.answer("capital of france");
  assert.equal(a.image.url, "https://example.org/p.jpg");
  assert.equal(a.image.title, undefined);
});

test("a topic whose only picture is a logo gives the answer no photo", async () => {
  consent = "yes";
  aiStub({ answer: "The capital of France is Paris.", search: [], pages: { Paris: { thumbnail: LOGO, extract: "Paris." } } });
  const a = await E.answer("capital of france");
  assert.equal(a.image, undefined);
});

test("weather, time and math never look for a photo", async () => {
  consent = "yes";
  const calls = aiStub({ answer: "It is 5 degrees in Vancouver.", search: ["Vancouver"], pages: { Vancouver: PARIS } });
  const a = await E.answer("weather in vancouver");
  assert.equal(a.image, undefined);
  assert.equal(calls.filter((u) => u.includes("/page/summary/")).length, 0);
});

// The proxy names its Wikipedia page in topic and topicUrl. That page credits the photo and gives the Why text.
test("the proxy topic credits its photo, and its refs extract gives the Why text", async () => {
  consent = "yes";
  const refs = [{ title: "Hamlet", url: "https://en.wikipedia.org/wiki/Hamlet", extract: "Hamlet is a tragedy written by William Shakespeare around 1600. It follows a prince of Denmark." }];
  aiStub({ answer: "Hamlet was written by William Shakespeare.", proxyImage: { url: "https://upload.wikimedia.org/h.jpg", width: 800, height: 600 },
    proxyExtra: { topic: "Hamlet", topicUrl: "https://en.wikipedia.org/wiki/Hamlet", refs } });
  const a = await E.answer("who wrote hamlet");
  assert.equal(a.image.title, "Hamlet");
  assert.equal(a.grounding, refs[0].extract);
  assert.equal(a.groundingTitle, "Hamlet");
  assert.equal(a.groundingUrl, "https://en.wikipedia.org/wiki/Hamlet");
  const r = await E.renderAnswer("who wrote hamlet");
  assert.match(r.h, /<span class="photo-credit">Hamlet · Wikipedia<\/span>/);
  assert.match(r.h, /<a href="https:\/\/en\.wikipedia\.org\/wiki\/Hamlet" target="_blank" rel="noopener">Hamlet · Wikipedia<\/a>/);
});

test("a proxy topic beats the on-topic guess for the credit", async () => {
  consent = "yes";
  const refs = [{ title: "Hamlet (1948 film)", url: "https://en.wikipedia.org/wiki/Hamlet_(1948_film)", extract: "Hamlet is a 1948 film directed by Laurence Olivier." },
    { title: "Hamlet", url: "https://en.wikipedia.org/wiki/Hamlet", extract: "Hamlet is a tragedy by William Shakespeare." }];
  aiStub({ answer: "Hamlet was written by William Shakespeare.", proxyImage: { url: "https://upload.wikimedia.org/h.jpg" },
    proxyExtra: { topic: "Hamlet", topicUrl: "https://en.wikipedia.org/wiki/Hamlet", refs } });
  const a = await E.answer("who wrote hamlet");
  assert.equal(a.image.title, "Hamlet");
  assert.equal(a.groundingUrl, "https://en.wikipedia.org/wiki/Hamlet");
});

test("a proxy topic with a non-Wikipedia link is ignored and the on-topic fallback still credits", async () => {
  consent = "yes";
  const refs = [{ title: "Hamlet", url: "https://en.wikipedia.org/wiki/Hamlet", extract: "Hamlet is a tragedy by William Shakespeare." }];
  aiStub({ answer: "Hamlet was written by William Shakespeare.", proxyImage: { url: "https://upload.wikimedia.org/h.jpg" },
    proxyExtra: { topic: "Hamlet", topicUrl: "https://evil.example/Hamlet", refs } });
  const a = await E.answer("who wrote hamlet");
  assert.equal(a.image.title, "Hamlet");
  assert.notEqual(a.groundingUrl, "https://evil.example/Hamlet");
});

test("an old proxy with no topic fields keeps the on-topic credit", async () => {
  consent = "yes";
  const refs = [{ title: "Hamlet", url: "https://en.wikipedia.org/wiki/Hamlet", extract: "Hamlet is a tragedy by William Shakespeare." }];
  aiStub({ answer: "Hamlet was written by William Shakespeare.", proxyImage: { url: "https://upload.wikimedia.org/h.jpg" }, proxyExtra: { refs } });
  const a = await E.answer("who wrote hamlet");
  assert.equal(a.image.title, "Hamlet");
});
