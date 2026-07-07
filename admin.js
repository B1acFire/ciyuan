/* ============================================
   次元互娱后台管理 · admin.js
   通过 GitHub API 读写 data.json 和图片
   Token 只存于浏览器本地 localStorage，绝不上传
   ============================================ */

'use strict';

const $  = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];

// ============================================
// 全局状态
// ============================================
const STORE_KEYS = { token: 'ciyuan_gh_token', repo: 'ciyuan_gh_repo' };

let GH = { token: '', owner: '', repo: '' };
let DATA = { notice: '', activities: [], todayStar: null };
let dataSha = null;              // data.json 当前 SHA（更新时必须带上）
let editingIndex = -1;          // 正在编辑的活动索引，-1 表示新增
let pendingActImage = null;     // 待上传的活动图片 {name, base64}
let pendingStarImage = null;    // 待上传的今日之星图片 {name, base64}

// ============================================
// GitHub API 封装
// ============================================
const API = 'https://api.github.com';

function ghHeaders() {
  return {
    'Authorization': `token ${GH.token}`,
    'Accept': 'application/vnd.github.v3+json',
  };
}

// 读取仓库中某文件（返回 {content, sha}）
async function ghGetFile(path) {
  const url = `${API}/repos/${GH.owner}/${GH.repo}/contents/${path}?t=${Date.now()}`;
  const res = await fetch(url, { headers: ghHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`读取 ${path} 失败：${res.status}`);
  const json = await res.json();
  return json;
}

// 写入/更新文件（content 为 UTF-8 字符串或 base64）
async function ghPutFile(path, contentBase64, message, sha) {
  const url = `${API}/repos/${GH.owner}/${GH.repo}/contents/${path}`;
  const body = {
    message: message || `update ${path}`,
    content: contentBase64,
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`写入 ${path} 失败：${res.status} ${err.message || ''}`);
  }
  return res.json();
}

// UTF-8 字符串 → base64（正确处理中文）
function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
// base64 → UTF-8 字符串
function base64ToUtf8(b64) {
  return decodeURIComponent(escape(atob(b64.replace(/\n/g, ''))));
}

// ============================================
// 登录流程
// ============================================
async function doLogin() {
  const token = $('#tokenInput').value.trim();
  const repoStr = $('#repoInput').value.trim();
  const hint = $('#loginHint');

  if (!token) { hint.textContent = '请输入 Token'; hint.className = 'login-hint error'; return; }
  if (!repoStr.includes('/')) { hint.textContent = '仓库格式应为 用户名/仓库名'; hint.className = 'login-hint error'; return; }

  const [owner, repo] = repoStr.split('/');
  GH = { token, owner, repo };

  hint.textContent = '正在验证...'; hint.className = 'login-hint';

  try {
    // 验证 token + 仓库可访问
    const repoRes = await fetch(`${API}/repos/${owner}/${repo}`, { headers: ghHeaders() });
    if (repoRes.status === 401) throw new Error('Token 无效或已过期');
    if (repoRes.status === 404) throw new Error('找不到仓库，请检查用户名/仓库名');
    if (!repoRes.ok) throw new Error('验证失败：' + repoRes.status);

    // 记住
    if ($('#rememberToken').checked) {
      localStorage.setItem(STORE_KEYS.token, token);
      localStorage.setItem(STORE_KEYS.repo, repoStr);
    }

    hint.textContent = '登录成功！'; hint.className = 'login-hint ok';
    await enterAdmin();
  } catch (err) {
    hint.textContent = err.message; hint.className = 'login-hint error';
  }
}

function doLogout() {
  localStorage.removeItem(STORE_KEYS.token);
  localStorage.removeItem(STORE_KEYS.repo);
  location.reload();
}

// 进入后台：加载 data.json
async function enterAdmin() {
  $('#loginOverlay').style.display = 'none';
  $('#adminApp').style.display = '';

  try {
    const file = await ghGetFile('data.json');
    if (file) {
      DATA = JSON.parse(base64ToUtf8(file.content));
      dataSha = file.sha;
    } else {
      // 仓库还没有 data.json，用默认结构
      DATA = { notice: '', activities: [], todayStar: { enabled: false, tags: [] } };
      dataSha = null;
    }
  } catch (err) {
    alert('加载 data.json 失败：' + err.message);
    DATA = { notice: '', activities: [], todayStar: { enabled: false, tags: [] } };
  }

  if (!DATA.todayStar) DATA.todayStar = { enabled: false, tags: [] };
  if (!DATA.activities) DATA.activities = [];

  renderActivityList();
  fillStarForm();
  fillNoticeForm();
}

