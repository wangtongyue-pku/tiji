'use strict';

/* ==========================================================================
   题迹 · 前端
   ========================================================================== */

const TYPE_LABEL = { bug: '代码 bug', misconception: '错误思路', gap: '知识薄弱点', concept: '概念巩固' };
const STATUS_LABEL = { new: '未开始', learning: '在学', mastered: '已掌握' };
const GRADES = [
  { grade: 1, label: '忘了' },
  { grade: 3, label: '模糊' },
  { grade: 4, label: '记得' },
  { grade: 5, label: '熟练' },
];

const app = document.getElementById('app');
const overlay = document.getElementById('overlay');
const toastEl = document.getElementById('toast');

const state = {
  snap: null,
  error: null,
  route: parseHash(),
  filters: { q: '', type: 'all', topic: 'all', status: 'all' },
  pf: { status: 'all', topic: 'all' },
  modal: null,
  revealed: new Set(),
  showToken: false,
  lastMutation: 0,
  busy: false,
};

/* ------------------------------- 工具 ------------------------------- */

const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const attr = (s) => esc(s).replace(/\n/g, '&#10;');

function stars(n) {
  const v = Math.max(1, Math.min(5, Number(n) || 1));
  return `<span class="stars" title="难度 ${v}/5">${'★'.repeat(v)}${'☆'.repeat(5 - v)}</span>`;
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function relTime(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  if (diff < 0) {
    const days = Math.ceil(-diff / 86400000);
    return days <= 1 ? '今天待复习' : `${days} 天后复习`;
  }
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 86400000 * 30) return `${Math.floor(diff / 86400000)} 天前`;
  return fmtDate(iso);
}

function nextReview(rev) {
  if (!rev || !rev.next_at) return '—';
  const t = new Date(rev.next_at).getTime();
  if (Number.isNaN(t)) return '—';
  if (t <= Date.now()) return '现在就该复习';
  const days = Math.ceil((t - Date.now()) / 86400000);
  return days <= 1 ? '明天' : `${days} 天后`;
}

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const parts = (pathPart || '').split('/').filter(Boolean);
  const name = parts[0] || 'overview';
  const id = parts[1] ? decodeURIComponent(parts[1]) : null;
  let query = {};
  try {
    query = Object.fromEntries(new URLSearchParams(queryPart || ''));
  } catch {}
  return { name, id, query };
}

function toast(msg, isError) {
  toastEl.textContent = msg;
  toastEl.className = `toast show${isError ? ' err' : ''}`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    toastEl.className = 'toast';
  }, 2400);
}

async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    toast(label || '已复制');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast(label || '已复制');
    } catch {
      toast('复制失败，请手动选择', true);
    }
    document.body.removeChild(ta);
  }
}

/* ------------------------------- API ------------------------------- */

async function request(method, path, body) {
  if (method !== 'GET') state.lastMutation = Date.now();
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json; charset=utf-8' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  if (!res.ok || (json && json.ok === false)) {
    const msg = (json && json.error && json.error.message) || `请求失败（${res.status}）`;
    throw new Error(msg);
  }
  return json ? json.data : null;
}

async function loadSnapshot() {
  state.snap = await request('GET', '/api/snapshot');
}

/* ------------------------------- 主题 ------------------------------- */

