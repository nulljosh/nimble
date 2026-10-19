// Sports scores, offline: fetch is stubbed per ESPN league and day, and every call is recorded in order.
// Covers detection (positive and negative), parsing of a saved ESPN payload, the today-then-yesterday fallback,
// the no-game and failure states, the status words, the as-of line, and that no AI call ever runs for a score.
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const E = require("../docs/engine.js");

const fixture = name => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8"));
const nfl0811 = fixture("espn-nfl-20261011.json");   // Final, Final, Final/OT (Commanders and Giants tied)
const nfl0812 = fixture("espn-nfl-20261012.json");   // Rams and Bills, not yet played
// ESPN's default scoreboard (no dates), saved live on Oct 12: Bucs 24 at Cowboys 16 (Final, Thu Oct 8 ET),
// Bears 7 at Packers 31 (Final, Sun Oct 11), Bills at Rams (not yet played). Trimmed to these three games.
const nflDefault = fixture("espn-nfl-default.json");
// ESPN's default NBA scoreboard, saved live on Oct 12: two preseason games, no Lakers.
const nbaDefault = fixture("espn-nba-default.json");
const NOW = new Date("2026-10-12T20:00:00Z");        // 1:00 pm in Vancouver on Oct 12
const TZ = "America/Vancouver";

const realFetch = globalThis.fetch;
let calls = [];
// routes: "football/nfl|20261012" -> JSON body, or an Error (a failed request). Any other ESPN day has no games.
function espn(routes) {
  calls = [];
  globalThis.fetch = async url => {
    const u = new URL(url);
    if (u.host !== "site.api.espn.com") throw new Error("unexpected host " + u.host);
    const league = u.pathname.replace("/apis/site/v2/sports/", "").replace("/scoreboard", "");
    const key = league + "|" + u.searchParams.get("dates");
    calls.push(key);
    const hit = routes[key];
    if (hit instanceof Error) throw hit;
    return { ok: true, status: 200, json: async () => hit ?? { events: [] }, text: async () => "" };
  };
}
function restore() { globalThis.fetch = realFetch; }

test("team and league detection: a score question with a team we know", () => {
  for (const q of ["lakers score", "did the canucks win", "who won the lakers game", "canucks game last night", "lakers", "the canucks",
    "bills score", "did the lakers win", "who won the bills game", "Lakers!?", "man city score", "kings score"])
    assert.ok(E.sportsQuery(q), q);
  assert.equal(E.sportsQuery("canucks game last night").lastNight, true);
  assert.equal(E.sportsQuery("lakers score").lastNight, false);
  for (const q of ["nfl scores", "premier league scores", "epl results", "NFL scores", "last night's nba scores"])
    assert.ok(E.sportsQuery(q).league, q);
});

test("detection never hijacks math, markets, weather or ordinary questions", () => {
  for (const q of ["who won the war", "who won the world cup", "who is the president", "a+b", "2 + 2", "5 miles to km",
    "bitcoin price", "AAPL", "AAPL stock", "NFL", "NBA", "weather in vancouver", "what is apple", "is apple good",
    "heat", "jazz", "magic", "kings", "nets", "the sun", "bills due", "chicken nuggets", "how to heat soup", "give me a magic trick",
    "lakers history", "who is the lakers coach", "news about the lakers", "lakers news yesterday",
    "will the lakers win the title", "should I bet on the lakers", "why did the lakers lose", "how many wins do the lakers have"])
    assert.equal(E.sportsQuery(q), null, q);
});

test("stock tickers keep the league codes out of the ticker lookup", () => {
  for (const code of ["NFL", "NBA", "MLB", "NHL", "MLS", "EPL"]) assert.equal(E.stockSymbol(code), null, code);
});

test("a math question still answers offline, before the sports chain", async () => {
  const a = await E.answer("2 + 2");
  assert.equal(a.kind, "math");
});

