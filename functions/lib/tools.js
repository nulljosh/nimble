// The one definition of what Nimble does over the network. Both surfaces, the REST routes
// in functions/api/ and the MCP server in functions/mcp.js, call `callTool` from here, so
// they cannot describe different behaviour.
//
// ponytail: no second engine. docs/engine.js is the browser engine, and it already guards
// navigator and localStorage, so the server imports it as is. Its math is a parser, not
// eval, because Workers forbid eval.

import engine from '../../docs/engine.js';

const { answer, tryConvert, tryMath, graphExpr, graph } = engine;

const MAX_Q = 500;

export class ToolError extends Error {}
export class UnknownTool extends ToolError {}

const query = (args) => {
  const v = args?.q;
  if (typeof v !== 'string' || !v.trim()) throw new ToolError('q is required');
  const q = v.trim();
  if (q.length > MAX_Q) throw new ToolError(`q exceeds ${MAX_Q} characters`);
  return q;
};

const qArg = (description) => ({
  type: 'object',
  properties: { q: { type: 'string', description } },
  required: ['q'],
});

export const TOOLS = [
  {
    name: 'answer',
    description: 'One short answer to a question. Units, math and graphs are computed here; currency, dictionary, weather, local time and facts come from live sources.',
    inputSchema: qArg('The question, e.g. "5 miles to km" or "weather in Vancouver".'),
  },
  {
    name: 'convert',
    description: 'Convert between units (length, mass, volume, speed, data, time, temperature). Computed offline.',
    inputSchema: qArg('A conversion, e.g. "5 miles to km" or "180 c to f".'),
  },
  {
    name: 'math',
    description: 'Evaluate arithmetic: + - * / ^, percent, pi, e, sqrt, sin, cos, tan, log, ln, abs, round. Computed offline.',
    inputSchema: qArg('An expression, e.g. "15% of 240" or "sqrt(16)*2".'),
  },
  {
    name: 'graph',
    description: 'Plot y = f(x) over x from -10 to 10. Returns the expression and an SVG.',
    inputSchema: qArg('A function, e.g. "plot sin(x)" or "y = x^2".'),
  },
];

export const TOOL_NAMES = TOOLS.map((t) => t.name);

export async function callTool(name, args = {}) {
  switch (name) {
    case 'answer':
      return await answer(query(args));
    case 'convert': {
      const r = tryConvert(query(args));
      if (!r) throw new ToolError('Not a unit conversion. Try "5 miles to km".');
      return { kind: 'convert', ...r };
    }
    case 'math': {
      const value = tryMath(query(args));
      if (value === null) throw new ToolError('Not a math expression. Try "15% of 240".');
      return { kind: 'math', value };
    }
    case 'graph': {
      const expr = graphExpr(query(args));
      const svg = expr && graph(expr);
      if (!svg) throw new ToolError('Not a graphable function. Try "plot sin(x)".');
      return { kind: 'graph', expr, svg };
    }
    default:
      throw new UnknownTool(`Unknown tool: ${name}`);
  }
}
