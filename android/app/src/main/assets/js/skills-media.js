/* Nexus Agent — barcode/QR scanner, Telegram, Kino (movies & TV), audiobooks, text-to-audio
 * and native RayNeo X3 Pro glasses skills, plus the Media tab and player.
 * Loaded after skills-comms.js; shares the app globals. */
'use strict';
(() => {
  const P = (props, req = []) => ({ type: 'object', properties: props, required: req });
  const Str = d => ({ type: 'string', description: d });
  const Num = d => ({ type: 'number', description: d });
  const Bool = d => ({ type: 'boolean', description: d });
  const Arr = (d, items = { type: 'string' }) => ({ type: 'array', items, description: d });
  const J = o => JSON.stringify(o, null, 1);
  const slug = s => String(s || 'item').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48) || 'item';
  const mmss = t => { t = Math.max(0, Math.floor(t || 0)); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
  const getJSON = async (url, headers = {}, timeout = 30000) => { const r = await http('GET', url, { Accept: 'application/json', ...headers }, null, timeout); const d = parseJSON(r.body, null); if (r.status >= 400 || d == null) throw new Error(`HTTP ${r.status} from ${new URL(url).host}: ${clip(r.body, 160)}`); return d; };

  S.settings = {
    kinoRegion: ((navigator.language || 'en-US').split('-')[1] || 'US').toUpperCase(),
    ttsEngine: 'device', ttsProvider: 'openai', ttsModel: 'gpt-4o-mini-tts', ttsVoice: 'alloy', ttsDeviceVoice: '', ttsRateFile: 1.0,
    elevenVoice: '21m00Tcm4TlvDq8ikWAM', elevenModel: 'eleven_multilingual_v2', sttProvider: 'openai', sttModel: 'whisper-1',
    telegramBridge: false, telegramAgent: '', telegramPair: Math.random().toString(36).slice(2, 8).toUpperCase(),
    headConfirm: false, nodAxis: 'x', shakeAxis: 'y', announceNotifications: false, announceApps: '', readerWpm: 160,
    ...S.settings,
  };
  S.telegram = { allowed: [], known: {}, inbox: [], offset: 0, ...(S.telegram || {}) };
  S.audiobooks = S.audiobooks || [];
  S.flags = S.flags || {};

  /* ================================================================== native RayNeo agent preset */
  if (!S.flags.rayneoAgent) {
    S.flags.rayneoAgent = true;
    if (!S.agents.some(a => a.name === 'RayNeo')) {
      const claude = S.agents.find(a => a.providerId === 'anthropic') || S.agents[0];
      const rn = { id: uid(), name: 'RayNeo', providerId: claude.providerId, model: claude.model, temperature: 0.5, tools: true, skills: ['*'], council: false,
        system: 'You are the native assistant built into the user\'s RayNeo X3 Pro AR glasses. You see what the user sees (camera_photo, scan_code, camera_record_video), hear them by voice, and your words appear on a small see-through display and can be read aloud. ' +
          'You control the glasses (glasses_status, glasses_volume, glasses_brightness, media_control, glasses_settings), read their notifications, ask yes/no questions answered by nodding or shaking the head (ask_yes_no), and use every other skill group: web, maps, translation, OCR, email, calendar, Telegram, audiobooks, Kino, files and more. ' +
          'Keep answers to 1-3 short lines unless asked for more; lead with the answer. Prefer acting over explaining.' };
      S.agents.push(rn);
      let dev = {}; try { dev = N ? parseJSON(N.deviceInfo(), {}) : {}; } catch { /* ignore */ }
      if (/rayneo|ffalcon|tcl/i.test(`${dev.manufacturer} ${dev.model}`)) { S.current = rn.id; S.settings.glasses = true; }
    }
    save();
  }

  /* ================================================================== shared overlay helpers */
  function overlay(html, onClose) {
    const box = $('#modalBox'); box.innerHTML = html; $('#modal').classList.add('show');
    const close = () => { $('#modal').classList.remove('show'); modalClose = null; onClose && onClose(); };
    modalClose = close; return close;
  }
  async function cameraStream(withAudio) {
    needNative('Camera');
    if (!(await ensurePermission('android.permission.CAMERA'))) throw new Error('Camera permission denied');
    if (withAudio && !(await ensurePermission('android.permission.RECORD_AUDIO'))) withAudio = false;
    return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: !!withAudio });
  }

  /* ================================================================== barcode / QR */
  async function zx() { await loadScript('lib/zxing.min.js'); return window.ZXing; }
  async function decodeCanvas(c) {
    const Z = await zx();
    const g = c.getContext('2d', { willReadFrequently: true }); const d = g.getImageData(0, 0, c.width, c.height).data;
    const lum = new Uint8ClampedArray(c.width * c.height);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) lum[j] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    const hints = new Map(); hints.set(Z.DecodeHintType.TRY_HARDER, true);
    const reader = new Z.MultiFormatReader(); reader.setHints(hints);
    try {
      const r = reader.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.RGBLuminanceSource(lum, c.width, c.height))));
      return { text: r.getText(), format: Z.BarcodeFormat[r.getBarcodeFormat()] || String(r.getBarcodeFormat()) };
    } catch { return null; }
  }
  async function decodeImagePath(p) {
    const im = await imageFromPath(p);
    for (const scale of [1, 0.6, 1.6, 0.35]) {
      for (const rot of [0, 90]) {
        const w = im.naturalWidth * scale, h = im.naturalHeight * scale;
        const c = canvasOf(rot ? h : w, rot ? w : h); const g = c.getContext('2d');
        if (rot) { g.translate(c.width, 0); g.rotate(Math.PI / 2); }
        g.drawImage(im, 0, 0, w, h);
        const r = await decodeCanvas(c); if (r) return r;
      }
    }
    return null;
  }
  function scanLive(timeoutMs = 30000) {
    return new Promise(async (res, rej) => {
      let stream; try { stream = await cameraStream(false); } catch (e) { return rej(e); }
      let stopped = false, timer;
      const close = overlay(`<video id="scanVid" autoplay playsinline muted style="width:100%;max-height:62vh;border-radius:8px;background:#000"></video>
        <p class="hint" id="scanHint">Point at a QR code or barcode…</p><div class="row"><button id="scanNo">Cancel</button></div>`, () => { stopped = true; clearTimeout(timer); stream.getTracks().forEach(t => t.stop()); });
      const v = $('#scanVid'); v.srcObject = stream; $('#scanNo').onclick = () => { close(); res(null); }; $('#scanNo').focus();
      timer = setTimeout(() => { close(); res(null); }, timeoutMs);
      const c = document.createElement('canvas');
      const tick = async () => {
        if (stopped) return;
        if (v.videoWidth) {
          const k = Math.min(1, 960 / v.videoWidth); c.width = v.videoWidth * k; c.height = v.videoHeight * k;
          c.getContext('2d', { willReadFrequently: true }).drawImage(v, 0, 0, c.width, c.height);
          const r = await decodeCanvas(c);
          if (r) { if (N) N.vibrate(60); close(); return res(r); }
        }
        setTimeout(tick, 120);
      };
      tick();
    });
  }
  function describeCode(r) {
    const t = r.text; const out = { format: r.format, text: t };
    if (/^https?:\/\//i.test(t)) out.type = 'url';
    else if (/^WIFI:/i.test(t)) { out.type = 'wifi'; const g = k => { const v = (t.match(new RegExp(`[;:]${k}:((?:\\\\.|[^;])*)`, 'i')) || [])[1]; return v == null ? v : v.replace(/\\(.)/g, '$1'); }; out.wifi = { ssid: g('S'), security: g('T'), password: g('P'), hidden: g('H') === 'true' }; }
    else if (/^BEGIN:VCARD/i.test(t)) out.type = 'contact';
    else if (/^BEGIN:VEVENT|BEGIN:VCALENDAR/i.test(t)) out.type = 'event';
    else if (/^(mailto:|MATMSG:)/i.test(t)) out.type = 'email';
    else if (/^(tel:|sms:|smsto:)/i.test(t)) out.type = 'phone';
    else if (/^geo:/i.test(t)) out.type = 'location';
    else if (/^\d{8,14}$/.test(t)) out.type = 'product';
    else out.type = 'text';
    return out;
  }
  async function productLookup(code) {
    try {
      const d = await getJSON(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,brands,quantity,nutriscore_grade,nova_group,ecoscore_grade,ingredients_text,allergens_tags,categories,nutriments,image_front_small_url`);
      if (d.status === 1 && d.product) { const p = d.product; return { source: 'Open Food Facts', name: p.product_name, brand: p.brands, quantity: p.quantity, categories: p.categories, nutriscore: p.nutriscore_grade, nova: p.nova_group, ecoscore: p.ecoscore_grade, allergens: (p.allergens_tags || []).map(a => a.replace(/^en:/, '')), ingredients: clip(p.ingredients_text, 600), kcal_100g: p.nutriments && p.nutriments['energy-kcal_100g'], sugar_100g: p.nutriments && p.nutriments.sugars_100g }; }
    } catch { /* try next */ }
    try {
      const d = await getJSON(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`);
      const it = d.items && d.items[0]; if (it) return { source: 'UPCitemdb', name: it.title, brand: it.brand, category: it.category, description: clip(it.description, 400), lowest_price: it.lowest_recorded_price, offers: (it.offers || []).slice(0, 3).map(o => `${o.merchant}: ${o.price} ${o.currency || ''}`) };
    } catch { /* none */ }
    return { source: 'none', note: 'Product not found in Open Food Facts or UPCitemdb. Try web_search with the barcode.' };
  }
  async function qrToFile(text, size, output) {
    const Z = await zx(); const hints = new Map(); hints.set(Z.EncodeHintType.MARGIN, 2); hints.set(Z.EncodeHintType.ERROR_CORRECTION, Z.QRCodeDecoderErrorCorrectionLevel ? Z.QRCodeDecoderErrorCorrectionLevel.M : 'M');
    let m; try { m = new Z.QRCodeWriter().encode(text, Z.BarcodeFormat.QR_CODE, 0, 0, hints); } catch { m = new Z.QRCodeWriter().encode(text, Z.BarcodeFormat.QR_CODE, 0, 0, new Map()); }
    const n = m.getWidth(), px = Math.max(2, Math.floor((size || 600) / n)); const c = canvasOf(n * px, n * px); const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m.get(x, y)) g.fillRect(x * px, y * px, px, px);
    return fsx.writeBlob(uniquePath(output || `outputs/qr_${tsName()}.png`), await canvasToBlob(c, 'image/png'));
  }
  async function scanFlowUI() {
    try {
      const r = await scanLive(); if (!r) return;
      const d = describeCode(r);
      const actions = [d.type === 'url' ? `<button class="primary" data-a="open">Open link</button>` : '', d.type === 'product' ? `<button class="primary" data-a="product">Look up product</button>` : '', `<button data-a="ask">Ask agent</button>`, `<button data-a="share">Share</button>`, `<button data-a="close">Close</button>`].join('');
      overlay(`<h3>${esc(d.format)} · ${esc(d.type)}</h3><code class="block">${esc(d.text)}</code>${d.wifi ? `<p>Wi-Fi <b>${esc(d.wifi.ssid)}</b> · password <b>${esc(d.wifi.password || '(none)')}</b></p>` : ''}<div class="row" style="margin-top:.6em">${actions}</div><div id="scanOut" class="hint"></div>`);
      $$('#modalBox [data-a]').forEach(b => b.onclick = async () => {
        const a = b.dataset.a;
        if (a === 'open') { N ? N.openUrl(d.text) : window.open(d.text); modalClose && modalClose(); }
        if (a === 'product') { $('#scanOut').textContent = 'looking up…'; const p = await productLookup(d.text); $('#scanOut').innerHTML = `<code class="block">${esc(J(p))}</code>`; }
        if (a === 'ask') { modalClose && modalClose(); showTab('chat'); $('#input').value = `I scanned this ${d.format} code: ${d.text}\nWhat is it / what should I do with it?`; send(); }
        if (a === 'share') { N && N.shareText(d.text); }
        if (a === 'close') modalClose && modalClose();
      });
      $('#modalBox [data-a]').focus();
    } catch (e) { toast(e.message); }
  }

  /* ================================================================== text to audio */
  function ttsChunks(text, max) {
    const out = []; let cur = '';
    for (const sent of String(text).split(/(?<=[.!?…。！？\n])\s+/)) {
      if ((cur + ' ' + sent).length > max && cur) { out.push(cur); cur = ''; }
      let s = sent; while (s.length > max) { const cut = Math.max(s.lastIndexOf(' ', max), max / 2); out.push(s.slice(0, cut)); s = s.slice(cut).trim(); }
      cur = cur ? cur + ' ' + s : s;
    }
    if (cur.trim()) out.push(cur); return out;
  }
  async function concatFiles(paths, output) {
    const parts = []; let n = 0;
    for (const p of paths) { const b = await fsx.bytes(p); parts.push(b); n += b.length; }
    const all = new Uint8Array(n); let o = 0; for (const b of parts) { all.set(b, o); o += b.length; }
    const out = await fsx.writeBytes(output, all); for (const p of paths) if (p !== out) fsx.del(p); return out;
  }
  /** Synthesizes text to an audio file. engine: device (offline WAV) | provider (OpenAI/Venice-compatible MP3) | elevenlabs. */
  async function textToAudioFile(text, { engine, voice, output, onProgress } = {}) {
    engine = engine || S.settings.ttsEngine || 'device';
    text = plain(text); if (!text) throw new Error('No text to speak');
    needNative('Text to audio');
    if (engine === 'device') {
      const r = await nativeAsync('ttsToFile', JSON.stringify({ text, path: cleanPath(output || `audio/speech_${tsName()}.wav`).replace(/\.mp3$/i, '.wav'), voice: voice || S.settings.ttsDeviceVoice || '', rate: Number(S.settings.ttsRateFile) || 1, lang: S.settings.voiceLang || '' }));
      return { path: r.path, durationMs: r.durationMs, engine: 'device (offline)' };
    }
    const outPath = uniquePath(cleanPath(output || `audio/speech_${tsName()}.mp3`).replace(/\.wav$/i, '.mp3'));
    const chunks = ttsChunks(text, engine === 'elevenlabs' ? 2400 : 3800); const parts = [];
    for (let i = 0; i < chunks.length; i++) {
      const part = `${outPath}.part${i}`;
      if (engine === 'elevenlabs') {
        const key = getKey('svc_elevenlabs'); if (!key) throw new Error('Add an ElevenLabs API key in Settings → Media & audio');
        await nativeAsync('download', JSON.stringify({ url: `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice || S.settings.elevenVoice)}?output_format=mp3_44100_128`, method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' }, body: JSON.stringify({ text: chunks[i], model_id: S.settings.elevenModel }), path: part }));
      } else {
        const p = providerById(S.settings.ttsProvider); if (!p) throw new Error('Choose a TTS provider in Settings → Media & audio');
        await nativeAsync('download', JSON.stringify({ url: base(p) + '/audio/speech', method: 'POST', headers: { ...authHeaders(p, getKey(p.id)), 'Content-Type': 'application/json' }, body: JSON.stringify({ model: S.settings.ttsModel, voice: voice || S.settings.ttsVoice, input: chunks[i], response_format: 'mp3' }), path: part }));
      }
      parts.push(part); onProgress && onProgress(i + 1, chunks.length);
    }
    const path = parts.length === 1 ? fsx.move(parts[0], outPath) : await concatFiles(parts, outPath);
    return { path, engine: engine === 'elevenlabs' ? 'ElevenLabs' : providerById(S.settings.ttsProvider).name, chunks: chunks.length };
  }
  async function transcribe(path, language) {
    needNative('Transcription');
    const p = providerById(S.settings.sttProvider) || S.providers.find(x => x.id === 'openai');
    if (!p) throw new Error('Choose a speech-to-text provider (OpenAI or Groq) in Settings → Media & audio');
    const fields = { model: S.settings.sttModel || 'whisper-1', response_format: 'json' }; if (language) fields.language = language;
    const r = await nativeAsync('upload', JSON.stringify({ url: base(p) + '/audio/transcriptions', headers: authHeaders(p, getKey(p.id)), fields, files: [{ field: 'file', path: cleanPath(path) }] }));
    const d = parseJSON(r.body, {}); if (r.status >= 400) throw new Error(`Transcription HTTP ${r.status}: ${clip(r.body, 200)}`);
    return d.text || r.body;
  }

  /* ================================================================== player (audio + video) */
  const AP = new Audio(); AP.preload = 'metadata';
  let NOW = null; // {kind:'book'|'file', bookId, ch, title, sub}
  let sleepTimer = null;
  const mini = document.createElement('div');
  mini.id = 'mini';
  mini.style.cssText = 'display:none;align-items:center;gap:.4em;padding:.3em .6em;border-top:1px solid var(--line);background:var(--panel2);flex:none';
  mini.innerHTML = `<span id="miniT" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.85em"></span><span id="miniTime" class="hint"></span>
    <button class="small" id="miniPrev" title="Back 30s / previous chapter">⏮</button><button class="small" id="miniPlay">⏯</button><button class="small" id="miniNext" title="Next chapter">⏭</button><button class="small" id="miniRate">1×</button><button class="small" id="miniRead" title="Read along">📖</button><button class="small" id="miniX">✕</button>`;
  document.body.appendChild(mini);
  const book = id => S.audiobooks.find(b => b.id === id);
  function updateMini() {
    if (!NOW) { mini.style.display = 'none'; return; }
    mini.style.display = 'flex';
    $('#miniT').textContent = `${AP.paused ? '⏸' : '▶'} ${NOW.title}${NOW.sub ? ' · ' + NOW.sub : ''}`;
    $('#miniTime').textContent = `${mmss(AP.currentTime)} / ${mmss(AP.duration)}`;
    $('#miniRate').textContent = AP.playbackRate + '×';
    const b = NOW.bookId && book(NOW.bookId); $('#miniRead').style.display = b && b.chapters[NOW.ch] && b.chapters[NOW.ch].text ? '' : 'none';
  }
  let lastSave = 0;
  AP.addEventListener('timeupdate', () => {
    updateMini();
    if (NOW && NOW.bookId && Date.now() - lastSave > 5000) { const b = book(NOW.bookId); if (b) { b.pos = { ch: NOW.ch, t: AP.currentTime }; b.lastPlayed = Date.now(); save(); } lastSave = Date.now(); }
    if (readAlong) readAlong.sync();
  });
  const savePos = () => { if (NOW && NOW.bookId) { const b = book(NOW.bookId); if (b) { b.pos = { ch: NOW.ch, t: AP.currentTime }; b.lastPlayed = Date.now(); save(); } } };
  AP.addEventListener('play', updateMini); AP.addEventListener('pause', () => { savePos(); updateMini(); });
  AP.addEventListener('ended', () => { if (NOW && NOW.bookId) { const b = book(NOW.bookId); if (b && NOW.ch + 1 < b.chapters.length) playBook(b.id, NOW.ch + 1, 0); else { b && (b.pos = { ch: 0, t: 0, finished: true }); save(); updateMini(); } } });
  AP.addEventListener('error', () => { if (NOW) toast('Playback error: ' + (AP.error && AP.error.message || 'cannot play this source')); });
  function srcFor(ch) { return ch.path ? wsUrl(ch.path) : ch.url; }
  async function playBook(id, ch, t) {
    const b = book(id); if (!b) throw new Error('Audiobook not in library');
    if (ch == null) { ch = (b.pos && !b.pos.finished && b.pos.ch) || 0; t = (b.pos && !b.pos.finished && b.pos.t) || 0; }
    ch = Math.max(0, Math.min(b.chapters.length - 1, ch));
    NOW = { kind: 'book', bookId: id, ch, title: b.title, sub: `${ch + 1}/${b.chapters.length} ${b.chapters[ch].title || ''}` };
    b.pos = { ch, t: t || 0 };
    AP.src = srcFor(b.chapters[ch]); AP.playbackRate = b.rate || 1;
    await new Promise(r => { AP.onloadedmetadata = r; setTimeout(r, 4000); });
    if (t) AP.currentTime = t;
    await AP.play().catch(e => toast(e.message)); b.lastPlayed = Date.now(); save(); updateMini();
    return `Playing "${b.title}" chapter ${ch + 1}/${b.chapters.length}${t ? ' from ' + mmss(t) : ''}`;
  }
  async function playFile(src, title) { NOW = { kind: 'file', title: title || src.replace(/^.*\//, '') }; AP.src = src.startsWith('http') ? src : wsUrl(src); AP.playbackRate = 1; await AP.play(); updateMini(); return 'Playing ' + NOW.title; }
  function stopAudio() { AP.pause(); NOW = null; updateMini(); }
  $('#miniPlay').onclick = () => AP.paused ? AP.play() : AP.pause();
  $('#miniPrev').onclick = () => { if (AP.currentTime > 5 || !NOW.bookId) AP.currentTime = Math.max(0, AP.currentTime - 30); else playBook(NOW.bookId, NOW.ch - 1, 0); };
  $('#miniNext').onclick = () => { if (NOW && NOW.bookId) playBook(NOW.bookId, NOW.ch + 1, 0); else AP.currentTime += 30; };
  $('#miniRate').onclick = () => { const r = [1, 1.25, 1.5, 1.75, 2, 0.75]; AP.playbackRate = r[(r.indexOf(AP.playbackRate) + 1) % r.length]; if (NOW && NOW.bookId) { book(NOW.bookId).rate = AP.playbackRate; save(); } updateMini(); };
  $('#miniX').onclick = stopAudio;
  $('#miniRead').onclick = () => { const b = book(NOW.bookId); openReadAlong(b.chapters[NOW.ch].text, b.title); };
  onNative('hwkey', p => { if (p.key === 'media' && NOW) AP.paused ? AP.play() : AP.pause(); });

  let readAlong = null;
  function openReadAlong(text, title) {
    const close = overlay(`<h3>${esc(title || 'Reading')}</h3><div id="raBox" style="max-height:70vh;overflow-y:auto;font-size:1.15em;line-height:1.6;white-space:pre-wrap">${esc(text)}</div>`, () => { readAlong = null; });
    const box = $('#raBox');
    readAlong = { sync: () => { if (!AP.duration) return; const f = AP.currentTime / AP.duration; box.scrollTop = Math.max(0, f * box.scrollHeight - box.clientHeight * 0.35); } };
    readAlong.sync(); return close;
  }

  /** Teleprompter: auto-scrolls text at a words-per-minute pace (touchpad up/down = speed, tap = pause). */
  function teleprompter(text, wpm) {
    return new Promise(res => {
      let speed = Number(wpm) || Number(S.settings.readerWpm) || 160, paused = false, raf;
      const words = String(text).split(/\s+/).length;
      const close = overlay(`<div class="row"><span class="hint" id="tpInfo"></span><button class="small" id="tpPause">⏯</button><button class="small" id="tpX">✕</button></div>
        <div id="tpBox" style="height:72vh;overflow:hidden;font-size:1.5em;line-height:1.55;white-space:pre-wrap;padding-top:30vh">${esc(text)}<div style="height:60vh"></div></div>`, () => { cancelAnimationFrame(raf); document.removeEventListener('keydown', keys, true); res('teleprompter closed'); });
      const box = $('#tpBox'); let last = performance.now();
      const info = () => { $('#tpInfo').textContent = `${speed} wpm · ↑↓ speed · tap pause`; };
      const step = now => { const dt = (now - last) / 1000; last = now; if (!paused) { const total = box.scrollHeight - box.clientHeight; box.scrollTop += total / (words / speed * 60) * dt; } raf = requestAnimationFrame(step); };
      const keys = e => { if (e.key === 'ArrowUp') { speed = Math.min(400, speed + 20); info(); e.preventDefault(); e.stopPropagation(); } if (e.key === 'ArrowDown') { speed = Math.max(40, speed - 20); info(); e.preventDefault(); e.stopPropagation(); } if (e.key === 'Enter') { paused = !paused; e.preventDefault(); e.stopPropagation(); } };
      document.addEventListener('keydown', keys, true);
      $('#tpPause').onclick = () => paused = !paused; $('#tpX').onclick = close; info(); raf = requestAnimationFrame(step);
    });
  }

  /** Reads text aloud sentence by sentence with the device voice, highlighting and scrolling. */
  function readAloud(text, title) {
    return new Promise(async res => {
      const sents = String(text).split(/(?<=[.!?…。！？\n])\s+/).filter(s => s.trim()); let i = 0, stopped = false;
      const close = overlay(`<div class="row"><b style="flex:1">${esc(title || 'Read aloud')}</b><button class="small" id="raX">■ Stop</button></div><div id="raBox2" style="max-height:72vh;overflow-y:auto;font-size:1.2em;line-height:1.6">${sents.map((s, k) => `<span data-s="${k}">${esc(s)} </span>`).join('')}</div>`, () => { stopped = true; stopSpeaking(); res(`read ${i} of ${sents.length} sentences`); });
      $('#raX').onclick = close;
      const say = s => new Promise(r => {
        if (N) { let started = false; const h = p => { if (p.speaking) started = true; else if (started) { eventHandlers.tts_state = (eventHandlers.tts_state || []).filter(x => x !== h); r(); } }; onNative('tts_state', h); N.speak(s, Number(S.settings.ttsRate) || 1); setTimeout(() => { eventHandlers.tts_state = (eventHandlers.tts_state || []).filter(x => x !== h); r(); }, 2000 + s.length * 120); }
        else if (window.speechSynthesis) { const u = new SpeechSynthesisUtterance(s); u.rate = Number(S.settings.ttsRate) || 1; u.onend = r; u.onerror = r; speechSynthesis.speak(u); } else setTimeout(r, s.length * 60);
      });
      for (; i < sents.length && !stopped; i++) {
        $$('#raBox2 span').forEach(sp => sp.style.color = ''); const cur = $(`#raBox2 [data-s="${i}"]`); if (cur) { cur.style.color = 'var(--accent)'; cur.scrollIntoView({ block: 'center' }); }
        await say(sents[i]);
      }
      if (!stopped) close();
    });
  }

  /* ================================================================== video player (Kino) */
  function playVideo(src, title) {
    return new Promise(res => {
      const url = /^https?:/.test(src) ? src : wsUrl(src);
      const close = overlay(`<div class="row"><b style="flex:1">${esc(title || 'Video')}</b><button class="small" id="vpX">✕</button></div><video id="vp" src="${esc(url)}" controls autoplay playsinline style="width:100%;max-height:78vh;background:#000;border-radius:8px"></video><p class="hint">Tap: play/pause · ←/→ seek 10 s · back: close</p>`, () => { const v = $('#vp'); if (v) v.pause(); document.removeEventListener('keydown', keys, true); res('closed'); });
      const v = $('#vp');
      const keys = e => { if (!$('#vp')) return; if (e.key === 'ArrowRight') { v.currentTime += 10; e.preventDefault(); e.stopPropagation(); } if (e.key === 'ArrowLeft') { v.currentTime -= 10; e.preventDefault(); e.stopPropagation(); } if (e.key === 'Enter') { v.paused ? v.play() : v.pause(); e.preventDefault(); e.stopPropagation(); } };
      document.addEventListener('keydown', keys, true); $('#vpX').onclick = close; v.onerror = () => toast('Cannot play this video here');
    });
  }

  /* ================================================================== Kino (movies & TV) */
  const tmdbKey = () => getKey('svc_tmdb');
  async function tmdb(path, params = {}) {
    const k = tmdbKey(); const q = new URLSearchParams({ language: navigator.language || 'en-US', ...params });
    const headers = {}; if (/^eyJ/.test(k)) headers.Authorization = 'Bearer ' + k; else q.set('api_key', k);
    return getJSON(`https://api.themoviedb.org/3${path}?${q}`, headers);
  }
  const tmdbImg = (p, w = 'w342') => p ? `https://image.tmdb.org/t/p/${w}${p}` : '';
  const fromTmdb = (x, type) => ({ id: `tmdb:${x.media_type || type}:${x.id}`, type: x.media_type || type, title: x.title || x.name, year: String(x.release_date || x.first_air_date || '').slice(0, 4), rating: x.vote_average ? Math.round(x.vote_average * 10) / 10 : null, overview: x.overview, poster: tmdbImg(x.poster_path) });
  async function kinoSearch(query, type = 'any', year) {
    if (tmdbKey()) {
      const d = await tmdb(type === 'any' ? '/search/multi' : `/search/${type === 'tv' ? 'tv' : 'movie'}`, { query, ...(year ? { year } : {}) });
      return d.results.filter(x => x.media_type !== 'person').slice(0, 12).map(x => fromTmdb(x, type === 'tv' ? 'tv' : 'movie'));
    }
    const out = [];
    if (type !== 'tv') { const d = await getJSON(`https://itunes.apple.com/search?media=movie&limit=10&term=${encodeURIComponent(query)}`).catch(() => ({ results: [] })); out.push(...d.results.filter(r => !year || String(r.releaseDate).startsWith(year)).map(r => ({ id: `itunes:${r.trackId}`, type: 'movie', title: r.trackName, year: String(r.releaseDate || '').slice(0, 4), rating: r.contentAdvisoryRating, overview: r.longDescription || r.shortDescription, poster: (r.artworkUrl100 || '').replace('100x100', '300x450'), trailer: r.previewUrl, genre: r.primaryGenreName, director: r.artistName }))); }
    if (type !== 'movie') { const d = await getJSON(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`).catch(() => []); out.push(...d.slice(0, 8).map(({ show: s }) => ({ id: `tvmaze:${s.id}`, type: 'tv', title: s.name, year: String(s.premiered || '').slice(0, 4), rating: s.rating && s.rating.average, overview: htmlToText(s.summary || ''), poster: s.image && s.image.medium, genre: (s.genres || []).join(', '), network: (s.network || s.webChannel || {}).name, status: s.status }))); }
    return out;
  }
  async function kinoTrending(type = 'movie', period = 'week') {
    if (tmdbKey()) return (await tmdb(`/trending/${type === 'tv' ? 'tv' : type === 'any' ? 'all' : 'movie'}/${period === 'day' ? 'day' : 'week'}`)).results.slice(0, 20).map(x => fromTmdb(x, type === 'tv' ? 'tv' : 'movie'));
    if (type === 'tv') {
      const d = await getJSON(`https://api.tvmaze.com/schedule/web?date=${new Date().toISOString().slice(0, 10)}`).catch(() => []);
      const seen = new Set(); return d.map(e => e._embedded && e._embedded.show).filter(s => s && !seen.has(s.id) && seen.add(s.id)).sort((a, b) => ((b.weight || 0) - (a.weight || 0))).slice(0, 20).map(s => ({ id: `tvmaze:${s.id}`, type: 'tv', title: s.name, year: String(s.premiered || '').slice(0, 4), rating: s.rating && s.rating.average, overview: htmlToText(s.summary || ''), poster: s.image && s.image.medium, network: (s.webChannel || s.network || {}).name }));
    }
    const d = await getJSON(`https://itunes.apple.com/${(S.settings.kinoRegion || 'us').toLowerCase()}/rss/topmovies/limit=20/json`).catch(() => null);
    if (!d || !d.feed) throw new Error('Trending movies need a TMDB key (Settings → Media & audio); TV trending works without one.');
    return d.feed.entry.map(e => ({ id: `itunes:${e.id.attributes['im:id']}`, type: 'movie', title: e['im:name'].label, year: String((e['im:releaseDate'] || {}).label || '').slice(0, 4), overview: (e.summary || {}).label, poster: (e['im:image'] || []).slice(-1)[0] && e['im:image'].slice(-1)[0].label.replace(/\d+x\d+/, '300x450'), genre: e.category && e.category.attributes.label, trailer: (e.link || []).find && ((e.link.find(l => l.attributes && l.attributes['im:assetType'] === 'preview') || {}).attributes || {}).href }));
  }
  async function kinoDetails(id) {
    const [src, a, b] = String(id).split(':');
    if (src === 'tmdb') {
      const type = a, tid = b;
      const d = await tmdb(`/${type}/${tid}`, { append_to_response: 'credits,videos,watch/providers' });
      const trailer = (d.videos && d.videos.results || []).find(v => v.site === 'YouTube' && /trailer/i.test(v.type)) || (d.videos && d.videos.results || [])[0];
      const wp = d['watch/providers'] && d['watch/providers'].results && d['watch/providers'].results[S.settings.kinoRegion];
      return { id, type, title: d.title || d.name, tagline: d.tagline, year: String(d.release_date || d.first_air_date || '').slice(0, 4), runtime: d.runtime || (d.episode_run_time || [])[0], seasons: d.number_of_seasons, status: d.status, rating: d.vote_average, votes: d.vote_count, genres: (d.genres || []).map(g => g.name).join(', '), overview: d.overview, director: ((d.credits || {}).crew || []).filter(c => c.job === 'Director').map(c => c.name).join(', ') || (d.created_by || []).map(c => c.name).join(', '), cast: ((d.credits || {}).cast || []).slice(0, 8).map(c => `${c.name} (${c.character})`), trailer: trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null, poster: tmdbImg(d.poster_path, 'w500'), where_to_watch: wp ? { stream: (wp.flatrate || []).map(p => p.provider_name), rent: (wp.rent || []).map(p => p.provider_name), buy: (wp.buy || []).map(p => p.provider_name), link: wp.link } : 'no data for ' + S.settings.kinoRegion };
    }
    if (src === 'itunes') { const d = await getJSON(`https://itunes.apple.com/lookup?id=${a}&country=${S.settings.kinoRegion}`); const r = d.results[0]; if (!r) throw new Error('not found'); return { id, type: 'movie', title: r.trackName, year: String(r.releaseDate || '').slice(0, 4), genre: r.primaryGenreName, rated: r.contentAdvisoryRating, director: r.artistName, runtime_min: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 60000) : null, overview: r.longDescription, trailer: r.previewUrl, buy_or_rent: `Apple TV: ${r.trackViewUrl}`, price: r.trackPrice ? `${r.trackPrice} ${r.currency}` : null, poster: (r.artworkUrl100 || '').replace('100x100', '600x900') }; }
    if (src === 'tvmaze') { const s = await getJSON(`https://api.tvmaze.com/shows/${a}?embed[]=cast&embed[]=nextepisode&embed[]=previousepisode`); const e = s._embedded || {}; return { id, type: 'tv', title: s.name, year: String(s.premiered || '').slice(0, 4), status: s.status, genres: (s.genres || []).join(', '), rating: s.rating && s.rating.average, network: (s.network || s.webChannel || {}).name, schedule: s.schedule && `${(s.schedule.days || []).join(', ')} ${s.schedule.time || ''}`, overview: htmlToText(s.summary || ''), cast: (e.cast || []).slice(0, 8).map(c => `${c.person.name} (${c.character.name})`), next_episode: e.nextepisode ? `S${e.nextepisode.season}E${e.nextepisode.number} "${e.nextepisode.name}" on ${e.nextepisode.airdate}` : null, last_episode: e.previousepisode ? `S${e.previousepisode.season}E${e.previousepisode.number} "${e.previousepisode.name}" (${e.previousepisode.airdate})` : null, official_site: s.officialSite, poster: s.image && s.image.original }; }
    throw new Error('Unknown id format: ' + id);
  }
  async function openTrailer(d) {
    if (!d.trailer) return 'No trailer found.';
    if (/youtube\.com|youtu\.be/.test(d.trailer)) { N ? N.openUrl(d.trailer) : window.open(d.trailer); return 'Opened trailer on YouTube: ' + d.trailer; }
    playVideo(d.trailer, d.title + ' — trailer'); return 'Playing trailer in the app.';
  }

  /* ================================================================== audiobooks */
  async function archiveSearch(query, limit = 10) {
    const q = `collection:(librivoxaudio) AND (title:(${query}) OR creator:(${query}))`;
    const d = await getJSON(`https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=runtime&fl[]=language&fl[]=downloads&sort[]=downloads+desc&rows=${limit}&output=json`);
    return d.response.docs.map(x => ({ id: 'ia:' + x.identifier, title: x.title, author: [].concat(x.creator || []).join(', '), runtime: x.runtime, language: x.language, downloads: x.downloads }));
  }
  async function archiveBook(identifier) {
    const d = await getJSON(`https://archive.org/metadata/${encodeURIComponent(identifier)}`);
    const files = (d.files || []).filter(f => /\.mp3$/i.test(f.name) && (/64kb/i.test(f.name) || f.format === '64Kbps MP3' || f.format === 'VBR MP3'));
    const pick = files.some(f => /64kb/i.test(f.name)) ? files.filter(f => /64kb/i.test(f.name)) : files;
    pick.sort((a, b) => (Number(a.track) || 0) - (Number(b.track) || 0) || a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (!pick.length) throw new Error('No MP3 files in this item');
    const md = d.metadata || {};
    return { id: 'ia:' + identifier, title: [].concat(md.title)[0] || identifier, author: [].concat(md.creator || []).join(', '), source: 'LibriVox / Internet Archive (public domain)', description: htmlToText(String([].concat(md.description || '')[0] || '')).slice(0, 600), chapters: pick.map(f => ({ title: f.title || f.name.replace(/_64kb\.mp3$|\.mp3$/i, ''), url: `https://archive.org/download/${identifier}/${encodeURIComponent(f.name).replace(/%2F/g, '/')}`, duration: Number(f.length) || null })) };
  }
  function addBook(b) { const ex = book(b.id); if (ex) return ex; const nb = { ...b, pos: { ch: 0, t: 0 }, rate: 1, added: Date.now() }; S.audiobooks.unshift(nb); save(); return nb; }
  function findBook(ref) {
    if (!ref) return S.audiobooks.slice().sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0))[0];
    const r = String(ref).toLowerCase(); return book(ref) || S.audiobooks.find(b => b.title.toLowerCase() === r) || S.audiobooks.find(b => (b.title + ' ' + b.author).toLowerCase().includes(r));
  }
  async function epubChapters(path) {
    const dest = `tmp/epub_${slug(stemOf(path))}_${Date.now()}`;
    await nativeAsync('zip', JSON.stringify({ op: 'extract', path: cleanPath(path), dest }));
    const xml = t => new DOMParser().parseFromString(t, 'application/xml');
    const cont = xml(await fsx.readText(`${dest}/META-INF/container.xml`));
    const opfPath = cont.getElementsByTagNameNS('*', 'rootfile')[0].getAttribute('full-path'); const opfDir = opfPath.includes('/') ? opfPath.replace(/\/[^/]*$/, '/') : '';
    const opf = xml(await fsx.readText(`${dest}/${opfPath}`));
    const items = Object.fromEntries(Array.from(opf.getElementsByTagNameNS('*', 'item')).map(i => [i.getAttribute('id'), i.getAttribute('href')]));
    const title = (opf.getElementsByTagNameNS('*', 'title')[0] || {}).textContent || stemOf(path);
    const author = (opf.getElementsByTagNameNS('*', 'creator')[0] || {}).textContent || '';
    const chapters = [];
    for (const ref of Array.from(opf.getElementsByTagNameNS('*', 'itemref'))) {
      const href = items[ref.getAttribute('idref')]; if (!href) continue;
      const doc = new DOMParser().parseFromString(await fsx.readText(`${dest}/${opfDir}${decodeURIComponent(href)}`), 'text/html');
      const text = htmlToText(doc.body ? doc.body.innerHTML : ''); if (text.length < 200) continue;
      const h = doc.querySelector('h1,h2,h3,title'); chapters.push({ title: h ? h.textContent.trim().slice(0, 80) : `Chapter ${chapters.length + 1}`, text });
    }
    fsx.del(dest);
    return { title: title.trim(), author: author.trim(), chapters };
  }
  async function textChapters(text, title) {
    const parts = String(text).split(/\n(?=\s*(?:chapter|kapitel|chapitre|cap[ií]tulo|part|book)\s+[\divxlc]+\b[^\n]*\n)/i).map(t => t.trim()).filter(t => t.length > 50);
    let ch = parts.length > 1 ? parts : [];
    if (!ch.length) { const words = String(text).split(/(?<=\n\n)/); let cur = ''; for (const w of words) { if (cur.length + w.length > 12000 && cur) { ch.push(cur); cur = ''; } cur += w; } if (cur.trim()) ch.push(cur); }
    return { title, chapters: ch.map((t, i) => ({ title: (t.split('\n')[0].length < 80 && parts.length > 1) ? t.split('\n')[0].trim() : `Part ${i + 1}`, text: t })) };
  }

  /* ================================================================== Telegram */
  const tgToken = () => getKey('svc_telegram');
  async function tg(method, params = {}, timeout = 30000) {
    const t = tgToken(); if (!t) throw new Error('Add a Telegram bot token (from @BotFather) in Settings → Telegram');
    const r = await http('POST', `https://api.telegram.org/bot${t}/${method}`, { 'Content-Type': 'application/json' }, JSON.stringify(params), timeout);
    const d = parseJSON(r.body, {}); if (!d.ok) throw new Error(`Telegram ${method}: ${d.description || 'HTTP ' + r.status}`); return d.result;
  }
  function tgRemember(m) {
    const c = m.chat; S.telegram.known[c.id] = { id: c.id, title: c.title || [c.first_name, c.last_name].filter(Boolean).join(' '), username: c.username || '', type: c.type };
    S.telegram.inbox.unshift({ chat: c.id, from: (m.from && (m.from.username ? '@' + m.from.username : m.from.first_name)) || '', text: m.text || m.caption || (m.photo ? '[photo]' : m.voice ? '[voice message]' : m.document ? `[file ${m.document.file_name}]` : '[message]'), date: m.date * 1000, id: m.message_id });
    S.telegram.inbox = S.telegram.inbox.slice(0, 200); save();
  }
  function tgChat(ref) {
    if (ref == null || ref === '') { const ids = S.telegram.allowed.length ? S.telegram.allowed : Object.keys(S.telegram.known); if (ids.length === 1) return ids[0]; throw new Error('Which chat? Known chats: ' + (Object.values(S.telegram.known).map(c => `${c.title}${c.username ? ' @' + c.username : ''} (${c.id})`).join(', ') || 'none yet — message your bot first')); }
    const r = String(ref).trim(); if (/^-?\d+$/.test(r) || r.startsWith('@')) { const k = Object.values(S.telegram.known).find(c => '@' + c.username === r); return k ? k.id : r; }
    const k = Object.values(S.telegram.known).find(c => c.title.toLowerCase().includes(r.toLowerCase()) || c.username.toLowerCase() === r.toLowerCase().replace(/^@/, ''));
    if (!k) throw new Error(`Unknown chat "${ref}". Known: ${Object.values(S.telegram.known).map(c => c.title).join(', ') || 'none'}`); return k.id;
  }
  async function tgFetchUpdates(timeoutS = 0) {
    const ups = await tg('getUpdates', { offset: S.telegram.offset || 0, timeout: timeoutS, allowed_updates: ['message'] }, (timeoutS + 15) * 1000);
    for (const u of ups) { S.telegram.offset = u.update_id + 1; if (u.message) tgRemember(u.message); }
    save(); return ups.map(u => u.message).filter(Boolean);
  }
  async function tgDownloadFile(fileId, path) { const f = await tg('getFile', { file_id: fileId }); return (await nativeAsync('download', JSON.stringify({ url: `https://api.telegram.org/file/bot${tgToken()}/${f.file_path}`, path }))).path; }
  async function tgSendLong(chat, text) { const t = String(text || '(empty)'); for (let i = 0; i < t.length; i += 4000) await tg('sendMessage', { chat_id: chat, text: t.slice(i, i + 4000) }); }
  async function tgHandle(m) {
    const chat = m.chat.id; const text = (m.text || m.caption || '').trim();
    const pair = text.match(/^\/(?:start|pair)\s+([A-Z0-9]{4,12})$/i);
    if (pair) { if (pair[1].toUpperCase() === S.settings.telegramPair) { if (!S.telegram.allowed.includes(String(chat))) S.telegram.allowed.push(String(chat)); save(); await tg('sendMessage', { chat_id: chat, text: '✅ Paired with Nexus Agent. Send me anything.' }); toast('Telegram chat paired'); } else await tg('sendMessage', { chat_id: chat, text: 'Wrong pairing code.' }); return; }
    if (!S.telegram.allowed.includes(String(chat))) { if (/^\/start/.test(text)) await tg('sendMessage', { chat_id: chat, text: 'Send /pair <code> — the code is shown in Nexus Agent → Settings → Telegram.' }); return; }
    const attachments = []; let prompt = text;
    try {
      if (m.photo) attachments.push(await tgDownloadFile(m.photo[m.photo.length - 1].file_id, `telegram/photo_${m.message_id}.jpg`));
      if (m.document) attachments.push(await tgDownloadFile(m.document.file_id, `telegram/${m.document.file_name || 'file_' + m.message_id}`));
      if (m.voice || m.audio) { const p = await tgDownloadFile((m.voice || m.audio).file_id, `telegram/voice_${m.message_id}.${m.voice ? 'ogg' : 'mp3'}`); try { prompt = (prompt ? prompt + '\n' : '') + await transcribe(p); } catch (e) { attachments.push(p); prompt = prompt || `Voice message saved to ${p} (transcription unavailable: ${e.message})`; } }
    } catch (e) { prompt += `\n(attachment failed: ${e.message})`; }
    if (!prompt && !attachments.length) return;
    await tg('sendChatAction', { chat_id: chat, action: 'typing' }).catch(() => {});
    const agent = agentById(S.settings.telegramAgent) || agentById(S.current) || S.agents[0];
    try { const r = await dispatch(prompt || 'Please look at the attached file.', { agentId: agent.id, mode: 'solo', origin: 'telegram', attachments, showInChat: true }); await tgSendLong(chat, stripThink(r.text)); }
    catch (e) { await tgSendLong(chat, '⚠️ ' + e.message); }
  }
  let tgLoopRunning = false;
  async function tgLoop() {
    if (tgLoopRunning) return; tgLoopRunning = true;
    try { await tg('deleteWebhook', {}); } catch { /* ignore */ }
    while (S.settings.telegramBridge && tgToken()) {
      try { for (const m of await tgFetchUpdates(25)) await tgHandle(m); }
      catch (e) { console.warn('telegram', e.message); await sleep(5000); }
    }
    tgLoopRunning = false;
  }
  setTimeout(() => { if (S.settings.telegramBridge) tgLoop(); }, 1500);

  /* ================================================================== glasses helpers */
  async function headGesture(timeoutMs) { needNative('Head gestures'); const r = await nativeAsync('headGesture', timeoutMs); return r.axis === S.settings.nodAxis ? 'nod' : r.axis === S.settings.shakeAxis ? 'shake' : r.axis === 'none' ? 'none' : 'unclear (' + r.axis + ')'; }
  function askYesNo(question, timeoutS = 15) {
    return new Promise(async res => {
      let done = false; const finish = v => { if (done) return; done = true; modalClose && modalClose(); res(v); };
      overlay(`<h3>${esc(question)}</h3><p class="hint">Nod for <b>yes</b>, shake your head for <b>no</b> — or tap.</p><div class="row"><button class="primary" id="ynY">Yes</button><button id="ynN">No</button></div>`, () => finish('no answer'));
      $('#ynY').onclick = () => finish('yes'); $('#ynN').onclick = () => finish('no'); $('#ynY').focus();
      speak(question);
      const until = Date.now() + timeoutS * 1000;
      while (!done && Date.now() < until && N) { const g = await headGesture(Math.min(5000, until - Date.now())).catch(() => 'none'); if (g === 'nod') finish('yes'); else if (g === 'shake') finish('no'); }
      finish('no answer');
    });
  }
  // Optional: confirm risky actions by nodding / shaking.
  {
    const coreConfirm = confirmBox;
    confirmBox = (html, timeoutMs) => {
      const p = coreConfirm(html + (S.settings.headConfirm && N ? '<p class="hint">Nod to allow · shake to deny</p>' : ''), timeoutMs);
      if (S.settings.headConfirm && N) (async () => { const until = Date.now() + (timeoutMs || 30000); while ($('#modal').classList.contains('show') && $('#mOk') && Date.now() < until) { const g = await headGesture(4000).catch(() => 'none'); if (!$('#mOk')) break; if (g === 'nod') { $('#mOk').click(); break; } if (g === 'shake') { $('#mNo').click(); break; } } })();
      return p;
    };
  }
  onNative('notification', n => {
    if (!S.settings.announceNotifications) return;
    const apps = String(S.settings.announceApps || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
    if (apps.length && !apps.some(a => n.app.toLowerCase().includes(a) || n.package.toLowerCase().includes(a))) return;
    addMsg({ role: 'system', content: `🔔 ${n.app}: ${n.title}${n.text ? ' — ' + clip(n.text, 200) : ''}`, ts: Date.now() });
    speak(`${n.app}. ${n.title}. ${clip(n.text, 160)}`);
  });
  function recordVideo(seconds = 10, audio = true, path) {
    return new Promise(async (res, rej) => {
      let stream; try { stream = await cameraStream(audio); } catch (e) { return rej(e); }
      const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
      if (!mime) { stream.getTracks().forEach(t => t.stop()); return rej(new Error('Video recording not supported by this WebView')); }
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2.5e6 }); const chunks = [];
      let left = Math.max(1, Math.min(300, Number(seconds) || 10)), timer, cancelled = false;
      const close = overlay(`<video id="recVid" autoplay playsinline muted style="width:100%;max-height:62vh;border-radius:8px"></video><div class="row"><span id="recInfo" style="color:var(--bad)">● REC</span><button id="recStop">■ Stop</button><button id="recNo">Cancel</button></div>`, () => { clearInterval(timer); if (rec.state !== 'inactive') rec.stop(); });
      $('#recVid').srcObject = stream;
      rec.ondataavailable = e => e.data.size && chunks.push(e.data);
      rec.onstop = async () => { stream.getTracks().forEach(t => t.stop()); if (cancelled) return rej(new Error('cancelled')); try { const blob = new Blob(chunks, { type: mime.split(';')[0] }); res(await fsx.writeBlob(uniquePath(path || `recordings/video_${tsName()}.${mime.includes('mp4') ? 'mp4' : 'webm'}`), blob)); } catch (e) { rej(e); } };
      $('#recStop').onclick = () => close(); $('#recNo').onclick = () => { cancelled = true; close(); };
      rec.start(1000);
      const info = () => $('#recInfo') && ($('#recInfo').textContent = `● REC ${left}s`); info();
      timer = setInterval(() => { left--; info(); if (left <= 0) close(); }, 1000);
    });
  }

  /* ================================================================== skills */
  BUILTIN_SKILLS.push(
    /* ---------------- Scanner */
    { name: 'scan_code', group: 'Scanner', description: 'Scan a QR code or barcode (EAN/UPC, Code 128/39, ITF, Data Matrix, PDF417, Aztec) with the live camera, or decode one from a workspace image. Returns the content and its type (URL, Wi-Fi, contact, product…).', parameters: P({ path: Str('optional image path; omit to use the camera'), timeout_s: Num('camera timeout, default 30') }),
      run: async a => { const r = a.path ? await decodeImagePath(a.path) : await scanLive((a.timeout_s || 30) * 1000); return r ? J(describeCode(r)) : 'No code found.'; } },
    { name: 'qr_generate', group: 'Scanner', description: 'Create a QR code image (link, text, contact, Wi-Fi login). For Wi-Fi give wifi_ssid/wifi_password.', parameters: P({ text: Str('content to encode'), wifi_ssid: Str('optional Wi-Fi network name'), wifi_password: Str('optional'), wifi_security: Str('WPA | WEP | nopass'), size: Num('pixels, default 600'), output: Str('optional .png path') }),
      run: async a => { const esc2 = v => String(v || '').replace(/([\\;,:"])/g, '\\$1'); const text = a.wifi_ssid ? `WIFI:T:${a.wifi_security || 'WPA'};S:${esc2(a.wifi_ssid)};P:${esc2(a.wifi_password)};;` : a.text; if (!text) throw new Error('text or wifi_ssid required'); return 'saved ' + await qrToFile(text, a.size, a.output); } },
    { name: 'product_lookup', group: 'Scanner', description: 'Look up a product by barcode (EAN/UPC): name, brand, nutrition score, ingredients, allergens, prices.', parameters: P({ barcode: Str('digits') }, ['barcode']),
      run: async a => J(await productLookup(String(a.barcode).replace(/\D/g, ''))) },

    /* ---------------- Telegram */
    { name: 'telegram_send', group: 'Telegram', risky: true, description: 'Send a Telegram message through your bot to a chat (user who started the bot, or a group the bot is in).', parameters: P({ chat: Str('chat id, @username or name of a known chat'), text: Str('message'), silent: Bool('no notification sound') }, ['text']),
      run: async a => { const id = tgChat(a.chat); await tgSendLong(id, a.text); return 'sent to ' + ((S.telegram.known[id] || {}).title || id); } },
    { name: 'telegram_send_file', group: 'Telegram', risky: true, description: 'Send a workspace file to a Telegram chat (photo, video, audio, PDF, any document).', parameters: P({ chat: Str('chat'), path: Str('workspace file'), caption: Str('optional caption') }, ['path']),
      run: async a => {
        needNative('Telegram files'); const id = tgChat(a.chat); const p = cleanPath(a.path); const e = extOf(p);
        const [method, field] = isImagePath(p) && e !== 'gif' ? ['sendPhoto', 'photo'] : /^(mp4|mov)$/.test(e) ? ['sendVideo', 'video'] : /^(mp3|m4a|m4b|wav|ogg|flac|aac)$/.test(e) ? ['sendAudio', 'audio'] : ['sendDocument', 'document'];
        const r = await nativeAsync('upload', JSON.stringify({ url: `https://api.telegram.org/bot${tgToken()}/${method}`, fields: { chat_id: String(id), ...(a.caption ? { caption: a.caption } : {}) }, files: [{ field, path: p }] }));
        const d = parseJSON(r.body, {}); if (!d.ok) throw new Error('Telegram: ' + (d.description || r.status)); return `sent ${p} (${method})`;
      } },
    { name: 'telegram_read', group: 'Telegram', description: 'Read recent Telegram messages sent to your bot (fetches new ones).', parameters: P({ chat: Str('optional chat filter'), limit: Num('default 15') }),
      run: async a => { if (!S.settings.telegramBridge) await tgFetchUpdates(0); let msgs = S.telegram.inbox; if (a.chat) { const id = String(tgChat(a.chat)); msgs = msgs.filter(m => String(m.chat) === id); } return msgs.slice(0, a.limit || 15).map(m => `${fmtMailDate(m.date)} · ${(S.telegram.known[m.chat] || {}).title || m.chat} · ${m.from}: ${m.text}`).join('\n') || 'No messages yet. (Users must message your bot first.)'; } },
    { name: 'telegram_chats', group: 'Telegram', description: 'List Telegram chats your bot knows (people who messaged it, groups) and which are paired.', parameters: P({}),
      run: async () => { if (!S.settings.telegramBridge) await tgFetchUpdates(0).catch(() => {}); return Object.values(S.telegram.known).map(c => `${c.title}${c.username ? ' @' + c.username : ''} · ${c.type} · id ${c.id}${S.telegram.allowed.includes(String(c.id)) ? ' · paired ✓' : ''}`).join('\n') || 'No chats yet — open your bot in Telegram and send /start.'; } },

    /* ---------------- Kino */
    { name: 'kino_search', group: 'Kino', description: 'Search movies and TV shows (TMDB with a key; otherwise Apple iTunes for movies + TVmaze for TV). Returns ids for kino_details.', parameters: P({ query: Str('title or keywords'), type: Str('movie | tv | any'), year: Str('optional') }, ['query']),
      run: async a => { const r = await kinoSearch(a.query, a.type || 'any', a.year); return r.length ? r.map(x => `• ${x.title} (${x.year || '?'}) · ${x.type}${x.rating ? ' · ★' + x.rating : ''}${x.network ? ' · ' + x.network : ''}\n  ${clip(x.overview, 160)}\n  id: ${x.id}`).join('\n') : 'Nothing found.'; } },
    { name: 'kino_trending', group: 'Kino', description: 'What is trending / popular now in movies or TV (shown as a scrollable feed in the Media tab when show=true).', parameters: P({ type: Str('movie | tv | any'), period: Str('day | week'), show: Bool('open the scrolling Kino feed on screen') }),
      run: async a => { const r = await kinoTrending(a.type || 'movie', a.period); if (a.show) { mediaState.view = 'kino'; mediaState.kino = { mode: a.type === 'tv' ? 'tv' : 'movie', items: r }; showTab('media'); } return r.slice(0, 15).map((x, i) => `${i + 1}. ${x.title} (${x.year || '?'})${x.rating ? ' ★' + x.rating : ''} — id ${x.id}`).join('\n'); } },
    { name: 'kino_details', group: 'Kino', description: 'Full details for a movie/show id: cast, director, runtime, rating, trailer, where to stream/rent/buy in your region, next episode.', parameters: P({ id: Str('id from kino_search/kino_trending') }, ['id']),
      run: async a => J(await kinoDetails(a.id)) },
    { name: 'kino_play', group: 'Kino', description: 'Play a trailer (by id), a video URL (mp4/HLS) or a workspace video on the glasses.', parameters: P({ id: Str('movie/show id → trailer'), url: Str('direct video URL'), path: Str('workspace video path'), title: Str('optional title') }),
      run: async a => { if (a.id) return openTrailer(await kinoDetails(a.id)); const src = a.path ? cleanPath(a.path) : a.url; if (!src) throw new Error('id, url or path required'); if (/youtube\.com|youtu\.be/.test(src)) { N ? N.openUrl(src) : window.open(src); return 'opened in YouTube'; } playVideo(src, a.title); return 'playing ' + (a.title || src); } },
    { name: 'kino_feed', group: 'Kino', description: 'Open the scrolling Kino feed on screen (trending movies/TV or search results) to browse with the touchpad.', parameters: P({ type: Str('movie | tv'), query: Str('optional search') }),
      run: async a => { const items = a.query ? await kinoSearch(a.query, a.type || 'any') : await kinoTrending(a.type || 'movie'); mediaState.view = 'kino'; mediaState.kino = { mode: a.query ? 'search' : (a.type === 'tv' ? 'tv' : 'movie'), items, query: a.query || '' }; showTab('media'); return `Showing ${items.length} titles in the Kino feed.`; } },

    /* ---------------- Audiobooks */
    { name: 'audiobook_search', group: 'Audiobooks', description: 'Search free public-domain audiobooks (LibriVox via Internet Archive) by title or author.', parameters: P({ query: Str('title or author'), limit: Num('default 8') }, ['query']),
      run: async a => { const r = await archiveSearch(a.query, a.limit || 8); return r.map(x => `• ${x.title} — ${x.author}${x.runtime ? ' · ' + x.runtime : ''}${x.language ? ' · ' + x.language : ''}\n  id: ${x.id}`).join('\n') || 'No audiobooks found.'; } },
    { name: 'audiobook_play', group: 'Audiobooks', description: 'Play an audiobook: a search id (ia:…), a book already in the library (name), or a workspace audio file. Resumes where you left off.', parameters: P({ book: Str('ia:id, library title, or omit for the last book'), path: Str('or a workspace audio file (mp3/m4b/wav…)'), chapter: Num('optional chapter number (1-based)') }),
      run: async a => {
        if (a.path) return playFile(cleanPath(a.path), stemOf(a.path));
        let b = findBook(a.book);
        if (!b && /^ia:/.test(a.book || '')) b = addBook(await archiveBook(a.book.slice(3)));
        if (!b) throw new Error('Not in library. Use audiobook_search first, then play its ia: id.');
        if (!b.chapters) b = addBook(await archiveBook(b.id.slice(3)));
        return playBook(b.id, a.chapter ? a.chapter - 1 : null, a.chapter ? 0 : null);
      } },
    { name: 'audiobook_control', group: 'Audiobooks', description: 'Control playback: pause, resume, next, previous, seek (seconds), forward/back (seconds), speed (0.5-3), sleep (minutes), stop, status.', parameters: P({ action: Str('pause | resume | next | previous | seek | forward | back | speed | sleep | stop | status'), value: Num('seconds / speed / minutes') }, ['action']),
      run: async a => {
        const v = Number(a.value);
        switch (a.action) {
          case 'pause': AP.pause(); break; case 'resume': await AP.play(); break; case 'stop': stopAudio(); return 'stopped';
          case 'next': if (NOW && NOW.bookId) return playBook(NOW.bookId, NOW.ch + 1, 0); break;
          case 'previous': if (NOW && NOW.bookId) return playBook(NOW.bookId, NOW.ch - 1, 0); break;
          case 'seek': AP.currentTime = v || 0; break; case 'forward': AP.currentTime += v || 30; break; case 'back': AP.currentTime -= v || 30; break;
          case 'speed': AP.playbackRate = Math.max(0.5, Math.min(3, v || 1)); if (NOW && NOW.bookId) { book(NOW.bookId).rate = AP.playbackRate; save(); } break;
          case 'sleep': clearTimeout(sleepTimer); sleepTimer = setTimeout(() => { AP.pause(); toast('Sleep timer: paused'); }, (v || 30) * 60000); return `sleep timer ${v || 30} min`;
        }
        updateMini();
        return NOW ? `${AP.paused ? 'paused' : 'playing'}: ${NOW.title}${NOW.sub ? ' · ' + NOW.sub : ''} at ${mmss(AP.currentTime)}/${mmss(AP.duration)}, ${AP.playbackRate}×` : 'nothing playing';
      } },
    { name: 'audiobook_library', group: 'Audiobooks', description: 'List audiobooks in the library with progress.', parameters: P({}),
      run: async () => S.audiobooks.map(b => `• ${b.title}${b.author ? ' — ' + b.author : ''} · ${b.chapters.length} ch · ${b.pos && b.pos.finished ? 'finished' : `at ch ${(b.pos ? b.pos.ch : 0) + 1} ${mmss(b.pos ? b.pos.t : 0)}`} · ${b.source}`).join('\n') || 'Library is empty.' },
    { name: 'audiobook_download', group: 'Audiobooks', description: 'Download an online audiobook (all or some chapters) to the workspace for offline listening.', parameters: P({ book: Str('library title or ia: id'), chapters: Str('optional ranges like "1-3"') }, ['book']),
      run: async a => {
        needNative('Downloads'); let b = findBook(a.book); if (!b && /^ia:/.test(a.book)) b = addBook(await archiveBook(a.book.slice(3))); if (!b) throw new Error('book not found');
        const idx = parsePages(a.chapters, b.chapters.length).map(n => n - 1); let n = 0;
        for (const i of idx) { const ch = b.chapters[i]; if (ch.path || !ch.url) continue; const r = await nativeAsync('download', JSON.stringify({ url: ch.url, path: `audiobooks/${slug(b.title)}/${String(i + 1).padStart(3, '0')}.mp3` })); ch.path = r.path; n++; save(); }
        return `downloaded ${n} chapter(s) of "${b.title}" to audiobooks/${slug(b.title)}/`;
      } },
    { name: 'audiobook_create', group: 'Audiobooks', description: 'Turn a book or document into an audiobook with text-to-speech: EPUB, PDF, TXT/MD from the workspace, or given text. Chapters become separate audio files with read-along text.', parameters: P({ path: Str('epub/pdf/txt/md path'), text: Str('or raw text'), title: Str('optional title'), engine: Str('device | provider | elevenlabs (default from Settings)'), max_chapters: Num('optional limit') }),
      run: async a => {
        let src;
        if (a.path && extOf(a.path) === 'epub') src = await epubChapters(a.path);
        else if (a.path && extOf(a.path) === 'pdf') src = await textChapters((await pdfText(a.path)).text.replace(/--- page \d+ ---/g, ''), a.title || stemOf(a.path));
        else src = await textChapters(a.path ? await fsx.readText(a.path) : a.text, a.title || (a.path ? stemOf(a.path) : 'Untitled'));
        if (!src.chapters.length) throw new Error('No readable text found');
        const title = a.title || src.title; const dir = `audiobooks/${slug(title)}`; const chapters = [];
        const list = src.chapters.slice(0, a.max_chapters || 200);
        for (let i = 0; i < list.length; i++) {
          toast(`Synthesizing chapter ${i + 1}/${list.length}…`);
          const r = await textToAudioFile(list[i].text, { engine: a.engine, output: `${dir}/${String(i + 1).padStart(3, '0')}.${(a.engine || S.settings.ttsEngine) === 'device' ? 'wav' : 'mp3'}` });
          chapters.push({ title: list[i].title, path: r.path, text: list[i].text.slice(0, 60000) });
        }
        const b = addBook({ id: 'tts:' + uid(), title, author: src.author || '', source: 'Text to speech', chapters });
        return `Created audiobook "${b.title}" with ${chapters.length} chapter(s) in ${dir}/. Play it with audiobook_play.`;
      } },

    /* ---------------- Audio (text to audio) */
    { name: 'text_to_audio', group: 'Audio', description: 'Convert text (or a workspace text/markdown file) into an audio file: device = offline Android voice (WAV), provider = OpenAI/Venice-compatible voices (MP3), elevenlabs = ElevenLabs voices (MP3).', parameters: P({ text: Str('text to speak'), path: Str('or a text file'), engine: Str('device | provider | elevenlabs'), voice: Str('optional voice (device voice name, OpenAI voice like alloy/nova, or ElevenLabs voice id)'), output: Str('optional output path'), play: Bool('play it when done') }),
      run: async a => { const text = a.text || (a.path ? (extOf(a.path) === 'pdf' ? (await pdfText(a.path)).text : await fsx.readText(a.path)) : ''); const r = await textToAudioFile(text, a); if (a.play) await playFile(r.path, stemOf(r.path)); return `saved ${r.path} (${r.engine}${r.durationMs ? ', ' + mmss(r.durationMs / 1000) : ''})`; } },
    { name: 'tts_voices', group: 'Audio', description: 'List the offline device voices (names + languages) usable with text_to_audio engine=device.', parameters: P({ language: Str('optional filter, e.g. en, de') }),
      run: async a => { needNative('Voices'); const v = parseJSON(N.ttsVoices(), []).filter(x => !a.language || x.locale.toLowerCase().startsWith(a.language.toLowerCase())); return v.slice(0, 60).map(x => `${x.name} · ${x.locale}${x.offline ? '' : ' (network)'}`).join('\n') || 'No voices reported by the TTS engine.'; } },
    { name: 'audio_transcribe', group: 'Audio', description: 'Speech-to-text for an audio file (voice memo, meeting, extracted video audio) using Whisper (OpenAI or Groq provider in Settings).', parameters: P({ path: Str('audio file'), language: Str('optional ISO code, e.g. en') }, ['path']),
      run: async a => clip(await transcribe(a.path, a.language), 20000) },
    { name: 'audio_play', group: 'Audio', description: 'Play an audio file from the workspace or a URL (music, podcast episode, recording).', parameters: P({ path: Str('workspace path'), url: Str('or URL'), title: Str('optional') }),
      run: async a => playFile(a.path ? cleanPath(a.path) : a.url, a.title) },
    { name: 'read_aloud', group: 'Audio', description: 'Read text or a document aloud right now with the device voice, showing the text scrolling and highlighting along.', parameters: P({ text: Str('text'), path: Str('or file (txt/md/pdf)'), title: Str('optional') }),
      run: async a => readAloud(plain(a.text || (a.path ? (extOf(a.path) === 'pdf' ? (await pdfText(a.path)).text : await fsx.readText(a.path)) : '')), a.title) },
    { name: 'teleprompter', group: 'Audio', description: 'Show text as an auto-scrolling teleprompter on the glasses (speeches, notes, lyrics). Touchpad up/down changes speed, tap pauses.', parameters: P({ text: Str('text'), path: Str('or a text/pdf file'), wpm: Num('words per minute, default from Settings') }),
      run: async a => { const t = a.text || (a.path ? (extOf(a.path) === 'pdf' ? (await pdfText(a.path)).text : await fsx.readText(a.path)) : ''); teleprompter(t, a.wpm); return 'teleprompter started'; } },

    /* ---------------- Glasses (native RayNeo X3 Pro) */
    { name: 'glasses_status', group: 'Glasses', description: 'Battery, charging, temperature, volume, network, Bluetooth, storage, memory, brightness and sensors of the glasses/device.', parameters: P({}),
      run: async () => { needNative('Device status'); return J(chk(N.deviceStatus())); } },
    { name: 'glasses_volume', group: 'Glasses', description: 'Set media volume (0-100).', parameters: P({ percent: Num('0-100') }, ['percent']), run: async a => { needNative(); return N.setVolume(Math.round(a.percent)); } },
    { name: 'glasses_brightness', group: 'Glasses', description: 'Set display brightness for Nexus (0-100), or "auto" to follow the system.', parameters: P({ percent: Num('0-100'), auto: Bool('use system brightness') }),
      run: async a => { needNative(); return N.setBrightness(a.auto ? -1 : Math.max(1, Math.min(100, Number(a.percent) || 50)) / 100); } },
    { name: 'media_control', group: 'Glasses', description: 'Control music/podcast apps playing on the device (Spotify, YouTube Music…): play, pause, play_pause, next, previous, stop.', parameters: P({ action: Str('play | pause | play_pause | next | previous | stop') }, ['action']),
      run: async a => { needNative(); return N.mediaKey(a.action); } },
    { name: 'glasses_settings', group: 'Glasses', description: 'Open a system settings screen: wifi, bluetooth, display, sound, battery, location, notifications, apps, storage, date, language, accessibility, developer, app.', parameters: P({ panel: Str('panel name') }),
      run: async a => { needNative(); return N.openSettings(a.panel || ''); } },
    { name: 'head_pose', group: 'Glasses', description: 'Current head orientation from the IMU: yaw (compass-like), pitch (looking up/down), roll (tilt), in degrees.', parameters: P({}),
      run: async () => { needNative('Head tracking'); return J(await nativeAsync('headPose')); } },
    { name: 'ask_yes_no', group: 'Glasses', description: 'Ask the user a yes/no question on the display (and aloud); they answer by nodding (yes) or shaking their head (no), or tapping.', parameters: P({ question: Str('the question'), timeout_s: Num('default 15') }, ['question']),
      run: async a => 'answer: ' + await askYesNo(a.question, a.timeout_s || 15) },
    { name: 'notifications_read', group: 'Glasses', description: 'Read recent notifications (messages, calls, apps) from this device. Requires notification access (Settings → Media & audio).', parameters: P({ app: Str('optional app filter, e.g. WhatsApp'), limit: Num('default 15'), since_minutes: Num('optional') }),
      run: async a => {
        needNative('Notifications'); if (!N.notificationAccess()) return 'Notification access is off. Ask the user to enable it (glasses_settings panel "notifications" → Nexus Agent).';
        const since = a.since_minutes ? Date.now() - a.since_minutes * 60000 : 0; const f = String(a.app || '').toLowerCase();
        const list = parseJSON(N.notificationsList(150), []).filter(n => n.time >= since && (!f || n.app.toLowerCase().includes(f) || n.package.includes(f))).slice(0, a.limit || 15);
        return list.map(n => `${new Date(n.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${n.app} · ${n.title}${n.text ? ': ' + clip(n.text, 220) : ''}\n  key: ${n.key}`).join('\n') || 'No notifications.';
      } },
    { name: 'notifications_dismiss', group: 'Glasses', description: 'Dismiss a notification by key (from notifications_read).', parameters: P({ key: Str('notification key') }, ['key']),
      run: async a => { needNative(); return N.notificationDismiss(a.key) ? 'dismissed' : 'notification access not active'; } },
    { name: 'camera_record_video', group: 'Glasses', description: 'Record a video clip of what the user sees (point-of-view camera), with sound, saved to the workspace.', parameters: P({ seconds: Num('length, default 10, max 300'), audio: Bool('record sound, default true'), path: Str('optional output path') }),
      run: async a => 'saved ' + await recordVideo(a.seconds || 10, a.audio !== false, a.path) },
  );

  /* ================================================================== Media tab */
  const mediaState = { view: 'books', results: [], kino: { mode: 'movie', items: [], query: '' } };
  const tabBtn = document.createElement('button'); tabBtn.dataset.tab = 'media'; tabBtn.textContent = 'Media'; tabBtn.onclick = () => showTab('media');
  $('#tabs [data-tab=files]').after(tabBtn);
  const sec = document.createElement('section'); sec.id = 'view-media'; sec.className = 'view'; $('main').appendChild(sec);
  extraTabs.media = renderMedia;
  function renderMedia() {
    const v = $('#view-media'); const st = mediaState;
    v.innerHTML = `<h2>Media</h2><div class="row"><button class="primary nogrow" id="mdScan">▦ Scan code</button><button class="nogrow ${st.view === 'books' ? 'primary' : ''}" id="mdBooks">📚 Audiobooks</button><button class="nogrow ${st.view === 'kino' ? 'primary' : ''}" id="mdKino">🎬 Kino</button><button class="nogrow" id="mdTele">📜 Teleprompter</button></div><div id="mdBody"></div>`;
    $('#mdScan').onclick = scanFlowUI;
    $('#mdBooks').onclick = () => { st.view = 'books'; renderMedia(); };
    $('#mdKino').onclick = () => { st.view = 'kino'; renderMedia(); if (!st.kino.items.length) loadKino('movie'); };
    $('#mdTele').onclick = () => { overlay(`<label>Text for the teleprompter</label><textarea id="tpTxt" rows="8"></textarea><div class="row" style="margin-top:.5em"><button class="primary" id="tpGo">Start</button></div>`); $('#tpGo').onclick = () => { const t = $('#tpTxt').value; modalClose(); teleprompter(t); }; $('#tpTxt').focus(); };
    st.view === 'kino' ? renderKino() : renderBooks();
  }
  function renderBooks() {
    const b = $('#mdBody'); const st = mediaState;
    b.innerHTML = `<div class="card"><h3>Find free audiobooks <span class="pill">LibriVox</span></h3><div class="row"><input id="abQ" placeholder="Title or author (e.g. Sherlock Holmes)"><button class="nogrow" id="abGo">Search</button></div><div id="abRes">${st.results.map((r, i) => `<div class="filerow"><span class="fname" tabindex="0">${esc(r.title)} <span class="hint">${esc(r.author)} ${r.runtime ? '· ' + esc(r.runtime) : ''}</span></span><button class="small" data-play="${i}">▶ Play</button><button class="small" data-add="${i}">+ Library</button></div>`).join('')}</div></div>
      <div class="card"><h3>Library (${S.audiobooks.length})</h3>${S.audiobooks.map((x, i) => `<div class="filerow"><span class="fname" tabindex="0"><b>${esc(x.title)}</b> <span class="hint">${esc(x.author || '')} · ${x.chapters.length} ch · ${x.pos && x.pos.finished ? 'finished' : `ch ${(x.pos ? x.pos.ch : 0) + 1}, ${mmss(x.pos ? x.pos.t : 0)}`}${x.chapters.every(c => c.path) ? ' · offline' : ''}</span></span><button class="small" data-res="${i}">▶</button><button class="small" data-dl="${i}">⬇</button><button class="small danger" data-rm="${i}">✕</button></div>`).join('') || '<p class="hint">Search above, or ask an agent: "make an audiobook from imports/novel.epub".</p>'}</div>`;
    const go = async () => { const q = $('#abQ').value.trim(); if (!q) return; $('#abRes').textContent = 'searching…'; try { st.results = await archiveSearch(q, 12); renderBooks(); } catch (e) { $('#abRes').textContent = e.message; } };
    $('#abGo').onclick = go; $('#abQ').onkeydown = e => { if (e.key === 'Enter') go(); };
    $$('[data-play],[data-add]', b).forEach(el => el.onclick = async () => { const r = st.results[Number(el.dataset.play ?? el.dataset.add)]; try { toast('Loading…'); const bk = addBook(await archiveBook(r.id.slice(3))); if (el.dataset.play != null) await playBook(bk.id); renderBooks(); } catch (e) { toast(e.message); } });
    $$('[data-res]', b).forEach(el => el.onclick = () => playBook(S.audiobooks[Number(el.dataset.res)].id).catch(e => toast(e.message)));
    $$('[data-dl]', b).forEach(el => el.onclick = () => execSkill('audiobook_download', { book: S.audiobooks[Number(el.dataset.dl)].id }, { agent: S.agents[0], depth: 0, origin: 'ui', token: runToken }).then(toast).then(renderBooks).catch(e => toast(e.message)));
    $$('[data-rm]', b).forEach(el => el.onclick = async () => { const x = S.audiobooks[Number(el.dataset.rm)]; if (await confirmBox(`Remove <b>${esc(x.title)}</b> from the library?`)) { S.audiobooks = S.audiobooks.filter(y => y !== x); save(); renderBooks(); } });
  }
  async function loadKino(mode, query) {
    const st = mediaState.kino; st.mode = mode; st.query = query || ''; st.items = []; renderKino(true);
    try { st.items = mode === 'search' ? await kinoSearch(query, 'any') : await kinoTrending(mode); } catch (e) { st.error = e.message; }
    renderKino();
  }
  function renderKino(loading) {
    const b = $('#mdBody'); if (!b || mediaState.view !== 'kino') return; const st = mediaState.kino;
    b.innerHTML = `<div class="row"><button class="small ${st.mode === 'movie' ? 'primary' : ''}" id="kM">🔥 Movies</button><button class="small ${st.mode === 'tv' ? 'primary' : ''}" id="kT">📺 TV</button><input id="kQ" placeholder="Search titles" value="${esc(st.query)}"><button class="small nogrow" id="kGo">🔍</button></div>
      <p class="hint">${tmdbKey() ? 'Data: TMDB' : 'Data: Apple iTunes + TVmaze (add a TMDB key in Settings for trending, ratings and where-to-watch)'} · swipe to scroll, tap a card for details</p>
      <div id="kFeed">${loading ? '<p class="hint">loading…</p>' : st.error ? `<p class="hint">${esc(st.error)}</p>` : st.items.map((x, i) => `<div class="card kcard" tabindex="0" data-k="${i}" style="display:flex;gap:.7em">${x.poster ? `<img src="${esc(x.poster)}" alt="" style="width:5.5em;height:8.2em;object-fit:cover;border-radius:6px;flex:none">` : ''}<div style="min-width:0"><b>${esc(x.title)}</b> <span class="hint">${esc(x.year || '')} ${x.rating ? '· ★' + esc(x.rating) : ''} ${x.network ? '· ' + esc(x.network) : ''}</span><div class="hint" style="max-height:4.5em;overflow:hidden">${esc(clip(x.overview || '', 220))}</div></div></div>`).join('')}</div>`;
    $('#kM').onclick = () => loadKino('movie'); $('#kT').onclick = () => loadKino('tv');
    const s = () => { const q = $('#kQ').value.trim(); if (q) loadKino('search', q); }; $('#kGo').onclick = s; $('#kQ').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); s(); } };
    $$('.kcard', b).forEach(el => { const open = () => kinoCard(st.items[Number(el.dataset.k)]); el.onclick = open; el.onkeydown = e => { if (e.key === 'Enter') open(); }; });
  }
  async function kinoCard(x) {
    overlay(`<p class="hint">loading ${esc(x.title)}…</p>`);
    try {
      const d = await kinoDetails(x.id);
      const ww = d.where_to_watch && typeof d.where_to_watch === 'object' ? `<p>📺 ${d.where_to_watch.stream.length ? 'Stream: ' + esc(d.where_to_watch.stream.join(', ')) : ''} ${d.where_to_watch.rent.length ? '· Rent: ' + esc(d.where_to_watch.rent.slice(0, 4).join(', ')) : ''} ${d.where_to_watch.buy.length ? '· Buy: ' + esc(d.where_to_watch.buy.slice(0, 4).join(', ')) : ''}</p>` : (d.buy_or_rent ? `<p>📺 ${esc(d.buy_or_rent)}</p>` : '');
      $('#modalBox').innerHTML = `<div style="display:flex;gap:.8em">${d.poster ? `<img src="${esc(d.poster)}" alt="" style="width:7em;border-radius:6px;align-self:flex-start">` : ''}<div><h3 style="margin-top:0">${esc(d.title)} <span class="hint">${esc(d.year || '')}</span></h3><p class="hint">${esc([d.genres || d.genre, d.runtime ? d.runtime + ' min' : d.runtime_min ? d.runtime_min + ' min' : '', d.rating ? '★ ' + d.rating : '', d.status].filter(Boolean).join(' · '))}</p>${d.director ? `<p class="hint">By ${esc(d.director)}</p>` : ''}</div></div><p style="max-height:9em;overflow:auto">${esc(d.overview || '')}</p>${d.cast ? `<p class="hint">${esc(d.cast.slice(0, 5).join(', '))}</p>` : ''}${d.next_episode ? `<p>Next: ${esc(d.next_episode)}</p>` : ''}${ww}
        <div class="row"><button class="primary" id="kcTr" ${d.trailer ? '' : 'disabled'}>▶ Trailer</button><button id="kcAsk">Ask agent</button><button id="kcX">Close</button></div>`;
      $('#kcTr').onclick = () => { modalClose(); openTrailer(d); };
      $('#kcAsk').onclick = () => { modalClose(); showTab('chat'); $('#input').value = `Tell me about "${d.title}" (${d.year}) — is it worth watching, and where can I watch it? (id ${d.id})`; send(); };
      $('#kcX').onclick = () => modalClose(); $('#kcTr').focus();
    } catch (e) { $('#modalBox').innerHTML = `<p>${esc(e.message)}</p><button id="kcX">Close</button>`; $('#kcX').onclick = () => modalClose(); }
  }

  /* ================================================================== settings card */
  const coreRenderPro = renderProSettings, coreBindPro = bindProSettings;
  renderProSettings = () => coreRenderPro() + renderMediaSettings();
  bindProSettings = v => { coreBindPro(v); bindMediaSettings(v); };
  function renderMediaSettings() {
    const st = S.settings; const has = k => getKey(k) ? 'saved ✓' : '';
    const provOpts = sel => S.providers.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
    return `<div class="card" id="mediaCard"><h3>Media &amp; audio</h3>
      <div class="row"><div><label>Text-to-audio engine</label><select data-k="ttsEngine"><option value="device">Device voice (offline, WAV)</option><option value="provider">AI provider voices (MP3)</option><option value="elevenlabs">ElevenLabs (MP3)</option></select></div>
      <div><label>TTS provider (OpenAI / Venice)</label><select data-k="ttsProvider">${provOpts(st.ttsProvider)}</select></div><div><label>TTS model</label><input data-k="ttsModel"></div><div><label>Voice</label><input data-k="ttsVoice"></div></div>
      <div class="row"><div><label>Device voice name (see tts_voices)</label><input data-k="ttsDeviceVoice"></div><div><label>ElevenLabs key</label><input type="password" data-secret="svc_elevenlabs" placeholder="${has('svc_elevenlabs')}"></div><div><label>ElevenLabs voice id</label><input data-k="elevenVoice"></div></div>
      <div class="row"><div><label>Speech-to-text provider (OpenAI / Groq)</label><select data-k="sttProvider">${provOpts(st.sttProvider)}</select></div><div><label>STT model</label><input data-k="sttModel"></div><div><label>Teleprompter / reader WPM</label><input data-k="readerWpm" data-t="num" type="number"></div></div>
      <div class="row"><div><label>TMDB API key or read token (optional, for Kino)</label><input type="password" data-secret="svc_tmdb" placeholder="${has('svc_tmdb')}"></div><div><label>Kino region</label><input data-k="kinoRegion"></div></div>
      <h3 style="margin-top:.8em">Telegram</h3>
      <div class="row"><div><label>Bot token (create a bot with @BotFather)</label><input type="password" data-secret="svc_telegram" placeholder="${has('svc_telegram')}"></div><div><label>Agent that answers Telegram</label><select data-k="telegramAgent"><option value="">(current chat agent)</option>${S.agents.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></div></div>
      <label class="inline"><input type="checkbox" data-k="telegramBridge" data-t="bool">Answer messages sent to the bot (runs while the app is open)</label>
      <p class="hint">Pair your Telegram chat: send <code>/pair ${esc(st.telegramPair)}</code> to your bot. Paired chats: ${S.telegram.allowed.length ? S.telegram.allowed.map(id => esc((S.telegram.known[id] || {}).title || id)).join(', ') + ' <button class="small" id="tgUnpair">Unpair all</button>' : 'none'}</p>
      <h3 style="margin-top:.8em">RayNeo glasses</h3>
      <label class="inline"><input type="checkbox" data-k="headConfirm" data-t="bool">Confirm actions by nodding (yes) / shaking (no)</label>
      <div class="row"><button class="nogrow" id="calNod">Calibrate nod</button><button class="nogrow" id="calShake">Calibrate shake</button><span class="hint">nod axis ${esc(st.nodAxis)} · shake axis ${esc(st.shakeAxis)}</span></div>
      <label class="inline"><input type="checkbox" data-k="announceNotifications" data-t="bool">Announce new notifications (speak + show in chat)</label>
      <div class="row"><div><label>Only these apps (comma separated, empty = all)</label><input data-k="announceApps"></div><button class="nogrow" id="notifAccess">${N && N.notificationAccess && N.notificationAccess() ? 'Notification access ✓' : 'Grant notification access'}</button></div>
    </div>`;
  }
  function bindMediaSettings(v) {
    const card = $('#mediaCard', v); if (!card) return;
    bind(card, S.settings, k => { if (k === 'telegramBridge' && S.settings.telegramBridge) tgLoop(); });
    $$('[data-secret]', card).forEach(el => el.addEventListener('change', () => { setKey(el.dataset.secret, el.value); el.value = ''; el.placeholder = 'saved ✓'; toast('Saved on device'); }));
    const unp = $('#tgUnpair', card); if (unp) unp.onclick = () => { S.telegram.allowed = []; save(); renderSettings(); };
    const cal = async (which) => { toast(which === 'nod' ? 'Nod your head now…' : 'Shake your head now…'); try { const r = await nativeAsync('headGesture', 6000); if (r.axis === 'none') return toast('No movement detected — try a bit faster'); S.settings[which === 'nod' ? 'nodAxis' : 'shakeAxis'] = r.axis; save(); toast(`${which} → axis ${r.axis}`); renderSettings(); } catch (e) { toast(e.message); } };
    $('#calNod', card).onclick = () => cal('nod'); $('#calShake', card).onclick = () => cal('shake');
    $('#notifAccess', card).onclick = () => { if (N) toast(N.openSettings('notifications')); };
  }
  // Secrets for export / phone remote console.
  { const coreSecrets = secretIds; secretIds = () => [...coreSecrets(), { id: 'svc_telegram', name: 'Telegram bot token' }, { id: 'svc_tmdb', name: 'TMDB key' }, { id: 'svc_elevenlabs', name: 'ElevenLabs key' }]; }

  window.NexusMedia = { scanLive, decodeImagePath, qrToFile, describeCode, textToAudioFile, playBook, playFile, AP, epubChapters, textChapters, kinoSearch, kinoTrending, kinoDetails, archiveSearch, archiveBook, tgHandle, tgFetchUpdates, mediaState, askYesNo };
})();
