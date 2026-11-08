#!/usr/bin/env bash
# Nexus Agent: set up fully local AI on Linux (no API keys, no subscription).
#
# Installs Ollama if needed, checks your GPU and RAM, and pulls models that fit.
#
#   ./linux-local-ai-setup.sh                       # pick models for this machine
#   ./linux-local-ai-setup.sh --profile large       # fast + large models
#   ./linux-local-ai-setup.sh --model <ollama-tag>  # pull any extra model, e.g. an abliterated one
#   ./linux-local-ai-setup.sh --model hf.co/<user>/<repo>-GGUF:Q4_K_M   # straight from Hugging Face
#   ./linux-local-ai-setup.sh --dry-run             # show the plan, change nothing
#
# Then open Nexus Agent → Providers → Local LLM → "Detect installed models".
set -euo pipefail

PROFILE="auto"
EXTRA_MODELS=()
DRY_RUN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --profile) PROFILE="${2:?--profile needs fast|balanced|large}"; shift 2 ;;
    --model)   EXTRA_MODELS+=("${2:?--model needs a model tag}"); shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

say()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
run()  { if [ "$DRY_RUN" = 1 ]; then echo "    (dry run) $*"; else "$@"; fi; }

# ── Hardware ────────────────────────────────────────────────────────────────
RAM_GB=$(awk '/MemTotal/ {printf "%d", $2/1024/1024 + 0.5}' /proc/meminfo)
CPU=$(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2- | sed 's/^ *//')
VRAM_GB=0
GPU="none detected"
if command -v nvidia-smi >/dev/null 2>&1; then
  GPU=$(nvidia-smi --query-gpu=name --format=csv,noheader | head -1)
  VRAM_MB=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -1 | tr -dc '0-9')
  VRAM_GB=$(( (VRAM_MB + 512) / 1024 ))
elif command -v lspci >/dev/null 2>&1; then
  GPU=$(lspci | grep -Ei 'vga|3d|display' | head -1 | cut -d: -f3- | sed 's/^ *//')
  case "$GPU" in
    *NVIDIA*) warn "NVIDIA GPU found but nvidia-smi is missing. Install the NVIDIA driver for GPU speed (e.g. 'sudo ubuntu-drivers install')." ;;
  esac
fi
say "CPU: ${CPU:-unknown}"
say "RAM: ${RAM_GB} GB"
say "GPU: ${GPU} (${VRAM_GB} GB VRAM)"

# ── Model plan ──────────────────────────────────────────────────────────────
# Rough Q4 sizes: 8B ≈ 5 GB (fits fully in 8 GB VRAM, fast);
# 14B ≈ 9 GB (spills a little into RAM); 30B-A3B MoE ≈ 19 GB (only ~3B active
# per token, so it stays usable with most layers in system RAM).
FAST="qwen3:8b"
BALANCED="qwen3:14b"
LARGE="qwen3:30b-a3b"
if [ "$PROFILE" = "auto" ]; then
  if [ "$RAM_GB" -ge 48 ]; then PROFILE="large"
  elif [ "$RAM_GB" -ge 24 ] || [ "$VRAM_GB" -ge 10 ]; then PROFILE="balanced"
  else PROFILE="fast"; fi
fi
case "$PROFILE" in
  fast)     MODELS=("$FAST") ;;
  balanced) MODELS=("$FAST" "$BALANCED") ;;
  large)    MODELS=("$FAST" "$LARGE") ;;
  *) echo "Unknown profile: $PROFILE (use fast, balanced or large)" >&2; exit 2 ;;
esac
MODELS+=("${EXTRA_MODELS[@]}")
say "Profile: $PROFILE → ${MODELS[*]}"

# ── Ollama ──────────────────────────────────────────────────────────────────
if ! command -v ollama >/dev/null 2>&1; then
  say "Installing Ollama (official installer from ollama.com)"
  if [ "$DRY_RUN" = 1 ]; then
    echo "    (dry run) curl -fsSL https://ollama.com/install.sh | sh"
  else
    curl -fsSL https://ollama.com/install.sh | sh
  fi
else
  say "Ollama already installed: $(ollama --version 2>/dev/null | head -1)"
fi

if [ "$DRY_RUN" = 0 ] && ! curl -fsS -m 3 http://127.0.0.1:11434/api/version >/dev/null 2>&1; then
  say "Starting Ollama"
  if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files ollama.service >/dev/null 2>&1; then
    sudo systemctl enable --now ollama
  else
    nohup ollama serve >/tmp/ollama.log 2>&1 &
  fi
  for _ in $(seq 1 30); do curl -fsS -m 2 http://127.0.0.1:11434/api/version >/dev/null 2>&1 && break; sleep 1; done
fi

for m in "${MODELS[@]}"; do
  say "Pulling $m"
  run ollama pull "$m" || warn "Could not pull $m. Check the tag on ollama.com/library or Hugging Face."
done

cat <<EOF

Done. In Nexus Agent:
  Providers → Local LLM (on-device / LAN) → Edit
    Server URL: http://127.0.0.1:11434/v1
    Tap "Detect installed models", pick one, Save, then "Set as Default".

Tips for ${VRAM_GB} GB VRAM / ${RAM_GB} GB RAM:
  • ${FAST}: fastest; runs entirely on the GPU.
  • ${LARGE}: smarter; uses system RAM, still interactive thanks to MoE.
  • Dense 32B+ models fit in RAM but run at only a few tokens per second.
  • To use the Android app against this PC over Wi-Fi, run Ollama with
    OLLAMA_HOST=0.0.0.0 and OLLAMA_ORIGINS=* (only on a trusted network).
EOF
