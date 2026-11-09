'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SERVER = path.join(__dirname, '..', 'server.js');

function startServer() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tiji-http-'));
  const contentDir = path.join(root, 'content');
  const configFile = path.join(root, 'config.json');

  const child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      TIJI_PORT: '0',
      TIJI_HOST: '127.0.0.1',
      TIJI_CONTENT_DIR: contentDir,
      TIJI_CONFIG: configFile,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const ready = new Promise((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => reject(new Error(`服务器启动超时：\n${out}`)), 15000);
    child.stdout.on('data', (chunk) => {
      out += chunk.toString();
      const line = out.split('\n').find((l) => l.startsWith('TIJI_READY '));
      if (line) {
        clearTimeout(timer);
        resolve(line.slice('TIJI_READY '.length).trim());
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`服务器提前退出（code=${code}）：\n${out}`));
    });
  });

  return { root, contentDir, configFile, child, ready };
}

test('服务能启动、能读接口、能写入文件', async (t) => {
  const server = startServer();
  const baseUrl = await server.ready;

  t.after(() => {
    server.child.kill();
    fs.rmSync(server.root, { recursive: true, force: true });
  });

  const health = await fetch(`${baseUrl}/api/health`).then((r) => r.json());
  assert.equal(health.data.status, 'ok');

  const snapshot = await fetch(`${baseUrl}/api/snapshot`).then((r) => r.json());
  assert.ok(snapshot.data.entries.length >= 5, '首次启动应该带示例数据');
  assert.equal(snapshot.data.meta.parse_errors.length, 0);

  // 首页下发登录 cookie
  const page = await fetch(`${baseUrl}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('set-cookie') || '', /tiji_token=/);

  // 用令牌写一条，确认写入落成 .md 文件
  const { token } = JSON.parse(fs.readFileSync(server.configFile, 'utf8'));
  const created = await fetch(`${baseUrl}/api/entries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      title: 'HTTP 测试条目',
      type: 'gap',
      topic: '测试主题',
      question: '测试能写进去吗？',
    }),
  }).then((r) => r.json());

  assert.equal(created.ok, true);
  const id = created.data.items[0].id;
  const file = path.join(server.contentDir, 'entries', `${id}.md`);
  assert.ok(fs.existsSync(file), `应该写出 ${file}`);

  // 不带令牌必须被拒
  const unauth = await fetch(`${baseUrl}/api/entries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '不该成功' }),
  });
  assert.equal(unauth.status, 401);
});

test('外部改文件后，接口能立刻读到', async (t) => {
  const server = startServer();
  const baseUrl = await server.ready;
  t.after(() => {
    server.child.kill();
    fs.rmSync(server.root, { recursive: true, force: true });
  });

  const file = path.join(server.contentDir, 'entries', 'hand-written-by-ai.md');
  fs.writeFileSync(
    file,
    [
      '---',
      'title: AI 直接写的条目',
      'type: misconception',
      'topic: 概率与统计',
      '---',
      '',
      '# AI 直接写的条目',
      '',
      '## 原始问题',
      '条件概率方向搞反了。',
    ].join('\n'),
    'utf8'
  );

  // 文件监听是异步的，轮询等待
  const deadline = Date.now() + 8000;
  let found = null;
  while (Date.now() < deadline) {
    const snapshot = await fetch(`${baseUrl}/api/snapshot`).then((r) => r.json());
    found = snapshot.data.entries.find((e) => e.id === 'hand-written-by-ai');
    if (found) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(found, '外部新增的文件应该在几秒内出现在接口里');
  assert.equal(found.title, 'AI 直接写的条目');
});
