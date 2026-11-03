# Nexus Agent: multi-agent AI for RayNeo X3 Pro (Android APK)

Nexus Agent is a private, multi-model agent app for Android. It is built for the **RayNeo X3 Pro** AR glasses and also runs on any Android 8+ phone or tablet.

- **Multiple agents, multiple models.** Venice AI (including the `venice-uncensored` model), Anthropic Claude, xAI Grok, OpenAI, Google Gemini, OpenRouter and Groq, plus any OpenAI-compatible endpoint.
- **Local and private.** You can point an agent at Ollama, LM Studio, llama.cpp or vLLM running on your own phone, PC or home server over Wi-Fi. No cloud is involved, and the agent needs no API key.
- **Three modes:**
  - **Solo:** one agent answers.
  - **Council:** every council agent answers at once, then a synthesizer agent merges the answers.
  - **Chain:** each agent improves the previous agent's answer.
- **Agents can delegate.** The `ask_agent` skill lets one agent hand a task to another. For example, the default *Nexus* orchestrator can ask Venice, Grok or Local for help.
- **Skills (tools).** Built-in skills:
  - web search and web page fetch
  - generic HTTP requests
  - calculator and date/time
  - long-term memory
  - list and launch installed apps
  - open URLs and deep links
  - send any Android intent (alarms, maps, messaging and so on)
  - share sheet, text-to-speech and device info
  - outgoing webhooks
  - delegation to other agents

  You can also add your own **HTTP skills** (Home Assistant, n8n or your own API, with `{{param}}` templates) and **prompt skills**.
- **Webhooks:**
  - *Outgoing:* agents call Zapier, Make, n8n, Discord, Slack or Home Assistant on request, or on every reply.
  - *Incoming:* a token-protected server on the glasses (`/run`, `/hook/<name>`, `/speak`, `/notify`) lets automations trigger agents.
- **Phone remote console.** Open `http://<glasses-ip>:8787` on your phone to type prompts, paste API keys and import a configuration. Typing on glasses is slow, and this avoids it.
- **Built for the glasses:**
  - The UI is pure black, which shows as transparent on the waveguide display. Glasses mode uses large text.
  - Temple-touchpad / D-pad navigation: swipe to move focus, tap to select, back to close or stop.
  - Voice input, with the replies optionally read aloud.

## Get the APK

GitHub Actions builds the APK on every push that touches `android/`:

1. Open **Actions → Build Nexus Agent APK** and select the latest run. You can also start a run by hand with **Run workflow**.
2. Download the **nexus-agent-apk** artifact and unzip it. It holds two files:
   - `nexus-agent.apk` is the release build. Install this one.
   - `nexus-agent-debug.apk` is the debuggable build.

If you publish a GitHub Release, the workflow also attaches the APKs to it.

To build locally you need the Android SDK (platform 34), JDK 17 and Gradle 8.7 or later:

```bash
cd android
gradle assembleRelease      # -> app/build/outputs/apk/release/app-release.apk
```

### Optional: your own signing key

Without a key, the release APK is signed with the standard debug key. That is fine for sideloading. To use your own key, add these repository secrets: `NEXUS_KEYSTORE_BASE64` (a base64-encoded `.jks` file), `NEXUS_KEYSTORE_PASSWORD`, `NEXUS_KEY_ALIAS` and `NEXUS_KEY_PASSWORD`.

## Install on RayNeo X3 Pro

The X3 Pro runs an Android-based OS, so the APK installs over ADB like on any other Android device.

1. **Turn on developer mode and USB debugging on the glasses.** Menu names vary by firmware. Usually it is *Settings → About → tap the build number 7 times*, then *Developer options → USB debugging*. Some firmware has this option in the RayNeo phone companion app instead.
2. **Connect the glasses to a computer** with a USB-C cable and accept the debugging prompt on the glasses.
3. **Install the APK:**
   ```bash
   adb devices                      # the glasses should be listed
   adb install -r nexus-agent.apk
   adb shell monkey -p com.nexus.agent 1   # launches the app
   ```
