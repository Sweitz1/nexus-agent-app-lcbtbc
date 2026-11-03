/* Nexus Agent — Connect: Bluetooth devices, media over Bluetooth / in the car, Android Auto,
 * casting to TVs and screen mirroring. Loaded after skills-narrator.js.
 *
 *  Bluetooth   pair and list devices (speakers, headphones, cars, keyboards); see where audio goes.
 *  Car / BT    Nexus' player is mirrored into the system media session, so a car stereo (e.g. a VW
 *              Passat over Bluetooth) shows the title and the steering-wheel buttons work.
 *  Android Auto  Nexus appears as a media app (audiobooks, narrations, "Ask Nexus") and as a
 *              messaging app: hear Nexus and reply by voice while driving.
 *  Casting     DLNA/UPnP smart TVs & speakers get files streamed from the phone; Chromecast and
 *              whole-screen mirroring go through the system Cast / Smart View panel. */
'use strict';
(() => {
  const P = (props, req = []) => ({ type: 'object', properties: props, required: req });
  const Str = d => ({ type: 'string', description: d });
  const Num = d => ({ type: 'number', description: d });
  const Bool = d => ({ type: 'boolean', description: d });
  S.settings = { carMessaging: true, carNarrate: true, ...S.settings };

  async function btReady() {
    needNative('Bluetooth');
    for (const p of parseJSON(N.btPermissions(), [])) if (!(await ensurePermission(p))) throw new Error('Bluetooth permission denied (' + p.split('.').pop() + ')');
  }
  const fmtDev = d => `${d.name} — ${d.kind}${d.connected ? ', connected' : d.paired ? ', paired' : ''}${d.rssi != null && d.rssi > -32768 ? `, signal ${d.rssi} dBm` : ''} [${d.address}]`;
  const MIME = { mp4: 'video/mp4', m4v: 'video/mp4', mkv: 'video/x-matroska', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo', ts: 'video/mp2t',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', m4b: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/ogg',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
  const mimeOf = p => MIME[(String(p).split(/[?#]/)[0].split('.').pop() || '').toLowerCase()] || 'video/mp4';

  /* ---------------------------------------------------------------- media session sync (car display, steering wheel) */
  if (N && N.mediaSessionUpdate && window.NexusMedia) {
    const AP = NexusMedia.AP; let last = '', lastT = 0;
    const push = force => {
      const now = NexusMedia.nowPlaying();
      const st = !now ? 'none' : AP.ended ? 'stopped' : AP.paused ? 'paused' : AP.readyState < 3 ? 'buffering' : 'playing';
      const o = now ? { state: st, title: now.title || 'Nexus', artist: now.sub || (now.kind === 'book' ? 'Audiobook' : 'Nexus'), album: now.kind === 'book' ? now.title : 'Nexus', durationMs: Math.round((AP.duration || 0) * 1000) || 0, positionMs: Math.round(AP.currentTime * 1000), rate: AP.playbackRate } : { state: 'none' };
      const key = `${o.state}|${o.title}|${o.artist}|${o.durationMs}`;
      if (!force && key === last && Date.now() - lastT < 15000) return;   // position is extrapolated by the system between updates
      last = key; lastT = Date.now(); N.mediaSessionUpdate(JSON.stringify(o));
    };
    for (const e of ['play', 'playing', 'pause', 'ended', 'loadedmetadata', 'ratechange', 'seeked', 'emptied']) AP.addEventListener(e, () => push(true));
    AP.addEventListener('timeupdate', () => push(false));
  }

  /* ---------------------------------------------------------------- Android Auto browse tree */
  async function publishCatalog() {
    if (!N || !N.mediaCatalog) return;
    const books = (S.audiobooks || []).slice(0, 60);
    const cat = { root: [], books: [], narrations: [] };
    if (books.length) cat.root.push({ id: 'books', title: 'Audiobooks', subtitle: `${books.length} in your library`, playable: false });
    for (const b of books) {
      const id = 'book_' + b.id;
      cat.books.push({ id, title: b.title, subtitle: b.pos && b.pos.ch ? `Continue · chapter ${b.pos.ch + 1}` : `${(b.chapters || []).length} chapters`, playable: false });
      cat[id] = [{ id: `book:${b.id}:resume`, title: '▶ Continue listening', subtitle: b.title, playable: true },
        ...(b.chapters || []).slice(0, 150).map((c, i) => ({ id: `book:${b.id}:${i}`, title: c.title || `Chapter ${i + 1}`, subtitle: b.title, playable: true }))];
    }
    try {
      const files = [].concat(fsx.list('audio') || []).filter(f => f && !f.dir && /\.(mp3|wav|m4a|ogg)$/i.test(f.name || f.path || '')).slice(-40).reverse();
      for (const f of files) cat.narrations.push({ id: 'file:' + (f.path || 'audio/' + f.name), title: (f.name || f.path).replace(/^.*\//, '').replace(/\.\w+$/, '').replace(/[_-]+/g, ' '), subtitle: 'Narration', playable: true });
    } catch { /* no audio folder yet */ }
    if (cat.narrations.length) cat.root.push({ id: 'narrations', title: 'Narrations & audio', subtitle: `${cat.narrations.length} recent`, playable: false });
    cat.root.push({ id: 'ask:', title: 'Ask Nexus', subtitle: 'Say "play <question> on Nexus" — the answer is read aloud', playable: true });
    N.mediaCatalog(JSON.stringify(cat));
  }
  setTimeout(() => publishCatalog().catch(() => {}), 1500); setInterval(() => publishCatalog().catch(() => {}), 120000);

  /** A question from the car: ask the current agent and play the answer (narrator voice when set up). */
  async function carAsk(q) {
    q = String(q || '').trim(); if (!q) return;
    const agent = agentById(S.current) || S.agents[0];
    const r = await dispatch(q, { origin: 'car', agentId: agent.id });
    const text = stripThink(r.text || '');
    if (S.settings.carNarrate && (S.settings.ttsEngine || 'device') !== 'device' && window.NexusMedia) {
      try { const a = await NexusMedia.textToAudioFile(text.slice(0, 3000), { output: `audio/car_answer_${tsName()}.mp3` }); await NexusMedia.playFile(a.path, 'Nexus: ' + clip(q, 40)); return text; } catch (e) { console.warn('car narrate', e); }
    }
    speak(text); return text;
  }

  onNative('carMedia', async c => {
    const AP = window.NexusMedia && NexusMedia.AP; if (!AP) return;
    try {
      switch (c.action) {
        case 'play': if (NexusMedia.nowPlaying()) await AP.play(); else { const b = (S.audiobooks || [])[0]; if (b) await NexusMedia.playBook(b.id); } break;
        case 'pause': AP.pause(); break;
        case 'stop': AP.pause(); break;
        case 'next': $('#miniNext') && $('#miniNext').click(); break;
        case 'previous': $('#miniPrev') && $('#miniPrev').click(); break;
        case 'forward': AP.currentTime = Math.min((AP.duration || 1e9), AP.currentTime + 30); break;
        case 'rewind': AP.currentTime = Math.max(0, AP.currentTime - 15); break;
        case 'seek': AP.currentTime = Number(c.arg) / 1000; break;
        case 'playId': {
          const id = String(c.arg || '');
          if (id.startsWith('book:')) { const [, bid, ch] = id.split(':'); await NexusMedia.playBook(bid, ch === 'resume' ? undefined : Number(ch), ch === 'resume' ? undefined : 0); }
          else if (id.startsWith('file:')) await NexusMedia.playFile(id.slice(5));
          else if (id.startsWith('ask:')) { if (id.length > 4) await carAsk(id.slice(4)); else speak('Ask me something: say, play, then your question, on Nexus.'); }
          break;
        }
        case 'search': {
          const q = String(c.arg || '').trim(); if (!q) { const b = (S.audiobooks || [])[0]; if (b) await NexusMedia.playBook(b.id); break; }
          const b = (S.audiobooks || []).find(x => x.title.toLowerCase().includes(q.toLowerCase()));
          if (b) await NexusMedia.playBook(b.id); else await carAsk(q);
          break;
        }
        default: break;
      }
    } catch (e) { console.warn('carMedia', c, e); }
  });

  /* ---------------------------------------------------------------- Android Auto messaging */
  onNative('carReply', async p => {
    if (!S.settings.carMessaging) return;
    try {
      const agent = agentById(S.current) || S.agents[0];
      const r = await dispatch(String(p.text || ''), { origin: 'car', agentId: agent.id });
      N.carMessage(r.agent || agent.name, plain(stripThink(r.text || '')).slice(0, 1500));
    } catch (e) { N.carMessage('Nexus', 'Sorry — ' + e.message); }
  });

  /* ---------------------------------------------------------------- skills */
  BUILTIN_SKILLS.push(
    { name: 'bluetooth_devices', group: 'Bluetooth', description: 'Bluetooth status, paired devices (speakers, headphones, cars, keyboards…) with which are connected, and where media audio is playing right now.', parameters: P({}),
      run: async () => {
        await btReady(); const st = await nativeAsync('btState'); if (!st.available) return 'This device has no Bluetooth.';
        if (!st.enabled) return 'Bluetooth is off. Use bluetooth_settings to turn it on.';
        const list = await nativeAsync('btPaired');
        return `Bluetooth on${st.name ? ` (this device: ${st.name})` : ''}. Audio now: ${st.audioOutput.active}.\nPaired:\n${list.length ? list.map(fmtDev).join('\n') : '(none)'}`;
      } },
    { name: 'bluetooth_scan', group: 'Bluetooth', description: 'Scan for nearby Bluetooth devices that are discoverable / in pairing mode (put the speaker, headset or car in pairing mode first).', parameters: P({ seconds: Num('scan time, default 12') }),
      run: async a => { await btReady(); const list = await nativeAsync('btScan', Math.round((a.seconds || 12) * 1000)); return list.length ? `Found ${list.length}:\n` + list.map(fmtDev).join('\n') : 'Nothing found. Make sure the other device is in pairing mode and close by.'; } },
    { name: 'bluetooth_pair', group: 'Bluetooth', description: 'Pair with a Bluetooth device by address (from bluetooth_scan) or name. Android shows its own PIN/passkey confirmation.', parameters: P({ device: Str('address AA:BB:… or name from the scan') }, ['device']),
      run: async a => {
        await btReady(); let addr = a.device;
        if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i.test(addr)) { const list = await nativeAsync('btScan', 10000); const d = list.find(x => x.name.toLowerCase().includes(String(a.device).toLowerCase())); if (!d) return `No nearby device named "${a.device}" — is it in pairing mode?`; addr = d.address; }
        if (!(await confirmBox(`Pair with Bluetooth device <b>${esc(a.device)}</b>?`))) return 'Cancelled.';
        return (await nativeAsync('btPair', addr.toUpperCase())).result;
      } },
    { name: 'bluetooth_settings', group: 'Bluetooth', description: 'Open Bluetooth settings (turn on/off, connect/disconnect, forget a device) or the media output switcher (choose phone / Bluetooth / cast device for audio).', parameters: P({ panel: Str('bluetooth (default) | output') }),
      run: async a => { needNative('Bluetooth'); if (a.panel === 'output') { if (N.openOutputSwitcher()) return 'Opened the media output switcher.'; } return N.openSettings('bluetooth'); } },
    { name: 'audio_output', group: 'Bluetooth', description: 'Where media audio is playing right now (phone speaker, Bluetooth device, wired, USB, HDMI).', parameters: P({}),
      run: async () => { needNative('Audio'); const o = parseJSON(N.audioOutput(), {}); return `Audio now: ${o.active}. Available outputs: ${(o.outputs || []).map(x => `${x.name} (${x.type})`).join(', ') || 'phone speaker'}`; } },
    { name: 'cast_devices', group: 'Cast', description: 'Find smart TVs, speakers and receivers on this Wi-Fi that accept casting (DLNA/UPnP: Samsung, LG, Sony, Panasonic, Philips, Roku TVs, Kodi, VLC, AV receivers…).', parameters: P({ seconds: Num('search time, default 4') }),
      run: async () => { needNative('Cast'); const list = await nativeAsync('castDiscover', 4000); return list.length ? list.map(d => `${d.name}${d.model ? ` (${d.model})` : ''} — ${d.host} [${d.id}]`).join('\n') : 'No DLNA TVs/speakers found. Chromecast / Google TV: use screen_mirror (system Cast). Check the TV is on the same Wi-Fi and "DLNA / screen sharing / AllShare" is enabled on it.'; } },
    { name: 'cast_media', group: 'Cast', description: 'Play a video, music/audiobook file or photo from the workspace (or a direct media URL) on a TV or speaker found by cast_devices.', parameters: P({ path: Str('workspace file'), url: Str('or a direct http(s) media URL'), device: Str('device name or id (optional when there is only one)'), title: Str('optional title') }),
      run: async a => {
        needNative('Cast'); if (!a.path && !a.url) throw new Error('Give a workspace path or a URL');
        if (a.path && !N.serverRunning()) { S.settings.server.enabled = true; save(); applyServer(); }
        const mime = mimeOf(a.path || a.url);
        try { await nativeAsync('castDiscover', 2500); } catch { /* use known devices */ }
        return (await nativeAsync('castFile', JSON.stringify({ device: a.device || '', path: a.path ? cleanPath(a.path) : '', url: a.url || '', mime, title: a.title || (a.path || a.url).replace(/^.*\//, '') }))).result;
      } },
    { name: 'cast_control', group: 'Cast', description: 'Control what is casting on a TV/speaker: play, pause, stop, seek (seconds), volume (0-100) or status.', parameters: P({ action: Str('play | pause | stop | seek | volume | status'), value: Num('seconds for seek, 0-100 for volume'), device: Str('device name or id') }, ['action']),
      run: async a => { needNative('Cast'); const r = await nativeAsync('castControl', a.device || '', a.action, String(a.value ?? '')); return r.result; } },
    { name: 'screen_mirror', group: 'Cast', description: 'Mirror the whole screen to a TV or display: opens the system Cast / Smart View / Screen mirroring panel (Chromecast, Google TV, Miracast TVs, Fire TV). On glasses this shows the glasses view on the TV.', parameters: P({}),
      run: async () => { needNative('Screen mirroring'); const r = N.openSettings('cast'); return `${r}. Pick your TV in the list. (On Samsung phones use the Smart View tile in Quick Settings; on cars, screen mirroring is only possible through Android Auto.)`; } },
    { name: 'car_message', group: 'Car', description: 'Send a message to the Nexus conversation in Android Auto (read aloud in the car; the driver can reply by voice and the agent answers).', parameters: P({ text: Str('message') }, ['text']),
      run: async a => { needNative('Car messaging'); N.carMessage((agentById(S.current) || {}).name || 'Nexus', String(a.text).slice(0, 1500)); return 'Posted to the Nexus conversation (shows in Android Auto and as a notification).'; } },
  );

  /* ---------------------------------------------------------------- settings card */
  const coreRender = renderProSettings, coreBind = bindProSettings;
  renderProSettings = () => coreRender() + `<div class="card" id="connCard"><h3>Bluetooth, car &amp; casting</h3>
    <div class="row"><button class="nogrow" id="cnBt">Bluetooth devices</button><button class="nogrow" id="cnScan">Scan &amp; pair…</button><button class="nogrow" id="cnOut">Audio output</button></div>
    <div class="row"><button class="nogrow" id="cnCast">Find TVs / speakers</button><button class="nogrow" id="cnMirror">Mirror screen to TV</button><button class="nogrow" id="cnCar">Start car conversation</button></div>
    <div id="cnOutBox" class="hint"></div>
    <label class="inline"><input type="checkbox" data-k="carMessaging" data-t="bool">Answer replies from Android Auto (voice replies to the Nexus conversation go to the agent)</label>
    <label class="inline"><input type="checkbox" data-k="carNarrate" data-t="bool">Read car answers in the narrator voice</label>
    <p class="hint"><b>Car over Bluetooth</b> (e.g. 2015 VW Passat): pair the phone with the car once; Nexus audio (answers, audiobooks, narration) then plays through the car speakers, the title shows on the dash display, and the steering-wheel next/previous/pause buttons control Nexus. <b>Android Auto</b>: Nexus appears as a media app (audiobooks, narrations, "Ask Nexus") and a messaging app. Sideloaded apps only show in Android Auto after enabling <i>Unknown sources</i> in Android Auto's developer settings. <b>TVs</b>: DLNA smart TVs play files directly; Chromecast / Google TV / screen mirroring use the system Cast panel.</p></div>`;
  bindProSettings = v => {
    coreBind(v); const c = $('#connCard', v); if (!c) return; bind(c, S.settings);
    const out = $('#cnOutBox', c); const run = async (name, args = {}) => { out.textContent = '…'; try { out.textContent = await execSkill(name, args, { agent: agentById(S.current) || S.agents[0], depth: 0 }); } catch (e) { out.textContent = e.message; } };
    $('#cnBt', c).onclick = () => run('bluetooth_devices');
    $('#cnOut', c).onclick = () => { run('audio_output'); if (N && N.openOutputSwitcher) N.openOutputSwitcher(); };
    $('#cnCast', c).onclick = () => run('cast_devices');
    $('#cnMirror', c).onclick = () => run('screen_mirror');
    $('#cnCar', c).onclick = () => { if (N && N.carMessage) { N.carMessage('Nexus', 'Hi! Reply to this message to ask me anything while you drive.'); out.textContent = 'Posted — open Android Auto (or the notification) and reply by voice.'; } };
    $('#cnScan', c).onclick = async () => {
      out.textContent = 'Scanning for 12 s — put the device in pairing mode…';
      try {
        await btReady(); const list = await nativeAsync('btScan', 12000);
        if (!list.length) { out.textContent = 'Nothing found.'; return; }
        out.innerHTML = list.map((d, i) => `<div class="row" style="align-items:center"><div>${esc(fmtDev(d))}</div>${d.paired ? '' : `<button class="nogrow" data-pair="${i}">Pair</button>`}</div>`).join('');
        $$('[data-pair]', out).forEach(b => b.onclick = async () => { const d = list[Number(b.dataset.pair)]; b.disabled = true; try { toast((await nativeAsync('btPair', d.address)).result); } catch (e) { toast(e.message); } b.disabled = false; });
      } catch (e) { out.textContent = e.message; }
    };
  };

  window.NexusConnect = { publishCatalog, carAsk };
})();
