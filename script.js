/* ============================================
   次元互娱活动中心 · script.js
   数据来源：data.json（可由 admin.html 后台更新）
   ============================================ */

'use strict';

// ============================================
// 全局状态
// ============================================
let SITE_DATA = { notice: '', activities: [], todayStar: null };
let currentStatus = 'active';

// 状态标签
const CARD_STATUS_LABEL = {
  active:   '进行中',
  ended:    '已结束',
  upcoming: '即将开始',
};

// ============================================
// 工具函数
// ============================================
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function rand(min, max) { return Math.random() * (max - min) + min; }
function clamp(val, min, max) { return Math.min(Math.max(val, min), max); }

// 把 "2026-07-06" 解析为当天 00:00 的 Date
function parseDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

// 今天 00:00
function today0() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

// ============================================
// 核心：根据日期自动判定活动状态
//   upcoming = 还没开始
//   active   = 进行中（含长期政策）
//   ended    = 已过结束日期
// ============================================
function computeStatus(act) {
  const now   = today0();
  const start = parseDate(act.startDate);
  const end   = parseDate(act.endDate);

  // 长期政策：永远进行中
  if (act.isPermanent) return 'active';

  if (start && now < start) return 'upcoming';
  if (end) {
    // 结束日期当天仍算进行中，次日起归档
    const endPlus = new Date(end);
    endPlus.setDate(endPlus.getDate() + 1);
    if (now >= endPlus) return 'ended';
  }
  return 'active';
}

