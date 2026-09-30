// BIST hisse tarayıcısı: şeffaf, kural tabanlı skor + aynı skorun geçmişteki başarısının ölçümü.
// Skor "yükselecek" demez; geçmişte yükselişten önce sık görülen teknik koşulları sayar.
import { sma, rsi, macd, atrPct, ret, rollingMax, spearman } from './ta.mjs';

// Seans sürerken son barın hacmi kısmi olur; hacim oranı tamamlanmış günlerden hesaplanır.
export function isPartial(lastDay, now = new Date()) {
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
  return lastDay === now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }) && ist.getHours() * 60 + ist.getMinutes() < 18 * 60 + 30;
}

// Son iki bar arasında atlanan iş günü sayısı (Yahoo bazen bir günü boş bırakıyor).
export function gapDays(a, b) {
  let n = 0;
  for (let d = new Date(a + 'T12:00:00Z'); ; ) {
    d.setUTCDate(d.getUTCDate() + 1);
    const s = d.toISOString().slice(0, 10);
    if (s >= b) return n;
    if (d.getUTCDay() % 6 !== 0) n++;
  }
}

export function prepare(s, now = new Date()) {
  const { c, h, l, v } = s;
  const m = macd(c);
  return {
    ...s,
    sma50: sma(c, 50), sma200: sma(c, 200), rsi: rsi(c, 14), hist: m.hist,
    atr: atrPct(h, l, c, 14), hi252: rollingMax(h, 252), v5: sma(v, 5), v20: sma(v, 20),
    partial: isPartial(s.t.at(-1), now), gap: s.t.length > 1 ? gapDays(s.t.at(-2), s.t.at(-1)) : 0,
  };
}

// t gününe ait özellikler. idx: endeksin aynı tarihlerdeki kapanışları (tarih -> değer).
export function features(p, i, idxByDate) {
  const c = p.c[i];
  const idxNow = idxByDate?.get(p.t[i]), idxThen = i >= 21 ? idxByDate?.get(p.t[i - 21]) : null;
  const r21 = ret(p.c, i, 21);
  return {
    c, r1: ret(p.c, i, 1), r21, r63: ret(p.c, i, 63),
    rs21: r21 != null && idxNow && idxThen ? r21 - (idxNow / idxThen - 1) : null,
    above50: p.sma50[i] != null && c > p.sma50[i],
    golden: p.sma50[i] != null && p.sma200[i] != null && p.sma50[i] > p.sma200[i],
    above200: p.sma200[i] != null && c > p.sma200[i],
    slope50: i >= 20 && p.sma50[i] != null && p.sma50[i - 20] != null ? p.sma50[i] / p.sma50[i - 20] - 1 : null,
    rsi: p.rsi[i], hist: p.hist[i], histUp: i >= 3 && p.hist[i] != null && p.hist[i - 3] != null && p.hist[i] > p.hist[i - 3],
    atr: p.atr[i], dist52: p.hi252[i] ? 1 - c / p.hi252[i] : null,
    volRatio: (() => { const j = p.partial && i === p.c.length - 1 ? i - 1 : i; return p.v20[j] ? p.v5[j] / p.v20[j] : null; })(),
  };
}

