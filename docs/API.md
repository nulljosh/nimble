# Nimble API

One question in, one sentence out. Free, no sign-up for light use.

```
curl -s https://nimble-answers.trommatic.workers.dev/ \
  -H 'content-type: application/json' \
  -d '{"q":"capital of france"}'
```

```
{"answer":"Paris.","source":"Groq","refs":[{"title":"Paris","url":"https://en.wikipedia.org/wiki/Paris"}]}
```

## Request

`POST /` with JSON. `q` is the question (up to 500 characters). `turns` is optional: earlier `{q, a}` pairs, so "and in celsius?" has something to follow.

## Reply

- `answer`: the sentence. `UNKNOWN` means no model could answer it.
- `source`: who answered (`Groq`, `Qwen`, `Gemma`, `Samantha`, or two joined by `+` when they agreed).
- `refs`: Wikipedia pages the answer is grounded in, when there are any. `image` and a topic may come too.
- `disagree`: set when two models gave different answers; both are in `answer`.
- `resting`: the free AI is out of answers for the day. Try again after 17:00 Pacific.

Repeat questions are cached for six hours (one hour for time-sensitive ones).

## Clients

Two one-file clients live in `sdk/`, with no dependencies. Copy the file into your project.

```js
import { ask } from "./nimble.mjs";
const { answer, source } = await ask("capital of france"); // answer is null when no model knew it
```

```python
from nimble import ask
print(ask("capital of france")["answer"])  # None when no model knew it
```

Both take an optional `key` and `turns`. `python3 sdk/nimble.py minimum wage in bc` works from the shell.

Raycast and Alfred clients live in `extensions/` (`raycast/` is an Ask Nimble command, `alfred/` is a Script Filter).

## Limits and keys

Without a key: 20 questions a minute per IP. With a key: 60 a minute, in your own bucket. Send it as `Authorization: Bearer <key>` or `x-api-key: <key>`. A wrong key gets 401, a spent bucket gets 429.

Keys are issued by hand. Ask for one at the repo: https://github.com/nulljosh/nimble.

## REST and MCP on the site

The site has the same engine as four read-only tools, for scripts and for agents.

```
curl -s 'https://nimble.jaybulb.com/api/answer?q=capital+of+france'
curl -s 'https://nimble.jaybulb.com/api/convert?q=10+km+to+miles'
curl -s 'https://nimble.jaybulb.com/api/math?q=15%25+of+80'
curl -s 'https://nimble.jaybulb.com/api/graph?q=sin(x)'
```

`POST /mcp` speaks MCP over HTTP (JSON-RPC in, JSON-RPC out, no session) with the same four tools: `answer`, `convert`, `math` and `graph`. Point an MCP client at `https://nimble.jaybulb.com/mcp`, or call it by hand:

```
curl -s https://nimble.jaybulb.com/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"answer","arguments":{"q":"who wrote hamlet"}}}'
```

`convert`, `math` and `graph` run on the server with no AI and no limit. `answer` goes through the proxy above and shares its limits. The site endpoints need no key; keys are only for the proxy, and they are issued by hand today.

## Health

`GET /stats` returns the day's counts and the latency per source. It needs no key.
