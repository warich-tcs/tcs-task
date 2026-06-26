/* ═══════════════════════════════════════════════════
   THE CODE · Board — app.js
   Frontend Logic: Auth, Board, Kanban, Drag & Drop
═══════════════════════════════════════════════════ */

// ── State ──────────────────────────────────────────
const STATE = {
  currentUser: null,
  sessionToken: null,
  currentBoard: null,
  stories: [],
  epics: [],
  members: [],
  boards: [],
  currentView: 'board',
  filters: { type: '', priority: '', assignee: '', search: '' },
  editingStoryId: null,
  dragCard: null,
  dragSourceLane: null,
};

const LANES = [
  { id: 'icebox',  label: 'Icebox',            emoji: '❄️',  cls: 'lane-icebox'  },
  { id: 'backlog', label: 'Backlog',            emoji: '📋',  cls: 'lane-backlog' },
  { id: 'current', label: 'Current Iteration',  emoji: '🔵',  cls: 'lane-current' },
  { id: 'review',  label: 'In Review',          emoji: '🔍',  cls: 'lane-review'  },
  { id: 'done',    label: 'Done',               emoji: '✅',  cls: 'lane-done'    },
];

const ROLE_COLORS = { Admin: '#00c896', Manager: '#a78bfa', Member: '#93c5fd', Viewer: '#94a3b8' };
const PRIO_COLORS = { P0: '#ef4444', P1: '#f97316', P2: '#eab308', P3: '#94a3b8' };
const AVATAR_COLORS = ['#00c896','#a78bfa','#93c5fd','#f59e0b','#e040c8','#06b6d4'];

// ── Utilities ──────────────────────────────────────
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function setLoading(on) {
  document.getElementById('loading-indicator').style.display = on ? 'flex' : 'none';
}

function avatarInitials(name = '') {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function avatarColor(name = '') {
  let h = 0;
  for (const c of name) h = ((h << 5) - h) + c.charCodeAt(0);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function formatDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }); } catch { return d; }
}

function simpleHash(str) {
  // Simple deterministic hash for client — actual auth done server-side
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ── API ────────────────────────────────────────────
async function api(action, payload = {}) {
  const body = { action, token: STATE.sessionToken, ...payload };
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'text/plain' },
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'API error');
    return data;
  } catch (err) {
    console.error('[API]', action, err);
    throw err;
  }
}

// ── Auth ───────────────────────────────────────────
function switchAuthTab(tab) {
  ['login','change-pw'].forEach(t => {
    document.getElementById(`tab-${t}`).style.display = t === tab ? 'block' : 'none';
    document.querySelectorAll('.tab-btn').forEach((btn, i) => btn.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'change-pw')));
  });
}

async function loginSubmit() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  const btn      = document.getElementById('login-btn');

  errEl.style.display = 'none';
  if (!email || !password) { errEl.textContent = 'กรุณากรอกอีเมลและรหัสผ่าน'; errEl.style.display = 'block'; return; }

  btn.disabled = true;
  btn.textContent = 'กำลังตรวจสอบ...';

  try {
    const data = await api('login', { email, passwordHash: simpleHash(password) });
    STATE.currentUser  = data.user;
    STATE.sessionToken = data.token;
    sessionStorage.setItem('session', JSON.stringify({ user: data.user, token: data.token }));
    initApp();
  } catch (e) {
    errEl.textContent = e.message || 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'เข้าสู่ระบบ';
  }
}