const pct = x => `%${(x * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;

// Trend ve momentum. r.mom: 3 aylık getirinin evren içindeki yüzdelik sırası (0-1). news: son haberlerde anılma.
export function score(f, r = { mom: 0.5 }, news = null) {
  const mom = typeof r === 'number' ? r : r.mom;
  let s = 0;
  const why = [], risk = [];
  if (f.above50) { s += 10; why.push('Fiyat 50 günlük ortalamanın üstünde'); }
  if (f.golden) { s += 10; why.push('50 günlük ortalama 200 günlüğün üstünde'); }
  if (f.slope50 > 0) s += 5;
  s += Math.round(mom * 15);
  if (mom >= 0.8) why.push('Son 3 ayda evrenin en güçlü %20\'sinde');
  if (f.rs21 > 0) { s += 10; why.push(`Son 1 ayda BIST 100'ü ${pct(f.rs21)} geçti`); }
  if (f.rsi != null) {
    if (f.rsi >= 50 && f.rsi < 68) { s += 15; why.push(`RSI ${Math.round(f.rsi)}: güçlü ama aşırı alımda değil`); }
    else if (f.rsi >= 68 && f.rsi < 75) { s += 8; risk.push(`RSI ${Math.round(f.rsi)}: aşırı alıma yakın`); }
    else if (f.rsi >= 75) risk.push(`RSI ${Math.round(f.rsi)}: aşırı alım`);
    else if (f.rsi < 32) { s += 3; why.push(`RSI ${Math.round(f.rsi)}: aşırı satım`); }
    else s += 5;
  }
  if (f.hist > 0) s += 5;
  if (f.histUp) { s += 5; if (f.hist > 0) why.push('MACD pozitif ve güçleniyor'); }
  if (f.volRatio >= 1.3 && f.r1 > 0) { s += 10; why.push(`Hacim 20 günlük ortalamanın ${f.volRatio.toFixed(1).replace('.', ',')} katı`); }
  else if (f.volRatio >= 1.1) s += 5;
  if (f.dist52 != null && f.dist52 <= 0.03) { s += 10; why.push(`52 hafta zirvesine ${pct(f.dist52)} uzaklıkta`); }
  else if (f.dist52 != null && f.dist52 <= 0.08) s += 5;
  if (news?.count) { s += 5; why.push(`${news.count} güncel haberde anıldı`); }
  if (f.atr > 5) { s -= 5; risk.push(`Oynaklık yüksek (günlük ortalama ${pct(f.atr / 100)})`); }

  const setup = f.dist52 != null && f.dist52 <= 0.03 && f.volRatio >= 1.2 ? 'Kırılım'
    : f.above50 && f.golden && f.rsi >= 50 && f.rsi < 70 ? 'Trend devamı'
      : f.rsi != null && f.rsi < 32 && f.histUp ? 'Dönüş adayı'
        : 'İzle';
  return { score: Math.max(0, Math.min(100, s)), setup, why, risk };
}

// Düşüş sonrası toparlanma: son 1 ayda en çok düşen ama uzun vadeli trendi (200 günlük) bozulmamış hisseler.
function reversal(f, r) {
  let s = Math.round(r.rev * 40);
  const why = [], risk = [];
  if (r.rev >= 0.8) why.push(`Son 1 ayda evrenin en çok düşenlerinden (${pct(f.r21)})`);
  if (f.above200) { s += 20; why.push('Hâlâ 200 günlük ortalamanın üstünde'); } else risk.push('200 günlük ortalamanın altında: düşüş trendi sürebilir');
  if (f.rsi != null && f.rsi < 35) { s += 20; why.push(`RSI ${Math.round(f.rsi)}: aşırı satım`); } else if (f.rsi < 45) s += 10;
  if (f.histUp) { s += 10; why.push('MACD toparlanıyor'); }
  if (f.atr > 6) { s -= 10; risk.push(`Oynaklık yüksek (günlük ${pct(f.atr / 100)})`); }
  return { score: Math.max(0, Math.min(100, s)), setup: f.rsi < 35 && f.histUp ? 'Dönüş adayı' : 'İzle', why, risk };
}

// Sakin yükseliş: oynaklığı düşük, uzun vadeli trendi yukarı hisseler.
function calm(f, r) {
  let s = Math.round(r.lowvol * 50);
  const why = [], risk = [];
  if (r.lowvol >= 0.8) why.push(`Evrenin en sakin %20'sinde (günlük ${pct(f.atr / 100)})`);
  if (f.above200) { s += 20; why.push('200 günlük ortalamanın üstünde'); }
  if (f.slope50 > 0) { s += 10; why.push('50 günlük ortalama yükseliyor'); }
  if (f.rsi >= 45 && f.rsi < 65) s += 10;
  if (f.dist52 != null && f.dist52 < 0.1) { s += 10; why.push(`52 hafta zirvesine ${pct(f.dist52)} uzaklıkta`); }
  if (f.rsi >= 72) risk.push(`RSI ${Math.round(f.rsi)}: aşırı alım`);
  return { score: Math.max(0, Math.min(100, s)), setup: f.above200 && f.slope50 > 0 ? 'Sakin trend' : 'İzle', why, risk };
}

export const PRESETS = {
  trend: { ad: 'Trend ve momentum', fn: score },
  donus: { ad: 'Düşüş sonrası toparlanma', fn: reversal },
  sakin: { ad: 'Sakin yükseliş', fn: calm },
};

