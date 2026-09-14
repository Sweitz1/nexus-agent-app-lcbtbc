"""
Venice API — OpenAI-compatible server wrapping Ollama.
Handles auth, model listing, chat completions, and streaming.
"""

import os
import json
import time
import uuid
import httpx
import asyncio
from typing import AsyncIterator, Optional

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import APIKeyHeader
from pydantic import BaseModel

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434")
API_KEY    = os.getenv("API_KEY", "changeme")
ALLOW_ORIGINS = os.getenv("ALLOW_ORIGINS", "*").split(",")
MAX_TOKENS = int(os.getenv("MAX_TOKENS", "8192"))

app = FastAPI(title="Venice Private LLM API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOW_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_key_header = APIKeyHeader(name="Authorization", auto_error=False)


def verify_key(auth: str = Depends(api_key_header)):
    if not auth or auth.replace("Bearer ", "") != API_KEY:
        raise HTTPException(401, "Invalid API key")
    return auth


# ── Pydantic models ───────────────────────────────────────────────

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    model: str
    messages: list[Message]
    max_tokens: Optional[int] = None
    temperature: Optional[float] = 0.8
    top_p: Optional[float] = 0.9
    stream: Optional[bool] = False
    system: Optional[str] = None

class GenerateRequest(BaseModel):
    model: str
    prompt: str
    max_tokens: Optional[int] = 512
    temperature: Optional[float] = 0.8
    stream: Optional[bool] = False

class PullRequest(BaseModel):
    model: str


# ── Helpers ───────────────────────────────────────────────────────

async def ollama_post(path: str, body: dict) -> dict:
    async with httpx.AsyncClient(timeout=300) as client:
        r = await client.post(f"{OLLAMA_URL}{path}", json=body)
        r.raise_for_status()
        return r.json()

async def ollama_stream(path: str, body: dict) -> AsyncIterator[bytes]:
    async with httpx.AsyncClient(timeout=300) as client:
        async with client.stream("POST", f"{OLLAMA_URL}{path}", json=body) as r:
            async for chunk in r.aiter_bytes():
                yield chunk

def openai_chunk(delta: str, model: str, finish: bool = False) -> str:
    obj = {
        "id": f"chatcmpl-{uuid.uuid4().hex[:8]}",
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": model,
        "choices": [{
            "index": 0,
            "delta": {"content": delta} if not finish else {},
            "finish_reason": "stop" if finish else None,
        }],
    }
    return f"data: {json.dumps(obj)}\n\n"


# ── Routes ────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.get(f"{OLLAMA_URL}/api/tags")
            ollama_ok = r.status_code == 200
    except Exception:
        ollama_ok = False
    return {"status": "ok", "ollama": ollama_ok}


@app.get("/v1/models", dependencies=[Depends(verify_key)])
async def list_models():
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(f"{OLLAMA_URL}/api/tags")
        r.raise_for_status()
        tags = r.json().get("models", [])
    return {
        "object": "list",
        "data": [
            {
                "id": m["name"],
                "object": "model",
                "created": int(time.time()),
                "owned_by": "venice",
                "details": m.get("details", {}),
            }
            for m in tags
        ],
    }


@app.post("/v1/chat/completions", dependencies=[Depends(verify_key)])
async def chat_completions(req: ChatRequest):
    messages = [{"role": m.role, "content": m.content} for m in req.messages]
    if req.system:
        messages.insert(0, {"role": "system", "content": req.system})

    body = {
        "model": req.model,
        "messages": messages,
        "stream": req.stream,
        "options": {
            "temperature": req.temperature,
            "top_p": req.top_p,
            "num_predict": req.max_tokens or MAX_TOKENS,
        },
    }

    if req.stream:
        async def event_stream():
            async for raw in ollama_stream("/api/chat", body):
                for line in raw.decode().splitlines():
                    if not line.strip():
                        continue
                    try:
                        obj = json.loads(line)
                        delta = obj.get("message", {}).get("content", "")
                        done  = obj.get("done", False)
                        yield openai_chunk(delta, req.model, finish=done)
                        if done:
                            yield "data: [DONE]\n\n"
                    except json.JSONDecodeError:
                        pass

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    data = await ollama_post("/api/chat", body)
    content = data.get("message", {}).get("content", "")
    return {
        "id": f"chatcmpl-{uuid.uuid4().hex[:8]}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": req.model,
        "choices": [{"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": "stop"}],
        "usage": {
            "prompt_tokens":     data.get("prompt_eval_count", -1),
            "completion_tokens": data.get("eval_count", -1),
            "total_tokens":      (data.get("prompt_eval_count", 0) + data.get("eval_count", 0)),
        },
    }


@app.post("/v1/completions", dependencies=[Depends(verify_key)])
async def completions(req: GenerateRequest):
    body = {
        "model": req.model,
        "prompt": req.prompt,
        "stream": False,
        "options": {"temperature": req.temperature, "num_predict": req.max_tokens or 512},
    }
    data = await ollama_post("/api/generate", body)
    return {
        "id": f"cmpl-{uuid.uuid4().hex[:8]}",
        "object": "text_completion",
        "created": int(time.time()),
        "model": req.model,
        "choices": [{"text": data.get("response", ""), "index": 0, "finish_reason": "stop"}],
    }


@app.post("/api/pull", dependencies=[Depends(verify_key)])
async def pull_model(req: PullRequest):
    """Pull a model from Ollama registry (async, streams progress)."""
    async def progress_stream():
        async for raw in ollama_stream("/api/pull", {"name": req.model, "stream": True}):
            yield raw

    return StreamingResponse(progress_stream(), media_type="application/x-ndjson")


@app.delete("/api/model/{model_name}", dependencies=[Depends(verify_key)])
async def delete_model(model_name: str):
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.request("DELETE", f"{OLLAMA_URL}/api/delete", json={"name": model_name})
        r.raise_for_status()
    return {"deleted": model_name}


@app.get("/api/model/{model_name}/info", dependencies=[Depends(verify_key)])
async def model_info(model_name: str):
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(f"{OLLAMA_URL}/api/show", json={"name": model_name})
        r.raise_for_status()
        return r.json()
