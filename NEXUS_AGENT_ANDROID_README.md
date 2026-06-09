# Nexus Agent — Android APK

**Nexus Agent** is a self-contained AutoGPT-style AI agent app that runs entirely on your Android device. It connects directly to OpenAI, Anthropic (Claude), and Google Gemini — no backend server required. Everything runs in your browser engine on-device, with all data stored locally.

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
   - **GitHub** — optional, for GitHub read/write tools (Personal Access Token)
4. Select your **Default Provider**
5. Tap **Save Settings**

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
