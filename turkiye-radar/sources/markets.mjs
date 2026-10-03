// Piyasa verisi: Yahoo Finance (anahtarsız, gecikmeli) + BtcTurk (TRY bazlı kripto).
import { fetchx, pool } from '../lib/http.mjs';

// Sabit semboller. TUR = iShares MSCI Turkey ETF (USD): ücretsiz CDS verisi olmadığı için
// yabancı yatırımcı iştahının vekili olarak kullanılıyor.
export const CORE = {
  USDTRY: 'USDTRY=X', EURTRY: 'EURTRY=X', ONS: 'GC=F', GUMUS: 'SI=F', BRENT: 'BZ=F', TTF: 'TTF=F',
  XU100: 'XU100.IS', XU030: 'XU030.IS', XBANK: 'XBANK.IS', VIX: '^VIX', DXY: 'DX-Y.NYB', SP500: '^GSPC', US10Y: '^TNX',
  TUR_ETF: 'TUR', EEM: 'EEM',
  // Dünya görünümü için başlıca endeksler.
  NASDAQ: '^IXIC', STOXX50: '^STOXX50E', DAX: '^GDAXI', FTSE: '^FTSE', NIKKEI: '^N225', SHANGHAI: '000001.SS',
};
export const WORLD = ['SP500', 'NASDAQ', 'STOXX50', 'DAX', 'FTSE', 'NIKKEI', 'SHANGHAI', 'VIX', 'DXY', 'US10Y', 'ONS', 'BRENT', 'EEM'];

// Yahoo bulut IP'lerine sık sık 429 verir. İlk 429'dan sonra 15 dk boyunca diğer sembolleri denemeyiz.
let yahooBlockedUntil = 0;

