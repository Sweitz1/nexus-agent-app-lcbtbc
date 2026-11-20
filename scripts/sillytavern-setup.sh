#!/usr/bin/env bash
# Install or update SillyTavern (github.com/SillyTavern/SillyTavern, AGPL-3.0)
# for use with local Ollama models, and copy Nexus Agent character cards into it.
#
#   ./sillytavern-setup.sh                       # install or update in ~/SillyTavern
#   ./sillytavern-setup.sh --import ~/Downloads  # also copy character card PNGs from a folder
#   ./sillytavern-setup.sh --start               # then start it (http://127.0.0.1:8000)
#   ./sillytavern-setup.sh --dry-run
#
# SillyTavern only listens on this PC by default (listen: false); this script
# leaves that as it is.
set -euo pipefail

ST_DIR="${ST_DIR:-$HOME/SillyTavern}"
ST_REPO="${ST_REPO:-https://github.com/SillyTavern/SillyTavern}"
ST_BRANCH="${ST_BRANCH:-release}"
IMPORT_DIR=""
START=0
DRY_RUN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --import) IMPORT_DIR="${2:?--import needs a folder}"; shift 2 ;;
    --start) START=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

say()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mxx\033[0m %s\n' "$*" >&2; exit 1; }
run()  { if [ "$DRY_RUN" = 1 ]; then echo "    (dry run) $*"; else "$@"; fi; }

# ── Prerequisites: git and Node.js 20+ ──────────────────────────────────────
command -v git >/dev/null 2>&1 || die "Install git first (e.g. sudo apt install git)."
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  die "SillyTavern needs Node.js 20 or newer with npm. On Debian/Ubuntu: sudo apt install nodejs npm (or use nvm)."
fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 20 ] || die "Node.js $(node -v) is too old; SillyTavern needs 20 or newer."
say "Node.js $(node -v), npm $(npm -v)"

# ── Install or update ───────────────────────────────────────────────────────
if [ -d "$ST_DIR/.git" ]; then
  say "Updating SillyTavern in $ST_DIR ($ST_BRANCH)"
  run git -C "$ST_DIR" pull --ff-only
else
  say "Downloading SillyTavern ($ST_BRANCH) into $ST_DIR"
  run git clone --depth 1 --branch "$ST_BRANCH" "$ST_REPO" "$ST_DIR"
fi

# ── Copy character cards ────────────────────────────────────────────────────
# SillyTavern reads character cards (PNG with an embedded "chara"/"ccv3" text chunk)
# from data/default-user/characters/.
if [ -n "$IMPORT_DIR" ]; then
  [ -d "$IMPORT_DIR" ] || die "No such folder: $IMPORT_DIR"
  DEST="$ST_DIR/data/default-user/characters"
  run mkdir -p "$DEST"
  copied=0; skipped=0
  shopt -s nullglob nocaseglob
  for f in "$IMPORT_DIR"/*.png; do
    # Only PNGs that actually carry a character card.
    if grep -aqE 'tEXt(chara|ccv3)' "$f"; then
      if [ -e "$DEST/$(basename "$f")" ]; then skipped=$((skipped+1)); continue; fi
      run cp -n "$f" "$DEST/"
      copied=$((copied+1))
    fi
  done
  shopt -u nullglob nocaseglob
  say "Copied $copied character card(s) to $DEST$( [ "$skipped" -gt 0 ] && echo " (skipped $skipped already there)")"
  ls "$IMPORT_DIR"/*.json >/dev/null 2>&1 && warn "JSON cards aren't picked up from the folder: import those in SillyTavern with Character Management → Import."
fi

cat <<EOF

SillyTavern is in $ST_DIR.
  Start:  $ST_DIR/start.sh      then open http://127.0.0.1:8000

Connect it to your local models (once):
  API Connections (plug icon) → API: Text Completion → API Type: Ollama
  → API URL: http://127.0.0.1:11434 → Connect → pick a model.

Nexus Agent cards: Characters → Edit → Export PNG, then re-run this script with
  --import <folder with the PNGs>   (on Android they're in Downloads/NexusAgent).
EOF

if [ "$START" = 1 ]; then
  say "Starting SillyTavern (Ctrl+C to stop)"
  if [ "$DRY_RUN" = 1 ]; then echo "    (dry run) $ST_DIR/start.sh"; else exec "$ST_DIR/start.sh"; fi
fi
