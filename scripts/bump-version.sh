#!/usr/bin/env bash
# Usage: scripts/bump-version.sh 1.2.0
# One version across every surface: Xcode targets, kmp (Windows/Android/Linux), docs.
set -e
V="$1"; [ -n "$V" ] || { echo "Usage: $0 <version>"; exit 1; }
cd "$(dirname "$0")/.."
sed -i '' "s/MARKETING_VERSION: \".*\"/MARKETING_VERSION: \"$V\"/" project.yml
sed -i '' "s/CURRENT_PROJECT_VERSION: \"\([0-9]*\)\"/CURRENT_PROJECT_VERSION: \"$(( $(awk -F'"' '/CURRENT_PROJECT_VERSION/ {print $2; exit}' project.yml) + 1 ))\"/" project.yml
sed -i '' "s/versionCode = \([0-9]*\)/versionCode = $(( $(awk -F'= ' '/versionCode/ {print $2; exit}' kmp/composeApp/build.gradle.kts) + 1 ))/" kmp/composeApp/build.gradle.kts
sed -i '' "s/versionName = \".*\"/versionName = \"$V\"/; s/packageVersion = \".*\"/packageVersion = \"$V\"/" kmp/composeApp/build.gradle.kts
sed -i '' "s/version-v[^-]*-blue/version-v$V-blue/" README.md
sed -i '' "s/^v[0-9].*/v$V/" CLAUDE.md
sed -i '' "s/^\*\*v[0-9.]*\*\* | .*/**v$V** | $(date '+%B %Y')/" WHITEPAPER.md
git diff --stat
