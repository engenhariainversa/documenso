#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
gen() {
  docker run --rm -v "$PWD":/w -w /w dpokidov/imagemagick:latest \
    -size "$1x$1" xc:'#111827' -gravity center -fill white \
    -font DejaVu-Sans-Bold -pointsize "$(( $1 * 6 / 10 ))" -annotate 0 'D' "$2"
}
for dir in apps/remix/public packages/assets; do
  gen 16 "$dir/favicon-16x16.png"
  gen 32 "$dir/favicon-32x32.png"
  gen 180 "$dir/apple-touch-icon.png"
  gen 192 "$dir/android-chrome-192x192.png"
  gen 512 "$dir/android-chrome-512x512.png"
  docker run --rm -v "$PWD":/w -w /w dpokidov/imagemagick:latest "$dir/favicon-32x32.png" "$dir/favicon.ico"
done
docker run --rm -v "$PWD":/w -w /w dpokidov/imagemagick:latest \
  -size 170x25 xc:white -gravity west -fill '#111827' -font DejaVu-Sans-Bold -pointsize 20 -annotate +0+0 'Docverse' \
  apps/remix/public/static/docverse-logo.png
