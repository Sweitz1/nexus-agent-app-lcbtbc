/* Nexus Agent — APK services & app integrations, web scraping, download services, coding &
 * build services (Python, code runner, web preview, project templates, APK builds) and GitHub.
 * Loaded after skills-google.js. */
'use strict';
(() => {
  const P = (props, req = []) => ({ type: 'object', properties: props, required: req });
  const Str = d => ({ type: 'string', description: d });
  const Num = d => ({ type: 'number', description: d });
  const Bool = d => ({ type: 'boolean', description: d });
  const Arr = (d, items = { type: 'string' }) => ({ type: 'array', items, description: d });
  const J = o => JSON.stringify(o, null, 1);
  const enc = encodeURIComponent;
  S.settings = { scrapeRespectRobots: true, codeRunnerUrl: '', ...S.settings };
  S.watches = S.watches || [];

  /* ================================================================== APK services & app integrations */
  const apk = (op, extra = {}) => { needNative('APK services'); return nativeAsync('apk', JSON.stringify({ op, ...extra })); };
  async function resolvePkg(app) {
    if (/^[a-z][\w]*(\.[\w]+)+$/i.test(app)) return app;
    const list = await apk('list', { system: true, filter: '' });
    const q = String(app).toLowerCase();
    const hit = list.find(x => x.label.toLowerCase() === q) || list.find(x => x.label.toLowerCase().includes(q)) || list.find(x => x.package.toLowerCase().includes(q));
    if (!hit) throw new Error(`App "${app}" not found`); return hit.package;
  }
  // Custom skills of kind "intent": apps turned into reusable agent skills.
  {
    const coreDefs = customSkillDefs;
    customSkillDefs = () => [...coreDefs(), ...S.customSkills.filter(s => s.kind === 'intent').map(s => ({
      name: s.name, group: 'App integrations', risky: !!s.confirm, description: s.description,
      parameters: P({ input: Str(s.inputHint || 'text to pass to the app') }, ['input']),
      run: async a => {
        needNative('App integrations');
        const v = String(a.input || '');
        const fill = t => String(t || '').replace(/\{\{\s*input\s*\}\}/g, enc(v)).replace(/\{\{\s*raw\s*\}\}/g, v);
        if (s.mode === 'share') return N.startIntent(JSON.stringify({ action: 'android.intent.action.SEND', type: 'text/plain', package: s.package, extras: { 'android.intent.extra.TEXT': v } })) === 'ok' ? `Shared to ${s.appLabel || s.package}` : 'Could not share';
        if (s.mode === 'text') return N.startIntent(JSON.stringify({ action: 'android.intent.action.PROCESS_TEXT', type: 'text/plain', package: s.package, extras: { 'android.intent.extra.PROCESS_TEXT': v, 'android.intent.extra.PROCESS_TEXT_READONLY': true } })) === 'ok' ? `Sent to ${s.appLabel || s.package}` : 'Could not open';
        const r = N.startIntent(JSON.stringify({ action: s.action || 'android.intent.action.VIEW', data: fill(s.template), package: s.package }));
        return r === 'ok' ? `Opened ${s.appLabel || s.package}: ${fill(s.template)}` : r;
      },
    }))];
  }

  /* ================================================================== scraping */
  const UA = () => navigator.userAgent.replace(/; wv\)/, ')').replace(/ Version\/[\d.]+/, '');
  const robotsCache = {};
  async function robotsAllowed(url) {
    if (!S.settings.scrapeRespectRobots) return true;
    const u = new URL(url); const key = u.origin;
    if (!(key in robotsCache)) {
      const r = await http('GET', key + '/robots.txt', { 'User-Agent': UA() }, null, 10000).catch(() => null);
      const rules = []; let applies = false;
      for (const line of (r && r.status < 400 ? r.body : '').split(/\r?\n/)) {
        const m = line.replace(/#.*/, '').trim().match(/^([\w-]+)\s*:\s*(.*)$/); if (!m) continue;
        const k = m[1].toLowerCase(), v = m[2].trim();
        if (k === 'user-agent') applies = v === '*' || /nexus/i.test(v);
        else if (applies && k === 'disallow' && v) rules.push({ allow: false, p: v });
        else if (applies && k === 'allow' && v) rules.push({ allow: true, p: v });
      }
      robotsCache[key] = rules;
    }
    const path = u.pathname + u.search; let best = null;
    for (const r of robotsCache[key]) { const re = new RegExp('^' + r.p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')); if (re.test(path) && (!best || r.p.length > best.p.length)) best = r; }
    return !best || best.allow;
  }
  async function getDoc(url, render) {
    if (!/^https?:\/\//i.test(url)) throw new Error('http(s) URL required');
    if (!(await robotsAllowed(url))) throw new Error(`robots.txt of ${new URL(url).host} disallows this page (you can change this in Settings → Developer)`);
    let html, finalUrl = url, title = '';
    if (render) { needNative('Rendered scraping'); const r = await nativeAsync('renderPage', url, 3000); html = r.html; finalUrl = r.url || url; title = r.title; }
    else { const r = await http('GET', url, { 'User-Agent': UA(), Accept: 'text/html,application/xhtml+xml,*/*', 'Accept-Language': navigator.language || 'en' }, null, 30000); if (r.status >= 400) throw new Error(`HTTP ${r.status} for ${url}`); html = r.body; }
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const b = doc.createElement('base'); b.href = finalUrl; doc.head.prepend(b);
    return { doc, url: finalUrl, title: title || doc.title };
  }
  const abs = (doc, href) => { try { return new URL(href, doc.baseURI).href; } catch { return href; } };
  const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
  function pick(el, spec, doc) {
    // spec: "css", "css@attr", "@attr" (on el itself), or {selector, attr, all}
    const o = typeof spec === 'string' ? (() => { const m = spec.match(/^(.*?)@([\w:-]+)$/); return m ? { selector: m[1], attr: m[2] } : { selector: spec }; })() : spec;
    const nodes = o.selector ? Array.from(el.querySelectorAll(o.selector)) : [el];
    const val = n => { if (!n) return null; if (!o.attr) return clean(n.textContent); const v = n.getAttribute(o.attr); return /^(href|src|action|data-src)$/.test(o.attr) && v ? abs(doc, v) : v; };
    return o.all ? nodes.map(val).filter(v => v != null && v !== '') : val(nodes[0]);
  }
  function pageInfo(doc, url, include) {
    const meta = n => (doc.querySelector(`meta[name="${n}"],meta[property="${n}"]`) || {}).content;
    const out = { url, title: clean(doc.title), description: meta('description') || meta('og:description') || '' };
    const inc = new Set(include && include.length ? include : ['meta', 'headings', 'text', 'links']);
    if (inc.has('meta')) out.meta = Object.fromEntries(Array.from(doc.querySelectorAll('meta[property^="og:"],meta[name^="twitter:"]')).slice(0, 20).map(m => [m.getAttribute('property') || m.getAttribute('name'), m.content]));
    if (inc.has('jsonld') || inc.has('meta')) { const ld = Array.from(doc.querySelectorAll('script[type="application/ld+json"]')).map(s => parseJSON(s.textContent, null)).filter(Boolean); if (ld.length) out.jsonld = ld.slice(0, 5); }
    if (inc.has('headings')) out.headings = Array.from(doc.querySelectorAll('h1,h2,h3')).slice(0, 40).map(h => `${h.tagName}: ${clean(h.textContent)}`);
    if (inc.has('text')) { const d = doc.cloneNode(true); d.querySelectorAll('script,style,noscript,nav,footer,header,aside,svg,form').forEach(e => e.remove()); const main = d.querySelector('main,article,[role=main]') || d.body; if (main) main.querySelectorAll('*').forEach(el => el.append(' ')); out.text = clip(clean(main ? main.textContent : ''), 6000); }
    if (inc.has('links')) out.links = Array.from(doc.querySelectorAll('a[href]')).map(a => ({ text: clean(a.textContent).slice(0, 80), href: abs(doc, a.getAttribute('href')) })).filter(l => /^https?:/.test(l.href)).slice(0, 80);
    if (inc.has('images')) out.images = Array.from(doc.querySelectorAll('img[src],img[data-src]')).map(i => ({ alt: i.alt, src: abs(doc, i.getAttribute('src') || i.getAttribute('data-src')) })).slice(0, 60);
    if (inc.has('tables')) out.tables = Array.from(doc.querySelectorAll('table')).slice(0, 5).map(tableRows);
    return out;
  }
  const tableRows = t => Array.from(t.querySelectorAll('tr')).map(r => Array.from(r.querySelectorAll('th,td')).map(c => clean(c.textContent)));
  const toCSV = rows => rows.map(r => r.map(v => { const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n');
  async function saveRows(rows, output) {
    if (!output || !rows.length) return '';
    const p = uniquePath(output);
    if (extOf(p) === 'csv') { const cols = [...new Set(rows.flatMap(r => Object.keys(r)))]; await fsx.writeText(p, toCSV([cols, ...rows.map(r => cols.map(c => r[c]))])); }
    else await fsx.writeText(p, JSON.stringify(rows, null, 1));
    return p;
  }
  const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };

  /* ================================================================== downloads */
  const BLOCKED_HOSTS = /(^|\.)(youtube\.com|youtu\.be|googlevideo\.com|netflix\.com|disneyplus\.com|hulu\.com|primevideo\.com|spotify\.com|max\.com|twitch\.tv)$/i;
  async function dl(url, path, headers) { needNative('Downloads'); return nativeAsync('download', JSON.stringify({ url, path: path ? cleanPath(path) : '', ...(headers ? { headers } : {}) })); }

  /* ================================================================== Python (Pyodide, in a worker) */
  const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
  let pyWorker = null, pyReq = 0; const pyPending = {};
  function pyStart() {
    if (pyWorker) return pyWorker;
    const src = `importScripts('${PYODIDE}pyodide.js');
let py = null;
async function boot() { if (!py) { py = await loadPyodide({ indexURL: '${PYODIDE}' }); py.FS.mkdirTree('/work'); } return py; }
self.onmessage = async e => {
  const { id, code, files, packages } = e.data; const out = [];
  try {
    const p = await boot();
    p.setStdout({ batched: s => out.push(s) }); p.setStderr({ batched: s => out.push('stderr: ' + s) });
    for (const [path, b64] of Object.entries(files || {})) { const full = '/work/' + path; p.FS.mkdirTree(full.replace(/\\/[^/]*$/, '')); p.FS.writeFile(full, Uint8Array.from(atob(b64), c => c.charCodeAt(0))); }
    if (packages && packages.length) { await p.loadPackage('micropip'); await p.pyimport('micropip').install(packages); }
    await p.loadPackagesFromImports(code);
    const before = {}; const walk = (d, f) => { for (const n of p.FS.readdir(d)) { if (n === '.' || n === '..') continue; const full = d + '/' + n; const st = p.FS.stat(full); if (p.FS.isDir(st.mode)) walk(full, f); else f(full, st); } };
    walk('/work', (f, st) => before[f] = +st.mtime);
    p.runPython('import os; os.chdir("/work")');
    let result = await p.runPythonAsync(code);
    if (result && result.toJs) result = result.toString();
    const changed = {}; walk('/work', (f, st) => { if (before[f] !== +st.mtime) { const b = p.FS.readFile(f); let s = ''; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768)); changed[f.slice(6)] = btoa(s); } });
    self.postMessage({ id, ok: true, out, result: result === undefined || result === null ? null : String(result), changed });
  } catch (err) { self.postMessage({ id, ok: false, out, error: String(err && err.message || err) }); }
};`;
    pyWorker = new Worker(URL.createObjectURL(new Blob([src], { type: 'application/javascript' })));
    pyWorker.onmessage = e => { const p = pyPending[e.data.id]; if (p) { delete pyPending[e.data.id]; p(e.data); } };
    pyWorker.onerror = e => { Object.values(pyPending).forEach(f => f({ ok: false, error: e.message || 'Python failed to start (needs internet the first time)', out: [] })); for (const k in pyPending) delete pyPending[k]; pyWorker = null; };
    return pyWorker;
  }
  function runPython(code, files, packages, timeoutMs) {
    return new Promise(res => {
      const id = ++pyReq; const w = pyStart();
      const t = setTimeout(() => { delete pyPending[id]; w.terminate(); pyWorker = null; res({ ok: false, error: `Timed out after ${timeoutMs / 1000}s (Python was restarted)`, out: [] }); }, timeoutMs);
      pyPending[id] = d => { clearTimeout(t); res(d); };
      w.postMessage({ id, code, files, packages });
    });
  }

  /* ================================================================== GitHub */
  const ghToken = () => getKey('svc_github');
  async function gh(method, path, body, { accept, raw } = {}) {
    const t = ghToken(); if (!t) throw new Error('Add a GitHub token in Settings → Developer (fine-grained token with Contents, Issues, Pull requests, Actions, Pages and Administration permissions as needed).');
    const r = await http(method, 'https://api.github.com' + path, { Authorization: 'Bearer ' + t, Accept: accept || 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(body != null ? { 'Content-Type': 'application/json' } : {}) }, body == null ? (method === 'GET' || method === 'DELETE' ? null : '') : JSON.stringify(body), 60000);
    if (r.status >= 400) { const d = parseJSON(r.body, {}); const e = new Error(`GitHub ${r.status}: ${d.message || clip(r.body, 200)}${d.errors ? ' — ' + JSON.stringify(d.errors).slice(0, 200) : ''}`); e.status = r.status; throw e; }
    return raw ? r.body : parseJSON(r.body, {});
  }
  let ghUser = null;
  async function ghRepo(repo) { if (String(repo).includes('/')) return repo; ghUser = ghUser || (await gh('GET', '/user')).login; return `${ghUser}/${repo}`; }
  async function ghPushFolder(repo, folder, { branch, message, prefix = '' } = {}) {
    repo = await ghRepo(repo);
    const files = fsx.list(folder, true).filter(f => !f.dir && !/(^|\/)(\.git|node_modules|build|\.gradle)\//.test(f.path));
    if (!files.length) throw new Error('Folder is empty: ' + folder);
    if (files.length > 400) throw new Error(`Too many files (${files.length}); max 400 per push`);
    const meta = await gh('GET', `/repos/${repo}`); branch = branch || meta.default_branch || 'main';
    let head = null;
    try { head = (await gh('GET', `/repos/${repo}/git/ref/heads/${enc(branch)}`)).object.sha; }
    catch (e) {
      if (e.status === 409 || /empty/i.test(e.message)) { await gh('PUT', `/repos/${repo}/contents/.nexus`, { message: 'Initialize repository', content: btoa('created by Nexus Agent\n'), branch }); head = (await gh('GET', `/repos/${repo}/git/ref/heads/${enc(branch)}`)).object.sha; }
      else if (e.status === 404) { const base = (await gh('GET', `/repos/${repo}/git/ref/heads/${enc(meta.default_branch)}`)).object.sha; await gh('POST', `/repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: base }); head = base; }
      else throw e;
    }
    const baseTree = (await gh('GET', `/repos/${repo}/git/commits/${head}`)).tree.sha;
    const root = cleanPath(folder).replace(/\/$/, '');
    const tree = [];
    for (const f of files) {
      const rel = root ? f.path.slice(root.length + 1) : f.path;
      const blob = await gh('POST', `/repos/${repo}/git/blobs`, { content: await fsx.readB64(f.path), encoding: 'base64' });
      tree.push({ path: (prefix ? prefix.replace(/\/$/, '') + '/' : '') + rel, mode: /\.(sh|gradlew)$|(^|\/)gradlew$/.test(rel) ? '100755' : '100644', type: 'blob', sha: blob.sha });
    }
    const t = await gh('POST', `/repos/${repo}/git/trees`, { base_tree: baseTree, tree });
    const c = await gh('POST', `/repos/${repo}/git/commits`, { message: message || `Update from Nexus Agent (${files.length} files)`, tree: t.sha, parents: [head] });
    await gh('PATCH', `/repos/${repo}/git/refs/heads/${enc(branch)}`, { sha: c.sha });
    return { repo, branch, commit: c.sha, files: files.length, url: `https://github.com/${repo}/commit/${c.sha}` };
  }
  async function ghDownload(apiPath, path) {
    return nativeAsync('download', JSON.stringify({ url: 'https://api.github.com' + apiPath, headers: { Authorization: 'Bearer ' + ghToken(), Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, dropAuthOnRedirect: true, path }));
  }

  /* ================================================================== project templates */
  function androidTemplate(name, pkg, html) {
    const app = name.replace(/[^\w ]/g, '').trim() || 'My App';
    return {
      'settings.gradle': `pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }\ndependencyResolutionManagement { repositories { google(); mavenCentral() } }\nrootProject.name = "${app.replace(/\s+/g, '')}"\ninclude ':app'\n`,
      'build.gradle': `plugins { id 'com.android.application' version '8.5.2' apply false }\n`,
      'gradle.properties': 'android.useAndroidX=true\norg.gradle.jvmargs=-Xmx3g\n',
      'app/build.gradle': `plugins { id 'com.android.application' }\nandroid {\n    namespace '${pkg}'\n    compileSdk 34\n    defaultConfig { applicationId '${pkg}'; minSdk 26; targetSdk 34; versionCode 1; versionName '1.0' }\n    buildTypes { release { minifyEnabled false; signingConfig signingConfigs.debug } }\n    compileOptions { sourceCompatibility JavaVersion.VERSION_17; targetCompatibility JavaVersion.VERSION_17 }\n}\n`,
      'app/src/main/AndroidManifest.xml': `<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n    <uses-permission android:name="android.permission.INTERNET" />\n    <application android:label="${app}" android:theme="@android:style/Theme.Material.NoActionBar">\n        <activity android:name=".MainActivity" android:exported="true" android:configChanges="orientation|screenSize">\n            <intent-filter><action android:name="android.intent.action.MAIN" /><category android:name="android.intent.category.LAUNCHER" /></intent-filter>\n        </activity>\n    </application>\n</manifest>\n`,
      [`app/src/main/java/${pkg.replace(/\./g, '/')}/MainActivity.java`]: `package ${pkg};\n\nimport android.app.Activity;\nimport android.os.Bundle;\nimport android.webkit.WebView;\n\npublic class MainActivity extends Activity {\n    @Override protected void onCreate(Bundle b) {\n        super.onCreate(b);\n        WebView w = new WebView(this);\n        w.getSettings().setJavaScriptEnabled(true);\n        w.getSettings().setDomStorageEnabled(true);\n        setContentView(w);\n        w.loadUrl("file:///android_asset/index.html");\n    }\n}\n`,
      'app/src/main/assets/index.html': html || `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${app}</title><style>body{font-family:sans-serif;background:#0b0f14;color:#e6f7ff;display:grid;place-items:center;height:100vh;margin:0}</style></head><body><h1>${app}</h1></body></html>\n`,
      '.github/workflows/build-apk.yml': `name: Build APK\non: [push, workflow_dispatch]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-java@v4\n        with: { distribution: temurin, java-version: '17' }\n      - name: Android SDK\n        run: |\n          SDK="\${ANDROID_HOME:-/usr/local/lib/android/sdk}"\n          SM=$(ls -d "$SDK"/cmdline-tools/*/bin/sdkmanager | sort -V | tail -1)\n          yes | "$SM" --licenses > /dev/null || true\n          "$SM" "platforms;android-34" "build-tools;34.0.0"\n      - uses: gradle/actions/setup-gradle@v4\n        with: { gradle-version: '8.7' }\n      - run: gradle --no-daemon assembleRelease\n      - uses: actions/upload-artifact@v4\n        with: { name: apk, path: app/build/outputs/apk/release/*.apk }\n`,
      '.gitignore': '.gradle/\nbuild/\nlocal.properties\n*.iml\n',
      'README.md': `# ${app}\n\nBuilt with Nexus Agent. Every push builds an installable APK (Actions → Build APK → artifact "apk").\n`,
    };
  }
  const TEMPLATES = {
    android_webview_app: (n, o) => androidTemplate(n, o.package || `com.nexus.${n.toLowerCase().replace(/[^a-z0-9]/g, '') || 'app'}`, o.html),
    static_site: (n, o) => ({ 'index.html': o.html || `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${n}</title><link rel="stylesheet" href="style.css"></head><body><main><h1>${n}</h1><p>Edit index.html.</p></main><script src="app.js"></script></body></html>\n`, 'style.css': 'body{font-family:system-ui,sans-serif;max-width:760px;margin:2rem auto;padding:0 1rem}\n', 'app.js': '// your code\n', 'README.md': `# ${n}\n\nPublish with GitHub Pages (github_write action enable_pages).\n` }),
    python_cli: n => ({ 'main.py': `"""${n}"""\nimport argparse\n\n\ndef main():\n    p = argparse.ArgumentParser(description="${n}")\n    p.add_argument("name", nargs="?", default="world")\n    a = p.parse_args()\n    print(f"Hello, {a.name}!")\n\n\nif __name__ == "__main__":\n    main()\n`, 'requirements.txt': '', 'README.md': `# ${n}\n\n    python main.py\n` }),
    node_cli: n => ({ 'package.json': JSON.stringify({ name: n.toLowerCase().replace(/[^a-z0-9-]/g, '-'), version: '1.0.0', type: 'module', bin: { [n.toLowerCase().replace(/[^a-z0-9-]/g, '-')]: 'index.js' }, scripts: { start: 'node index.js' } }, null, 2) + '\n', 'index.js': '#!/usr/bin/env node\nconsole.log(`Hello, ${process.argv[2] || "world"}!`);\n', 'README.md': `# ${n}\n\n    npm start\n` }),
  };

  /* ================================================================== skills */
  BUILTIN_SKILLS.push(
    /* ---------------- APK services */
    { name: 'apk_apps', group: 'APK', description: 'List installed apps with package, version, size, install source and whether they are split APKs.', parameters: P({ filter: Str('optional name filter'), include_system: Bool('') }),
      run: async a => (await apk('list', { system: !!a.include_system, filter: a.filter || '' })).sort((x, y) => x.label.localeCompare(y.label)).slice(0, 150).map(x => `• ${x.label} · ${x.package} · v${x.version || '?'} · ${x.sizeMB} MB${x.split ? ' · split' : ''}${x.system ? ' · system' : ''}${x.installer ? ' · from ' + x.installer : ''}`).join('\n') || 'No apps.' },
    { name: 'apk_extract', group: 'APK', description: 'Back up an installed app\'s APK into the workspace (split apps become a .apks bundle) — to keep, share or inspect.', parameters: P({ app: Str('app name or package') }, ['app']),
      run: async a => { const r = await apk('extract', { package: await resolvePkg(a.app) }); return `saved ${r.path} (${fmtSize(r.size)})${r.note ? '\n' + r.note : ''}`; } },
    { name: 'apk_inspect', group: 'APK', description: 'Inspect an installed app or a workspace .apk: package, versions, SDK levels, permissions, component counts, signing certificate, and its integration points (deep links, share targets).', parameters: P({ app: Str('app name/package, or workspace .apk path') }, ['app']),
      run: async a => { const ref = /\.apk$/i.test(a.app) || a.app.includes('/') ? cleanPath(a.app) : await resolvePkg(a.app); return J(await apk('inspect', { ref })); } },
    { name: 'apk_install', group: 'APK', risky: true, description: 'Install an .apk from the workspace (e.g. one built with build_android_app or downloaded from GitHub). Android asks the user to confirm.', parameters: P({ path: Str('workspace .apk path') }, ['path']),
      run: async a => (await apk('install', { path: cleanPath(a.path) })).result },
    { name: 'apk_uninstall', group: 'APK', risky: true, description: 'Uninstall an app (Android asks the user to confirm).', parameters: P({ app: Str('app name or package') }, ['app']),
      run: async a => (await apk('uninstall', { package: await resolvePkg(a.app) })).result },
    { name: 'app_integrations', group: 'App integrations', description: 'Discover what an installed app can be driven with: its deep links (URL schemes), share targets, text actions and custom intents — read from its manifest.', parameters: P({ app: Str('app name or package') }, ['app']),
      run: async a => { const pkg = await resolvePkg(a.app); const r = await apk('integrations', { ref: pkg }); const sh = r.shareTargets.map(s => s.mimeType); return `${pkg}\nDeep links:\n${r.deepLinks.slice(0, 30).map(l => `  • ${l.url}`).join('\n') || '  none'}\nShare targets: ${[...new Set(sh)].join(', ') || 'none'}\nText actions: ${r.textActions.length ? 'yes (select-text menu)' : 'none'}\nCustom actions:\n${r.customActions.slice(0, 15).map(x => '  • ' + x.action).join('\n') || '  none'}\n\nUse app_integrate to turn one of these into a reusable skill.`; } },
    { name: 'app_integrate', group: 'App integrations', description: 'Turn an installed app into a reusable agent skill: mode "link" opens a deep-link template with {{input}} (e.g. "spotify:search:{{input}}", "https://maps.google.com/?q={{input}}"), "share" sends text to the app, "text" uses the app\'s select-text action (translate, define…).', parameters: P({ app: Str('app name or package'), name: Str('skill name, snake_case'), mode: Str('link | share | text'), template: Str('for link mode: URL with {{input}}'), description: Str('what the skill does (shown to agents)'), confirm: Bool('ask before running') }, ['app', 'name', 'mode', 'description']),
      run: async a => {
        const pkg = await resolvePkg(a.app); const label = (await apk('list', { system: true, filter: pkg })).find(x => x.package === pkg);
        const name = String(a.name).replace(/[^\w-]/g, '_').slice(0, 60);
        if (a.mode === 'link' && !/\{\{\s*(input|raw)\s*\}\}/.test(a.template || '')) throw new Error('link mode needs a template containing {{input}}');
        S.customSkills = S.customSkills.filter(s => s.name !== name);
        S.customSkills.push({ id: uid(), kind: 'intent', name, mode: a.mode, package: pkg, appLabel: label ? label.label : pkg, template: a.template || '', description: a.description, confirm: !!a.confirm });
        save(); return `New skill "${name}" (${a.mode}) → ${label ? label.label : pkg}. Agents can use it now; manage it in Settings → Developer.`;
      } },

    /* ---------------- Scraper */
    { name: 'scrape_page', group: 'Scraper', description: 'Scrape a web page: title, description, metadata/JSON-LD, headings, main text, links, images, tables — or exactly what you ask for with CSS selectors ({"price": ".price", "img": "img.main@src", "tags": {"selector": ".tag", "all": true}}). render=true runs the page\'s JavaScript first.', parameters: P({ url: Str(''), selectors: { type: 'object', description: 'optional field → CSS selector map' }, include: Arr('meta, jsonld, headings, text, links, images, tables'), render: Bool('execute JavaScript (for dynamic sites)') }, ['url']),
      run: async a => { const { doc, url } = await getDoc(a.url, a.render); if (a.selectors && Object.keys(a.selectors).length) return J({ url, ...Object.fromEntries(Object.entries(a.selectors).map(([k, v]) => [k, pick(doc, v, doc)])) }); return clip(J(pageInfo(doc, url, a.include)), 20000); } },
    { name: 'scrape_list', group: 'Scraper', description: 'Extract a list of repeating items (products, listings, articles, jobs) into structured rows: item = CSS for each item, fields = {name: "css" | "css@attr"}. Follows "next" links for more pages and saves CSV/JSON.', parameters: P({ url: Str(''), item: Str('CSS selector of each item'), fields: { type: 'object', description: 'field → selector (relative to the item)' }, next: Str('optional CSS selector of the next-page link'), max_pages: Num('default 1, max 20'), render: Bool(''), output: Str('optional .csv or .json path') }, ['url', 'item', 'fields']),
      run: async a => {
        const rows = []; let url = a.url; const max = Math.min(20, a.max_pages || 1);
        for (let p = 0; p < max && url; p++) {
          const { doc } = await getDoc(url, a.render);
          doc.querySelectorAll(a.item).forEach(el => rows.push(Object.fromEntries(Object.entries(a.fields).map(([k, v]) => [k, pick(el, v, doc)]))));
          const n = a.next ? doc.querySelector(a.next) : null; url = n && n.getAttribute('href') ? abs(doc, n.getAttribute('href')) : null;
          if (url) await sleep(1000);
        }
        const saved = await saveRows(rows, a.output);
        return `${rows.length} item(s)${saved ? ' → ' + saved : ''}\n` + clip(J(rows.slice(0, 25)), 12000);
      } },
    { name: 'scrape_tables', group: 'Scraper', description: 'Extract HTML tables from a page (prices, schedules, stats) — returns them and can save CSV.', parameters: P({ url: Str(''), index: Num('optional table number (1-based)'), render: Bool(''), output: Str('optional .csv path (one table)') }, ['url']),
      run: async a => {
        const { doc } = await getDoc(a.url, a.render); let tables = Array.from(doc.querySelectorAll('table')).map(tableRows).filter(t => t.length);
        if (a.index) tables = [tables[a.index - 1]].filter(Boolean); if (!tables.length) return 'No tables found (try render=true).';
        let saved = ''; if (a.output) { saved = uniquePath(a.output); await fsx.writeText(saved, toCSV(tables[0])); }
        return `${tables.length} table(s)${saved ? ' → ' + saved : ''}\n\n` + clip(tables.map((t, i) => `#${(a.index || i + 1)} (${t.length} rows)\n` + t.slice(0, 15).map(r => r.join(' | ')).join('\n')).join('\n\n'), 12000);
      } },
    { name: 'scrape_crawl', group: 'Scraper', description: 'Crawl a website politely (1 page/second, same site, robots.txt) and collect each page\'s title, description and text summary; saves JSON. Good for site audits, docs, finding pages.', parameters: P({ url: Str('start URL'), max_pages: Num('default 15, max 60'), include: Str('optional regex the URL must match'), output: Str('optional .json path') }, ['url']),
      run: async a => {
        const start = new URL(a.url); const max = Math.min(60, a.max_pages || 15); const re = a.include ? new RegExp(a.include) : null;
        const seen = new Set([start.href.split('#')[0]]), queue = [start.href], pages = [];
        while (queue.length && pages.length < max) {
          const url = queue.shift();
          try {
            const { doc } = await getDoc(url, false); const info = pageInfo(doc, url, ['text', 'links']);
            pages.push({ url, title: info.title, description: info.description, words: info.text.split(/\s+/).length, summary: info.text.slice(0, 300) });
            for (const l of info.links) { const u = l.href.split('#')[0]; if (new URL(u).host === start.host && !seen.has(u) && (!re || re.test(u)) && !/\.(jpg|jpeg|png|gif|pdf|zip|mp4|mp3|webp|svg)$/i.test(u)) { seen.add(u); queue.push(u); } }
          } catch (e) { pages.push({ url, error: e.message }); }
          await sleep(1000);
        }
        const saved = await saveRows(pages, a.output || `outputs/crawl_${start.host}.json`);
        return `Crawled ${pages.length} page(s) of ${start.host} → ${saved}\n` + pages.slice(0, 30).map(p => `• ${p.title || p.error} — ${p.url}`).join('\n');
      } },
    { name: 'scrape_watch', group: 'Scraper', description: 'Watch pages for changes (price drops, restocks, new posts): add a URL + CSS selector, then check to see what changed since last time.', parameters: P({ action: Str('add | check | list | remove'), url: Str(''), selector: Str('CSS selector to watch (default: main text)'), name: Str('label') }, ['action']),
      run: async a => {
        if (a.action === 'list') return S.watches.map(w => `• ${w.name} — ${w.url} [${w.selector || 'page'}] · last ${w.last ? clip(w.last, 60) : '?'} · checked ${w.checked ? new Date(w.checked).toLocaleString() : 'never'}`).join('\n') || 'No watches.';
        if (a.action === 'remove') { S.watches = S.watches.filter(w => w.name !== a.name && w.url !== a.url); save(); return 'Removed.'; }
        const read = async w => { const { doc } = await getDoc(w.url, w.render); const v = w.selector ? pick(doc, w.selector, doc) : pageInfo(doc, w.url, ['text']).text; return clean(v || ''); };
        if (a.action === 'add') { const w = { name: a.name || new URL(a.url).host, url: a.url, selector: a.selector || '' }; w.last = await read(w); w.hash = hash(w.last); w.checked = Date.now(); S.watches.push(w); save(); return `Watching "${w.name}". Current value: ${clip(w.last, 200)}`; }
        const out = [];
        for (const w of S.watches.filter(x => !a.name || x.name === a.name)) {
          try { const v = await read(w); const changed = hash(v) !== w.hash; out.push(`${changed ? '🔔 CHANGED' : '= same'} · ${w.name}${changed ? `\n  was: ${clip(w.last, 160)}\n  now: ${clip(v, 160)}` : ''}`); w.last = v; w.hash = hash(v); w.checked = Date.now(); }
          catch (e) { out.push(`⚠ ${w.name}: ${e.message}`); }
        }
        save(); return out.join('\n') || 'No watches.';
      } },

    /* ---------------- Downloads */
    { name: 'download_batch', group: 'Downloads', description: 'Download many files (URLs) into a workspace folder.', parameters: P({ urls: Arr('URLs'), folder: Str('workspace folder, default downloads') }, ['urls']),
      run: async a => { const out = []; for (const u of a.urls.slice(0, 100)) { try { if (BLOCKED_HOSTS.test(new URL(u).host)) { out.push(`✗ ${u}: streaming services are not supported`); continue; } const name = (new URL(u).pathname.split('/').pop() || 'file').replace(/[^\w.-]/g, '_'); const r = await dl(u, `${cleanPath(a.folder || 'downloads')}/${name}`); out.push(`✓ ${r.path} (${fmtSize(r.size)})`); } catch (e) { out.push(`✗ ${u}: ${e.message}`); } } return out.join('\n'); } },
    { name: 'download_page_media', group: 'Downloads', description: 'Find and download the media on a web page — images (largest variant), videos/audio with direct file links, PDFs and other documents. Not for streaming sites (YouTube, Netflix…).', parameters: P({ url: Str('page URL'), kinds: Arr('image, video, audio, document (default all)'), limit: Num('max files, default 20'), folder: Str('workspace folder'), render: Bool('') }, ['url']),
      run: async a => {
        if (BLOCKED_HOSTS.test(new URL(a.url).host)) return 'Downloading from streaming services is not supported (their terms and copy protection forbid it).';
        const { doc } = await getDoc(a.url, a.render); const kinds = new Set(a.kinds && a.kinds.length ? a.kinds : ['image', 'video', 'audio', 'document']);
        const found = new Map(); const add = (u, k) => { if (!u || /^(data|blob):/.test(u)) return; const x = abs(doc, u); if (/^https?:/.test(x) && !found.has(x) && kinds.has(k)) found.set(x, k); };
        doc.querySelectorAll('meta[property="og:image"],meta[property="og:image:url"]').forEach(m => add(m.content, 'image'));
        doc.querySelectorAll('meta[property="og:video"],meta[property="og:video:url"]').forEach(m => add(m.content, 'video'));
        doc.querySelectorAll('img').forEach(i => { const ss = (i.getAttribute('srcset') || '').split(',').map(s => s.trim().split(/\s+/)).filter(x => x[0]).sort((x, y) => parseFloat(y[1] || 0) - parseFloat(x[1] || 0)); add((ss[0] || [])[0] || i.getAttribute('data-src') || i.getAttribute('src'), 'image'); });
        doc.querySelectorAll('video[src],video source[src]').forEach(v => add(v.getAttribute('src'), 'video'));
        doc.querySelectorAll('audio[src],audio source[src]').forEach(v => add(v.getAttribute('src'), 'audio'));
        doc.querySelectorAll('a[href]').forEach(l => { const h = l.getAttribute('href'); if (/\.(pdf|docx?|xlsx?|pptx?|zip|epub|csv)(\?|$)/i.test(h)) add(h, 'document'); else if (/\.(mp4|webm|mov)(\?|$)/i.test(h)) add(h, 'video'); else if (/\.(mp3|m4a|wav|ogg|flac)(\?|$)/i.test(h)) add(h, 'audio'); else if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(h)) add(h, 'image'); });
        const list = [...found].filter(([u]) => !/\.m3u8(\?|$)/i.test(u)).slice(0, Math.min(100, a.limit || 20));
        if (!list.length) return 'No downloadable media found (try render=true).';
        const folder = cleanPath(a.folder || `downloads/${new URL(a.url).host}`); const out = [];
        for (const [u, k] of list) { try { const name = decodeURIComponent(new URL(u).pathname.split('/').pop() || k).replace(/[^\w.-]/g, '_').slice(0, 80) || k; const r = await dl(u, `${folder}/${name}`); out.push(`✓ ${k}: ${r.path} (${fmtSize(r.size)})`); } catch (e) { out.push(`✗ ${k}: ${u} — ${e.message}`); } }
        return out.join('\n');
      } },
    { name: 'download_system', group: 'Downloads', description: 'Large or long downloads through Android\'s download manager (continues in the background, resumes, shows a notification; file lands in Download/Nexus). Check with download_status, copy into the workspace with download_import.', parameters: P({ url: Str(''), name: Str('optional file name') }, ['url']),
      run: async a => { needNative(); if (BLOCKED_HOSTS.test(new URL(a.url).host)) return 'Streaming services are not supported.'; const r = parseJSON(N.systemDownload(a.url, a.name || '', ''), {}); if (r.error) throw new Error(r.error); S.sysDownloads = [...(S.sysDownloads || []).slice(-30), r.id]; save(); return `Started download #${r.id} → ${r.file}`; } },
    { name: 'download_status', group: 'Downloads', description: 'Progress of system downloads (default: recent ones).', parameters: P({ ids: Arr('download ids', { type: 'number' }) }),
      run: async a => { needNative(); const ids = a.ids && a.ids.length ? a.ids : (S.sysDownloads || []); if (!ids.length) return 'No downloads.'; return parseJSON(N.systemDownloadStatus(JSON.stringify(ids)), []).map(d => `#${d.id} ${d.title} · ${d.status} · ${fmtSize(d.bytes)}${d.total > 0 ? ' / ' + fmtSize(d.total) + ` (${Math.round(d.bytes / d.total * 100)}%)` : ''}`).join('\n') || 'Not found.'; } },
    { name: 'download_import', group: 'Downloads', description: 'Copy a finished system download into the workspace (to unzip, inspect, install, process).', parameters: P({ id: Num('download id') }, ['id']),
      run: async a => { needNative(); return 'imported ' + (await nativeAsync('systemDownloadImport', a.id)).path; } },

    /* ---------------- Coding & builds */
    { name: 'run_python', group: 'Coding', description: 'Run Python 3 (Pyodide) on the device: numpy, pandas, matplotlib, scipy, scikit-learn etc. load automatically from imports; extra pure-Python packages via "packages". Input files are available in the working folder; files the code writes (e.g. plt.savefig("chart.png")) are saved to the workspace. First run downloads ~10 MB.', parameters: P({ code: Str('Python code; the last expression is returned'), files: Arr('workspace files to make available'), packages: Arr('extra pip packages'), output_dir: Str('workspace folder for created files (default outputs/python)'), timeout_s: Num('default 120') }, ['code']),
      run: async a => {
        const files = {}; for (const p of (a.files || []).slice(0, 30)) files[cleanPath(p)] = bytesToB64(await fsx.bytes(p));
        const r = await runPython(a.code, files, a.packages || [], Math.min(600, a.timeout_s || 120) * 1000);
        const saved = []; for (const [p, b64] of Object.entries(r.changed || {})) saved.push(await fsx.writeB64(`${cleanPath(a.output_dir || 'outputs/python')}/${p}`, b64));
        return [r.out && r.out.length ? 'output:\n' + clip(r.out.join('\n'), 10000) : '', r.ok ? (r.result != null ? 'result: ' + clip(r.result, 4000) : '') : 'ERROR: ' + clip(r.error, 3000), saved.length ? 'files: ' + saved.join(', ') : ''].filter(Boolean).join('\n') || '(no output)';
      } },
    { name: 'run_code', group: 'Coding', description: 'Run code in many languages (C, C++, Java, Go, Rust, Ruby, PHP, Bash, TypeScript, Kotlin…) through a Piston-compatible code runner (URL in Settings → Developer). JavaScript and Python run locally without it.', parameters: P({ language: Str('language name'), code: Str(''), stdin: Str('optional input'), files: Arr('optional extra workspace source files') }, ['language', 'code']),
      run: async (a, ctx) => {
        const lang = String(a.language).toLowerCase();
        if (/^(js|javascript)$/.test(lang)) return execSkill('run_javascript', { code: a.code }, ctx);
        if (/^(py|python3?)$/.test(lang)) return execSkill('run_python', { code: a.code, files: a.files }, ctx);
        const base = (S.settings.codeRunnerUrl || '').replace(/\/+$/, '');
        if (!base) return 'No code runner configured. Self-host Piston (github.com/engineer-man/piston) and set its URL in Settings → Developer, or use run_python / run_javascript.';
        const files = [{ content: a.code }]; for (const p of (a.files || []).slice(0, 10)) files.push({ name: cleanPath(p).replace(/^.*\//, ''), content: await fsx.readText(p) });
        const d = await postJSON(base + '/execute', {}, { language: lang, version: '*', files, stdin: a.stdin || '' }, 120000);
        return [d.compile && (d.compile.stderr || d.compile.output) ? 'compile: ' + clip(d.compile.output || d.compile.stderr, 4000) : '', 'output:\n' + clip((d.run && (d.run.output || d.run.stdout)) || '', 10000), d.run && d.run.code ? 'exit code ' + d.run.code : ''].filter(Boolean).join('\n');
      } },
    { name: 'web_preview', group: 'Coding', description: 'Preview an HTML file (or HTML code) from the workspace in a sandboxed window — for web pages, games, charts the agent builds.', parameters: P({ path: Str('workspace .html path'), html: Str('or HTML code to preview') }),
      run: async a => {
        let p = a.path ? cleanPath(a.path) : null; if (!p && a.html) p = await fsx.writeText(`tmp/preview_${uid()}.html`, a.html); if (!p) throw new Error('path or html required');
        $('#modalBox').innerHTML = `<div class="row"><b style="flex:1">${esc(p)}</b><button class="small" id="wpX">✕</button></div><iframe sandbox="allow-scripts allow-forms allow-modals" src="${esc(wsUrl(p))}" style="width:100%;height:72vh;border:1px solid var(--line);border-radius:8px;background:#fff"></iframe>`;
        $('#modal').classList.add('show'); const c = () => { $('#modal').classList.remove('show'); modalClose = null; }; modalClose = c; $('#wpX').onclick = c;
        return 'Showing preview of ' + p;
      } },
    { name: 'code_template', group: 'Coding', description: 'Create a ready-to-build project in the workspace: android_webview_app (installable APK built by GitHub Actions on every push), static_site (GitHub Pages ready), python_cli, node_cli.', parameters: P({ kind: Str('android_webview_app | static_site | python_cli | node_cli'), name: Str('project name'), folder: Str('optional workspace folder (default projects/<name>)'), package: Str('android package id (optional)'), html: Str('optional index.html content') }, ['kind', 'name']),
      run: async a => {
        const t = TEMPLATES[a.kind]; if (!t) return 'Unknown template. Options: ' + Object.keys(TEMPLATES).join(', ');
        const folder = cleanPath(a.folder || `projects/${a.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`); const files = t(a.name, a);
        for (const [p, c] of Object.entries(files)) await fsx.writeText(`${folder}/${p}`, c);
        return `Created ${Object.keys(files).length} files in ${folder}/:\n` + Object.keys(files).map(f => '  ' + f).join('\n') + (a.kind === 'android_webview_app' ? `\nNext: edit app/src/main/assets/index.html, then build_android_app {folder: "${folder}"}.` : '');
      } },
    { name: 'build_android_app', group: 'Coding', risky: true, description: 'Build an installable APK from a workspace Android project in the cloud: pushes it to a GitHub repo (created if needed), waits for the GitHub Actions build, downloads the APK into the workspace. Then install it with apk_install.', parameters: P({ folder: Str('workspace project folder (from code_template)'), repo: Str('repo name or owner/name (default: folder name)'), private: Bool('private repo (default true)'), wait_minutes: Num('max wait, default 15') }, ['folder']),
      run: async a => {
        const folder = cleanPath(a.folder); let repo = await ghRepo(a.repo || folder.split('/').pop());
        try { await gh('GET', `/repos/${repo}`); } catch (e) { if (e.status !== 404) throw e; await gh('POST', '/user/repos', { name: repo.split('/')[1], private: a.private !== false, description: 'Built with Nexus Agent', auto_init: false }); await sleep(1500); }
        const push = await ghPushFolder(repo, folder, { message: 'Build from Nexus Agent' });
        toast('Pushed — waiting for the GitHub build…');
        const until = Date.now() + (a.wait_minutes || 15) * 60000; let run = null;
        while (Date.now() < until) {
          await sleep(10000);
          run = ((await gh('GET', `/repos/${repo}/actions/runs?head_sha=${push.commit}&per_page=5`)).workflow_runs || [])[0];
          if (run && run.status === 'completed') break;
        }
        if (!run) return `Pushed ${push.files} files to ${repo} but no build started. Does the project have .github/workflows? ${push.url}`;
        if (run.status !== 'completed') return `Build still running after ${a.wait_minutes || 15} min: ${run.html_url}. Check later with github_actions.`;
        if (run.conclusion !== 'success') { const logs = await execSkill('github_actions', { action: 'logs', repo, run_id: run.id }, {}).catch(e => e.message); return `Build failed (${run.conclusion}): ${run.html_url}\n${clip(logs, 4000)}`; }
        const art = ((await gh('GET', `/repos/${repo}/actions/runs/${run.id}/artifacts`)).artifacts || [])[0]; if (!art) return 'Build succeeded but produced no artifact.';
        const zip = await ghDownload(`/repos/${repo}/actions/artifacts/${art.id}/zip`, `builds/${repo.replace('/', '_')}_${run.id}.zip`);
        const ex = await nativeAsync('zip', JSON.stringify({ op: 'extract', path: zip.path, dest: '' }));
        const apkFile = fsx.list(ex.dest, true).find(f => /\.apk$/i.test(f.path));
        return apkFile ? `✅ Built ${repo} → ${apkFile.path}\nInstall it with apk_install {path: "${apkFile.path}"}. Build: ${run.html_url}` : `Built, files in ${ex.dest} (no .apk found).`;
      } },

    /* ---------------- GitHub */
    { name: 'github_list', group: 'GitHub', description: 'Read from GitHub: repos (yours or a user\'s), issues, prs, runs (Actions), workflows, releases, branches, notifications.', parameters: P({ what: Str('repos | issues | prs | runs | workflows | releases | branches | notifications'), repo: Str('owner/name or name (yours)'), user: Str('for repos: another user/org'), state: Str('open | closed | all'), limit: Num('default 15') }, ['what']),
      run: async a => {
        const n = Math.min(50, a.limit || 15), st = a.state || 'open';
        if (a.what === 'repos') return (await gh('GET', a.user ? `/users/${enc(a.user)}/repos?sort=updated&per_page=${n}` : `/user/repos?sort=updated&per_page=${n}`)).map(r => `• ${r.full_name}${r.private ? ' 🔒' : ''} · ★${r.stargazers_count} · ${r.language || ''} · ${clip(r.description || '', 80)}`).join('\n');
        if (a.what === 'notifications') return (await gh('GET', `/notifications?per_page=${n}`)).map(x => `• ${x.repository.full_name} · ${x.subject.type}: ${x.subject.title} (${x.reason})`).join('\n') || 'No notifications.';
        const repo = await ghRepo(a.repo);
        if (a.what === 'issues') return (await gh('GET', `/repos/${repo}/issues?state=${st}&per_page=${n}`)).filter(i => !i.pull_request).map(i => `#${i.number} ${i.title} · ${i.state} · ${i.user.login} · ${i.comments} comments`).join('\n') || 'No issues.';
        if (a.what === 'prs') return (await gh('GET', `/repos/${repo}/pulls?state=${st}&per_page=${n}`)).map(p => `#${p.number} ${p.title} · ${p.head.ref} → ${p.base.ref} · ${p.user.login}${p.draft ? ' · draft' : ''}`).join('\n') || 'No pull requests.';
        if (a.what === 'runs') return ((await gh('GET', `/repos/${repo}/actions/runs?per_page=${n}`)).workflow_runs || []).map(r => `• ${r.id} ${r.name} · ${r.head_branch} · ${r.status}${r.conclusion ? '/' + r.conclusion : ''} · ${new Date(r.created_at).toLocaleString()}`).join('\n') || 'No runs.';
        if (a.what === 'workflows') return ((await gh('GET', `/repos/${repo}/actions/workflows`)).workflows || []).map(w => `• ${w.name} · ${w.path} · ${w.state}`).join('\n');
        if (a.what === 'releases') return (await gh('GET', `/repos/${repo}/releases?per_page=${n}`)).map(r => `• ${r.tag_name} ${r.name || ''} · ${new Date(r.published_at).toLocaleDateString()} · assets: ${r.assets.map(x => x.name).join(', ') || 'none'}`).join('\n') || 'No releases.';
        if (a.what === 'branches') return (await gh('GET', `/repos/${repo}/branches?per_page=${n}`)).map(b => `• ${b.name}${b.protected ? ' (protected)' : ''}`).join('\n');
        return 'Unknown list type.';
      } },
    { name: 'github_search', group: 'GitHub', description: 'Search GitHub repositories, code or issues/PRs (GitHub search syntax).', parameters: P({ query: Str(''), type: Str('repositories | code | issues') }, ['query']),
      run: async a => { const t = a.type || 'repositories'; const d = await gh('GET', `/search/${t}?q=${enc(a.query)}&per_page=10`); return (d.items || []).map(x => t === 'repositories' ? `• ${x.full_name} ★${x.stargazers_count} · ${clip(x.description || '', 90)}` : t === 'code' ? `• ${x.repository.full_name}: ${x.path}` : `• ${x.repository_url.split('/').slice(-2).join('/')}#${x.number} ${x.title} · ${x.state}`).join('\n') || 'No results.'; } },
    { name: 'github_write', group: 'GitHub', risky: true, description: 'Write to GitHub: create_repo, put_file (create/update one file from text or a workspace file), delete_file, create_issue, comment (issue/PR), close_issue, create_pr, merge_pr, create_branch, create_release (optionally uploading a workspace file as asset), enable_pages.', parameters: P({ action: Str('action'), repo: Str('owner/name or name'), name: Str('repo name / release name'), private: Bool(''), description: Str(''), path: Str('file path in repo'), content: Str('file content (text)'), from: Str('or a workspace file to upload'), message: Str('commit message'), branch: Str(''), number: Num('issue/PR number'), title: Str(''), body: Str(''), head: Str('PR source branch'), base: Str('PR target branch'), tag: Str('release tag'), asset: Str('workspace file to attach to the release') }, ['action']),
      run: async a => {
        if (a.action === 'create_repo') { const r = await gh('POST', '/user/repos', { name: a.name || a.repo, private: a.private !== false, description: a.description || '', auto_init: true }); return `Created ${r.full_name} · ${r.html_url}`; }
        const repo = await ghRepo(a.repo);
        if (a.action === 'put_file' || a.action === 'delete_file') {
          let sha; try { sha = (await gh('GET', `/repos/${repo}/contents/${a.path.split('/').map(enc).join('/')}${a.branch ? '?ref=' + enc(a.branch) : ''}`)).sha; } catch (e) { if (e.status !== 404) throw e; }
          if (a.action === 'delete_file') { if (!sha) return 'File not found.'; await gh('DELETE', `/repos/${repo}/contents/${a.path.split('/').map(enc).join('/')}`, { message: a.message || `Delete ${a.path}`, sha, ...(a.branch ? { branch: a.branch } : {}) }); return 'Deleted ' + a.path; }
          const content = a.from ? await fsx.readB64(a.from) : utf8B64(a.content || '');
          const r = await gh('PUT', `/repos/${repo}/contents/${a.path.split('/').map(enc).join('/')}`, { message: a.message || `${sha ? 'Update' : 'Add'} ${a.path}`, content, ...(sha ? { sha } : {}), ...(a.branch ? { branch: a.branch } : {}) });
          return `${sha ? 'Updated' : 'Created'} ${a.path} · ${r.content.html_url}`;
        }
        if (a.action === 'create_issue') { const r = await gh('POST', `/repos/${repo}/issues`, { title: a.title, body: a.body || '' }); return `Opened #${r.number} · ${r.html_url}`; }
        if (a.action === 'comment') { const r = await gh('POST', `/repos/${repo}/issues/${a.number}/comments`, { body: a.body }); return 'Commented · ' + r.html_url; }
        if (a.action === 'close_issue') { await gh('PATCH', `/repos/${repo}/issues/${a.number}`, { state: 'closed' }); return `Closed #${a.number}`; }
        if (a.action === 'create_pr') { const r = await gh('POST', `/repos/${repo}/pulls`, { title: a.title, head: a.head, base: a.base || (await gh('GET', `/repos/${repo}`)).default_branch, body: a.body || '' }); return `Opened PR #${r.number} · ${r.html_url}`; }
        if (a.action === 'merge_pr') { const r = await gh('PUT', `/repos/${repo}/pulls/${a.number}/merge`, { merge_method: 'squash' }); return r.merged ? `Merged #${a.number}` : 'Not merged: ' + r.message; }
        if (a.action === 'create_branch') { const meta = await gh('GET', `/repos/${repo}`); const sha = (await gh('GET', `/repos/${repo}/git/ref/heads/${enc(a.base || meta.default_branch)}`)).object.sha; await gh('POST', `/repos/${repo}/git/refs`, { ref: `refs/heads/${a.branch}`, sha }); return `Created branch ${a.branch}`; }
        if (a.action === 'create_release') {
          const r = await gh('POST', `/repos/${repo}/releases`, { tag_name: a.tag, name: a.name || a.tag, body: a.body || '' });
          if (a.asset) { needNative('Uploads'); const up = await nativeAsync('uploadRaw', JSON.stringify({ url: `https://uploads.github.com/repos/${repo}/releases/${r.id}/assets?name=${enc(cleanPath(a.asset).replace(/^.*\//, ''))}`, method: 'POST', path: cleanPath(a.asset), headers: { Authorization: 'Bearer ' + ghToken(), Accept: 'application/vnd.github+json' } })); if (up.status >= 400) return `Release created (${r.html_url}) but asset upload failed: ${clip(up.body, 200)}`; }
          return `Released ${a.tag} · ${r.html_url}`;
        }
        if (a.action === 'enable_pages') { const meta = await gh('GET', `/repos/${repo}`); try { await gh('POST', `/repos/${repo}/pages`, { source: { branch: a.branch || meta.default_branch, path: '/' } }); } catch (e) { if (e.status !== 409) throw e; } const pg = await gh('GET', `/repos/${repo}/pages`); return `GitHub Pages: ${pg.html_url} (first build takes a minute)`; }
        return 'Unknown action.';
      } },
    { name: 'github_push', group: 'GitHub', risky: true, description: 'Commit a whole workspace folder (a project) to a GitHub repo in one commit, on a branch (created if missing).', parameters: P({ repo: Str('owner/name or name'), folder: Str('workspace folder'), branch: Str('optional branch (default: repo default)'), message: Str('commit message'), prefix: Str('optional path inside the repo') }, ['repo', 'folder']),
      run: async a => { const r = await ghPushFolder(a.repo, a.folder, a); return `Pushed ${r.files} files to ${r.repo}@${r.branch} · ${r.url}`; } },
    { name: 'github_actions', group: 'GitHub', description: 'GitHub Actions: status of a run, logs of failed jobs, download artifacts (APKs, builds) or release assets into the workspace; run/re-run a workflow (asks first).', parameters: P({ action: Str('status | logs | download_artifact | download_release | run | rerun'), repo: Str(''), run_id: Num('run id (default: latest)'), workflow: Str('workflow file or name for run'), ref: Str('branch for run'), inputs: { type: 'object', description: 'workflow_dispatch inputs' }, tag: Str('release tag (default latest)'), asset: Str('release asset name filter') }, ['action', 'repo']),
      run: async (a, ctx) => {
        const repo = await ghRepo(a.repo);
        const latest = async () => a.run_id || ((await gh('GET', `/repos/${repo}/actions/runs?per_page=1`)).workflow_runs || [{}])[0].id;
        if (a.action === 'run' || a.action === 'rerun') {
          if (S.settings.confirmActions && !(await confirmBox(`<b>${esc((ctx.agent || {}).name || 'Agent')}</b> wants to ${a.action} a GitHub workflow in <b>${esc(repo)}</b>.`, 60000))) return 'Declined.';
          if (a.action === 'rerun') { await gh('POST', `/repos/${repo}/actions/runs/${await latest()}/rerun`, {}); return 'Re-run started.'; }
          const wfs = (await gh('GET', `/repos/${repo}/actions/workflows`)).workflows || []; const wf = wfs.find(w => w.path.endsWith(a.workflow) || w.name.toLowerCase() === String(a.workflow || '').toLowerCase()) || wfs[0];
          if (!wf) return 'No workflows.'; await gh('POST', `/repos/${repo}/actions/workflows/${wf.id}/dispatches`, { ref: a.ref || (await gh('GET', `/repos/${repo}`)).default_branch, inputs: a.inputs || {} }); return `Started "${wf.name}". Check with github_actions status.`;
        }
        if (a.action === 'status') { const r = await gh('GET', `/repos/${repo}/actions/runs/${await latest()}`); const jobs = (await gh('GET', `/repos/${repo}/actions/runs/${r.id}/jobs`)).jobs || []; return `${r.name} #${r.run_number} · ${r.status}${r.conclusion ? '/' + r.conclusion : ''} · ${r.head_branch} · ${r.html_url}\n` + jobs.map(j => `  • ${j.name}: ${j.status}${j.conclusion ? '/' + j.conclusion : ''}${(j.steps || []).filter(s => s.conclusion === 'failure').map(s => ' ✗ ' + s.name).join('')}`).join('\n'); }
        if (a.action === 'logs') {
          const jobs = ((await gh('GET', `/repos/${repo}/actions/runs/${await latest()}/jobs`)).jobs || []); const bad = jobs.filter(j => j.conclusion === 'failure'); const pickJobs = bad.length ? bad : jobs.slice(-1);
          const out = []; for (const j of pickJobs) { const f = await ghDownload(`/repos/${repo}/actions/jobs/${j.id}/logs`, `tmp/log_${j.id}.txt`); const t = await fsx.readText(f.path); fsx.del(f.path); out.push(`== ${j.name}\n` + t.split('\n').slice(-80).map(l => l.replace(/^\S+Z /, '')).join('\n')); }
          return clip(out.join('\n\n'), 12000);
        }
        if (a.action === 'download_artifact') { const arts = (await gh('GET', `/repos/${repo}/actions/runs/${await latest()}/artifacts`)).artifacts || []; if (!arts.length) return 'No artifacts for that run.'; const out = []; for (const x of arts.slice(0, 5)) { const r = await ghDownload(`/repos/${repo}/actions/artifacts/${x.id}/zip`, `builds/${x.name}_${x.id}.zip`); out.push(`${x.name} → ${r.path} (${fmtSize(r.size)}) — unzip with zip_extract`); } return out.join('\n'); }
        if (a.action === 'download_release') {
          const rel = await gh('GET', a.tag ? `/repos/${repo}/releases/tags/${enc(a.tag)}` : `/repos/${repo}/releases/latest`);
          const assets = rel.assets.filter(x => !a.asset || x.name.toLowerCase().includes(a.asset.toLowerCase())); if (!assets.length) return `Release ${rel.tag_name} has no matching assets.`;
          const out = []; for (const x of assets.slice(0, 5)) { const r = await nativeAsync('download', JSON.stringify({ url: `https://api.github.com/repos/${repo}/releases/assets/${x.id}`, headers: { Authorization: 'Bearer ' + ghToken(), Accept: 'application/octet-stream' }, dropAuthOnRedirect: true, path: `downloads/${x.name}` })); out.push(`${x.name} → ${r.path}`); }
          return `${rel.tag_name}:\n` + out.join('\n');
        }
        return 'Unknown action.';
      } },
  );
  const utf8B64 = s => bytesToB64(new TextEncoder().encode(String(s)));

  /* ================================================================== settings */
  const coreRenderPro = renderProSettings, coreBindPro = bindProSettings;
  renderProSettings = () => coreRenderPro() + `<div class="card" id="devCard"><h3>Developer: GitHub, code &amp; scraping</h3>
    <div class="row"><div><label>GitHub token (github.com → Settings → Developer settings → fine-grained token)</label><input type="password" data-secret="svc_github" placeholder="${getKey('svc_github') ? 'saved ✓' : ''}"></div></div>
    <div class="row"><div><label>Code runner URL (Piston-compatible, optional)</label><input data-k="codeRunnerUrl" placeholder="https://piston.example.com/api/v2"></div></div>
    <label class="inline"><input type="checkbox" data-k="scrapeRespectRobots" data-t="bool">Scraper respects robots.txt</label>
    <h3 style="margin-top:.8em">App integrations</h3>
    ${S.customSkills.filter(s => s.kind === 'intent').map(s => `<div class="filerow"><span class="fname"><b>${esc(s.name)}</b> → ${esc(s.appLabel)} <span class="hint">${esc(s.mode)} ${esc(s.template || '')}</span></span><button class="small danger" data-rmint="${esc(s.id)}">✕</button></div>`).join('') || '<p class="hint">None yet — ask an agent: "turn Spotify search into a skill" (app_integrations → app_integrate).</p>'}
  </div>`;
  bindProSettings = v => {
    coreBindPro(v);
    const card = $('#devCard', v); if (!card) return;
    bind(card, S.settings);
    $$('[data-secret]', card).forEach(el => el.addEventListener('change', () => { setKey(el.dataset.secret, el.value); el.value = ''; el.placeholder = 'saved ✓'; toast('Saved on device'); }));
    $$('[data-rmint]', card).forEach(b => b.onclick = () => { S.customSkills = S.customSkills.filter(s => s.id !== b.dataset.rmint); save(); renderSettings(); });
  };

  window.NexusDev = { getDoc, pick, pageInfo, robotsAllowed, ghPushFolder, gh, runPython, TEMPLATES };
})();
