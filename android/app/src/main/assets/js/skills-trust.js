/* Nexus Agent — Verizon Cloud integration, deepfake / AI-media detection and provenance,
 * (offline provenance + vision-model review), and consent-gated synthetic media of the user's OWN voice and face. Loaded after skills-dev.js.
 *
 * Policy: no face-swapping or voice cloning of other people. Generation is limited to the
 * user's own likeness (or documented consent), requires an explicit confirmation every time
 * that cannot be auto-approved, and outputs are labelled AI-generated. */
'use strict';
(() => {
  const P = (props, req = []) => ({ type: 'object', properties: props, required: req });
  const Str = d => ({ type: 'string', description: d });
  const Num = d => ({ type: 'number', description: d });
  const Bool = d => ({ type: 'boolean', description: d });
  const Arr = (d, items = { type: 'string' }) => ({ type: 'array', items, description: d });
  const J = o => JSON.stringify(o, null, 1);
  S.myVoices = S.myVoices || [];
  S.consentLog = S.consentLog || [];
  // Sightengine/Hive integrations were removed: forget any keys saved by earlier versions.
  ['svc_sightengine', 'svc_hive'].forEach(k => { if (getKey(k)) setKey(k, ''); });

  /* ================================================================== Verizon Cloud */
  const VZ_PKGS = ['com.vcast.mediamanager'];
  function verizonApp() {
    if (!N) return null;
    const apps = parseJSON(N.listApps(), []);
    return apps.find(a => VZ_PKGS.includes(a.package)) || apps.find(a => /verizon cloud/i.test(a.label));
  }
  async function toGallery(paths, folder) {
    needNative('Saving to the device');
    const out = [];
    for (const p of paths.slice(0, 100)) { const r = await nativeAsync('saveToMediaStore', JSON.stringify({ path: cleanPath(p), folder: folder || 'Nexus' })); out.push(r.location); }
    return out;
  }

  /* ================================================================== provenance & detection */
  const GENERATORS = ['Midjourney', 'DALL-E', 'DALL·E', 'OpenAI', 'Stable Diffusion', 'stable-diffusion', 'ComfyUI', 'Adobe Firefly', 'Firefly', 'Imagen', 'Gemini', 'FLUX', 'Leonardo', 'NovelAI', 'Ideogram', 'Runway', 'Sora', 'Kling', 'Pika', 'HeyGen', 'Synthesia', 'D-ID', 'ElevenLabs', 'Grok', 'Aurora', 'Recraft', 'Playground'];
  async function provenance(path) {
    const bytes = await fsx.bytes(path);
    const take = bytes.length > 24e6 ? [bytes.subarray(0, 8e6), bytes.subarray(bytes.length - 2e6)] : [bytes];
    let s = ''; for (const part of take) for (let i = 0; i < part.length; i += 32768) s += String.fromCharCode.apply(null, part.subarray(i, i + 32768));
    const has = re => re.test(s);
    const found = { contentCredentials: has(/c2pa|jumb/), declaredAI: has(/trainedAlgorithmicMedia/) && !has(/compositeWithTrainedAlgorithmicMedia/), declaredAIEdited: has(/compositeWithTrainedAlgorithmicMedia/), declaredSynthetic: has(/algorithmicMedia/) && !has(/trainedAlgorithmicMedia/),
      generators: GENERATORS.filter(g => s.includes(g)).filter((g, _, all) => !all.some(o => o !== g && o.includes(g))), sdParameters: has(/parameters[\s\S]{0,40}Steps: \d+/) || has(/"class_type"/), exif: has(/Exif\0\0/), editors: ['Photoshop', 'Lightroom', 'GIMP', 'Snapseed', 'FaceApp', 'Facetune', 'Remini'].filter(g => s.includes(g)) };
    const notes = [];
    if (found.declaredAI) notes.push('File metadata declares it AI-generated (IPTC "trainedAlgorithmicMedia").');
    if (found.declaredAIEdited) notes.push('Metadata declares it was edited with generative AI.');
    if (found.contentCredentials) notes.push('Contains Content Credentials (C2PA) — verify the full history at contentcredentials.org/verify.');
    if (found.sdParameters) notes.push('Contains Stable Diffusion / ComfyUI generation parameters.');
    if (found.generators.length) notes.push('Mentions AI tools in metadata: ' + found.generators.join(', ') + '.');
    if (found.editors.length) notes.push('Edited with: ' + found.editors.join(', ') + '.');
    if (!notes.length) notes.push(found.exif ? 'Has camera EXIF data and no AI markers (metadata can be stripped or faked, so this is weak evidence).' : 'No provenance or AI markers found (common for screenshots and re-shared media — not proof either way).');
    return { ...found, notes };
  }
  async function visionForensics(paths, kind, ctx) {
    const prompt = `You are a careful media-forensics analyst. Examine ${kind === 'video' ? 'these frames sampled in order from one video' : 'this image'} for signs of AI generation, face swapping or manipulation: inconsistent lighting/shadows/reflections, warped or merged features (hands, teeth, ears, jewelry, glasses), mismatched skin texture or face boundary blending, garbled text, impossible geometry, repeated patterns, ${kind === 'video' ? 'flicker or identity drift between frames, lip/face boundary artifacts, ' : ''}compression inconsistencies. Respond ONLY with JSON: {"likelihood": 0-100, "verdict": "likely authentic" | "uncertain" | "likely AI-generated or manipulated", "signals": [short strings], "caveats": "short"}`;
    const raw = await visionAsk(paths, prompt, ctx);
    const m = raw.match(/\{[\s\S]*\}/); const j = m ? parseJSON(m[0], null) : null;
    return j ? { source: 'Vision model review', ...j } : { source: 'Vision model review', note: clip(raw, 600) };
  }
  function verdict(prov, vis) {
    if (prov.declaredAI || prov.sdParameters) return 'AI-generated (declared in the file itself)';
    if (prov.declaredAIEdited) return 'Edited with generative AI (declared in the file itself)';
    if (vis && typeof vis.likelihood === 'number') return `${vis.verdict || 'uncertain'} (visual review ${vis.likelihood}/100 — a hint, not proof)`;
    return 'Inconclusive — no provenance markers and no visual review available';
  }

  /* ================================================================== consent gate for synthetic media */
  async function requireConsent(kind, files) {
    const html = `<h3>⚠️ Synthetic media of a real person</h3><p>You are about to create a <b>${esc(kind)}</b> from: <code>${esc(files.join(', '))}</code></p>
      <p>Only continue if <b>this is your own ${kind.includes('voice') ? 'voice' : 'face'}</b>, or you have the person's <b>explicit, documented permission</b>. Don't use the result to deceive, impersonate, defraud, harass, or to make sexual or political content about anyone. The output will be labelled AI-generated.</p>
      <p class="hint">This confirmation can't be skipped or set to always allow.</p>`;
    if (N && N.bringToFront) N.bringToFront();
    const ok = await confirmBox(html, 120000);
    S.consentLog.push({ ts: Date.now(), kind, files, granted: !!ok }); S.consentLog = S.consentLog.slice(-100); save();
    if (!ok) throw new Error('Consent not given — nothing was created.');
  }

  /* ================================================================== skills */
  BUILTIN_SKILLS.push(
    /* ---------------- Device storage (used by cloud backup apps) */
    { name: 'file_save_to_device', group: 'Files', description: 'Save workspace files into the phone\'s shared storage (photos → Pictures/Nexus, videos → Movies/Nexus, audio → Music/Nexus, other → Download/Nexus) so the gallery and cloud backup apps (Verizon Cloud, Google Photos, Samsung Cloud) include them.', parameters: P({ paths: Arr('workspace files'), folder: Str('subfolder name, default Nexus') }, ['paths']),
      run: async a => 'Saved:\n' + (await toGallery(a.paths, a.folder)).map(x => '  ' + x).join('\n') },

    /* ---------------- Verizon Cloud */
    { name: 'verizon_cloud', group: 'Verizon Cloud', description: 'Verizon Cloud: status (installed, how uploads/downloads work), upload (send workspace files to the Verizon Cloud app), backup (save files to the device gallery/Downloads so Verizon Cloud auto-backup includes them), open (the app). To bring files FROM Verizon Cloud: in the app select them → Share → Nexus Agent (they land in Files/imports), or use screen control to operate the app.', parameters: P({ action: Str('status | upload | backup | open'), paths: Arr('workspace files for upload/backup'), folder: Str('backup subfolder') }, ['action']),
      run: async a => {
        needNative('Verizon Cloud');
        const app = verizonApp();
        if (a.action === 'status') {
          let shares = '';
          if (app) { try { const r = await nativeAsync('apk', JSON.stringify({ op: 'integrations', ref: app.package })); shares = [...new Set(r.shareTargets.map(s => s.mimeType))].join(', '); } catch { /* optional */ } }
          return app ? `Verizon Cloud app installed (${app.label}, ${app.package}).\n• Upload: send files to it${shares ? ` (accepts: ${shares})` : ''}.\n• Automatic backup: files saved with action "backup" go to the gallery/Downloads, which Verizon Cloud backs up when backup is on in its settings.\n• Download: in Verizon Cloud select items → Share → Nexus Agent, or let an agent do it with screen control (screen_open_app "Verizon Cloud").\nVerizon offers no public API, so Nexus works through the app.` : 'Verizon Cloud app is not installed. Install it from the Play Store (or use the web version at verizon.com). Files saved with action "backup" will still be backed up once it is set up.';
        }
        if (a.action === 'open') { if (app && N.launchApp(app.package)) return 'Opened Verizon Cloud.'; N.openUrl('https://play.google.com/store/apps/details?id=com.vcast.mediamanager'); return 'Verizon Cloud is not installed — opened its Play Store page.'; }
        if (!a.paths || !a.paths.length) throw new Error('paths required');
        if (a.action === 'backup') return 'Saved for backup:\n' + (await toGallery(a.paths, a.folder)).map(x => '  ' + x).join('\n') + '\nVerizon Cloud will back these up on its next sync (if photo/video/document backup is enabled in the app).';
        if (a.action === 'upload') {
          if (!app) return 'Verizon Cloud app is not installed. Use action "backup" (auto-backup) or install the app first.';
          const r = N.shareFilesTo(JSON.stringify({ paths: a.paths.map(cleanPath), package: app.package }));
          if (r === 'ok') return `Verizon Cloud opened with ${a.paths.length} file(s) — confirm the upload there.`;
          const saved = await toGallery(a.paths, a.folder); return `Verizon Cloud didn't accept a direct share (${r}), so the files were saved for its automatic backup instead:\n` + saved.map(x => '  ' + x).join('\n');
        }
        return 'Unknown action.';
      } },

    /* ---------------- Deepfake & AI-media detection */
    { name: 'deepfake_check', group: 'Deepfake detection', description: 'Check whether an image, video or audio file (workspace path or URL) is AI-generated, deepfaked or manipulated: provenance/metadata (C2PA Content Credentials, AI tool markers), and a visual forensic review by the vision model. Reports a verdict with evidence and caveats.', parameters: P({ path: Str('workspace file'), url: Str('or a media URL') }),
      run: async (a, ctx) => {
        let path = a.path ? cleanPath(a.path) : null;
        if (!path && a.url) { needNative('Downloads'); path = (await nativeAsync('download', JSON.stringify({ url: a.url, path: `checks/${(new URL(a.url).pathname.split('/').pop() || 'media').replace(/[^\w.-]/g, '_')}` }))).path; }
        if (!path) throw new Error('path or url required');
        const e = extOf(path); const kind = isImagePath(path) ? 'image' : /^(mp4|webm|mov|mkv|3gp)$/.test(e) ? 'video' : /^(mp3|m4a|wav|ogg|aac|flac|opus)$/.test(e) ? 'audio' : 'other';
        const prov = await provenance(path);
        const errs = [];
        let vis = null;
        try {
          if (kind === 'image') vis = await visionForensics([path], 'image', ctx);
          else if (kind === 'video') { const fr = await nativeAsync('video', JSON.stringify({ op: 'frames', path, count: 6, maxWidth: 768 })); vis = await visionForensics(fr.frames.map(f => f.path), 'video', ctx); }
        } catch (err) { errs.push('vision: ' + err.message); }
        const out = { file: path, type: kind, verdict: verdict(prov, vis), provenance: prov.notes, visual_review: vis || (kind === 'audio' ? 'not available for audio — check the source and context instead' : 'unavailable'), errors: errs.length ? errs : undefined,
          caveat: 'No detector is perfect: compression, screenshots and new generators cause false results. For anything important, look for the original source (reverse_image_search) and trusted reporting.' };
        return J(out);
      } },
    { name: 'media_provenance', group: 'Deepfake detection', description: 'Quick, offline provenance check of a media file: Content Credentials (C2PA), IPTC "AI-generated" declarations, AI tool and editor markers, camera EXIF.', parameters: P({ path: Str('workspace file') }, ['path']),
      run: async a => J(await provenance(cleanPath(a.path))) },
    { name: 'reverse_image_search', group: 'Deepfake detection', description: 'Find where an image came from (original source, earlier versions, fact-checks): opens Google Lens with the image, or Lens/TinEye on the web.', parameters: P({ path: Str('workspace image') }, ['path']),
      run: async a => { needNative(); const r = N.shareFilesTo(JSON.stringify({ paths: [cleanPath(a.path)], package: 'com.google.android.googlequicksearchbox' })); if (r === 'ok') return 'Opened Google Lens with the image — look for "Find image source" / "About this image".'; N.openUrl('https://lens.google.com/'); return 'Google app not available — opened Lens on the web (upload the image there; TinEye at tineye.com works too).'; } },

    /* ---------------- Synthetic media of YOURSELF (consent-gated) */
    { name: 'voice_clone_self', group: 'Synthetic media (self)', description: 'Create a clone of the USER\'S OWN voice with ElevenLabs from their recordings (1–25 clean samples, ≥1 min total), for their own text-to-audio. Never for another person\'s voice without their documented permission; requires the user\'s explicit confirmation every time.', parameters: P({ samples: Arr('workspace audio recordings of the user\'s own voice'), name: Str('voice name'), use_as_default: Bool('use for text_to_audio from now on') }, ['samples', 'name']),
      run: async a => {
        needNative('Voice cloning'); const key = getKey('svc_elevenlabs'); if (!key) throw new Error('Add an ElevenLabs API key in Settings → Media & audio');
        await requireConsent('voice clone', a.samples);
        const r = await nativeAsync('upload', JSON.stringify({ url: 'https://api.elevenlabs.io/v1/voices/add', headers: { 'xi-api-key': key }, fields: { name: `${a.name} (self, AI)`, description: 'Owner\'s own voice, created with consent via Nexus Agent' }, files: a.samples.slice(0, 25).map(p => ({ field: 'files', path: cleanPath(p) })) }));
        const d = parseJSON(r.body, {}); if (!d.voice_id) throw new Error('ElevenLabs: ' + clip(r.body, 200));
        S.myVoices.push({ id: d.voice_id, name: a.name, provider: 'elevenlabs', created: Date.now() });
        if (a.use_as_default) { S.settings.elevenVoice = d.voice_id; S.settings.ttsEngine = 'elevenlabs'; }
        save(); return `Created your voice "${a.name}" (id ${d.voice_id})${a.use_as_default ? ' and set it as the text-to-audio voice' : ''}. Label audio made with it as AI-generated when sharing.`;
      } },
    { name: 'avatar_video_self', group: 'Synthetic media (self)', description: 'Make a talking-avatar video from the USER\'S OWN photo speaking a script (D-ID), e.g. a video message or intro. Never for another person\'s face without their documented permission; requires explicit confirmation every time; output is labelled AI-generated.', parameters: P({ photo: Str('workspace photo of the user (front-facing)'), script: Str('what the avatar says'), voice: Str('optional Microsoft voice id, e.g. en-US-JennyNeural / en-US-GuyNeural') }, ['photo', 'script']),
      run: async a => {
        needNative('Avatar video'); const key = getKey('svc_did'); if (!key) throw new Error('Add a D-ID API key in Settings → Synthetic media of yourself');
        await requireConsent('talking-avatar video', [a.photo]);
        const auth = { Authorization: 'Basic ' + key };
        const up = await nativeAsync('upload', JSON.stringify({ url: 'https://api.d-id.com/images', headers: auth, files: [{ field: 'image', path: cleanPath(a.photo) }] }));
        const img = parseJSON(up.body, {}); if (!img.url) throw new Error('D-ID image upload failed: ' + clip(up.body, 200));
        const t = await postJSON('https://api.d-id.com/talks', auth, { source_url: img.url, script: { type: 'text', input: a.script, provider: { type: 'microsoft', voice_id: a.voice || 'en-US-JennyNeural' } }, config: { stitch: true } });
        let st = t; const until = Date.now() + 4 * 60000;
        while (Date.now() < until && !['done', 'error', 'rejected'].includes(st.status)) { await sleep(3000); st = parseJSON((await http('GET', `https://api.d-id.com/talks/${t.id}`, auth, null, 30000)).body, st); }
        if (st.status !== 'done') throw new Error('D-ID: ' + (st.status || 'timeout') + (st.error ? ' — ' + JSON.stringify(st.error).slice(0, 160) : ''));
        const r = await nativeAsync('download', JSON.stringify({ url: st.result_url, path: `synthetic/avatar_${tsName()}_AI-generated.mp4` }));
        return `Created ${r.path} (AI-generated avatar of your photo). Disclose that it is AI-generated wherever you share it.`;
      } },
    { name: 'my_synthetic_media', group: 'Synthetic media (self)', description: 'List your cloned voices and AI avatar videos, or delete a cloned voice from ElevenLabs.', parameters: P({ action: Str('list | delete_voice'), voice: Str('voice name or id for delete') }, ['action']),
      run: async a => {
        if (a.action === 'delete_voice') { const v = S.myVoices.find(x => x.id === a.voice || x.name.toLowerCase() === String(a.voice).toLowerCase()); if (!v) return 'Voice not found.'; await http('DELETE', `https://api.elevenlabs.io/v1/voices/${v.id}`, { 'xi-api-key': getKey('svc_elevenlabs') }, null, 20000); S.myVoices = S.myVoices.filter(x => x !== v); if (S.settings.elevenVoice === v.id) S.settings.elevenVoice = '21m00Tcm4TlvDq8ikWAM'; save(); return `Deleted voice "${v.name}".`; }
        let vids = []; try { vids = fsx.list('synthetic', true).filter(f => !f.dir).map(f => f.path); } catch { /* none */ }
        return `Voices: ${S.myVoices.map(v => `${v.name} (${v.id})`).join(', ') || 'none'}\nAvatar videos: ${vids.join(', ') || 'none'}\nConsent records: ${S.consentLog.filter(c => c.granted).length}`;
      } },
  );

  /* ================================================================== settings */
  const coreRenderPro = renderProSettings, coreBindPro = bindProSettings;
  renderProSettings = () => coreRenderPro() + `<div class="card" id="trustCard"><h3>Synthetic media of yourself</h3>
    <p class="hint">Voice cloning (ElevenLabs key in Media &amp; audio) and talking avatars (D-ID) are limited to <b>your own</b> voice and face, need confirmation every time, and are labelled AI-generated. Face swaps and cloning other people are not supported.</p>
    <div class="row"><div><label>D-ID API key</label><input type="password" data-secret="svc_did" placeholder="${getKey('svc_did') ? 'saved ✓' : ''}"></div></div>
  </div>`;
  bindProSettings = v => {
    coreBindPro(v);
    const card = $('#trustCard', v); if (!card) return;
    $$('[data-secret]', card).forEach(el => el.addEventListener('change', () => { setKey(el.dataset.secret, el.value); el.value = ''; el.placeholder = 'saved ✓'; toast('Saved on device'); }));
  };
  { const coreSecrets = secretIds; secretIds = () => [...coreSecrets(), { id: 'svc_did', name: 'D-ID API key' }]; }

  window.NexusTrust = { provenance, verdict };
})();
