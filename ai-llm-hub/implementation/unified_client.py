"""
Unified LLM client — wraps cloud APIs and local Ollama under one interface.
Supports: Anthropic, OpenAI, Mistral, Google, DeepSeek, and any Ollama model.
"""

import os
import argparse
from typing import Iterator
from enum import Enum

import litellm
from litellm import completion, acompletion
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "../config/.env"))


class Mode(str, Enum):
    CODING = "coding"
    CHAT = "chat"
    REVIEW = "review"
    DEBUG = "debug"


SYSTEM_PROMPTS = {
    Mode.CODING: (
        "You are an expert software engineer with deep knowledge across all programming languages. "
        "Write clean, efficient, well-documented code. Always include type hints in Python, "
        "handle edge cases, and follow best practices for the language. "
        "When writing code, explain key design decisions briefly."
    ),
    Mode.CHAT: (
        "You are a helpful, knowledgeable AI assistant. Be concise and clear. "
        "Ask clarifying questions when needed. Adapt your tone to the user's style."
    ),
    Mode.REVIEW: (
        "You are a senior code reviewer. Analyze code for: bugs, security vulnerabilities, "
        "performance issues, code smells, and style violations. "
        "Be specific — cite line numbers and explain WHY each issue matters. "
        "Suggest concrete fixes, not vague advice."
    ),
    Mode.DEBUG: (
        "You are an expert debugger. When given broken code or error messages: "
        "1) Identify the root cause precisely. "
        "2) Explain why the bug occurs. "
        "3) Provide the corrected code. "
        "4) Suggest how to prevent similar bugs."
    ),
}

MODEL_ALIASES = {
    # Anthropic
    "claude": "claude-sonnet-4-6",
    "claude-sonnet": "claude-sonnet-4-6",
    "claude-opus": "claude-opus-4-8",
    "claude-haiku": "claude-haiku-4-5-20251001",
    # OpenAI
    "gpt4": "gpt-4o",
    "gpt4o": "gpt-4o",
    "gpt4-mini": "gpt-4o-mini",
    "o3": "o3",
    "o3-mini": "o3-mini",
    # Mistral
    "mistral": "mistral/mistral-large-latest",
    "codestral": "mistral/codestral-latest",
    "mixtral": "together_ai/mistralai/Mixtral-8x22B-Instruct-v0.1",
    # Google
    "gemini": "gemini/gemini-2.0-flash",
    "gemini-pro": "gemini/gemini-1.5-pro",
    # DeepSeek
    "deepseek": "deepseek/deepseek-chat",
    "deepseek-r1": "deepseek/deepseek-reasoner",
    # Ollama (local)
    "llama3": "ollama/llama3.2",
    "llama3-70b": "ollama/llama3.1:70b",
    "deepseek-coder": "ollama/deepseek-coder-v2",
    "codellama": "ollama/codellama:34b",
    "phi4": "ollama/phi4",
    "qwen-coder": "ollama/qwen2.5-coder:32b",
    "starcoder": "ollama/starcoder2:15b",
    "mistral-local": "ollama/mistral",
}


def resolve_model(model_name: str) -> str:
    return MODEL_ALIASES.get(model_name.lower(), model_name)


def chat(
    message: str,
    model: str = "claude-sonnet-4-6",
    mode: Mode = Mode.CHAT,
    history: list[dict] | None = None,
    temperature: float = 0.7,
    max_tokens: int = 8192,
    stream: bool = True,
) -> str:
    model = resolve_model(model)
    system = SYSTEM_PROMPTS[mode]
    messages = [{"role": "system", "content": system}]

    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": message})

    kwargs = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": stream,
    }

    # o3 models use reasoning_effort instead of temperature
    if "o3" in model:
        kwargs.pop("temperature")
        kwargs["reasoning_effort"] = "high"

    # Ollama needs base_url
    if model.startswith("ollama/"):
        kwargs["api_base"] = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

    if stream:
        return _stream_response(kwargs)
    else:
        response = completion(**kwargs)
        return response.choices[0].message.content


def _stream_response(kwargs: dict) -> str:
    full_response = []
    for chunk in completion(**kwargs):
        delta = chunk.choices[0].delta.content or ""
        print(delta, end="", flush=True)
        full_response.append(delta)
    print()
    return "".join(full_response)


def main():
    parser = argparse.ArgumentParser(description="Unified LLM Client")
    parser.add_argument("--model", "-m", default="claude-sonnet-4-6", help="Model name or alias")
    parser.add_argument("--mode", default="chat", choices=[m.value for m in Mode])
    parser.add_argument("--temp", type=float, default=0.7)
    parser.add_argument("--max-tokens", type=int, default=8192)
    args = parser.parse_args()

    mode = Mode(args.mode)
    model = resolve_model(args.model)
    history: list[dict] = []

    print(f"=== Unified LLM Client ===")
    print(f"Model: {model}  |  Mode: {mode.value}")
    print("Type 'exit' to quit, '/mode <name>' to switch mode, '/model <name>' to switch model\n")

    current_model = model
    current_mode = mode

    while True:
        try:
            user_input = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nGoodbye!")
            break

        if not user_input:
            continue
        if user_input.lower() in ("exit", "quit", "q"):
            break
        if user_input.startswith("/mode "):
            current_mode = Mode(user_input.split()[1])
            print(f"Mode switched to: {current_mode.value}")
            continue
        if user_input.startswith("/model "):
            current_model = resolve_model(user_input.split()[1])
            print(f"Model switched to: {current_model}")
            continue
        if user_input == "/clear":
            history.clear()
            print("History cleared.")
            continue

        print(f"\nAssistant: ", end="")
        response = chat(
            user_input,
            model=current_model,
            mode=current_mode,
            history=history,
            temperature=args.temp,
            max_tokens=args.max_tokens,
            stream=True,
        )
        history.append({"role": "user", "content": user_input})
        history.append({"role": "assistant", "content": response})
        print()


if __name__ == "__main__":
    main()
