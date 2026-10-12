// The photo guard in the web engine, offline: fetch is stubbed per Wikipedia URL. A photo is the picture of an
// entity the answer names. Words in the question never pick one, and no entity means no photo.
const test = require("node:test"), assert = require("node:assert/strict");
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const E = require("../docs/engine.js");

const realFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = realFetch; });

const json = (o) => ({ ok: true, json: async () => o });
const img = (name) => ({ source: `https://upload.wikimedia.org/${name}.jpg`, width: 800, height: 500 });
// pages: title -> summary fields. The search returns searchTitles for the question.
function stub({ searchTitles = [], pages = {} }) {
  globalThis.fetch = async (url) => {
    url = String(url);
    if (url.includes("list=search")) return json({ query: { search: searchTitles.map((title) => ({ title })) } });
    const m = /\/page\/summary\/(.+)$/.exec(url);
    const title = m && decodeURIComponent(m[1]);
    if (title && pages[title]) return json({ title, ...pages[title], content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/" + title } } });
    return { ok: false };
  };
}

test("answerEntities: the answer's names, not the question's, and the particle keeps a name whole", () => {
  assert.deepEqual(E.answerEntities("largest planet", "Jupiter is the largest planet.").map(e => e.name), ["Jupiter"]);
  assert.deepEqual(E.answerEntities("capital of france", "The capital of France is Paris.").map(e => e.name), ["Paris"]);
  assert.deepEqual(E.answerEntities("largest planet", "The largest planet in the Solar System is Jupiter.").map(e => e.name), ["Jupiter"]);
  assert.deepEqual(E.answerEntities("who painted the mona lisa", "Leonardo da Vinci painted it.").map(e => e.name), ["Leonardo da Vinci"]);
  assert.deepEqual(E.answerEntities("the longest river", "The Nile is the longest river.").map(e => e.name), ["Nile"]);
});

test("answerEntities: a date is never an entity, and the echoed entity comes last", () => {
  assert.deepEqual(E.answerEntities("when did the titanic sink", "It sank on April 15, 1912.").map(e => e.name), []);
  const ents = E.answerEntities("when did the titanic sink", "The Titanic sank in April 1912.");
  assert.deepEqual(ents.map(e => [e.name, e.echo]), [["Titanic", true]]);
});

test("largest planet: the Jupiter photo wins over the Earth page the question found", async () => {
  stub({
    searchTitles: ["Earth"],
    pages: {
      Earth: { extract: "Earth is the third planet from the Sun.", thumbnail: img("earth") },
      Jupiter: { extract: "Jupiter is the largest planet in the Solar System.", thumbnail: img("jupiter") },
    },
  });
  const t = await E.topicFor("largest planet", "Jupiter is the largest planet.");
  assert.equal(t.photo.url, "https://upload.wikimedia.org/jupiter.jpg");
  assert.equal(t.photo.title, "Jupiter");
});

test("no entity in the answer: no photo, even when the search page has one", async () => {
  stub({ searchTitles: ["Earth"], pages: { Earth: { extract: "Earth is a planet.", thumbnail: img("earth") } } });
  const t = await E.topicFor("largest planet", "It is the biggest one of all.");
  assert.equal(t?.photo ?? null, null);
});

test("an entity page that never names the entity gives no photo", async () => {
  stub({ pages: { Jupiter: { extract: "A gas giant with a ring system.", thumbnail: img("jupiter") } } });
  const t = await E.topicFor("largest planet", "Jupiter is the largest planet.");
  assert.equal(t?.photo ?? null, null);
});

test("the question\'s own entity never beats the answer\'s: the Mona Lisa is not the photo for Leonardo da Vinci", async () => {
  stub({ pages: {
    "Leonardo da Vinci": { extract: "Leonardo di ser Piero da Vinci was an Italian painter.", thumbnail: img("leonardo") },
    "Mona Lisa": { extract: "The Mona Lisa is a portrait painted by Leonardo.", thumbnail: img("monalisa") },
  } });
  const t = await E.topicFor("who painted the mona lisa", "Leonardo da Vinci painted the Mona Lisa.");
  assert.equal(t.photo.title, "Leonardo da Vinci");
});

test("an echoed entity needs a shared word with the answer: the apple fruit is no photo for a founder answer", async () => {
  stub({ pages: { Apple: { extract: "An apple is a round, edible fruit.", thumbnail: img("apple") } } });
  const t = await E.topicFor("who founded apple", "Apple was founded by Steve Jobs.");
  assert.equal(t?.photo ?? null, null);
});

test("an echoed entity whose page shares an answer word keeps its photo: the Titanic", async () => {
  stub({ pages: { Titanic: { extract: "The RMS Titanic was a liner that sank in 1912.", thumbnail: img("titanic") } } });
  const t = await E.topicFor("when did the titanic sink", "The Titanic sank in 1912.");
  assert.equal(t.photo.title, "Titanic");
});
