// Canlı fiyat katmanı: dakikada bir TEK istekle (Yahoo spark) şeritteki tüm sembollerin son fiyatı.
// Tam piyasa taraması (oynaklık, 22 günlük seri) 15 dakikada bir sürer; bu katman yalnızca fiyat, günlük
// değişim ve gerçek gecikmeyi günceller. 30 Eylül 2026 ölçümü: döviz ~8 sn, altın/Brent vadelisi ~10 dk,
// BIST 15 dk gecikmeli (borsa verisi ücretsiz kaynaklarda gecikmeli yayınlanır; anlık BIST lisanslı ve ücretlidir).
import { fetchx } from './http.mjs';
import { CORE } from '../sources/markets.mjs';

const round = (x, d = 4) => Math.round(x * 10 ** d) / 10 ** d;
let blockedUntil = 0;

// spark yanıtı → { KOD: { price, chg, time, delaySec } }
export function parseSpark(j, keys, now = Date.now()) {
  const out = {};
  for (const [k, sym] of keys) {
    const s = j?.[sym];
    const closes = s?.close || [], ts = s?.timestamp || [];
    let i = closes.length - 1;
    while (i >= 0 && closes[i] == null) i--;
    const prev = s?.previousClose ?? s?.chartPreviousClose;
    if (i < 0 || !prev) continue;
    const t = ts[i] * 1000;
    out[k] = { price: round(closes[i]), chg: round((closes[i] / prev - 1) * 100, 2), time: t, delaySec: Math.max(0, Math.round((now - t) / 1000)) };
  }
  return out;
}

export async function liveQuotes() {
  if (Date.now() < blockedUntil) return null;
  // Tüm sabit semboller, 20'lik paketler hâlinde (Yahoo tek istekte 20 sembolü sorunsuz veriyor; ölçüldü).
  const keys = Object.entries(CORE);
  const out = {};
  for (let i = 0; i < keys.length; i += 20) {
    const part = keys.slice(i, i + 20);
    const url = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${part.map(([, s]) => encodeURIComponent(s)).join(',')}&range=1d&interval=5m`;
    try { Object.assign(out, parseSpark(await fetchx(url, { as: 'json', timeout: 12000, retries: 0 }), part)); }
    catch (e) { if (e.status === 429) { blockedUntil = Date.now() + 15 * 60e3; break; } }
  }
  return Object.keys(out).length ? out : null;
}

// Canlı fiyatları mevcut piyasa kaydına işler; oynaklık (vol) tam taramadan kalır, olağandışı bayrağı yeniden hesaplanır.
// Vadeli kontratlarda devir şüphesi varsa (roll) günlük değişim üzerine yazılmaz.
export function mergeLive(markets, live) {
  const m = { ...markets };
  for (const [k, q] of Object.entries(live || {})) {
    // Tam taramada alınamamış sembol: canlı fiyatla eklenir (oynaklık bilinmez, olağandışı bayrağı konmaz).
    const x = m[k] || { sym: CORE[k], src: 'yahoo-canlı', vol: null };
    const chg = x.roll ? x.chg : q.chg;
    m[k] = { ...x, price: q.price, chg, time: q.time, delaySec: q.delaySec, live: true, anomaly: x.vol ? Math.abs(chg) > Math.max(1, 1.5 * x.vol) : false };
  }
  if (m.ONS && m.USDTRY && live?.ONS && live?.USDTRY) {
    const g = m.ONS.price * m.USDTRY.price / 31.1035;
    const gPrev = (m.ONS.price / (1 + m.ONS.chg / 100)) * (m.USDTRY.price / (1 + m.USDTRY.chg / 100)) / 31.1035;
    m.GRAM_ALTIN = { ...m.GRAM_ALTIN, price: round(g, 2), chg: round((g / gPrev - 1) * 100, 2), time: Math.min(m.ONS.time, m.USDTRY.time), delaySec: Math.max(m.ONS.delaySec, m.USDTRY.delaySec), live: true };
  }
  return m;
}