4. **Optional: install wirelessly** after the first USB connection:
   ```bash
   adb tcpip 5555
   adb connect <glasses-ip>:5555
   adb install -r nexus-agent.apk
   ```

If the app doesn't appear in the RayNeo launcher, open it with the `monkey` command above or with an app-list or launcher app.

On a phone, copy the APK to the phone, open it, and allow "install unknown apps" when asked.

## First-time setup (about 2 minutes)

1. On the glasses, open **Webhooks**, enable the **local server**, and note the URL and access token.
2. On your phone (on the same Wi-Fi), open `http://<glasses-ip>:8787`, enter the token, expand **Set API keys**, and paste your keys:
   - Venice: https://venice.ai/settings/api
   - Anthropic: https://console.anthropic.com/settings/keys
   - xAI: https://console.x.ai
   - OpenAI and the others are optional.
3. Back on the glasses, pick an agent, or **Council** mode, and tap 🎙 or type.

Keys are stored only in the app's private Android storage. Each key is sent only to its own provider.

### Fully local, private models

Run a model server on a machine on your network. For example, with [Ollama](https://ollama.com):

```bash
ollama pull llama3.1:8b          # or an uncensored community model such as dolphin3
OLLAMA_HOST=0.0.0.0 ollama serve # listen on the LAN, not just localhost
```

Then in **Models → Ollama (local, private)**, set the base URL to `http://<that-machine-ip>:11434/v1` and press **Fetch models**. The **Local** agent uses this provider.

LM Studio (`:1234/v1`) and llama.cpp or vLLM (`:8080/v1`) work the same way.

Small local models often don't support tool calling. The app detects this and continues without skills.

## Incoming webhook API

All endpoints need the token, sent in one of three ways:

- `Authorization: Bearer <token>`
- `X-Nexus-Token: <token>`
- `?token=<token>`

| Method & path | Body | Effect |
|---|---|---|
| `POST /run` | `{"prompt":"…","agent":"Claude","mode":"solo\|council\|chain","speak":false}` | Runs the agent(s) and returns `{"agent","reply"}` |
| `GET /run?q=…&agent=Grok` | none | Same as `POST /run` |
| `POST /hook/<name>` | any JSON | The default agent handles the event, using its skills if needed |
| `POST /speak` | `{"text":"…"}` | Reads the text aloud on the glasses |
| `POST /notify` | `{"text":"…"}` | Shows a notification in the chat |
| `GET /agents` | none | Lists the agents |
| `POST /config/keys` | `{"venice":"…","anthropic":"…"}` | Stores API keys |
| `GET /config` / `POST /config/import` | config JSON | Exports or imports the configuration (an import must be confirmed on the device) |

```bash
curl -X POST http://192.168.1.20:8787/run \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"prompt":"Summarize my day","agent":"Nexus"}'
```

The server runs only while the app is open, and only on your local network.

Other ways in:

- **Deep link:** `nexusagent://ask?q=hello&agent=Grok&mode=council`
- **Share:** sharing text from another app to *Nexus Agent* puts it in the prompt.

## Safety and privacy

- The app has no analytics, no account and no backend. Requests go straight from the device to the providers you configure, or to your own LAN server.
- Risky skills ask for confirmation by default (*Settings → Ask before device / network actions*). These are app launching, intents, raw HTTP and webhooks.
- What a model will or won't answer is decided by the provider and model you pick. The app doesn't add filtering on top. You are responsible for following each provider's terms of use.

## Project layout

```
android/
  app/src/main/java/com/nexus/agent/
    MainActivity.java   WebView host, immersive/glasses tuning, key and intent handling
    NativeBridge.java   window.NexusNative: CORS-free HTTP, key store, apps/intents, TTS, speech, server control
    WebhookServer.java  LAN HTTP server: incoming webhooks + phone remote console
  app/src/main/assets/
    index.html          the whole agent runtime and UI (providers, agents, skills, modes, webhooks)
    remote.html         phone remote console
.github/workflows/build-apk.yml
```