// ============================================
// 发布：上传图片（如有）→ 更新 data.json
// ============================================
async function publish() {
  const status = $('#saveStatus');
  const btn = $('#publishBtn');
  btn.disabled = true;
  status.textContent = '正在发布...'; status.className = 'save-status saving';

  try {
    // 先同步表单里的公告和今日之星
    collectNoticeForm();
    collectStarForm();

    // 上传待处理的今日之星图片
    if (pendingStarImage) {
      const path = `uploads/${pendingStarImage.name}`;
      await ghPutFile(path, pendingStarImage.base64, `upload star photo ${pendingStarImage.name}`);
      DATA.todayStar.photo = path;
      pendingStarImage = null;
    }

    // 写入 data.json（需要最新 sha）
    const json = JSON.stringify(DATA, null, 2);
    const putRes = await ghPutFile('data.json', utf8ToBase64(json), 'update activities via admin', dataSha);
    dataSha = putRes.content.sha;

    status.textContent = '✓ 已发布，约1-2分钟后前台生效'; status.className = 'save-status saved';
  } catch (err) {
    status.textContent = '发布失败：' + err.message; status.className = 'save-status error';
    alert('发布失败：' + err.message);
  } finally {
    btn.disabled = false;
  }
}

// 读取图片文件 → base64（去掉 data:前缀）
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============================================
// 日期 → 状态判定（与前台一致）
// ============================================
function parseDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function today0() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}
function computeStatus(act) {
  const now = today0();
  const start = parseDate(act.startDate);
  const end = parseDate(act.endDate);
  if (act.isPermanent) return 'active';
  if (start && now < start) return 'upcoming';
  if (end) {
    const endPlus = new Date(end);
    endPlus.setDate(endPlus.getDate() + 1);
    if (now >= endPlus) return 'ended';
  }
  return 'active';
}
const STATUS_LABEL = { active: '进行中', ended: '已结束', upcoming: '即将开始' };

// ============================================
// 活动列表渲染
// ============================================
function renderActivityList() {
  const list = $('#adminActivityList');
  if (!DATA.activities.length) {
    list.innerHTML = `<p style="color:var(--text-mute);text-align:center;padding:40px;">还没有活动，点击右上角「新增活动」开始添加～</p>`;
    return;
  }
  list.innerHTML = DATA.activities.map((act, i) => {
    const st = computeStatus(act);
    const cover = act.image
      ? `<img src="${imgSrc(act.image)}" alt="" />`
      : (act.emoji || '🎁');
    return `
      <div class="admin-activity-item">
        <div class="item-emoji">${cover}</div>
        <div class="item-info">
          <div class="item-title">${act.title || '(未命名)'}</div>
          <div class="item-meta">${act.type || ''} · ${act.dateRange || ''}</div>
        </div>
        <span class="item-status ${st}">${STATUS_LABEL[st]}</span>
        <div class="item-actions">
          <button class="icon-btn" onclick="editActivity(${i})" title="编辑">✏️</button>
          <button class="icon-btn" onclick="moveActivity(${i},-1)" title="上移">↑</button>
          <button class="icon-btn" onclick="moveActivity(${i},1)" title="下移">↓</button>
          <button class="icon-btn danger" onclick="deleteActivity(${i})" title="删除">🗑</button>
        </div>
      </div>
    `;
  }).join('');
}

// 图片预览地址：本地相对路径直接用；仓库路径拼成 raw 地址
function imgSrc(path) {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  // 从仓库读取已上传的图片
  return `https://raw.githubusercontent.com/${GH.owner}/${GH.repo}/main/${path}`;
}

