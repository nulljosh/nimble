import test from "node:test";
import assert from "node:assert/strict";
import { delatex } from "../worker/worker.js";

test("model LaTeX becomes plain text", () => {
  assert.equal(delatex("\\(\\frac{\\sqrt{2}}{2}\\)."), "√2/2.");
  assert.equal(delatex("\\(c^{2}=a^{2}+b^{2}-2ab\\cos\\gamma\\)"), "c²=a²+b²-2ab cos γ");
  assert.equal(delatex("\\(\\displaystyle \\frac{a}{\\sin\\alpha}=\\frac{b}{\\sin\\beta}\\)"), "a/sin α=b/sin β");
  assert.equal(delatex("x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}"), "x = (-b ± √(b²-4ac))/2a");
});

test("plain text and money are left alone", () => {
  assert.equal(delatex("It costs $5, not $6."), "It costs $5, not $6.");
  assert.equal(delatex("Tim Cook."), "Tim Cook.");
});
