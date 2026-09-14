"""
Chat LLM — multi-turn conversational assistant.
Supports persona switching, memory, context injection, and multi-model routing.
"""

import os
import json
import datetime
from pathlib import Path
from typing import Optional

import litellm
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent.parent / "config" / ".env")

DEFAULT_MODEL = os.getenv("DEFAULT_CHAT_MODEL", "claude-sonnet-4-6")
HISTORY_DIR = Path.home() / ".ai_llm_hub" / "history"
HISTORY_DIR.mkdir(parents=True, exist_ok=True)


PERSONAS = {
    "assistant": "You are a helpful, knowledgeable AI assistant. Be concise, accurate, and friendly.",
    "engineer": "You are a senior software engineer. Give technical, precise answers. Prefer code examples over prose.",
    "teacher": "You are a patient teacher. Explain concepts from first principles, use analogies, and check for understanding.",
    "socratic": "You are a Socratic tutor. Guide the user to answers through questions rather than stating them directly.",
    "analyst": "You are a critical analyst. Examine ideas from multiple angles, identify assumptions, and highlight trade-offs.",
    "writer": "You are a professional writer and editor. Help craft clear, compelling text. Suggest improvements to structure and style.",
    "researcher": "You are a research assistant. Provide thorough, well-cited information. Acknowledge uncertainty when it exists.",
}


class ChatSession:
    def __init__(
        self,
        model: str = DEFAULT_MODEL,
        persona: str = "assistant",
        session_name: str | None = None,
        max_history: int = 50,
    ):
        self.model = model
        self.persona = persona
        self.system_prompt = PERSONAS.get(persona, persona)
        self.history: list[dict] = []
        self.max_history = max_history
        self.session_name = session_name or datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        self.created_at = datetime.datetime.now().isoformat()

    def set_persona(self, persona: str):
        self.persona = persona
        self.system_prompt = PERSONAS.get(persona, persona)

    def set_system(self, prompt: str):
        self.system_prompt = prompt

    def add_context(self, context: str, label: str = "Context"):
        """Inject context (e.g. file contents, docs) into the system prompt."""
        self.system_prompt += f"\n\n{label}:\n{context}"

    def send(
        self,
        message: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        stream: bool = True,
    ) -> str:
        self.history.append({"role": "user", "content": message})

        # Trim history to avoid exceeding context window
        if len(self.history) > self.max_history * 2:
            self.history = self.history[-(self.max_history * 2):]

        messages = [{"role": "system", "content": self.system_prompt}] + self.history

        kwargs = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": stream,
        }

        if "o3" in self.model:
            kwargs.pop("temperature")
            kwargs["reasoning_effort"] = "medium"

        if self.model.startswith("ollama/"):
            kwargs["api_base"] = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

        if stream:
            response_text = self._stream(kwargs)
        else:
            resp = litellm.completion(**kwargs)
            response_text = resp.choices[0].message.content

        self.history.append({"role": "assistant", "content": response_text})
        return response_text

    def _stream(self, kwargs: dict) -> str:
        chunks = []
        for chunk in litellm.completion(**kwargs):
            delta = chunk.choices[0].delta.content or ""
            print(delta, end="", flush=True)
            chunks.append(delta)
        print()
        return "".join(chunks)

    def save(self):
        path = HISTORY_DIR / f"{self.session_name}.json"
        data = {
            "session_name": self.session_name,
            "model": self.model,
            "persona": self.persona,
            "created_at": self.created_at,
            "history": self.history,
        }
        path.write_text(json.dumps(data, indent=2))
        return path

    @classmethod
    def load(cls, session_name: str) -> "ChatSession":
        path = HISTORY_DIR / f"{session_name}.json"
        data = json.loads(path.read_text())
        session = cls(model=data["model"], persona=data["persona"], session_name=data["session_name"])
        session.history = data["history"]
        session.created_at = data["created_at"]
        return session

    @classmethod
    def list_sessions(cls) -> list[str]:
        return sorted([p.stem for p in HISTORY_DIR.glob("*.json")], reverse=True)

    def clear(self):
        self.history.clear()

    def summary(self) -> str:
        """Ask the model to summarize the conversation so far."""
        if not self.history:
            return "No conversation yet."
        messages = [
            {"role": "system", "content": "Summarize the following conversation in 3-5 bullet points."},
            {"role": "user", "content": json.dumps(self.history)},
        ]
        resp = litellm.completion(model=self.model, messages=messages, max_tokens=512)
        return resp.choices[0].message.content


def run_interactive(model: str = DEFAULT_MODEL, persona: str = "assistant"):
    session = ChatSession(model=model, persona=persona)

    print(f"=== Chat LLM ===")
    print(f"Model: {model}  |  Persona: {persona}")
    print("Commands: /persona <name>, /model <name>, /clear, /save, /load <name>, /sessions, /summary, /exit\n")

    while True:
        try:
            user_input = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nSaving session...")
            session.save()
            break

        if not user_input:
            continue

        if user_input == "/exit":
            session.save()
            break
        elif user_input.startswith("/persona "):
            name = user_input.split(None, 1)[1]
            session.set_persona(name)
            print(f"Persona: {name}")
        elif user_input.startswith("/model "):
            session.model = user_input.split(None, 1)[1]
            print(f"Model: {session.model}")
        elif user_input == "/clear":
            session.clear()
            print("History cleared.")
        elif user_input == "/save":
            path = session.save()
            print(f"Saved: {path}")
        elif user_input.startswith("/load "):
            name = user_input.split(None, 1)[1]
            session = ChatSession.load(name)
            print(f"Loaded: {name} ({len(session.history)} messages)")
        elif user_input == "/sessions":
            sessions = ChatSession.list_sessions()
            print("Saved sessions:\n" + "\n".join(f"  {s}" for s in sessions) if sessions else "No saved sessions.")
        elif user_input == "/summary":
            print(session.summary())
        elif user_input.startswith("/system "):
            session.set_system(user_input.split(None, 1)[1])
            print("System prompt updated.")
        else:
            print("\nAssistant: ", end="")
            session.send(user_input)
            print()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--model", "-m", default=DEFAULT_MODEL)
    parser.add_argument("--persona", "-p", default="assistant", choices=list(PERSONAS.keys()))
    args = parser.parse_args()

    run_interactive(args.model, args.persona)
