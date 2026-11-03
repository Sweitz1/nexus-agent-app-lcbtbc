/* Nexus Agent — Google services: Gmail, Google Calendar (as a calendar source), Drive, Docs,
 * Sheets, Tasks, Contacts, YouTube (your account), Google Maps Platform (Places/Routes),
 * Google Translate, and quick launchers for Google apps. Loaded after skills-music.js. */
'use strict';
(() => {
  const P = (props, req = []) => ({ type: 'object', properties: props, required: req });
  const Str = d => ({ type: 'string', description: d });
  const Num = d => ({ type: 'number', description: d });
  const Bool = d => ({ type: 'boolean', description: d });
  const Arr = (d, items = { type: 'string' }) => ({ type: 'array', items, description: d });
  const J = o => JSON.stringify(o, null, 1);
  const enc = encodeURIComponent;

  S.settings = {
    googleClientId: '', googleEmail: '',
    googleServices: { gmail: true, calendar: true, drive: true, docs: true, sheets: true, tasks: true, contacts: true, youtube: false },
    ...S.settings,
  };
  const SCOPES = {
    gmail: ['https://www.googleapis.com/auth/gmail.modify'], calendar: ['https://www.googleapis.com/auth/calendar'],
    drive: ['https://www.googleapis.com/auth/drive'], docs: ['https://www.googleapis.com/auth/documents'], sheets: ['https://www.googleapis.com/auth/spreadsheets'],
    tasks: ['https://www.googleapis.com/auth/tasks'], contacts: ['https://www.googleapis.com/auth/contacts.readonly'], youtube: ['https://www.googleapis.com/auth/youtube.readonly'],
  };
  const svcOn = k => !!(S.settings.googleServices || {})[k];
  const tok = () => parseJSON(getKey('svc_google'), null);
  const connected = () => !!(tok() && S.settings.googleClientId);
  const has = k => { const t = tok(); return !!(t && (t.scope || '').split(' ').some(s => SCOPES[k].includes(s))); };
  const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const utf8b64 = s => bytesToB64(new TextEncoder().encode(String(s)));
  const fromB64url = s => { const b = atob(String(s).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); };
  const decodeB64urlText = s => new TextDecoder().decode(fromB64url(s));

  /* ================================================================== OAuth (installed-app flow, PKCE, loopback) */
  async function tokenRequest(params) {
    const r = await http('POST', 'https://oauth2.googleapis.com/token', { 'Content-Type': 'application/x-www-form-urlencoded' }, new URLSearchParams({ client_id: S.settings.googleClientId, client_secret: getKey('svc_google_secret'), ...params }).toString(), 20000);
    const d = parseJSON(r.body, {}); if (!d.access_token) throw new Error('Google sign-in failed: ' + (d.error_description || d.error || 'HTTP ' + r.status));
    const old = tok() || {};
    setKey('svc_google', JSON.stringify({ access: d.access_token, refresh: d.refresh_token || old.refresh, exp: Date.now() + (d.expires_in || 3600) * 1000 - 60000, scope: d.scope || old.scope }));
  }
  async function finishWithQuery(query) {
    const q = new URLSearchParams(query); const pend = parseJSON(sessionStorage.getItem('g_pending'), null);
    if (!pend) throw new Error('No Google sign-in in progress — start again');
    if (q.get('error')) throw new Error('Google: ' + q.get('error'));
    if (q.get('state') !== pend.state) throw new Error('Sign-in state mismatch — start again');
    await tokenRequest({ grant_type: 'authorization_code', code: q.get('code'), redirect_uri: pend.redirect, code_verifier: pend.verifier });
    sessionStorage.removeItem('g_pending');
    const me = await g('GET', 'https://openidconnect.googleapis.com/v1/userinfo');
    S.settings.googleEmail = me.email || ''; save();
    return `Connected Google account ${me.email} (${Object.keys(SCOPES).filter(has).join(', ')}).`;
  }
  async function googleConnect() {
    needNative('Google sign-in');
    if (!S.settings.googleClientId || !getKey('svc_google_secret')) throw new Error('Add your Google OAuth client ID and secret first (Settings → Google → see the setup steps).');
    const port = N.oauthStart(); if (port < 0) throw new Error('Could not open the local sign-in listener');
    const redirect = `http://127.0.0.1:${port}`;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const verifier = Array.from(crypto.getRandomValues(new Uint8Array(64)), b => chars[b % chars.length]).join('');
    const state = uid() + uid();
    sessionStorage.setItem('g_pending', JSON.stringify({ verifier, redirect, state, port }));
    const scope = ['openid', 'email', 'profile', ...Object.keys(SCOPES).filter(svcOn).flatMap(k => SCOPES[k])].join(' ');
    const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({ client_id: S.settings.googleClientId, redirect_uri: redirect, response_type: 'code', scope, code_challenge: b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))), code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent', state });
    N.openUrl(url);
    const r = await nativeAsync('oauthWait', port, 600000);
    return finishWithQuery(r.query);
  }
  /** For signing in on another device: paste the final http://127.0.0.1:… address from that browser. */
  async function googlePaste(text) {
    const pend = parseJSON(sessionStorage.getItem('g_pending'), null);
    if (pend && N) N.oauthCancel(pend.port);
    const m = String(text).match(/[?&#](.*)$/); if (!m) throw new Error('Paste the full address that starts with http://127.0.0.1');
    return finishWithQuery(m[1]);
  }
  async function ensureToken() {
    let t = tok(); if (!t) throw new Error('Google is not connected (Settings → Google → Connect).');
    if (Date.now() > t.exp) { if (!t.refresh) throw new Error('Google session expired — reconnect in Settings.'); await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh }); t = tok(); }
    return t.access;
  }
  async function g(method, url, body, { retry = true, raw = false } = {}) {
    const at = await ensureToken();
    const r = await http(method, url, { Authorization: 'Bearer ' + at, ...(body != null ? { 'Content-Type': 'application/json' } : {}) }, body == null ? (method === 'GET' || method === 'DELETE' ? null : '') : JSON.stringify(body), 60000);
    if (r.status === 401 && retry) { const t = tok(); if (t && t.refresh) { await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh }); return g(method, url, body, { retry: false, raw }); } }
    if (r.status >= 400) { const d = parseJSON(r.body, {}); const msg = (d.error && (d.error.message || d.error_description || d.error)) || ('HTTP ' + r.status); throw new Error(r.status === 403 && /insufficient|scope/i.test(msg) ? `Google needs more permissions — enable this service in Settings → Google and reconnect. (${msg})` : `Google: ${msg}`); }
    return raw ? r.body : (parseJSON(r.body, {}) || {});
  }
  const need = svc => { if (!connected()) throw new Error('Google is not connected. Settings → Google → Connect Google (setup steps are shown there).'); if (svc && !has(svc)) throw new Error(`Google ${svc} is not enabled — tick it in Settings → Google and reconnect.`); };

  /* ================================================================== Gmail */
  const GM = 'https://gmail.googleapis.com/gmail/v1/users/me';
  const hdr = (m, n) => ((m.payload && m.payload.headers) || []).find(h => h.name.toLowerCase() === n.toLowerCase())?.value || '';
  const encHeader = s => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${utf8b64(s)}?=`;
  const wrap76 = s => s.replace(/.{1,76}/g, '$&\r\n');
  async function buildMime({ to, cc, bcc, subject, body, attachments = [], inReplyTo, references }) {
    const L = [`From: ${S.settings.googleEmail}`, `To: ${to}`]; if (cc) L.push(`Cc: ${cc}`); if (bcc) L.push(`Bcc: ${bcc}`);
    L.push(`Subject: ${encHeader(subject || '')}`, 'MIME-Version: 1.0'); if (inReplyTo) L.push(`In-Reply-To: ${inReplyTo}`); if (references) L.push(`References: ${references}`);
    const text = ['Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap76(utf8b64(body || ''))].join('\r\n');
    if (!attachments.length) return L.join('\r\n') + '\r\n' + text;
    const bnd = 'nexus_' + uid() + uid();
    const parts = [text];
    for (const p of attachments) {
      const name = cleanPath(p).replace(/^.*\//, ''); const b64 = await fsx.readB64(p);
      parts.push([`Content-Type: ${({ pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', ics: 'text/calendar', zip: 'application/zip', txt: 'text/plain', csv: 'text/csv', mp3: 'audio/mpeg', mp4: 'video/mp4' })[extOf(name)] || 'application/octet-stream'}; name="${name.replace(/"/g, '')}"`, `Content-Disposition: attachment; filename*=UTF-8''${enc(name)}`, 'Content-Transfer-Encoding: base64', '', wrap76(b64)].join('\r\n'));
    }
    return L.join('\r\n') + `\r\nContent-Type: multipart/mixed; boundary="${bnd}"\r\n\r\n` + parts.map(x => `--${bnd}\r\n${x}`).join('\r\n') + `\r\n--${bnd}--`;
  }
  const rawOf = mimeText => utf8b64(mimeText).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  function walkParts(p, out) {
    if (!p) return;
    if (p.filename && p.body && (p.body.attachmentId || p.body.data)) out.atts.push({ name: p.filename, mime: p.mimeType, size: p.body.size, attId: p.body.attachmentId, data: p.body.data });
    else if (p.mimeType === 'text/plain' && p.body && p.body.data) out.text += decodeB64urlText(p.body.data) + '\n';
    else if (p.mimeType === 'text/html' && p.body && p.body.data) out.html += decodeB64urlText(p.body.data) + '\n';
    (p.parts || []).forEach(c => walkParts(c, out));
  }
  async function labelIds(names) {
    const ls = (await g('GET', `${GM}/labels`)).labels || [];
    return names.map(n => { const l = ls.find(x => x.name.toLowerCase() === String(n).toLowerCase() || x.id === n); if (!l) throw new Error(`Label "${n}" not found. Labels: ${ls.map(x => x.name).join(', ')}`); return l.id; });
  }

  /* ================================================================== Google Calendar as a calendar source */
  const CAL = 'https://www.googleapis.com/calendar/v3';
  const localDate = ms => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
  const gTime = (ms, allDay) => allDay ? { date: localDate(ms) } : { dateTime: new Date(ms).toISOString(), timeZone: tz() };
  const fromGTime = t => t.dateTime ? { ms: Date.parse(t.dateTime), allDay: false } : (() => { const [y, m, d] = t.date.split('-').map(Number); return { ms: new Date(y, m - 1, d).getTime(), allDay: true }; })();
  const gcalRef = id => { const [gid, eid] = id.slice(5).split('|'); return { gid, eid }; };
  const gEventBody = ev => {
    const b = {};
    if (ev.title != null) b.summary = ev.title; if (ev.location != null) b.location = ev.location; if (ev.description != null) b.description = ev.description;
    if (ev.startMs != null) { b.start = gTime(ev.startMs, ev.allDay); b.end = gTime(ev.endMs || ev.startMs + 36e5, ev.allDay); }
    if (ev.rrule) b.recurrence = ['RRULE:' + String(ev.rrule).replace(/^RRULE:/i, '')];
    if (ev.attendees) b.attendees = ev.attendees.map(email => ({ email }));
    if (ev.reminderMinutes) b.reminders = { useDefault: false, overrides: ev.reminderMinutes.map(minutes => ({ method: 'popup', minutes })) };
    return b;
  };
  CAL_SOURCES.push({
    name: 'Google Calendar', prefix: 'gcal:',
    async calendars() {
      if (!connected() || !has('calendar')) return [];
      return ((await g('GET', `${CAL}/users/me/calendarList?minAccessRole=reader`)).items || []).filter(c => !c.hidden).map(c => ({ id: 'gcal:' + c.id, gid: c.id, name: c.summaryOverride || c.summary, source: 'Google · ' + (S.settings.googleEmail || 'account'), writable: c.accessRole === 'owner' || c.accessRole === 'writer', primary: !!c.primary }));
    },
    async events(cal, startMs, endMs, query) {
      const q = new URLSearchParams({ timeMin: new Date(startMs).toISOString(), timeMax: new Date(endMs).toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '250' }); if (query) q.set('q', query);
      return ((await g('GET', `${CAL}/calendars/${enc(cal.gid)}/events?${q}`)).items || []).filter(e => e.status !== 'cancelled').map(e => { const s = fromGTime(e.start), en = fromGTime(e.end); return { id: `gcal:${cal.gid}|${e.id}`, title: e.summary || '(no title)', startMs: s.ms, endMs: en.ms, allDay: s.allDay, location: e.location || (e.hangoutLink ? 'Google Meet ' + e.hangoutLink : ''), description: e.description, calendar: cal.name, recurring: !!e.recurringEventId, attendees: (e.attendees || []).map(a => a.email) }; });
    },
    async create(cal, ev) {
      const e = await g('POST', `${CAL}/calendars/${enc(cal.gid)}/events?sendUpdates=all`, gEventBody(ev));
      return { id: `gcal:${cal.gid}|${e.id}`, calendar: cal.name + (ev.attendees && ev.attendees.length ? ' (invites sent)' : '') };
    },
    async update(id, a) {
      const { gid, eid } = gcalRef(id);
      const cur = await g('GET', `${CAL}/calendars/${enc(gid)}/events/${enc(eid)}`);
      const s = fromGTime(cur.start), en = fromGTime(cur.end);
      const base = { title: cur.summary, startMs: s.ms, endMs: en.ms, allDay: s.allDay };
      const upd = eventFromArgs({ ...a, duration_minutes: a.duration_minutes || (en.ms - s.ms) / 6e4 }, base);
      const body = gEventBody({ title: a.title, location: a.location, description: a.description, rrule: a.recurrence, ...(a.start != null || a.end != null ? { startMs: upd.startMs, endMs: upd.endMs, allDay: upd.allDay } : {}) });
      await g('PATCH', `${CAL}/calendars/${enc(gid)}/events/${enc(eid)}?sendUpdates=all`, body);
      return 'Event updated.';
    },
    async remove(id) { const { gid, eid } = gcalRef(id); await g('DELETE', `${CAL}/calendars/${enc(gid)}/events/${enc(eid)}?sendUpdates=all`, null, { raw: true }); return 'Deleted.'; },
  });

  /* ================================================================== Drive / Docs / Sheets */
  const DRV = 'https://www.googleapis.com/drive/v3';
  const GTYPES = { doc: 'application/vnd.google-apps.document', sheet: 'application/vnd.google-apps.spreadsheet', slides: 'application/vnd.google-apps.presentation', folder: 'application/vnd.google-apps.folder', pdf: 'application/pdf', form: 'application/vnd.google-apps.form' };
  async function findFile(ref, type) {
    if (/^[\w-]{25,}$/.test(String(ref))) return { id: ref };
    const m = String(ref).match(/\/d\/([\w-]{20,})/); if (m) return { id: m[1] };
    const q = [`name contains '${String(ref).replace(/'/g, "\\'")}'`, 'trashed = false']; if (type && GTYPES[type]) q.push(`mimeType = '${GTYPES[type]}'`);
    const f = ((await g('GET', `${DRV}/files?${new URLSearchParams({ q: q.join(' and '), pageSize: '5', orderBy: 'modifiedTime desc', fields: 'files(id,name,mimeType)' })}`)).files || [])[0];
    if (!f) throw new Error(`No ${type || 'file'} named "${ref}" in Google Drive`); return f;
  }
  const fmtFile = f => `• ${f.name} · ${f.mimeType.replace('application/vnd.google-apps.', 'Google ').replace(/^application\//, '')}${f.size ? ' · ' + fmtSize(Number(f.size)) : ''} · ${new Date(f.modifiedTime || f.viewedByMeTime || Date.now()).toLocaleDateString()}\n  id: ${f.id}${f.webViewLink ? ' · ' + f.webViewLink : ''}`;
  function docText(doc) {
    const out = []; const walk = els => (els || []).forEach(e => { if (e.paragraph) out.push((e.paragraph.elements || []).map(x => x.textRun ? x.textRun.content : '').join('')); if (e.table) e.table.tableRows.forEach(r => out.push(r.tableCells.map(c => { const t = []; (c.content || []).forEach(x => x.paragraph && t.push(x.paragraph.elements.map(y => y.textRun ? y.textRun.content : '').join('').trim())); return t.join(' '); }).join(' | ') + '\n')); });
    walk(doc.body && doc.body.content); return out.join('');
  }
  async function sheetId(ref) { return (await findFile(ref, 'sheet')).id; }
  async function firstSheetRange(id, range) { if (range && range.includes('!')) return range; const meta = await g('GET', `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties.title`); const t = meta.sheets[0].properties.title; return range ? `'${t}'!${range}` : `'${t}'`; }

  /* ================================================================== Tasks / Contacts */
  const TSK = 'https://tasks.googleapis.com/tasks/v1';
  async function taskList(name) {
    const lists = (await g('GET', `${TSK}/users/@me/lists?maxResults=100`)).items || [];
    if (!lists.length) throw new Error('No task lists');
    return name ? (lists.find(l => l.title.toLowerCase().includes(String(name).toLowerCase())) || (() => { throw new Error('Task list not found. Lists: ' + lists.map(l => l.title).join(', ')); })()) : lists[0];
  }

  /* ================================================================== Maps Platform */
  const mapsKey = () => getKey('svc_gcloud_key');
  async function placesPost(url, body, mask) {
    const r = await http('POST', url, { 'Content-Type': 'application/json', 'X-Goog-Api-Key': mapsKey(), 'X-Goog-FieldMask': mask }, JSON.stringify(body), 30000);
    const d = parseJSON(r.body, {}); if (r.status >= 400) throw new Error('Google Maps: ' + ((d.error && d.error.message) || r.status)); return d;
  }
  const openMaps = (url) => { needNative(); if (N.startIntent(JSON.stringify({ action: 'android.intent.action.VIEW', data: url, package: 'com.google.android.apps.maps' })) === 'ok') return 'opened Google Maps'; return N.openUrl(url) ? 'opened' : 'could not open'; };

  /* ================================================================== Translate engine */
  {
    const coreTranslate = translateText;
    translateText = async (a, ctx) => {
      if ((a.engine || S.settings.translateEngine) !== 'google') return coreTranslate(a, ctx);
      if (!mapsKey()) throw new Error('Add a Google Cloud API key (Settings → Google) with the Cloud Translation API enabled');
      const r = await http('POST', `https://translation.googleapis.com/language/translate/v2?key=${enc(mapsKey())}`, { 'Content-Type': 'application/json' }, JSON.stringify({ q: a.text, target: a.target, ...(a.source ? { source: a.source } : {}), format: 'text' }), 30000);
      const d = parseJSON(r.body, {}); if (!d.data) throw new Error('Google Translate: ' + ((d.error && d.error.message) || r.status));
      const t = d.data.translations[0]; return t.translatedText + (t.detectedSourceLanguage ? `\n(detected: ${t.detectedSourceLanguage})` : '');
    };
  }

  /* ================================================================== skills */
  BUILTIN_SKILLS.push(
    { name: 'google_account', group: 'Google', description: 'Google account status, or connect/disconnect (Gmail, Calendar, Drive, Docs, Sheets, Tasks, Contacts, YouTube).', parameters: P({ action: Str('status | connect | disconnect') }, ['action']),
      run: async a => {
        if (a.action === 'connect') return googleConnect();
        if (a.action === 'disconnect') { const t = tok(); if (t && t.refresh) http('POST', `https://oauth2.googleapis.com/revoke?token=${enc(t.refresh)}`, { 'Content-Type': 'application/x-www-form-urlencoded' }, '', 15000).catch(() => {}); setKey('svc_google', ''); S.settings.googleEmail = ''; save(); return 'Google disconnected and access revoked.'; }
        return connected() ? `Connected: ${S.settings.googleEmail} · services: ${Object.keys(SCOPES).filter(has).join(', ')}` : 'Not connected.' + (mapsKey() ? ' (Maps/Translate API key is set.)' : '');
      } },

    /* ---------------- Gmail */
    { name: 'gmail_search', group: 'Gmail', description: 'Search Gmail with Gmail search syntax (e.g. "is:unread", "from:boss newer_than:7d", "has:attachment invoice"). Returns ids, sender, subject, date, snippet.', parameters: P({ query: Str('Gmail query (default: in:inbox)'), limit: Num('default 10, max 30') }),
      run: async a => {
        need('gmail');
        const ids = ((await g('GET', `${GM}/messages?${new URLSearchParams({ q: a.query || 'in:inbox', maxResults: String(Math.min(30, a.limit || 10)) })}`)).messages || []);
        if (!ids.length) return 'No messages.';
        const ms = await Promise.all(ids.map(m => g('GET', `${GM}/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`)));
        return ms.map(m => `${(m.labelIds || []).includes('UNREAD') ? '● ' : ''}${fmtMailDate(Number(m.internalDate))} · ${hdr(m, 'From')} · ${hdr(m, 'Subject') || '(no subject)'}${(m.labelIds || []).includes('STARRED') ? ' ★' : ''}\n  ${clip(htmlToText(m.snippet || ''), 140)}\n  id: ${m.id}`).join('\n');
      } },
    { name: 'gmail_read', group: 'Gmail', description: 'Read a Gmail message in full by id; save_attachments stores attachments in the workspace.', parameters: P({ id: Str('message id'), save_attachments: Bool(''), mark_read: Bool('') }, ['id']),
      run: async a => {
        need('gmail');
        const m = await g('GET', `${GM}/messages/${enc(a.id)}?format=full`); const out = { text: '', html: '', atts: [] }; walkParts(m.payload, out);
        const saved = [];
        if (a.save_attachments) for (const at of out.atts) { const data = at.data || (await g('GET', `${GM}/messages/${enc(a.id)}/attachments/${enc(at.attId)}`)).data; const p = uniquePath(`gmail/${a.id}/${at.name.replace(/[\\/:*?"<>|]/g, '_')}`); await fsx.writeB64(p, bytesToB64(fromB64url(data))); saved.push(p); }
        if (a.mark_read) await g('POST', `${GM}/messages/${enc(a.id)}/modify`, { removeLabelIds: ['UNREAD'] });
        const atts = out.atts.map((x, i) => `📎 ${x.name} (${x.mime}${x.size ? ', ' + fmtSize(x.size) : ''})${saved[i] ? ' → ' + saved[i] : ''}`).join('\n');
        return `From: ${hdr(m, 'From')}\nTo: ${hdr(m, 'To')}${hdr(m, 'Cc') ? '\nCc: ' + hdr(m, 'Cc') : ''}\nDate: ${hdr(m, 'Date')}\nSubject: ${hdr(m, 'Subject')}\n${atts ? atts + '\n' : ''}\n${clip((out.text.trim() || htmlToText(out.html)).trim(), 16000)}`;
      } },
    { name: 'gmail_send', group: 'Gmail', risky: true, description: 'Send an email from your Gmail (attachments = workspace paths).', parameters: P({ to: Str('recipients'), cc: Str(''), bcc: Str(''), subject: Str(''), body: Str('plain text'), attachments: Arr('workspace paths') }, ['to', 'subject', 'body']),
      run: async a => { need('gmail'); const r = await g('POST', `${GM}/messages/send`, { raw: rawOf(await buildMime(a)) }); return `Sent (id ${r.id}).`; } },
    { name: 'gmail_reply', group: 'Gmail', risky: true, description: 'Reply or reply-all to a Gmail message in the same thread.', parameters: P({ id: Str('message id'), body: Str('reply text'), reply_all: Bool(''), attachments: Arr('workspace paths') }, ['id', 'body']),
      run: async a => {
        need('gmail');
        const m = await g('GET', `${GM}/messages/${enc(a.id)}?format=full`); const me = S.settings.googleEmail.toLowerCase();
        const to = hdr(m, 'Reply-To') || hdr(m, 'From');
        const cc = a.reply_all ? [hdr(m, 'To'), hdr(m, 'Cc')].join(',').split(',').map(x => x.trim()).filter(x => x && !x.toLowerCase().includes(me) && !to.includes(x)).join(', ') : '';
        const subj = hdr(m, 'Subject'); const mid = hdr(m, 'Message-ID') || hdr(m, 'Message-Id');
        const out = { text: '', html: '', atts: [] }; walkParts(m.payload, out);
        const quoted = (out.text || htmlToText(out.html)).split('\n').slice(0, 50).map(l => '> ' + l).join('\n');
        const raw = rawOf(await buildMime({ to, cc, subject: /^re:/i.test(subj) ? subj : 'Re: ' + subj, body: `${a.body}\n\nOn ${hdr(m, 'Date')}, ${hdr(m, 'From')} wrote:\n${quoted}`, attachments: a.attachments || [], inReplyTo: mid, references: [hdr(m, 'References'), mid].filter(Boolean).join(' ') }));
        await g('POST', `${GM}/messages/send`, { raw, threadId: m.threadId });
        return `Replied to ${to}${cc ? ' (cc ' + cc + ')' : ''}.`;
      } },
    { name: 'gmail_draft', group: 'Gmail', description: 'Save an email as a Gmail draft (nothing is sent) — safe for "write an email to…".', parameters: P({ to: Str(''), cc: Str(''), subject: Str(''), body: Str(''), attachments: Arr('') }, ['subject', 'body']),
      run: async a => { need('gmail'); const d = await g('POST', `${GM}/drafts`, { message: { raw: rawOf(await buildMime({ to: a.to || '', ...a })) } }); return `Draft saved (id ${d.id}). Open Gmail → Drafts to review and send.`; } },
    { name: 'gmail_modify', group: 'Gmail', risky: true, description: 'Change Gmail messages: read, unread, archive, trash, star, unstar, label, unlabel, spam.', parameters: P({ ids: Arr('message ids'), action: Str('read | unread | archive | trash | star | unstar | label | unlabel | spam'), label: Str('label name for label/unlabel') }, ['ids', 'action']),
      run: async a => {
        need('gmail');
        if (a.action === 'trash') { for (const id of a.ids) await g('POST', `${GM}/messages/${enc(id)}/trash`, {}); return `Moved ${a.ids.length} to Trash.`; }
        const add = [], rem = [];
        ({ read: () => rem.push('UNREAD'), unread: () => add.push('UNREAD'), archive: () => rem.push('INBOX'), star: () => add.push('STARRED'), unstar: () => rem.push('STARRED'), spam: () => { add.push('SPAM'); rem.push('INBOX'); } }[a.action] || (() => {}))();
        if (a.action === 'label') add.push(...await labelIds([a.label])); if (a.action === 'unlabel') rem.push(...await labelIds([a.label]));
        if (!add.length && !rem.length) return 'Unknown action.';
        await g('POST', `${GM}/messages/batchModify`, { ids: a.ids, addLabelIds: add, removeLabelIds: rem }, { raw: true });
        return `${a.action}: ${a.ids.length} message(s).`;
      } },
    { name: 'gmail_labels', group: 'Gmail', description: 'List Gmail labels.', parameters: P({}),
      run: async () => { need('gmail'); return ((await g('GET', `${GM}/labels`)).labels || []).map(l => `• ${l.name}${l.type === 'system' ? ' (system)' : ''}`).join('\n'); } },

    /* ---------------- Google Calendar extras (events themselves use the Calendar skills) */
    { name: 'gcal_quick_add', group: 'Google Calendar', risky: true, description: 'Add an event to Google Calendar from a natural sentence ("Lunch with Ann Friday 1pm at Café Luna"), optionally with a Google Meet link.', parameters: P({ text: Str('event description'), meet: Bool('add a Google Meet video link'), calendar: Str('optional calendar name') }, ['text']),
      run: async a => {
        need('calendar');
        const cals = await CAL_SOURCES.find(s => s.prefix === 'gcal:').calendars(); const cal = (a.calendar && cals.find(c => c.name.toLowerCase().includes(a.calendar.toLowerCase()))) || cals.find(c => c.primary) || cals[0];
        let e = await g('POST', `${CAL}/calendars/${enc(cal.gid)}/events/quickAdd?text=${enc(a.text)}`, {});
        if (a.meet) e = await g('PATCH', `${CAL}/calendars/${enc(cal.gid)}/events/${enc(e.id)}?conferenceDataVersion=1`, { conferenceData: { createRequest: { requestId: uid() + uid(), conferenceSolutionKey: { type: 'hangoutsMeet' } } } });
        const s = fromGTime(e.start);
        return `Added "${e.summary}" ${fmtWhen(s.ms, s.allDay)} to ${cal.name}${e.hangoutLink ? ' · Meet: ' + e.hangoutLink : ''}. id: gcal:${cal.gid}|${e.id}`;
      } },

    /* ---------------- Drive */
    { name: 'drive_search', group: 'Google Drive', description: 'Find files in Google Drive by name or content; type filter doc/sheet/slides/pdf/folder; recent=true for recently viewed.', parameters: P({ query: Str('words to find'), type: Str('doc | sheet | slides | pdf | folder | any'), recent: Bool('recently viewed instead'), limit: Num('default 10') }),
      run: async a => {
        need('drive');
        const q = ['trashed = false']; if (a.query) q.push(`(name contains '${a.query.replace(/'/g, "\\'")}' or fullText contains '${a.query.replace(/'/g, "\\'")}')`); if (a.type && GTYPES[a.type]) q.push(`mimeType = '${GTYPES[a.type]}'`);
        const d = await g('GET', `${DRV}/files?${new URLSearchParams({ q: q.join(' and '), pageSize: String(a.limit || 10), orderBy: a.recent ? 'viewedByMeTime desc' : 'modifiedTime desc', fields: 'files(id,name,mimeType,modifiedTime,viewedByMeTime,size,webViewLink)' })}`);
        return (d.files || []).map(fmtFile).join('\n') || 'Nothing found.';
      } },
    { name: 'drive_download', group: 'Google Drive', description: 'Download a Drive file to the workspace. Google Docs/Sheets/Slides are exported (format: pdf, docx, xlsx, csv, pptx, txt, md).', parameters: P({ file: Str('file id, link or name'), format: Str('export format for Google files (default pdf)') }, ['file']),
      run: async a => {
        need('drive'); needNative('Downloads');
        const f = await g('GET', `${DRV}/files/${enc((await findFile(a.file)).id)}?fields=id,name,mimeType`);
        const fmt = (a.format || 'pdf').toLowerCase();
        const EXP = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', csv: 'text/csv', txt: 'text/plain', md: 'text/markdown' };
        const isG = f.mimeType.startsWith('application/vnd.google-apps.');
        const url = isG ? `${DRV}/files/${f.id}/export?mimeType=${enc(EXP[fmt] || EXP.pdf)}` : `${DRV}/files/${f.id}?alt=media`;
        const name = isG ? `${f.name.replace(/[\\/:*?"<>|]/g, '_')}.${EXP[fmt] ? fmt : 'pdf'}` : f.name.replace(/[\\/:*?"<>|]/g, '_');
        const r = await nativeAsync('download', JSON.stringify({ url, headers: { Authorization: 'Bearer ' + await ensureToken() }, path: `drive/${name}` }));
        return `saved ${r.path} (${fmtSize(r.size)})`;
      } },
    { name: 'drive_upload', group: 'Google Drive', risky: true, description: 'Upload a workspace file to Google Drive (optionally into a folder).', parameters: P({ path: Str('workspace file'), folder: Str('optional folder name or id'), name: Str('optional new name') }, ['path']),
      run: async a => {
        need('drive'); needNative('Uploads');
        const r = await nativeAsync('uploadRaw', JSON.stringify({ url: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=media', method: 'POST', headers: { Authorization: 'Bearer ' + await ensureToken() }, path: cleanPath(a.path) }));
        const f = parseJSON(r.body, {}); if (!f.id) throw new Error('Upload failed: ' + clip(r.body, 200));
        const qs = new URLSearchParams({ fields: 'id,name,webViewLink' }); if (a.folder) qs.set('addParents', (await findFile(a.folder, 'folder')).id);
        const u = await g('PATCH', `${DRV}/files/${f.id}?${qs}`, { name: a.name || cleanPath(a.path).replace(/^.*\//, '') });
        return `Uploaded ${u.name} · ${u.webViewLink}`;
      } },
    { name: 'drive_share', group: 'Google Drive', risky: true, description: 'Share a Drive file with someone (reader/commenter/writer) or make it viewable by anyone with the link.', parameters: P({ file: Str('id, link or name'), email: Str('person to share with'), role: Str('reader | commenter | writer'), anyone_with_link: Bool('') }, ['file']),
      run: async a => {
        need('drive'); const f = await findFile(a.file);
        const body = a.anyone_with_link ? { type: 'anyone', role: a.role || 'reader' } : { type: 'user', role: a.role || 'reader', emailAddress: a.email };
        if (!a.anyone_with_link && !a.email) throw new Error('email or anyone_with_link required');
        await g('POST', `${DRV}/files/${f.id}/permissions?sendNotificationEmail=${!a.anyone_with_link}`, body);
        const meta = await g('GET', `${DRV}/files/${f.id}?fields=name,webViewLink`);
        return `Shared "${meta.name}" ${a.anyone_with_link ? 'with anyone who has the link' : 'with ' + a.email} as ${body.role} · ${meta.webViewLink}`;
      } },

    /* ---------------- Docs & Sheets */
    { name: 'docs_read', group: 'Google Docs', description: 'Read a Google Doc as text (id, link or name).', parameters: P({ doc: Str('id, link or name') }, ['doc']),
      run: async a => { need('docs'); const id = (await findFile(a.doc, 'doc')).id; const d = await g('GET', `https://docs.googleapis.com/v1/documents/${id}`); return `${d.title}\n\n${clip(docText(d), 20000)}`; } },
    { name: 'docs_create', group: 'Google Docs', description: 'Create a Google Doc with content (meeting notes, letters, summaries).', parameters: P({ title: Str(''), content: Str('text (markdown headings/bullets become plain text)') }, ['title', 'content']),
      run: async a => {
        need('docs'); const d = await g('POST', 'https://docs.googleapis.com/v1/documents', { title: a.title });
        const text = String(a.content).replace(/^#{1,6}\s+/gm, '').replace(/\*\*(.+?)\*\*/g, '$1');
        if (text) await g('POST', `https://docs.googleapis.com/v1/documents/${d.documentId}:batchUpdate`, { requests: [{ insertText: { location: { index: 1 }, text } }] });
        return `Created "${a.title}" · https://docs.google.com/document/d/${d.documentId}/edit`;
      } },
    { name: 'docs_append', group: 'Google Docs', risky: true, description: 'Append text to the end of a Google Doc (journal, running notes, shopping list doc…).', parameters: P({ doc: Str('id, link or name'), text: Str('text to add') }, ['doc', 'text']),
      run: async a => { need('docs'); const id = (await findFile(a.doc, 'doc')).id; const d = await g('GET', `https://docs.googleapis.com/v1/documents/${id}`); const end = d.body.content[d.body.content.length - 1].endIndex - 1; await g('POST', `https://docs.googleapis.com/v1/documents/${id}:batchUpdate`, { requests: [{ insertText: { location: { index: Math.max(1, end) }, text: '\n' + a.text } }] }); return `Added to "${d.title}".`; } },
    { name: 'sheets_read', group: 'Google Docs', description: 'Read values from a Google Sheet (range like "A1:D20" or "Sheet2!A:C"; default the first sheet).', parameters: P({ sheet: Str('id, link or name'), range: Str('optional A1 range') }, ['sheet']),
      run: async a => { need('sheets'); const id = await sheetId(a.sheet); const range = await firstSheetRange(id, a.range); const v = (await g('GET', `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${enc(range)}`)).values || []; return v.length ? clip(v.slice(0, 200).map(r => r.join('\t')).join('\n'), 16000) : 'Empty range.'; } },
    { name: 'sheets_append', group: 'Google Docs', risky: true, description: 'Append rows to a Google Sheet (expense log, workout log, inventory…). Formulas allowed.', parameters: P({ sheet: Str('id, link or name'), rows: { type: 'array', items: { type: 'array', items: {} }, description: 'rows of cell values' }, range: Str('optional target sheet/range') }, ['sheet', 'rows']),
      run: async a => { need('sheets'); const id = await sheetId(a.sheet); const range = await firstSheetRange(id, a.range); const r = await g('POST', `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${enc(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, { values: a.rows }); return `Appended ${a.rows.length} row(s) at ${(r.updates || {}).updatedRange || range}.`; } },
    { name: 'sheets_update', group: 'Google Docs', risky: true, description: 'Write values into a range of a Google Sheet.', parameters: P({ sheet: Str('id, link or name'), range: Str('A1 range, e.g. B2:C4'), values: { type: 'array', items: { type: 'array', items: {} }, description: 'rows' } }, ['sheet', 'range', 'values']),
      run: async a => { need('sheets'); const id = await sheetId(a.sheet); const range = await firstSheetRange(id, a.range); const r = await g('PUT', `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${enc(range)}?valueInputOption=USER_ENTERED`, { values: a.values }); return `Updated ${r.updatedCells || 0} cells in ${r.updatedRange || range}.`; } },
    { name: 'sheets_create', group: 'Google Docs', description: 'Create a new Google Sheet, optionally with rows (first row = headers).', parameters: P({ title: Str(''), rows: { type: 'array', items: { type: 'array', items: {} }, description: 'optional initial rows' } }, ['title']),
      run: async a => { need('sheets'); const s = await g('POST', 'https://sheets.googleapis.com/v4/spreadsheets', { properties: { title: a.title } }); if (a.rows && a.rows.length) await g('PUT', `https://sheets.googleapis.com/v4/spreadsheets/${s.spreadsheetId}/values/A1?valueInputOption=USER_ENTERED`, { values: a.rows }); return `Created "${a.title}" · ${s.spreadsheetUrl}`; } },

    /* ---------------- Tasks */
    { name: 'gtasks_list', group: 'Google Tasks', description: 'Show Google Tasks (to-dos), optionally from a named list and including completed.', parameters: P({ list: Str('optional list name'), show_completed: Bool('') }),
      run: async a => { need('tasks'); const l = await taskList(a.list); const t = (await g('GET', `${TSK}/lists/${l.id}/tasks?showCompleted=${!!a.show_completed}&showHidden=${!!a.show_completed}&maxResults=100`)).items || []; return `${l.title}:\n` + (t.map(x => `${x.status === 'completed' ? '☑' : '☐'} ${x.title}${x.due ? ' · due ' + x.due.slice(0, 10) : ''}${x.notes ? ' — ' + clip(x.notes, 80) : ''}\n  id: ${x.id}`).join('\n') || '(empty)'); } },
    { name: 'gtasks_add', group: 'Google Tasks', description: 'Add a Google Task (to-do) with optional due date and notes.', parameters: P({ title: Str(''), due: Str('optional YYYY-MM-DD'), notes: Str(''), list: Str('optional list name') }, ['title']),
      run: async a => { need('tasks'); const l = await taskList(a.list); const t = await g('POST', `${TSK}/lists/${l.id}/tasks`, { title: a.title, notes: a.notes, ...(a.due ? { due: `${String(a.due).slice(0, 10)}T00:00:00.000Z` } : {}) }); return `Added "${t.title}" to ${l.title}${a.due ? ' (due ' + a.due + ')' : ''}.`; } },
    { name: 'gtasks_update', group: 'Google Tasks', description: 'Complete, reopen or delete a Google Task by id or title.', parameters: P({ task: Str('id or title'), action: Str('complete | reopen | delete'), list: Str('optional list name') }, ['task', 'action']),
      run: async a => {
        need('tasks'); const l = await taskList(a.list); const all = (await g('GET', `${TSK}/lists/${l.id}/tasks?showCompleted=true&showHidden=true&maxResults=100`)).items || [];
        const t = all.find(x => x.id === a.task) || all.find(x => x.title.toLowerCase().includes(String(a.task).toLowerCase())); if (!t) return 'Task not found.';
        if (a.action === 'delete') { await g('DELETE', `${TSK}/lists/${l.id}/tasks/${t.id}`, null, { raw: true }); return `Deleted "${t.title}".`; }
        await g('PATCH', `${TSK}/lists/${l.id}/tasks/${t.id}`, a.action === 'reopen' ? { status: 'needsAction', completed: null } : { status: 'completed' });
        return `${a.action === 'reopen' ? 'Reopened' : 'Completed'} "${t.title}".`;
      } },

    /* ---------------- Contacts / YouTube / Google apps */
    { name: 'google_contacts', group: 'Google', description: 'Look up your Google Contacts (names, emails, phone numbers, company) — works on glasses without a synced phonebook.', parameters: P({ query: Str('name, email or company') }, ['query']),
      run: async a => {
        need('contacts'); const url = q => `https://people.googleapis.com/v1/people:searchContacts?${new URLSearchParams({ query: q, readMask: 'names,emailAddresses,phoneNumbers,organizations', pageSize: '10' })}`;
        await g('GET', url('')).catch(() => {}); // warm-up request recommended by the People API
        const r = (await g('GET', url(a.query))).results || [];
        return r.map(({ person: p }) => `• ${(p.names || [{}])[0].displayName || '?'}${p.organizations ? ' · ' + p.organizations[0].name : ''}\n  ${(p.emailAddresses || []).map(e => e.value).join(', ')} ${(p.phoneNumbers || []).map(n => n.value).join(', ')}`).join('\n') || 'No contacts found.';
      } },
    { name: 'youtube_mine', group: 'Google', description: 'Your YouTube account: liked videos, your playlists, or subscriptions.', parameters: P({ what: Str('liked | playlists | subscriptions') }, ['what']),
      run: async a => {
        need('youtube'); const Y = 'https://www.googleapis.com/youtube/v3';
        if (a.what === 'playlists') return ((await g('GET', `${Y}/playlists?part=snippet,contentDetails&mine=true&maxResults=25`)).items || []).map(p => `• ${p.snippet.title} · ${p.contentDetails.itemCount} videos · playlist_id ${p.id}`).join('\n');
        if (a.what === 'subscriptions') return ((await g('GET', `${Y}/subscriptions?part=snippet&mine=true&maxResults=30&order=alphabetical`)).items || []).map(s => `• ${s.snippet.title}`).join('\n');
        return ((await g('GET', `${Y}/videos?part=snippet&myRating=like&maxResults=20`)).items || []).map(v => `• ${v.snippet.title} — ${v.snippet.channelTitle} · video_id ${v.id}`).join('\n');
      } },
    { name: 'google_open', group: 'Google', description: 'Open a Google app: search (query), news, lens (camera search), assistant, gmail, calendar, drive, photos, keep, home, translate, wallet, fit.', parameters: P({ app: Str('app'), query: Str('for search') }, ['app']),
      run: async a => {
        needNative(); const k = String(a.app).toLowerCase();
        if (k === 'search' || k === 'news') { const url = k === 'news' ? 'https://news.google.com/' : `https://www.google.com/search?q=${enc(a.query || '')}`; return N.startIntent(JSON.stringify({ action: 'android.intent.action.VIEW', data: url, package: 'com.google.android.googlequicksearchbox' })) === 'ok' ? 'opened Google' : (N.openUrl(url) ? 'opened' : 'failed'); }
        if (k === 'lens') return N.startIntent(JSON.stringify({ action: 'android.intent.action.VIEW', data: 'googleapp://lens', package: 'com.google.android.googlequicksearchbox' }));
        if (k === 'assistant') return N.startIntent(JSON.stringify({ action: 'android.intent.action.VOICE_COMMAND' }));
        const pk = { gmail: 'com.google.android.gm', calendar: 'com.google.android.calendar', drive: 'com.google.android.apps.docs', photos: 'com.google.android.apps.photos', keep: 'com.google.android.keep', home: 'com.google.android.apps.chromecast.app', translate: 'com.google.android.apps.translate', wallet: 'com.google.android.apps.walletnfcrel', fit: 'com.google.android.apps.fitness', maps: 'com.google.android.apps.maps', youtube: 'com.google.android.youtube' }[k];
        if (!pk) return 'Unknown Google app';
        return N.launchApp(pk) ? `opened Google ${a.app}` : `Google ${a.app} is not installed`;
      } },

    /* ---------------- Google Maps */
    { name: 'gmaps_places', group: 'Google Maps', description: 'Search Google Maps places (restaurants, shops, services) with ratings, open-now, price level, address and Maps link. Needs a Google Cloud API key (Places API); falls back to the Apple Maps/OSM search.', parameters: P({ query: Str('what to find'), near: Str('optional place or "here"'), open_now: Bool(''), limit: Num('default 8') }, ['query']),
      run: async (a, ctx) => {
        if (!mapsKey()) return execSkill('apple_maps_search', { query: a.query, near: a.near, limit: a.limit }, ctx);
        let center = null; try { center = await resolvePlace(a.near || 'here'); } catch { /* no location: search without bias */ }
        const body = { textQuery: a.query, pageSize: Math.min(20, a.limit || 8), ...(a.open_now ? { openNow: true } : {}), ...(center ? { locationBias: { circle: { center: { latitude: center.lat, longitude: center.lon }, radius: 8000 } } } : {}) };
        const d = await placesPost('https://places.googleapis.com/v1/places:searchText', body, 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.currentOpeningHours.openNow,places.priceLevel,places.googleMapsUri,places.location');
        return (d.places || []).map(p => `• ${p.displayName.text}${p.rating ? ` ★${p.rating} (${p.userRatingCount})` : ''}${p.currentOpeningHours ? (p.currentOpeningHours.openNow ? ' · open now' : ' · closed') : ''}${p.priceLevel ? ' · ' + p.priceLevel.replace('PRICE_LEVEL_', '').toLowerCase() : ''}\n  ${p.formattedAddress}\n  place_id: ${p.id} · ${p.googleMapsUri}`).join('\n') || 'No places found.';
      } },
    { name: 'gmaps_place_details', group: 'Google Maps', description: 'Details of a Google Maps place: hours, phone, website, rating, summary and top reviews.', parameters: P({ place_id: Str('from gmaps_places') }, ['place_id']),
      run: async a => {
        if (!mapsKey()) throw new Error('Needs a Google Cloud API key (Settings → Google)');
        const r = await http('GET', `https://places.googleapis.com/v1/places/${enc(a.place_id)}`, { 'X-Goog-Api-Key': mapsKey(), 'X-Goog-FieldMask': 'displayName,formattedAddress,nationalPhoneNumber,websiteUri,regularOpeningHours.weekdayDescriptions,rating,userRatingCount,editorialSummary,reviews,googleMapsUri' }, null, 30000);
        const p = parseJSON(r.body, {}); if (r.status >= 400) throw new Error('Google Maps: ' + ((p.error && p.error.message) || r.status));
        return J({ name: p.displayName && p.displayName.text, address: p.formattedAddress, phone: p.nationalPhoneNumber, website: p.websiteUri, rating: p.rating, ratings: p.userRatingCount, summary: p.editorialSummary && p.editorialSummary.text, hours: p.regularOpeningHours && p.regularOpeningHours.weekdayDescriptions, reviews: (p.reviews || []).slice(0, 3).map(x => `${x.rating}★ ${clip(x.text && x.text.text, 200)}`), maps: p.googleMapsUri });
      } },
    { name: 'gmaps_directions', group: 'Google Maps', description: 'Route with live traffic (Google Routes API): distance, time, turn-by-turn. Without an API key, opens Google Maps navigation instead.', parameters: P({ destination: Str(''), origin: Str('default: current location'), mode: Str('drive | walk | bicycle | transit'), navigate: Bool('start turn-by-turn navigation in Google Maps') }, ['destination']),
      run: async a => {
        const mode = (a.mode || 'drive').toLowerCase();
        if (a.navigate || !mapsKey()) { const url = a.navigate ? `google.navigation:q=${enc(a.destination)}&mode=${{ walk: 'w', bicycle: 'b' }[mode] || 'd'}` : `https://www.google.com/maps/dir/?api=1&destination=${enc(a.destination)}${a.origin ? '&origin=' + enc(a.origin) : ''}&travelmode=${{ drive: 'driving', walk: 'walking', bicycle: 'bicycling', transit: 'transit' }[mode] || 'driving'}`; return openMaps(url) + ' · ' + url; }
        const wp = async p => { if (!p || /^here$/i.test(p)) { const l = await currentLocation(); return { location: { latLng: { latitude: l.lat, longitude: l.lon } } }; } return { address: p }; };
        const body = { origin: await wp(a.origin), destination: await wp(a.destination), travelMode: { drive: 'DRIVE', walk: 'WALK', bicycle: 'BICYCLE', transit: 'TRANSIT' }[mode] || 'DRIVE', ...(mode === 'drive' ? { routingPreference: 'TRAFFIC_AWARE' } : {}) };
        const d = await placesPost('https://routes.googleapis.com/directions/v2:computeRoutes', body, 'routes.duration,routes.staticDuration,routes.distanceMeters,routes.description,routes.legs.steps.navigationInstruction,routes.legs.steps.distanceMeters');
        const r = (d.routes || [])[0]; if (!r) return 'No route found.';
        const secs = s => Math.round(parseInt(s, 10) / 60);
        const steps = (r.legs || []).flatMap(l => l.steps || []).filter(s => s.navigationInstruction).map(s => `${s.navigationInstruction.instructions} (${s.distanceMeters} m)`);
        return J({ via: r.description, distance_km: Math.round(r.distanceMeters / 100) / 10, minutes_with_traffic: secs(r.duration), minutes_without_traffic: r.staticDuration ? secs(r.staticDuration) : undefined, steps: steps.slice(0, 40) });
      } },
  );

  /* ================================================================== settings */
  const coreRenderPro = renderProSettings, coreBindPro = bindProSettings;
  renderProSettings = () => {
    const sv = S.settings.googleServices;
    return coreRenderPro() + `<div class="card" id="googleCard"><h3>Google</h3>
      <p class="hint">${connected() ? `Connected: <b>${esc(S.settings.googleEmail)}</b> · ${Object.keys(SCOPES).filter(has).join(', ')}` : 'Not connected.'}</p>
      <details${S.settings.googleClientId ? '' : ' open'}><summary class="hint" tabindex="0">One-time setup (about 5 minutes, free)</summary><ol class="hint">
        <li>console.cloud.google.com → create a project.</li>
        <li>APIs &amp; Services → Library: enable Gmail, Google Calendar, Drive, Docs, Sheets, Tasks, People (and YouTube Data) APIs.</li>
        <li>OAuth consent screen: External, add yourself as a test user (or publish it for personal use so sign-in does not expire after 7 days).</li>
        <li>Credentials → Create OAuth client ID → type <b>Desktop app</b> → copy the client ID and secret below.</li>
        <li>Optional: Credentials → API key with Places API (New), Routes API and Cloud Translation API for Maps and Translate.</li></ol></details>
      <div class="row"><div><label>OAuth client ID</label><input data-k="googleClientId"></div><div><label>Client secret</label><input type="password" data-secret="svc_google_secret" placeholder="${getKey('svc_google_secret') ? 'saved ✓' : ''}"></div></div>
      <div class="grid2">${Object.keys(SCOPES).map(k => `<label class="inline"><input type="checkbox" data-gsvc="${k}" ${sv[k] ? 'checked' : ''}>${k}</label>`).join('')}</div>
      <div class="row"><button class="primary nogrow" id="gConnect">${connected() ? 'Reconnect' : 'Connect Google'}</button>${connected() ? '<button class="danger nogrow" id="gDisc">Disconnect</button>' : ''}</div>
      <label>Signed in on another device? Paste the final http://127.0.0.1… address here</label><div class="row"><input id="gPaste"><button class="nogrow" id="gPasteGo">Finish</button></div>
      <div class="row"><div><label>Google Cloud API key (Maps Places/Routes, Translate)</label><input type="password" data-secret="svc_gcloud_key" placeholder="${getKey('svc_gcloud_key') ? 'saved ✓' : ''}"></div></div>
    </div>`;
  };
  bindProSettings = v => {
    coreBindPro(v);
    const card = $('#googleCard', v); if (!card) return;
    bind(card, S.settings);
    $$('[data-secret]', card).forEach(el => el.addEventListener('change', () => { setKey(el.dataset.secret, el.value); el.value = ''; el.placeholder = 'saved ✓'; toast('Saved on device'); }));
    $$('[data-gsvc]', card).forEach(cb => cb.onchange = () => { S.settings.googleServices = { ...S.settings.googleServices, [cb.dataset.gsvc]: cb.checked }; save(); });
    $('#gConnect', card).onclick = () => { toast('Opening Google sign-in…'); googleConnect().then(m => { toast(m); renderSettings(); }).catch(e => toast(e.message)); };
    const d = $('#gDisc', card); if (d) d.onclick = () => execSkill('google_account', { action: 'disconnect' }, { agent: S.agents[0], depth: 0, origin: 'ui', token: runToken }).then(m => { toast(m); renderSettings(); });
    $('#gPasteGo', card).onclick = () => googlePaste($('#gPaste', card).value).then(m => { toast(m); renderSettings(); }).catch(e => toast(e.message));
  };
  // Translation engine option.
  { const coreRender = renderProSettings; renderProSettings = () => coreRender().replace('<option value="libre">LibreTranslate</option>', '<option value="libre">LibreTranslate</option><option value="google">Google Translate (API key)</option>'); }
  { const coreSecrets = secretIds; secretIds = () => [...coreSecrets(), { id: 'svc_google_secret', name: 'Google OAuth client secret' }, { id: 'svc_gcloud_key', name: 'Google Cloud API key' }]; }

  window.NexusGoogle = { googleConnect, googlePaste, finishWithQuery, buildMime, g, connected };
})();
