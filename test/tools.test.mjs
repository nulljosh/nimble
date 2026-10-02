// node --test  (offline: only convert, math and graph go through callTool here)
import test from 'node:test';
import assert from 'node:assert/strict';
import { callTool, ToolError, UnknownTool, TOOLS, TOOL_NAMES } from '../functions/lib/tools.js';

test('tool list', () => {
  assert.deepEqual(TOOL_NAMES, ['answer', 'convert', 'math', 'graph']);
  for (const t of TOOLS) assert.deepEqual(t.inputSchema.required, ['q']);
});

test('convert', async () => {
  assert.deepEqual(await callTool('convert', { q: '180 C to F' }), { kind: 'convert', from: '180', to: '356', fromUnit: '°C', toUnit: '°F' });
  assert.equal((await callTool('convert', { q: '10 km to miles' })).to, '6.213712');
  await assert.rejects(callTool('convert', { q: '5 kg to miles' }), ToolError);
});

test('math', async () => {
  assert.deepEqual(await callTool('math', { q: '15% of 240' }), { kind: 'math', value: 36 });
  assert.equal((await callTool('math', { q: 'sqrt(16)*2' })).value, 8);
  assert.equal((await callTool('math', { q: '2^10' })).value, 1024);
  await assert.rejects(callTool('math', { q: 'hello' }), ToolError);
  await assert.rejects(callTool('math', { q: 'process.exit()' }), ToolError);
});

test('graph', async () => {
  const g = await callTool('graph', { q: 'plot x^2' });
  assert.equal(g.kind, 'graph');
  assert.equal(g.expr, 'x^2');
  assert.match(g.svg, /^<svg /);
  await assert.rejects(callTool('graph', { q: 'hello' }), ToolError);
});

test('answer keeps the offline kinds', async () => {
  assert.deepEqual(await callTool('answer', { q: '5 miles to km' }), { kind: 'convert', from: '5', to: '8.04672', fromUnit: 'miles', toUnit: 'km' });
  assert.deepEqual(await callTool('answer', { q: '2+2' }), { kind: 'math', value: 4 });
});

test('q is required and bounded', async () => {
  await assert.rejects(callTool('math', {}), ToolError);
  await assert.rejects(callTool('math', { q: '   ' }), ToolError);
  await assert.rejects(callTool('math', { q: '1+'.repeat(300) }), ToolError);
});

test('unknown tool', async () => {
  await assert.rejects(callTool('nope', { q: 'x' }), UnknownTool);
  await assert.rejects(callTool('nope', { q: 'x' }), ToolError);
});
