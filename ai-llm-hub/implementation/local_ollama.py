"""
Local model runner via Ollama.
Handles model management, pulling, running, and benchmarking local LLMs.
"""

import os
import json
import time
import subprocess
from pathlib import Path
from typing import Generator

try:
    import ollama
    OLLAMA_AVAILABLE = True
except ImportError:
    OLLAMA_AVAILABLE = False

OLLAMA_HOST = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

RECOMMENDED_MODELS = {
    "coding": [
        ("deepseek-coder-v2", "16B — Best open coding model"),
        ("qwen2.5-coder:32b", "32B — Top-tier coding, 128K context"),
        ("qwen2.5-coder:7b", "7B — Fast coding, good quality"),
        ("codellama:34b", "34B — Meta's code model"),
        ("starcoder2:15b", "15B — 600+ languages"),
    ],
    "chat": [
        ("llama3.2", "3B — Fast, good quality"),
        ("llama3.1:70b", "70B — Best local chat"),
        ("mistral", "7B — Fast, Apache 2.0"),
        ("mixtral:8x22b", "141B MoE — GPT-4 level"),
    ],
    "reasoning": [
        ("deepseek-r1:32b", "32B — Chain-of-thought reasoning"),
        ("deepseek-r1:7b", "7B — Smaller reasoning model"),
        ("phi4", "14B — Excellent reasoning/param"),
    ],
    "small": [
        ("phi4", "14B — Best small model"),
        ("llama3.2:3b", "3B — On-device"),
        ("qwen2.5-coder:7b", "7B — Efficient coder"),
    ],
}


def check_ollama_running() -> bool:
    try:
        import urllib.request
        urllib.request.urlopen(f"{OLLAMA_HOST}/api/tags", timeout=2)
        return True
    except Exception:
        return False


def start_ollama():
    """Start Ollama if not running."""
    if check_ollama_running():
        return True
    print("Starting Ollama...")
    subprocess.Popen(["ollama", "serve"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)
    return check_ollama_running()


def list_local_models() -> list[dict]:
    """List all locally available Ollama models."""
    if not OLLAMA_AVAILABLE:
        return []
    try:
        return ollama.list()["models"]
    except Exception:
        return []


def pull_model(model: str) -> bool:
    """Pull a model from Ollama registry."""
    print(f"Pulling {model}...")
    try:
        for progress in ollama.pull(model, stream=True):
            status = progress.get("status", "")
            if "pulling" in status or "verifying" in status:
                total = progress.get("total", 0)
                completed = progress.get("completed", 0)
                if total > 0:
                    pct = completed / total * 100
                    print(f"\r  {status}: {pct:.1f}%", end="", flush=True)
        print(f"\n✓ {model} ready")
        return True
    except Exception as e:
        print(f"✗ Failed to pull {model}: {e}")
        return False


def chat_local(
    model: str,
    messages: list[dict],
    stream: bool = True,
    temperature: float = 0.7,
    system: str = "",
) -> str:
    """Chat with a local Ollama model."""
    if not OLLAMA_AVAILABLE:
        raise ImportError("Install ollama: pip install ollama")

    if system:
        messages = [{"role": "system", "content": system}] + messages

    if stream:
        chunks = []
        for chunk in ollama.chat(model=model, messages=messages, stream=True,
                                  options={"temperature": temperature}):
            delta = chunk["message"]["content"]
            print(delta, end="", flush=True)
            chunks.append(delta)
        print()
        return "".join(chunks)
    else:
        response = ollama.chat(model=model, messages=messages,
                                options={"temperature": temperature})
        return response["message"]["content"]


def generate_local(
    model: str,
    prompt: str,
    suffix: str = "",
    stream: bool = True,
    temperature: float = 0.2,
) -> str:
    """Generate a completion (non-chat, good for code fill-in-middle)."""
    if not OLLAMA_AVAILABLE:
        raise ImportError("Install ollama: pip install ollama")

    kwargs = {"model": model, "prompt": prompt, "stream": stream,
              "options": {"temperature": temperature}}
    if suffix:
        kwargs["suffix"] = suffix  # FIM (fill-in-middle) for coding

    if stream:
        chunks = []
        for chunk in ollama.generate(**kwargs):
            delta = chunk.get("response", "")
            print(delta, end="", flush=True)
            chunks.append(delta)
        print()
        return "".join(chunks)
    else:
        response = ollama.generate(**kwargs)
        return response["response"]


def benchmark_model(model: str, prompts: list[str] | None = None) -> dict:
    """Run a quick speed/quality benchmark on a local model."""
    if not prompts:
        prompts = [
            "Write a Python function to reverse a linked list.",
            "Explain the difference between a mutex and a semaphore.",
            "What is the time complexity of quicksort?",
        ]

    results = []
    for prompt in prompts:
        start = time.time()
        response = generate_local(model, prompt, stream=False)
        elapsed = time.time() - start
        tokens = len(response.split())
        results.append({
            "prompt": prompt[:50] + "...",
            "tokens": tokens,
            "seconds": round(elapsed, 2),
            "tokens_per_sec": round(tokens / elapsed, 1),
        })

    avg_tps = sum(r["tokens_per_sec"] for r in results) / len(results)
    return {
        "model": model,
        "results": results,
        "avg_tokens_per_sec": round(avg_tps, 1),
    }


def interactive_local(model: str = "llama3.2", system: str = ""):
    """Interactive chat session with a local model."""
    if not check_ollama_running():
        if not start_ollama():
            print("Could not start Ollama. Install from https://ollama.ai")
            return

    local_models = [m["name"] for m in list_local_models()]
    if model not in local_models:
        print(f"{model} not found locally.")
        if input(f"Pull {model}? [y/N] ").lower() == "y":
            if not pull_model(model):
                return

    print(f"=== Local LLM: {model} ===")
    if not system:
        system = "You are a helpful coding assistant. Write clean, efficient code."

    history: list[dict] = []

    while True:
        try:
            user_input = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if not user_input or user_input in ("exit", "quit"):
            break

        history.append({"role": "user", "content": user_input})
        print("\nAssistant: ", end="")
        response = chat_local(model, history, system=system)
        history.append({"role": "assistant", "content": response})
        print()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="llama3.2")
    parser.add_argument("--list", action="store_true", help="List local models")
    parser.add_argument("--pull", help="Pull a model by name")
    parser.add_argument("--benchmark", action="store_true")
    parser.add_argument("--recommend", choices=list(RECOMMENDED_MODELS.keys()))
    args = parser.parse_args()

    if args.list:
        models = list_local_models()
        for m in models:
            print(f"  {m['name']} ({m.get('size', '?')} bytes)")

    elif args.pull:
        pull_model(args.pull)

    elif args.benchmark:
        results = benchmark_model(args.model)
        print(json.dumps(results, indent=2))

    elif args.recommend:
        print(f"Recommended {args.recommend} models:")
        for name, desc in RECOMMENDED_MODELS[args.recommend]:
            print(f"  ollama pull {name:<30} # {desc}")

    else:
        interactive_local(args.model)
