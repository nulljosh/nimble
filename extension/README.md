# Nimble browser extension

Select text on any page and press Alt+N (or click the icon): the popup answers in one sentence.
Manifest V3, one popup, no background worker. It reuses `docs/engine.js` (`shareText`) and the public `/api/answer`.

- Chrome / Edge / Brave: `chrome://extensions`, Developer mode, Load unpacked, pick this folder.
- Firefox: `about:debugging`, This Firefox, Load Temporary Add-on, pick `manifest.json`.
- Safari: `xcrun safari-web-extension-converter extension/`.

`scripts/build-extension.sh` copies the current `docs/engine.js` in and zips it for the stores.
