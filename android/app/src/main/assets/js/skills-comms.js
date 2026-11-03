/* Nexus Agent — email (IMAP/SMTP or mail app) and calendar (Android device calendars +
 * CalDAV: iCloud, Fastmail, Nextcloud, Yahoo…) skills. Loaded after skills-pro.js. */
'use strict';

S.emailAccounts = S.emailAccounts || [];
S.caldavAccounts = S.caldavAccounts || [];
S.settings = { deviceCalendar: true, defaultCalendar: '', ...S.settings };

const EMAIL_PRESETS = {
  gmail: { label: 'Gmail (app password)', imapHost: 'imap.gmail.com', imapPort: 993, imapSecurity: 'ssl', smtpHost: 'smtp.gmail.com', smtpPort: 465, smtpSecurity: 'ssl', help: 'Google Account → Security → 2-Step Verification → App passwords' },
  icloud: { label: 'iCloud Mail (app-specific password)', imapHost: 'imap.mail.me.com', imapPort: 993, imapSecurity: 'ssl', smtpHost: 'smtp.mail.me.com', smtpPort: 587, smtpSecurity: 'starttls', help: 'appleid.apple.com → Sign-In and Security → App-Specific Passwords' },
  outlook: { label: 'Outlook / Microsoft 365', imapHost: 'outlook.office365.com', imapPort: 993, imapSecurity: 'ssl', smtpHost: 'smtp-mail.outlook.com', smtpPort: 587, smtpSecurity: 'starttls', help: 'Microsoft blocks password sign-in for many accounts (OAuth only). If login fails, use "Open mail app" (email_compose) instead.' },
  yahoo: { label: 'Yahoo Mail (app password)', imapHost: 'imap.mail.yahoo.com', imapPort: 993, imapSecurity: 'ssl', smtpHost: 'smtp.mail.yahoo.com', smtpPort: 465, smtpSecurity: 'ssl', help: 'Yahoo Account Security → Generate app password' },
  fastmail: { label: 'Fastmail (app password)', imapHost: 'imap.fastmail.com', imapPort: 993, imapSecurity: 'ssl', smtpHost: 'smtp.fastmail.com', smtpPort: 465, smtpSecurity: 'ssl', help: 'Settings → Privacy & Security → App passwords' },
  zoho: { label: 'Zoho Mail', imapHost: 'imap.zoho.com', imapPort: 993, imapSecurity: 'ssl', smtpHost: 'smtp.zoho.com', smtpPort: 465, smtpSecurity: 'ssl', help: 'Enable IMAP in Zoho settings; use an app password with 2FA' },
  custom: { label: 'Other IMAP/SMTP server', imapHost: '', imapPort: 993, imapSecurity: 'ssl', smtpHost: '', smtpPort: 465, smtpSecurity: 'ssl', help: 'Use the IMAP and SMTP settings from your provider' },
};
const CALDAV_PRESETS = {
  icloud: { label: 'iCloud Calendar', url: 'https://caldav.icloud.com/', help: 'Apple ID email + app-specific password' },
  fastmail: { label: 'Fastmail', url: 'https://caldav.fastmail.com/dav/', help: 'Fastmail email + app password' },
  nextcloud: { label: 'Nextcloud', url: 'https://YOUR-SERVER/remote.php/dav', help: 'Nextcloud username + app password' },
  yahoo: { label: 'Yahoo Calendar', url: 'https://caldav.calendar.yahoo.com/', help: 'Yahoo email + app password' },
  zoho: { label: 'Zoho Calendar', url: 'https://calendar.zoho.com/caldav/', help: 'Zoho email + app password' },
  custom: { label: 'Other CalDAV server', url: 'https://', help: 'Any CalDAV server URL (Radicale, Baikal, Synology…)' },
};

