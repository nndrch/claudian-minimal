#!/usr/bin/env bash
# Copies the plugin into a vault: ./install.sh "/path/to/vault"
# Then turn the plugin off and on in Obsidian (or restart) to load it.
set -euo pipefail

vault="${1:?Usage: ./install.sh /path/to/vault}"
dest="$vault/.obsidian/plugins/claudian-minimal"
here="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$dest"
cp "$here/main.js" "$here/manifest.json" "$here/styles.css" "$dest/"
echo "Installed to $dest"
