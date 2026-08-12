#!/bin/sh
# ponytail: compose the Pages site — marketing landing (docs/) at /, web app at /app
set -e
cd "$(dirname "$0")/.."
rm -rf dist && mkdir -p dist/app
cp -R docs/. dist/
cp -R web/. dist/app/
rm -rf dist/app/.vercel
echo "built dist/ (landing at /, app at /app)"
