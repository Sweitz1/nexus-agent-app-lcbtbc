/* Nexus Agent — pro skills: files, coding, engineering, images, PDF, OCR, zip, video,
 * Apple Maps, phone, translation. Loaded after the core script in index.html and shares
 * its globals (S, N, http, BUILTIN_SKILLS, runAgent, ...). */
'use strict';

/* ====================================================================== workspace files */
const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp)$/i;
const TEXT_RE = /\.(txt|md|markdown|csv|tsv|json|jsonl|xml|html?|css|js|mjs|cjs|ts|tsx|jsx|py|java|kt|kts|c|h|cc|cpp|hpp|cs|go|rs|rb|php|swift|m|sh|bash|zsh|ps1|bat|sql|yaml|yml|toml|ini|cfg|conf|env|gradle|properties|lua|r|dart|scala|pl|vue|svelte|tex|log|gitignore|dockerfile)$/i;
const isImagePath = p => IMAGE_RE.test(p || '');
const isTextPath = p => TEXT_RE.test(p || '') || !/\.[a-z0-9]{1,8}$/i.test(p || '');
const cleanPath = p => String(p || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/^workspace\//, '');
const wsUrl = p => location.origin + '/workspace/' + cleanPath(p).split('/').map(encodeURIComponent).join('/');
const stemOf = p => cleanPath(p).replace(/^.*\//, '').replace(/\.[^.]+$/, '');
const dirOf = p => { const c = cleanPath(p); return c.includes('/') ? c.replace(/\/[^/]*$/, '') : ''; };
const extOf = p => ((cleanPath(p).match(/\.([^./]+)$/) || [])[1] || '').toLowerCase();
const fmtSize = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
const tsName = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '_');

function needNative(what) { if (!N) throw new Error((what || 'This skill') + ' is only available in the Android app'); }
function chk(r) { const o = typeof r === 'string' ? parseJSON(r, { error: r }) : r; if (o && !Array.isArray(o) && o.error) throw new Error(o.error); return o; }

const fsx = {
  list: (dir = '', rec = false) => { needNative('File access'); return chk(N.fsList(cleanPath(dir), !!rec)); },
  stat: p => { needNative('File access'); return chk(N.fsStat(cleanPath(p))); },
  readText: async p => { needNative('File access'); return (await nativeAsync('fsReadText', cleanPath(p))).text; },
  readB64: async p => { needNative('File access'); return (await nativeAsync('fsReadB64', cleanPath(p))).b64; },
  writeText: async (p, t) => { needNative('File access'); return (await nativeAsync('fsWriteText', cleanPath(p), String(t))).path; },
  writeB64: async (p, b) => { needNative('File access'); return (await nativeAsync('fsWriteB64', cleanPath(p), b)).path; },
  writeBytes: async (p, bytes) => fsx.writeB64(p, bytesToB64(bytes)),
  writeBlob: async (p, blob) => fsx.writeB64(p, await blobToB64(blob)),
  del: p => { needNative('File access'); return chk(N.fsDelete(cleanPath(p))); },
  move: (a, b) => { needNative('File access'); return chk(N.fsMove(cleanPath(a), cleanPath(b))).path; },
  bytes: async p => { const r = await fetch(wsUrl(p), { cache: 'no-store' }); if (!r.ok) throw new Error('Cannot read ' + p); return new Uint8Array(await r.arrayBuffer()); },
  exists: p => { try { return !!fsx.stat(p).exists; } catch { return false; } },
};
function bytesToB64(bytes) {
  let s = ''; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}
function blobToB64(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
}
function uniquePath(p) {
  p = cleanPath(p); if (!fsx.exists(p)) return p;
  const m = p.match(/^(.*?)(\.[^./]+)?$/);
  for (let i = 2; i < 999; i++) { const c = `${m[1]} (${i})${m[2] || ''}`; if (!fsx.exists(c)) return c; }
  return p;
}

/* ====================================================================== permissions, libraries */
async function ensurePermission(perm) {
  if (!N) return true;
  if (N.hasPermission(perm)) return true;
  return !!(await nativeAsync('requestPermission', perm)).granted;
}
const _libs = {};
function loadScript(src) {
  return _libs[src] = _libs[src] || new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Failed to load ' + src)); document.head.appendChild(s); });
}
async function pdfjs() { await loadScript('lib/pdfjs/pdf.min.js'); window.pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('lib/pdfjs/pdf.worker.min.js', location.href).href; return window.pdfjsLib; }
async function pdflib() { await loadScript('lib/pdf-lib.min.js'); return window.PDFLib; }

/* ====================================================================== images & vision */
function loadImage(src) {
  return new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error('Cannot decode image ' + src)); img.src = src; });
}
async function imageFromPath(p) { return loadImage(wsUrl(p) + '?t=' + Date.now()); }
function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
function canvasToBlob(c, mime, q) { return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('encode failed')), mime, q)); }
const mimeForExt = e => ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', png: 'image/png' }[e] || 'image/png');

/** Downscales images for vision models (max 1568px long side, JPEG). */
async function loadImagesForModel(paths, max = 1568) {
  const out = [];
  for (const p of paths.slice(0, 8)) {
    const img = await imageFromPath(p);
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = canvasOf(img.naturalWidth * k, img.naturalHeight * k);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    out.push({ mime: 'image/jpeg', b64: (c.toDataURL('image/jpeg', 0.85).split(',')[1]) });
  }
  return out;
}
function visionAgent(ctx) {
  const a = agentById(S.settings.visionAgent) || (ctx && ctx.agent) || S.agents[0];
  return { ...a, tools: false };
}
async function visionAsk(paths, question, ctx) {
  const imgs = paths.filter(isImagePath);
  if (!imgs.length) throw new Error('No image files given (png/jpg/webp/gif/bmp)');
  const a = visionAgent(ctx);
  const r = await runAgent(a, question || 'Describe this image in detail.', { images: await loadImagesForModel(imgs), token: ctx ? ctx.token : runToken, depth: 9 });
  return `[${a.name} · ${a.model}] ${stripThink(r.text)}`;
}

const IMAGE_OPS = {
  resize: (c, o) => { const w = o.width || (o.height ? c.width * o.height / c.height : c.width); const h = o.height || (o.width ? c.height * o.width / c.width : c.height); return draw(canvasOf(w, h), c); },
  scale: (c, o) => draw(canvasOf(c.width * (o.factor || 0.5), c.height * (o.factor || 0.5)), c),
  crop: (c, o) => { const n = canvasOf(o.width || c.width - (o.x || 0), o.height || c.height - (o.y || 0)); n.getContext('2d').drawImage(c, -(o.x || 0), -(o.y || 0)); return n; },
  rotate: (c, o) => { const d = ((o.degrees || 90) % 360 + 360) % 360, r = d * Math.PI / 180; const sin = Math.abs(Math.sin(r)), cos = Math.abs(Math.cos(r)); const n = canvasOf(c.width * cos + c.height * sin, c.width * sin + c.height * cos); const g = n.getContext('2d'); g.translate(n.width / 2, n.height / 2); g.rotate(r); g.drawImage(c, -c.width / 2, -c.height / 2); return n; },
  flip: (c, o) => { const n = canvasOf(c.width, c.height); const g = n.getContext('2d'); const v = o.direction === 'vertical'; g.translate(v ? 0 : c.width, v ? c.height : 0); g.scale(v ? 1 : -1, v ? -1 : 1); g.drawImage(c, 0, 0); return n; },
  grayscale: c => filter(c, 'grayscale(1)'), sepia: c => filter(c, 'sepia(1)'), invert: c => filter(c, 'invert(1)'),
  brightness: (c, o) => filter(c, `brightness(${o.value ?? 1.2})`), contrast: (c, o) => filter(c, `contrast(${o.value ?? 1.3})`),
  saturate: (c, o) => filter(c, `saturate(${o.value ?? 1.5})`), blur: (c, o) => filter(c, `blur(${o.radius ?? 3}px)`),
  hue: (c, o) => filter(c, `hue-rotate(${o.degrees ?? 90}deg)`),
  sharpen: c => convolve(c, [0, -1, 0, -1, 5, -1, 0, -1, 0]), edges: c => convolve(c, [-1, -1, -1, -1, 8, -1, -1, -1, -1]),
  threshold: (c, o) => pixels(c, d => { const t = o.value ?? 128; for (let i = 0; i < d.length; i += 4) { const v = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) >= t ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; } }),
  text: (c, o) => { const g = c.getContext('2d'); g.font = `bold ${o.size || 32}px sans-serif`; g.fillStyle = o.color || '#ffffff'; g.strokeStyle = '#000'; g.lineWidth = Math.max(2, (o.size || 32) / 10); g.strokeText(o.text || '', o.x || 10, o.y || (o.size || 32) + 10); g.fillText(o.text || '', o.x || 10, o.y || (o.size || 32) + 10); return c; },
};
function draw(n, c) { const g = n.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, n.width, n.height); return n; }
function filter(c, f) { const n = canvasOf(c.width, c.height); const g = n.getContext('2d'); g.filter = f; g.drawImage(c, 0, 0); return n; }
function pixels(c, fn) { const g = c.getContext('2d'); const im = g.getImageData(0, 0, c.width, c.height); fn(im.data, c.width, c.height); g.putImageData(im, 0, 0); return c; }
function convolve(c, k) {
  const g = c.getContext('2d'); const src = g.getImageData(0, 0, c.width, c.height); const out = g.createImageData(c.width, c.height);
  const w = c.width, h = c.height, s = src.data, d = out.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    for (let ch = 0; ch < 3; ch++) {
      let v = 0;
      for (let ky = -1; ky <= 1; ky++) for (let kx = -1; kx <= 1; kx++) { const xx = Math.min(w - 1, Math.max(0, x + kx)), yy = Math.min(h - 1, Math.max(0, y + ky)); v += s[(yy * w + xx) * 4 + ch] * k[(ky + 1) * 3 + kx + 1]; }
      d[(y * w + x) * 4 + ch] = Math.min(255, Math.max(0, v));
    }
    d[(y * w + x) * 4 + 3] = s[(y * w + x) * 4 + 3];
  }
  g.putImageData(out, 0, 0); return c;
}

