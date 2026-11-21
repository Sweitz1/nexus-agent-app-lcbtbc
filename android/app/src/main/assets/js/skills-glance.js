/* Halo: glance card. A translucent listening/answer card drawn over whatever app is in
 * front (video keeps playing behind it), with the user's character as a chibi sticker or a
 * full-body portrait. Opened by the wake word, tap-to-talk, the assistant key or a learned
 * temple-hold key. Tap = done / ask again, double tap = cancel / close.
 * Loaded after skills-companion.js. */
'use strict';
(() => {
  const st = () => S.settings;
  const D = { glanceEnabled: false, glanceLayout: 'chibi', glanceCharacter: '', glanceAgent: '', glanceFontSize: 20, glanceAutoClose: 30, glanceSpeak: true, glanceKey: 0, glanceKeyName: '', glanceAnchor: 'head', glanceInvert: false, glancePpd: 21 };
  Object.keys(D).forEach(k => { if (st()[k] === undefined) st()[k] = D[k]; });
  // Keys that the temple-hold trigger must never swallow (they drive normal navigation).
  const RESERVED = new Set([4, 19, 20, 21, 22, 23, 61, 66, 111, 160]);
  const native = () => !!(N && N.glanceShow);

  const G = {
    state: 'idle', token: 0, closeTimer: null, base: {},
    enabled: () => !!st().glanceEnabled && native(),
    agent: () => agentById(st().glanceAgent) || agentById(S.current) || S.agents[0],
    character() { const C = window.HaloCharacters; return C && st().glanceCharacter ? C.get(st().glanceCharacter) : null; },
    post(u) { if (N && N.glancePost) N.glancePost(JSON.stringify(u)); },
    open() {
      const r = parseJSON(N.glanceShow(), {});
      if (r.error) { toast(r.error); return false; }
      const c = G.character();
      G.base = { layout: st().glanceLayout, agent: G.agent().name, fontSize: Number(st().glanceFontSize) || 20,
        sticker: c ? (c.sticker || c.avatar || '') : '', portrait: c ? (c.portrait || '') : '',
        anchor: st().glanceAnchor, invert: !!st().glanceInvert, ppd: Number(st().glancePpd) || 21,
        stereo: !!(N.getStereo && parseJSON(N.getStereo(), {}).active) };
      if (N.glancePose) N.glancePose(st().glanceAnchor === 'world');
      return true;
    },
    close() { G.token++; G.state = 'idle'; clearTimeout(G.closeTimer); try { N.stopListening(); } catch {} if (N && N.glanceHide) N.glanceHide(); },
    armClose() { clearTimeout(G.closeTimer); const s = Number(st().glanceAutoClose) || 0; if (s > 0) G.closeTimer = setTimeout(() => { if (G.state === 'answer') G.close(); }, s * 1000); },
    /** Opens the card and listens. Returns false when the glance is off (callers fall back). */
    start(source = 'key') {
      if (!G.enabled()) return false;
      if (G.state !== 'idle' && G.state !== 'answer') return true;
      if (!G.open()) return false;
      G.listen();
      return true;
    },
    async listen() {
      const my = ++G.token; G.state = 'listening'; clearTimeout(G.closeTimer); stopSpeaking();
      G.post({ ...G.base, state: 'listening', transcript: '', rms: 0.1 });
      if (N.vibrate) N.vibrate(30);
      let text = '';
      try {
        if (!(await ensurePermission('android.permission.RECORD_AUDIO'))) throw new Error('Microphone permission is off');
        text = (await nativeAsync('listen', st().voiceLang || '')).text || '';
      } catch (e) { if (my !== G.token) return; return G.show({ state: 'error', question: '', answer: e.message || 'Couldn\'t listen' }); }
      if (my !== G.token) return;
      G.ask(text);
    },
    async ask(text) {
      const my = ++G.token; text = String(text || '').trim();
      if (!text) return G.show({ state: 'error', question: '', answer: 'I didn\'t catch that. Tap to try again.' });
      G.state = 'thinking'; G.post({ ...G.base, state: 'thinking', question: text });
      try {
        const res = await runAgent(G.agent(), text, { origin: 'glance', token: runToken });
        if (my !== G.token) return;
        const answer = clip(plain(stripThink(res.text)), 420);
        G.show({ state: 'answer', question: text, answer, actions: actionChips(res.steps || []) });
        if (st().glanceSpeak) speak(answer);
      } catch (e) { if (my !== G.token) return; G.show({ state: 'error', question: text, answer: e.message }); }
    },
    show(u) { G.state = 'answer'; G.post({ ...G.base, ...u }); G.armClose(); },
    action(a) {
      if (G.state === 'listening') { if (a === 'tap') { try { N.stopListening(); } catch {} } else G.close(); return; }
      if (G.state === 'thinking') { if (a === 'double') { runToken++; G.close(); } return; }
      if (G.state === 'answer') { if (a === 'tap') G.listen(); else G.close(); }
    },
    /** Wake-word events; returns true when the glance handled them. */
    wake(e) {
      if (!G.enabled()) return false;
      if (e.phase === 'wake' || e.phase === 'tap') {
        if (e.text === 'handoff' || e.phase === 'tap') { G.start('wake'); return true; }
        if (!G.open()) return false;            // the wake service transcribes the command itself
        G.token++; G.state = 'listening'; G.post({ ...G.base, state: 'listening', transcript: '', rms: 0.15 }); return true;
      }
      if (G.state === 'listening' && e.phase === 'partial') { G.post({ transcript: e.text || '' }); return true; }
      if (G.state === 'listening' && e.phase === 'command') { G.ask(e.text); return true; }
      return false;
    },
    preview() {
      if (!native()) return toast('The glance card needs the Android app');
      if (!G.open()) return;
      G.state = 'answer';
      const q = 'Will it rain before my 6 pm dinner?';
      G.post({ ...G.base, state: 'listening', transcript: 'Will it rain before my 6 pm din', rms: 0.6 });
      setTimeout(() => G.show({ state: 'answer', question: q, answer: 'No rain today. Sunny until about 4, then cloudy and 15° by 6 pm. A light jacket is enough.', actions: [{ label: 'Leave-by reminder · 5:25 pm' }] }), 2500);
    },
  };
  window.HaloGlanceUI = G;

  // Friendly labels for what the agent did ("✓ chips" on the answer card).
  const READ_ONLY = /^(web_search|web_fetch|weather|maps_search|memory_search|skill_list|skill_load|skill_read_file|arkon_search|arkon_read|character_list|glasses_status|head_pose|calendar_list|calendar_events|calendar_find_free_time|calendar_list_calendars|memory_recall|email_list|email_read|notifications_read|note)$/;
  function actionChips(steps) {
    const nice = s => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return steps.filter(s => s && s.name && !READ_ONLY.test(s.name) && !/^error|declined/i.test(String(s.result || '')))
      .slice(-3).map(s => {
        const a = s.args || {}; const when = a.time || a.at || a.when || a.start || '';
        const what = a.title || a.text || a.name || a.query || a.action || '';
        let label = nice(s.name);
        if (what) label += ' · ' + clip(String(what), 28);
        if (when) label += ' · ' + clip(String(when), 16);
        return { label };
      });
  }

  /* ---------------------------------------------------------------- native events */
  onNative('glance', p => G.action(p.action));
  onNative('glance_trigger', () => G.start('temple'));
  onNative('speech_partial', p => { if (G.state === 'listening') G.post({ transcript: p.text || '' }); });
  onNative('speech_rms', p => { if (G.state === 'listening') G.post({ rms: Number(p.v) || 0 }); });
  onNative('glance_key', p => {
    const code = Number(p.code) || 0;
    if (RESERVED.has(code)) return toast(`${p.name} is used for navigation. Hold a different button.`);
    st().glanceKey = code; st().glanceKeyName = p.name || String(code); save();
    if (N && N.setGlanceKey) N.setGlanceKey(code);
    toast('Temple hold set: ' + st().glanceKeyName); if (currentTab === 'settings') renderSettings();
  });
  const sync = () => { if (!N) return; if (N.setGlanceMode) N.setGlanceMode(!!st().glanceEnabled); if (N.setGlanceKey) N.setGlanceKey(st().glanceEnabled ? Number(st().glanceKey) || 0 : 0); };
  setTimeout(sync, 800);

  /* ---------------------------------------------------------------- Settings card */
  const _renderSettings = renderSettings;
  window.renderSettings = renderSettings = function () {
    _renderSettings();
    const v = $('#view-settings'); if (!v) return;
    const chars = (window.HaloCharacters ? window.HaloCharacters.visible() : []);
    const perm = native() ? N.glanceAvailable() : false;
    const screen = !!(N && N.screenEnabled && N.screenEnabled());
    const card = document.createElement('div'); card.className = 'card';
    card.innerHTML = `<h3>Glance card</h3>
      <p class="hint">Hold the temple (or say the wake word) to ask without leaving what you're watching: a see-through card shows what you say and the answer, with your character beside it. Tap = done / ask again, double tap = cancel / close.</p>
      <label class="inline"><input type="checkbox" id="glOn" ${st().glanceEnabled ? 'checked' : ''}>Use the glance card for voice</label>
      <div class="row"><span class="hint">${native() ? (perm ? '✓ Can draw over other apps' : '⚠ Needs "Display over other apps"') : 'Android app only'}</span>${native() && !perm ? '<button class="nogrow" id="glPerm">Allow</button>' : ''}</div>
      <div class="row">
        <div><label>Look</label><select id="glLayout"><option value="chibi" ${st().glanceLayout === 'chibi' ? 'selected' : ''}>Chibi above the card</option><option value="portrait" ${st().glanceLayout === 'portrait' ? 'selected' : ''}>Full-body portrait beside the card</option></select></div>
        <div><label>Character</label><select id="glChar"><option value="">(none)</option>${chars.map(c => `<option value="${c.id}" ${c.id === st().glanceCharacter ? 'selected' : ''}>${esc(c.name)}${c.portrait || c.sticker ? '' : ' (no images yet)'}</option>`).join('')}</select></div>
        <div><label>Answers from</label><select id="glAgent"><option value="">(current agent)</option>${S.agents.map(a => `<option value="${a.id}" ${a.id === st().glanceAgent ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div>
      </div>
      <div class="row"><div><label>Position</label><select id="glAnchor"><option value="head" ${st().glanceAnchor !== 'world' ? 'selected' : ''}>Follows your head</option><option value="world" ${st().glanceAnchor === 'world' ? 'selected' : ''}>Pinned in place (head tracking)</option></select></div>
        <div><label>Pin strength (px per degree)</label><input id="glPpd" type="number" min="5" max="60" value="${st().glancePpd}"></div></div>
      <label class="inline"><input type="checkbox" id="glInv" ${st().glanceInvert ? 'checked' : ''}>Reverse motion (if the pinned card moves the wrong way)</label>
      <div class="row"><div><label>Text size (px)</label><input id="glFs" type="number" min="14" max="34" value="${st().glanceFontSize}"></div><div><label>Close answer after (s, 0 = never)</label><input id="glClose" type="number" min="0" max="300" value="${st().glanceAutoClose}"></div></div>
      <label class="inline"><input type="checkbox" id="glSpeak" ${st().glanceSpeak ? 'checked' : ''}>Read answers aloud</label>
      ${N && N.isX3 && N.isX3() ? '<p class="hint">On the X3 Pro, holding the temple opens RayNeo\'s quick menu and its touchpad isn\'t a key, so over other apps use <b>"Hey Halo"</b> or a Bluetooth keyboard/remote button (Learn works for those).</p>' : ''}
      <label>Trigger button (from any app)</label>
      <div class="row"><span class="hint">${st().glanceKey ? 'Set: ' + esc(st().glanceKeyName) : 'Not set'}${screen ? '' : ' · needs Screen control (accessibility) on'}</span><button class="nogrow" id="glLearn">${st().glanceKey ? 'Change' : 'Learn'}</button>${st().glanceKey ? '<button class="nogrow" id="glKeyOff">Clear</button>' : ''}</div>
      <p class="hint">Pick a character's chibi sticker and full-body portrait in Characters → Edit. Transparent PNGs look best.</p>
      <div class="row"><button class="primary nogrow" id="glPreview">Preview</button></div>`;
    v.appendChild(card);
    const set = (k, val) => { st()[k] = val; save(); sync(); };
    $('#glOn').onchange = e => set('glanceEnabled', e.target.checked);
    $('#glLayout').onchange = e => set('glanceLayout', e.target.value);
    $('#glChar').onchange = e => set('glanceCharacter', e.target.value);
    $('#glAgent').onchange = e => set('glanceAgent', e.target.value);
    $('#glFs').onchange = e => set('glanceFontSize', Math.max(14, Math.min(34, Number(e.target.value) || 20)));
    $('#glClose').onchange = e => set('glanceAutoClose', Math.max(0, Number(e.target.value) || 0));
    $('#glSpeak').onchange = e => set('glanceSpeak', e.target.checked);
    $('#glAnchor').onchange = e => set('glanceAnchor', e.target.value);
    $('#glInv').onchange = e => set('glanceInvert', e.target.checked);
    $('#glPpd').onchange = e => set('glancePpd', Math.max(5, Math.min(60, Number(e.target.value) || 21)));
    const pb = $('#glPerm'); if (pb) pb.onclick = () => N.requestOverlayPermission();
    $('#glLearn').onclick = () => { if (!screen) { toast('Turn on Screen control first (accessibility)'); if (N && N.openSettings) N.openSettings('accessibility'); return; } N.learnGlanceKey(true); toast('Now hold the temple button you want to use'); };
    const ko = $('#glKeyOff'); if (ko) ko.onclick = () => { set('glanceKey', 0); st().glanceKeyName = ''; save(); renderSettings(); };
    $('#glPreview').onclick = () => G.preview();
  };
})();
