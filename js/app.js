/* ══════════════════════════════════════════════════════
   THE CODE · Projects — app.js  v2
   Arch: Projects (แม่) → Milestones → Tasks/Kanban (ลูก)
══════════════════════════════════════════════════════ */

// ── State ────────────────────────────────────────────────────
const S = {
  user: null, token: null,
  projects: [], tasks: [], milestones: [], members: [],
  currentProject: null,
  editingProjectId: null, editingMsId: null, editingTaskId: null,
  taskFilters: { type: '', ms: '', assignee: '', search: '' },
  projFilter: '',
  projColor: '#00d4a0',
  detailTab: 'timeline',
  dragTaskId: null, dragLane: null,
};

const LANES = [
  { id:'icebox',  label:'Icebox',    emoji:'❄️', cls:'l-icebox'  },
  { id:'backlog', label:'Backlog',   emoji:'📋', cls:'l-backlog' },
  { id:'current', label:'Current',   emoji:'🔵', cls:'l-current' },
  { id:'review',  label:'Review',    emoji:'🔍', cls:'l-review'  },
  { id:'done',    label:'Done',      emoji:'✅', cls:'l-done'    },
];

const PROJ_COLORS = ['#00d4a0','#3b9eff','#7c5cfc','#f5a623','#f04060','#06b6d4','#10b981','#ec4899'];
const AV_COLORS   = ['#00d4a0','#7c5cfc','#3b9eff','#f5a623','#f04060','#06b6d4'];
const MS_EMOJI = { pending:'⏳', inprogress:'🔵', done:'✅', overdue:'🔴' };

// ── Utils ─────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const esc = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function toast(msg, type='inf') {
  const el = document.createElement('div');
  el.className = `toast t-${type}`;
  el.textContent = msg;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function loading(on) { $('loading-wrap').style.display = on ? 'flex' : 'none'; }

function initials(name='') {
  return name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2) || '?';
}

function avColor(name='') {
  let h = 0;
  for (const c of name) h = ((h<<5)-h) + c.charCodeAt(0);
  return AV_COLORS[Math.abs(h) % AV_COLORS.length];
}

function fmtDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'2-digit'}); } catch { return d; }
}

function simpleHash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h<<5)+h) ^ s.charCodeAt(i);
  return (h>>>0).toString(16).padStart(8,'0');
}

function genLocalId(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
}