/* ====================================================================== camera */
let _camStream = null;
/** In-app camera (secure origin + getUserMedia), falling back to the system camera app. */
async function takePhoto({ attach = false, auto = false, path = '' } = {}) {
  needNative('Camera');
  if (!(await ensurePermission('android.permission.CAMERA'))) throw new Error('Camera permission denied');
  let saved;
  try {
    saved = await inAppCamera(auto, path);
  } catch (e) {
    if (e.message === 'cancelled') throw e;
    saved = (await nativeAsync('capturePhoto', path || `camera/photo_${tsName()}.jpg`)).path;
  }
  if (attach && saved) { pendingAttachments.push(saved); renderChips(); }
  return saved;
}
function inAppCamera(auto, path) {
  return new Promise(async (res, rej) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return rej(new Error('no getUserMedia'));
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }); }
    catch (e) { return rej(e); }
    _camStream = stream;
    const box = $('#modalBox');
    box.innerHTML = `<video id="camVideo" autoplay playsinline muted></video><div class="row" style="margin-top:.6em"><button class="primary" id="camShot">📸 Capture</button><button id="camNo">Cancel</button><span class="hint" id="camCount"></span></div>`;
    $('#modal').classList.add('show');
    const v = $('#camVideo'); v.srcObject = stream;
    let timer;
    const stop = () => { clearInterval(timer); stream.getTracks().forEach(t => t.stop()); _camStream = null; $('#modal').classList.remove('show'); modalClose = null; };
    const shoot = async () => {
      try {
        const c = canvasOf(v.videoWidth || 1280, v.videoHeight || 720); c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        const blob = await canvasToBlob(c, 'image/jpeg', 0.9); stop();
        if (N) N.vibrate(40);
        res(await fsx.writeBlob(path || `camera/photo_${tsName()}.jpg`, blob));
      } catch (e) { stop(); rej(e); }
    };
    modalClose = () => { stop(); rej(new Error('cancelled')); };
    $('#camShot').onclick = shoot; $('#camNo').onclick = modalClose; $('#camShot').focus();
    if (auto) {
      let n = Math.max(0, Number(S.settings.cameraCountdown) || 0);
      await new Promise(r => v.onloadeddata = r);
      if (!n) return shoot();
      $('#camCount').textContent = `capturing in ${n}…`;
      timer = setInterval(() => { n--; if (n <= 0) { clearInterval(timer); shoot(); } else $('#camCount').textContent = `capturing in ${n}…`; }, 1000);
    }
  });
}
async function importFiles(mime) { needNative('File import'); return (await nativeAsync('pickFiles', mime || '*/*')).files || []; }

/* ====================================================================== chat attachments */
const pendingAttachments = [];
function renderChips() {
  const el = $('#chips'); if (!el) return;
  el.innerHTML = pendingAttachments.map((p, i) => `<span class="chip">${isImagePath(p) ? `<img src="${esc(wsUrl(p))}" alt="">` : '📄'}${esc(p.replace(/^.*\//, ''))}<button class="small" data-rm="${i}" title="Remove">✕</button></span>`).join('');
  $$('[data-rm]', el).forEach(b => b.onclick = () => { pendingAttachments.splice(Number(b.dataset.rm), 1); renderChips(); });
}
onNative('shared_files', p => { pendingAttachments.push(...(p.files || [])); renderChips(); showTab('chat'); if (p.text) $('#input').value = p.text; toast(`${(p.files || []).length} file(s) attached`); });

