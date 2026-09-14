#!/usr/bin/env bash
# Pull uncensored models into the Venice Ollama instance

set -e

OLLAMA="docker exec venice_ollama ollama"

echo "Venice — Uncensored Model Library"
echo "=================================="

MODELS=(
  "dolphin-mistral:7b         # Uncensored Mistral 7B — fast, popular"
  "dolphin-mistral:7b-v2.8    # Dolphin Mistral 2.8 variant"
  "dolphin-llama3:8b          # Uncensored LLaMA 3 8B"
  "dolphin-llama3:70b         # Uncensored LLaMA 3 70B — best quality, 40GB"
  "dolphin-mixtral:8x7b       # Uncensored Mixtral 8x7B"
  "dolphin-mixtral:8x22b      # Uncensored Mixtral 8x22B — frontier, 80GB"
  "hermes3:8b                 # NousResearch Hermes 3 (LLaMA 3.1 based)"
  "hermes3:70b                # NousResearch Hermes 3 70B"
  "nous-hermes2-mixtral:8x7b  # NousResearch Hermes 2 on Mixtral"
  "wizard-vicuna-uncensored:13b # Wizard Vicuna uncensored"
  "llama3-gradient:8b         # Extended context uncensored LLaMA"
  "openhermes2.5-mistral:7b   # OpenHermes 2.5 on Mistral"
  "samantha-mistral:7b        # Samantha (uncensored, emotionally aware)"
)

echo ""
echo "Available models:"
for i in "${!MODELS[@]}"; do
  echo "  $((i+1))) ${MODELS[$i]}"
done
echo "  0) Pull ALL (needs 200GB+)"
echo ""
read -r -p "Enter numbers (space-separated) or 0 for all: " choices

if [[ "$choices" == "0" ]]; then
  choices=$(seq 1 ${#MODELS[@]} | tr '\n' ' ')
fi

for choice in $choices; do
  idx=$((choice - 1))
  if [[ $idx -ge 0 && $idx -lt ${#MODELS[@]} ]]; then
    model=$(echo "${MODELS[$idx]}" | awk '{print $1}')
    echo ""
    echo "==> Pulling $model..."
    $OLLAMA pull "$model"
    echo "✓ $model ready"
  fi
done

echo ""
echo "Installed models:"
$OLLAMA list
