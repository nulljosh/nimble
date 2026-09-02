#!/bin/bash
# Assemble the deployable site: landing page at /, the search app at /app.
# ponytail: cp into dist/ — no bundler, the two surfaces are plain static HTML.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf dist
mkdir -p dist/app

cp docs/index.html docs/tokens.css docs/icon.svg docs/splash.html dist/
[ -d docs/screenshots ] && cp -R docs/screenshots dist/

cp web/index.html web/engine.js web/tokens.css web/icon.svg web/sw.js web/manifest.webmanifest \
   web/icon-192.png web/icon-512.png web/icon-512-maskable.png dist/app/

echo "dist/ built: landing at /, app at /app"
