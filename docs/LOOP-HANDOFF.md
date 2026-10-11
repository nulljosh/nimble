# Nimble loop handoff (2026-10-11, late)

## What the loop is

Keep Nimble moving after 5.0.0 with one small, shippable slice at a time: fix what App Review or Joshua's phone turns up, ship each as a patch with tests green, and close every release with a tag, a GitHub release (notarized Mac zip, msi, apk), synced landing and docs, fresh screenshots and What's New. Joshua's standing goal: zero open issues, zero stale branches, all PRs merged, and UI, UX, accessibility and language at A+.

## Where things stand

- Current version is 5.0.1 (2026-10-11). 5.0.0 was the last major.
- iOS 5.0.1 is in App Review, submitted 2026-10-11 with fresh iPhone, iPad and Mac screenshots.
- Mac 5.0.1 was cancelled and resubmitted with the fixed build (timestamp build number 202610110121). Apple blocks lowering a version, so 5.0.1 is the next number.
- Mac fixes in 5.0.1: the search window takes keyboard focus, drags with AppKit's performDrag and tracks the cursor exactly (90 of 90 px, tested twice), and no longer crashes on system remote-view windows. 66 unit tests green.
- The signed, sandboxed release build launches, renders answers and accepts typing. The earlier drag and typing check is closed.
- The two loop bugs are closed: the Vancouver weather card renders fine on iPhone, and the widget updates after the card lands.
- GitHub release v5.0.1 carries the notarized Mac zip, plus the msi and apk attached by hand with gh release upload, because the native-release workflow only produces CI artifacts.
- Landing page and web app pass axe with zero violations in light and dark. The live version badge reads v5.0.1.
- All 78 native strings carry en, fr, es, zh and pa.
- The three stale remote branches are deleted. Zero open issues, zero open PRs.
- One open roadmap item: query QA and filtering. Joshua's Oct 3 phone screenshots show raw model text for "who is the president", and Wikipedia articles for "who created you" and "nine plus ten".

## Next, in order

1. Wait on App Review for iOS 5.0.1 and Mac 5.0.1. If either is rejected, fix the stated reason and resubmit.
2. Fix the query failures from the Oct 3 screenshots, one test each, then ship the next patch.
3. Confirm the iOS search view font and formatting, since the roadmap notes it was not checked on iOS.
4. Re-run axe on the landing page and web app after each UI change.

## Restart prompt

```
/loop /check ~/Documents/Code/nimble

Loop: Nimble. First, the manual release-build check: launch the exported release Nimble.app, drag the window, type a query (synthetic input went to the wrong app, so do it by hand or with a targeted check). Then check the App Review state of iOS and macOS 5.0.1 with asc, and resubmit with the fix if either was rejected. Then fix the query failures in roadmap.md (raw model text for "who is the president", Wikipedia articles for "who created you" and "nine plus ten"), one test each, unit tests green, push, bump the version with a timestamp-safe Mac build number. Then check the iOS search view font, and run axe on the landing page and web app. Remind Joshua to delete the three merged remote branches. Ping after each round. Stop only at zero open issues, zero stale branches, all PRs merged, and A+ on UI, UX, accessibility and language.
```

---

Loop status: live. Current state is 5.0.1 in App Review. The next work is the query QA fixes.
