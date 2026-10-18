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

## Limits and keys

Without a key: 20 questions a minute per IP. With a key: 60 a minute, in your own bucket. Send it as `Authorization: Bearer <key>` or `x-api-key: <key>`. A wrong key gets 401, a spent bucket gets 429.

Keys are issued by hand. Ask for one at the repo: https://github.com/nulljosh/nimble.

## Health

`GET /stats` returns the day's counts and the latency per source. It needs no key.
