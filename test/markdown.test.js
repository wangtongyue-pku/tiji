'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const md = require('../src/markdown.js');

const SAMPLE = [
  '---',
  'title: SQL 里用 = NULL 判断空值永远不成立',
  'type: bug',
  'topic: 数据库',
  'tags: [sql, null]',
  'difficulty: 1',
  'status: learning',
  'language: sql',
  '---',
  '',
  '# SQL 里用 = NULL 判断空值永远不成立',
  '',
  '## 原始问题',
  '为什么 WHERE email = NULL 查不到数据？',
  '',
  '## 当时的思路',
  '以为 NULL 是普通值。',
  '',
  '## 错因',
  '结果永远是 UNKNOWN。',
  '',
  '## 解法',
  '用 IS NULL。',
  '',
  '## 心法',
  'NULL 不是值。',
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
].join('\n');

test('解析标准条目', () => {
  const { entry, errors } = md.entryFromMarkdown(SAMPLE, 'x');
  assert.deepEqual(errors, []);
  assert.equal(entry.title, 'SQL 里用 = NULL 判断空值永远不成立');
  assert.equal(entry.type, 'bug');
  assert.equal(entry.topic, '数据库');
  assert.deepEqual(entry.tags, ['sql', 'null']);
  assert.equal(entry.difficulty, 1);
  assert.equal(entry.language, 'sql');
  assert.equal(entry.question, '为什么 WHERE email = NULL 查不到数据？');
  assert.equal(entry.my_attempt, '以为 NULL 是普通值。');
  assert.equal(entry.root_cause, '结果永远是 UNKNOWN。');
  assert.equal(entry.solution, '用 IS NULL。');
  assert.equal(entry.takeaway, 'NULL 不是值。');
  assert.equal(entry.code_before, 'SELECT * FROM users WHERE email = NULL;');
  assert.equal(entry.code_after, 'SELECT * FROM users WHERE email IS NULL;');
});

test('条目可以往返序列化', () => {
  const { entry } = md.entryFromMarkdown(SAMPLE, 'round-trip');
  entry.id = 'round-trip';
  const text = md.entryToMarkdown(entry);
  const parsed = md.entryFromMarkdown(text, 'round-trip').entry;
  assert.equal(parsed.title, entry.title);
  assert.equal(parsed.topic, entry.topic);
  assert.deepEqual(parsed.tags, entry.tags);
  assert.equal(parsed.question, entry.question);
  assert.equal(parsed.takeaway, entry.takeaway);
  assert.equal(parsed.code_after, entry.code_after);
});

test('标题别名与括号后缀都能识别', () => {
  const text = [
    '---',
    'title: 别名测试',
    'type: gap',
    'topic: 测试',
    '---',
    '## 原始问题（我的提问）',
    '问题内容',
    '## 当时的思路（错在哪）',
    '思路内容',
    '## 真正的原因',
    '原因内容',
    '## 一句话心法',
    '心法内容',
  ].join('\n');
  const { entry } = md.entryFromMarkdown(text, 'y');
  assert.equal(entry.question, '问题内容');
  assert.equal(entry.my_attempt, '思路内容');
  assert.equal(entry.root_cause, '原因内容');
  assert.equal(entry.takeaway, '心法内容');
});

test('没有标题时报错', () => {
  const { errors } = md.entryFromMarkdown('## 原始问题\n随便写点', 'z');
  assert.ok(errors.length > 0);
});

test('未知小节不会丢失，会放进补充', () => {
  const text = ['---', 'title: 附加内容', 'type: concept', 'topic: 测试', '---', '## 我的推导', '推导过程'].join('\n');
  const { entry } = md.entryFromMarkdown(text, 'w');
  assert.match(entry.extra, /我的推导/);
});

test('主题与练习的往返', () => {
  const topic = {
    name: '概率与统计',
    color: '#7c3aed',
    summary: '条件概率的方向容易反。',
    key_points: ['P(A|B) ≠ P(B|A)', '先验很重要'],
    pitfalls: ['忽略基础发生率'],
  };
  const topicText = md.topicToMarkdown(topic);
  const back = md.topicFromMarkdown(topicText, '概率与统计').topic;
  assert.equal(back.name, topic.name);
  assert.equal(back.summary, topic.summary);
  assert.deepEqual(back.key_points, topic.key_points);
  assert.deepEqual(back.pitfalls, topic.pitfalls);

  const practice = {
    topic: '概率与统计',
    kind: 'math',
    difficulty: 3,
    entry_id: 'bayes',
    prompt: '患者阳性后真正患病的概率是多少？',
    hint: '用十万人表格',
    answer: '约 1.9%',
  };
  const pText = md.practiceToMarkdown(practice);
  const pBack = md.practiceFromMarkdown(pText, 'p1').practice;
  assert.equal(pBack.topic, practice.topic);
  assert.equal(pBack.kind, 'math');
  assert.equal(pBack.entry_id, 'bayes');
  assert.equal(pBack.prompt, practice.prompt);
  assert.equal(pBack.answer, practice.answer);
});
