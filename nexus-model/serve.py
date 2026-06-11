"""
Serve NexusLLM as an OpenAI-compatible REST API.
Drop-in replacement for any OpenAI client — just change the base_url.

Usage:
    python serve.py --model ./nexus-llm-merged --port 8000

Then use with any OpenAI client:
    from openai import OpenAI
    client = OpenAI(base_url="http://localhost:8000/v1", api_key="nexus")
    response = client.chat.completions.create(model="nexus-llm", messages=[...])
"""

import os
import json
import time
import uuid
import argparse
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

from model import NexusLLM

app = FastAPI(title="NexusLLM API", version="1.0.0")
_nexus: NexusLLM | None = None


# ── Request / Response models (OpenAI-compatible) ─────────────────

class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    model: str = "nexus-llm"
    messages: list[Message]
    max_tokens: Optional[int] = 2048
    temperature: Optional[float] = 0.7
    top_p: Optional[float] = 0.9
    stream: Optional[bool] = False


class CompletionRequest(BaseModel):
    model: str = "nexus-llm"
    prompt: str
    max_tokens: Optional[int] = 512
    temperature: Optional[float] = 0.2
    stream: Optional[bool] = False


def _model() -> NexusLLM:
    global _nexus
    if _nexus is None:
        raise HTTPException(503, "Model not loaded yet")
    return _nexus


def _make_chat_response(content: str, model: str = "nexus-llm") -> dict:
    return {
        "id": f"chatcmpl-{uuid.uuid4().hex[:8]}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model,
        "choices": [{
            "index": 0,
            "message": {"role": "assistant", "content": content},
            "finish_reason": "stop",
        }],
        "usage": {
            "prompt_tokens": -1,
            "completion_tokens": -1,
            "total_tokens": -1,
        },
    }


def _stream_sse(text: str, model: str = "nexus-llm"):
    """Yield OpenAI-compatible SSE chunks."""
    chunk_id = f"chatcmpl-{uuid.uuid4().hex[:8]}"
    words = text.split(" ")
    for i, word in enumerate(words):
        delta = word + (" " if i < len(words) - 1 else "")
        chunk = {
            "id": chunk_id,
            "object": "chat.completion.chunk",
            "created": int(time.time()),
            "model": model,
            "choices": [{
                "index": 0,
                "delta": {"content": delta},
                "finish_reason": None,
            }],
        }
        yield f"data: {json.dumps(chunk)}\n\n"
    yield "data: [DONE]\n\n"


# ── Endpoints ─────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"name": "NexusLLM API", "status": "running", "version": "1.0.0"}


@app.get("/v1/models")
def list_models():
    return {
        "object": "list",
        "data": [{
            "id": "nexus-llm",
            "object": "model",
            "created": int(time.time()),
            "owned_by": "nexus",
        }],
    }


@app.post("/v1/chat/completions")
def chat_completions(req: ChatRequest):
    nexus = _model()
    history = [{"role": m.role, "content": m.content} for m in req.messages[:-1]]
    last = req.messages[-1].content

    response_text = nexus.generate(
        last,
        mode="chat",
        history=history,
        max_new_tokens=req.max_tokens or 2048,
        temperature=req.temperature or 0.7,
        top_p=req.top_p or 0.9,
        stream=False,
    )

    if req.stream:
        return StreamingResponse(
            _stream_sse(response_text),
            media_type="text/event-stream",
        )

    return _make_chat_response(response_text, req.model)


@app.post("/v1/completions")
def completions(req: CompletionRequest):
    nexus = _model()
    result = nexus.generate(
        req.prompt,
        mode="coding",
        max_new_tokens=req.max_tokens or 512,
        temperature=req.temperature or 0.2,
        stream=False,
    )
    return {
        "id": f"cmpl-{uuid.uuid4().hex[:8]}",
        "object": "text_completion",
        "created": int(time.time()),
        "model": req.model,
        "choices": [{"text": result, "index": 0, "finish_reason": "stop"}],
    }


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": _nexus is not None}


# ── Startup ───────────────────────────────────────────────────────

def run_server(model_path: str, host: str, port: int, bit4: bool, bit8: bool):
    import uvicorn

    global _nexus
    print(f"Loading NexusLLM from {model_path}...")
    _nexus = NexusLLM(model_path=model_path, load_in_4bit=bit4, load_in_8bit=bit8)
    _nexus._load()

    print(f"\n=== NexusLLM API Server ===")
    print(f"URL:  http://{host}:{port}")
    print(f"Docs: http://{host}:{port}/docs")
    print(f"Use with OpenAI client:")
    print(f"  client = OpenAI(base_url='http://{host}:{port}/v1', api_key='nexus')")
    print()

    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Serve NexusLLM as OpenAI-compatible API")
    parser.add_argument("--model", default=os.getenv("NEXUS_MODEL_PATH", "./nexus-llm-merged"))
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--4bit", dest="bit4", action="store_true")
    parser.add_argument("--8bit", dest="bit8", action="store_true")
    args = parser.parse_args()

    run_server(args.model, args.host, args.port, args.bit4, args.bit8)
