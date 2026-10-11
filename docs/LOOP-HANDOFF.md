# Nimble loop handoff (2026-10-11, evening)

## What the loop is

Keep Nimble moving after 5.0.0 with one small, shippable slice at a time: fix what App Review or Joshua's phone turns up, ship each as a patch with tests green, and close every release with a tag, a GitHub release (notarized Mac zip, msi, apk), synced landing and docs, fresh screenshots and What's New. Joshua's standing goal: zero open issues, zero stale branches, all PRs merged, and UI, UX, accessibility and language at A+.

## Where things stand

- Current version is 5.0.1 (2026-10-11). 5.0.0 was the last major.
- iOS 5.0.1 and macOS 5.0.1 are in App Review, submitted 2026-10-11 with fresh iPhone, iPad and Mac screenshots. Apple blocks lowering a version, so 5.0.1 is the next number.
- Mac fixes in 5.0.1: the search window takes keyboard focus, drags by its background, and no longer crashes on system remote-view windows. 66 unit tests green.
- The two loop bugs are closed: the Vancouver weather card renders fine on iPhone, and the widget updates after the card lands.
- GitHub release v5.0.1 has the notarized Mac zip. The native-v5.0.1 tag is pushed, so CI builds the msi and apk.
- Landing page and web app pass axe with zero violations in light and dark. The live version badge reads v5.0.1.
- All 78 native strings carry en, fr, es, zh and pa.
- Three remote branches are merged but still exist: footer-directory, claude/landing-hero-animation-6sxcw5 and claude/landing-page-background-animation-hck14g. The permission classifier blocked deleting them, so Joshua has to delete them or allow it.
- One open roadmap item: query QA and filtering. Joshua's Oct 3 phone screenshots show raw model text for "who is the president", and Wikipedia articles for "who created you" and "nine plus ten".

## Next, in order

1. Check the App Review state of iOS and macOS 5.0.1. If either is rejected, fix the stated reason and resubmit.
2. Fix the query failures from the Oct 3 screenshots, one test each, then ship the next patch.
3. Confirm the iOS search view font and formatting, since the roadmap notes it was not checked on iOS.
4. Re-run axe on the landing page and web app after each UI change.
5. Ask Joshua to delete the three merged remote branches, or allow it.

## Restart prompt

```
/loop /check ~/Documents/Code/nimble

Loop: Nimble. First check the App Review state of iOS and macOS 5.0.1 with asc, and resubmit with the fix if either was rejected. Then fix the query failures in roadmap.md (raw model text for "who is the president", Wikipedia articles for "who created you" and "nine plus ten"), one test each, unit tests green, push, bump the version with a timestamp-safe Mac build number. Then check the iOS search view font, and run axe on the landing page and web app. Remind Joshua to delete the three merged remote branches. Ping after each round. Stop only at zero open issues, zero stale branches, all PRs merged, and A+ on UI, UX, accessibility and language.
```

---

Loop status: live. Current state is 5.0.1 in App Review. The next work is the query QA fixes.
