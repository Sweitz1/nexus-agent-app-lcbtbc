#!/usr/bin/env bash
# Stage a clean Electron app folder (no Expo dependencies) for electron-builder.
# Usage: scripts/stage-electron.sh <version>
set -euo pipefail
VERSION="${1:-1.0.0}"
rm -rf stage
mkdir -p stage/dist stage/assets
cp dist/index.html stage/dist/
cp electron-main.js stage/
cp assets/icon.png stage/assets/
if command -v magick >/dev/null 2>&1; then
  magick assets/icon.png -define icon:auto-resize=256,128,64,48,32,16 stage/assets/icon.ico
fi
cat > stage/package.json <<JSON
{
  "name": "halo",
  "productName": "Halo",
  "version": "${VERSION}",
  "description": "Halo: local-first AI agent with GitHub skills",
  "homepage": "https://github.com/Sweitz1/nexus-agent-app-lcbtbc",
  "author": { "name": "Halo", "email": "noreply@halo.invalid" },
  "main": "electron-main.js"
}
JSON
sed 's#"dist-electron"#"../dist-electron"#' electron-builder.json > stage/electron-builder.json
