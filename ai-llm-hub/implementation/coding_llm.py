"""
Coding-specialized LLM assistant.
Features: code generation, review, debugging, test generation, refactoring, explanation.
"""

import os
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

import litellm
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent.parent / "config" / ".env")


DEFAULT_MODEL = os.getenv("DEFAULT_CODING_MODEL", "claude-sonnet-4-6")


def _call(messages: list[dict], model: str, max_tokens: int = 8192) -> str:
    kwargs = {"model": model, "messages": messages, "max_tokens": max_tokens}
    if model.startswith("ollama/"):
        kwargs["api_base"] = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    response = litellm.completion(**kwargs)
    return response.choices[0].message.content


def generate_code(
    description: str,
    language: str = "python",
    model: str = DEFAULT_MODEL,
    context: str = "",
) -> str:
    """Generate code from a natural language description."""
    prompt = f"""Write {language} code for the following:

{description}

{"Context / existing code:\n```\n" + context + "\n```\n" if context else ""}
Requirements:
- Write complete, runnable code
- Include type hints (if applicable)
- Handle edge cases and errors
- Add brief inline comments only for non-obvious logic
- Follow {language} best practices and conventions

Return ONLY the code block."""

    messages = [
        {"role": "system", "content": "You are an expert software engineer. Write clean, production-quality code."},
        {"role": "user", "content": prompt},
    ]
    return _call(messages, model)


def review_code(
    code: str,
    language: str = "python",
    model: str = DEFAULT_MODEL,
    focus: list[str] | None = None,
) -> str:
    """Review code for bugs, security issues, and improvements."""
    focus_areas = focus or ["bugs", "security", "performance", "readability", "best practices"]
    focus_str = ", ".join(focus_areas)

    prompt = f"""Review this {language} code. Focus on: {focus_str}

```{language}
{code}
```

Format your review as:
## Critical Issues (bugs/security)
- ...

## Performance Issues
- ...

## Code Quality
- ...

## Suggested Improvements
```{language}
# improved version
```"""

    messages = [
        {"role": "system", "content": "You are a senior code reviewer. Be specific, cite line numbers, explain WHY each issue matters."},
        {"role": "user", "content": prompt},
    ]
    return _call(messages, model)


def debug_code(
    code: str,
    error_message: str = "",
    language: str = "python",
    model: str = DEFAULT_MODEL,
) -> str:
    """Debug broken code, explain the issue, and return a fix."""
    prompt = f"""Debug this {language} code:

```{language}
{code}
```

{"Error message:\n```\n" + error_message + "\n```\n" if error_message else ""}
Provide:
1. **Root cause** — exactly what's wrong and why
2. **Fixed code** — complete corrected version
3. **Prevention** — how to avoid this class of bug"""

    messages = [
        {"role": "system", "content": "You are an expert debugger. Find the root cause, not just symptoms."},
        {"role": "user", "content": prompt},
    ]
    return _call(messages, model)


def generate_tests(
    code: str,
    language: str = "python",
    framework: str = "pytest",
    model: str = DEFAULT_MODEL,
) -> str:
    """Generate unit tests for the given code."""
    prompt = f"""Write comprehensive {framework} tests for this {language} code:

```{language}
{code}
```

Include tests for:
- Happy path (normal inputs)
- Edge cases (empty, None, zero, boundary values)
- Error cases (invalid inputs, exceptions)
- Type variations where applicable

Use descriptive test names that explain what's being tested."""

    messages = [
        {"role": "system", "content": "You are a QA engineer who writes thorough, maintainable tests."},
        {"role": "user", "content": prompt},
    ]
    return _call(messages, model)


def refactor_code(
    code: str,
    language: str = "python",
    goal: str = "improve readability and performance",
    model: str = DEFAULT_MODEL,
) -> str:
    """Refactor code to improve quality."""
    prompt = f"""Refactor this {language} code to {goal}:

```{language}
{code}
```

Preserve all existing behavior. Show:
1. **Refactored code**
2. **What changed and why** (brief bullet points)"""

    messages = [
        {"role": "system", "content": "You are a software architect who writes clean, maintainable code."},
        {"role": "user", "content": prompt},
    ]
    return _call(messages, model)