function theme() {
  const saved = localStorage.getItem('tiji-theme') || 'auto';
  if (saved === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return saved;
}

function applyTheme() {
  document.documentElement.dataset.theme = theme();
}

function toggleTheme() {
  const next = theme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem('tiji-theme', next);
  applyTheme();
  toast(next === 'dark' ? '已切换深色模式' : '已切换浅色模式');
}

/* ------------------------------- 图标 ------------------------------- */

const I = {
  logo: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 8h14M12 8v9" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`,
  home: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1v-8.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
  layers: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="m12 4 8 4.5-8 4.5-8-4.5L12 4Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m4 12.5 8 4.5 8-4.5M4 17l8 4.5L20 17" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
  map: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M4 6.5 9 4l6 2.5L20 4v13.5L15 20l-6-2.5L4 20V6.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 4v13.5M15 6.5V20" stroke="currentColor" stroke-width="1.7"/></svg>`,
  target: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="3.2" stroke="currentColor" stroke-width="1.7"/></svg>`,
  plug: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0V8Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 17v4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  gear: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.36a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.64 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.64a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.36 9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  plus: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  search: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.8"/><path d="m16 16 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  close: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  edit: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
  trash: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
  copy: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" stroke="currentColor" stroke-width="1.7"/></svg>`,
  arrow: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  check: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

/* ------------------------------- 渲染入口 ------------------------------- */

function render() {
  if (!state.snap) {
    app.innerHTML = `<div class="skeleton">${state.error ? `加载失败：${esc(state.error)}` : '正在加载…'}</div>`;
    return;
  }
  const views = {
    overview: viewOverview,
    entries: viewEntries,
    topics: viewTopics,
    practice: viewPractice,
    ai: viewAi,
    settings: viewSettings,
  };
  const view = views[state.route.name] || viewOverview;
  const errs = state.snap.meta.parse_errors || [];
  const banner = errs.length
    ? `<div class="file-error">
        <strong>有 ${errs.length} 个文件没读懂</strong>
        ${errs.slice(0, 3).map((e) => `<div class="mono">${esc(e.file)}：${esc(e.message)}</div>`).join('')}
        <button class="btn sm ghost" data-act="rescan">重新扫描</button>
        <button class="btn sm ghost" data-act="nav" data-to="ai">看格式说明</button>
      </div>`
    : '';
  const y = window.scrollY;
  app.innerHTML = `${sidebar()}<main class="main">${banner}${view()}</main>`;
  renderOverlay();
  if (y) window.scrollTo(0, y);
}

function sidebar() {
  const s = state.snap.stats;
  const items = [
    ['overview', '概览', I.home, null],
    ['entries', '题库', I.layers, s.total],
    ['topics', '知识地图', I.map, state.snap.topics.length],
    ['practice', '练习', I.target, s.practice.todo || null],
    ['ai', 'AI 接入', I.plug, null],
    ['settings', '设置', I.gear, null],
  ];
  const active = state.route.name === 'entries' && state.route.id ? 'entries' : state.route.name;
  return `
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-mark">${I.logo}</div>
      <div>
        <div class="brand-name">题迹</div>
        <div class="brand-sub">AI 问答学习库</div>
      </div>
    </div>
    <nav class="nav">
      ${items
        .map(
          ([name, label, icon, count]) => `
        <button class="nav-item ${active === name ? 'active' : ''}" data-act="nav" data-to="${name}">
          ${icon}<span>${label}</span>${count ? `<span class="nav-count">${count}</span>` : ''}
        </button>`
        )
        .join('')}
    </nav>
    <div class="sidebar-foot">
      ${state.snap.profile.name} · 连续 ${state.snap.stats.streak} 天<br />
      共 ${s.total} 条记录 · ${s.masteryRate}% 已掌握
    </div>
  </aside>`;
}

/* ------------------------------- 概览 ------------------------------- */

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

function heatmap(daily, max) {
  const level = (c) => (c === 0 ? 0 : c === 1 ? 1 : c === 2 ? 2 : c <= 4 ? 3 : 4);
  const cells = daily
    .map((d) => `<div class="heat-cell" data-level="${level(d.count)}" title="${d.date} · ${d.count} 次"></div>`)
    .join('');
  const labels = ['一', '', '三', '', '五', '', '日'].map((l) => `<span>${l}</span>`).join('');
  return `
    <div class="heat-wrap">
      <div class="heat-days">${labels}</div>
      <div class="heat-grid">${cells}</div>
    </div>
    <div class="heat-foot">
      <span>最近 12 周 · 本周 ${state.snap.stats.thisWeek} 次</span>
      <div class="heat-legend">
        <span class="small muted">少</span>
        ${[0, 1, 2, 3, 4].map((l) => `<i data-level="${l}" style="background:${
          l === 0 ? 'var(--panel-3)' : `color-mix(in srgb, var(--brand) ${[26, 48, 70, 100][l - 1]}%, var(--panel-3))`
        }"></i>`).join('')}
        <span class="small muted">多</span>
      </div>
    </div>`;
}

function viewOverview() {
  const s = state.snap.stats;
  const p = state.snap.profile;
  const recent = state.snap.entries.slice(0, 5);
  const weak = s.weakTopics.filter((t) => t.unresolved > 0).slice(0, 5);
  const maxWeak = weak.length ? Math.max(...weak.map((w) => w.score)) : 1;
  const byType = s.byType;
  const typeLine = ['bug', 'misconception', 'gap', 'concept']
    .map((t) => (byType[t] ? `${TYPE_LABEL[t]} ${byType[t]}` : ''))
    .filter(Boolean)
    .join(' · ');

  const suggestion = (() => {
    if (!s.total) return { text: '还没有记录。把最近问过 AI 的一个问题存进来试试。', act: 'new-entry', label: '记录第一个问题' };
    if (s.dueCount > 0) return { text: `有 ${s.dueCount} 条到了复习时间，趁热过一遍比重新学一遍省力。`, act: 'go-practice', label: '去复习' };
    if (weak.length) return { text: `当前最薄弱的是「${weak[0].name}」，建议先做 1 道相关练习。`, act: 'go-topic-practice', topic: weak[0].name, label: '去练习' };
    return { text: '掌握得不错了，记一个新问题继续扩充题库。', act: 'new-entry', label: '记新问题' };
  })();

  return `
  <div class="page-head">
    <div>
      <h1>${greeting()}，${esc(p.name)}</h1>
      <div class="sub">${new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })} · 今天目标 ${s.dailyTarget} 条</div>
    </div>
    <div class="row">
      <button class="btn" data-act="go-practice">开始练习</button>
      <button class="btn primary" data-act="new-entry">${I.plus} 记录新问题</button>
    </div>
  </div>

  <div class="stat-grid">
    <div class="stat">
      <div class="k">问题总数</div>
      <div class="v">${s.total}<small>条</small></div>
      <div class="f">${typeLine || '还没有分类'}</div>
    </div>
    <div class="stat">
      <div class="k">掌握率</div>
      <div class="v">${s.masteryRate}<small>%</small></div>
      <div class="mini-bar"><i style="width:${s.masteryRate}%"></i></div>
      <div class="f">${s.mastered} 条已掌握 · ${s.unresolved} 条待巩固</div>
    </div>
    <div class="stat">
      <div class="k">今日待复习</div>
      <div class="v">${s.dueCount}<small>条</small></div>
      <div class="f">${s.streak ? `已连续记录 ${s.streak} 天` : '今天还没记录'}</div>
    </div>
    <div class="stat">
      <div class="k">练习正确率</div>
      <div class="v">${s.practice.accuracy}<small>%</small></div>
      <div class="mini-bar"><i style="width:${s.practice.accuracy}%"></i></div>
      <div class="f">${s.practice.done}/${s.practice.total} 题已做 · 共作答 ${s.practice.attempts} 次</div>
    </div>
  </div>

  <div class="card" style="margin-bottom:16px;background:var(--brand-softer);border-color:color-mix(in srgb,var(--brand) 18%,transparent)">
    <div class="card-body" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div style="flex:1;min-width:220px">
        <div style="font-weight:650;font-size:13.5px;color:var(--brand)">下一步建议</div>
        <div class="small" style="color:var(--text-2);margin-top:2px">${esc(suggestion.text)}</div>
      </div>
      <button class="btn sm" data-act="${suggestion.act}" ${suggestion.topic ? `data-topic="${attr(suggestion.topic)}"` : ''}>${suggestion.label} ${I.arrow}</button>
    </div>
  </div>

  <div class="grid-2" style="margin-bottom:16px">
    <section class="card">
      <div class="card-head"><h2>学习节奏</h2><span class="small muted">每天有没有碰一点</span></div>
      <div class="card-body">
        ${heatmap(s.daily, s.maxDaily)}
        <div class="grid-3" style="margin-top:16px;gap:8px">
          <div style="padding:8px 10px;border-radius:10px;background:var(--panel-2)">
            <div class="small muted">本周新增</div>
            <div style="font-weight:650;font-size:15px">${s.week.created} 条</div>
          </div>
          <div style="padding:8px 10px;border-radius:10px;background:var(--panel-2)">
            <div class="small muted">本周复习</div>
            <div style="font-weight:650;font-size:15px">${s.week.review} 次</div>
          </div>
          <div style="padding:8px 10px;border-radius:10px;background:var(--panel-2)">
            <div class="small muted">本周练习</div>
            <div style="font-weight:650;font-size:15px">${s.week.attempt} 次</div>
          </div>
        </div>
      </div>
    </section>
    <section class="card">
      <div class="card-head"><h2>最薄弱的知识点</h2><span class="small muted">按重复次数 × 难度加权</span></div>
      <div class="card-body">
        ${
          weak.length
            ? weak
                .map(
                  (t) => `
          <div class="weak-row" data-act="filter-topic" data-topic="${attr(t.name)}">
            <div class="weak-name">${esc(t.name)}</div>
            <div class="weak-meta">${t.unresolved} 条待巩固 · ${t.mastered}/${t.total} 已掌握</div>
            <div class="weak-bar"><i style="width:${Math.round((t.score / maxWeak) * 100)}%"></i></div>
          </div>`
                )
                .join('')
            : `<div class="empty" style="padding:26px"><strong>没有明显短板</strong>继续保持</div>`
        }
      </div>
    </section>
  </div>

  <div class="grid-2">
    <section class="card">
      <div class="card-head"><h2>最近更新</h2><button class="btn sm ghost" data-act="nav" data-to="entries">全部 ${I.arrow}</button></div>
      <div class="card-body" style="padding-top:8px">
        ${
          recent.length
            ? recent
                .map(
                  (e) => `
          <div class="weak-row" data-act="open-entry" data-id="${e.id}">
            <div class="weak-name" style="display:flex;gap:8px;align-items:center">
              <span class="badge ${e.type}">${TYPE_LABEL[e.type] || e.type}</span>
              <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.title)}</span>
            </div>
            <div class="weak-meta">${relTime(e.updated_at)}</div>
          </div>`
                )
                .join('')
            : `<div class="empty" style="padding:26px"><strong>还没有记录</strong>点右上角「记录新问题」开始</div>`
        }
      </div>
    </section>
    <section class="card">
      <div class="card-head"><h2>今日待复习</h2><span class="small muted">间隔重复</span></div>
      <div class="card-body" style="padding-top:8px">
        ${
          s.dueEntries.length
            ? s.dueEntries
                .map(
                  (e) => `
          <div class="weak-row" data-act="open-entry" data-id="${e.id}">
            <div class="weak-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.title)}</div>
            <div class="weak-meta">${esc(e.topic || '')}</div>
          </div>`
                )
                .join('')
            : `<div class="empty" style="padding:26px"><strong>今天没有待复习</strong>去记点新东西吧</div>`
        }
      </div>
    </section>
  </div>`;
}

/* ------------------------------- 题库 ------------------------------- */

function filteredEntries() {
  const f = state.filters;
  const q = f.q.trim().toLowerCase();
  return state.snap.entries.filter((e) => {
    if (f.type !== 'all' && e.type !== f.type) return false;
    if (f.topic !== 'all' && e.topic !== f.topic) return false;
    if (f.status !== 'all' && e.status !== f.status) return false;
    if (q) {
      const hay = [e.title, e.question, e.root_cause, e.solution, e.takeaway, e.topic, (e.tags || []).join(' ')].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function entryCard(e) {
  return `
  <article class="entry-card" data-act="open-entry" data-id="${e.id}">
    <div class="entry-top">
      <span class="badge ${e.type}">${TYPE_LABEL[e.type] || e.type}</span>
      <span class="topic">${esc(e.topic || '未分类')}</span>
      <span class="sep"></span>
      <span>${relTime(e.updated_at)}</span>
      <span class="spacer"></span>
      ${stars(e.difficulty)}
    </div>
    <h3>${esc(e.title)}</h3>
    ${e.question ? `<p class="entry-q">${esc(e.question)}</p>` : e.takeaway ? `<p class="entry-q">${esc(e.takeaway)}</p>` : ''}
    <div class="entry-foot">
      ${(e.tags || []).slice(0, 3).map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}
      ${e.occurrences > 1 ? `<span class="tag" style="color:var(--red);background:var(--red-soft)">踩坑 ${e.occurrences} 次</span>` : ''}
      <span class="spacer"></span>
      <span class="badge status-${e.status}">${STATUS_LABEL[e.status] || e.status}</span>
    </div>
  </article>`;
}

function entryCards() {
  const list = filteredEntries();
  if (!list.length) {
    return `<div class="empty" style="grid-column:1/-1"><strong>没有匹配的记录</strong>换个筛选条件，或者记录一个新问题</div>`;
  }
  return list.map(entryCard).join('');
}

function viewEntries() {
  const counts = state.snap.stats.byType;
  const topics = state.snap.topics.map((t) => t.name);
  const list = filteredEntries();
  return `
  <div class="page-head">
    <div>
      <h1>题库</h1>
      <div class="sub">每一条都是一次「以为自己会了」的现场 · <span id="entry-count">${list.length}</span> 条</div>
    </div>
    <button class="btn primary" data-act="new-entry">${I.plus} 记录新问题</button>
  </div>

  <div class="toolbar">
    <div class="search">
      ${I.search}
      <input class="input" id="entry-search" placeholder="搜索标题、问题、错因、标签…" value="${attr(state.filters.q)}" />
    </div>
    <div class="chips">
      <button class="chip ${state.filters.type === 'all' ? 'active' : ''}" data-act="filter-type" data-value="all">全部 ${state.snap.entries.length}</button>
      ${['bug', 'misconception', 'gap', 'concept']
        .map(
          (t) =>
            `<button class="chip ${state.filters.type === t ? 'active' : ''}" data-act="filter-type" data-value="${t}">${TYPE_LABEL[t]} ${counts[t] || 0}</button>`
        )
        .join('')}
    </div>
    <select class="select" id="filter-topic">
      <option value="all">全部主题</option>
      ${topics.map((t) => `<option value="${attr(t)}" ${state.filters.topic === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
    </select>
    <select class="select" id="filter-status">
      <option value="all" ${state.filters.status === 'all' ? 'selected' : ''}>全部状态</option>
      <option value="new" ${state.filters.status === 'new' ? 'selected' : ''}>未开始</option>
      <option value="learning" ${state.filters.status === 'learning' ? 'selected' : ''}>在学</option>
      <option value="mastered" ${state.filters.status === 'mastered' ? 'selected' : ''}>已掌握</option>
    </select>
  </div>

  <div class="entry-list" id="entry-list">${entryCards()}</div>`;
}

/* ------------------------------- 抽屉 ------------------------------- */

function drawerFor(entry) {
  if (!entry) return '';
  const rel = state.snap.practice.filter((p) => p.entry_id === entry.id);
  const codeBlock = (text, cls, head) =>
    text ? `<div class="code-head">${head}</div><pre class="code ${cls}">${esc(text)}</pre>` : '';

  const section = (title, text, cls) => (text ? `<div class="section"><h4>${title}</h4><p class="${cls || ''}">${esc(text)}</p></div>` : '');

  return `
  <div class="scrim show" data-act="close-entry"></div>
  <aside class="drawer show">
    <div class="drawer-head">
      <div class="row">
        <span class="badge ${entry.type}">${TYPE_LABEL[entry.type] || entry.type}</span>
        <span class="badge soft">${esc(entry.topic || '未分类')}</span>
        <span class="spacer"></span>
        <button class="icon-btn" data-act="close-entry" title="关闭">${I.close}</button>
      </div>
      <h2>${esc(entry.title)}</h2>
      <div class="detail-meta">
        <span class="badge status-${entry.status}">${STATUS_LABEL[entry.status]}</span>
        ${stars(entry.difficulty)}
        ${entry.occurrences > 1 ? `<span style="color:var(--red)">踩坑 ${entry.occurrences} 次</span>` : ''}
        <span class="sep"></span>
        <span>${relTime(entry.updated_at)}</span>
        ${entry.source ? `<span class="sep"></span><span>${esc(entry.source)}</span>` : ''}
      </div>
    </div>
    <div class="drawer-body">
      ${section('原始问题', entry.question)}
      ${section('当时的思路（错在哪）', entry.my_attempt, 'quote')}
      ${section('真正的错因', entry.root_cause)}
      ${section('正确解法', entry.solution)}
      ${entry.code_before ? codeBlock(entry.code_before, 'bad', `原始代码${entry.language ? ` · ${esc(entry.language)}` : ''}`) : ''}
      ${entry.code_after ? codeBlock(entry.code_after, 'good', '修正后') : ''}
      ${entry.takeaway ? `<div class="takeaway">💡 ${esc(entry.takeaway)}</div>` : ''}

      ${
        rel.length
          ? `<div class="section"><h4>配套练习 ${rel.length}</h4>
             ${rel
               .map(
                 (p) => `<div class="row" style="padding:5px 0;font-size:13px;gap:8px">
                   <span class="badge ${p.kind === 'math' ? 'gap' : 'concept'}">${p.kind === 'math' ? '数学' : '代码'}</span>
                   <span style="color:var(--text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.prompt.split('\n')[0])}</span>
                 </div>`
               )
               .join('')}
             <button class="btn sm" style="margin-top:8px" data-act="go-topic-practice" data-topic="${attr(entry.topic)}">去练习</button>
           </div>`
          : ''
      }

      <div class="section">
        <h4>复习一下</h4>
        <div class="row" style="flex-wrap:wrap;gap:6px">
          ${GRADES.map((g) => `<button class="btn sm" data-act="review" data-id="${entry.id}" data-grade="${g.grade}">${g.label}</button>`).join('')}
        </div>
        <div class="small muted" style="margin-top:6px">上次复习 ${entry.review && entry.review.last_at ? relTime(entry.review.last_at) : '从未'} · 下次 ${nextReview(entry.review)}</div>
      </div>
      ${entry.file ? `<div class="small muted" style="margin-top:14px">源文件：<span class="mono">${esc(entry.file)}</span></div>` : ''}

      <div class="drawer-actions">
        ${entry.status !== 'mastered' ? `<button class="btn" data-act="master" data-id="${entry.id}">${I.check} 标记为已掌握</button>` : `<button class="btn" data-act="master" data-id="${entry.id}">取消已掌握</button>`}
        <button class="btn" data-act="edit-entry" data-id="${entry.id}">${I.edit} 编辑</button>
        <span class="spacer"></span>
        <button class="btn danger" data-act="delete-entry" data-id="${entry.id}">${I.trash} 删除</button>
      </div>
    </div>
  </aside>`;
}

/* ------------------------------- 知识地图 ------------------------------- */

function viewTopics() {
  const topics = state.snap.topics;
  if (!topics.length) {
    return `<div class="empty"><strong>还没有知识主题</strong>记录条目后会自动生成</div>`;
  }
  return `
  <div class="page-head">
    <div>
      <h1>知识地图</h1>
      <div class="sub">按主题汇总：共性错因、一句话心法、待补的练习</div>
    </div>
  </div>
  <div class="topic-grid">
    ${topics
      .map((t) => {
        const entries = state.snap.entries.filter((e) => e.topic === t.name);
        const practices = state.snap.practice.filter((p) => p.topic === t.name);
        const progress = t.total ? Math.round((t.mastered / t.total) * 100) : 0;
        const takeaway = entries.map((e) => e.takeaway).filter(Boolean)[0];
        const sum = entries.reduce((acc, e) => acc + (e.occurrences || 1) - 1, 0);
        return `
        <section class="topic-card" style="--tc:${esc(t.color || '#6366f1')}" id="topic-${encodeURIComponent(t.name)}">
          <div class="topic-head">
            <div class="topic-name">${esc(t.name)}</div>
            <div class="ring">
              <svg width="42" height="42" viewBox="0 0 42 42">
                <circle cx="21" cy="21" r="17" fill="none" stroke="var(--panel-3)" stroke-width="4"/>
                <circle cx="21" cy="21" r="17" fill="none" stroke="${esc(t.color || '#6366f1')}" stroke-width="4"
                  stroke-linecap="round" stroke-dasharray="${(progress / 100) * 106.8} 106.8"/>
              </svg>
              <span>${progress}%</span>
            </div>
          </div>
          ${t.summary ? `<p class="topic-summary">${esc(t.summary)}</p>` : `<p class="topic-summary muted">还没有总结。可以让 ChatGPT 归纳，或点「编辑」自己写。</p>`}
          ${
            (t.key_points || []).length
              ? `<div class="kv-title">要点</div><ul class="tight">${t.key_points.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>`
              : ''
          }
          ${
            (t.pitfalls || []).length
              ? `<div class="kv-title">常犯的坑</div><ul class="tight">${t.pitfalls.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>`
              : ''
          }
          ${takeaway ? `<div class="takeaway" style="margin-top:12px;font-size:12.5px">💡 ${esc(takeaway)}</div>` : ''}
          <div class="kv-title">相关条目 · ${entries.length} 条待巩固 ${t.unresolved}</div>
          <div class="pill-list">
            ${entries
              .slice(0, 6)
              .map((e) => `<span class="pill" data-act="open-entry" data-id="${e.id}">${esc(e.title.length > 16 ? e.title.slice(0, 16) + '…' : e.title)}</span>`)
              .join('')}
            ${entries.length > 6 ? `<span class="pill">+${entries.length - 6}</span>` : ''}
          </div>
          <div class="row" style="margin-top:14px;gap:8px">
            <button class="btn sm" data-act="edit-topic" data-name="${attr(t.name)}">${I.edit} 编辑总结</button>
            ${
              practices.length
                ? `<button class="btn sm" data-act="go-topic-practice" data-topic="${attr(t.name)}">练习 ${practices.filter((p) => p.status !== 'done').length} 道待做</button>`
                : `<button class="btn sm" data-act="nav" data-to="ai">让 AI 出题</button>`
            }
            ${sum > 0 ? `<span class="small" style="color:var(--red)">重复踩坑 ${sum} 次</span>` : ''}
          </div>
        </section>`;
      })
      .join('')}
  </div>`;
}

/* ------------------------------- 练习 ------------------------------- */

function viewPractice() {
  const all = state.snap.practice;
  const topics = [...new Set(all.map((p) => p.topic))];
  const list = all.filter((p) => {
    if (state.pf.status !== 'all' && p.status !== state.pf.status) return false;
    if (state.pf.topic !== 'all' && p.topic !== state.pf.topic) return false;
    return true;
  });
  const done = all.filter((p) => p.status === 'done').length;

  return `
  <div class="page-head">
    <div>
      <h1>补充练习</h1>
      <div class="sub">已做 ${done}/${all.length} 题 · 作答记录会自动影响对应条目的复习进度</div>
    </div>
    <button class="btn" data-act="nav" data-to="ai">让 ChatGPT 加题</button>
  </div>

  <div class="toolbar">
    <div class="chips">
      ${[
        ['all', '全部'],
        ['todo', '待做'],
        ['done', '已完成'],
      ]
        .map(([v, l]) => `<button class="chip ${state.pf.status === v ? 'active' : ''}" data-act="pf-status" data-value="${v}">${l}</button>`)
        .join('')}
    </div>
    <select class="select" id="pf-topic">
      <option value="all">全部主题</option>
      ${topics.map((t) => `<option value="${attr(t)}" ${state.pf.topic === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
    </select>
  </div>

  ${
    list.length
      ? `<div class="practice-grid">${list.map(practiceCard).join('')}</div>`
      : `<div class="empty"><strong>这里还没有练习</strong>在 AI 接入页让 ChatGPT 针对薄弱点出几道题</div>`
  }`;
}

function practiceCard(p) {
  const shown = state.revealed.has(p.id);
  return `
  <article class="practice-card ${p.status === 'done' ? 'done' : ''}">
    <div class="row">
      <span class="badge ${p.kind === 'math' ? 'gap' : 'concept'}">${p.kind === 'math' ? '数学' : '代码'}</span>
      <span class="small muted">${esc(p.topic)}</span>
      <span class="spacer"></span>
      ${stars(p.difficulty)}
      ${p.status === 'done' ? `<span class="badge status-mastered">已做</span>` : ''}
    </div>
    <div class="practice-prompt">${esc(p.prompt)}</div>
    ${p.hint ? `<details class="hintbox"><summary>看提示</summary><div class="small muted" style="margin-top:6px">${esc(p.hint)}</div></details>` : ''}
    ${shown ? `<div class="answer-box">${esc(p.answer || '（没有答案）')}</div>` : ''}
    <div class="row" style="gap:6px;flex-wrap:wrap">
      <button class="btn sm" data-act="reveal" data-id="${p.id}">${shown ? '收起答案' : '看答案'}</button>
      <span class="spacer"></span>
      <button class="btn sm" data-act="attempt" data-id="${p.id}" data-result="wrong">又错了</button>
      <button class="btn sm primary" data-act="attempt" data-id="${p.id}" data-result="correct">${I.check} 答对了</button>
    </div>
  </article>`;
}

/* ------------------------------- AI 接入 ------------------------------- */

function contentDir() {
  return state.snap.meta.content_dir || 'content';
}

function entrySample() {
  return [
    '---',
    'title: SQL 里用 = NULL 判断空值永远不成立',
    'type: bug',
    'topic: 数据库',
    'tags: [sql, null]',
    'difficulty: 1',
    'status: learning',
    '---',
    '',
    '# SQL 里用 = NULL 判断空值永远不成立',
    '',
    '## 原始问题',
    '',
    '为什么 WHERE email = NULL 查不到数据？',
    '',
    '## 当时的思路',
    '',
    '以为 NULL 就是一个普通的值，所以用等号比较。',
    '',
    '## 错因',
    '',
    'NULL 表示未知，与 NULL 的比较结果是 UNKNOWN，WHERE 只保留 TRUE。',
    '',
    '## 解法',
    '',
    '用 IS NULL / IS NOT NULL。',
    '',
    '## 心法',
    '',
    'NULL 不是值，是「未知」。',
    '',
    '## 原始代码',
    '',
    '```sql',
    'SELECT * FROM users WHERE email = NULL;',
    '```',
    '',
    '## 修正后',
    '',
    '```sql',
    'SELECT * FROM users WHERE email IS NULL;',
    '```',
  ].join('\n');
}

function instructionTemplate() {
  const dir = contentDir();
  const lines = [
    '你现在帮我维护「题迹」学习站。它的全部内容就是这些 Markdown 文件：',
    '',
    `${dir}\\entries\\<id>.md      一条问题`,
    `${dir}\\topics\\<主题名>.md   一个知识主题`,
    `${dir}\\practice\\<id>.md     一道练习`,
    '',
    '请把我们这段对话里我问过的问题，整理成条目，直接在这些目录里新建文件（一个文件一条）。',
    '',
    '【文件格式】严格按这个结构：',
    '',
    '---',
    'title: SQL 里用 = NULL 判断空值永远不成立',
    'type: bug',
    'topic: 数据库',
    'tags: [sql, null]',
    'difficulty: 1',
    'status: learning',
    '---',
    '',
    '# SQL 里用 = NULL 判断空值永远不成立',
    '',
    '## 原始问题',
    '为什么 WHERE email = NULL 查不到数据？',
    '',
    '## 当时的思路',
    '以为 NULL 是一个普通的值，所以用等号比较。',
    '',
    '## 错因',
    'NULL 表示未知，与 NULL 的比较结果是 UNKNOWN，WHERE 只保留 TRUE。',
    '',
    '## 解法',
    '用 IS NULL / IS NOT NULL。',
    '',
    '## 心法',
    'NULL 不是值，是「未知」。',
    '',
    '## 原始代码',
    '```sql',
    'SELECT * FROM users WHERE email = NULL;',
    '```',
    '',
    '## 修正后',
    '```sql',
    'SELECT * FROM users WHERE email IS NULL;',
    '```',
    '',
    '【规则】',
    '1. 文件名用英文小写 + 短横线，例如 2026-11-09-null-compare.md，不要中文和空格。',
    '2. type 只能取：bug（代码跑错）/ misconception（思路错）/ gap（知识空白）/ concept（概念巩固）。',
    '3. difficulty 取 1-5；status 取 new / learning / mastered。',
    '4. 只写我真正问过的问题，不要编造；某个段落没有内容就整段省略，不要写「无」。',
    '5. 心法用一句话说清：下次遇到类似问题，第一反应该想到什么。',
    '6. 不要碰 content/.state/ 目录，那是程序维护的复习进度。',
    '7. 直接写文件就行，不用调接口；保存后站点会自动刷新。',
    '',
    '【可选：主题总结】放在 topics 目录，文件名就用主题名：',
    '---',
    'name: 概率与统计',
    'color: "#7c3aed"',
    '---',
    '## 总结',
    '这个主题下我反复卡在什么地方。',
    '## 要点',
    '- 一句话要点',
    '## 常见坑',
    '- 一句话坑',
    '',
    '【可选：配套练习】放在 practice 目录：',
    '---',
    'topic: 概率与统计',
    'kind: math',
    'difficulty: 3',
    'entry: 2026-11-09-null-compare',
    '---',
    '## 题目',
    '题干',
    '## 提示',
    '一句提示',
    '## 答案',
    '完整解析，不要只给结果',
  ];
  return lines.join('\n');
}

function viewAi() {
  const meta = state.snap.meta;
  const dir = contentDir();
  const errors = meta.parse_errors || [];
  const endpoints = [
    ['GET', '/api/snapshot', '一次取回全部数据'],
    ['POST', '/api/entries', '新建条目（JSON）'],
    ['POST', '/api/entries/raw', '粘贴一段 Markdown 直接入库'],
    ['PATCH', '/api/entries/:id', '局部更新'],
    ['POST', '/api/practice', '新建练习'],
    ['POST', '/api/import', '批量导入'],
    ['POST', '/api/reload', '重新扫描 content 目录'],
    ['GET', '/api', '完整契约'],
  ];

  return `
  <div class="page-head">
    <div>
      <h1>让 ChatGPT 更新内容</h1>
      <div class="sub">不用接口：它直接改文件夹里的 Markdown，站点自动同步</div>
    </div>
  </div>

  <div class="stack">
    <section class="card">
      <div class="card-head"><h2>1 · 内容文件夹</h2><span class="small muted">这就是全部数据</span></div>
      <div class="card-body stack" style="gap:10px">
        <div class="token-row">
          <div class="token-box mono" style="font-size:12px">${esc(dir)}</div>
          <button class="btn sm" data-act="open-folder">打开文件夹</button>
          <button class="btn sm ghost" data-act="rescan">重新扫描</button>
        </div>
        <div class="grid-3" style="gap:8px">
          <div style="padding:9px 11px;border-radius:10px;background:var(--panel-2)">
            <div class="small muted">entries/</div>
            <div style="font-weight:600">一条问题一个 .md</div>
          </div>
          <div style="padding:9px 11px;border-radius:10px;background:var(--panel-2)">
            <div class="small muted">topics/</div>
            <div style="font-weight:600">一个主题一个 .md</div>
          </div>
          <div style="padding:9px 11px;border-radius:10px;background:var(--panel-2)">
            <div class="small muted">practice/</div>
            <div style="font-weight:600">一道练习一个 .md</div>
          </div>
        </div>
        <div class="small muted">
          新增、修改、删除文件都会立刻反映到网页上（<span class="mono">.state/</span> 目录除外，那里存复习进度，别动）。
          这份文件夹也可以直接用 git 管理或压缩备份。
        </div>
        ${
          errors.length
            ? `<div class="answer-box" style="border-color:var(--red);color:var(--red)">
                ${errors.map((e) => `⚠️ <span class="mono">${esc(e.file)}</span>：${esc(e.message)}`).join('<br />')}
              </div>`
            : ''
        }
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>2 · 一个条目长什么样</h2><span class="small muted">复制这个结构就行</span></div>
      <div class="card-body">
        <pre class="code" style="max-height:340px">${esc(entrySample())}</pre>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>3 · 把这段话发给 ChatGPT</h2><button class="btn sm" data-act="copy-template">${I.copy} 复制指令</button></div>
      <div class="card-body">
        <textarea class="input mono" id="ai-template" rows="14" readonly style="font-size:11.5px;line-height:1.7">${esc(instructionTemplate())}</textarea>
        <div class="small muted" style="margin-top:8px">
          配合「Work with Apps」这类能读写本地文件的能力使用：让它先打开 <span class="mono">${esc(dir)}</span>，再按上面的规则写文件。
          写完不用告诉你，网页会自己刷新。
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>4 · 它只能输出文字？</h2><span class="small muted">粘贴 Markdown 直接入库</span></div>
      <div class="card-body">
        <textarea class="input mono" id="import-md" rows="9" placeholder="把 ChatGPT 输出的那一段 Markdown 原样贴进来（含 --- 开头的 frontmatter），点下面按钮就会存成一条记录。"></textarea>
        <div class="row" style="margin-top:10px;gap:8px">
          <button class="btn primary" data-act="import-md">存为一条记录</button>
          <button class="btn ghost" data-act="import-json-toggle">改成粘贴 JSON</button>
        </div>
        <div id="import-json-wrap" style="display:none;margin-top:12px">
          <textarea class="input mono" id="import-json" rows="6" placeholder='{"entries":[{...}], "practice":[{...}]}'></textarea>
          <button class="btn sm" style="margin-top:8px" data-act="import-json">导入 JSON</button>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>5 · 接口（可选）</h2><span class="small muted">自动化脚本 / 其它工具用</span></div>
      <div class="card-body" style="padding:6px 10px 12px">
        <div style="overflow-x:auto">
        <table class="endpoint-table">
          <thead><tr><th style="width:70px">方法</th><th style="width:230px">路径</th><th>说明</th></tr></thead>
          <tbody>
            ${endpoints
              .map(
                ([m, p, d]) =>
                  `<tr><td><span class="method ${m.toLowerCase()}">${m}</span></td><td class="mono">${esc(p)}</td><td class="muted">${esc(d)}</td></tr>`
              )
              .join('')}
          </tbody>
        </table>
        </div>
        <div class="small muted" style="padding:8px 6px 0">
          写接口需要令牌（在 <span class="mono">config.json</span>）。直接改文件则完全不需要。
        </div>
      </div>
    </section>
  </div>`;
}

/* ------------------------------- 设置 ------------------------------- */

function viewSettings() {
  const p = state.snap.profile;
  const meta = state.snap.meta;
  return `
  <div class="page-head">
    <div>
      <h1>设置</h1>
      <div class="sub">数据在本地：${esc(meta.base_url)} · 就是一个 Markdown 文件夹</div>
    </div>
  </div>

  <div class="stack">
    <section class="card">
      <div class="card-head"><h2>个人资料</h2><span class="small muted">影响问候语和每日目标</span></div>
      <div class="card-body">
        <form data-form="profile" class="form-grid">
          <div class="field">
            <label>称呼</label>
            <input class="input" name="name" value="${attr(p.name)}" />
          </div>
          <div class="field">
            <label>每日目标（新增/复习条数）</label>
            <input class="input" name="daily_target" type="number" min="1" max="50" value="${attr(p.daily_target)}" />
          </div>
          <div class="field full">
            <label>学习目标</label>
            <input class="input" name="goal" value="${attr(p.goal)}" />
          </div>
          <div class="field full">
            <div><button class="btn primary" type="submit">保存</button></div>
          </div>
        </form>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>内容文件夹</h2><span class="small muted">文件就是数据</span></div>
      <div class="card-body stack" style="gap:10px">
        <div class="token-row">
          <div class="token-box mono" style="font-size:12px">${esc(contentDir())}</div>
          <button class="btn sm" data-act="open-folder">打开</button>
          <button class="btn sm ghost" data-act="rescan">重新扫描</button>
        </div>
        <div class="small muted">
          每条记录是一个 .md 文件。改文件、加文件、删文件都会自动同步到网页；
          备份或换电脑，复制这个文件夹就够了。
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>外观</h2></div>
      <div class="card-body row" style="justify-content:space-between">
        <div>
          <div style="font-weight:550">深色模式</div>
          <div class="small muted">跟随系统或手动切换</div>
        </div>
        <button class="btn" data-act="toggle-theme">切换主题</button>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>数据</h2><span class="small muted">${state.snap.entries.length} 条目 · ${state.snap.practice.length} 练习</span></div>
      <div class="card-body stack" style="gap:12px">
        <div class="row" style="flex-wrap:wrap;gap:8px">
          <a class="btn" href="/api/export?format=json" download>导出 JSON</a>
          <a class="btn" href="/api/export?format=markdown" download>导出 Markdown</a>
          <button class="btn" data-act="reset-data" data-mode="sample">载入示例数据</button>
        </div>
        <div class="small muted">
          数据就是 <span class="mono">content/</span> 目录里的 Markdown 文件，可以直接备份、用 git 管理，或者让 ChatGPT 改写。
        </div>
        <div class="row" style="border-top:1px solid var(--line-2);padding-top:12px">
          <div style="flex:1">
            <div style="font-weight:550;color:var(--red)">清空全部数据</div>
            <div class="small muted">删除所有条目、主题与练习，不可撤销（会先让你确认）</div>
          </div>
          <button class="btn danger" data-act="reset-data" data-mode="empty">清空</button>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>关于</h2></div>
      <div class="card-body small muted" style="line-height:1.8">
        题迹 v1 · 零依赖 Node 服务 + JSON 存储。<br />
        记录 → 归纳 → 练习 → 间隔复习，四步闭环；数据完全在本地。<br />
        给 AI 的接入说明在 <span class="mono">AGENTS.md</span>，机器可读契约在 <span class="mono">GET /api</span>。
      </div>
    </section>
  </div>`;
}

/* ------------------------------- 弹层 ------------------------------- */

function renderOverlay() {
  const entry = state.route.id && state.route.name === 'entries' ? state.snap.entries.find((e) => e.id === state.route.id) : null;
  const parts = [];
  if (entry) parts.push(drawerFor(entry));
  if (state.modal) parts.push(modalFor(state.modal));
  overlay.innerHTML = parts.join('');
}

function modalFor(m) {
  if (m.type === 'entry') return entryModal(m.entry);
  if (m.type === 'topic') return topicModal(m.topic);
  if (m.type === 'confirm') return confirmModal(m);
  return '';
}

function modalShell(title, body, extra = '') {
  return `
  <div class="scrim show" data-act="close-modal"></div>
  <div class="modal-wrap">
    <div class="modal">
      <div class="modal-head">
        <h3>${esc(title)}</h3>
        <button class="icon-btn" data-act="close-modal">${I.close}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${extra}
    </div>
  </div>`;
}

function entryModal(entry) {
  const e = entry || {};
  const topicNames = state.snap.topics.map((t) => t.name);
  const isNew = !entry;
  return modalShell(
    isNew ? '记录一个新问题' : '编辑条目',
    `<form data-form="entry" data-id="${e.id || ''}">
      <div class="form-grid">
        <div class="field full">
          <label>标题 *</label>
          <input class="input" name="title" value="${attr(e.title || '')}" placeholder="具体到能一眼想起来，例如：默认参数只在定义时求值一次" required />
        </div>
        <div class="field">
          <label>类型</label>
          <select class="select" name="type" style="width:100%">
            ${Object.entries(TYPE_LABEL)
              .map(([v, l]) => `<option value="${v}" ${(e.type || 'gap') === v ? 'selected' : ''}>${l}</option>`)
              .join('')}
          </select>
        </div>
        <div class="field">
          <label>主题</label>
          <input class="input" name="topic" list="topic-names" value="${attr(e.topic || '')}" placeholder="概率与统计" />
          <datalist id="topic-names">${topicNames.map((t) => `<option value="${attr(t)}"></option>`).join('')}</datalist>
        </div>
        <div class="field">
          <label>难度 1-5</label>
          <input class="input" name="difficulty" type="number" min="1" max="5" value="${attr(e.difficulty || 2)}" />
        </div>
        <div class="field">
          <label>状态</label>
          <select class="select" name="status" style="width:100%">
            <option value="new" ${e.status === 'new' ? 'selected' : ''}>未开始</option>
            <option value="learning" ${(e.status || 'learning') === 'learning' ? 'selected' : ''}>在学</option>
            <option value="mastered" ${e.status === 'mastered' ? 'selected' : ''}>已掌握</option>
          </select>
        </div>
        <div class="field">
          <label>踩坑次数</label>
          <input class="input" name="occurrences" type="number" min="1" max="99" value="${attr(e.occurrences || 1)}" />
        </div>
        <div class="field">
          <label>标签（逗号分隔）</label>
          <input class="input" name="tags" value="${attr((e.tags || []).join(', '))}" placeholder="python, 作用域" />
        </div>
        <div class="field full">
          <label>原始问题</label>
          <textarea class="input" name="question" rows="2" placeholder="当时是怎么问的 / 卡在哪里">${esc(e.question || '')}</textarea>
        </div>
        <div class="field full">
          <label>当时的思路（错在哪）</label>
          <textarea class="input" name="my_attempt" rows="2">${esc(e.my_attempt || '')}</textarea>
        </div>
        <div class="field full">
          <label>真正的错因</label>
          <textarea class="input" name="root_cause" rows="2">${esc(e.root_cause || '')}</textarea>
        </div>
        <div class="field full">
          <label>正确解法</label>
          <textarea class="input" name="solution" rows="2">${esc(e.solution || '')}</textarea>
        </div>
        <div class="field">
          <label>语言</label>
          <input class="input" name="language" value="${attr(e.language || '')}" placeholder="python / javascript / sql" />
        </div>
        <div class="field">
          <label>来源</label>
          <input class="input" name="source" value="${attr(e.source || '')}" placeholder="ChatGPT 对话 2026-11-09" />
        </div>
        <div class="field full">
          <label>原始代码（错误）</label>
          <textarea class="input mono" name="code_before" rows="4" spellcheck="false">${esc(e.code_before || '')}</textarea>
        </div>
        <div class="field full">
          <label>修正后代码</label>
          <textarea class="input mono" name="code_after" rows="4" spellcheck="false">${esc(e.code_after || '')}</textarea>
        </div>
        <div class="field full">
          <label>一句话心法</label>
          <input class="input" name="takeaway" value="${attr(e.takeaway || '')}" placeholder="下次遇到类似情况，第一反应应该是什么" />
        </div>
        <div class="field full">
          <div class="row">
            <button class="btn primary" type="submit">${isNew ? '保存条目' : '保存修改'}</button>
            <button class="btn ghost" type="button" data-act="close-modal">取消</button>
          </div>
        </div>
      </div>
    </form>`
  );
}

function topicModal(topic) {
  return modalShell(
    `编辑总结 · ${topic.name}`,
    `<form data-form="topic" data-name="${attr(topic.name)}">
      <div class="form-grid">
        <div class="field full">
          <label>主题总结</label>
          <textarea class="input" name="summary" rows="5" placeholder="这个主题下我反复卡在什么地方？">${esc(topic.summary || '')}</textarea>
        </div>
        <div class="field full">
          <label>要点（每行一条）</label>
          <textarea class="input" name="key_points" rows="4">${esc((topic.key_points || []).join('\n'))}</textarea>
        </div>
        <div class="field full">
          <label>常犯的坑（每行一条）</label>
          <textarea class="input" name="pitfalls" rows="4">${esc((topic.pitfalls || []).join('\n'))}</textarea>
        </div>
        <div class="field full">
          <div class="row">
            <button class="btn primary" type="submit">保存</button>
            <button class="btn ghost" type="button" data-act="close-modal">取消</button>
          </div>
        </div>
      </div>
    </form>`
  );
}

function confirmModal(m) {
  return modalShell(
    m.title || '确认',
    `<div style="font-size:13.5px;line-height:1.7;color:var(--text-2)">${esc(m.message)}</div>
     <div class="row" style="margin-top:18px">
       <button class="btn primary" data-act="confirm-yes">${esc(m.confirmLabel || '确认')}</button>
       <button class="btn ghost" data-act="close-modal">取消</button>
     </div>`
  );
}

/* ------------------------------- 事件 ------------------------------- */

async function reload() {
  await loadSnapshot();
  render();
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;

  try {
    switch (act) {
      case 'nav':
        location.hash = `#/${el.dataset.to}`;
        break;
      case 'open-entry':
        location.hash = `#/entries/${el.dataset.id}`;
        break;
      case 'close-entry':
        location.hash = '#/entries';
        break;
      case 'new-entry':
        state.modal = { type: 'entry', entry: null };
        render();
        break;
      case 'edit-entry':
        state.modal = { type: 'entry', entry: state.snap.entries.find((x) => x.id === el.dataset.id) };
        render();
        break;
      case 'edit-topic': {
        const t = state.snap.topics.find((x) => x.name === el.dataset.name);
        state.modal = { type: 'topic', topic: t };
        render();
        break;
      }
      case 'close-modal':
        state.modal = null;
        render();
        if (state.pendingSync) {
          state.pendingSync = false;
          await loadSnapshot();
          render();
        }
        break;
      case 'filter-type':
        state.filters.type = el.dataset.value;
        render();
        break;
      case 'filter-topic':
        state.filters.topic = el.dataset.topic;
        location.hash = '#/entries';
        render();
        break;
      case 'go-practice':
        location.hash = '#/practice';
        break;
      case 'go-topic-practice':
        state.pf.topic = el.dataset.topic || 'all';
        state.pf.status = 'all';
        location.hash = '#/practice';
        break;
      case 'pf-status':
        state.pf.status = el.dataset.value;
        render();
        break;
      case 'reveal': {
        const id = el.dataset.id;
        if (state.revealed.has(id)) state.revealed.delete(id);
        else state.revealed.add(id);
        render();
        break;
      }
      case 'attempt': {
        if (state.busy) return;
        state.busy = true;
        await request('POST', `/api/practice/${encodeURIComponent(el.dataset.id)}/attempt`, { result: el.dataset.result });
        await reload();
        toast(el.dataset.result === 'correct' ? '答对了，复习间隔已延长' : '记下了，下次会更快出现');
        break;
      }
      case 'review': {
        if (state.busy) return;
        state.busy = true;
        await request('POST', `/api/entries/${encodeURIComponent(el.dataset.id)}/review`, { grade: Number(el.dataset.grade) });
        await reload();
        toast('复习已记录');
        break;
      }
      case 'master': {
        const id = el.dataset.id;
        const entry = state.snap.entries.find((x) => x.id === id);
        const next = entry.status === 'mastered' ? 'learning' : 'mastered';
        await request('PATCH', `/api/entries/${encodeURIComponent(id)}`, { status: next });
        await reload();
        toast(next === 'mastered' ? '已标记为掌握' : '已移回在学');
        break;
      }
      case 'delete-entry': {
        const id = el.dataset.id;
        const entry = state.snap.entries.find((x) => x.id === id);
        state.modal = {
          type: 'confirm',
          title: '删除这条记录？',
          message: `「${entry.title}」将被永久删除，配套练习也会一起删掉。只是想暂时移出视线的话，把状态改成「已掌握」更合适。`,
          confirmLabel: '删除',
          action: async () => {
            await request('DELETE', `/api/entries/${encodeURIComponent(id)}`);
            state.modal = null;
            location.hash = '#/entries';
            await reload();
            toast('已删除');
          },
        };
        render();
        break;
      }
      case 'toggle-theme':
        toggleTheme();
        render();
        break;
      case 'toggle-token':
        state.showToken = !state.showToken;
        render();
        break;
      case 'copy':
        await copyText(el.dataset.copy, '已复制');
        break;
      case 'copy-template':
        await copyText(document.getElementById('ai-template').value, '指令已复制');
        break;
      case 'open-folder': {
        const r = await request('POST', '/api/open-folder');
        toast(`已打开 ${r.opened}`);
        break;
      }
      case 'rescan': {
        const r = await request('POST', '/api/reload');
        await reload();
        toast(
          r.parse_errors && r.parse_errors.length
            ? `重新扫描完成，有 ${r.parse_errors.length} 个文件格式有问题`
            : `已重新扫描：${r.counts.entries} 条记录`
        );
        break;
      }
      case 'import-json-toggle': {
        const wrap = document.getElementById('import-json-wrap');
        wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
        break;
      }
      case 'import-md': {
        const raw = document.getElementById('import-md').value.trim();
        if (!raw) return toast('先粘贴 Markdown', true);
        const data = await request('POST', '/api/entries/raw', { markdown: raw });
        document.getElementById('import-md').value = '';
        await reload();
        toast(`已存为条目「${data.entry.title}」`);
        break;
      }
      case 'import-json': {
        const raw = document.getElementById('import-json').value.trim();
        if (!raw) return toast('先粘贴 JSON', true);
        let payload;
        try {
          payload = JSON.parse(raw);
        } catch (err) {
          return toast(`JSON 格式错误：${err.message}`, true);
        }
        const data = await request('POST', '/api/import', payload);
        document.getElementById('import-json').value = '';
        await reload();
        toast(`导入完成：条目 +${data.entries.created} / 更新 ${data.entries.updated}，练习 +${data.practice.created}`);
        break;
      }
      case 'reset-data': {
        const mode = el.dataset.mode;
        state.modal = {
          type: 'confirm',
          title: mode === 'empty' ? '清空全部数据？' : '载入示例数据？',
          message:
            mode === 'empty'
              ? '所有条目、主题、练习都会被删除，且无法撤销。建议先导出 JSON 备份。'
              : '当前数据会被示例数据替换！如果你已经记录了内容，请先导出备份。',
          confirmLabel: mode === 'empty' ? '确认清空' : '替换为示例',
          action: async () => {
            await request('POST', '/api/admin/reset', { mode });
            state.modal = null;
            await reload();
            toast('已重置');
          },
        };
        render();
        break;
      }
      case 'confirm-yes': {
        const m = state.modal;
        state.modal = null;
        render();
        if (m && m.action) await m.action();
        if (state.pendingSync) {
          state.pendingSync = false;
          await loadSnapshot();
          render();
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    toast(err.message || '操作失败', true);
  } finally {
    state.busy = false;
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'entry-search') {
    state.filters.q = e.target.value;
    const list = document.getElementById('entry-list');
    if (list) list.innerHTML = entryCards();
    const count = document.getElementById('entry-count');
    if (count) count.textContent = filteredEntries().length;
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'filter-topic') {
    state.filters.topic = e.target.value;
    render();
  }
  if (e.target.id === 'filter-status') {
    state.filters.status = e.target.value;
    render();
  }
  if (e.target.id === 'pf-topic') {
    state.pf.topic = e.target.value;
    render();
  }
});

document.addEventListener('submit', async (e) => {
  const form = e.target;
  if (!form.dataset.form) return;
  e.preventDefault();
  const fd = new FormData(form);
  const obj = Object.fromEntries(fd.entries());

  try {
    if (form.dataset.form === 'entry') {
      const body = {
        title: obj.title,
        type: obj.type,
        topic: obj.topic,
        difficulty: Number(obj.difficulty) || 2,
        status: obj.status,
        occurrences: Number(obj.occurrences) || 1,
        tags: obj.tags,
        question: obj.question,
        my_attempt: obj.my_attempt,
        root_cause: obj.root_cause,
        solution: obj.solution,
        language: obj.language,
        code_before: obj.code_before,
        code_after: obj.code_after,
        takeaway: obj.takeaway,
        source: obj.source,
      };
      const id = form.dataset.id;
      if (id) await request('PATCH', `/api/entries/${encodeURIComponent(id)}`, body);
      else await request('POST', '/api/entries', body);
      state.modal = null;
      await reload();
      toast(id ? '已保存' : '已记录，继续加油');
    }

    if (form.dataset.form === 'topic') {
      const name = form.dataset.name;
      await request('PATCH', `/api/topics/${encodeURIComponent(name)}`, {
        summary: obj.summary,
        key_points: (obj.key_points || '').split('\n').map((s) => s.trim()).filter(Boolean),
        pitfalls: (obj.pitfalls || '').split('\n').map((s) => s.trim()).filter(Boolean),
      });
      state.modal = null;
      await reload();
      toast('总结已更新');
    }

    if (form.dataset.form === 'profile') {
      await request('PATCH', '/api/profile', {
        name: obj.name,
        goal: obj.goal,
        daily_target: Number(obj.daily_target) || 3,
      });
      await reload();
      toast('已保存');
    }
  } catch (err) {
    toast(err.message || '保存失败', true);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (state.modal) {
      state.modal = null;
      render();
    } else if (state.route.id) {
      location.hash = '#/entries';
    }
  }
  if (e.key === '/' && document.activeElement === document.body) {
    const input = document.getElementById('entry-search');
    if (input) {
      e.preventDefault();
      input.focus();
    }
  }
});

window.addEventListener('hashchange', () => {
  state.route = parseHash();
  if (state.route.name === 'entries' && state.route.query.topic) {
    state.filters.topic = state.route.query.topic;
  }
  render();
});

/* ------------------------------- 启动 ------------------------------- */

(async function boot() {
  applyTheme();
  try {
    await loadSnapshot();
    render();
    connectEvents();
  } catch (err) {
    state.error = err.message;
    app.innerHTML = `<div class="skeleton">加载失败：${esc(err.message)}<br /><button class="btn" style="margin-top:12px" onclick="location.reload()">重试</button></div>`;
  }
})();

function connectEvents() {
  if (!window.EventSource) return;
  try {
    const es = new EventSource('/api/events');
    es.onmessage = async (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type !== 'reload') return;
        if (state.modal) {
          state.pendingSync = true;
          toast('文件有更新，关掉弹窗后自动刷新');
          return;
        }
        const quiet = Date.now() - (state.lastMutation || 0) < 1500;
        await loadSnapshot();
        render();
        if (!quiet) toast('已同步文件改动');
      } catch {}
    };
  } catch {}
}