async function yahoo(sym) {
  if (Date.now() < yahooBlockedUntil) throw new Error('Yahoo geçici olarak sınırladı (429)');
  const j = await fetchx(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1mo&interval=1d`, { ttl: 60_000, retries: 0 })
    .catch(e => { if (e.status === 429) yahooBlockedUntil = Date.now() + 15 * 60e3; throw e; });
  const r = j?.chart?.result?.[0];
  if (!r) throw new Error('boş yanıt');
  // Son günün kapanışı boşsa özet fiyat o günün kapanışıdır; atılırsa günlük değişim iki gün öncesine göre hesaplanır
  // (2026-10-02 THYAO: doğrusu +%1,92, şeritte +%3,09 göründü).
  const raw = [...(r.indicators?.quote?.[0]?.close || [])];
  if (raw.length && raw.at(-1) == null && r.meta.regularMarketPrice != null && r.meta.regularMarketTime >= (r.timestamp?.at(-1) ?? Infinity)) raw[raw.length - 1] = r.meta.regularMarketPrice;
  const closes = raw.filter(x => x != null);
  return { closes, price: r.meta.regularMarketPrice ?? closes.at(-1), time: (r.meta.regularMarketTime || 0) * 1000 };
}

async function chart(sym) {
  try {
    const f = await yahoo(sym);
    const s = stats(sym, f.closes, f.price, f.time, 'yahoo');
    return needsRollCheck(sym, s) ? fixRoll(sym, s) : s;
  } catch (e) {
    if (!STOOQ[sym]) throw e;
    return stooq(sym);
  }
}

// Vadeli "=F" serisi vade dolunca bir sonraki kontrata geçer; eski kontratın kapanışıyla yenisinin fiyatı
// arasındaki fark sahte bir hareket gibi görünür (2026-09-30: Brent gerçekte +%0,2 iken seri -%6,1 gösterdi).
// Fiyatı eşleşen gerçek kontratı bulup değişimi onun kendi geçmişinden hesaplarız.
// Eşik bilerek düşük: 2026-09-30 akşamı Brent devri -%4,73 göründü, eski eşik (2 × oynaklık = %4,9) kaçırdı.
// Gerçek büyük hareketlerde de kontrat kendi geçmişiyle aynı değişimi verir; bedeli yalnızca birkaç ek istek.
export const needsRollCheck = (sym, s) => sym.endsWith('=F') && Math.abs(s.chg) > Math.max(1.5, 1.5 * (s.vol || 0));
const FUT_EX = { BZ: 'NYM', CL: 'NYM', NG: 'NYM', GC: 'CMX', SI: 'CMX' };
const MONTHS = 'FGHJKMNQUVXZ';
export function contractSymbols(root, now = new Date()) {
  const ex = FUT_EX[root];
  if (!ex) return [];
  return [0, 1, 2, 3].map(i => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    return `${root}${MONTHS[d.getUTCMonth()]}${String(d.getUTCFullYear() % 100).padStart(2, '0')}.${ex}`;
  });
}
export function pickContract(front, candidates) {
  return candidates.find(c => c && Math.abs(c.price / front.price - 1) < 0.002) || null;
}
async function fixRoll(sym, s) {
  const syms = contractSymbols(sym.replace('=F', ''));
  const cands = await Promise.all(syms.map(c => yahoo(c).then(r => ({ ...r, sym: c })).catch(() => null)));
  const hit = pickContract(s, cands);
  if (!hit) return { ...s, anomaly: false, roll: 'şüpheli' };
  return { ...stats(sym, hit.closes, hit.price, hit.time, 'yahoo'), roll: hit.sym };
}

// Yahoo düşerse kur ve emtia için Stooq'un günlük CSV'si (anahtarsız).
const STOOQ = { 'USDTRY=X': 'usdtry', 'EURTRY=X': 'eurtry', 'GC=F': 'xauusd', 'SI=F': 'xagusd' };
async function stooq(sym) {
  const csv = await fetchx(`https://stooq.com/q/d/l/?s=${STOOQ[sym]}&i=d`, { as: 'text', ttl: 300_000, maxBytes: 4_000_000 });
  const rows = csv.trim().split('\n');
  if (!rows[0]?.startsWith('Date')) throw new Error('stooq boş');
  const closes = rows.slice(-23).map(l => +l.split(',')[4]).filter(Number.isFinite);
  return stats(sym, closes, closes.at(-1), Date.parse(rows.at(-1).split(',')[0]), 'stooq');
}

// Sembolün kendi "normal" günlük oynaklığı (ortalama mutlak getiri). PanWatch'taki ATR% fikrinin sade hali.
export function stats(sym, closes, price, time, src) {
  const prev = closes.length > 1 ? closes.at(-2) : null;
  const chg = prev ? (price / prev - 1) * 100 : 0;
  const rets = closes.slice(1).map((c, i) => Math.abs(c / closes[i] - 1) * 100);
  const vol = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  return {
    sym, price: round(price), chg: round(chg, 2), vol: round(vol, 2),
    anomaly: Math.abs(chg) > Math.max(1, 1.5 * vol), spark: closes.slice(-22).map(x => round(x)), time, src,
  };
}

export const markets = {
  id: 'markets', name: 'Piyasalar (Yahoo; yedek: açık kur API, İş Yatırım)', group: 'piyasa', ttlMin: 5, timeoutSec: 100,
  async run({ settings }) {
    const syms = [...Object.entries(CORE), ...settings.watchlist.map(s => [s.replace('.IS', ''), s])];
    const res = await pool(syms, 6, async ([k, s]) => [k, await chart(s)]);
    const out = {};
    for (const r of res) if (Array.isArray(r)) out[r[0]] = r[1];
    const missingWatch = settings.watchlist.filter(s => s.endsWith('.IS') && !out[s.replace('.IS', '')]);
    const [fx, bist] = await Promise.allSettled([
      ['USDTRY', 'EURTRY', 'ONS', 'GUMUS'].some(k => !out[k]) ? currencyApi() : {},
      !out.XU100 || missingWatch.length ? isYatirim(missingWatch) : {},
    ]);
    for (const r of [fx, bist]) if (r.status === 'fulfilled') for (const [k, v] of Object.entries(r.value)) out[k] ||= v;
    if (!Object.keys(out).length) throw new Error(`hiçbir sembol alınamadı (${res[0]?.error || '?'})`);
    // Türetilmiş: gram altın = ons(USD) × USD/TRY / 31,1035
    if (out.ONS && out.USDTRY) {
      const g = out.ONS.price * out.USDTRY.price / 31.1035;
      const gPrev = (out.ONS.price / (1 + out.ONS.chg / 100)) * (out.USDTRY.price / (1 + out.USDTRY.chg / 100)) / 31.1035;
      // Kıvılcım grafik için ons ve dolar/TL serileri gün gün çarpılır (uzunluklar eşleşiyorsa).
      const os = out.ONS.spark || [], us = out.USDTRY.spark || [], n = Math.min(os.length, us.length);
      const spark = n > 1 ? Array.from({ length: n }, (_, i) => round(os[os.length - n + i] * us[us.length - n + i] / 31.1035)) : undefined;
      out.GRAM_ALTIN = { sym: 'hesaplanan', price: round(g), chg: round((g / gPrev - 1) * 100, 2), derived: true, spark };
    }
    return out;
  },
};

// fawazahmed0/currency-api: jsDelivr üzerinden günlük kur, altın (xau) ve gümüş (xag). Anahtarsız, sınırsız.
// Günde bir güncellenir; gün içi hareket için değil, Yahoo yokken seviye göstermek için.
const CUR = d => [`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${d}/v1/currencies/usd.json`, `https://${d}.currency-api.pages.dev/v1/currencies/usd.json`];
async function usdRates(d) {
  for (const u of CUR(d)) { try { return await fetchx(u, { as: 'json', ttl: 3600e3 }); } catch {} }
  throw new Error('currency-api yanıt vermedi');
}
export function fromUsdRates(cur, prev) {
  const pick = (j, f) => { const u = j?.usd; return u ? f(u) : null; };
  const defs = { USDTRY: u => u.try, EURTRY: u => u.try / u.eur, ONS: u => 1 / u.xau, GUMUS: u => 1 / u.xag };
  const out = {};
  for (const [k, f] of Object.entries(defs)) {
    const p = pick(cur, f), q = pick(prev, f);
    if (Number.isFinite(p)) out[k] = { sym: k, price: round(p), chg: Number.isFinite(q) ? round((p / q - 1) * 100, 2) : 0, vol: null, anomaly: false, spark: [], time: Date.parse(cur.date), src: 'currency-api', daily: true };
  }
  return out;
}
async function currencyApi() {
  const cur = await usdRates('latest');
  const prevDay = new Date(Date.parse(cur.date) - 864e5).toISOString().slice(0, 10);
  return fromUsdRates(cur, await usdRates(prevDay).catch(() => null));
}

// İş Yatırım'ın herkese açık hisse uç noktası; her satır BIST 100 değerini de (END_DEGER, endeks kodu 01) taşır.
const dmy = d => `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
export function fromIsYatirim(rows, key) {
  const closes = rows.map(r => +r.HGDG_KAPANIS).filter(Number.isFinite);
  const out = closes.length ? { [key]: stats(`${key}.IS`, closes, closes.at(-1), Date.now(), 'isyatirim') } : {};
  const idx = rows.filter(r => String(r.END_ENDEKS_KODU) === '01').map(r => +r.END_DEGER).filter(Number.isFinite);
  if (idx.length) out.XU100 = stats('XU100', idx, idx.at(-1), Date.now(), 'isyatirim');
  return out;
}
async function isYatirim(watch) {
  const list = (watch.length ? watch : ['THYAO.IS']).map(s => s.replace('.IS', ''));
  const end = new Date(), start = new Date(Date.now() - 40 * 864e5);
  const out = {};
  await pool(list, 3, async t => {
    const j = await fetchx(`https://www.isyatirim.com.tr/_layouts/15/Isyatirim.Website/Common/Data.aspx/HisseTekil?hisse=${encodeURIComponent(t)}&startdate=${dmy(start)}&enddate=${dmy(end)}`, { as: 'json', timeout: 25000, ttl: 300_000, browser: true });
    const r = fromIsYatirim(j?.value || [], t);
    if (!watch.length) delete r[t];
    for (const [k, v] of Object.entries(r)) out[k] ||= v;
  });
  return out;
}

export const crypto = {
  id: 'btcturk', name: 'Kripto TRY (BtcTurk, yedek Binance)', group: 'piyasa', ttlMin: 5,
  async run() {
    const want = ['BTCTRY', 'ETHTRY', 'USDTTRY'];
    const out = {};
    try {
      const j = await fetchx('https://api.btcturk.com/api/v2/ticker', { ttl: 60_000 });
      for (const t of j.data || []) if (want.includes(t.pair)) out[t.pair] = { price: +t.last, chg: +t.dailyPercent, src: 'btcturk' };
    } catch {}
    if (!out.USDTTRY) {
      const rows = await fetchx(`https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(want))}`, { as: 'json' });
      for (const r of rows) out[r.symbol] = { price: +r.lastPrice, chg: +r.priceChangePercent, src: 'binance' };
    }
    return out;
  },
};

export const round = (x, d = 4) => (x == null || !Number.isFinite(+x) ? null : Math.round(x * 10 ** d) / 10 ** d);
