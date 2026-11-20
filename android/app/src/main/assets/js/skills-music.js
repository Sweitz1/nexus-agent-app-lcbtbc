/* Nexus Agent — music (Spotify Web API, YouTube Music, any app's media session, synced
 * lyrics), display-glasses HUD (Lenovo Legion Glasses / Glasses T1, XREAL, Viture, Rokid,
 * RayNeo Air…) and Meta Ray-Ban / Oakley Meta glasses features. Loaded after skills-screen.js. */
'use strict';
(() => {
  const P = (props, req = []) => ({ type: 'object', properties: props, required: req });
  const Str = d => ({ type: 'string', description: d });
  const Num = d => ({ type: 'number', description: d });
  const Bool = d => ({ type: 'boolean', description: d });
  const J = o => JSON.stringify(o, null, 1);
  const enc = encodeURIComponent;
  const mmss = ms => { const t = Math.max(0, Math.floor((ms || 0) / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

  S.settings = {
    spotifyClientId: '', musicService: 'auto', hudAuto: true, hudReplies: true, hudNotifications: true, hudFontSize: 34, hudSafe: 6,
    metaFolderHint: 'meta|ray-?ban|stella|oakley|glasses', metaVoice: false, tapToTalk: false,
    ...S.settings,
  };

  const MUSIC_APPS = {
    spotify: ['com.spotify.music'], 'youtube music': ['com.google.android.apps.youtube.music'], youtube: ['com.google.android.youtube'],
    plex: ['com.plexapp.android', 'tv.plex.labs.plexamp'], plexamp: ['tv.plex.labs.plexamp'], 'apple music': ['com.apple.android.music'], 'amazon music': ['com.amazon.mp3'],
    pandora: ['com.pandora.android'], soundcloud: ['com.soundcloud.android'], tidal: ['com.aspiro.tidal'], deezer: ['deezer.android.app'],
    audible: ['com.audible.application'], 'pocket casts': ['au.com.shiftyjelly.pocketcasts'], 'google podcasts': ['com.google.android.apps.podcasts'],
  };
  const pkgFor = app => { if (!app) return ''; const a = String(app).toLowerCase().trim(); if (a.includes('.')) return a; const k = Object.keys(MUSIC_APPS).find(x => x === a) || Object.keys(MUSIC_APPS).find(x => a.includes(x) || x.includes(a)); return k ? MUSIC_APPS[k][0] : ''; };
  function openIn(url, pkg) {
    needNative('Opening apps');
    if (pkg && N.startIntent(JSON.stringify({ action: 'android.intent.action.VIEW', data: url, package: pkg })) === 'ok') return 'opened in app';
    return N.openUrl(url) ? 'opened' : 'could not open ' + url;
  }
  const sessions = () => { if (!N || !N.mediaSessions) return []; const r = parseJSON(N.mediaSessions(), []); if (r && r.error) throw new Error(r.error); return r; };

  /* ================================================================== Spotify (Web API, PKCE) */
  const SP_REDIRECT = 'nexusagent://spotify-callback';
  const SP_SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private playlist-modify-private playlist-modify-public user-library-read user-library-modify user-read-recently-played user-top-read';
  const spTok = () => parseJSON(getKey('svc_spotify'), null);
  const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  let spVerifier = null;
  async function spotifyConnect() {
    if (!S.settings.spotifyClientId) throw new Error('Add your Spotify Client ID first: developer.spotify.com/dashboard → Create app → Redirect URI "' + SP_REDIRECT + '" → copy the Client ID into Settings → Music & glasses.');
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'; const rnd = crypto.getRandomValues(new Uint8Array(64));
    spVerifier = Array.from(rnd, b => chars[b % chars.length]).join(''); sessionStorage.setItem('sp_verifier', spVerifier);
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(spVerifier)));
    const url = `https://accounts.spotify.com/authorize?${new URLSearchParams({ client_id: S.settings.spotifyClientId, response_type: 'code', redirect_uri: SP_REDIRECT, code_challenge_method: 'S256', code_challenge: challenge, scope: SP_SCOPES })}`;
    N ? N.openUrl(url) : window.open(url);
    return 'Opened Spotify sign-in. Approve it and you will be sent back to Nexus.';
  }
  async function spTokenRequest(params) {
    const r = await http('POST', 'https://accounts.spotify.com/api/token', { 'Content-Type': 'application/x-www-form-urlencoded' }, new URLSearchParams({ client_id: S.settings.spotifyClientId, ...params }).toString(), 20000);
    const d = parseJSON(r.body, {}); if (!d.access_token) throw new Error('Spotify sign-in failed: ' + (d.error_description || d.error || r.status));
    const old = spTok() || {};
    setKey('svc_spotify', JSON.stringify({ access: d.access_token, refresh: d.refresh_token || old.refresh, exp: Date.now() + (d.expires_in || 3600) * 1000 - 60000 }));
  }
  async function spotifyFinish(code) {
    const verifier = spVerifier || sessionStorage.getItem('sp_verifier'); if (!verifier) throw new Error('Spotify sign-in expired — start again');
    await spTokenRequest({ grant_type: 'authorization_code', code, redirect_uri: SP_REDIRECT, code_verifier: verifier });
    const me = await sp('GET', '/me'); S.settings.spotifyUser = me.display_name || me.id; S.settings.spotifyProduct = me.product; save();
    return `Spotify connected as ${S.settings.spotifyUser} (${me.product === 'premium' ? 'Premium' : 'Free — playback control needs Premium'}).`;
  }
  onNative('deeplink', async p => {
    if (!String(p.url || '').startsWith(SP_REDIRECT)) return;
    const u = new URL(p.url.replace('nexusagent://', 'https://x/')); const code = u.searchParams.get('code');
    try { if (!code) throw new Error(u.searchParams.get('error') || 'no code'); toast(await spotifyFinish(code)); if (currentTab === 'settings') renderSettings(); }
    catch (e) { toast(e.message); }
  });
  async function sp(method, path, body, retry = true) {
    let t = spTok(); if (!t) throw new Error('NOT_CONNECTED');
    if (Date.now() > t.exp && t.refresh) { await spTokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh }); t = spTok(); }
    const r = await http(method, 'https://api.spotify.com/v1' + path, { Authorization: 'Bearer ' + t.access, 'Content-Type': 'application/json' }, body == null ? (method === 'GET' ? null : '') : JSON.stringify(body), 20000);
    if (r.status === 401 && retry && t.refresh) { await spTokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh }); return sp(method, path, body, false); }
    const d = parseJSON(r.body, null);
    if (r.status >= 400) { const reason = d && d.error && (d.error.reason || d.error.message); const e = new Error(reason || 'Spotify HTTP ' + r.status); e.status = r.status; e.reason = d && d.error && d.error.reason; throw e; }
    return d || {};
  }
  async function spEnsureDevice() {
    let dev = (await sp('GET', '/me/player/devices')).devices || [];
    if (!dev.length && N) { N.launchApp('com.spotify.music'); await sleep(3500); dev = (await sp('GET', '/me/player/devices')).devices || []; if (N.bringToFront) N.bringToFront(); }
    if (!dev.length) throw new Error('No Spotify device is online. Open Spotify on this device (or a speaker) once.');
    return dev.find(d => d.is_active) || dev.find(d => d.type === 'Smartphone') || dev[0];
  }
  async function spPlayer(method, path, body) {
    try { return await sp(method, path, body); }
    catch (e) {
      if (e.reason === 'NO_ACTIVE_DEVICE' || e.status === 404) { const d = await spEnsureDevice(); return sp(method, path + (path.includes('?') ? '&' : '?') + 'device_id=' + enc(d.id), body); }
      if (e.reason === 'PREMIUM_REQUIRED' || e.status === 403) throw new Error('PREMIUM_REQUIRED');
      throw e;
    }
  }
  const spItem = (x, type) => ({ uri: x.uri, title: x.name, by: (x.artists || []).map(a => a.name).join(', ') || (x.owner && x.owner.display_name) || (x.publisher) || '', album: x.album && x.album.name, length: x.duration_ms ? mmss(x.duration_ms) : undefined, type });
  async function spSearch(q, type = 'track', limit = 8) {
    const d = await sp('GET', `/search?type=${type}&limit=${limit}&q=${enc(q)}`);
    return ((d[type + 's'] || {}).items || []).filter(Boolean).map(x => spItem(x, type));
  }
  const spConnected = () => !!(spTok() && S.settings.spotifyClientId);

  /* ================================================================== YouTube Music */
  async function ytSearch(q, kind = 'video', limit = 8) {
    const key = getKey('svc_youtube');
    if (key) {
      const d = parseJSON((await http('GET', `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=${limit}&type=${kind}${kind === 'video' ? '&videoCategoryId=10' : ''}&q=${enc(q)}&key=${enc(key)}`, {}, null, 20000)).body, {});
      if (d.error) throw new Error('YouTube API: ' + d.error.message);
      return (d.items || []).map(x => ({ id: x.id.videoId || x.id.playlistId, kind, title: htmlToText(x.snippet.title), channel: x.snippet.channelTitle }));
    }
    const r = await http('GET', `https://www.youtube.com/results?search_query=${enc(q)}${kind === 'playlist' ? '&sp=EgIQAw%3D%3D' : ''}`, { 'User-Agent': navigator.userAgent.replace(/; wv\)/, ')'), 'Accept-Language': navigator.language || 'en' }, null, 20000);
    const m = r.body.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/); const data = m ? parseJSON(m[1], null) : null;
    if (!data) throw new Error('YouTube search is unavailable right now (add a YouTube Data API key in Settings for reliable search).');
    const out = []; const walk = o => { if (!o || typeof o !== 'object' || out.length >= limit) return; if (o.videoRenderer && kind === 'video') { const v = o.videoRenderer; out.push({ id: v.videoId, kind: 'video', title: (v.title.runs || [{}])[0].text, channel: v.ownerText && v.ownerText.runs[0].text, length: v.lengthText && v.lengthText.simpleText }); } else if (o.playlistRenderer && kind === 'playlist') { const p = o.playlistRenderer; out.push({ id: p.playlistId, kind: 'playlist', title: p.title.simpleText, channel: p.shortBylineText && p.shortBylineText.runs && p.shortBylineText.runs[0].text }); } else Object.values(o).forEach(walk); };
    walk(data); return out;
  }
  const YTM = 'com.google.android.apps.youtube.music';

  /* ================================================================== lyrics */
  let lyricsTimer = null;
  async function findLyrics(title, artist) {
    const r = parseJSON((await http('GET', `https://lrclib.net/api/search?track_name=${enc(title)}${artist ? '&artist_name=' + enc(artist) : ''}`, { 'User-Agent': 'NexusAgent/1.0 (https://github.com)' }, null, 15000)).body, []);
    const hit = (r || []).find(x => x.syncedLyrics) || (r || [])[0];
    if (!hit) return null;
    const synced = hit.syncedLyrics ? hit.syncedLyrics.split('\n').map(l => { const m = l.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/); return m ? { t: (Number(m[1]) * 60 + Number(m[2])) * 1000, text: m[3] } : null; }).filter(Boolean) : null;
    return { title: hit.trackName, artist: hit.artistName, plain: hit.plainLyrics || '', synced };
  }
  function showLyrics(ly, pkg) {
    clearInterval(lyricsTimer);
    const lines = ly.synced ? ly.synced.map(x => x.text) : ly.plain.split('\n');
    if (hudOn()) hudPost({ mode: 'lyrics', title: `${ly.title} — ${ly.artist}`, lines, index: 0 });
    const close = (() => { const box = $('#modalBox'); box.innerHTML = `<div class="row"><b style="flex:1">${esc(ly.title)} <span class="hint">${esc(ly.artist)}</span></b><button class="small" id="lyX">✕</button></div><div id="lyBox" style="max-height:72vh;overflow-y:auto;font-size:1.25em;line-height:1.7">${lines.map((l, i) => `<div data-l="${i}" style="opacity:.45">${esc(l) || '♪'}</div>`).join('')}</div>`; $('#modal').classList.add('show'); const c = () => { clearInterval(lyricsTimer); $('#modal').classList.remove('show'); modalClose = null; if (hudOn()) hudPost({ mode: 'clock' }); }; modalClose = c; $('#lyX').onclick = c; return c; })();
    if (!ly.synced) return close;
    let lastIdx = -1;
    lyricsTimer = setInterval(() => {
      let pos = null;
      try { const s = sessions().find(x => !pkg || x.package === pkg) || sessions()[0]; if (s) pos = s.positionMs; } catch { /* no access */ }
      if (pos == null && window.NexusMedia && !NexusMedia.AP.paused) pos = NexusMedia.AP.currentTime * 1000;
      if (pos == null) return;
      let idx = 0; for (let i = 0; i < ly.synced.length; i++) if (ly.synced[i].t <= pos + 300) idx = i;
      if (idx === lastIdx) return; lastIdx = idx;
      $$('#lyBox [data-l]').forEach(d => { const on = Number(d.dataset.l) === idx; d.style.opacity = on ? '1' : '.45'; d.style.color = on ? 'var(--accent)' : ''; if (on) d.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
      if (hudOn()) hudPost({ mode: 'lyrics', index: idx, patch: true });
    }, 400);
    return close;
  }

  /* ================================================================== HUD (display glasses) */
  const hudOn = () => !!(N && N.externalDisplay && parseJSON(N.externalDisplay(), {}).hud);
  const hudPost = o => { if (N && N.hudPost) N.hudPost(JSON.stringify(o)); };
  function hudStart() {
    needNative('Display glasses HUD');
    const r = parseJSON(N.hudStart(), {}); if (r.error) throw new Error(r.error);
    hudPost({ mode: 'clock', fontSize: S.settings.hudFontSize, safe: S.settings.hudSafe, status: '' });
    return `HUD on ${r.name || 'external display'} (${r.width}×${r.height}${r.refreshHz ? ' @' + r.refreshHz + 'Hz' : ''}).`;
  }
  let npTimer = null;
  function hudNowPlaying() {
    clearInterval(npTimer);
    const tick = () => { if (!hudOn()) return clearInterval(npTimer); let s = null; try { s = sessions().find(x => x.state === 'playing') || sessions()[0]; } catch { /* */ } if (!s && window.NexusMedia && NexusMedia.AP.src) { const a = NexusMedia.AP; s = { app: 'Nexus', title: document.querySelector('#miniT') ? $('#miniT').textContent.replace(/^[▶⏸] /, '') : '', state: a.paused ? 'paused' : 'playing', positionMs: a.currentTime * 1000, durationMs: a.duration * 1000 }; } hudPost({ mode: 'nowplaying', app: s ? s.app : 'Nothing playing', title: s && s.title, subtitle: s ? [s.artist, s.album].filter(Boolean).join(' · ') : '', playing: s ? s.state === 'playing' : false, progress: s && s.durationMs ? s.positionMs / s.durationMs : 0, fontSize: S.settings.hudFontSize, safe: S.settings.hudSafe }); };
    tick(); npTimer = setInterval(tick, 1500);
  }
  onNative('display', e => { if (e.connected && S.settings.hudAuto) { try { toast(hudStart()); } catch (err) { /* not a presentation display */ } } });
  onNative('notification', n => { if (S.settings.hudNotifications && hudOn()) hudPost({ toast: `${n.app}: ${n.title}${n.text ? ' — ' + clip(n.text, 120) : ''}` }); });
  setTimeout(() => { try { if (S.settings.hudAuto && N && N.externalDisplay && parseJSON(N.externalDisplay(), {}).connected) hudStart(); } catch { /* */ } }, 1500);
  {
    const coreDispatch = dispatch;
    dispatch = async (prompt, opts = {}) => {
      const follow = S.settings.hudReplies && hudOn();
      if (follow) { clearInterval(npTimer); hudPost({ mode: 'reply', title: '🎙 ' + clip(prompt, 80), text: '…', fontSize: S.settings.hudFontSize, safe: S.settings.hudSafe }); }
      const r = await coreDispatch(prompt, opts);
      if (follow && r) hudPost({ mode: 'reply', title: r.agent, text: stripThink(r.text), fontSize: S.settings.hudFontSize, safe: S.settings.hudSafe });
      return r;
    };
  }

  /* ================================================================== Meta glasses */
  const metaHint = () => S.settings.metaFolderHint || 'meta';
  async function recentGlassesMedia(a) {
    needNative('Gallery access');
    const perms = ['android.permission.READ_MEDIA_IMAGES', 'android.permission.READ_MEDIA_VIDEO'];
    let ok = false; for (const p of perms) ok = (await ensurePermission(p)) || ok;
    if (!ok) ok = await ensurePermission('android.permission.READ_EXTERNAL_STORAGE');
    if (!ok) throw new Error('Photo library permission denied');
    const spec = { count: a.count || 5, type: a.type || 'any', sinceMs: a.since_minutes ? Date.now() - a.since_minutes * 60000 : 0 };
    let list = await nativeAsync('recentMedia', JSON.stringify({ ...spec, folderHint: a.all ? '' : metaHint() }));
    let note = '';
    if (!list.length && !a.all) { list = await nativeAsync('recentMedia', JSON.stringify({ ...spec, folderHint: '' })); note = '(No album matching your glasses was found — showing the newest gallery items. In the Meta AI app, turn on importing captures to the phone gallery.)\n'; }
    return { list, note };
  }

  /* ================================================================== skills */
  BUILTIN_SKILLS.push(
    /* ---------------- Music (any app) */
    { name: 'music_now_playing', group: 'Music', description: "What's playing right now in any app (Spotify, YouTube Music, Plex, podcasts, Nexus audiobooks…), with position.", parameters: P({}),
      run: async () => {
        let list = []; try { list = sessions(); } catch (e) { return e.message + '. Enable notification access (Settings → Media & audio → Grant notification access).'; }
        const out = list.map(s => `• ${s.app}: ${s.title || '(unknown)'}${s.artist ? ' — ' + s.artist : ''}${s.album ? ' · ' + s.album : ''} · ${s.state}${s.durationMs ? ` · ${mmss(s.positionMs)}/${mmss(s.durationMs)}` : ''}`);
        return out.join('\n') || 'Nothing is playing.';
      } },
    { name: 'music_control', group: 'Music', description: 'Control playback in a music/podcast app (or whatever is playing): play, pause, toggle, next, previous, stop, seek (seconds), forward, rewind.', parameters: P({ action: Str('play | pause | toggle | next | previous | stop | seek | forward | rewind'), app: Str('optional: spotify, youtube music, plex, pandora…'), seconds: Num('for seek/forward/rewind') }, ['action']),
      run: async a => { needNative('Music control'); return N.mediaControl(pkgFor(a.app), a.action, (Number(a.seconds) || 0) * 1000); } },
    { name: 'music_play', group: 'Music', description: 'Play a song, artist, album, playlist or mood ("chill jazz") on your music service (Settings default: Spotify if connected, else YouTube Music; or say service).', parameters: P({ query: Str('what to play'), service: Str('spotify | youtube music | plex'), type: Str('track | album | artist | playlist (Spotify)') }, ['query']),
      run: async (a, ctx) => {
        const svc = String(a.service || S.settings.musicService || 'auto').toLowerCase();
        if (svc.includes('plex')) return execSkill('plex_play', { item: a.query }, ctx);
        if (svc.includes('youtube') || (svc === 'auto' && !spConnected())) return execSkill('ytmusic_play', { query: a.query }, ctx);
        return execSkill('spotify_play', { query: a.query, type: a.type }, ctx);
      } },
    { name: 'music_lyrics', group: 'Music', description: 'Show lyrics for the current song (or a given one), synced line-by-line on screen and on the glasses HUD (LRCLIB).', parameters: P({ title: Str('optional song title (default: what is playing)'), artist: Str('optional artist'), show: Bool('display synced lyrics (default true)') }),
      run: async a => {
        let title = a.title, artist = a.artist, pkg = '';
        if (!title) { const s = (() => { try { return sessions().find(x => x.state === 'playing') || sessions()[0]; } catch { return null; } })(); if (!s || !s.title) return 'Nothing is playing — say which song.'; title = s.title; artist = s.artist; pkg = s.package; }
        const ly = await findLyrics(title, artist); if (!ly) return `No lyrics found for "${title}".`;
        if (a.show !== false) showLyrics(ly, pkg);
        return `${ly.title} — ${ly.artist}${ly.synced ? ' (synced)' : ''}\n\n${clip(ly.plain, 3000)}`;
      } },

    /* ---------------- Spotify */
    { name: 'spotify_search', group: 'Spotify', description: 'Search Spotify for tracks, albums, artists, playlists, podcasts or episodes.', parameters: P({ query: Str('search'), type: Str('track | album | artist | playlist | show | episode'), limit: Num('default 8') }, ['query']),
      run: async a => { if (!spConnected()) return 'Spotify is not connected (Settings → Music & glasses → Connect Spotify). Meanwhile use music_play with YouTube Music.'; const r = await spSearch(a.query, a.type || 'track', a.limit || 8); return r.map(x => `• ${x.title}${x.by ? ' — ' + x.by : ''}${x.album ? ' · ' + x.album : ''}${x.length ? ' · ' + x.length : ''}\n  ${x.uri}`).join('\n') || 'No results.'; } },
    { name: 'spotify_play', group: 'Spotify', description: 'Play on Spotify: a search query (best match), a spotify: URI, an album/playlist/artist; optionally on a device and shuffled. Needs Premium for remote control; otherwise opens it in the Spotify app.', parameters: P({ query: Str('what to play'), uri: Str('spotify:track:… / album / playlist / artist URI'), type: Str('track | album | artist | playlist'), device: Str('optional device name'), shuffle: Bool('') }),
      run: async a => {
        if (!spConnected()) { const url = a.uri || `spotify:search:${a.query || ''}`; return openIn(url, 'com.spotify.music') + ` — Spotify app with "${a.query || a.uri}" (connect Spotify in Settings for hands-free play).`; }
        let uri = a.uri, label = a.uri;
        if (!uri) { const type = a.type || 'track'; const r = await spSearch(a.query, type, 1); if (!r.length) return 'Nothing found on Spotify.'; uri = r[0].uri; label = `${r[0].title}${r[0].by ? ' — ' + r[0].by : ''}`; }
        let q = '';
        if (a.device) { const d = ((await sp('GET', '/me/player/devices')).devices || []).find(x => x.name.toLowerCase().includes(a.device.toLowerCase())); if (d) q = '?device_id=' + enc(d.id); }
        try {
          if (a.shuffle != null) await spPlayer('PUT', `/me/player/shuffle?state=${!!a.shuffle}`).catch(() => {});
          await spPlayer('PUT', '/me/player/play' + q, /:track:|:episode:/.test(uri) ? { uris: [uri] } : { context_uri: uri });
          return `▶ ${label} on Spotify`;
        } catch (e) {
          if (e.message === 'PREMIUM_REQUIRED') return openIn(uri, 'com.spotify.music') + ` — opened ${label} in the Spotify app (remote control needs Premium).`;
          throw e;
        }
      } },
    { name: 'spotify_control', group: 'Spotify', description: 'Spotify playback: pause, resume, next, previous, shuffle_on/off, repeat_track/context/off, volume (0-100), seek (seconds).', parameters: P({ action: Str('action'), value: Num('volume or seconds') }, ['action']),
      run: async a => {
        if (!spConnected()) return N.mediaControl('com.spotify.music', { resume: 'play' }[a.action] || a.action, (Number(a.value) || 0) * 1000);
        const m = { pause: ['PUT', '/me/player/pause'], resume: ['PUT', '/me/player/play'], play: ['PUT', '/me/player/play'], next: ['POST', '/me/player/next'], previous: ['POST', '/me/player/previous'], shuffle_on: ['PUT', '/me/player/shuffle?state=true'], shuffle_off: ['PUT', '/me/player/shuffle?state=false'], repeat_track: ['PUT', '/me/player/repeat?state=track'], repeat_context: ['PUT', '/me/player/repeat?state=context'], repeat_off: ['PUT', '/me/player/repeat?state=off'], volume: ['PUT', `/me/player/volume?volume_percent=${Math.max(0, Math.min(100, Math.round(a.value || 50)))}`], seek: ['PUT', `/me/player/seek?position_ms=${Math.round((a.value || 0) * 1000)}`] }[a.action];
        if (!m) return 'Unknown action';
        try { await spPlayer(m[0], m[1]); return 'Spotify: ' + a.action; } catch (e) { if (e.message === 'PREMIUM_REQUIRED') return N.mediaControl('com.spotify.music', { resume: 'play' }[a.action] || a.action, 0) + ' (via media controls; full control needs Premium)'; throw e; }
      } },
    { name: 'spotify_now_playing', group: 'Spotify', description: 'Current Spotify track, device, progress, shuffle/repeat.', parameters: P({}),
      run: async () => { if (!spConnected()) return execSkill('music_now_playing', {}, {}); const d = await sp('GET', '/me/player'); if (!d.item) return 'Nothing playing on Spotify.'; return `${d.is_playing ? '▶' : '⏸'} ${d.item.name} — ${(d.item.artists || []).map(x => x.name).join(', ')} · ${d.item.album ? d.item.album.name : ''}\n${mmss(d.progress_ms)}/${mmss(d.item.duration_ms)} on ${d.device ? d.device.name : '?'} · shuffle ${d.shuffle_state ? 'on' : 'off'} · repeat ${d.repeat_state}\n${d.item.uri}`; } },
    { name: 'spotify_queue', group: 'Spotify', description: 'Add a track (query or URI) to the Spotify queue.', parameters: P({ query: Str('song'), uri: Str('or URI') }),
      run: async a => { let uri = a.uri, label = a.uri; if (!uri) { const r = await spSearch(a.query, 'track', 1); if (!r.length) return 'Not found.'; uri = r[0].uri; label = r[0].title + ' — ' + r[0].by; } await spPlayer('POST', `/me/player/queue?uri=${enc(uri)}`); return 'Queued ' + label; } },
    { name: 'spotify_devices', group: 'Spotify', description: 'List Spotify Connect devices (phone, speakers, TV, car) and optionally move playback to one.', parameters: P({ transfer_to: Str('optional device name') }),
      run: async a => { const ds = (await sp('GET', '/me/player/devices')).devices || []; if (a.transfer_to) { const d = ds.find(x => x.name.toLowerCase().includes(a.transfer_to.toLowerCase())); if (!d) return 'Device not found. Devices: ' + ds.map(x => x.name).join(', '); await spPlayer('PUT', '/me/player', { device_ids: [d.id], play: true }); return 'Playing on ' + d.name; } return ds.map(d => `• ${d.name} (${d.type})${d.is_active ? ' · active' : ''}${d.volume_percent != null ? ' · vol ' + d.volume_percent : ''}`).join('\n') || 'No devices online — open Spotify somewhere.'; } },
    { name: 'spotify_playlists', group: 'Spotify', description: 'Your Spotify playlists: list, show tracks, create a new one (optionally from song queries), or add songs to one.', parameters: P({ action: Str('list | show | create | add'), playlist: Str('playlist name (show/add)'), name: Str('name for create'), songs: { type: 'array', items: { type: 'string' }, description: 'song queries to add' } }, ['action']),
      run: async a => {
        const mine = async () => (await sp('GET', '/me/playlists?limit=50')).items || [];
        const find = async n => { const p = (await mine()).find(x => x.name.toLowerCase().includes(String(n).toLowerCase())); if (!p) throw new Error('Playlist not found'); return p; };
        const addSongs = async (pid, songs) => { const uris = []; for (const s of (songs || []).slice(0, 50)) { const r = await spSearch(s, 'track', 1); if (r[0]) uris.push(r[0].uri); } if (uris.length) await sp('POST', `/playlists/${pid}/tracks`, { uris }); return uris.length; };
        if (a.action === 'list') return (await mine()).map(p => `• ${p.name} · ${p.tracks ? p.tracks.total : '?'} tracks\n  ${p.uri}`).join('\n') || 'No playlists.';
        if (a.action === 'show') { const p = await find(a.playlist); const t = (await sp('GET', `/playlists/${p.id}/tracks?limit=50`)).items || []; return `${p.name}:\n` + t.filter(x => x.track).map((x, i) => `${i + 1}. ${x.track.name} — ${(x.track.artists || []).map(y => y.name).join(', ')}`).join('\n'); }
        if (a.action === 'create') { const me = await sp('GET', '/me'); const p = await sp('POST', `/users/${enc(me.id)}/playlists`, { name: a.name || 'Nexus mix', public: false, description: 'Made by Nexus Agent' }); const n = await addSongs(p.id, a.songs); return `Created "${p.name}" with ${n} songs · ${p.uri}`; }
        if (a.action === 'add') { const p = await find(a.playlist); const n = await addSongs(p.id, a.songs); return `Added ${n} songs to ${p.name}`; }
        return 'Unknown action';
      } },
    { name: 'spotify_library', group: 'Spotify', description: 'Like the current (or a given) track, or show recently played / your top tracks and artists.', parameters: P({ action: Str('like | recent | top_tracks | top_artists'), uri: Str('track URI for like (default current)') }, ['action']),
      run: async a => {
        if (a.action === 'like') { let uri = a.uri; if (!uri) { const d = await sp('GET', '/me/player/currently-playing'); uri = d.item && d.item.uri; } if (!uri) return 'Nothing playing.'; await sp('PUT', `/me/tracks?ids=${uri.split(':').pop()}`); return '♥ Saved to Liked Songs'; }
        if (a.action === 'recent') return ((await sp('GET', '/me/player/recently-played?limit=15')).items || []).map(x => `• ${x.track.name} — ${x.track.artists.map(y => y.name).join(', ')}`).join('\n');
        if (a.action === 'top_artists') return ((await sp('GET', '/me/top/artists?limit=15')).items || []).map((x, i) => `${i + 1}. ${x.name} (${(x.genres || []).slice(0, 2).join(', ')})`).join('\n');
        return ((await sp('GET', '/me/top/tracks?limit=15')).items || []).map((x, i) => `${i + 1}. ${x.name} — ${x.artists.map(y => y.name).join(', ')}`).join('\n');
      } },

    /* ---------------- YouTube Music */
    { name: 'ytmusic_search', group: 'YouTube Music', description: 'Search YouTube Music / YouTube for songs (videos) or playlists.', parameters: P({ query: Str('song, artist, album…'), kind: Str('video | playlist'), limit: Num('default 8') }, ['query']),
      run: async a => (await ytSearch(a.query, a.kind || 'video', a.limit || 8)).map(x => `• ${x.title}${x.channel ? ' — ' + x.channel : ''}${x.length ? ' · ' + x.length : ''}\n  ${x.kind === 'playlist' ? 'playlist_id' : 'video_id'}: ${x.id}`).join('\n') || 'No results.' },
    { name: 'ytmusic_play', group: 'YouTube Music', description: 'Play in the YouTube Music app: best match for a query, a video_id or a playlist_id. radio=true (default) continues with a mix of similar songs.', parameters: P({ query: Str('what to play'), video_id: Str(''), playlist_id: Str(''), radio: Bool('auto-continue with a radio mix (default true)') }),
      run: async a => {
        let url, label;
        if (a.playlist_id) { url = `https://music.youtube.com/playlist?list=${enc(a.playlist_id)}`; label = 'playlist'; }
        else {
          let id = a.video_id; label = id;
          if (!id) { const r = await ytSearch(a.query, 'video', 1); if (!r.length) return openIn(`https://music.youtube.com/search?q=${enc(a.query)}`, YTM) + ' — YouTube Music search'; id = r[0].id; label = `${r[0].title}${r[0].channel ? ' — ' + r[0].channel : ''}`; }
          url = `https://music.youtube.com/watch?v=${enc(id)}${a.radio === false ? '' : `&list=RDAMVM${enc(id)}`}`;
        }
        return `${openIn(url, YTM)}: ▶ ${label} in YouTube Music${a.radio === false ? '' : ' (radio)'}`;
      } },
    { name: 'ytmusic_open', group: 'YouTube Music', description: 'Open a YouTube Music page: home, explore, library, liked (songs), or search.', parameters: P({ page: Str('home | explore | library | liked | search'), query: Str('for search') }),
      run: async a => { const u = { explore: 'https://music.youtube.com/explore', library: 'https://music.youtube.com/library', liked: 'https://music.youtube.com/playlist?list=LM', search: `https://music.youtube.com/search?q=${enc(a.query || '')}` }[a.page] || 'https://music.youtube.com/'; return openIn(u, YTM) + ' ' + u; } },

    /* ---------------- Display glasses HUD (Lenovo Legion Glasses / Glasses T1 & others) */
    { name: 'hud_control', group: 'Display glasses', description: 'Heads-up display on USB-C display glasses (Lenovo Legion Glasses, Lenovo Glasses T1, XREAL, Viture, Rokid, RayNeo Air): on, off, status, or show content — clock, text, teleprompter, nowplaying.', parameters: P({ action: Str('on | off | status | clock | text | teleprompter | nowplaying'), text: Str('for text/teleprompter'), title: Str('optional title'), wpm: Num('teleprompter speed') }, ['action']),
      run: async a => {
        needNative('Display glasses');
        const st = parseJSON(N.externalDisplay(), {});
        if (a.action === 'status') return st.connected ? `Display glasses connected: ${st.name} ${st.width}×${st.height} @${st.refreshHz}Hz · HUD ${st.hud ? 'on' : 'off'}` : 'No display glasses connected. Plug them into a phone with USB-C video output (DisplayPort Alt Mode).';
        if (a.action === 'off') { N.hudStop(); clearInterval(npTimer); return 'HUD off (glasses show the phone mirror again).'; }
        let msg = st.hud ? '' : hudStart() + ' ';
        clearInterval(npTimer);
        const base = { fontSize: S.settings.hudFontSize, safe: S.settings.hudSafe };
        if (a.action === 'text') hudPost({ ...base, mode: 'reply', title: a.title || '', text: a.text || '' });
        else if (a.action === 'teleprompter') hudPost({ ...base, mode: 'teleprompter', text: a.text || '', wpm: a.wpm || S.settings.readerWpm || 150 });
        else if (a.action === 'nowplaying') hudNowPlaying();
        else hudPost({ ...base, mode: 'clock' });
        return msg + `HUD: ${a.action === 'on' ? 'clock' : a.action}`;
      } },

    /* ---------------- Meta glasses (Ray-Ban Meta, Oakley Meta) & other Bluetooth audio glasses */
    { name: 'meta_glasses_status', group: 'Meta glasses', description: 'Status of Meta Ray-Ban / Oakley Meta (or other Bluetooth audio) glasses: connection, mic route, tap-to-talk, Meta AI app, latest synced captures.', parameters: P({}),
      run: async () => {
        needNative('Glasses status');
        const bt = parseJSON(N.btAudioDevices(), {}); const apps = parseJSON(N.listApps(), []);
        const meta = apps.find(x => x.package === 'com.facebook.stella' || /meta ai|meta view/i.test(x.label));
        let recent = ''; try { const r = await recentGlassesMedia({ count: 3 }); recent = r.list.map(m => `${m.name} (${m.album}, ${new Date(m.time).toLocaleString()})`).join('; '); } catch (e) { recent = e.message; }
        return J({ bluetooth_audio: bt.devices || [], voice_through_glasses: bt.voiceRoute, tap_to_talk: bt.tapToTalk, meta_ai_app: meta ? meta.label : 'not installed', latest_captures: recent || 'none' });
      } },
    { name: 'meta_glasses_voice', group: 'Meta glasses', description: 'Use the glasses\' microphones for Nexus voice input and wake word (on), or go back to the phone mic (off). Answers already play through the glasses speakers when they are connected.', parameters: P({ on: Bool('true = use glasses mic') }, ['on']),
      run: async a => { needNative(); S.settings.metaVoice = !!a.on; save(); return N.btVoiceRoute(!!a.on); } },
    { name: 'glasses_tap_to_talk', group: 'Meta glasses', description: 'Tap the glasses (play/pause touch) to talk to Nexus instead of pausing music. Works with Meta Ray-Ban and most Bluetooth glasses/earbuds.', parameters: P({ on: Bool('') }, ['on']),
      run: async a => { needNative(); S.settings.tapToTalk = !!a.on; save(); return N.tapToTalk(!!a.on); } },
    { name: 'meta_glasses_media', group: 'Meta glasses', description: 'Latest photos/videos taken with the glasses (after they sync to the phone gallery via the Meta AI app). import=true copies them into the workspace for describe/OCR/translate/share.', parameters: P({ count: Num('default 5'), type: Str('photo | video | any'), since_minutes: Num('optional'), import: Bool('copy into workspace'), all: Bool('include all gallery items, not only the glasses album') }),
      run: async a => {
        const { list, note } = await recentGlassesMedia(a);
        if (!list.length) return note + 'No photos or videos found.';
        const lines = []; for (const m of list) { let p = ''; if (a.import) p = ' → ' + (await nativeAsync('importMedia', m.uri)).path; lines.push(`• ${m.name} · ${m.album} · ${new Date(m.time).toLocaleString()} · ${fmtSize(m.size)}${p}`); }
        return note + lines.join('\n');
      } },
    { name: 'meta_glasses_look', group: 'Meta glasses', description: 'Look at the latest photo (or video) taken with the glasses and answer a question about it: what is this, read the sign, translate the menu, identify the product…', parameters: P({ question: Str('what to find out'), video: Bool('use the latest video instead of photo') }),
      run: async (a, ctx) => {
        const { list, note } = await recentGlassesMedia({ count: 1, type: a.video ? 'video' : 'photo' });
        if (!list.length) return note + 'No capture found. Take one with "Hey Meta, take a photo" and let it sync to your phone.';
        const path = (await nativeAsync('importMedia', list[0].uri)).path;
        const ans = a.video ? await execSkill('video_describe', { path, question: a.question }, ctx) : await visionAsk([path], a.question || 'Describe what I am looking at.', ctx);
        return `${note}${list[0].name} (${new Date(list[0].time).toLocaleTimeString()}) → ${path}\n${ans}`;
      } },
    { name: 'meta_ai_app', group: 'Meta glasses', description: 'Open the Meta AI app (glasses settings, gallery sync, firmware).', parameters: P({}),
      run: async () => { needNative(); const apps = parseJSON(N.listApps(), []); const m = apps.find(x => x.package === 'com.facebook.stella' || /meta ai|meta view/i.test(x.label)); return m && N.launchApp(m.package) ? 'Opened ' + m.label : (N.openUrl('https://play.google.com/store/apps/details?id=com.facebook.stella') ? 'Meta AI app not installed — opened its store page' : 'not available'); } },
  );

  // Glasses media buttons (when tap-to-talk owns them): next/previous still control music.
  onNative('hwkey', p => { if (p.source === 'bluetooth' && (p.key === 'media_next' || p.key === 'media_previous') && N) N.mediaControl('', p.key === 'media_next' ? 'next' : 'previous', 0); });
  setTimeout(() => { if (N && N.tapToTalk && S.settings.tapToTalk) N.tapToTalk(true); if (N && N.btVoiceRoute && S.settings.metaVoice) N.btVoiceRoute(true); }, 1500);

  /* ================================================================== settings */
  const coreRenderPro = renderProSettings, coreBindPro = bindProSettings;
  renderProSettings = () => {
    const ext = N && N.externalDisplay ? parseJSON(N.externalDisplay(), {}) : {};
    return coreRenderPro() + `<div class="card" id="musicCard"><h3>Music</h3>
      <div class="row"><div><label>Spotify Client ID (developer.spotify.com → Create app, redirect URI <code>${SP_REDIRECT}</code>)</label><input data-k="spotifyClientId"></div><button class="primary nogrow" id="spConnect">${spTok() ? 'Reconnect' : 'Connect Spotify'}</button></div>
      <p class="hint">${spTok() ? `Connected as ${esc(S.settings.spotifyUser || '?')} · ${esc(S.settings.spotifyProduct || '')}${S.settings.spotifyProduct && S.settings.spotifyProduct !== 'premium' ? ' (search/playlists work; remote playback control needs Premium)' : ''}` : 'Not connected — music still works through the Spotify app.'}</p>
      <div class="row"><div><label>YouTube Data API key (optional, more reliable search)</label><input type="password" data-secret="svc_youtube" placeholder="${getKey('svc_youtube') ? 'saved ✓' : ''}"></div>
      <div><label>Default music service</label><select data-k="musicService"><option value="auto">Auto (Spotify if connected, else YouTube Music)</option><option value="spotify">Spotify</option><option value="youtube music">YouTube Music</option><option value="plex">Plex</option></select></div></div>
      <h3 style="margin-top:.8em">Display glasses HUD (Lenovo Legion Glasses / Glasses T1, XREAL, Viture, Rokid…)</h3>
      <p class="hint">${ext.connected ? `Connected: ${esc(ext.name)} ${ext.width}×${ext.height} · HUD ${ext.hud ? 'on' : 'off'}` : 'No display glasses connected (needs a phone with USB-C video out).'}</p>
      <div class="row"><button class="nogrow" id="hudToggle">${ext.hud ? 'HUD off' : 'HUD on'}</button><label class="inline nogrow"><input type="checkbox" data-k="hudAuto" data-t="bool">Start when glasses connect</label></div>
      <label class="inline"><input type="checkbox" data-k="hudReplies" data-t="bool">Show agent replies on the glasses</label>
      <label class="inline"><input type="checkbox" data-k="hudNotifications" data-t="bool">Show notifications on the glasses</label>
      <div class="row"><div><label>HUD font size px</label><input data-k="hudFontSize" data-t="num" type="number" min="16" max="80"></div><div><label>Edge margin (comfort zone) %</label><input data-k="hudSafe" data-t="num" type="number" min="0" max="25"></div></div>
      <h3 style="margin-top:.8em">Meta Ray-Ban / Oakley Meta glasses</h3>
      <label class="inline"><input type="checkbox" id="metaVoice" ${S.settings.metaVoice ? 'checked' : ''}>Use the glasses microphones for Nexus (voice + "Hey Nexus")</label>
      <label class="inline"><input type="checkbox" id="tapTalk" ${S.settings.tapToTalk ? 'checked' : ''}>Tap the glasses to talk to Nexus (instead of play/pause)</label>
      <div class="row"><div><label>Gallery album pattern for glasses captures</label><input data-k="metaFolderHint"></div></div>
    </div>`;
  };
  bindProSettings = v => {
    coreBindPro(v);
    const card = $('#musicCard', v); if (!card) return;
    bind(card, S.settings, k => { if ((k === 'hudFontSize' || k === 'hudSafe') && hudOn()) hudPost({ fontSize: S.settings.hudFontSize, safe: S.settings.hudSafe, patch: true }); });
    $$('[data-secret]', card).forEach(el => el.addEventListener('change', () => { setKey(el.dataset.secret, el.value); el.value = ''; el.placeholder = 'saved ✓'; toast('Saved on device'); }));
    $('#spConnect', card).onclick = () => spotifyConnect().then(toast).catch(e => toast(e.message));
    $('#hudToggle', card).onclick = () => { try { toast(hudOn() ? (N.hudStop(), 'HUD off') : hudStart()); } catch (e) { toast(e.message); } setTimeout(renderSettings, 400); };
    $('#metaVoice', card).onchange = e => { S.settings.metaVoice = e.target.checked; save(); toast(N ? N.btVoiceRoute(e.target.checked) : 'Android only'); };
    $('#tapTalk', card).onchange = e => { S.settings.tapToTalk = e.target.checked; save(); toast(N ? N.tapToTalk(e.target.checked) : 'Android only'); };
  };
  { const coreSecrets = secretIds; secretIds = () => [...coreSecrets(), { id: 'svc_youtube', name: 'YouTube Data API key' }]; }

  window.NexusMusic = { spotifyFinish, spSearch, ytSearch, findLyrics, hudStart, hudOn, pkgFor };
})();
