#!/usr/bin/env bash
# Stages ONLY the public site files into ./_site (so docs/, tests/, data/ never get published).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf _site && mkdir _site
for f in index.html manifest.webmanifest sw.js favicon.ico favicon.png apple-touch-icon.png; do
  [ -e "$f" ] && cp "$f" _site/ || true
done
for d in src assets; do
  [ -d "$d" ] && cp -r "$d" _site/ || true
done
touch _site/.nojekyll
echo "Staged site:"; find _site -type f | sort
