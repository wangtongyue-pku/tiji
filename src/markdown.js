'use strict';

/**
 * Markdown ⇄ 记录 的转换。
 *
 * 每个条目一个 .md 文件：
 *   ---
 *   title: ...
 *   type: bug
 *   ...
 *   ---
 *   ## 原始问题
 *   ...
 *
 * 解析刻意做得宽容：标题支持中文别名与英文别名，代码块自动识别语言，
 * 也接受用 `# 标题` 代替 frontmatter 里的 title。
 */

const ENTRY_SECTIONS = {
  question: ['原始问题', '问题', '我的问题', 'question'],
  my_attempt: ['当时的思路', '我的思路', '错误思路', '思路', 'attempt', 'my_attempt'],
  root_cause: ['错因', '真正的错因', '真正的原因', '根本原因', '出错原因', '错误原因', '原因', 'cause', 'root_cause'],
  solution: ['解法', '正确解法', '正确做法', 'solution'],
  takeaway: ['心法', '一句话心法', 'takeaway'],
  code_before: ['原始代码', '错误代码', '有问题的代码', 'code_before'],
  code_after: ['修正后', '修正后代码', '正确代码', 'code_after'],
};

const PRACTICE_SECTIONS = {
  prompt: ['题目', '问题', 'prompt'],
  hint: ['提示', 'hint'],
  answer: ['答案', '解析', 'answer'],
};

const TOPIC_SECTIONS = {
  summary: ['总结', '主题总结', 'summary'],
  key_points: ['要点', 'key_points'],
  pitfalls: ['常见坑', '常犯的坑', '坑', 'pitfalls'],
};

const CODE_FIELDS = new Set(['code_before', 'code_after']);

/* ------------------------------- frontmatter ------------------------------- */

function parseScalar(raw) {
  const v = raw.trim();
  if (!v) return '';
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

function parseFrontmatter(text) {
  const lines = text.split('\n');
  if (!lines.length || lines[0].trim() !== '---') return { meta: {}, body: text, hasFrontmatter: false };

  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) return { meta: {}, body: text, hasFrontmatter: false };

  const meta = {};
  let currentKey = null;
  for (let i = 1; i < end; i += 1) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const listItem = line.match(/^\s*-\s+(.*)$/);
    if (listItem && currentKey) {
      if (!Array.isArray(meta[currentKey])) meta[currentKey] = [];
      meta[currentKey].push(parseScalar(listItem[1]));
      continue;
    }

    const kv = line.match(/^([A-Za-z0-9_\u4e00-\u9fa5-]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1].trim();
    const rest = kv[2].trim();

    if (!rest) {
      meta[key] = [];
      currentKey = key;
      continue;
    }
    currentKey = key;
    if (rest.startsWith('[') && rest.endsWith(']')) {
      meta[key] = rest
        .slice(1, -1)
        .split(',')
        .map((s) => parseScalar(s))
        .filter(Boolean);
    } else {
      meta[key] = parseScalar(rest);
    }
  }

  return { meta, body: lines.slice(end + 1).join('\n'), hasFrontmatter: true };
}

/* ------------------------------- 正文分段 ------------------------------- */

