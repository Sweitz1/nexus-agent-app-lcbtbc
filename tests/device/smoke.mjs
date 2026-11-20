// Device smoke test for Nexus Agent (phone app) + Nexus Glasses on a real Android system image.
// Run by .github/workflows/device-test.yml on an emulator configured like a Moto G (2025):
// Android 15 (API 35), 720x1604 HD+ screen, 4 GB RAM. Drives the debug builds' WebViews through the
// DevTools protocol (enabled only in debuggable builds) and checks logcat for crashes.
// Usage: node tests/device/smoke.mjs <out-dir>
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = process.argv[2] || 'device-test-out';
mkdirSync(OUT, { recursive: true });
const PHONE = 'com.nexus.agent', GLASSES = 'com.nexus.agent.glasses';
const results = [];
const sh = (cmd, opt = {}) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000, ...opt }).trim();
const adb = cmd => sh(`adb ${cmd}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = name => { try { execSync(`adb exec-out screencap -p > "${OUT}/${name}.png"`, { shell: '/bin/bash', timeout: 30000 }); } catch (e) { console.log('screenshot failed', name, e.message); } };
function record(name, ok, detail = '') { results.push({ name, ok, detail: String(detail).slice(0, 400) }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + String(detail).slice(0, 300) : ''}`); }
async function check(name, fn) { try { const d = await fn(); record(name, true, d); return d; } catch (e) { record(name, false, e && e.message || e); return null; } }
const assert = (c, m) => { if (!c) throw new Error(m); };

// ---------------------------------------------------------------- DevTools protocol
async function waitFor(fn, ms = 30000, step = 500) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch (e) { last = e; } await sleep(step); } throw last || new Error('timed out'); }
async function attach(pkg, port) {
  const pid = await waitFor(() => adb(`shell pidof ${pkg}`).split(/\s+/)[0], 30000);
  const sock = await waitFor(() => { const u = adb('shell cat /proc/net/unix'); const m = u.match(new RegExp(`@?(webview_devtools_remote_${pid})\\b`)); return m && m[1]; }, 45000);
  adb(`forward tcp:${port} localabstract:${sock}`);
  const target = await waitFor(async () => { const r = await fetch(`http://127.0.0.1:${port}/json/list`); const l = await r.json(); return l.find(t => t.type === 'page' && /appassets\.androidplatform\.net/.test(t.url)); }, 30000);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let n = 0; const pending = new Map(); const errors = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text);
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const id = ++n; pending.set(id, m => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error(method + ' timed out')); } }, 120000); });
  await send('Runtime.enable');
  const evaluate = async (body, timeoutMs) => {
    const r = await send('Runtime.evaluate', { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true, timeout: timeoutMs || 60000 });
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception || {}).description || r.exceptionDetails.text);
    return r.result.value;
  };
  return { pid, evaluate, errors, close: () => ws.close() };
}

