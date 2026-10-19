// "inflation rate in canada" answers from the Bank of Canada's Valet API, no model involved.
import test from "node:test";
import assert from "node:assert/strict";
import { canadaInflation } from "../worker/worker.js";

const realFetch = globalThis.fetch;
test.after(() => { globalThis.fetch = realFetch; });

test("the latest year-over-year CPI with its month", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ observations: [{ d: "2026-07-01", STATIC_TOTALCPICHANGE: { v: "3.0" } }] }));
  assert.equal(await canadaInflation("what is the inflation rate in canada"), "Canada's inflation rate was 3.0% in July 2026 (CPI, year over year).");
});

test("other questions and a failed fetch are null", async () => {
  assert.equal(await canadaInflation("inflation rate in japan"), null);
  globalThis.fetch = async () => { throw new Error("down"); };
  assert.equal(await canadaInflation("canada cpi"), null);
});
