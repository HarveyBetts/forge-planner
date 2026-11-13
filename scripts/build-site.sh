#!/usr/bin/env bash
# Stages ONLY the public site files into ./_site (or $1), so docs/, tests/, data/ never get published.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-_site}"
rm -rf "$OUT" && mkdir -p "$OUT"
for f in index.html manifest.webmanifest sw.js favicon.ico favicon.png apple-touch-icon.png; do
  [ -e "$f" ] && cp "$f" "$OUT"/ || true
done
for d in src assets; do
  [ -d "$d" ] && cp -r "$d" "$OUT"/ || true
done
touch "$OUT"/.nojekyll
# Guard: personal data must never be published.
if [ -e "$OUT/data" ] || find "$OUT" -name '*.local.json' -o -name 'seed*.json' | grep -q .; then
  echo "REFUSING: personal data found in $OUT" >&2; exit 1
fi
echo "Staged site:"; find "$OUT" -type f | sort
