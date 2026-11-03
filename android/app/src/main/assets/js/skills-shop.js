/* Nexus Agent — "Hey Nexus" wake word, Amazon & Walmart shopping, shopping list, Plex,
 * fast food chains and delivery services. Loaded after skills-media.js. */
'use strict';
(() => {
  const P = (props, req = []) => ({ type: 'object', properties: props, required: req });
  const Str = d => ({ type: 'string', description: d });
  const Num = d => ({ type: 'number', description: d });
  const Bool = d => ({ type: 'boolean', description: d });
  const Arr = (d, items = { type: 'string' }) => ({ type: 'array', items, description: d });
  const J = o => JSON.stringify(o, null, 1);
  const enc = encodeURIComponent;
  const M = () => window.NexusMedia;

  S.settings = {
    wakeEnabled: false, wakeLang: 'en-us', wakeCommandMode: 'vosk', wakeCustom: '', wakeSpeak: true,
    amazonDomain: 'amazon.com', deliveryService: '', plexVideo: 'transcode',
    plexClientId: (crypto.randomUUID ? crypto.randomUUID() : uid() + uid()),
    ...S.settings,
  };
  S.shoppingList = S.shoppingList || [];

  /** Opens a URL in a specific installed app when possible (App Links), else the browser. */
  function openIn(url, pkg) {
    needNative('Opening apps');
    if (pkg && N.startIntent(JSON.stringify({ action: 'android.intent.action.VIEW', data: url, package: pkg })) === 'ok') return 'opened in app';
    return N.openUrl(url) ? 'opened' : 'could not open ' + url;
  }
  /** Launches an app by package, else by fuzzy label match among installed apps. */
  function launchByHint(pkg, labels) {
    if (!N) return null;
    const apps = parseJSON(N.listApps(), []);
    const hit = (pkg && apps.find(a => a.package === pkg)) || apps.find(a => labels.some(l => a.label.toLowerCase().replace(/[^a-z0-9]/g, '').includes(l.toLowerCase().replace(/[^a-z0-9]/g, ''))));
    return hit && N.launchApp(hit.package) ? hit : null;
  }
  const BROWSER_UA = () => navigator.userAgent.replace(/; wv\)/, ')').replace(/ Version\/[\d.]+/, '');
  async function getPage(url) {
    const r = await http('GET', url, { 'User-Agent': BROWSER_UA(), Accept: 'text/html,application/xhtml+xml', 'Accept-Language': navigator.language || 'en-US' }, null, 30000);
    return { status: r.status, html: r.body || '' };
  }

  /* ================================================================== wake word */
  const VOSK = { 'en-us': 'vosk-model-small-en-us-0.15', de: 'vosk-model-small-de-0.15', fr: 'vosk-model-small-fr-0.22', es: 'vosk-model-small-es-0.42', it: 'vosk-model-small-it-0.22', pt: 'vosk-model-small-pt-0.3', nl: 'vosk-model-small-nl-0.22', ru: 'vosk-model-small-ru-0.22', cn: 'vosk-model-small-cn-0.22', ja: 'vosk-model-small-ja-0.22' };
  const modelName = () => VOSK[S.settings.wakeLang] || VOSK['en-us'];
  const wakePhrases = () => [...new Set([S.settings.wakeCustom, 'hey nexus', 'hey next us', 'hey nexis', 'hi nexus', 'okay nexus'].map(p => String(p || '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').trim()).filter(Boolean))];
  let wakeBadge = null;
  function badge(text) {
    if (!wakeBadge) { wakeBadge = document.createElement('div'); wakeBadge.style.cssText = 'position:fixed;top:3.2em;left:50%;transform:translateX(-50%);z-index:12;background:#2a0d4a;border:1px solid var(--accent2);color:#fff;padding:.4em 1em;border-radius:99px;max-width:90vw;text-align:center;box-shadow:0 0 18px var(--accent2)'; document.body.appendChild(wakeBadge); }
    if (text == null) { wakeBadge.style.display = 'none'; return; }
    wakeBadge.textContent = text; wakeBadge.style.display = 'block';
  }
  async function wakeEnsureModel() {
    if (N.wakeModelInstalled(modelName())) return true;
    toast(`Downloading offline speech model (${modelName()})…`);
    const h = p => { if (p.pct >= 0) badge(`⬇ Speech model ${p.pct}%`); };
    onNative('wake_model', h);
    try { await nativeAsync('wakeModelDownload', `https://alphacephei.com/vosk/models/${modelName()}.zip`, modelName()); }
    finally { eventHandlers.wake_model = (eventHandlers.wake_model || []).filter(x => x !== h); badge(null); }
    return true;
  }
  async function wakeStart() {
    needNative('Wake word');
    if (!(await ensurePermission('android.permission.RECORD_AUDIO'))) throw new Error('Microphone permission is needed for the wake word');
    await ensurePermission('android.permission.POST_NOTIFICATIONS').catch(() => {});
    await wakeEnsureModel();
    const r = parseJSON(N.wakeStart(JSON.stringify({ model: modelName(), phrases: wakePhrases(), commandMode: S.settings.wakeCommandMode })), {});
    if (r.error) throw new Error(r.error);
    S.settings.wakeEnabled = true; save();
    return `Listening for "${wakePhrases()[0]}" (offline).`;
  }
  function wakeStop() { if (N) N.wakeStop(); S.settings.wakeEnabled = false; save(); badge(null); return 'Wake word off.'; }
  async function handleWakeCommand(text) {
    badge(null);
    text = String(text || '').trim();
    if (!text) { toast("Didn't catch that"); return; }
    if (/^(stop|cancel|never ?mind|be quiet|shut up)\b/i.test(text)) { stopRun(); stopSpeaking(); return; }
    showTab('chat');
    if (busy) stopRun();
    setBusy(true);
    try {
      const r = await dispatch(text, { origin: 'voice' });
      if (S.settings.wakeSpeak && !S.settings.speakReplies && S.mode !== 'translate') speak(r.text);
    } catch (e) { if (e.message !== 'Stopped') { addMsg({ role: 'system', content: e.message, error: true, ts: Date.now() }); speak('Sorry, ' + e.message); } }
    finally { setBusy(false); }
  }
  onNative('wake', async e => {
    if (e.phase === 'wake' || e.phase === 'tap') {
      stopSpeaking(); badge('🎙 Listening…'); if (N) N.vibrate(40);
      if (e.text === 'handoff' || e.phase === 'tap') {
        try { const t = (await nativeAsync('listen', S.settings.voiceLang || '')).text; await handleWakeCommand(t); }
        catch (err) { badge(null); toast(err.message); }
        finally { if (N && S.settings.wakeEnabled) N.wakeResume(); }
      }
    } else if (e.phase === 'partial') badge('🎙 ' + e.text);
    else if (e.phase === 'command') handleWakeCommand(e.text);
    else if (e.phase === 'error') { badge(null); toast('Wake word: ' + e.text); }
    else if (e.phase === 'ready') toast(`Say "${wakePhrases()[0]}"`);
  });
  // Don't let the app hear itself; give the mic button priority over the wake word.
  onNative('tts_state', p => { if (N && N.wakeRunning && N.wakeRunning()) N.wakePause(!!p.speaking); });
  {
    const coreListen = listen;
    listen = async () => { const w = N && N.wakeRunning && N.wakeRunning(); if (w) N.wakeSuspend(); try { await coreListen(); } finally { if (w) N.wakeResume(); } };
  }
  setTimeout(() => { if (S.settings.wakeEnabled && N && N.wakeModelInstalled && N.wakeModelInstalled(modelName()) && !N.wakeRunning()) wakeStart().catch(e => toast(e.message)); }, 1200);

  /* ================================================================== Amazon */
  const AMZ = () => 'https://www.' + (S.settings.amazonDomain || 'amazon.com');
  const AMZ_PKG = 'com.amazon.mShop.android.shopping';
  const blockedMsg = store => `${store} blocked automated browsing right now (robot check). I can open the ${store} app/website search for you instead (use the open action).`;
  async function amazonSearch(q, limit = 8) {
    const { status, html } = await getPage(`${AMZ()}/s?k=${enc(q)}`);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const items = $$('[data-component-type="s-search-result"]', doc).filter(el => el.getAttribute('data-asin')).map(el => {
      const t = el.querySelector('h2'); const price = el.querySelector('.a-price:not(.a-text-price) .a-offscreen');
      return { store: 'Amazon', id: el.getAttribute('data-asin'), title: t ? t.textContent.trim().replace(/\s+/g, ' ') : '', price: price ? price.textContent.trim() : null, rating: ((el.querySelector('.a-icon-alt') || {}).textContent || '').split(' ')[0] || null, reviews: ((el.querySelector('[aria-label$="ratings"], .s-underline-text') || {}).textContent || '').trim() || null, prime: !!el.querySelector('.a-icon-prime, [aria-label*="Prime"]'), sponsored: /sponsored/i.test(el.textContent.slice(0, 400)), url: `${AMZ()}/dp/${el.getAttribute('data-asin')}`, image: (el.querySelector('img.s-image') || {}).src };
    }).filter(x => x.title);
    if (!items.length) return { blocked: /captcha|robot|automated access|api-services-support/i.test(html) || status >= 500, items: [] };
    return { items: items.filter(x => !x.sponsored).concat(items.filter(x => x.sponsored)).slice(0, limit) };
  }
  async function amazonProduct(asin) {
    const { html } = await getPage(`${AMZ()}/dp/${enc(asin)}`);
    const d = new DOMParser().parseFromString(html, 'text/html'); const tx = sel => ((d.querySelector(sel) || {}).textContent || '').trim().replace(/\s+/g, ' ');
    const title = tx('#productTitle'); if (!title) return { blocked: true };
    return { store: 'Amazon', id: asin, title, price: tx('#corePrice_feature_div .a-offscreen') || tx('.a-price .a-offscreen') || null, availability: tx('#availability') || null, rating: tx('#acrPopover .a-icon-alt') || null, reviews: tx('#acrCustomerReviewText') || null, bullets: $$('#feature-bullets li', d).map(li => li.textContent.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 6), url: `${AMZ()}/dp/${asin}` };
  }
  const amazonCartUrl = list => `${AMZ()}/gp/aws/cart/add.html?` + list.map((x, i) => `ASIN.${i + 1}=${enc(x.id)}&Quantity.${i + 1}=${Math.max(1, x.qty || 1)}`).join('&');

  /* ================================================================== Walmart */
  const WM_PKG = 'com.walmart.android';
  const nextData = html => { const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/); return m ? parseJSON(m[1], null) : null; };
  async function walmartSearch(q, limit = 8) {
    const { html } = await getPage(`https://www.walmart.com/search?q=${enc(q)}`);
    const nd = nextData(html); const stacks = nd && nd.props && nd.props.pageProps && nd.props.pageProps.initialData && nd.props.pageProps.initialData.searchResult && nd.props.pageProps.initialData.searchResult.itemStacks;
    if (!stacks) return { blocked: true, items: [] };
    const items = stacks.flatMap(s => s.items || []).filter(x => x.__typename === 'Product' && x.usItemId).map(x => ({ store: 'Walmart', id: x.usItemId, title: x.name, price: (x.priceInfo && (x.priceInfo.linePrice || (x.priceInfo.currentPrice && x.priceInfo.currentPrice.priceString))) || (x.price != null ? '$' + x.price : null), rating: x.averageRating || null, reviews: x.numberOfReviews || null, availability: (x.availabilityStatusV2 && x.availabilityStatusV2.display) || null, fulfillment: x.fulfillmentBadge || (x.fulfillmentBadgeGroups || []).map(b => b.text).join(', ') || null, sponsored: !!x.isSponsoredFlag, url: 'https://www.walmart.com' + (x.canonicalUrl || `/ip/${x.usItemId}`), image: x.imageInfo && x.imageInfo.thumbnailUrl }));
    return { items: items.filter(x => !x.sponsored).concat(items.filter(x => x.sponsored)).slice(0, limit) };
  }
  async function walmartProduct(id) {
    const { html } = await getPage(`https://www.walmart.com/ip/${enc(id)}`);
    const nd = nextData(html); const p = nd && nd.props && nd.props.pageProps && nd.props.pageProps.initialData && nd.props.pageProps.initialData.data && nd.props.pageProps.initialData.data.product;
    if (!p) return { blocked: true };
    return { store: 'Walmart', id, title: p.name, price: p.priceInfo && p.priceInfo.currentPrice && p.priceInfo.currentPrice.priceString, availability: p.availabilityStatus, rating: p.averageRating, reviews: p.numberOfReviews, brand: p.brand, description: htmlToText(p.shortDescription || '').slice(0, 600), url: `https://www.walmart.com/ip/${id}` };
  }
  const walmartCartUrl = list => 'https://affil.walmart.com/cart/addToCart?items=' + list.map(x => `${enc(x.id)}|${Math.max(1, x.qty || 1)}`).join(',');

  const fmtItems = arr => arr.map((x, i) => `${i + 1}. ${x.title}\n   ${x.price || 'price n/a'}${x.rating ? ` · ★${x.rating}` : ''}${x.reviews ? ` (${x.reviews})` : ''}${x.prime ? ' · Prime' : ''}${x.fulfillment ? ' · ' + x.fulfillment : ''}${x.availability ? ' · ' + x.availability : ''}${x.sponsored ? ' · sponsored' : ''}\n   id: ${x.id} · ${x.url}`).join('\n');
  async function storeSearch(store, q, limit) {
    const r = store === 'walmart' ? await walmartSearch(q, limit) : await amazonSearch(q, limit);
    return r.blocked ? { store, blocked: true, note: blockedMsg(store === 'walmart' ? 'Walmart' : 'Amazon') } : { store, items: r.items };
  }

  /* ================================================================== Plex */
  const plexHeaders = () => ({ Accept: 'application/json', 'X-Plex-Product': 'Nexus Agent', 'X-Plex-Client-Identifier': S.settings.plexClientId, 'X-Plex-Device-Name': deviceLabel(), 'X-Plex-Platform': 'Android' });
  const plexServer = () => { const u = S.settings.plexServerUrl, t = getKey('svc_plex_server') || getKey('svc_plex'); if (!u || !t) throw new Error('Plex is not connected. Settings → Shopping, food & Plex → Sign in with Plex (or enter server URL + token).'); return { u: u.replace(/\/+$/, ''), t }; };
  async function plexGet(path, params = {}) {
    const { u, t } = plexServer();
    const q = new URLSearchParams({ ...params, 'X-Plex-Token': t });
    const r = await http('GET', `${u}${path}${path.includes('?') ? '&' : '?'}${q}`, plexHeaders(), null, 30000);
    if (r.status === 401) throw new Error('Plex token rejected — sign in again');
    const d = parseJSON(r.body, null); if (r.status >= 400 || !d) throw new Error(`Plex HTTP ${r.status}`);
    return d.MediaContainer || d;
  }
  async function plexSignIn() {
    needNative('Plex sign-in');
    const pinR = await http('POST', 'https://plex.tv/api/v2/pins?strong=true', plexHeaders(), '', 20000);
    const pin = parseJSON(pinR.body, {}); if (!pin.id) throw new Error('Plex PIN request failed (HTTP ' + pinR.status + ')');
    const url = `https://app.plex.tv/auth#?clientID=${enc(S.settings.plexClientId)}&code=${enc(pin.code)}&context%5Bdevice%5D%5Bproduct%5D=${enc('Nexus Agent')}`;
    let qr = ''; try { qr = await M().qrDataUrl(url); } catch { /* optional */ }
    let cancelled = false;
    const box = $('#modalBox');
    box.innerHTML = `<h3>Sign in with Plex</h3><p>Scan with your phone, or open the link and approve <b>Nexus Agent</b>:</p>${qr ? `<img src="${esc(wsUrl(qr))}" alt="" style="width:12em;background:#fff;padding:.4em;border-radius:6px">` : ''}<code class="block">${esc(url)}</code><div class="row"><button class="primary" id="pxOpen">Open here</button><button id="pxNo">Cancel</button></div><p class="hint" id="pxSt">waiting for approval…</p>`;
    $('#modal').classList.add('show'); modalClose = () => { cancelled = true; $('#modal').classList.remove('show'); modalClose = null; };
    $('#pxOpen').onclick = () => N.openUrl(url); $('#pxNo').onclick = () => modalClose(); $('#pxOpen').focus();
    for (let i = 0; i < 150 && !cancelled; i++) {
      await sleep(2000);
      const r = await http('GET', `https://plex.tv/api/v2/pins/${pin.id}`, plexHeaders(), null, 15000).catch(() => null);
      const d = r ? parseJSON(r.body, {}) : {};
      if (d.authToken) { setKey('svc_plex', d.authToken); if ($('#pxSt')) $('#pxSt').textContent = 'Signed in — finding your servers…'; const s = await plexDiscover(); modalClose && modalClose(); return s; }
    }
    throw new Error('Plex sign-in cancelled or timed out');
  }
  async function plexDiscover() {
    const tok = getKey('svc_plex'); if (!tok) throw new Error('Not signed in to Plex');
    const r = await http('GET', 'https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1', { ...plexHeaders(), 'X-Plex-Token': tok }, null, 20000);
    const list = (parseJSON(r.body, []) || []).filter(x => String(x.provides || '').includes('server'));
    if (!list.length) throw new Error('No Plex Media Server found on this account');
    const pref = list.find(x => x.owned) || list[0];
    const conns = (pref.connections || []).slice().sort((a, b) => (b.local - a.local) || (a.relay - b.relay));
    for (const c of conns) {
      const ok = await http('GET', `${c.uri}/identity?X-Plex-Token=${enc(pref.accessToken || tok)}`, plexHeaders(), null, 5000).then(x => x.status < 400).catch(() => false);
      if (ok) { S.settings.plexServerUrl = c.uri; S.settings.plexServerName = pref.name; S.settings.plexMachineId = pref.clientIdentifier; setKey('svc_plex_server', pref.accessToken || tok); save(); return `Connected to Plex server "${pref.name}" (${c.local ? 'local' : c.relay ? 'relay' : 'remote'} connection).`; }
    }
    throw new Error(`Found server "${pref.name}" but could not reach it from this network`);
  }
  const plexItem = m => ({ key: m.ratingKey, type: m.type, title: m.type === 'episode' ? `${m.grandparentTitle} · S${m.parentIndex}E${m.index} ${m.title}` : m.type === 'track' ? `${m.grandparentTitle} — ${m.title}` : m.type === 'album' ? `${m.parentTitle} — ${m.title}` : m.title, year: m.year, duration: m.duration ? Math.round(m.duration / 60000) + ' min' : undefined, watched: m.viewCount ? true : undefined, progress: m.viewOffset && m.duration ? Math.round(m.viewOffset / m.duration * 100) + '%' : undefined });
  const fmtPlex = arr => arr.map(x => `• ${x.title}${x.year ? ` (${x.year})` : ''} · ${x.type}${x.duration ? ' · ' + x.duration : ''}${x.progress ? ' · ' + x.progress + ' watched' : x.watched ? ' · watched' : ''}\n  key: ${x.key}`).join('\n');
  async function plexResolve(ref) {
    if (/^\d+$/.test(String(ref))) return (await plexGet(`/library/metadata/${ref}`)).Metadata[0];
    const d = await plexGet('/hubs/search', { query: ref, limit: 5 });
    const hit = (d.Hub || []).flatMap(h => h.Metadata || [])[0]; if (!hit) throw new Error('Nothing on Plex matches "' + ref + '"'); return hit;
  }
  function plexStreamUrl(m) {
    const { u, t } = plexServer();
    const part = m.Media && m.Media[0] && m.Media[0].Part && m.Media[0].Part[0];
    if (m.type === 'track' || S.settings.plexVideo === 'direct') return part ? `${u}${part.key}?X-Plex-Token=${enc(t)}` : null;
    const q = new URLSearchParams({ path: `/library/metadata/${m.ratingKey}`, mediaIndex: 0, partIndex: 0, protocol: 'hls', fastSeek: 1, directPlay: 0, directStream: 1, subtitleSize: 100, audioBoost: 100, location: S.settings.plexServerUrl.includes('plex.direct') && !/^https?:\/\/(192|10|172)\./.test(u) ? 'wan' : 'lan', offset: m.viewOffset ? Math.floor(m.viewOffset / 1000) : 0, session: uid(), 'X-Plex-Client-Identifier': S.settings.plexClientId, 'X-Plex-Product': 'Nexus Agent', 'X-Plex-Platform': 'Chrome', 'X-Plex-Token': t });
    return `${u}/video/:/transcode/universal/start.m3u8?${q}`;
  }
  async function plexPlay(ref, where) {
    let m = await plexResolve(ref);
    if (where === 'app') {
      const url = `https://app.plex.tv/desktop/#!/server/${S.settings.plexMachineId}/details?key=${enc('/library/metadata/' + m.ratingKey)}`;
      return openIn(url, 'com.plexapp.android') + ` — ${m.title} in Plex`;
    }
    if (m.type === 'show' || m.type === 'season') {
      const leaves = (await plexGet(`/library/metadata/${m.ratingKey}/allLeaves`)).Metadata || [];
      m = leaves.find(e => !e.viewCount) || leaves[0]; if (!m) throw new Error('No episodes');
      m = (await plexGet(`/library/metadata/${m.ratingKey}`)).Metadata[0];
    }
    if (m.type === 'artist' || m.type === 'album' || m.type === 'playlist') {
      const path = m.type === 'playlist' ? `/playlists/${m.ratingKey}/items` : `/library/metadata/${m.ratingKey}/${m.type === 'artist' ? 'allLeaves' : 'children'}`;
      const tracks = ((await plexGet(path)).Metadata || []).filter(x => x.type === 'track').slice(0, 300);
      if (!tracks.length) throw new Error('No tracks');
      const { u, t } = plexServer();
      return M().playQueue(m.title, tracks.map(x => ({ title: `${x.index ? x.index + '. ' : ''}${x.title}`, url: `${u}${x.Media[0].Part[0].key}?X-Plex-Token=${enc(t)}` })));
    }
    if (m.type === 'track') { const { u, t } = plexServer(); return M().playQueue(m.title, [{ title: m.title, url: `${u}${m.Media[0].Part[0].key}?X-Plex-Token=${enc(t)}` }]); }
    if (!m.Media) m = (await plexGet(`/library/metadata/${m.ratingKey}`)).Metadata[0];
    const src = plexStreamUrl(m); if (!src) throw new Error('No playable media');
    M().playVideo(src, plexItem(m).title);
    return `Playing ${plexItem(m).title}${m.viewOffset ? ' from ' + Math.round(m.viewOffset / 60000) + ' min' : ''} on the glasses.`;
  }

  /* ================================================================== fast food & delivery */
  const FASTFOOD = {
    mcdonalds: { name: "McDonald's", pkg: 'com.mcdonalds.app', labels: ["McDonald's", 'McDonalds'], web: 'https://www.mcdonalds.com/us/en-us/mobile-order-and-pay.html' },
    burgerking: { name: 'Burger King', pkg: 'com.emn8.mobilem8.nativeapp.bk', labels: ['Burger King', 'BK'], web: 'https://www.bk.com/' },
    wendys: { name: "Wendy's", pkg: 'com.wendys.nativeapp', labels: ["Wendy's", 'Wendys'], web: 'https://order.wendys.com/' },
    tacobell: { name: 'Taco Bell', pkg: 'com.tacobell.ordering', labels: ['Taco Bell'], web: 'https://www.tacobell.com/food' },
    kfc: { name: 'KFC', labels: ['KFC'], web: 'https://www.kfc.com/menu' },
    subway: { name: 'Subway', pkg: 'com.subway.mobile.subwayapp03', labels: ['Subway'], web: 'https://www.subway.com/en-us/order' },
    chickfila: { name: 'Chick-fil-A', pkg: 'com.chickfila.cfaflagship', labels: ['Chick-fil-A', 'Chickfila'], web: 'https://order.chick-fil-a.com/' },
    dominos: { name: "Domino's", pkg: 'com.dominospizza', labels: ["Domino's", 'Dominos'], web: 'https://www.dominos.com/' },
    pizzahut: { name: 'Pizza Hut', pkg: 'com.yum.pizzahut', labels: ['Pizza Hut'], web: 'https://www.pizzahut.com/' },
    papajohns: { name: "Papa John's", labels: ["Papa John's", 'Papa Johns'], web: 'https://www.papajohns.com/' },
    littlecaesars: { name: 'Little Caesars', labels: ['Little Caesars'], web: 'https://littlecaesars.com/en-us/order/' },
    starbucks: { name: 'Starbucks', pkg: 'com.starbucks.mobilecard', labels: ['Starbucks'], web: 'https://app.starbucks.com/' },
    dunkin: { name: "Dunkin'", labels: ["Dunkin'", 'Dunkin'], web: 'https://www.dunkindonuts.com/en/mobile-app' },
    chipotle: { name: 'Chipotle', pkg: 'com.chipotle.ordering', labels: ['Chipotle'], web: 'https://www.chipotle.com/order' },
    popeyes: { name: 'Popeyes', labels: ['Popeyes'], web: 'https://www.popeyes.com/' },
    wingstop: { name: 'Wingstop', labels: ['Wingstop'], web: 'https://www.wingstop.com/' },
    fiveguys: { name: 'Five Guys', labels: ['Five Guys'], web: 'https://order.fiveguys.com/' },
    panera: { name: 'Panera Bread', labels: ['Panera'], web: 'https://www.panerabread.com/' },
    pandaexpress: { name: 'Panda Express', labels: ['Panda Express'], web: 'https://www.pandaexpress.com/' },
    sonic: { name: 'Sonic Drive-In', labels: ['SONIC', 'Sonic Drive-In'], web: 'https://www.sonicdrivein.com/' },
    arbys: { name: "Arby's", labels: ["Arby's", 'Arbys'], web: 'https://www.arbys.com/' },
    jackinthebox: { name: 'Jack in the Box', labels: ['Jack in the Box'], web: 'https://www.jackinthebox.com/' },
    whataburger: { name: 'Whataburger', labels: ['Whataburger'], web: 'https://whataburger.com/' },
    dairyqueen: { name: 'Dairy Queen', labels: ['Dairy Queen', 'DQ'], web: 'https://www.dairyqueen.com/' },
    shakeshack: { name: 'Shake Shack', labels: ['Shake Shack'], web: 'https://shakeshack.com/' },
    timhortons: { name: 'Tim Hortons', labels: ['Tim Hortons'], web: 'https://www.timhortons.com/' },
  };
  const DELIVERY = {
    doordash: { name: 'DoorDash', pkg: 'com.dd.doordash', labels: ['DoorDash'], search: q => `https://www.doordash.com/search/store/${enc(q)}/`, orders: 'https://www.doordash.com/orders/' },
    ubereats: { name: 'Uber Eats', pkg: 'com.ubercab.eats', labels: ['Uber Eats', 'Postmates'], search: q => `https://www.ubereats.com/search?q=${enc(q)}`, orders: 'https://www.ubereats.com/orders' },
    grubhub: { name: 'Grubhub', pkg: 'com.grubhub.android', labels: ['Grubhub', 'Seamless'], search: q => `https://www.grubhub.com/search?queryText=${enc(q)}`, orders: 'https://www.grubhub.com/account/history' },
    instacart: { name: 'Instacart', pkg: 'com.instacart.client', labels: ['Instacart'], search: q => `https://www.instacart.com/store/s?k=${enc(q)}`, orders: 'https://www.instacart.com/store/account/orders' },
    gopuff: { name: 'Gopuff', labels: ['Gopuff', 'goPuff'], search: q => `https://www.gopuff.com/search?q=${enc(q)}`, orders: 'https://www.gopuff.com/account/orders' },
    walmart: { name: 'Walmart delivery', pkg: WM_PKG, labels: ['Walmart'], search: q => `https://www.walmart.com/search?q=${enc(q)}`, orders: 'https://www.walmart.com/orders' },
    amazon: { name: 'Amazon (Fresh / Whole Foods)', pkg: AMZ_PKG, labels: ['Amazon Shopping'], search: q => `${AMZ()}/s?k=${enc(q)}&i=amazonfresh`, orders: `${AMZ()}/gp/css/order-history` },
    deliveroo: { name: 'Deliveroo', pkg: 'com.deliveroo.orderapp', labels: ['Deliveroo'], search: q => `https://deliveroo.co.uk/search?q=${enc(q)}`, orders: 'https://deliveroo.co.uk/orders' },
    justeat: { name: 'Just Eat', labels: ['Just Eat'], search: q => `https://www.just-eat.co.uk/search?q=${enc(q)}`, orders: 'https://www.just-eat.co.uk/account/orders' },
    wolt: { name: 'Wolt', pkg: 'com.wolt.android', labels: ['Wolt'], search: q => `https://wolt.com/en/search?q=${enc(q)}`, orders: 'https://wolt.com/en/me/order-history' },
    glovo: { name: 'Glovo', labels: ['Glovo'], search: q => `https://glovoapp.com/search?query=${enc(q)}`, orders: 'https://glovoapp.com/orders' },
    lieferando: { name: 'Lieferando', labels: ['Lieferando'], search: q => `https://www.lieferando.de/search?q=${enc(q)}`, orders: 'https://www.lieferando.de/account/orders' },
    swiggy: { name: 'Swiggy', pkg: 'in.swiggy.android', labels: ['Swiggy'], search: q => `https://www.swiggy.com/search?query=${enc(q)}`, orders: 'https://www.swiggy.com/my-account/orders' },
    zomato: { name: 'Zomato', pkg: 'com.application.zomato', labels: ['Zomato'], search: q => `https://www.zomato.com/search?q=${enc(q)}`, orders: 'https://www.zomato.com/orders' },
  };
  const keyOf = (tbl, ref) => { const r = String(ref || '').toLowerCase().replace(/[^a-z0-9]/g, ''); return Object.keys(tbl).find(k => k === r || tbl[k].name.toLowerCase().replace(/[^a-z0-9]/g, '') === r || tbl[k].labels.some(l => l.toLowerCase().replace(/[^a-z0-9]/g, '') === r)) || Object.keys(tbl).find(k => r.length > 2 && (k.includes(r) || r.includes(k))); };
  function installedDelivery() {
    if (!N) return [];
    const apps = parseJSON(N.listApps(), []);
    return Object.entries(DELIVERY).filter(([, d]) => apps.some(a => a.package === d.pkg || d.labels.some(l => a.label.toLowerCase().includes(l.toLowerCase())))).map(([k]) => k);
  }

  /* ================================================================== skills */
  BUILTIN_SKILLS.push(
    /* ---------------- Wake word */
    { name: 'wake_word', group: 'Glasses', description: 'Turn the offline "Hey Nexus" wake word on or off, or get its status.', parameters: P({ action: Str('on | off | status') }, ['action']),
      run: async a => a.action === 'on' ? wakeStart() : a.action === 'off' ? wakeStop() : `Wake word ${N && N.wakeRunning() ? 'listening' : 'off'} · phrase "${wakePhrases()[0]}" · model ${modelName()} ${N && N.wakeModelInstalled(modelName()) ? 'installed' : 'not downloaded'} · commands via ${S.settings.wakeCommandMode === 'vosk' ? 'offline recognizer' : 'system recognizer'}` },

    /* ---------------- Shopping */
    { name: 'shop_search', group: 'Shopping', description: 'Search products and compare prices on Amazon and/or Walmart. Returns titles, prices, ratings, ids and links.', parameters: P({ query: Str('product'), stores: Arr('amazon, walmart (default both)'), limit: Num('per store, default 6') }, ['query']),
      run: async a => {
        const stores = (a.stores && a.stores.length ? a.stores : ['amazon', 'walmart']).map(s => s.toLowerCase());
        const res = await Promise.all(stores.map(s => storeSearch(s, a.query, a.limit || 6).catch(e => ({ store: s, blocked: true, note: e.message }))));
        return res.map(r => `== ${r.store === 'walmart' ? 'Walmart' : 'Amazon'} ==\n` + (r.blocked ? r.note : fmtItems(r.items) || 'no results')).join('\n\n');
      } },
    { name: 'shop_product', group: 'Shopping', description: 'Details of one Amazon (ASIN) or Walmart (item id) product: price, availability, rating, features.', parameters: P({ store: Str('amazon | walmart'), id: Str('ASIN or Walmart item id') }, ['store', 'id']),
      run: async a => { const r = a.store === 'walmart' ? await walmartProduct(a.id) : await amazonProduct(a.id); return r.blocked ? blockedMsg(a.store) : J(r); } },
    { name: 'shop_add_to_cart', group: 'Shopping', risky: true, description: 'Add products to the user\'s Amazon or Walmart cart (opens the store\'s add-to-cart page for them to confirm; never checks out).', parameters: P({ store: Str('amazon | walmart'), items: { type: 'array', items: { type: 'object', properties: { id: Str('ASIN / item id'), qty: Num('quantity') }, required: ['id'] }, description: 'products' } }, ['store', 'items']),
      run: async a => { const url = a.store === 'walmart' ? walmartCartUrl(a.items) : amazonCartUrl(a.items); return `${openIn(url, a.store === 'walmart' ? WM_PKG : AMZ_PKG)}: ${a.items.length} item(s) → ${a.store} cart. The user reviews and checks out in the app.`; } },
    { name: 'shop_open', group: 'Shopping', description: 'Open Amazon or Walmart in its app at a page: search, product, cart, orders (track packages), deals, buy again.', parameters: P({ store: Str('amazon | walmart'), page: Str('search | product | cart | orders | deals | buyagain'), query: Str('for search'), id: Str('for product') }, ['store']),
      run: async a => {
        const wm = a.store === 'walmart', page = a.page || (a.id ? 'product' : a.query ? 'search' : 'home');
        const url = wm ? ({ search: `https://www.walmart.com/search?q=${enc(a.query || '')}`, product: `https://www.walmart.com/ip/${enc(a.id || '')}`, cart: 'https://www.walmart.com/cart', orders: 'https://www.walmart.com/orders', deals: 'https://www.walmart.com/shop/deals', buyagain: 'https://www.walmart.com/my-items' }[page] || 'https://www.walmart.com/')
          : ({ search: `${AMZ()}/s?k=${enc(a.query || '')}`, product: `${AMZ()}/dp/${enc(a.id || '')}`, cart: `${AMZ()}/gp/cart/view.html`, orders: `${AMZ()}/gp/css/order-history`, deals: `${AMZ()}/deals`, buyagain: `${AMZ()}/gp/buyagain` }[page] || AMZ());
        return openIn(url, wm ? WM_PKG : AMZ_PKG) + ' ' + url;
      } },
    { name: 'shopping_list', group: 'Shopping', description: 'Manage the shopping list: add, remove, check (bought), list, clear.', parameters: P({ action: Str('add | remove | check | list | clear'), items: Arr('item names (e.g. "2 milk", "AA batteries")'), store: Str('optional preferred store') }, ['action']),
      run: async a => {
        const L = S.shoppingList, norm = s => String(s).toLowerCase().trim();
        if (a.action === 'add') (a.items || []).forEach(t => { const m = String(t).match(/^(\d+)\s*x?\s+(.*)$/); const item = (m ? m[2] : t).trim(); if (!L.some(x => norm(x.item) === norm(item) && !x.done)) L.push({ item, qty: m ? Number(m[1]) : 1, store: a.store || '', done: false, added: Date.now() }); });
        if (a.action === 'remove') S.shoppingList = L.filter(x => !(a.items || []).some(t => norm(x.item).includes(norm(t))));
        if (a.action === 'check') L.forEach(x => { if ((a.items || []).some(t => norm(x.item).includes(norm(t)))) x.done = true; });
        if (a.action === 'clear') S.shoppingList = L.filter(x => !x.done && a.items && a.items.length);
        save();
        return S.shoppingList.length ? S.shoppingList.map(x => `${x.done ? '☑' : '☐'} ${x.qty > 1 ? x.qty + '× ' : ''}${x.item}${x.store ? ' @' + x.store : ''}`).join('\n') : 'Shopping list is empty.';
      } },
    { name: 'shopping_list_to_cart', group: 'Shopping', risky: true, description: 'Find the open shopping-list items on Amazon or Walmart (best match each) and add them to the cart in one step for the user to review.', parameters: P({ store: Str('amazon | walmart') }, ['store']),
      run: async a => {
        const open = S.shoppingList.filter(x => !x.done); if (!open.length) return 'No open items on the list.';
        const picks = [], misses = [];
        for (const x of open.slice(0, 20)) { const r = await storeSearch(a.store, x.item, 3).catch(() => ({ blocked: true })); if (r.blocked || !r.items.length) misses.push(x.item); else picks.push({ ...r.items[0], qty: x.qty, for: x.item }); }
        if (!picks.length) return (a.store === 'walmart' ? 'Walmart' : 'Amazon') + ' search unavailable right now. Use shop_open search instead.';
        const url = a.store === 'walmart' ? walmartCartUrl(picks) : amazonCartUrl(picks);
        openIn(url, a.store === 'walmart' ? WM_PKG : AMZ_PKG);
        return `Opened ${a.store} cart with:\n` + picks.map(p => `• ${p.for} → ${p.title} (${p.price || '?'})`).join('\n') + (misses.length ? `\nNot found: ${misses.join(', ')}` : '') + '\nThe user reviews and checks out.';
      } },

    /* ---------------- Plex */
    { name: 'plex_search', group: 'Plex', description: 'Search your Plex server (movies, shows, episodes, music, playlists).', parameters: P({ query: Str('title, artist…') }, ['query']),
      run: async a => { const d = await plexGet('/hubs/search', { query: a.query, limit: 8 }); const items = (d.Hub || []).flatMap(h => h.Metadata || []).map(plexItem); return fmtPlex(items) || 'No matches on Plex.'; } },
    { name: 'plex_browse', group: 'Plex', description: 'Browse Plex: libraries, on deck / continue watching, recently added (optionally in one library), or a library\'s contents.', parameters: P({ what: Str('libraries | on_deck | recent | library'), library: Str('library name for recent/library'), limit: Num('default 15') }, ['what']),
      run: async a => {
        if (a.what === 'libraries') return ((await plexGet('/library/sections')).Directory || []).map(d => `• ${d.title} (${d.type}) · id ${d.key}`).join('\n');
        if (a.what === 'on_deck') return fmtPlex(((await plexGet('/library/onDeck')).Metadata || []).slice(0, a.limit || 15).map(plexItem)) || 'Nothing on deck.';
        let section = null;
        if (a.library) { const libs = (await plexGet('/library/sections')).Directory || []; section = libs.find(d => d.title.toLowerCase().includes(a.library.toLowerCase())); if (!section) return 'Libraries: ' + libs.map(d => d.title).join(', '); }
        const path = a.what === 'library' && section ? `/library/sections/${section.key}/all` : section ? `/library/sections/${section.key}/recentlyAdded` : '/library/recentlyAdded';
        const d = await plexGet(path, { 'X-Plex-Container-Start': 0, 'X-Plex-Container-Size': a.limit || 15 });
        return fmtPlex((d.Metadata || []).slice(0, a.limit || 15).map(plexItem)) || 'Empty.';
      } },
    { name: 'plex_details', group: 'Plex', description: 'Details of a Plex item (summary, rating, cast, duration, progress).', parameters: P({ key: Str('item key or title') }, ['key']),
      run: async a => { const m = await plexResolve(a.key); const full = m.Media ? m : (await plexGet(`/library/metadata/${m.ratingKey}`)).Metadata[0]; return J({ ...plexItem(full), summary: clip(full.summary, 800), rating: full.audienceRating || full.rating, contentRating: full.contentRating, genres: (full.Genre || []).map(g => g.tag).join(', '), cast: (full.Role || []).slice(0, 6).map(r => r.tag).join(', '), studio: full.studio, video: full.Media && full.Media[0] ? `${full.Media[0].videoResolution || ''} ${full.Media[0].videoCodec || ''} ${full.Media[0].container || ''}`.trim() : undefined }); } },
    { name: 'plex_play', group: 'Plex', description: 'Play from Plex: on the glasses (movies/episodes stream; shows resume the next unwatched episode; albums/artists/playlists play as a queue) or open it in the Plex app.', parameters: P({ item: Str('key or title (e.g. "The Office", "Abbey Road")'), where: Str('glasses (default) | app') }, ['item']),
      run: async a => plexPlay(a.item, a.where || 'glasses') },
    { name: 'plex_mark', group: 'Plex', description: 'Mark a Plex item watched or unwatched.', parameters: P({ key: Str('item key or title'), watched: Bool('true = watched') }, ['key', 'watched']),
      run: async a => { const m = await plexResolve(a.key); await plexGet(a.watched ? '/:/scrobble' : '/:/unscrobble', { identifier: 'com.plexapp.plugins.library', key: m.ratingKey }).catch(() => null); return `${plexItem(m).title} marked ${a.watched ? 'watched' : 'unwatched'}`; } },

    /* ---------------- Food & delivery */
    { name: 'food_order_app', group: 'Food', description: `Open a fast-food chain's app (or its online ordering site) to order: ${Object.values(FASTFOOD).map(f => f.name).join(', ')}.`, parameters: P({ chain: Str('restaurant chain') }, ['chain']),
      run: async a => { const k = keyOf(FASTFOOD, a.chain); if (!k) return 'Unknown chain. Known: ' + Object.values(FASTFOOD).map(f => f.name).join(', ') + '. For other restaurants use food_delivery.'; const f = FASTFOOD[k]; const app = launchByHint(f.pkg, f.labels); return app ? `Opened the ${app.label} app.` : `${f.name} app not installed — ${openIn(f.web)} ${f.web}`; } },
    { name: 'food_delivery', group: 'Food', description: `Search a food/grocery delivery service for a dish, restaurant or product and open it: ${Object.values(DELIVERY).map(d => d.name).join(', ')}.`, parameters: P({ query: Str('dish, restaurant or product'), service: Str('optional service (default from Settings or the first installed)') }, ['query']),
      run: async a => {
        const k = keyOf(DELIVERY, a.service || S.settings.deliveryService) || installedDelivery()[0] || 'doordash'; const d = DELIVERY[k];
        return `${d.name}: ${openIn(d.search(a.query), d.pkg)} (${d.search(a.query)})`;
      } },
    { name: 'food_orders', group: 'Food', description: 'Open order history / live order tracking for a delivery service or store.', parameters: P({ service: Str('service name') }, ['service']),
      run: async a => { const k = keyOf(DELIVERY, a.service); if (!k) return 'Unknown service'; const d = DELIVERY[k]; return `${d.name}: ${openIn(d.orders, d.pkg)}`; } },
    { name: 'food_nearby', group: 'Food', description: 'Find nearby restaurants (a chain like "Chipotle" or a cuisine like "sushi") with distance and map links.', parameters: P({ query: Str('chain or cuisine'), near: Str('place, or "here" (default)') }, ['query']),
      run: async (a, ctx) => {
        const here = await currentLocation().catch(() => null);
        const res = await execSkill('apple_maps_search', { query: a.query, near: a.near || (here ? `${here.lat},${here.lon}` : undefined), limit: 8 }, ctx);
        if (/^Unknown or disabled/.test(res)) return res;
        if (!here) return res;
        const dist = (la, lo) => { const R = 6371, dLa = (la - here.lat) * Math.PI / 180, dLo = (lo - here.lon) * Math.PI / 180; const h = Math.sin(dLa / 2) ** 2 + Math.cos(here.lat * Math.PI / 180) * Math.cos(la * Math.PI / 180) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
        const m = res.match(/^([^\n]*)\n([\s\S]*)$/); const list = m ? parseJSON(m[2], null) : null;
        if (!Array.isArray(list)) return res;
        return m[1] + '\n' + list.map(x => ({ ...x, distance_km: Math.round(dist(x.lat, x.lon) * 10) / 10 })).sort((x, y) => x.distance_km - y.distance_km).map(x => `• ${x.name} — ${x.distance_km} km · ${x.address}\n  ${x.apple_maps}`).join('\n');
      } },
    { name: 'delivery_services', group: 'Food', description: 'List which food/grocery delivery and fast-food apps are installed on this device.', parameters: P({}),
      run: async () => { const apps = N ? parseJSON(N.listApps(), []) : []; const has = tbl => Object.values(tbl).filter(d => apps.some(a => a.package === d.pkg || d.labels.some(l => a.label.toLowerCase().includes(l.toLowerCase())))).map(d => d.name); return `Delivery: ${has(DELIVERY).join(', ') || 'none installed'}\nFast food: ${has(FASTFOOD).join(', ') || 'none installed'}\n(Websites work for everything else.)`; } },
  );

  /* ================================================================== settings */
  const coreRenderPro = renderProSettings, coreBindPro = bindProSettings;
  renderProSettings = () => coreRenderPro() + renderShopSettings();
  bindProSettings = v => { coreBindPro(v); bindShopSettings(v); };
  function renderShopSettings() {
    const st = S.settings; const running = N && N.wakeRunning && N.wakeRunning();
    return `<div class="card" id="shopCard"><h3>"Hey Nexus" wake word</h3>
      <p class="hint">Offline and private (Vosk): audio is processed on the device. Downloads a ~40 MB speech model once. Works with the screen off; a small notification shows while listening.</p>
      <div class="row"><button class="${running ? 'danger' : 'primary'} nogrow" id="wkToggle">${running ? 'Turn off' : 'Turn on'}</button><span class="hint">${running ? '● listening for "' + esc(wakePhrases()[0]) + '"' : 'off'}${N && N.wakeModelInstalled && N.wakeModelInstalled(modelName()) ? ' · model ready' : ''}</span></div>
      <div class="row"><div><label>Model language</label><select data-k="wakeLang">${Object.keys(VOSK).map(k => `<option value="${k}">${k}</option>`).join('')}</select></div>
      <div><label>Custom wake phrase (optional)</label><input data-k="wakeCustom" placeholder="hey nexus"></div>
      <div><label>After the wake word</label><select data-k="wakeCommandMode"><option value="vosk">Transcribe offline (private)</option><option value="system">System speech recognizer (more accurate)</option></select></div></div>
      <label class="inline"><input type="checkbox" data-k="wakeSpeak" data-t="bool">Speak the answer to wake-word requests</label>
      <div class="row"><button class="nogrow" id="wkOverlay">${N && N.canDrawOverlays && N.canDrawOverlays() ? 'Can open from background ✓' : 'Allow opening from background'}</button></div>
      <h3 style="margin-top:.8em">Shopping, food &amp; Plex</h3>
      <div class="row"><div><label>Amazon store</label><select data-k="amazonDomain">${['amazon.com', 'amazon.ca', 'amazon.co.uk', 'amazon.de', 'amazon.fr', 'amazon.it', 'amazon.es', 'amazon.com.au', 'amazon.co.jp', 'amazon.in', 'amazon.com.mx', 'amazon.nl'].map(d => `<option>${d}</option>`).join('')}</select></div>
      <div><label>Default delivery service</label><select data-k="deliveryService"><option value="">(first installed)</option>${Object.entries(DELIVERY).map(([k, d]) => `<option value="${k}">${esc(d.name)}</option>`).join('')}</select></div></div>
      <div class="row"><button class="primary nogrow" id="pxSign">${getKey('svc_plex') ? 'Re-connect Plex' : 'Sign in with Plex'}</button><span class="hint">${st.plexServerName ? 'Server: ' + esc(st.plexServerName) : 'Not connected'}</span></div>
      <div class="row"><div><label>Or: Plex server URL</label><input data-k="plexServerUrl" placeholder="http://192.168.1.20:32400"></div><div><label>Plex token</label><input type="password" data-secret="svc_plex_server" placeholder="${getKey('svc_plex_server') ? 'saved ✓' : ''}"></div>
      <div><label>Plex video</label><select data-k="plexVideo"><option value="transcode">Transcode (plays anything)</option><option value="direct">Direct play (original file)</option></select></div></div>
    </div>`;
  }
  function bindShopSettings(v) {
    const card = $('#shopCard', v); if (!card) return;
    bind(card, S.settings, k => { if (['wakeLang', 'wakeCustom', 'wakeCommandMode'].includes(k) && N && N.wakeRunning()) { N.wakeStop(); setTimeout(() => wakeStart().then(toast).catch(e => toast(e.message)), 400); } });
    $$('[data-secret]', card).forEach(el => el.addEventListener('change', () => { setKey(el.dataset.secret, el.value); el.value = ''; el.placeholder = 'saved ✓'; toast('Saved on device'); }));
    $('#wkToggle', card).onclick = async () => { try { toast(N && N.wakeRunning() ? wakeStop() : await wakeStart()); } catch (e) { toast(e.message); } renderSettings(); };
    $('#wkOverlay', card).onclick = () => N && N.requestOverlay();
    $('#pxSign', card).onclick = async () => { try { toast(await plexSignIn()); } catch (e) { toast(e.message); } renderSettings(); };
  }
  { const coreSecrets = secretIds; secretIds = () => [...coreSecrets(), { id: 'svc_plex_server', name: 'Plex token' }]; }

  window.NexusShop = { amazonSearch, walmartSearch, amazonProduct, walmartProduct, plexDiscover, plexPlay, plexGet, wakeStart, wakeStop, wakePhrases, handleWakeCommand, keyOf, FASTFOOD, DELIVERY };
})();
