#!/usr/bin/env bash
# Build the Reel: photos -> manifest, music, frames -> build/reel.mp4 (+ a version without music and a cover image).
set -euo pipefail
cd "$(dirname "$0")"
[ -d node_modules ] || npm install --no-audit --no-fund
python3 tools/prepare.py
python3 tools/music.py build/music.wav
python3 tools/music.py build/sfx-only.wav --no-music
node tools/render.mjs --out build/reel.mp4 --audio build/music.wav
ffmpeg -hide_banner -loglevel error -y -i build/reel.mp4 -map 0:v -c:v copy build/reel-silent.mp4
node tools/render.mjs --stills 5.4 >/dev/null && mv build/still-5.40.png build/cover.png
echo "done: build/reel.mp4  build/reel-silent.mp4  build/cover.png"
