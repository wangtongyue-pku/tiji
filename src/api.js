'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const { exec } = require('node:child_process');
const { computeStats } = require('./stats');
const md = require('./markdown');

const iso = (d = new Date()) => d.toISOString();

const TYPES = ['bug', 'misconception', 'gap', 'concept'];
const STATUSES = ['new', 'learning', 'mastered'];
const TYPE_LABEL = { bug: '代码 bug', misconception: '错误思路', gap: '知识薄弱点', concept: '概念巩固' };
const DAY = 86400000;

/* ------------------------------- 基础工具 ------------------------------- */

function sendJson(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function ok(res, data, status = 200) {
  sendJson(res, status, { ok: true, data });
}

function fail(res, status, code, message, details) {
  sendJson(res, status, { ok: false, error: { code, message, ...(details ? { details } : {}) } });
}

function readBody(req, limit = 4 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('请求体过大'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(Object.assign(new Error(`JSON 解析失败：${e.message}`), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

const newId = (prefix) => `${prefix}_${crypto.randomBytes(5).toString('hex')}`;
const str = (v, max = 20000) => (v == null ? '' : String(v).slice(0, max));
const uniq = (arr) => [...new Set(arr)];

function toList(v) {
  if (Array.isArray(v)) return v.map((x) => str(x).trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(/[,，;；]/).map((x) => x.trim()).filter(Boolean);
  return [];
}

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/* ------------------------------- 数据模型 ------------------------------- */

function normalizeEntry(input, base) {
  const src = base ? { ...base, ...pickDefined(input) } : { ...input };
  const title = str(src.title, 200).trim();
  if (!title) throw Object.assign(new Error('title 不能为空'), { statusCode: 400 });

  let type = str(src.type || (base ? base.type : 'concept')).trim();
  if (!TYPES.includes(type)) {
    throw Object.assign(new Error(`type 只能是 ${TYPES.join(' / ')}`), { statusCode: 400 });
  }
  let status = str(src.status || (base ? base.status : 'new')).trim();
  if (!STATUSES.includes(status)) {
    throw Object.assign(new Error(`status 只能是 ${STATUSES.join(' / ')}`), { statusCode: 400 });
  }

  const now = iso();
  const review = src.review && typeof src.review === 'object' ? { ...src.review } : base ? base.review : null;

  const entry = {
    id: base ? base.id : newId('e'),
    external_id: src.external_id ? str(src.external_id, 200) : base ? base.external_id || null : null,
    title,
    type,
    topic: str(src.topic, 80).trim() || '未分类',
    tags: uniq(toList(src.tags)),
    difficulty: clampInt(src.difficulty, 1, 5, 2),
    status,
    occurrences: clampInt(src.occurrences, 1, 99, 1),
    question: str(src.question),
    my_attempt: str(src.my_attempt),
    root_cause: str(src.root_cause),
    solution: str(src.solution),
    language: str(src.language, 30),
    code_before: str(src.code_before),
    code_after: str(src.code_after),
    takeaway: str(src.takeaway, 2000),
    source: str(src.source, 300),
    extra: str(src.extra, 20000),
    created_at: base ? base.created_at : iso(),
    updated_at: now,
    review: {
      last_at: (review && review.last_at) || null,
      next_at: (review && review.next_at) || iso(new Date(Date.now() + DAY)),
      interval: (review && review.interval) || 1,
      ease: (review && review.ease) || 2.5,
      streak: (review && review.streak) || 0,
    },
    is_sample: base ? !!base.is_sample : false,
  };
  return entry;
}

function pickDefined(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) if (v !== undefined) out[k] = v;
  return out;
}

function normalizePractice(input, base) {
  const src = base ? { ...base, ...pickDefined(input) } : { ...input };
  const prompt = str(src.prompt, 8000).trim();
  if (!prompt) throw Object.assign(new Error('prompt 不能为空'), { statusCode: 400 });
  const now = iso();
  return {
    id: base ? base.id : newId('p'),
    external_id: src.external_id ? str(src.external_id, 200) : base ? base.external_id || null : null,
    entry_id: src.entry_id ? str(src.entry_id, 80) : null,
    topic: str(src.topic, 80).trim() || '未分类',
    kind: src.kind === 'math' ? 'math' : 'code',
    difficulty: clampInt(src.difficulty, 1, 5, 2),
    prompt,
    hint: str(src.hint, 4000),
    answer: str(src.answer, 12000),
    status: ['todo', 'done'].includes(src.status) ? src.status : 'todo',
    attempts: base ? base.attempts || 0 : 0,
    correct: base ? base.correct || 0 : 0,
    last_result: (base && base.last_result) || null,
    created_at: base ? base.created_at : now,
    updated_at: now,
    is_sample: base ? !!base.is_sample : false,
  };
}

function scheduleReview(prev, grade) {
  let { interval = 1, ease = 2.5, streak = 0 } = prev || {};
  const g = clampInt(grade, 0, 5, 3);
  if (g <= 2) {
    interval = 1;
    ease = Math.max(1.3, ease - 0.2);
    streak = 0;
  } else if (g === 3) {
    interval = Math.max(1, Math.round(interval * 1.2));
    ease = Math.max(1.3, ease - 0.05);
    streak += 1;
  } else {
    interval = Math.max(2, Math.round(interval * ease));
    ease = Math.min(3, ease + 0.1);
    streak += 1;
  }
  interval = Math.min(180, interval);
  return {
    last_at: iso(),
    next_at: iso(new Date(Date.now() + interval * DAY)),
    interval,
    ease: Math.round(ease * 100) / 100,
    streak,
  };
}

/* ------------------------------- 查询辅助 ------------------------------- */

function topicOf(data, name) {
  return data.topics.find((t) => t.name === name);
}

function ensureTopic(data, name) {
  let t = topicOf(data, name);
  if (!t) {
    const palette = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f43f5e'];
    t = {
      id: name,
      name,
      color: palette[data.topics.length % palette.length],
      summary: '',
      key_points: [],
      pitfalls: [],
      created_at: iso(),
      updated_at: iso(),
    };
    data.topics.push(t);
  }
  return t;
}

function practiceOf(data, entryId) {
  return data.practice.filter((p) => p.entry_id === entryId);
}

/** 允许 entry_id 直接写 external_id，写入时归一成真正的 id */
function resolveEntryId(data, ref) {
  if (!ref) return null;
  const target = data.entries.find((e) => e.id === ref || e.external_id === ref);
  return target ? target.id : str(ref, 80);
}

/** 删除条目后清掉自动创建且未填写任何内容的空主题，避免「测试」类残留 */
function pruneEmptyTopics(data, store) {
  const keep = [];
  for (const t of data.topics) {
    const used =
      data.entries.some((e) => e.topic === t.name) || data.practice.some((p) => p.topic === t.name);
    const curated = (t.summary || '').trim() || (t.key_points || []).length || (t.pitfalls || []).length;
    if (used || curated) keep.push(t);
    else if (store) store.remove('topics', t.name);
  }
  data.topics = keep;
}

function enrichTopic(data, t, stats) {
  const entries = data.entries.filter((e) => e.topic === t.name);
  const practices = data.practice.filter((p) => p.topic === t.name);
  return {
    ...t,
    total: entries.length,
    mastered: entries.filter((e) => e.status === 'mastered').length,
    unresolved: entries.filter((e) => e.status !== 'mastered').length,
    learning: entries.filter((e) => e.status === 'learning').length,
    fresh: entries.filter((e) => e.status === 'new' || !e.status).length,
    practice_total: practices.length,
    practice_done: practices.filter((p) => p.status === 'done').length,
    weak_score: (stats.weakTopics.find((w) => w.name === t.name) || {}).score || 0,
  };
}

function sortEntries(list) {
  return [...list].sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
}

function publicMeta(ctx) {
  return {
    name: '题迹',
    version: 2,
    server_time: iso(),
    base_url: ctx.baseUrl,
    mode: 'files',
    content_dir: ctx.store.contentDir,
    parse_errors: ctx.store.errors || [],
    counts: {
      entries: ctx.store.data.entries.length,
      topics: ctx.store.data.topics.length,
      practice: ctx.store.data.practice.length,
    },
  };
}

/* ------------------------------- 契约文档 ------------------------------- */

function contract(ctx) {
  const d = ctx.store.data;
  return {
    name: '题迹 / Tiji — 个人 AI 问答学习库 API',
    version: 2,
    base_url: ctx.baseUrl,
    purpose:
      '把用户问过 AI 的代码与数学问题整理成结构化条目，附带错因、正确解法、知识总结与补充练习，并给出个性化统计。',
    storage_mode: {
      primary: 'content/ 目录下每个 .md 文件就是一条记录，直接写文件即可，无需调用 API',
      dir: ctx.store.contentDir,
      layout: {
        'content/entries/<id>.md': '一条问题',
        'content/topics/<主题名>.md': '一个知识主题',
        'content/practice/<id>.md': '一道练习',
        'content/site.json': '个人资料',
        'content/.state/': '复习进度等机器状态，不要手改',
      },
      reload: '服务端监听文件变化，保存后网页自动刷新；也可 POST /api/reload 强制重扫',
    },
    auth: {
      write_required: true,
      header: 'Authorization: Bearer <token>',
      alternatives: ['X-Api-Token: <token>', '?token=<token>', '浏览器登录后的 cookie（网页端自动持有）'],
      note: '所有 GET 请求无需认证；新增/修改/删除需要令牌。直接改文件则完全不需要令牌。',
    },
    enums: {
      type: { bug: '代码 bug（跑不通/结果错）', misconception: '错误思路（方向对但理解错）', gap: '知识薄弱点（不会/说不清）', concept: '概念巩固（会但想更透）' },
      status: { new: '未开始', learning: '在学', mastered: '已掌握' },
      kind: { code: '编程题', math: '数学题' },
      practice_status: { todo: '待做', done: '已完成' },
      difficulty: '1-5 整数，1 最易',
    },
    write_rules: [
      '每条 entry 必须能独立看懂：question 写原始疑问，root_cause 写真正的错因，solution 写正确做法。',
      '同一个问题不要重复建条目：带上稳定的 external_id（例如 chatgpt-2026-11-09-一阶差分），重复 POST 会自动合并更新而不是新增。',
      'topic 用简短学科名（如「概率与统计」「算法与数据结构」），不存在的 topic 会自动创建。',
      'code_before / code_after 放原始错误代码与修正后代码，language 填 python/javascript/sql 等。',
      'takeaway 用一句话写下「下次遇到该怎么办」，会展示在知识地图上。',
      '批量写入用 POST /api/import，一次传 {entries, topics, practice}，适合把一整段对话一次性归档。',
      '给条目配 1-2 道练习（POST /api/practice，entry_id 指向该条目），练习答案要写完整解析而不是只给结果。',
    ],
    endpoints: [
      { method: 'GET', path: '/api', desc: '本契约（机器可读的能力说明）' },
      { method: 'GET', path: '/api/snapshot', desc: '一次取回全部数据：profile / entries / topics / practice / stats', auth: false },
      { method: 'GET', path: '/api/entries', desc: '列条目，支持 ?type= &topic= &status= &tag= &q= &limit= &offset=', auth: false },
      { method: 'GET', path: '/api/entries/:id', desc: '读单条条目（含关联练习）', auth: false },
      { method: 'POST', path: '/api/entries', desc: '新建条目；body 可为单个对象或 {items:[...]}；带 external_id 时按它 upsert' },
      { method: 'PATCH', path: '/api/entries/:id', desc: '局部更新（只传要改的字段）' },
      { method: 'DELETE', path: '/api/entries/:id', desc: '删除条目' },
      { method: 'POST', path: '/api/entries/:id/review', desc: '记录一次复习评分 {grade:0-5}，自动安排下次复习时间' },
      { method: 'GET', path: '/api/topics', desc: '列知识主题（含条目数、掌握进度、薄弱分）', auth: false },
      { method: 'POST', path: '/api/topics', desc: '新建/按 name upsert 主题：{name, summary, key_points[], pitfalls[], color}' },
      { method: 'PATCH', path: '/api/topics/:id', desc: '更新主题总结' },
      { method: 'GET', path: '/api/practice', desc: '列练习，支持 ?topic= &status= &entry_id=', auth: false },
      { method: 'POST', path: '/api/practice', desc: '新建练习 {prompt, answer, hint, kind, topic, entry_id, difficulty}' },
      { method: 'PATCH', path: '/api/practice/:id', desc: '更新练习' },
      { method: 'POST', path: '/api/practice/:id/attempt', desc: '提交作答 {result:"correct"|"wrong"}，同时更新关联条目的复习进度' },
      { method: 'POST', path: '/api/import', desc: '批量导入 {entries:[], topics:[], practice:[]}，按 external_id / name 幂等' },
      { method: 'GET', path: '/api/stats', desc: '个性化统计：掌握率、薄弱知识点、12 周活跃、待复习', auth: false },
      { method: 'GET', path: '/api/export?format=json|markdown', desc: '导出全部数据', auth: false },
      { method: 'POST', path: '/api/reload', desc: '重新扫描 content/ 目录（改完文件后可手动触发）' },
      { method: 'POST', path: '/api/open-folder', desc: '在系统文件管理器里打开 content/ 目录' },
      { method: 'POST', path: '/api/admin/reset', desc: '重置数据 {mode:"empty"|"sample"}' },
    ],
    entry_schema: {
      id: '服务端生成，只读',
      external_id: '外部幂等键，建议 "chatgpt-YYYY-MM-DD-短标题"',
      title: '必填，一句话标题',
      type: TYPES.join(' | '),
      topic: '学科/知识主题，如「概率与统计」',
      tags: '字符串数组，用于检索',
      difficulty: '1-5',
      status: STATUSES.join(' | '),
      occurrences: '这个问题重复踩坑的次数，默认 1',
      question: '我当时的原始疑问（可复述原话）',
      my_attempt: '我当时的错误思路 / 尝试',
      root_cause: '真正的错因（不是表面现象）',
      solution: '正确做法 / 关键结论',
      language: '代码语言，如 python',
      code_before: '错误代码',
      code_after: '修正后的代码',
      takeaway: '一句话心法',
      source: '来源，如「ChatGPT 对话 2026-11-09」',
      review: '{last_at, next_at, interval, ease, streak} 由系统维护',
    },
    examples: {
      create_entry: {
        method: 'POST',
        url: '/api/entries',
        body: {
          external_id: 'chatgpt-2026-11-09-null-compare',
          title: 'SQL 里用 = NULL 判断空值永远不成立',
          type: 'bug',
          topic: '数据库',
          tags: ['sql', 'null'],
          difficulty: 1,
          status: 'learning',
          question: '为什么 WHERE email = NULL 查不到数据？',
          my_attempt: '以为 NULL 就是一个普通的值，所以用等号比较。',
          root_cause: 'NULL 表示未知，与 NULL 的比较结果是 UNKNOWN，而 WHERE 只保留 TRUE 的行。',
          solution: '使用 IS NULL / IS NOT NULL。',
          language: 'sql',
          code_before: 'SELECT * FROM users WHERE email = NULL;',
          code_after: 'SELECT * FROM users WHERE email IS NULL;',
          takeaway: 'NULL 不是值，是「未知」。',
        },
      },
      bulk_import: {
        method: 'POST',
        url: '/api/import',
        body: {
          entries: [{ external_id: 'chatgpt-2026-11-09-a', title: '……', type: 'gap', topic: '线性代数' }],
          practice: [{ entry_id: 'chatgpt-2026-11-09-a', prompt: '……', answer: '……', kind: 'math' }],
        },
      },
    },
    current_counts: publicMeta(ctx).counts,
    type_labels: TYPE_LABEL,
  };
}

/* ------------------------------- 主处理 ------------------------------- */

async function handleApi(req, res, url, ctx) {
  const { pathname, searchParams } = url;
  if (!pathname.startsWith('/api')) return false;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Token');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  const authed = ctx.isAuthed(req, url);
  const method = req.method;
  const data = ctx.store.data;

  try {
    /* ---------- 元信息 ---------- */
    if (pathname === '/api' || pathname === '/api/') {
      if (method !== 'GET') return fail(res, 405, 'method_not_allowed', '只支持 GET'), true;
      return ok(res, contract(ctx)), true;
    }

    if (pathname === '/api/health') {
      return ok(res, { status: 'ok', time: iso() }), true;
    }

    if (pathname === '/api/snapshot' && method === 'GET') {
      const stats = computeStats(data);
      const topics = data.topics.map((t) => enrichTopic(data, t, stats));
      const tags = uniq(data.entries.flatMap((e) => e.tags || [])).sort();
      return (
        ok(res, {
          profile: data.profile,
          entries: sortEntries(data.entries),
          topics,
          practice: [...data.practice].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)),
          stats,
          tags,
          meta: { ...publicMeta(ctx), token: authed ? ctx.config.token : null },
        }),
        true
      );
    }

    if (pathname === '/api/profile') {
      if (method === 'GET') return ok(res, data.profile), true;
      if (method === 'PATCH' || method === 'POST') {
        if (!authed) return fail(res, 401, 'unauthorized', '需要令牌才能修改资料'), true;
        const body = await readBody(req);
        data.profile = {
          ...data.profile,
          ...pickDefined({
            name: body.name !== undefined ? str(body.name, 40) : undefined,
            goal: body.goal !== undefined ? str(body.goal, 200) : undefined,
            daily_target: body.daily_target !== undefined ? clampInt(body.daily_target, 1, 50, 3) : undefined,
          }),
          updated_at: iso(),
        };
        ctx.store.persist();
        return ok(res, data.profile), true;
      }
      return fail(res, 405, 'method_not_allowed', '不支持的方法'), true;
    }

    if (pathname === '/api/stats' && method === 'GET') {
      return ok(res, computeStats(data)), true;
    }

    /* ---------- 条目 ---------- */
    if (pathname === '/api/entries' && method === 'GET') {
      let list = [...data.entries];
      const type = searchParams.get('type');
      const topic = searchParams.get('topic');
      const status = searchParams.get('status');
      const tag = searchParams.get('tag');
      const q = (searchParams.get('q') || '').trim().toLowerCase();
      if (type) list = list.filter((e) => e.type === type);
      if (topic) list = list.filter((e) => e.topic === topic);
      if (status) list = list.filter((e) => e.status === status);
      if (tag) list = list.filter((e) => (e.tags || []).includes(tag));
      if (q) {
        list = list.filter((e) =>
          [e.title, e.question, e.root_cause, e.solution, e.takeaway, e.topic, (e.tags || []).join(' ')]
            .join(' ')
            .toLowerCase()
            .includes(q)
        );
      }
      list = sortEntries(list);
      const total = list.length;
      const offset = clampInt(searchParams.get('offset'), 0, 100000, 0);
      const limit = clampInt(searchParams.get('limit'), 1, 500, 200);
      return ok(res, { total, offset, limit, items: list.slice(offset, offset + limit) }), true;
    }

    // 粘贴一整段 Markdown（ChatGPT 不能直接改文件时的兜底）
    if (pathname === '/api/entries/raw' && method === 'POST') {
      if (!authed) return fail(res, 401, 'unauthorized', '需要令牌'), true;
      const body = await readBody(req);
      const text = String(body.markdown || body.text || '');
      if (!text.trim()) return fail(res, 400, 'empty', 'markdown 为空'), true;
      const parsed = md.entryFromMarkdown(text, '');
      if (parsed.errors.length) return fail(res, 400, 'invalid', parsed.errors.join('；')), true;
      const entry = normalizeEntry(parsed.entry, null);
      entry.id = ctx.store.uniqueEntryId(entry.title);
      if (!topicOf(data, entry.topic)) ensureTopic(data, entry.topic);
      data.entries.push(entry);
      ctx.store.addEvent('entry_created', entry.id);
      ctx.store.persist();
      return ok(res, { entry }), true;
    }

    if (pathname === '/api/entries' && method === 'POST') {
      if (!authed) return fail(res, 401, 'unauthorized', '需要令牌才能写入，请在请求头带上 Authorization: Bearer <token>'), true;
      const body = await readBody(req);
      const items = Array.isArray(body) ? body : Array.isArray(body.items) ? body.items : [body];
      if (!items.length) return fail(res, 400, 'empty', '没有提供条目'), true;

      const results = [];
      for (const raw of items) {
        const external = raw && raw.external_id ? str(raw.external_id, 200) : null;
        const existing = external ? data.entries.find((e) => e.external_id === external) : raw && raw.id ? data.entries.find((e) => e.id === raw.id) : null;
        const entry = normalizeEntry(raw, existing || null);
        if (!existing) entry.id = ctx.store.uniqueEntryId(entry.title);
        if (!topicOf(data, entry.topic)) ensureTopic(data, entry.topic);
        if (existing) {
          data.entries[data.entries.indexOf(existing)] = entry;
        } else {
          data.entries.push(entry);
        }
        ctx.store.addEvent(existing ? 'entry_updated' : 'entry_created', entry.id);
        results.push({ created: !existing, entry });
      }
      ctx.store.persist();
      const created = results.filter((r) => r.created).length;
      return ok(res, { created, updated: results.length - created, items: results.map((r) => r.entry) }), true;
    }

    const entryMatch = pathname.match(/^\/api\/entries\/([^/]+)$/);
    if (entryMatch) {
      const id = decodeURIComponent(entryMatch[1]);
      const entry = data.entries.find((e) => e.id === id || e.external_id === id);
      if (!entry) return fail(res, 404, 'not_found', `找不到条目 ${id}`), true;

      if (method === 'GET') {
        return ok(res, { entry, practice: practiceOf(data, entry.id) }), true;
      }
      if (method === 'PATCH' || method === 'PUT') {
        if (!authed) return fail(res, 401, 'unauthorized', '需要令牌才能修改'), true;
        const body = await readBody(req);
        const updated = normalizeEntry(body, entry);
        if (!topicOf(data, updated.topic)) ensureTopic(data, updated.topic);
        data.entries[data.entries.indexOf(entry)] = updated;
        ctx.store.addEvent('entry_updated', updated.id);
        ctx.store.persist();
        return ok(res, updated), true;
      }
      if (method === 'DELETE') {
        if (!authed) return fail(res, 401, 'unauthorized', '需要令牌才能删除'), true;
        data.entries = data.entries.filter((e) => e.id !== entry.id);
        const orphan = data.practice.filter((p) => p.entry_id === entry.id);
        data.practice = data.practice.filter((p) => p.entry_id !== entry.id);
        ctx.store.remove('entries', entry.id);
        for (const p of orphan) ctx.store.remove('practice', p.id);
        pruneEmptyTopics(data, ctx.store);
        ctx.store.persist();
        return ok(res, { deleted: entry.id, practice_deleted: orphan.length }), true;
      }
      return fail(res, 405, 'method_not_allowed', '不支持的方法'), true;
    }

    const reviewMatch = pathname.match(/^\/api\/entries\/([^/]+)\/review$/);
    if (reviewMatch) {
      if (method !== 'POST') return fail(res, 405, 'method_not_allowed', '只支持 POST'), true;
      if (!authed) return fail(res, 401, 'unauthorized', '需要令牌'), true;
      const id = decodeURIComponent(reviewMatch[1]);
      const entry = data.entries.find((e) => e.id === id || e.external_id === id);
      if (!entry) return fail(res, 404, 'not_found', `找不到条目 ${id}`), true;
      const body = await readBody(req);
      entry.review = scheduleReview(entry.review, body.grade);
      entry.updated_at = iso();
      ctx.store.addEvent('review', entry.id);
      ctx.store.persist();
      return ok(res, { entry }), true;
    }

    /* ---------- 主题 ---------- */
    if (pathname === '/api/topics') {
      if (method === 'GET') {
        const stats = computeStats(data);
        return ok(res, data.topics.map((t) => enrichTopic(data, t, stats))), true;
      }
      if (method === 'POST') {
        if (!authed) return fail(res, 401, 'unauthorized', '需要令牌'), true;
        const body = await readBody(req);
        const name = str(body.name, 80).trim();
        if (!name) return fail(res, 400, 'invalid', 'name 不能为空'), true;
        let topic = topicOf(data, name);
        if (!topic) {
          topic = ensureTopic(data, name);
        }
        if (body.summary !== undefined) topic.summary = str(body.summary, 4000);
        if (body.key_points !== undefined) topic.key_points = toList(body.key_points);
        if (body.pitfalls !== undefined) topic.pitfalls = toList(body.pitfalls);
        if (body.color !== undefined) topic.color = str(body.color, 20) || topic.color;
        topic.updated_at = iso();
        ctx.store.addEvent('topic_updated', topic.id);
        ctx.store.persist();
        return ok(res, topic), true;
      }
      return fail(res, 405, 'method_not_allowed', '不支持的方法'), true;
    }

    const topicMatch = pathname.match(/^\/api\/topics\/([^/]+)$/);
    if (topicMatch) {
      const id = decodeURIComponent(topicMatch[1]);
      const topic = data.topics.find((t) => t.id === id || t.name === id);
      if (!topic) return fail(res, 404, 'not_found', `找不到主题 ${id}`), true;
      if (method === 'GET') return ok(res, topic), true;
      if (method === 'PATCH' || method === 'PUT') {
        if (!authed) return fail(res, 401, 'unauthorized', '需要令牌'), true;
        const body = await readBody(req);
        if (body.summary !== undefined) topic.summary = str(body.summary, 4000);
        if (body.key_points !== undefined) topic.key_points = toList(body.key_points);
        if (body.pitfalls !== undefined) topic.pitfalls = toList(body.pitfalls);
        if (body.color !== undefined) topic.color = str(body.color, 20) || topic.color;
        if (body.name !== undefined && str(body.name).trim()) topic.name = str(body.name, 80).trim();
        topic.updated_at = iso();
        ctx.store.addEvent('topic_updated', topic.id);
        ctx.store.persist();
        return ok(res, topic), true;
      }
      if (method === 'DELETE') {
        if (!authed) return fail(res, 401, 'unauthorized', '需要令牌'), true;
        data.topics = data.topics.filter((t) => t.id !== topic.id);
        ctx.store.remove('topics', topic.name);
        ctx.store.persist();
        return ok(res, { deleted: topic.id }), true;
      }
      return fail(res, 405, 'method_not_allowed', '不支持的方法'), true;
    }

    /* ---------- 练习 ---------- */
    if (pathname === '/api/practice' && method === 'GET') {
      let list = [...data.practice];
      const topic = searchParams.get('topic');
      const status = searchParams.get('status');
      const entryId = searchParams.get('entry_id');
      if (topic) list = list.filter((p) => p.topic === topic);
      if (status) list = list.filter((p) => p.status === status);
      if (entryId) list = list.filter((p) => p.entry_id === entryId);
      return ok(res, list), true;
    }

    if (pathname === '/api/practice' && method === 'POST') {
      if (!authed) return fail(res, 401, 'unauthorized', '需要令牌'), true;
      const body = await readBody(req);
      const external = body.external_id ? str(body.external_id, 200) : null;
      const existing = external ? data.practice.find((p) => p.external_id === external) : null;
      const practice = normalizePractice(body, existing || null);
      if (!existing) practice.id = ctx.store.uniquePracticeId(practice.topic);
      practice.entry_id = resolveEntryId(data, practice.entry_id);
      if (existing) data.practice[data.practice.indexOf(existing)] = practice;
      else data.practice.push(practice);
      if (!topicOf(data, practice.topic)) ensureTopic(data, practice.topic);
      ctx.store.addEvent('practice_created', practice.id);
      ctx.store.persist();
      return ok(res, { created: !existing, practice }), true;
    }

    const practiceMatch = pathname.match(/^\/api\/practice\/([^/]+)$/);
    if (practiceMatch) {
      const id = decodeURIComponent(practiceMatch[1]);
      const practice = data.practice.find((p) => p.id === id || p.external_id === id);
      if (!practice) return fail(res, 404, 'not_found', `找不到练习 ${id}`), true;
      if (method === 'GET') return ok(res, practice), true;
      if (method === 'PATCH' || method === 'PUT') {
        if (!authed) return fail(res, 401, 'unauthorized', '需要令牌'), true;
        const body = await readBody(req);
        const updated = normalizePractice(body, practice);
        updated.entry_id = resolveEntryId(data, updated.entry_id);
        data.practice[data.practice.indexOf(practice)] = updated;
        ctx.store.persist();
        return ok(res, updated), true;
      }
      if (method === 'DELETE') {
        if (!authed) return fail(res, 401, 'unauthorized', '需要令牌'), true;
        data.practice = data.practice.filter((p) => p.id !== practice.id);
        ctx.store.remove('practice', practice.id);
        ctx.store.persist();
        return ok(res, { deleted: practice.id }), true;
      }
      return fail(res, 405, 'method_not_allowed', '不支持的方法'), true;
    }

    const attemptMatch = pathname.match(/^\/api\/practice\/([^/]+)\/attempt$/);
    if (attemptMatch) {
      if (method !== 'POST') return fail(res, 405, 'method_not_allowed', '只支持 POST'), true;
      if (!authed) return fail(res, 401, 'unauthorized', '需要令牌'), true;
      const id = decodeURIComponent(attemptMatch[1]);
      const practice = data.practice.find((p) => p.id === id || p.external_id === id);
      if (!practice) return fail(res, 404, 'not_found', `找不到练习 ${id}`), true;
      const body = await readBody(req);
      const correct = body.result === 'correct' || body.correct === true;
      practice.attempts = (practice.attempts || 0) + 1;
      if (correct) practice.correct = (practice.correct || 0) + 1;
      practice.last_result = correct ? 'correct' : 'wrong';
      practice.status = 'done';
      practice.updated_at = iso();
      const entry = practice.entry_id ? data.entries.find((e) => e.id === practice.entry_id) : null;
      if (entry) {
        entry.review = scheduleReview(entry.review, correct ? 4 : 2);
        entry.updated_at = iso();
      }
      ctx.store.addEvent('attempt', practice.id);
      ctx.store.persist();
      return ok(res, { practice, entry }), true;
    }

    /* ---------- 批量导入 ---------- */
    if (pathname === '/api/import' && method === 'POST') {
      if (!authed) return fail(res, 401, 'unauthorized', '需要令牌'), true;
      const body = await readBody(req);
      const result = { entries: { created: 0, updated: 0, items: [] }, topics: 0, practice: { created: 0, updated: 0, items: [] } };

      for (const t of body.topics || []) {
        const name = str(t.name, 80).trim();
        if (!name) continue;
        const topic = topicOf(data, name) || ensureTopic(data, name);
        if (t.summary !== undefined) topic.summary = str(t.summary, 4000);
        if (t.key_points !== undefined) topic.key_points = toList(t.key_points);
        if (t.pitfalls !== undefined) topic.pitfalls = toList(t.pitfalls);
        if (t.color !== undefined) topic.color = str(t.color, 20) || topic.color;
        topic.updated_at = iso();
        result.topics += 1;
      }

      for (const raw of body.entries || []) {
        const external = raw.external_id ? str(raw.external_id, 200) : null;
        const existing = external ? data.entries.find((e) => e.external_id === external) : null;
        const entry = normalizeEntry(raw, existing || null);
        if (!existing) entry.id = ctx.store.uniqueEntryId(entry.title);
        if (!topicOf(data, entry.topic)) ensureTopic(data, entry.topic);
        if (existing) data.entries[data.entries.indexOf(existing)] = entry;
        else data.entries.push(entry);
        ctx.store.addEvent(existing ? 'entry_updated' : 'entry_created', entry.id);
        result.entries[existing ? 'updated' : 'created'] += 1;
        result.entries.items.push(entry.id);
      }

      for (const raw of body.practice || []) {
        const external = raw.external_id ? str(raw.external_id, 200) : null;
        const existing = external ? data.practice.find((p) => p.external_id === external) : null;
        const practice = normalizePractice(raw, existing || null);
        if (!existing) practice.id = ctx.store.uniquePracticeId(practice.topic);
        practice.entry_id = resolveEntryId(data, practice.entry_id);
        if (!topicOf(data, practice.topic)) ensureTopic(data, practice.topic);
        if (existing) data.practice[data.practice.indexOf(existing)] = practice;
        else data.practice.push(practice);
        result.practice[existing ? 'updated' : 'created'] += 1;
        result.practice.items.push(practice.id);
      }

      ctx.store.persist();
      return ok(res, result), true;
    }

    /* ---------- 导出 ---------- */
    if (pathname === '/api/export' && method === 'GET') {
      const format = searchParams.get('format') || 'json';
      if (format === 'markdown') {
        const md = toMarkdown(data);
        res.writeHead(200, {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': 'attachment; filename="tiji-export.md"',
        });
        res.end(md);
        return true;
      }
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="tiji-export.json"',
      });
      res.end(JSON.stringify({ exported_at: iso(), ...data }, null, 2));
      return true;
    }

    /* ---------- 文件同步 ---------- */
    if (pathname === '/api/reload' && method === 'POST') {
      ctx.store.reload();
      return ok(res, { ...publicMeta(ctx), errors: ctx.store.errors }), true;
    }

    if (pathname === '/api/open-folder' && method === 'POST') {
      const dir = ctx.store.contentDir;
      if (process.platform === 'win32') exec(`explorer.exe "${dir}"`, () => {});
      else if (process.platform === 'darwin') exec(`open "${dir}"`, () => {});
      else exec(`xdg-open "${dir}"`, () => {});
      return ok(res, { opened: dir }), true;
    }

    /* ---------- 管理 ---------- */
    if (pathname === '/api/admin/reset' && method === 'POST') {
      if (!authed) return fail(res, 401, 'unauthorized', '需要令牌'), true;
      const body = await readBody(req);
      const mode = body.mode === 'sample' ? 'sample' : 'empty';
      for (const e of [...ctx.store.data.entries]) ctx.store.remove('entries', e.id);
      for (const p of [...ctx.store.data.practice]) ctx.store.remove('practice', p.id);
      for (const t of [...ctx.store.data.topics]) ctx.store.remove('topics', t.name);

      if (mode === 'sample') {
        const { makeSeed } = require('./seed');
        ctx.store.data = makeSeed();
      } else {
        ctx.store.data.entries = [];
        ctx.store.data.practice = [];
        ctx.store.data.topics = [];
        ctx.store.data.events = [];
      }
      ctx.store.persist();
      return ok(res, { mode, counts: publicMeta(ctx).counts }), true;
    }

    return fail(res, 404, 'not_found', `未知接口 ${method} ${pathname}，可访问 GET /api 查看契约`), true;
  } catch (error) {
    const status = error.statusCode || 500;
    return fail(res, status, status === 400 ? 'invalid' : 'error', error.message || '服务器错误'), true;
  }
}

function toMarkdown(data) {
  const lines = [];
  lines.push(`# 题迹 · 学习记录导出`);
  lines.push('');
  lines.push(`导出时间：${new Date().toLocaleString('zh-CN')}`);
  lines.push('');
  const byTopic = new Map();
  for (const e of data.entries) {
    const k = e.topic || '未分类';
    if (!byTopic.has(k)) byTopic.set(k, []);
    byTopic.get(k).push(e);
  }
  for (const [topic, entries] of byTopic) {
    lines.push(`## ${topic}`);
    lines.push('');
    for (const e of entries) {
      const label = TYPE_LABEL[e.type] || e.type;
      lines.push(`### ${e.title}　\`${label}\`${'★'.repeat(e.difficulty || 1)}`);
      lines.push('');
      if (e.question) lines.push(`**问题**：${e.question}`, '');
      if (e.my_attempt) lines.push(`**当时的思路**：${e.my_attempt}`, '');
      if (e.root_cause) lines.push(`**错因**：${e.root_cause}`, '');
      if (e.solution) lines.push(`**解法**：${e.solution}`, '');
      if (e.code_before) {
        lines.push('**错误代码**', '', '```' + (e.language || ''), e.code_before, '```', '');
      }
      if (e.code_after) {
        lines.push('**修正后**', '', '```' + (e.language || ''), e.code_after, '```', '');
      }
      if (e.takeaway) lines.push(`> ${e.takeaway}`, '');
      lines.push('');
    }
  }
  lines.push('---', '', '## 补充练习', '');
  for (const p of data.practice) {
    lines.push(`### [${p.topic}] ${p.prompt.split('\n')[0]}`);
    lines.push('');
    lines.push(p.prompt, '');
    if (p.answer) lines.push('<details><summary>查看答案</summary>', '', p.answer, '', '</details>', '');
  }
  return lines.join('\n');
}

module.exports = { handleApi, contract };
