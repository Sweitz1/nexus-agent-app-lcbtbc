# AI LLM Hub

A unified reference and implementation framework merging all major AI/LLM models into a single coding + chat system. Use any model — local or cloud — through one interface.

## What's Inside

| Directory | Contents |
|-----------|----------|
| [models/](./models/) | Full specs, capabilities, and links for every major LLM family |
| [capabilities/](./capabilities/) | Skills matrix, benchmarks, context windows, tool use |
| [implementation/](./implementation/) | Ready-to-run Python code for chat + coding LLM |
| [config/](./config/) | Model configs, system prompts |

## Quick Start

```bash
pip install -r requirements.txt

# Run the unified chat + coding assistant
python implementation/chat_llm.py

# Use a specific model
python implementation/unified_client.py --model claude-sonnet-4-6 --mode coding
python implementation/unified_client.py --model llama3 --mode chat
python implementation/unified_client.py --model gpt-4o --mode coding
```

## Supported Models

### Cloud APIs
| Model | Provider | Best For |
|-------|----------|----------|
| `claude-sonnet-4-6` | Anthropic | Coding, reasoning, long context |
| `claude-opus-4-8` | Anthropic | Complex tasks, analysis |
| `claude-haiku-4-5` | Anthropic | Fast, cheap, chat |
| `gpt-4o` | OpenAI | General, vision, tool use |
| `gpt-4o-mini` | OpenAI | Fast, cheap |
| `o3-mini` | OpenAI | Deep reasoning |
| `gemini-1.5-pro` | Google | Long context, multimodal |
| `gemini-2.0-flash` | Google | Speed |
| `mistral-large-latest` | Mistral | Coding, multilingual |
| `codestral-latest` | Mistral | Code-first |

### Local (via Ollama)
| Model | Size | Best For |
|-------|------|----------|
| `llama3.2` | 3B/11B | Fast chat |
| `llama3.1:70b` | 70B | Quality |
| `deepseek-coder-v2` | 16B | Coding |
| `codellama:34b` | 34B | Code generation |
| `mistral:7b` | 7B | General |
| `phi4` | 14B | Efficient reasoning |
| `qwen2.5-coder` | 7B-72B | Code |
| `starcoder2:15b` | 15B | Code completion |

## Architecture

```
User Input
    │
    ▼
UnifiedClient (implementation/unified_client.py)
    │
    ├── Cloud Route ──► LiteLLM ──► OpenAI / Anthropic / Mistral / Google
    │
    └── Local Route ──► Ollama ──► LLaMA / DeepSeek / Phi / Qwen
            │
            ▼
    Response + Tool Calls
            │
            ▼
    CodeExecutor / RAGPipeline / ChatHistory
```

## Environment Setup

```bash
cp config/.env.example config/.env
# Edit config/.env and add your API keys
```

```env
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
MISTRAL_API_KEY=your_key_here
GOOGLE_API_KEY=your_key_here
OLLAMA_BASE_URL=http://localhost:11434
```
