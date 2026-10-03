// Destek / direnç seviyeleri ve teknik görünüm özeti. PanWatch'taki otomatik destek-direnç ve "göstergeler
// aynı yönü gösteriyor mu" (technical confluence) fikrinden uyarlandı, kod alınmadı.
// Bu bir tarif, sinyal değil: tarayıcının trend stratejisi geriye dönük testte endeksi geçemedi; arayüz bunu yazar.
import { sma, rsi, macd, atrPct } from './ta.mjs';
import { ek } from './tr.mjs';

const round = (x, d = 2) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);
const tr = (x, d = 1) => Number(x).toLocaleString('tr-TR', { maximumFractionDigits: d });

// Dönüş noktaları: iki yanında k gün boyunca daha yüksek (tepe) ya da daha düşük (dip) bar olmayan günler.
export function pivots(h, l, k = 5, from = 0) {
  const highs = [], lows = [];
  for (let i = Math.max(from, k); i < h.length - k; i++) {
    let top = true, bot = true;
    for (let j = i - k; j <= i + k && (top || bot); j++) {
      if (j === i) continue;
      if (h[j] > h[i]) top = false;
      if (l[j] < l[i]) bot = false;
    }
    if (top) highs.push({ i, p: h[i] });
    if (bot) lows.push({ i, p: l[i] });
  }
  return { highs, lows };
}

// Yakın dönüş noktaları tek seviyede birleşir (tolerans: günlük oynaklığın yarısı, en az %0,5); "n" kaç kez test
// edildiği. Fiyatın hemen üstü/altındaki en yakın iki seviye döner. Fiyat bir yıllık zirvenin üstündeyse direnç yoktur.
export function levels({ h, l, c }, { lookback = 250, k = 5, atr = null } = {}) {
  const n = c.length, last = c[n - 1];
  if (n < 2 * k + 2) return { destek: [], direnc: [] };
  const a = ((atr ?? atrPct(h, l, c, 14).at(-1) ?? 2) / 100) * last;
  const tol = Math.max(a * 0.5, last * 0.005);
  const { highs, lows } = pivots(h, l, k, Math.max(0, n - lookback));
  const pts = [...highs, ...lows].sort((x, y) => x.p - y.p);
  const groups = [];
  for (const pt of pts) {
    const g = groups.at(-1);
    if (g && pt.p - g.max <= tol) { g.sum += pt.p; g.n++; g.max = pt.p; g.son = Math.max(g.son, pt.i); } else groups.push({ sum: pt.p, n: 1, max: pt.p, son: pt.i });
  }
  const lv = groups.map(g => ({ p: round(g.sum / g.n, last > 100 ? 2 : 4), n: g.n, gun: n - 1 - g.son }));
  return {
    destek: lv.filter(x => x.p < last * 0.997).sort((x, y) => y.p - x.p).slice(0, 2),
    direnc: lv.filter(x => x.p > last * 1.003).sort((x, y) => x.p - y.p).slice(0, 2),
  };
}

// Teknik görünüm: altı gösterge ayrı ayrı olumlu (+1) / olumsuz (-1) / nötr (0). Etiket, kaçının aynı yönü
// gösterdiğinden çıkar. idx: aynı tarihlerdeki endeks kapanışları (göreli güç için; yoksa o satır atlanır).
export function teknik({ t, c, v, h, l }, idx = null) {
  const n = c.length, i = n - 1, last = c[i];
  if (n < 30) return null;
  const s50 = sma(c, 50)[i], s200 = sma(c, 200)[i], r = rsi(c, 14)[i], m = macd(c).hist;
  const hist = m[i], histPrev = m[i - 3];
  const v5 = sma(v || [], 5)[i - 1], v20 = sma(v || [], 20)[i - 1];
  const volRatio = v5 && v20 ? v5 / v20 : null, r1 = c[i] / c[i - 1] - 1;
  const S = [];
  if (s200 != null && s50 != null) {
    const up = last > s200 && s50 > s200, dn = last < s200 && s50 < s200;
    S.push({ ad: 'Ana trend', yon: up ? 1 : dn ? -1 : 0, not: up ? 'Fiyat 200 günlük ortalamanın üstünde, 50 günlük 200 günlüğün üstünde' : dn ? 'Fiyat 200 günlük ortalamanın altında, 50 günlük 200 günlüğün altında' : 'Ortalamalar karışık' });
  }
  if (s50 != null) S.push({ ad: 'Kısa trend', yon: last > s50 ? 1 : -1, not: `Fiyat 50 günlük ortalamanın ${last > s50 ? 'üstünde' : 'altında'} (${tr((last / s50 - 1) * 100)}%)` });
  if (hist != null && histPrev != null) {
    const yon = hist > 0 && hist > histPrev ? 1 : hist < 0 && hist < histPrev ? -1 : 0;
    S.push({ ad: 'Momentum (MACD)', yon, not: yon > 0 ? 'Pozitif ve güçleniyor' : yon < 0 ? 'Negatif ve zayıflıyor' : hist > 0 ? 'Pozitif ama zayıflıyor' : 'Negatif ama toparlanıyor' });
  }
  if (r != null) {
    const yon = r > 70 || r < 30 ? 0 : r >= 50 ? 1 : -1;
    S.push({ ad: 'RSI (14)', yon, not: r > 70 ? `${tr(r, 0)}: aşırı alım, geri çekilme riski` : r < 30 ? `${tr(r, 0)}: aşırı satım, tepki gelebilir ama trend zayıf` : `${tr(r, 0)}: ${r >= 50 ? 'alıcılar baskın' : 'satıcılar baskın'}` });
  }
  if (volRatio != null) {
    const hi = volRatio >= 1.3;
    S.push({ ad: 'Hacim', yon: hi ? Math.sign(r1) : 0, not: `Son 5 gün ortalaması 20 günlüğün ${tr(volRatio, 2)} katı${hi ? (r1 >= 0 ? ', hacimli yükseliş' : ', hacimli düşüş') : ''}` });
  }
  if (idx && n > 22) {
    const a = idx.get(t[i]), b = idx.get(t[i - 21]);
    if (a && b) {
      const rs = last / c[i - 21] - 1 - (a / b - 1);
      S.push({ ad: 'Göreli güç (1 ay)', yon: rs > 0 ? 1 : -1, not: `Endekse göre ${rs > 0 ? '+' : ''}${tr(rs * 100)}%` });
    }
  }
  const pos = S.filter(x => x.yon > 0).length, neg = S.filter(x => x.yon < 0).length, net = pos - neg;
  const etiket = net >= 3 ? 'Güçlü' : net >= 1 ? 'Olumlu' : net <= -3 ? 'Zayıf' : net <= -1 ? 'Olumsuz' : 'Kararsız';
  return { etiket, pos, neg, toplam: S.length, sinyaller: S };
}

// Sohbet ve hisse tartışmasının veri sayfası için tek satır.
export function teknikSatir(tk, sv, f) {
  if (!tk && !sv) return '';
  const lv = (xs, ad) => (xs?.length ? `${ad} ${xs.map(x => `${f(x.p)} (${x.n} test)`).join(', ')}` : `${ad} yok`);
  return `  Teknik: ${tk ? `${tk.etiket} (${tk.toplam} göstergenin ${ek(tk.pos)} olumlu, ${ek(tk.neg)} olumsuz)` : '-'} | ${lv(sv?.destek, 'destek')} | ${lv(sv?.direnc, 'direnç')}`;
}
