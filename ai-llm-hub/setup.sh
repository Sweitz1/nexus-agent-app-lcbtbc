#!/usr/bin/env bash
set -e

echo "======================================================"
echo "  AI LLM Hub Setup"
echo "======================================================"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Python environment
echo "==> Creating Python virtual environment..."
python3 -m venv "$ROOT/.venv"
source "$ROOT/.venv/bin/activate"
pip install --upgrade pip -q

echo "==> Installing Python dependencies..."
pip install -r "$ROOT/requirements.txt"

# Copy .env if not exists
if [ ! -f "$ROOT/config/.env" ]; then
    cp "$ROOT/config/.env.example" "$ROOT/config/.env"
    echo ""
    echo "⚠  Created config/.env — add your API keys before running."
fi

# Ollama setup (optional)
echo ""
read -r -p "Install Ollama for local models? [y/N] " install_ollama
if [[ "$install_ollama" =~ ^[Yy]$ ]]; then
    if command -v ollama &>/dev/null; then
        echo "✓ Ollama already installed"
    else
        echo "==> Installing Ollama..."
        curl -fsSL https://ollama.ai/install.sh | sh
    fi

    echo ""
    echo "Which local models do you want to pull?"
    echo "  1) Quick start: llama3.2 (3B, ~2GB)"
    echo "  2) Coding:      qwen2.5-coder:7b (7B, ~5GB)"
    echo "  3) Reasoning:   deepseek-r1:7b (7B, ~5GB)"
    echo "  4) Skip"
    read -r -p "Choice [1-4]: " model_choice

    case "$model_choice" in
        1) ollama pull llama3.2 ;;
        2) ollama pull qwen2.5-coder:7b ;;
        3) ollama pull deepseek-r1:7b ;;
        *) echo "Skipped." ;;
    esac
fi

echo ""
echo "======================================================"
echo "  Setup complete!"
echo ""
echo "  Activate:   source .venv/bin/activate"
echo "  Chat:       python implementation/chat_llm.py"
echo "  Coding:     python implementation/coding_llm.py"
echo "  Unified:    python implementation/unified_client.py --model claude --mode coding"
echo "  Local:      python implementation/local_ollama.py --model llama3.2"
echo "======================================================"
