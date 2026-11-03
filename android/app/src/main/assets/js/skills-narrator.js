/* Nexus Agent — Narrator: natural, expressive audiobook-style narration.
 *
 * - Narration styles (genre/delivery presets, or your own direction) applied to every AI voice:
 *   OpenAI gpt-4o(-mini)-tts gets them as voice instructions, ElevenLabs as voice settings.
 * - Narrator voice finder: browse ElevenLabs' Voice Library — voices their owners chose to share —
 *   filtered for audiobook narration, preview them and add one as your narrator.
 * - Optional: speak chat replies in the narrator voice instead of the device voice.
 *
 * Nexus does not imitate or clone specific real people (celebrities or narrators). Use a voice the
 * owner published or licensed, a stock AI voice, or your own voice (voice_clone_self).
 * Loaded after skills-media.js. */
'use strict';
(() => {
  const P = (props, req = []) => ({ type: 'object', properties: props, required: req });
  const Str = d => ({ type: 'string', description: d });
  const Num = d => ({ type: 'number', description: d });
  const Bool = d => ({ type: 'boolean', description: d });

  const STYLES = {
    audiobook: { name: 'Audiobook — warm & natural', eleven: { stability: 0.45, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true },
      text: 'You are an award-winning audiobook narrator. Speak naturally and warmly, like telling a story to one listener. Vary pace and pitch with the meaning, pause briefly at paragraph breaks and longer at scene breaks, and never sound robotic or rushed.' },
    romantasy: { name: 'Romance / romantasy — intimate, emotive, character voices', eleven: { stability: 0.35, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true },
      text: 'Narrate like a seasoned romance and fantasy audiobook performer: intimate, emotionally present and expressive. Give each character a subtly distinct voice and attitude in dialogue, let tension and banter breathe, soften for tender moments, and keep the narration between dialogue smooth and natural.' },
    fantasy: { name: 'Epic fantasy / LitRPG — dramatic, energetic', eleven: { stability: 0.35, similarity_boost: 0.8, style: 0.5, use_speaker_boost: true },
      text: 'Perform like an energetic fantasy and LitRPG audiobook narrator: vivid, dramatic and fun. Build excitement in action scenes, give characters distinct voices, read system messages or stat blocks in a crisp, slightly different tone, and keep it natural rather than theatrical.' },
    thriller: { name: 'Thriller / mystery — taut, suspenseful', eleven: { stability: 0.5, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
      text: 'Narrate a suspense thriller: controlled, low and tense. Use pauses to build suspense, quicken in action, and drop to near-whisper for secrets. Natural, never melodramatic.' },
    documentary: { name: 'Documentary / non-fiction — clear, authoritative', eleven: { stability: 0.6, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true },
      text: 'Narrate non-fiction like a documentary host: clear, warm, confident and curious. Even pacing, crisp articulation, gentle emphasis on key ideas.' },
    bedtime: { name: 'Bedtime story — soft, slow, soothing', eleven: { stability: 0.6, similarity_boost: 0.75, style: 0.2, use_speaker_boost: false },
      text: 'Read as a soothing bedtime story: soft, slow and gentle, with a smile in the voice and calm pauses.' },
    conversational: { name: 'Conversational — friendly assistant', eleven: { stability: 0.5, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true },
      text: 'Speak like a friendly, natural person talking to a friend: relaxed, warm, with natural rhythm and small pauses. Not like a narrator or announcer.' },
  };
  S.settings = { narratorStyle: 'audiobook', narratorCustom: '', narratorReplies: false, ...S.settings };

  const currentStyle = () => STYLES[S.settings.narratorStyle] || STYLES.audiobook;
  window.narrationParams = () => {
    const st = currentStyle(); const custom = String(S.settings.narratorCustom || '').trim();
    return { instructions: custom ? `${st.text} ${custom}` : st.text, eleven: st.eleven };
  };

  /* ---------------------------------------------------------------- voice library (ElevenLabs shared voices) */
  const elevenKey = () => { const k = getKey('svc_elevenlabs'); if (!k) throw new Error('Add an ElevenLabs API key in Settings → Media & audio'); return k; };
  async function eleven(method, path, body) {
    const r = await http(method, 'https://api.elevenlabs.io' + path, { 'xi-api-key': elevenKey(), Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body ? JSON.stringify(body) : null, 30000);
    const d = parseJSON(r.body, null); if (r.status >= 400 || d == null) throw new Error(`ElevenLabs HTTP ${r.status}: ${clip(r.body, 200)}`); return d;
  }
  async function findVoices({ search = '', gender = '', accent = '', age = '', language = 'en', limit = 12 } = {}) {
    const q = new URLSearchParams({ page_size: String(Math.min(30, limit || 12)), sort: 'trending' });
    if (search) q.set('search', search); if (gender) q.set('gender', gender); if (accent) q.set('accent', accent); if (age) q.set('age', age); if (language) q.set('language', language);
    let d = await eleven('GET', '/v1/shared-voices?' + q + '&use_cases=narrative_story&use_cases=audiobook');
    if (!(d.voices || []).length) d = await eleven('GET', '/v1/shared-voices?' + q);
    return (d.voices || []).map(v => ({ id: v.voice_id, owner: v.public_owner_id, name: v.name, description: clip(v.description || '', 160), gender: v.gender, age: v.age, accent: v.accent, use_case: v.use_case, preview: v.preview_url, uses: v.cloned_by_count }));
  }
  async function useVoice(id, owner, name) {
    const d = await eleven('POST', `/v1/voices/add/${encodeURIComponent(owner)}/${encodeURIComponent(id)}`, { new_name: name || 'Nexus narrator' });
    const vid = d.voice_id || id;
    S.settings.elevenVoice = vid; S.settings.ttsEngine = 'elevenlabs'; save();
    return vid;
  }
  const previewAudio = new Audio();
  function preview(url) { if (!url) return; previewAudio.src = url; previewAudio.play().catch(e => toast(e.message)); }

  /* ---------------------------------------------------------------- narrator voice for chat replies */
  const replyAudio = new Audio(); let replyToken = 0;
  const coreSpeak = speak, coreStop = stopSpeaking;
  speak = text => {
    if (!S.settings.narratorReplies || !N || (S.settings.ttsEngine || 'device') === 'device') return coreSpeak(text);
    const t = plain(text).slice(0, 2400); if (!t) return;
    const my = ++replyToken; coreStop(); replyAudio.pause();
    NexusMedia.textToAudioFile(t, { output: `tmp/reply_${uid()}.mp3`, instructions: STYLES.conversational.text + ' ' + (S.settings.narratorCustom || '') })
      .then(r => { const rm = () => { try { fsx.del(r.path); } catch { /* already gone */ } }; if (my !== replyToken) return rm(); replyAudio.src = wsUrl(r.path) + '?t=' + Date.now(); replyAudio.onended = rm; return replyAudio.play(); })
      .catch(e => { console.warn('narrator reply', e); if (my === replyToken) coreSpeak(text); });   // fall back to the device voice
  };
  stopSpeaking = () => { replyToken++; replyAudio.pause(); coreStop(); };

  /* ---------------------------------------------------------------- skills */
  BUILTIN_SKILLS.push(
    { name: 'narrate', group: 'Narrator', description: 'Narrate text or a workspace document in a natural, expressive audiobook voice (uses the narrator style and voice from Settings → Narrator) and optionally play it. For whole books use audiobook_create.', parameters: P({ text: Str('text to narrate'), path: Str('or a text/markdown file'), style: Str('optional style: ' + Object.keys(STYLES).join(' | ')), direction: Str('optional extra direction, e.g. "slower, Irish lilt for Maeve"'), play: Bool('play when done (default true)') }),
      run: async a => {
        let text = a.text || ''; if (!text && a.path) text = await fsx.readText(a.path); if (!text) throw new Error('Give text or a file path');
        const st = STYLES[a.style] || currentStyle(); const prev = S.settings.narratorStyle;
        if (STYLES[a.style]) S.settings.narratorStyle = a.style;
        try {
          const r = await NexusMedia.textToAudioFile(text, { output: `audio/narration_${tsName()}.mp3`, instructions: a.direction ? `${st.text} ${a.direction}` : undefined, engine: (S.settings.ttsEngine || 'device') === 'device' ? undefined : S.settings.ttsEngine });
          if (a.play !== false) await NexusMedia.playFile(r.path, 'Narration');
          return `Narrated (${st.name}, ${r.engine}) → ${r.path}${S.settings.ttsEngine === 'device' ? '\nTip: the offline device voice ignores narration styles — choose ElevenLabs or an AI provider voice in Settings → Media & audio for natural narration.' : ''}`;
        } finally { S.settings.narratorStyle = prev; }
      } },
    { name: 'narrator_voices', group: 'Narrator', description: 'Find natural narrator voices in the ElevenLabs Voice Library (voices their owners chose to share), filtered for audiobook narration. Describe the sound you want (e.g. "warm young American female, romance"). Does not imitate specific real people.', parameters: P({ search: Str('describe the voice: tone, genre, accent'), gender: Str('female | male | neutral'), accent: Str('e.g. american, british, australian'), age: Str('young | middle_aged | old'), limit: Num('max results (default 10)') }),
      run: async a => { const v = await findVoices({ ...a, limit: a.limit || 10 }); if (!v.length) return 'No voices found — try a broader description.'; return v.map((x, i) => `${i + 1}. ${x.name} — ${[x.gender, x.age, x.accent].filter(Boolean).join(', ')}${x.description ? ': ' + x.description : ''} [voice ${x.id}, owner ${x.owner}]`).join('\n') + '\nUse narrator_set_voice with the voice and owner ids to make one your narrator.'; } },
    { name: 'narrator_set_voice', group: 'Narrator', description: 'Make a voice your narrator: a Voice Library voice (voice id + owner id from narrator_voices, added to your ElevenLabs account) or a voice id already in your account. Switches text-to-audio to ElevenLabs.', parameters: P({ voice_id: Str('voice id'), owner_id: Str('public owner id (Voice Library voices)'), name: Str('optional name'), style: Str('optional narration style') }, ['voice_id']),
      run: async a => {
        const ok = await confirmBox(`Set <b>${esc(a.name || a.voice_id)}</b> as your narrator voice${a.owner_id ? ' (adds it to your ElevenLabs account)' : ''}?`); if (!ok) return 'Cancelled.';
        const vid = a.owner_id ? await useVoice(a.voice_id, a.owner_id, a.name) : (S.settings.elevenVoice = a.voice_id, S.settings.ttsEngine = 'elevenlabs', save(), a.voice_id);
        if (STYLES[a.style]) { S.settings.narratorStyle = a.style; save(); }
        return `Narrator voice set (${vid}). Audiobooks, text_to_audio and narrate now use it${S.settings.narratorReplies ? ', and so do spoken replies' : ''}.`;
      } },
    { name: 'narrator_style', group: 'Narrator', description: 'Show or change the narration style (genre/delivery preset) and extra direction used for all AI narration.', parameters: P({ style: Str('one of: ' + Object.keys(STYLES).join(' | ')), direction: Str('optional extra direction ("" clears)'), replies: Bool('also speak chat replies in the narrator voice') }),
      run: async a => {
        if (a.style) { if (!STYLES[a.style]) return 'Unknown style. Options: ' + Object.keys(STYLES).join(', '); S.settings.narratorStyle = a.style; }
        if (a.direction != null) S.settings.narratorCustom = a.direction; if (a.replies != null) S.settings.narratorReplies = !!a.replies; save();
        return `Style: ${currentStyle().name}${S.settings.narratorCustom ? ` + "${S.settings.narratorCustom}"` : ''} · replies in narrator voice: ${S.settings.narratorReplies ? 'on' : 'off'} · engine: ${S.settings.ttsEngine}`;
      } },
  );

  /* ---------------------------------------------------------------- settings card */
  const coreRender = renderProSettings, coreBind = bindProSettings;
  renderProSettings = () => coreRender() + `<div class="card" id="narrCard"><h3>Narrator</h3>
    <p class="hint">Natural, expressive narration for audiobooks, text-to-audio and (optionally) replies. Works with ElevenLabs or OpenAI <code>gpt-4o-mini-tts</code> voices (Settings → Media &amp; audio); the offline device voice can't follow styles.</p>
    <div class="row"><div><label>Narration style</label><select data-k="narratorStyle">${Object.entries(STYLES).map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join('')}</select></div>
    <div><label>Extra direction (optional)</label><input data-k="narratorCustom" placeholder="e.g. a touch slower; light Scottish accent for Callum"></div></div>
    <label class="inline"><input type="checkbox" data-k="narratorReplies" data-t="bool">Speak chat replies in the narrator voice (needs internet; falls back to the device voice)</label>
    <h3 style="margin-top:.7em">Find a narrator voice</h3>
    <div class="row"><div><label>Describe the voice</label><input id="nvQ" placeholder="warm young female, romance, American"></div><div><label>Gender</label><select id="nvG"><option value="">any</option><option>female</option><option>male</option><option>neutral</option></select></div><div><label>Accent</label><input id="nvA" placeholder="any"></div></div>
    <div class="row"><button class="nogrow" id="nvGo">Search Voice Library</button><button class="nogrow" id="nvTest">▶ Test current narrator</button></div>
    <div id="nvList"></div>
    <p class="hint">Voices come from ElevenLabs' library of voices shared by their owners. Nexus won't imitate or clone specific real people (celebrities or narrators) — pick a published voice, a stock voice, or your own (Trust → voice_clone_self).</p></div>`;
  bindProSettings = v => {
    coreBind(v); const c = $('#narrCard', v); if (!c) return; bind(c, S.settings);
    $('#nvGo', c).onclick = async () => {
      const list = $('#nvList', c); list.innerHTML = '<p class="hint">Searching…</p>';
      try {
        const res = await findVoices({ search: $('#nvQ', c).value.trim(), gender: $('#nvG', c).value, accent: $('#nvA', c).value.trim(), limit: 12 });
        list.innerHTML = res.length ? res.map((x, i) => `<div class="row" style="align-items:center"><div><b>${esc(x.name)}</b> <span class="hint">${esc([x.gender, x.age, x.accent].filter(Boolean).join(' · '))}</span><br><span class="hint">${esc(x.description)}</span></div><button class="nogrow" data-pv="${i}">▶</button><button class="primary nogrow" data-use="${i}">Use</button></div>`).join('') : '<p class="hint">No voices found.</p>';
        $$('[data-pv]', list).forEach(b => b.onclick = () => preview(res[Number(b.dataset.pv)].preview));
        $$('[data-use]', list).forEach(b => b.onclick = async () => { const x = res[Number(b.dataset.use)]; try { await useVoice(x.id, x.owner, x.name); toast(`Narrator: ${x.name}`); } catch (e) { toast(e.message); } });
      } catch (e) { list.innerHTML = `<p class="hint">${esc(e.message)}</p>`; }
    };
    $('#nvTest', c).onclick = async () => {
      try { toast('Narrating sample…'); const r = await NexusMedia.textToAudioFile('The rain had finally stopped. She stepped onto the balcony, and for the first time in years, the city sounded like it was holding its breath — waiting for her.', { output: `tmp/narr_test_${uid()}.mp3` }); await NexusMedia.playFile(r.path, 'Narrator test'); }
      catch (e) { toast(e.message); }
    };
  };

  window.NexusNarrator = { STYLES, findVoices, useVoice, params: () => window.narrationParams() };
})();
