# Nexus Agent: multi-agent AI for RayNeo X3 Pro (Android APK)

Nexus Agent is a private, multi-model agent app for Android. It is built for the **RayNeo X3 Pro** AR glasses and also runs on any Android 8+ phone or tablet.

- **Multiple agents, multiple models.** Venice AI (including the `venice-uncensored` model), Anthropic Claude, xAI Grok, OpenAI, Google Gemini, OpenRouter and Groq, plus any OpenAI-compatible endpoint.
- **Local and private.** You can point an agent at Ollama, LM Studio, llama.cpp or vLLM running on your own phone, PC or home server over Wi-Fi. No cloud is involved, and the agent needs no API key.
- **Four modes:**
  - **Solo:** one agent answers.
  - **Council:** every council agent answers at once, then a synthesizer agent merges the answers.
  - **Chain:** each agent improves the previous agent's answer.
  - **Translate:** live two-way interpreting (for example English ⇄ Spanish), read aloud. Useful for conversations while wearing the glasses.
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

  **Pro skills** (79 skills in total; each one can be turned on or off per agent):

  | Group | Skills |
  |---|---|
  | Files | `file_list`, `file_read`, `file_write`, `file_move`, `file_delete`, `file_download`, `file_import` (system picker), `file_open`, `file_share`, `file_export` |
  | Coding | `run_javascript` (sandboxed worker with a timeout; reads and writes workspace files), `file_edit` (exact find/replace), `code_search` (grep), `github_get` (browse or download repo files) |
  | Engineering | `unit_convert` (17 categories, including temperature), `engineering_math`: evaluate, linear systems, matrices (multiply / inverse / determinant / transpose), statistics, linear regression, polynomial roots, integration, derivatives, equation solving |
  | Images | `camera_photo` (in-app camera: what you're looking at), `image_info`, `image_edit` (resize, crop, rotate, flip, grayscale, sepia, invert, brightness, contrast, saturation, hue, blur, sharpen, edges, threshold, text overlay), `image_convert`, `image_describe` (vision model), `image_generate` |
  | PDF | `pdf_info`, `pdf_extract_text`, `pdf_to_images`, `pdf_create` (from Markdown and images), `pdf_merge`, `pdf_split` |
  | OCR | `ocr` on images or scanned PDFs. **Offline Tesseract** (English bundled; other languages download once) or the vision model for handwriting, tables and mixed scripts |
  | Zip | `zip_create`, `zip_extract` (protected against zip-slip and zip bombs), `zip_list` |
  | Video | `video_info`, `video_frames`, `video_trim` (lossless), `video_extract_audio` / mute, `video_describe` (frames passed to the vision model) |
  | Maps | `apple_maps_search`, `apple_maps_directions`, `apple_maps_open`, `get_location` |
  | Phone | `contacts_search`, `phone_call` (opens the dialer, or calls directly), `send_sms` (prefilled message; you tap send) |
  | Translation | `translate` (AI model, DeepL or LibreTranslate), `translate_image` (signs, menus), `translate_file` (text and PDF files) |
  | Email | `email_list` (inbox, unread, search by text, sender or date), `email_read` (full text; saves attachments to the workspace), `email_send`, `email_reply` (threaded, with reply-all), `email_manage` (read/unread, flag, move, delete), `email_folders`, `email_compose` (opens your mail app with a draft; needs no account) |
  | Calendar | `calendar_list_calendars`, `calendar_events` (today, this week, next N days, search), `calendar_create_event` (reminders, attendees, recurrence), `calendar_update_event`, `calendar_delete_event`, `calendar_find_free_time`, `calendar_export_ics` (invites to email), `calendar_import_ics` |

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

## Files, camera and attachments

- **Files** tab: this is the agent's private workspace. It shows photos, imports, downloads and every file a skill creates. For each file you can attach it to a chat, view it, share it, save it to device storage or delete it.
- 📷 takes a photo and 📎 attaches files to your next message. Images go directly to vision-capable models (Claude, GPT, Grok and Gemini vision models). Other files are passed by path so the agent can use its PDF, zip, video and OCR skills on them.
- Sharing images, PDFs, zips or videos from any app to *Nexus Agent* attaches them automatically.

### Notes on specific skills

- **Apple Maps.** Android has no Apple Maps app, so `apple_maps_open` opens Apple Maps on the web (maps.apple.com).
  - For Apple's own search, geocoding and directions, add an **Apple Maps Server API token** in *Settings → Pro skills*. You create it in your Apple Developer account under Maps IDs & keys.
  - Without a token, search falls back to OpenStreetMap and driving/walking routes come from OSRM. Transit routing needs the token.
  - You can switch the links to open in the Android maps app instead.
- **Phone calls and SMS.** These need a device with a phone/dialer app (a phone, or glasses firmware that includes one).
  - Calls open the dialer pre-filled. With `direct: true` the call is placed immediately, after you grant the Call permission.
  - SMS opens the messaging app with the text filled in; you tap send.
  - The RayNeo X3 Pro may not have a dialer of its own. In that case the skill says so.
- **Video** uses the Android media framework, so it doesn't need FFmpeg. Trims copy the original data without re-encoding, which means cut points snap to the nearest keyframe.
- **OCR.** Local Tesseract runs fully offline. The first OCR in a language other than English downloads that language's model (about 2–10 MB) from jsDelivr.
- **Permissions.** Camera, location, contacts, call and microphone permissions are only requested the first time a skill needs them.
- **Confirmation.** Risky skills ask before running. These are deleting files, calls, SMS, contacts, location, app launching, intents, raw HTTP and webhooks. In the **Skills** tab you can tick *always allow* on any of them.
- **Upgrading from 1.0.0.** The app now runs from a secure local origin, which the camera, workers and WebAssembly need. Agents and settings saved in 1.0.0 don't carry over, but API keys do. To keep your configuration, use *Settings → Export config* on 1.0.0 before upgrading, then import it on 1.1.0.

## Email and calendar setup

Open *Settings → Email & calendar*. You can also paste the passwords from your phone using the remote console's **Set API keys & passwords** section.

**Email** uses IMAP to read mail and SMTP to send it. Pick a preset, enter your address, and paste an **app password**. Most providers no longer accept your normal password for apps like this.

| Provider | Where to create the app password |
|---|---|
| Gmail | Google Account → Security → 2-Step Verification → App passwords |
| iCloud Mail | appleid.apple.com → Sign-In and Security → App-Specific Passwords |
| Yahoo / Fastmail / Zoho | Account security settings → App passwords |
| Outlook / Microsoft 365 | Microsoft blocks password sign-in on many accounts. If **Test** fails, use `email_compose`, which drafts the message in the Outlook app |

- Copies of mail you send are saved to your Sent folder. Gmail does this itself.
- Without an account, agents can still draft emails in your mail app using `email_compose`, including attachments.

**Calendar** can use two sources, and agents see both together:

- **Android device calendars:** every calendar account synced on the device, such as Google, Exchange or Samsung. The app asks for calendar permission the first time.
- **CalDAV accounts:** iCloud, Fastmail, Nextcloud, Yahoo, Zoho, or any CalDAV server, with an app password. Use this on the RayNeo X3 Pro if the glasses have no Google account. iCloud uses `https://caldav.icloud.com/` with your Apple ID email and an app-specific password.

Choose the **default calendar** for new events with *Load calendars*, or ask the agent to use a specific calendar.

Notes:

- New events on device calendars can also go through the calendar app (`method: "app"`), so you confirm them on screen.
- Whether attendee invitations are sent depends on the calendar service. For a guaranteed invite, the agent can create an `.ics` file and email it.
- Sending email, replying, moving or deleting mail, and creating, changing or deleting events all ask for confirmation by default.

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
    MainActivity.java      WebView host on a secure local origin, glasses tuning, keys/intents, permissions
    NativeBridge.java      window.NexusNative: HTTP, key store, workspace files, apps/intents, TTS, speech,
                           camera, location, contacts, calls/SMS, downloads, server control
    Workspace.java         sandboxed private file workspace
    WorkspaceProvider.java content:// provider for opening/sharing files and camera output
    MediaTools.java        zip create/extract/list, video info/frames/trim/audio (framework only)
    EmailClient.java       IMAP/SMTP via JavaMail: list, search, read, attachments, flags, move, send
    CalendarTools.java     Android CalendarContract: calendars, events (recurrences expanded), create/update/delete
    RawHttp.java           HTTP/1.1 client for WebDAV/CalDAV verbs (PROPFIND, REPORT) and PATCH
    WebhookServer.java     LAN HTTP server: incoming webhooks + phone remote console
  app/src/main/assets/
    index.html          core agent runtime and UI (providers, agents, modes, webhooks)
    js/skills-pro.js    files, coding, engineering, image, PDF, OCR, zip, video, maps, phone, translation skills
    js/skills-comms.js  email and calendar skills, CalDAV client, iCalendar parser/writer, account settings
    lib/                bundled pdf.js, pdf-lib, Tesseract.js (+ English model): see THIRD_PARTY_LICENSES.txt
    remote.html         phone remote console
.github/workflows/build-apk.yml
```
