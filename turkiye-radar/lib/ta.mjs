// Teknik göstergeler. Her fonksiyon girdiyle aynı uzunlukta dizi döner; hesaplanamayan başlangıç null'dır.
// Sadece t gününe kadarki veriyi kullanırlar, bu yüzden geriye dönük testte ileriye bakma olmaz.

export function sma(xs, n) {
  const out = new Array(xs.length).fill(null);
  let sum = 0;
  for (let i = 0; i < xs.length; i++) {
    sum += xs[i];
    if (i >= n) sum -= xs[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

export function ema(xs, n) {
  const out = new Array(xs.length).fill(null);
  const k = 2 / (n + 1);
  let prev = null;
  for (let i = 0; i < xs.length; i++) {
    if (i === n - 1) prev = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
    else if (i >= n) prev = xs[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

// Wilder RSI
export function rsi(xs, n = 14) {
  const out = new Array(xs.length).fill(null);
  let gain = 0, loss = 0;
  for (let i = 1; i < xs.length; i++) {
    const d = xs[i] - xs[i - 1];
    const g = Math.max(d, 0), l = Math.max(-d, 0);
    if (i <= n) { gain += g / n; loss += l / n; }
    else { gain = (gain * (n - 1) + g) / n; loss = (loss * (n - 1) + l) / n; }
    if (i >= n) out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function macd(xs, fast = 12, slow = 26, sig = 9) {
  const f = ema(xs, fast), s = ema(xs, slow);
  const line = xs.map((_, i) => (f[i] != null && s[i] != null ? f[i] - s[i] : null));
  const start = line.findIndex(v => v != null);
  const signal = new Array(xs.length).fill(null);
  if (start >= 0) {
    const e = ema(line.slice(start), sig);
    e.forEach((v, j) => { signal[start + j] = v; });
  }
  return { line, signal, hist: line.map((v, i) => (v != null && signal[i] != null ? v - signal[i] : null)) };
}

// Ortalama gerçek aralık, fiyata oranla (%). Hissenin "normal" günlük oynaklığı.
export function atrPct(h, l, c, n = 14) {
  const tr = c.map((_, i) => (i === 0 ? h[0] - l[0] : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]))));
  return sma(tr, n).map((v, i) => (v == null ? null : (v / c[i]) * 100));
}

export const ret = (xs, i, n) => (i - n >= 0 && xs[i - n] ? xs[i] / xs[i - n] - 1 : null);

export function rollingMax(xs, n) {
  const out = new Array(xs.length).fill(null);
  for (let i = 0; i < xs.length; i++) {
    let m = -Infinity;
    for (let j = Math.max(0, i - n + 1); j <= i; j++) if (xs[j] > m) m = xs[j];
    out[i] = m;
  }
  return out;
}

// Spearman sıra korelasyonu: skor sırası ile sonraki getiri sırası ne kadar örtüşüyor (IC).
export function spearman(a, b) {
  const rank = xs => {
    const idx = xs.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
    const r = new Array(xs.length);
    for (let i = 0; i < idx.length;) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2;
      i = j + 1;
    }
    return r;
  };
  const ra = rank(a), rb = rank(b), n = a.length;
  const ma = (n - 1) / 2;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (ra[i] - ma) * (rb[i] - ma); da += (ra[i] - ma) ** 2; db += (rb[i] - ma) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}