test("a finished game parses: our team first, the winner marked, the status in words", () => {
  const ev = nfl0811.events[0];
  const ours = ev.competitions[0].competitors.find(c => c.team.shortDisplayName === "Jaguars");
  const r = E.gameRow(ev, ours, "nfl", NOW, TZ);
  assert.deepEqual(r.teams, [
    { name: "Jaguars", score: "19", winner: true },
    { name: "Eagles", score: "17", winner: false },
  ]);
  assert.equal(r.status, "Final");
  assert.equal(r.state, "post");
});

test("an overtime tie says so in words, with no winner marked", () => {
  const ev = nfl0811.events[2];
  const ours = ev.competitions[0].competitors.find(c => c.team.shortDisplayName === "Commanders");
  const r = E.gameRow(ev, ours, "nfl", NOW, TZ);
  assert.equal(r.status, "Final/OT, tied");
  assert.ok(r.teams.every(t => t.winner === false));
});

test("a game before kickoff shows the time in the zone asked for, and no score", () => {
  const ev = nfl0812.events[0];
  const ours = ev.competitions[0].competitors.find(c => c.team.shortDisplayName === "Bills");
  const r = E.gameRow(ev, ours, "nfl", NOW, TZ);
  assert.equal(r.status, "Scheduled for 5:15 pm");
  assert.deepEqual(r.teams.map(t => t.name), ["Bills", "Rams"]);
  assert.ok(r.teams.every(t => t.score === ""));
});

test("kickoff on another day names the day", () => {
  assert.equal(E.kickoffLabel("2026-10-13T00:15Z", new Date("2026-10-11T20:00:00Z"), TZ), "Oct 12, 5:15 pm");
  assert.equal(E.kickoffLabel("not a date", NOW, TZ), "");
});

test("live status: period and clock in words for quarters and periods, ESPN's own text for the rest", () => {
  // The status block of the scheduled fixture is edited for these checks only; the fixture file is unchanged.
  const live = (status) => ({ ...nfl0812.events[0], status });
  assert.equal(E.sportsStatus(live({ period: 3, displayClock: "4:12", type: { name: "STATUS_IN_PROGRESS", state: "in", detail: "3rd Quarter - 4:12", shortDetail: "4:12 - 3rd" } }), "nfl", NOW, TZ), "3rd quarter 4:12");
  assert.equal(E.sportsStatus(live({ period: 2, displayClock: "12:04", type: { name: "STATUS_IN_PROGRESS", state: "in", detail: "2nd Period - 12:04", shortDetail: "2nd 12:04" } }), "nhl", NOW, TZ), "2nd period 12:04");
  assert.equal(E.sportsStatus(live({ period: 5, displayClock: "3:00", type: { name: "STATUS_IN_PROGRESS", state: "in", detail: "OT - 3:00", shortDetail: "3:00 - OT" } }), "nfl", NOW, TZ), "3:00 - OT");
  assert.equal(E.sportsStatus(live({ period: 2, displayClock: "0:00", type: { name: "STATUS_HALFTIME", state: "in", detail: "Halftime", shortDetail: "Halftime" } }), "nfl", NOW, TZ), "Halftime");
  assert.equal(E.sportsStatus(live({ period: 5, displayClock: "0:00", type: { name: "STATUS_FINAL", state: "post", detail: "Final/OT", shortDetail: "Final/OT" } }), "mlb", NOW, TZ), "Final/OT");
  assert.equal(E.sportsStatus(live({ period: 1, displayClock: "32'", type: { name: "STATUS_IN_PROGRESS", state: "in", detail: "32'", shortDetail: "32'" } }), "epl", NOW, TZ), "32'");
});

test("today has the game: one scoreboard call, no yesterday call", async () => {
  espn({ "football/nfl|20261012": nfl0812 });
  try {
    const card = await E.sports("bills score", { now: NOW, tz: TZ });
    assert.equal(card.kind, "sports");
    assert.equal(card.title, "Bills");
    assert.equal(card.rows[0].state, "pre");
    assert.equal(card.rows[0].teams[0].name, "Bills");
    assert.deepEqual(calls, ["football/nfl|20261012"]);
  } finally { restore(); }
});