/* ====================================================================== engineering math */
function compileExpr(expr, vars = []) {
  const ex = String(expr || '');
  if (!/^[0-9+\-*/().,%^\s a-zA-Z_]*$/.test(ex)) throw new Error('invalid characters in expression');
  const ids = ex.match(/[a-zA-Z_][a-zA-Z_0-9]*/g) || [];
  const bad = ids.filter(id => !(id in Math) && !vars.includes(id) && !['ln', 'log10', 'log2', 'pi', 'e'].includes(id));
  if (bad.length) throw new Error('unknown identifier(s): ' + [...new Set(bad)].join(', '));
  const js = ex.replace(/\^/g, '**').replace(/[a-zA-Z_][a-zA-Z_0-9]*/g, m => vars.includes(m) ? `V.${m}` : m === 'ln' ? 'M.log' : m === 'pi' ? 'M.PI' : m === 'e' ? 'M.E' : 'M.' + m);
  const fn = new Function('M', 'V', 'return (' + js + ')');
  return v => fn(Math, v || {});
}
function gaussSolve(A, b) {
  const n = A.length; const M = A.map((r, i) => [...r.map(Number), Number(b[i])]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) throw new Error('matrix is singular');
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
function det(A) {
  const n = A.length; const M = A.map(r => r.map(Number)); let d = 1;
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-15) return 0;
    if (p !== c) { [M[c], M[p]] = [M[p], M[c]]; d = -d; }
    d *= M[c][c];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k < n; k++) M[r][k] -= f * M[c][k]; }
  }
  return d;
}
function inverse(A) { const n = A.length; const I = A.map((_, i) => A.map((__, j) => (i === j ? 1 : 0))); const cols = I.map(col => gaussSolve(A, col)); return A.map((_, i) => cols.map(c => c[i])); }
const matmul = (A, B) => A.map(r => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
const round = x => typeof x === 'number' ? Number(x.toPrecision(12)) : Array.isArray(x) ? x.map(round) : (x && typeof x === 'object') ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, round(v)])) : x;
function polyRoots(coeffs) {
  const a = coeffs.map(Number); while (a.length && a[0] === 0) a.shift();
  const n = a.length - 1; if (n < 1) throw new Error('need degree >= 1');
  const c = a.map(v => v / a[0]);
  let z = Array.from({ length: n }, (_, k) => ({ re: Math.cos(2 * Math.PI * k / n + 0.4) * 0.9, im: Math.sin(2 * Math.PI * k / n + 0.4) * 0.9 }));
  const mul = (x, y) => ({ re: x.re * y.re - x.im * y.im, im: x.re * y.im + x.im * y.re });
  const div = (x, y) => { const d = y.re * y.re + y.im * y.im; return { re: (x.re * y.re + x.im * y.im) / d, im: (x.im * y.re - x.re * y.im) / d }; };
  const ev = x => c.reduce((acc, v) => { const m = mul(acc, x); return { re: m.re + v, im: m.im }; }, { re: 0, im: 0 });
  for (let it = 0; it < 500; it++) {
    z = z.map((zi, i) => { let den = { re: 1, im: 0 }; z.forEach((zj, j) => { if (i !== j) den = mul(den, { re: zi.re - zj.re, im: zi.im - zj.im }); }); const q = div(ev(zi), den); return { re: zi.re - q.re, im: zi.im - q.im }; });
  }
  return z.map(r => Math.abs(r.im) < 1e-9 ? round(r.re) : `${round(r.re)} ${r.im < 0 ? '-' : '+'} ${round(Math.abs(r.im))}i`);
}
function stats(data) {
  const x = data.map(Number).filter(v => !isNaN(v)).sort((a, b) => a - b); const n = x.length; if (!n) throw new Error('no numbers');
  const sum = x.reduce((a, b) => a + b, 0), mean = sum / n;
  const q = p => { const i = (n - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return x[lo] + (x[hi] - x[lo]) * (i - lo); };
  const ss = x.reduce((a, v) => a + (v - mean) ** 2, 0);
  return round({ n, sum, mean, median: q(0.5), min: x[0], max: x[n - 1], q1: q(0.25), q3: q(0.75), std_population: Math.sqrt(ss / n), std_sample: n > 1 ? Math.sqrt(ss / (n - 1)) : 0, variance_sample: n > 1 ? ss / (n - 1) : 0 });
}
const UNITS = {
  length: { m: 1, km: 1e3, cm: 0.01, mm: 1e-3, um: 1e-6, nm: 1e-9, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344, nmi: 1852, mil: 2.54e-5 },
  mass: { kg: 1, g: 1e-3, mg: 1e-6, t: 1000, lb: 0.45359237, oz: 0.028349523125, st: 6.35029318, ton_us: 907.18474 },
  time: { s: 1, ms: 1e-3, us: 1e-6, min: 60, h: 3600, day: 86400, week: 604800, year: 31557600 },
  area: { m2: 1, km2: 1e6, cm2: 1e-4, mm2: 1e-6, ft2: 0.09290304, in2: 6.4516e-4, acre: 4046.8564224, ha: 1e4, mi2: 2589988.110336 },
  volume: { m3: 1, l: 1e-3, ml: 1e-6, cm3: 1e-6, gal: 0.003785411784, qt: 9.46352946e-4, pt: 4.73176473e-4, cup: 2.365882365e-4, floz: 2.95735295625e-5, ft3: 0.028316846592, in3: 1.6387064e-5, gal_uk: 0.00454609 },
  speed: { 'm/s': 1, 'km/h': 1 / 3.6, mph: 0.44704, knot: 0.514444, 'ft/s': 0.3048, mach: 343 },
  pressure: { pa: 1, kpa: 1e3, mpa: 1e6, bar: 1e5, mbar: 100, atm: 101325, psi: 6894.757293, torr: 133.322368, mmhg: 133.322387, inhg: 3386.389 },
  energy: { j: 1, kj: 1e3, mj: 1e6, cal: 4.184, kcal: 4184, wh: 3600, kwh: 3.6e6, btu: 1055.05585, ev: 1.602176634e-19, ftlb: 1.3558179483 },
  power: { w: 1, kw: 1e3, mw: 1e6, hp: 745.69987, ps: 735.49875, 'btu/h': 0.29307107 },
  force: { n: 1, kn: 1e3, lbf: 4.4482216153, kgf: 9.80665, dyn: 1e-5 },
  torque: { nm: 1, 'lbf*ft': 1.3558179483, 'lbf*in': 0.112984829 },
  data: { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, kib: 1024, mib: 1048576, gib: 1073741824, tib: 1099511627776, bit: 0.125 },
  frequency: { hz: 1, khz: 1e3, mhz: 1e6, ghz: 1e9, rpm: 1 / 60 },
  angle: { rad: 1, deg: Math.PI / 180, grad: Math.PI / 200, turn: 2 * Math.PI },
  electric: { a: 1, ma: 1e-3, ua: 1e-6, ka: 1e3 },
  voltage: { v: 1, mv: 1e-3, kv: 1e3 },
};
const UNIT_ALIASES = { meter: 'm', meters: 'm', metre: 'm', kilometer: 'km', kilometers: 'km', inch: 'in', inches: 'in', foot: 'ft', feet: 'ft', mile: 'mi', miles: 'mi', yard: 'yd', kilogram: 'kg', kilograms: 'kg', gram: 'g', grams: 'g', pound: 'lb', pounds: 'lb', lbs: 'lb', ounce: 'oz', liter: 'l', liters: 'l', litre: 'l', gallon: 'gal', gallons: 'gal', second: 's', seconds: 's', minute: 'min', minutes: 'min', hour: 'h', hours: 'h', hr: 'h', kph: 'km/h', kmh: 'km/h', 'mi/h': 'mph', knots: 'knot', kt: 'knot', 'n*m': 'nm', 'n·m': 'nm', degree: 'deg', degrees: 'deg', joule: 'j', watt: 'w', watts: 'w', horsepower: 'hp', newton: 'n', pascal: 'pa', 'm^2': 'm2', 'sq m': 'm2', 'sq ft': 'ft2', 'm^3': 'm3', 'cc': 'cm3' };
function convertUnits(value, from, to) {
  const norm = u => { u = String(u).trim().toLowerCase().replace(/²/g, '2').replace(/³/g, '3').replace(/°/g, ''); return UNIT_ALIASES[u] || u; };
  const f = norm(from), t = norm(to), v = Number(value);
  const T = { c: 'c', celsius: 'c', f: 'f', fahrenheit: 'f', k: 'k', kelvin: 'k', r: 'r', rankine: 'r' };
  if (T[f] && T[t]) {
    const toK = { c: x => x + 273.15, f: x => (x - 32) * 5 / 9 + 273.15, k: x => x, r: x => x * 5 / 9 }[T[f]](v);
    return round({ c: toK - 273.15, f: (toK - 273.15) * 9 / 5 + 32, k: toK, r: toK * 9 / 5 }[T[t]]);
  }
  for (const [cat, tbl] of Object.entries(UNITS)) if (f in tbl && t in tbl) return round(v * tbl[f] / tbl[t]);
  throw new Error(`Cannot convert ${from} → ${to}. Supported: temperature (C/F/K/R) and ${Object.entries(UNITS).map(([c, t]) => `${c}: ${Object.keys(t).join(' ')}`).join('; ')}`);
}

/* ====================================================================== PDF helpers */
function parsePages(spec, total) {
  if (!spec) return Array.from({ length: total }, (_, i) => i + 1);
  const out = new Set();
  String(spec).split(',').forEach(part => {
    const m = part.trim().match(/^(\d+)?\s*-\s*(\d+)?$/);
    if (m) { const a = Number(m[1] || 1), b = Number(m[2] || total); for (let i = a; i <= Math.min(b, total); i++) out.add(i); }
    else if (/^\d+$/.test(part.trim())) { const n = Number(part); if (n >= 1 && n <= total) out.add(n); }
  });
  return [...out].sort((a, b) => a - b);
}
async function pdfText(path, pages) {
  const lib = await pdfjs(); const doc = await lib.getDocument({ data: await fsx.bytes(path) }).promise;
  const list = parsePages(pages, doc.numPages).slice(0, 200); const parts = [];
  for (const n of list) {
    const pg = await doc.getPage(n); const tc = await pg.getTextContent();
    let line = '', text = ''; let lastY = null;
    for (const it of tc.items) { const y = it.transform ? Math.round(it.transform[5]) : null; if (lastY !== null && y !== lastY) { text += line.trim() + '\n'; line = ''; } line += it.str + (it.hasEOL ? '\n' : ' '); lastY = y; }
    text += line.trim();
    parts.push(`--- page ${n} ---\n${text.replace(/\n{3,}/g, '\n\n').trim()}`);
  }
  return { pages: doc.numPages, text: parts.join('\n\n') };
}
async function pdfToImages(path, pages, scale = 2, outDir) {
  const lib = await pdfjs(); const doc = await lib.getDocument({ data: await fsx.bytes(path) }).promise;
  const list = parsePages(pages, doc.numPages).slice(0, 50); const out = [];
  outDir = cleanPath(outDir || `pdf_pages/${stemOf(path)}`);
  for (const n of list) {
    const pg = await doc.getPage(n); const vp = pg.getViewport({ scale: Math.min(4, Math.max(0.5, Number(scale) || 2)) });
    const c = canvasOf(vp.width, vp.height); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await pg.render({ canvasContext: g, viewport: vp }).promise;
    out.push(await fsx.writeBlob(`${outDir}/page_${String(n).padStart(3, '0')}.png`, await canvasToBlob(c, 'image/png')));
  }
  return out;
}
const WINANSI_MAP = { '‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '-', '…': '...', '•': '*', ' ': ' ', '→': '->', '←': '<-', '≤': '<=', '≥': '>=', '≠': '!=', '×': 'x', '\t': '    ' };
const pdfSafe = s => String(s).replace(/[‘’“”–—…• →←≤≥≠×\t]/g, c => WINANSI_MAP[c]).replace(/[^\x20-\x7E\xA1-\xFF\n]/g, '?');
async function pdfCreate({ output, title, content, images = [], page_size = 'letter', font_size = 11 }) {
  const { PDFDocument, StandardFonts, rgb } = await pdflib();
  const doc = await PDFDocument.create(); if (title) doc.setTitle(pdfSafe(title)); doc.setCreator('Nexus Agent');
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold), mono = await doc.embedFont(StandardFonts.Courier);
  const [W, H] = page_size === 'a4' ? [595.28, 841.89] : [612, 792]; const M = 54;
  let page = null, y = 0;
  const newPage = () => { page = doc.addPage([W, H]); y = H - M; };
  const lines = [];
  if (title) lines.push({ t: title, f: bold, s: font_size * 1.8, gap: 8 });
  let inCode = false;
  String(content || '').split('\n').forEach(raw => {
    if (/^```/.test(raw)) { inCode = !inCode; return; }
    if (inCode) return lines.push({ t: raw, f: mono, s: font_size * 0.9 });
    const h = raw.match(/^(#{1,3})\s+(.*)/);
    if (h) return lines.push({ t: h[2], f: bold, s: font_size * (2 - h[1].length * 0.25), gap: 6 });
    const li = raw.match(/^\s*[-*]\s+(.*)/);
    lines.push({ t: li ? '* ' + li[1] : raw.replace(/\*\*(.+?)\*\*/g, '$1'), f: font, s: font_size });
  });
  newPage();
  for (const L of lines) {
    const text = pdfSafe(L.t); const words = text.split(/(\s+)/); let cur = '';
    const flush = s => { if (y - L.s < M) newPage(); page.drawText(s, { x: M, y: y - L.s, size: L.s, font: L.f, color: rgb(0.08, 0.08, 0.1) }); y -= L.s * 1.35; };
    if (!text.trim()) { y -= L.s * 0.8; continue; }
    if (L.gap) y -= L.gap;
    for (const w of words) { const test = cur + w; if (L.f.widthOfTextAtSize(test, L.s) > W - 2 * M && cur.trim()) { flush(cur.trimEnd()); cur = w.trimStart(); } else cur = test; }
    if (cur.trim()) flush(cur.trimEnd());
  }
  for (const ip of images) {
    const bytes = await fsx.bytes(ip); const e = extOf(ip);
    let img;
    if (e === 'png') img = await doc.embedPng(bytes);
    else if (e === 'jpg' || e === 'jpeg') img = await doc.embedJpg(bytes);
    else { const c = await imageFromPath(ip).then(im => { const cv = canvasOf(im.naturalWidth, im.naturalHeight); cv.getContext('2d').drawImage(im, 0, 0); return cv; }); img = await doc.embedPng(new Uint8Array(await (await canvasToBlob(c, 'image/png')).arrayBuffer())); }
    const pg = doc.addPage([W, H]); const k = Math.min((W - 2 * M) / img.width, (H - 2 * M) / img.height, 1);
    pg.drawImage(img, { x: (W - img.width * k) / 2, y: (H - img.height * k) / 2, width: img.width * k, height: img.height * k });
  }
  if (doc.getPageCount() === 0) doc.addPage([W, H]);
  const out = uniquePath(output || `outputs/${stemOf(title || 'document') || 'document'}.pdf`);
  return { path: await fsx.writeBytes(out, await doc.save()), pages: doc.getPageCount() };
}

/* ====================================================================== OCR */
const _ocrWorkers = {};
async function ocrWorker(lang) {
  if (_ocrWorkers[lang]) return _ocrWorkers[lang];
  await loadScript('lib/tesseract/tesseract.min.js');
  const abs = p => new URL(p, location.href).href;
  const langPath = lang === 'eng' ? abs('lib/tesseract/lang') : 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/' + lang.split('+')[0] + '/4.0.0_best_int';
  if (lang.includes('+') ) throw new Error('Use one language per OCR call (e.g. "fra"), or engine "vision" for mixed scripts');
  const w = await window.Tesseract.createWorker(lang, 1, { workerPath: abs('lib/tesseract/worker.min.js'), corePath: abs('lib/tesseract/core'), langPath, gzip: true, workerBlobURL: false, cacheMethod: lang === 'eng' ? 'none' : 'write' });
  return _ocrWorkers[lang] = w;
}
async function ocrPaths(paths, { lang, engine } = {}, ctx) {
  lang = (lang || S.settings.ocrLang || 'eng').trim(); engine = engine || S.settings.ocrEngine || 'local';
  const imgs = [];
  for (const p of paths) {
    if (extOf(p) === 'pdf') imgs.push(...await pdfToImages(p, null, 2));
    else if (isImagePath(p)) imgs.push(p);
    else throw new Error('OCR needs an image or PDF: ' + p);
  }
  if (engine === 'vision') return visionAsk(imgs, 'Transcribe ALL text in the image(s) exactly as written, preserving line breaks, tables (as Markdown) and reading order. Output only the text.', ctx);
  const w = await ocrWorker(lang); const parts = [];
  for (const p of imgs) { const r = await w.recognize(wsUrl(p)); parts.push(`--- ${p} (confidence ${Math.round(r.data.confidence)}%) ---\n${r.data.text.trim()}`); }
  return parts.join('\n\n');
}

/* ====================================================================== translation */
function translatorAgent() {
  const base = agentById(S.settings.translateAgent) || agentById(S.current) || S.agents[0];
  return { ...base, name: 'Translator', tools: false, temperature: 0.2, system: 'You are a professional interpreter. Output ONLY the translation — no notes, no quotes, no transliteration unless asked. Preserve meaning, tone, names, numbers and formatting.' };
}
function translatePrompt(text) {
  const a = S.settings.translateMine, b = S.settings.translateTheirs;
  return `Two-way interpreting between ${a} and ${b}. If the text below is in ${a}, translate it into ${b}; otherwise translate it into ${a}.\n\nText:\n${text}`;
}
async function translateText({ text, target, source, engine }, ctx) {
  engine = engine || S.settings.translateEngine || 'agent';
  if (!text) throw new Error('nothing to translate');
  if (engine === 'deepl') {
    const key = getKey('svc_deepl'); if (!key) throw new Error('Add a DeepL API key in Settings');
    const host = key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
    const body = { text: [text], target_lang: String(target).toUpperCase() }; if (source) body.source_lang = String(source).toUpperCase();
    const d = await postJSON(host + '/v2/translate', { Authorization: 'DeepL-Auth-Key ' + key }, body);
    return d.translations.map(t => t.text).join('\n') + (d.translations[0] && d.translations[0].detected_source_language ? `\n(detected: ${d.translations[0].detected_source_language})` : '');
  }
  if (engine === 'libre') {
    const d = await postJSON(S.settings.libreUrl.replace(/\/+$/, '') + '/translate', {}, { q: text, source: source || 'auto', target, format: 'text', api_key: getKey('svc_libre') || undefined });
    return d.translatedText;
  }
  const t = translatorAgent();
  const r = await runAgent(t, `Translate into ${target}${source ? ` from ${source}` : ''}:\n\n${text}`, { token: ctx ? ctx.token : runToken, depth: 9 });
  return stripThink(r.text);
}

/* ====================================================================== maps (Apple Maps + open fallback) */
let _appleTok = null;
async function appleToken() {
  const auth = getKey('svc_applemaps');
  if (!auth) return null;
  if (_appleTok && _appleTok.exp > Date.now() + 30000) return _appleTok.token;
  const r = await http('GET', 'https://maps-api.apple.com/v1/token', { Authorization: 'Bearer ' + auth }, null, 20000);
  const d = parseJSON(r.body, {});
  if (r.status >= 400 || !d.accessToken) throw new Error('Apple Maps token exchange failed (HTTP ' + r.status + '). Check the Maps token in Settings.');
  _appleTok = { token: d.accessToken, exp: Date.now() + (d.expiresInSeconds || 1800) * 1000 };
  return _appleTok.token;
}
async function appleGet(path, params) {
  const tok = await appleToken(); if (!tok) return null;
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
  const r = await http('GET', 'https://maps-api.apple.com' + path + '?' + qs, { Authorization: 'Bearer ' + tok }, null, 30000);
  const d = parseJSON(r.body, null); if (r.status >= 400 || !d) throw new Error('Apple Maps HTTP ' + r.status + ': ' + clip(r.body, 200));
  return d;
}
const appleLink = (q, lat, lon) => 'https://maps.apple.com/?' + new URLSearchParams(Object.fromEntries(Object.entries({ q, ll: lat != null ? `${lat},${lon}` : null }).filter(([, v]) => v))).toString();
async function nominatim(q, limit = 5) {
  const r = await http('GET', `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${limit}&q=${encodeURIComponent(q)}`, { 'Accept-Language': navigator.language || 'en' }, null, 20000);
  return (parseJSON(r.body, []) || []).map(x => ({ name: x.name || x.display_name.split(',')[0], address: x.display_name, lat: Number(x.lat), lon: Number(x.lon), type: x.type }));
}
async function currentLocation() {
  needNative('Location');
  if (!(await ensurePermission('android.permission.ACCESS_FINE_LOCATION')) && !(await ensurePermission('android.permission.ACCESS_COARSE_LOCATION'))) throw new Error('Location permission denied');
  return nativeAsync('getLocation');
}
async function resolvePlace(p) {
  if (!p || /^(here|current|my location|current location)$/i.test(String(p).trim())) { const l = await currentLocation(); return { lat: l.lat, lon: l.lon, label: 'current location' }; }
  const m = String(p).match(/^\s*(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)\s*$/); if (m) return { lat: Number(m[1]), lon: Number(m[3]), label: p };
  const apple = await appleGet('/v1/geocode', { q: p }).catch(() => null);
  if (apple && apple.results && apple.results[0]) { const c = apple.results[0].coordinate; return { lat: c.latitude, lon: c.longitude, label: (apple.results[0].formattedAddressLines || [p]).join(', ') }; }
  const n = await nominatim(p, 1); if (!n.length) throw new Error('Place not found: ' + p);
  return { lat: n[0].lat, lon: n[0].lon, label: n[0].address };
}
function openMapsUrl({ query, destination, origin, mode, lat, lon }) {
  const flg = { driving: 'd', walking: 'w', transit: 'r', cycling: 'c' }[mode || 'driving'] || 'd';
  if (S.settings.mapsApp === 'android') {
    if (destination) return `google.navigation:q=${encodeURIComponent(destination)}&mode=${{ walking: 'w', cycling: 'b' }[mode] || 'd'}`;
    return lat != null ? `geo:${lat},${lon}?q=${lat},${lon}(${encodeURIComponent(query || '')})` : `geo:0,0?q=${encodeURIComponent(query || '')}`;
  }
  const p = {};
  if (destination) { p.daddr = destination; if (origin) p.saddr = origin; p.dirflg = flg; }
  else { if (query) p.q = query; if (lat != null) p.ll = `${lat},${lon}`; }
  return 'https://maps.apple.com/?' + new URLSearchParams(p).toString();
}

/* ====================================================================== JS sandbox (coding) */
function runJsSandbox(code, files = {}, timeoutMs = 15000) {
  const prelude = `
const __logs=[];const __out={};
function __fmt(x){try{return typeof x==='string'?x:(x===undefined?'undefined':JSON.stringify(x,null,1))}catch(e){return String(x)}}
const console={log:(...a)=>__logs.push(a.map(__fmt).join(' ')),info:(...a)=>__logs.push(a.map(__fmt).join(' ')),warn:(...a)=>__logs.push('WARN: '+a.map(__fmt).join(' ')),error:(...a)=>__logs.push('ERROR: '+a.map(__fmt).join(' ')),table:(t)=>__logs.push(__fmt(t))};
const FILES=${JSON.stringify(files)};
function readFile(p){if(!(p in FILES))throw new Error('file not provided: '+p);return FILES[p]}
function writeFile(p,t){__out[p]=String(t)}
self.onmessage=async()=>{try{const __r=await (async()=>{\n`;
  const post = `\n})();postMessage({ok:true,result:__r===undefined?undefined:__fmt(__r),logs:__logs,files:__out})}catch(e){postMessage({ok:false,error:String(e&&e.stack||e),logs:__logs,files:__out})}};`;
  return new Promise(res => {
    let url, w;
    try { url = URL.createObjectURL(new Blob([prelude + code + post], { type: 'application/javascript' })); w = new Worker(url); }
    catch (e) { return res({ ok: false, error: 'Worker failed: ' + e.message, logs: [], files: {} }); }
    const t = setTimeout(() => { w.terminate(); URL.revokeObjectURL(url); res({ ok: false, error: `Timed out after ${timeoutMs} ms`, logs: [], files: {} }); }, timeoutMs);
    w.onmessage = e => { clearTimeout(t); w.terminate(); URL.revokeObjectURL(url); res(e.data); };
    w.onerror = e => { clearTimeout(t); w.terminate(); URL.revokeObjectURL(url); res({ ok: false, error: (e.message || 'syntax error') + (e.lineno ? ` (line ${e.lineno - 9})` : ''), logs: [], files: {} }); e.preventDefault(); };
    w.postMessage(1);
  });
}

/* ====================================================================== skill definitions */
const P = (props, req = []) => ({ type: 'object', properties: props, required: req });
const s_ = d => ({ type: 'string', description: d });
const n_ = d => ({ type: 'number', description: d });
const b_ = d => ({ type: 'boolean', description: d });
const arr = (d, items = { type: 'string' }) => ({ type: 'array', items, description: d });
const J = o => JSON.stringify(o, null, 1);

BUILTIN_SKILLS.push(
  /* ---------------- Files */
  { name: 'file_list', group: 'Files', description: 'List files in the agent workspace (photos, imports, downloads, outputs…).', parameters: P({ dir: s_('folder, empty for root'), recursive: b_('include subfolders') }),
    run: async a => { const l = fsx.list(a.dir || '', a.recursive !== false); return l.length ? l.map(f => `${f.dir ? '📁' : '📄'} ${f.path}${f.dir ? '/' : ` (${fmtSize(f.size)})`}`).join('\n') : 'workspace is empty'; } },
  { name: 'file_read', group: 'Files', description: 'Read a text/code file from the workspace (use pdf_extract_text for PDFs, ocr for images).', parameters: P({ path: s_('file path'), start_line: n_('optional first line (1-based)'), end_line: n_('optional last line') }, ['path']),
    run: async a => { const t = await fsx.readText(a.path); if (!a.start_line && !a.end_line) return clip(t, 20000); const L = t.split('\n'); const s = Math.max(1, a.start_line || 1), e = Math.min(L.length, a.end_line || L.length); return L.slice(s - 1, e).map((l, i) => `${s + i}: ${l}`).join('\n'); } },
  { name: 'file_write', group: 'Files', description: 'Create or overwrite a text/code file in the workspace.', parameters: P({ path: s_('file path, e.g. projects/app/main.py'), content: s_('full file content') }, ['path', 'content']),
    run: async a => `wrote ${await fsx.writeText(a.path, a.content)} (${a.content.length} chars)` },
  { name: 'file_edit', group: 'Coding', description: 'Edit a text/code file by exact find-and-replace (find must match exactly once unless all=true).', parameters: P({ path: s_('file'), find: s_('exact existing text'), replace: s_('new text'), all: b_('replace every occurrence') }, ['path', 'find', 'replace']),
    run: async a => { const t = await fsx.readText(a.path); const count = t.split(a.find).length - 1; if (!count) return 'find text not found'; if (count > 1 && !a.all) return `find text occurs ${count} times; give more context or set all=true`; await fsx.writeText(a.path, a.all ? t.split(a.find).join(a.replace) : t.replace(a.find, () => a.replace)); return `edited ${a.path} (${a.all ? count : 1} replacement)`; } },
  { name: 'file_delete', group: 'Files', risky: true, description: 'Delete a workspace file or folder.', parameters: P({ path: s_('path') }, ['path']), run: async a => { fsx.del(a.path); return 'deleted ' + a.path; } },
  { name: 'file_move', group: 'Files', description: 'Move or rename a workspace file/folder.', parameters: P({ from: s_('current path'), to: s_('new path') }, ['from', 'to']), run: async a => 'moved to ' + fsx.move(a.from, a.to) },
  { name: 'file_download', group: 'Files', description: 'Download a file from a URL into the workspace (PDFs, images, zips, videos…).', parameters: P({ url: s_('http(s) URL'), path: s_('optional destination path') }, ['url']),
    run: async a => { needNative('Downloads'); const r = await nativeAsync('download', JSON.stringify({ url: a.url, path: a.path ? cleanPath(a.path) : '' })); return `saved ${r.path} (${fmtSize(r.size)}, ${r.mime || 'unknown type'})`; } },
  { name: 'file_import', group: 'Files', description: 'Ask the user to pick files from device storage; they are copied into the workspace.', parameters: P({ mime: s_('optional MIME filter, e.g. image/* or application/pdf') }),
    run: async a => { const f = await importFiles(a.mime); return f.length ? 'imported: ' + f.join(', ') : 'user picked nothing'; } },
  { name: 'file_open', group: 'Files', description: 'Open a workspace file in a viewer app (gallery, PDF reader, video player).', parameters: P({ path: s_('path') }, ['path']), run: async a => { needNative(); return N.openFile(cleanPath(a.path)); } },
  { name: 'file_share', group: 'Files', description: 'Share a workspace file through the Android share sheet (email, chat, Drive…).', parameters: P({ path: s_('path') }, ['path']), run: async a => { needNative(); return N.shareFile(cleanPath(a.path)); } },
  { name: 'file_export', group: 'Files', description: 'Save a workspace file to user-visible storage via the system "Save as" dialog.', parameters: P({ path: s_('path') }, ['path']), run: async a => { needNative(); await nativeAsync('exportFile', cleanPath(a.path)); return 'exported'; } },

  /* ---------------- Coding */
  { name: 'run_javascript', group: 'Coding', description: 'Execute JavaScript in an isolated sandbox (Web Worker, no DOM). Use `return` for the result, console.log for output. Optional input files are readable with readFile(path); writeFile(path, text) saves outputs to the workspace.',
    parameters: P({ code: s_('JavaScript source (async allowed; top-level await OK)'), files: arr('workspace text files to make readable'), timeout_ms: n_('default 15000, max 60000') }, ['code']),
    run: async a => {
      const files = {}; for (const p of (a.files || []).slice(0, 20)) files[cleanPath(p)] = await fsx.readText(p);
      const r = await runJsSandbox(a.code, files, Math.min(60000, Number(a.timeout_ms) || 15000));
      const written = []; for (const [p, t] of Object.entries(r.files || {})) written.push(await fsx.writeText(p, t));
      return [r.logs && r.logs.length ? 'console:\n' + clip(r.logs.join('\n'), 8000) : '', r.ok ? 'result: ' + (r.result === undefined ? '(none)' : clip(r.result, 8000)) : 'ERROR: ' + r.error, written.length ? 'files written: ' + written.join(', ') : ''].filter(Boolean).join('\n');
    } },
  { name: 'code_search', group: 'Coding', description: 'Search workspace text/code files for a string or regex (like grep). Returns file:line matches.', parameters: P({ pattern: s_('text or regex'), dir: s_('folder to search, default all'), regex: b_('treat pattern as a regex'), ignore_case: b_('case-insensitive') }, ['pattern']),
    run: async a => {
      const files = fsx.list(a.dir || '', true).filter(f => !f.dir && f.size < 2e6 && isTextPath(f.path)).slice(0, 400);
      const re = a.regex ? new RegExp(a.pattern, a.ignore_case ? 'i' : '') : null; const needle = a.ignore_case ? a.pattern.toLowerCase() : a.pattern;
      const hits = [];
      for (const f of files) { const L = (await fsx.readText(f.path)).split('\n'); L.forEach((l, i) => { if (hits.length < 200 && (re ? re.test(l) : (a.ignore_case ? l.toLowerCase() : l).includes(needle))) hits.push(`${f.path}:${i + 1}: ${clip(l.trim(), 200)}`); }); }
      return hits.length ? hits.join('\n') : `no matches in ${files.length} files`;
    } },
  { name: 'github_get', group: 'Coding', description: 'Read a GitHub repository: list a folder or fetch a file (optionally saving it to the workspace). Uses the GitHub token from Settings for private repos.',
    parameters: P({ repo: s_('owner/name'), path: s_('path inside repo, empty for root'), ref: s_('branch, tag or commit (optional)'), save_to: s_('optional workspace path to save the file') }, ['repo']),
    run: async a => {
      const h = { Accept: 'application/vnd.github+json' }; const tok = getKey('svc_github'); if (tok) h.Authorization = 'Bearer ' + tok;
      const url = `https://api.github.com/repos/${a.repo}/contents/${String(a.path || '').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')}${a.ref ? '?ref=' + encodeURIComponent(a.ref) : ''}`;
      const r = await http('GET', url, h, null, 30000); const d = parseJSON(r.body, null);
      if (r.status >= 400 || !d) throw new Error('GitHub HTTP ' + r.status + ': ' + clip(r.body, 200));
      if (Array.isArray(d)) return d.map(x => `${x.type === 'dir' ? '📁' : '📄'} ${x.path}${x.type === 'file' ? ` (${fmtSize(x.size)})` : ''}`).join('\n');
      const text = d.encoding === 'base64' ? new TextDecoder().decode(Uint8Array.from(atob(d.content.replace(/\n/g, '')), c => c.charCodeAt(0))) : String(d.content || '');
      if (a.save_to) { await fsx.writeText(a.save_to, text); return `saved ${d.path} → ${cleanPath(a.save_to)} (${text.length} chars)`; }
      return clip(text, 20000);
    } },

  /* ---------------- Engineering */
  { name: 'unit_convert', group: 'Engineering', description: 'Convert units: length, mass, time, area, volume, speed, pressure, energy, power, force, torque, data, frequency, angle, current, voltage, temperature.', parameters: P({ value: n_('number'), from: s_('unit, e.g. psi, ft, kWh, F'), to: s_('target unit') }, ['value', 'from', 'to']),
    run: async a => `${a.value} ${a.from} = ${convertUnits(a.value, a.from, a.to)} ${a.to}` },
  { name: 'engineering_math', group: 'Engineering', description: 'Numerical engineering math. operation: evaluate {expr, vars} | solve_linear {A, b} | matrix {op: multiply|inverse|determinant|transpose|add, A, B} | stats {data} | regression {x, y} | poly_roots {coeffs, highest power first} | integrate {expr in x, a, b} | derivative {expr in x, at} | solve_equation {expr in x = 0, a, b or guess}. Expressions support + - * / ^ and Math functions (sin, cos, sqrt, ln, log10, exp, pi, e…).',
    parameters: P({ operation: s_('operation name'), expr: s_('expression'), vars: { type: 'object', description: 'variable values for evaluate' }, A: { type: 'array', description: 'matrix as array of rows', items: { type: 'array', items: { type: 'number' } } }, B: { type: 'array', description: 'second matrix', items: { type: 'array', items: { type: 'number' } } }, b: { description: 'solve_linear: right-hand side vector; integrate/solve_equation: upper bound number' }, op: s_('matrix op'), data: arr('numbers', { type: 'number' }), x: arr('x values', { type: 'number' }), y: arr('y values', { type: 'number' }), coeffs: arr('polynomial coefficients', { type: 'number' }), a: n_('lower bound'), at: n_('point'), guess: n_('starting guess') }, ['operation']),
    run: async a => {
      const op = String(a.operation || '').toLowerCase();
      const hi = typeof a.b === 'number' || typeof a.b === 'string' ? Number(a.b) : undefined;
      switch (op) {
        case 'evaluate': { const vars = a.vars || {}; return String(round(compileExpr(a.expr, Object.keys(vars))(vars))); }
        case 'solve_linear': return J({ x: round(gaussSolve(a.A, a.b)) });
        case 'matrix': {
          const m = String(a.op || '').toLowerCase();
          if (m === 'determinant') return String(round(det(a.A)));
          if (m === 'inverse') return J(round(inverse(a.A)));
          if (m === 'transpose') return J(a.A[0].map((_, j) => a.A.map(r => r[j])));
          if (m === 'multiply') return J(round(matmul(a.A, a.B)));
          if (m === 'add') return J(round(a.A.map((r, i) => r.map((v, j) => v + a.B[i][j]))));
          throw new Error('matrix op must be multiply|inverse|determinant|transpose|add');
        }
        case 'stats': return J(stats(a.data));
        case 'regression': { const n = a.x.length, mx = a.x.reduce((s, v) => s + v, 0) / n, my = a.y.reduce((s, v) => s + v, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (a.x[i] - mx) * (a.y[i] - my); sxx += (a.x[i] - mx) ** 2; syy += (a.y[i] - my) ** 2; } const slope = sxy / sxx; return J(round({ slope, intercept: my - slope * mx, r2: (sxy * sxy) / (sxx * syy), equation: `y = ${round(slope)}x + ${round(my - slope * mx)}` })); }
        case 'poly_roots': return J({ roots: polyRoots(a.coeffs) });
        case 'integrate': { const f = compileExpr(a.expr, ['x']); const lo = Number(a.a), up = Number(hi); const n = 2000, h = (up - lo) / n; let s = f({ x: lo }) + f({ x: up }); for (let i = 1; i < n; i++) s += f({ x: lo + i * h }) * (i % 2 ? 4 : 2); return String(round(s * h / 3)); }
        case 'derivative': { const f = compileExpr(a.expr, ['x']); const x = Number(a.at), h = 1e-5 * Math.max(1, Math.abs(x)); return String(round((f({ x: x + h }) - f({ x: x - h })) / (2 * h))); }
        case 'solve_equation': {
          const f = compileExpr(a.expr, ['x']); const F = x => f({ x });
          if (a.a != null && hi != null) { let lo = Number(a.a), up = Number(hi); if (F(lo) * F(up) > 0) throw new Error('f(a) and f(b) must have opposite signs'); for (let i = 0; i < 200; i++) { const m = (lo + up) / 2; if (F(lo) * F(m) <= 0) up = m; else lo = m; } return J({ x: round((lo + up) / 2) }); }
          let x0 = Number(a.guess || 1), x1 = x0 + 0.1; for (let i = 0; i < 100; i++) { const f0 = F(x0), f1 = F(x1); if (Math.abs(f1 - f0) < 1e-15) break; const x2 = x1 - f1 * (x1 - x0) / (f1 - f0); x0 = x1; x1 = x2; if (Math.abs(x1 - x0) < 1e-12) break; }
          return J({ x: round(x1), residual: round(F(x1)) });
        }
        default: throw new Error('unknown operation ' + op);
      }
    } },

  /* ---------------- Images */
  { name: 'camera_photo', group: 'Images', description: 'Take a photo with the device camera (what the user is looking at on the glasses) and save it to the workspace. Combine with image_describe, ocr or translate_image.', parameters: P({ path: s_('optional output path') }),
    run: async a => { const p = await takePhoto({ auto: true, path: a.path ? cleanPath(a.path) : '' }); return 'photo saved: ' + p; } },
  { name: 'image_info', group: 'Images', description: 'Get image dimensions, type and size.', parameters: P({ path: s_('image path') }, ['path']),
    run: async a => { const im = await imageFromPath(a.path); const st = fsx.stat(a.path); return J({ path: cleanPath(a.path), width: im.naturalWidth, height: im.naturalHeight, bytes: st.size, mime: st.mime }); } },
  { name: 'image_edit', group: 'Images', description: 'Process an image with a pipeline of operations, saved as a new file. ops items: {op:"resize",width?,height?} {op:"scale",factor} {op:"crop",x,y,width,height} {op:"rotate",degrees} {op:"flip",direction:"horizontal"|"vertical"} {op:"grayscale"} {op:"sepia"} {op:"invert"} {op:"brightness",value} {op:"contrast",value} {op:"saturate",value} {op:"hue",degrees} {op:"blur",radius} {op:"sharpen"} {op:"edges"} {op:"threshold",value} {op:"text",text,x,y,size,color}. Output format from extension (png/jpg/webp).',
    parameters: P({ path: s_('input image'), ops: { type: 'array', items: { type: 'object' }, description: 'operations in order' }, output: s_('output path (optional)'), quality: n_('0-1 for jpg/webp, default 0.9') }, ['path', 'ops']),
    run: async a => {
      const im = await imageFromPath(a.path); let c = canvasOf(im.naturalWidth, im.naturalHeight); c.getContext('2d').drawImage(im, 0, 0);
      for (const o of a.ops || []) { const fn = IMAGE_OPS[String(o.op || '').toLowerCase()]; if (!fn) throw new Error('unknown op ' + o.op + '. Valid: ' + Object.keys(IMAGE_OPS).join(', ')); c = fn(c, o) || c; }
      const out = uniquePath(a.output || `outputs/${stemOf(a.path)}_edited.${extOf(a.path) === 'jpg' || extOf(a.path) === 'jpeg' ? 'jpg' : 'png'}`);
      const path = await fsx.writeBlob(out, await canvasToBlob(c, mimeForExt(extOf(out)), a.quality || 0.9));
      return `saved ${path} (${c.width}×${c.height})`;
    } },
  { name: 'image_convert', group: 'Images', description: 'Convert an image to png, jpg or webp (optionally max width).', parameters: P({ path: s_('input'), format: s_('png | jpg | webp'), max_width: n_('optional') }, ['path', 'format']),
    run: async a => { const im = await imageFromPath(a.path); const k = a.max_width ? Math.min(1, a.max_width / im.naturalWidth) : 1; const c = canvasOf(im.naturalWidth * k, im.naturalHeight * k); const g = c.getContext('2d'); if (a.format !== 'png') { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); } g.drawImage(im, 0, 0, c.width, c.height); const ext = a.format === 'jpeg' ? 'jpg' : a.format; const out = uniquePath(`${dirOf(a.path) || 'outputs'}/${stemOf(a.path)}.${ext}`); return 'saved ' + await fsx.writeBlob(out, await canvasToBlob(c, mimeForExt(ext), 0.9)); } },
  { name: 'image_describe', group: 'Images', description: 'Ask the vision model (Settings → vision agent) about one or more images: describe, identify objects, read signs, analyze charts, compare photos.', parameters: P({ paths: arr('image paths'), question: s_('what to look for or ask') }, ['paths']),
    run: async (a, ctx) => visionAsk(a.paths || [], a.question, ctx) },
  { name: 'image_generate', group: 'Images', description: 'Generate an image from a text prompt using the image provider/model in Settings (OpenAI-compatible images API, e.g. OpenAI gpt-image-1 or Venice).', parameters: P({ prompt: s_('image description'), size: s_('e.g. 1024x1024'), output: s_('optional output path') }, ['prompt']),
    run: async a => {
      const p = providerById(S.settings.imageProvider); if (!p) throw new Error('Pick an image provider in Settings');
      const d = await postJSON(base(p) + '/images/generations', authHeaders(p, getKey(p.id)), { model: S.settings.imageModel, prompt: a.prompt, size: a.size || '1024x1024', n: 1 }, 180000);
      const item = (d.data || [])[0] || {}; const out = uniquePath(a.output || `outputs/generated_${tsName()}.png`);
      if (item.b64_json) return 'saved ' + await fsx.writeB64(out, item.b64_json);
      if (item.url) { const r = await nativeAsync('download', JSON.stringify({ url: item.url, path: out })); return 'saved ' + r.path; }
      throw new Error('provider returned no image');
    } },

  /* ---------------- PDF */
  { name: 'pdf_info', group: 'PDF', description: 'Get page count, title, author and page size of a PDF.', parameters: P({ path: s_('pdf path') }, ['path']),
    run: async a => { const { PDFDocument } = await pdflib(); const d = await PDFDocument.load(await fsx.bytes(a.path), { ignoreEncryption: true }); const pg = d.getPage(0); return J({ pages: d.getPageCount(), title: d.getTitle(), author: d.getAuthor(), subject: d.getSubject(), creator: d.getCreator(), firstPageSizePt: pg ? pg.getSize() : null }); } },
  { name: 'pdf_extract_text', group: 'PDF', description: 'Extract the text layer of a PDF (pages like "1-3,5"). If it returns little text the PDF is scanned: use ocr on it.', parameters: P({ path: s_('pdf path'), pages: s_('optional page ranges') }, ['path']),
    run: async a => { const r = await pdfText(a.path, a.pages); return `${r.pages} pages\n` + clip(r.text, 24000); } },
  { name: 'pdf_to_images', group: 'PDF', description: 'Render PDF pages to PNG images in the workspace (for OCR, vision or sharing).', parameters: P({ path: s_('pdf path'), pages: s_('page ranges, default all (max 50)'), scale: n_('1-4, default 2'), output_dir: s_('optional folder') }, ['path']),
    run: async a => 'rendered:\n' + (await pdfToImages(a.path, a.pages, a.scale, a.output_dir)).join('\n') },
  { name: 'pdf_create', group: 'PDF', description: 'Create a PDF from text/Markdown (headings #, bullets -, ``` code) and/or images.', parameters: P({ output: s_('output .pdf path'), title: s_('document title'), content: s_('body text / markdown'), images: arr('optional image paths, one per page'), page_size: s_('letter | a4') }, ['content']),
    run: async a => { const r = await pdfCreate(a); return `created ${r.path} (${r.pages} pages)`; } },
  { name: 'pdf_merge', group: 'PDF', description: 'Merge several PDFs into one.', parameters: P({ inputs: arr('pdf paths in order'), output: s_('output path') }, ['inputs']),
    run: async a => { const { PDFDocument } = await pdflib(); const out = await PDFDocument.create(); for (const p of a.inputs) { const src = await PDFDocument.load(await fsx.bytes(p), { ignoreEncryption: true }); (await out.copyPages(src, src.getPageIndices())).forEach(pg => out.addPage(pg)); } const path = await fsx.writeBytes(uniquePath(a.output || 'outputs/merged.pdf'), await out.save()); return `merged ${a.inputs.length} files → ${path} (${out.getPageCount()} pages)`; } },
  { name: 'pdf_split', group: 'PDF', description: 'Extract selected pages of a PDF into a new PDF (e.g. pages "2-4,7").', parameters: P({ path: s_('pdf'), pages: s_('page ranges'), output: s_('output path') }, ['path', 'pages']),
    run: async a => { const { PDFDocument } = await pdflib(); const src = await PDFDocument.load(await fsx.bytes(a.path), { ignoreEncryption: true }); const idx = parsePages(a.pages, src.getPageCount()).map(n => n - 1); const out = await PDFDocument.create(); (await out.copyPages(src, idx)).forEach(pg => out.addPage(pg)); const path = await fsx.writeBytes(uniquePath(a.output || `outputs/${stemOf(a.path)}_p${String(a.pages).replace(/[^0-9,-]/g, '')}.pdf`), await out.save()); return `saved ${path} (${idx.length} pages)`; } },

  /* ---------------- OCR */
  { name: 'ocr', group: 'OCR', description: 'Read text from images or scanned PDFs. engine "local" = offline Tesseract (private; English bundled, other languages like fra/deu/spa/chi_sim/jpn download once), engine "vision" = the vision AI model (best for handwriting, mixed scripts, tables).', parameters: P({ paths: arr('image or pdf paths'), lang: s_('Tesseract language code, default eng'), engine: s_('local | vision') }, ['paths']),
    run: async (a, ctx) => clip(await ocrPaths(a.paths || [], a, ctx), 24000) },

  /* ---------------- Zip */
  { name: 'zip_create', group: 'Zip', description: 'Compress workspace files/folders into a .zip.', parameters: P({ inputs: arr('files or folders'), output: s_('output .zip path') }, ['inputs']),
    run: async a => { needNative('Zip'); const r = await nativeAsync('zip', JSON.stringify({ op: 'create', inputs: a.inputs.map(cleanPath), output: uniquePath(a.output || `outputs/archive_${tsName()}.zip`) })); return `created ${r.output} (${r.files} files, ${fmtSize(r.size)})`; } },
  { name: 'zip_extract', group: 'Zip', description: 'Extract a .zip archive into a workspace folder.', parameters: P({ path: s_('zip path'), dest: s_('optional destination folder') }, ['path']),
    run: async a => { needNative('Zip'); const r = await nativeAsync('zip', JSON.stringify({ op: 'extract', path: cleanPath(a.path), dest: a.dest ? cleanPath(a.dest) : '' })); return `extracted ${r.files} files (${fmtSize(r.bytes)}) to ${r.dest}`; } },
  { name: 'zip_list', group: 'Zip', description: 'List the contents of a .zip without extracting.', parameters: P({ path: s_('zip path') }, ['path']),
    run: async a => { needNative('Zip'); const r = await nativeAsync('zip', JSON.stringify({ op: 'list', path: cleanPath(a.path) })); return r.map(e => `${e.dir ? '📁' : '📄'} ${e.name}${e.dir ? '' : ` (${fmtSize(e.size)})`}`).join('\n') || 'empty archive'; } },

  /* ---------------- Video */
  { name: 'video_info', group: 'Video', description: 'Get video duration, resolution, rotation, codecs/tracks, bitrate, date and GPS location metadata.', parameters: P({ path: s_('video path') }, ['path']),
    run: async a => { needNative('Video'); return J(await nativeAsync('video', JSON.stringify({ op: 'info', path: cleanPath(a.path) }))); } },
  { name: 'video_frames', group: 'Video', description: 'Extract still frames from a video as JPEGs (evenly spaced, or at given times in ms).', parameters: P({ path: s_('video'), count: n_('number of evenly spaced frames, default 6, max 60'), times_ms: arr('specific timestamps in ms', { type: 'number' }), output_dir: s_('optional folder') }, ['path']),
    run: async a => { needNative('Video'); const r = await nativeAsync('video', JSON.stringify({ op: 'frames', path: cleanPath(a.path), count: a.count || 6, timesMs: a.times_ms || [], outputDir: a.output_dir ? cleanPath(a.output_dir) : '' })); return r.frames.map(f => `${f.path} @ ${(f.timeMs / 1000).toFixed(1)}s`).join('\n') || 'no frames decoded'; } },
  { name: 'video_trim', group: 'Video', description: 'Cut a section of a video losslessly (no re-encode; cuts snap to keyframes).', parameters: P({ path: s_('video'), start_sec: n_('start time in seconds'), end_sec: n_('end time in seconds'), output: s_('optional .mp4 path') }, ['path', 'start_sec', 'end_sec']),
    run: async a => { needNative('Video'); const r = await nativeAsync('video', JSON.stringify({ op: 'trim', path: cleanPath(a.path), startMs: Math.round(a.start_sec * 1000), endMs: Math.round(a.end_sec * 1000), output: a.output ? cleanPath(a.output) : '' })); return `saved ${r.output} (${fmtSize(r.size)}). ${r.note}`; } },
  { name: 'video_extract_audio', group: 'Video', description: 'Extract the audio track of a video to .m4a (or produce a muted copy with mute=true).', parameters: P({ path: s_('video'), mute: b_('instead create a copy without audio'), output: s_('optional output path') }, ['path']),
    run: async a => { needNative('Video'); const r = await nativeAsync('video', JSON.stringify({ op: a.mute ? 'mute' : 'audio', path: cleanPath(a.path), output: a.output ? cleanPath(a.output) : '' })); return `saved ${r.output} (${fmtSize(r.size)})`; } },
  { name: 'video_describe', group: 'Video', description: 'Understand a video: samples frames and asks the vision model (summaries, what happens when, find a moment, read on-screen text).', parameters: P({ path: s_('video'), question: s_('what to find out'), frames: n_('frames to sample, default 8, max 16') }, ['path']),
    run: async (a, ctx) => { needNative('Video'); const r = await nativeAsync('video', JSON.stringify({ op: 'frames', path: cleanPath(a.path), count: Math.min(16, a.frames || 8), maxWidth: 768 })); const list = r.frames.map(f => `${f.path} = ${(f.timeMs / 1000).toFixed(1)}s`).join(', '); return visionAsk(r.frames.map(f => f.path), `These are ${r.frames.length} frames sampled in order from a video (${list}). ${a.question || 'Summarize what happens in the video, with approximate timestamps.'}`, ctx); } },

  /* ---------------- Maps */
  { name: 'get_location', group: 'Maps', risky: true, description: "Get the device's current GPS/network location with a street address.", parameters: P({}),
    run: async () => {
      const l = await currentLocation(); let address = '';
      const apple = await appleGet('/v1/reverseGeocode', { loc: `${l.lat},${l.lon}` }).catch(() => null);
      if (apple && apple.results && apple.results[0]) address = (apple.results[0].formattedAddressLines || []).join(', ');
      else { const r = await http('GET', `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${l.lat}&lon=${l.lon}`, {}, null, 15000).catch(() => null); address = r ? (parseJSON(r.body, {}).display_name || '') : ''; }
      return J({ lat: l.lat, lon: l.lon, accuracy_m: Math.round(l.accuracy), address, apple_maps: appleLink(null, l.lat, l.lon) });
    } },
  { name: 'apple_maps_search', group: 'Maps', description: 'Search places/businesses/addresses with Apple Maps (Maps Server API token in Settings; falls back to OpenStreetMap). near: a place name, "lat,lon" or "here".', parameters: P({ query: s_('what to find, e.g. "coffee", "Golden Gate Bridge"'), near: s_('optional area or "here"'), limit: n_('default 6') }, ['query']),
    run: async a => {
      const limit = Math.min(15, a.limit || 6); let center = null;
      if (a.near) center = await resolvePlace(a.near);
      const apple = await appleGet('/v1/search', { q: a.query, searchLocation: center ? `${center.lat},${center.lon}` : null, lang: navigator.language || 'en-US' }).catch(e => ({ __err: e.message }));
      if (apple && apple.results) return 'Source: Apple Maps\n' + J(apple.results.slice(0, limit).map(r => ({ name: r.name, address: (r.formattedAddressLines || []).join(', '), category: r.poiCategory, lat: r.coordinate.latitude, lon: r.coordinate.longitude, apple_maps: appleLink(r.name, r.coordinate.latitude, r.coordinate.longitude) })));
      const q = center && center.label !== 'current location' ? `${a.query}, ${a.near}` : a.query;
      const res = await nominatim(q, limit);
      return `Source: OpenStreetMap${apple && apple.__err ? ' (Apple Maps error: ' + apple.__err + ')' : ' (add an Apple Maps token in Settings for Apple results)'}\n` + J(res.map(r => ({ ...r, apple_maps: appleLink(r.name, r.lat, r.lon) })));
    } },
  { name: 'apple_maps_directions', group: 'Maps', description: 'Route, distance and travel time between two places (Apple Maps; OSRM fallback for driving/walking). Use "here" for current location.', parameters: P({ origin: s_('start, or "here"'), destination: s_('end'), mode: s_('driving | walking | transit') }, ['destination']),
    run: async a => {
      const mode = a.mode || 'driving'; const from = await resolvePlace(a.origin || 'here'); const to = await resolvePlace(a.destination);
      const link = openMapsUrl({ destination: a.destination, origin: a.origin && !/^here$/i.test(a.origin) ? a.origin : `${from.lat},${from.lon}`, mode });
      const apple = await appleGet('/v1/directions', { origin: `${from.lat},${from.lon}`, destination: `${to.lat},${to.lon}`, transportType: { driving: 'Automobile', walking: 'Walking', transit: 'Transit' }[mode] || 'Automobile' }).catch(() => null);
      if (apple && apple.routes && apple.routes[0]) {
        const r = apple.routes[0]; const steps = (r.stepIndexes || []).map(i => apple.steps[i]).filter(s => s && s.instructions).map(s => `${s.instructions} (${Math.round(s.distanceMeters)} m)`);
        return J({ source: 'Apple Maps', from: from.label, to: to.label, distance_km: round(r.distanceMeters / 1000), minutes: Math.round(r.expectedTravelTimeSeconds / 60), route: r.name, steps: steps.slice(0, 40), open: link });
      }
      if (mode === 'transit') return J({ note: 'Transit routing needs an Apple Maps token; open the link for transit directions.', open: link });
      const prof = mode === 'walking' ? 'foot' : 'driving';
      const r = await http('GET', `https://router.project-osrm.org/route/v1/${prof}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false&steps=true`, {}, null, 20000);
      const d = parseJSON(r.body, {}); const rt = d.routes && d.routes[0]; if (!rt) return J({ error: 'no route found', open: link });
      const steps = rt.legs[0].steps.map(s => `${s.maneuver.type}${s.maneuver.modifier ? ' ' + s.maneuver.modifier : ''}${s.name ? ' onto ' + s.name : ''} (${Math.round(s.distance)} m)`);
      return J({ source: 'OSRM / OpenStreetMap', from: from.label, to: to.label, distance_km: round(rt.distance / 1000), minutes: Math.round(rt.duration / 60), steps: steps.slice(0, 40), open: link });
    } },
  { name: 'apple_maps_open', group: 'Maps', description: 'Open Apple Maps (maps.apple.com) showing a place or turn-by-turn directions. Settings can switch this to the Android maps app.', parameters: P({ query: s_('place to show'), destination: s_('for directions'), origin: s_('optional start'), mode: s_('driving | walking | transit | cycling'), lat: n_('optional'), lon: n_('optional') }),
    run: async a => { const url = openMapsUrl(a); if (N) return (N.openUrl(url) ? 'opened ' : 'could not open ') + url; window.open(url, '_blank'); return 'opened ' + url; } },

  /* ---------------- Phone */
  { name: 'contacts_search', group: 'Phone', risky: true, description: 'Look up phone numbers in the device contacts by name.', parameters: P({ name: s_('contact name or part of it') }, ['name']),
    run: async a => { needNative('Contacts'); if (!(await ensurePermission('android.permission.READ_CONTACTS'))) throw new Error('Contacts permission denied'); const r = await nativeAsync('contactsSearch', a.name); return r.length ? r.map(c => `${c.name}: ${c.number}${c.type ? ' (' + c.type + ')' : ''}`).join('\n') : 'no contacts found'; } },
  { name: 'phone_call', group: 'Phone', risky: true, description: 'Call a phone number or contact. By default opens the dialer pre-filled; direct=true places the call immediately.', parameters: P({ number: s_('phone number'), contact: s_('or a contact name to look up'), direct: b_('place the call without the dialer step') }),
    run: async a => {
      needNative('Calling'); let num = a.number;
      if (!num && a.contact) { if (!(await ensurePermission('android.permission.READ_CONTACTS'))) throw new Error('Contacts permission denied'); const r = await nativeAsync('contactsSearch', a.contact); if (!r.length) return 'contact not found'; const names = [...new Set(r.map(c => c.name))]; if (names.length > 1) return 'Several contacts match — ask the user which one:\n' + r.map(c => `${c.name}: ${c.number}`).join('\n'); num = r[0].number; }
      if (!num) throw new Error('need number or contact');
      const direct = !!a.direct && await ensurePermission('android.permission.CALL_PHONE');
      return N.phoneCall(String(num), direct);
    } },
  { name: 'send_sms', group: 'Phone', risky: true, description: 'Open the messaging app with a text message ready to send to a number or contact.', parameters: P({ number: s_('phone number'), contact: s_('or contact name'), message: s_('text') }, ['message']),
    run: async a => {
      needNative('SMS'); let num = a.number;
      if (!num && a.contact) { if (!(await ensurePermission('android.permission.READ_CONTACTS'))) throw new Error('Contacts permission denied'); const r = await nativeAsync('contactsSearch', a.contact); if (!r.length) return 'contact not found'; num = r[0].number; }
      return N.openSms(String(num || ''), a.message);
    } },

  /* ---------------- Translation */
  { name: 'translate', group: 'Translation', description: 'Translate text into another language (engine from Settings: AI model, DeepL or LibreTranslate).', parameters: P({ text: s_('text'), target: s_('target language, e.g. Spanish or ES'), source: s_('optional source language'), engine: s_('optional: agent | deepl | libre') }, ['text', 'target']),
    run: async (a, ctx) => translateText(a, ctx) },
  { name: 'translate_image', group: 'Translation', description: 'Read and translate text in a photo/screenshot/PDF page (signs, menus, documents). Tip: camera_photo first to translate what the user sees.', parameters: P({ path: s_('image or pdf'), target: s_('target language') }, ['path', 'target']),
    run: async (a, ctx) => {
      const paths = extOf(a.path) === 'pdf' ? await pdfToImages(a.path, '1-5', 2) : [cleanPath(a.path)];
      return visionAsk(paths, `Read all text in the image(s) and translate it into ${a.target}. Format: for each block, the original line, then "→ translation". Keep it compact.`, ctx);
    } },
  { name: 'translate_file', group: 'Translation', description: 'Translate a text/code/markdown file or a PDF\'s text and save the result as a new file.', parameters: P({ path: s_('file'), target: s_('target language'), output: s_('optional output path') }, ['path', 'target']),
    run: async (a, ctx) => {
      const text = extOf(a.path) === 'pdf' ? (await pdfText(a.path)).text : await fsx.readText(a.path);
      const chunks = []; let cur = ''; for (const para of text.split(/\n{2,}/)) { if ((cur + para).length > 6000 && cur) { chunks.push(cur); cur = ''; } cur += para + '\n\n'; } if (cur.trim()) chunks.push(cur);
      const outParts = []; for (const c of chunks.slice(0, 30)) outParts.push(await translateText({ text: c, target: a.target }, ctx));
      const out = uniquePath(a.output || `outputs/${stemOf(a.path)}_${String(a.target).toLowerCase().replace(/[^a-z]+/g, '')}.${extOf(a.path) === 'pdf' ? 'txt' : (extOf(a.path) || 'txt')}`);
      return `translated ${chunks.length} chunk(s) → ${await fsx.writeText(out, outParts.join('\n\n'))}`;
    } },
);

/* ====================================================================== Files tab */
let _filesDir = '';
function renderFiles() {
  const v = $('#view-files');
  if (!N) { v.innerHTML = '<h2>Files</h2><p class="hint">The file workspace is only available in the Android app.</p>'; return; }
  let list = [];
  try { list = fsx.list(_filesDir, false); } catch (e) { _filesDir = ''; list = fsx.list('', false); }
  v.innerHTML = `<h2>Files</h2><p class="hint">The agent's private workspace. Photos, imports, downloads and everything skills produce land here. Attach files to a chat message, or ask an agent to work on them by path.</p>
    <div class="row"><button class="primary nogrow" id="fImport">📥 Import</button><button class="nogrow" id="fCam">📷 Photo</button><button class="nogrow" id="fRefresh">↻</button><span class="hint">/${esc(_filesDir)}</span></div>
    <div class="card" id="fList">${_filesDir ? `<div class="filerow"><button class="small" data-up>⬆ ..</button></div>` : ''}
    ${list.length ? list.map((f, i) => `<div class="filerow">${f.dir ? '<span style="font-size:1.6em">📁</span>' : isImagePath(f.path) ? `<img src="${esc(wsUrl(f.path))}?m=${f.mtime}" alt="">` : '<span style="font-size:1.6em">📄</span>'}
      <span class="fname" ${f.dir ? `data-cd="${i}" tabindex="0"` : ''}>${esc(f.name)}${f.dir ? '/' : ` <span class="hint">${fmtSize(f.size)}</span>`}</span>
      ${f.dir ? `<button class="small" data-cdb="${i}">Open</button>` : `<button class="small" data-act="attach" data-i="${i}">Attach</button><button class="small" data-act="open" data-i="${i}">View</button><button class="small" data-act="share" data-i="${i}">Share</button><button class="small" data-act="save" data-i="${i}">Save</button>`}
      <button class="small danger" data-act="del" data-i="${i}">✕</button></div>`).join('') : '<p class="hint">Empty.</p>'}</div>`;
  $('#fImport').onclick = () => importFiles().then(f => { toast(`${f.length} imported`); _filesDir = f.length ? 'imports' : _filesDir; renderFiles(); }).catch(e => toast(e.message));
  $('#fCam').onclick = () => takePhoto({}).then(p => { toast('Saved ' + p); _filesDir = dirOf(p); renderFiles(); }).catch(e => toast(e.message));
  $('#fRefresh').onclick = renderFiles;
  const up = $('[data-up]', v); if (up) up.onclick = () => { _filesDir = dirOf(_filesDir); renderFiles(); };
  $$('[data-cd],[data-cdb]', v).forEach(el => { const go = () => { _filesDir = list[Number(el.dataset.cd ?? el.dataset.cdb)].path; renderFiles(); }; el.onclick = go; el.onkeydown = e => { if (e.key === 'Enter') go(); }; });
  $$('[data-act]', v).forEach(b => b.onclick = async () => {
    const f = list[Number(b.dataset.i)];
    try {
      if (b.dataset.act === 'attach') { pendingAttachments.push(f.path); renderChips(); showTab('chat'); }
      if (b.dataset.act === 'open') { if (isImagePath(f.path)) infoBox(`<img src="${esc(wsUrl(f.path))}" style="max-width:100%;max-height:70vh" alt=""><p class="hint">${esc(f.path)}</p>`); else toast(N.openFile(f.path)); }
      if (b.dataset.act === 'share') toast(N.shareFile(f.path));
      if (b.dataset.act === 'save') { await nativeAsync('exportFile', f.path); toast('Saved'); }
      if (b.dataset.act === 'del' && await confirmBox(`Delete <b>${esc(f.path)}</b>?`)) { fsx.del(f.path); renderFiles(); }
    } catch (e) { toast(e.message); }
  });
}

/* ====================================================================== settings card */
function renderProSettings() {
  const st = S.settings; const ag = sel => S.agents.map(a => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)} · ${esc(a.model)}</option>`).join('');
  const has = k => getKey(k) ? 'saved ✓ (type to replace)' : '';
  return `<div class="card"><h3>Pro skills</h3>
    <div class="row"><div><label>Vision agent (image/video/OCR understanding)</label><select data-k="visionAgent">${ag(st.visionAgent)}</select></div>
    <div><label>OCR engine</label><select data-k="ocrEngine"><option value="local">Local Tesseract (offline, private)</option><option value="vision">Vision AI model</option></select></div>
    <div><label>OCR language (eng, fra, deu, spa, chi_sim, jpn…)</label><input data-k="ocrLang"></div></div>
    <div class="row"><div><label>Translation engine</label><select data-k="translateEngine"><option value="agent">AI agent</option><option value="deepl">DeepL</option><option value="libre">LibreTranslate</option></select></div>
    <div><label>Translator agent</label><select data-k="translateAgent"><option value="">(current chat agent)</option>${ag(st.translateAgent)}</select></div></div>
    <div class="row"><div><label>Live translate: my language</label><input data-k="translateMine"></div><div><label>Their language</label><input data-k="translateTheirs"></div>
    <label class="inline nogrow"><input type="checkbox" data-k="translateSpeak" data-t="bool">Speak translations</label></div>
    <div class="row"><div><label>DeepL API key</label><input type="password" data-secret="svc_deepl" placeholder="${has('svc_deepl')}"></div>
    <div><label>LibreTranslate URL</label><input data-k="libreUrl"></div><div><label>LibreTranslate key</label><input type="password" data-secret="svc_libre" placeholder="${has('svc_libre')}"></div></div>
    <div class="row"><div><label>Apple Maps Server API token (Apple Developer → Maps IDs/keys; optional)</label><input type="password" data-secret="svc_applemaps" placeholder="${has('svc_applemaps')}"></div>
    <div><label>Open maps in</label><select data-k="mapsApp"><option value="apple">Apple Maps (maps.apple.com)</option><option value="android">Android maps app</option></select></div></div>
    <div class="row"><div><label>Image generation provider</label><select data-k="imageProvider">${S.providers.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div><div><label>Image model</label><input data-k="imageModel"></div>
    <div><label>Camera countdown (s)</label><input data-k="cameraCountdown" data-t="num" type="number" min="0" max="10"></div></div>
    <div><label>GitHub token (optional, for private repos in github_get)</label><input type="password" data-secret="svc_github" placeholder="${has('svc_github')}"></div>
  </div>`;
}
function bindProSettings(v) {
  $$('[data-secret]', v).forEach(el => el.addEventListener('change', () => { setKey(el.dataset.secret, el.value); el.value = ''; el.placeholder = getKey(el.dataset.secret) ? 'saved ✓ (type to replace)' : ''; toast('Saved on device'); }));
}
