// isTimeSensitive decides when a text answer shows its "as of" line. Same word lists and same queries as the Swift and Kotlin tests.
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("../docs/engine.js");

const TIME_SENSITIVE = [
  "who is the current prime minister of canada",
  "who is the ceo of apple",
  "current president of france",
  "latest iphone",
  "population of japan",
  "who holds the world record for the 100m",
  "who won the last world cup",
  "who is the premier of ontario",
  "what is the price of gold",
  "who is the mayor of vancouver",
  "who is the governor of california",
  "who is the leader of the opposition",
  "who is the champion of wimbledon",
  "what is the population of canada now",
  "what is the price of bitcoin today",
  "who is the incumbent senator for texas",
  "what is the newest macbook",
  "how much does a tesla model 3 cost",
];
const HISTORY_OR_TIMELESS = [
  "who was the first president of the united states",
  "when was the eiffel tower built",
  "when was abraham lincoln born",
  "who discovered penicillin",
  "who invented the telephone",
  "what is the capital of france",
  "what is the speed of light",
  "how tall is mount everest",
  "who was the first prime minister of canada",
  "what year did world war 2 end",
];

test("time-sensitive questions are true", () => {
  for (const q of TIME_SENSITIVE) assert.equal(E.isTimeSensitive(q), true, q);
});

test("history and timeless questions are false", () => {
  for (const q of HISTORY_OR_TIMELESS) assert.equal(E.isTimeSensitive(q), false, q);
});

test("the rule ignores case and tolerates empty input", () => {
  assert.equal(E.isTimeSensitive("Who Is The CEO of Apple"), true);
  assert.equal(E.isTimeSensitive(""), false);
  assert.equal(E.isTimeSensitive(undefined), false);
});

test("a live text answer to a time-sensitive question shows the as-of line, a timeless one does not", () => {
  const body = "Mark Carney is the prime minister of Canada.";
  const stub = (query, asOf) => ({ kind: "text", title: "Prime minister", body, src: "Gemma", url: "https://en.wikipedia.org/wiki/Prime_minister", sources: [], ...(asOf ? { asOf } : {}) });
  const fresh = E.renderAnswer("who is the current prime minister of canada", { scripted: stub("x", "2026-10-12T19:41:00Z") });
  return fresh.then(r => {
    assert.match(r.h, /<p class="as-of num">as of Oct 12, \d{1,2}:\d{2} [ap]m<\/p>/);
    return E.renderAnswer("who was the first president of the united states", { scripted: stub("x") });
  }).then(r => {
    assert.doesNotMatch(r.h, /as-of/);
  });
});
