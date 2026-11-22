// node --test  The MCP transport, offline (math, convert, graph only).
import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/mcp.js';

const rpc = async (body, method = 'POST') => {
  const res = await onRequest({ request: new Request('https://x/mcp', { method, body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined }) });
  return { status: res.status, body: res.status === 202 || res.status === 204 ? null : await res.json() };
};

test('initialize echoes the protocol version', async () => {
  const { body } = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  assert.equal(body.result.protocolVersion, '2025-06-18');
  assert.equal(body.result.serverInfo.name, 'nimble');
  assert.ok(body.result.capabilities.tools);
});

test('notifications get a bare 202', async () => {
  for (const method of ['notifications/initialized', 'notifications/cancelled', 'notifications/progress']) {
    assert.equal((await rpc({ jsonrpc: '2.0', method })).status, 202, method);
  }
});

test('tools/list and tools/call', async () => {
  const list = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.deepEqual(list.body.result.tools.map((t) => t.name), ['answer', 'convert', 'math', 'graph']);
  const call = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'math', arguments: { q: '15% of 240' } } });
  assert.deepEqual(call.body.result.structuredContent, { kind: 'math', value: 36 });
  assert.equal(JSON.parse(call.body.result.content[0].text).value, 36);
});

test('bad input is a tool error, not a transport error', async () => {
  const r = await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'math', arguments: null } });
  assert.equal(r.body.result.isError, true);
  const u = await rpc({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'nope', arguments: { q: 'x' } } });
  assert.equal(u.body.error.code, -32602);
});

test('transport errors', async () => {
  assert.equal((await rpc('{nope')).body.error.code, -32700);
  assert.equal((await rpc([1])).body.error.code, -32600);
  assert.equal((await rpc({ jsonrpc: '2.0', id: 6, method: 'nope' })).body.error.code, -32601);
  assert.equal((await rpc(null, 'GET')).status, 405);
  assert.equal((await rpc({ jsonrpc: '2.0', id: 7, method: 'ping', params: null })).body.result && 1, 1);
});
