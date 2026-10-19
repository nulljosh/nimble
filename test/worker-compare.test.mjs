// "paris vs london population" answers from Wikidata, no model involved.
import test from "node:test";
import assert from "node:assert/strict";
import { comparePopulation } from "../worker/worker.js";

const realFetch = globalThis.fetch;
test.after(() => { globalThis.fetch = realFetch; });
const claim = (amount, time, rank = "normal") => ({ rank, mainsnak: { datavalue: { value: { amount } } }, qualifiers: { P585: [{ datavalue: { value: { time } } }] } });
const data = {
  Paris: { id: "Q90", claims: [claim("+2152423", "+1990-00-00T00:00:00Z"), claim("+2100000", "+2023-01-01T00:00:00Z"), claim("+2103778", "+2023-01-01T00:00:00Z", "preferred")] },
  Canada: { id: "Q16", claims: [claim("+36991981", "+2021-00-00T00:00:00Z", "preferred"), claim("+40000000", "+2023-06-16T00:00:00Z")] },
  London: { id: "Q84", claims: [claim("+8000000", "+2001-01-01T00:00:00Z"), claim("+8945309", "+2023-06-30T00:00:00Z")] },
};
function wikidata() {
  globalThis.fetch = async (u) => {
    const url = new URL(String(u));
    if (url.searchParams.get("action") === "wbsearchentities") {
      const name = url.searchParams.get("search").replace(/\b\w/g, (c) => c.toUpperCase());
      return new Response(JSON.stringify({ search: data[name] ? [{ id: data[name].id, label: name }] : [] }));
    }
    const hit = Object.values(data).find((d) => d.id === url.searchParams.get("entity"));
    return new Response(JSON.stringify({ claims: { P1082: hit.claims } }));
  };
}

test("both populations, the latest year first, preferred on a tie", async () => {
  wikidata();
  const want = "Paris: 2.1 million (2023). London: 8.9 million (2023).";
  assert.equal(await comparePopulation("paris vs london population"), want);
  assert.equal(await comparePopulation("population of paris vs london?"), want);
  assert.equal(await comparePopulation("canada vs paris population"), "Canada: 40 million (2023). Paris: 2.1 million (2023).");
});

test("not a comparison, or a name Wikidata does not know, is null", async () => {
  wikidata();
  assert.equal(await comparePopulation("population of paris"), null);
  assert.equal(await comparePopulation("population of bosnia and herzegovina"), null);
  assert.equal(await comparePopulation("paris vs atlantis population"), null);
  globalThis.fetch = async () => { throw new Error("down"); };
  assert.equal(await comparePopulation("paris vs london population"), null);
});
