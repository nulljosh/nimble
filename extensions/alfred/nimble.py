#!/usr/bin/env python3
"""Alfred Script Filter: python3 nimble.py "{query}". Prints one item holding the answer; Enter copies it."""
import json, sys, urllib.request

API = "https://nimble-answers.trommatic.workers.dev/"
q = " ".join(sys.argv[1:]).strip()


def out(title, subtitle="", arg=None, url=None):
    item = {"title": title, "subtitle": subtitle, "valid": arg is not None}
    if arg is not None:
        item["arg"] = arg
        item["text"] = {"copy": arg}
    if url:
        item["quicklookurl"] = url
    print(json.dumps({"items": [item]}))


if not q:
    out("Ask Nimble", "Type a question")
    sys.exit(0)

try:
    req = urllib.request.Request(API, json.dumps({"q": q}).encode(), {"content-type": "application/json", "user-agent": "nimble-alfred/1.0"})
    r = json.load(urllib.request.urlopen(req, timeout=15))
except Exception as e:
    out("Could not reach Nimble", str(e))
    sys.exit(0)

if r.get("resting"):
    out("Out of answers for today", "Try again after 17:00 Pacific")
elif r.get("answer") in (None, "UNKNOWN"):
    out("No model knew that one", q)
else:
    refs = r.get("refs") or []
    out(r["answer"], r.get("source", "Nimble"), r["answer"], refs[0]["url"] if refs else None)
