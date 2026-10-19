# Security

## Reporting

Found something? Email **trommatic@icloud.com**. Don't open a public issue for anything exploitable.

You'll hear back within a week. This is a solo side project. No bounty, no SLA, just a reply.

## Supported versions

The deployed version and the tip of `main`. Nothing else.

## What keeps you safe

Nimble keeps no account and no profile. A question goes to the answer service only to be answered. Private mode keeps every question on the device.

The answer service rate-limits each address, refuses oversized requests before reading them, and gives every outside call a time limit, so one slow source cannot hang an answer. Anything that breaks comes back as a plain "unknown" and the app moves on to its next source. "This is wrong" reports keep only the question and the answer, never who sent them, and only the review key can read them.

The website loads scripts from its own address only and cannot be framed by another site. Every link an answer shows opens on the web (http or https) or not at all, on the web and in the iPhone, Mac and Android apps. If you use your own Claude or OpenAI key, the iPhone and Mac apps keep it in the Keychain, and the web app keeps it in your browser and sends it only to that company.
