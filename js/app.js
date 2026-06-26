// ═══════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════
const GAS_URL = 'https://script.google.com/macros/s/AKfycbylDsJTZiYBIswuqbhiBZpF4J1-KDnSY7LL7_vv9NqJW7JkXzvoBuOv20_VTnuldd7k/exec';

/* ═══════════════════════════════════════════════════════════════
   THE CODE · Projects — app.js  v3
   Features: Users CRUD, Dynamic Settings, Calendar, Comments+Reply,
             Sidebar collapse, Mobile, Soft-delete, Lane Hints
═══════════════════════════════════════════════════════════════ */

// ── State ────────────────────────────────────────────────────
const S = {
  user: null, token: null,
  projects: [], tasks: [], milestones: [], members: [], settings: {},
  currentProject: null,
  editingProjectId: null, editingMsId: null, editingTaskId: null, editingUserId: null,
  taskFilters: { type: '', ms: '', assignee: '' },
  projFilter: '',
  projColor: '#00a87a',
  detailTab: 'timeline',
  dragTaskId: null, dragLane: null,
  calFilter: 'all',
  calDate: new Date(),
  sidebarCollapsed: false,
  replyingTo: null,
};

const DEFAULT_LANES     = [{id:'icebox',label:'Icebox',emoji:'❄️'},{id:'backlog',label:'Backlog',emoji:'📋'},{id:'current',label:'Current',emoji:'🔵'},{id:'review',label:'Review',emoji:'🔍'},{id:'done',label:'Done',emoji:'✅'}];
const DEFAULT_TYPES     = [{id:'feature',label:'Feature',emoji:'🟢'},{id:'bug',label:'Bug',emoji:'🔴'},{id:'chore',label:'Chore',emoji:'⚙️'},{id:'release',label:'Release',emoji:'🚀'}];
const DEFAULT_PRIORITIES= [{id:'P0',label:'P0 Critical'},{id:'P1',label:'P1 High'},{id:'P2',label:'P2 Medium'},{id:'P3',label:'P3 Low'}];
const PROJ_COLORS = ['#00a87a','#3b9eff','#6d48e5','#d97706','#dc2626','#06b6d4','#10b981','#ec4899'];
const AV_COLORS   = ['#00a87a','#6d48e5','#3b9eff','#d97706','#dc2626','#06b6d4'];
const ROLE_COLORS = {Admin:'#00a87a',Manager:'#6d48e5',Member:'#2563eb',Viewer:'#9aaabe'};
const LANE_HINTS  = {
  icebox:'ไอเดียที่ยังไม่พร้อม — เก็บไว้ก่อน',
  backlog:'รอ Prioritize — ยังไม่ได้รับมอบหมาย',
  current:'กำลังดำเนินการใน Sprint นี้',
  review:'งานเสร็จแล้ว รอ Review / QA',
  done:'ปิดงานแล้ว ✓'
};

