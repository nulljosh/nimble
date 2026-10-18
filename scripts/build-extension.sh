#!/usr/bin/env bash
# Copy the live engine into the extension and zip it for the Chrome and Firefox stores.
set -e
cd "$(dirname "$0")/.."
V=$(awk -F'"' '/MARKETING_VERSION/ {print $2; exit}' project.yml)
# node, not sed -i: BSD and GNU sed disagree on the flag, and CI runs this on Linux.
node -e 'const f="extension/manifest.json",fs=require("fs");fs.writeFileSync(f,fs.readFileSync(f,"utf8").replace(/"version": "[^"]*"/,`"version": "${process.argv[1]}"`))' "$V"
cp docs/engine.js extension/engine.js
(cd extension && zip -qr ../nimble-extension.zip . -x README.md)
echo "nimble-extension.zip ($V)"