async function changePasswordSubmit() {
  const email   = document.getElementById('cp-email').value.trim();
  const oldPw   = document.getElementById('cp-old').value;
  const newPw   = document.getElementById('cp-new').value;
  const errEl   = document.getElementById('cp-error');
  const btn     = document.getElementById('cp-btn');

  errEl.style.display = 'none';
  if (!email || !oldPw || !newPw) { errEl.textContent = 'กรุณากรอกข้อมูลให้ครบ'; errEl.style.display = 'block'; return; }
  if (newPw.length < 6) { errEl.textContent = 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร'; errEl.style.display = 'block'; return; }

  btn.disabled = true;
  btn.textContent = 'กำลังเปลี่ยน...';
  try {
    await api('changePassword', { email, oldHash: simpleHash(oldPw), newHash: simpleHash(newPw) });
    toast('เปลี่ยนรหัสผ่านสำเร็จ', 'success');
    switchAuthTab('login');
  } catch (e) {
    errEl.textContent = e.message || 'เกิดข้อผิดพลาด';
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'เปลี่ยนรหัสผ่าน';
  }
}

async function changePasswordFromProfile() {
  const oldPw = document.getElementById('prof-old-pw').value;
  const newPw = document.getElementById('prof-new-pw').value;
  if (!oldPw || !newPw) { toast('กรุณากรอกรหัสผ่าน', 'error'); return; }
  if (newPw.length < 6)  { toast('รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร', 'error'); return; }
  try {
    await api('changePassword', {
      email: STATE.currentUser.email,
      oldHash: simpleHash(oldPw),
      newHash: simpleHash(newPw)
    });
    toast('เปลี่ยนรหัสผ่านสำเร็จ', 'success');
    document.getElementById('profile-modal').style.display = 'none';
  } catch (e) { toast(e.message || 'เกิดข้อผิดพลาด', 'error'); }
}

function logout() {
  sessionStorage.removeItem('session');
  STATE.currentUser = null; STATE.sessionToken = null;
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app-screen').style.display = 'none';
}

function restoreSession() {
  const raw = sessionStorage.getItem('session');
  if (!raw) return false;
  try {
    const { user, token } = JSON.parse(raw);
    STATE.currentUser  = user;
    STATE.sessionToken = token;
    return true;
  } catch { return false; }
}

// ── App Init ───────────────────────────────────────
async function initApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'flex';

  const u = STATE.currentUser;
  document.getElementById('user-display-name').textContent = u.name || u.email;
  const av = document.getElementById('user-avatar');
  av.textContent = avatarInitials(u.name || u.email);
  av.style.background = avatarColor(u.name || u.email);

  const isAdmin = u.role === 'Admin';
  if (isAdmin) {
    document.getElementById('btn-new-board').style.display = 'block';
    document.getElementById('nav-members').style.display = 'flex';
  }

  setLoading(true);
  try {
    await loadBoards();
    // Load last board if any
    const lastBoard = sessionStorage.getItem('lastBoard');
    if (lastBoard && STATE.boards.find(b => b.id === lastBoard)) loadBoard(lastBoard);
    else if (STATE.boards.length > 0) loadBoard(STATE.boards[0].id);
    else showEmptyState();
  } catch(e) { toast('โหลดข้อมูลไม่สำเร็จ: ' + e.message, 'error'); }
  finally { setLoading(false); }
}

// ── Boards ─────────────────────────────────────────
async function loadBoards() {
  const data = await api('getBoards');
  STATE.boards = data.boards || [];
  const sel = document.getElementById('board-selector');
  sel.innerHTML = '<option value="">— เลือก Board —</option>';
  STATE.boards.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id; opt.textContent = b.name;
    sel.appendChild(opt);
  });
}

async function loadBoard(boardId) {
  if (!boardId) return;
  STATE.currentBoard = boardId;
  sessionStorage.setItem('lastBoard', boardId);
  document.getElementById('board-selector').value = boardId;

  const canWrite = ['Admin','Manager','Member'].includes(STATE.currentUser.role);
  document.getElementById('btn-add-story').style.display = canWrite ? 'block' : 'none';

  setLoading(true);
  try {
    const data = await api('getBoardData', { boardId });
    STATE.stories = data.stories || [];
    STATE.epics   = data.epics   || [];
    STATE.members = data.members || [];
    populateAssigneeFilter();
    populateEpicSelect();
    populateAssigneeSelect();
    renderCurrentView();
  } catch(e) { toast('โหลด Board ไม่สำเร็จ: ' + e.message, 'error'); }
  finally { setLoading(false); }
}

