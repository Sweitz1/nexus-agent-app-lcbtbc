# NexusLLM — One Merged Model

A single new LLM built by merging the best open-source models into one:

| Source Model | Contribution |
|-------------|-------------|
| `meta-llama/Llama-3.1-70B-Instruct` | Core reasoning, chat, instruction following |
| `deepseek-ai/DeepSeek-Coder-V2-Instruct` | Deep code understanding, 338 languages |
| `Qwen/Qwen2.5-Coder-32B-Instruct` | Code generation, completion, debugging |

The merge uses **TIES + DARE** (state-of-the-art model merging) to combine weights without any training. The result is a single model file you can run locally or upload to HuggingFace.

## Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Build the merged model (downloads ~140GB, needs 80GB+ VRAM or CPU)
python merge_model.py

# 3. Run it
python model.py --prompt "Write a Rust async TCP server"

# 4. Serve as an OpenAI-compatible API
python serve.py

# 5. Upload to HuggingFace
python upload_hf.py --repo your-username/nexus-llm
```

## Architecture

```
NexusLLM (merged)
    ├── Base: LLaMA 3.1 70B Instruct     (reasoning + chat backbone)
    ├── + DeepSeek-Coder-V2              (code understanding, 128K ctx)
    └── + Qwen2.5-Coder-32B              (code generation quality)

Merge method: TIES-DARE (no training needed)
Final size:   ~70B parameters
Context:      128K tokens
Strengths:    Coding + chat + reasoning in one model
```

## Files

| File | Purpose |
|------|---------|
| `merge_model.py` | Build the merged model using mergekit |
| `merge_config.yaml` | Merge recipe (swap models/weights here) |
| `model.py` | `NexusLLM` class — load, run, and chat with the model |
| `serve.py` | OpenAI-compatible HTTP API server |
| `upload_hf.py` | Upload finished model to HuggingFace Hub |
| `finetune.py` | Optional fine-tuning on custom data |
| `requirements.txt` | All Python dependencies |

## Smaller Variants (less VRAM)

Edit `merge_config.yaml` and swap in smaller bases:

| Variant | Base | VRAM | Quality |
|---------|------|------|---------|
| NexusLLM-70B | LLaMA-3.1-70B | 140GB | Best |
| NexusLLM-32B | Qwen2.5-Coder-32B | 64GB | Great |
| NexusLLM-14B | Phi-4-14B | 28GB | Good |
| NexusLLM-7B | Mistral-7B | 14GB | Fast |
| NexusLLM-3B | LLaMA-3.2-3B | 6GB | On-device |
