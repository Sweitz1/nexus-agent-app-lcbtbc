# Nexus Agent — Android APK

**Nexus Agent** is a self-contained AutoGPT-style AI agent app that runs entirely on your Android device. It connects directly to OpenAI, Anthropic (Claude), Google Gemini, **Venice AI** (private, no-log), or a **local LLM** running on your phone or LAN — no backend server required. Everything runs in your browser engine on-device, with all data stored locally.

---

## Installation

### Requirements
- Android 7.0 (API 24) or higher
- Internet connection (for AI API calls)

### Steps

1. **Download** the `nexus-agent-debug.apk` from the GitHub Actions artifacts:
   - Go to the repository → **Actions** → **Build Android APK** → latest successful run → **Artifacts** → download `nexus-agent-debug`

2. **Enable Unknown Sources** on your device:
   - Go to **Settings → Security** (or **Apps & Notifications → Special app access** on Android 8+)
   - Enable **Install unknown apps** for your file manager or browser

3. **Install the APK**:
   - Open the downloaded `.apk` file
   - Tap **Install** when prompted
   - Tap **Open** when complete

> The app is a debug build (not Play Store signed). Your device may show a warning — this is normal for sideloaded APKs.

---

## First-Time Setup

### Add Your API Keys

1. Open Nexus Agent
2. Tap **Providers** in the sidebar
3. Enter one or more API keys:
   - **OpenAI** — get from [platform.openai.com](https://platform.openai.com)
   - **Anthropic (Claude)** — get from [console.anthropic.com](https://console.anthropic.com)
   - **Google Gemini** — get from [aistudio.google.com](https://aistudio.google.com)
   - **Venice AI** — get from [venice.ai/settings/api](https://venice.ai/settings/api). Default model `venice-uncensored`; you can type any Venice model id.
   - **SpicyAPI** — paste your key, the API base URL (ends in `/v1`) and a model id from your SpicyAPI dashboard.
   - **Local LLM** — no key needed. Point it at any OpenAI-compatible server (see below).
   - **GitHub** — optional, for GitHub read/write tools (Personal Access Token)
4. Select your **Default Provider**
5. Tap **Save Settings**

---

## Linux desktop: fully local, no API keys

Download the `nexus-agent-linux` artifact from **Actions → Build Release**. It contains:

- `Nexus Agent-1.2.0.AppImage`: run anywhere (`chmod +x` it, then double-click)
- `nexus-agent_1.2.0_amd64.deb`: `sudo apt install ./nexus-agent_1.2.0_amd64.deb`
- `linux-local-ai-setup.sh`: installs Ollama and pulls models sized for your machine

```bash
chmod +x linux-local-ai-setup.sh
./linux-local-ai-setup.sh              # auto-picks models from your RAM/VRAM
./linux-local-ai-setup.sh --dry-run    # preview only
```

With no API keys set, the app uses **Local LLM** by default. Open Providers → Local LLM → **Detect installed models**, pick one, then Save.

**Sizing for an i7 13th gen with 64 GB RAM and an 8 GB GPU:**

| Model | Approx. size (Q4) | Where it runs | Use |
|---|---|---|---|
| `qwen3:8b` | ~5 GB | Entirely on the GPU | Fast default |
| `qwen3:14b` | ~9 GB | GPU + a little RAM | Better reasoning |
| `qwen3:30b-a3b` | ~19 GB | Mostly RAM; MoE keeps it quick | Best quality that stays interactive |
| Dense 32B–70B | 20–40 GB | RAM | Fits, but only ~1–5 tokens/sec |

**Abliterated models** (open-weight models with their refusal behaviour removed) are published by the community on ollama.com and Hugging Face. Pull any of them with
`./linux-local-ai-setup.sh --model <tag>`, or straight from a Hugging Face GGUF repo with `--model hf.co/<user>/<repo>-GGUF:Q4_K_M`, then pick it in the app. Check each model's card for its size and licence.

---

## Arkon knowledge hub (optional, local)

[Arkon](https://github.com/nduckmink/arkon) is a self-hosted wiki and MCP server. It compiles your documents into linked wiki pages. `arkon-local-setup.sh` (in the Linux download) runs it on your PC with **local Ollama models instead of paid APIs**:

```bash
./linux-local-ai-setup.sh      # Ollama first
./arkon-local-setup.sh         # then Arkon (needs Docker with Compose 2.24.4+)
./arkon-local-setup.sh --dry-run
```

What it does:
- Downloads Arkon from its own repo into `~/arkon`. Arkon's licence (PolyForm Internal Use) allows running it for your own use but not redistributing it, so it isn't bundled here.
- Makes Ollama reachable from Docker, with flash attention and a smaller long-context memory footprint.
- Creates local models under the names Arkon expects: `gpt-4o-mini` (default `qwen3:30b`, 128k context) and `text-embedding-3-small` (default `qwen3-embedding:4b` at 1536 dimensions). Override them with `LLM_BASE`, `LLM_CTX` and `EMBED_BASE`.
- Generates random passwords and secrets, keeps Arkon's ports on `127.0.0.1`, starts the 7 containers, switches Arkon to the local models and tests them.
- Saves the admin login to `~/arkon/.nexus-arkon-credentials`.

The script checks two things and warns if they fail: that the embedding model returns exactly 1536 numbers (if not, upload and search won't work), and that the chat model's trained context is long enough. Image captioning stays off.

**Connect Nexus Agent:** go to Providers → **Arkon knowledge hub** and enter `http://127.0.0.1:5055` with the email and password from the credentials file, then tap **Save & test**. New tasks then get `arkon_search` and `arkon_read`.

---

## Skills from GitHub

The **Skills** page indexes any GitHub repo that holds `SKILL.md` folders (default: `anthropics/skills`). Add more as `owner/repo` or `owner/repo@branch`, one per line.

The agent sees only each skill's name and description. When a task matches one, it calls `skill_load` to pull the full instructions, and `skill_read_file` for any reference files the skill mentions, so context stays small for local models. The index refreshes daily, or on demand. Public repos need no token; add a GitHub token in Providers if you hit GitHub's rate limit.

---

## Private / Local AI

### Venice AI
Venice runs open-weight models with no prompt logging. The app calls `https://api.venice.ai/api/v1` directly from the device and disables Venice's default system prompt so the agent's own instructions are used as-is.

### Local LLM (fully offline inference)
Choose **Local LLM (on-device / LAN)** in Providers and set the server URL:

| Server | URL to enter | Notes |
|--------|-------------|-------|
| Ollama in **Termux** on the same phone | `http://127.0.0.1:11434/v1` | `pkg install ollama`, then `OLLAMA_ORIGINS=* ollama serve` and `ollama pull llama3.2` |
| Ollama on a PC on your Wi‑Fi | `http://<pc-ip>:11434/v1` | Start with `OLLAMA_HOST=0.0.0.0 OLLAMA_ORIGINS=* ollama serve` |
| LM Studio | `http://<pc-ip>:1234/v1` | Enable "Serve on local network" and CORS |
| llama.cpp `llama-server` | `http://<host>:8080/v1` | |

`OLLAMA_ORIGINS=*` is required: the app's page runs from a `file://` origin, and Ollama blocks cross-origin requests unless you allow them. Small models (1–3B) run on most phones; bigger ones need a PC. The model must be good at following JSON instructions for the agent loop to work well.

---

## Features

### Agent Loop
Nexus Agent runs an iterative reasoning loop — give it a task and it will plan, use tools, evaluate results, and keep going until the task is complete (up to 12 iterations). Risky actions pause and ask for your approval before continuing.

### Available Tools
| Tool | What it does |
|------|-------------|
| `web_fetch` | Fetches any URL and returns the page content |
| `github_read` | Reads a file from a GitHub repository |
| `github_list` | Lists files/directories in a GitHub repository |
| `github_write` | Creates or updates a file in a GitHub repository |
| `memory_search` | Searches the agent's persistent memory |
| `memory_write` | Saves a note to persistent memory |

### Screens

| Screen | Description |
|--------|-------------|
| **Home** | Dashboard with quick stats and recent activity |
| **Tasks** | View all tasks — running, completed, and failed |
| **New Task** | Create and launch a new agent task |
| **Memory** | Browse and search everything the agent has remembered |
| **Providers** | Configure API keys and select default AI provider |
| **Permissions** | Control which tools require approval before use |
| **Logs** | Full timestamped log of every agent action |

### Supported AI Providers
- **OpenAI** — GPT-4o, GPT-4 Turbo, GPT-3.5 Turbo
- **Anthropic** — Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku
- **Google** — Gemini 1.5 Pro, Gemini 1.5 Flash

---

## Privacy & Data

- **No backend server.** All AI calls go directly from your device to the provider's API.
- **No account required.** The app uses your own API keys.
- **All data is local.** Tasks, memory, logs, and settings are stored in the app's local storage on your device. Uninstalling the app clears all data.
- **API keys stay on device.** Keys are never sent anywhere except directly to the respective AI provider.

---

## Troubleshooting

**App shows blank screen on launch**
- Force-close and reopen. The WebView may need a moment to initialize.

**"API key invalid" or no response from AI**
- Check that your key is correct and has available credits/quota.
- Verify your internet connection.

**Agent stops before finishing**
- The agent runs a maximum of 12 iterations per task. For complex tasks, create a follow-up task continuing from where it left off.

**Web fetch not working for some sites**
- Some sites block automated requests. Try a different URL or use the GitHub tools instead.

**GitHub write tool fails**
- Ensure your GitHub Personal Access Token has `repo` scope (read and write access to repositories).

---

## Build Info

| Property | Value |
|----------|-------|
| Package | `com.nexusagent.app` |
| Min SDK | Android 7.0 (API 24) |
| Target SDK | Android 14 (API 35) |
| Build type | Debug |
| Architecture | Universal (all ABIs) |

Built with: Android WebView wrapper + self-contained HTML/JS application. No Expo, no React Native runtime — just a native WebView loading the bundled app.

---

## Rebuilding from Source

The APK is built automatically via GitHub Actions:

```
Repository → Actions → Build Android APK → Run workflow
```

To modify the app, edit `dist/index.html` (the entire app lives in this single file), commit, and re-run the workflow.
