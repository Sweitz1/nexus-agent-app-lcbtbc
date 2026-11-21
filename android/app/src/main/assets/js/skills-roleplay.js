/* Vela — Roleplay: character chat in the style of TavernAI / SillyTavern, plus an
 * OpenAI-compatible API so the real SillyTavern can use Vela' providers.
 *
 *  - Character cards: import/export TavernAI / SillyTavern cards (PNG with embedded JSON, or JSON;
 *    V1, V2 "chara_card_v2" and V3 "chara_card_v3"), edit, tags, alternate greetings.
 *  - Lorebooks / World Info (embedded character books + global books), personas, author's note,
 *    example dialogue, macros ({{char}}, {{user}}, {{time}}, {{date}}, {{random:a,b}} …).
 *  - Chats: several per character, group chats, swipes, regenerate, continue, impersonate, edit,
 *    delete, branch; sampling settings; context budget.
 *  - Mature content (18+): OFF by default. Turning it on needs an adult confirmation and can be
 *    locked with a PIN. Fixed rules always apply: no sexual content involving minors or real people;
 *    cards that describe a minor cannot be used with mature content. Roleplay chats are kept
 *    separate from the agent chat, so they are never forwarded to the glasses, car, Telegram,
 *    webhooks or AutoGPT. Each provider's own usage policy still applies — Vela does not try to
 *    get around it.
 *  - /v1/models and /v1/chat/completions on the local server (token = API key) for SillyTavern.
 * Loaded after skills-connect.js. */
