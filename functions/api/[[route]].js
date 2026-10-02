// REST surface. Thin: every route hands its q to callTool() in functions/lib/tools.js,
// which functions/mcp.js also calls. No answering logic lives here.

import { callTool, ToolError, UnknownTool, TOOLS } from '../lib/tools.js';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET, OPTIONS',
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300', ...CORS },
  });

const ENDPOINTS = {
  'GET /api/answer?q=': 'One short answer to a question.',
  'GET /api/convert?q=': 'Unit conversion, offline.',
  'GET /api/math?q=': 'Arithmetic, offline.',
  'GET /api/graph?q=': 'Plot y = f(x) as SVG.',
  'POST /mcp': 'Model Context Protocol, JSON-RPC. Same tools.',
};

export async function onRequest({ request }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'GET') return json({ error: 'This API is read-only; use GET.' }, 405);

  const url = new URL(request.url);
  const parts = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean); // ['api', ...]

  if (parts.length === 1) return json({ endpoints: ENDPOINTS, tools: TOOLS.map((t) => t.name) });

  try {
    return json(await callTool(parts[1], { q: url.searchParams.get('q') ?? undefined }));
  } catch (err) {
    if (err instanceof UnknownTool) return json({ error: err.message, endpoints: ENDPOINTS }, 404);
    if (err instanceof ToolError) return json({ error: err.message }, 400);
    return json({ error: 'The answer sources failed. Try again.' }, 502);
  }
}
