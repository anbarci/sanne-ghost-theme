// Tarayıcının ileriye dönük karnesi: her gün her stratejinin ilk 5 hissesi kaydedilir,
// 14 takvim günü (~10 işlem günü) sonra piyasanın endeksine (BIST 100, S&P 500, Euro Stoxx 50) göre puanlanır. Geriye dönük testten farklı olarak
// burada hiçbir parametre sonradan ayarlanamaz; gerçek zamanlı kanıt birikir.
import { readJSON, writeJSON } from './store.mjs';

const trDay = t => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const HOLD_DAYS = 14;

export function recordPicks(screener, now = Date.now(), market = 'tr') {
  if (!screener?.rows?.length) return;
  const picks = readJSON('picks.json', []);
  const today = trDay(now);
  if (picks.some(p => p.day === today && (p.market || 'tr') === market)) return;
  const due = trDay(now + HOLD_DAYS * 864e5);
  for (const preset of Object.keys(screener.rows[0].scores)) {
    const top = screener.rows.filter(r => r.scores[preset].score > 0).sort((a, b) => b.scores[preset].score - a.scores[preset].score).slice(0, 5);
    for (const r of top) picks.push({ day: today, due, market, preset, kod: r.kod, score: r.scores[preset].score, base: r.price, baseIdx: screener.index?.price ?? null });
  }
  writeJSON('picks.json', picks.slice(-3000));
}

// ohlc: runtime/ohlc.json içeriği. Vade dolan her seçim, vade günündeki (ya da sonraki ilk) kapanışla ölçülür.
export function scorePicks(ohlc, market = 'tr') {
  const picks = readJSON('picks.json', []);
  const s = ohlc?.series;
  if (!s) return picks;
  const bench = s[ohlc.bench || 'XU100'];
  const closeOn = (ser, day) => { const i = ser?.t.findIndex(t => t >= day); return i >= 0 ? ser.c[i] : null; };
  let changed = false;
  for (const p of picks) {
    if (p.done || (p.market || 'tr') !== market || !s[p.kod] || !bench || s[p.kod].t.at(-1) < p.due) continue;
    const px = closeOn(s[p.kod], p.due), ix = closeOn(bench, p.due);
    if (!px || !ix || !p.baseIdx) continue;
    p.ret = px / p.base - 1; p.idxRet = ix / p.baseIdx - 1; p.excess = p.ret - p.idxRet; p.done = true;
    changed = true;
  }
  if (changed) writeJSON('picks.json', picks);
  return picks;
}

export function picksSummary(picks = readJSON('picks.json', []), market = 'tr') {
  const out = {};
  for (const p of picks) {
    if ((p.market || 'tr') !== market) continue;
    const o = (out[p.preset] ||= { open: 0, done: 0, excess: 0, beat: 0 });
    if (!p.done) { o.open++; continue; }
    o.done++; o.excess += p.excess; if (p.excess > 0) o.beat++;
  }
  for (const o of Object.values(out)) { o.excess = o.done ? o.excess / o.done : null; o.beat = o.done ? o.beat / o.done : null; }
  return out;
}
