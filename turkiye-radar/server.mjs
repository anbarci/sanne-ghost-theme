// Türkiye Radar sunucusu. Bağımlılıksız node:http; varsayılan olarak yalnızca 127.0.0.1'i dinler.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { ROOT, readJSON, writeJSON, loadSettings, saveSettings, setSecret, publicSettings } from './lib/store.mjs';
import * as M from './lib/members.mjs';
import { sweep, sourceList, refreshQuotes } from './lib/sweep.mjs';
import { analyze, scorePredictions, scorecard, activeProvider, SYSTEM, SCHEMA, normalizeResult } from './lib/ai/analyze.mjs';
import { chat, loadChat, clearChat } from './lib/ai/chat.mjs';
import { debate, scoreDebates, pastLines } from './lib/ai/debate.mjs';
import { loadMemory, deleteLesson, statLessons, debateLessons, addNote, deleteNote, myNotes } from './lib/ai/memory.mjs';
import { toc, loadArchive } from './lib/ai/memtree.mjs';
import { PRESETS, complete } from './lib/ai/providers.mjs';
import { dispatchAlerts, sendTelegram } from './lib/alerts.mjs';
import { loadFeeds } from './sources/news.mjs';
import { yahooDaily, loadUniverse, MARKETS } from './sources/bist.mjs';
import { CORE } from './sources/markets.mjs';
import { sma, rsi } from './lib/ta.mjs';
import { checkKey } from './lib/keycheck.mjs';
import { exportVault } from './lib/obsidian.mjs';

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
const SETUP_TOKEN = M.hasAnyUser() ? null : randomBytes(9).toString('base64url');
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
    scoreDebates(snap);
    const settings = loadSettings();
    let analysis = null;
    status.analyzing = true; broadcast({ type: 'status', status });
    // Zamanlanmış analiz: son analizden bu yana seçilen saat (1/2/3/6) geçtiyse veri değişmemiş olsa da analiz yapılır.
    // Arada büyük bir olay olursa normal tetik (değişim puanı) yine çalışır. Günlük bütçe her durumda geçerli.
    const lastAt = readJSON('analyses.json', [])[0]?.at || 0;
    const due = settings.aiAutoHours > 0 && Date.now() - lastAt >= settings.aiAutoHours * 36e5 - 5 * 60e3;
    try {
      analysis = await analyze(snap, settings, { force: forceAI || due });
      status.lastAnalysisNote = analysis.skipped || null;
      // İsteğe bağlı: her yeni analizden sonra Obsidian kasasına aktar (yalnızca ortam değişkeniyle; web'den yol verilemez).
      if (analysis?.result && process.env.RADAR_OBSIDIAN_DIR) { try { exportVault(process.env.RADAR_OBSIDIAN_DIR); } catch (e) { console.error('[obsidian]', e.message); } }
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

let timer, quick;
function schedule() {
  clearInterval(timer); clearInterval(quick);
  timer = setInterval(() => cycle(), Math.max(5, loadSettings().intervalMin) * 60e3);
  // Dakikada bir fiyat şeridi: tek Yahoo isteği + BtcTurk (tam tarama 15 dk'da bir ayrıca sürer).
  quick = setInterval(async () => {
    if (status.sweeping) return;
    try { const q = await refreshQuotes(); if (q) broadcast({ type: 'quotes', ...q }); } catch (e) { console.error('[quotes]', e.message); }
  }, 60e3);
}

const SETTABLE = ['intervalMin', 'aiIntervalMin', 'aiMinDelta', 'aiDailyUSD', 'aiDailyTokens', 'weights', 'watchlist', 'evdsSeries', 'fetchArticles', 'verifyTop', 'searxngUrl', 'aiAutoHours', 'sources', 'telegram'];

async function admin(req, res, path, body, user) {
  const s = loadSettings();
  switch (`${req.method} ${path}`) {
    case 'GET /api/admin/settings':
      return send(res, 200, { settings: publicSettings(s), presets: PRESETS, sources: sourceList(s), feeds: loadFeeds(), status, articleStats: readJSON('latest.json', {})?.articleStats || {} });
    case 'POST /api/admin/settings': {
      for (const k of SETTABLE) if (k in body) s[k] = body[k];
      s.intervalMin = Math.max(5, +s.intervalMin || 15);
      s.verifyTop = Math.min(40, Math.max(0, +s.verifyTop || 0));
      s.aiAutoHours = [0, 1, 2, 3, 6, 12, 24].includes(+s.aiAutoHours) ? +s.aiAutoHours : 0;
      s.searxngUrl = /^https?:\/\/[^\s]+$/.test(s.searxngUrl || '') ? s.searxngUrl : '';
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
      // Yapıştırırken gelen boşluk/tırnak temizlenir; anahtar alanına adres girilmişse kaydedilmez.
      const key = String(body.key || '').trim().replace(/^["'`]+|["'`]+$/g, '');
      const keyErr = checkKey(key, p);
      if (keyErr) return send(res, 400, { error: keyErr });
      body.key = key;
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
    // Üyelik yönetimi
    case 'GET /api/admin/members':
      return send(res, 200, { users: M.listUsers(), invites: M.listInvites(), ranks: M.ranks(s), features: M.FEATURES });
    case 'POST /api/admin/member':
      try { M.updateUser(body.id, { rank: body.rank, disabled: body.disabled, password: body.password || undefined }, user); return send(res, 200, { ok: true }); }
      catch (e) { return send(res, 400, { error: e.message }); }
    case 'POST /api/admin/member/create':
      try { M.createUser({ ad: body.ad, password: body.password, rank: body.rank }); return send(res, 200, { ok: true }); }
      catch (e) { return send(res, 400, { error: e.message }); }
    case 'POST /api/admin/member/delete':
      try { M.deleteUser(body.id, user); return send(res, 200, { ok: true }); }
      catch (e) { return send(res, 400, { error: e.message }); }
    case 'POST /api/admin/invite':
      try { return send(res, 200, { code: M.createInvite(body, user) }); }
      catch (e) { return send(res, 400, { error: e.message }); }
    case 'POST /api/admin/invite/delete':
      M.deleteInvite(body.code); return send(res, 200, { ok: true });
    case 'POST /api/admin/ranks': {
      // Yalnızca bilinen rütbe ve özellikler; sayılar 0-100000, diğerleri aç/kapa.
      const out = {};
      for (const [k, def] of Object.entries(M.DEFAULT_RANKS)) {
        out[k] = {};
        for (const f of Object.keys(M.FEATURES)) {
          const v = body.ranks?.[k]?.[f];
          if (v === undefined) continue;
          out[k][f] = typeof def[f] === 'number' ? Math.max(0, Math.min(100000, +v || 0)) : !!v;
        }
        if (typeof body.ranks?.[k]?.ad === 'string') out[k].ad = body.ranks[k].ad.slice(0, 24);
      }
      s.ranks = out; saveSettings(s);
      return send(res, 200, { ok: true });
    }
    case 'POST /api/admin/telegram-test':
      try { await sendTelegram(s, '✅ Türkiye Radar test mesajı'); return send(res, 200, { ok: true }); } catch (e) { return send(res, 200, { ok: false, error: e.message }); }
  }
  return send(res, 404, { error: 'Bulunamadı' });
}

// Grafik verisi: BIST hisseleri ve endeks tarayıcının 2 yıllık önbelleğinden, diğer piyasa sembolleri
// istek anında Yahoo'dan (20 dk önbellek). Sadece bilinen semboller kabul edilir.
async function chartData(key) {
  const k = String(key).toUpperCase().replace(/\.IS$/, '');
  let s = null, sym = CORE[k] || null;
  for (const [m, M] of Object.entries(MARKETS)) {
    s ||= readJSON(M.ohlc, null)?.series?.[k];
    sym ||= M.bench.kod === k ? M.bench.sym : loadUniverse(m).find(u => u.kod === k)?.sym;
  }
  if (!s) {
    if (!sym) return { error: 'Bilinmeyen sembol' };
    try { s = { kod: k, ad: k, ...(await yahooDaily(sym, '2y')) }; } catch (e) { return { error: `Veri alınamadı: ${e.message}` }; }
  }
  const r2 = x => (x == null ? null : Math.round(x * 1e4) / 1e4);
  return { kod: s.kod, ad: s.ad, adjusted: s.adjusted || null, t: s.t, o: s.o.map(r2), h: s.h.map(r2), l: s.l.map(r2), c: s.c.map(r2), v: s.v, sma50: sma(s.c, 50).map(r2), sma200: sma(s.c, 200).map(r2), rsi: rsi(s.c, 14).map(r2) };
}

// Dış araçlar için düz tablolar (ToolJet tablo bileşeni, Grafana, Excel/Sheets "web'den veri al").
// Her uç bir satır dizisi döndürür; ?format=csv ile CSV. Rütbe kuralları aynen geçerli.
function exportData(res, what, q, user) {
  const R = user.rutbe, snap = readJSON('latest.json', {}) || {};
  let rows;
  if (what === 'piyasa') rows = Object.entries(snap.markets || {}).map(([k, x]) => ({ kod: k, fiyat: x.price, degisim_yuzde: x.chg, oynaklik: x.vol ?? null, gecikme_sn: x.delaySec ?? null, zaman: x.time ? new Date(x.time).toISOString() : null, olagandisi: !!x.anomaly }));
  else if (what === 'haberler') rows = (snap.news || []).slice(0, Math.min(300, +q.get('limit') || 100)).map(n => ({ baslik: n.title, kaynak: n.srcName, cizgi: n.stance, kategori: n.cat, etki: n.impact?.score, dunya_etki: n.impact?.world ?? null, teyit: n.teyit?.durum || null, teyit_kaynak: n.teyit?.kaynak ?? null, uyumsuz: !!n.misleading, zaman: new Date(n.ts).toISOString(), link: n.link }));
  else if (what === 'tarayici') {
    if (!R.trade) return send(res, 403, { error: 'Bu veri üyeliğinde yok: Trade' });
    const m = ['tr', 'us', 'eu'].includes(q.get('piyasa')) ? q.get('piyasa') : 'tr';
    const r2 = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d), pc = x => r2(x * 100);
    rows = (snap.screeners?.[m]?.rows || []).map(r => ({ kod: r.kod, ad: r.ad, fiyat: r2(r.price, 4), gun_yuzde: pc(r.r1), ay_yuzde: pc(r.r21), uc_ay_yuzde: pc(r.r63), rsi: r2(r.rsi, 1), zirveye_yuzde: pc(r.dist52), gunluk_oynaklik: r2(r.atr), trend: r.scores.trend?.score, toparlanma: r.scores.donus?.score, sakin: r.scores.sakin?.score, gundem: r.scores.gundem?.score }));
  } else if (what === 'analiz') {
    const a = readJSON('analyses.json', [])[0];
    if (!a) rows = [];
    else { const r = gateResult(normalizeResult({ ...a.result }), R); rows = [{ zaman: new Date(a.at).toISOString(), model: a.model, ozet: r.ozet, kotumser: r.kotumser?.olasilik, iyimser: r.iyimser?.olasilik, tarafsiz: r.tarafsiz?.yorum, guven: r.guven }, ...(r.varliklar || []).map(v => ({ zaman: new Date(a.at).toISOString(), varlik: v.kod, yon: v.yon, olasilik: v.olasilik, vade_gun: v.vade_gun, gerekce: v.gerekce }))]; }
  } else if (what === 'portfoy') {
    if (!R.portfoy) return send(res, 403, { error: 'Bu veri üyeliğinde yok: Portföy' });
    rows = readJSON('portfolio.json', {})[user.id] || [];
  } else return send(res, 404, { error: 'Bilinmeyen tablo. Olanlar: piyasa, haberler, tarayici, analiz, portfoy' });
  if (q.get('format') === 'csv') {
    const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
    const cell = v => (v == null ? '' : /[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    return send(res, 200, '\ufeff' + [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n'), { 'content-type': 'text/csv; charset=utf-8' });
  }
  return send(res, 200, rows);
}

// Temel üyelik analizin özetini ve bakış açılarını görür; eylem planı, fikirler ve beklentiler kilitli.
function gateResult(r, R) {
  if (R.analizTam) return r;
  const { ozet, kotumser, iyimser, tarafsiz, cerceve, guven, dogrulanamayan } = r;
  return { ozet, kotumser, iyimser, tarafsiz, cerceve, guven, dogrulanamayan, kilitli: true };
}

const isSecure = req => req.headers['x-forwarded-proto'] === 'https';
// Ters vekil (Caddy/nginx) arkasında bütün istekler 127.0.0.1'den gelir; o zaman giriş denemesi sınırı
// herkese ortak olur. RADAR_TRUST_PROXY=1 iken gerçek adres, vekilin eklediği son X-Forwarded-For girdisidir.
// Vekil yokken bu başlığa güvenilmez (istemci istediğini yazabilir).
const TRUST_PROXY = process.env.RADAR_TRUST_PROXY === '1';
const clientIp = req => (TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',').pop().trim()) || req.socket.remoteAddress;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;
  try {
    // Durum değiştiren her istek özel başlık taşımalı: başka sitelerden form ile CSRF'yi engeller.
    if (req.method !== 'GET' && req.headers['x-radar'] !== '1') return send(res, 403, { error: 'CSRF' });
    // API anahtarıyla (dış araçlar) yalnızca okuma yapılır.
    if (req.headers.authorization && req.method !== 'GET') return send(res, 403, { error: 'API anahtarı salt okunurdur' });
    const body = req.method === 'POST' ? await readBody(req) : {};

    if (path === '/api/health') return send(res, 200, { ok: true });
    const user = M.currentUser(req);
    if (path === '/api/auth') return send(res, 200, { setup: !M.hasAnyUser(), authed: !!user, user });
    if (path === '/api/setup' && req.method === 'POST') {
      if (M.hasAnyUser()) return send(res, 403, { error: 'Kurulum zaten yapılmış' });
      if (body.token !== SETUP_TOKEN) return send(res, 403, { error: 'Kurulum anahtarı yanlış (sunucu konsoluna bakın)' });
      try { const u = M.setupFirst({ ad: body.ad, password: body.password }); return send(res, 200, { ok: true }, { 'set-cookie': M.issueCookie(u, isSecure(req)) }); }
      catch (e) { return send(res, 400, { error: e.message }); }
    }
    if (path === '/api/login' && req.method === 'POST') {
      const r = M.login(body.ad || 'admin', body.password, clientIp(req));
      if (!r.ok) return send(res, 401, { error: r.wait ? `Çok fazla deneme. ${r.wait} sn bekleyin.` : 'Kullanıcı adı ya da şifre yanlış' });
      return send(res, 200, { ok: true }, { 'set-cookie': M.issueCookie(r.user, isSecure(req)) });
    }
    if (path === '/api/register' && req.method === 'POST') {
      try { const u = M.register(body); return send(res, 200, { ok: true }, { 'set-cookie': M.issueCookie(u, isSecure(req)) }); }
      catch (e) { return send(res, 400, { error: e.message }); }
    }
    if (path === '/api/logout') return send(res, 200, { ok: true }, { 'set-cookie': M.clearCookie });

    // Statik dosyalar herkese açık (içlerinde veri yok); tüm /api ve /events oturum ister.
    if (path.startsWith('/api/') || path === '/events') {
      if (!user) return send(res, 401, { error: 'Giriş gerekli' });
      // API anahtarı yalnızca dışa aktarım tablolarını okur (ayarlar, sohbet, olay akışı vb. kapalı).
      if (user.readonly && !path.startsWith('/api/v1/')) return send(res, 403, { error: 'API anahtarı yalnızca /api/v1/ tablolarını okuyabilir' });
      const R = user.rutbe;
      // Rütbenin açmadığı özellik: 403 + hangi özelliğin gerektiği (arayüz yükseltme ipucu gösterir).
      const deny = f => send(res, 403, { error: `Bu özellik üyeliğinde yok: ${M.FEATURES[f]}`, feature: f });
      if (path === '/events') {
        res.writeHead(200, { ...SEC, 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(`data: ${JSON.stringify({ type: 'status', status })}\n\n`);
        clients.add(res);
        const ping = setInterval(() => res.write(': ping\n\n'), 25000);
        req.on('close', () => { clients.delete(res); clearInterval(ping); });
        return;
      }
      if (path === '/api/me/tokens' && req.method === 'GET') return send(res, 200, { tokens: M.listTokens(user.id) });
      if (path === '/api/me/tokens' && req.method === 'POST') { try { return send(res, 200, { token: M.createToken(user.id, body.name) }); } catch (e) { return send(res, 400, { error: e.message }); } }
      if (path === '/api/me/tokens/delete' && req.method === 'POST') { M.deleteToken(user.id, body.id); return send(res, 200, { ok: true }); }
      if (path.startsWith('/api/v1/')) return exportData(res, path.slice(8), url.searchParams, user);
      if (path === '/api/me' && req.method === 'GET') return send(res, 200, { user, usage: M.usage(user.id), ranks: M.ranks(), features: M.FEATURES });
      if (path === '/api/me/password' && req.method === 'POST') {
        try { const u = M.changeOwnPassword(user.id, body.old, body.new); return send(res, 200, { ok: true }, { 'set-cookie': M.issueCookie(u, isSecure(req)) }); }
        catch (e) { return send(res, 400, { error: e.message }); }
      }
      if (path === '/api/data') {
        const snap = readJSON('latest.json', null);
        const analyses = readJSON('analyses.json', []);
        // Eski (normalizasyondan önce kaydedilmiş) analizler de okunurken düzeltilir.
        const last = analyses[0] ? { ...analyses[0], result: gateResult(normalizeResult({ ...analyses[0].result }), R) } : null;
        const view = snap && !R.trade ? { ...snap, screeners: null, screener: null } : snap;
        if (last && !R.analizTam) delete last.provenance;
        return send(res, 200, { snap: view, analysis: last, status, score: scorecard(), user, usage: M.usage(user.id) });
      }
      if (path === '/api/chart') return R.trade ? send(res, 200, await chartData(url.searchParams.get('sym') || 'XU100')) : deny('trade');
      if ((path === '/api/analyses' || path === '/api/analysis') && !R.gecmis) return deny('gecmis');
      if (path === '/api/analyses') return send(res, 200, readJSON('analyses.json', []).map(({ result, hash, provenance, ...m }) => ({ ...m, ozet: result?.ozet, guven: result?.guven, kotumser: result?.kotumser?.olasilik, iyimser: result?.iyimser?.olasilik })));
      if (path === '/api/analysis') {
        const at = +url.searchParams.get('at');
        const a = readJSON('analyses.json', []).find(x => x.at === at);
        const preds = readJSON('predictions.json', []).filter(p => p.at === at);
        return a ? send(res, 200, { ...a, result: normalizeResult({ ...a.result }), predictions: preds }) : send(res, 404, { error: 'Analiz bulunamadı' });
      }
      if (path === '/api/sweep' && req.method === 'POST' && !R.tara) return deny('tara');
      if (path === '/api/analyze' && req.method === 'POST') {
        if (!R.analizTetik) return deny('analizTetik');
        const q = M.useQuota(user, 'analizTetik');
        if (!q.ok) return send(res, 429, { error: `Günlük elle analiz hakkın doldu (${q.limit})` });
      }
      if (path === '/api/sweep' && req.method === 'POST') { cycle({ force: true, forceAI: !!body.ai }); return send(res, 202, { ok: true }); }
      if (path === '/api/analyze' && req.method === 'POST') {
        const snap = readJSON('latest.json', null);
        if (!snap) return send(res, 409, { error: 'Önce tarama yapılmalı' });
        status.analyzing = true; broadcast({ type: 'status', status });
        try { const a = await analyze(snap, loadSettings(), { force: true }); broadcast({ type: 'update' }); return send(res, 200, a); }
        catch (e) { return send(res, 200, { error: e.message }); }
        finally { status.analyzing = false; broadcast({ type: 'status', status }); }
      }
      // Hisse tartışması (boğa / ayı / hakem / risk). Trade yetkisi ve günlük tartışma hakkı gerekir.
      if (path.startsWith('/api/debate') && !R.trade) return deny('trade');
      if (path === '/api/debate' && req.method === 'GET') {
        const kod = String(url.searchParams.get('kod') || '').toUpperCase();
        const list = readJSON('debates.json', []).filter(d => d.kod === kod).slice(0, 5).map(({ uid, ...d }) => d);
        return send(res, 200, { list, gecmis: pastLines(kod), usage: M.usage(user.id), limit: R.tartisma || 0 });
      }
      if (path === '/api/debate' && req.method === 'POST') {
        if (!R.tartisma) return deny('tartisma');
        const q = M.useQuota(user, 'tartisma');
        if (!q.ok) return send(res, 200, { error: `Günlük tartışma hakkın doldu (${q.limit}). Yarın yenilenir ya da üyeliğini yükselt.` });
        try { const { uid, ...d } = await debate(body.kod, loadSettings(), { market: body.m, uid: user.id }); return send(res, 200, d); }
        catch (e) { if (e.early) M.refundQuota(user, 'tartisma'); return send(res, 200, { error: e.message }); }
      }
      if (path.startsWith('/api/chat') && !R.sohbet) return deny('sohbet');
      if (path === '/api/chat' && req.method === 'GET') return send(res, 200, { turns: loadChat(url.searchParams.get('at'), user.id), usage: M.usage(user.id), limit: R.sohbet });
      if (path === '/api/chat' && req.method === 'POST') {
        const isNote = /^\s*(hatırla|hatirla|not al|unutma|aklında tut)/i.test(body.q || '');
        if (isNote && !R.notlar) return deny('notlar');
        if (!isNote) { const q = M.useQuota(user, 'sohbet'); if (!q.ok) return send(res, 200, { error: `Günlük sohbet hakkın doldu (${q.limit} mesaj). Yarın yenilenir ya da üyeliğini yükselt.` }); }
        try { return send(res, 200, await chat(body.at, body.q, loadSettings(), { web: body.web !== false && R.web, uid: user.id })); }
        catch (e) { return send(res, 200, { error: e.message }); }
      }
      if (path === '/api/chat/clear' && req.method === 'POST') { clearChat(body.at, user.id); return send(res, 200, { ok: true }); }
      if (path === '/api/memory' && req.method === 'GET') { const m = loadMemory(); return send(res, 200, { dersler: m.dersler, notlar: R.notlar ? myNotes(user.id) : [], olcum: [...statLessons(readJSON('predictions.json', [])), ...debateLessons()], agac: R.gecmis ? toc() : '', arsiv: loadArchive().length, notlarAcik: R.notlar, yonetici: R.admin }); }
      if (path.startsWith('/api/memory/note') && !R.notlar) return deny('notlar');
      if (path === '/api/memory/note' && req.method === 'POST') return send(res, 200, { ok: addNote(body.text, user.id) });
      if (path === '/api/memory/note/delete' && req.method === 'POST') { deleteNote(+body.at, user.id); return send(res, 200, { ok: true }); }
      if (path === '/api/memory/delete' && req.method === 'POST') { if (!R.admin) return deny('admin'); deleteLesson(+body.at); return send(res, 200, { ok: true }); }
      if (path.startsWith('/api/portfolio') && !R.portfoy) return deny('portfoy');
      if (path === '/api/portfolio' && req.method === 'GET') return send(res, 200, { items: readJSON('portfolio.json', {})[user.id] || [] });
      if (path === '/api/portfolio' && req.method === 'POST') {
        // Satır: kod (piyasa ya da hisse kodu), adet, birim maliyet (TL ya da hissenin para birimi), not.
        const items = (Array.isArray(body.items) ? body.items : []).slice(0, 100).map(x => ({
          kod: String(x.kod || '').toUpperCase().replace(/[^A-Z0-9_.]/g, '').slice(0, 15), adet: Math.max(0, +x.adet || 0), maliyet: Math.max(0, +x.maliyet || 0), not: String(x.not || '').slice(0, 80),
        })).filter(x => x.kod);
        const all = readJSON('portfolio.json', {}); all[user.id] = items; writeJSON('portfolio.json', all);
        return send(res, 200, { ok: true, items });
      }
      if (path.startsWith('/api/admin/')) return R.admin ? admin(req, res, path, body, user) : deny('admin');
      return send(res, 404, { error: 'Bulunamadı' });
    }

    // Statik
    if (path === '/vendor/lwc.mjs') {
      const js = await readFile(join(ROOT, 'node_modules/lightweight-charts/dist/lightweight-charts.standalone.production.mjs'));
      return send(res, 200, js, { 'content-type': MIME['.js'], 'cache-control': 'max-age=86400' });
    }
    const rel = path === '/' ? 'index.html' : path === '/admin' ? 'admin.html' : path === '/giris' ? 'giris.html' : path.slice(1);
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
  if (SETUP_TOKEN) console.log(`  İlk kurulum anahtarı: ${SETUP_TOKEN}\n  (Tarayıcıda /giris sayfasında bu anahtarla ilk yönetici hesabını oluşturun.)\n`);
  schedule();
  cycle();
});
