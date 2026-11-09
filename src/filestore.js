'use strict';

const fs = require('node:fs');
const path = require('node:path');
const md = require('./markdown');

const iso = (d = new Date()) => d.toISOString();
const SAFE = /^[^\\/:*?"<>|]+$/;

function safeName(name, fallback) {
  const s = String(name || '').trim();
  if (s && SAFE.test(s) && !s.startsWith('.')) return s;
  return fallback;
}

function slugify(title) {
  const ascii = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  if (ascii.length >= 3) return ascii;
  // 中文标题直接用标题做文件名（NTFS 支持，URL 会做编码）
  const cn = String(title || '')
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  if (cn.length >= 2) return cn;
  const d = new Date();
  const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `note-${day}-${Math.random().toString(16).slice(2, 6)}`;
}

/**
 * 文件夹即数据库。
 *
 *   content/entries/<id>.md     一条问题
 *   content/topics/<名字>.md    一个知识主题
 *   content/practice/<id>.md    一道练习
 *   content/site.json           个人资料
 *   content/.state/             复习进度、作答记录、活动流水（机器维护，别手改）
 *
 * 任何程序（包括 ChatGPT）直接增删改这些 .md 文件，站点都会自动同步。
 */
class FileStore {
  constructor(root, contentDir) {
    this.root = root;
    this.contentDir = contentDir || path.join(root, 'content');
    this.entriesDir = path.join(this.contentDir, 'entries');
    this.topicsDir = path.join(this.contentDir, 'topics');
    this.practiceDir = path.join(this.contentDir, 'practice');
    this.stateDir = path.join(this.contentDir, '.state');
    this.siteFile = path.join(this.contentDir, 'site.json');
    this.stateFile = path.join(this.stateDir, 'state.json');
    this.eventsFile = path.join(this.stateDir, 'events.json');

    this.data = null;
    this.errors = [];
    this.paths = { entries: new Map(), topics: new Map(), practice: new Map() };
    this.muteUntil = 0;
  }

  init() {
    for (const dir of [this.entriesDir, this.topicsDir, this.practiceDir, this.stateDir]) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.reload();
    return this;
  }

  get isEmpty() {
    return !this.data.entries.length && !this.data.topics.length && !this.data.practice.length;
  }

  /* ----------------------------- 读取 ----------------------------- */

  reload() {
    const errors = [];
    const state = readJson(this.stateFile, { review: {}, practice: {} });
    const events = readJson(this.eventsFile, []);
    const profile = readJson(this.siteFile, null) || defaultProfile();

    const entries = [];
    const topics = [];
    const practice = [];
    this.paths = { entries: new Map(), topics: new Map(), practice: new Map() };

    for (const file of listMarkdown(this.entriesDir)) {
      const raw = fs.readFileSync(file, 'utf8');
      const id = path.basename(file, '.md');
      const { entry, errors: errs } = md.entryFromMarkdown(raw, id);
      if (errs.length) {
        errors.push({ file: rel(file), message: errs.join('；') });
        continue;
      }
      entry.id = safeName(entry.id || id, id);
      const st = fs.statSync(file);
      entry.created_at = entry.created_at || st.birthtime.toISOString();
      entry.updated_at = st.mtime.toISOString();
      entry.review = state.review[entry.id] || defaultReview();
      entry.file = rel(file);
      entries.push(entry);
      this.paths.entries.set(entry.id, file);
    }

    for (const file of listMarkdown(this.topicsDir)) {
      const raw = fs.readFileSync(file, 'utf8');
      const name = path.basename(file, '.md');
      const { topic } = md.topicFromMarkdown(raw, name);
      topic.id = topic.name;
      topics.push(topic);
      this.paths.topics.set(topic.name, file);
    }

    for (const file of listMarkdown(this.practiceDir)) {
      const raw = fs.readFileSync(file, 'utf8');
      const id = path.basename(file, '.md');
      const { practice: p, errors: errs } = md.practiceFromMarkdown(raw, id);
      if (errs.length) {
        errors.push({ file: rel(file), message: errs.join('；') });
        continue;
      }
      p.id = safeName(p.id || id, id);
      const st = state.practice[p.id] || {};
      p.status = st.status || 'todo';
      p.attempts = st.attempts || 0;
      p.correct = st.correct || 0;
      p.last_result = st.last_result || null;
      const pst = fs.statSync(file);
      p.created_at = pst.birthtime.toISOString();
      p.updated_at = pst.mtime.toISOString();
      p.file = rel(file);
      practice.push(p);
      this.paths.practice.set(p.id, file);
    }

    for (const e of entries) {
      const type = ['bug', 'misconception', 'gap', 'concept'].includes(e.type) ? e.type : 'concept';
      if (type !== e.type) e.type = type;
      if (!['new', 'learning', 'mastered'].includes(e.status)) e.status = 'new';
      e.difficulty = Math.min(5, Math.max(1, Math.round(e.difficulty || 2)));
      e.occurrences = Math.max(1, Math.round(e.occurrences || 1));
      e.review = normalizeReview(e.review);
    }

    this.data = {
      version: 2,
      profile,
      entries,
      topics,
      practice,
      events: Array.isArray(events) ? events : [],
    };
    this.errors = errors;
    this.stamp = [dirStamp(this.entriesDir), dirStamp(this.topicsDir), dirStamp(this.practiceDir)].join('|');
  }

  /* ----------------------------- 写入 ----------------------------- */

  persist() {
    fs.mkdirSync(this.entriesDir, { recursive: true });
    this.muteUntil = Date.now() + 700;

    for (const entry of this.data.entries) {
      const file = this.paths.entries.get(entry.id) || path.join(this.entriesDir, `${safeName(entry.id, slugify(entry.title))}.md`);
      writeIfChanged(file, md.entryToMarkdown(entry));
      this.paths.entries.set(entry.id, file);
    }

    for (const topic of this.data.topics) {
      const file = this.paths.topics.get(topic.name) || path.join(this.topicsDir, `${safeName(topic.name, '未分类')}.md`);
      writeIfChanged(file, md.topicToMarkdown(topic));
      this.paths.topics.set(topic.name, file);
    }

    for (const p of this.data.practice) {
      const file = this.paths.practice.get(p.id) || path.join(this.practiceDir, `${safeName(p.id, slugify(p.prompt))}.md`);
      writeIfChanged(file, md.practiceToMarkdown(p));
      this.paths.practice.set(p.id, file);
    }

    writeIfChanged(this.siteFile, JSON.stringify(this.data.profile, null, 2) + '\n');

    const review = {};
    for (const e of this.data.entries) review[e.id] = e.review;
    const pstate = {};
    for (const p of this.data.practice) {
      pstate[p.id] = { status: p.status, attempts: p.attempts, correct: p.correct, last_result: p.last_result };
    }
    writeIfChanged(this.stateFile, JSON.stringify({ review, practice: pstate }, null, 2) + '\n');
    writeIfChanged(this.eventsFile, JSON.stringify(this.data.events.slice(-1500), null, 2) + '\n');
  }

  remove(kind, id) {
    const file = this.paths[kind].get(id);
    if (file && fs.existsSync(file)) fs.unlinkSync(file);
    this.paths[kind].delete(id);
    this.muteUntil = Date.now() + 500;
  }

  addEvent(type, ref) {
    this.data.events.push({ at: iso(), type, ref: ref || null });
    if (this.data.events.length > 4000) this.data.events = this.data.events.slice(-4000);
  }

  /** 给条目分配一个不冲突的文件名 */
  uniqueEntryId(title) {
    const base = slugify(title);
    let id = base;
    let i = 2;
    while (this.paths.entries.has(id) || this.data.entries.some((e) => e.id === id)) {
      id = `${base}-${i}`;
      i += 1;
      if (i > 200) {
        id = `${base}-${Date.now().toString(36)}`;
        break;
      }
    }
    return id;
  }

  uniquePracticeId(topic) {
    const base = slugify(topic || 'practice');
    let id = `${base}-1`;
    let i = 2;
    while (this.data.practice.some((p) => p.id === id)) {
      id = `${base}-${i}`;
      i += 1;
    }
    return id;
  }

  findEntry(idOrExternal) {
    return this.data.entries.find((e) => e.id === idOrExternal || e.external_id === idOrExternal);
  }
}

/* ----------------------------- 工具 ----------------------------- */

function defaultProfile() {
  return {
    name: '同学',
    goal: '把问过 AI 的问题真正吃透，而不是收藏了就忘',
    daily_target: 3,
    created_at: iso(),
  };
}

function defaultReview() {
  return {
    last_at: null,
    next_at: iso(new Date(Date.now() + 86400000)),
    interval: 1,
    ease: 2.5,
    streak: 0,
  };
}

function normalizeReview(r) {
  return {
    last_at: r.last_at || null,
    next_at: r.next_at || iso(new Date(Date.now() + 86400000)),
    interval: Number(r.interval) || 1,
    ease: Number(r.ease) || 2.5,
    streak: Number(r.streak) || 0,
  };
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function listMarkdown(dir) {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

function writeIfChanged(file, content) {
  try {
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return false;
  } catch {}
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, file);
  return true;
}

function dirStamp(dir) {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .map((f) => {
        try {
          return f + ':' + fs.statSync(path.join(dir, f)).mtimeMs;
        } catch {
          return f;
        }
      })
      .join(',');
  } catch {
    return '';
  }
}

function rel(file) {
  return path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/');
}

module.exports = { FileStore, slugify, safeName };
