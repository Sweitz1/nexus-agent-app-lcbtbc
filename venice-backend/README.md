# Venice Private LLM — Backend

Self-hosted, uncensored AI server. Run any open-source model on your own VPS.
No data leaves your server. No content filters. Full control.

## Architecture

```
Android App / Web Browser
         │
         ▼ HTTPS
    Nginx (port 443)
         │
    ┌────┴────┐
    │  Web UI │  FastAPI API
    │ (chat)  │  /v1/chat/completions
    └─────────┘       │
                      ▼
                   Ollama
                      │
             Uncensored LLM Models
             (dolphin-mistral, hermes3, …)
```

## Quick Deploy (any Linux VPS)

```bash
# 1. Install Docker
curl -fsSL https://get.docker.com | sh

# 2. Clone and run setup
git clone https://github.com/sweitz1/nexus-agent-app-lcbtbc.git
cd nexus-agent-app-lcbtbc/venice-backend
bash scripts/setup.sh
```

Setup will:
- Generate a random API key
- Create SSL certs (Let's Encrypt or self-signed)
- Start all services via Docker Compose
- Pull your first uncensored model

## GPU (faster inference)

```bash
# Install NVIDIA container toolkit
sudo apt install nvidia-container-toolkit
sudo systemctl restart docker

# Start with GPU
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d
```

## Pull More Models

```bash
bash scripts/pull_models.sh
```

### Recommended Uncensored Models

| Model | Size | Best For |
|-------|------|---------|
| `dolphin-mistral:7b` | 4GB | Fast chat, general use |
| `dolphin-llama3:8b` | 5GB | Best small uncensored LLaMA 3 |
| `hermes3:8b` | 5GB | NousResearch, high quality |
| `dolphin-mixtral:8x7b` | 26GB | High quality, needs 32GB RAM |
| `nous-hermes2-mixtral` | 26GB | Best open uncensored model |
| `dolphin-llama3:70b` | 40GB | Frontier quality, needs 48GB |

## API

OpenAI-compatible — use any OpenAI client with `base_url` pointing here.

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://your-server.com/v1",
    api_key="your-api-key"
)

response = client.chat.completions.create(
    model="dolphin-mistral:7b",
    messages=[{"role": "user", "content": "Hello!"}],
    stream=True
)
for chunk in response:
    print(chunk.choices[0].delta.content or "", end="")
```

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/models` | GET | List installed models |
| `/v1/chat/completions` | POST | Chat (streaming + non-streaming) |
| `/v1/completions` | POST | Raw text completion |
| `/api/pull` | POST | Pull a new model |
| `/api/model/{name}` | DELETE | Remove a model |
| `/health` | GET | Health check (no auth required) |

## Android App

In the Nexus Android app, tap the **Venice** tab and configure:
- **Server URL:** `https://your-server.com`
- **API Key:** from your `.env` file

## Environment Variables (`.env`)

```env
VENICE_API_KEY=your-random-key
DOMAIN=your-domain.com
ALLOW_ORIGINS=*
MAX_TOKENS=8192
```
