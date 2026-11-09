'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { exec } = require('node:child_process');

const { FileStore } = require('./src/filestore');
const { makeSeed } = require('./src/seed');
const { handleApi } = require('./src/api');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const CONFIG_FILE = process.env.TIJI_CONFIG || path.join(ROOT, 'config.json');
const CONTENT_DIR = process.env.TIJI_CONTENT_DIR || path.join(ROOT, 'content');
const PORT_FROM_ENV = process.env.TIJI_PORT !== undefined;
const HOST_FROM_ENV = process.env.TIJI_HOST !== undefined;
const OPEN_BROWSER = process.argv.includes('--open');

/* ------------------------------- 配置 ------------------------------- */

function loadConfig() {
  let cfg = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch {
      cfg = {};
    }
  }
  const fresh = !fs.existsSync(CONFIG_FILE) || !cfg.token;
  cfg.port = PORT_FROM_ENV ? Number(process.env.TIJI_PORT) : Number(cfg.port) || 4321;
  cfg.host = HOST_FROM_ENV ? String(process.env.TIJI_HOST || '127.0.0.1') : cfg.host || '127.0.0.1';
  cfg.token = cfg.token || crypto.randomBytes(18).toString('hex');
  if (fresh) fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
  return cfg;
}

const config = loadConfig();
const store = new FileStore(ROOT, CONTENT_DIR);

// 单个请求出错不应该让整个站点退出
process.on('uncaughtException', (err) => {
  console.error('未捕获异常（服务继续运行）：', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', (err) => {
  console.error('未处理的 Promise 拒绝（服务继续运行）：', err && err.stack ? err.stack : err);
});

/* ------------------------------- 静态资源 ------------------------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8',
};

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  rel = decodeURIComponent(rel.split('?')[0]);
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403');
    return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

/* ------------------------------- 认证 ------------------------------- */

function timingEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function tokenFrom(req, url) {
  const auth = req.headers.authorization || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  if (req.headers['x-api-token']) return String(req.headers['x-api-token']).trim();
  if (url.searchParams.get('token')) return url.searchParams.get('token');
  const cookies = parseCookies(req.headers.cookie);
  return cookies.tiji_token || null;
}

function isAuthed(req, url) {
  const token = tokenFrom(req, url);
  return !!token && timingEqual(token, config.token);
}

/* ------------------------------- 实时推送 ------------------------------- */

const sseClients = new Set();

function broadcast(reason) {
  const payload = `data: ${JSON.stringify({ type: 'reload', reason, at: new Date().toISOString() })}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

function handleSse(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write('retry: 3000\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
}

setInterval(() => {
  for (const res of sseClients) {
    try {
      res.write(': ping\n\n');
    } catch {
      sseClients.delete(res);
    }
  }
}, 25000).unref();

/* ------------------------------- 文件监听 ------------------------------- */

let reloadTimer = null;

function watchContent() {
  try {
    fs.watch(store.contentDir, { recursive: true }, (event, filename) => {
      const name = String(filename || '');
      if (!name || name.includes('.state') || name.endsWith('.tmp')) return;
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        try {
          const before = store.stamp;
          store.reload();
          if (store.stamp !== before) broadcast('file-change');
        } catch (err) {
          console.error('重新扫描失败：', err.message);
        }
      }, 320);
    });
  } catch (err) {
    console.error('无法监听 content 目录：', err.message);
  }
}

/* ------------------------------- 服务 ------------------------------- */

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  } catch {
    res.writeHead(400).end('Bad Request');
    return;
  }

  if (url.pathname === '/api/events') {
    handleSse(req, res);
    return;
  }

  const started = Date.now();
  res.on('finish', () => {
    if (url.pathname.startsWith('/api')) {
      console.log(`${req.method} ${url.pathname} → ${res.statusCode} (${Date.now() - started}ms)`);
    }
  });

  if (url.pathname.startsWith('/api')) {
    try {
      const handled = await handleApi(req, res, url, {
        store,
        config,
        isAuthed,
        baseUrl: `http://${req.headers.host || `${config.host}:${config.port}`}`,
        broadcast,
      });
      if (!handled) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: { code: 'not_found', message: '接口不存在' } }));
      }
    } catch (err) {
      console.error('API 错误：', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: { code: 'error', message: String(err && err.message) } }));
      }
    }
    return;
  }

  // 浏览器会顺手请求 favicon，直接给个空响应，避免日志里刷 404
  if (url.pathname === '/favicon.ico') {
    res.writeHead(204, { 'Cache-Control': 'max-age=86400' });
    res.end();
    return;
  }

  // 打开网页时下发登录 cookie，让浏览器端免填令牌
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    const isLoopback = ['127.0.0.1', '::1', 'localhost'].includes(config.host) || /^(127\.|::1|localhost)/.test(req.headers.host || '');
    if (isLoopback) {
      res.setHeader('Set-Cookie', `tiji_token=${config.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000`);
    }
  }

  serveStatic(req, res, url.pathname);
});

/* ------------------------------- 启动 ------------------------------- */

function openBrowser(url) {
  if (!OPEN_BROWSER) return;
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

function listen(port, attempt = 0) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attempt < 20) {
      listen(port + 1, attempt + 1);
      return;
    }
    console.error('\n启动失败：', err.message);
    if (err.code === 'EADDRINUSE') console.error(`端口 ${port} 被占用，可在 config.json 里改 port。`);
    process.exit(1);
  });

  server.listen(port, config.host, () => {
    const actualPort = server.address().port;
    if (attempt > 0 && !PORT_FROM_ENV) {
      config.port = actualPort;
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    }
    const url = `http://${config.host === '0.0.0.0' ? '127.0.0.1' : config.host}:${actualPort}`;
    console.log('');
    console.log('  题迹 · 个人 AI 问答学习库');
    console.log('  ────────────────────────────────');
    console.log(`  打开网站   ${url}`);
    console.log(`  内容文件夹 ${store.contentDir}`);
    console.log(`  记录数量   ${store.data.entries.length} 条（${store.data.topics.length} 个主题 / ${store.data.practice.length} 道练习）`);
    console.log('');
    console.log('  直接用 ChatGPT 编辑 content/entries/*.md 即可更新内容，');
    console.log('  保存后网页会自动刷新，不需要 API。');
    console.log('');
    if (store.errors.length) {
      console.log(`  注意：有 ${store.errors.length} 个文件格式有问题，详情见网页顶部提示。`);
    }
    if (config.host !== '127.0.0.1') {
      console.log(`  注意：正在监听 ${config.host}，局域网内其他设备也能访问，请保管好令牌。`);
    }
    // 供测试 / 进程管理工具读取
    console.log(`TIJI_READY ${url}`);
    openBrowser(url);
  });
}

store.init();
if (store.isEmpty) {
  store.data = makeSeed();
  store.persist();
  store.reload();
}
watchContent();
listen(config.port);
