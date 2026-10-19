## r/SideProject

Title: I got tired of ten blue links for one answer, so I built a search bar that just answers

Body:
Every time I looked up something small, a conversion, a date, who wrote what, I got a page of links and had to dig for the one sentence I wanted. So I built Nimble. You type a question and get one sentence back, with its source.

Math and units run on your device, so "15% tip on 62" or "180 C to F" works with no connection. Everything else goes to free open models (Groq first, then Cloudflare's), grounded on a Wikipedia excerpt, so there is no account and no key. If two models disagree, it shows you both.

It runs on the web, iPhone, Mac, Apple Watch, Android, Windows, Linux and the terminal (brew install nulljosh/tap/nimble). Nine languages. Free and open source (MIT).

I test it on a 154-question exam, and the free models score 152. It is my exam, so it can flatter me. If it gets something wrong, send me the question and I'll add it.

Web: https://nimble.jaybulb.com
iPhone and Mac: https://apps.apple.com/app/nimble-answers/id6807858746
Source: https://github.com/nulljosh/nimble
