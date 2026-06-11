#!/usr/bin/env bash
set -e

echo "==> Setting up Python environment..."

python3 -m venv .venv
source .venv/bin/activate

pip install --upgrade pip

echo "==> Installing Python libraries..."
pip install -r requirements.txt

echo "✓ Python setup complete. Activate with: source .venv/bin/activate"
