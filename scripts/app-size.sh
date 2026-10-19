#!/bin/bash
# Size budgets for the Apple apps: builds both Release apps unsigned and fails when one is over its budget.
# Budgets are in roadmap.md (iPhone under 15 MB, Mac under 20 MB). Runs in CI (test.yml) and by hand.
set -euo pipefail
cd "$(dirname "$0")/.."
DD="${DERIVED_DATA:-$HOME/Library/Developer/Xcode/DerivedData/nimble-size}"
xcodegen generate -q
build() { xcodebuild build -project Nimble.xcodeproj -scheme "$1" -configuration Release -destination "$2" \
  -derivedDataPath "$DD" CODE_SIGNING_ALLOWED=NO -quiet; }
build Nimble 'generic/platform=macOS'
build Nimble-iOS 'generic/platform=iOS'
fail=0
check() { # name, .app path, budget in KB
  local kb; kb=$(du -sk "$2" | cut -f1)
  echo "$1: $((kb / 1024)).$(( (kb % 1024) * 10 / 1024 )) MB (budget $(($3 / 1024)) MB)"
  [ "$kb" -le "$3" ] || { echo "  over budget"; fail=1; }
}
check Mac "$DD/Build/Products/Release/Nimble.app" $((20 * 1024))
check iPhone "$(ls -d "$DD"/Build/Products/Release-iphoneos/*.app | head -1)" $((15 * 1024))
exit $fail
