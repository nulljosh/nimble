#!/bin/sh
# Point the Homebrew tap (../homebrew-tap) at a tagged release: scripts/bump-tap.sh 8.3.0
# Run after `gh release create`, since it hashes the tag's tarball. Commits and pushes the tap.
set -e
v="$1"; [ -n "$v" ] || { echo "usage: bump-tap.sh X.Y.Z" >&2; exit 2; }
tap="$(dirname "$0")/../../homebrew-tap"
url="https://github.com/nulljosh/nimble/archive/refs/tags/v$v.tar.gz"
sha=$(curl -sL "$url" | shasum -a 256 | cut -d' ' -f1)
sed -i.bak -e "s|^  url .*|  url \"$url\"|" -e "s|^  sha256 .*|  sha256 \"$sha\"|" "$tap/Formula/nimble.rb"
rm -f "$tap/Formula/nimble.rb.bak"
git -C "$tap" add Formula/nimble.rb
git -C "$tap" commit -q -m "Nimble formula $v"
git -C "$tap" push -q origin HEAD
echo "tap at $v ($sha)"
