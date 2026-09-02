#!/bin/sh
# Assemble the deployable site. The landing page is the app: docs/ is the whole site.
# ponytail: cp into dist/, no bundler, plain static HTML.
set -e
cd "$(dirname "$0")/.."
rm -rf dist
cp -R docs dist
echo "dist/ built"