def explain_code(
    code: str,
    language: str = "python",
    depth: str = "detailed",
    model: str = DEFAULT_MODEL,
) -> str:
    """Explain what code does in plain English."""
    prompt = f"""Explain this {language} code ({depth}):

```{language}
{code}
```

Cover:
- What it does (high level)
- How it works (step by step)
- Key algorithms or patterns used
- Time and space complexity (if relevant)"""

    messages = [
        {"role": "system", "content": "You are a technical writer who explains code clearly to developers."},
        {"role": "user", "content": prompt},
    ]
    return _call(messages, model)


def generate_docs(
    code: str,
    language: str = "python",
    style: str = "google",
    model: str = DEFAULT_MODEL,
) -> str:
    """Generate docstrings and documentation for code."""
    prompt = f"""Add {style}-style docstrings/documentation to this {language} code:

```{language}
{code}
```

Include:
- Module/class/function docstrings
- Parameter descriptions with types
- Return value description
- Raises section (if exceptions possible)
- Usage examples for public APIs"""

    messages = [
        {"role": "system", "content": "You write clear, accurate technical documentation."},
        {"role": "user", "content": prompt},
    ]
    return _call(messages, model)


def execute_python(code: str, timeout: int = 30) -> tuple[str, str, int]:
    """Execute Python code in a subprocess and return (stdout, stderr, returncode)."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
        f.write(code)
        f.flush()
        try:
            result = subprocess.run(
                ["python3", f.name],
                capture_output=True,
                text=True,
                timeout=timeout,
            )
            return result.stdout, result.stderr, result.returncode
        except subprocess.TimeoutExpired:
            return "", "Execution timed out", 1
        finally:
            os.unlink(f.name)


def extract_code_blocks(text: str, language: str = "") -> list[str]:
    """Extract code blocks from markdown-style text."""
    pattern = rf"```{language}?\n?(.*?)```" if language else r"```(?:\w+)?\n?(.*?)```"
    return re.findall(pattern, text, re.DOTALL)


def interactive_coding_session(model: str = DEFAULT_MODEL):
    """Run an interactive coding assistant session."""
    print(f"=== Coding LLM ({model}) ===")
    print("Commands: generate, review, debug, test, refactor, explain, docs, run, exit")
    print("Or just type a coding question.\n")

    history: list[dict] = []

    while True:
        try:
            cmd = input(">>> ").strip()
        except (EOFError, KeyboardInterrupt):
            break

        if not cmd or cmd in ("exit", "quit"):
            break

        if cmd == "run":
            code = input("Paste Python code (end with '---'):\n")
            lines = []
            while True:
                line = input()
                if line == "---":
                    break
                lines.append(line)
            code = "\n".join(lines)
            stdout, stderr, rc = execute_python(code)
            print(f"Exit code: {rc}")
            if stdout:
                print(f"Output:\n{stdout}")
            if stderr:
                print(f"Errors:\n{stderr}")
            continue

        # Pass to unified coding model
        history.append({"role": "user", "content": cmd})
        messages = [
            {"role": "system", "content": "You are an expert software engineer. Answer coding questions, write code, debug issues, and review code."},
            *history,
        ]
        kwargs = {"model": model, "messages": messages, "max_tokens": 8192, "stream": True}
        if model.startswith("ollama/"):
            kwargs["api_base"] = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

        print("\nAssistant: ", end="")
        full = []
        for chunk in litellm.completion(**kwargs):
            delta = chunk.choices[0].delta.content or ""
            print(delta, end="", flush=True)
            full.append(delta)
        print("\n")
        history.append({"role": "assistant", "content": "".join(full)})


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--model", "-m", default=DEFAULT_MODEL)
    parser.add_argument("--task", choices=["generate", "review", "debug", "test", "refactor", "explain", "interactive"], default="interactive")
    args = parser.parse_args()

    if args.task == "interactive":
        interactive_coding_session(args.model)
    else:
        code = input("Paste code (end with '---'):\n")
        lines = []
        while True:
            line = input()
            if line == "---":
                break
            lines.append(line)
        code = "\n".join(lines)

        if args.task == "review":
            print(review_code(code, model=args.model))
        elif args.task == "debug":
            err = input("Error message (optional): ")
            print(debug_code(code, err, model=args.model))
        elif args.task == "test":
            print(generate_tests(code, model=args.model))
        elif args.task == "refactor":
            print(refactor_code(code, model=args.model))
        elif args.task == "explain":
            print(explain_code(code, model=args.model))
        elif args.task == "docs":
            print(generate_docs(code, model=args.model))
