// BIST tarayıcısı için 1 yıllık günlük fiyatlar (Yahoo). Grafikler de bu veriyi kullanır (runtime/ohlc.json).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchx, pool } from '../lib/http.mjs';
import { ROOT, writeJSON } from '../lib/store.mjs';

export const loadUniverse = () => JSON.parse(readFileSync(join(ROOT, 'data/bist-universe.json'), 'utf8')).hisseler;
const day = s => new Date(s * 1000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });

// Yahoo fiyatları bölünmeye göre düzeltilmiş gelir ama temettüye göre gelmez; temettü günü sahte düşüş görünür.
// events=div,splits ile gelen adjclose/close oranını OHLC'ye uygularız (Vibe-Trading'in 2026-08 bulgusu).
export function parseYahoo(j, bist = false) {
  const r = j?.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  if (!r || !q) return null;
  const adj = r.indicators?.adjclose?.[0]?.adjclose;
  const out = { t: [], o: [], h: [], l: [], c: [], v: [] };
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

export const bist = {
  id: 'bist', name: 'BIST hisse tarayıcısı (Yahoo, 2 yıl)', group: 'piyasa', ttlMin: 30, timeoutSec: 150,
  async run() {
    const uni = loadUniverse();
    const series = {};
    const failed = [];
    await pool([{ kod: 'XU100', ad: 'BIST 100' }, ...uni], 2, async u => { // 4 paralel istekte Yahoo 429 veriyor
      try { series[u.kod] = { kod: u.kod, ad: u.ad, ...(await yahooDaily(`${u.kod}.IS`)) }; } catch (e) { failed.push(`${u.kod} (${e.status || e.message})`); }
    });
    if (Object.keys(series).length < 10) throw new Error(`çok az hisse alınabildi: ${failed.slice(0, 5).join(', ')}`);
    writeJSON('ohlc.json', { at: Date.now(), series });
    return { count: Object.keys(series).length - (series.XU100 ? 1 : 0), failed };
  },
};
