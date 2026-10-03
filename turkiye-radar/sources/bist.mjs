// Hisse tarayıcısı için 2 yıllık günlük fiyatlar (Yahoo): Türkiye, ABD, Avrupa. Grafikler de bu veriyi kullanır.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchx, pool } from '../lib/http.mjs';
import { ROOT, writeJSON } from '../lib/store.mjs';

// Piyasa tanımları. bench: karşılaştırma endeksi; ohlc: runtime'daki fiyat dosyası.
export const MARKETS = {
  tr: { ad: 'Türkiye', file: 'bist-universe.json', bench: { kod: 'XU100', sym: 'XU100.IS', ad: 'BIST 100' }, ohlc: 'ohlc.json', ttlMin: 30, suffix: '.IS' },
  us: { ad: 'ABD', file: 'universe-us.json', bench: { kod: 'SPX', sym: '^GSPC', ad: 'S&P 500' }, ohlc: 'ohlc-us.json', ttlMin: 60, suffix: '' },
  eu: { ad: 'Avrupa', file: 'universe-eu.json', bench: { kod: 'SX5E', sym: '^STOXX50E', ad: 'Euro Stoxx 50' }, ohlc: 'ohlc-eu.json', ttlMin: 60, suffix: '' },
};
export const loadUniverse = (m = 'tr') => JSON.parse(readFileSync(join(ROOT, 'data', MARKETS[m].file), 'utf8')).hisseler
  .map(u => ({ ...u, sym: u.sym || `${u.kod}${MARKETS[m].suffix}` }));
const day = s => new Date(s * 1000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });

// Yahoo fiyatları bölünmeye göre düzeltilmiş gelir ama temettüye göre gelmez; temettü günü sahte düşüş görünür.
// events=div,splits ile gelen adjclose/close oranını OHLC'ye uygularız (Vibe-Trading'in 2026-08 bulgusu).
export function parseYahoo(j, bist = false) {
  const r = j?.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  if (!r || !q) return null;
  const adj = r.indicators?.adjclose?.[0]?.adjclose;
  const out = { t: [], o: [], h: [], l: [], c: [], v: [] };
  // Yahoo seans kapandıktan sonra son günün kapanışını bazen boş bırakıyor (açılış/yüksek/düşük/hacim dolu), gerçek
  // kapanışı yalnızca özet alanına (meta.regularMarketPrice) yazıyor. 2026-10-03: 61 BIST ve 38 Avrupa hissesinin
  // 02.10 barı böyleydi; bar atılınca tarayıcı bir gün geride kalıyordu. Son bar özet fiyatla tamamlanır.
  const last = r.timestamp.length - 1, m = r.meta || {};
  if (last >= 0 && q.close[last] == null && q.open[last] != null && m.regularMarketPrice != null && m.regularMarketTime && day(m.regularMarketTime) === day(r.timestamp[last])) {
    q.close[last] = m.regularMarketPrice;
    q.high[last] = Math.max(q.high[last] ?? -Infinity, m.regularMarketPrice);
    q.low[last] = Math.min(q.low[last] ?? Infinity, m.regularMarketPrice);
    out.filled = day(r.timestamp[last]);
  }
  r.timestamp.forEach((ts, i) => {
    if (q.close[i] == null || q.open[i] == null) return;
    const k = adj?.[i] && q.close[i] ? adj[i] / q.close[i] : 1;
    out.t.push(day(ts));
    out.o.push(q.open[i] * k); out.h.push(q.high[i] * k); out.l.push(q.low[i] * k); out.c.push(q.close[i] * k);
    out.v.push(q.volume[i] || 0);
  });
  // Aynı gün iki kez gelirse (gün içi son fiyat + kapanış) sonuncusu kalır.
  for (let i = out.t.length - 1; i > 0; i--) if (out.t[i] === out.t[i - 1]) for (const f of Object.keys(out)) out[f].splice(i - 1, 1);
  if (bist) fixCorporateActions(out);
  return out;
}

// BIST'te günlük fiyat marjı ±%10; tek günde %20'yi aşan açılış boşluğu bedelsiz/bölünmedir ve Yahoo
// bazen düzeltmez (ör. KONTR 2025-12-01: 33,40 -> 17,18). Önceki fiyatları açılış oranıyla ölçekleriz.
export function fixCorporateActions(s) {
  const fixed = [];
  for (let i = 1; i < s.c.length; i++) {
    const k = s.o[i] / s.c[i - 1];
    if (Math.abs(k - 1) <= 0.2) continue;
    for (let j = 0; j < i; j++) { s.o[j] *= k; s.h[j] *= k; s.l[j] *= k; s.c[j] *= k; s.v[j] /= k; }
    fixed.push(s.t[i]);
  }
  if (fixed.length) s.adjusted = fixed;
  return s;
}

export async function yahooDaily(sym, range = '2y') {
  const j = await fetchx(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=1d&events=div%2Csplits`, { as: 'json', retries: 2, retryWait: 2500, ttl: 20 * 60e3 });
  const s = parseYahoo(j, sym.endsWith('.IS'));
  if (!s || s.c.length < 30) throw new Error('yetersiz veri');
  return s;
}

function equitySource(m, id, name) {
  const M = MARKETS[m];
  return {
    id, name, group: 'piyasa', ttlMin: M.ttlMin, timeoutSec: 180,
    async run() {
      const series = {};
      const failed = [];
      await pool([M.bench, ...loadUniverse(m)], 2, async u => { // 4 paralel istekte Yahoo 429 veriyor
        try { series[u.kod] = { kod: u.kod, ad: u.ad, ...(await yahooDaily(u.sym)) }; } catch (e) { failed.push(`${u.kod} (${e.status || e.message})`); }
      });
      if (Object.keys(series).length < 10) throw new Error(`çok az hisse alınabildi: ${failed.slice(0, 5).join(', ')}`);
      writeJSON(M.ohlc, { at: Date.now(), market: m, bench: M.bench.kod, series });
      return { count: Object.keys(series).length - (series[M.bench.kod] ? 1 : 0), failed };
    },
  };
}

export const bist = equitySource('tr', 'bist', 'BIST hisse tarayıcısı (Yahoo, 2 yıl)');
export const usEq = equitySource('us', 'us', 'ABD hisseleri (Yahoo, 2 yıl)');
export const euEq = equitySource('eu', 'eu', 'Avrupa hisseleri (Yahoo, 2 yıl)');