function splitSections(body) {
  const lines = body.split('\n');
  const sections = [];
  let current = { heading: null, lines: [] };

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    const h1 = line.match(/^#\s+(.+?)\s*$/);
    if (h2) {
      sections.push(current);
      current = { heading: h2[1].trim(), lines: [] };
    } else if (h1 && !sections.length && !current.heading && !current.lines.join('').trim()) {
      current = { heading: null, h1: h1[1].trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);
  return sections;
}

function extractCode(raw) {
  const text = raw.trim();
  const fence = text.match(/^```([A-Za-z0-9+#-]*)\n([\s\S]*?)\n?```$/);
  if (fence) return { language: fence[1] || '', code: fence[2].replace(/\s+$/, '') };
  return { language: '', code: text };
}

function normalizeHeading(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[（(].*?[)）]/g, '')
    .replace(/[\s:：、,，.。!！?？]/g, '')
    .trim();
}

function mapSections(sections, map) {
  const out = {};
  let title = '';
  const extra = [];

  for (const section of sections) {
    if (section.h1) title = section.h1;
    if (!section.heading) {
      const text = section.lines.join('\n').trim();
      if (text) extra.push(text);
      continue;
    }
    const heading = normalizeHeading(section.heading);
    let matched = null;
    for (const [field, aliases] of Object.entries(map)) {
      if (aliases.some((a) => normalizeHeading(a) === heading || (heading.length > 2 && heading.startsWith(normalizeHeading(a))))) {
        matched = field;
        break;
      }
    }
    if (matched) {
      out[matched] = section.lines.join('\n').trim();
    } else {
      extra.push(`## ${section.heading}\n${section.lines.join('\n').trim()}`);
    }
  }
  if (extra.length) out._extra = extra.join('\n\n');
  return { fields: out, title };
}

/* ------------------------------- 条目 ------------------------------- */

function entryFromMarkdown(raw, fallbackId) {
  const { meta, body } = parseFrontmatter(raw.replace(/\r\n/g, '\n'));
  const { fields, title } = mapSections(splitSections(body), ENTRY_SECTIONS);
  const errors = [];

  const titleText = String(meta.title || meta.标题 || title || '').trim();
  if (!titleText) errors.push('缺少 title（frontmatter 或 # 标题）');

  const before = CODE_FIELDS.has('code_before') ? extractCode(fields.code_before || '') : null;
  const after = CODE_FIELDS.has('code_after') ? extractCode(fields.code_after || '') : null;

  const lang = String(meta.language || meta.lang || (before && before.language) || (after && after.language) || '').trim();

  const entry = {
    id: String(meta.id || fallbackId).trim(),
    external_id: String(meta.external_id || '').trim() || null,
    title: titleText,
    type: String(meta.type || meta.类型 || 'concept').trim(),
    topic: String(meta.topic || meta.主题 || '未分类').trim() || '未分类',
    tags: Array.isArray(meta.tags) ? meta.tags : String(meta.tags || '').split(/[,，]/).filter(Boolean),
    difficulty: Number(meta.difficulty || meta.难度) || 2,
    status: String(meta.status || meta.状态 || 'new').trim(),
    occurrences: Number(meta.occurrences || meta.次数) || 1,
    question: fields.question || '',
    my_attempt: fields.my_attempt || '',
    root_cause: fields.root_cause || '',
    solution: fields.solution || '',
    takeaway: fields.takeaway || '',
    language: lang,
    code_before: before ? before.code : '',
    code_after: after ? after.code : '',
    source: String(meta.source || meta.来源 || '').trim(),
    created_at: String(meta.created_at || meta.created || '').trim() || null,
    extra: fields._extra || '',
  };
  return { entry, errors };
}

function entryToMarkdown(entry) {
  const head = [
    '---',
    `title: ${quote(entry.title)}`,
    entry.external_id ? `external_id: ${quote(entry.external_id)}` : null,
    `type: ${entry.type}`,
    `topic: ${quote(entry.topic)}`,
    `tags: [${(entry.tags || []).join(', ')}]`,
    `difficulty: ${entry.difficulty}`,
    `status: ${entry.status}`,
    `occurrences: ${entry.occurrences}`,
    entry.language ? `language: ${entry.language}` : null,
    entry.source ? `source: ${quote(entry.source)}` : null,
    entry.created_at ? `created_at: ${entry.created_at}` : null,
    '---',
    '',
    `# ${entry.title}`,
    '',
  ].filter((l) => l !== null);

  const body = [];
  const section = (title, text) => {
    if (!text || !String(text).trim()) return;
    body.push(`## ${title}`, '', String(text).trim(), '');
  };

  section('原始问题', entry.question);
  section('当时的思路', entry.my_attempt);
  section('错因', entry.root_cause);
  section('解法', entry.solution);
  section('心法', entry.takeaway);

  if (entry.code_before) {
    body.push('## 原始代码', '', '```' + (entry.language || ''), entry.code_before.replace(/\s+$/, ''), '```', '');
  }
  if (entry.code_after) {
    body.push('## 修正后', '', '```' + (entry.language || ''), entry.code_after.replace(/\s+$/, ''), '```', '');
  }
  if (entry.extra) body.push('## 补充', '', entry.extra, '');

  return `${head.join('\n')}\n${body.join('\n')}`.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

/* ------------------------------- 练习 ------------------------------- */

function practiceFromMarkdown(raw, fallbackId) {
  const { meta, body } = parseFrontmatter(raw.replace(/\r\n/g, '\n'));
  const { fields } = mapSections(splitSections(body), PRACTICE_SECTIONS);
  const errors = [];
  if (!fields.prompt) errors.push('缺少「## 题目」');

  return {
    practice: {
      id: String(meta.id || fallbackId).trim(),
      entry_id: String(meta.entry || meta.entry_id || '').trim() || null,
      topic: String(meta.topic || '未分类').trim() || '未分类',
      kind: meta.kind === 'math' ? 'math' : 'code',
      difficulty: Number(meta.difficulty) || 2,
      prompt: fields.prompt || '',
      hint: fields.hint || '',
      answer: fields.answer || '',
    },
    errors,
  };
}

function practiceToMarkdown(p) {
  const head = [
    '---',
    `topic: ${quote(p.topic)}`,
    `kind: ${p.kind}`,
    `difficulty: ${p.difficulty}`,
    p.entry_id ? `entry: ${p.entry_id}` : null,
    '---',
    '',
  ].filter((l) => l !== null);
  const body = ['## 题目', '', p.prompt.trim(), ''];
  if (p.hint) body.push('## 提示', '', p.hint.trim(), '');
  if (p.answer) body.push('## 答案', '', p.answer.trim(), '');
  return `${head.join('\n')}\n${body.join('\n')}`.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

/* ------------------------------- 主题 ------------------------------- */

function topicFromMarkdown(raw, fallbackName) {
  const { meta, body } = parseFrontmatter(raw.replace(/\r\n/g, '\n'));
  const { fields } = mapSections(splitSections(body), TOPIC_SECTIONS);
  const list = (text) =>
    String(text || '')
      .split('\n')
      .map((l) => l.replace(/^\s*[-*]\s+/, '').trim())
      .filter(Boolean);

  return {
    topic: {
      name: String(meta.name || meta.名称 || fallbackName).trim(),
      color: String(meta.color || '#6366f1').trim(),
      summary: fields.summary || '',
      key_points: list(fields.key_points),
      pitfalls: list(fields.pitfalls),
    },
    errors: [],
  };
}

function topicToMarkdown(t) {
  const head = ['---', `name: ${quote(t.name)}`, `color: ${t.color || '#6366f1'}`, '---', ''];
  const body = [];
  if (t.summary) body.push('## 总结', '', t.summary.trim(), '');
  if ((t.key_points || []).length) body.push('## 要点', '', ...t.key_points.map((k) => `- ${k}`), '');
  if ((t.pitfalls || []).length) body.push('## 常见坑', '', ...t.pitfalls.map((k) => `- ${k}`), '');
  return `${head.join('\n')}\n${body.join('\n')}`.trimEnd() + '\n';
}

/* ------------------------------- 工具 ------------------------------- */

function quote(value) {
  const s = String(value == null ? '' : value);
  if (/^[\w\u4e00-\u9fa5\-./ ()（）]+$/.test(s) && !/^\s|\s$/.test(s) && !s.includes(': ')) return s;
  return JSON.stringify(s);
}

module.exports = {
  entryFromMarkdown,
  entryToMarkdown,
  practiceFromMarkdown,
  practiceToMarkdown,
  topicFromMarkdown,
  topicToMarkdown,
  parseFrontmatter,
};
