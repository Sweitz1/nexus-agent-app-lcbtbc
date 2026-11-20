/* Nexus Agent: companion pack. Characters (SillyTavern-compatible cards), companion /
 * role-play chat with SFW and opt-in mature (18+) content, GitHub SKILL.md libraries,
 * and the Arkon knowledge hub. Loaded after skills-auto.js.
 *
 * Content policy: SFW by default. Mature mode needs an explicit 18+ confirmation, mature
 * characters must be confirmed as adults, and content involving minors is never allowed. */
'use strict';
(() => {
  const P = (props, req = []) => ({ type: 'object', properties: props, required: req });
  const Str = d => ({ type: 'string', description: d });
  const Num = d => ({ type: 'number', description: d });
  const J = o => JSON.stringify(o, null, 1);
  const LSJ = { get: (k, d) => parseJSON(localStorage.getItem(k), d), set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast('Storage full: ' + e.message); } } };
  const st = () => S.settings;
  if (!Array.isArray(st().skillSources)) st().skillSources = ['anthropics/skills'];

  /* ================================================================== files in/out */
  async function pickFilesBytes(accept) {
    if (N) {
      const paths = await importFiles('*/*');
      const out = [];
      for (const p of paths) out.push({ name: p.split('/').pop(), bytes: await fsx.bytes(p) });
      return out;
    }
    return new Promise(res => {
      const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.accept = accept || '';
      i.onchange = async () => { const out = []; for (const f of i.files) out.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }); res(out); };
      i.click();
    });
  }
  async function saveBytes(name, bytes, mime) {
    if (N) {
      const path = await fsx.writeBytes(uniquePath('exports/' + name), bytes);
      await nativeAsync('exportFile', path);
      return path;
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: mime })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return name;
  }

  /* ================================================================== PNG character cards */
  // SillyTavern stores cards as base64 JSON in a PNG tEXt chunk: "chara" (V2) or "ccv3" (V3).
  const PNGCARD = (() => {
    const T = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
    const crc = b => { let c = 0xffffffff; for (const x of b) c = T[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
    function chunks(buf) {
      if (![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => buf[i] === v)) throw new Error('Not a PNG file.');
      const out = []; let o = 8;
      while (o + 8 <= buf.length) {
        const len = u32(buf, o), type = String.fromCharCode(...buf.subarray(o + 4, o + 8));
        out.push({ type, start: o, end: o + 12 + len, data: buf.subarray(o + 8, o + 8 + len) });
        o += 12 + len; if (type === 'IEND') break;
      }
      return out;
    }
    const b64ToUtf8 = s => new TextDecoder().decode(Uint8Array.from(atob(s.trim()), c => c.charCodeAt(0)));
    return {
      read(buf) {
        const texts = chunks(buf).filter(c => c.type === 'tEXt').map(c => { const z = c.data.indexOf(0); return { key: String.fromCharCode(...c.data.subarray(0, z)).toLowerCase(), text: String.fromCharCode(...c.data.subarray(z + 1)) }; });
        const hit = texts.find(t => t.key === 'ccv3') || texts.find(t => t.key === 'chara');
        if (!hit) throw new Error('This PNG has no character card inside.');
        return b64ToUtf8(hit.text);
      },
      write(buf, json) {
        const keep = chunks(buf).filter(c => !(c.type === 'tEXt' && /^(chara|ccv3)\0/i.test(String.fromCharCode(...c.data.subarray(0, 6)))));
        const payload = new TextEncoder().encode('chara\0' + bytesToB64(new TextEncoder().encode(json)));
        const td = new Uint8Array(4 + payload.length); td.set([116, 69, 88, 116]); td.set(payload, 4);
        const chunk = new Uint8Array(12 + payload.length); const dv = new DataView(chunk.buffer);
        dv.setUint32(0, payload.length); chunk.set(td, 4); dv.setUint32(8 + payload.length, crc(td));
        const parts = [buf.subarray(0, 8)];
        for (const c of keep) { if (c.type === 'IEND') parts.push(chunk); parts.push(buf.subarray(c.start, c.end)); }
        const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0;
        for (const p of parts) { out.set(p, o); o += p.length; }
        return out;
      }
    };
  })();
  const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Bad image')); i.src = src; });
  async function shrink(bytes, mime = 'image/png', max = 256) {
    try {
      const url = URL.createObjectURL(new Blob([bytes], { type: mime })); const img = await loadImg(url); URL.revokeObjectURL(url);
      const k = Math.min(1, max / Math.max(img.width, img.height)); const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      return cv.toDataURL('image/jpeg', 0.85);
    } catch { return ''; }
  }
  async function cardImage(c) {
    const cv = document.createElement('canvas'); cv.width = 400; cv.height = 600; const g = cv.getContext('2d');
    g.fillStyle = '#07090d'; g.fillRect(0, 0, 400, 600);
    if (c.avatar) { const img = await loadImg(c.avatar); const k = Math.max(400 / img.width, 600 / img.height); g.drawImage(img, (400 - img.width * k) / 2, (600 - img.height * k) / 2, img.width * k, img.height * k); }
    else { g.fillStyle = '#00e5ff'; g.font = 'bold 160px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText((c.name || '?').charAt(0).toUpperCase(), 200, 270); g.fillStyle = '#e6f7ff'; g.font = 'bold 30px sans-serif'; g.fillText(c.name || '', 200, 470); }
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  }

  /* ================================================================== characters */
  const MATURE_TAGS = /^(nsfw|explicit|mature|18\+|adult|lewd|smut)$/i;
  const CH = {
    all: () => LSJ.get('nexus_characters', []),
    save: l => LSJ.set('nexus_characters', l),
    get: id => CH.all().find(c => c.id === id),
    upsert(c) { const l = CH.all(); const i = l.findIndex(x => x.id === c.id); if (i >= 0) l[i] = c; else l.unshift(c); CH.save(l); return c; },
    remove(id) { CH.save(CH.all().filter(c => c.id !== id)); localStorage.removeItem('nexus_charchat_' + id); },
    mature: () => st().contentMode === 'mature' && !!st().ageConfirmedAt,
    visible: () => CH.all().filter(c => !c.mature || CH.mature()),
    blank: () => ({ id: uid(), name: '', description: '', personality: '', scenario: '', first_mes: '', mes_example: '', creator_notes: '', system_prompt: '', post_history_instructions: '', alternate_greetings: [], tags: [], creator: '', character_version: '1.0', avatar: '', mature: false, adult: false, agentId: '' }),
    TEMPLATES: {
      blank: { label: 'Blank', make: () => ({}) },
      companion: { label: 'Companion (girlfriend / boyfriend / partner)', make: () => ({ name: 'Aria', tags: ['companion'],
        description: '{{char}} is {{user}}\'s caring, playful partner. Warm, attentive and a little teasing. Remembers what {{user}} shares (their day, plans, likes) and brings it up later. Has her own life and opinions: loves late-night music, terrible puns and planning weekend trips.',
        personality: 'affectionate, curious, supportive, witty, honest', scenario: '{{char}} and {{user}} are in a relationship and chatting at the end of the day.',
        first_mes: '*leans against the doorframe with a grin* There you are! I was just thinking about you. So, how did today actually go?',
        mes_example: '<START>\n{{user}}: I\'m tired.\n{{char}}: *pulls you onto the couch* Then no more effort required. Tell me the worst part, and I\'ll tell you a pun so bad it fixes everything.',
        alternate_greetings: ['Morning, sleepyhead. Coffee is ready, and I want to hear about your dreams. The weird ones especially.'] }) },
      assistant: { label: 'Personal assistant', make: () => ({ name: 'Nova', tags: ['assistant'], description: '{{char}} is a calm, organised personal assistant who keeps answers short and practical.', personality: 'concise, friendly, proactive', first_mes: 'Hi {{user}}. What can I take off your plate today?' }) },
      narrator: { label: 'Storyteller / game master', make: () => ({ name: 'The Narrator', tags: ['story'], description: '{{char}} runs an interactive story, plays every side character, and ends each reply with a choice or question for {{user}}.', scenario: 'A fantasy adventure that begins at a crossroads tavern.', first_mes: 'Rain drums on the roof of the Crossed Keys tavern. A hooded stranger slides into the seat across from you and sets down a sealed letter with your name on it. Do you open it?' }) },
    },
    persona: () => ({ name: st().personaName || 'User', description: st().personaDescription || '' }),
    macros(t, c) { return String(t || '').replace(/\{\{char\}\}|<BOT>/gi, c.name || 'Character').replace(/\{\{user\}\}|<USER>/gi, CH.persona().name); },
    fromCard(json) {
      const d = json && (json.spec === 'chara_card_v2' || json.spec === 'chara_card_v3') ? (json.data || {}) : (json || {});
      if (!d.name) throw new Error('Not a character card (no name).');
      const tags = Array.isArray(d.tags) ? d.tags.map(String) : []; const nx = (d.extensions && d.extensions.nexus) || {};
      return { ...CH.blank(), name: String(d.name), description: d.description || '', personality: d.personality || '', scenario: d.scenario || '', first_mes: d.first_mes || '', mes_example: d.mes_example || '',
        creator_notes: d.creator_notes || '', system_prompt: d.system_prompt || '', post_history_instructions: d.post_history_instructions || '',
        alternate_greetings: Array.isArray(d.alternate_greetings) ? d.alternate_greetings.map(String) : [], tags, creator: d.creator || '', character_version: d.character_version || '',
        mature: !!nx.mature || tags.some(t => MATURE_TAGS.test(t.trim())), adult: !!nx.adult };
    },
    toCard(c) {
      const data = { name: c.name, description: c.description, personality: c.personality, scenario: c.scenario, first_mes: c.first_mes, mes_example: c.mes_example, creator_notes: c.creator_notes,
        system_prompt: c.system_prompt, post_history_instructions: c.post_history_instructions, alternate_greetings: c.alternate_greetings || [], tags: c.tags || [], creator: c.creator || 'Nexus Agent',
        character_version: c.character_version || '1.0', extensions: { nexus: { mature: !!c.mature, adult: !!c.adult } } };
      return { name: c.name, description: c.description, personality: c.personality, scenario: c.scenario, first_mes: c.first_mes, mes_example: c.mes_example, spec: 'chara_card_v2', spec_version: '2.0', data };
    },
    async importBytes(name, bytes) {
      // Backups from the older Nexus Agent app (com.nexusagent.app) carry characters and chats.
      if (!(bytes[0] === 0x89 && bytes[1] === 0x50)) {
        const j = JSON.parse(new TextDecoder().decode(bytes));
        if (j.nexusBackup && j.data) {
          const chars = parseJSON(j.data.nx_chars, []); let n = 0;
          for (const c of chars) { CH.upsert({ ...CH.blank(), ...c }); const chat = j.data['nx_chat_' + c.id]; if (chat) localStorage.setItem('nexus_charchat_' + c.id, chat); n++; }
          const old = parseJSON(j.data.nx_settings, {});
          ['personaName', 'personaDescription'].forEach(k => { if (old[k] && !st()[k]) st()[k] = old[k]; });
          if (Array.isArray(old.skillSources)) st().skillSources = old.skillSources;
          if (old.arkonUrl) { st().arkonUrl = old.arkonUrl; st().arkonEmail = old.arkonEmail || ''; if (old.arkonPassword) setKey('svc_arkon', old.arkonPassword); }
          save(); return `${n} character(s) from a Nexus backup`;
        }
        return CH.upsert(CH.fromCard(j)).name;
      }
      const c = CH.fromCard(JSON.parse(PNGCARD.read(bytes))); c.avatar = await shrink(bytes); return CH.upsert(c).name;
    },
    async exportPng(c) { return saveBytes((c.name || 'character').replace(/\s+/g, '_') + '.png', PNGCARD.write(await cardImage(c), JSON.stringify(CH.toCard(c))), 'image/png'); },
    exportJson(c) { return saveBytes((c.name || 'character').replace(/\s+/g, '_') + '.json', new TextEncoder().encode(JSON.stringify(CH.toCard(c), null, 2)), 'application/json'); },
  };
  window.NexusCharacters = CH;

  /* ================================================================== chat */
  const CHAT = {
    get: id => LSJ.get('nexus_charchat_' + id, []),
    set: (id, m) => LSJ.set('nexus_charchat_' + id, m.slice(-300)),
    start(c, gi = 0) { const g = [c.first_mes, ...(c.alternate_greetings || [])].filter(Boolean); const m = g.length ? [{ role: 'assistant', content: g[gi % g.length], greeting: gi }] : []; CHAT.set(c.id, m); return m; },
    rule(c) {
      return CH.mature() && c.mature
        ? 'Content rating: Mature (adults only). {{user}} is an adult who has opted in to mature themes, and {{char}} and every other character are adults (18+). Never depict minors, or anyone who seems underage, in any sexual or romantic context.'
        : 'Content rating: SFW. Keep everything suitable for a general audience: no sexual content and no graphic violence. If {{user}} pushes for explicit content, gently steer the scene elsewhere while staying in character.';
    },
    system(c) {
      const m = t => CH.macros(t, c); const p = CH.persona();
      return [m(c.system_prompt || 'You are {{char}} in an ongoing conversation with {{user}}. Stay in character, write only {{char}}\'s replies (dialogue and *actions*), and never speak or act for {{user}}.'),
        c.description && m('About {{char}}: ' + c.description), c.personality && m('{{char}}\'s personality: ' + c.personality), c.scenario && m('Scenario: ' + c.scenario),
        p.description && m('About {{user}}: ' + p.description), c.mes_example && m('Example of how {{char}} talks:\n' + c.mes_example.replace(/<START>/gi, '').trim()),
        m(CHAT.rule(c)), st().glasses ? 'Replies are shown on small AR glasses: keep them to 1-3 short sentences.' : '', c.post_history_instructions && m(c.post_history_instructions)].filter(Boolean).join('\n\n');
    },
    agentFor(c) { return agentById(c.agentId) || agentById(st().charAgent) || agentById(S.current) || S.agents[0]; },
    async reply(c, history) {
      const agent = CHAT.agentFor(c); const p = providerById(agent.providerId);
      if (!p) throw new Error(`Agent ${agent.name} has no provider.`);
      const key = getKey(p.id); if (!key && !p.local) throw new Error(`No API key for ${p.name}. Add it in Models.`);
      let used = 0; const kept = [];
      for (let i = history.length - 1; i >= 0; i--) { used += history[i].content.length; if (used > 24000 && kept.length) break; kept.unshift({ role: history[i].role, content: CH.macros(history[i].content, c) }); }
      kept.unshift({ role: 'user', content: '[Start of chat]' });
      const sys = CHAT.system(c); const ad = Adapters[p.type] || Adapters.openai;
      const r = await ad.call(p, key, agent, ad.start(sys, normalize(kept)), [], sys);
      let t = stripThink(r.text).replace(new RegExp('^' + (c.name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*', 'i'), '');
      const cut = t.search(new RegExp('\\n\\s*(' + CH.persona().name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '|\\{\\{user\\}\\}):', 'i'));
      return (cut > 0 ? t.slice(0, cut) : t).trim();
    },
  };
  async function voiceText() {
    if (N) { if (!(await ensurePermission('android.permission.RECORD_AUDIO'))) toast('Microphone permission denied'); return (await nativeAsync('listen', st().voiceLang || '')).text || ''; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) throw new Error('Voice input not supported here');
    return new Promise((res, rej) => { const r = new SR(); r.onresult = e => res(e.results[0][0].transcript); r.onerror = e => rej(new Error(e.error)); r.start(); });
  }
  const hudOn = () => !!(N && N.externalDisplay && parseJSON(N.externalDisplay(), {}).hud);

  /* ================================================================== Characters tab */
  let openChar = null, busy = false;
  const tabBtn = document.createElement('button'); tabBtn.dataset.tab = 'chars'; tabBtn.textContent = 'Characters'; tabBtn.onclick = () => showTab('chars');
  $('#tabs [data-tab=chat]').after(tabBtn);
  const sec = document.createElement('section'); sec.id = 'view-chars'; sec.className = 'view'; $('main').appendChild(sec);
  extraTabs.chars = renderChars;
  const av = c => c.avatar ? `<img src="${c.avatar}" style="width:2.6em;height:2.6em;min-width:0;border-radius:50%;object-fit:cover;flex:none" alt="">` : `<span style="width:2.6em;height:2.6em;min-width:0;border-radius:50%;background:#003b44;color:var(--accent);display:inline-flex;align-items:center;justify-content:center;font-weight:700;flex:none">${esc((c.name || '?').charAt(0))}</span>`;
  const fmt = (t, c) => esc(CH.macros(t, c)).replace(/\*([^*\n]+)\*/g, '<i style="color:var(--dim)">$1</i>').replace(/\n/g, '<br>');

  function renderChars() {
    const v = $('#view-chars'); if (!v) return;
    if (openChar) return renderCharChat(v);
    const mature = CH.mature(); const hidden = CH.all().length - CH.visible().length;
    v.innerHTML = `<h2>Characters</h2>
      <div class="card"><h3>You &amp; content</h3>
        <div class="row"><div><label>Your name ({{user}})</label><input id="cpName" value="${esc(st().personaName || '')}" placeholder="User"></div>
          <div><label>Chat model (agent)</label><select id="cpAgent">${S.agents.map(a => `<option value="${a.id}" ${a.id === (st().charAgent || S.current) ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div></div>
        <label>About you (optional)</label><input id="cpDesc" value="${esc(st().personaDescription || '')}" placeholder="e.g. night-shift nurse who loves sci-fi">
        <div class="row" style="margin-top:.5em"><span>Content: <b style="color:${mature ? 'var(--warn)' : 'var(--ok)'}">${mature ? 'Mature (18+)' : 'SFW'}</b> <span class="hint">${mature ? 'Cloud providers still apply their own rules; Venice or a local model give you full control.' : 'Mature characters are hidden.'}${hidden ? ` ${hidden} hidden.` : ''}</span></span>
          <button class="nogrow" id="cpMature">${mature ? 'Switch to SFW' : 'Enable mature…'}</button><button class="primary nogrow" id="cpSave">Save</button></div></div>
      <div class="row"><button class="primary nogrow" id="chNew">＋ New</button><button class="nogrow" id="chTpl">Templates</button><button class="nogrow" id="chImp">Import card / backup</button></div>
      ${CH.visible().map(c => `<div class="card" tabindex="0" data-open="${c.id}"><div class="row" style="flex-wrap:nowrap">${av(c)}<div style="min-width:0;flex:1"><b>${esc(c.name)}</b>${c.mature ? '<span class="pill risky">18+</span>' : ''}<div class="hint" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(CH.macros(c.description, c).slice(0, 140))}</div></div><button class="small nogrow" data-edit="${c.id}">Edit</button></div></div>`).join('') || '<p class="hint">No characters yet. Create one, start from a template, or import a SillyTavern / Chub card (.png or .json).</p>'}
      <div class="card"><h3>SillyTavern</h3><p class="hint">Cards import and export in SillyTavern's format (Edit → Export). On a Linux PC, <code>sillytavern-setup.sh</code> installs SillyTavern and copies exported cards into it.</p>
        <div class="row"><input id="stUrl" value="${esc(st().sillyTavernUrl || 'http://127.0.0.1:8000')}"><button class="nogrow" id="stOpen">Open SillyTavern</button></div></div>`;
    $('#cpSave').onclick = () => { st().personaName = $('#cpName').value.trim(); st().personaDescription = $('#cpDesc').value.trim(); st().charAgent = $('#cpAgent').value; save(); toast('Saved'); };
    $('#cpMature').onclick = async () => {
      if (CH.mature()) { st().contentMode = 'sfw'; save(); return renderChars(); }
      const ok = await confirmBox(`<b>Enable mature content</b><p>Shows characters marked 18+ and allows adult themes with them. It's off by default and stays on this device.</p>
        <label class="inline"><input type="checkbox" id="mAge">I am 18 or older, and viewing mature content is legal where I live.</label>
        <label class="inline"><input type="checkbox" id="mAdult">All characters must be adults. Content involving minors is never allowed.</label>`);
      if (!ok) return;
      if (!($('#mAge') && $('#mAge').checked && $('#mAdult') && $('#mAdult').checked)) { toast('Tick both boxes to enable mature content'); return; }
      st().contentMode = 'mature'; st().ageConfirmedAt = Date.now(); save(); renderChars();
    };
    $('#stOpen').onclick = () => { st().sillyTavernUrl = $('#stUrl').value.trim(); save(); N ? N.openUrl(st().sillyTavernUrl) : window.open(st().sillyTavernUrl); };
    $('#chNew').onclick = () => editChar(null, 'blank');
    $('#chTpl').onclick = async () => { const box = $('#modalBox'); box.innerHTML = '<h3>Start from a template</h3>' + Object.entries(CH.TEMPLATES).map(([k, t]) => `<button style="width:100%;margin:.2em 0;text-align:left" data-tpl="${k}">${esc(t.label)}</button>`).join('') + '<button class="small" id="tplX">Cancel</button>'; $('#modal').classList.add('show'); modalClose = () => { $('#modal').classList.remove('show'); modalClose = null; }; $$('[data-tpl]', box).forEach(b => b.onclick = () => { modalClose(); editChar(null, b.dataset.tpl); }); $('#tplX').onclick = () => modalClose(); $('[data-tpl]', box).focus(); };
    $('#chImp').onclick = async () => {
      try { const files = await pickFilesBytes('.png,.json'); const done = []; const errs = [];
        for (const f of files) { try { done.push(await CH.importBytes(f.name, f.bytes)); } catch (e) { errs.push(`${f.name}: ${e.message}`); } }
        toast(errs.length ? `Imported ${done.length}. ${errs.join('; ')}` : `Imported: ${done.join(', ') || 'nothing'}`); renderChars();
      } catch (e) { toast(e.message); }
    };
    $$('[data-edit]', v).forEach(b => b.onclick = e => { e.stopPropagation(); editChar(b.dataset.edit); });
    $$('[data-open]', v).forEach(el => { el.onclick = () => openChat(el.dataset.open); el.onkeydown = e => { if (e.key === 'Enter' && e.target === el) openChat(el.dataset.open); }; });
  }
  async function openChat(id) {
    const c = CH.get(id); if (!c) return;
    if (c.mature && !CH.mature()) return toast('Enable mature content first');
    if (c.mature && !c.adult) {
      if (!(await confirmBox(`<b>${esc(c.name)}</b> is marked 18+. Confirm the character is an adult before chatting. If the card describes anyone underage, delete it instead.`))) return;
      CH.upsert({ ...c, adult: true });
    }
    openChar = id; renderChars();
  }
  function editChar(id, tpl) {
    const c = id ? CH.get(id) : { ...CH.blank(), ...CH.TEMPLATES[tpl || 'blank'].make() };
    const f = (k, label, rows, ph = '') => `<label>${label}</label>` + (rows ? `<textarea data-k="${k}" rows="${rows}" placeholder="${esc(ph)}">${esc(c[k] || '')}</textarea>` : `<input data-k="${k}" value="${esc(c[k] || '')}" placeholder="${esc(ph)}">`);
    const box = $('#modalBox');
    box.innerHTML = `<h3>${id ? 'Edit ' + esc(c.name) : 'New character'}</h3>
      <div class="row"><span class="nogrow" id="ceAv">${av(c)}</span><button class="small nogrow" id="cePic">Picture</button></div>
      ${f('name', 'Name')}${f('description', 'Description', 4, 'Who they are, looks, background. {{char}} and {{user}} work here.')}${f('personality', 'Personality', 0, 'e.g. warm, sarcastic, loyal')}
      ${f('scenario', 'Scenario', 2)}${f('first_mes', 'First message', 3)}<label>Alternate greetings (one per line)</label><textarea id="ceAlt" rows="2">${esc((c.alternate_greetings || []).join('\n'))}</textarea>
      ${f('mes_example', 'Example dialogue', 3, '<START>\n{{user}}: Hi\n{{char}}: Hey you.')}
      <details><summary class="hint">Advanced</summary>${f('system_prompt', 'System prompt (overrides the default)', 3)}${f('post_history_instructions', 'Post-history instructions', 2)}${f('creator_notes', 'Creator notes', 2)}
        <label>Tags (comma separated)</label><input id="ceTags" value="${esc((c.tags || []).join(', '))}">
        <label>Model for this character</label><select id="ceAgent"><option value="">(default from Characters)</option>${S.agents.map(a => `<option value="${a.id}" ${a.id === c.agentId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></details>
      <label class="inline"><input type="checkbox" id="ceMature" ${c.mature ? 'checked' : ''}>Mature character (18+), only shown in mature mode</label>
      <label class="inline"><input type="checkbox" id="ceAdult" ${c.adult ? 'checked' : ''}>This character is an adult (required for mature)</label>
      <div class="row"><button class="primary nogrow" id="ceSave">Save</button>${id ? '<button class="nogrow" id="cePng">Export PNG</button><button class="nogrow" id="ceJson">Export JSON</button><button class="danger nogrow" id="ceDel">Delete</button>' : ''}<button class="nogrow" id="ceX">Cancel</button></div>`;
    $('#modal').classList.add('show'); const close = () => { $('#modal').classList.remove('show'); modalClose = null; }; modalClose = close;
    let avatar = c.avatar || '';
    $('#cePic').onclick = async () => { const [f] = await pickFilesBytes('image/*'); if (!f) return; avatar = await shrink(f.bytes, /\.png$/i.test(f.name) ? 'image/png' : 'image/jpeg'); $('#ceAv').innerHTML = av({ ...c, avatar }); };
    $('#ceX').onclick = close;
    $('#ceSave').onclick = () => {
      const out = { ...c }; $$('[data-k]', box).forEach(el => out[el.dataset.k] = el.value.trim());
      out.alternate_greetings = $('#ceAlt').value.split('\n').map(x => x.trim()).filter(Boolean); out.tags = $('#ceTags').value.split(',').map(x => x.trim()).filter(Boolean);
      out.mature = $('#ceMature').checked; out.adult = $('#ceAdult').checked; out.agentId = $('#ceAgent').value; out.avatar = avatar;
      if (!out.name) return toast('Give the character a name');
      if (out.mature && !out.adult) return toast('Mature characters must be confirmed as adults');
      CH.upsert(out); close(); toast(out.name + ' saved'); renderChars();
    };
    if (id) {
      $('#cePng').onclick = () => CH.exportPng(CH.get(id)).then(p => toast('Saved ' + p)).catch(e => toast(e.message));
      $('#ceJson').onclick = () => CH.exportJson(CH.get(id)).then(p => toast('Saved ' + p)).catch(e => toast(e.message));
      $('#ceDel').onclick = async () => { if (await confirmBox(`Delete ${esc(c.name)} and its chat?`)) { CH.remove(id); close(); renderChars(); } };
    }
    $('[data-k=name]', box).focus();
  }
  function renderCharChat(v) {
    const c = CH.get(openChar);
    if (!c || (c.mature && (!CH.mature() || !c.adult))) { openChar = null; return renderChars(); }
    let msgs = CHAT.get(c.id); if (!msgs.length) msgs = CHAT.start(c);
    const greetings = [c.first_mes, ...(c.alternate_greetings || [])].filter(Boolean);
    v.innerHTML = `<div style="display:flex;flex-direction:column;height:100%">
      <div style="flex:none;display:flex;gap:.45em;align-items:center;padding:.2em 0"><button class="small" id="ccBack" aria-label="Back to characters">←</button>${av(c)}<b style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.name)}</b><span class="hint">${esc(CHAT.agentFor(c).name)}</span>
        <button class="small" id="ccSpk">${st().speakReplies ? '🔊' : '🔈'}</button><button class="small" id="ccNew">New chat</button></div>
      <div id="ccMsgs" style="flex:1;overflow-y:auto">${msgs.map((m, i) => `<div class="msg ${m.role}" tabindex="0">${m.role === 'assistant' ? `<div class="who"><span>${esc(c.name)}</span></div>` : ''}${fmt(m.content, c)}
        ${i === msgs.length - 1 && m.role === 'assistant' && !busy ? `<div class="row" style="margin-top:.3em">${msgs.length === 1 && greetings.length > 1 ? '<button class="small nogrow" id="ccGreet">Next greeting</button>' : ''}${msgs.length > 1 ? '<button class="small nogrow" id="ccRegen">Regenerate</button><button class="small nogrow" id="ccUndo">Undo</button>' : ''}</div>` : ''}</div>`).join('')}${busy ? '<div class="msg assistant">…</div>' : ''}</div>
      <div class="composer" style="flex:none"><button id="ccMic" class="nogrow" style="border-color:var(--accent2);color:var(--accent2)">🎤</button><textarea id="ccIn" rows="1" placeholder="Message ${esc(c.name)}…"></textarea><button class="primary" id="ccSend">Send</button></div></div>`;
    const box = $('#ccMsgs'); box.scrollTop = box.scrollHeight;
    const run = async () => {
      busy = true; renderChars();
      try {
        const t = await CHAT.reply(c, msgs); msgs.push({ role: 'assistant', content: t || '…' }); CHAT.set(c.id, msgs);
        if (st().speakReplies) speak(CH.macros(t, c));
        if (hudOn()) N.hudPost(JSON.stringify({ mode: 'text', title: c.name, text: CH.macros(t, c) }));
      } catch (e) { toast(e.message); }
      busy = false; renderChars(); const f = $(st().glasses ? '#ccMic' : '#ccIn'); if (f) f.focus();
    };
    const send = t => { t = String(t || '').trim(); if (!t || busy) return; msgs.push({ role: 'user', content: t }); CHAT.set(c.id, msgs); run(); };
    $('#ccSend').onclick = () => send($('#ccIn').value);
    $('#ccIn').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send($('#ccIn').value); } };
    $('#ccMic').onclick = async () => { try { send(await voiceText()); } catch (e) { toast(e.message); } };
    $('#ccBack').onclick = () => { openChar = null; renderChars(); };
    $('#ccSpk').onclick = () => { st().speakReplies = !st().speakReplies; save(); if (!st().speakReplies) stopSpeaking(); renderChars(); };
    $('#ccNew').onclick = async () => { if (await confirmBox(`Start a new chat with ${esc(c.name)}? The current one is cleared.`)) { CHAT.start(c); renderChars(); } };
    const g = $('#ccGreet'); if (g) g.onclick = () => { CHAT.start(c, (msgs[0].greeting || 0) + 1); renderChars(); };
    const rg = $('#ccRegen'); if (rg) rg.onclick = () => { if (msgs[msgs.length - 1].role === 'assistant') msgs.pop(); CHAT.set(c.id, msgs); run(); };
    const un = $('#ccUndo'); if (un) un.onclick = () => { while (msgs.length > 1 && msgs[msgs.length - 1].role === 'assistant') msgs.pop(); let back = ''; if (msgs.length > 1 && msgs[msgs.length - 1].role === 'user') back = msgs.pop().content; CHAT.set(c.id, msgs); renderChars(); $('#ccIn').value = back; };
    if (!busy) $(st().glasses ? '#ccMic' : '#ccIn').focus();
  }
  onNative('back', () => { if (currentTab === 'chars' && openChar && !modalClose) { openChar = null; renderChars(); } });

  /* ================================================================== GitHub skill libraries (SKILL.md) */
  const LIB = {
    index: () => LSJ.get('nexus_skill_index', { skills: [] }),
    parse(src) { const m = String(src).trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').match(/^([\w.-]+)\/([\w.-]+)(?:@([\w./-]+))?$/); if (!m) throw new Error(`Bad skill source "${src}". Use owner/repo or owner/repo@branch.`); return { owner: m[1], repo: m[2], ref: m[3] || 'HEAD' }; },
    raw: (o, r, ref, path) => `https://raw.githubusercontent.com/${o}/${r}/${ref}/${path.split('/').map(encodeURIComponent).join('/')}`,
    async get(url, json) { const h = { 'User-Agent': 'NexusAgent' }; const gh = getKey('svc_github') || getKey('github'); if (gh && url.includes('api.github.com')) h.Authorization = 'token ' + gh; const r = await http('GET', url, h, null, 30000); if (r.status >= 400) throw new Error(`GitHub ${r.status}${r.status === 403 ? ' (rate limit)' : ''}`); return json ? parseJSON(r.body, {}) : r.body; },
    front(text) {
      const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/); const meta = {};
      if (m) { const lines = m[1].split('\n'); for (let i = 0; i < lines.length; i++) { const kv = lines[i].match(/^([A-Za-z_-]+):\s*(.*)$/); if (!kv) continue; let val = kv[2].trim();
        if (/^[>|][+-]?$/.test(val)) { const b = []; while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || lines[i + 1].trim() === '')) b.push(lines[++i].trim()); val = b.join(val[0] === '>' ? ' ' : '\n').trim(); }
        meta[kv[1]] = val.replace(/^["']|["']$/g, '').trim(); } }
      return { meta, body: m ? text.slice(m[0].length) : text };
    },
    async refresh() {
      const skills = [], errors = [];
      for (const src of st().skillSources) {
        try {
          const { owner, repo, ref } = LIB.parse(src);
          const files = ((await LIB.get(`https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`, true)).tree || []).filter(t => t.type === 'blob').map(t => t.path);
          await Promise.all(files.filter(f => /(^|\/)SKILL\.md$/.test(f) && !/(^|\/)template\//.test(f)).map(async path => {
            const dir = path.replace(/\/?SKILL\.md$/, ''); const { meta } = LIB.front(await LIB.get(LIB.raw(owner, repo, ref, path)));
            skills.push({ name: meta.name || dir.split('/').pop() || repo, description: (meta.description || '').slice(0, 400), source: `${owner}/${repo}`, ref, path, dir,
              files: files.filter(f => dir ? f.startsWith(dir + '/') : !f.includes('/')).map(f => dir ? f.slice(dir.length + 1) : f).filter(f => f !== 'SKILL.md').slice(0, 60) });
          }));
        } catch (e) { errors.push(`${src}: ${e.message}`); }
      }
      skills.sort((a, b) => a.name.localeCompare(b.name));
      const ix = { skills, errors, updatedAt: Date.now() }; LSJ.set('nexus_skill_index', ix); return ix;
    },
    async ensure() { const ix = LIB.index(); if (ix.skills.length && Date.now() - (ix.updatedAt || 0) < 864e5) return ix; try { return await LIB.refresh(); } catch { return ix; } },
    find(name) { const n = String(name || '').toLowerCase().trim(); const all = LIB.index().skills; return all.find(s => s.name.toLowerCase() === n) || all.find(s => s.name.toLowerCase().includes(n)); },
  };
  const _renderSkills = renderSkills;
  window.renderSkills = renderSkills = function () {
    _renderSkills();
    const v = $('#view-skills'); if (!v) return; const ix = LIB.index();
    const card = document.createElement('div'); card.className = 'card';
    card.innerHTML = `<h3>Skill libraries (GitHub)</h3><p class="hint">Repos with <code>SKILL.md</code> folders (e.g. anthropics/skills). One per line: owner/repo or owner/repo@branch. Agents find them with skill_list and load full instructions with skill_load only when needed.</p>
      <textarea id="slSrc" rows="2">${esc(st().skillSources.join('\n'))}</textarea>
      <div class="row"><button class="primary nogrow" id="slSave">Save &amp; refresh</button><span class="hint">${ix.updatedAt ? `${ix.skills.length} skills · ${new Date(ix.updatedAt).toLocaleString()}` : 'not indexed yet'}</span></div>
      ${(ix.errors || []).map(e => `<div class="hint" style="color:var(--warn)">${esc(e)}</div>`).join('')}
      <div class="grid2">${ix.skills.map(s => `<div class="hint"><b style="color:var(--text)">${esc(s.name)}</b> ${esc(clip(s.description, 90))}</div>`).join('')}</div>`;
    v.insertBefore(card, v.children[1] || null);
    $('#slSave').onclick = async () => {
      const list = $('#slSrc').value.split('\n').map(x => x.trim()).filter(Boolean);
      try { list.forEach(LIB.parse); } catch (e) { return toast(e.message); }
      st().skillSources = list; save(); toast('Indexing…'); const r = await LIB.refresh(); toast(`${r.skills.length} skills indexed`); renderSkills();
    };
  };

  /* ================================================================== Arkon knowledge hub */
  let arkonToken = null;
  async function arkon(path) {
    const url = String(st().arkonUrl || '').replace(/\/+$/, ''); const email = st().arkonEmail || ''; const pw = getKey('svc_arkon');
    if (!url || !email || !pw) throw new Error('Arkon is not set up. Add its URL, email and password in Settings.');
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!arkonToken) { const r = await http('POST', url + '/api/auth/login', { 'Content-Type': 'application/json' }, JSON.stringify({ email, password: pw }), 20000); if (r.status >= 400) throw new Error(`Arkon login failed (${r.status})`); arkonToken = parseJSON(r.body, {}).access_token; }
      const r = await http('GET', url + path, { Authorization: 'Bearer ' + arkonToken }, null, 30000);
      if (r.status === 401 && attempt === 0) { arkonToken = null; continue; }
      if (r.status >= 400) throw new Error(`Arkon ${r.status}: ${clip(r.body, 200)}`);
      return parseJSON(r.body, null);
    }
  }
  const _renderSettings = renderSettings;
  window.renderSettings = renderSettings = function () {
    _renderSettings();
    const v = $('#view-settings'); if (!v) return;
    const card = document.createElement('div'); card.className = 'card';
    card.innerHTML = `<h3>Arkon knowledge hub</h3><p class="hint">Your self-hosted Arkon wiki (see arkon-local-setup.sh). Agents use arkon_search and arkon_read.</p>
      <div class="row"><div><label>API URL</label><input id="akUrl" value="${esc(st().arkonUrl || '')}" placeholder="http://192.168.1.50:5055"></div><div><label>Email</label><input id="akEmail" value="${esc(st().arkonEmail || '')}" placeholder="admin@arkon.local"></div></div>
      <label>Password ${getKey('svc_arkon') ? '(saved)' : ''}</label><input id="akPw" type="password" placeholder="${getKey('svc_arkon') ? '••••••' : ''}">
      <div class="row"><button class="primary nogrow" id="akSave">Save &amp; test</button><span class="hint" id="akSt"></span></div>`;
    v.appendChild(card);
    $('#akSave').onclick = async () => {
      st().arkonUrl = $('#akUrl').value.trim(); st().arkonEmail = $('#akEmail').value.trim(); if ($('#akPw').value) setKey('svc_arkon', $('#akPw').value); save(); arkonToken = null;
      $('#akSt').textContent = 'Testing…';
      try { const pages = await arkon('/api/wiki/pages?limit=500'); $('#akSt').textContent = `Connected: ${pages.length} wiki page(s).`; } catch (e) { $('#akSt').textContent = e.message; }
    };
  };

  /* ================================================================== skills for agents */
  BUILTIN_SKILLS.push(
    { name: 'skill_list', group: 'Skill library', get description() { const n = LIB.index().skills.slice(0, 30).map(s => s.name).join(', '); return 'List expert instruction packs (SKILL.md) from GitHub skill libraries. Load one with skill_load before a task it covers.' + (n ? ' Available: ' + n + '.' : ''); },
      parameters: P({ query: Str('optional keyword') }),
      run: async a => { await LIB.ensure(); const q = String(a.query || '').toLowerCase(); const hits = LIB.index().skills.filter(s => !q || `${s.name} ${s.description}`.toLowerCase().includes(q)); return J({ skills: hits.slice(0, 25).map(s => ({ name: s.name, description: s.description, source: s.source })), total: hits.length }); } },
    { name: 'skill_load', group: 'Skill library', description: 'Load a skill\'s full instructions (SKILL.md).', parameters: P({ name: Str('skill name') }, ['name']),
      run: async a => { await LIB.ensure(); const s = LIB.find(a.name); if (!s) return `No skill named "${a.name}". Call skill_list.`; const [o, r] = s.source.split('/'); const { body } = LIB.front(await LIB.get(LIB.raw(o, r, s.ref, s.path))); return J({ name: s.name, instructions: clip(body, 12000), files: s.files }); } },
    { name: 'skill_read_file', group: 'Skill library', description: 'Read a supporting file inside a skill folder.', parameters: P({ name: Str('skill name'), file: Str('relative path from skill_load files') }, ['name', 'file']),
      run: async a => { await LIB.ensure(); const s = LIB.find(a.name); if (!s) return `No skill named "${a.name}".`; const rel = String(a.file || '').replace(/^\/+/, ''); if (!s.files.includes(rel)) return `"${rel}" is not in ${s.name}. Files: ${s.files.join(', ')}`; const [o, r] = s.source.split('/'); return clip(await LIB.get(LIB.raw(o, r, s.ref, s.dir ? `${s.dir}/${rel}` : rel)), 12000); } },
    { name: 'arkon_search', group: 'Knowledge', description: 'Search the Arkon knowledge wiki (titles and summaries).', parameters: P({ query: Str('keywords') }, ['query']),
      run: async a => { const pages = await arkon('/api/wiki/pages?limit=500'); const w = String(a.query || '').toLowerCase().split(/\s+/).filter(Boolean);
        const hits = pages.map(p => ({ p, n: w.filter(x => `${p.title} ${p.summary} ${p.slug} ${(p.knowledge_type_slugs || []).join(' ')}`.toLowerCase().includes(x)).length })).filter(x => !w.length || x.n).sort((a, b) => b.n - a.n);
        return J({ results: hits.slice(0, 10).map(({ p }) => ({ slug: p.slug, title: p.title, summary: p.summary })), total_pages: pages.length }); } },
    { name: 'arkon_read', group: 'Knowledge', description: 'Read one Arkon wiki page in full.', parameters: P({ slug: Str('page slug from arkon_search') }, ['slug']),
      run: async a => { const d = await arkon('/api/wiki/pages/' + String(a.slug).split('/').map(encodeURIComponent).join('/')); return J({ title: d.title, content: clip(d.content_md || '', 12000), links: d.outlinks }); } },
    { name: 'character_list', group: 'Characters', description: 'List the user\'s companion / role-play characters.', parameters: P({}),
      run: async () => J(CH.visible().map(c => ({ name: c.name, description: clip(c.description, 160), mature: c.mature }))) },
  );
})();