// ============================================
// 活动增删改
// ============================================
function openActivityModal(index) {
  editingIndex = index;
  pendingActImage = null;
  const isEdit = index >= 0;
  $('#modalTitle').textContent = isEdit ? '编辑活动' : '新增活动';

  const a = isEdit ? DATA.activities[index] : {};
  $('#f-title').value     = a.title || '';
  $('#f-type').value      = a.type || '';
  $('#f-desc').value      = a.desc || '';
  $('#f-startDate').value = a.startDate || '';
  $('#f-endDate').value   = a.endDate || '';
  $('#f-permanent').checked = !!a.isPermanent;
  $('#f-dateRange').value = a.dateRange || '';
  $('#f-target').value    = a.target || '';
  $('#f-reward').value    = a.reward || '';
  $('#f-theme').value     = a.theme || 'card-theme-pink';
  $('#f-emoji').value     = a.emoji || '';

  const prev = $('#actImagePreview');
  if (a.image) {
    prev.style.backgroundImage = `url('${imgSrc(a.image)}')`;
    prev.textContent = '';
    prev.dataset.image = a.image;
  } else {
    prev.style.backgroundImage = '';
    prev.textContent = '🎁';
    prev.dataset.image = '';
  }

  $('#activityModal').style.display = '';
}

function closeActivityModal() {
  $('#activityModal').style.display = 'none';
  editingIndex = -1;
  pendingActImage = null;
}

async function saveActivityFromModal() {
  const title = $('#f-title').value.trim();
  const type  = $('#f-type').value.trim();
  const desc  = $('#f-desc').value.trim();
  if (!title || !type || !desc) { alert('请填写标题、类型、描述'); return; }

  // 主题→配色映射
  const themeColor = {
    'card-theme-pink':   'rgba(251,114,153,0.85)',
    'card-theme-purple': 'rgba(168,85,247,0.85)',
    'card-theme-cyan':   'rgba(34,211,238,0.85)',
    'card-theme-gold':   'rgba(251,191,36,0.85)',
    'card-theme-green':  'rgba(52,211,153,0.85)',
  };
  const themeGrad = {
    'card-theme-pink':   'linear-gradient(135deg, #3b0033 0%, #831843 100%)',
    'card-theme-purple': 'linear-gradient(135deg, #1e1b4b 0%, #4c1d95 100%)',
    'card-theme-cyan':   'linear-gradient(135deg, #0c1a2e 0%, #1e3a5f 100%)',
    'card-theme-gold':   'linear-gradient(135deg, #1c1100 0%, #78350f 100%)',
    'card-theme-green':  'linear-gradient(135deg, #022c22 0%, #064e3b 100%)',
  };
  const theme = $('#f-theme').value;

  // 处理图片：新上传优先
  let image = $('#actImagePreview').dataset.image || '';
  if (pendingActImage) {
    // 发布时统一上传，这里先存到 DATA 里等 publish 处理
    // 简化：立即上传
    try {
      const path = `uploads/${pendingActImage.name}`;
      await ghPutFile(path, pendingActImage.base64, `upload activity image ${pendingActImage.name}`);
      image = path;
    } catch (err) {
      alert('图片上传失败：' + err.message);
      return;
    }
    pendingActImage = null;
  }

  const act = {
    id: (editingIndex >= 0 && DATA.activities[editingIndex].id) || 'act-' + Date.now(),
    type, title, desc,
    typeColor: themeColor[theme],
    theme,
    emoji: $('#f-emoji').value.trim() || '🎁',
    image,
    coverGradient: themeGrad[theme],
    startDate: $('#f-startDate').value,
    endDate:   $('#f-permanent').checked ? '' : $('#f-endDate').value,
    isPermanent: $('#f-permanent').checked,
    dateRange: $('#f-dateRange').value.trim(),
    target:    $('#f-target').value.trim(),
    reward:    $('#f-reward').value.trim(),
  };

  if (editingIndex >= 0) {
    DATA.activities[editingIndex] = act;
  } else {
    DATA.activities.push(act);
  }
  closeActivityModal();
  renderActivityList();
  $('#saveStatus').textContent = '有未发布的改动，记得点「发布到网站」';
  $('#saveStatus').className = 'save-status';
}

function editActivity(i) { openActivityModal(i); }

function deleteActivity(i) {
  if (!confirm(`确定删除活动「${DATA.activities[i].title}」吗？`)) return;
  DATA.activities.splice(i, 1);
  renderActivityList();
  $('#saveStatus').textContent = '有未发布的改动，记得点「发布到网站」';
}

