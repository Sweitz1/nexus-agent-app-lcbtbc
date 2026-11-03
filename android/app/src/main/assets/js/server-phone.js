/* Nexus Agent (phone) — server for the Nexus Glasses client APK.
 *
 * The glasses app is a thin client: voice, display, camera, touchpad and head gestures.
 * Everything else runs here on the phone (models, keys, skills, accounts, AutoGPT).
 * Transport: the existing LAN server (token-protected) under /client/…, discovered via mDNS
 * (_nexus._tcp). Pairing: a 6-digit PIN (shown as text + QR) is exchanged for the token. */
'use strict';
(() => {
  S.settings = { glassesServer: false, glassesForwardNotifications: true, glassesRemoteAddr: '', ...S.settings };
  // Every address the glasses may use to reach this phone: Wi-Fi/hotspot IPs, VPN (e.g. Tailscale 100.x)
  // and an optional remote address for glasses on their own eSIM / mobile data.
  function phoneAddrs() {
    const port = Number(S.settings.server.port) || 8787; const info = parseJSON(N.deviceInfo(), {});
    const ips = [...new Set([info.ip, ...(info.ips || [])].filter(Boolean))].map(ip => `${ip}:${port}`);
    const extra = String(S.settings.glassesRemoteAddr || '').split(/[\s,]+/).filter(Boolean).map(a => /:\d+$/.test(a) ? a : `${a}:${port}`);
    return [...new Set([...ips, ...extra])];
  }
  const reply = (ev, status, data) => N.serverRespond(ev.reqId, status, 'application/json', JSON.stringify(data));

  /* ---------------------------------------------------------------- event stream (long-poll) */
  let seq = 0; const events = []; let waiters = [];
  function pushEvent(e) { e.seq = ++seq; e.ts = Date.now(); events.push(e); while (events.length > 200) events.shift(); const w = waiters; waiters = []; w.forEach(f => f()); }
  let lastSeen = 0, clientName = '';
  const online = () => Date.now() - lastSeen < 70000;
  const seen = name => { lastSeen = Date.now(); if (name) clientName = name; };

  /* ---------------------------------------------------------------- pairing */
  let pin = null, pinExp = 0, pinFails = 0;
  function newPin() { pin = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000)); pinExp = Date.now() + 5 * 60000; pinFails = 0; return pin; }

  /* ---------------------------------------------------------------- confirmations go to the glasses */
  const htmlText = h => { const d = document.createElement('div'); d.innerHTML = String(h).replace(/<br\s*\/?>|<\/p>/gi, ' '); return d.textContent.replace(/\s+/g, ' ').trim().slice(0, 600); };
  const pendingConfirms = new Map();
  {
    const coreConfirm = confirmBox;
    confirmBox = (html, timeoutMs) => {
      if (!online()) return coreConfirm(html, timeoutMs);
      return new Promise(res => {
        const id = uid(); let done = false;
        const fin = v => { if (done) return; done = true; pendingConfirms.delete(id); if (modalClose) modalClose(); res(!!v); };
        pendingConfirms.set(id, fin);
        pushEvent({ type: 'confirm', id, text: htmlText(html), timeoutMs: timeoutMs || 60000 });
        coreConfirm(html, timeoutMs).then(fin);   // also answerable on the phone; first answer wins
      });
    };
  }

  /* ---------------------------------------------------------------- forward chat activity + notifications */
  // Replies the phone produces outside a glasses request (phone chat, AutoGPT reports, Telegram,
  // webhooks, scheduled runs) are pushed to the glasses once they are complete.
  const forwarded = new WeakSet(); let connectedAt = 0;
  setInterval(() => {
    if (!online()) { connectedAt = 0; return; }
    if (!connectedAt) { connectedAt = Date.now(); S.chat.forEach(m => forwarded.add(m)); return; }
    for (const m of S.chat.slice(-40)) {
      if (forwarded.has(m) || m.pending) continue;
      forwarded.add(m);
      if (m.origin === 'glasses' || m.error) continue;
      if (m.role === 'assistant') pushEvent({ type: 'message', agent: m.agent, text: stripThink(m.content).slice(0, 4000) });
      else if (m.role === 'system' && /^🔔|^🤖/.test(m.content)) pushEvent({ type: 'message', agent: 'Nexus', text: m.content.slice(0, 1000) });
    }
  }, 1500);
  onNative('notification', n => { if (S.settings.glassesForwardNotifications && online()) pushEvent({ type: 'notification', app: n.app, title: n.title, text: clip(n.text || '', 300) }); });

  /* ---------------------------------------------------------------- routes */
  const SAFE_SKILLS = ['music_now_playing', 'music_control', 'autogpt_status', 'calendar_events', 'notifications_read', 'glasses_status', 'datetime', 'spotify_now_playing', 'audiobook_control', 'gtasks_list', 'shopping_list'];
  onNative('webhook', async ev => {
    const path = String(ev.path || '');
    if (!path.startsWith('/client/')) return;
    const b = parseJSON(ev.body, {}) || {};
    try {
      if (path === '/client/pair') {
        if (!pin || Date.now() > pinExp) return reply(ev, 403, { error: 'No pairing in progress — on the phone press "Pair glasses"' });
        if (pinFails >= 5) { pin = null; return reply(ev, 429, { error: 'Too many wrong codes — start pairing again on the phone' }); }
        if (String(b.pin || '').trim() !== pin) { pinFails++; return reply(ev, 401, { error: 'Wrong code' }); }
        pin = null; seen(b.device); toast(`Glasses paired: ${b.device || 'client'}`);
        if ($('#modal').classList.contains('show') && modalClose) modalClose();
        return reply(ev, 200, { token: S.settings.server.token, name: deviceLabel(), hosts: phoneAddrs() });
      }
      seen(b.device || (new URLSearchParams(ev.query || '')).get('device'));
      if (path === '/client/hello') {
        let battery = null; try { battery = parseJSON(N.deviceStatus(), {}).battery; } catch { /* optional */ }
        return reply(ev, 200, { name: deviceLabel(), agents: S.agents.map(a => ({ id: a.id, name: a.name })), current: (agentById(S.current) || {}).name, mode: S.mode, battery, seq, wake: !!(N.wakeRunning && N.wakeRunning()) });
      }
      if (path === '/client/ask') {
        const text = String(b.text || '').trim(); const images = (b.images || []).slice(0, 4);
        if (!text && !images.length) return reply(ev, 400, { error: 'empty request' });
        const attachments = [];
        for (const [i, im] of images.entries()) attachments.push(await fsx.writeB64(`glasses/cam_${tsName()}_${i}.${/png/.test(im.mime) ? 'png' : 'jpg'}`, im.b64));
        const agent = (b.agent && agentByName(b.agent)) || agentById(S.current) || S.agents[0];
        const r = await dispatch(text || 'What am I looking at? Be brief.', { origin: 'glasses', agentId: agent.id, mode: b.mode || (S.mode === 'auto' ? 'auto' : S.mode), attachments });
        return reply(ev, 200, { agent: r.agent, reply: stripThink(r.text) });
      }
      if (path === '/client/events') {
        const since = Number((new URLSearchParams(ev.query || '')).get('since') || 0);
        const pick = () => events.filter(e => e.seq > since);
        if (!pick().length) await new Promise(res => { const t = setTimeout(res, 25000); waiters.push(() => { clearTimeout(t); res(); }); });
        return reply(ev, 200, { seq, events: pick() });
      }
      if (path === '/client/confirm') { const f = pendingConfirms.get(b.id); if (f) f(!!b.ok); return reply(ev, 200, { ok: !!f }); }
      if (path === '/client/stop') { stopRun(); return reply(ev, 200, { ok: true }); }
      if (path === '/client/skill') {
        if (!SAFE_SKILLS.includes(b.name)) return reply(ev, 403, { error: 'Skill not available to the glasses quick menu; ask the agent instead' });
        const out = await execSkill(b.name, b.args || {}, { agent: agentById(S.current) || S.agents[0], depth: 0, origin: 'glasses', token: runToken });
        return reply(ev, 200, { result: String(out) });
      }
      return reply(ev, 404, { error: 'unknown client path' });
    } catch (e) { reply(ev, 500, { error: e.message }); }
  });

  /* ---------------------------------------------------------------- phone settings card */
  function ensureServer() {
    if (!S.settings.server.enabled) { S.settings.server.enabled = true; save(); applyServer(); }
    if (N && !N.serverRunning()) applyServer();
  }
  async function pairUI() {
    needNative('Glasses pairing'); ensureServer();
    const info = parseJSON(N.deviceInfo(), {}); const p = newPin();
    const payload = JSON.stringify({ nexus: 1, host: info.ip, port: Number(S.settings.server.port) || 8787, pin: p, hosts: phoneAddrs() });
    let qr = ''; try { qr = await NexusMedia.qrDataUrl(payload); } catch { /* optional */ }
    $('#modalBox').innerHTML = `<h3>Pair Nexus Glasses</h3><p>Open <b>Nexus Glasses</b> on your glasses (same Wi-Fi). It finds this phone automatically — then scan this code with the glasses camera, or enter the code:</p>
      <div style="font-size:2.4em;letter-spacing:.25em;text-align:center;color:var(--accent);font-weight:700">${p}</div>
      ${qr ? `<div style="text-align:center"><img src="${esc(wsUrl(qr))}" alt="" style="width:13em;background:#fff;padding:.5em;border-radius:8px"></div>` : ''}
      <p class="hint">Phone address ${esc(info.ip || '?')}:${esc(String(S.settings.server.port))} · code valid 5 minutes</p><div class="row"><button id="prX">Close</button></div>`;
    $('#modal').classList.add('show'); modalClose = () => { $('#modal').classList.remove('show'); modalClose = null; }; $('#prX').onclick = () => modalClose();
  }
  const coreRenderPro = renderProSettings, coreBindPro = bindProSettings;
  renderProSettings = () => coreRenderPro() + `<div class="card" id="glassSrvCard"><h3>Nexus Glasses (client app)</h3>
    <p class="hint">Run Nexus on this phone and use the lightweight <b>Nexus Glasses</b> app on your RayNeo X3 Pro (or any Android glasses): voice, display and camera on the glasses; models, keys, skills and accounts stay on the phone.</p>
    <p>${online() ? `<span class="status-dot on"></span>Connected: <b>${esc(clientName || 'glasses')}</b>` : '<span class="status-dot"></span>No glasses connected'}</p>
    <div class="row"><button class="primary nogrow" id="gsPair">Pair glasses</button></div>
    <label class="inline"><input type="checkbox" data-k="glassesForwardNotifications" data-t="bool">Forward phone notifications to the glasses</label>
    <label>Remote address for glasses on mobile data / eSIM (optional)</label><input data-k="glassesRemoteAddr" placeholder="e.g. my-phone.tailnet.ts.net or 100.101.102.103">
    <p class="hint">When the glasses use their own eSIM they are not on your Wi-Fi. Install <b>Tailscale</b> (or another private VPN) on both phone and glasses and pair once; the glasses then reach the phone over the VPN automatically. Don't expose the port to the open internet.</p>
    <p class="hint">Keep Nexus running on the phone (it can stay in the background). Both devices must be on the same Wi-Fi or the phone's hotspot.</p></div>`;
  bindProSettings = v => { coreBindPro(v); const c = $('#glassSrvCard', v); if (!c) return; bind(c, S.settings); $('#gsPair', c).onclick = () => pairUI().catch(e => toast(e.message)); };

  BUILTIN_SKILLS.push({ name: 'glasses_client', group: 'Glasses', description: 'Status of the paired Nexus Glasses client app, or start pairing (shows a code/QR on the phone).', parameters: { type: 'object', properties: { action: { type: 'string', description: 'status | pair' } }, required: ['action'] },
    run: async a => { if (a.action === 'pair') { await pairUI(); return 'Pairing code shown on the phone — scan it with Nexus Glasses.'; } return online() ? `Glasses connected: ${clientName || 'client'} (last seen ${Math.round((Date.now() - lastSeen) / 1000)}s ago).` : 'No glasses client connected.'; } });

  window.NexusPhoneServer = { pushEvent, newPin, online, events };
})();
