'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { FileStore } = require('../src/filestore.js');

function tempStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tiji-test-'));
  const store = new FileStore(root, path.join(root, 'content'));
  store.init();
  return { root, store };
}

test('空目录初始化后是空的', () => {
  const { store } = tempStore();
  assert.equal(store.isEmpty, true);
  assert.deepEqual(store.errors, []);
});

test('写入后能在磁盘上看到文件，重新加载能读回', () => {
  const { store } = tempStore();
  store.data.entries.push({
    id: 'demo',
    title: '演示条目',
    type: 'bug',
    topic: 'Python 基础',
    tags: ['demo'],
    difficulty: 2,
    status: 'learning',
    occurrences: 1,
    question: '为什么会这样？',
    my_attempt: '',
    root_cause: '真正的原因',
    solution: '正确做法',
    takeaway: '心法',
    language: 'python',
    code_before: 'print(1)',
    code_after: 'print(2)',
    source: '',
    created_at: new Date().toISOString(),
    review: { last_at: null, next_at: new Date().toISOString(), interval: 1, ease: 2.5, streak: 0 },
  });
  store.persist();

  const file = path.join(store.entriesDir, 'demo.md');
  assert.ok(fs.existsSync(file), '应该写出 demo.md');
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /title: 演示条目/);

  const again = new FileStore(store.root, store.contentDir);
  again.init();
  assert.equal(again.data.entries.length, 1);
  assert.equal(again.data.entries[0].title, '演示条目');
  assert.equal(again.data.entries[0].id, 'demo');
});

test('直接改文件，重新扫描后内容跟着变', () => {
  const { store } = tempStore();
  const dir = store.entriesDir;
  fs.writeFileSync(
    path.join(dir, 'handwritten.md'),
    ['---', 'title: 手写条目', 'type: gap', 'topic: 线性代数', '---', '', '# 手写条目', '', '## 原始问题', '手写的'].join('\n'),
    'utf8'
  );

  store.reload();
  assert.equal(store.data.entries.length, 1);
  assert.equal(store.data.entries[0].title, '手写条目');

  fs.unlinkSync(path.join(dir, 'handwritten.md'));
  store.reload();
  assert.equal(store.data.entries.length, 0);
});

test('格式错误的文件不会让加载失败，而是记进 errors', () => {
  const { store } = tempStore();
  fs.writeFileSync(path.join(store.entriesDir, 'broken.md'), '## 原始问题\n没有标题', 'utf8');
  store.reload();
  assert.equal(store.data.entries.length, 0);
  assert.equal(store.errors.length, 1);
  assert.match(store.errors[0].file, /broken\.md$/);
});

test('复习进度保存在 .state 里，不会被条目文件覆盖', () => {
  const { store } = tempStore();
  fs.writeFileSync(
    path.join(store.entriesDir, 'reviewed.md'),
    ['---', 'title: 复习测试', 'type: gap', 'topic: 测试', '---', '', '# 复习测试'].join('\n'),
    'utf8'
  );
  store.reload();
  store.data.entries[0].review = {
    last_at: new Date().toISOString(),
    next_at: new Date(Date.now() + 86400000).toISOString(),
    interval: 6,
    ease: 2.6,
    streak: 2,
  };
  store.persist();

  const again = new FileStore(store.root, store.contentDir);
  again.init();
  assert.equal(again.data.entries[0].review.interval, 6);
  assert.equal(again.data.entries[0].review.streak, 2);
});
