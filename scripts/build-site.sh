#!/usr/bin/env bash
# Stages ONLY the public site files into ./_site (or $1), so docs/, tests/, data/ never get published.
# Also stamps the service worker with a version and the exact list of files to keep offline.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-_site}"
rm -rf "$OUT" && mkdir -p "$OUT"
for f in index.html manifest.webmanifest favicon.ico; do
  [ -e "$f" ] && cp "$f" "$OUT"/ || true
done
for d in src icons assets; do
  [ -d "$d" ] && cp -r "$d" "$OUT"/ || true
done
touch "$OUT"/.nojekyll
# Guard: personal data must never be published.
if [ -e "$OUT/data" ] || find "$OUT" -name '*.local.json' -o -name 'seed*.json' -o -name '*.xlsx' | grep -q .; then
  echo "REFUSING: personal data found in $OUT" >&2; exit 1
fi
# Service worker: version = commit (or time) + precache list of every staged file.
VERSION="$(git rev-parse --short HEAD 2>/dev/null || date +%s)-$(date +%Y%m%d%H%M%S)"
LIST="$(cd "$OUT" && find . -type f ! -name '.nojekyll' | sed 's#^\./#./#' | sort | awk 'BEGIN{printf "["} {printf "%s\"%s\"", (NR>1?",":""), $0} END{printf ",\"./\"]"}')"
sed -e "s#__VERSION__#${VERSION}#" -e "s#__PRECACHE__#${LIST}#" sw.js > "$OUT/sw.js"
echo "Staged site:"; find "$OUT" -type f | sort