/* ====================================================================== dates */
const pad2 = n => String(n).padStart(2, '0');
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
/** Parses ISO strings (local time when no offset), YYYY-MM-DD (local midnight) and now/today/tomorrow/yesterday. */
function parseWhen(v, { endOfDay = false } = {}) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return new Date(v);
  const s = String(v).trim().toLowerCase();
  const now = new Date();
  const kw = { now: now, today: startOfDay(now), tomorrow: new Date(startOfDay(now).getTime() + 864e5), yesterday: new Date(startOfDay(now).getTime() - 864e5) };
  if (kw[s]) return endOfDay && s !== 'now' ? new Date(kw[s].getTime() + 864e5 - 1) : kw[s];
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) { const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])); return endOfDay ? new Date(d.getTime() + 864e5 - 1) : d; }
  const d = new Date(String(v).trim().replace(' ', 'T'));
  if (isNaN(d)) throw new Error(`Cannot understand date/time "${v}". Use ISO format like 2026-11-05T14:30`);
  return d;
}
const isDateOnly = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '').trim());
/** Named ranges: today, tomorrow, this week, next week, next 7 days, this month, next 30 days. */
function parseRange(a, defDays = 7) {
  const now = new Date(); const t0 = startOfDay(now);
  const r = String(a.range || '').toLowerCase().trim();
  const day = 864e5;
  if (r === 'today') return [t0, new Date(t0.getTime() + day)];
  if (r === 'tomorrow') return [new Date(t0.getTime() + day), new Date(t0.getTime() + 2 * day)];
  if (r === 'this week') { const mon = new Date(t0.getTime() - ((t0.getDay() + 6) % 7) * day); return [mon, new Date(mon.getTime() + 7 * day)]; }
  if (r === 'next week') { const mon = new Date(t0.getTime() + (7 - (t0.getDay() + 6) % 7) * day); return [mon, new Date(mon.getTime() + 7 * day)]; }
  if (r === 'this month') return [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1)];
  const nd = r.match(/^next (\d+) days?$/); if (nd) return [now, new Date(t0.getTime() + (Number(nd[1]) + 1) * day)];
  const start = a.start ? parseWhen(a.start) : now;
  const end = a.end ? parseWhen(a.end, { endOfDay: isDateOnly(a.end) }) : new Date(startOfDay(start).getTime() + (defDays + 1) * day);
  return [start, end];
}
function fmtWhen(ms, allDay) {
  const d = new Date(ms);
  return allDay ? d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
    : d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
const fmtTime = ms => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/* ====================================================================== iCalendar */
function icsEscape(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;'); }
function icsUnescape(s) { return String(s || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1'); }
function icsFold(line) { const out = []; let l = line; while (l.length > 74) { out.push(l.slice(0, 74)); l = ' ' + l.slice(74); } out.push(l); return out.join('\r\n'); }
const icsUtc = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsDate = ms => { const d = new Date(ms); return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`; };
function buildICS(events, { method } = {}) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nexus Agent//EN', 'CALSCALE:GREGORIAN'];
  if (method) L.push('METHOD:' + method);
  for (const e of events) {
    L.push('BEGIN:VEVENT', 'UID:' + (e.uid || (crypto.randomUUID ? crypto.randomUUID() : uid() + uid()) + '@nexus-agent'), 'DTSTAMP:' + icsUtc(Date.now()));
    if (e.allDay) { L.push('DTSTART;VALUE=DATE:' + icsDate(e.startMs), 'DTEND;VALUE=DATE:' + icsDate(e.endMs > e.startMs ? e.endMs : e.startMs + 864e5)); }
    else { L.push('DTSTART:' + icsUtc(e.startMs), 'DTEND:' + icsUtc(e.endMs || e.startMs + 36e5)); }
    L.push('SUMMARY:' + icsEscape(e.title || 'Event'));
    if (e.location) L.push('LOCATION:' + icsEscape(e.location));
    if (e.description) L.push('DESCRIPTION:' + icsEscape(e.description));
    if (e.rrule) L.push('RRULE:' + String(e.rrule).replace(/^RRULE:/i, ''));
    if (e.organizer) L.push('ORGANIZER:mailto:' + e.organizer);
    (e.attendees || []).forEach(a => L.push(`ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a}`));
    (e.reminderMinutes || []).forEach(m => L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder', `TRIGGER:-PT${Math.max(0, Math.round(m))}M`, 'END:VALARM'));
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(icsFold).join('\r\n') + '\r\n';
}
function tzOffsetMs(tz, utcMs) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(new Date(utcMs)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - utcMs;
}
function icsTime(value, params) {
  const v = String(value).trim();
  if (/^\d{8}$/.test(v) || /VALUE=DATE(?!-)/i.test(params || '')) return { ms: new Date(+v.slice(0, 4), +v.slice(4, 6) - 1, +v.slice(6, 8)).getTime(), allDay: true };
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/); if (!m) return { ms: NaN, allDay: false };
  const [, y, mo, d, h, mi, se, z] = m;
  if (z) return { ms: Date.UTC(+y, +mo - 1, +d, +h, +mi, +se), allDay: false };
  const tz = (String(params || '').match(/TZID=("?)([^;:"]+)\1/i) || [])[2];
  if (tz) { try { const guess = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se); const off = tzOffsetMs(tz, guess); return { ms: guess - tzOffsetMs(tz, guess - off), allDay: false }; } catch { /* unknown tz name: use device time */ } }
  return { ms: new Date(+y, +mo - 1, +d, +h, +mi, +se).getTime(), allDay: false };
}
function parseICS(text) {
  const lines = String(text || '').replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const events = []; let cur = null; let depth = 0;
  for (const line of lines) {
    if (/^BEGIN:VEVENT/i.test(line)) { cur = { attendees: [] }; depth = 0; continue; }
    if (!cur) continue;
    if (/^BEGIN:/i.test(line)) { depth++; continue; }
    if (/^END:VEVENT/i.test(line)) { if (cur.endMs == null && cur.startMs != null) cur.endMs = cur.startMs + (cur.allDay ? 864e5 : (cur.durMs || 36e5)); events.push(cur); cur = null; continue; }
    if (/^END:/i.test(line)) { depth--; continue; }
    if (depth > 0) continue; // skip VALARM etc.
    const m = line.match(/^([A-Za-z-]+)((?:;[^:]*)?):(.*)$/); if (!m) continue;
    const [, name, params, value] = m; const N = name.toUpperCase();
    if (N === 'UID') cur.uid = value;
    else if (N === 'SUMMARY') cur.title = icsUnescape(value);
    else if (N === 'LOCATION') cur.location = icsUnescape(value);
    else if (N === 'DESCRIPTION') cur.description = icsUnescape(value);
    else if (N === 'RRULE') cur.rrule = value;
    else if (N === 'RECURRENCE-ID') cur.recurrenceId = value;
    else if (N === 'ORGANIZER') cur.organizer = value.replace(/^mailto:/i, '');
    else if (N === 'ATTENDEE') cur.attendees.push(value.replace(/^mailto:/i, ''));
    else if (N === 'DTSTART') { const t = icsTime(value, params); cur.startMs = t.ms; cur.allDay = t.allDay; }
    else if (N === 'DTEND') cur.endMs = icsTime(value, params).ms;
    else if (N === 'DURATION') { const d = value.match(/P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/); if (d) cur.durMs = (((+d[1] || 0) * 7 + (+d[2] || 0)) * 864e5) + (+d[3] || 0) * 36e5 + (+d[4] || 0) * 6e4 + (+d[5] || 0) * 1e3; }
  }
  return events;
}

/* ====================================================================== CalDAV */
const B64 = s => btoa(unescape(encodeURIComponent(s)));
const davAuth = acct => ({ Authorization: 'Basic ' + B64(`${acct.username}:${getKey('svc_caldav_' + acct.id)}`) });
async function dav(acct, method, url, body, extra = {}) {
  const r = await http(method, url, { ...davAuth(acct), 'Content-Type': 'application/xml; charset=utf-8', ...extra }, body, 60000);
  if (r.status === 401) throw new Error(`${acct.name}: CalDAV login failed (check username / app-specific password)`);
  return r;
}
function xmlResponses(body) {
  const doc = new DOMParser().parseFromString(body, 'application/xml');
  return Array.from(doc.getElementsByTagNameNS('*', 'response'));
}
const xText = (el, name) => { const n = el.getElementsByTagNameNS('*', name)[0]; return n ? n.textContent.trim() : ''; };
const xHref = (el, name) => { const n = el.getElementsByTagNameNS('*', name)[0]; if (!n) return ''; const h = n.getElementsByTagNameNS('*', 'href')[0]; return h ? h.textContent.trim() : ''; };
const _davCache = {};
async function caldavCalendars(acct, refresh) {
  if (_davCache[acct.id] && !refresh) return _davCache[acct.id];
  const startUrl = acct.url.replace(/\s/g, '');
  let r = await dav(acct, 'PROPFIND', startUrl, '<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>', { Depth: '0' });
  let principal = r.status < 400 ? xmlResponses(r.body).map(x => xHref(x, 'current-user-principal')).find(Boolean) : '';
  if (!principal) {
    r = await dav(acct, 'PROPFIND', new URL('/.well-known/caldav', startUrl).href, '<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>', { Depth: '0' });
    principal = xmlResponses(r.body).map(x => xHref(x, 'current-user-principal')).find(Boolean);
  }
  if (!principal) throw new Error(`${acct.name}: CalDAV discovery failed (HTTP ${r.status})`);
  const principalUrl = new URL(principal, startUrl).href;
  r = await dav(acct, 'PROPFIND', principalUrl, '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>', { Depth: '0' });
  const home = xmlResponses(r.body).map(x => xHref(x, 'calendar-home-set')).find(Boolean);
  if (!home) throw new Error(`${acct.name}: no calendar-home-set (HTTP ${r.status})`);
  const homeUrl = new URL(home, principalUrl).href;
  r = await dav(acct, 'PROPFIND', homeUrl, '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:resourcetype/><d:displayname/><c:supported-calendar-component-set/><d:current-user-privilege-set/></d:prop></d:propfind>', { Depth: '1' });
  const cals = [];
  for (const x of xmlResponses(r.body)) {
    const rt = x.getElementsByTagNameNS('*', 'resourcetype')[0];
    if (!rt || !rt.getElementsByTagNameNS('*', 'calendar').length) continue;
    const comps = Array.from(x.getElementsByTagNameNS('*', 'comp')).map(c => c.getAttribute('name'));
    if (comps.length && !comps.includes('VEVENT')) continue;
    const href = xText(x, 'href');
    const privs = Array.from(x.getElementsByTagNameNS('*', 'privilege')).map(p => p.firstElementChild && p.firstElementChild.localName);
    cals.push({ id: `caldav:${acct.id}:${new URL(href, homeUrl).href}`, url: new URL(href, homeUrl).href, name: xText(x, 'displayname') || href, source: acct.name, writable: !privs.length || privs.some(p => p === 'write' || p === 'write-content' || p === 'all') });
  }
  acct.calendarNames = cals.map(c => c.name); save();
  return _davCache[acct.id] = cals;
}
async function caldavEvents(acct, cal, startMs, endMs) {
  const s = icsUtc(startMs), e = icsUtc(endMs);
  const body = `<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data><c:expand start="${s}" end="${e}"/></c:calendar-data></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${s}" end="${e}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
  const r = await dav(acct, 'REPORT', cal.url, body, { Depth: '1' });
  if (r.status >= 400) throw new Error(`${cal.name}: HTTP ${r.status}`);
  const out = [];
  for (const x of xmlResponses(r.body)) {
    const href = new URL(xText(x, 'href'), cal.url).href;
    for (const ev of parseICS(xText(x, 'calendar-data'))) {
      if (!(ev.endMs > startMs && ev.startMs < endMs)) continue;
      out.push({ ...ev, id: `caldav:${acct.id}:${href}`, calendar: cal.name, calendarId: cal.id, recurring: !!(ev.rrule || ev.recurrenceId) });
    }
  }
  return out;
}

/* ====================================================================== unified calendar */
/** Pluggable calendar sources (e.g. Google Calendar API). Each: {name, prefix, calendars(refresh), events(cal, startMs, endMs, query), create(cal, ev), update(id, args), remove(id)} */
const CAL_SOURCES = [];
const calSourceFor = id => CAL_SOURCES.find(s => String(id).startsWith(s.prefix));
async function allCalendars(refresh) {
  const out = [], errors = [];
  if (S.settings.deviceCalendar && N) {
    try {
      if (await ensurePermission('android.permission.READ_CALENDAR')) {
        (await nativeAsync('calendar', JSON.stringify({ op: 'calendars' }))).filter(c => c.visible !== false).forEach(c => out.push({ id: 'device:' + c.id, deviceId: c.id, name: c.name, source: 'Device · ' + (c.account || 'local'), writable: c.writable, primary: c.primary }));
      } else errors.push('Device calendars: permission denied');
    } catch (e) { errors.push('Device calendars: ' + e.message); }
  }
  for (const acct of S.caldavAccounts) {
    if (!acct.enabled) continue;
    try { out.push(...await caldavCalendars(acct, refresh)); } catch (e) { errors.push(e.message); }
  }
  for (const src of CAL_SOURCES) {
    try { out.push(...await src.calendars(refresh)); } catch (e) { errors.push(`${src.name}: ${e.message}`); }
  }
  return { calendars: out, errors };
}
function pickCalendar(cals, wanted) {
  if (wanted) {
    const w = String(wanted).toLowerCase();
    const hit = cals.find(c => c.id.toLowerCase() === w) || cals.find(c => c.name.toLowerCase() === w) || cals.find(c => (c.name + ' ' + c.source).toLowerCase().includes(w));
    if (!hit) throw new Error(`Calendar "${wanted}" not found. Available: ${cals.map(c => `${c.name} (${c.source})`).join(', ')}`);
    return hit;
  }
  return cals.find(c => c.id === S.settings.defaultCalendar && c.writable) || cals.find(c => c.primary && c.writable) || cals.find(c => c.writable && c.id.startsWith('caldav:')) || cals.find(c => c.writable);
}
async function listEvents(startMs, endMs, { query, calendar } = {}) {
  const { calendars, errors } = await allCalendars();
  const targets = calendar ? [pickCalendar(calendars, calendar)] : calendars;
  const events = [];
  for (const cal of targets) {
    try {
      const src = calSourceFor(cal.id);
      if (src) {
        events.push(...await src.events(cal, startMs, endMs, query));
      } else if (cal.id.startsWith('device:')) {
        events.push(...(await nativeAsync('calendar', JSON.stringify({ op: 'events', startMs, endMs, calendarId: cal.deviceId, query: query || '' }))).map(e => ({ ...e, id: 'device:' + e.id })));
      } else {
        const acct = S.caldavAccounts.find(a => cal.id.startsWith(`caldav:${a.id}:`));
        let evs = await caldavEvents(acct, cal, startMs, endMs);
        if (query) { const q = query.toLowerCase(); evs = evs.filter(e => [e.title, e.location, e.description].join(' ').toLowerCase().includes(q)); }
        events.push(...evs);
      }
    } catch (e) { errors.push(`${cal.name}: ${e.message}`); }
  }
  events.sort((a, b) => a.startMs - b.startMs);
  return { events, errors };
}
function eventLine(e) {
  const when = e.allDay ? `${fmtWhen(e.startMs, true)} (all day)` : `${fmtWhen(e.startMs)}–${fmtTime(e.endMs)}`;
  return `• ${when} · ${e.title || '(no title)'}${e.location ? ' @ ' + e.location : ''} [${e.calendar}]${e.recurring ? ' ↻' : ''}\n  id: ${e.id}`;
}
function eventFromArgs(a, base = {}) {
  const e = { ...base };
  if (a.title != null) e.title = a.title;
  if (a.location != null) e.location = a.location;
  if (a.description != null) e.description = a.description;
  if (a.all_day != null) e.allDay = !!a.all_day;
  if (a.start != null) {
    if (a.all_day == null && isDateOnly(a.start)) e.allDay = true;
    e.startMs = parseWhen(a.start).getTime();
    e.endMs = a.end ? parseWhen(a.end).getTime() + (e.allDay && isDateOnly(a.end) ? 864e5 : 0) : e.startMs + (e.allDay ? 864e5 : (Number(a.duration_minutes) || 60) * 6e4);
  } else if (a.end != null) e.endMs = parseWhen(a.end).getTime();
  if (a.recurrence != null) e.rrule = a.recurrence;
  if (a.attendees != null) e.attendees = a.attendees;
  if (a.reminder_minutes != null) e.reminderMinutes = [].concat(a.reminder_minutes).map(Number);
  return e;
}
async function caldavPut(acct, url, ics, extra) {
  const r = await http('PUT', url, { ...davAuth(acct), 'Content-Type': 'text/calendar; charset=utf-8', ...extra }, ics, 60000);
  if (r.status >= 400) throw new Error(`CalDAV save failed: HTTP ${r.status} ${clip(r.body, 200)}`);
  return r;
}
function caldavRef(id) {
  const acct = S.caldavAccounts.find(a => id.startsWith(`caldav:${a.id}:`));
  if (!acct) throw new Error('Unknown CalDAV account for event ' + id);
  return { acct, href: id.slice(`caldav:${acct.id}:`.length) };
}
async function createEvent(ev, calendar) {
  const { calendars } = await allCalendars();
  const cal = pickCalendar(calendars, calendar);
  if (!cal) throw new Error('No writable calendar. Enable device calendars, add a CalDAV account, or connect Google (Settings).');
  const src = calSourceFor(cal.id);
  if (src) return src.create(cal, ev);
  if (cal.id.startsWith('device:')) {
    if (!(await ensurePermission('android.permission.WRITE_CALENDAR'))) throw new Error('Calendar permission denied');
    const r = await nativeAsync('calendar', JSON.stringify({ op: 'create', event: { ...ev, calendarId: cal.deviceId } }));
    return { id: 'device:' + r.id, calendar: cal.name };
  }
  const { acct } = caldavRef(cal.id);
  const uidv = (crypto.randomUUID ? crypto.randomUUID() : uid() + uid() + uid());
  const url = cal.url.replace(/\/?$/, '/') + uidv + '.ics';
  const mine = S.emailAccounts[0] && S.emailAccounts[0].email;
  await caldavPut(acct, url, buildICS([{ ...ev, uid: uidv, organizer: ev.attendees && ev.attendees.length ? mine : undefined }]), { 'If-None-Match': '*' });
  return { id: `caldav:${acct.id}:${url}`, calendar: cal.name };
}

/* ====================================================================== email */
function emailAccount(name) {
  if (!S.emailAccounts.length) throw new Error('No email account set up. Add one in Settings → Email & calendar, or use email_compose to open the mail app.');
  if (!name) return S.emailAccounts[0];
  const n = String(name).toLowerCase();
  const a = S.emailAccounts.find(x => x.id === name || x.name.toLowerCase() === n || x.email.toLowerCase() === n) || S.emailAccounts.find(x => (x.name + ' ' + x.email).toLowerCase().includes(n));
  if (!a) throw new Error('Unknown email account. Available: ' + S.emailAccounts.map(x => `${x.name} <${x.email}>`).join(', '));
  return a;
}
async function mail(op, acctName, spec = {}) {
  needNative('Email');
  const a = emailAccount(acctName);
  const password = getKey('svc_mail_' + a.id);
  if (!password) throw new Error(`No password saved for ${a.email} (Settings → Email & calendar)`);
  return nativeAsync('email', JSON.stringify({ op, account: { ...a, password }, ...spec }));
}
function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  $$('script,style,head', doc).forEach(e => e.remove());
  $$('br', doc).forEach(e => e.replaceWith('\n'));
  $$('p,div,tr,li,h1,h2,h3,h4', doc).forEach(e => e.append('\n'));
  $$('a[href]', doc).forEach(e => { const h = e.getAttribute('href'); if (/^https?:/.test(h) && e.textContent.trim() !== h) e.append(` (${h})`); });
  return (doc.body ? doc.body.textContent : '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();
}
const fmtMailDate = ms => ms ? new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const addrList = v => Array.isArray(v) ? v.join(', ') : (v || '');

/* ====================================================================== skills */
const P2 = (props, req = []) => ({ type: 'object', properties: props, required: req });
const S2 = d => ({ type: 'string', description: d });
const N2 = d => ({ type: 'number', description: d });
const B2 = d => ({ type: 'boolean', description: d });
const A2 = (d, items = { type: 'string' }) => ({ type: 'array', items, description: d });
const ACCT = S2('optional email account name or address (default: first account)');
const WHEN = 'ISO date/time in local time, e.g. 2026-11-05T14:30 (or 2026-11-05 for all-day)';

BUILTIN_SKILLS.push(
  /* ---------------- Email */
  { name: 'email_list', group: 'Email', description: 'List or search emails (newest first): inbox overview, unread mail, from someone, about something, since a date.', parameters: P2({ folder: S2('folder, default INBOX'), unread_only: B2('only unread'), query: S2('text to search in subject/from/body'), from: S2('sender filter'), since: S2('only mail received since this date (ISO)'), limit: N2('max results, default 15'), account: ACCT }),
    run: async a => {
      const r = await mail('list', a.account, { folder: a.folder || 'INBOX', unreadOnly: !!a.unread_only, query: a.query || '', from: a.from || '', sinceMs: a.since ? parseWhen(a.since).getTime() : 0, limit: a.limit || 15 });
      if (!r.messages.length) return `No messages in ${r.folder} matching that (${r.total} total).`;
      return `${r.folder}: showing ${r.messages.length} of ${r.matched} (folder total ${r.total})\n` + r.messages.map(m => `uid ${m.uid} · ${m.unread ? '● ' : ''}${fmtMailDate(m.date)} · ${m.from} · ${m.subject || '(no subject)'}${m.hasAttachments ? ' 📎' : ''}${m.flagged ? ' ⚑' : ''}`).join('\n');
    } },
  { name: 'email_read', group: 'Email', description: 'Read one email in full (by uid from email_list). save_attachments stores attachments in the workspace for PDF/image/zip skills.', parameters: P2({ uid: N2('message uid'), folder: S2('folder, default INBOX'), save_attachments: B2('save attachments to workspace'), mark_read: B2('mark as read'), account: ACCT }, ['uid']),
    run: async a => {
      const m = await mail('read', a.account, { uid: a.uid, folder: a.folder || 'INBOX', saveAttachments: !!a.save_attachments, markRead: !!a.mark_read });
      const body = m.text ? m.text.trim() : htmlToText(m.html || '');
      const atts = (m.attachments || []).map(x => `📎 ${x.name} (${x.mime}${x.size > 0 ? ', ' + fmtSize(x.size) : ''})${x.path ? ' → ' + x.path : ''}`).join('\n');
      return `From: ${m.from}\nTo: ${m.to}${m.cc ? '\nCc: ' + m.cc : ''}\nDate: ${fmtMailDate(m.date)}\nSubject: ${m.subject}\n${atts ? atts + '\n' : ''}\n${clip(body, 16000)}`;
    } },
  { name: 'email_send', group: 'Email', risky: true, description: 'Send an email directly through the configured account (SMTP). Attachments are workspace paths (e.g. a PDF you created, a photo, a .ics invite).', parameters: P2({ to: S2('recipients, comma separated'), cc: S2('optional'), bcc: S2('optional'), subject: S2('subject'), body: S2('plain-text body'), attachments: A2('optional workspace file paths'), account: ACCT }, ['to', 'subject', 'body']),
    run: async a => { const r = await mail('send', a.account, { to: a.to, cc: a.cc || '', bcc: a.bcc || '', subject: a.subject, body: a.body, attachments: (a.attachments || []).map(cleanPath) }); return `Sent to ${r.recipients} recipient(s)${r.savedTo ? `, copy saved in ${r.savedTo}` : ''}.`; } },
  { name: 'email_reply', group: 'Email', risky: true, description: 'Reply (or reply-all) to an email by uid, keeping the thread.', parameters: P2({ uid: N2('message uid'), body: S2('reply text'), reply_all: B2('include all original recipients'), folder: S2('folder, default INBOX'), attachments: A2('optional workspace paths'), account: ACCT }, ['uid', 'body']),
    run: async a => {
      const acct = emailAccount(a.account);
      const m = await mail('read', a.account, { uid: a.uid, folder: a.folder || 'INBOX' });
      const me = acct.email.toLowerCase();
      const to = m.replyTo || m.from;
      let cc = '';
      if (a.reply_all) cc = [m.to, m.cc].filter(Boolean).join(', ').split(',').map(s => s.trim()).filter(s => s && !s.toLowerCase().includes(me) && !to.includes(s)).join(', ');
      const quoted = (m.text || htmlToText(m.html || '')).split('\n').slice(0, 60).map(l => '> ' + l).join('\n');
      const subject = /^re:/i.test(m.subject) ? m.subject : 'Re: ' + m.subject;
      const r = await mail('send', a.account, { to, cc, subject, body: `${a.body}\n\nOn ${fmtMailDate(m.date)}, ${m.from} wrote:\n${quoted}`, inReplyTo: m.messageId, references: [m.references, m.messageId].filter(Boolean).join(' '), attachments: (a.attachments || []).map(cleanPath) });
      return `Replied to ${to}${cc ? ' (cc ' + cc + ')' : ''}. ${r.savedTo ? 'Copy in ' + r.savedTo : ''}`;
    } },
  { name: 'email_manage', group: 'Email', risky: true, description: 'Change emails by uid: mark read/unread, flag/unflag, move to a folder, or delete.', parameters: P2({ uids: A2('message uids', { type: 'number' }), action: S2('read | unread | flag | unflag | move | delete'), target: S2('destination folder for move (see email_folders)'), folder: S2('current folder, default INBOX'), account: ACCT }, ['uids', 'action']),
    run: async a => { const r = await mail('modify', a.account, { uids: a.uids, action: a.action, target: a.target || '', folder: a.folder || 'INBOX' }); return `${a.action}: ${r.changed} message(s)`; } },
  { name: 'email_folders', group: 'Email', description: 'List mail folders/labels of an account.', parameters: P2({ account: ACCT }),
    run: async a => (await mail('folders', a.account)).join('\n') },
  { name: 'email_compose', group: 'Email', description: 'Open the device mail app with a ready draft (the user reviews and taps send). Works without setting up an account; supports workspace attachments.', parameters: P2({ to: S2('recipients'), cc: S2('optional'), bcc: S2('optional'), subject: S2('subject'), body: S2('body'), attachments: A2('optional workspace paths') }),
    run: async a => { needNative('Email'); return N.composeEmail(JSON.stringify({ ...a, attachments: (a.attachments || []).map(cleanPath) })); } },

  /* ---------------- Calendar */
  { name: 'calendar_list_calendars', group: 'Calendar', description: 'List available calendars (device accounts + CalDAV such as iCloud) and which is the default for new events.', parameters: P2({}),
    run: async () => { const { calendars, errors } = await allCalendars(true); const def = pickCalendar(calendars); return (calendars.map(c => `${c.id === (def && def.id) ? '★ ' : '• '}${c.name} — ${c.source}${c.writable ? '' : ' (read-only)'}\n  id: ${c.id}`).join('\n') || 'No calendars found.') + (errors.length ? '\nProblems: ' + errors.join('; ') : ''); } },
  { name: 'calendar_events', group: 'Calendar', description: "Show events in a time range across all calendars (agenda, what's next, find a meeting). Use range (today, tomorrow, this week, next week, this month, next N days) or start/end.", parameters: P2({ range: S2('named range'), start: S2(WHEN), end: S2(WHEN), query: S2('optional text filter'), calendar: S2('optional calendar name or id') }),
    run: async a => {
      const [s, e] = parseRange(a);
      const { events, errors } = await listEvents(s.getTime(), e.getTime(), a);
      return `${fmtWhen(s.getTime())} → ${fmtWhen(e.getTime())}: ${events.length} event(s)\n` + events.slice(0, 80).map(eventLine).join('\n') + (errors.length ? '\nProblems: ' + errors.join('; ') : '');
    } },
  { name: 'calendar_create_event', group: 'Calendar', risky: true, description: 'Add an event to a calendar. method "direct" saves it immediately (default); "app" opens the calendar app pre-filled for the user to confirm.', parameters: P2({ title: S2('title'), start: S2(WHEN), end: S2('optional end, ' + WHEN), duration_minutes: N2('used when end is omitted, default 60'), all_day: B2('all-day event'), location: S2('optional'), description: S2('optional notes'), attendees: A2('optional attendee emails'), reminder_minutes: A2('minutes before to remind, e.g. [10]', { type: 'number' }), recurrence: S2('optional RRULE, e.g. FREQ=WEEKLY;BYDAY=MO;COUNT=10'), calendar: S2('optional calendar name/id (default from Settings)'), method: S2('direct | app') }, ['title', 'start']),
    run: async a => {
      const ev = eventFromArgs(a);
      if (a.method === 'app') { needNative('Calendar'); return N.calendarInsertIntent(JSON.stringify(ev)); }
      const r = await createEvent(ev, a.calendar);
      return `Created "${ev.title}" ${ev.allDay ? fmtWhen(ev.startMs, true) + ' (all day)' : `${fmtWhen(ev.startMs)}–${fmtTime(ev.endMs)}`} in ${r.calendar}. id: ${r.id}` + (ev.attendees && ev.attendees.length && !/invites sent/.test(r.calendar) ? '\nNote: invitations are sent only if the calendar service does so; to be sure, email the invite with calendar_export_ics + email_send.' : '');
    } },
  { name: 'calendar_update_event', group: 'Calendar', risky: true, description: 'Change an existing event (id from calendar_events): reschedule, rename, move location, edit notes.', parameters: P2({ id: S2('event id'), title: S2('new title'), start: S2(WHEN), end: S2(WHEN), duration_minutes: N2('with start, if end omitted'), all_day: B2(''), location: S2(''), description: S2(''), recurrence: S2('RRULE') }, ['id']),
    run: async a => {
      if (calSourceFor(a.id)) return calSourceFor(a.id).update(a.id, a);
      if (a.id.startsWith('device:')) {
        if (!(await ensurePermission('android.permission.WRITE_CALENDAR'))) throw new Error('Calendar permission denied');
        const r = await nativeAsync('calendar', JSON.stringify({ op: 'update', id: a.id.slice(7), event: eventFromArgs(a) }));
        return r.updated ? 'Event updated.' : 'Event not found.';
      }
      const { acct, href } = caldavRef(a.id);
      const g = await http('GET', href, davAuth(acct), null, 30000);
      if (g.status >= 400) throw new Error('Cannot load event: HTTP ' + g.status);
      const evs = parseICS(g.body); const master = evs.find(e => !e.recurrenceId) || evs[0];
      if (!master) throw new Error('Event data not understood');
      const keepDur = master.endMs - master.startMs;
      const upd = eventFromArgs({ ...a, duration_minutes: a.duration_minutes || keepDur / 6e4 }, master);
      await caldavPut(acct, href, buildICS([upd]), g.headers && g.headers.etag ? { 'If-Match': g.headers.etag } : {});
      return 'Event updated.';
    } },
  { name: 'calendar_delete_event', group: 'Calendar', risky: true, description: 'Delete an event by id (deletes the whole series for recurring events).', parameters: P2({ id: S2('event id') }, ['id']),
    run: async a => {
      if (calSourceFor(a.id)) return calSourceFor(a.id).remove(a.id);
      if (a.id.startsWith('device:')) { if (!(await ensurePermission('android.permission.WRITE_CALENDAR'))) throw new Error('Calendar permission denied'); const r = await nativeAsync('calendar', JSON.stringify({ op: 'delete', id: a.id.slice(7) })); return r.deleted ? 'Deleted.' : 'Event not found.'; }
      const { acct, href } = caldavRef(a.id); const r = await http('DELETE', href, davAuth(acct), null, 30000);
      if (r.status >= 400 && r.status !== 404) throw new Error('Delete failed: HTTP ' + r.status); return r.status === 404 ? 'Event not found.' : 'Deleted.';
    } },
  { name: 'calendar_find_free_time', group: 'Calendar', description: 'Find open time slots of a given length across all calendars (within working hours).', parameters: P2({ duration_minutes: N2('meeting length, default 30'), range: S2('named range, default next 7 days'), start: S2(WHEN), end: S2(WHEN), day_start: S2('earliest time, default 09:00'), day_end: S2('latest time, default 17:00'), include_weekends: B2('default false') }),
    run: async a => {
      const dur = (Number(a.duration_minutes) || 30) * 6e4;
      const [s, e] = parseRange(a.range || a.start ? a : { range: 'next 7 days' });
      const { events, errors } = await listEvents(s.getTime(), e.getTime());
      const busy = events.filter(x => !x.allDay).map(x => [x.startMs, x.endMs]).sort((x, y) => x[0] - y[0]);
      const [dh, dm] = String(a.day_start || '09:00').split(':').map(Number), [eh, em] = String(a.day_end || '17:00').split(':').map(Number);
      const slots = [];
      for (let d = startOfDay(s); d < e && slots.length < 25; d = new Date(d.getTime() + 864e5)) {
        if (!a.include_weekends && (d.getDay() === 0 || d.getDay() === 6)) continue;
        let from = Math.max(new Date(d).setHours(dh, dm || 0, 0, 0), s.getTime(), Date.now());
        const to = Math.min(new Date(d).setHours(eh, em || 0, 0, 0), e.getTime());
        for (const [bs, be] of busy) { if (be <= from || bs >= to) continue; if (bs - from >= dur) slots.push([from, bs]); from = Math.max(from, be); }
        if (to - from >= dur) slots.push([from, to]);
      }
      return (slots.length ? `Free slots ≥ ${dur / 6e4} min:\n` + slots.slice(0, 25).map(([x, y]) => `• ${fmtWhen(x)} – ${fmtTime(y)}`).join('\n') : 'No free slots in that range.') + (errors.length ? '\nProblems: ' + errors.join('; ') : '');
    } },
  { name: 'calendar_export_ics', group: 'Calendar', description: 'Create an .ics invite file in the workspace (to email with email_send attachments, or share). Give event fields, or an existing event id.', parameters: P2({ id: S2('optional existing event id'), title: S2(''), start: S2(WHEN), end: S2(WHEN), all_day: B2(''), location: S2(''), description: S2(''), attendees: A2('emails'), output: S2('optional path') }),
    run: async a => {
      let ev;
      if (a.id) { const [s, e] = [Date.now() - 365 * 864e5, Date.now() + 730 * 864e5]; const { events } = await listEvents(s, e); ev = events.find(x => x.id === a.id); if (!ev) throw new Error('event not found'); }
      else ev = eventFromArgs(a);
      const mine = S.emailAccounts[0] && S.emailAccounts[0].email;
      const out = uniquePath(a.output || `outputs/${(ev.title || 'event').replace(/[^\w-]+/g, '_').slice(0, 40)}.ics`);
      await fsx.writeText(out, buildICS([{ ...ev, organizer: (ev.attendees || []).length ? mine : undefined }], { method: (ev.attendees || []).length ? 'REQUEST' : undefined }));
      return 'saved ' + out;
    } },
  { name: 'calendar_import_ics', group: 'Calendar', risky: true, description: 'Add the events from an .ics file (e.g. an invite saved from email_read attachments) to a calendar.', parameters: P2({ path: S2('.ics workspace path'), calendar: S2('optional calendar') }, ['path']),
    run: async a => {
      const evs = parseICS(await fsx.readText(a.path)).filter(e => !isNaN(e.startMs));
      if (!evs.length) return 'No events found in file.';
      const done = []; for (const ev of evs.slice(0, 50)) { const r = await createEvent({ title: ev.title, startMs: ev.startMs, endMs: ev.endMs, allDay: ev.allDay, location: ev.location, description: ev.description, rrule: ev.rrule }, a.calendar); done.push(`${ev.title} (${fmtWhen(ev.startMs, ev.allDay)}) → ${r.calendar}`); }
      return 'Imported:\n' + done.join('\n');
    } },
);

/* ====================================================================== agent context */
{
  const coreBuildSystem = buildSystem;
  // eslint-disable-next-line no-global-assign
  buildSystem = function (agent, opts) {
    const base = coreBuildSystem(agent, opts);
    if (!agent.tools) return base;
    const bits = [];
    if (S.emailAccounts.length) bits.push('Email accounts: ' + S.emailAccounts.map((a, i) => `${a.name} <${a.email}>${i ? '' : ' (default)'}`).join(', ') + '.');
    const cals = [S.settings.deviceCalendar ? 'device calendars' : '', ...S.caldavAccounts.filter(a => a.enabled).map(a => a.name + ' (CalDAV)')].filter(Boolean);
    if (cals.length) bits.push('Calendars: ' + cals.join(', ') + `. Time zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}. Pass times as local ISO (e.g. 2026-11-05T14:30).`);
    return bits.length ? base + '\n\n' + bits.join(' ') : base;
  };
}

/* ====================================================================== settings UI */
function renderCommsSettings() {
  const em = S.emailAccounts.map(a => `<div class="card" data-em="${a.id}"><h3><span>✉ ${esc(a.name)}</span><span class="row nogrow" style="flex:none"><button class="small" data-test>Test</button><button class="small danger" data-del>✕</button></span></h3>
    <div class="row"><div><label>Name</label><input data-k="name"></div><div><label>Email address</label><input data-k="email" inputmode="email"></div><div><label>Your display name</label><input data-k="fromName"></div></div>
    <div class="row"><div><label>Username (empty = email)</label><input data-k="username"></div><div><label>Password / app password</label><input type="password" data-pw placeholder="${getKey('svc_mail_' + a.id) ? 'saved ✓' : 'required'}"></div></div>
    <div class="row"><div><label>IMAP host</label><input data-k="imapHost"></div><div><label>Port</label><input data-k="imapPort" data-t="num" type="number"></div><div><label>Security</label><select data-k="imapSecurity"><option>ssl</option><option>starttls</option><option>none</option></select></div></div>
    <div class="row"><div><label>SMTP host</label><input data-k="smtpHost"></div><div><label>Port</label><input data-k="smtpPort" data-t="num" type="number"></div><div><label>Security</label><select data-k="smtpSecurity"><option>ssl</option><option>starttls</option><option>none</option></select></div></div>
    <p class="hint">${esc((EMAIL_PRESETS[a.preset] || {}).help || '')}</p><span class="hint res"></span></div>`).join('');
  const cd = S.caldavAccounts.map(a => `<div class="card" data-cd="${a.id}"><h3><span>📅 ${esc(a.name)}</span><span class="row nogrow" style="flex:none"><button class="small" data-test>Test</button><button class="small danger" data-del>✕</button></span></h3>
    <label class="inline"><input type="checkbox" data-k="enabled" data-t="bool">Enabled</label>
    <div class="row"><div><label>Name</label><input data-k="name"></div><div><label>Server URL</label><input data-k="url" inputmode="url"></div></div>
    <div class="row"><div><label>Username</label><input data-k="username"></div><div><label>Password / app password</label><input type="password" data-pw placeholder="${getKey('svc_caldav_' + a.id) ? 'saved ✓' : 'required'}"></div></div>
    <p class="hint">${esc((CALDAV_PRESETS[a.preset] || {}).help || '')}${a.calendarNames ? ' · Calendars: ' + esc(a.calendarNames.join(', ')) : ''}</p><span class="hint res"></span></div>`).join('');
  return `<div class="card" id="commsCard"><h3>Email &amp; calendar</h3>
    <p class="hint">Email: IMAP/SMTP with an app password (Gmail, iCloud, Yahoo, Fastmail, Zoho, custom). Without an account, agents can still draft mail in your mail app. Calendar: Android device calendars and/or CalDAV (iCloud, Fastmail, Nextcloud…) — CalDAV works on the glasses without a Google account.</p>
    ${em}
    <div class="row"><select id="emPreset">${Object.entries(EMAIL_PRESETS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select><button class="nogrow" id="emAdd">+ Email account</button></div>
    <label class="inline"><input type="checkbox" id="devCal" ${S.settings.deviceCalendar ? 'checked' : ''}>Use Android device calendars</label>
    ${cd}
    <div class="row"><select id="cdPreset">${Object.entries(CALDAV_PRESETS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select><button class="nogrow" id="cdAdd">+ CalDAV calendar</button></div>
    <div class="row"><div><label>Default calendar for new events</label><select id="defCal"><option value="">(automatic)</option>${S.settings.defaultCalendar ? `<option value="${esc(S.settings.defaultCalendar)}" selected>${esc(S.settings.defaultCalendarName || S.settings.defaultCalendar)}</option>` : ''}</select></div><button class="nogrow" id="loadCals">Load calendars</button></div>
  </div>`;
}
function bindCommsSettings(v) {
  const card = $('#commsCard', v); if (!card) return;
  $$('[data-em]', card).forEach(el => {
    const a = S.emailAccounts.find(x => x.id === el.dataset.em); bind(el, a);
    $('[data-pw]', el).addEventListener('change', e => { setKey('svc_mail_' + a.id, e.target.value); e.target.value = ''; e.target.placeholder = 'saved ✓'; toast('Password saved on device'); });
    $('[data-del]', el).onclick = async () => { if (await confirmBox(`Remove ${esc(a.email || a.name)}?`)) { setKey('svc_mail_' + a.id, ''); S.emailAccounts = S.emailAccounts.filter(x => x !== a); save(); renderSettings(); } };
    $('[data-test]', el).onclick = async () => { const r = $('.res', el); r.textContent = 'testing…'; try { const t = await mail('test', a.id); r.textContent = `✓ IMAP ok (${t.inboxUnread} unread / ${t.inboxMessages}), SMTP ok`; } catch (e) { r.textContent = '✗ ' + clip(e.message, 220); } };
  });
  $$('[data-cd]', card).forEach(el => {
    const a = S.caldavAccounts.find(x => x.id === el.dataset.cd); bind(el, a, () => { delete _davCache[a.id]; });
    $('[data-pw]', el).addEventListener('change', e => { setKey('svc_caldav_' + a.id, e.target.value); e.target.value = ''; e.target.placeholder = 'saved ✓'; delete _davCache[a.id]; toast('Password saved on device'); });
    $('[data-del]', el).onclick = async () => { if (await confirmBox(`Remove ${esc(a.name)}?`)) { setKey('svc_caldav_' + a.id, ''); S.caldavAccounts = S.caldavAccounts.filter(x => x !== a); save(); renderSettings(); } };
    $('[data-test]', el).onclick = async () => { const r = $('.res', el); r.textContent = 'connecting…'; try { const c = await caldavCalendars(a, true); r.textContent = `✓ ${c.length} calendar(s): ${c.map(x => x.name).join(', ')}`; } catch (e) { r.textContent = '✗ ' + clip(e.message, 220); } };
  });
  $('#emAdd', card).onclick = () => { const k = $('#emPreset', card).value; const p = EMAIL_PRESETS[k]; S.emailAccounts.push({ id: uid(), preset: k, name: p.label.split(' (')[0], email: '', username: '', fromName: '', imapHost: p.imapHost, imapPort: p.imapPort, imapSecurity: p.imapSecurity, smtpHost: p.smtpHost, smtpPort: p.smtpPort, smtpSecurity: p.smtpSecurity }); save(); renderSettings(); };
  $('#cdAdd', card).onclick = () => { const k = $('#cdPreset', card).value; const p = CALDAV_PRESETS[k]; S.caldavAccounts.push({ id: uid(), preset: k, name: p.label, url: p.url, username: '', enabled: true }); save(); renderSettings(); };
  $('#devCal', card).onchange = e => { S.settings.deviceCalendar = e.target.checked; save(); };
  $('#loadCals', card).onclick = async () => {
    try { const { calendars, errors } = await allCalendars(true); const sel = $('#defCal', card); sel.innerHTML = '<option value="">(automatic)</option>' + calendars.filter(c => c.writable).map(c => `<option value="${esc(c.id)}" ${c.id === S.settings.defaultCalendar ? 'selected' : ''}>${esc(c.name)} — ${esc(c.source)}</option>`).join(''); toast(`${calendars.length} calendars` + (errors.length ? ' · ' + errors[0] : '')); }
    catch (e) { toast(e.message); }
  };
  $('#defCal', card).onchange = e => { S.settings.defaultCalendar = e.target.value; S.settings.defaultCalendarName = e.target.selectedOptions[0] ? e.target.selectedOptions[0].textContent : ''; save(); };
}
{
  // Show the card in Settings after the pro-skills card.
  const coreRenderPro = renderProSettings, coreBindPro = bindProSettings;
  renderProSettings = () => coreRenderPro() + renderCommsSettings();
  bindProSettings = v => { coreBindPro(v); bindCommsSettings(v); };
}
/** Every secret the app stores (for export-with-keys and the phone remote console). */
function secretIds() {
  return [
    ...S.providers.map(p => ({ id: p.id, name: p.name })),
    { id: 'svc_deepl', name: 'DeepL API key' }, { id: 'svc_libre', name: 'LibreTranslate key' },
    { id: 'svc_applemaps', name: 'Apple Maps token' }, { id: 'svc_github', name: 'GitHub token' },
    ...S.emailAccounts.map(a => ({ id: 'svc_mail_' + a.id, name: `Email password: ${a.email || a.name}` })),
    ...S.caldavAccounts.map(a => ({ id: 'svc_caldav_' + a.id, name: `CalDAV password: ${a.name}` })),
  ];
}