async function createBoard() {
  const name = document.getElementById('new-board-name').value.trim();
  const desc = document.getElementById('new-board-desc').value.trim();
  if (!name) { toast('กรุณาใส่ชื่อ Board', 'error'); return; }
  setLoading(true);
  try {
    await api('createBoard', { name, description: desc });
    await loadBoards();
    closeBoardModal();
    toast(`สร้าง Board "${name}" สำเร็จ`, 'success');
  } catch(e) { toast(e.message, 'error'); }
  finally { setLoading(false); }
}

function showEmptyState() {
  document.getElementById('view-board').style.display = 'none';
  document.getElementById('empty-state').style.display = 'flex';
}

// ── Views ──────────────────────────────────────────
function setView(v) {
  STATE.currentView = v;
  ['board','backlog','epics','members'].forEach(id => {
    document.getElementById(`view-${id}`).style.display = 'none';
    const nav = document.getElementById(`nav-${id}`);
    if (nav) nav.classList.remove('active');
  });
  document.getElementById(`view-${v}`).style.display = v === 'board' ? 'flex' : 'block';
  const nav = document.getElementById(`nav-${v}`);
  if (nav) nav.classList.add('active');
  renderCurrentView();
}

function renderCurrentView() {
  document.getElementById('empty-state').style.display = 'none';
  switch (STATE.currentView) {
    case 'board':   renderBoard();   break;
    case 'backlog': renderBacklog(); break;
    case 'epics':   renderEpics();   break;
    case 'members': renderMembers(); break;
  }
}

// ── Kanban Board ───────────────────────────────────
function getFilteredStories() {
  const { type, priority, assignee, search } = STATE.filters;
  return STATE.stories.filter(s => {
    if (type     && s.type     !== type)     return false;
    if (priority && s.priority !== priority) return false;
    if (assignee && s.assignee !== assignee) return false;
    if (search && !( (s.title||'').toLowerCase().includes(search.toLowerCase()) ||
                     (s.id||'').toLowerCase().includes(search.toLowerCase()) )) return false;
    return true;
  });
}

function renderBoard() {
  const board = document.getElementById('view-board');
  board.style.display = 'flex';
  board.innerHTML = '';

  const filtered = getFilteredStories();

  LANES.forEach(lane => {
    const stories = filtered.filter(s => s.lane === lane.id);
    const col = document.createElement('div');
    col.className = `lane ${lane.cls}`;
    col.dataset.lane = lane.id;

    const pts = stories.reduce((a, s) => a + (parseInt(s.points) || 0), 0);
    col.innerHTML = `
      <div class="lane-header">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:13px;">${lane.emoji}</span>
          <span style="font-size:13px;font-weight:700;color:#e2e8f0;">${lane.label}</span>
          <span style="font-size:11px;background:#1e2a3a;padding:2px 8px;border-radius:20px;color:#94a3b8;font-family:'Inter',monospace;">${stories.length}</span>
        </div>
        <span style="font-size:10px;color:#4b6282;font-family:'Inter',monospace;">${pts}pts</span>
      </div>
      <div class="lane-body" id="lane-${lane.id}"></div>
      <div class="lane-footer">
        ${canEdit() ? `<button onclick="openNewStoryModal('${lane.id}')" style="width:100%;padding:6px;background:transparent;border:1px dashed #1e2a3a;border-radius:7px;color:#4b6282;cursor:pointer;font-size:12px;font-family:'Sarabun',sans-serif;transition:all .15s;" onmouseover="this.style.borderColor='#2d4060';this.style.color='#94a3b8'" onmouseout="this.style.borderColor='#1e2a3a';this.style.color='#4b6282'">+ เพิ่ม Story</button>` : ''}
      </div>`;
    board.appendChild(col);

    const laneBody = col.querySelector('.lane-body');
    stories.sort((a,b) => {
      const pmap = {P0:0,P1:1,P2:2,P3:3};
      return (pmap[a.priority]||2) - (pmap[b.priority]||2);
    }).forEach(s => laneBody.appendChild(createCard(s)));

    setupDropZone(laneBody, lane.id);
  });
}

