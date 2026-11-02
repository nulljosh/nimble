# Nimble Money

How Nimble makes money. The company plan is `REVENUE.md` in the Code root; the ledger is `GTM.md`.

## Price and rail

$0.99 upfront on the App Store (ASC 6807858746, store name Nimble Answers), iPhone and Mac. Apple keeps 15%, so each sale pays about $0.84. The web app at nimble.jaybulb.com stays free. No Stripe, no subscription, no ads. The code is open source under Apache 2.0.

## What is actually sold

The signed, updated native apps and the answer service behind them. The Mac HUD, the widgets, Siri, offline answers and Private mode are in the app. The code is public, so the dollar is not for the code. It pays for the signed builds and for the service that answers every day. The answers come from Wikipedia and DuckDuckGo, and their terms apply.

## Who pays and why

Someone who wants an instant answer on the Mac or the phone, with no ads and no account. They pay once because the answer service costs money every day, and a dollar is the one price that does not need a subscription.

## Cost to serve

Workers AI answers the questions (Qwen3, with Gemma for time-sensitive ones and Llama for clashes). A guard stops Workers AI at 8,500 estimated neurons a day. Past the guard, Groq answers while its free caps last, if the `GROQ_KEY` secret is set. Known answers are cached, so a repeat costs nothing. Claude, OpenAI and Ollama run only when a person brings their own key, and that call goes from their device to the vendor, not through us. The worst case is the 8,500-neuron daily guard plus Groq's own caps. No dollar figure is set.

## Where we are

- 2026-10-18: the price was decided and went live at $0.99, with $0.84 proceeds per sale.
- 2026-10-18: the benchmark scored 154 of 154, and the score is public on /stats.
- 2026-10-20: version 10.0.0 was tagged.
- Revenue: no verified number (the App Store Connect key cannot read sales yet).

## Role in the company plan

Catalogue. GTM.md lists it as an open source catalogue app. It serves Stage 0 as a dollar app that proves the store sells a product you can also read for free. Under Stage 2 it earns a place on the grid or is retired.

## Next

Read the first month of store sales, and watch the neuron count on /stats against the 8,500 guard.

## Million, billion, trillion

**A million.** Nimble is the answer box people keep in the menu bar, paid once, with the code open for anyone to check.

**A billion.** Nimble is the answer layer on every Jaybulb device, working offline wherever it can.

**A trillion.** Nimble is how a question gets answered on any device, and the answer service is the one thing the company runs for it.

## Change it

`asc pricing schedule create --app 6807858746 --price 0.99 --base-territory USA --start-date YYYY-MM-DD`. Swap `--price 0.99` for `--free` to revert. No build, no review. Only with Joshua's yes in chat.

Anyone who got Nimble while it was free keeps it free.

*ASC 6807858746. Verified 2026-11-02.*
