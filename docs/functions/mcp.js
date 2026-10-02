// Stateless MCP over HTTP: no sessions to keep, so the streamable transport reduces to
// JSON-RPC in, JSON-RPC out. ponytail: hand-rolled to avoid the agents SDK + a Durable
// Object. Same transport as wordroot/functions/mcp.js, which already handles `params: null`,
// `arguments: null`, notifications/initialized, and a throwing tool coming back as a tool
// result rather than a dead connection.
//
// The tools live in functions/lib/tools.js, shared with functions/api/, so the REST and MCP
// surfaces cannot describe different behaviour. `answer` can hit the network, so every call
// is awaited.

import { callTool, ToolError, UnknownTool, TOOLS } from './lib/tools.js';

const VERSION = '1.0.0';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, mcp-protocol-version',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

const json = (body, init = {}) => new Response(JSON.stringify(body), {
  ...init,
  headers: { 'content-type': 'application/json', ...CORS, ...init.headers },
});

export async function onRequest({ request: req }) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST JSON-RPC to this endpoint' }, { status: 405 });

  let msg;
  try {
    msg = await req.json();
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 });
  }
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }, { status: 400 });
  }

  // `params = {}` only defaults on undefined, so an explicit `"params": null` (valid
  // JSON-RPC) would otherwise reach `params.protocolVersion` and throw a 500.
  const { id = null, method } = msg;
  const params = msg.params && typeof msg.params === 'object' ? msg.params : {};
  const reply = result => json({ jsonrpc: '2.0', id, result });

  switch (method) {
    case 'initialize':
      return reply({
        protocolVersion: params.protocolVersion || '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'nimble', version: VERSION },
      });
    case 'notifications/initialized':
      return new Response(null, { status: 202, headers: CORS });
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: TOOLS });
    case 'tools/call': {
      let result;
      try {
        result = await callTool(params.name, params.arguments || {});
      } catch (err) {
        if (err instanceof UnknownTool) {
          return json({ jsonrpc: '2.0', id, error: { code: -32602, message: err.message } });
        }
        // A tool rejecting its input is a tool result, not a transport error: the client
        // should see the message and be able to retry.
        if (err instanceof ToolError) {
          return reply({ content: [{ type: 'text', text: `nimble: ${err.message}` }], isError: true });
        }
        return reply({ content: [{ type: 'text', text: 'nimble: the answer sources failed.' }], isError: true });
      }
      return reply({ content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result });
    }
    default:
      return json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
}