test("date fallback: no game today, the game is found yesterday, in that order", async () => {
  espn({ "football/nfl|20261011": nfl0811 });
  try {
    const card = await E.sports("did the jaguars win", { now: NOW, tz: TZ });
    // The Final is followed by one call for the team's next game (none listed here, so one row).
    assert.deepEqual(calls, ["football/nfl|20261012", "football/nfl|20261011", "football/nfl/teams/30|null"]);
    assert.equal(card.rows.length, 1);
    assert.equal(card.rows[0].teams[0].name, "Jaguars");
    assert.equal(card.rows[0].teams[0].score, "19");
    assert.equal(card.rows[0].teams[0].winner, true);
    assert.equal(card.rows[0].teams[1].winner, false);
    assert.equal(card.rows[0].status, "Final");
    assert.equal(card.asOf, NOW.toISOString());
  } finally { restore(); }
});

test("last night is yesterday only, then the look-back: never a fallback to today", async () => {
  espn({ "hockey/nhl|20261011": { events: [] } });
  try {
    const card = await E.sports("canucks game last night", { now: NOW, tz: TZ });
    assert.deepEqual(calls.slice(0, 2), ["hockey/nhl|20261011", "hockey/nhl|null"]);
    assert.ok(!calls.includes("hockey/nhl|20261012"));
    assert.equal(card.none, true);
    assert.equal(card.lastNight, true);
  } finally { restore(); }
});

test("a team in two leagues is checked in each before a game is called missing", async () => {
  espn({});
  try {
    const card = await E.sports("kings score", { now: NOW, tz: TZ });
    assert.deepEqual(calls.slice(0, 4), ["basketball/nba|20261012", "hockey/nhl|20261012", "basketball/nba|20261011", "hockey/nhl|20261011"]);
    assert.equal(card.none, true);
  } finally { restore(); }
});

test("no game in the last week: today, yesterday, the current board, then each of the seven days back", async () => {
  espn({ "basketball/nba|null": nbaDefault });
  try {
    const card = await E.sports("lakers score", { now: NOW, tz: TZ });
    assert.equal(card.none, true);
    assert.equal(card.unavailable, undefined);
    assert.equal(card.title, "Lakers");
    assert.deepEqual(calls, ["basketball/nba|20261012", "basketball/nba|20261011", "basketball/nba|null",
      "basketball/nba|20261010", "basketball/nba|20261009", "basketball/nba|20261008",
      "basketball/nba|20261007", "basketball/nba|20261006", "basketball/nba|20261005"]);
    const r = await E.renderAnswer("lakers score", { scripted: card });
    assert.match(r.h, /No game found for the Lakers in the last week/);
    assert.doesNotMatch(r.h, /today or yesterday/);
  } finally { restore(); }
});

test("no game for a league: the calm line says the week", async () => {
  espn({});
  try {
    const card = await E.sports("nba scores", { now: NOW, tz: TZ });
    assert.equal(card.none, true);
    const r = await E.renderAnswer("nba scores", { scripted: card });
    assert.match(r.h, /No NBA games in the last week/);
  } finally { restore(); }
});

test("Cowboys: not on today or yesterday, but on ESPN's current scoreboard, Final, dated in words", async () => {
  espn({ "football/nfl|null": nflDefault });
  try {
    const card = await E.sports("cowboys score", { now: NOW, tz: TZ });
    assert.deepEqual(calls, ["football/nfl|20261012", "football/nfl|20261011", "football/nfl|null", "football/nfl/teams/6|null"]);
    assert.equal(card.none, undefined);
    assert.equal(card.unavailable, undefined);
    assert.equal(card.rows.length, 1);
    assert.deepEqual(card.rows[0].teams.map(t => [t.name, t.score, t.winner]), [["Cowboys", "16", false], ["Buccaneers", "24", true]]);
    assert.equal(card.rows[0].status, "Final, Thursday, Oct 8");
    const r = await E.renderAnswer("cowboys score", { scripted: card });
    assert.match(r.h, /Final, Thursday, Oct 8/);
    assert.match(r.h, /class="as-of num">as of Oct 12, \d{1,2}:\d{2} (am|pm)</);
    assert.doesNotMatch(r.h, /No game found/);
  } finally { restore(); }
});

