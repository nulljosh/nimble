"""Nimble API client, one file, standard library only. Python 3.8+.

    from nimble import ask
    reply = ask("capital of france")
    print(reply["answer"], reply["source"])

Returns the reply dict (answer, source, refs, ...); answer is None when no model knew it.
"""
import json
import urllib.request

ENDPOINT = "https://nimble-answers.trommatic.workers.dev/"


def ask(q, key=None, turns=None, endpoint=ENDPOINT, timeout=15):
    body = {"q": q, **({"turns": turns} if turns else {})}
    headers = {"content-type": "application/json", "user-agent": "nimble-py/1"}
    if key:
        headers["authorization"] = "Bearer " + key
    req = urllib.request.Request(endpoint, data=json.dumps(body).encode(), headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:  # raises HTTPError on 4xx/5xx
        d = json.load(r)
    if d.get("answer") == "UNKNOWN":
        d["answer"] = None
    return d


if __name__ == "__main__":
    import sys
    print(ask(" ".join(sys.argv[1:]) or "minimum wage in bc")["answer"])
