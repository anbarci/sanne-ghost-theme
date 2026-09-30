// Tarama döngüsü: kaynaklar -> haber tam metni -> etki skoru -> delta -> (gerekirse) AI analizi.
import { SOURCES } from '../sources/index.mjs';
import { fetchx, pool } from './http.mjs';
import { readJSON, writeJSON, loadSettings, getSecret } from './store.mjs';
import { extractArticle, titleCheck, isMisleading, lead } from './extract.mjs';
import { impact, dedupe } from './impact.mjs';
import { prepare, screen, backtest } from './screener.mjs';
import { recordPicks, scorePicks, picksSummary } from './picks.mjs';
import { loadUniverse, MARKETS } from '../sources/bist.mjs';
import { fold } from './rss.mjs';
import { catalysts, gundemScore } from './catalysts.mjs';

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
    let timer;
    st.data = await Promise.race([
      src.run({ settings, secret: n => getSecret(settings, n) }),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`zaman aşımı (${src.timeoutSec || 45} sn)`)), (src.timeoutSec || 45) * 1000); }),
    ]).finally(() => clearTimeout(timer));
    Object.assign(st, { ok: true, error: null, at: Date.now(), ms: Date.now() - t0 });
  } catch (e) {
    Object.assign(st, { ok: false, error: e.message, at: Date.now(), ms: Date.now() - t0 }); // eski veri korunur
  }
}

const articles = readJSON('articles.json', {}); // id -> { body, via, t }

async function enrichNews(items, settings, moves) {
  for (const it of items) it.impact = impact(`${it.title} ${it.summary}`, settings.weights, moves);
  let list = dedupe(items);
  // Tam metni yalnızca en önemli N haber için çek; geri kalanı başlık+özetle kalır (hız ve bant genişliği).
  // Google News linkleri JS yönlendirmesi olduğu için çekilmez.
  const need = list.filter(i => !articles[i.id] && !/news\.google\./.test(i.link)).slice(0, settings.fetchArticles);
  await pool(need, 6, async it => {
    try {
      const html = await fetchx(it.link, { as: 'text', timeout: 9000, retries: 0, maxBytes: 1_500_000, browser: true });
      const { text, via } = extractArticle(html);
      articles[it.id] = { body: text.slice(0, 3000), via, t: Date.now() };
    } catch (e) { articles[it.id] = { body: '', via: e.status ? `http-${e.status}` : 'ağ', t: Date.now() }; }
  });
  const stats = {};
  for (const it of list) {
    const a = articles[it.id];
    if (a) stats[a.via] = (stats[a.via] || 0) + 1;
    if (a?.body) {
      it.lead = lead(a.body);
      it.via = a.via;
      // Meta açıklaması zaten bir özet; başlıkla kıyaslamak yanlış alarm üretir.
      if (a.via !== 'meta') { it.check = titleCheck(it.title, a.body); it.misleading = isMisleading(it.check); }
      // Skor artık gövde metniyle de hesaplanıyor: başlık abartılıysa skor içerikle düzelir.
      it.impact = impact(it.title, settings.weights, moves, a.body.slice(0, 1500));
    }
  }
  // 3 günden eski önbelleği temizle
  for (const [k, v] of Object.entries(articles)) if (Date.now() - v.t > 3 * 864e5) delete articles[k];
  writeJSON('articles.json', articles);
  list.stats = stats;
  return list.sort((a, b) => b.impact.score - a.impact.score || b.ts - a.ts);
}

// Tarayıcı: piyasanın fiyat dosyası + son haberlerde anılma. Geriye dönük ölçüm fiyat verisi
// değişmedikçe tekrar hesaplanmaz.
const btCache = {};
export function newsMatcher(news, uni, useKod = true) {
  const texts = news.map(n => ({ t: fold(` ${n.title} ${n.lead || ''} `), n }));
  // Kod yalnızca BIST'te anahtar olur (THYAO, ASELS sıradan kelime değil). ABD/Avrupa kodları çoğu zaman
  // kelimedir (COST, RACE, AI, V); orada sadece şirket adları aranır.
  return kod => {
    const keys = [...(useKod && kod.length >= 4 ? [kod.toLowerCase()] : []), ...(uni.get(kod)?.anahtar || [])].map(fold);
    const hits = texts.filter(x => keys.some(k => x.t.includes(k.length <= 5 ? ` ${k.trim()} ` : k)));
    return hits.length ? { count: hits.length, items: hits.slice(0, 5).map(x => x.n), titles: hits.slice(0, 3).map(x => ({ title: x.n.title, link: x.n.link, src: x.n.srcName })) } : null;
  };
}