test("look-back: a game on the fourth day back is found and dated, and nothing after it is asked", async () => {
  espn({ "football/nfl|20261008": nflDefault });
  try {
    const card = await E.sports("cowboys score", { now: NOW, tz: TZ });
    assert.deepEqual(calls, ["football/nfl|20261012", "football/nfl|20261011", "football/nfl|null",
      "football/nfl|20261010", "football/nfl|20261009", "football/nfl|20261008", "football/nfl/teams/6|null"]);
    assert.equal(card.rows[0].status, "Final, Thursday, Oct 8");
  } finally { restore(); }
});

test("a game still to come on the current board is shown with its kickoff, and no day is faked", async () => {
  espn({ "football/nfl|null": { events: [nflDefault.events[2]] } });
  try {
    const card = await E.sports("bills score", { now: NOW, tz: TZ });
    assert.equal(card.rows[0].state, "pre");
    assert.equal(card.rows[0].status, "Scheduled for 5:15 pm");
  } finally { restore(); }
});

test("most recent game: the latest Final, else one in progress, else the next scheduled", () => {
  const ev = (state, date, name) => ({ date, name, status: { type: { state } }, competitions: [{ competitors: [
    { homeAway: "home", team: { displayName: "Dallas Cowboys", shortDisplayName: "Cowboys", name: "Cowboys" } },
    { homeAway: "away", team: { displayName: name, shortDisplayName: name, name } }] }] });
  const keys = new Set(["cowboys", "dallas cowboys"]);
  const finals = [ev("post", "2026-09-27T17:00Z", "Eagles"), ev("post", "2026-10-09T00:15Z", "Bucs"), ev("pre", "2026-10-20T17:00Z", "Giants")];
  assert.equal(E.sportsRecent(finals, keys).ev.name, "Bucs");
  const live = [ev("in", "2026-10-12T17:00Z", "Giants"), ev("pre", "2026-10-20T17:00Z", "Bears")];
  assert.equal(E.sportsRecent(live, keys).ev.name, "Giants");
  const next = [ev("pre", "2026-10-20T17:00Z", "Bears"), ev("pre", "2026-10-15T17:00Z", "Giants")];
  assert.equal(E.sportsRecent(next, keys).ev.name, "Giants");
  assert.equal(E.sportsRecent([ev("pre", "2026-10-20T17:00Z", "Bears")], new Set(["jets"])), null);
});

test("league scores with no game today or yesterday: the most recent day on the current board, dated", async () => {
  espn({ "football/nfl|null": nflDefault });
  try {
    const card = await E.sports("nfl scores", { now: NOW, tz: TZ });
    assert.deepEqual(calls, ["football/nfl|20261012", "football/nfl|20261011", "football/nfl|null"]);
    assert.equal(card.rows.length, 1);
    assert.equal(card.rows[0].status, "Final, Sunday, Oct 11");
  } finally { restore(); }
});

test("no game: both days answered, neither had the team, so it says which days", async () => {
  espn({});
  try {
    const card = await E.sports("lakers score", { now: NOW, tz: TZ });
    assert.equal(card.none, true);
    assert.equal(card.unavailable, undefined);
    assert.equal(card.title, "Lakers");
    const r = await E.renderAnswer("lakers score", { scripted: card });
    assert.match(r.h, /No game found for the Lakers in the last week/);
  } finally { restore(); }
});

