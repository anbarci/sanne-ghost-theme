// Piyasa verisi: Yahoo Finance (anahtarsız, gecikmeli) + BtcTurk (TRY bazlı kripto).
import { fetchx, pool } from '../lib/http.mjs';

// Sabit semboller. TUR = iShares MSCI Turkey ETF (USD): ücretsiz CDS verisi olmadığı için
// yabancı yatırımcı iştahının vekili olarak kullanılıyor.
export const CORE = {
  USDTRY: 'USDTRY=X', EURTRY: 'EURTRY=X', ONS: 'GC=F', GUMUS: 'SI=F', BRENT: 'BZ=F', TTF: 'TTF=F',
  XU100: 'XU100.IS', XU030: 'XU030.IS', XBANK: 'XBANK.IS', VIX: '^VIX', DXY: 'DX-Y.NYB', SP500: '^GSPC', US10Y: '^TNX',
  TUR_ETF: 'TUR', EEM: 'EEM',
};

async function chart(sym) {
  try {
    const j = await fetchx(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1mo&interval=1d`, { ttl: 60_000 });
    const r = j?.chart?.result?.[0];
    if (!r) throw new Error('boş yanıt');
    const closes = (r.indicators?.quote?.[0]?.close || []).filter(x => x != null);
    return stats(sym, closes, r.meta.regularMarketPrice ?? closes.at(-1), (r.meta.regularMarketTime || 0) * 1000, 'yahoo');
  } catch (e) {
    if (!STOOQ[sym]) throw e;
    return stooq(sym);
  }
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
  id: 'markets', name: 'Piyasalar (Yahoo Finance)', group: 'piyasa', ttlMin: 5,
  async run({ settings }) {
    const syms = [...Object.entries(CORE), ...settings.watchlist.map(s => [s.replace('.IS', ''), s])];
    const res = await pool(syms, 6, async ([k, s]) => [k, await chart(s)]);
    const out = {};
    for (const r of res) if (Array.isArray(r)) out[r[0]] = r[1];
    if (!Object.keys(out).length) throw new Error(`hiçbir sembol alınamadı (${res[0]?.error || '?'})`);
    // Türetilmiş: gram altın = ons(USD) × USD/TRY / 31,1035
    if (out.ONS && out.USDTRY) {
      const g = out.ONS.price * out.USDTRY.price / 31.1035;
      const gPrev = (out.ONS.price / (1 + out.ONS.chg / 100)) * (out.USDTRY.price / (1 + out.USDTRY.chg / 100)) / 31.1035;
      out.GRAM_ALTIN = { sym: 'hesaplanan', price: round(g), chg: round((g / gPrev - 1) * 100, 2), derived: true };
    }
    return out;
  },
};

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
