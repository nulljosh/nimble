// "inflation rate in canada" answers from the Bank of Canada's Valet API, no model involved.
import test from "node:test";
import assert from "node:assert/strict";
import { canadaFigure } from "../worker/worker.js";

const realFetch = globalThis.fetch;
test.after(() => { globalThis.fetch = realFetch; });

test("the latest year-over-year CPI with its month", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ observations: [{ d: "2026-07-01", STATIC_TOTALCPICHANGE: { v: "3.0" } }] }));
  assert.equal(await canadaFigure("what is the inflation rate in canada"), "Canada's inflation rate was 3.0% in July 2026 (CPI, year over year).");
});

test("the policy rate with its day", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ observations: [{ d: "2026-10-15", V39079: { v: "2.25" } }] }));
  assert.equal(await canadaFigure("what is the bank of canada rate"), "The Bank of Canada's policy rate is 2.25% (target for the overnight rate, as of October 15, 2026).");
  assert.equal(await canadaFigure("canada interest rate"), "The Bank of Canada's policy rate is 2.25% (target for the overnight rate, as of October 15, 2026).");
});

test("other questions and a failed fetch are null", async () => {
  assert.equal(await canadaFigure("inflation rate in japan"), null);
  assert.equal(await canadaFigure("population of canada"), null);
  globalThis.fetch = async () => { throw new Error("down"); };
  assert.equal(await canadaFigure("canada cpi"), null);
});
