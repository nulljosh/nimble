// Minimum wage from the Government of Canada table, offline: the CSV is stubbed, nothing calls a model.
import test from "node:test";
import assert from "node:assert/strict";
import { minimumWage } from "../worker/worker.js";

const CSV = `﻿jurisdiction,effective_date,wage,note
Federal,2025-04-01,$17.75,"An employee should be paid at least the federal minimum wage, or the province's if higher."
Federal,2026-04-01,$18.15,
British Columbia,2024-06-01,$17.40,
British Columbia,2026-06-01,$17.85,
British Columbia,2026-06-01,$18.25,
Ontario,2025-10-01,$17.60,
Ontario,2026-10-01,$17.95,
`;
const stub = () => { globalThis.fetch = async () => new Response(CSV); };

test("the rate in force on the day, the later row on a tied date", async () => {
  stub();
  assert.equal(await minimumWage("minimum wage in bc", "2026-10-19"), "British Columbia's minimum wage is $18.25 an hour, since June 1, 2026.");
  assert.equal(await minimumWage("What is the minimum wage in British Columbia?", "2026-10-19"), "British Columbia's minimum wage is $18.25 an hour, since June 1, 2026.");
  // A forthcoming rate is not today's.
  assert.equal(await minimumWage("ontario minimum wage", "2026-09-30"), "Ontario's minimum wage is $17.60 an hour, since October 1, 2025.");
  assert.equal(await minimumWage("minimum wage canada", "2026-10-19"), "The federal minimum wage in Canada is $18.15 an hour, since April 1, 2026.");
});

test("no province, a short form that is just a word, or a failed fetch is null", async () => {
  stub();
  assert.equal(await minimumWage("minimum wage on sundays"), null);
  assert.equal(await minimumWage("what is the minimum wage"), null);
  assert.equal(await minimumWage("population of bc"), null);
  assert.equal(await minimumWage("minimum wage in alberta"), null, "a province with no rows");
  globalThis.fetch = async () => { throw new Error("down"); };
  assert.equal(await minimumWage("minimum wage in bc"), null);
});