// ── Getters from settings ────────────────────────────────────
function getLanes()      { return S.settings.lanes      || DEFAULT_LANES; }
function getTypes()      { return S.settings.types      || DEFAULT_TYPES; }
function getPriorities() { return S.settings.priorities || DEFAULT_PRIORITIES; }

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
function fmtDateTime(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleString('th-TH',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}); } catch { return d; }
}
function simpleHash(s) {
  var h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ── Button Lock ───────────────────────────────────────────────
const _btnOrig = new WeakMap();
function lockModal(id) {
  document.querySelectorAll(`#${id} button`).forEach(btn => {
    if (!btn.disabled) { _btnOrig.set(btn,{t:btn.textContent,d:false}); btn.disabled=true; btn.style.opacity='.5'; btn.style.cursor='not-allowed'; }
  });
}
function unlockModal(id) {
  document.querySelectorAll(`#${id} button`).forEach(btn => {
    const o=_btnOrig.get(btn); if(o){ btn.disabled=o.d; btn.textContent=o.t; btn.style.opacity=''; btn.style.cursor=''; }
  });
}
function btnLoading(btn, txt='กำลังส่ง...') {
  if(!btn) return; _btnOrig.set(btn,{t:btn.textContent,d:btn.disabled});
  btn.disabled=true; btn.textContent=txt; btn.style.opacity='.6'; btn.style.cursor='not-allowed';
}
function btnReset(btn) {
  if(!btn) return; const o=_btnOrig.get(btn);
  if(o){ btn.disabled=o.d; btn.textContent=o.t; } btn.style.opacity=''; btn.style.cursor='';
}

// ── JSONP API ─────────────────────────────────────────────────
function api(action, payload={}) {
  return new Promise((resolve, reject) => {
    if (!GAS_URL || GAS_URL.includes('YOUR_GOOGLE')) return reject(new Error('ยังไม่ได้ตั้งค่า GAS_URL'));
    const cbName = 'cb_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    const timer = setTimeout(() => { cleanup(); reject(new Error('Timeout 15s')); }, 15000);
    function cleanup() { clearTimeout(timer); delete window[cbName]; const el=$( cbName); if(el) el.remove(); }
    window[cbName] = data => { cleanup(); if(!data.ok) return reject(new Error(data.error||'API Error')); resolve(data); };
    const body = { action, token: S.token, callback: cbName, ...payload };
    const url = GAS_URL + '?data=' + encodeURIComponent(JSON.stringify(body));
    const sc = document.createElement('script');
    sc.id = cbName; sc.src = url;
    sc.onerror = () => { cleanup(); reject(new Error('Script load error')); };
    document.head.appendChild(sc);
  });
}

// ── Auth ──────────────────────────────────────────────────────
function authTab(t) {
  $('t-login').style.display = t==='login' ? 'block' : 'none';
  $('t-chpw').style.display  = t==='chpw'  ? 'block' : 'none';
  document.querySelectorAll('.auth-tab').forEach((b,i) => b.classList.toggle('on',(i===0&&t==='login')||(i===1&&t==='chpw')));
}

async function doLogin() {
  const email=$('l-email').value.trim(), pw=$('l-pw').value;
  const errEl=$('l-err'), btn=$('l-btn');
  errEl.style.display='none';
  if(!email||!pw){ errEl.textContent='กรุณากรอกข้อมูล'; errEl.style.display='block'; return; }
  btn.disabled=true; btn.textContent='กำลังตรวจสอบ...';
  try {
    const data = await api('login',{email, password:pw});
    S.user=data.user; S.token=data.token;
    sessionStorage.setItem('sess',JSON.stringify({user:data.user,token:data.token}));
    bootApp();
  } catch(e) { errEl.textContent=e.message||'เข้าสู่ระบบไม่สำเร็จ'; errEl.style.display='block'; }
  finally { btn.disabled=false; btn.textContent='เข้าสู่ระบบ'; }
}

async function doChangePassword() {
  const email=$('cp-email').value.trim(), old=$('cp-old').value, nw=$('cp-new').value;
  const errEl=$('cp-err'), btn=$('cp-btn');
  errEl.style.display='none';
  if(!email||!old||!nw){ errEl.textContent='กรุณากรอกข้อมูล'; errEl.style.display='block'; return; }
  if(nw.length<6){ errEl.textContent='รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัว'; errEl.style.display='block'; return; }
  btn.disabled=true; btn.textContent='กำลังเปลี่ยน...';
  try { await api('changePassword',{email, oldPassword:old, newPassword:nw}); toast('เปลี่ยนรหัสผ่านสำเร็จ','ok'); authTab('login'); }
  catch(e){ errEl.textContent=e.message; errEl.style.display='block'; }
  finally { btn.disabled=false; btn.textContent='เปลี่ยนรหัสผ่าน'; }
}

async function doChangePwProfile() {
  const old=$('pp-old').value, nw=$('pp-new').value;
  if(!old||!nw){ toast('กรุณากรอกรหัสผ่าน','err'); return; }
  if(nw.length<6){ toast('รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัว','err'); return; }
  lockModal('m-profile');
  try { await api('changePassword',{email:S.user.email, oldPassword:old, newPassword:nw}); toast('เปลี่ยนรหัสผ่านสำเร็จ','ok'); closeModal('m-profile'); }
  catch(e){ toast(e.message,'err'); unlockModal('m-profile'); }
}

function doLogout() {
  sessionStorage.removeItem('sess'); S.user=null; S.token=null;
  $('auth').style.display='flex'; $('app').style.display='none';
}

// ── Boot ──────────────────────────────────────────────────────
async function bootApp() {
  $('auth').style.display='none'; $('app').style.display='flex';
  const u=S.user;
  $('top-name').textContent=u.name||u.email;
  const av=$('top-av'); av.textContent=initials(u.name||u.email);
  av.style.background=avColor(u.name||u.email); av.style.color='#fff';
  if(['Admin','Manager'].includes(u.role)) $('btn-new-proj').style.display='block';
  if(u.role==='Admin') { $('sb-users').style.display='flex'; }

  // Swatches
  const sw=$('proj-swatches'); sw.innerHTML='';
  PROJ_COLORS.forEach((c,i) => {
    const d=document.createElement('div'); d.className='swatch'+(i===0?' on':'');
    d.style.background=c; d.dataset.color=c;
    d.onclick=()=>{ S.projColor=c; sw.querySelectorAll('.swatch').forEach(s=>s.classList.toggle('on',s===d)); };
    sw.appendChild(d);
  });

  loading(true);
  try { await loadAll(); }
  catch(e){ toast('โหลดข้อมูลไม่สำเร็จ: '+e.message,'err'); }
  finally { loading(false); }
}

async function loadAll() {
  const data = await api('getAllData');
  S.projects   = data.projects   || [];
  S.tasks      = data.tasks      || [];
  S.milestones = data.milestones || [];
  S.members    = data.members    || [];
  S.settings   = data.settings   || {};
  populateDynamicSelects();
  updateSidebar();
  if(S.currentProject && S.projects.find(p=>p.id===S.currentProject)) renderProjectDetail(S.currentProject);
  else goProjects();
  renderMyTasks();
  const myT=S.tasks.filter(t=>t.assignee===S.user?.email&&t.lane!=='done').length;
  $('sb-mytasks-count').textContent=myT||'';
  $('sb-proj-count').textContent=S.projects.length;
}

async function syncAll() {
  toast('กำลัง Sync...','inf'); loading(true);
  try { await loadAll(); toast('Sync สำเร็จ','ok'); }
  catch(e){ toast('Sync ไม่สำเร็จ','err'); }
  finally { loading(false); }
}

// ── Dynamic Selects from Settings ────────────────────────────
function populateDynamicSelects() {
  // Type filter buttons
  const tfBtns=$('type-filter-btns'); if(tfBtns){ tfBtns.innerHTML='';
    getTypes().forEach(t=>{ const b=document.createElement('button'); b.className='fb-btn'; b.dataset.tfType=t.id;
      b.textContent=t.emoji+' '+t.label; b.onclick=()=>setTaskFilter('type',t.id); tfBtns.appendChild(b); }); }
  // Task modal type
  const tfType=$('tf-type'); if(tfType){ tfType.innerHTML='';
    getTypes().forEach(t=>{ const o=document.createElement('option'); o.value=t.id; o.textContent=t.emoji+' '+t.label; tfType.appendChild(o); }); }
  // Task modal priority
  const tfPrio=$('tf-prio'); if(tfPrio){ tfPrio.innerHTML='';
    getPriorities().forEach((p,i)=>{ const o=document.createElement('option'); o.value=p.id; o.textContent=p.label; if(i===2)o.selected=true; tfPrio.appendChild(o); }); }
  // Task modal lane
  const tfLane=$('tf-lane'); if(tfLane){ tfLane.innerHTML='';
    getLanes().forEach((l,i)=>{ const o=document.createElement('option'); o.value=l.id; o.textContent=l.emoji+' '+l.label; if(i===2)o.selected=true; tfLane.appendChild(o); }); }
}

// ── Sidebar ───────────────────────────────────────────────────
function toggleSidebar() {
  S.sidebarCollapsed=!S.sidebarCollapsed;
  const sb=$('sidebar'); sb.classList.toggle('collapsed',S.sidebarCollapsed);
  const btn=$('sb-toggle-btn');
  btn.innerHTML=S.sidebarCollapsed
    ? '<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="var(--text2)" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>'
    : '<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="var(--text2)" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>';
}
function toggleMobSidebar() {
  const sb=$('sidebar'), ov=$('mob-overlay');
  const open=sb.classList.toggle('mob-open'); ov.classList.toggle('on',open);
}

function updateSidebar() {
  const list=$('sb-proj-list'); list.innerHTML='';
  S.projects.slice(0,15).forEach(p => {
    const d=document.createElement('div'); d.className='sb-item'+(S.currentProject===p.id?' on':'');
    d.innerHTML=`<span style="width:8px;height:8px;border-radius:50%;background:${p.color||'var(--text3)'};flex-shrink:0"></span><span class="sb-label" style="overflow:hidden;text-overflow:ellipsis">${esc(p.name.slice(0,20))}</span>`;
    d.onclick=()=>goProjectDetail(p.id); list.appendChild(d);
  });
}
function setSbActive(id) {
  ['sb-projects','sb-mytasks','sb-calendar','sb-users'].forEach(k=>{ const e=$(k); if(e) e.classList.remove('on'); });
  if(id) { const e=$(id); if(e) e.classList.add('on'); }
}

// ── Views ─────────────────────────────────────────────────────
function showView(v) {
  ['view-projects','view-project-detail','view-mytasks','view-calendar','view-users'].forEach(id=>{
    const el=$(id); if(el) el.classList.toggle('on',el.id===v);
  });
}
function setBreadcrumb(crumbs) {
  const bar=$('breadcrumb-bar'); bar.innerHTML='';
  crumbs.forEach((c,i) => {
    if(i>0){ const sep=document.createElement('span'); sep.className='bc-sep'; sep.textContent='/'; bar.appendChild(sep); }
    const s=document.createElement('span');
    if(i<crumbs.length-1){ s.className='bc-link'; s.textContent=c.label; s.onclick=new Function(c.action); }
    else { s.className='bc-current'; s.textContent=c.label; }
    bar.appendChild(s);
  });
}

function goProjects() {
  S.currentProject=null; setSbActive('sb-projects'); updateSidebar();
  setBreadcrumb([]); renderProjectsGrid(); showView('view-projects');
}
function goMyTasks()  { setSbActive('sb-mytasks'); setBreadcrumb([]); renderMyTasks();  showView('view-mytasks'); }
function goCalendar() { setSbActive('sb-calendar'); setBreadcrumb([]); renderMainCalendar(); showView('view-calendar'); }
function goUsers()    { if(S.user?.role!=='Admin') return; setSbActive('sb-users'); setBreadcrumb([]); renderUsersTable(); showView('view-users'); }
function goProjectDetail(id) {
  S.currentProject=id; S.detailTab='timeline'; setSbActive(null); updateSidebar();
  showView('view-project-detail'); renderProjectDetail(id);
}

// ── Modal ─────────────────────────────────────────────────────
function closeModal(id) { $(id).style.display='none'; }

// ── Projects Grid ─────────────────────────────────────────────
function setProjFilter(f) {
  S.projFilter=f; document.querySelectorAll('[data-pf]').forEach(b=>b.classList.toggle('on',b.dataset.pf===f));
  renderProjectsGrid();
}
function renderProjectsGrid() {
  const grid=$('proj-grid'), empty=$('proj-empty');
  const search=($('search-inp')?.value||'').toLowerCase();
  let projs=S.projects;
  if(S.projFilter) projs=projs.filter(p=>p.status===S.projFilter);
  if(search) projs=projs.filter(p=>(p.name||'').toLowerCase().includes(search));
  grid.innerHTML='';
  if(!projs.length){ empty.style.display='flex'; return; }
  empty.style.display='none';
  projs.forEach(p=>{
    const tasks=S.tasks.filter(t=>t.projectId===p.id);
    const done=tasks.filter(t=>t.lane==='done').length;
    const pct=tasks.length?Math.round(done/tasks.length*100):0;
    const milestones=S.milestones.filter(m=>m.projectId===p.id);
    const color=p.color||'#00a87a';
    const statusCls={planning:'b-status-planning',active:'b-status-active',done:'b-status-done',paused:'b-status-paused'};
    const card=document.createElement('div'); card.className='project-card';
    card.innerHTML=`
      <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${color};border-radius:14px 14px 0 0"></div>
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px;padding-top:4px">
        <div style="font-size:15px;font-weight:700">${esc(p.name)}</div>
        <span class="badge ${statusCls[p.status]||''}" style="flex-shrink:0;margin-left:8px">${p.status||'planning'}</span>
      </div>
      <p style="font-size:12px;color:var(--text2);margin-bottom:12px;line-height:1.5">${esc((p.description||'').slice(0,80))}${(p.description||'').length>80?'...':''}</p>
      <div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text2);margin-bottom:3px"><span>${done}/${tasks.length} tasks</span><span style="font-weight:700;color:${pct===100?'var(--em)':'var(--text2)'}">${pct}%</span></div>
        <div class="proj-progress-bar"><div class="proj-progress-fill" style="width:${pct}%;background:${color}"></div></div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:11px;color:var(--text2)">
        <span>📍 ${milestones.length} milestones</span>
        ${p.endDate?`<span>🗓 ${fmtDate(p.endDate)}</span>`:''}
      </div>
      <div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap">
        ${milestones.slice(0,8).map(m=>`<div style="width:8px;height:8px;border-radius:50%;background:${m.status==='done'?color:m.status==='inprogress'?'var(--info)':m.status==='overdue'?'var(--danger)':'var(--border2)'}" title="${esc(m.name)}"></div>`).join('')}
      </div>`;
    card.addEventListener('click',()=>goProjectDetail(p.id));
    if(['Admin','Manager'].includes(S.user?.role)){
      const eb=document.createElement('button');
      eb.style.cssText='position:absolute;top:12px;right:12px;background:var(--surface2);border:1px solid var(--border);cursor:pointer;color:var(--text2);opacity:0;transition:opacity .15s;font-size:11px;padding:3px 8px;border-radius:6px';
      eb.textContent='✏️ แก้ไข'; eb.onclick=e=>{ e.stopPropagation(); openProjectModal(p.id); };
      card.style.position='relative'; card.appendChild(eb);
      card.addEventListener('mouseenter',()=>eb.style.opacity='1');
      card.addEventListener('mouseleave',()=>eb.style.opacity='0');
    }
    grid.appendChild(card);
  });
}

// ── Project Detail ────────────────────────────────────────────
function renderProjectDetail(projectId) {
  const p=S.projects.find(x=>x.id===projectId); if(!p){ goProjects(); return; }
  setBreadcrumb([{label:'All Projects',action:'goProjects()'},{label:p.name}]);
  const tasks=S.tasks.filter(t=>t.projectId===projectId);
  const done=tasks.filter(t=>t.lane==='done').length;
  const pct=tasks.length?Math.round(done/tasks.length*100):0;
  const milestones=S.milestones.filter(m=>m.projectId===projectId);
  const statusCls={planning:'b-status-planning',active:'b-status-active',done:'b-status-done',paused:'b-status-paused'};
  $('det-proj-name').textContent=p.name;
  const se=$('det-proj-status'); se.className='badge '+(statusCls[p.status]||''); se.textContent=p.status||'planning';
  $('det-proj-desc').textContent=p.description||'';
  $('det-pct').textContent=$('det-pct-label').textContent=pct+'%';
  $('det-total-tasks').textContent=tasks.length; $('det-done-tasks').textContent=done; $('det-ms-count').textContent=milestones.length;
  $('det-progress-fill').style.width=pct+'%';
  const canEdit=['Admin','Manager','Member'].includes(S.user?.role);
  $('btn-add-ms').style.display=canEdit?'block':'none';
  $('btn-add-task').style.display=canEdit?'block':'none';

  // Populate selects
  const msSel=$('filter-ms'); msSel.innerHTML='<option value="">Milestone: ทั้งหมด</option>';
  const tfMs=$('tf-ms'); tfMs.innerHTML='<option value="">— ไม่มี Milestone —</option>';
  milestones.forEach(m=>{ [msSel,tfMs].forEach(s=>{ const o=document.createElement('option'); o.value=m.id; o.textContent=m.name; s.appendChild(o); }); });
  const asSel=$('filter-assignee-task'); const tfAs=$('tf-assignee');
  asSel.innerHTML='<option value="">Assignee: ทั้งหมด</option>'; tfAs.innerHTML='<option value="">— ไม่ระบุ —</option>';
  S.members.forEach(m=>{ [asSel,tfAs].forEach(s=>{ const o=document.createElement('option'); o.value=m.email; o.textContent=m.name||m.email; s.appendChild(o); }); });

  switchDetailTab(S.detailTab);
}

function switchDetailTab(tab) {
  S.detailTab=tab;
  $('tab-timeline').classList.toggle('on',tab==='timeline');
  $('tab-board').classList.toggle('on',tab==='board');
  $('detail-timeline').style.display=tab==='timeline'?'block':'none';
  $('detail-board').style.display=tab==='board'?'block':'none';
  if(tab==='timeline') renderTimeline();
  if(tab==='board') renderTaskBoard();
}

// ── Milestone Timeline ────────────────────────────────────────
function renderTimeline() {
  const list=$('timeline-list'), empty=$('timeline-empty');
  list.innerHTML='';
  const p=S.projects.find(x=>x.id===S.currentProject);
  const color=p?.color||'#00a87a';
  const milestones=S.milestones.filter(m=>m.projectId===S.currentProject)
    .sort((a,b)=>(a.targetDate||'').localeCompare(b.targetDate||''));
  if(!milestones.length){ empty.style.display='flex'; return; }
  empty.style.display='none';
  const canEdit=['Admin','Manager','Member'].includes(S.user?.role);
  milestones.forEach((ms,idx)=>{
    const msTasks=S.tasks.filter(t=>t.milestoneId===ms.id);
    const msDone=msTasks.filter(t=>t.lane==='done').length;
    const msPct=msTasks.length?Math.round(msDone/msTasks.length*100):(ms.status==='done'?100:0);
    const overdue=ms.status!=='done'&&ms.targetDate&&new Date(ms.targetDate)<new Date();
    const effStatus=overdue?'overdue':ms.status;
    const icons={done:'✅',inprogress:'🔵',overdue:'🔴',pending:'⏳'};
    const row=document.createElement('div'); row.className='milestone-row';
    row.innerHTML=`
      <div class="ms-icon ${effStatus}">${icons[effStatus]||'⏳'}</div>
      <div class="ms-body" style="${effStatus==='done'?'border-color:rgba(0,168,122,.25)':effStatus==='overdue'?'border-color:rgba(220,38,38,.2)':effStatus==='inprogress'?'border-color:rgba(37,99,235,.2)':''}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:4px">
          <div style="font-size:14px;font-weight:600">${esc(ms.name)}</div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;margin-left:10px">
            ${msTasks.length?`<span style="font-size:11px;color:var(--text2)">${msDone}/${msTasks.length}</span>`:''}
            <span style="font-size:12px;font-weight:700;color:${msPct===100?'var(--em)':'var(--text2)'}">${msPct}%</span>
            ${canEdit?`<button onclick="openMilestoneModal('${ms.id}')" style="background:var(--surface2);border:1px solid var(--border);border-radius:5px;cursor:pointer;color:var(--text2);font-size:11px;padding:2px 8px">✏️</button>`:''}
          </div>
        </div>
        <div style="font-size:11px;color:var(--text2);margin-bottom:8px">${ms.targetDate?'🗓 '+fmtDate(ms.targetDate):''}${overdue?' ⚠️ เลยกำหนด':''}</div>
        ${ms.description?`<p style="font-size:11px;color:var(--text2);margin-bottom:8px;line-height:1.5">${esc(ms.description)}</p>`:''}
        <div class="ms-progress-bar"><div class="ms-progress-fill" style="width:${msPct}%;background:${msPct===100?'var(--em)':'var(--info)'}"></div></div>
        ${msTasks.length?`<div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap">
          ${msTasks.slice(0,6).map(t=>`<span class="ms-task-chip ${t.lane==='done'?'done':''}" onclick="openTaskModal_edit('${t.id}')" style="cursor:pointer" title="${esc(t.title)}">${esc((t.title||'').slice(0,22))}</span>`).join('')}
          ${msTasks.length>6?`<span class="ms-task-chip">+${msTasks.length-6}</span>`:''}
        </div>`:`<p style="font-size:11px;color:var(--text3);margin-top:8px">ยังไม่มี Task</p>`}
      </div>`;
    list.appendChild(row);
    if(idx<milestones.length-1){ const conn=document.createElement('div'); conn.style.cssText='height:12px;margin-left:18px;width:2px;background:var(--border2)'; list.appendChild(conn); }
  });
}

// ── Task Kanban Board ─────────────────────────────────────────
function setTaskFilter(key, val) {
  if(S.taskFilters[key]===val) S.taskFilters[key]=''; else S.taskFilters[key]=val;
  document.querySelectorAll('[data-tf-type]').forEach(b=>b.classList.toggle('on',b.dataset.tfType===S.taskFilters.type));
  renderTaskBoard();
}
function getFilteredTasks() {
  const {type}=S.taskFilters;
  const msSel=$('filter-ms')?.value||'';
  const asSel=$('filter-assignee-task')?.value||'';
  const srch=($('search-inp')?.value||'').toLowerCase();
  return S.tasks.filter(t=>{
    if(t.projectId!==S.currentProject) return false;
    if(type&&t.type!==type) return false;
    if(msSel&&t.milestoneId!==msSel) return false;
    if(asSel&&t.assignee!==asSel) return false;
    if(srch&&!(t.title||'').toLowerCase().includes(srch)) return false;
    return true;
  });
}

function renderTaskBoard() {
  const area=$('task-board-area'); area.innerHTML='';
  const filtered=getFilteredTasks();
  const canEdit=['Admin','Manager','Member'].includes(S.user?.role);
  getLanes().forEach(lane=>{
    const laneTasks=filtered.filter(t=>t.lane===lane.id)
      .sort((a,b)=>{ const pm={P0:0,P1:1,P2:2,P3:3}; return (pm[a.priority]||2)-(pm[b.priority]||2); });
    const pts=laneTasks.reduce((a,t)=>a+(parseInt(t.points)||0),0);
    const col=document.createElement('div'); col.className=`lane l-${lane.id}`; col.dataset.lane=lane.id;
    col.innerHTML=`
      <div class="lane-head">
        <div style="display:flex;align-items:center;gap:7px">
          <span style="font-size:12px">${lane.emoji}</span>
          <span style="font-size:12px;font-weight:700">${lane.label}</span>
          <span style="font-size:10px;background:var(--surface2);padding:1px 7px;border-radius:20px;color:var(--text2);font-family:'Inter',monospace">${laneTasks.length}</span>
          <span class="hint-wrap"><span class="hint-icon">?</span><span class="hint-tip">${LANE_HINTS[lane.id]||lane.label}</span></span>
        </div>
        <span style="font-size:10px;color:var(--text3);font-family:'Inter',monospace">${pts}pts</span>
      </div>
      <div class="lane-body" id="lb-${lane.id}"></div>
      <div class="lane-foot">${canEdit?`<button class="lane-add-btn" onclick="openTaskModal('${lane.id}')">+ Task</button>`:''}</div>`;
    area.appendChild(col);
    const body=col.querySelector('.lane-body');
    laneTasks.forEach(t=>body.appendChild(buildTaskCard(t)));
    setupDropzone(body, lane.id);
  });
}

function buildTaskCard(task) {
  const card=document.createElement('div'); card.className='task-card'; card.dataset.id=task.id;
  card.draggable=['Admin','Manager','Member'].includes(S.user?.role);
  const ms=S.milestones.find(m=>m.id===task.milestoneId);
  const member=S.members.find(m=>m.email===task.assignee);
  const memberName=member?(member.name||member.email):'';
  const overdue=task.dueDate&&new Date(task.dueDate)<new Date()&&task.lane!=='done';
  const typeBadge=getTypes().find(t=>t.id===task.type)||{emoji:'',label:task.type||''};
  const prioBadge=getPriorities().find(p=>p.id===task.priority)||{label:task.priority||'P2'};
  card.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
      <span style="font-family:'Inter',monospace;font-size:10px;color:var(--text3)">${task.id}</span>
      <div style="display:flex;gap:4px">
        <span class="badge b-${task.type}">${typeBadge.emoji} ${typeBadge.label}</span>
        <span class="badge b-${task.priority||'P2'}">${prioBadge.label}</span>
      </div>
    </div>
    <div style="font-size:13px;font-weight:500;line-height:1.4;margin-bottom:8px">${esc(task.title)}</div>
    <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
      ${task.points>0?`<div style="width:20px;height:20px;border-radius:50%;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:var(--text2);font-family:'Inter',monospace">${task.points}</div>`:''}
      ${memberName?`<div class="av av-sm" style="background:${avColor(memberName)};color:#fff" title="${memberName}">${initials(memberName)}</div>`:''}
      ${ms?`<span class="tc-ms">📍 ${esc(ms.name.slice(0,16))}</span>`:''}
      ${task.dueDate?`<span style="font-size:10px;color:${overdue?'var(--danger)':'var(--text2)'}">${overdue?'⚠️':''} ${fmtDate(task.dueDate)}</span>`:''}
      ${(task.commentCount||0)>0?`<span style="font-size:10px;color:var(--text3);margin-left:auto">💬 ${task.commentCount}</span>`:''}
    </div>`;
  card.addEventListener('click',()=>openTaskModal_edit(task.id));
  if(card.draggable) setupDrag(card, task.id, task.lane);
  return card;
}

// ── Drag & Drop ───────────────────────────────────────────────
function setupDrag(card, taskId, lane) {
  card.addEventListener('dragstart',e=>{ S.dragTaskId=taskId; S.dragLane=lane; card.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; });
  card.addEventListener('dragend',()=>card.classList.remove('dragging'));
}
function setupDropzone(el, laneId) {
  el.addEventListener('dragover',e=>{ e.preventDefault(); e.dataTransfer.dropEffect='move';
    el.querySelectorAll('.task-card').forEach(c=>c.classList.remove('drag-over-top'));
    const target=[...el.querySelectorAll('.task-card')].find(c=>{ const r=c.getBoundingClientRect(); return e.clientY<r.top+r.height/2; });
    if(target) target.classList.add('drag-over-top');
  });
  el.addEventListener('dragleave',()=>el.querySelectorAll('.task-card').forEach(c=>c.classList.remove('drag-over-top')));
  el.addEventListener('drop',async e=>{
    e.preventDefault(); el.querySelectorAll('.task-card').forEach(c=>c.classList.remove('drag-over-top'));
    if(!S.dragTaskId||S.dragLane===laneId) return;
    const task=S.tasks.find(t=>t.id===S.dragTaskId); if(!task) return;
    const prev=task.lane; task.lane=laneId; renderTaskBoard(); updateProjectStats(); loading(true);
    try { await api('updateTask',{taskId:task.id,lane:laneId}); const lbl=getLanes().find(l=>l.id===laneId)?.label||laneId; toast(`ย้าย → ${lbl}`,'ok'); }
    catch(e){ task.lane=prev; renderTaskBoard(); toast('ย้ายไม่สำเร็จ','err'); }
    finally { loading(false); }
  });
}
function updateProjectStats() {
  if(!S.currentProject) return;
  const tasks=S.tasks.filter(t=>t.projectId===S.currentProject);
  const done=tasks.filter(t=>t.lane==='done').length;
  const pct=tasks.length?Math.round(done/tasks.length*100):0;
  $('det-pct').textContent=$('det-pct-label').textContent=pct+'%';
  $('det-total-tasks').textContent=tasks.length; $('det-done-tasks').textContent=done;
  $('det-progress-fill').style.width=pct+'%';
}

// ── Calendar ──────────────────────────────────────────────────
function setCalFilter(f) {
  S.calFilter=f; $('cal-filter-all')?.classList.toggle('on',f==='all'); $('cal-filter-mine')?.classList.toggle('on',f==='mine');
  renderMainCalendar();
}

function getCalEvents(tasks, milestones) {
  const events=[];
  tasks.forEach(t=>{ if(t.dueDate){ const p=S.projects.find(pr=>pr.id===t.projectId); events.push({date:t.dueDate,label:t.title,color:p?.color||'#2563eb',type:'task',id:t.id,projectId:t.projectId}); } });
  milestones.forEach(m=>{ if(m.targetDate){ const p=S.projects.find(pr=>pr.id===m.projectId); events.push({date:m.targetDate,label:'📍 '+m.name,color:p?.color||'#6d48e5',type:'ms',id:m.id,projectId:m.projectId}); } });
  return events;
}

function renderCalendar(containerId, tasks, milestones) {
  const container=$(containerId); if(!container) return;
  const d=S.calDate; const y=d.getFullYear(), mon=d.getMonth();
  const events=getCalEvents(tasks,milestones);
  const firstDay=new Date(y,mon,1).getDay(); // 0=Sun
  const daysInMonth=new Date(y,mon+1,0).getDate();
  const monthName=d.toLocaleDateString('th-TH',{month:'long',year:'numeric'});
  const days=['อา','จ','อ','พ','พฤ','ศ','ส'];
  let html=`<div class="cal-wrap">
    <div class="cal-header">
      <button onclick="calNav(-1,'${containerId}',${JSON.stringify({ti:tasks.map(t=>t.id),mi:milestones.map(m=>m.id)})})" style="background:none;border:1px solid var(--border);border-radius:6px;cursor:pointer;padding:4px 10px;font-size:12px;color:var(--text2)">‹ ก่อน</button>
      <span style="font-size:13px;font-weight:700">${monthName}</span>
      <button onclick="calNav(1,'${containerId}',${JSON.stringify({ti:tasks.map(t=>t.id),mi:milestones.map(m=>m.id)})})" style="background:none;border:1px solid var(--border);border-radius:6px;cursor:pointer;padding:4px 10px;font-size:12px;color:var(--text2)">ถัดไป ›</button>
    </div>
    <div class="cal-grid">${days.map(d=>`<div class="cal-day-name">${d}</div>`).join('')}`;
  const today=new Date(); const todayStr=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  // Empty cells
  for(let i=0;i<firstDay;i++) html+=`<div class="cal-cell" style="background:var(--surface2)"></div>`;
  for(let day=1;day<=daysInMonth;day++){
    const dateStr=`${y}-${String(mon+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const isToday=dateStr===todayStr;
    const dayEvents=events.filter(e=>e.date===dateStr);
    html+=`<div class="cal-cell">
      <div class="cal-date${isToday?' today':''}">${day}</div>
      ${dayEvents.slice(0,3).map(ev=>`<div class="cal-event" style="background:${ev.color}22;color:${ev.color};border-left:2px solid ${ev.color}" onclick="${ev.type==='task'?`openTaskModal_edit('${ev.id}')`:''}" title="${esc(ev.label)}">${esc(ev.label.slice(0,18))}</div>`).join('')}
      ${dayEvents.length>3?`<div style="font-size:9px;color:var(--text2);padding-left:2px">+${dayEvents.length-3} more</div>`:''}
    </div>`;
  }
  // Fill remaining
  const total=firstDay+daysInMonth; const rem=total%7?7-(total%7):0;
  for(let i=0;i<rem;i++) html+=`<div class="cal-cell" style="background:var(--surface2)"></div>`;
  html+=`</div></div>`;
  container.innerHTML=html;
}

function calNav(dir, containerId, ids) {
  S.calDate=new Date(S.calDate.getFullYear(), S.calDate.getMonth()+dir, 1);
  const tasks=S.tasks.filter(t=>ids.ti.includes(t.id));
  const milestones=S.milestones.filter(m=>ids.mi.includes(m.id));
  renderCalendar(containerId, tasks, milestones);
}

function renderMainCalendar() {
  let tasks=S.tasks, milestones=S.milestones;
  if(S.calFilter==='mine') tasks=tasks.filter(t=>t.assignee===S.user?.email);
  renderCalendar('main-calendar', tasks, milestones);
}

function toggleMyTaskCalendar() {
  const wrap=$('mytask-calendar-wrap'), btn=$('mytask-cal-toggle');
  const show=wrap.style.display==='none';
  wrap.style.display=show?'block':'none'; btn.classList.toggle('on',show);
  btn.innerHTML=`<svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> ${show?'ซ่อนปฏิทิน':'แสดงปฏิทิน'}`;
  if(show){ const myT=S.tasks.filter(t=>t.assignee===S.user?.email); renderCalendar('mytask-calendar-wrap',myT,[]); }
}

function toggleProjectCalendar() {
  const wrap=$('proj-calendar-wrap'), btn=$('proj-cal-toggle');
  const show=wrap.style.display==='none';
  wrap.style.display=show?'block':'none'; btn.classList.toggle('on',show);
  btn.innerHTML=`<svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> ${show?'ซ่อนปฏิทิน':'แสดงปฏิทิน'}`;
  if(show){ const pT=S.tasks.filter(t=>t.projectId===S.currentProject); const pM=S.milestones.filter(m=>m.projectId===S.currentProject); renderCalendar('proj-calendar-wrap',pT,pM); }
}

// ── My Tasks View ─────────────────────────────────────────────
function renderMyTasks() {
  const list=$('mytasks-list'); if(!list) return; list.innerHTML='';
  const myTasks=S.tasks.filter(t=>t.assignee===S.user?.email).sort((a,b)=>{ const pm={P0:0,P1:1,P2:2,P3:3}; return (pm[a.priority]||2)-(pm[b.priority]||2); });
  if(!myTasks.length){ list.innerHTML=`<p style="color:var(--text2);font-size:13px">ยังไม่มีงาน 🎉</p>`; return; }
  const grouped={};
  myTasks.forEach(t=>{ if(!grouped[t.projectId]) grouped[t.projectId]=[]; grouped[t.projectId].push(t); });
  Object.entries(grouped).forEach(([projId,tasks])=>{
    const proj=S.projects.find(p=>p.id===projId);
    const sec=document.createElement('div'); sec.style.marginBottom='20px';
    sec.innerHTML=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <div style="width:10px;height:10px;border-radius:50%;background:${proj?.color||'var(--text3)'}"></div>
      <span style="font-size:12px;font-weight:700;color:var(--text2);cursor:pointer;text-decoration:underline" onclick="goProjectDetail('${projId}')">${esc(proj?.name||projId)}</span>
      <span style="font-size:11px;color:var(--text3)">${tasks.length} tasks</span>
    </div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden">
      ${tasks.map(t=>{ const lane=getLanes().find(l=>l.id===t.lane)||{emoji:'',label:t.lane}; const overdue=t.dueDate&&new Date(t.dueDate)<new Date()&&t.lane!=='done';
        return `<div onclick="goProjectDetail('${projId}')" style="display:grid;grid-template-columns:auto 1fr auto auto auto;gap:10px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .15s" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background='transparent'">
          <span class="badge b-${t.type}" style="font-size:9px">${t.type}</span>
          <span style="font-size:13px;font-weight:500">${esc(t.title)}</span>
          <span class="badge b-${t.priority||'P2'}" style="font-size:9px">${t.priority||'P2'}</span>
          <span style="font-size:10px;padding:2px 8px;border-radius:20px;background:var(--surface2);color:var(--text2)">${lane.emoji} ${lane.label}</span>
          <span style="font-size:10px;color:${overdue?'var(--danger)':'var(--text2)'}">${t.dueDate?fmtDate(t.dueDate):''}</span>
        </div>`; }).join('')}
    </div>`;
    list.appendChild(sec);
  });
}

// ── Users Management ──────────────────────────────────────────
function renderUsersTable() {
  const tbl=$('users-table'); if(!tbl) return;
  tbl.innerHTML=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden">
    <div class="user-row" style="background:var(--surface2);border-bottom:1px solid var(--border)">
      <span style="font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.06em">ชื่อ / อีเมล</span>
      <span style="font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.06em">อีเมล</span>
      <span style="font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.06em">Role</span>
      <span style="font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.06em">สถานะ</span>
      <span></span>
    </div>
    ${S.members.map(m=>`
      <div class="user-row">
        <div style="display:flex;align-items:center;gap:9px">
          <div class="av av-sm" style="background:${avColor(m.name||m.email)};color:#fff">${initials(m.name||m.email)}</div>
          <span style="font-size:13px;font-weight:500">${esc(m.name||m.email)}</span>
        </div>
        <span style="font-size:11px;color:var(--text2)">${esc(m.email)}</span>
        <span class="badge" style="background:${ROLE_COLORS[m.role]||'#9aaabe'}20;color:${ROLE_COLORS[m.role]||'#9aaabe'}">${m.role}</span>
        <span class="badge ${m.active==='false'?'b-status-paused':'b-status-active'}">${m.active==='false'?'Disabled':'Active'}</span>
        <button onclick="openUserModal('${m.email}')" style="padding:4px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:11px;color:var(--text2)">แก้ไข</button>
      </div>`).join('')}
  </div>`;
}

function openUserModal(email=null) {
  S.editingUserId=email;
  $('m-user-title').textContent=email?'แก้ไข User':'เพิ่ม User ใหม่';
  $('uf-pw-section').style.display=email?'none':'block';
  $('uf-reset-section').style.display=email?'block':'none';
  if(email){
    const u=S.members.find(m=>m.email===email)||{};
    $('uf-email').value=email; $('uf-email').readOnly=true;
    $('uf-name').value=u.name||''; $('uf-role').value=u.role||'Member';
    $('uf-active').value=u.active!=='false'?'true':'false';
    $('uf-new-pw').value='';
  } else {
    $('uf-email').value=''; $('uf-email').readOnly=false;
    $('uf-name').value=''; $('uf-role').value='Member'; $('uf-active').value='true'; $('uf-pw').value='';
  }
  $('m-user').style.display='flex';
}

async function saveUser() {
  const email=$('uf-email').value.trim(), name=$('uf-name').value.trim();
  const role=$('uf-role').value, active=$('uf-active').value;
  if(!email||!name){ toast('กรุณากรอกอีเมลและชื่อ','err'); return; }
  lockModal('m-user');
  try {
    if(S.editingUserId){
      const newPw=$('uf-new-pw').value;
      await api('updateUser',{email, name, role, active, newPassword: newPw||null});
      toast('บันทึกสำเร็จ','ok');
    } else {
      const pw=$('uf-pw').value;
      if(!pw||pw.length<6){ toast('รหัสผ่านต้องมีอย่างน้อย 6 ตัว','err'); unlockModal('m-user'); return; }
      await api('createUser',{email, name, role, active, password:pw});
      toast(`สร้าง User ${email} สำเร็จ`,'ok');
    }
    closeModal('m-user'); await loadAll(); renderUsersTable();
  } catch(e){ toast(e.message,'err'); unlockModal('m-user'); }
}

// ── Project Modal ─────────────────────────────────────────────
function openProjectModal(id=null) {
  S.editingProjectId=id;
  $('m-proj-title').textContent=id?'แก้ไข Project':'สร้าง Project ใหม่';
  $('m-proj-del').style.display=id&&S.user?.role==='Admin'?'block':'none';
  if(id){ const p=S.projects.find(x=>x.id===id)||{};
    $('pf-name').value=p.name||''; $('pf-desc').value=p.description||'';
    $('pf-status').value=p.status||'planning'; $('pf-start').value=p.startDate||''; $('pf-end').value=p.endDate||'';
    S.projColor=p.color||'#00a87a';
    $('proj-swatches').querySelectorAll('.swatch').forEach(s=>s.classList.toggle('on',s.dataset.color===S.projColor));
  } else {
    ['pf-name','pf-desc','pf-start','pf-end'].forEach(id=>$(id).value='');
    $('pf-status').value='planning'; S.projColor='#00a87a';
    $('proj-swatches').querySelectorAll('.swatch').forEach((s,i)=>s.classList.toggle('on',i===0));
  }
  $('m-project').style.display='flex';
}

async function saveProject() {
  const name=$('pf-name').value.trim(); if(!name){ toast('กรุณาใส่ชื่อ','err'); return; }
  lockModal('m-project'); loading(true);
  const payload={name, description:$('pf-desc').value.trim(), status:$('pf-status').value, color:S.projColor, startDate:$('pf-start').value, endDate:$('pf-end').value};
  try {
    if(S.editingProjectId){
      await api('updateProject',{projectId:S.editingProjectId,...payload});
      const idx=S.projects.findIndex(p=>p.id===S.editingProjectId); if(idx!==-1) S.projects[idx]={...S.projects[idx],...payload};
      toast('บันทึกสำเร็จ','ok');
    } else { const data=await api('createProject',payload); S.projects.push(data.project); toast('สร้าง Project สำเร็จ','ok'); }
    updateSidebar(); renderProjectsGrid(); closeModal('m-project');
  } catch(e){ toast(e.message,'err'); unlockModal('m-project'); }
  finally { loading(false); }
}

async function deleteProject() {
  if(!S.editingProjectId||!confirm('ลบ Project นี้? Tasks ทั้งหมดจะถูกซ่อน')) return;
  lockModal('m-project'); loading(true);
  try {
    await api('deleteProject',{projectId:S.editingProjectId});
    S.projects=S.projects.filter(p=>p.id!==S.editingProjectId);
    S.tasks=S.tasks.filter(t=>t.projectId!==S.editingProjectId);
    S.milestones=S.milestones.filter(m=>m.projectId!==S.editingProjectId);
    closeModal('m-project'); updateSidebar(); renderProjectsGrid(); toast('ลบ Project สำเร็จ','ok');
  } catch(e){ toast(e.message,'err'); unlockModal('m-project'); }
  finally { loading(false); }
}

// ── Milestone Modal ───────────────────────────────────────────
function openMilestoneModal(id=null) {
  S.editingMsId=id;
  $('m-ms-title').textContent=id?'แก้ไข Milestone':'สร้าง Milestone ใหม่';
  $('m-ms-del').style.display=id?'block':'none';
  if(id){ const ms=S.milestones.find(m=>m.id===id)||{};
    $('msf-name').value=ms.name||''; $('msf-desc').value=ms.description||'';
    $('msf-date').value=ms.targetDate||''; $('msf-status').value=ms.status||'pending';
  } else { ['msf-name','msf-desc','msf-date'].forEach(id=>$(id).value=''); $('msf-status').value='pending'; }
  $('m-milestone').style.display='flex';
}

async function saveMilestone() {
  const name=$('msf-name').value.trim(); if(!name){ toast('กรุณาใส่ชื่อ','err'); return; }
  lockModal('m-milestone'); loading(true);
  const payload={name, description:$('msf-desc').value.trim(), targetDate:$('msf-date').value, status:$('msf-status').value, projectId:S.currentProject};
  try {
    if(S.editingMsId){
      await api('updateMilestone',{milestoneId:S.editingMsId,...payload});
      const idx=S.milestones.findIndex(m=>m.id===S.editingMsId); if(idx!==-1) S.milestones[idx]={...S.milestones[idx],...payload};
      toast('บันทึกสำเร็จ','ok');
    } else { const data=await api('createMilestone',payload); S.milestones.push(data.milestone); toast('สร้าง Milestone สำเร็จ','ok'); }
    renderProjectDetail(S.currentProject); closeModal('m-milestone');
  } catch(e){ toast(e.message,'err'); unlockModal('m-milestone'); }
  finally { loading(false); }
}

async function deleteMilestone() {
  if(!S.editingMsId||!confirm('ลบ Milestone? Tasks ที่เชื่อมอยู่จะไม่ถูกลบ')) return;
  lockModal('m-milestone'); loading(true);
  try {
    await api('deleteMilestone',{milestoneId:S.editingMsId});
    S.milestones=S.milestones.filter(m=>m.id!==S.editingMsId);
    S.tasks.forEach(t=>{ if(t.milestoneId===S.editingMsId) t.milestoneId=''; });
    renderProjectDetail(S.currentProject); closeModal('m-milestone'); toast('ลบ Milestone สำเร็จ','ok');
  } catch(e){ toast(e.message,'err'); unlockModal('m-milestone'); }
  finally { loading(false); }
}

// ── Task Modal ────────────────────────────────────────────────
function openTaskModal(defaultLane='current') {
  S.editingTaskId=null; S.replyingTo=null;
  $('m-task-title').textContent='สร้าง Task ใหม่'; $('m-task-id').textContent='';
  $('tf-name').value=''; $('tf-desc').value='';
  $('tf-lane').value=defaultLane; $('tf-pts').value='0';
  $('tf-assignee').value=''; $('tf-ms').value=''; $('tf-due').value='';
  $('m-task-del').style.display='none'; $('task-comments-section').style.display='none';
  $('m-task').style.display='flex';
}

function openTaskModal_edit(taskId) {
  const t=S.tasks.find(x=>x.id===taskId); if(!t) return;
  S.editingTaskId=taskId; S.replyingTo=null;
  $('m-task-title').textContent='แก้ไข Task'; $('m-task-id').textContent=t.id;
  $('tf-name').value=t.title||''; $('tf-desc').value=t.description||'';
  $('tf-type').value=t.type||'feature'; $('tf-prio').value=t.priority||'P2';
  $('tf-lane').value=t.lane||'current'; $('tf-pts').value=t.points||'0';
  $('tf-assignee').value=t.assignee||''; $('tf-ms').value=t.milestoneId||''; $('tf-due').value=t.dueDate||'';
  $('m-task-del').style.display=['Admin','Manager'].includes(S.user?.role)?'block':'none';
  $('task-comments-section').style.display='block';
  renderTaskComments(t.comments||[]);
  $('m-task').style.display='flex';
}

// ── Comments with Reply ───────────────────────────────────────
function renderTaskComments(comments) {
  const list=$('task-comments-list'); list.innerHTML='';
  (comments||[]).forEach((c,idx)=>{
    const canDelete=['Admin','Manager'].includes(S.user?.role)||c.author===(S.user?.name||S.user?.email);
    const item=document.createElement('div'); item.className='comment-item';
    item.innerHTML=`
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:5px">
        <div class="av av-sm" style="background:${avColor(c.author)};color:#fff">${initials(c.author)}</div>
        <span style="font-size:11px;font-weight:600;color:var(--text)">${esc(c.author)}</span>
        <span style="font-size:10px;color:var(--text3)">${fmtDateTime(c.ts)}</span>
      </div>
      <p style="font-size:12px;color:var(--text);line-height:1.5;margin-bottom:6px">${esc(c.text)}</p>
      ${(c.replies||[]).map(r=>`
        <div class="comment-reply">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
            <div class="av av-sm" style="background:${avColor(r.author)};color:#fff;width:16px;height:16px;font-size:7px">${initials(r.author)}</div>
            <span style="font-size:10px;font-weight:600">${esc(r.author)}</span>
            <span style="font-size:9px;color:var(--text3)">${fmtDateTime(r.ts)}</span>
          </div>
          <p style="font-size:11px;color:var(--text);line-height:1.5">${esc(r.text)}</p>
        </div>`).join('')}
      <div class="comment-actions">
        <button class="cmt-btn" onclick="startReply(${idx})">↩ Reply</button>
        ${canDelete?`<button class="cmt-btn del" onclick="deleteComment(${idx})">🗑 ลบ</button>`:''}
      </div>`;
    list.appendChild(item);
    // Reply box
    const replyBox=document.createElement('div'); replyBox.id=`reply-box-${idx}`; replyBox.style.display='none';
    replyBox.style.cssText='display:none;margin-top:6px;padding:8px;background:var(--surface2);border-radius:8px;';
    replyBox.innerHTML=`<div style="display:flex;gap:6px"><input type="text" id="reply-inp-${idx}" class="f-inp" style="flex:1;font-size:12px;padding:6px 10px" placeholder="ตอบกลับ..."/><button onclick="sendReply(${idx})" class="btn-ghost" style="font-size:11px;white-space:nowrap">ส่ง</button></div>`;
    item.appendChild(replyBox);
  });
  // Reply input visibility
  if(S.replyingTo!==null){ const rb=$(`reply-box-${S.replyingTo}`); if(rb){ rb.style.display='block'; const inp=$(`reply-inp-${S.replyingTo}`); if(inp) inp.focus(); } }
}

function startReply(idx) {
  S.replyingTo=S.replyingTo===idx?null:idx;
  const task=S.tasks.find(t=>t.id===S.editingTaskId);
  renderTaskComments(task?.comments||[]);
}

async function sendReply(idx) {
  const inp=$(`reply-inp-${idx}`); if(!inp) return;
  const text=inp.value.trim(); if(!text) return;
  const btn=inp.nextElementSibling; btnLoading(btn,'กำลังส่ง...');
  inp.disabled=true;
  try {
    await api('addTaskReply',{taskId:S.editingTaskId, commentIndex:idx, reply:{author:S.user.name||S.user.email, text, ts:new Date().toISOString()}});
    const task=S.tasks.find(t=>t.id===S.editingTaskId);
    if(task){ if(!task.comments[idx].replies) task.comments[idx].replies=[]; task.comments[idx].replies.push({author:S.user.name||S.user.email,text,ts:new Date().toISOString()}); }
    S.replyingTo=null; renderTaskComments(task?.comments||[]); toast('ตอบกลับสำเร็จ','ok');
  } catch(e){ toast(e.message,'err'); }
  finally { btnReset(btn); inp.disabled=false; }
}

async function deleteComment(idx) {
  if(!confirm('ลบ comment นี้?')) return;
  try {
    await api('deleteTaskComment',{taskId:S.editingTaskId, commentIndex:idx});
    const task=S.tasks.find(t=>t.id===S.editingTaskId);
    if(task){ task.comments.splice(idx,1); task.commentCount=Math.max(0,(task.commentCount||1)-1); }
    renderTaskComments(task?.comments||[]); toast('ลบ comment สำเร็จ','ok');
  } catch(e){ toast(e.message,'err'); }
}

async function addTaskComment() {
  const inp=$('task-comment-inp'); const text=inp.value.trim();
  if(!text||!S.editingTaskId) return;
  const btn=inp.nextElementSibling; btnLoading(btn,'กำลังส่ง...'); inp.disabled=true; inp.value='';
  const c={author:S.user.name||S.user.email, text, ts:new Date().toISOString(), replies:[]};
  try {
    await api('addTaskComment',{taskId:S.editingTaskId, comment:c});
    const task=S.tasks.find(t=>t.id===S.editingTaskId);
    if(task){ task.comments=[...(task.comments||[]),c]; task.commentCount=(task.commentCount||0)+1; }
    renderTaskComments(task?.comments||[]); toast('เพิ่ม Comment สำเร็จ','ok');
  } catch(e){ toast('เกิดข้อผิดพลาด','err'); }
  finally { btnReset(btn); inp.disabled=false; }
}

async function saveTask() {
  const title=$('tf-name').value.trim(); if(!title){ toast('กรุณาใส่ชื่อ','err'); return; }
  lockModal('m-task'); loading(true);
  const payload={projectId:S.currentProject, title, description:$('tf-desc').value.trim(),
    type:$('tf-type').value, priority:$('tf-prio').value, lane:$('tf-lane').value,
    points:parseInt($('tf-pts').value)||0, assignee:$('tf-assignee').value,
    milestoneId:$('tf-ms').value, dueDate:$('tf-due').value};
  try {
    if(S.editingTaskId){
      payload.taskId=S.editingTaskId; await api('updateTask',payload);
      const idx=S.tasks.findIndex(t=>t.id===S.editingTaskId); if(idx!==-1) S.tasks[idx]={...S.tasks[idx],...payload};
      toast('บันทึกสำเร็จ','ok');
    } else { const data=await api('createTask',payload); S.tasks.push(data.task); toast('สร้าง Task สำเร็จ','ok'); }
    closeModal('m-task'); renderProjectDetail(S.currentProject); updateProjectStats();
  } catch(e){ toast(e.message,'err'); unlockModal('m-task'); }
  finally { loading(false); }
}

async function deleteTask() {
  if(!S.editingTaskId||!confirm('ลบ Task? ข้อมูลใน Sheet จะยังอยู่แต่ไม่แสดงในระบบ')) return;
  lockModal('m-task'); loading(true);
  try {
    await api('deleteTask',{taskId:S.editingTaskId});
    S.tasks=S.tasks.filter(t=>t.id!==S.editingTaskId);
    closeModal('m-task'); renderProjectDetail(S.currentProject); updateProjectStats(); toast('ลบ Task สำเร็จ','ok');
  } catch(e){ toast(e.message,'err'); unlockModal('m-task'); }
  finally { loading(false); }
}

// ── Profile Modal ─────────────────────────────────────────────
function openProfileModal() {
  const u=S.user; const roleC={Admin:'#00a87a',Manager:'#6d48e5',Member:'#2563eb',Viewer:'#9aaabe'};
  $('prof-av').textContent=initials(u.name||u.email); $('prof-av').style.background=avColor(u.name||u.email); $('prof-av').style.color='#fff';
  $('prof-name').textContent=u.name||u.email; $('prof-email').textContent=u.email;
  const re=$('prof-role'); re.textContent=u.role; re.style.background=`${roleC[u.role]||'#9aaabe'}20`; re.style.color=roleC[u.role]||'#9aaabe';
  $('pp-old').value=''; $('pp-new').value='';
  $('m-profile').style.display='flex';
}

// ── Search ────────────────────────────────────────────────────
function onSearch() {
  if($('view-projects').classList.contains('on')) renderProjectsGrid();
  else if($('view-project-detail').classList.contains('on')&&S.detailTab==='board') renderTaskBoard();
}

// ── Init ──────────────────────────────────────────────────────
(function init(){
  const raw=sessionStorage.getItem('sess');
  if(raw){ try{ const d=JSON.parse(raw); S.user=d.user; S.token=d.token; bootApp(); }catch{} }
  else { $('auth').style.display='flex'; }
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape') ['m-project','m-milestone','m-task','m-user','m-profile'].forEach(id=>{const el=$(id);if(el)el.style.display='none';});
    if((e.ctrlKey||e.metaKey)&&e.key==='k'){ e.preventDefault(); $('search-inp')?.focus(); }
  });
})();
