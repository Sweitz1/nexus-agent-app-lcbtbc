"""
NexusLLM — the single merged model class.
Load the merged weights and run coding + chat inference.
"""

import os
import sys
import argparse
from pathlib import Path
from typing import Generator

from dotenv import load_dotenv

load_dotenv()

DEFAULT_MODEL_PATH = os.getenv("NEXUS_MODEL_PATH", "./nexus-llm-merged")


class NexusLLM:
    """
    The single NexusLLM model — merged coding + chat + reasoning.
    Loads from local merged weights or falls back to HuggingFace Hub.
    """

    SYSTEM_PROMPTS = {
        "coding": (
            "You are NexusLLM, an expert software engineer. "
            "Write clean, efficient, production-quality code with type hints. "
            "Handle edge cases, follow best practices, and explain key decisions briefly."
        ),
        "chat": (
            "You are NexusLLM, a helpful and knowledgeable AI assistant. "
            "Be concise, accurate, and adapt your tone to the user."
        ),
        "review": (
            "You are NexusLLM, a senior code reviewer. "
            "Identify bugs, security issues, and performance problems. "
            "Be specific — cite what's wrong and why, then show the fix."
        ),
        "debug": (
            "You are NexusLLM, an expert debugger. "
            "Find the root cause, explain why it happens, show the corrected code, "
            "and suggest how to prevent this class of bug."
        ),
    }

    def __init__(
        self,
        model_path: str = DEFAULT_MODEL_PATH,
        device: str = "auto",
        load_in_4bit: bool = False,
        load_in_8bit: bool = False,
    ):
        self.model_path = model_path
        self._model = None
        self._tokenizer = None
        self._pipe = None
        self.device = device
        self.load_in_4bit = load_in_4bit
        self.load_in_8bit = load_in_8bit

    def _load(self):
        """Lazy-load the model on first use."""
        if self._pipe is not None:
            return

        import torch
        from transformers import AutoTokenizer, AutoModelForCausalLM, pipeline, BitsAndBytesConfig

        print(f"Loading NexusLLM from {self.model_path}...")

        quant_config = None
        if self.load_in_4bit:
            quant_config = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_compute_dtype=torch.bfloat16,
                bnb_4bit_use_double_quant=True,
                bnb_4bit_quant_type="nf4",
            )
        elif self.load_in_8bit:
            quant_config = BitsAndBytesConfig(load_in_8bit=True)

        self._tokenizer = AutoTokenizer.from_pretrained(
            self.model_path, trust_remote_code=True
        )
        self._model = AutoModelForCausalLM.from_pretrained(
            self.model_path,
            torch_dtype=torch.bfloat16 if not quant_config else None,
            device_map=self.device,
            quantization_config=quant_config,
            trust_remote_code=True,
        )
        self._pipe = pipeline(
            "text-generation",
            model=self._model,
            tokenizer=self._tokenizer,
        )
        print("✓ NexusLLM loaded")

    def generate(
        self,
        prompt: str,
        mode: str = "coding",
        max_new_tokens: int = 2048,
        temperature: float = 0.7,
        top_p: float = 0.9,
        stream: bool = True,
        history: list[dict] | None = None,
    ) -> str:
        """Generate a response from NexusLLM."""
        self._load()

        system = self.SYSTEM_PROMPTS.get(mode, self.SYSTEM_PROMPTS["chat"])
        messages = [{"role": "system", "content": system}]
        if history:
            messages.extend(history)
        messages.append({"role": "user", "content": prompt})

        formatted = self._tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )

        if stream:
            return self._stream_generate(formatted, max_new_tokens, temperature, top_p)
        else:
            result = self._pipe(
                formatted,
                max_new_tokens=max_new_tokens,
                temperature=temperature,
                top_p=top_p,
                do_sample=temperature > 0,
                return_full_text=False,
            )
            return result[0]["generated_text"]

    def _stream_generate(
        self,
        prompt: str,
        max_new_tokens: int,
        temperature: float,
        top_p: float,
    ) -> str:
        from transformers import TextStreamer
        import torch

        inputs = self._tokenizer(prompt, return_tensors="pt").to(self._model.device)
        streamer = TextStreamer(self._tokenizer, skip_prompt=True, skip_special_tokens=True)

        with torch.no_grad():
            output_ids = self._model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                temperature=temperature,
                top_p=top_p,
                do_sample=temperature > 0,
                streamer=streamer,
            )

        generated = output_ids[0][inputs["input_ids"].shape[-1]:]
        return self._tokenizer.decode(generated, skip_special_tokens=True)

    def code(self, description: str, language: str = "python", **kwargs) -> str:
        """Generate code from a natural language description."""
        prompt = f"Write {language} code for:\n{description}"
        return self.generate(prompt, mode="coding", **kwargs)

    def review(self, code: str, language: str = "python", **kwargs) -> str:
        """Review code for bugs, security issues, and improvements."""
        prompt = f"Review this {language} code:\n\n```{language}\n{code}\n```"
        return self.generate(prompt, mode="review", **kwargs)

    def debug(self, code: str, error: str = "", **kwargs) -> str:
        """Debug broken code."""
        error_section = f"\nError:\n{error}" if error else ""
        prompt = f"Debug this code:{error_section}\n\n```\n{code}\n```"
        return self.generate(prompt, mode="debug", **kwargs)

    def test(self, code: str, framework: str = "pytest", **kwargs) -> str:
        """Generate tests for code."""
        prompt = f"Write comprehensive {framework} tests for:\n\n```python\n{code}\n```"
        return self.generate(prompt, mode="coding", **kwargs)

    def chat(self, message: str, history: list[dict] | None = None, **kwargs) -> str:
        """Chat with NexusLLM."""
        return self.generate(message, mode="chat", history=history, **kwargs)

    def interactive(self, mode: str = "coding"):
        """Run an interactive session with NexusLLM."""
        print(f"=== NexusLLM ({mode} mode) ===")
        print("Commands: /mode <coding|chat|review|debug>, /clear, /exit\n")

        history: list[dict] = []

        while True:
            try:
                user_input = input("You: ").strip()
            except (EOFError, KeyboardInterrupt):
                print("\nGoodbye!")
                break

            if not user_input:
                continue
            if user_input in ("/exit", "exit", "quit"):
                break
            if user_input.startswith("/mode "):
                mode = user_input.split()[1]
                print(f"Mode: {mode}")
                continue
            if user_input == "/clear":
                history.clear()
                print("History cleared.")
                continue

            print("\nNexusLLM: ", end="", flush=True)
            response = self.generate(user_input, mode=mode, history=history)
            history.append({"role": "user", "content": user_input})
            history.append({"role": "assistant", "content": response})
            print()


def main():
    parser = argparse.ArgumentParser(description="Run NexusLLM")
    parser.add_argument("--model", default=DEFAULT_MODEL_PATH, help="Path to merged model")
    parser.add_argument("--mode", default="coding", choices=["coding", "chat", "review", "debug"])
    parser.add_argument("--prompt", default="", help="Single prompt (non-interactive)")
    parser.add_argument("--4bit", dest="bit4", action="store_true", help="Load in 4-bit (less VRAM)")
    parser.add_argument("--8bit", dest="bit8", action="store_true", help="Load in 8-bit")
    parser.add_argument("--max-tokens", type=int, default=2048)
    args = parser.parse_args()

    model = NexusLLM(
        model_path=args.model,
        load_in_4bit=args.bit4,
        load_in_8bit=args.bit8,
    )

    if args.prompt:
        print(model.generate(args.prompt, mode=args.mode, max_new_tokens=args.max_tokens))
    else:
        model.interactive(mode=args.mode)


if __name__ == "__main__":
    main()
