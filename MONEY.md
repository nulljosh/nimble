# Nimble Answers Money

How Nimble Answers makes money. The fleet-wide ledger is `GTM.md` in the Code root.

## Price

One dollar. $0.99 once on the App Store for iPhone and Mac, everything unlocked. No subscription, no in-app purchase, no ads, no account.

The web app at nimble.jaybulb.com stays free. So does the code: it is open source under Apache 2.0, and anyone can build it themselves.

## Why a dollar

You can read every line for free, so the dollar is not for the code. It pays for the parts you don't get from the code:

- **Signed, reviewed builds.** Apple checks every version. You install it from the App Store and it updates itself.
- **The answer service.** The Worker behind every answer, the live data (weather, rates, scores, prices) and the AI calls all run on our account, every day.
- **Measured accuracy.** Each release is graded on a 154-question exam against the live service. It scores 154 of 154 today (BENCHMARK.md), and the score is public on /stats.
- **The native app.** A Mac HUD on Option-Space, the iPhone app with widgets and Siri, offline answers, Private mode, and 15 languages.
- **Nothing sold.** No ads, no tracking, no account. A question goes to the answer service only to be answered, never tied to you, and Private mode keeps every question on the device.

A dollar once is less than one coffee and covers the service for years of normal use.

## Rail

App Store, $0.99 one-time (tier 1). No Stripe: the web stays free.

## Who keeps it free

Anyone who got Nimble Answers while it was free keeps it free. Only new customers pay.

## Change it

```
asc pricing schedule create --app 6807858746 --price 0.99 --base-territory USA --start-date YYYY-MM-DD
```

Decided and live 2026-10-18 (Joshua: "Apache and $1"): USA base price point 10010, $0.99, $0.84 proceeds. Apple sets the other territories from the US price.

*ASC 6807858746.*
