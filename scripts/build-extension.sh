#!/usr/bin/env bash
# Copy the live engine into the extension and zip it for the Chrome and Firefox stores.
set -e
cd "$(dirname "$0")/.."
V=$(awk -F'"' '/MARKETING_VERSION/ {print $2; exit}' project.yml)
sed -i '' "s/\"version\": \".*\"/\"version\": \"$V\"/" extension/manifest.json
cp docs/engine.js extension/engine.js
(cd extension && zip -qr ../nimble-extension.zip . -x README.md)
echo "nimble-extension.zip ($V)"
