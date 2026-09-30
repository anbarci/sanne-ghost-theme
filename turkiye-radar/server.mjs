// Türkiye Radar sunucusu. Bağımlılıksız node:http; varsayılan olarak yalnızca 127.0.0.1'i dinler.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { ROOT, readJSON, writeJSON, loadSettings, saveSettings, setSecret, publicSettings } from './lib/store.mjs';
import { hasAdmin, setPassword, checkPassword, issueCookie, isAuthed, clearCookie } from './lib/auth.mjs';
import { sweep, sourceList } from './lib/sweep.mjs';
import { analyze, scorePredictions, scorecard, activeProvider, SYSTEM, SCHEMA } from './lib/ai/analyze.mjs';
import { PRESETS, complete } from './lib/ai/providers.mjs';
import { dispatchAlerts, sendTelegram } from './lib/alerts.mjs';
import { loadFeeds } from './sources/news.mjs';

// .env dosyası varsa yükle (dotenv bağımlılığı olmadan).
try {
  for (const line of (await readFile(join(ROOT, '.env'), 'utf8')).split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const HOST = process.env.HOST || '127.0.0.1';
const PORT = +process.env.PORT || 3120;
const PUB = join(ROOT, 'public');
const SETUP_TOKEN = hasAdmin() ? null : randomBytes(9).toString('base64url');
const clients = new Set();
let status = { sweeping: false, analyzing: false, lastError: null, lastAnalysisNote: null };

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };
const SEC = {
  'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer', // habere tıklayınca panelin adresi karşı siteye sızmasın
  'permissions-policy': 'geolocation=(), camera=(), microphone=()',
  'cross-origin-opener-policy': 'same-origin',
};

const send = (res, code, body, headers = {}) => {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(code, { ...SEC, 'cache-control': 'no-store', ...(isObj ? { 'content-type': 'application/json; charset=utf-8' } : {}), ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
};

async function readBody(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > 256_000) throw new Error('İstek çok büyük'); chunks.push(c); }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

function broadcast(msg) {
  const s = `data: ${JSON.stringify(msg)}\n\n`;
  for (const c of clients) c.write(s);
}

async function cycle({ force = false, forceAI = false } = {}) {
  if (status.sweeping) return;
  status.sweeping = true; broadcast({ type: 'status', status });
  try {
    const snap = await sweep({ force });
    scorePredictions(snap);
    const settings = loadSettings();
    let analysis = null;
    status.analyzing = true; broadcast({ type: 'status', status });
    try {
      analysis = await analyze(snap, settings, { force: forceAI });
      status.lastAnalysisNote = analysis.skipped || null;
    } catch (e) { status.lastAnalysisNote = `Analiz hatası: ${e.message}`; }
    status.analyzing = false;
    await dispatchAlerts(snap, settings, analysis?.result ? analysis : null);
    status.lastError = null;
    broadcast({ type: 'update', at: snap.at });
  } catch (e) {
    status.lastError = e.message; console.error('[sweep]', e);
  } finally {
    status.sweeping = false; status.analyzing = false; broadcast({ type: 'status', status });
  }
}

let timer;
function schedule() {
  clearInterval(timer);
  timer = setInterval(() => cycle(), Math.max(5, loadSettings().intervalMin) * 60e3);
}

const SETTABLE = ['intervalMin', 'aiIntervalMin', 'aiMinDelta', 'aiDailyUSD', 'aiDailyTokens', 'weights', 'watchlist', 'evdsSeries', 'fetchArticles', 'sources', 'telegram'];

async function admin(req, res, path, body) {
  const s = loadSettings();
  switch (`${req.method} ${path}`) {
    case 'GET /api/admin/settings':
      return send(res, 200, { settings: publicSettings(s), presets: PRESETS, sources: sourceList(s), feeds: loadFeeds(), status, articleStats: readJSON('latest.json', {})?.articleStats || {} });
    case 'POST /api/admin/settings': {
      for (const k of SETTABLE) if (k in body) s[k] = body[k];
      s.intervalMin = Math.max(5, +s.intervalMin || 15);
      s.watchlist = (s.watchlist || []).map(x => String(x).trim().toUpperCase()).filter(x => /^[A-Z0-9.^=-]{1,15}$/.test(x)).slice(0, 30);
      saveSettings(s); schedule();
      return send(res, 200, { ok: true });
    }
    case 'POST /api/admin/secret': {
      if (!/^[A-Z0-9_]{2,60}$/.test(body.name || '')) return send(res, 400, { error: 'Geçersiz ad' });
      setSecret(s, body.name, body.value); saveSettings(s);
      return send(res, 200, { ok: true });
    }
    case 'POST /api/admin/provider': {
      const p = { id: body.id || randomUUID().slice(0, 8), name: String(body.name || 'Sağlayıcı').slice(0, 60), kind: ['anthropic', 'openai', 'gemini'].includes(body.kind) ? body.kind : 'openai', baseUrl: String(body.baseUrl || ''), model: String(body.model || '').trim(), effort: ['low', 'medium', 'high', 'xhigh'].includes(body.effort) ? body.effort : 'medium', thinking: body.thinking === 'on' ? 'on' : 'off', maxTokens: Math.min(32000, Math.max(1000, +body.maxTokens || 6000)) };
      if (!p.model) return send(res, 400, { error: 'Model adı gerekli' });
      s.providers = [...s.providers.filter(x => x.id !== p.id), p];
      if (body.key) setSecret(s, `AI_KEY_${p.id}`, body.key);
      if (!s.activeProvider) s.activeProvider = p.id;
      saveSettings(s);
      return send(res, 200, { ok: true, id: p.id });
    }
    case 'POST /api/admin/provider/delete':
      s.providers = s.providers.filter(x => x.id !== body.id);
      setSecret(s, `AI_KEY_${body.id}`, null);
      if (s.activeProvider === body.id) s.activeProvider = s.providers[0]?.id || null;
      saveSettings(s);
      return send(res, 200, { ok: true });
    case 'POST /api/admin/provider/active':
      s.activeProvider = body.id; saveSettings(s);
      return send(res, 200, { ok: true });
    case 'POST /api/admin/provider/test': {
      s.activeProvider = body.id;
      const p = activeProvider(s);
      const t0 = Date.now();
      try {
        const r = await complete({ ...p, maxTokens: 1500 }, p.key, SYSTEM, 'VERİ ÖZETİ:\nPİYASA: USDTRY 41,50 (+0,20%)\nHABERLER:\n- [40|finance|Test/resmi] Bağlantı testi — Bu bir bağlantı testidir.', SCHEMA);
        return send(res, 200, { ok: true, ms: Date.now() - t0, model: r.model, usage: r.usage, sample: r.text.slice(0, 400) });
      } catch (e) { return send(res, 200, { ok: false, error: e.message }); }
    }
    case 'POST /api/admin/feeds': {
      const feeds = (body.feeds || []).filter(f => /^https?:\/\//.test(f.url)).map(f => ({ id: String(f.id || f.name).slice(0, 40), name: String(f.name).slice(0, 80), url: f.url, stance: String(f.stance || 'diğer').slice(0, 30), cat: String(f.cat || 'gündem').slice(0, 30), lang: f.lang === 'en' ? 'en' : 'tr', on: f.on !== false }));
      writeJSON('feeds.json', feeds);
      return send(res, 200, { ok: true, n: feeds.length });
    }
    case 'POST /api/admin/password':
      if (!checkPassword(body.old, req.socket.remoteAddress).ok) return send(res, 403, { error: 'Mevcut şifre yanlış' });
      setPassword(body.new);
      return send(res, 200, { ok: true }, { 'set-cookie': issueCookie(isSecure(req)) });
    case 'POST /api/admin/telegram-test':
      try { await sendTelegram(s, '✅ Türkiye Radar test mesajı'); return send(res, 200, { ok: true }); } catch (e) { return send(res, 200, { ok: false, error: e.message }); }
  }
  return send(res, 404, { error: 'Bulunamadı' });
}

const isSecure = req => req.headers['x-forwarded-proto'] === 'https';

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;
  try {
    // Durum değiştiren her istek özel başlık taşımalı: başka sitelerden form ile CSRF'yi engeller.
    if (req.method !== 'GET' && req.headers['x-radar'] !== '1') return send(res, 403, { error: 'CSRF' });
    const body = req.method === 'POST' ? await readBody(req) : {};

    if (path === '/api/health') return send(res, 200, { ok: true });
    if (path === '/api/auth') return send(res, 200, { setup: !hasAdmin(), authed: isAuthed(req) });
    if (path === '/api/setup' && req.method === 'POST') {
      if (hasAdmin()) return send(res, 403, { error: 'Kurulum zaten yapılmış' });
      if (body.token !== SETUP_TOKEN) return send(res, 403, { error: 'Kurulum anahtarı yanlış (sunucu konsoluna bakın)' });
      setPassword(body.password);
      return send(res, 200, { ok: true }, { 'set-cookie': issueCookie(isSecure(req)) });
    }
    if (path === '/api/login' && req.method === 'POST') {
      const r = checkPassword(body.password, req.socket.remoteAddress);
      if (!r.ok) return send(res, 401, { error: r.wait ? `Çok fazla deneme. ${r.wait} sn bekleyin.` : 'Şifre yanlış' });
      return send(res, 200, { ok: true }, { 'set-cookie': issueCookie(isSecure(req)) });
    }
    if (path === '/api/logout') return send(res, 200, { ok: true }, { 'set-cookie': clearCookie });

    // Statik dosyalar herkese açık (içlerinde veri yok); tüm /api ve /events oturum ister.
    if (path.startsWith('/api/') || path === '/events') {
      if (!isAuthed(req)) return send(res, 401, { error: 'Giriş gerekli' });
      if (path === '/events') {
        res.writeHead(200, { ...SEC, 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(`data: ${JSON.stringify({ type: 'status', status })}\n\n`);
        clients.add(res);
        const ping = setInterval(() => res.write(': ping\n\n'), 25000);
        req.on('close', () => { clients.delete(res); clearInterval(ping); });
        return;
      }
      if (path === '/api/data') {
        const snap = readJSON('latest.json', null);
        const analyses = readJSON('analyses.json', []);
        return send(res, 200, { snap, analysis: analyses[0] || null, status, score: scorecard() });
      }
      if (path === '/api/analyses') return send(res, 200, readJSON('analyses.json', []).map(({ result, ...m }) => ({ ...m, ozet: result?.ozet })));
      if (path === '/api/sweep' && req.method === 'POST') { cycle({ force: true, forceAI: !!body.ai }); return send(res, 202, { ok: true }); }
      if (path === '/api/analyze' && req.method === 'POST') {
        const snap = readJSON('latest.json', null);
        if (!snap) return send(res, 409, { error: 'Önce tarama yapılmalı' });
        status.analyzing = true; broadcast({ type: 'status', status });
        try { const a = await analyze(snap, loadSettings(), { force: true }); broadcast({ type: 'update' }); return send(res, 200, a); }
        catch (e) { return send(res, 200, { error: e.message }); }
        finally { status.analyzing = false; broadcast({ type: 'status', status }); }
      }
      if (path.startsWith('/api/admin/')) return admin(req, res, path, body);
      return send(res, 404, { error: 'Bulunamadı' });
    }

    // Statik
    const rel = path === '/' ? 'index.html' : path === '/admin' ? 'admin.html' : path.slice(1);
    const file = normalize(join(PUB, rel));
    if (!file.startsWith(PUB + '/')) return send(res, 403, 'yasak');
    const data = await readFile(file).catch(() => null);
    if (!data) return send(res, 404, 'bulunamadı');
    return send(res, 200, data, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: e.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Türkiye Radar → http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  if (HOST !== '127.0.0.1' && HOST !== 'localhost') console.log('  UYARI: sunucu yerel ağ dışına açık. Önüne HTTPS ters vekil koyun.');
  if (SETUP_TOKEN) console.log(`  İlk kurulum anahtarı: ${SETUP_TOKEN}\n  (Tarayıcıda /admin sayfasında bu anahtar ile şifre belirleyin.)\n`);
  schedule();
  cycle();
});
