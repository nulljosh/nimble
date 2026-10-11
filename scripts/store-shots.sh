#!/usr/bin/env bash
# App Store screenshots from the simulator, framed by nothing: Apple wants raw device pixels.
# Usage: scripts/store-shots.sh            -> .asc/shots/ios/en-CA/01..04.png (iPhone 17 Pro Max, 1320x2868)
#        scripts/store-shots.sh ipad       -> .asc/shots/ipad/en-CA/01..04.png (iPad Pro 13-inch)
# Needs a simulator build at /private/tmp/nimble-ios-dd (made here if missing).
set -e
cd "$(dirname "$0")/.."
kind="${1:-ios}"
case "$kind" in
  ios)  dev="iPhone 17 Pro Max"; out=.asc/shots/ios/en-CA ;;
  ipad) dev="iPad Pro 13-inch (M5)"; out=.asc/shots/ipad/en-CA ;;
esac
id=$(xcrun simctl list devices available | grep -F "$dev (" | head -1 | grep -oE "[0-9A-F-]{36}")
[ -n "$id" ] || { echo "no simulator named $dev"; exit 1; }
app=/private/tmp/nimble-ios-dd/Build/Products/Debug-iphonesimulator/Nimble-iOS.app
[ -d "$app" ] || xcodebuild build -project Nimble.xcodeproj -scheme Nimble-iOS -destination "platform=iOS Simulator,name=$dev" CODE_SIGNING_ALLOWED=NO -derivedDataPath /private/tmp/nimble-ios-dd -quiet
bundle=$(defaults read "$app/Info" CFBundleIdentifier)
ver=$(defaults read "$app/Info" CFBundleShortVersionString)
xcrun simctl boot "$id" 2>/dev/null || true
xcrun simctl bootstatus "$id" -b >/dev/null
xcrun simctl ui "$id" appearance light
xcrun simctl status_bar "$id" override --time 9:41 --batteryState charged --batteryLevel 100 --wifiBars 3 --cellularBars 4
xcrun simctl install "$id" "$app"
mkdir -p "$out"
i=0
# The consent answer is pre-set so the AI card does not block the answer shots.
for q in "what's primitive.dev?" "180 C to F" "who is the prime minister of canada" "weather in vancouver"; do
  i=$((i+1))
  xcrun simctl terminate "$id" "$bundle" 2>/dev/null || true
  xcrun simctl launch "$id" "$bundle" -shot "$q" -whats_new_seen_version "$ver" >/dev/null
  sleep 7
  xcrun simctl io "$id" screenshot "$out/0$i.png" >/dev/null
done
xcrun simctl status_bar "$id" clear
xcrun simctl shutdown "$id"
for f in "$out"/0*.png; do magick identify "$f" | awk '{print $1, $3}'; done