// ---------------------------------------------------------------- run
(async () => {
  const props = { model: adb('shell getprop ro.product.model'), release: adb('shell getprop ro.build.version.release'), sdk: adb('shell getprop ro.build.version.sdk'), abi: adb('shell getprop ro.product.cpu.abi'), size: adb('shell wm size'), density: adb('shell wm density'), mem: adb("shell grep MemTotal /proc/meminfo"), font: adb('shell settings get system font_scale') };
  console.log('Device:', JSON.stringify(props));
  adb(`shell am start -W -n ${PHONE}/.MainActivity`);
  const phone = await check('Phone app starts and its page loads', async () => {
    const p = await attach(PHONE, 9222);
    await waitFor(() => p.evaluate('return !!(window.Nexus && window.NexusRoleplay && window.NexusConnect && window.NexusPhoneServer)'), 30000);
    return p;
  });
  if (!phone) { finish(); return; }
  globalThis.phoneConn = phone;
  shot('01_phone_start');

  await check('Native bridge is active (Android 15 / API 35)', async () => {
    const d = await phone.evaluate('return JSON.parse(NexusNative.deviceInfo())');
    assert(Number(d.sdk) >= 35, 'expected API 35+, got ' + d.sdk); return `${d.manufacturer} ${d.model}, Android ${d.release} (API ${d.sdk}), app ${d.version}`;
  });
  await check('Phone app opens in portrait on a phone (not forced to landscape)', async () => {
    const r = await phone.evaluate('return { w: innerWidth, h: innerHeight }');
    assert(r.h > r.w, `page is ${r.w}x${r.h} (landscape)`); return `${r.w}x${r.h} CSS px`;
  });
  await check('Display mode on a phone screen: no binocular mirror, no temple mode', async () => {
    const d = await phone.evaluate('return JSON.parse(NexusNative.displayMode())');
    assert(!d.mirrorActive && !d.templeActive, JSON.stringify(d)); return `${d.width}x${d.height}, mirror ${d.mirrorEngine}, temple ${d.templeActive}`;
  });
  // every tab renders without errors and fits the 720 px wide screen
  const tabs = await phone.evaluate("return [...document.querySelectorAll('#tabs button')].map(b => b.dataset.tab)");
  for (const t of tabs) {
    await check(`Tab "${t}" renders without errors and fits the screen width`, async () => {
      const before = phone.errors.length;
      const r = await phone.evaluate(`showTab(${JSON.stringify(t)}); await new Promise(r => setTimeout(r, 600)); const v = document.querySelector('#view-' + ${JSON.stringify(t)}); const wide = [...(v ? v.querySelectorAll('*') : [])].filter(e => e.getBoundingClientRect().right > innerWidth + 2 && getComputedStyle(e).position !== 'fixed' && e.offsetParent !== null).slice(0, 3).map(e => e.tagName + '#' + e.id + '.' + e.className); return { w: innerWidth, sw: document.documentElement.scrollWidth, wide };`);
      const errs = phone.errors.slice(before);
      assert(!errs.length, 'JS errors: ' + errs.join(' | '));
      assert(r.sw <= r.w + 2, `page is ${r.sw}px wide on a ${r.w}px screen: ${r.wide.join(', ')}`);
      return `${r.w}px wide`;
    });
    shot(`02_tab_${t}`);
  }
  await check('Workspace files: write, list, read back', async () => {
    const r = await phone.evaluate("const p = await fsx.writeText('device-test/hello.txt', 'hi from the device test'); const t = await fsx.readText(p); return { p, t }");
    assert(r.t === 'hi from the device test', JSON.stringify(r)); return r.p;
  });
  await check('Built-in skills run (date/time, audio output, Bluetooth)', async () => {
    const r = await phone.evaluate("const ctx = { agent: Nexus.S.agents[0], depth: 0 }; const out = {}; for (const n of ['datetime', 'audio_output', 'bluetooth_devices']) { try { out[n] = String(await execSkill(n, {}, ctx)).slice(0, 120); } catch (e) { out[n] = 'ERR ' + e.message; } } return out;");
    assert(!/^ERR/.test(r.datetime || 'ERR'), 'datetime: ' + r.datetime);
    return JSON.stringify(r);
  });
  // local server (used by the glasses app, webhooks and SillyTavern)
  const token = await check('Local server starts (foreground service on Android 15)', async () => {
    await phone.evaluate("Nexus.S.settings.server.enabled = true; save(); applyServer(); await new Promise(r => setTimeout(r, 1500)); if (!NexusNative.serverRunning()) throw new Error('server not running');");
    return phone.evaluate('return Nexus.S.settings.server.token');
  });
  if (token) {
    adb('forward tcp:18787 tcp:8787');
    await check('Server answers /health and rejects a missing token', async () => {
      const h = await (await fetch('http://127.0.0.1:18787/health')).json();
      const bad = await fetch('http://127.0.0.1:18787/v1/models');
      assert(h.ok && bad.status === 401, `health ${JSON.stringify(h)}, no-token status ${bad.status}`); return 'ok, 401 without token';
    });
    await check('SillyTavern API /v1/models with the token', async () => {
      const r = await fetch('http://127.0.0.1:18787/v1/models', { headers: { Authorization: 'Bearer ' + token } });
      const j = await r.json(); assert(r.status === 200 && Array.isArray(j.data), r.status + ' ' + JSON.stringify(j).slice(0, 200)); return `${j.data.length} models listed`;
    });
  }
  // roleplay
  await check('Roleplay: add a gallery character, start a chat, export and re-read its card', async () => {
    const r = await phone.evaluate("const st = NexusRoleplay.STARTERS.find(s => s.key === 'juniper'); const c = await NexusRoleplay.addStarter(st); const ch = NexusRoleplay.newChat([c.id]); const p = await NexusRoleplay.exportCard(c, 'png'); const j = NexusRoleplay.readCardPng(await fsx.bytes(p)); NexusRoleplay.openChat(ch.id); await new Promise(r => setTimeout(r, 500)); return { greeting: ch.messages[0].text().slice(0, 40), exported: p, name: j.data.name, msgs: document.querySelectorAll('.rp-m').length };");
    assert(r.name === 'Juniper' && r.msgs >= 1, JSON.stringify(r)); return JSON.stringify(r);
  });
  shot('03_roleplay_chat');
  // glasses app on the same device, paired with the phone app over the local server
  adb(`shell am start -W -n ${GLASSES}/com.nexus.glasses.ClientActivity`);
  const glasses = await check('Glasses app starts and its page loads', async () => {
    const g = await attach(GLASSES, 9223);
    await waitFor(() => g.evaluate('return !!window.NexusGlassesClient'), 30000);
    return g;
  });
  shot('04_glasses_connect');
  if (glasses && token) {
    await check('Glasses app pairs with the phone app (PIN) over the local server', async () => {
      const pin = await phone.evaluate('return NexusPhoneServer.newPin()');
      await glasses.evaluate(`await NexusGlassesClient.pair('127.0.0.1', 8787, ${JSON.stringify(pin)})`);
      await waitFor(() => glasses.evaluate("return document.querySelector('#main').classList.contains('on') && /Connected to/.test(document.querySelector('#reply').textContent)"), 20000);
      return glasses.evaluate("return document.querySelector('#reply').textContent.match(/Connected to[^\\n]*/)[0].slice(0, 100)");
    });
    shot('05_glasses_main');
    await check('Glasses roleplay list comes from the phone', async () => {
      await glasses.evaluate('await NexusGlassesClient.rpList()');
      const names = await waitFor(() => glasses.evaluate("const n = [...document.querySelectorAll('#rpBody .ch .t')].map(x => x.textContent); return n.length ? n : null"), 15000);
      assert(names.some(n => /Juniper/.test(n)), JSON.stringify(names)); return JSON.stringify(names);
    });
    shot('06_glasses_roleplay');
    await check('Glasses app follows the phone orientation when not on AR glasses', async () => {
      const r = await glasses.evaluate('return { w: innerWidth, h: innerHeight }'); assert(r.h > r.w, `page is ${r.w}x${r.h} (landscape)`); return `${r.w}x${r.h}`;
    });
    await check('Glasses display mode on a phone-shaped screen: no mirror', async () => {
      const d = await glasses.evaluate('return JSON.parse(NexusClient.displayMode())'); assert(!d.mirrorActive, JSON.stringify(d)); return `mirror ${d.mirrorEngine}`;
    });
    await check('Glasses app: Bluetooth state and paired list', async () => {
      const r = await glasses.evaluate("const st = await new Promise((res, rej) => { const id = 'bt' + Date.now(); const prev = window.__cb; window.__cb = (i, ok, v) => { if (i === id) { window.__cb = prev; ok ? res(v) : rej(new Error(v.error || 'btState failed')); } else prev(i, ok, v); }; NexusClient.btState(id); }); return st;");
      return `available ${r.available}, enabled ${r.enabled}, audio ${r.audioOutput && r.audioOutput.active}`;
    });
    await check('Glasses app: 3DoF head tracking delivers poses', async () => {
      const st = await glasses.evaluate("return JSON.parse(NexusClient.headTrackStart('3dof', false))");
      const pose = await waitFor(() => glasses.evaluate("const p = NexusGlassesClient.track.last; return p && p.tracked ? p : null"), 8000);
      return `${st.mode}; pose yaw ${pose.yaw} pitch ${pose.pitch}`;
    });
    await check('Glasses app: 6DoF library loads and falls back cleanly without an OpenXR runtime', async () => {
      const st = await glasses.evaluate("return JSON.parse(NexusClient.headTrackStart('6dof', false))");
      assert(st.sixDofBuilt, 'native library not loaded: ' + JSON.stringify(st));
      const s2 = await waitFor(() => glasses.evaluate("const s = JSON.parse(NexusClient.headTrackStatus()); return s.mode !== '6dof' || /tracking/.test(s.runtime || '') ? s : null"), 15000);
      await glasses.evaluate("NexusClient.headTrackStop()");
      assert(adb(`shell pidof ${GLASSES}`), 'glasses app process died');
      return `${s2.mode}${s2.note ? ' — ' + s2.note : ''}${s2.runtime ? ' — ' + s2.runtime : ''}`;
    });
    await check('No JavaScript errors in the glasses app', async () => { assert(!glasses.errors.length, glasses.errors.join(' | ')); return 'none'; });
  }
  // lifecycle: background / resume, rotation
  await check('Phone app survives background + resume', async () => {
    adb('shell input keyevent KEYCODE_HOME'); await sleep(2500);
    adb(`shell am start -W -n ${PHONE}/.MainActivity`); await sleep(2500);
    const pid = adb(`shell pidof ${PHONE}`); assert(pid, 'process gone'); return 'pid ' + pid;
  });
  await check('Server keeps running while the app is in the background', async () => {
    adb('shell input keyevent KEYCODE_HOME'); await sleep(4000);
    const h = await (await fetch('http://127.0.0.1:18787/health')).json(); adb(`shell am start -W -n ${PHONE}/.MainActivity`); assert(h.ok, JSON.stringify(h)); return 'ok';
  });
  await check('Phone app rotates to landscape and back, page keeps its state', async () => {
    adb('shell settings put system accelerometer_rotation 0'); adb('shell settings put system user_rotation 1'); await sleep(3000); shot('07_landscape');
    const l = await phone.evaluate('return { w: innerWidth, h: innerHeight, nexus: !!window.Nexus }'); assert(l.w > l.h && l.nexus, 'landscape: ' + JSON.stringify(l));
    adb('shell settings put system user_rotation 0'); await sleep(2500);
    assert(adb(`shell pidof ${PHONE}`), 'process gone'); return 'ok';
  });
  await check('No JavaScript errors in the phone app', async () => { const e = phone.errors.filter(x => !/Failed to load resource|net::ERR_/.test(x)); assert(!e.length, e.join(' | ')); return 'none'; });
  finish();
})().catch(e => { record('Test runner', false, e.stack || e.message); finish(); });