function moveActivity(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= DATA.activities.length) return;
  [DATA.activities[i], DATA.activities[j]] = [DATA.activities[j], DATA.activities[i]];
  renderActivityList();
}

// ============================================
// 今日之星表单
// ============================================
function fillStarForm() {
  const s = DATA.todayStar || {};
  $('#starEnabled').checked = !!s.enabled;
  $('#starNameInput').value = s.name || '';
  $('#starDateInput').value = s.date || '';
  $('#starNoteInput').value = s.note || '';
  $('#starTagsInput').value = (s.tags || []).join(', ');
  const prev = $('#starPhotoPreview');
  if (s.photo) {
    prev.style.backgroundImage = `url('${imgSrc(s.photo)}')`;
    prev.textContent = '';
  } else {
    prev.style.backgroundImage = '';
    prev.textContent = '🌟';
  }
}

function collectStarForm() {
  DATA.todayStar = {
    enabled: $('#starEnabled').checked,
    name: $('#starNameInput').value.trim(),
    date: $('#starDateInput').value,
    photo: DATA.todayStar.photo || '',
    note: $('#starNoteInput').value.trim(),
    tags: $('#starTagsInput').value.split(',').map(t => t.trim()).filter(Boolean),
  };
}

// ============================================
// 公告表单
// ============================================
function fillNoticeForm()   { $('#noticeInput').value = DATA.notice || ''; }
function collectNoticeForm() { DATA.notice = $('#noticeInput').value.trim(); }

// ============================================
// 事件绑定
// ============================================
function bindEvents() {
  // 登录
  $('#loginBtn').addEventListener('click', doLogin);
  $('#tokenInput').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  $('#logoutBtn').addEventListener('click', doLogout);
  $('#publishBtn').addEventListener('click', publish);

  // Tab 切换
  $$('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.admin-tab').forEach(t => t.classList.remove('active'));
      $$('.panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      $('#panel-' + tab.dataset.panel).classList.add('active');
    });
  });

  // 活动弹窗
  $('#addActivityBtn').addEventListener('click', () => openActivityModal(-1));
  $('#modalClose').addEventListener('click', closeActivityModal);
  $('#modalCancel').addEventListener('click', closeActivityModal);
  $('#modalSave').addEventListener('click', saveActivityFromModal);

  // 长期政策勾选 → 禁用结束日期
  $('#f-permanent').addEventListener('change', e => {
    $('#f-endDate').disabled = e.target.checked;
    if (e.target.checked) $('#f-endDate').value = '';
  });

  // 活动图片上传
  $('#actImageBtn').addEventListener('click', () => $('#actImageFile').click());
  $('#actImageFile').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const b64 = await fileToBase64(file);
    const ext = file.name.split('.').pop();
    pendingActImage = { name: `act-${Date.now()}.${ext}`, base64: b64 };
    const prev = $('#actImagePreview');
    prev.style.backgroundImage = `url('data:${file.type};base64,${b64}')`;
    prev.textContent = '';
  });
  $('#actImageClear').addEventListener('click', () => {
    pendingActImage = null;
    const prev = $('#actImagePreview');
    prev.style.backgroundImage = '';
    prev.textContent = '🎁';
    prev.dataset.image = '';
  });

  // 今日之星图片上传
  $('#starPhotoBtn').addEventListener('click', () => $('#starPhotoFile').click());
  $('#starPhotoFile').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const b64 = await fileToBase64(file);
    const ext = file.name.split('.').pop();
    pendingStarImage = { name: `star-${Date.now()}.${ext}`, base64: b64 };
    const prev = $('#starPhotoPreview');
    prev.style.backgroundImage = `url('data:${file.type};base64,${b64}')`;
    prev.textContent = '';
  });
}

// 暴露给 onclick 使用
window.editActivity   = editActivity;
window.deleteActivity = deleteActivity;
window.moveActivity   = moveActivity;

// ============================================
// 启动：自动登录（如已记住）
// ============================================
function boot() {
  bindEvents();
  const savedToken = localStorage.getItem(STORE_KEYS.token);
  const savedRepo  = localStorage.getItem(STORE_KEYS.repo);
  if (savedToken && savedRepo) {
    $('#tokenInput').value = savedToken;
    $('#repoInput').value  = savedRepo;
    doLogin();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
