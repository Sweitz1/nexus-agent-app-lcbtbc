/* Nexus Agent — AutoGPT: autonomous goal-driven agent runs (plan → act → review → adapt) with
 * budgets, approvals, scheduling and an "Auto" tab, plus a client for real AutoGPT servers via the
 * open Agent Protocol. Loaded after skills-trust.js. */
'use strict';
(() => {
  const P = (props, req = []) => ({ type: 'object', properties: props, required: req });
  const Str = d => ({ type: 'string', description: d });
  const Num = d => ({ type: 'number', description: d });
  const Bool = d => ({ type: 'boolean', description: d });
  const J = o => JSON.stringify(o, null, 1);

  S.autoRuns = S.autoRuns || [];
  S.settings = { autoPlanner: '', autoWorker: '', autoMaxCycles: 15, autoMaxMinutes: 30, autogptUrl: '', ...S.settings };
  // Runs interrupted by an app restart resume only when the user says so.
  S.autoRuns.forEach(r => { if (r.status === 'running' || r.status === 'planning') { r.status = 'paused'; addLog(r, 'system', 'Paused because the app restarted — press Resume to continue.'); } });

  const live = {};              // runId → {stop: bool}
  const ACTIVE_MAX = 2;
  const runById = id => S.autoRuns.find(r => r.id === id || r.id.startsWith(String(id)));
  const pickAgent = id => agentById(id) || S.agents.find(a => a.name === 'Nexus') || agentById(S.current) || S.agents[0];
  function addLog(run, kind, text) { run.log = (run.log || []).concat([{ t: Date.now(), kind, text: clip(String(text), 1500) }]).slice(-300); }
  const jsonFrom = t => { const s = stripThink(String(t || '')); const m = s.match(/```(?:json)?\s*([\s\S]*?)```/) || s.match(/(\{[\s\S]*\})/); return m ? parseJSON(m[1], null) : null; };
  const progress = r => { const n = (r.plan || []).length, d = (r.plan || []).filter(t => t.status === 'done').length; return { n, d, pct: n ? Math.round(d / n * 100) : 0 }; };
  function refresh() { save(); if (currentTab === 'auto') renderAuto(); }

  /* ================================================================== the AutoGPT loop */
  async function ask(agent, prompt, run, tools = false) {
    const a = { ...agent, tools: tools && agent.tools };
    const r = await runAgent(a, prompt, { history: [], token: runToken, origin: 'auto', onStep: s => { if (s.done && s.name !== 'load_skills') { addLog(run, 'tool', `${s.name}(${clip(JSON.stringify(s.args || {}), 160)}) → ${clip(s.result, 300)}`); refresh(); } } });
    return stripThink(r.text);
  }
  const doneSummary = run => run.plan.filter(t => t.status === 'done' || t.status === 'failed').map(t => `- [${t.status}] ${t.task}: ${clip(t.result || '', 500)}`).join('\n') || '(nothing yet)';

  async function plan(run, planner) {
    run.status = 'planning'; addLog(run, 'system', 'Planning…'); refresh();
    const groups = [...new Set(skillsFor(pickAgent(run.workerId), 0).map(s => s.group))].join(', ');
    const out = await ask(planner, `You are the planner of an autonomous agent (like AutoGPT).
GOAL: ${run.goal}
${run.constraints ? 'CONSTRAINTS: ' + run.constraints + '\n' : ''}The worker agent has these skill groups: ${groups}.
It cannot ask the user questions mid-run; risky actions (payments, sending, deleting) need the user's approval and may be declined.
Make a concrete plan of 3-10 small tasks that together achieve the goal. Respond ONLY with JSON:
{"success_criteria": "how we know the goal is achieved", "plan": ["task 1", "task 2", ...]}`, run);
    const j = jsonFrom(out) || {};
    const tasks = Array.isArray(j.plan) && j.plan.length ? j.plan : out.split('\n').map(l => l.replace(/^\s*(\d+[.)]|[-*])\s*/, '').trim()).filter(l => l.length > 4).slice(0, 10);
    run.criteria = j.success_criteria || 'The goal is fully achieved.';
    run.plan = tasks.map((t, i) => ({ id: i + 1, task: String(typeof t === 'object' ? (t.task || JSON.stringify(t)) : t), status: 'todo' }));
    run.nextId = run.plan.length + 1;
    addLog(run, 'plan', run.plan.map(t => `${t.id}. ${t.task}`).join('\n')); refresh();
  }

  async function review(run, planner, task) {
    const out = await ask(planner, `You review the progress of an autonomous agent.
GOAL: ${run.goal}
SUCCESS CRITERIA: ${run.criteria}
MEMORY NOTES: ${run.memory || '(none)'}
PLAN:
${run.plan.map(t => `${t.id}. [${t.status}] ${t.task}`).join('\n')}
LAST TASK (#${task.id}): ${task.task}
RESULT: ${clip(task.result, 4000)}
Decide. Respond ONLY with JSON:
{"task_status": "done" | "failed", "remember": "short facts worth keeping for later tasks (or empty)", "add_tasks": ["new task", ...], "remove_task_ids": [ids of todo tasks no longer needed], "goal_complete": true | false}`, run);
    const j = jsonFrom(out) || { task_status: 'done', goal_complete: false };
    task.status = j.task_status === 'failed' ? 'failed' : 'done';
    if (j.remember) run.memory = clip(((run.memory || '') + '\n• ' + j.remember).trim(), 4000);
    (j.remove_task_ids || []).forEach(id => { const t = run.plan.find(x => x.id === Number(id) && x.status === 'todo'); if (t) t.status = 'skipped'; });
    (j.add_tasks || []).slice(0, 5).forEach(t => { if (run.plan.length < 25) run.plan.push({ id: run.nextId++, task: String(t), status: 'todo' }); });
    if ((j.add_tasks || []).length || (j.remove_task_ids || []).length) addLog(run, 'plan', `Plan updated: +${(j.add_tasks || []).length} −${(j.remove_task_ids || []).length}`);
    return !!j.goal_complete;
  }

  async function finish(run, planner, status, why) {
    run.status = 'reporting'; refresh();
    let report = '';
    try {
      report = await ask(planner, `Write the final report of an autonomous agent run for the user (concise, scannable, with concrete results, links/file paths, and anything left undone).
GOAL: ${run.goal}
OUTCOME: ${status}${why ? ' — ' + why : ''}
MEMORY: ${run.memory || '(none)'}
TASKS AND RESULTS:
${doneSummary(run)}`, run);
    } catch (e) { report = `Run ${status}. ${why || ''}\n\n${doneSummary(run)}`; }
    if (status === 'done') run.plan.forEach(t => { if (t.status === 'todo') t.status = 'skipped'; }); // goal met early
    run.report = report; run.status = status; run.finished = Date.now(); addLog(run, 'report', report); refresh();
    const head = `🤖 AutoGPT ${status === 'done' ? 'finished' : status}: ${clip(run.goal, 80)}`;
    addMsg({ role: 'assistant', agent: 'AutoGPT', content: `**${head}**\n\n${report}`, ts: Date.now() });
    if (run.notify !== false) {
      speak(`${head}. ${plain(report).slice(0, 220)}`);
      try { if (window.NexusMusic && NexusMusic.hudOn()) N.hudPost(JSON.stringify({ mode: 'reply', title: 'AutoGPT', text: clip(plain(report), 600) })); } catch { /* optional */ }
      try { if (S.settings.telegramBridge && S.telegram.allowed.length) for (const c of S.telegram.allowed) await http('POST', `https://api.telegram.org/bot${getKey('svc_telegram')}/sendMessage`, { 'Content-Type': 'application/json' }, JSON.stringify({ chat_id: c, text: `${head}\n\n${clip(report, 3500)}` }), 20000); } catch { /* optional */ }
      notifyReplyHooks('AutoGPT', run.goal, report, 'auto');
    }
  }

  async function loop(run) {
    if (live[run.id]) return; live[run.id] = { stop: false };
    const ctl = live[run.id];
    const planner = pickAgent(run.plannerId || S.settings.autoPlanner), worker = pickAgent(run.workerId || S.settings.autoWorker);
    run.startedAt = run.startedAt || Date.now(); run.cycles = run.cycles || 0;
    try {
      if (!run.plan || !run.plan.length) await plan(run, planner);
      run.status = 'running'; refresh();
      while (true) {
        if (ctl.stop) { run.status = ctl.pause ? 'paused' : 'stopped'; addLog(run, 'system', ctl.pause ? 'Paused.' : 'Stopped by user.'); if (!ctl.pause) await finish(run, planner, 'stopped', 'stopped by the user'); else refresh(); return; }
        const mins = (Date.now() - run.startedAt - (run.pausedMs || 0)) / 60000;
        if (run.cycles >= run.maxCycles) return await finish(run, planner, 'budget', `cycle budget of ${run.maxCycles} reached`);
        if (mins >= run.maxMinutes) return await finish(run, planner, 'budget', `time budget of ${run.maxMinutes} min reached`);
        const task = run.plan.find(t => t.status === 'todo');
        if (!task) return await finish(run, planner, 'done', 'all tasks completed');
        if (run.approval === 'each') {
          const ok = await confirmBox(`<b>AutoGPT</b> next step for "${esc(clip(run.goal, 80))}":<p><b>${esc(task.task)}</b></p><p class="hint">Allow runs it · Deny skips it.</p>`, 120000);
          if (!ok) { task.status = 'skipped'; addLog(run, 'system', `Skipped by user: ${task.task}`); refresh(); continue; }
        }
        run.cycles++; task.status = 'doing'; addLog(run, 'task', `▶ ${task.id}. ${task.task}`); refresh();
        try {
          task.result = await ask(worker, `You are the worker of an autonomous agent (like AutoGPT). Complete ONE task using your skills, then report.
OVERALL GOAL: ${run.goal}
${run.constraints ? 'CONSTRAINTS: ' + run.constraints + '\n' : ''}SUCCESS CRITERIA: ${run.criteria}
MEMORY NOTES: ${run.memory || '(none)'}
COMPLETED SO FAR:
${doneSummary(run)}

CURRENT TASK: ${task.task}

Do the task now (use skills; save useful outputs to workspace files and mention their paths). You cannot ask the user questions — make reasonable assumptions and state them. End with a short factual RESULT summary.`, run, true);
        } catch (e) {
          if (e.message === 'Stopped') { ctl.stop = true; continue; }
          task.result = 'ERROR: ' + e.message;
        }
        addLog(run, 'result', `${task.id}. ${clip(task.result, 800)}`); refresh();
        let complete = false;
        try { complete = await review(run, planner, task); } catch (e) { task.status = task.result.startsWith('ERROR') ? 'failed' : 'done'; addLog(run, 'system', 'Review failed: ' + e.message); }
        refresh();
        if (complete) return await finish(run, planner, 'done', 'success criteria met');
      }
    } catch (e) {
      addLog(run, 'error', e.message); await finish(run, planner, 'failed', e.message);
    } finally { delete live[run.id]; refresh(); }
  }

  function startRun({ goal, constraints, workerId, plannerId, maxCycles, maxMinutes, approval, schedule, notify }) {
    if (!goal || String(goal).trim().length < 4) throw new Error('Describe the goal');
    if (Object.keys(live).length >= ACTIVE_MAX) throw new Error(`Already ${ACTIVE_MAX} autonomous runs active — wait or stop one first.`);
    const run = { id: 'ag' + uid(), goal: String(goal).trim(), constraints: constraints || '', workerId: workerId || '', plannerId: plannerId || '', status: 'queued', created: Date.now(),
      maxCycles: Math.max(1, Math.min(60, Number(maxCycles) || Number(S.settings.autoMaxCycles) || 15)), maxMinutes: Math.max(1, Math.min(240, Number(maxMinutes) || Number(S.settings.autoMaxMinutes) || 30)),
      approval: approval === 'each' ? 'each' : 'auto', schedule: schedule || null, notify: notify !== false, plan: [], log: [], memory: '' };
    S.autoRuns.unshift(run); S.autoRuns = S.autoRuns.slice(0, 40); addLog(run, 'system', 'Goal set: ' + run.goal); refresh();
    loop(run);
    return run;
  }
  function control(run, action) {
    const ctl = live[run.id];
    if (action === 'pause') { if (ctl) { ctl.stop = true; ctl.pause = true; run.pauseAt = Date.now(); } return 'Pausing after the current step.'; }
    if (action === 'stop') { if (ctl) ctl.stop = true; else if (run.status === 'paused') { run.status = 'stopped'; refresh(); } return 'Stopping after the current step.'; }
    if (action === 'stop_now') { if (ctl) ctl.stop = true; stopRun(); return 'Stopped immediately.'; }
    if (action === 'resume') { if (ctl) return 'Already running.'; if (!['paused', 'budget', 'failed', 'stopped'].includes(run.status)) return 'Nothing to resume.'; if (run.pauseAt) { run.pausedMs = (run.pausedMs || 0) + (Date.now() - run.pauseAt); run.pauseAt = null; } if (run.status === 'budget') { run.maxCycles += 10; run.maxMinutes += 15; } run.status = 'running'; addLog(run, 'system', 'Resumed.'); loop(run); return 'Resumed.'; }
    if (action === 'delete') { if (ctl) ctl.stop = true; S.autoRuns = S.autoRuns.filter(r => r !== run); refresh(); return 'Deleted.'; }
    return 'Unknown action';
  }

  // Recurring goals (while the app is open): re-run a fresh copy when due.
  setInterval(() => {
    const now = new Date();
    for (const r of S.autoRuns.filter(x => x.schedule && x.schedule.every && !x.scheduleCopy)) {
      const s = r.schedule; const last = s.lastRun || r.created;
      const due = s.every === 'hourly' ? now - last >= 36e5 : (() => { const [h, m] = String(s.at || '08:00').split(':').map(Number); const t = new Date(now); t.setHours(h, m || 0, 0, 0); return now >= t && last < t.getTime(); })();
      if (due && Object.keys(live).length < ACTIVE_MAX) { s.lastRun = Date.now(); try { const c = startRun({ ...r, schedule: null }); c.scheduleCopy = r.id; addLog(c, 'system', `Scheduled run (${s.every}) of goal ${r.id}`); } catch { /* busy */ } }
    }
  }, 60000);

  /* ================================================================== AutoGPT servers (Agent Protocol) */
  async function apRun(url, input, maxSteps = 30) {
    const base = String(url || S.settings.autogptUrl || '').replace(/\/+$/, ''); if (!base) throw new Error('Set your AutoGPT server URL in Settings → AutoGPT (it must speak the Agent Protocol, e.g. AutoGPT Forge / classic agents).');
    const H = { 'Content-Type': 'application/json', ...(getKey('svc_autogpt') ? { 'X-API-Key': getKey('svc_autogpt'), Authorization: 'Bearer ' + getKey('svc_autogpt') } : {}) };
    const task = await postJSON(`${base}/ap/v1/agent/tasks`, H, { input }, 60000);
    const id = task.task_id || task.id; const outs = [];
    for (let i = 0; i < Math.min(100, maxSteps); i++) {
      const st = await postJSON(`${base}/ap/v1/agent/tasks/${id}/steps`, H, { input: '' }, 300000);
      if (st.output) outs.push(`${st.name ? st.name + ': ' : ''}${st.output}`);
      if (st.is_last || st.status === 'completed' && st.is_last !== false) break;
    }
    const arts = parseJSON((await http('GET', `${base}/ap/v1/agent/tasks/${id}/artifacts`, H, null, 30000)).body, {});
    const saved = [];
    for (const a of (arts.artifacts || arts || []).slice(0, 20)) { if (!a || !a.artifact_id) continue; try { const r = await nativeAsync('download', JSON.stringify({ url: `${base}/ap/v1/agent/tasks/${id}/artifacts/${a.artifact_id}`, headers: H, path: `autogpt/${id}/${(a.file_name || a.artifact_id).replace(/[^\w.-]/g, '_')}` })); saved.push(r.path); } catch { /* skip */ } }
    return { task_id: id, steps: outs.length, output: outs.join('\n\n'), files: saved };
  }

  /* ================================================================== skills */
  BUILTIN_SKILLS.push(
    { name: 'autogpt_start', group: 'AutoGPT', description: 'Start an autonomous AutoGPT-style run in the background for a bigger goal ("research the best e-bike under $1500 and write a comparison PDF", "find 5 apartments and draft emails"). It plans, works through tasks with all skills, adapts, and reports back (chat, voice, HUD, Telegram). Optional daily/hourly schedule for recurring goals.', parameters: P({ goal: Str('the goal, with all details'), constraints: Str('optional limits: budget, sources, things not to do'), max_cycles: Num('task budget, default 15'), max_minutes: Num('time budget, default 30'), approve_each_step: Bool('ask the user before every task'), schedule: Str('optional: hourly | daily@HH:MM') }, ['goal']),
      run: async (a, ctx) => {
        if (ctx.origin === 'auto') return 'Autonomous runs cannot start other autonomous runs.';
        const sch = a.schedule ? (/^hourly$/i.test(a.schedule) ? { every: 'hourly' } : { every: 'daily', at: (String(a.schedule).match(/(\d{1,2}:\d{2})/) || [])[1] || '08:00' }) : null;
        const r = startRun({ goal: a.goal, constraints: a.constraints, maxCycles: a.max_cycles, maxMinutes: a.max_minutes, approval: a.approve_each_step ? 'each' : 'auto', schedule: sch });
        return `Started AutoGPT run ${r.id.slice(0, 8)} (budget ${r.maxCycles} tasks / ${r.maxMinutes} min${sch ? `, repeats ${sch.every}${sch.at ? ' at ' + sch.at : ''}` : ''}). Progress is in the Auto tab; I'll report when it's done.`;
      } },
    { name: 'autogpt_status', group: 'AutoGPT', description: 'Status of autonomous runs: progress, current task, findings, or the final report of a run.', parameters: P({ id: Str('optional run id (default: all recent)') }),
      run: async a => {
        if (a.id) { const r = runById(a.id); if (!r) return 'Run not found.'; const p = progress(r); return `${r.goal}\nStatus: ${r.status} · ${p.d}/${p.n} tasks · ${r.cycles || 0}/${r.maxCycles} cycles\n${r.plan.map(t => `${{ done: '☑', failed: '✗', doing: '▶', skipped: '–', todo: '☐' }[t.status]} ${t.task}`).join('\n')}${r.memory ? '\nNotes:' + r.memory : ''}${r.report ? '\n\nREPORT:\n' + r.report : ''}`; }
        return S.autoRuns.slice(0, 10).map(r => { const p = progress(r); return `• ${r.id.slice(0, 8)} [${r.status}] ${p.d}/${p.n} · ${clip(r.goal, 90)}${r.schedule ? ' (scheduled)' : ''}`; }).join('\n') || 'No autonomous runs yet.';
      } },
    { name: 'autogpt_control', group: 'AutoGPT', description: 'Pause, resume, stop (after the current step), stop_now, or delete an autonomous run.', parameters: P({ id: Str('run id'), action: Str('pause | resume | stop | stop_now | delete') }, ['id', 'action']),
      run: async a => { const r = runById(a.id); if (!r) return 'Run not found.'; return control(r, a.action); } },
    { name: 'autogpt_server_run', group: 'AutoGPT', description: 'Send a task to a self-hosted AutoGPT agent (Agent Protocol, e.g. AutoGPT Forge/classic) and collect its step outputs and artifacts into the workspace.', parameters: P({ input: Str('the task for the AutoGPT agent'), url: Str('optional server URL (default from Settings)'), max_steps: Num('default 30') }, ['input']),
      run: async a => { const r = await apRun(a.url, a.input, a.max_steps || 30); return `AutoGPT task ${r.task_id}: ${r.steps} step(s)${r.files.length ? '\nFiles: ' + r.files.join(', ') : ''}\n\n${clip(r.output, 12000)}`; } },
  );

  /* ================================================================== AutoGPT chat mode */
  const modeSel = $('#modeSel'); if (modeSel && !modeSel.querySelector('[value=auto]')) { const o = document.createElement('option'); o.value = 'auto'; o.textContent = 'AutoGPT'; modeSel.appendChild(o); }
  {
    const coreDispatch = dispatch;
    dispatch = async (prompt, opts = {}) => {
      if ((opts.mode || S.mode) !== 'auto') return coreDispatch(prompt, opts);
      addMsg({ role: 'user', content: prompt, ts: Date.now(), origin: opts.origin || 'chat' });
      const r = startRun({ goal: prompt });
      const text = `🤖 Autonomous run started (${r.maxCycles} tasks / ${r.maxMinutes} min budget). I'll plan, work through it with my skills and report back here. Watch it live in the **Auto** tab.`;
      addMsg({ role: 'assistant', agent: 'AutoGPT', content: text, ts: Date.now() });
      return { agent: 'AutoGPT', text };
    };
  }
  {
    const coreBar = renderChatBar;
    renderChatBar = () => { coreBar(); if (S.mode === 'auto') { $('#agentSel').style.display = 'none'; $('#modeInfo').textContent = 'AutoGPT: each message becomes an autonomous goal (Auto tab)'; } };
  }

  /* ================================================================== Auto tab */
  const tabBtn = document.createElement('button'); tabBtn.dataset.tab = 'auto'; tabBtn.textContent = 'Auto'; tabBtn.onclick = () => showTab('auto');
  $('#tabs [data-tab=agents]').after(tabBtn);
  const sec = document.createElement('section'); sec.id = 'view-auto'; sec.className = 'view'; $('main').appendChild(sec);
  extraTabs.auto = renderAuto;
  let openRun = null;
  const ICON = { done: '☑', failed: '✗', doing: '▶', skipped: '–', todo: '☐' };
  const STATUS = { queued: 'queued', planning: '🧭 planning', running: '⚙️ running', reporting: '📝 reporting', paused: '⏸ paused', done: '✅ done', stopped: '■ stopped', budget: '⏱ budget reached', failed: '⚠️ failed' };
  function renderAuto() {
    const v = $('#view-auto'); if (!v) return;
    const focusId = document.activeElement && document.activeElement.id;
    if (openRun) {
      const r = runById(openRun); if (!r) { openRun = null; return renderAuto(); }
      const p = progress(r);
      v.innerHTML = `<div class="row"><button class="small nogrow" id="auBack">← Runs</button><span class="hint">${STATUS[r.status] || r.status} · ${p.d}/${p.n} tasks · ${r.cycles || 0}/${r.maxCycles} cycles</span></div>
        <h2>${esc(r.goal)}</h2>${r.criteria ? `<p class="hint">Done when: ${esc(r.criteria)}</p>` : ''}
        <div class="row">${live[r.id] ? '<button class="nogrow" data-c="pause">⏸ Pause</button><button class="danger nogrow" data-c="stop">■ Stop</button>' : ['paused', 'budget', 'failed', 'stopped'].includes(r.status) ? `<button class="primary nogrow" data-c="resume">▶ ${r.status === 'budget' ? 'Continue (+10 tasks)' : 'Resume'}</button>` : ''}<button class="danger nogrow" data-c="delete">Delete</button></div>
        <div class="card"><h3>Plan</h3>${r.plan.map(t => `<div class="hint" style="color:${t.status === 'doing' ? 'var(--accent)' : ''}">${ICON[t.status]} ${t.id}. ${esc(t.task)}</div>`).join('') || '<p class="hint">planning…</p>'}</div>
        ${r.report ? `<div class="card"><h3>Report</h3>${md(r.report)}</div>` : ''}
        ${r.memory ? `<div class="card"><h3>Notes</h3><div class="hint" style="white-space:pre-wrap">${esc(r.memory)}</div></div>` : ''}
        <div class="card"><h3>Log</h3>${r.log.slice().reverse().slice(0, 80).map(l => `<div class="hint" style="white-space:pre-wrap;border-bottom:1px solid var(--line);padding:.2em 0"><b>${new Date(l.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ${esc(l.kind)}</b> ${esc(l.text)}</div>`).join('')}</div>`;
      $('#auBack').onclick = () => { openRun = null; renderAuto(); };
      $$('[data-c]', v).forEach(b => b.onclick = async () => { if (b.dataset.c === 'delete' && !(await confirmBox('Delete this run?'))) return; toast(control(r, b.dataset.c)); if (b.dataset.c === 'delete') openRun = null; renderAuto(); });
      return;
    }
    v.innerHTML = `<h2>AutoGPT</h2><p class="hint">Give a goal; the agent plans, works through tasks with all its skills, reviews and adapts, then reports back. Risky actions still ask you. Runs continue while the app is open.</p>
      <div class="card"><label>Goal</label><textarea id="auGoal" rows="3" placeholder="e.g. Research the 3 best noise-cancelling earbuds under $200, compare them in a PDF and email it to me"></textarea>
        <label>Constraints (optional)</label><input id="auCons" placeholder="e.g. only use reputable review sites; don't buy anything">
        <div class="row"><div><label>Tasks budget</label><input id="auCyc" type="number" value="${S.settings.autoMaxCycles}"></div><div><label>Minutes budget</label><input id="auMin" type="number" value="${S.settings.autoMaxMinutes}"></div>
        <div><label>Worker agent</label><select id="auWorker"><option value="">(default)</option>${S.agents.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></div>
        <div><label>Repeat</label><select id="auSched"><option value="">once</option><option value="hourly">hourly</option><option value="daily">daily at…</option></select></div><div><label>at</label><input id="auAt" value="08:00"></div></div>
        <label class="inline"><input type="checkbox" id="auEach">Ask me before each step</label>
        <div class="row"><button class="primary nogrow" id="auGo">🚀 Start</button></div></div>
      ${S.autoRuns.map((r, i) => { const p = progress(r); const cur = r.plan.find(t => t.status === 'doing'); return `<div class="card" tabindex="0" data-run="${r.id}"><h3><span>${esc(clip(r.goal, 90))}</span><span class="pill">${STATUS[r.status] || r.status}</span></h3><div style="height:5px;background:var(--line);border-radius:3px;overflow:hidden"><i style="display:block;height:100%;width:${p.pct}%;background:var(--accent)"></i></div><p class="hint">${p.d}/${p.n} tasks · ${r.cycles || 0}/${r.maxCycles} cycles${cur ? ' · now: ' + esc(clip(cur.task, 70)) : ''}${r.schedule ? ` · repeats ${r.schedule.every}${r.schedule.at ? ' ' + r.schedule.at : ''}` : ''}${r.scheduleCopy ? ' · scheduled run' : ''}</p></div>`; }).join('') || '<p class="hint">No runs yet.</p>'}`;
    $('#auGo').onclick = () => {
      try {
        const sch = $('#auSched').value ? { every: $('#auSched').value, ...($('#auSched').value === 'daily' ? { at: $('#auAt').value || '08:00' } : {}) } : null;
        const r = startRun({ goal: $('#auGoal').value, constraints: $('#auCons').value, maxCycles: $('#auCyc').value, maxMinutes: $('#auMin').value, workerId: $('#auWorker').value, approval: $('#auEach').checked ? 'each' : 'auto', schedule: sch });
        openRun = r.id; renderAuto();
      } catch (e) { toast(e.message); }
    };
    $$('[data-run]', v).forEach(c => { const go = () => { openRun = c.dataset.run; renderAuto(); }; c.onclick = go; c.onkeydown = e => { if (e.key === 'Enter') go(); }; });
    if (focusId && document.getElementById(focusId)) document.getElementById(focusId).focus();
  }

  /* ================================================================== settings */
  const coreRenderPro = renderProSettings, coreBindPro = bindProSettings;
  renderProSettings = () => coreRenderPro() + `<div class="card" id="autoCard"><h3>AutoGPT</h3>
    <div class="row"><div><label>Planner/reviewer agent</label><select data-k="autoPlanner"><option value="">(Nexus)</option>${S.agents.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></div>
    <div><label>Worker agent</label><select data-k="autoWorker"><option value="">(Nexus)</option>${S.agents.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></div></div>
    <div class="row"><div><label>Default task budget</label><input data-k="autoMaxCycles" data-t="num" type="number" min="1" max="60"></div><div><label>Default minutes budget</label><input data-k="autoMaxMinutes" data-t="num" type="number" min="1" max="240"></div></div>
    <div class="row"><div><label>AutoGPT server (Agent Protocol) URL — optional</label><input data-k="autogptUrl" placeholder="http://192.168.1.20:8000"></div><div><label>Server API key (optional)</label><input type="password" data-secret="svc_autogpt" placeholder="${getKey('svc_autogpt') ? 'saved ✓' : ''}"></div></div>
    <p class="hint">Autonomous runs use many model calls — budgets keep cost in check. Each task also respects the normal confirmations for risky actions.</p></div>`;
  bindProSettings = v => { coreBindPro(v); const c = $('#autoCard', v); if (!c) return; bind(c, S.settings); $$('[data-secret]', c).forEach(el => el.addEventListener('change', () => { setKey(el.dataset.secret, el.value); el.value = ''; el.placeholder = 'saved ✓'; toast('Saved on device'); })); };
  { const coreSecrets = secretIds; secretIds = () => [...coreSecrets(), { id: 'svc_autogpt', name: 'AutoGPT server key' }]; }

  window.NexusAuto = { startRun, control, loop, apRun, progress };
})();
