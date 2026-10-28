#!/usr/bin/env bash
# Copies the plugin into a vault: ./install.sh [--dev] "/path/to/vault"
# Then turn the plugin off and on in Obsidian (or restart) to load it.
#
# --dev installs a test build: the installed manifest.json gets "-dev" after
# the version (1.0.1 becomes 1.0.1-dev), so Settings shows which build you
# are running. The repo's manifest.json is not changed. When the real release
# comes out, Obsidian offers it as an update.
set -euo pipefail

dev=false
if [ "${1:-}" = "--dev" ]; then
  dev=true
  shift
fi

vault="${1:?Usage: ./install.sh [--dev] /path/to/vault}"
dest="$vault/.obsidian/plugins/claudian-minimal"
here="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$dest"
cp "$here/main.js" "$here/manifest.json" "$here/styles.css" "$dest/"

if [ "$dev" = true ]; then
  sed -E 's/("version": *"[^"]+)"/\1-dev"/' "$here/manifest.json" > "$dest/manifest.json"
  echo "Installed the test build to $dest"
else
  echo "Installed to $dest"
fi