// ============================================
// 加载数据（优先 data.json，失败则用内置兜底）
// ============================================
async function loadData() {
  try {
    // 加时间戳避免浏览器缓存旧数据
    const res = await fetch(`data.json?t=${Date.now()}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    SITE_DATA = await res.json();
  } catch (err) {
    console.warn('data.json 加载失败，使用兜底空数据：', err);
    SITE_DATA = { notice: '活动数据加载中，请稍后刷新～', activities: [], todayStar: null };
  }
  // 给每个活动计算实时状态
  (SITE_DATA.activities || []).forEach(a => { a.status = computeStatus(a); });
}

// ============================================
// 星空背景
// ============================================
function initStars() {
  const container = $('#stars');
  if (!container) return;
  const COUNT = 120;
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < COUNT; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    const size = rand(1, 3.5);
    s.style.cssText = `
      width:${size}px; height:${size}px;
      left:${rand(0,100)}%; top:${rand(0,100)}%;
      --dur:${rand(2.5,6)}s; --delay:${rand(0,5)}s; --min-op:${rand(0.1,0.35)};
    `;
    fragment.appendChild(s);
  }
  container.appendChild(fragment);
}

// ============================================
// 樱花飘落
// ============================================
function initSakura() {
  const container = document.createElement('div');
  container.className = 'sakura-container';
  document.body.appendChild(container);
  const petals = ['🌸','🌺','✿','❀','🌷'];
  for (let i = 0; i < 18; i++) {
    const s = document.createElement('span');
    s.className = 'sakura';
    s.textContent = petals[Math.floor(rand(0, petals.length))];
    const drift = (rand(0,1) > 0.5 ? 1 : -1) * rand(40, 100);
    s.style.cssText = `
      left:${rand(0,100)}%;
      --size:${rand(12,22)}px;
      --fall-dur:${rand(7,14)}s;
      --fall-delay:${rand(0,12)}s;
      --drift:${drift}px;
    `;
    container.appendChild(s);
  }
}

// ============================================
// 数字滚动动画
// ============================================
function animateCounter(el) {
  const target = parseInt(el.dataset.count, 10);
  const duration = 1800;
  const start = performance.now();
  function step(now) {
    const elapsed = clamp((now - start) / duration, 0, 1);
    const ease = elapsed === 1 ? 1 : 1 - Math.pow(2, -10 * elapsed);
    el.textContent = Math.round(ease * target);
    if (elapsed < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function initCounters() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });
  $$('[data-count]').forEach(el => observer.observe(el));
}

// ============================================
// 烟花粒子特效
// ============================================
function launchFireworks(count = 6) {
  const container = $('#fireworksContainer');
  if (!container) return;
  const colors = ['#FB7299','#a855f7','#22d3ee','#fbbf24','#34d399','#e879f9','#f472b6'];
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const cx = rand(20, 80), cy = rand(20, 70);
      const particleCount = Math.floor(rand(10, 18));
      for (let j = 0; j < particleCount; j++) {
        const p = document.createElement('div');
        p.className = 'firework-particle';
        const size  = rand(4, 9);
        const angle = (j / particleCount) * 360 + rand(-10, 10);
        const dist  = rand(60, 130);
        const rad   = (angle * Math.PI) / 180;
        const dur   = rand(0.6, 1.1);
        const color = colors[Math.floor(rand(0, colors.length))];
        p.style.cssText = `
          width:${size}px; height:${size}px;
          left:${cx}vw; top:${cy}vh;
          background:${color}; box-shadow:0 0 ${size*2}px ${color};
          --tx:${Math.cos(rad)*dist}px; --ty:${Math.sin(rad)*dist}px; --dur:${dur}s;
        `;
        container.appendChild(p);
        setTimeout(() => p.remove(), dur * 1000 + 100);
      }
    }, i * 180);
  }
}

// ============================================
// 活动卡片 HTML 构建
// ============================================
function buildCardHTML(act, index) {
  const statusDotCls = act.status || 'active';
  const statusLabel  = CARD_STATUS_LABEL[act.status] || '';

  const coverContent = act.image
    ? `<img src="${act.image}" alt="${act.type}" class="card-cover-img" />`
    : `<div class="card-cover-emoji">${act.emoji || '🎁'}</div>`;

  return `
    <article class="activity-card ${act.theme || ''}"
             style="animation-delay:${index * 0.08}s"
             data-id="${act.id}">
      <div class="card-cover">
        <div class="card-cover-bg" style="background:${act.coverGradient}"></div>
        ${coverContent}
        <span class="card-type-tag" style="background:${act.typeColor};color:#fff;">
          ${act.type}
        </span>
        <span class="card-status-dot ${statusDotCls}" title="${statusLabel}"></span>
      </div>
      <div class="card-body">
        <h3 class="card-title">${act.title}</h3>
        <p class="card-desc">${act.desc}</p>
        <div class="card-meta">
          <span class="meta-item"><span class="meta-icon">📅</span>${act.dateRange || ''}</span>
          <span class="meta-item"><span class="meta-icon">🎯</span>${act.target || ''}</span>
        </div>
        ${act.reward ? `
        <div class="card-reward">
          <span class="reward-icon">🎁</span>
          <span class="reward-text">${act.reward}</span>
        </div>` : ''}
      </div>
    </article>
  `;
}

// ============================================
// 今日之星模块渲染
// ============================================
function renderTodayStar() {
  const section = $('#todayStarSection');
  if (!section) return;

  const star = SITE_DATA.todayStar;
  // 未启用或无数据 → 隐藏整个模块
  if (!star || !star.enabled || !star.name) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';

  const photoEl = $('#starPhoto');
  const nameEl  = $('#starName');
  const dateEl  = $('#starDate');
  const noteEl  = $('#starNote');
  const tagsEl  = $('#starTags');

  if (photoEl) {
    if (star.photo) {
      photoEl.style.backgroundImage = `url('${star.photo}')`;
      photoEl.classList.remove('no-photo');
      photoEl.textContent = '';
    } else {
      photoEl.style.backgroundImage = '';
      photoEl.classList.add('no-photo');
      photoEl.textContent = '🌟';
    }
  }
  if (nameEl) nameEl.textContent = star.name;
  if (dateEl) dateEl.textContent = star.date ? `${star.date} · 昨日流水冠军` : '昨日流水冠军';
  if (noteEl) noteEl.textContent = star.note || '';

  if (tagsEl) {
    const tags = star.tags || [];
    tagsEl.innerHTML = tags.map(t => `<span class="star-tag">${t}</span>`).join('');
  }
}

// ============================================
// 状态切换：当前活动 / 结束活动
// ============================================
function switchStatus(status) {
  currentStatus = status;

  $$('.switch-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.status === status);
  });

  const acts = (SITE_DATA.activities || []).filter(act => {
    const s = act.status || 'active';
    if (status === 'active') return s === 'active' || s === 'upcoming';
    return s === 'ended';
  });

  const titleEl    = $('#monthTitle');
  const subtitleEl = $('#monthSubtitle');
  if (titleEl)    titleEl.textContent = status === 'active' ? '当前活动' : '结束活动';
  if (subtitleEl) subtitleEl.textContent =
    status === 'active'
      ? `进行中 & 即将开始 · 共 ${acts.length} 项活动`
      : `已结束活动回顾 · 共 ${acts.length} 项活动`;

  // 公告仅在「当前活动」显示
  const noticeEl   = $('#noticeBanner');
  const noticeText = $('#noticeText');
  if (noticeEl && noticeText) {
    if (status === 'active' && SITE_DATA.notice) {
      noticeEl.style.display = '';
      noticeText.textContent = SITE_DATA.notice;
    } else {
      noticeEl.style.display = 'none';
    }
  }

  const gridEl  = $('#activityGrid');
  const emptyEl = $('#emptyState');
  if (!gridEl || !emptyEl) return;

  if (acts.length === 0) {
    gridEl.style.display  = 'none';
    emptyEl.style.display = '';
  } else {
    gridEl.style.display  = '';
    emptyEl.style.display = 'none';
    gridEl.innerHTML = acts.map((a, i) => buildCardHTML(a, i)).join('');
  }

  const mainEl = $('#activityMain');
  if (mainEl && window.scrollY > 200) {
    const top = mainEl.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top, behavior: 'smooth' });
  }

  if (status === 'active') launchFireworks(3);
}

// ============================================
// 主初始化
// ============================================
async function init() {
  initStars();
  initSakura();

  await loadData();       // 先加载数据

  renderTodayStar();      // 今日之星
  switchStatus('active'); // 默认展示当前活动
  initCounters();

  setTimeout(() => launchFireworks(3), 600);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