// Her faktörün evren içindeki yüzdelik sırası (0-1); o güne ait kesit.
function pctRank(values) {
  const valid = values.filter(v => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  return values.map(v => (v == null || valid.length < 2 ? 0.5 : valid.indexOf(v) / (valid.length - 1)));
}
function crossRanks(fs) {
  const mom = pctRank(fs.map(f => f.r63)), rev = pctRank(fs.map(f => (f.r21 == null ? null : -f.r21))), lowvol = pctRank(fs.map(f => (f.atr == null ? null : -f.atr)));
  return fs.map((_, i) => ({ mom: mom[i], rev: rev[i], lowvol: lowvol[i] }));
}

export function screen(prepared, index, newsFor = () => null) {
  const idxByDate = index ? new Map(index.t.map((t, i) => [t, index.c[i]])) : null;
  const feats = prepared.map(p => ({ p, f: features(p, p.c.length - 1, idxByDate) }));
  const ranks = crossRanks(feats.map(x => x.f));
  return feats.map(({ p, f }, k) => {
    const news = newsFor(p.kod);
    const scores = Object.fromEntries(Object.entries(PRESETS).map(([id, pr]) => [id, pr.fn(f, ranks[k], news)]));
    return {
      kod: p.kod, ad: p.ad, price: f.c, r1: f.r1, r21: f.r21, r63: f.r63, rsi: f.rsi, dist52: f.dist52, volRatio: f.volRatio, atr: f.atr,
      above200: f.above200, spark: p.c.slice(-60), gap: p.gap, partial: p.partial, scores,
    };
  });
}

// Geriye dönük ölçüm. Sinyal t kapanışında, giriş t+1 kapanışında, çıkış t+1+hold kapanışında.
// Çakışan pencereler sonucu şişirmesin diye her `step` günde bir örnek alınır. Haber sinyali geçmişte olmadığı için dışarıda.
export function backtest(prepared, index, { hold = 10, step = 5, lookback = 300 } = {}) {
  const idxByDate = index ? new Map(index.t.map((t, i) => [t, index.c[i]])) : null;
  const dates = index?.t || prepared[0]?.t || [];
  const pos = prepared.map(p => new Map(p.t.map((t, i) => [t, i])));
  const acc = Object.fromEntries(Object.keys(PRESETS).map(k => [k, { ics: [], top: [], excess: [] }]));
  const all = [];
  const end = dates.length - 1 - (hold + 1);
  for (let d = Math.max(210, end - lookback); d <= end; d += step) {
    const day = dates[d];
    const rows = [];
    prepared.forEach((p, k) => {
      const i = pos[k].get(day);
      if (i == null || i < 210 || i + hold + 1 >= p.c.length) return;
      rows.push({ f: features(p, i, idxByDate), fwd: p.c[i + hold + 1] / p.c[i + 1] - 1 });
    });
    if (rows.length < 10) continue;
    const ii = index ? index.t.indexOf(day) : -1;
    const bench = ii >= 0 && ii + hold + 1 < index.c.length ? index.c[ii + hold + 1] / index.c[ii + 1] - 1 : null;
    all.push(...rows.map(r => r.fwd));
    const ranks = crossRanks(rows.map(r => r.f));
    for (const [id, pr] of Object.entries(PRESETS)) {
      const scored = rows.map((r, j) => ({ s: pr.fn(r.f, ranks[j]).score, fwd: r.fwd }));
      acc[id].ics.push(spearman(scored.map(x => x.s), scored.map(x => x.fwd)));
      scored.sort((a, b) => b.s - a.s);
      const top = scored.slice(0, Math.max(1, Math.floor(scored.length / 5)));
      acc[id].top.push(...top.map(x => x.fwd));
      if (bench != null) acc[id].excess.push(...top.map(x => x.fwd - bench));
    }
  }
  const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const tstat = xs => { if (xs.length < 3) return null; const m = mean(xs), sd = Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)); return sd ? m / (sd / Math.sqrt(xs.length)) : null; };
  return {
    hold, from: dates[Math.max(210, end - lookback)], to: dates[end], allRet: mean(all),
    presets: Object.fromEntries(Object.entries(acc).map(([id, a]) => [id, {
      ad: PRESETS[id].ad, samples: a.ics.length, ic: mean(a.ics), icT: tstat(a.ics), topRet: mean(a.top), excess: mean(a.excess),
      hit: a.excess.length ? a.excess.filter(x => x > 0).length / a.excess.length : null,
    }])),
  };
}