function canEdit() {
  return ['Admin','Manager','Member'].includes(STATE.currentUser?.role);
}

function createCard(story) {
  const card = document.createElement('div');
  card.className = 'story-card';
  card.dataset.id = story.id;
  card.draggable = canEdit();

  const epic = STATE.epics.find(e => e.id === story.epicId);
  const member = STATE.members.find(m => m.email === story.assignee);
  const memberName = member ? (member.name || member.email) : '';

  const overdue = story.dueDate && new Date(story.dueDate) < new Date() && story.lane !== 'done';

  card.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
      <span class="story-id">${story.id}</span>
      <div style="display:flex;align-items:center;gap:4px;">
        <span class="badge badge-${story.type}">${story.type}</span>
        <span class="badge badge-${(story.priority||'P2').toLowerCase()}">${story.priority||'P2'}</span>
      </div>
    </div>
    ${epic ? `<div class="epic-tag" style="margin-bottom:4px;">⚡ ${epic.name}</div>` : ''}
    <div class="story-title">${escHtml(story.title)}</div>
    <div class="story-meta">
      ${story.points > 0 ? `<div class="pts-chip">${story.points}</div>` : ''}
      ${memberName ? `<div class="avatar" style="background:${avatarColor(memberName)};color:#0a0e1a;" title="${memberName}">${avatarInitials(memberName)}</div>` : ''}
      ${story.dueDate ? `<span style="font-size:10px;color:${overdue ? '#ef4444' : '#4b6282'};">${overdue ? '⚠️ ' : ''}${formatDate(story.dueDate)}</span>` : ''}
      ${story.commentCount > 0 ? `<span style="font-size:10px;color:#4b6282;margin-left:auto;">💬 ${story.commentCount}</span>` : ''}
    </div>`;

  card.addEventListener('click', () => openStoryModal(story.id));
  if (canEdit()) setupDrag(card, story.id, story.lane);
  return card;
}

function escHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Drag & Drop ────────────────────────────────────
function setupDrag(card, storyId, lane) {
  card.addEventListener('dragstart', e => {
    STATE.dragCard = storyId;
    STATE.dragSourceLane = lane;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));
}

function setupDropZone(el, laneId) {
  el.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    el.querySelectorAll('.story-card').forEach(c => c.classList.remove('drag-over'));
    // Find nearest card
    const target = [...el.querySelectorAll('.story-card')].find(c => {
      const rect = c.getBoundingClientRect();
      return e.clientY < rect.top + rect.height / 2;
    });
    if (target) target.classList.add('drag-over');
  });
  el.addEventListener('dragleave', () => {
    el.querySelectorAll('.story-card').forEach(c => c.classList.remove('drag-over'));
  });
  el.addEventListener('drop', async e => {
    e.preventDefault();
    el.querySelectorAll('.story-card').forEach(c => c.classList.remove('drag-over'));
    if (!STATE.dragCard || STATE.dragSourceLane === laneId) return;

    const story = STATE.stories.find(s => s.id === STATE.dragCard);
    if (!story) return;
    story.lane = laneId;

    renderBoard();
    setLoading(true);
    try {
      await api('updateStory', { boardId: STATE.currentBoard, storyId: STATE.dragCard, lane: laneId });
      toast(`ย้าย "${story.title.slice(0,30)}" → ${LANES.find(l=>l.id===laneId)?.label}`, 'success');
    } catch(e) {
      story.lane = STATE.dragSourceLane;
      renderBoard();
      toast('ย้าย Story ไม่สำเร็จ', 'error');
    } finally { setLoading(false); }
  });
}

// ── Backlog View ───────────────────────────────────
function renderBacklog() {
  const container = document.getElementById('view-backlog');
  const filtered = getFilteredStories();

  const grouped = {};
  LANES.forEach(l => grouped[l.id] = []);
  filtered.forEach(s => { if (grouped[s.lane]) grouped[s.lane].push(s); });

  container.innerHTML = `<h2 style="font-size:16px;font-weight:700;color:#e2e8f0;margin-bottom:20px;">Backlog — รายการทั้งหมด (${filtered.length} stories)</h2>`;

  LANES.forEach(lane => {
    const stories = grouped[lane.id];
    if (!stories.length) return;
    const section = document.createElement('div');
    section.style.marginBottom = '24px';
    section.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <span>${lane.emoji}</span>
        <span style="font-size:13px;font-weight:700;color:#94a3b8;">${lane.label}</span>
        <span style="font-size:11px;background:#1e2a3a;padding:2px 8px;border-radius:20px;color:#94a3b8;">${stories.length}</span>
      </div>
      <div style="border:1px solid #1e2a3a;border-radius:10px;overflow:hidden;">
        ${stories.map(s => `
          <div onclick="openStoryModal('${s.id}')" style="display:grid;grid-template-columns:100px 1fr 100px 80px 80px;gap:12px;align-items:center;padding:12px 16px;border-bottom:1px solid #1e2a3a;cursor:pointer;transition:background .15s;" onmouseover="this.style.background='#111827'" onmouseout="this.style.background='transparent'">
            <span style="font-family:'Inter',monospace;font-size:11px;color:#4b6282;">${s.id}</span>
            <span style="font-size:13px;font-weight:500;color:#e2e8f0;">${escHtml(s.title)}</span>
            <span class="badge badge-${s.type}" style="justify-self:start;">${s.type}</span>
            <span class="badge badge-${(s.priority||'P2').toLowerCase()}" style="justify-self:start;">${s.priority}</span>
            <span style="font-size:11px;color:#4b6282;">${formatDate(s.dueDate)}</span>
          </div>`).join('')}
      </div>`;
    container.appendChild(section);
  });
}

