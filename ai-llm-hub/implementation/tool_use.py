"""
Tool use / function calling — lets the LLM invoke real Python functions.
Works with any model that supports tool use (Claude, GPT-4, Mistral, etc.).
"""

import os
import json
import subprocess
import inspect
from typing import Callable, Any
from pathlib import Path

import litellm
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent.parent / "config" / ".env")

DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "claude-sonnet-4-6")


def python_type_to_json_schema(annotation) -> dict:
    """Convert Python type hint to JSON schema type."""
    import typing
    if annotation is inspect.Parameter.empty or annotation is None:
        return {"type": "string"}
    if annotation == str:
        return {"type": "string"}
    if annotation == int:
        return {"type": "integer"}
    if annotation == float:
        return {"type": "number"}
    if annotation == bool:
        return {"type": "boolean"}
    if annotation == list:
        return {"type": "array"}
    if annotation == dict:
        return {"type": "object"}
    return {"type": "string"}


def function_to_tool_schema(func: Callable) -> dict:
    """Auto-generate a tool schema from a Python function's signature and docstring."""
    sig = inspect.signature(func)
    doc = inspect.getdoc(func) or ""

    description = doc.split("\n")[0] if doc else func.__name__
    properties = {}
    required = []

    for name, param in sig.parameters.items():
        schema = python_type_to_json_schema(param.annotation)
        # Parse param description from docstring (Args: name: description format)
        param_doc = ""
        for line in doc.split("\n"):
            if line.strip().startswith(f"{name}:"):
                param_doc = line.split(":", 1)[1].strip()
        schema["description"] = param_doc or name
        properties[name] = schema
        if param.default is inspect.Parameter.empty:
            required.append(name)

    return {
        "type": "function",
        "function": {
            "name": func.__name__,
            "description": description,
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": required,
            },
        },
    }


class ToolAgent:
    """An LLM agent that can call registered Python functions as tools."""

    def __init__(self, model: str = DEFAULT_MODEL, system: str | None = None):
        self.model = model
        self.system = system or "You are a helpful assistant with access to tools. Use them when appropriate."
        self.tools: dict[str, Callable] = {}
        self.tool_schemas: list[dict] = []
        self.history: list[dict] = []

    def register(self, func: Callable) -> Callable:
        """Register a function as a tool (decorator or direct call)."""
        self.tools[func.__name__] = func
        self.tool_schemas.append(function_to_tool_schema(func))
        return func

    def _execute_tool(self, name: str, arguments: dict) -> str:
        func = self.tools.get(name)
        if not func:
            return f"Error: tool '{name}' not found"
        try:
            result = func(**arguments)
            return str(result)
        except Exception as e:
            return f"Error executing {name}: {e}"

    def run(self, message: str, max_iterations: int = 10) -> str:
        self.history.append({"role": "user", "content": message})
        messages = [{"role": "system", "content": self.system}] + self.history

        for _ in range(max_iterations):
            kwargs = {
                "model": self.model,
                "messages": messages,
                "tools": self.tool_schemas,
                "tool_choice": "auto",
                "max_tokens": 4096,
            }
            if self.model.startswith("ollama/"):
                kwargs["api_base"] = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

            response = litellm.completion(**kwargs)
            msg = response.choices[0].message
            messages.append(msg.model_dump(exclude_none=True))

            if not msg.tool_calls:
                # Final text response
                final = msg.content or ""
                self.history.append({"role": "assistant", "content": final})
                return final

            # Execute tool calls
            for tc in msg.tool_calls:
                name = tc.function.name
                args = json.loads(tc.function.arguments)
                print(f"  [Tool] {name}({args})")
                result = self._execute_tool(name, args)
                print(f"  [Result] {result[:200]}...")
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result,
                })

        return "Max iterations reached."


# ── Built-in tools ───────────────────────────────────────────────

def make_default_agent(model: str = DEFAULT_MODEL) -> ToolAgent:
    """Create an agent pre-loaded with common tools."""
    agent = ToolAgent(model=model, system=(
        "You are an expert software engineer and assistant with access to tools. "
        "Use tools to get accurate information and execute tasks."
    ))

    @agent.register
    def run_python(code: str) -> str:
        """Execute Python code and return the output.
        Args:
            code: Python code to execute
        """
        with __import__("tempfile").NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
            f.write(code)
            fname = f.name
        try:
            result = subprocess.run(["python3", fname], capture_output=True, text=True, timeout=30)
            return result.stdout or result.stderr
        except subprocess.TimeoutExpired:
            return "Timeout"
        finally:
            os.unlink(fname)

    @agent.register
    def read_file(path: str) -> str:
        """Read the contents of a file.
        Args:
            path: Path to the file to read
        """
        try:
            return Path(path).read_text()
        except Exception as e:
            return f"Error: {e}"

    @agent.register
    def write_file(path: str, content: str) -> str:
        """Write content to a file.
        Args:
            path: Path to write to
            content: Content to write
        """
        try:
            Path(path).write_text(content)
            return f"Written {len(content)} bytes to {path}"
        except Exception as e:
            return f"Error: {e}"

    @agent.register
    def list_files(directory: str, pattern: str = "*") -> str:
        """List files in a directory.
        Args:
            directory: Directory path to list
            pattern: Glob pattern to filter files
        """
        try:
            files = list(Path(directory).glob(pattern))
            return "\n".join(str(f) for f in sorted(files))
        except Exception as e:
            return f"Error: {e}"

    @agent.register
    def run_shell(command: str) -> str:
        """Run a shell command and return output.
        Args:
            command: Shell command to execute
        """
        try:
            result = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=30)
            return (result.stdout + result.stderr).strip()
        except Exception as e:
            return f"Error: {e}"

    @agent.register
    def get_current_datetime() -> str:
        """Get the current date and time."""
        import datetime
        return datetime.datetime.now().isoformat()

    return agent


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--task", default="", help="Task to run (non-interactive)")
    args = parser.parse_args()

    agent = make_default_agent(args.model)

    if args.task:
        result = agent.run(args.task)
        print(f"\nResult: {result}")
    else:
        print(f"=== Tool Agent ({args.model}) ===")
        print(f"Tools: {', '.join(agent.tools.keys())}")
        print("Type 'exit' to quit.\n")

        while True:
            try:
                task = input("Task: ").strip()
            except (EOFError, KeyboardInterrupt):
                break
            if task in ("exit", "quit"):
                break
            result = agent.run(task)
            print(f"\n{result}\n")