// ── API ───────────────────────────────────────────────────────
async function api(action, payload={}) {
  const body = { action, token: S.token, ...payload };
  const res = await fetch(GAS_URL, {
    method:'POST',
    body: JSON.stringify(body),
    headers:{'Content-Type':'text/plain'},
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'API Error');
  return data;
}

// ── Auth ──────────────────────────────────────────────────────
function authTab(t) {
  $('t-login').style.display  = t==='login' ? 'block' : 'none';
  $('t-chpw').style.display   = t==='chpw'  ? 'block' : 'none';
  document.querySelectorAll('.auth-tab').forEach((btn,i) => {
    btn.classList.toggle('on', (i===0&&t==='login') || (i===1&&t==='chpw'));
  });
}

async function doLogin() {
  const email = $('l-email').value.trim();
  const pw    = $('l-pw').value;
  const errEl = $('l-err');
  const btn   = $('l-btn');
  errEl.style.display = 'none';
  if (!email||!pw) { errEl.textContent='กรุณากรอกข้อมูล'; errEl.style.display='block'; return; }
  btn.disabled=true; btn.textContent='กำลังตรวจสอบ...';
  try {
    const data = await api('login',{email, passwordHash:simpleHash(pw)});
    S.user  = data.user;
    S.token = data.token;
    sessionStorage.setItem('sess', JSON.stringify({user:data.user, token:data.token}));
    bootApp();
  } catch(e) {
    errEl.textContent = e.message || 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
    errEl.style.display = 'block';
  } finally { btn.disabled=false; btn.textContent='เข้าสู่ระบบ'; }
}

async function doChangePassword() {
  const email = $('cp-email').value.trim();
  const oldPw = $('cp-old').value;
  const newPw = $('cp-new').value;
  const errEl = $('cp-err');
  errEl.style.display='none';
  if (!email||!oldPw||!newPw) { errEl.textContent='กรุณากรอกข้อมูล'; errEl.style.display='block'; return; }
  if (newPw.length<6) { errEl.textContent='รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร'; errEl.style.display='block'; return; }
  $('cp-btn').disabled=true; $('cp-btn').textContent='กำลังเปลี่ยน...';
  try {
    await api('changePassword',{email, oldHash:simpleHash(oldPw), newHash:simpleHash(newPw)});
    toast('เปลี่ยนรหัสผ่านสำเร็จ','ok');
    authTab('login');
  } catch(e) { errEl.textContent=e.message||'เกิดข้อผิดพลาด'; errEl.style.display='block'; }
  finally { $('cp-btn').disabled=false; $('cp-btn').textContent='เปลี่ยนรหัสผ่าน'; }
}

async function doChangePwProfile() {
  const old = $('pp-old').value; const nw = $('pp-new').value;
  if (!old||!nw) { toast('กรุณากรอกรหัสผ่าน','err'); return; }
  if (nw.length<6) { toast('รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร','err'); return; }
  try {
    await api('changePassword',{email:S.user.email, oldHash:simpleHash(old), newHash:simpleHash(nw)});
    toast('เปลี่ยนรหัสผ่านสำเร็จ','ok');
    closeModal('m-profile');
  } catch(e) { toast(e.message,'err'); }
}

function doLogout() {
  sessionStorage.removeItem('sess');
  S.user=null; S.token=null;
  $('auth').style.display='flex'; $('app').style.display='none';
}

// ── Boot ──────────────────────────────────────────────────────
async function bootApp() {
  $('auth').style.display='none'; $('app').style.display='flex';
  const u = S.user;
  $('top-name').textContent = u.name || u.email;
  const av = $('top-av');
  av.textContent = initials(u.name||u.email);
  av.style.background = avColor(u.name||u.email);
  av.style.color = '#080c14';

  const isAdmin = u.role==='Admin';
  if (isAdmin) {
    $('btn-new-proj').style.display='block';
    $('sb-members').style.display='flex';
  }

  // Swatches
  const sw = $('proj-swatches');
  PROJ_COLORS.forEach(c => {
    const d = document.createElement('div');
    d.className='swatch'; d.style.background=c; d.dataset.color=c;
    d.onclick = () => { S.projColor=c; sw.querySelectorAll('.swatch').forEach(s=>s.classList.toggle('on',s===d)); };
    sw.appendChild(d);
  });
  sw.firstChild?.classList.add('on');

  loading(true);
  try { await loadAll(); }
  catch(e) { toast('โหลดข้อมูลไม่สำเร็จ: '+e.message,'err'); }
  finally { loading(false); }
}

async function loadAll() {
  const data = await api('getAllData');
  S.projects   = data.projects   || [];
  S.tasks      = data.tasks      || [];
  S.milestones = data.milestones || [];
  S.members    = data.members    || [];
  updateSidebar();
  if (S.currentProject) {
    renderProjectDetail(S.currentProject);
  } else {
    renderProjectsGrid();
  }
  renderMyTasks();
  renderMembersView();
  $('sb-proj-count').textContent = S.projects.length;
  const myT = S.tasks.filter(t=>t.assignee===S.user.email&&t.lane!=='done').length;
  $('sb-mytasks-count').textContent = myT || '';
}

async function syncAll() {
  toast('กำลัง Sync...','inf');
  loading(true);
  try { await loadAll(); toast('Sync สำเร็จ','ok'); }
  catch(e) { toast('Sync ไม่สำเร็จ','err'); }
  finally { loading(false); }
}

// ── Sidebar ───────────────────────────────────────────────────
function updateSidebar() {
  const list = $('sb-proj-list');
  list.innerHTML = '';
  S.projects.slice(0,12).forEach(p => {
    const d = document.createElement('div');
    d.className = 'sb-item' + (S.currentProject===p.id ? ' on' : '');
    d.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${p.color||'#00d4a0'};flex-shrink:0"></span>${esc(p.name.slice(0,22))}`;
    d.onclick = () => goProjectDetail(p.id);
    list.appendChild(d);
  });
}

function setSbActive(id) {
  ['sb-projects','sb-mytasks','sb-members'].forEach(k => {
    const el=$(k); if(el) el.classList.remove('on');
  });
  if(id) { const el=$(id); if(el) el.classList.add('on'); }
}

// ── Views Navigation ──────────────────────────────────────────
function showView(v) {
  ['view-projects','view-project-detail','view-mytasks','view-members'].forEach(id => {
    const el=$(id); if(el) el.classList.toggle('on', el.id===v);
  });
}

function goProjects() {
  S.currentProject=null;
  setSbActive('sb-projects');
  updateSidebar();
  setBreadcrumb([]);
  renderProjectsGrid();
  showView('view-projects');
}

function goMyTasks() {
  S.currentProject=null;
  setSbActive('sb-mytasks');
  setBreadcrumb([]);
  renderMyTasks();
  showView('view-mytasks');
}

function goMembers() {
  setSbActive('sb-members');
  showView('view-members');
}

function goProjectDetail(projectId) {
  S.currentProject = projectId;
  S.detailTab = 'timeline';
  setSbActive(null);
  updateSidebar();
  showView('view-project-detail');
  renderProjectDetail(projectId);
}

function setBreadcrumb(crumbs) {
  const bar = $('breadcrumb-bar');
  if (!crumbs.length) { bar.innerHTML=''; return; }
  bar.innerHTML = crumbs.map((c,i) =>
    i < crumbs.length-1
      ? `<span class="bc-link" onclick="${c.action}">${esc(c.label)}</span><span class="bc-sep">/</span>`
      : `<span class="bc-current">${esc(c.label)}</span>`
  ).join('');
}

// ── Projects Grid ─────────────────────────────────────────────
function setProjFilter(f) {
  S.projFilter = f;
  document.querySelectorAll('[data-pf]').forEach(b => b.classList.toggle('on', b.dataset.pf===f));
  renderProjectsGrid();
}

function renderProjectsGrid() {
  const grid = $('proj-grid');
  const empty = $('proj-empty');
  const search = ($('search-inp').value||'').toLowerCase();

  let projs = S.projects;
  if (S.projFilter) projs = projs.filter(p=>p.status===S.projFilter);
  if (search) projs = projs.filter(p=>(p.name||'').toLowerCase().includes(search)||(p.description||'').toLowerCase().includes(search));

  grid.innerHTML='';
  if (!projs.length) { empty.style.display='flex'; return; }
  empty.style.display='none';

  projs.forEach(p => {
    const tasks = S.tasks.filter(t=>t.projectId===p.id);
    const done  = tasks.filter(t=>t.lane==='done').length;
    const pct   = tasks.length ? Math.round(done/tasks.length*100) : 0;
    const milestones = S.milestones.filter(m=>m.projectId===p.id);
    const color = p.color || '#00d4a0';

    const card = document.createElement('div');
    card.className='project-card';
    card.style.setProperty('--pcolor', color);
    card.style.cssText += `cursor:pointer`;
    card.querySelector?.('.project-card::before');

    const statusMap = {planning:'b-status-planning',active:'b-status-active',done:'b-status-done',paused:'b-status-paused'};

    card.innerHTML = `
      <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${color};border-radius:14px 14px 0 0"></div>
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px;padding-top:4px">
        <div class="proj-name">${esc(p.name)}</div>
        <span class="badge ${statusMap[p.status]||'b-status-planning'}" style="flex-shrink:0;margin-left:8px">${p.status||'planning'}</span>
      </div>
      <p class="proj-desc">${esc((p.description||'').slice(0,90))}${(p.description||'').length>90?'...':''}</p>
      <div class="proj-progress-wrap">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text2);margin-bottom:4px">
          <span>${done}/${tasks.length} tasks</span>
          <span style="font-weight:700;color:${pct===100?'var(--em)':'var(--text2)'}">${pct}%</span>
        </div>
        <div class="proj-progress-bar"><div class="proj-progress-fill" style="width:${pct}%;background:${color}"></div></div>
      </div>
      <div class="proj-meta">
        <span class="proj-stat">📍 ${milestones.length} milestones</span>
        ${p.endDate ? `<span class="proj-stat">🗓 ${fmtDate(p.endDate)}</span>` : ''}
      </div>
      <div class="proj-milestones-mini">
        ${milestones.slice(0,8).map(m=>`<div class="ms-dot" style="background:${m.status==='done'?color:m.status==='inprogress'?'var(--info)':m.status==='overdue'?'var(--danger)':'var(--border2)'}" title="${esc(m.name)}"></div>`).join('')}
      </div>`;
    card.addEventListener('click', () => goProjectDetail(p.id));
    if (['Admin','Manager'].includes(S.user?.role)) {
      const editBtn = document.createElement('button');
      editBtn.style.cssText='position:absolute;top:14px;right:14px;background:none;border:none;cursor:pointer;color:var(--text2);opacity:0;transition:opacity .15s;font-size:12px;padding:4px';
      editBtn.textContent='✏️';
      editBtn.onclick = e => { e.stopPropagation(); openProjectModal(p.id); };
      card.style.position='relative';
      card.appendChild(editBtn);
      card.addEventListener('mouseenter',()=>editBtn.style.opacity='1');
      card.addEventListener('mouseleave',()=>editBtn.style.opacity='0');
    }
    grid.appendChild(card);
  });
}

// ── Project Detail ─────────────────────────────────────────────
function renderProjectDetail(projectId) {
  const p = S.projects.find(x=>x.id===projectId);
  if (!p) { goProjects(); return; }

  setBreadcrumb([
    { label:'All Projects', action:'goProjects()' },
    { label: p.name }
  ]);

  const tasks = S.tasks.filter(t=>t.projectId===projectId);
  const done  = tasks.filter(t=>t.lane==='done').length;
  const pct   = tasks.length ? Math.round(done/tasks.length*100) : 0;
  const milestones = S.milestones.filter(m=>m.projectId===projectId);

  const statusMap = {planning:'b-status-planning',active:'b-status-active',done:'b-status-done',paused:'b-status-paused'};

  $('det-proj-name').textContent = p.name;
  const sEl = $('det-proj-status');
  sEl.className='badge '+statusMap[p.status];
  sEl.textContent = p.status||'planning';
  $('det-proj-desc').textContent = p.description||'';
  $('det-pct').textContent = pct+'%';
  $('det-pct-label').textContent = pct+'%';
  $('det-total-tasks').textContent = tasks.length;
  $('det-done-tasks').textContent  = done;
  $('det-ms-count').textContent    = milestones.length;
  $('det-progress-fill').style.width = pct+'%';

  const canEdit = ['Admin','Manager','Member'].includes(S.user?.role);
  $('btn-add-ms').style.display   = canEdit ? 'block' : 'none';
  $('btn-add-task').style.display = canEdit ? 'block' : 'none';

  // Populate milestone filter
  const msSel = $('filter-ms');
  msSel.innerHTML = '<option value="">Milestone: ทั้งหมด</option>';
  milestones.forEach(m => {
    const opt=document.createElement('option'); opt.value=m.id; opt.textContent=m.name;
    msSel.appendChild(opt);
  });

  // Populate assignee filter & modal select
  const asSel = $('filter-assignee-task');
  const tfAs  = $('tf-assignee');
  asSel.innerHTML='<option value="">Assignee: ทั้งหมด</option>';
  tfAs.innerHTML='<option value="">— ไม่ระบุ —</option>';
  S.members.forEach(m => {
    [asSel, tfAs].forEach(sel => {
      const opt=document.createElement('option'); opt.value=m.email;
      opt.textContent=m.name||m.email; sel.appendChild(opt);
    });
  });

  // Populate ms modal select
  const tfMs = $('tf-ms');
  tfMs.innerHTML='<option value="">— ไม่มี Milestone —</option>';
  milestones.forEach(m => {
    const opt=document.createElement('option'); opt.value=m.id; opt.textContent=m.name;
    tfMs.appendChild(opt);
  });

  switchDetailTab(S.detailTab);
}

function switchDetailTab(tab) {
  S.detailTab = tab;
  $('tab-timeline').classList.toggle('on', tab==='timeline');
  $('tab-board').classList.toggle('on', tab==='board');
  $('detail-timeline').style.display = tab==='timeline' ? 'block' : 'none';
  $('detail-board').style.display    = tab==='board'    ? 'block' : 'none';
  if (tab==='timeline') renderTimeline();
  if (tab==='board') renderTaskBoard();
}

// ── Milestone Timeline ─────────────────────────────────────────
function renderTimeline() {
  const list = $('timeline-list');
  const empty= $('timeline-empty');
  const p = S.projects.find(x=>x.id===S.currentProject);
  const color = p?.color || '#00d4a0';
  list.innerHTML='';

  const milestones = S.milestones
    .filter(m=>m.projectId===S.currentProject)
    .sort((a,b)=> (a.targetDate||'').localeCompare(b.targetDate||''));

  if (!milestones.length) { empty.style.display='flex'; return; }
  empty.style.display='none';

  const canEdit = ['Admin','Manager','Member'].includes(S.user?.role);

  milestones.forEach((ms, idx) => {
    const msTasks = S.tasks.filter(t=>t.milestoneId===ms.id);
    const msDone  = msTasks.filter(t=>t.lane==='done').length;
    const msPct   = msTasks.length ? Math.round(msDone/msTasks.length*100) : (ms.status==='done'?100:0);
    const overdue = ms.status!=='done' && ms.targetDate && new Date(ms.targetDate) < new Date();
    const effStatus = overdue ? 'overdue' : ms.status;

    const iconCls = {done:'done',inprogress:'inprogress',overdue:'overdue',pending:'pending'}[effStatus]||'pending';

    const row = document.createElement('div');
    row.className='milestone-row';
    row.innerHTML = `
      <div class="ms-icon ${iconCls}">${MS_EMOJI[effStatus]||'⏳'}</div>
      <div class="ms-body" style="${effStatus==='done'?'border-color:rgba(0,212,160,.25)':effStatus==='overdue'?'border-color:rgba(240,64,96,.2)':effStatus==='inprogress'?'border-color:rgba(59,158,255,.2)':''}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:2px">
          <div class="ms-name">${esc(ms.name)}</div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;margin-left:10px">
            ${msTasks.length ? `<span style="font-size:11px;color:var(--text2)">${msDone}/${msTasks.length}</span>` : ''}
            <span style="font-size:12px;font-weight:700;color:${msPct===100?'var(--em)':'var(--text2)'}">${msPct}%</span>
            ${canEdit ? `<button onclick="openMilestoneModal('${ms.id}')" style="background:none;border:none;cursor:pointer;color:var(--text2);font-size:11px;padding:2px 6px;border-radius:5px;background:var(--surface2)">✏️</button>` : ''}
          </div>
        </div>
        <div class="ms-date">${ms.targetDate ? '🗓 เป้าหมาย: '+fmtDate(ms.targetDate) : ''}${overdue?' ⚠️ เลยกำหนด':''}</div>
        ${ms.description ? `<p style="font-size:11px;color:var(--text2);margin-bottom:8px;line-height:1.5">${esc(ms.description)}</p>` : ''}
        <div class="ms-progress-bar"><div class="ms-progress-fill" style="width:${msPct}%;background:${msPct===100?'var(--em)':'var(--info)'}"></div></div>
        ${msTasks.length ? `<div class="ms-tasks-preview">
          ${msTasks.slice(0,6).map(t=>`<span class="ms-task-chip ${t.lane==='done'?'done':''}" onclick="openTaskModal_edit('${t.id}')" style="cursor:pointer" title="${esc(t.title)}">${esc((t.title||'').slice(0,22))}${(t.title||'').length>22?'...':''}</span>`).join('')}
          ${msTasks.length>6?`<span class="ms-task-chip">+${msTasks.length-6} more</span>`:''}
        </div>` : `<p style="font-size:11px;color:var(--text3);margin-top:8px">ยังไม่มี Task ใน milestone นี้</p>`}
      </div>`;
    list.appendChild(row);

    // Connector line between milestones
    if (idx < milestones.length-1) {
      const conn = document.createElement('div');
      conn.style.cssText='height:12px;margin-left:18px;width:2px;background:var(--border2)';
      list.appendChild(conn);
    }
  });
}

// ── Task Kanban Board ──────────────────────────────────────────
function setTaskFilter(key, val) {
  if (S.taskFilters[key]===val) S.taskFilters[key]='';
  else S.taskFilters[key]=val;
  document.querySelectorAll('[data-tf-type]').forEach(b => b.classList.toggle('on', b.dataset.tfType===S.taskFilters.type));
  renderTaskBoard();
}

function getFilteredTasks() {
  const { type, ms, assignee, search } = S.taskFilters;
  const msSel  = $('filter-ms')?.value || '';
  const asSel  = $('filter-assignee-task')?.value || '';
  return S.tasks.filter(t => {
    if (t.projectId !== S.currentProject) return false;
    if (type && t.type !== type) return false;
    if (msSel && t.milestoneId !== msSel) return false;
    if (asSel && t.assignee !== asSel) return false;
    if (search && !(t.title||'').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
}

function renderTaskBoard() {
  const area = $('task-board-area');
  area.innerHTML='';
  const filtered = getFilteredTasks();

  LANES.forEach(lane => {
    const laneTasks = filtered.filter(t=>t.lane===lane.id)
      .sort((a,b) => {const pm={P0:0,P1:1,P2:2,P3:3};return (pm[a.priority]||2)-(pm[b.priority]||2);});

    const col = document.createElement('div');
    col.className=`lane ${lane.cls}`;
    col.dataset.lane=lane.id;

    const pts = laneTasks.reduce((a,t)=>a+(parseInt(t.points)||0),0);
    col.innerHTML=`
      <div class="lane-head">
        <div style="display:flex;align-items:center;gap:7px">
          <span style="font-size:12px">${lane.emoji}</span>
          <span style="font-size:12px;font-weight:700;color:var(--text)">${lane.label}</span>
          <span style="font-size:10px;background:var(--surface2);padding:1px 7px;border-radius:20px;color:var(--text2);font-family:'Inter',monospace">${laneTasks.length}</span>
        </div>
        <span style="font-size:10px;color:var(--text3);font-family:'Inter',monospace">${pts}pts</span>
      </div>
      <div class="lane-body" id="lb-${lane.id}"></div>
      <div class="lane-foot">
        ${canWriteTask()?`<button class="lane-add-btn" onclick="openTaskModal('${lane.id}')">+ Task</button>`:''}
      </div>`;
    area.appendChild(col);

    const body = col.querySelector('.lane-body');
    laneTasks.forEach(t => body.appendChild(buildTaskCard(t)));
    setupDropzone(body, lane.id);
  });
}

function canWriteTask() {
  return ['Admin','Manager','Member'].includes(S.user?.role);
}

function buildTaskCard(task) {
  const card = document.createElement('div');
  card.className='task-card';
  card.dataset.id=task.id;
  card.draggable=canWriteTask();

  const ms = S.milestones.find(m=>m.id===task.milestoneId);
  const member = S.members.find(m=>m.email===task.assignee);
  const memberName = member ? (member.name||member.email) : '';
  const overdue = task.dueDate && new Date(task.dueDate)<new Date() && task.lane!=='done';

  card.innerHTML=`
    <div class="tc-top">
      <span class="tc-id">${task.id}</span>
      <div style="display:flex;gap:4px">
        <span class="badge b-${task.type}">${task.type}</span>
        <span class="badge b-${task.priority||'P2'}">${task.priority||'P2'}</span>
      </div>
    </div>
    <div class="tc-title">${esc(task.title)}</div>
    <div class="tc-meta">
      ${task.points>0?`<div style="width:20px;height:20px;border-radius:50%;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:var(--text2);font-family:'Inter',monospace">${task.points}</div>`:''}
      ${memberName?`<div class="av av-sm" style="background:${avColor(memberName)};color:#080c14" title="${memberName}">${initials(memberName)}</div>`:''}
      ${ms?`<span class="tc-ms">📍 ${esc(ms.name.slice(0,18))}</span>`:''}
      ${task.dueDate?`<span style="font-size:10px;color:${overdue?'var(--danger)':'var(--text2)'};">${overdue?'⚠️ ':'' }${fmtDate(task.dueDate)}</span>`:''}
      ${task.commentCount>0?`<span style="font-size:10px;color:var(--text3);margin-left:auto">💬${task.commentCount}</span>`:''}
    </div>`;

  card.addEventListener('click',()=>openTaskModal_edit(task.id));
  if (canWriteTask()) setupDrag(card, task.id, task.lane);
  return card;
}

// ── Drag & Drop ────────────────────────────────────────────────
function setupDrag(card, taskId, lane) {
  card.addEventListener('dragstart',e=>{
    S.dragTaskId=taskId; S.dragLane=lane;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed='move';
  });
  card.addEventListener('dragend',()=>card.classList.remove('dragging'));
}

function setupDropzone(el, laneId) {
  el.addEventListener('dragover',e=>{
    e.preventDefault(); e.dataTransfer.dropEffect='move';
    el.querySelectorAll('.task-card').forEach(c=>c.classList.remove('drag-over-top'));
    const target=[...el.querySelectorAll('.task-card')].find(c=>{
      const r=c.getBoundingClientRect(); return e.clientY<r.top+r.height/2;
    });
    if(target) target.classList.add('drag-over-top');
  });
  el.addEventListener('dragleave',()=>el.querySelectorAll('.task-card').forEach(c=>c.classList.remove('drag-over-top')));
  el.addEventListener('drop',async e=>{
    e.preventDefault();
    el.querySelectorAll('.task-card').forEach(c=>c.classList.remove('drag-over-top'));
    if (!S.dragTaskId || S.dragLane===laneId) return;
    const task=S.tasks.find(t=>t.id===S.dragTaskId);
    if (!task) return;
    const prev=task.lane;
    task.lane=laneId;
    renderTaskBoard();
    updateProjectStats();
    loading(true);
    try {
      await api('updateTask',{taskId:task.id, lane:laneId});
      toast(`ย้าย → ${LANES.find(l=>l.id===laneId)?.label}`,'ok');
    } catch(e) {
      task.lane=prev; renderTaskBoard(); toast('ย้าย Task ไม่สำเร็จ','err');
    } finally { loading(false); }
  });
}

function updateProjectStats() {
  if (!S.currentProject) return;
  const tasks = S.tasks.filter(t=>t.projectId===S.currentProject);
  const done  = tasks.filter(t=>t.lane==='done').length;
  const pct   = tasks.length ? Math.round(done/tasks.length*100) : 0;
  $('det-pct').textContent=$('det-pct-label').textContent=pct+'%';
  $('det-total-tasks').textContent=tasks.length;
  $('det-done-tasks').textContent=done;
  $('det-progress-fill').style.width=pct+'%';
}

// ── My Tasks View ──────────────────────────────────────────────
function renderMyTasks() {
  const list = $('mytasks-list');
  list.innerHTML='';
  const myTasks = S.tasks.filter(t=>t.assignee===S.user?.email)
    .sort((a,b)=>{const pm={P0:0,P1:1,P2:2,P3:3};return (pm[a.priority]||2)-(pm[b.priority]||2);});

  if (!myTasks.length) {
    list.innerHTML=`<div style="color:var(--text2);font-size:13px;padding:20px 0">ยังไม่มีงานที่ assign ให้คุณ 🎉</div>`;
    return;
  }

  // Group by project
  const grouped = {};
  myTasks.forEach(t => {
    if (!grouped[t.projectId]) grouped[t.projectId]=[];
    grouped[t.projectId].push(t);
  });

  Object.entries(grouped).forEach(([projId, tasks]) => {
    const proj = S.projects.find(p=>p.id===projId);
    const sec  = document.createElement('div');
    sec.style.marginBottom='20px';
    sec.innerHTML=`
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <div style="width:10px;height:10px;border-radius:50%;background:${proj?.color||'var(--text3)'}"></div>
        <span style="font-size:12px;font-weight:700;color:var(--text2);cursor:pointer;text-decoration:underline" onclick="goProjectDetail('${projId}')">${esc(proj?.name||projId)}</span>
        <span style="font-size:11px;color:var(--text3)">${tasks.length} tasks</span>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden">
        ${tasks.map(t=>{
          const laneInfo=LANES.find(l=>l.id===t.lane)||LANES[0];
          const overdue=t.dueDate&&new Date(t.dueDate)<new Date()&&t.lane!=='done';
          return `<div onclick="goProjectDetail('${projId}')" style="display:grid;grid-template-columns:auto 1fr auto auto auto;gap:10px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .15s" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background='transparent'">
            <span class="badge b-${t.type}" style="font-size:9px">${t.type}</span>
            <span style="font-size:13px;font-weight:500;color:var(--text)">${esc(t.title)}</span>
            <span class="badge b-${t.priority||'P2'}" style="font-size:9px">${t.priority||'P2'}</span>
            <span style="font-size:10px;padding:2px 8px;border-radius:20px;background:var(--surface2);color:var(--text2)">${laneInfo.emoji} ${laneInfo.label}</span>
            <span style="font-size:10px;color:${overdue?'var(--danger)':'var(--text2)'}">${t.dueDate?fmtDate(t.dueDate):''}</span>
          </div>`;
        }).join('')}
      </div>`;
    list.appendChild(sec);
  });
}

// ── Members View ───────────────────────────────────────────────
function renderMembersView() {
  const tbl=$('members-table');
  if (!tbl) return;
  const roleColors={Admin:'var(--em)',Manager:'var(--violet)',Member:'var(--info)',Viewer:'var(--text2)'};
  tbl.innerHTML=`
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden">
      <div style="display:grid;grid-template-columns:1fr 200px 100px;gap:0;padding:10px 18px;background:var(--surface2);border-bottom:1px solid var(--border)">
        <span style="font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.07em">ชื่อ / อีเมล</span>
        <span style="font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.07em">อีเมล</span>
        <span style="font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.07em">Role</span>
      </div>
      ${S.members.map(m=>`
        <div style="display:grid;grid-template-columns:1fr 200px 100px;gap:0;padding:12px 18px;border-bottom:1px solid var(--border);align-items:center">
          <div style="display:flex;align-items:center;gap:9px">
            <div class="av av-sm" style="background:${avColor(m.name||m.email)};color:#080c14">${initials(m.name||m.email)}</div>
            <span style="font-size:13px;font-weight:500;color:var(--text)">${esc(m.name||m.email)}</span>
          </div>
          <span style="font-size:11px;color:var(--text2)">${esc(m.email)}</span>
          <span class="badge" style="background:${roleColors[m.role]||'var(--text2)'}20;color:${roleColors[m.role]||'var(--text2)'}">${m.role}</span>
        </div>`).join('')}
    </div>
    <p style="font-size:11px;color:var(--text3);margin-top:12px">💡 จัดการใน Google Sheets → แผ่น "Users"</p>`;
}

// ── Project Modal ──────────────────────────────────────────────
function openProjectModal(id=null) {
  S.editingProjectId=id;
  $('m-proj-title').textContent = id ? 'แก้ไข Project' : 'สร้าง Project ใหม่';
  $('m-proj-del').style.display = id&&['Admin'].includes(S.user?.role) ? 'block' : 'none';

  if (id) {
    const p=S.projects.find(x=>x.id===id)||{};
    $('pf-name').value=p.name||''; $('pf-desc').value=p.description||'';
    $('pf-status').value=p.status||'planning';
    $('pf-start').value=p.startDate||''; $('pf-end').value=p.endDate||'';
    S.projColor=p.color||'#00d4a0';
    $('proj-swatches').querySelectorAll('.swatch').forEach(s=>s.classList.toggle('on',s.dataset.color===S.projColor));
  } else {
    ['pf-name','pf-desc','pf-start','pf-end'].forEach(id=>$(id).value='');
    $('pf-status').value='planning';
    S.projColor='#00d4a0';
    $('proj-swatches').querySelectorAll('.swatch').forEach((s,i)=>s.classList.toggle('on',i===0));
  }
  $('m-project').style.display='flex';
}

async function saveProject() {
  const name=$('pf-name').value.trim();
  if (!name) { toast('กรุณาใส่ชื่อ Project','err'); return; }
  loading(true);
  const payload={
    name, description:$('pf-desc').value.trim(),
    status:$('pf-status').value, color:S.projColor,
    startDate:$('pf-start').value, endDate:$('pf-end').value,
  };
  try {
    if (S.editingProjectId) {
      await api('updateProject',{projectId:S.editingProjectId,...payload});
      const idx=S.projects.findIndex(p=>p.id===S.editingProjectId);
      if(idx!==-1) S.projects[idx]={...S.projects[idx],...payload};
      toast('บันทึกสำเร็จ','ok');
    } else {
      const data=await api('createProject',payload);
      S.projects.push(data.project);
    }
    updateSidebar();
    renderProjectsGrid();
    closeModal('m-project');
  } catch(e) { toast(e.message,'err'); }
  finally { loading(false); }
}

async function deleteProject() {
  if (!S.editingProjectId) return;
  if (!confirm('ลบ Project นี้? Tasks และ Milestones ทั้งหมดจะถูกลบด้วย')) return;
  loading(true);
  try {
    await api('deleteProject',{projectId:S.editingProjectId});
    S.projects=S.projects.filter(p=>p.id!==S.editingProjectId);
    S.tasks=S.tasks.filter(t=>t.projectId!==S.editingProjectId);
    S.milestones=S.milestones.filter(m=>m.projectId!==S.editingProjectId);
    closeModal('m-project'); updateSidebar(); renderProjectsGrid();
    toast('ลบ Project สำเร็จ','ok');
  } catch(e) { toast(e.message,'err'); }
  finally { loading(false); }
}

// ── Milestone Modal ────────────────────────────────────────────
function openMilestoneModal(id=null) {
  S.editingMsId=id;
  $('m-ms-title').textContent = id ? 'แก้ไข Milestone' : 'สร้าง Milestone ใหม่';
  $('m-ms-del').style.display = id ? 'block' : 'none';
  if (id) {
    const ms=S.milestones.find(m=>m.id===id)||{};
    $('msf-name').value=ms.name||''; $('msf-desc').value=ms.description||'';
    $('msf-date').value=ms.targetDate||''; $('msf-status').value=ms.status||'pending';
  } else {
    $('msf-name').value=''; $('msf-desc').value='';
    $('msf-date').value=''; $('msf-status').value='pending';
  }
  $('m-milestone').style.display='flex';
}

async function saveMilestone() {
  const name=$('msf-name').value.trim();
  if (!name) { toast('กรุณาใส่ชื่อ Milestone','err'); return; }
  loading(true);
  const payload={
    name, description:$('msf-desc').value.trim(),
    targetDate:$('msf-date').value, status:$('msf-status').value,
    projectId:S.currentProject,
  };
  try {
    if (S.editingMsId) {
      await api('updateMilestone',{milestoneId:S.editingMsId,...payload});
      const idx=S.milestones.findIndex(m=>m.id===S.editingMsId);
      if(idx!==-1) S.milestones[idx]={...S.milestones[idx],...payload};
      toast('บันทึกสำเร็จ','ok');
    } else {
      const data=await api('createMilestone',payload);
      S.milestones.push(data.milestone);
      toast('สร้าง Milestone สำเร็จ','ok');
    }
    renderProjectDetail(S.currentProject);
    closeModal('m-milestone');
  } catch(e) { toast(e.message,'err'); }
  finally { loading(false); }
}

async function deleteMilestone() {
  if (!S.editingMsId) return;
  if (!confirm('ลบ Milestone นี้? Tasks ที่เชื่อมอยู่จะยังคงอยู่')) return;
  loading(true);
  try {
    await api('deleteMilestone',{milestoneId:S.editingMsId});
    S.milestones=S.milestones.filter(m=>m.id!==S.editingMsId);
    S.tasks.forEach(t=>{ if(t.milestoneId===S.editingMsId) t.milestoneId=''; });
    renderProjectDetail(S.currentProject);
    closeModal('m-milestone');
    toast('ลบ Milestone สำเร็จ','ok');
  } catch(e) { toast(e.message,'err'); }
  finally { loading(false); }
}

// ── Task Modal ─────────────────────────────────────────────────
function openTaskModal(defaultLane='current') {
  S.editingTaskId=null;
  $('m-task-title').textContent='สร้าง Task ใหม่'; $('m-task-id').textContent='';
  $('tf-name').value=''; $('tf-desc').value='';
  $('tf-type').value='feature'; $('tf-prio').value='P2';
  $('tf-lane').value=defaultLane; $('tf-pts').value='0';
  $('tf-assignee').value=''; $('tf-ms').value=''; $('tf-due').value='';
  $('m-task-del').style.display='none';
  $('task-comments-section').style.display='none';
  $('m-task').style.display='flex';
}

function openTaskModal_edit(taskId) {
  const t=S.tasks.find(x=>x.id===taskId); if(!t) return;
  S.editingTaskId=taskId;
  $('m-task-title').textContent='แก้ไข Task'; $('m-task-id').textContent=t.id;
  $('tf-name').value=t.title||''; $('tf-desc').value=t.description||'';
  $('tf-type').value=t.type||'feature'; $('tf-prio').value=t.priority||'P2';
  $('tf-lane').value=t.lane||'current'; $('tf-pts').value=t.points||'0';
  $('tf-assignee').value=t.assignee||''; $('tf-ms').value=t.milestoneId||'';
  $('tf-due').value=t.dueDate||'';
  const canDel=['Admin','Manager'].includes(S.user?.role);
  $('m-task-del').style.display=canDel?'block':'none';
  $('task-comments-section').style.display='block';
  renderTaskComments(t.comments||[]);
  $('m-task').style.display='flex';
}

function renderTaskComments(comments) {
  const list=$('task-comments-list'); list.innerHTML='';
  (comments||[]).forEach(c=>{
    const d=document.createElement('div');
    d.style.cssText='background:var(--bg);border-radius:7px;padding:7px 10px';
    d.innerHTML=`<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
      <div class="av av-sm" style="background:${avColor(c.author)};color:#080c14">${initials(c.author)}</div>
      <span style="font-size:10px;font-weight:600;color:var(--text2)">${esc(c.author)}</span>
      <span style="font-size:9px;color:var(--text3)">${fmtDate(c.ts)}</span>
    </div>
    <p style="font-size:11px;color:var(--text);line-height:1.5">${esc(c.text)}</p>`;
    list.appendChild(d);
  });
}

async function addTaskComment() {
  const inp=$('task-comment-inp');
  const text=inp.value.trim();
  if(!text||!S.editingTaskId) return;
  inp.value='';
  const c={author:S.user.name||S.user.email, text, ts:new Date().toISOString()};
  try {
    await api('addTaskComment',{taskId:S.editingTaskId, comment:c});
    const task=S.tasks.find(t=>t.id===S.editingTaskId);
    if(task){ task.comments=[...(task.comments||[]),c]; task.commentCount=(task.commentCount||0)+1; }
    renderTaskComments(task?.comments||[]);
    toast('เพิ่ม Comment สำเร็จ','ok');
  } catch(e){ toast('เกิดข้อผิดพลาด','err'); }
}

async function saveTask() {
  const title=$('tf-name').value.trim();
  if(!title){ toast('กรุณาใส่ชื่อ Task','err'); return; }
  loading(true);
  const payload={
    projectId:S.currentProject, title,
    description:$('tf-desc').value.trim(),
    type:$('tf-type').value, priority:$('tf-prio').value,
    lane:$('tf-lane').value, points:parseInt($('tf-pts').value)||0,
    assignee:$('tf-assignee').value, milestoneId:$('tf-ms').value,
    dueDate:$('tf-due').value,
  };
  try {
    if(S.editingTaskId){
      payload.taskId=S.editingTaskId;
      await api('updateTask',payload);
      const idx=S.tasks.findIndex(t=>t.id===S.editingTaskId);
      if(idx!==-1) S.tasks[idx]={...S.tasks[idx],...payload};
      toast('บันทึกสำเร็จ','ok');
    } else {
      const data=await api('createTask',payload);
      S.tasks.push(data.task);
      toast('สร้าง Task สำเร็จ','ok');
    }
    closeModal('m-task');
    renderProjectDetail(S.currentProject);
    updateProjectStats();
  } catch(e){ toast(e.message,'err'); }
  finally { loading(false); }
}

async function deleteTask() {
  if(!S.editingTaskId||!confirm('ลบ Task นี้?')) return;
  loading(true);
  try {
    await api('deleteTask',{taskId:S.editingTaskId});
    S.tasks=S.tasks.filter(t=>t.id!==S.editingTaskId);
    closeModal('m-task');
    renderProjectDetail(S.currentProject);
    updateProjectStats();
    toast('ลบ Task สำเร็จ','ok');
  } catch(e){ toast(e.message,'err'); }
  finally { loading(false); }
}

// ── Search ─────────────────────────────────────────────────────
function onSearch() {
  S.taskFilters.search=$('search-inp').value;
  if ($('view-projects').classList.contains('on')) renderProjectsGrid();
  else if ($('view-project-detail').classList.contains('on') && S.detailTab==='board') renderTaskBoard();
}

// ── Profile ────────────────────────────────────────────────────
function openProfileModal() {
  const u=S.user;
  const roleColors={Admin:'var(--em)',Manager:'var(--violet)',Member:'var(--info)',Viewer:'var(--text2)'};
  $('prof-av').textContent=initials(u.name||u.email);
  $('prof-av').style.background=avColor(u.name||u.email);
  $('prof-av').style.color='#080c14';
  $('prof-name').textContent=u.name||u.email;
  $('prof-email').textContent=u.email;
  const rEl=$('prof-role');
  rEl.textContent=u.role; rEl.style.background=`${roleColors[u.role]||'var(--text2)'}20`; rEl.style.color=roleColors[u.role]||'var(--text2)';
  $('pp-old').value=''; $('pp-new').value='';
  $('m-profile').style.display='flex';
}

// ── Helpers ────────────────────────────────────────────────────
function closeModal(id) { $(id).style.display='none'; }

// ── Init ───────────────────────────────────────────────────────
(function init(){
  const raw=sessionStorage.getItem('sess');
  if(raw){ try{ const d=JSON.parse(raw); S.user=d.user; S.token=d.token; bootApp(); }catch{} }
  else { $('auth').style.display='flex'; }

  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      ['m-project','m-milestone','m-task','m-profile'].forEach(id=>$(id).style.display='none');
    }
    if((e.ctrlKey||e.metaKey)&&e.key==='k'){ e.preventDefault(); $('search-inp').focus(); }
  });
})();
