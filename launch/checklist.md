# Launch checklist — Nimble Answers (Joshua's manual steps)

- [ ] Product Hunt: create the post from launch/producthunt.md, pick a launch day, submit for a hunter if not self-hunting.
- [ ] Hacker News: post launch/hn.md manually to Show HN when ready (never auto-posted).
- [ ] Reddit: post each file in launch/reddit/ on its own day, per launch/reddit/checklist.md. Check karma/flair gates first, don't guess.
- [ ] X: post launch/x.md as a thread.
- [ ] Gallery: launch/gallery/03-mac-hud.png is 1280x800, not exactly PH's 1270x760/3:2 spec. Left as-is since it's close and composing an exact crop risked cropping the HUD; recrop by hand if PH flags it.
- [ ] ASC macOS listing: 2 non-blocking warnings on keyword overlap with app name/subtitle (see report). Low priority, fix by hand in metadata/version/1.0.0/en-CA.json keywords field if you want it clean, then re-run `asc localizations update`.
- [ ] iOS: version 1.0.0 is REJECTED in App Store Connect, only macOS is live. No iOS launch copy should claim App Store availability until that's resolved.
- [ ] App Privacy publish state can't be verified via API, confirm it's actually published in the ASC dashboard before any resubmission.