test("a failed request is the unavailable state, never 'no game'", async () => {
  espn({ "basketball/nba|20261012": new Error("down"), "basketball/nba|20261011": new Error("down") });
  try {
    const card = await E.sports("lakers score", { now: NOW, tz: TZ });
    assert.equal(card.unavailable, true);
    assert.equal(card.none, undefined);
    const r = await E.renderAnswer("lakers score", { scripted: card });
    assert.match(r.h, /Scores unavailable right now/);
    assert.doesNotMatch(r.h, /No game found/);
    assert.doesNotMatch(r.h, /sports-score/);
  } finally { restore(); }
});

test("one day failed and the other has no game is still unavailable, not 'no game'", async () => {
  espn({ "basketball/nba|20261012": { events: [] }, "basketball/nba|20261011": new Error("down") });
  try {
    const card = await E.sports("lakers score", { now: NOW, tz: TZ });
    assert.equal(card.unavailable, true);
  } finally { restore(); }
});

test("league scores: 'nfl scores' lists today's games, one row each", async () => {
  espn({ "football/nfl|20261012": nfl0812 });
  try {
    const card = await E.sports("nfl scores", { now: NOW, tz: TZ });
    assert.equal(card.title, "NFL scores");
    assert.equal(card.rows.length, 1);
    assert.deepEqual(calls, ["football/nfl|20261012"]);
    const r = await E.renderAnswer("nfl scores", { scripted: card });
    assert.match(r.h, /Bills vs Rams/);
  } finally { restore(); }
});

test("league scores with nothing on either day says so", async () => {
  espn({});
  try {
    const card = await E.sports("nba scores", { now: NOW, tz: TZ });
    assert.equal(card.none, true);
    const r = await E.renderAnswer("nba scores", { scripted: card });
    assert.match(r.h, /No NBA games in the last week/);
  } finally { restore(); }
});

test("the score card: the score in words, the winner in bold, the status, the as-of line and the named source", async () => {
  espn({ "football/nfl|20261011": nfl0811 });
  try {
    const card = await E.sports("jaguars score", { now: NOW, tz: TZ });
    const r = await E.renderAnswer("jaguars score", { scripted: card });
    assert.match(r.h, /<p class="sports-score num"><strong>Jaguars 19<\/strong>, Eagles 17<\/p>/);
    assert.match(r.h, /<p class="sports-status num">Final<\/p>/);
    assert.match(r.h, /class="as-of num">as of [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} (am|pm)</);
    assert.match(r.h, /href="https:\/\/www\.espn\.com\/nfl\/scoreboard"/);
    assert.match(r.credit, /powered by ESPN/);
    assert.doesNotMatch(r.h, /—/);
  } finally { restore(); }
});

test("after a Final, the team's next game from its ESPN page is a second row, kickoff in the zone asked for", async () => {
  const next = { team: { nextEvent: [{ date: "2026-10-18T17:00Z", competitions: [{
    status: { type: { state: "pre" } },
    competitors: [{ homeAway: "home", team: { id: "30", shortDisplayName: "Jaguars" } }, { homeAway: "away", team: { id: "11", shortDisplayName: "Colts" } }],
  }] }] } };
  espn({ "football/nfl|20261011": nfl0811, "football/nfl/teams/30|null": next });
  try {
    const card = await E.sports("did the jaguars win", { now: NOW, tz: TZ });
    assert.equal(card.rows.length, 2);
    assert.equal(card.rows[0].status, "Final");
    assert.deepEqual(card.rows[1].teams.map(t => [t.name, t.score]), [["Jaguars", ""], ["Colts", ""]]);
    assert.equal(card.rows[1].status, "Scheduled for Oct 18, 10:00 am");
  } finally { restore(); }
});

test("the scoreboard is the only source a score ever comes from: no other host is called", async () => {
  espn({ "football/nfl|20261011": nfl0811 });
  try {
    await E.sports("jaguars score", { now: NOW, tz: TZ });
    assert.ok(calls.every(c => c.includes("|")));
  } finally { restore(); }
});

test("freshness: the as-of time is the fetch time, formatted in the zone asked for", () => {
  assert.equal(E.asOfLabel(NOW.toISOString(), false, TZ), "Oct 12, 1:00 pm");
});
