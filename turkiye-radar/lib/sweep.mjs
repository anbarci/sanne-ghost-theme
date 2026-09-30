// Tarama döngüsü: kaynaklar -> haber tam metni -> etki skoru -> delta -> (gerekirse) AI analizi.
import { SOURCES } from '../sources/index.mjs';
import { fetchx, pool } from './http.mjs';
import { readJSON, writeJSON, loadSettings, getSecret } from './store.mjs';
import { extractArticle, titleCheck, isMisleading, lead } from './extract.mjs';
import { impact, dedupe } from './impact.mjs';

const state = readJSON('state.json', { sources: {} }); // kaynak başına son sonuç + zaman + hata
let running = null;

export function sourceList(settings) {
  return SOURCES.map(s => {
    const st = state.sources[s.id] || {};
    const missing = (s.needs || []).filter(n => !getSecret(settings, n));
    return { id: s.id, name: s.name, group: s.group, needs: s.needs || [], missing, enabled: settings.sources[s.id] !== false, ok: st.ok, error: st.error, at: st.at, ms: st.ms };
  });
}

async function runSource(src, settings, force) {
  const st = state.sources[src.id] ||= {};
  if (settings.sources[src.id] === false) return;
  if ((src.needs || []).some(n => !getSecret(settings, n))) { st.error = 'anahtar eksik'; st.ok = false; return; }
  if (!force && st.at && Date.now() - st.at < (src.ttlMin || 15) * 60e3 && st.ok) return; // taze veri varsa tekrar çekme
  const t0 = Date.now();
  try {
    st.data = await Promise.race([
      src.run({ settings, secret: n => getSecret(settings, n) }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('zaman aşımı (45 sn)')), 45000)),
    ]);
    Object.assign(st, { ok: true, error: null, at: Date.now(), ms: Date.now() - t0 });
  } catch (e) {
    Object.assign(st, { ok: false, error: e.message, at: Date.now(), ms: Date.now() - t0 }); // eski veri korunur
  }
}

// ---- Haber işleme ----
const articles = readJSON('articles.json', {}); // id -> { body, check, t }

async function enrichNews(items, settings, moves) {
  for (const it of items) it.impact = impact(`${it.title} ${it.summary}`, settings.weights, moves);
  let list = dedupe(items);
  // Tam metni yalnızca en önemli N haber için çek; geri kalanı başlık+özetle kalır (hız ve bant genişliği).
  const need = list.filter(i => !articles[i.id]).slice(0, settings.fetchArticles);
  await pool(need, 6, async it => {
    try {
      const html = await fetchx(it.link, { as: 'text', timeout: 9000, retries: 0, maxBytes: 1_500_000 });
      const body = extractArticle(html);
      articles[it.id] = { body: body.slice(0, 3000), t: Date.now() };
    } catch { articles[it.id] = { body: '', t: Date.now(), failed: true }; }
  });
  for (const it of list) {
    const a = articles[it.id];
    if (a?.body) {
      it.lead = lead(a.body);
      it.check = titleCheck(it.title, a.body);
      it.misleading = isMisleading(it.check);
      // Skor artık gövde metniyle de hesaplanıyor: başlık abartılıysa skor içerikle düzelir.
      it.impact = impact(`${it.title} ${a.body.slice(0, 1500)}`, settings.weights, moves);
    }
  }
  // 3 günden eski önbelleği temizle
  for (const [k, v] of Object.entries(articles)) if (Date.now() - v.t > 3 * 864e5) delete articles[k];
  writeJSON('articles.json', articles);
  return list.sort((a, b) => b.impact.score - a.impact.score || b.ts - a.ts);
}

// ---- Delta: son taramadan bu yana ne değişti? AI'ı gereksiz yere çağırmamak için puanlanır. ----
function computeDelta(prev, cur) {
  const ev = [];
  let score = 0;
  for (const [k, m] of Object.entries(cur.markets || {})) {
    if (m.anomaly && !prev?.markets?.[k]?.anomaly) { ev.push({ tier: 'PRIORITY', text: `${k} olağan dışı hareket: %${m.chg} (normal günlük oynaklık %${m.vol})` }); score += 8; }
  }
  const prevQ = new Set((prev?.quakes?.local || []).map(q => `${q.t}`));
  for (const q of cur.quakes?.local || []) {
    if (prevQ.has(`${q.t}`) || q.mag < 4) continue;
    const tier = q.mag >= 5.5 ? 'FLASH' : q.mag >= 4.5 ? 'PRIORITY' : 'ROUTINE';
    ev.push({ tier, text: `Deprem M${q.mag} ${q.place} (${q.src})` }); score += q.mag >= 5 ? 20 : 5;
  }
  const prevN = new Set((prev?.news || []).map(n => n.id));
  for (const n of (cur.news || []).slice(0, 30)) {
    if (prevN.has(n.id) || n.impact.score < 55) continue;
    ev.push({ tier: n.impact.score >= 75 ? 'PRIORITY' : 'ROUTINE', text: `${n.title} [${n.srcName}] etki ${n.impact.score}` });
    score += n.impact.score >= 75 ? 6 : 2;
  }
  return { score, events: ev.slice(0, 40) };
}

export async function sweep({ force = false, onDone } = {}) {
  if (running) return running;
  running = (async () => {
    const settings = loadSettings();
    const t0 = Date.now();
    await Promise.all(SOURCES.map(s => runSource(s, settings, force)));
    const d = id => state.sources[id]?.data;

    const mk = { ...(d('markets') || {}) };
    const moves = { brent: mk.BRENT?.chg, usdtry: mk.USDTRY?.chg, vix: mk.VIX?.chg, xu100: mk.XU100?.chg };
    const rawNews = [...(d('rss')?.items || []), ...(d('gdelt')?.items || [])];
    const news = await enrichNews(rawNews, settings, moves);

    const crypto = d('btcturk') || {};
    // USDT/TRY ile resmi kur arasındaki makas: dövize kaçış baskısının gayriresmî göstergesi.
    const usdtPremium = crypto.USDTTRY && mk.USDTRY ? Math.round((crypto.USDTTRY.price / mk.USDTRY.price - 1) * 10000) / 100 : null;

    const prev = readJSON('latest.json', null);
    const snap = {
      at: Date.now(), tookMs: Date.now() - t0,
      markets: mk, crypto, usdtPremium,
      tcmb: d('tcmb'), evds: d('evds'), epias: d('epias'), resmiGazete: d('resmigazete'),
      quakes: d('quakes'), fires: d('firms'), weather: d('weather'),
      macro: d('macro'), fred: d('fred'), tone: d('gdelt')?.tone,
      news: news.slice(0, 300).map(slim),
      feedStatus: d('rss')?.status,
      sources: sourceList(settings),
    };
    snap.delta = computeDelta(prev, snap);
    writeJSON('latest.json', snap);
    writeJSON('state.json', { sources: Object.fromEntries(Object.entries(state.sources).map(([k, v]) => [k, v])) });
    onDone?.(snap, settings);
    return snap;
  })();
  try { return await running; } finally { running = null; }
}

const slim = n => ({ id: n.id, title: n.title, link: n.link, ts: n.ts, src: n.src, srcName: n.srcName, srcs: n.srcs, also: n.also, stance: n.stance, cat: n.cat, lang: n.lang, lead: n.lead || n.summary?.slice(0, 280), impact: n.impact, check: n.check, misleading: n.misleading });