function finish() {
  let log = '';
  try { log = sh('adb logcat -d -v brief', { maxBuffer: 64 * 1024 * 1024 }); } catch (e) { log = String(e.stdout || ''); }
  writeFileSync(`${OUT}/logcat.txt`, log);
  const crashes = log.split('\n').filter(l => /FATAL EXCEPTION|ANR in com\.nexus|Process: com\.nexus|ForegroundServiceStartNotAllowed|SecurityException.*com\.nexus/.test(l));
  record('No crashes, ANRs or permission exceptions in logcat', crashes.length === 0, crashes.slice(0, 6).join(' | '));
  const pass = results.filter(r => r.ok).length;
  const md = `# Device test: Moto G (2025)-like emulator\n\nAndroid 15 (API 35), 720x1604 @ 280 dpi, 4 GB RAM, x86_64 emulator image.\n\n**${pass}/${results.length} passed**\n\n| | Check | Detail |\n|---|---|---|\n` + results.map(r => `| ${r.ok ? '✅' : '❌'} | ${r.name} | ${r.detail.replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`).join('\n') + '\n';
  writeFileSync(`${OUT}/report.md`, md);
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, md, { flag: 'a' });
  console.log(`\n${pass}/${results.length} checks passed`);
  process.exit(pass === results.length ? 0 : 1);
}
