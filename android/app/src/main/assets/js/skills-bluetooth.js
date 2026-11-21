/* Halo: Bluetooth devices on the glasses. List, scan, pair and unpair headsets, keyboards,
 * controllers and phones. Pairing and unpairing ask first (risky skills). Loaded after
 * skills-glance.js. */
'use strict';
(() => {
  const P = (props, req = []) => ({ type: 'object', properties: props, required: req });
  const Str = d => ({ type: 'string', description: d });
  const Num = d => ({ type: 'number', description: d });
  const J = o => JSON.stringify(o, null, 1);
  const has = () => !!(N && N.btStatus);

  async function perms() {
    needNative('Bluetooth');
    if (!N.btNeedsPermission()) return;
    for (const p of ['android.permission.BLUETOOTH_SCAN', 'android.permission.BLUETOOTH_CONNECT'])
      if (!(await ensurePermission(p))) throw new Error('Bluetooth permission was denied');
  }
  const BT = {
    async status() { await perms(); const s = parseJSON(N.btStatus(), {}); if (s.error) throw new Error(s.error); return s; },
    async scan(seconds = 10) { await perms(); return (await nativeAsync('btScan', Math.round(Math.max(3, Math.min(30, seconds)) * 1000))).devices || []; },
    async pair(address) { await perms(); return nativeAsync('btPair', String(address)); },
    async unpair(address) { await perms(); const r = parseJSON(N.btUnpair(String(address)), {}); if (r.error) throw new Error(r.error); return r; },
  };
  window.HaloBluetooth = BT;
  const resolve = async (dev) => {
    const q = String(dev || '').trim(); if (/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i.test(q)) return q.toUpperCase();
    const s = await BT.status(); const pool = [...(s.paired || []), ...(lastScan || [])];
    const hit = pool.find(d => d.name.toLowerCase() === q.toLowerCase()) || pool.find(d => d.name.toLowerCase().includes(q.toLowerCase()));
    if (!hit) throw new Error(`No device called "${q}". Run bt_scan first.`);
    return hit.address;
  };
  let lastScan = [];

  BUILTIN_SKILLS.push(
    { name: 'bt_status', group: 'Glasses', description: 'Bluetooth on/off and the devices paired with the glasses (headsets, keyboards, controllers, phones).', parameters: P({}),
      run: async () => J(await BT.status()) },
    { name: 'bt_scan', group: 'Glasses', description: 'Scan for nearby Bluetooth devices to pair.', parameters: P({ seconds: Num('scan time, 3-30, default 10') }),
      run: async a => { lastScan = await BT.scan(a.seconds || 10); return J({ found: lastScan.filter(d => !d.paired) }); } },
    { name: 'bt_pair', group: 'Glasses', risky: true, description: 'Pair a Bluetooth device by name or address (from bt_scan). The glasses show a confirmation.', parameters: P({ device: Str('device name or address') }, ['device']),
      run: async a => J(await BT.pair(await resolve(a.device))) },
    { name: 'bt_unpair', group: 'Glasses', risky: true, description: 'Forget a paired Bluetooth device by name or address.', parameters: P({ device: Str('device name or address') }, ['device']),
      run: async a => J(await BT.unpair(await resolve(a.device))) },
  );

  /* ---------------------------------------------------------------- Settings card */
  const _renderSettings = renderSettings;
  window.renderSettings = renderSettings = function () {
    _renderSettings();
    const v = $('#view-settings'); if (!v) return;
    const card = document.createElement('div'); card.className = 'card';
    card.innerHTML = `<h3>Bluetooth devices</h3><p class="hint">Pair headphones, a keyboard, a game controller or your phone with the glasses.</p>
      <div id="btBody" class="hint">${has() ? 'Tap Refresh.' : 'Android app only.'}</div>
      <div class="row"><button class="nogrow" id="btRefresh">Refresh</button><button class="primary nogrow" id="btScan">Scan for devices</button><button class="nogrow" id="btSet">Bluetooth settings</button></div>`;
    v.appendChild(card);
    const body = $('#btBody', card);
    const row = (d, act) => `<div class="filerow"><span class="fname">${esc(d.name)} <span class="pill">${esc(d.kind)}</span>${d.connected ? '<span class="pill local">connected</span>' : ''}${d.rssi != null ? `<span class="hint"> ${d.rssi} dBm</span>` : ''}</span><button class="small" data-${act}="${esc(d.address)}">${act === 'pair' ? 'Pair' : 'Forget'}</button></div>`;
    const draw = (s, found) => {
      body.innerHTML = !s.available ? 'No Bluetooth on this device.' : !s.on ? 'Bluetooth is off. Turn it on in Bluetooth settings.'
        : `<b>Paired</b>${(s.paired || []).map(d => row(d, 'unpair')).join('') || '<div class="hint">None yet.</div>'}`
          + (found ? `<b>Nearby</b>${found.filter(d => !d.paired).map(d => row(d, 'pair')).join('') || '<div class="hint">Nothing found. Put the device in pairing mode and scan again.</div>'}` : '');
      $$('[data-pair]', body).forEach(b => b.onclick = async () => { b.disabled = true; b.textContent = 'Confirm on the glasses…'; try { await BT.pair(b.dataset.pair); toast('Paired'); } catch (e) { toast(e.message); } refresh(); });
      $$('[data-unpair]', body).forEach(b => b.onclick = async () => { if (!(await confirmBox(`Forget <b>${esc(b.closest('.filerow').querySelector('.fname').firstChild.textContent)}</b>?`))) return; try { await BT.unpair(b.dataset.unpair); toast('Forgotten'); } catch (e) { toast(e.message); } refresh(); });
    };
    const refresh = async (found) => { try { draw(await BT.status(), found); } catch (e) { body.textContent = e.message; } };
    $('#btRefresh', card).onclick = () => refresh();
    $('#btScan', card).onclick = async () => { if (!has()) return toast('Android app only'); body.textContent = 'Scanning for 10 seconds…'; try { lastScan = await BT.scan(10); refresh(lastScan); } catch (e) { body.textContent = e.message; } };
    $('#btSet', card).onclick = () => { if (N) toast(N.openSettings('bluetooth')); };
  };
})();
