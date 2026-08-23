#!/bin/bash
# Build, Developer ID-sign, notarize and staple the Mac app, then zip it for a
# GitHub release.
#
# Why this exists: the 1.0.0 release was signed with a *development* certificate, so
# every download arrived quarantined and macOS refused to open it until the user went
# to System Settings > Privacy & Security > "Open Anyway". Gatekeeper only opens an
# app on first launch if it is signed with a Developer ID Application certificate,
# built with the hardened runtime, notarized by Apple, and stapled.
#
# Prerequisites (one-time, on the signing Mac):
#   1. A "Developer ID Application" certificate in the login keychain
#      (Xcode > Settings > Accounts > Manage Certificates > + > Developer ID Application).
#   2. A notarytool credential profile, created with an app-specific password from
#      appleid.apple.com:
#        xcrun notarytool store-credentials nimble-notary \
#          --apple-id "you@example.com" --team-id QMM486NPYC --password "abcd-efgh-ijkl-mnop"
#
# Usage: scripts/release-macos.sh [notary-profile]
set -euo pipefail
cd "$(dirname "$0")/.."

PROFILE="${1:-${NOTARY_PROFILE:-nimble-notary}}"
TEAM_ID="QMM486NPYC"
BUILD_DIR="build"
ARCHIVE="$BUILD_DIR/Nimble.xcarchive"
EXPORT_DIR="$BUILD_DIR/export"
APP="$EXPORT_DIR/Nimble.app"

VERSION=$(awk -F'"' '/MARKETING_VERSION/ {print $2; exit}' project.yml)
ZIP="$BUILD_DIR/Nimble-$VERSION.zip"

command -v xcodegen >/dev/null || { echo "xcodegen not installed: brew install xcodegen"; exit 1; }

echo "==> Generating project"
xcodegen generate

echo "==> Archiving Nimble $VERSION"
rm -rf "$ARCHIVE" "$EXPORT_DIR"
xcodebuild archive \
  -project Nimble.xcodeproj \
  -scheme Nimble \
  -configuration Release \
  -destination "generic/platform=macOS" \
  -archivePath "$ARCHIVE" \
  ENABLE_HARDENED_RUNTIME=YES \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  -allowProvisioningUpdates

echo "==> Exporting with Developer ID"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist ExportOptions-macOS.plist \
  -exportPath "$EXPORT_DIR" \
  -allowProvisioningUpdates

echo "==> Verifying signature"
codesign --verify --strict --verbose=2 "$APP"
# Fails loudly if the hardened runtime flag did not make it into the signature —
# notarization would reject it a few minutes later anyway.
codesign -d --verbose=2 "$APP" 2>&1 | grep -q "flags=.*runtime" \
  || { echo "hardened runtime missing from signature"; exit 1; }

echo "==> Notarizing (this waits on Apple, usually a few minutes)"
ditto -c -k --keepParent "$APP" "$BUILD_DIR/notarize.zip"
xcrun notarytool submit "$BUILD_DIR/notarize.zip" --keychain-profile "$PROFILE" --wait

echo "==> Stapling"
xcrun stapler staple "$APP"
xcrun stapler validate "$APP"

# Gatekeeper's own verdict, the same check the OS runs on first launch.
spctl --assess --type execute --verbose=4 "$APP"

echo "==> Packaging"
rm -f "$ZIP" "$BUILD_DIR/notarize.zip"
ditto -c -k --keepParent "$APP" "$ZIP"

echo
echo "Done: $ZIP"
echo "Attach it to the GitHub release for v$VERSION — the in-app updater looks for a"
echo ".dmg or .zip asset on the latest release."
