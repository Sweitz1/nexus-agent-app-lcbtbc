/* Halo: community apps for the RayNeo X3 Pro. Lists X3 Pro projects on GitHub with author,
 * stars and license, and installs an app's own released APK straight from its author's GitHub
 * Releases (Android asks to confirm). Halo doesn't host, copy or check these apps.
 * Loaded after skills-bluetooth.js. */
'use strict';
(() => {
  const P = (props, req = []) => ({ type: 'object', properties: props, required: req });
  const Str = d => ({ type: 'string', description: d });
  const J = o => JSON.stringify(o, null, 1);
  const QUERIES = ['rayneo x3', 'x3 pro rayneo', 'RayNeoX3', 'rayneo-x3'];
  const PERMISSIVE = /^(MIT|Apache-2\.0|BSD-[23]-Clause|ISC|Unlicense|0BSD|MPL-2\.0)$/;
  const CACHE = 'halo_community_cache';

  const gh = async (path) => {
    const h = { Accept: 'application/vnd.github+json', 'User-Agent': 'Halo' };
    const t = getKey('svc_github'); if (t) h.Authorization = 'Bearer ' + t;
    const r = await http('GET', 'https://api.github.com' + path, h, null, 30000);
    if (r.status === 403 || r.status === 429) throw new Error('GitHub rate limit reached. Try again in a minute, or add a GitHub token in Developer services.');
    if (r.status >= 400) throw new Error('GitHub ' + r.status);
    return parseJSON(r.body, {});
  };
  const licenseKind = id => !id || id === 'NOASSERTION' || id === 'NONE' ? 'none' : PERMISSIVE.test(id) ? 'permissive' : /GPL/.test(id) ? 'copyleft' : 'other';

  const COM = {
    cached() { const c = parseJSON(localStorage.getItem(CACHE), null); return c && Date.now() - c.at < 6 * 3600e3 ? c.apps : null; },
    async list(force = false) {
      if (!force) { const c = COM.cached(); if (c) return c; }
      const seen = new Map();
      for (const q of QUERIES) {
        const d = await gh('/search/repositories?per_page=100&q=' + encodeURIComponent(q));
        for (const r of d.items || []) {
          const text = `${r.name} ${r.description || ''} ${(r.topics || []).join(' ')}`;
          if (!/x3/i.test(text) || seen.has(r.full_name)) continue;   // X3 Pro only (not Air / iO / X2)
          seen.set(r.full_name, { repo: r.full_name, name: r.name, owner: r.owner && r.owner.login, description: r.description || '', stars: r.stargazers_count || 0,
            language: r.language || '', license: (r.license && r.license.spdx_id) || 'NONE', updated: r.pushed_at, url: r.html_url });
        }
      }
      const apps = [...seen.values()].sort((a, b) => b.stars - a.stars || String(b.updated).localeCompare(String(a.updated)));
      try { localStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), apps })); } catch {}
      return apps;
    },
    async release(repo) {
      const r = await gh(`/repos/${repo}/releases/latest`).catch(() => null);
      if (!r || !r.assets) return { version: null, apks: [] };
      return { version: r.tag_name || r.name, published: r.published_at, apks: r.assets.filter(a => /\.apk$/i.test(a.name)).map(a => ({ name: a.name, size: a.size, url: a.browser_download_url })) };
    },
    async install(repo, assetName) {
      needNative('Installing apps');
      const rel = await COM.release(repo);
      const apk = rel.apks.find(a => !assetName || a.name === assetName) || rel.apks[0];
      if (!apk) throw new Error(`${repo} has no APK in its latest GitHub release.`);
      const path = 'downloads/community/' + apk.name.replace(/[^\w.-]/g, '_');
      toast(`Downloading ${apk.name}…`);
      await nativeAsync('download', JSON.stringify({ url: apk.url, path }));
      const r = await nativeAsync('apk', JSON.stringify({ op: 'install', path }));
      return { repo, version: rel.version, file: apk.name, result: r && r.result };
    },
  };
  window.HaloCommunity = COM;

  BUILTIN_SKILLS.push(
    { name: 'community_apps', group: 'Community', description: 'List community apps for the RayNeo X3 Pro on GitHub (author, stars, license). Optional keyword filter.', parameters: P({ query: Str('optional keyword, e.g. "browser", "game", "bluetooth"') }),
      run: async a => { const q = String(a.query || '').toLowerCase(); const apps = (await COM.list()).filter(x => !q || `${x.name} ${x.description}`.toLowerCase().includes(q));
        return J({ apps: apps.slice(0, 25).map(x => ({ repo: x.repo, description: x.description, stars: x.stars, license: x.license })), total: apps.length }); } },
    { name: 'community_install', group: 'Community', risky: true, description: 'Download and install a community app\'s APK from its author\'s latest GitHub release (owner/repo from community_apps). Android asks the user to confirm.', parameters: P({ repo: Str('owner/repo') }, ['repo']),
      run: async a => J(await COM.install(String(a.repo).trim())) },
  );

  /* ---------------------------------------------------------------- Apps tab */
  const tabBtn = document.createElement('button'); tabBtn.dataset.tab = 'community'; tabBtn.textContent = 'Apps'; tabBtn.onclick = () => showTab('community');
  ($('#tabs [data-tab=media]') || $('#tabs [data-tab=files]')).after(tabBtn);
  const sec = document.createElement('section'); sec.id = 'view-community'; sec.className = 'view'; $('main').appendChild(sec);
  extraTabs.community = render;
  let filter = '', apps = null, busy = false;
  const pill = l => { const k = licenseKind(l); return `<span style="flex:none;min-width:0" class="pill ${k === 'permissive' ? 'local' : k === 'copyleft' ? 'risky' : ''}" title="${k === 'none' ? 'No license: the author\'s own release can be installed, but its code can\'t be copied' : esc(l)}">${k === 'none' ? 'no license' : esc(l)}</span>`; };
  async function render(force) {
    const v = $('#view-community'); if (!v) return;
    v.innerHTML = `<h2>Community apps</h2><p class="hint">X3 Pro apps by the community on GitHub. <b>Install</b> downloads the author's own released APK from their GitHub page. Halo doesn't host or check these apps, so only install ones you trust.</p>
      <div class="row"><input id="caQ" placeholder="Filter: browser, game, bluetooth, video…" value="${esc(filter)}"><button class="nogrow" id="caRefresh">Refresh</button></div>
      <div id="caList" class="hint">${busy ? 'Loading…' : ''}</div>`;
    $('#caQ').oninput = e => { filter = e.target.value; draw(); };
    $('#caRefresh').onclick = () => load(true);
    if (!apps || force) await load(force); else draw();
  }
  async function load(force) {
    busy = true; const L = $('#caList'); if (L) L.textContent = 'Loading from GitHub…';
    try { apps = await COM.list(force); } catch (e) { if (L) L.textContent = e.message; busy = false; return; }
    busy = false; draw();
  }
  function draw() {
    const L = $('#caList'); if (!L || !apps) return;
    const q = filter.toLowerCase(); const list = apps.filter(a => !q || `${a.name} ${a.description} ${a.owner}`.toLowerCase().includes(q));
    L.innerHTML = `<div class="hint">${list.length} of ${apps.length} apps</div>` + list.map(a => `<div class="card" data-repo="${esc(a.repo)}">
      <h3><span>${esc(a.name)} <span class="hint">by ${esc(a.owner)}</span></span><span class="hint">★ ${a.stars}</span></h3>
      <div class="hint">${esc(a.description)}</div>
      <div class="row" style="margin-top:.3em">${pill(a.license)}${a.language ? `<span class="pill" style="flex:none;min-width:0">${esc(a.language)}</span>` : ''}<span class="hint" style="flex:1;min-width:0" data-rel></span>
        <button class="small nogrow" data-check>Install…</button><button class="small nogrow" data-open>GitHub</button></div></div>`).join('');
    $$('[data-repo]', L).forEach(card => {
      const repo = card.dataset.repo;
      $('[data-open]', card).onclick = () => N ? N.openUrl('https://github.com/' + repo) : window.open('https://github.com/' + repo);
      $('[data-check]', card).onclick = async (e) => {
        const btn = e.target, rel = $('[data-rel]', card); btn.disabled = true; rel.textContent = 'Checking release…';
        try {
          const r = await COM.release(repo);
          if (!r.apks.length) { rel.textContent = 'No APK released yet'; btn.disabled = false; return; }
          rel.textContent = `${r.version || ''} · ${r.apks.map(x => x.name).join(', ')}`;
          if (!(await confirmBox(`Install <b>${esc(repo)}</b> ${esc(r.version || '')}?<p class="hint">Downloads <code>${esc(r.apks[0].name)}</code> (${Math.round(r.apks[0].size / 1048576)} MB) from the author's GitHub release, then Android asks you to confirm.${N && N.isX3 && N.isX3() ? ' If the install prompt doesn\'t appear on the glasses, install it from a computer with <code>adb install -r -g</code>.' : ''}</p>`))) { btn.disabled = false; return; }
          const out = await COM.install(repo, r.apks[0].name); toast(out.result || 'Installer opened'); rel.textContent = 'Installer opened';
        } catch (err) { rel.textContent = err.message; }
        btn.disabled = false;
      };
    });
  }
})();
