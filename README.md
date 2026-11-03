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

  **Pro skills** (233 skills in total; each one can be turned on or off per agent):

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
  | Google Photos | `gphotos_upload` (to an album, created if needed), `gphotos_pick` (**download what you select** in the Google Photos picker, on this device or by scanning a QR with your phone), `gphotos_albums` |
  | APK | `apk_apps`, `apk_extract` (back up any installed app; split apps become an .apks bundle), `apk_inspect` (versions, SDK levels, permissions, components, signing certificate, deep links), `apk_install`, `apk_uninstall` (Android asks you to confirm both) |
  | App integrations | `app_integrations` (reads an app's manifest: deep links, share targets, text actions, custom intents) and `app_integrate`, which **turns any installed app into a new agent skill** (for example "spotify:search:{{input}}", "share to Notes") |
  | Scraper | `scrape_page` (metadata, JSON-LD, headings, text, links, images, tables, or exactly the CSS selectors you name), `scrape_list` (repeating items across pages, saved to CSV or JSON), `scrape_tables`, `scrape_crawl` (polite: 1 page per second, same site), `scrape_watch` (price-drop and change alerts). `render=true` runs the page's JavaScript in a hidden browser. robots.txt is respected |
  | Downloads | `download_batch`, `download_page_media` (largest images, videos, audio, PDFs and other documents on a page), `download_system` (Android download manager for big files, which resume in the background), `download_status`, `download_import` |
  | Coding & builds | `run_python` (**Python 3 on the device** via Pyodide: numpy, pandas, matplotlib and scikit-learn; files your code writes are saved), `run_code` (C, C++, Java, Go, Rust, Ruby and more through a Piston runner you host), `web_preview`, `code_template` (Android app, static site, Python or Node CLI), `build_android_app` (**builds an installable APK with GitHub Actions** and downloads it) |
  | GitHub | `github_list` (repos, issues, PRs, Actions runs, workflows, releases, branches, notifications), `github_search`, `github_get`, `github_write` (create repos; put or delete files; issues and comments; PRs, including merge; branches; releases with assets; GitHub Pages), `github_push` (a whole folder in one commit), `github_actions` (status, failed-job logs, artifacts, release downloads, run or re-run) |
  | AutoGPT | `autogpt_start` (an autonomous background run toward a goal; optionally repeats hourly or daily), `autogpt_status`, `autogpt_control` (pause, resume, stop, delete), `autogpt_server_run` (sends a task to a self-hosted AutoGPT agent over the Agent Protocol and collects its outputs and files) |
  | Verizon Cloud | `verizon_cloud`: status, upload (sends files to the Verizon Cloud app), backup (saves to the gallery or Downloads so Verizon Cloud's automatic backup picks them up), open. `file_save_to_device` works with any cloud backup app |
  | Deepfake detection | `deepfake_check` (images, video and audio: provenance markers plus a visual forensic review by your vision model, giving a verdict with evidence and caveats), `media_provenance` (offline: C2PA Content Credentials, IPTC "AI-generated" tags, AI tool and editor markers), `reverse_image_search` (Google Lens) |
  | Synthetic media of yourself | `voice_clone_self` (ElevenLabs), `avatar_video_self` (D-ID talking photo), `my_synthetic_media`. **Only your own voice and face**; confirmation is required every time and outputs are labelled AI-generated |
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
2. Download the **nexus-agent-apk** artifact and unzip it. It holds three files:
   - `nexus-agent.apk` is the full app (release build). Install it on the glasses for standalone use, or on your phone as the **phone server**.
   - `nexus-glasses.apk` is the lightweight **glasses client**. Install it on the glasses when the phone runs Nexus (see [Phone server + glasses client](#phone-server--glasses-client)).
   - `nexus-agent-debug.apk` is the debuggable build of the full app.

If you publish a GitHub Release, the workflow also attaches the APKs to it.

To build locally you need the Android SDK (platform 34), JDK 17 and Gradle 8.7 or later:

```bash
cd android
gradle assembleRelease      # -> app/build/outputs/apk/release/app-release.apk
                            #    glasses/build/outputs/apk/release/glasses-release.apk
```

### Release signing and publishing

Both APKs are signed with APK Signature Scheme v1, v2 and v3. With your release key in the repository secrets, every build is signed with it:

| Secret | Value |
|---|---|
| `NEXUS_KEYSTORE_BASE64` | `base64 -w0 your-release.jks` |
| `NEXUS_KEYSTORE_PASSWORD` | keystore password |
| `NEXUS_KEY_ALIAS` | key alias |
| `NEXUS_KEY_PASSWORD` | key password (the same as the keystore password for PKCS12) |

Without the secrets, everyday builds use the debug key so they still install with `adb`.

**Publishing a release:** push a version tag, for example `git tag v2.6.0 && git push origin v2.6.0`. The workflow then:

1. refuses to build unless your release key is configured;
2. builds both APKs and the Google Play bundles (`.aab`);
3. verifies the signatures with `apksigner`;
4. publishes a **GitHub Release** with the APKs, AABs, `SHA256SUMS.txt` and `SIGNING.txt` (the certificate's SHA-256 fingerprint).

Keep the keystore and its password backed up. Updates only install over an existing app when they are signed with the same key. Switching from debug-signed builds to your key needs one uninstall and reinstall.

**Google Play:** the `.aab` files are what you upload in the Play Console. That needs your own developer account, and you turn on Play App Signing there. Expect Google's policy reviews for these features: screen control (accessibility), all-apps visibility, installing APKs, calling, the overlay, and the special-use foreground service. Some may have to be removed or justified for a Play listing. Sideloading the GitHub release APKs works without any of that.

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

## Phone server + glasses client

You can run Nexus two ways:

- **Standalone:** install `nexus-agent.apk` on the glasses. Everything runs on the glasses.
- **Phone server + glasses client:** install `nexus-agent.apk` on your phone and `nexus-glasses.apk` (package `com.nexus.agent.glasses`, "Nexus Glasses") on the glasses. Models, API keys, skills, accounts, files and AutoGPT stay on the phone. The glasses only handle voice, the display, the camera, the touchpad and head gestures, so they use less battery and keep no secrets.

**Pairing (once):**

1. Put both devices on the same Wi-Fi, or connect the glasses to the phone's hotspot.
2. On the phone, open *Settings → Nexus Glasses* and press **Pair glasses**. This turns on the local server, advertises it on the network (`_nexus._tcp`), and shows a 6-digit code and a QR code. The code is valid for 5 minutes, and 5 wrong tries cancel it.
3. Open **Nexus Glasses** on the glasses. It finds the phone automatically. Then scan the QR code with the glasses camera, type the code, or say it. The phone's address can also be entered by hand (`192.168.x.x:8787`).

The glasses then store the phone's access token, so later launches connect directly. Use *☰ → Settings → Forget phone* to unpair, and change the token on the phone to revoke access.

**Using it:**

| Control | What it does |
|---|---|
| 🎙 / assistant key | Ask by voice. The phone's current agent answers on the glasses display and speaks the reply through the glasses (not the phone) |
| 👁 / camera key | Takes a photo with the glasses camera and asks the agent about it (you can also say a question) |
| ⏯ ⏭ | Controls music playing on the phone |
| ☰ | Now playing, today's calendar, AutoGPT status, notifications, stop the current run, settings |

The phone also pushes live updates to the glasses: replies from other places (phone chat, AutoGPT reports, Telegram, webhooks, scheduled runs) and, if you allow it, phone notifications. When an agent needs your confirmation for a risky action, the question appears on the glasses: **nod** to allow, **shake** to deny, or tap a button. The phone dialog stays open too, and the first answer wins. The quick menu can only run a short list of read-only and music skills directly. For everything else you ask the agent, so the usual confirmations still apply.

**Glasses on their own eSIM (mobile data):** the glasses are then not on your Wi-Fi. Install [Tailscale](https://tailscale.com) (or another private VPN) on the phone and on the glasses, sign in to the same account, then pair once. The phone sends all of its addresses during pairing: Wi-Fi, hotspot, VPN, and an optional *Remote address* you can set under *Settings → Nexus Glasses*. When one address stops answering, the glasses switch to another one that works. Don't open the server port to the public internet: the connection is plain HTTP and is protected only by the token, while a VPN encrypts the link.

Keep Nexus running on the phone. While glasses are being served, a "Nexus is serving your glasses" notification keeps it alive in the background.

## Binocular display and temple touchpad (RayNeo X3 / X3 Pro)

The X3 and X3 Pro show both eye panels as one wide logical screen. A normal Android app would be split across the two eyes. Both Nexus apps handle this themselves, without the RayNeo SDK:

- **Mirror per eye:** the UI is laid out at half width and drawn once per eye, the same idea as RayNeo's `MirrorContainerView`.
- **Temple gestures:** the temple touchpad is turned into navigation. Swipe forward or back moves to the next or previous item, swipe up or down scrolls, a tap selects, a double tap goes back, and a long press starts voice input.

Both are set to **Auto**. They turn on when the device looks like RayNeo glasses or the screen is a side-by-side ratio (2.4:1 or wider). You can force them on or off in *Settings → Display & voice* (phone app) or *☰ → Settings* (glasses client). Changing a setting reloads the screen.

**RayNeo Mercury Android SDK (optional):** if the SDK is built in, both apps use RayNeo's own pieces:
- its temple-gesture dispatcher, which has separate X2 and X3 versions and also handles the X3 pinch key and triple and two-finger taps;
- its X3 detection (model `ARGF20`) and the "glasses worn" state;
- a third mirror mode, **RayNeo SDK mirror** (`MirroringView`).

The SDK is RayNeo's proprietary software and this repository is public, so the AAR is not committed. See [`android/libs/rayneo/README.md`](android/libs/rayneo/README.md) for how to add it locally or in CI. Without it, the built-in mirror and gesture code is used.

Nexus does not use Brilliant Labs' Halo/Frame SDK. That SDK is for a different, Bluetooth-based device and doesn't work with RayNeo glasses.

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

## Developer services: build an app from your glasses

Add a GitHub token in *Settings → Developer*. Use a fine-grained token with Contents, Actions, Issues, Pull requests and Administration permissions (Administration is needed to create repos), plus Pages if you'll publish sites.

You can then ask, for example, *"make me a tip-calculator app and install it"*:

1. `code_template` creates an Android project, with a build workflow, in the workspace.
2. The agent writes the app's HTML, CSS and JS, and checks it with `web_preview`.
3. `build_android_app` creates a private repo, pushes the project in one commit, waits for GitHub Actions to build it, and downloads the APK.
4. `apk_install` opens Android's installer, where you confirm.

Static sites work the same way with `github_write enable_pages`.

Details:

- **Python** runs fully on the device. The first run downloads the Pyodide runtime (about 10 MB) from jsDelivr; packages load on demand.
- **Other languages:** `run_code` sends code to a [Piston](https://github.com/engineer-man/piston) server you host.
- **APK services** need Android's "Install unknown apps" permission for Nexus. Nexus opens that setting the first time. Nexus can see all installed apps (the `QUERY_ALL_PACKAGES` permission), which is fine for a sideloaded app but would not be allowed on Google Play.
- **App integrations** are stored as custom skills. Manage or remove them in *Settings → Developer*.
- **Google Photos:** since Google's 2025 API change, apps can upload, manage the albums they create, and download items you choose in the Google Photos picker. They can't browse your whole library. Tick *photos* in *Settings → Google* and reconnect.
- **Scraping and downloads:** robots.txt is respected by default and crawling is rate-limited. Downloading from streaming services (YouTube, Netflix and others) is intentionally not supported, because their terms and copy protection forbid it.

## AutoGPT: autonomous goals

Give Nexus a bigger goal in the **Auto** tab, in the **AutoGPT** chat mode, or by voice ("Hey Nexus, in the background, research … and email me a PDF"). It then works AutoGPT-style:

1. **Plan.** A planner agent breaks the goal into 3–10 tasks and sets success criteria.
2. **Act.** A worker agent does one task at a time with all its skills: web, files, PDF, email, calendar, code, shopping and so on. Useful results are saved as workspace files.
3. **Review.** After each task the planner marks it done or failed, keeps notes, adds or removes tasks, and decides when the goal is met.
4. **Report.** A final summary goes to the chat. It is also read aloud, shown on the glasses HUD, sent to paired Telegram chats and sent to your reply webhooks.

Controls:

- **Budgets:** a task budget and a time budget for each run. When a run hits its budget, *Continue* adds 10 more tasks.
- Pause, resume and stop.
- **Ask me before each step:** you approve or skip every task before it runs.
- **Repeat:** runs the goal again hourly or daily at a set time, while the app is open.

Runs interrupted by an app restart wait for you to resume them. Risky actions inside a run still ask for confirmation, and they are declined automatically if nobody answers. Autonomous runs cannot start other autonomous runs. You choose the planner and worker agents in *Settings → AutoGPT*.

**Real AutoGPT:** if you self-host AutoGPT (Forge or classic agents, which speak the open [Agent Protocol](https://agentprotocol.ai)), enter its URL in *Settings → AutoGPT*. `autogpt_server_run` then sends tasks to it and downloads its artifacts.

## Verizon Cloud, deepfake detection and synthetic media

**Verizon Cloud** offers no public API, so Nexus works through the app and through Android storage:

- **Upload:** files are sent straight to the Verizon Cloud app, where you confirm.
- **Automatic backup:** files are saved to *Pictures/Movies/Music/Download → Nexus*, which Verizon Cloud backs up when backup is on in its settings.
- **Getting files out:** in Verizon Cloud, select items, then *Share → Nexus Agent* (they appear in *Files → imports*). With screen control enabled, an agent can also operate the Verizon Cloud app for you.

**Deepfake detection** (`deepfake_check`) combines two things, and needs no extra accounts:

1. **Provenance** (offline): C2PA Content Credentials; IPTC *trainedAlgorithmicMedia* declarations; Stable Diffusion and ComfyUI parameters; Midjourney, DALL·E, Firefly, Imagen and other markers; editing apps.
2. **A visual forensic review by your vision model.** For videos, it reviews sampled frames.

The result is a verdict with the evidence and honest caveats. Audio gets the provenance check only. No check is perfect, so `reverse_image_search` helps you find the original source.

**Synthetic media is limited to yourself.** Nexus can clone **your own voice** (ElevenLabs; usable for every text-to-audio skill) and make a **talking-avatar video from your own photo** (D-ID; add the key in *Settings → Synthetic media of yourself*). Every run shows a consent confirmation that cannot be auto-approved or bypassed by settings, and the decision is logged. Outputs are labelled *AI-generated*. **Face swaps and cloning other people's faces or voices are intentionally not supported**: they mainly enable impersonation, fraud and non-consensual imagery.

## Narrator: natural audiobook voices

*Settings → Narrator* makes text-to-audio, audiobooks and (optionally) spoken chat replies sound like a real narrator:

- **Narration styles:** audiobook (warm and natural), romance/romantasy (intimate, with distinct voices for each character), epic fantasy/LitRPG, thriller, documentary, bedtime and conversational. You can add your own direction, for example "a touch slower; light Scottish accent for Callum". OpenAI `gpt-4o-mini-tts` voices receive the style as voice instructions. ElevenLabs voices get matching voice settings, plus context from the neighbouring chunk so long passages flow naturally.
- **Find a narrator voice:** search ElevenLabs' Voice Library, the voices their owners chose to share, filtered for audiobook narration. Preview a voice and press **Use**, which adds it to your ElevenLabs account and makes it the narrator.
- **Speak replies in the narrator voice:** chat replies are synthesized with your narrator voice. If the network fails, Nexus falls back to the device voice.
- **Skills:** `narrate`, `narrator_voices`, `narrator_set_voice`, `narrator_style`.

**On the glasses:** the Nexus Glasses app speaks in the same narrator voice. The phone renders each reply as audio while the text is already showing, and the glasses stream it from the phone and play it. Turn it on or off in *☰ → Settings → Narrator voice* on the glasses, or with "Speak on the glasses in the narrator voice" under *Settings → Nexus Glasses* on the phone. If the narrator isn't set up, the network drops, or the phone uses the offline device voice, the glasses use their own voice. Confirmation questions always use the glasses' own voice, so they are instant.

Nexus doesn't imitate or clone specific real people, celebrities and professional narrators included. Use a voice that its owner has published or licensed, a stock AI voice, or your own voice (`voice_clone_self`).

## Bluetooth, car, Android Auto and casting

The card is under *Settings → Bluetooth, car & casting*. Each feature also works by voice through the skills listed.

- **Bluetooth** (`bluetooth_devices`, `bluetooth_scan`, `bluetooth_pair`, `bluetooth_settings`, `audio_output`)
  - Shows your paired devices: speakers, headphones, cars and keyboards, and which are connected.
  - Scans for devices in pairing mode and pairs with them. Android shows its own PIN confirmation.
  - Shows where audio is playing and opens the media output switcher.
  - Android doesn't let apps connect, disconnect or forget audio devices. For those, Nexus opens Bluetooth settings.
- **Media over Bluetooth and in the car**
  - Nexus' player (audiobooks, narration, podcasts, spoken answers) is mirrored into Android's media session.
  - Over Bluetooth, the car or headphones show the title, and the steering-wheel or headset buttons (play/pause, next, previous) control Nexus.
  - Lock-screen controls work too.
- **2015 VW Passat:** most 2015 Passats, including US models, have no Android Auto. VW added App-Connect in the 2016 model year. Use Bluetooth: pair the phone with the car once, and Nexus audio plays through the car with track info on the display (if your radio shows it) and steering-wheel controls. Mirroring the phone screen onto the car display isn't possible without Android Auto.
- **Android Auto**
  - **Media app:** browse Audiobooks (continue listening or pick a chapter), Narrations, and **Ask Nexus**. Saying "play \<question\> on Nexus" asks the agent and reads the answer aloud.
  - **Messaging app:** Nexus messages are read aloud, and you can reply by voice. The agent answers in the same conversation. Press *Start car conversation*, or use `car_message`.
  - Apps that weren't installed from Google Play only appear after you enable **Unknown sources** in Android Auto's developer settings. Open Android Auto's settings and tap *Version* 10 times to unlock them.
  - Nexus must be running on the phone; it can stay in the background.
- **Casting to TVs and speakers** (`cast_devices`, `cast_media`, `cast_control`)
  - DLNA/UPnP smart TVs, speakers and receivers on your Wi-Fi play workspace videos, music, audiobooks and photos, or a media URL. That covers Samsung, LG, Sony, Panasonic, Philips and Roku TVs, Kodi, VLC and AV receivers.
  - Files are streamed from the phone through the local server, with seeking support.
  - You can play, pause, stop, seek, set the volume and check status.
  - Chromecast and Google TV use Google's own Cast protocol. Use screen mirroring for those.
- **Screen mirroring** (`screen_mirror`): opens the system Cast / Smart View panel to mirror the whole phone or glasses screen to a TV (Chromecast, Google TV, Miracast TVs, Fire TV). Existing external-display support (HUD) also shows on a mirrored display.

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
    ApkTools.java          installed apps, APK extract/inspect/install/uninstall, integration discovery
    AxmlParser.java        binary AndroidManifest.xml parser (components, intent filters, deep links)
    WebhookServer.java     LAN HTTP server: incoming webhooks, phone remote console, glasses client API, cast streams
    BluetoothTools.java    Bluetooth state, paired devices, scan, pairing, audio output
    NexusMediaService.java media session + MediaBrowserService (car/Bluetooth display & buttons, Android Auto media)
    CarMessaging.java      Android Auto conversation notifications with voice reply
    CastTools.java         DLNA/UPnP discovery (SSDP) and control (AVTransport, RenderingControl)
    ServerKeepAliveService.java  foreground service that keeps the server alive while glasses are served
  app/src/main/assets/
    index.html          core agent runtime and UI (providers, agents, modes, webhooks)
    js/skills-pro.js    files, coding, engineering, image, PDF, OCR, zip, video, maps, phone, translation skills
    js/skills-comms.js  email and calendar skills, CalDAV client, iCalendar parser/writer, account settings
    js/skills-media.js  scanner, Telegram, Kino, audiobooks, text-to-audio, glasses skills, Media tab, player, RayNeo agent
    js/skills-narrator.js  narration styles, ElevenLabs Voice Library narrator finder, narrator voice for replies
    js/skills-connect.js   Bluetooth, car media session sync, Android Auto browse + messaging, DLNA casting, screen mirroring
    js/skills-shop.js   wake word control, Amazon/Walmart shopping + list, Plex, fast food & delivery
    js/skills-screen.js screen-control skills, consent and sensitive-action guard, settings
    js/skills-music.js  Spotify, YouTube Music, media sessions, lyrics, display-glasses HUD, Meta glasses
    js/skills-google.js Google sign-in, Gmail, Calendar source, Drive, Docs, Sheets, Tasks, Contacts, Photos, YouTube, Maps, Translate
    js/skills-dev.js    APK services & app integrations, scraper, downloads, Python/code runner/templates/builds, GitHub
    js/skills-trust.js  Verizon Cloud, deepfake detection & provenance, consent-gated synthetic media of yourself
    js/skills-auto.js   AutoGPT: autonomous plan→act→review runs, budgets, scheduling, Auto tab, Agent Protocol client
    js/server-phone.js  phone server for Nexus Glasses: pairing, /client/* API, event stream, confirmations on the glasses
    hud.html            HUD shown on external display glasses
    lib/                bundled pdf.js, pdf-lib, Tesseract.js (+ English model): see THIRD_PARTY_LICENSES.txt
    remote.html         phone remote console
  shared/                 code used by both APKs (shared/rayneo.gradle)
    java/com/nexus/rayneo/GlassesDisplay.java  binocular mirror + temple touchpad gestures
    sdk/ | nosdk/          RayNeoSdk bridge: with / without the RayNeo Mercury SDK
  libs/rayneo/            place for the optional RayNeo SDK AAR (git-ignored)
  glasses/                Nexus Glasses client APK (com.nexus.agent.glasses)
    src/main/java/com/nexus/glasses/
      ClientActivity.java  WebView host, glasses keys (assistant/camera/menu/back), permissions
      ClientBridge.java    window.NexusClient: HTTP, mDNS discovery, TTS, speech, head gestures, storage
    src/main/assets/client.html  connect/pair screen and the glasses UI
.github/workflows/build-apk.yml
```
