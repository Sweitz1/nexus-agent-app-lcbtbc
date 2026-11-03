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

  **Pro skills** (191 skills in total; each one can be turned on or off per agent):

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
  | Glasses (native RayNeo X3 Pro) | `glasses_status` (battery, charging, temperature, network, storage, sensors), `glasses_volume`, `glasses_brightness`, `media_control` (Spotify and other players: play, pause, next…), `glasses_settings`, `head_pose`, `ask_yes_no` (**nod = yes, shake = no**), `notifications_read` / `notifications_dismiss`, `camera_record_video` (point-of-view clips with sound) |
  | Gmail | `gmail_search` (full Gmail search syntax), `gmail_read` (saves attachments), `gmail_send`, `gmail_reply` (threaded, reply-all), `gmail_draft` (saves a draft without sending), `gmail_modify` (read, unread, archive, trash, star, label, spam), `gmail_labels` |
  | Google Calendar | Your Google calendars are a **source for every Calendar skill** (agenda, free time, create, update, delete; attendees get real invites), plus `gcal_quick_add` ("Lunch with Ann Friday 1pm", with an optional Google Meet link) |
  | Google Drive & Docs | `drive_search`, `drive_download` (exports Docs, Sheets and Slides to PDF, DOCX, XLSX, CSV, PPTX, TXT or MD), `drive_upload`, `drive_share`, `docs_read`, `docs_create`, `docs_append`, `sheets_read`, `sheets_append` (logs and trackers), `sheets_update`, `sheets_create` |
  | Google Tasks & more | `gtasks_list`, `gtasks_add`, `gtasks_update`, `google_contacts` (useful on glasses without a phonebook), `youtube_mine` (liked videos, playlists, subscriptions), `google_open` (Search, News, Lens, Assistant, Photos, Keep, Home, Wallet…), `google_account` |
  | Google Maps | `gmaps_places` (ratings, open now, price level), `gmaps_place_details` (hours, phone, website, reviews), `gmaps_directions` (**live traffic** and turn-by-turn steps, or Google Maps navigation). The Google Translate engine is also available for every translation skill |
  | Music | `music_now_playing` (any app: Spotify, YouTube Music, Plex, podcasts…), `music_control` (control a specific app), `music_play` (routes to your music service), `music_lyrics` (**synced lyrics** on screen and on the glasses HUD) |
  | Spotify | `spotify_search`, `spotify_play` (tracks, albums, playlists, artists; shuffle; device), `spotify_control`, `spotify_now_playing`, `spotify_queue`, `spotify_devices` (Spotify Connect transfer), `spotify_playlists` (list, show, **create from song names**, add), `spotify_library` (like, recent, top tracks and artists) |
  | YouTube Music | `ytmusic_search`, `ytmusic_play` (opens in the YouTube Music app with an automatic radio mix), `ytmusic_open` (home, explore, library, liked) |
  | Display glasses (Lenovo & others) | `hud_control`: a heads-up display on USB-C display glasses (**Lenovo Legion Glasses, Lenovo Glasses T1**, XREAL, Viture, Rokid, RayNeo Air…). Shows a clock, agent replies, teleprompter, now playing, synced lyrics and notification toasts |
  | Meta glasses | `meta_glasses_status`, `meta_glasses_voice` (glasses microphones for voice and "Hey Nexus"), `glasses_tap_to_talk`, `meta_glasses_media` (photos and videos you took with the glasses), `meta_glasses_look` (**"what am I looking at?"** using your latest capture), `meta_ai_app` |
  | Screen control | `screen_open_app`, `screen_read` (UI elements of the app in front), `screen_tap`, `screen_type`, `screen_scroll`, `screen_swipe`, `screen_nav` (back, home, recents, notifications), `screen_wait`, `screen_screenshot` (screenshot passed to the vision model), `screen_return`. Agents operate other apps for you, for example *"reorder my usual from DoorDash"* |
  | Shopping | `shop_search` (compares Amazon and Walmart: prices, ratings, Prime, pickup), `shop_product`, `shop_add_to_cart` (opens the store's add-to-cart page; **you check out yourself**), `shop_open` (search, cart, orders and tracking, deals, buy again), `shopping_list`, `shopping_list_to_cart` (whole list into the cart in one step) |
  | Plex | `plex_search`, `plex_browse` (libraries, on deck, recently added), `plex_details`, `plex_play` (plays on the glasses, resumes from your progress, picks up a show at the next unwatched episode, plays albums and playlists as a queue, or opens the item in the Plex app), `plex_mark` |
  | Food | `food_order_app` (26 chains, including McDonald's, Chick-fil-A, Taco Bell, Domino's, Starbucks and Chipotle), `food_delivery` (DoorDash, Uber Eats/Postmates, Grubhub, Instacart, Gopuff, Walmart, Amazon Fresh, Deliveroo, Just Eat, Wolt, Glovo, Lieferando, Swiggy, Zomato), `food_orders` (order tracking), `food_nearby` (sorted by distance), `delivery_services` |
  | Scanner | `scan_code` (live camera or image: QR, EAN/UPC, Code 128/39, ITF, Data Matrix, PDF417, Aztec; recognises links, Wi-Fi, contacts, events and products), `qr_generate` (including Wi-Fi login codes), `product_lookup` (Open Food Facts, UPCitemdb) |
  | Telegram | `telegram_send`, `telegram_send_file`, `telegram_read`, `telegram_chats`. Optionally, the bot can answer you from anywhere (text, photos, documents, transcribed voice notes) |
  | Kino | `kino_search`, `kino_trending`, `kino_details` (cast, runtime, rating, trailer, **where to stream, rent or buy**), `kino_play` (trailers and videos in the in-app player), `kino_feed` (a scrolling poster feed in the Media tab) |
  | Audiobooks | `audiobook_search` (free LibriVox titles via Internet Archive), `audiobook_play` (resumes where you stopped), `audiobook_control` (pause, skip, seek, speed, sleep timer), `audiobook_library`, `audiobook_download` (offline), `audiobook_create` (**turns an EPUB, PDF or text file into an audiobook** with read-along text) |
  | Audio | `text_to_audio` (offline device voice to WAV, OpenAI/Venice voices to MP3, or ElevenLabs), `tts_voices`, `audio_transcribe` (Whisper via OpenAI or Groq), `audio_play`, `read_aloud` (reads text aloud while it scrolls and highlights), `teleprompter` (auto-scrolling; touchpad changes the speed) |
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

## "Hey Nexus" wake word

Turn it on in *Settings → "Hey Nexus" wake word*, or ask an agent to call `wake_word` with `on`.

- **Offline and private.** The wake word uses [Vosk](https://alphacephei.com/vosk/), an open-source recogniser that runs on the device. The small speech model (about 40 MB) downloads once. Audio is never uploaded while the app waits for the wake phrase.
- **Background listening.** A microphone foreground service keeps listening with the screen off or while you use other apps. A small notification shows while it is listening.
- **After the wake word** a tone plays. Your request is transcribed and sent to the current agent (or the current mode), and the answer is read aloud. You can choose how the request is transcribed:
  - *Offline* (default): fully private.
  - *System speech recognizer*: more accurate, but uses Google's service where available.
- **Waking the app from the background.** Grant *Allow opening from background* (Android's "display over other apps") so the wake word can bring Nexus to the front. Without it, a "tap to open" alert appears instead.
- **Other phrases.** "Hey Nexus", "Hi Nexus" and "OK Nexus" all work, and so do common mishearings such as "hey next us". You can add your own phrase. Words must exist in the model's vocabulary.
- Say **"stop"** or **"cancel"** to interrupt a reply.
- The app pauses the wake word while it is speaking, so it doesn't hear itself.
- Models for German, French, Spanish, Italian, Portuguese, Dutch, Russian, Chinese and Japanese are available. With these, set a custom phrase in that language.

## Google services

One Google sign-in gives agents **Gmail, Google Calendar, Drive, Docs, Sheets, Tasks, Contacts** (and optionally your YouTube account). You choose which services are requested.

**One-time setup** (free, about 5 minutes; the steps are also shown in *Settings → Google*):

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com).
2. Under *APIs & Services → Library*, enable the Gmail, Google Calendar, Drive, Docs, Sheets, Tasks and People APIs, plus the YouTube Data API if you want it.
3. Set up the *OAuth consent screen*: choose External and add yourself as a test user.
   - While the app is in Testing mode, Google ends the sign-in after **7 days**. To avoid that, publish the app (it stays unverified, which is fine for personal use; Google shows a warning you can click through).
4. Under *Credentials*, create an **OAuth client ID** of type **Desktop app**, then paste the client ID and secret into Settings and press **Connect Google**.
5. Optional: create an **API key** with Places API (New), Routes API and Cloud Translation API enabled. This adds Google Maps search, live-traffic routes and Google Translate.

**How sign-in works:** it uses Google's standard installed-app flow (PKCE) in your normal browser. Google then returns to Nexus through a temporary local address on the device (`http://127.0.0.1:<port>`).

- Typing on glasses is hard, so you can sign in on your phone instead. The phone's browser will end on a page that fails to load, at an address starting with `http://127.0.0.1`. Copy that address and paste it into *Settings → Google → "Signed in on another device?"*. The phone remote console works for this too.
- Tokens are stored only in the app's private storage. *Disconnect* revokes them with Google.

**Not available:** Google Keep and Google Home devices, because Google offers no public consumer API for them. Use Tasks or Docs instead of Keep. `google_open` launches those apps.

## Music, display glasses and Meta glasses

**Spotify** (full control through the Spotify Web API):

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and create an app (free).
2. Add the redirect URI `nexusagent://spotify-callback`.
3. Paste the **Client ID** in *Settings → Music → Connect Spotify*, then approve the sign-in.

Sign-in uses PKCE, so no client secret is stored. Search, playlists and your library work on any account. **Spotify only allows remote playback control with Premium**; on free accounts, songs open in the Spotify app instead. If no Spotify device is active, Nexus starts the Spotify app and plays there.

**YouTube Music:** Google offers no public playback API, so:

- Agents search YouTube (a free YouTube Data API key makes search more reliable).
- Songs play in the YouTube Music app, continuing with a radio mix of similar songs.
- Playback is controlled through Android media sessions.

**Any music app:** with notification access granted, agents can see what is playing in Spotify, YouTube Music, Plex, Pandora, podcast apps and others, and can control a specific app. `music_lyrics` shows time-synced lyrics from [LRCLIB](https://lrclib.net) that follow the song.

**Lenovo Legion Glasses / Lenovo Glasses T1** (and XREAL, Viture, Rokid, RayNeo Air and other USB-C display glasses):

- These glasses are external monitors without their own apps. Plug them into a phone with USB-C video output and Nexus puts **its own HUD** on them while your phone screen stays free.
- The HUD shows a clock, live agent replies ("🎙 your question" followed by the answer), teleprompter, now playing, synced lyrics and notification toasts. The background is black, which looks see-through in the glasses.
- In Settings you can make it start automatically when the glasses connect, and adjust the font size and edge margin.
- Lenovo ThinkReality A3 needs Lenovo's own enterprise software and is not supported.

**Meta Ray-Ban / Oakley Meta:** Meta's glasses platform is closed to third-party apps; Meta's developer toolkit is only in limited preview. Nexus uses what works today:

- **Voice through the glasses.** Answers play on the glasses speakers. *Use the glasses microphones* routes Nexus voice input, and the "Hey Nexus" wake word, through the glasses' mics.
- **Tap to talk.** Tapping the glasses' touchpad (play/pause) starts Nexus listening instead of pausing music. Swipe forward and back still skip tracks.
- **Your captures.** Photos and videos you take with "Hey Meta, take a photo" sync to the phone gallery once importing is turned on in the Meta AI app. `meta_glasses_look` then answers questions about the latest one: read a sign, translate a menu, identify a product, summarise a video.

## Screen control (accessibility)

Agents can operate other apps step by step: open the app, read the screen, tap, type, scroll and repeat. Each action returns the updated screen to the agent. For apps that don't expose readable elements (games, maps, video, some web views), the agent takes a screenshot and has the vision model look at it.

**To enable:** *Settings → Screen control → Enable in Accessibility settings*, then switch on **Nexus Agent screen control**. Android shows its standard warning for accessibility services.

**Guardrails:**

- **Consent per task and app.** The first time an agent wants to control an app during a task, it asks you.
- **Money, sending and deleting always ask you first.** Buttons such as *Place order, Pay, Buy, Checkout, Confirm, Send, Transfer, Tip, Subscribe, Book, Delete, Post* need your confirmation, and **cannot be set to always allow**. Nexus jumps to the front to ask (on screen and aloud, and by nod if you enabled that), then returns to the app.
- **Password fields** are never read or typed into. Text that looks like a card number is refused; you enter payment details yourself.
- **Protected apps are blocked:** banking, wallets (PayPal, Venmo, Cash App, crypto exchanges), password managers and authenticators. You can edit the pattern in Settings.
- **You can always stop it.** A floating *🤖 Nexus is controlling — tap to stop* pill shows while it works. Tapping it, saying "stop" after "Hey Nexus", or the back key stops the task.
- When the task ends, Nexus returns to the front. You can turn this off.

The service only acts when an agent task calls it. Screen contents go to your chosen model provider, just like any other prompt, so use a local model for anything private.

## Shopping, Plex and food

- **Amazon and Walmart** don't offer a public ordering API to consumers, so purchases always finish in their apps:
  - Agents search and compare prices by reading the stores' public search pages. If a store shows a robot check, the agent opens the app's search instead.
  - Agents fill your cart through the stores' add-to-cart links and open your orders, tracking, deals and buy-again pages.
  - The Amazon store country is a setting (amazon.com, .co.uk, .de, .ca and more).
- **Plex:** press *Sign in with Plex* and approve the code on your phone; the code is shown as a QR. The app finds your server and prefers the local connection. You can also enter the server URL and token by hand.
  - Videos are **transcoded by default**, so anything plays on the glasses (HEVC, MKV, surround sound and so on). Music plays directly.
- **Fast food and delivery:** agents open a chain's own app or online ordering page, or search DoorDash, Uber Eats and the other services for a dish or restaurant. They can also open order tracking and find the nearest locations. You place the final order in the app.

## Native RayNeo agent, Media tab and on-demand skills

- **RayNeo agent.** A dedicated agent preset for the glasses. It has every skill and short, display-friendly answers. On RayNeo/TCL hardware it becomes the default agent and glasses mode turns on automatically.
- **Head gestures.** `ask_yes_no` puts a question on the display and reads it aloud. You answer by nodding or shaking your head, or by tapping.
  - Optionally, every confirmation prompt can be answered the same way: *Settings → Media & audio → Confirm actions by nodding*.
  - The sensor sits differently in each pair of glasses, so press **Calibrate nod** and **Calibrate shake** once.
- **Notifications.** *Grant notification access* lets agents read and summarise notifications from your phone and apps. *Announce new notifications* reads them aloud as they arrive, optionally for chosen apps only.
- **Media tab:**
  - ▦ Scan code: live QR/barcode scanner with actions (open link, look up product, ask the agent).
  - 📚 Audiobooks: search, library with progress, download.
  - 🎬 Kino: a scrolling movie and TV feed with posters; tap a card for details, the trailer and where to watch.
  - 📜 Teleprompter.
  - A mini player bar (play/pause, previous, next, speed, read-along) stays at the bottom while audio plays.
- **Kino data.**
  - Without a key, the app uses Apple iTunes (movies and trailers) and TVmaze (TV).
  - With a free [TMDB](https://www.themoviedb.org/settings/api) API key or read token, you get trending titles, ratings and *where to watch* (streaming, rent and buy, per region).
  - YouTube trailers open in YouTube; other videos play in the app.
- **Text to audio.**
  - The device engine works offline and creates WAV files.
  - *AI provider voices* use OpenAI (`gpt-4o-mini-tts` with voices like `alloy` or `nova`) or Venice (set the model to `tts-kokoro`).
  - ElevenLabs needs its own API key.
  - Long texts are split into chunks and joined automatically.
- **Telegram.**
  1. Create a bot with [@BotFather](https://t.me/BotFather) and paste its token in *Settings → Media & audio → Telegram*.
  2. In Telegram, send `/pair <code>` to your bot. The code is shown in Settings.
  3. Turn on *Answer messages sent to the bot*. The bot then forwards your messages, photos, files and voice notes to the chosen agent and sends back the answer.

  This works while the app is open. It doesn't need the local network, so you can reach the glasses from anywhere. Only paired chats are answered. The bot can only message people who have started it, and it can't read your personal Telegram chats; Telegram doesn't allow that for bots.
- **On-demand skill loading.** With more than 100 skills, sending every skill on every request would be slow, expensive, and over OpenAI's 128-tool limit. So agents start with a small core set (web, utility, memory, delegation) plus `load_skills`, and the system prompt lists every other group by name. The agent loads groups as needed, or a group loads automatically when the agent calls one of its skills directly. You can change this in *Settings → Agent runtime → Skill loading*.

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
    GlassesTools.java      battery/network/storage status, volume, media keys, settings panels, head pose, nod/shake detection
    NexusNotificationListener.java  notification access (read, announce, dismiss)
    WakeWordService.java   offline "Hey Nexus" wake word (Vosk) as a microphone foreground service
    NexusAccessibilityService.java  screen control: UI tree, tap/type/scroll/swipe/gestures, screenshots, stop pill, app block list
    MusicTools.java        media sessions of all apps: now playing + per-app transport controls
    HudPresentation.java   HUD on external displays (Lenovo Legion Glasses / Glasses T1 and other display glasses)
    WebhookServer.java     LAN HTTP server: incoming webhooks + phone remote console
  app/src/main/assets/
    index.html          core agent runtime and UI (providers, agents, modes, webhooks)
    js/skills-pro.js    files, coding, engineering, image, PDF, OCR, zip, video, maps, phone, translation skills
    js/skills-comms.js  email and calendar skills, CalDAV client, iCalendar parser/writer, account settings
    js/skills-media.js  scanner, Telegram, Kino, audiobooks, text-to-audio, glasses skills, Media tab, player, RayNeo agent
    js/skills-shop.js   wake word control, Amazon/Walmart shopping + list, Plex, fast food & delivery
    js/skills-screen.js screen-control skills, consent and sensitive-action guard, settings
    js/skills-music.js  Spotify, YouTube Music, media sessions, lyrics, display-glasses HUD, Meta glasses
    js/skills-google.js Google sign-in, Gmail, Calendar source, Drive, Docs, Sheets, Tasks, Contacts, YouTube, Maps, Translate
    hud.html            HUD shown on external display glasses
    lib/                bundled pdf.js, pdf-lib, Tesseract.js (+ English model): see THIRD_PARTY_LICENSES.txt
    remote.html         phone remote console
.github/workflows/build-apk.yml
```
