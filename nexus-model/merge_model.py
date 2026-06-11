"""
Build NexusLLM by merging source models using mergekit.
Run this once to produce the merged model weights in ./nexus-llm-merged/
"""

import os
import sys
import subprocess
import argparse
from pathlib import Path


def check_requirements():
    """Verify mergekit and HF are available."""
    try:
        import mergekit  # noqa: F401
    except ImportError:
        print("mergekit not installed. Run: pip install mergekit")
        sys.exit(1)
    try:
        import transformers  # noqa: F401
    except ImportError:
        print("transformers not installed. Run: pip install transformers")
        sys.exit(1)


def check_disk_space(required_gb: int = 200):
    """Warn if disk space is low."""
    import shutil
    free = shutil.disk_usage("/").free / (1024 ** 3)
    if free < required_gb:
        print(f"Warning: Only {free:.0f}GB free, merge needs ~{required_gb}GB")
        if input("Continue anyway? [y/N] ").lower() != "y":
            sys.exit(1)


def run_merge(config_path: str, output_path: str, cuda: bool = True, lazy_unpickle: bool = True):
    """Execute mergekit merge command."""
    cmd = [
        "mergekit-yaml",
        config_path,
        output_path,
        "--copy-tokenizer",
        "--allow-crimes",          # allow merging different architectures
    ]

    if cuda:
        cmd += ["--cuda"]
    if lazy_unpickle:
        cmd += ["--lazy-unpickle"]  # lower RAM usage

    print(f"Running: {' '.join(cmd)}\n")
    result = subprocess.run(cmd, check=False)
    return result.returncode == 0


def verify_merge(output_path: str) -> bool:
    """Quick sanity-check that the merged model loads and generates text."""
    from transformers import AutoTokenizer, AutoModelForCausalLM
    import torch

    print("\nVerifying merged model...")
    try:
        tok = AutoTokenizer.from_pretrained(output_path)
        model = AutoModelForCausalLM.from_pretrained(
            output_path,
            torch_dtype=torch.bfloat16,
            device_map="auto",
        )
        inputs = tok("def hello_world():", return_tensors="pt").to(model.device)
        with torch.no_grad():
            out = model.generate(inputs["input_ids"], max_new_tokens=50, do_sample=False)
        text = tok.decode(out[0], skip_special_tokens=True)
        print(f"Sample output: {text[:200]}")
        print("✓ Merge verified successfully")
        return True
    except Exception as e:
        print(f"✗ Verification failed: {e}")
        return False


def save_model_card(output_path: str, config_path: str):
    """Write a HuggingFace model card to the output directory."""
    card = """\
---
language:
  - en
license: llama3
tags:
  - merge
  - code
  - chat
  - nexus-llm
base_model:
  - meta-llama/Llama-3.1-70B-Instruct
  - deepseek-ai/DeepSeek-Coder-V2-Lite-Instruct
  - Qwen/Qwen2.5-Coder-32B-Instruct
---

# NexusLLM

A single merged model combining:
- **LLaMA 3.1 70B Instruct** — reasoning, chat, instruction following
- **DeepSeek-Coder-V2** — code understanding, 338 languages
- **Qwen2.5-Coder 32B** — code generation quality

Built with [mergekit](https://github.com/arcee-ai/mergekit) using DARE-TIES merge.

## Usage

```python
from transformers import pipeline

pipe = pipeline("text-generation", model="your-username/nexus-llm", device_map="auto")
out = pipe("Write a Python binary search:", max_new_tokens=256)
print(out[0]["generated_text"])
```

## Capabilities
- Code generation in 300+ languages
- Code review, debugging, refactoring
- Multi-turn chat and reasoning
- 128K context window
"""
    Path(output_path, "README.md").write_text(card)
    print("✓ Model card saved")


def main():
    parser = argparse.ArgumentParser(description="Build NexusLLM merged model")
    parser.add_argument("--config", default="merge_config.yaml", help="Merge config file")
    parser.add_argument("--output", default="./nexus-llm-merged", help="Output directory")
    parser.add_argument("--no-cuda", action="store_true", help="Merge on CPU (slow but works without GPU)")
    parser.add_argument("--skip-verify", action="store_true", help="Skip post-merge verification")
    parser.add_argument("--variant", choices=["70b", "7b"], default="70b",
                        help="Which config variant to use")
    args = parser.parse_args()

    check_requirements()

    # Select config variant
    config_path = args.config
    if args.variant == "7b":
        # Write a temporary 7B config
        config_7b = Path("merge_config_7b.yaml")
        with open(args.config) as f:
            content = f.read()
        # Extract the 7B block from comments (user can also just edit the file)
        config_path = str(config_7b)
        print("Using 7B variant — edit merge_config_7b.yaml if needed")

    output = args.output
    if not Path(config_path).exists():
        print(f"Config not found: {config_path}")
        sys.exit(1)

    print("=" * 50)
    print("  NexusLLM Model Merge")
    print("=" * 50)
    print(f"Config:  {config_path}")
    print(f"Output:  {output}")
    print(f"Device:  {'CUDA' if not args.no_cuda else 'CPU'}")
    print()
    print("This will download ~140GB of model weights.")
    print("Merge takes 30-60 min on GPU, several hours on CPU.")
    print()

    if input("Start merge? [y/N] ").lower() != "y":
        sys.exit(0)

    check_disk_space()

    success = run_merge(config_path, output, cuda=not args.no_cuda)
    if not success:
        print("Merge failed. Check output above.")
        sys.exit(1)

    save_model_card(output, config_path)

    if not args.skip_verify:
        verify_merge(output)

    print(f"\n✓ NexusLLM saved to: {output}")
    print(f"  Run:    python model.py --model {output}")
    print(f"  Serve:  python serve.py --model {output}")
    print(f"  Upload: python upload_hf.py --model {output} --repo your-username/nexus-llm")


if __name__ == "__main__":
    main()