'use strict';
(() => {
  /* ================================================================ storage */
  const KEY = 'nexus_rp';
  const RP = Object.assign({
    chars: [], chats: [], books: [], personas: [{ id: 'me', name: 'You', description: '' }],
    settings: {
      providerId: '', model: '', persona: 'me', globalBooks: [],
      temperature: 0.9, top_p: 0.95, max_tokens: 400, frequency_penalty: 0, presence_penalty: 0, contextTokens: 8000,
      mainPrompt: "Write {{char}}'s next reply in a fictional roleplay chat between {{char}} and {{user}}. Stay in character, write vivid and natural prose, move the story forward, and never speak or act for {{user}}.",
      authorNote: '', authorDepth: 4, speakReplies: false, glassesMature: false,
      mature: false, adultConfirmedAt: 0, pinHash: '', lockMature: false,
    },
  }, parseJSON(localStorage.getItem(KEY), {}) || {});
  RP.settings = Object.assign({}, { persona: 'me', globalBooks: [], temperature: 0.9, top_p: 0.95, max_tokens: 400, contextTokens: 8000, authorDepth: 4 }, RP.settings);
  let saveT; const saveRp = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(RP)); } catch (e) { toast('Roleplay save failed: ' + e.message); } }, 200); };
  const charById = id => RP.chars.find(c => c.id === id);
  const chatById = id => RP.chats.find(c => c.id === id);
  const persona = () => RP.personas.find(p => p.id === RP.settings.persona) || RP.personas[0];
  let unlockedNow = false;   // PIN entered this app session
  let sfwSession = false;    // "continue without mature content" chosen on the lock screen
  const isUnlocked = () => !RP.settings.pinHash || !RP.settings.lockMature || unlockedNow;

  /* ================================================================ safety */
  // Fixed rules for mature mode. Not configurable.
  const HARD_RULES = 'Content rules that always apply: every character in sexual content is an adult (18+); never write sexual or romantic content involving minors, and never sexualize childlike characteristics. Never write sexual content about real, identifiable people. Respect boundaries the user states out of character.';
  const SFW_RULES = 'Keep content suitable for a general audience (PG-13): no explicit sexual content (fade to black instead) and no graphic gore.';
  const MINOR_RX = /\b(?:(?:[1-9]|1[0-7])\s*(?:-|\s)?(?:years?|yrs?|y\/o|yo)(?:\s*-?\s*old)?|age[ds]?\s*[:=]?\s*(?:[1-9]|1[0-7])\b|underage|under-age|loli|lolicon|shota|shotacon|preteen|pre-teen|prepubescent|elementary school(?:er)?|middle school(?:er)?|grade school(?:er)?|\bminor\b(?!\s+(?:injur|detail|issue|change|key|character|role|fix|edit|bug|chord)))/i;
  const ADULT_AGE_RX = /\b(1[0-7])\s*(?:-|\s)?(?:years?|yrs?)\s*-?\s*old\b/i;
  /** True when a card's text describes a minor (so it can't be used with mature content). */
  function cardDescribesMinor(c) {
    const t = [c.name, c.description, c.personality, c.scenario, c.first_mes, c.mes_example, c.system_prompt, (c.tags || []).join(' ')].join('\n');
    return MINOR_RX.test(t) || ADULT_AGE_RX.test(t);
  }
  const textDescribesMinor = t => MINOR_RX.test(String(t || ''));
  const matureActive = (chat, unlocked) => !!(RP.settings.mature && RP.settings.adultConfirmedAt && (unlocked ?? isUnlocked()) && chat && chat.mature && !chatMembers(chat).some(c => c.minorFlag));
  async function sha(s) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('nexus-rp:' + s)); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); }

  /* ================================================================ cards: parse / build */
  const str = v => (v == null ? '' : String(v));
  function normalizeCard(j) {
    const d = (j && (j.spec === 'chara_card_v2' || j.spec === 'chara_card_v3') && j.data) ? j.data : (j || {});
    const book = d.character_book && Array.isArray(d.character_book.entries) ? normBook(d.character_book, (d.name || 'Character') + ' lore') : null;
    return {
      name: str(d.name || d.char_name || 'Unnamed').slice(0, 120), description: str(d.description || d.char_persona), personality: str(d.personality),
      scenario: str(d.scenario || d.world_scenario), first_mes: str(d.first_mes || d.char_greeting), mes_example: str(d.mes_example || d.example_dialogue),
      alternate_greetings: (d.alternate_greetings || []).map(str).filter(Boolean).slice(0, 50), system_prompt: str(d.system_prompt), post_history_instructions: str(d.post_history_instructions),
      creator_notes: str(d.creator_notes), creator: str(d.creator), character_version: str(d.character_version), tags: (d.tags || []).map(str).filter(Boolean).slice(0, 40),
      nickname: str(d.nickname), extensions: d.extensions && typeof d.extensions === 'object' ? d.extensions : {}, book,
    };
  }
  function normBook(b, fallbackName) {
    return { id: uid(), name: str(b.name || fallbackName), scan_depth: Number(b.scan_depth) || 4, token_budget: Number(b.token_budget) || 1024, recursive_scanning: !!b.recursive_scanning,
      entries: (b.entries || []).slice(0, 500).map((e, i) => ({ id: uid(), keys: (e.keys || e.key || []).map(str).filter(Boolean), secondary_keys: (e.secondary_keys || e.keysecondary || []).map(str).filter(Boolean),
        content: str(e.content), enabled: e.enabled !== false && e.disable !== true, constant: !!e.constant, selective: !!e.selective, case_sensitive: !!e.case_sensitive,
        insertion_order: Number(e.insertion_order ?? e.order ?? 100), position: e.position === 'after_char' || e.position === 1 ? 'after_char' : 'before_char', comment: str(e.comment || e.name || `Entry ${i + 1}`) })) };
  }
  function cardJSON(c, v3) {
    const data = { name: c.name, description: c.description, personality: c.personality, scenario: c.scenario, first_mes: c.first_mes, mes_example: c.mes_example,
      creator_notes: c.creator_notes, system_prompt: c.system_prompt, post_history_instructions: c.post_history_instructions, alternate_greetings: c.alternate_greetings,
      tags: c.tags, creator: c.creator, character_version: c.character_version, extensions: c.extensions || {},
      character_book: c.book ? { name: c.book.name, scan_depth: c.book.scan_depth, token_budget: c.book.token_budget, recursive_scanning: c.book.recursive_scanning, extensions: {},
        entries: c.book.entries.map((e, i) => ({ id: i, keys: e.keys, secondary_keys: e.secondary_keys, content: e.content, enabled: e.enabled, constant: e.constant, selective: e.selective, case_sensitive: e.case_sensitive, insertion_order: e.insertion_order, position: e.position, comment: e.comment, extensions: {} })) } : undefined };
    if (v3) return { spec: 'chara_card_v3', spec_version: '3.0', data: { ...data, nickname: c.nickname || '', group_only_greetings: [], assets: [] } };
    return { spec: 'chara_card_v2', spec_version: '2.0', data, ...{ name: c.name, description: c.description, personality: c.personality, scenario: c.scenario, first_mes: c.first_mes, mes_example: c.mes_example } };
  }

  // --- PNG tEXt chunks (TavernAI cards store base64 JSON under "chara", V3 also under "ccv3")
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const isPng = b => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47;
  function pngChunks(b) {
    const out = []; const dv = new DataView(b.buffer, b.byteOffset, b.byteLength); let o = 8;
    while (o + 12 <= b.length) { const len = dv.getUint32(o); const type = String.fromCharCode(...b.subarray(o + 4, o + 8)); out.push({ type, data: b.subarray(o + 8, o + 8 + len), start: o, end: o + 12 + len }); o += 12 + len; if (type === 'IEND') break; }
    return out;
  }
  const latin1 = u => { let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192)); return s; };
  const b64utf8 = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s+/g, '')), c => c.charCodeAt(0)));
  const utf8b64 = s => bytesToB64(new TextEncoder().encode(s));
  function readCardPng(bytes) {
    let v2 = null, v3 = null;
    for (const ch of pngChunks(bytes)) {
      if (ch.type !== 'tEXt') continue;
      const z = ch.data.indexOf(0); if (z < 0) continue;
      const k = latin1(ch.data.subarray(0, z)).toLowerCase(), v = latin1(ch.data.subarray(z + 1));
      if (k === 'ccv3') v3 = v; else if (k === 'chara') v2 = v;
    }
    const raw = v3 || v2; if (!raw) throw new Error('This PNG has no character card data');
    return parseJSON(b64utf8(raw), null) || (() => { throw new Error('Card data in the PNG is not valid JSON'); })();
  }
  function textChunk(key, value) {
    const kv = new Uint8Array(key.length + 1 + value.length); for (let i = 0; i < key.length; i++) kv[i] = key.charCodeAt(i); kv[key.length] = 0; for (let i = 0; i < value.length; i++) kv[key.length + 1 + i] = value.charCodeAt(i);
    const out = new Uint8Array(12 + kv.length); const dv = new DataView(out.buffer);
    dv.setUint32(0, kv.length); out.set([0x74, 0x45, 0x58, 0x74], 4); out.set(kv, 8);
    dv.setUint32(8 + kv.length, crc32(out.subarray(4, 8 + kv.length))); return out;
  }
  function writeCardPng(pngBytes, card) {
    const chunks = pngChunks(pngBytes); const keep = []; let iend = null;
    for (const ch of chunks) {
      if (ch.type === 'IEND') { iend = ch; continue; }
      if (ch.type === 'tEXt') { const z = ch.data.indexOf(0); const k = latin1(ch.data.subarray(0, Math.max(0, z))).toLowerCase(); if (k === 'chara' || k === 'ccv3') continue; }
      keep.push(pngBytes.subarray(ch.start, ch.end));
    }
    const parts = [pngBytes.subarray(0, 8), ...keep, textChunk('chara', utf8b64(JSON.stringify(cardJSON(card, false)))), textChunk('ccv3', utf8b64(JSON.stringify(cardJSON(card, true)))), pngBytes.subarray(iend.start, iend.end)];
    const n = parts.reduce((a, p) => a + p.length, 0); const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
  }
  async function placeholderPng(name) {
    const c = document.createElement('canvas'); c.width = 400; c.height = 600; const g = c.getContext('2d');
    const h = [...name].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 360, 7);
    const gr = g.createLinearGradient(0, 0, 400, 600); gr.addColorStop(0, `hsl(${h},60%,30%)`); gr.addColorStop(1, `hsl(${(h + 60) % 360},60%,12%)`);
    g.fillStyle = gr; g.fillRect(0, 0, 400, 600); g.fillStyle = '#fff'; g.font = 'bold 160px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText((name[0] || '?').toUpperCase(), 200, 300);
    return new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer());
  }
  async function saveAvatar(id, bytes) {
    if (N) return fsx.writeBytes(`rp/avatars/${id}.png`, bytes);
    return 'data:image/png;base64,' + bytesToB64(bytes);          // browser preview
  }
  const avatarSrc = c => !c || !c.avatar ? '' : c.avatar.startsWith('data:') ? c.avatar : wsUrl(c.avatar);

  async function importCardBytes(bytes, fileName) {
    let json, png = null;
    if (isPng(bytes)) { json = readCardPng(bytes); png = bytes; }
    else { json = parseJSON(new TextDecoder().decode(bytes), null); if (!json) throw new Error((fileName || 'File') + ' is not a character card (PNG or JSON)'); }
    const c = { id: uid(), created: Date.now(), ...normalizeCard(json) };
    c.avatar = await saveAvatar(c.id, png || await placeholderPng(c.name));
    c.minorFlag = cardDescribesMinor(c);
    c.mature = !c.minorFlag && c.tags.some(t => /^(nsfw|adult|18\+|mature|explicit|smut|erotica?)$/i.test(t));
    if (c.book) { c.book.ownerChar = c.id; }
    RP.chars.unshift(c); saveRp(); return c;
  }
  async function exportCard(c, fmt) {
    if (fmt === 'json') {
      const text = JSON.stringify(cardJSON(c, true), null, 2);
      if (N) return fsx.writeBytes(`rp/export/${slugify(c.name)}.json`, new TextEncoder().encode(text));
      return download(new Blob([text], { type: 'application/json' }), slugify(c.name) + '.json');
    }
    let png; try { png = c.avatar ? (c.avatar.startsWith('data:') ? Uint8Array.from(atob(c.avatar.split(',')[1]), x => x.charCodeAt(0)) : await fsx.bytes(c.avatar)) : null; } catch { png = null; }
    if (!png || !isPng(png)) png = await placeholderPng(c.name);
    const out = writeCardPng(png, c);
    if (N) return fsx.writeBytes(`rp/export/${slugify(c.name)}.png`, out);
    return download(new Blob([out], { type: 'image/png' }), slugify(c.name) + '.png');
  }
  const slugify = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'character';
  function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); return name; }

  /* ================================================================ prompt building */
  function macros(t, ctx) {
    const now = new Date();
    return String(t || '')
      .replace(/\{\{char\}\}|<BOT>/gi, ctx.char).replace(/\{\{user\}\}|<USER>/gi, ctx.user)
      .replace(/\{\{time\}\}/gi, now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })).replace(/\{\{date\}\}/gi, now.toLocaleDateString())
      .replace(/\{\{weekday\}\}/gi, now.toLocaleDateString([], { weekday: 'long' }))
      .replace(/\{\{random:([^}]*)\}\}/gi, (_, l) => { const o = l.split(/,|::/).map(x => x.trim()).filter(Boolean); return o.length ? o[Math.floor(Math.random() * o.length)] : ''; })
      .replace(/\{\{roll:(\d+)?d(\d+)\}\}/gi, (_, n, d) => { let s = 0; for (let i = 0; i < Math.min(Number(n || 1), 100); i++) s += 1 + Math.floor(Math.random() * Number(d)); return String(s); })
      .replace(/\{\{idle_duration\}\}/gi, 'a while').replace(/\{\{\/\/[^}]*\}\}/g, '').replace(/\{\{original\}\}/gi, ctx.original || '');
  }
  const estTokens = s => Math.ceil(String(s || '').length / 3.6);
  function chatMembers(chat) { return (chat.members || []).map(charById).filter(Boolean); }
  /** World Info: entries whose keys appear in the recent messages (or constant ones). */
  function worldInfo(chat, speaker, recentText) {
    const books = [...chatMembers(chat).map(c => c.book).filter(Boolean), ...RP.books.filter(b => (RP.settings.globalBooks || []).includes(b.id) || (chat.books || []).includes(b.id))];
    const hits = [];
    for (const b of books) {
      const hay = recentText.slice(-4000 * Math.max(1, Math.min(10, b.scan_depth || 4)) / 4);
      for (const e of b.entries) {
        if (!e.enabled || !e.content) continue;
        const has = k => { if (!k) return false; if (/^\/.*\/[a-z]*$/.test(k)) { try { const m = k.match(/^\/(.*)\/([a-z]*)$/); return new RegExp(m[1], m[2]).test(hay); } catch { return false; } } return e.case_sensitive ? hay.includes(k) : hay.toLowerCase().includes(k.toLowerCase()); };
        const primary = e.constant || e.keys.some(has);
        const ok = primary && (!e.selective || !e.secondary_keys.length || e.secondary_keys.some(has));
        if (ok) hits.push({ ...e, budget: b.token_budget || 1024 });
      }
    }
    hits.sort((a, b) => a.insertion_order - b.insertion_order);
    let used = 0; const before = [], after = [];
    for (const h of hits) { const t = estTokens(h.content); if (used + t > (h.budget || 1024)) continue; used += t; (h.position === 'after_char' ? after : before).push(h.content); }
    return { before, after, count: before.length + after.length };
  }
  function exampleBlocks(mes, ctx) {
    return String(mes || '').split(/<START>/i).map(x => macros(x, ctx).trim()).filter(Boolean).slice(0, 8);
  }

  /** Builds the chat-completion messages for the next reply by `speaker` (a card). */
  function buildPrompt(chat, speaker, { impersonate = false, continueText = '', unlocked } = {}) {
    const me = persona(); const ctx = { char: speaker.name, user: me.name };
    const mature = matureActive(chat, unlocked);
    const members = chatMembers(chat);
    const hist = chat.messages.filter(m => !m.hidden);
    const recentText = hist.slice(-12).map(m => m.text()).join('\n');
    const wi = worldInfo(chat, speaker, recentText);
    let main = macros(RP.settings.mainPrompt, ctx);
    if (speaker.system_prompt) main = macros(speaker.system_prompt, { ...ctx, original: main });
    const sys = [main];
    if (members.length > 1) sys.push(`This is a group chat with ${members.map(c => c.name).join(', ')} and ${me.name}. Write only ${speaker.name}'s reply.`);
    if (wi.before.length) sys.push('[World info]\n' + wi.before.map(t => macros(t, ctx)).join('\n'));
    for (const c of members.length > 1 ? members : [speaker]) {
      const cx = { ...ctx, char: c.name };
      if (c.description) sys.push(`[${c.name}'s description]\n` + macros(c.description, cx));
      if (c.personality) sys.push(`[${c.name}'s personality]\n` + macros(c.personality, cx));
    }
    if (speaker.scenario || chat.scenario) sys.push('[Scenario]\n' + macros(chat.scenario || speaker.scenario, ctx));
    if (wi.after.length) sys.push(wi.after.map(t => macros(t, ctx)).join('\n'));
    if (me.description) sys.push(`[${me.name} (the user)]\n` + macros(me.description, ctx));
    const ex = exampleBlocks(speaker.mes_example, ctx); if (ex.length) sys.push('[Example dialogue — style reference only]\n' + ex.join('\n---\n'));
    sys.push(mature ? 'The user is a verified adult who enabled mature (18+) fiction for this chat; mature themes are allowed within the provider\'s policies. ' + HARD_RULES : SFW_RULES);
    const system = sys.join('\n\n');

    // history, newest last, within the context budget
    const budget = Math.max(1000, Number(RP.settings.contextTokens) || 8000) - estTokens(system) - (Number(RP.settings.max_tokens) || 400) - 200;
    const turns = []; let used = 0;
    for (let i = hist.length - 1; i >= 0; i--) {
      const m = hist[i]; const who = m.isUser ? me.name : (charById(m.charId) || {}).name || speaker.name;
      const content = members.length > 1 ? `${who}: ${m.text()}` : m.text();
      const t = estTokens(content); if (used + t > budget && turns.length) break; used += t;
      turns.unshift({ role: m.isUser ? 'user' : 'assistant', content });
    }
    // author's note at depth N from the end
    const note = macros(chat.authorNote || RP.settings.authorNote || '', ctx).trim();
    if (note) { const d = Math.min(turns.length, Math.max(0, Number(chat.authorDepth ?? RP.settings.authorDepth) || 4)); turns.splice(turns.length - d, 0, { role: 'system', content: `[Author's note: ${note}]` }); }
    const post = macros(speaker.post_history_instructions, { ...ctx, original: '' }).trim();
    if (impersonate) turns.push({ role: 'system', content: `Write ${me.name}'s next message in first person as ${me.name}, in the same style as their earlier messages. Only the message text.` });
    else if (continueText) turns.push({ role: 'assistant', content: continueText }, { role: 'system', content: `Continue ${speaker.name}'s last message exactly where it stopped, without repeating it.` });
    else if (post) turns.push({ role: 'system', content: post });
    if (!turns.some(t => t.role === 'user')) turns.unshift({ role: 'user', content: `(${me.name} enters the scene.)` });
    return { system, turns, wi: wi.count };
  }

  /* ================================================================ model call */
  function rpProvider() {
    const p = providerById(RP.settings.providerId) || S.providers.find(x => x.id === 'venice' && getKey(x.id)) || S.providers.find(x => x.local) || providerById((agentById(S.current) || S.agents[0]).providerId);
    const model = RP.settings.model || (p && p.models && p.models[0]) || (agentById(S.current) || {}).model;
    return { p, model };
  }
  /** One completion with raw messages (system + turns). Works with OpenAI-compatible and Anthropic providers. */
  async function complete({ system, turns }, opt = {}) {
    const { p, model } = opt.p ? opt : rpProvider(); if (!p) throw new Error('Choose a provider in Roleplay → Settings');
    const key = getKey(p.id); if (!key && !p.local) throw new Error(`Add an API key for ${p.name} (Providers tab)`);
    const st = RP.settings; const extra = parseJSON(p.extra, {}) || {};
    const temperature = Number(opt.temperature ?? st.temperature), max = Number(opt.max_tokens ?? st.max_tokens) || 400;
    if (p.type === 'anthropic') {
      // Anthropic: one system string; mid-chat system notes become bracketed user text; roles must alternate.
      const msgs = [];
      for (const t of turns) { const role = t.role === 'assistant' ? 'assistant' : 'user'; const content = t.role === 'system' ? `[${t.content}]` : t.content; const last = msgs[msgs.length - 1]; if (last && last.role === role) last.content += '\n\n' + content; else msgs.push({ role, content }); }
      while (msgs.length && msgs[0].role !== 'user') msgs.shift();
      if (opt.images && opt.images.length && msgs.length) { const l = msgs[msgs.length - 1]; l.content = [...opt.images.map(i => ({ type: 'image', source: { type: 'base64', media_type: i.mime, data: i.b64 } })), { type: 'text', text: l.content }]; }
      const body = { model, system, messages: msgs, max_tokens: max, temperature: Math.min(1, temperature), ...(opt.stop && opt.stop.length ? { stop_sequences: opt.stop.slice(0, 4) } : {}), ...extra };
      const d = await postJSON(base(p) + '/messages', authHeaders(p, key), body);
      return { text: (d.content || []).filter(b => b.type === 'text').map(b => b.text).join(''), usage: d.usage, model };
    }
    const oturns = turns.map(t => ({ ...t }));
    if (opt.images && opt.images.length && oturns.length) { const l = oturns[oturns.length - 1]; l.content = [{ type: 'text', text: l.content }, ...opt.images.map(i => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${i.b64}` } }))]; }
    const body = { model, messages: [{ role: 'system', content: system }, ...oturns], temperature, top_p: Number(opt.top_p ?? st.top_p), max_tokens: max, ...extra };
    const fp = Number(opt.frequency_penalty ?? st.frequency_penalty), pp = Number(opt.presence_penalty ?? st.presence_penalty);
    if (fp) body.frequency_penalty = fp; if (pp) body.presence_penalty = pp; if (opt.stop && opt.stop.length) body.stop = opt.stop.slice(0, 4);
    const d = await postJSON(base(p) + '/chat/completions', authHeaders(p, key), body);
    const m = (d.choices && d.choices[0] && d.choices[0].message) || {};
    return { text: typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map(c => c.text || '').join('') : '', usage: d.usage, model };
  }
  function clean(text, speaker, chat) {
    const me = persona().name;
    let t = stripThink(String(text || '')).replace(/\{\{user\}\}/gi, me).replace(/\{\{char\}\}/gi, speaker.name).trim(); const names = [speaker.name, ...chatMembers(chat).map(c => c.name)];
    for (const n of names) if (t.startsWith(n + ':')) t = t.slice(n.length + 1).trim();
    const cut = t.search(new RegExp(`\\n\\s*(?:${[me, ...names.filter(n => n !== speaker.name)].map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}):`));   // the model started writing someone else's turn
    if (cut > 0) t = t.slice(0, cut).trim();
    return t;
  }

  /* ================================================================ messages & chats */
  function msg(o) { const m = { id: uid(), ts: Date.now(), swipes: [o.text || ''], swipeId: 0, ...o }; delete m.text; return wrapMsg(m); }
  function wrapMsg(m) { Object.defineProperty(m, 'text', { value() { return this.swipes[this.swipeId] || ''; }, enumerable: false, configurable: true, writable: true }); return m; }
  function newChat(members, { mature } = {}) {
    const cs = members.map(charById).filter(Boolean); const lead = cs[0];
    const chat = { id: uid(), created: Date.now(), title: cs.map(c => c.name).join(', ') + ' · ' + new Date().toLocaleDateString(), members: cs.map(c => c.id), messages: [], books: [], authorNote: '',
      mature: !!(RP.settings.mature && RP.settings.adultConfirmedAt) && !!(mature ?? cs.some(c => c.mature)) && !cs.some(c => c.minorFlag) };
    const me = persona().name;
    for (const c of cs.slice(0, cs.length > 1 ? cs.length : 1)) {
      const greets = [c.first_mes, ...(c.alternate_greetings || [])].filter(Boolean).map(g => macros(g, { char: c.name, user: me }));
      if (greets.length) { const m = msg({ charId: c.id, isUser: false, text: greets[0] }); m.swipes = greets; chat.messages.push(m); }
      if (cs.length > 1) break;   // group: lead greets only
    }
    RP.chats.unshift(chat); saveRp(); return chat;
  }
  function revive() { for (const ch of RP.chats) for (const m of ch.messages) wrapMsg(m); }
  revive();
  function nextSpeaker(chat, lastUserText) {
    const mem = chatMembers(chat); if (mem.length <= 1) return mem[0];
    const lt = String(lastUserText || '').toLowerCase();
    const named = mem.find(c => lt.includes(c.name.toLowerCase()));
    if (named) return named;
    const lastChar = [...chat.messages].reverse().find(m => !m.isUser);
    const i = mem.findIndex(c => lastChar && c.id === lastChar.charId);
    return mem[(i + 1) % mem.length];
  }

  let generating = false;
  async function generate(chat, { speaker, swipeOf, continueOf, impersonate, unlocked, quiet } = {}) {
    if (generating) throw new Error('Still writing the previous reply'); generating = true; renderChat();
    try {
      if (chat.mature) {
        const lastUser = [...chat.messages].reverse().find(m => m.isUser);
        if (lastUser && textDescribesMinor(lastUser.text())) throw new Error('Mature chats cannot involve minors. Edit or delete that message.');
      }
      if (impersonate) {
        const sp = speaker || chatMembers(chat)[0];
        const r = await complete(buildPrompt(chat, sp, { impersonate: true, unlocked }));
        return { impersonated: clean(r.text, { name: persona().name }, { members: [] }) };
      }
      if (continueOf) {
        const sp = charById(continueOf.charId) || chatMembers(chat)[0];
        const r = await complete(buildPrompt({ ...chat, messages: chat.messages.filter(m => m !== continueOf) }, sp, { continueText: continueOf.text(), unlocked }));
        const add = clean(r.text, sp, chat); const cur = continueOf.text();
        continueOf.swipes[continueOf.swipeId] = cur + (/^[\s,.!?;:]/.test(add) ? '' : ' ') + add; saveRp(); return continueOf;
      }
      if (swipeOf) {
        const sp = charById(swipeOf.charId) || chatMembers(chat)[0];
        const r = await complete(buildPrompt({ ...chat, messages: chat.messages.slice(0, chat.messages.indexOf(swipeOf)) }, sp, { unlocked }));
        swipeOf.swipes.push(clean(r.text, sp, chat)); swipeOf.swipeId = swipeOf.swipes.length - 1; saveRp(); return swipeOf;
      }
      const lastUser = [...chat.messages].reverse().find(m => m.isUser);
      const sp = speaker || nextSpeaker(chat, lastUser && lastUser.text());
      const r = await complete(buildPrompt(chat, sp, { unlocked }));
      const m = msg({ charId: sp.id, isUser: false, text: clean(r.text, sp, chat), model: r.model });
      chat.messages.push(m); chat.updated = Date.now(); saveRp();
      if (RP.settings.speakReplies && !quiet) speakRp(chat, m.text());
      return m;
    } finally { generating = false; renderChat(); }
  }
  function speakRp(chat, text) {
    const t = plain(text).replace(/\*[^*]+\*/g, ' ').trim(); if (!t) return;
    // Mature chats stay on the private device voice (cloud voice services have their own content rules).
    if (chat.mature && N) N.speak(t.slice(0, 3900), Number(S.settings.ttsRate) || 1); else speak(t);
  }

  /* ================================================================ UI */
  const tabBtn = document.createElement('button'); tabBtn.dataset.tab = 'rp'; tabBtn.textContent = 'Roleplay'; tabBtn.onclick = () => showTab('rp');
  ($('#tabs [data-tab=media]') || $('#tabs [data-tab=files]')).after(tabBtn);
  const sec = document.createElement('section'); sec.id = 'view-rp'; sec.className = 'view'; $('main').appendChild(sec);
  const css = document.createElement('style'); css.textContent = `
    #view-rp .rp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(8.5em,1fr));gap:.6em}
    #view-rp .rp-card{position:relative;border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;background:var(--panel);cursor:pointer;text-align:left;padding:0}
    #view-rp .rp-card img{width:100%;aspect-ratio:2/3;object-fit:cover;display:block;background:var(--panel2)}
    #view-rp .rp-card .nm{padding:.35em .5em;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #view-rp .rp-card .tg{padding:0 .5em .45em;color:var(--dim);font-size:.75em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #view-rp .badge{position:absolute;top:.35em;right:.35em;background:#000c;border:1px solid var(--warn);color:var(--warn);border-radius:6px;font-size:.7em;padding:.05em .35em}
    #view-rp .badge.minor{border-color:var(--dim);color:var(--dim)}
    #view-rp .rp-bar{display:flex;gap:.4em;align-items:center;flex-wrap:wrap;margin-bottom:.5em}
    #view-rp .rp-bar .ttl{flex:1;font-weight:600;min-width:6em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #view-rp .rp-msgs{display:flex;flex-direction:column;gap:.5em;margin-bottom:.6em}
    #view-rp .rp-m{display:flex;gap:.55em;align-items:flex-start}
    #view-rp .rp-m img.av{width:2.6em;height:2.6em;border-radius:50%;object-fit:cover;flex:none;background:var(--panel2);border:1px solid var(--line)}
    #view-rp .rp-m .bd{flex:1;min-width:0;border:1px solid var(--line);border-radius:var(--radius);background:var(--panel);padding:.45em .65em}
    #view-rp .rp-m.me .bd{background:#03141c;border-color:#16384a}
    #view-rp .rp-m .who{font-size:.8em;color:var(--accent);display:flex;gap:.5em;align-items:center}
    #view-rp .rp-m .who .sw{margin-left:auto;color:var(--dim)}
    #view-rp .rp-m .tx{white-space:pre-wrap;word-wrap:break-word;line-height:1.45}
    #view-rp .rp-m .tx em{color:#9fb7c9}
    #view-rp .rp-m .tx .dq{color:#ffe7a8}
    #view-rp .rp-m .acts{display:flex;gap:.25em;flex-wrap:wrap;margin-top:.3em}
    #view-rp .rp-m .acts button{padding:.1em .5em;font-size:.8em}
    #view-rp .rp-in{display:flex;gap:.4em;align-items:flex-end;position:sticky;bottom:0;background:rgba(0,0,0,.72);backdrop-filter:blur(4px);padding:.4em 0}
    #view-rp .rp-in textarea{flex:1;min-height:2.6em;max-height:9em;resize:vertical}
    #view-rp .mature-on{color:var(--warn)}
    #view-rp details.rp-sec{border:1px solid var(--line);border-radius:var(--radius);padding:.4em .6em;margin:.4em 0;background:var(--panel)}
    #view-rp details.rp-sec summary{cursor:pointer;font-weight:600}
    #view-rp textarea.big{min-height:6em}`;
  document.head.appendChild(css);
  extraTabs.rp = () => renderRp();
  let view = { screen: 'list', chatId: null, charId: null, q: '', tag: '' };

  const fmt = t => esc(t).replace(/\*([^*\n]+)\*/g, '<em>*$1*</em>').replace(/&quot;[^&\n]{1,400}?&quot;|“[^”\n]{1,400}”/g, m0 => `<span class="dq">${m0}</span>`);
  function lockedView() {
    return `<div class="card"><h3>🔒 Roleplay is locked</h3><p class="hint">Mature content is PIN-protected on this device.</p><div class="row"><input id="rpPin" type="password" inputmode="numeric" placeholder="PIN"><button class="primary nogrow" id="rpUnlock">Unlock</button><button class="nogrow" id="rpSfw">Continue without mature content</button></div></div>`;
  }
  function renderRp() {
    const v = $('#view-rp'); if (view.screen !== 'chat') { v.style.background = ''; v.style.backgroundAttachment = ''; }
    if (!isUnlocked() && !sfwSession) { v.innerHTML = lockedView(); bindLock(v); return; }
    if (view.screen === 'chat' && chatById(view.chatId)) return renderChat();
    if (view.screen === 'edit') return renderEditor();
    if (view.screen === 'settings') return renderSettingsRp();
    if (view.screen === 'lore') return renderLore();
    renderList();
  }
  function bindLock(v) {
    $('#rpUnlock', v).onclick = async () => { if ((await sha($('#rpPin', v).value)) === RP.settings.pinHash) { unlockedNow = true; sfwSession = false; renderRp(); } else toast('Wrong PIN'); };
    const sfw = $('#rpSfw', v); if (sfw) sfw.onclick = () => { sfwSession = true; view.screen = 'list'; renderRp(); };
  }
  const visibleChars = () => RP.chars.filter(c => isUnlocked() || !c.mature);

  function renderList() {
    const v = $('#view-rp'); const st = RP.settings;
    const tags = [...new Set(visibleChars().flatMap(c => c.tags || []))].sort().slice(0, 40);
    const q = view.q.toLowerCase();
    const rate = view.rate || '';
    const list = visibleChars().filter(c => (!q || (c.name + ' ' + c.description + ' ' + (c.tags || []).join(' ')).toLowerCase().includes(q)) && (!view.tag || (c.tags || []).includes(view.tag)) && (!rate || (rate === 'mature' ? c.mature : !c.mature)));
    const recent = RP.chats.filter(ch => isUnlocked() || !ch.mature).slice(0, 6);
    v.innerHTML = `<div class="rp-bar"><span class="ttl">Roleplay ${st.mature && st.adultConfirmedAt ? '<span class="mature-on">· 18+ on</span>' : ''}</span>
        <button class="nogrow" id="rpNew">＋ New</button><button class="nogrow" id="rpImport">⤓ Import card</button><button class="nogrow" id="rpGroup">👥 Group</button><button class="nogrow" id="rpLore">📖 Lore</button><button class="nogrow" id="rpSet">⚙ Settings</button></div>
      <div class="row"><input id="rpQ" placeholder="Search characters" value="${esc(view.q)}"><select id="rpRate" class="nogrow"><option value="">SFW + 18+</option><option value="sfw" ${view.rate === 'sfw' ? 'selected' : ''}>SFW</option>${isUnlocked() && RP.settings.mature ? `<option value="mature" ${view.rate === 'mature' ? 'selected' : ''}>18+</option>` : ''}</select><select id="rpTag" class="nogrow"><option value="">All tags</option>${tags.map(t => `<option ${t === view.tag ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
      ${recent.length ? `<h3 style="margin:.6em 0 .3em">Recent chats</h3>${recent.map(ch => `<button class="nogrow" data-open="${ch.id}" style="margin:.15em">${ch.mature ? '🔞 ' : ''}${esc(clip(ch.title, 40))}</button>`).join('')}` : ''}
      <h3 style="margin:.6em 0 .3em">Characters (${list.length})</h3>
      ${list.length ? `<div class="rp-grid">${list.map(c => `<button class="rp-card" data-char="${c.id}">${c.minorFlag ? '<span class="badge minor">SFW only</span>' : c.mature ? '<span class="badge">18+</span>' : ''}<img src="${esc(avatarSrc(c))}" alt="" loading="lazy"><div class="nm">${esc(c.name)}</div><div class="tg">${esc((c.tags || []).slice(0, 4).join(' · ') || clip(c.creator_notes || c.description, 40))}</div></button>`).join('')}</div>`
        : '<p class="hint">No characters yet. Import a SillyTavern / TavernAI card (PNG or JSON) or create one.</p>'}`;
    $('#rpQ', v).oninput = e => { view.q = e.target.value; const pos = e.target.selectionStart; renderList(); const i = $('#rpQ'); i.focus(); i.setSelectionRange(pos, pos); };
    $('#rpTag', v).onchange = e => { view.tag = e.target.value; renderList(); };
    $('#rpNew', v).onclick = () => createUI();
    $('#rpRate', v).onchange = e => { view.rate = e.target.value; renderList(); };
    $('#rpImport', v).onclick = importUI;
    $('#rpGroup', v).onclick = groupUI;
    $('#rpLore', v).onclick = () => { view.screen = 'lore'; renderRp(); };
    $('#rpSet', v).onclick = () => { view.screen = 'settings'; renderRp(); };
    $$('[data-open]', v).forEach(b => b.onclick = () => openChat(b.dataset.open));
    $$('[data-char]', v).forEach(b => b.onclick = () => charMenu(charById(b.dataset.char)));
  }
  async function importUI() {
    try {
      let files = [];
      if (N) { const paths = await importFiles('*/*'); for (const p of paths) files.push({ name: p.split('/').pop(), bytes: await fsx.bytes(p) }); }
      else files = await new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.accept = '.png,.json,image/png,application/json'; i.onchange = async () => res(await Promise.all([...i.files].map(async f => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })))); i.click(); });
      let n = 0;
      for (const f of files) { try { const c = await importCardBytes(f.bytes, f.name); n++; if (c.minorFlag) toast(`${c.name}: describes a minor — kept SFW-only`); } catch (e) { toast(`${f.name}: ${e.message}`); } }
      if (n) toast(`Imported ${n} character${n > 1 ? 's' : ''}`); renderList();
    } catch (e) { toast(e.message); }
  }
  function charMenu(c) {
    const chats = RP.chats.filter(ch => ch.members.length === 1 && ch.members[0] === c.id);
    $('#modalBox').innerHTML = `<div style="display:flex;gap:.7em"><img src="${esc(avatarSrc(c))}" style="width:6em;height:9em;object-fit:cover;border-radius:8px" alt=""><div style="flex:1;min-width:0"><h3 style="margin:.1em 0">${esc(c.name)}</h3><p class="hint">${esc(clip(c.creator_notes || c.description, 260))}</p>${c.minorFlag ? `<p class="hint">SFW-only: ${esc(sfwReason(c))}.</p>` : ''}</div></div>
      <div class="row"><button class="primary" id="cmNew">💬 New chat</button><button id="cmEdit">✎ Edit card</button><button id="cmExp">⤒ Export PNG</button><button id="cmExpJ">⤒ JSON</button><button id="cmDel">🗑</button></div>
      ${chats.length ? '<h3>Chats</h3>' + chats.map(ch => `<button class="nogrow" data-oc="${ch.id}" style="margin:.15em">${ch.mature ? '🔞 ' : ''}${esc(clip(ch.title, 36))} · ${ch.messages.length}</button>`).join('') : ''}
      <div class="row"><button id="cmX">Close</button></div>`;
    $('#modal').classList.add('show'); modalClose = () => { $('#modal').classList.remove('show'); modalClose = null; };
    $('#cmX').onclick = () => modalClose();
    $('#cmNew').onclick = () => { modalClose(); const ch = newChat([c.id]); openChat(ch.id); };
    $('#cmEdit').onclick = () => { modalClose(); view = { ...view, screen: 'edit', charId: c.id }; renderRp(); };
    $('#cmExp').onclick = async () => { try { toast('Exported ' + await exportCard(c, 'png')); } catch (e) { toast(e.message); } };
    $('#cmExpJ').onclick = async () => { try { toast('Exported ' + await exportCard(c, 'json')); } catch (e) { toast(e.message); } };
    $('#cmDel').onclick = async () => { if (!(await confirmBox(`Delete <b>${esc(c.name)}</b> and its chats?`))) return; RP.chars = RP.chars.filter(x => x !== c); RP.chats = RP.chats.filter(ch => !ch.members.includes(c.id)); saveRp(); renderList(); };
    $$('[data-oc]').forEach(b => b.onclick = () => { modalClose(); openChat(b.dataset.oc); });
  }
  function groupUI() {
    const cs = visibleChars(); if (cs.length < 2) return toast('Add at least two characters first');
    $('#modalBox').innerHTML = `<h3>New group chat</h3>${cs.map(c => `<label class="inline"><input type="checkbox" data-g="${c.id}"> ${esc(c.name)}${c.mature ? ' (18+)' : ''}</label>`).join('')}<div class="row"><button class="primary" id="gGo">Start</button><button id="gX">Cancel</button></div>`;
    $('#modal').classList.add('show'); modalClose = () => { $('#modal').classList.remove('show'); modalClose = null; };
    $('#gX').onclick = () => modalClose();
    $('#gGo').onclick = () => { const ids = $$('[data-g]').filter(i => i.checked).map(i => i.dataset.g); if (ids.length < 2) return toast('Pick two or more'); modalClose(); openChat(newChat(ids).id); };
  }
  function openChat(id) { view = { ...view, screen: 'chat', chatId: id }; showTab('rp'); }

  function renderChat() {
    if (currentTab !== 'rp' || view.screen !== 'chat') return;
    const v = $('#view-rp'); const chat = chatById(view.chatId); if (!chat) { view.screen = 'list'; return renderList(); }
    if (chat.mature && !isUnlocked()) { v.innerHTML = lockedView(); bindLock(v); return; }
    const me = persona(); const mature = matureActive(chat);
    const last = chat.messages[chat.messages.length - 1];
    const bg = bgCss(chatBg(chat)); v.style.background = bg ? `linear-gradient(rgba(0,0,0,.62),rgba(0,0,0,.78)), ${bg}` : ''; v.style.backgroundAttachment = bg ? 'fixed' : '';
    v.innerHTML = `<div class="rp-bar"><button class="nogrow" id="rcBack">←</button><span class="ttl">${esc(chat.title)}</span>
        <span class="hint ${mature ? 'mature-on' : ''}">${mature ? '18+' : 'SFW'}</span>
        <button class="nogrow" id="rcMenu">☰</button></div>
      <div class="rp-msgs">${chat.messages.map((m, i) => {
        const c = m.isUser ? null : charById(m.charId); const name = m.isUser ? me.name : (c ? c.name : '?');
        const isLast = m === last; const sw = m.swipes.length > 1 || (isLast && !m.isUser);
        return `<div class="rp-m ${m.isUser ? 'me' : ''}" data-i="${i}">${m.isUser ? '' : `<img class="av" src="${esc(avatarSrc(c))}" alt="">`}<div class="bd">
          <div class="who"><b>${esc(name)}</b>${m.model ? `<span class="hint">${esc(m.model)}</span>` : ''}${sw ? `<span class="sw"><button class="nogrow" data-a="prev" ${m.swipeId ? '' : 'disabled'}>‹</button> ${m.swipeId + 1}/${m.swipes.length} <button class="nogrow" data-a="next">›</button></span>` : ''}</div>
          <div class="tx">${fmt(m.text())}</div>
          <div class="acts"><button data-a="edit">✎</button><button data-a="speak">🔊</button><button data-a="copy">⧉</button>${isLast && !m.isUser ? '<button data-a="regen">⟳</button><button data-a="cont">⤳ continue</button>' : ''}<button data-a="branch">⑂</button><button data-a="del">🗑</button></div>
        </div></div>`; }).join('')}
        ${generating ? '<div class="hint">✍ writing…</div>' : ''}</div>
      <div class="rp-in"><textarea id="rcIn" placeholder="Message as ${esc(me.name)} — *actions in asterisks*">${esc(view.draft || '')}</textarea>
        <div style="display:flex;flex-direction:column;gap:.25em"><button class="primary nogrow" id="rcSend" ${generating ? 'disabled' : ''}>Send</button><button class="nogrow" id="rcImp" title="Write my next message">🎭</button></div></div>`;
    const inp = $('#rcIn', v); inp.oninput = () => { view.draft = inp.value; };
    inp.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#rcSend').click(); } };
    $('#rcBack', v).onclick = () => { view.screen = 'list'; renderRp(); };
    $('#rcMenu', v).onclick = () => chatMenu(chat);
    $('#rcSend', v).onclick = async () => {
      const t = inp.value.trim(); view.draft = '';
      if (t) {
        if (chat.mature && textDescribesMinor(t)) { toast('Mature chats cannot involve minors.'); view.draft = t; return; }
        chat.messages.push(msg({ isUser: true, text: t })); saveRp();
      }
      try { await generate(chat); } catch (e) { toast(e.message); }
      $('#view-rp').scrollTop = 1e9; window.scrollTo(0, document.body.scrollHeight);
    };
    $('#rcImp', v).onclick = async () => { try { const r = await generate(chat, { impersonate: true }); if (r && r.impersonated) { view.draft = r.impersonated; renderChat(); } } catch (e) { toast(e.message); } };
    $$('.rp-m', v).forEach(el => {
      const m = chat.messages[Number(el.dataset.i)];
      $$('[data-a]', el).forEach(b => b.onclick = async () => {
        const a = b.dataset.a;
        try {
          if (a === 'prev') { m.swipeId = Math.max(0, m.swipeId - 1); saveRp(); renderChat(); }
          else if (a === 'next') { if (m.swipeId < m.swipes.length - 1) { m.swipeId++; saveRp(); renderChat(); } else if (m === last && !m.isUser) await generate(chat, { swipeOf: m }); }
          else if (a === 'regen') await generate(chat, { swipeOf: m });
          else if (a === 'cont') await generate(chat, { continueOf: m });
          else if (a === 'speak') speakRp(chat, m.text());
          else if (a === 'copy') { try { await navigator.clipboard.writeText(m.text()); toast('Copied'); } catch { toast('Copy not available'); } }
          else if (a === 'del') { chat.messages.splice(chat.messages.indexOf(m), 1); saveRp(); renderChat(); }
          else if (a === 'branch') { const idx = chat.messages.indexOf(m); const nc = { ...JSON.parse(JSON.stringify(chat)), id: uid(), created: Date.now(), title: chat.title + ' (branch)' }; nc.messages = nc.messages.slice(0, idx + 1).map(wrapMsg); RP.chats.unshift(nc); saveRp(); openChat(nc.id); }
          else if (a === 'edit') {
            const tx = $('.tx', el); tx.innerHTML = `<textarea class="big" style="width:100%">${esc(m.text())}</textarea><div class="row"><button class="primary nogrow">Save</button><button class="nogrow">Cancel</button></div>`;
            const [sv, cn] = $$('button', tx); sv.onclick = () => { m.swipes[m.swipeId] = $('textarea', tx).value; saveRp(); renderChat(); }; cn.onclick = () => renderChat();
          }
        } catch (e) { toast(e.message); }
      });
    });
  }
  function chatMenu(chat) {
    const st = RP.settings; const canMature = st.mature && st.adultConfirmedAt && !chatMembers(chat).some(c => c.minorFlag);
    $('#modalBox').innerHTML = `<h3>Chat options</h3>
      <label>Title</label><input id="cmT" value="${esc(chat.title)}">
      <label>Scenario override (optional)</label><textarea id="cmS" class="big">${esc(chat.scenario || '')}</textarea>
      <label>Author's note (inserted near the end of the context)</label><textarea id="cmN">${esc(chat.authorNote || '')}</textarea>
      <div class="row"><div><label>Note depth (messages from the end)</label><input id="cmD" type="number" min="0" max="20" value="${esc(String(chat.authorDepth ?? st.authorDepth))}"></div></div>
      <label class="inline"><input type="checkbox" id="cmM" ${chat.mature ? 'checked' : ''} ${canMature ? '' : 'disabled'}> Mature (18+) content in this chat ${canMature ? '' : '<span class="hint">— turn on mature content in Roleplay settings first' + (chatMembers(chat).some(c => c.minorFlag) ? ' (not possible: a character here is SFW-only)' : '') + '</span>'}</label>
      ${RP.books.length ? '<label>Lorebooks for this chat</label>' + RP.books.map(b => `<label class="inline"><input type="checkbox" data-bk="${b.id}" ${(chat.books || []).includes(b.id) ? 'checked' : ''}> ${esc(b.name)}</label>`).join('') : ''}
      <div class="row"><button class="primary" id="cmOk">Save</button><button id="cmBg">🖼 Background</button><button id="cmPrompt">Show prompt</button><button id="cmDelC">Delete chat</button><button id="cmX">Close</button></div><pre id="cmP" class="hint" style="white-space:pre-wrap;max-height:16em;overflow:auto;display:none"></pre>`;
    $('#modal').classList.add('show'); modalClose = () => { $('#modal').classList.remove('show'); modalClose = null; };
    $('#cmX').onclick = () => modalClose();
    $('#cmOk').onclick = () => { chat.title = $('#cmT').value || chat.title; chat.scenario = $('#cmS').value; chat.authorNote = $('#cmN').value; chat.authorDepth = Number($('#cmD').value) || 0; chat.mature = canMature && $('#cmM').checked; chat.books = $$('[data-bk]').filter(i => i.checked).map(i => i.dataset.bk); saveRp(); modalClose(); renderChat(); };
    $('#cmBg').onclick = () => { modalClose(); bgUI(chat, () => renderChat()); };
    $('#cmPrompt').onclick = () => { const sp = nextSpeaker(chat, ''); const p = buildPrompt(chat, sp); const el = $('#cmP'); el.style.display = ''; el.textContent = `SYSTEM:\n${p.system}\n\n` + p.turns.map(t => `${t.role.toUpperCase()}: ${t.content}`).join('\n\n') + `\n\n(~${estTokens(p.system + p.turns.map(t => t.content).join(''))} tokens, ${p.wi} lore entries)`; };
    $('#cmDelC').onclick = async () => { if (!(await confirmBox('Delete this chat?'))) return; RP.chats = RP.chats.filter(x => x !== chat); saveRp(); modalClose(); view.screen = 'list'; renderRp(); };
  }

  function renderEditor() {
    const v = $('#view-rp'); const c = charById(view.charId); if (!c) { view.screen = 'list'; return renderList(); }
    const F = (k, label, big) => `<label>${label}</label>${big ? `<textarea class="big" data-f="${k}">${esc(c[k] || '')}</textarea>` : `<input data-f="${k}" value="${esc(c[k] || '')}">`}`;
    v.innerHTML = `<div class="rp-bar"><button class="nogrow" id="ceBack">←</button><span class="ttl">Edit ${esc(c.name)}</span><button class="nogrow" id="ceAv">🖼 Avatar</button><button class="nogrow" id="ceBg">🏞 Background</button><button class="primary nogrow" id="ceChat">💬 Chat</button></div>
      <div style="display:flex;gap:.7em;align-items:flex-start"><img src="${esc(avatarSrc(c))}" style="width:6em;height:9em;object-fit:cover;border-radius:8px;background:var(--panel2)" alt=""><div style="flex:1">${F('name', 'Name')}${F('tags', 'Tags (comma separated)')}</div></div>
      ${F('description', 'Description (appearance, background — {{char}} / {{user}} macros work)', true)}${F('personality', 'Personality', true)}${F('scenario', 'Scenario', true)}
      ${F('first_mes', 'First message', true)}
      <label>Alternate greetings (separate with a line containing only ---)</label><textarea class="big" data-f="alternate_greetings">${esc((c.alternate_greetings || []).join('\n---\n'))}</textarea>
      ${F('mes_example', 'Example dialogue (blocks start with <START>)', true)}
      <details class="rp-sec"><summary>Advanced: prompt overrides & notes</summary>${F('system_prompt', 'System prompt override ({{original}} = the default main prompt)', true)}${F('post_history_instructions', 'Post-history instructions (sent after the chat history)', true)}${F('creator_notes', 'Creator notes (not sent to the model)', true)}${F('creator', 'Creator')}${F('character_version', 'Version')}</details>
      <details class="rp-sec"><summary>Character lorebook (${c.book ? c.book.entries.length : 0} entries)</summary><div id="ceBook"></div></details>
      <label class="inline"><input type="checkbox" id="ceMature" ${c.mature ? 'checked' : ''} ${c.minorFlag || !matureUnlocked() ? 'disabled' : ''}> Mark as 18+ character ${c.minorFlag ? `<span class="hint">— not possible: ${esc(sfwReason(c))}</span>` : matureUnlocked() ? '' : '<span class="hint">— turn on mature content in Roleplay settings first</span>'}</label>
      <div class="row"><button class="primary" id="ceSave">Save</button><button id="ceExp">Export PNG</button></div>`;
    const collect = () => {
      $$('[data-f]', v).forEach(el => { const k = el.dataset.f; let val = el.value; if (k === 'tags') val = val.split(',').map(x => x.trim()).filter(Boolean); else if (k === 'alternate_greetings') val = val.split(/\n-{3,}\n/).map(x => x.trim()).filter(Boolean); c[k] = val; });
      c.minorFlag = cardDescribesMinor(c) || !!c.sfwLock; if (c.minorFlag && !c.sfwLock) c.sfwReason = 'this card describes a minor';
      c.mature = !c.minorFlag && $('#ceMature', v).checked;
      if (c.minorFlag) RP.chats.filter(ch => ch.members.includes(c.id)).forEach(ch => { ch.mature = false; });
      saveRp();
    };
    $('#ceBack', v).onclick = () => { collect(); view.screen = 'list'; renderRp(); };
    $('#ceSave', v).onclick = () => { collect(); toast(c.minorFlag ? `Saved: SFW-only because ${sfwReason(c)}` : 'Saved'); renderEditor(); };
    $('#ceChat', v).onclick = () => { collect(); openChat(newChat([c.id]).id); };
    $('#ceBg', v).onclick = () => { collect(); bgUI(c, () => { toast(c.bg ? 'Default background set for this character' : 'Background removed'); }); };
    $('#ceExp', v).onclick = async () => { collect(); try { toast('Exported ' + await exportCard(c, 'png')); } catch (e) { toast(e.message); } };
    $('#ceAv', v).onclick = async () => {
      try {
        let bytes;
        if (N) { const [p] = await importFiles('image/*'); if (!p) return; bytes = await fsx.bytes(p); }
        else bytes = await new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = async () => res(new Uint8Array(await i.files[0].arrayBuffer())); i.click(); });
        if (!isPng(bytes)) { const im = await createImageBitmap(new Blob([bytes])); const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; cv.getContext('2d').drawImage(im, 0, 0); bytes = new Uint8Array(await (await new Promise(r => cv.toBlob(r, 'image/png'))).arrayBuffer()); }
        if (isPng(bytes)) { try { const card = readCardPng(bytes); if (card && await confirmBox('This image contains a character card. Load its fields into this character?')) Object.assign(c, normalizeCard(card)); } catch { /* plain image */ } }
        collect(); c.avatar = await saveAvatar(c.id + '_' + uid(), bytes); saveRp(); renderEditor();
      } catch (e) { toast(e.message); }
    };
    bookEditor($('#ceBook', v), () => c.book || (c.book = { id: uid(), name: c.name + ' lore', scan_depth: 4, token_budget: 1024, entries: [] }), saveRp);
  }
  function bookEditor(el, getBook, onSave) {
    const b = getBook();
    el.innerHTML = `${b.entries.map((e, i) => `<div class="card" style="padding:.4em .6em"><div class="row"><input data-e="${i}" data-k="comment" value="${esc(e.comment)}" placeholder="Name"><label class="inline nogrow"><input type="checkbox" data-e="${i}" data-k="enabled" ${e.enabled ? 'checked' : ''}> on</label><label class="inline nogrow"><input type="checkbox" data-e="${i}" data-k="constant" ${e.constant ? 'checked' : ''}> always</label><button class="nogrow" data-rm="${i}">🗑</button></div>
      <input data-e="${i}" data-k="keys" value="${esc(e.keys.join(', '))}" placeholder="Trigger keywords (comma separated; /regex/i allowed)">
      <textarea data-e="${i}" data-k="content" placeholder="Text inserted when a keyword appears in recent messages">${esc(e.content)}</textarea></div>`).join('')}
      <div class="row"><button class="nogrow" id="bkAdd">＋ Entry</button></div>`;
    const sync = () => { $$('[data-e]', el).forEach(x => { const e = b.entries[Number(x.dataset.e)]; const k = x.dataset.k; if (!e) return; e[k] = x.type === 'checkbox' ? x.checked : k === 'keys' ? x.value.split(',').map(s => s.trim()).filter(Boolean) : x.value; }); onSave(); };
    el.oninput = sync; el.onchange = sync;
    $('#bkAdd', el).onclick = () => { sync(); b.entries.push({ id: uid(), keys: [], secondary_keys: [], content: '', enabled: true, constant: false, selective: false, case_sensitive: false, insertion_order: 100, position: 'before_char', comment: 'New entry' }); onSave(); bookEditor(el, getBook, onSave); };
    $$('[data-rm]', el).forEach(x => x.onclick = () => { sync(); b.entries.splice(Number(x.dataset.rm), 1); onSave(); bookEditor(el, getBook, onSave); });
  }
  function renderLore() {
    const v = $('#view-rp');
    v.innerHTML = `<div class="rp-bar"><button class="nogrow" id="lbBack">←</button><span class="ttl">Lorebooks / World Info</span><button class="nogrow" id="lbNew">＋ New book</button><button class="nogrow" id="lbImp">⤓ Import JSON</button></div>
      <p class="hint">Entries are added to the prompt when their keywords appear in recent messages. Tick <b>global</b> to use a book in every chat, or pick books per chat (chat ☰).</p>
      ${RP.books.map(b => `<details class="rp-sec"><summary>${esc(b.name)} · ${b.entries.length} entries</summary><div class="row"><input data-bn="${b.id}" value="${esc(b.name)}"><label class="inline nogrow"><input type="checkbox" data-gl="${b.id}" ${(RP.settings.globalBooks || []).includes(b.id) ? 'checked' : ''}> global</label><button class="nogrow" data-bdel="${b.id}">🗑</button></div><div data-be="${b.id}"></div></details>`).join('') || '<p class="hint">No lorebooks yet. (Lorebooks inside character cards are edited on the card.)</p>'}`;
    $('#lbBack', v).onclick = () => { view.screen = 'list'; renderRp(); };
    $('#lbNew', v).onclick = () => { RP.books.push({ id: uid(), name: 'World', scan_depth: 4, token_budget: 1024, entries: [] }); saveRp(); renderLore(); };
    $('#lbImp', v).onclick = async () => {
      try {
        let txt;
        if (N) { const [p] = await importFiles('*/*'); if (!p) return; txt = new TextDecoder().decode(await fsx.bytes(p)); }
        else txt = await new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json'; i.onchange = async () => res(await i.files[0].text()); i.click(); });
        const j = parseJSON(txt, null); if (!j) throw new Error('Not JSON');
        const entries = Array.isArray(j.entries) ? j.entries : j.entries && typeof j.entries === 'object' ? Object.values(j.entries) : [];
        RP.books.push(normBook({ ...j, entries }, j.name || 'Imported lorebook')); saveRp(); renderLore();
      } catch (e) { toast(e.message); }
    };
    $$('[data-bn]', v).forEach(i => i.onchange = () => { RP.books.find(b => b.id === i.dataset.bn).name = i.value; saveRp(); });
    $$('[data-gl]', v).forEach(i => i.onchange = () => { const s = new Set(RP.settings.globalBooks || []); i.checked ? s.add(i.dataset.gl) : s.delete(i.dataset.gl); RP.settings.globalBooks = [...s]; saveRp(); });
    $$('[data-bdel]', v).forEach(bt => bt.onclick = async () => { if (await confirmBox('Delete this lorebook?')) { RP.books = RP.books.filter(b => b.id !== bt.dataset.bdel); saveRp(); renderLore(); } });
    $$('[data-be]', v).forEach(el => { const b = RP.books.find(x => x.id === el.dataset.be); bookEditor(el, () => b, saveRp); });
  }

  function renderSettingsRp() {
    const v = $('#view-rp'); const st = RP.settings; const { p } = rpProvider();
    const provs = S.providers.map(x => `<option value="${x.id}" ${x.id === (st.providerId || (p && p.id)) ? 'selected' : ''}>${esc(x.name)}${getKey(x.id) || x.local ? '' : ' (no key)'}</option>`).join('');
    const N2 = (k, label, step, min, max) => `<div><label>${label}</label><input data-s="${k}" type="number" step="${step}" min="${min}" max="${max}" value="${esc(String(st[k]))}"></div>`;
    v.innerHTML = `<div class="rp-bar"><button class="nogrow" id="rsBack">←</button><span class="ttl">Roleplay settings</span></div>
      <div class="card"><h3>Model</h3><div class="row"><div><label>Provider</label><select data-s="providerId"><option value="">Auto (Venice, else local, else current agent)</option>${provs}</select></div><div><label>Model</label><input data-s="model" list="rpModels" value="${esc(st.model)}" placeholder="${esc((p && p.models && p.models[0]) || '')}"><datalist id="rpModels">${(p && p.models || []).map(m => `<option value="${esc(m)}">`).join('')}</datalist></div></div>
        <div class="row">${N2('temperature', 'Temperature', 0.05, 0, 2)}${N2('top_p', 'Top P', 0.01, 0, 1)}${N2('max_tokens', 'Max reply tokens', 10, 16, 4000)}</div>
        <div class="row">${N2('frequency_penalty', 'Frequency penalty', 0.05, -2, 2)}${N2('presence_penalty', 'Presence penalty', 0.05, -2, 2)}${N2('contextTokens', 'Context budget (tokens)', 500, 1000, 200000)}</div>
        <label>Main prompt</label><textarea class="big" data-s="mainPrompt">${esc(st.mainPrompt)}</textarea>
        <div class="row"><div><label>Default author's note</label><input data-s="authorNote" value="${esc(st.authorNote)}"></div>${N2('authorDepth', 'Note depth', 1, 0, 20)}</div>
        <label class="inline"><input type="checkbox" data-s="speakReplies" ${st.speakReplies ? 'checked' : ''}> Read replies aloud (mature chats always use the private device voice)</label></div>
      <div class="card"><h3>Persona (you)</h3><div class="row"><div><label>Active persona</label><select id="rsPer">${RP.personas.map(x => `<option value="${x.id}" ${x.id === st.persona ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div><button class="nogrow" id="rsPerNew">＋</button></div>
        <label>Name</label><input id="rsPerName" value="${esc(persona().name)}"><label>Description</label><textarea id="rsPerDesc">${esc(persona().description)}</textarea></div>
      <div class="card"><h3>Mature content (18+)</h3>
        <p>${st.mature && st.adultConfirmedAt ? '<span class="mature-on">On</span> — chats you mark 18+ (and 18+ characters) may include mature themes.' : 'Off — all roleplay stays PG-13.'}</p>
        ${isUnlocked() ? `<div class="row">${st.mature && st.adultConfirmedAt ? '<button class="nogrow" id="rsMatOff">Turn off</button>' : '<button class="primary nogrow" id="rsMatOn">Turn on…</button>'}
          <button class="nogrow" id="rsPin">${st.pinHash ? 'Change / remove PIN' : 'Set a PIN'}</button></div>` : '<div class="row"><input id="rsPinU" type="password" inputmode="numeric" placeholder="PIN"><button class="nogrow" id="rsUnl">Unlock to change</button></div>'}
        <label class="inline"><input type="checkbox" data-s="lockMature" ${st.lockMature ? 'checked' : ''} ${st.pinHash && isUnlocked() ? '' : 'disabled'}> Ask for the PIN when opening Roleplay (18+ characters and chats are hidden until unlocked)</label>
        <p class="hint">Always applies, whatever the settings: no sexual content involving minors (cards that describe a minor are SFW-only) and none about real people. Roleplay chats are private to this tab: never sent to the glasses, car, Telegram, webhooks or AutoGPT. The provider's own policy still applies — for adult fiction pick a provider that allows it (e.g. Venice or a local model).</p></div>
      <div class="card"><h3>Vela Glasses</h3>
        <p class="hint">Roleplay is also available in the Vela Glasses app (☰ → Roleplay): pick a character, talk by voice, swipe or continue replies.</p>
        <label class="inline"><input type="checkbox" data-s="glassesMature" ${st.glassesMature ? 'checked' : ''} ${isUnlocked() ? '' : 'disabled'}> Show 18+ characters and chats on the glasses${st.pinHash && st.lockMature ? ' (after entering the PIN on the glasses)' : ''}</label></div>
      <div class="card"><h3>Use SillyTavern with Vela</h3>
        <p class="hint">Run SillyTavern on a PC (or in Termux on Android) and use Vela as its backend: models and keys stay on this phone.</p>
        <ol class="hint"><li>Turn on the local server (Settings → Webhooks &amp; server).</li><li>In SillyTavern: API → <b>Chat Completion</b> → source <b>Custom (OpenAI-compatible)</b>.</li><li>Endpoint <code>${esc(apiBase())}</code>, API key = the server token, then pick a model (<code>provider/model</code>).</li></ol>
        <div class="row"><button class="nogrow" id="rsCopy">Copy endpoint &amp; key</button></div></div>`;
    $$('[data-s]', v).forEach(el => el.onchange = () => { const k = el.dataset.s; st[k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value; saveRp(); if (k === 'providerId') renderSettingsRp(); });
    $('#rsBack', v).onclick = () => { view.screen = 'list'; renderRp(); };
    $('#rsPer', v).onchange = e => { st.persona = e.target.value; saveRp(); renderSettingsRp(); };
    $('#rsPerNew', v).onclick = () => { const pr = { id: uid(), name: 'New persona', description: '' }; RP.personas.push(pr); st.persona = pr.id; saveRp(); renderSettingsRp(); };
    $('#rsPerName', v).onchange = e => { persona().name = e.target.value || 'You'; saveRp(); };
    $('#rsPerDesc', v).onchange = e => { persona().description = e.target.value; saveRp(); };
    const on = $('#rsMatOn', v), off = $('#rsMatOff', v);
    if (on) on.onclick = () => enableMature();
    if (off) off.onclick = () => { st.mature = false; RP.chats.forEach(ch => { ch.mature = false; }); saveRp(); renderSettingsRp(); };
    const pb = $('#rsPin', v); if (pb) pb.onclick = () => pinUI();
    const ub = $('#rsUnl', v); if (ub) ub.onclick = async () => { if ((await sha($('#rsPinU', v).value)) === st.pinHash) { unlockedNow = true; sfwSession = false; renderSettingsRp(); } else toast('Wrong PIN'); };
    $('#rsCopy', v).onclick = async () => { try { await navigator.clipboard.writeText(`${apiBase()}\n${S.settings.server.token}`); toast('Copied endpoint and key'); } catch { toast(apiBase()); } };
  }
  function enableMature() {
    $('#modalBox').innerHTML = `<h3>Turn on mature content (18+)</h3>
      <p>Mature content is for adults only. It applies only to roleplay chats you mark 18+.</p>
      <ul class="hint"><li>Never: sexual content involving minors or childlike characters, or about real people. Cards that describe a minor stay SFW-only.</li><li>Your provider's usage policy still applies.</li><li>Mature chats stay private on this device and use the device voice.</li></ul>
      <label class="inline"><input type="checkbox" id="m18"> I confirm I am 18 or older (or the age of majority where I live) and want to allow mature fiction.</label>
      <div class="row"><button class="primary" id="mGo" disabled>Turn on</button><button id="mX">Cancel</button></div>`;
    $('#modal').classList.add('show'); modalClose = () => { $('#modal').classList.remove('show'); modalClose = null; };
    $('#m18').onchange = e => { $('#mGo').disabled = !e.target.checked; };
    $('#mX').onclick = () => modalClose();
    $('#mGo').onclick = () => { RP.settings.mature = true; RP.settings.adultConfirmedAt = Date.now(); saveRp(); modalClose(); renderSettingsRp(); toast('Mature content on. Mark a chat 18+ in its ☰ menu.'); };
  }
  function pinUI() {
    $('#modalBox').innerHTML = `<h3>Roleplay PIN</h3><p class="hint">Hides 18+ characters and chats until unlocked. Leave empty to remove the PIN.</p><input id="pn1" type="password" inputmode="numeric" placeholder="New PIN (4+ digits)"><input id="pn2" type="password" inputmode="numeric" placeholder="Repeat"><div class="row"><button class="primary" id="pnGo">Save</button><button id="pnX">Cancel</button></div>`;
    $('#modal').classList.add('show'); modalClose = () => { $('#modal').classList.remove('show'); modalClose = null; };
    $('#pnX').onclick = () => modalClose();
    $('#pnGo').onclick = async () => {
      const a = $('#pn1').value, b = $('#pn2').value;
      if (a !== b) return toast('PINs do not match');
      if (a && a.length < 4) return toast('Use at least 4 digits');
      RP.settings.pinHash = a ? await sha(a) : ''; if (!a) RP.settings.lockMature = false; unlockedNow = true; saveRp(); modalClose(); renderSettingsRp();
    };
  }
  function apiBase() { const ip = N ? (parseJSON(N.deviceInfo(), {}).ip || '<phone-ip>') : location.hostname; return `http://${ip}:${Number(S.settings.server.port) || 8787}/v1`; }

  /* ================================================================ character gallery, creation from images / text, backgrounds */
  // Original starter characters. 18+ ones are adults (ages stated) and their cards stay tasteful;
  // they are only offered when mature content is on and unlocked.
  const STARTERS = [
    { key: 'mara', glyph: '🚀', hue: 210, name: 'Captain Mara Voss', tags: ['sci-fi', 'adventure'], description: '{{char}} is the 38-year-old captain of the Kestrel, a battered freighter that runs cargo (and the occasional favor) along the Outer Rim. Sharp-tongued, fiercely loyal to her crew, allergic to authority. Short silver-streaked hair, a scar across her left brow, a long coat with too many pockets.', personality: 'wry, decisive, protective, secretly sentimental', scenario: '{{user}} has just signed on as the newest crew member of the Kestrel, minutes before a customs patrol hails the ship.', first_mes: '*The comm panel blinks red. {{char}} doesn\'t look up from the nav console.* "Rule one on my ship, {{user}}: when customs calls, you\'re a botanist. Rule two — can you fake being a botanist?"' },
    { key: 'elias', glyph: '🗺️', hue: 35, name: 'Professor Elias Thorne', tags: ['adventure', 'mystery'], description: '{{char}} is a 61-year-old archaeologist with a cane he mostly uses for pointing, a satchel of half-translated maps and an unshakable belief that the lost city of Ysra is real.', personality: 'eccentric, enthusiastic, absent-minded, brave when it matters', scenario: '{{user}} is {{char}}\'s new research assistant, arriving at his chaotic study the night before an expedition.', first_mes: '*Papers avalanche off a desk as {{char}} spins around.* "Ah! You must be {{user}}. Splendid. Do you swim? Climb? Read Old Ysran? No matter — we leave at dawn."' },
    { key: 'juniper', glyph: '🥐', hue: 25, name: 'Juniper', tags: ['slice of life', 'cozy'], description: '{{char}} is a 29-year-old baker who runs a tiny café on a rainy corner, remembers every regular\'s order and has an opinion about every book on her shelf.', personality: 'warm, chatty, observant, gently teasing', scenario: '{{user}} ducks into {{char}}\'s café to escape a downpour.', first_mes: '*A bell jingles. {{char}} looks up from a tray of cinnamon rolls.* "Oh, you\'re soaked! Sit, sit — first cup\'s on the house when the weather\'s this rude."' },
    { key: 'ren', glyph: '🕵️', hue: 260, name: 'Detective Ren Kaito', tags: ['mystery', 'noir'], description: '{{char}} is a 44-year-old homicide detective in a neon-soaked city: rumpled trench coat, cold coffee, a habit of noticing what everyone else missed.', personality: 'laconic, perceptive, tired, quietly principled', scenario: 'A body was found at the Golden Lotus hotel. {{user}} is the only witness — or the prime suspect.', first_mes: '*{{char}} flips open a notebook and studies you over the rim of a paper cup.* "Room 1207. You were the last one seen leaving. Start talking, {{user}} — slowly."' },
    { key: 'bramble', glyph: '🦊', hue: 15, name: 'Bramble', tags: ['fantasy', 'whimsical'], description: '{{char}} is an ancient, mischievous fox spirit who guides lost travelers through the Whispering Wood — for a price, usually a story or a riddle.', personality: 'playful, cryptic, kind underneath, loves riddles', scenario: '{{user}} is lost in the Whispering Wood as night falls.', first_mes: '*Two amber eyes glow between the ferns.* "Lost, are we? I know the way out, little traveler. Tell me a story I haven\'t heard and I\'ll show you the path."' },
    { key: 'iris', glyph: '🗣️', hue: 160, name: 'Iris, language partner', tags: ['learning', 'conversation'], description: '{{char}} is a patient, upbeat 33-year-old language coach who practices real-life scenes with {{user}} (ordering food, travel, interviews) in any language, correcting mistakes gently at the end of each reply.', personality: 'encouraging, clear, adaptable', scenario: '{{user}} wants to practice a language through roleplay.', first_mes: '"Hi {{user}}! Which language shall we practice, and where should our scene be — a café in Paris, a train station in Tokyo, a job interview?"' },
    // 18+ (adults; romance / mature themes)
    { key: 'lucien', mature: true, glyph: '🦇', hue: 345, name: 'Lucien Ashford', tags: ['NSFW', 'romance', 'gothic'], description: '{{char}} is a 32-year-old-looking vampire aristocrat (turned at 32, centuries ago) who hosts masquerades in a crumbling manor. Elegant, dangerous, magnetic, with a dry wit and old-world manners.', personality: 'seductive, cultured, possessive, lonely beneath the charm', scenario: '{{user}}, an adult guest, has slipped away from {{char}}\'s masquerade into the moonlit library.', first_mes: '*A voice drifts from the shadows between the shelves.* "Most guests prefer the ballroom, {{user}}. You chose my library instead. How… interesting."' },
    { key: 'scarlett', mature: true, glyph: '🎷', hue: 0, name: 'Scarlett Vane', tags: ['NSFW', 'romance', 'noir'], description: '{{char}} is a 29-year-old jazz singer at the Blue Orchid club in 1940s Chicago, with a velvet voice, a red dress and secrets the mob would kill for.', personality: 'flirtatious, guarded, clever, bold', scenario: 'After her last set, {{char}} slides into {{user}}\'s booth — she needs a favor from an adult stranger she can trust.', first_mes: '*She sets down two glasses and smiles like trouble.* "You\'ve been watching me all night, {{user}}. Good. I need someone nobody in this club knows."' },
    { key: 'kai', mature: true, glyph: '🍸', hue: 190, name: 'Kai Rivera', tags: ['NSFW', 'romance', 'contemporary'], description: '{{char}} is a 30-year-old tattooed bartender and part-time musician in a seaside town: easygoing grin, terrible jokes, a guitar behind the bar.', personality: 'charming, laid-back, attentive, honest', scenario: 'It\'s closing time at {{char}}\'s beach bar and {{user}} (an adult regular) is the last one left.', first_mes: '*{{char}} flips the sign to CLOSED and pours two drinks anyway.* "Last call was ten minutes ago, {{user}}. Guess that makes this one off the record."' },
    { key: 'selene', mature: true, glyph: '🌙', hue: 280, name: 'Queen Selene', tags: ['NSFW', 'romance', 'dark fantasy'], description: '{{char}} is the 35-year-old sorceress-queen of a moonlit kingdom, feared by her court and bored by its flattery. Silver crown, storm-grey eyes, power that hums in the air around her.', personality: 'commanding, intelligent, intense, privately playful', scenario: '{{user}}, an adult envoy from a rival realm, is granted a private audience at midnight.', first_mes: '*The throne room doors close behind you. {{char}} doesn\'t rise.* "They send me diplomats with speeches, {{user}}. Tell me you brought something more interesting."' },
  ];
  const sfwReason = c => c.sfwReason || 'this card describes a minor';
  const matureUnlocked = unlocked => !!(RP.settings.mature && RP.settings.adultConfirmedAt && (unlocked ?? isUnlocked()));

  async function glyphPng(name, glyph, hue) {
    const c = document.createElement('canvas'); c.width = 400; c.height = 600; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 400, 600); gr.addColorStop(0, `hsl(${hue},55%,32%)`); gr.addColorStop(1, `hsl(${(hue + 50) % 360},55%,10%)`);
    g.fillStyle = gr; g.fillRect(0, 0, 400, 600); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '170px sans-serif'; g.fillText(glyph || (name[0] || '?').toUpperCase(), 200, 270);
    g.fillStyle = '#fff'; g.font = 'bold 34px sans-serif'; g.fillText(name.length > 20 ? name.slice(0, 19) + '…' : name, 200, 520);
    return new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer());
  }
  async function addStarter(s, unlocked) {
    if (s.mature && !matureUnlocked(unlocked)) throw new Error('Turn on mature content first (Roleplay → Settings)');
    const c = { id: uid(), created: Date.now(), starter: s.key, ...normalizeCard(s) };
    c.avatar = await saveAvatar(c.id, await glyphPng(c.name, s.glyph, s.hue));
    c.minorFlag = cardDescribesMinor(c); c.mature = !!s.mature && !c.minorFlag;
    RP.chars.unshift(c); saveRp(); return c;
  }

  // --- images in / out
  async function pickImageBytes() {
    if (N) { const [p] = await importFiles('image/*'); if (!p) return null; return fsx.bytes(p); }
    return new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = async () => res(i.files[0] ? new Uint8Array(await i.files[0].arrayBuffer()) : null); i.click(); });
  }
  async function toPngAndJpeg(bytes, maxSide = 1024) {
    const im = await createImageBitmap(new Blob([bytes]));
    const k = Math.min(1, maxSide / Math.max(im.width, im.height)); const cv = document.createElement('canvas'); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
    const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(im, 0, 0, cv.width, cv.height);
    const png = isPng(bytes) ? bytes : new Uint8Array(await (await new Promise(r => cv.toBlob(r, 'image/png'))).arrayBuffer());
    return { png, jpegB64: cv.toDataURL('image/jpeg', 0.85).split(',')[1], w: cv.width, h: cv.height };
  }
  const jsonFrom = t => { const s = stripThink(String(t || '')); const a = s.indexOf('{'), b = s.lastIndexOf('}'); return a >= 0 && b > a ? parseJSON(s.slice(a, b + 1), null) : null; };
  function visionTarget() {
    const a = agentById(S.settings.visionAgent) || agentById(S.current) || S.agents[0];
    return { p: providerById(a.providerId), model: a.model, name: a.name };
  }
  /** Step 1: a vision model describes the picture (look, setting, age group, real photo?). */
  async function analyzeImage(jpegB64) {
    const t = visionTarget(); if (!t.p) throw new Error('Pick a vision agent in Settings (Files & images)');
    const r = await complete({ system: 'You describe images for a character-creation tool. Reply with JSON only.', turns: [{ role: 'user', content:
      'Describe this image as JSON with keys: "summary" (one sentence), "has_character" (true/false), "appearance" (detailed look of the main character: hair, eyes, face, build, clothing, accessories, distinctive features; "" if none), "setting" (the background / scene), "mood", "art_style" (e.g. anime, oil painting, 3D render, photo), "apparent_age" ("child", "teen", "adult" or "unclear"), "real_photo" (true if this is a photograph of a real person). Do not identify or name real people.' }] },
      { p: t.p, model: t.model, temperature: 0.2, max_tokens: 700, images: [{ mime: 'image/jpeg', b64: jpegB64 }] });
    const j = jsonFrom(r.text); if (!j) throw new Error('The vision model did not return a description');
    return j;
  }
  /** Step 2: the roleplay model writes an original character card. */
  async function writeCard({ concept = '', genre = '', name = '', mature = false, vision = null }) {
    const rules = [
      'You create original roleplay character cards. Reply with JSON only, keys: name, description, personality, scenario, first_mes, mes_example, tags (array of 3-6 short tags), creator_notes.',
      'Use {{char}} for the character and {{user}} for the user. description: 120-250 words in third person (appearance, background, quirks). first_mes: an engaging in-character opening (with *actions*). mes_example: 2 short exchanges, each block starting with <START>.',
      'The character is fictional and original. State an adult age (21 or older) in the description. Never base the character on a real person or use a real person\'s name.',
      mature ? 'This card is for an adult (18+) romance / mature roleplay: make the character flirtatious or romantic where it fits, but keep the card text itself tasteful (no explicit content). Include the tag "NSFW".' : 'Keep everything suitable for a general audience (SFW).',
    ].join('\n');
    const parts = [];
    if (name) parts.push(`Name: ${name}`);
    if (genre) parts.push(`Genre: ${genre}`);
    if (concept) parts.push(`Concept from the user: ${concept}`);
    if (vision) {
      parts.push(`The character's look comes from a picture the user chose${vision.real_photo ? ' (a photo: create an original fictional character only loosely inspired by its look and setting)' : ''}:`);
      parts.push(`Appearance: ${vision.appearance || vision.summary || ''}\nSetting: ${vision.setting || ''}\nMood: ${vision.mood || ''}\nArt style: ${vision.art_style || ''}`);
    }
    const r = await complete({ system: rules, turns: [{ role: 'user', content: parts.join('\n') || 'Surprise me with an interesting original character.' }] }, { temperature: 0.9, max_tokens: 1400 });
    const j = jsonFrom(r.text); if (!j || !j.name) throw new Error('The model did not return a character card — try again or another model');
    return j;
  }
  async function createCharacter({ concept, genre, name, mature, imageBytes, unlocked }) {
    mature = !!mature && matureUnlocked(unlocked);
    let vision = null, img = null, lock = '';
    if (imageBytes) {
      img = await toPngAndJpeg(imageBytes);
      vision = await analyzeImage(img.jpegB64);
      if (vision.real_photo) lock = 'it was made from a photo of a real person';
      else if (vision.has_character !== false && /child|teen|unclear/i.test(String(vision.apparent_age || 'unclear'))) lock = 'the picture may show someone under 18';
    }
    const j = await writeCard({ concept, genre, name, mature: mature && !lock, vision });
    const c = { id: uid(), created: Date.now(), ...normalizeCard(j), creator: 'Vela' };
    if (vision) { c.creator_notes = [c.creator_notes, `Created from an image: ${vision.summary || ''}`].filter(Boolean).join('\n'); c.bgHint = vision.setting || ''; }
    c.avatar = await saveAvatar(c.id, img ? img.png : await glyphPng(c.name, '', [...c.name].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 360, 7)));
    if (lock) { c.sfwLock = true; c.sfwReason = lock; }
    c.minorFlag = cardDescribesMinor(c) || !!c.sfwLock;
    if (!c.sfwReason && c.minorFlag) c.sfwReason = 'this card describes a minor';
    c.mature = mature && !c.minorFlag;
    if (!c.mature) c.tags = c.tags.filter(t => !/^(nsfw|18\+|explicit)$/i.test(t));
    RP.chars.unshift(c); saveRp(); return c;
  }

  // --- backgrounds (chat or character): built-in scenes, your own image, or generated from the scenario
  const BG_PRESETS = {
    tavern: 'radial-gradient(ellipse at 50% 85%,#6b3a12 0%,#2a1608 55%,#0d0703 100%)',
    forest: 'radial-gradient(ellipse at 50% 20%,#2f5d3a 0%,#12301c 50%,#06130b 100%)',
    city: 'linear-gradient(180deg,#160a33 0%,#3b0f5c 45%,#0b2a4a 75%,#04070f 100%)',
    space: 'radial-gradient(circle at 70% 30%,#2b2f77 0%,#0a0b2a 45%,#000 100%)',
    beach: 'linear-gradient(180deg,#ff9e6b 0%,#c45a7a 35%,#1d5f7a 70%,#0b2533 100%)',
    castle: 'linear-gradient(180deg,#3a3f4a 0%,#1d2027 60%,#0b0c10 100%)',
    library: 'radial-gradient(ellipse at 30% 30%,#5a4022 0%,#2a1c0e 55%,#0e0904 100%)',
    rain: 'linear-gradient(180deg,#27323d 0%,#141c24 60%,#070a0e 100%)',
  };
  const bgCss = bg => !bg ? '' : bg.startsWith('preset:') ? (BG_PRESETS[bg.slice(7)] || '') : `url("${bg.startsWith('data:') ? bg : wsUrl(bg)}") center/cover no-repeat`;
  const chatBg = chat => chat.bg || (chatMembers(chat)[0] || {}).bg || '';
  async function saveBg(bytes, tag) {
    if (N) return fsx.writeBytes(`rp/backgrounds/${tag}_${uid()}.png`, bytes);
    return 'data:image/png;base64,' + bytesToB64(bytes);
  }
  async function generateBg(chat) {
    const p = providerById(S.settings.imageProvider); if (!p) throw new Error('Pick an image provider in Settings (Files & images) to generate backgrounds');
    const lead = chatMembers(chat)[0] || {}; const me = persona().name;
    const scene = macros(chat.scenario || lead.scenario || lead.bgHint || 'a cozy fantasy tavern at night', { char: lead.name || 'the character', user: me });
    const d = await postJSON(base(p) + '/images/generations', authHeaders(p, getKey(p.id)), { model: S.settings.imageModel, prompt: `Wide scenic background illustration for a story scene, no people, no text, atmospheric lighting: ${scene}`, size: '1536x1024', n: 1 }, 180000);
    const item = (d.data || [])[0] || {};
    if (item.b64_json) return saveBg(Uint8Array.from(atob(item.b64_json), x => x.charCodeAt(0)), 'gen');
    if (item.url && N) { const r = await nativeAsync('download', JSON.stringify({ url: item.url, path: `rp/backgrounds/gen_${uid()}.png` })); return r.path; }
    throw new Error('The image provider returned no image');
  }
  function bgUI(target, after) {
    const cur = target.bg || '';
    $('#modalBox').innerHTML = `<h3>Background</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(6em,1fr));gap:.4em">
        <button data-bg="" style="height:4em">None</button>
        ${Object.keys(BG_PRESETS).map(k => `<button data-bg="preset:${k}" style="height:4em;background:${BG_PRESETS[k]};${cur === 'preset:' + k ? 'outline:2px solid var(--accent)' : ''}">${k}</button>`).join('')}
      </div>
      <div class="row"><button id="bgUp">🖼 Use my image</button>${target.messages ? '<button id="bgGen">✨ Generate from scenario</button>' : ''}<button id="bgX">Close</button></div><p class="hint" id="bgSt"></p>`;
    $('#modal').classList.add('show'); modalClose = () => { $('#modal').classList.remove('show'); modalClose = null; };
    const done = v => { target.bg = v; saveRp(); modalClose(); after && after(); };
    $$('#modalBox [data-bg]').forEach(b => { b.onclick = () => done(b.dataset.bg); });
    $('#bgX').onclick = () => modalClose();
    $('#bgUp').onclick = async () => { try { const b = await pickImageBytes(); if (!b) return; const { png } = await toPngAndJpeg(b, 1600); done(await saveBg(png, 'img')); } catch (e) { toast(e.message); } };
    const g = $('#bgGen'); if (g) g.onclick = async () => { $('#bgSt').textContent = 'Generating…'; try { done(await generateBg(target)); } catch (e) { $('#bgSt').textContent = e.message; } };
  }

  // --- "New character" chooser
  function createUI(tab) {
    const mu = matureUnlocked(); tab = tab || 'sfw';
    const starters = STARTERS.filter(s => tab === 'mature' ? s.mature : !s.mature);
    const genres = ['fantasy', 'sci-fi', 'romance', 'mystery', 'horror', 'slice of life', 'adventure', 'historical', 'cyberpunk', 'comedy'];
    $('#modalBox').innerHTML = `<h3>New character</h3>
      <div class="row"><button class="nogrow ${tab === 'sfw' ? 'primary' : ''}" data-tab2="sfw">Gallery · SFW</button>${mu ? `<button class="nogrow ${tab === 'mature' ? 'primary' : ''}" data-tab2="mature">Gallery · 18+</button>` : ''}<button class="nogrow ${tab === 'make' ? 'primary' : ''}" data-tab2="make">✨ Create</button></div>
      ${tab === 'make' ? `
        <label>Concept (who are they? what's the story?)</label><textarea id="ncC" class="big" placeholder="e.g. a retired dragon hunter who now runs an inn, gruff but kind"></textarea>
        <div class="row"><div><label>Name (optional)</label><input id="ncN"></div><div><label>Genre</label><select id="ncG"><option value="">any</option>${genres.map(g => `<option>${g}</option>`).join('')}</select></div></div>
        ${mu ? '<label class="inline"><input type="checkbox" id="ncM"> 18+ character (romance / mature themes)</label>' : '<p class="hint">Turn on mature content in Roleplay → Settings to create 18+ characters.</p>'}
        <div class="row"><button class="primary" id="ncText">✍ Create from description</button><button id="ncImg">🖼 Create from an image…</button><button id="ncBlank">Blank card</button></div>
        <p class="hint">From an image: a vision model (${esc(visionTarget().name)}) describes the picture and your roleplay model writes an original character; the picture becomes the avatar. Characters made from a photo of a real person, or from a picture that may show someone under 18, are SFW-only.</p>
        <p class="hint" id="ncSt"></p>`
      : `<div class="rp-grid">${starters.map(s => `<button class="rp-card" data-st="${s.key}" style="padding:.5em;text-align:left"><div style="font-size:2.2em">${s.glyph}</div><div class="nm" style="padding:.2em 0">${esc(s.name)}</div><div class="tg" style="padding:0">${esc(s.tags.filter(t => t !== 'NSFW').join(' · '))}</div></button>`).join('')}</div>
        <p class="hint">${tab === 'mature' ? 'Adult characters for romance and mature roleplay. Chats with them start as 18+.' : 'Tap a character to add it to your library and start chatting.'}</p>`}
      <div class="row"><button id="ncX">Close</button></div>`;
    $('#modal').classList.add('show'); modalClose = () => { $('#modal').classList.remove('show'); modalClose = null; };
    $('#ncX').onclick = () => modalClose();
    $$('#modalBox [data-tab2]').forEach(b => { b.onclick = () => createUI(b.dataset.tab2); });
    $$('#modalBox [data-st]').forEach(b => { b.onclick = async () => { try { const c = await addStarter(STARTERS.find(s => s.key === b.dataset.st)); modalClose(); openChat(newChat([c.id]).id); } catch (e) { toast(e.message); } }; });
    if (tab !== 'make') return;
    const st = t => { $('#ncSt').textContent = t; };
    const opts = () => ({ concept: $('#ncC').value.trim(), name: $('#ncN').value.trim(), genre: $('#ncG').value, mature: !!($('#ncM') && $('#ncM').checked) });
    const run = async imageBytes => {
      const o = opts();
      if (o.mature && textDescribesMinor(o.concept + ' ' + o.name)) return st('18+ characters must be adults.');
      $$('#modalBox button').forEach(b => { b.disabled = true; });
      try { st(imageBytes ? 'Looking at the image…' : 'Writing the character…'); const c = await createCharacter({ ...o, imageBytes }); modalClose(); if (c.sfwLock) toast(`${c.name} is SFW-only: ${c.sfwReason}`); view = { ...view, screen: 'edit', charId: c.id }; renderRp(); }
      catch (e) { st('⚠ ' + e.message); $$('#modalBox button').forEach(b => { b.disabled = false; }); }
    };
    $('#ncText').onclick = () => run(null);
    $('#ncImg').onclick = async () => { try { const b = await pickImageBytes(); if (b) run(b); } catch (e) { st(e.message); } };
    $('#ncBlank').onclick = () => { const c = { id: uid(), created: Date.now(), ...normalizeCard({ name: $('#ncN').value.trim() || 'New character', first_mes: '*{{char}} looks up.* Oh — hello, {{user}}.' }), avatar: '' }; RP.chars.unshift(c); saveRp(); modalClose(); view = { ...view, screen: 'edit', charId: c.id }; renderRp(); };
  }

  /* ================================================================ OpenAI-compatible API for SillyTavern */
  function modelList() {
    const out = [];
    for (const p of S.providers) { if (!getKey(p.id) && !p.local) continue; for (const m of p.models || []) out.push({ id: `${p.id}/${m}`, object: 'model', created: 0, owned_by: p.name }); }
    return out;
  }
  function resolveModel(id) {
    const s = String(id || ''); const i = s.indexOf('/');
    const p = i > 0 && providerById(s.slice(0, i)); if (p) return { p, model: s.slice(i + 1) };
    const owner = S.providers.find(x => (x.models || []).includes(s) && (getKey(x.id) || x.local)); if (owner) return { p: owner, model: s };
    const d = rpProvider(); return { p: d.p, model: s || d.model };
  }
  onNative('webhook', async ev => {
    const path = String(ev.path || ''); if (!path.startsWith('/v1/')) return;
    const reply = (status, data, ct = 'application/json') => N.serverRespond(ev.reqId, status, ct, typeof data === 'string' ? data : JSON.stringify(data));
    try {
      if (path === '/v1/models') return reply(200, { object: 'list', data: modelList() });
      if (path === '/v1/chat/completions') {
        const b = parseJSON(ev.body, {}) || {};
        const msgs = (b.messages || []).map(m => ({ role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user', content: typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map(c => c.text || '').join('') : '' }));
        let system = ''; while (msgs.length && msgs[0].role === 'system') system += (system ? '\n\n' : '') + msgs.shift().content;
        const { p, model } = resolveModel(b.model);
        const r = await complete({ system, turns: msgs }, { p, model, temperature: b.temperature ?? 0.8, top_p: b.top_p ?? 1, max_tokens: b.max_tokens || b.max_completion_tokens || 400, frequency_penalty: b.frequency_penalty || 0, presence_penalty: b.presence_penalty || 0, stop: b.stop ? [].concat(b.stop) : [] });
        const id = 'chatcmpl-' + uid(), created = Math.floor(Date.now() / 1000), name = `${p.id}/${model}`;
        if (b.stream) {
          const chunk = d => 'data: ' + JSON.stringify({ id, object: 'chat.completion.chunk', created, model: name, choices: [d] }) + '\n\n';
          return reply(200, chunk({ index: 0, delta: { role: 'assistant', content: r.text }, finish_reason: null }) + chunk({ index: 0, delta: {}, finish_reason: 'stop' }) + 'data: [DONE]\n\n', 'text/event-stream');
        }
        return reply(200, { id, object: 'chat.completion', created, model: name, choices: [{ index: 0, message: { role: 'assistant', content: r.text }, finish_reason: 'stop' }], usage: r.usage || {} });
      }
      return reply(404, { error: { message: 'Unknown endpoint ' + path, type: 'invalid_request_error' } });
    } catch (e) { reply(e.status && e.status < 600 ? e.status : 500, { error: { message: e.message, type: 'api_error' } }); }
  });

  /* ================================================================ Vela Glasses client: /client/rp/… */
  // The glasses app is a remote for this tab. 18+ content shows there only when allowed for the
  // glasses (setting) and, with a PIN lock, after the PIN is entered on the glasses (expires after
  // 30 minutes without use). Nothing is pushed to the glasses unasked.
  const G = { unlockedUntil: 0, fails: 0, lockedUntil: 0 };
  const gUnlocked = () => !RP.settings.pinHash || !RP.settings.lockMature || Date.now() < G.unlockedUntil;
  const gMatureOk = () => !!(RP.settings.glassesMature && RP.settings.mature && RP.settings.adultConfirmedAt && gUnlocked());
  const gCharOk = c => c && (!c.mature || gMatureOk());
  const gChatOk = ch => ch && (!ch.mature || gMatureOk()) && chatMembers(ch).every(gCharOk);
  const gMsg = (m, chat) => ({ id: m.id, isUser: !!m.isUser, who: m.isUser ? persona().name : ((charById(m.charId) || {}).name || '?'), text: m.text(), swipe: m.swipeId + 1, swipes: m.swipes.length });
  const gChat = ch => ({ chat: { id: ch.id, title: ch.title, mature: !!ch.mature, matureActive: matureActive(ch, gUnlocked()), members: chatMembers(ch).map(c => ({ id: c.id, name: c.name, avatar: !!(c.avatar && !c.avatar.startsWith('data:')) })) }, messages: ch.messages.slice(-12).map(m => gMsg(m, ch)) });
  onNative('webhook', async ev => {
    const path = String(ev.path || ''); if (!path.startsWith('/client/rp/')) return;
    const reply = (status, data) => N.serverRespond(ev.reqId, status, 'application/json', JSON.stringify(data));
    const b = parseJSON(ev.body, {}) || {}; const q = new URLSearchParams(ev.query || '');
    try {
      if (gUnlocked() && G.unlockedUntil) G.unlockedUntil = Date.now() + 30 * 60000;   // sliding expiry while in use
      if (path === '/client/rp/list') {
        const hidden = RP.chars.some(c => c.mature) && !gMatureOk();
        return reply(200, { chars: RP.chars.filter(gCharOk).map(c => ({ id: c.id, name: c.name, tags: (c.tags || []).slice(0, 4), mature: !!c.mature, sfwOnly: !!c.minorFlag, avatar: !!(c.avatar && !c.avatar.startsWith('data:')), blurb: clip(c.creator_notes || c.description || '', 120) })),
          chats: RP.chats.filter(gChatOk).slice(0, 8).map(ch => ({ id: ch.id, title: ch.title, mature: !!ch.mature, n: ch.messages.length })),
          hidden, canUnlock: hidden && !!RP.settings.glassesMature && !!RP.settings.pinHash && RP.settings.lockMature && !gUnlocked(), persona: persona().name });
      }
      if (path === '/client/rp/avatar') {
        const c = charById(q.get('id') || ''); if (!gCharOk(c) || !c.avatar || c.avatar.startsWith('data:')) return reply(404, { error: 'no avatar' });
        return N.serverRespondFile(ev.reqId, 200, 'image/png', c.avatar);
      }
      if (path === '/client/rp/unlock') {
        if (Date.now() < G.lockedUntil) return reply(429, { error: 'Too many wrong PINs — try again in a few minutes' });
        if (RP.settings.pinHash && (await sha(String(b.pin || '').replace(/\D/g, ''))) === RP.settings.pinHash) { G.unlockedUntil = Date.now() + 30 * 60000; G.fails = 0; return reply(200, { ok: true }); }
        if (++G.fails >= 5) { G.fails = 0; G.lockedUntil = Date.now() + 5 * 60000; }
        return reply(401, { error: 'Wrong PIN' });
      }
      if (path === '/client/rp/lock') { G.unlockedUntil = 0; return reply(200, { ok: true }); }
      if (path === '/client/rp/gallery') {
        const pub = st => ({ key: st.key, name: st.name, glyph: st.glyph, tags: st.tags.filter(t => t !== 'NSFW').slice(0, 3), have: RP.chars.some(c => c.starter === st.key) });
        return reply(200, { sfw: STARTERS.filter(x => !x.mature).map(pub), mature: gMatureOk() ? STARTERS.filter(x => x.mature).map(pub) : [], matureOk: gMatureOk() });
      }
      if (path === '/client/rp/create') {
        let c;
        if (b.starter) {
          const st = STARTERS.find(x => x.key === b.starter); if (!st) return reply(404, { error: 'Unknown starter character' });
          if (st.mature && !gMatureOk()) return reply(403, { error: '18+ characters are not available on the glasses' });
          c = RP.chars.find(x => x.starter === st.key) || await addStarter(st, gUnlocked());
        } else {
          const mature = !!b.mature && gMatureOk();
          const concept = String(b.concept || '').slice(0, 2000);
          if (mature && textDescribesMinor(concept)) return reply(400, { error: '18+ characters must be adults.' });
          const img = b.image && b.image.b64 ? Uint8Array.from(atob(b.image.b64), x => x.charCodeAt(0)) : null;
          if (!concept && !img) return reply(400, { error: 'Describe the character or take a picture' });
          c = await createCharacter({ concept, mature, imageBytes: img, unlocked: gUnlocked() });
        }
        const ch = RP.chats.find(x => x.members.length === 1 && x.members[0] === c.id && gChatOk(x)) || newChat([c.id], { mature: gMatureOk() && c.mature });
        if (currentTab === 'rp' && view.screen === 'list') renderList();
        return reply(200, { char: { id: c.id, name: c.name, mature: !!c.mature, sfwOnly: !!c.minorFlag, reason: c.minorFlag ? sfwReason(c) : '' }, ...gChat(ch) });
      }
      if (path === '/client/rp/open') {
        let ch = b.chatId && chatById(b.chatId);
        if (!ch && b.charId) { const c = charById(b.charId); if (!gCharOk(c)) return reply(404, { error: 'Character not available' }); ch = b.resume !== false && RP.chats.find(x => x.members.length === 1 && x.members[0] === c.id && gChatOk(x)) || newChat([c.id], { mature: gMatureOk() && c.mature }); }
        if (!gChatOk(ch)) return reply(404, { error: 'Chat not available on the glasses' });
        return reply(200, gChat(ch));
      }
      const ch = chatById(b.chatId); if (!gChatOk(ch)) return reply(404, { error: 'Chat not available on the glasses' });
      const last = ch.messages[ch.messages.length - 1];
      if (path === '/client/rp/send') {
        const t = String(b.text || '').trim();
        if (t) { if (ch.mature && textDescribesMinor(t)) return reply(400, { error: 'Mature chats cannot involve minors.' }); ch.messages.push(msg({ isUser: true, text: t })); saveRp(); }
        const m = await generate(ch, { unlocked: gUnlocked(), quiet: true });
        return reply(200, { message: gMsg(m, ch), mature: !!ch.mature, ...gChat(ch) });
      }
      if (path === '/client/rp/regen' || path === '/client/rp/continue') {
        if (!last || last.isUser) return reply(400, { error: 'Nothing to ' + (path.endsWith('regen') ? 'swipe' : 'continue') + ' yet' });
        const m = await generate(ch, { [path.endsWith('regen') ? 'swipeOf' : 'continueOf']: last, unlocked: gUnlocked(), quiet: true });
        return reply(200, { message: gMsg(m, ch), mature: !!ch.mature, ...gChat(ch) });
      }
      if (path === '/client/rp/swipe') {
        if (!last || last.isUser) return reply(400, { error: 'No reply to swipe' });
        const dir = Number(b.dir) || 1;
        if (dir > 0 && last.swipeId >= last.swipes.length - 1) { const m = await generate(ch, { swipeOf: last, unlocked: gUnlocked(), quiet: true }); return reply(200, { message: gMsg(m, ch), mature: !!ch.mature, ...gChat(ch) }); }
        last.swipeId = Math.max(0, Math.min(last.swipes.length - 1, last.swipeId + dir)); saveRp(); renderChat();
        return reply(200, { message: gMsg(last, ch), mature: !!ch.mature, ...gChat(ch) });
      }
      return reply(404, { error: 'unknown roleplay path' });
    } catch (e) { reply(e.status && e.status < 600 ? e.status : 500, { error: e.message }); }
  });

  /* ================================================================ agent skill (SFW helper only) */
  BUILTIN_SKILLS.push({ name: 'roleplay_open', group: 'Roleplay', description: 'Open the Roleplay tab, optionally starting a chat with a character by name. (Roleplay content itself stays in that tab and is not read by agents.)', parameters: { type: 'object', properties: { character: { type: 'string', description: 'character name (optional)' } } },
    run: async a => {
      const c = a.character && RP.chars.find(x => x.name.toLowerCase().includes(String(a.character).toLowerCase()) && (isUnlocked() || !x.mature));
      if (c) { openChat(newChat([c.id]).id); return `Started a roleplay chat with ${c.name}.`; }
      view.screen = 'list'; showTab('rp'); return a.character ? `No character named "${a.character}" — opened the Roleplay tab.` : 'Opened the Roleplay tab.';
    } });

  window.NexusRoleplay = { STARTERS, addStarter, createCharacter, analyzeImage, writeCard, bgUI, BG_PRESETS, RP, importCardBytes, exportCard, readCardPng, writeCardPng, cardJSON, normalizeCard, buildPrompt, complete, generate, newChat, cardDescribesMinor, matureActive, worldInfo, openChat, saveRp };
})();