// ── Epics View ─────────────────────────────────────
function renderEpics() {
  const container = document.getElementById('view-epics');
  container.innerHTML = `<h2 style="font-size:16px;font-weight:700;color:#e2e8f0;margin-bottom:20px;">Epics (${STATE.epics.length})</h2>`;

  if (!STATE.epics.length) {
    container.innerHTML += `<p style="color:#4b6282;font-size:13px;">ยังไม่มี Epic — สร้าง Epic ผ่าน Google Sheets (แผ่น Epics)</p>`;
    return;
  }

  STATE.epics.forEach(epic => {
    const epicStories = STATE.stories.filter(s => s.epicId === epic.id);
    const doneCount   = epicStories.filter(s => s.lane === 'done').length;
    const progress    = epicStories.length ? Math.round(doneCount / epicStories.length * 100) : 0;
    const pts         = epicStories.reduce((a,s) => a + (parseInt(s.points)||0), 0);

    const card = document.createElement('div');
    card.style.cssText = 'background:#111827;border:1px solid #1e2a3a;border-radius:12px;padding:20px;margin-bottom:16px;';
    card.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:18px;">⚡</span>
          <span style="font-size:15px;font-weight:700;color:#e2e8f0;">${escHtml(epic.name)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:16px;">
          <span style="font-size:12px;color:#4b6282;">${pts} pts</span>
          <span style="font-size:12px;color:#4b6282;">${doneCount}/${epicStories.length} stories</span>
          <span style="font-size:14px;font-weight:700;color:${progress===100?'#00c896':'#94a3b8'};">${progress}%</span>
        </div>
      </div>
      <div class="progress-bar" style="margin-bottom:12px;">
        <div class="progress-fill" style="width:${progress}%;"></div>
      </div>
      ${epic.description ? `<p style="font-size:12px;color:#4b6282;margin-bottom:12px;">${escHtml(epic.description)}</p>` : ''}
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        ${epicStories.slice(0,6).map(s => `
          <span onclick="openStoryModal('${s.id}')" style="padding:3px 10px;border-radius:20px;font-size:11px;background:#1e2a3a;color:#94a3b8;cursor:pointer;border:1px solid #243447;">${escHtml(s.title.slice(0,30))}${s.title.length>30?'...':''}</span>`).join('')}
        ${epicStories.length > 6 ? `<span style="padding:3px 10px;border-radius:20px;font-size:11px;background:#1e2a3a;color:#4b6282;">+${epicStories.length-6} more</span>` : ''}
      </div>`;
    container.appendChild(card);
  });
}

// ── Members View ───────────────────────────────────
function renderMembers() {
  const container = document.getElementById('view-members');
  container.innerHTML = `<h2 style="font-size:16px;font-weight:700;color:#e2e8f0;margin-bottom:20px;">สมาชิก & สิทธิ์การเข้าถึง (${STATE.members.length} คน)</h2>`;

  const table = document.createElement('div');
  table.style.cssText = 'background:#111827;border:1px solid #1e2a3a;border-radius:12px;overflow:hidden;';
  table.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 180px 120px 100px;gap:0;padding:12px 20px;border-bottom:1px solid #1e2a3a;background:#0d1321;">
      <span style="font-size:11px;font-weight:700;color:#4b6282;text-transform:uppercase;letter-spacing:.06em;">ชื่อ / อีเมล</span>
      <span style="font-size:11px;font-weight:700;color:#4b6282;text-transform:uppercase;letter-spacing:.06em;">อีเมล</span>
      <span style="font-size:11px;font-weight:700;color:#4b6282;text-transform:uppercase;letter-spacing:.06em;">Role</span>
      <span style="font-size:11px;font-weight:700;color:#4b6282;text-transform:uppercase;letter-spacing:.06em;">Stories</span>
    </div>`;

  STATE.members.forEach(m => {
    const storyCount = STATE.stories.filter(s => s.assignee === m.email).length;
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:1fr 180px 120px 100px;gap:0;padding:14px 20px;border-bottom:1px solid #1e2a3a;align-items:center;';
    row.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <div class="avatar" style="background:${avatarColor(m.name||m.email)};color:#0a0e1a;width:28px;height:28px;font-size:10px;">${avatarInitials(m.name||m.email)}</div>
        <span style="font-size:13px;font-weight:500;color:#e2e8f0;">${escHtml(m.name||m.email)}</span>
      </div>
      <span style="font-size:12px;color:#4b6282;">${escHtml(m.email)}</span>
      <span class="badge" style="background:${ROLE_COLORS[m.role]||'#94a3b8'}20;color:${ROLE_COLORS[m.role]||'#94a3b8'};justify-self:start;">${m.role}</span>
      <span style="font-size:12px;color:#94a3b8;">${storyCount}</span>`;
    table.appendChild(row);
  });

  container.appendChild(table);
  container.innerHTML += `<p style="font-size:12px;color:#2d4060;margin-top:16px;">💡 จัดการสมาชิกและสิทธิ์ได้ใน Google Sheets → แผ่น "Members"</p>`;
}

// ── Story Modal ────────────────────────────────────
function openNewStoryModal(defaultLane = 'current') {
  STATE.editingStoryId = null;
  document.getElementById('modal-mode-label').textContent = 'สร้าง Story ใหม่';
  document.getElementById('modal-story-id').textContent = '';
  document.getElementById('modal-title').value = '';
  document.getElementById('modal-desc').value = '';
  document.getElementById('modal-type').value = 'feature';
  document.getElementById('modal-priority').value = 'P2';
  document.getElementById('modal-lane').value = defaultLane;
  document.getElementById('modal-points').value = '0';
  document.getElementById('modal-assignee').value = '';
  document.getElementById('modal-epic').value = '';
  document.getElementById('modal-due').value = '';
  document.getElementById('modal-delete-btn').style.display = 'none';
  document.getElementById('modal-comments-section').style.display = 'none';
  document.getElementById('story-modal').style.display = 'flex';
}

function openStoryModal(storyId) {
  const story = STATE.stories.find(s => s.id === storyId);
  if (!story) return;
  STATE.editingStoryId = storyId;
  document.getElementById('modal-mode-label').textContent = 'แก้ไข Story';
  document.getElementById('modal-story-id').textContent = story.id;
  document.getElementById('modal-title').value = story.title || '';
  document.getElementById('modal-desc').value = story.description || '';
  document.getElementById('modal-type').value = story.type || 'feature';
  document.getElementById('modal-priority').value = story.priority || 'P2';
  document.getElementById('modal-lane').value = story.lane || 'current';
  document.getElementById('modal-points').value = story.points || '0';
  document.getElementById('modal-assignee').value = story.assignee || '';
  document.getElementById('modal-epic').value = story.epicId || '';
  document.getElementById('modal-due').value = story.dueDate || '';

  const canDel = ['Admin','Manager'].includes(STATE.currentUser?.role);
  document.getElementById('modal-delete-btn').style.display = canDel ? 'block' : 'none';
  document.getElementById('modal-comments-section').style.display = 'block';
  renderComments(story.comments || []);
  document.getElementById('story-modal').style.display = 'flex';
}

function closeStoryModal() {
  document.getElementById('story-modal').style.display = 'none';
  STATE.editingStoryId = null;
}

function renderComments(comments) {
  const list = document.getElementById('modal-comments-list');
  list.innerHTML = '';
  (comments || []).forEach(c => {
    const item = document.createElement('div');
    item.style.cssText = 'background:#0d1321;border-radius:8px;padding:8px 12px;';
    item.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <div class="avatar" style="background:${avatarColor(c.author)};color:#0a0e1a;width:18px;height:18px;font-size:8px;">${avatarInitials(c.author)}</div>
        <span style="font-size:11px;font-weight:600;color:#94a3b8;">${escHtml(c.author)}</span>
        <span style="font-size:10px;color:#4b6282;">${formatDate(c.ts)}</span>
      </div>
      <p style="font-size:12px;color:#e2e8f0;line-height:1.5;">${escHtml(c.text)}</p>`;
    list.appendChild(item);
  });
}

async function addComment() {
  const input = document.getElementById('modal-comment-input');
  const text = input.value.trim();
  if (!text || !STATE.editingStoryId) return;
  input.value = '';
  const comment = { author: STATE.currentUser.name || STATE.currentUser.email, text, ts: new Date().toISOString() };
  try {
    await api('addComment', { boardId: STATE.currentBoard, storyId: STATE.editingStoryId, comment });
    const story = STATE.stories.find(s => s.id === STATE.editingStoryId);
    if (story) { story.comments = [...(story.comments||[]), comment]; story.commentCount = (story.commentCount||0)+1; }
    renderComments(story?.comments || []);
    toast('เพิ่ม Comment สำเร็จ', 'success');
  } catch(e) { toast('เกิดข้อผิดพลาด', 'error'); }
}

async function saveStory() {
  const title = document.getElementById('modal-title').value.trim();
  if (!title) { toast('กรุณาใส่ชื่อ Story', 'error'); return; }

  const payload = {
    boardId:     STATE.currentBoard,
    title,
    description: document.getElementById('modal-desc').value.trim(),
    type:        document.getElementById('modal-type').value,
    priority:    document.getElementById('modal-priority').value,
    lane:        document.getElementById('modal-lane').value,
    points:      parseInt(document.getElementById('modal-points').value) || 0,
    assignee:    document.getElementById('modal-assignee').value,
    epicId:      document.getElementById('modal-epic').value,
    dueDate:     document.getElementById('modal-due').value,
  };

  const btn = document.getElementById('modal-save-btn');
  btn.disabled = true; btn.textContent = 'กำลังบันทึก...';
  setLoading(true);

  try {
    if (STATE.editingStoryId) {
      payload.storyId = STATE.editingStoryId;
      const data = await api('updateStory', payload);
      const idx = STATE.stories.findIndex(s => s.id === STATE.editingStoryId);
      if (idx !== -1) STATE.stories[idx] = { ...STATE.stories[idx], ...payload };
      toast('บันทึกสำเร็จ', 'success');
    } else {
      const data = await api('createStory', payload);
      STATE.stories.push(data.story);
      toast('สร้าง Story สำเร็จ', 'success');
    }
    closeStoryModal();
    renderCurrentView();
  } catch(e) { toast(e.message || 'เกิดข้อผิดพลาด', 'error'); }
  finally { btn.disabled = false; btn.textContent = 'บันทึก'; setLoading(false); }
}

async function deleteStory() {
  if (!STATE.editingStoryId) return;
  if (!confirm('ยืนยันการลบ Story นี้?')) return;
  setLoading(true);
  try {
    await api('deleteStory', { boardId: STATE.currentBoard, storyId: STATE.editingStoryId });
    STATE.stories = STATE.stories.filter(s => s.id !== STATE.editingStoryId);
    closeStoryModal();
    renderCurrentView();
    toast('ลบ Story สำเร็จ', 'success');
  } catch(e) { toast(e.message, 'error'); }
  finally { setLoading(false); }
}

// ── Filters ────────────────────────────────────────
function setFilter(key, val) {
  // Toggle
  if (STATE.filters[key] === val) STATE.filters[key] = '';
  else STATE.filters[key] = val;
  filterCards();
  // Update buttons
  document.querySelectorAll(`[data-filter-${key}]`).forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute(`data-filter-${key}`) === STATE.filters[key]);
  });
}

