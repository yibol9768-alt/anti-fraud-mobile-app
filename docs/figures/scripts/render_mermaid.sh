#!/usr/bin/env bash
# Render all .mmd diagrams in docs/figures/mermaid-src/ to PNG via mermaid.ink.
# Falls back to local @mermaid-js/mermaid-cli if the HTTP service rejects a diagram.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/../mermaid-src"
OUT="$HERE/.."
TYPE="${MERMAID_TYPE:-img}"   # img | svg | pdf

cd "$SRC"
shopt -s nullglob
for f in *.mmd; do
  name="${f%.mmd}"
  out="$OUT/$name.png"
  # URL-safe base64 (swap + / for - _) so mermaid.ink accepts the encoded source.
  encoded=$(base64 -i "$f" | tr -d '\n' | tr '+/' '-_')
  url="https://mermaid.ink/$TYPE/${encoded}?type=png"
  echo "[mermaid] $f → $out"
  # Retry up to 4 times — mermaid.ink cold-starts occasionally return a 5xx.
  ok=false
  for attempt in 1 2 3 4; do
    if curl -sLf --retry 2 --max-time 40 -o "$out" "$url"; then
      sz=$(stat -f %z "$out" 2>/dev/null || stat -c %s "$out")
      if [ "$sz" -gt 1024 ]; then
        echo "  ok ${sz}B (attempt $attempt)"
        ok=true
        break
      fi
    fi
    sleep 2
  done
  if ! $ok; then
    echo "  HTTP fail after 4 attempts" >&2
    exit 1
  fi
done
