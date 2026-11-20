/* Nexus Agent — accessibility screen control: agents read and operate other apps
 * (tap, type, scroll, swipe, navigate, screenshot). Loaded after skills-shop.js. */
'use strict';
(() => {
  const P = (props, req = []) => ({ type: 'object', properties: props, required: req });
  const Str = d => ({ type: 'string', description: d });
  const Num = d => ({ type: 'number', description: d });
  const Bool = d => ({ type: 'boolean', description: d });

  const DEFAULT_BLOCK = 'bank|wallet|paypal|venmo|squareup\\.cash|coinbase|binance|kraken|robinhood|chase|wellsfargo|bankofamerica|citi|capitalone|amex|bitwarden|lastpass|onepassword|1password|dashlane|keepass|authenticator|authy|\\.otp';
  S.settings = { screenBlocklist: DEFAULT_BLOCK, screenMaxSteps: 40, screenReturn: true, ...S.settings };
  if (N && N.screenBlocklist) N.screenBlocklist(S.settings.screenBlocklist);

  // Buttons that spend money, send things or destroy data always need the user's OK.
  const SENSITIVE = /\b(place (your )?order|order now|complete (order|purchase)|submit order|pay( now)?|buy( now)?|purchase|check ?out|confirm( (order|payment|purchase))?|send( money)?|transfer|tip|donate|subscribe|start (free )?trial|book( now)?|reserve|delete|remove account|cancel (order|subscription)|sign out|log ?out|post|publish|share)\b/i;
  const CARD = /\b(?:\d[ -]?){13,19}\b/;

  const consented = new Set();   // `${runToken}:${package}`
  let pillTimer = null;
  const pillOn = () => { if (!N || !N.screenIndicator) return; N.screenIndicator('🤖 Nexus is controlling — tap to stop'); clearTimeout(pillTimer); pillTimer = setTimeout(() => N.screenIndicator(''), 6000); };
  onNative('screen', e => { if (e.type === 'stop') { stopRun(); speak('Stopped.'); toast('Screen control stopped'); } });

  function need() {
    needNative('Screen control');
    if (!N.screenEnabled()) throw new Error('Screen control is off. Ask the user to enable "Nexus Agent screen control" in Android Settings → Accessibility (or Settings → Screen control → Enable).');
  }
  const sc = (op, extra = {}) => nativeAsync('screen', JSON.stringify({ op, ...extra }));

  /** Shows a confirmation in front of the user even while another app is on screen. */
  async function confirmOnTop(html, pkg) {
    const away = pkg && N.screenEnabled();
    if (away) { N.bringToFront(); await sleep(700); }
    speak(plain(html.replace(/<[^>]+>/g, ' ')).slice(0, 200));
    const ok = await confirmBox(html, 90000);
    if (away) { N.launchApp(pkg); await sleep(1200); }
    return ok;
  }
  async function ensureConsent(ctx, pkg, nexusInFront) {
    const key = `${ctx.token}:${pkg}`;
    if (consented.has(key) || ctx.origin === 'ui') return;
    const ask = nexusInFront ? (h => { speak(plain(h.replace(/<[^>]+>/g, ' ')).slice(0, 200)); return confirmBox(h, 90000); }) : (h => confirmOnTop(h, pkg));
    const ok = await ask(`<b>${esc(ctx.agent.name)}</b> wants to control <b>${esc(pkg)}</b> on your screen for this task (tap, type, scroll).<p class="hint">You'll still be asked before anything is bought, paid, sent or deleted. Tap the floating pill to stop at any time.</p>`, pkg);
    if (!ok) throw new Error('The user did not allow screen control for ' + pkg);
    consented.add(key);
  }

  function fmt(snap) {
    const lines = snap.elements.map(e => {
      const what = [e.text && `"${e.text}"`, e.desc && `(${e.desc})`, e.hint && `hint:"${e.hint}"`].filter(Boolean).join(' ') || (e.res ? `[${e.res}]` : '');
      return `#${e.id} ${e.type}${what ? ' ' + what : ''}${e.can ? ' {' + e.can + '}' : ''}${!e.text && !e.desc ? ` @${e.x},${e.y}` : ''}`;
    });
    return `App: ${snap.package}${snap.activity ? ' · ' + snap.activity.replace(/^.*\./, '') : ''} · screen ${snap.screen} · ${snap.elements.length} elements\n${lines.join('\n')}`;
  }
  let last = null;
  async function read(max = 150) { last = await sc('read', { max }); return last; }
  async function afterAction(result) {
    let snap; try { snap = await read(); } catch (e) { return `${result}\n(screen not readable now: ${e.message})`; }
    return `${result}\n\n${fmt(snap)}`;
  }
  function findEl(text, pref) {
    if (!last) throw new Error('Call screen_read first');
    const t = String(text).toLowerCase();
    const els = last.elements.filter(e => [e.text, e.desc, e.hint, e.res].some(v => v && v.toLowerCase().includes(t)));
    return (pref && els.find(e => (e.can || '').includes(pref))) || els[0];
  }
  async function guardTap(id, ctx) {
    const el = last && last.elements.find(e => e.id === id);
    const own = [el && el.text, el && el.desc].filter(Boolean).join(' ');
    const nat = ((await sc('label', { id }).catch(() => ({}))).label || '').trim();
    const label = nat && nat.includes(own) ? nat : [own, nat].filter(Boolean).join(' · ');
    if (SENSITIVE.test(label)) {
      const ok = await confirmOnTop(`⚠️ <b>${esc(ctx.agent.name)}</b> wants to tap <b>"${esc(clip(label, 120))}"</b> in ${esc(last ? last.package : 'the app')}.<p>This may place an order, pay, send or delete something. Allow?</p>`, last && last.package);
      if (!ok) return 'The user declined this tap. Do not retry it; tell the user what is ready for them to finish.';
    }
    return null;
  }

  BUILTIN_SKILLS.push(
    { name: 'screen_read', group: 'Screen', description: 'Read the screen of the app in front (UI elements with #ids, text, and what you can do with them). Workflow: screen_open_app → screen_read → screen_tap / screen_type / screen_scroll (each returns the new screen) → repeat. Purchases, payments, sending and deleting always need the user\'s confirmation (handled automatically); stop at the final confirmation step if the user has not asked you to complete it.', parameters: P({ max: Num('max elements, default 150') }),
      run: async (a, ctx) => { need(); pillOn(); const s = await read(a.max || 150); await ensureConsent(ctx, s.package); return fmt(s); } },
    { name: 'screen_open_app', group: 'Screen', description: 'Open an app by name or package for screen control and return its first screen.', parameters: P({ app: Str('app name or package') }, ['app']),
      run: async (a, ctx) => {
        need();
        const apps = parseJSON(N.listApps(), []); const q = String(a.app).toLowerCase();
        const hit = apps.find(x => x.package.toLowerCase() === q) || apps.find(x => x.label.toLowerCase() === q) || apps.find(x => x.label.toLowerCase().includes(q));
        if (!hit) return 'App not installed. Installed: ' + apps.map(x => x.label).join(', ');
        await ensureConsent(ctx, hit.package, true);
        pillOn(); N.launchApp(hit.package); await sleep(2200);
        return afterAction(`Opened ${hit.label}`);
      } },
    { name: 'screen_tap', group: 'Screen', description: 'Tap an element by #id (from the last screen read), by visible text, or at x,y coordinates. long=true for a long press.', parameters: P({ id: Num('element id'), text: Str('or visible text/label to tap'), x: Num('or screen x'), y: Num('and y'), long: Bool('long press') }),
      run: async (a, ctx) => {
        need(); pillOn();
        if (a.x != null && a.y != null && a.id == null && !a.text) { const s = await read(); await ensureConsent(ctx, s.package); return afterAction((await sc('tap', { x: Math.round(a.x), y: Math.round(a.y) })).result); }
        if (!last) await read();
        await ensureConsent(ctx, last.package);
        const el = a.id != null ? last.elements.find(e => e.id === a.id) : findEl(a.text, 'click');
        if (!el) return `No element ${a.id != null ? '#' + a.id : 'matching "' + a.text + '"'} — read the screen again.`;
        const blockedMsg = await guardTap(el.id, ctx); if (blockedMsg) return blockedMsg;
        return afterAction((await sc(a.long ? 'longclick' : 'click', { id: el.id })).result);
      } },
    { name: 'screen_type', group: 'Screen', description: 'Type text into a text field (#id or the field\'s label/hint). submit=true presses the keyboard\'s enter/search key. Never used for passwords or card numbers.', parameters: P({ id: Num('field id'), field: Str('or field label/hint text'), text: Str('text to enter'), append: Bool('append instead of replacing'), submit: Bool('press enter/search after typing') }, ['text']),
      run: async (a, ctx) => {
        need(); pillOn();
        if (CARD.test(String(a.text).replace(/\s/g, ' '))) return 'Refused: this looks like a card number. The user must enter payment details themselves.';
        if (!last) await read();
        await ensureConsent(ctx, last.package);
        const el = a.id != null ? last.elements.find(e => e.id === a.id) : (a.field ? findEl(a.field, 'edit') : last.elements.find(e => (e.can || '').includes('edit')));
        if (!el) return 'No text field found — read the screen again.';
        let r = (await sc('type', { id: el.id, text: a.text, append: !!a.append })).result;
        if (a.submit) r += '; ' + (await sc('submit', { id: el.id })).result;
        return afterAction(r);
      } },
    { name: 'screen_scroll', group: 'Screen', description: 'Scroll the screen (or a specific scrollable #id) down, up, left or right to reveal more items.', parameters: P({ direction: Str('down | up | left | right'), id: Num('optional scrollable element') }),
      run: async (a, ctx) => { need(); pillOn(); if (!last) await read(); await ensureConsent(ctx, last.package); return afterAction((await sc('scroll', { id: a.id || 0, direction: a.direction || 'down' })).result); } },
    { name: 'screen_swipe', group: 'Screen', description: 'Swipe between two screen points (custom gestures, sliders, carousels).', parameters: P({ x1: Num(''), y1: Num(''), x2: Num(''), y2: Num(''), ms: Num('duration, default 300') }, ['x1', 'y1', 'x2', 'y2']),
      run: async (a, ctx) => { need(); pillOn(); if (!last) await read(); await ensureConsent(ctx, last.package); return afterAction((await sc('swipe', { x1: Math.round(a.x1), y1: Math.round(a.y1), x2: Math.round(a.x2), y2: Math.round(a.y2), ms: a.ms || 300 })).result); } },
    { name: 'screen_nav', group: 'Screen', description: 'System navigation: back, home, recents, notifications, quick_settings.', parameters: P({ action: Str('back | home | recents | notifications | quick_settings') }, ['action']),
      run: async a => { need(); pillOn(); return afterAction((await sc('global', { action: a.action })).result); } },
    { name: 'screen_wait', group: 'Screen', description: 'Wait for something to appear on screen (e.g. a loading screen to finish), up to N seconds.', parameters: P({ text: Str('text to wait for (optional)'), seconds: Num('max wait, default 8') }),
      run: async a => {
        need(); const until = Date.now() + Math.min(60, a.seconds || 8) * 1000;
        while (Date.now() < until) { const s = await read().catch(() => null); if (s && (!a.text || s.elements.some(e => [e.text, e.desc].some(v => v && v.toLowerCase().includes(a.text.toLowerCase()))))) return (a.text ? `"${a.text}" is on screen.\n\n` : '') + fmt(s); await sleep(1000); }
        return `Timed out waiting${a.text ? ' for "' + a.text + '"' : ''}.` + (last ? '\n\n' + fmt(last) : '');
      } },
    { name: 'screen_screenshot', group: 'Screen', description: 'Screenshot the screen (Android 11+). With a question, the vision model looks at it — useful when an app (games, maps, video, web views) does not expose readable elements.', parameters: P({ question: Str('optional: what to look for') }),
      run: async (a, ctx) => { need(); const r = await sc('screenshot', {}); return a.question ? `${r.path}\n` + await visionAsk([r.path], a.question + ' (This is a phone/glasses screenshot; describe positions as approximate x,y in pixels if relevant.)', ctx) : 'saved ' + r.path; } },
    { name: 'screen_return', group: 'Screen', description: 'Finish screen control and bring Nexus back to the front.', parameters: P({}),
      run: async () => { if (N && N.screenIndicator) N.screenIndicator(''); if (N) N.bringToFront(); last = null; return 'Back in Nexus.'; } },
  );

  // Screen tasks take many small steps; finishing a run hides the pill and optionally returns.
  {
    const coreDispatch = dispatch;
    dispatch = async (...args) => {
      try { return await coreDispatch(...args); }
      finally {
        if (last && N && N.screenIndicator) { N.screenIndicator(''); if (S.settings.screenReturn && N.screenEnabled()) N.bringToFront(); }
        last = null;
      }
    };
  }

  /* ---------------------------------------------------------------- settings */
  const coreRenderPro = renderProSettings, coreBindPro = bindProSettings;
  renderProSettings = () => coreRenderPro() + `<div class="card" id="screenCard"><h3>Screen control (accessibility)</h3>
    <p class="hint">Lets agents operate other apps for you — e.g. "reorder my usual from DoorDash", "turn on dark mode in Spotify". Nothing happens unless you ask; a floating pill shows while it works (tap it to stop). Password fields are never read or typed, and buying, paying, sending or deleting always asks you first.</p>
    <div class="row"><button class="${N && N.screenEnabled && N.screenEnabled() ? '' : 'primary'} nogrow" id="scEnable">${N && N.screenEnabled && N.screenEnabled() ? 'Enabled ✓ (open settings)' : 'Enable in Accessibility settings'}</button></div>
    <div class="row"><div><label>Max steps for screen tasks</label><input data-k="screenMaxSteps" data-t="num" type="number" min="10" max="100"></div>
    <label class="inline nogrow"><input type="checkbox" data-k="screenReturn" data-t="bool">Return to Nexus when done</label></div>
    <label>Blocked apps (package name pattern — banking, wallets, password managers)</label><textarea data-k="screenBlocklist" rows="2"></textarea>
    <div class="row"><button class="small nogrow" id="scReset">Reset block list</button></div></div>`;
  bindProSettings = v => {
    coreBindPro(v);
    const card = $('#screenCard', v); if (!card) return;
    bind(card, S.settings, k => { if (k === 'screenBlocklist' && N && N.screenBlocklist) N.screenBlocklist(S.settings.screenBlocklist); });
    $('#scEnable', card).onclick = () => N && N.screenOpenSettings();
    $('#scReset', card).onclick = () => { S.settings.screenBlocklist = DEFAULT_BLOCK; save(); if (N && N.screenBlocklist) N.screenBlocklist(DEFAULT_BLOCK); renderSettings(); };
  };

  window.NexusScreen = { fmt, SENSITIVE, CARD };
})();