function runScreener(market, news, markets) {
  const M = MARKETS[market];
  const store = readJSON(M.ohlc, null);
  if (!store?.series) return null;
  const benchKod = store.bench || M.bench.kod;
  const { [benchKod]: B, ...rest } = store.series;
  const uni = new Map(loadUniverse(market).map(u => [u.kod, u]));
  const prepared = Object.values(rest).map(x => prepare(x));
  const index = B ? prepare(B) : null;
  const find = newsMatcher(news, uni, market === 'tr');
  if (btCache[market]?.at !== store.at) btCache[market] = { at: store.at, res: backtest(prepared, index) };
  const cat = catalysts(news, markets, market, new Set(uni.keys()));
  const rows = screen(prepared, index, find).map(r => ({ ...r, news: find(r.kod), scores: { ...r.scores, gundem: gundemScore(cat.byKod[r.kod]) } }));
  const res = {
    market, ad: M.ad, bench: { kod: benchKod, ad: M.bench.ad }, asOf: store.at, rows, backtest: btCache[market].res, catalysts: cat.themes,
    index: index ? { price: index.c.at(-1), r21: index.c.at(-1) / index.c.at(-22) - 1 } : null,
    failed: readJSON('state.json', {}).sources?.[market === 'tr' ? 'bist' : market]?.data?.failed || [],
  };
  scorePicks(store, market);
  recordPicks(res, Date.now(), market);
  res.live = picksSummary(undefined, market);
  return res;
}

// Son taramadan bu yana değişimi puanlar; puan düşükse AI çağrılmaz.
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
      macro: d('macro'), fred: d('fred'), ecb: d('ecb'), calendar: d('calendar'), tone: d('gdelt')?.tone,
      news: news.slice(0, 300).map(slim),
      // Dünya görünümü: Türkiye bağından bağımsız, küresel etkisi yüksek haberler (son 48 saat).
      world: news.filter(n => n.impact.world >= 25 && Date.now() - n.ts < 48 * 36e5).sort((a, b) => b.impact.world - a.impact.world || b.ts - a.ts).slice(0, 80).map(slim),
      screeners: Object.fromEntries(Object.keys(MARKETS).map(m => [m, runScreener(m, news, mk)])),
      feedStatus: d('rss')?.status,
      articleStats: news.stats,
      sources: sourceList(settings),
    };
    snap.screener = snap.screeners.tr; // AI özeti ve eski istemciler Türkiye tarayıcısını buradan okur
    snap.delta = computeDelta(prev, snap);
    writeJSON('latest.json', snap);
    writeJSON('state.json', { sources: Object.fromEntries(Object.entries(state.sources).map(([k, v]) => [k, v])) });
    onDone?.(snap, settings);
    return snap;
  })();
  try { return await running; } finally { running = null; }
}

const slim = n => ({ id: n.id, title: n.title, link: n.link, ts: n.ts, src: n.src, srcName: n.srcName, srcs: n.srcs, also: n.also, stance: n.stance, cat: n.cat, lang: n.lang, lead: n.lead || n.summary?.slice(0, 280), impact: n.impact, check: n.check, misleading: n.misleading });

// Hızlı yenileme: tam tarama (haber, tarayıcı) 15 dk'da bir; fiyat şeridi arada birkaç dakikada bir.
// Yahoo verisi zaten 15 dk gecikmeli olduğundan daha sık çekmek hem boşa hem de 429 riskini artırır.
export async function refreshQuotes() {
  if (running) return null;
  const snap = readJSON('latest.json', null);
  if (!snap) return null;
  const settings = loadSettings();
  const src = SOURCES.filter(s => s.id === 'markets' || s.id === 'btcturk');
  await Promise.all(src.map(s => runSource(s, settings, false)));
  if (running) return null; // bu arada tam tarama başladıysa onun sonucunu ezme
  const mk = state.sources.markets?.data, cr = state.sources.btcturk?.data;
  if (mk) snap.markets = mk;
  if (cr) snap.crypto = cr;
  snap.quotesAt = Date.now();
  writeJSON('latest.json', snap);
  return { markets: snap.markets, crypto: snap.crypto, quotesAt: snap.quotesAt };
}