function filterCards() {
  STATE.filters.search   = document.getElementById('search-input').value.trim();
  STATE.filters.assignee = document.getElementById('filter-assignee').value;
  renderCurrentView();
}

function populateAssigneeFilter() {
  const sel = document.getElementById('filter-assignee');
  sel.innerHTML = '<option value="">Assignee: ทั้งหมด</option>';
  STATE.members.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.email;
    opt.textContent = m.name || m.email;
    sel.appendChild(opt);
  });
}

function populateAssigneeSelect() {
  const sel = document.getElementById('modal-assignee');
  sel.innerHTML = '<option value="">— ไม่ระบุ —</option>';
  STATE.members.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.email;
    opt.textContent = m.name || m.email;
    sel.appendChild(opt);
  });
}

function populateEpicSelect() {
  const sel = document.getElementById('modal-epic');
  sel.innerHTML = '<option value="">— ไม่มี Epic —</option>';
  STATE.epics.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.id;
    opt.textContent = e.name;
    sel.appendChild(opt);
  });
}

// ── Profile ────────────────────────────────────────
function openMyProfileModal() {
  const u = STATE.currentUser;
  document.getElementById('profile-avatar-big').textContent = avatarInitials(u.name||u.email);
  document.getElementById('profile-avatar-big').style.background = avatarColor(u.name||u.email);
  document.getElementById('profile-name-big').textContent = u.name || u.email;
  document.getElementById('profile-email-big').textContent = u.email;
  const roleEl = document.getElementById('profile-role-big');
  roleEl.textContent = u.role;
  roleEl.style.background = `${ROLE_COLORS[u.role]||'#94a3b8'}20`;
  roleEl.style.color = ROLE_COLORS[u.role] || '#94a3b8';
  document.getElementById('prof-old-pw').value = '';
  document.getElementById('prof-new-pw').value = '';
  document.getElementById('profile-modal').style.display = 'flex';
}

// ── Modals helpers ─────────────────────────────────
function openNewBoardModal() {
  document.getElementById('new-board-name').value = '';
  document.getElementById('new-board-desc').value = '';
  document.getElementById('board-modal').style.display = 'flex';
}
function closeBoardModal() {
  document.getElementById('board-modal').style.display = 'none';
}

// ── Sync ───────────────────────────────────────────
async function syncData() {
  if (!STATE.currentBoard) { toast('เลือก Board ก่อน', 'info'); return; }
  toast('กำลัง Sync ข้อมูล...', 'info');
  await loadBoard(STATE.currentBoard);
  toast('Sync สำเร็จ', 'success');
}

// ── Bootstrap ─────────────────────────────────────
(function init() {
  if (restoreSession()) {
    initApp();
  } else {
    document.getElementById('auth-screen').style.display = 'flex';
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeStoryModal();
      closeBoardModal();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      document.getElementById('search-input').focus();
    }
  });
})();
