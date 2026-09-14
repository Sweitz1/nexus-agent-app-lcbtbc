#!/usr/bin/env bash
set -e

echo "======================================================"
echo "  NexusLLM Setup"
echo "======================================================"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Python venv
python3 -m venv "$ROOT/.venv"
source "$ROOT/.venv/bin/activate"
pip install --upgrade pip -q

# PyTorch (with CUDA if available)
echo "==> Detecting GPU..."
if command -v nvidia-smi &>/dev/null; then
    CUDA_VER=$(nvidia-smi | grep -oP "CUDA Version: \K[0-9]+\.[0-9]+" | head -1)
    echo "    GPU detected, CUDA $CUDA_VER"
    TORCH_INDEX="https://download.pytorch.org/whl/cu124"
    pip install torch torchvision --index-url "$TORCH_INDEX" -q
else
    echo "    No GPU — installing CPU-only PyTorch"
    pip install torch --index-url https://download.pytorch.org/whl/cpu -q
fi

echo "==> Installing NexusLLM dependencies..."
pip install -r "$ROOT/requirements.txt" -q

echo ""
echo "======================================================"
echo "  Setup complete! Next steps:"
echo ""
echo "  1. Activate env:   source .venv/bin/activate"
echo "  2. Build model:    python merge_model.py"
echo "  3. Run model:      python model.py"
echo "  4. Serve as API:   python serve.py --model ./nexus-llm-merged"
echo "  5. Upload to HF:   python upload_hf.py upload \\"
echo "                       --model ./nexus-llm-merged \\"
echo "                       --repo your-username/nexus-llm"
echo "======================================================"
