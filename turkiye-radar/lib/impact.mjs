// Türkiye Etki Skoru (0-100): bir olayın Türkiye'ye hangi kanaldan, ne kadar dokunduğunu ölçer.
// LLM kullanmaz; saf sözlük + piyasa teyidi. Bu yüzden her haberde çalıştırmak bedava.
import { fold } from './rss.mjs';

const K = {
  geo: ['suriye', 'syria', 'irak', 'iraq', 'iran', 'yunanistan', 'greece', 'greek', 'kıbrıs', 'cyprus', 'ermenistan', 'armenia', 'azerbaycan', 'azerbaijan', 'gürcistan', 'georgia', 'bulgaristan', 'bulgaria', 'rusya', 'russia', 'kremlin', 'ukrayna', 'ukraine', 'karadeniz', 'black sea', 'israil', 'israel', 'gazze', 'gaza', 'lübnan', 'lebanon', 'hizbullah', 'hezbollah', 'doğu akdeniz', 'eastern mediterranean', 'ege', 'aegean', 'boğaz', 'bosphorus', 'dardanelles', 'pkk', 'ypg', 'sdg', 'sdf', 'nato', 'kafkas', 'caucasus', 'libya', 'mısır', 'egypt'],
  energy: ['brent', 'petrol', 'crude', 'oil price', 'doğalgaz', 'doğal gaz', 'natural gas', 'lng', 'opec', 'boru hattı', 'pipeline', 'türkakım', 'turkstream', 'tanap', 'akkuyu', 'elektrik fiyat', 'enerji', 'energy', 'akaryakıt', 'benzin', 'motorin', 'rafineri', 'refinery'],
  trade: ['ihracat', 'export', 'ithalat', 'import', 'gümrük', 'tariff', 'almanya', 'germany', 'german', 'avrupa birliği', 'european union', ' ab ', ' eu ', 'çin', 'china', 'chinese', 'navlun', 'freight', 'shipping', 'süveyş', 'suez', 'kızıldeniz', 'red sea', 'husi', 'houthi', 'tedarik zinciri', 'supply chain', 'otomotiv', 'automotive', 'tekstil', 'textile', 'çelik', 'steel'],
  finance: [' fed ', 'federal reserve', 'faiz', 'interest rate', 'rate cut', 'rate hike', 'enflasyon', 'inflation', 'merkez bankası', 'central bank', 'tcmb', 'dolar', 'dollar', 'euro', 'lira', 'rezerv', 'reserve', 'cds', "moody's", 'moody', 's&p', 'fitch', 'kredi notu', 'credit rating', 'tahvil', 'bond', 'eurobond', 'borsa', 'bist', 'resesyon', 'recession', 'altın', 'gold', 'sermaye çıkışı', 'capital outflow', 'carry trade', 'swap', 'imf', 'dxy', 'vix', 'wall street'],
  tourism: ['turist', 'tourist', 'turizm', 'tourism', 'rezervasyon', 'booking', 'uçuş', 'flight', 'havayolu', 'airline', ' thy ', 'turkish airlines', 'otel', 'hotel', 'antalya', 'kapadokya'],
  direct: ['türkiye', 'turkey', 'türkiye\'', 'turkish', ' türk ', 'erdoğan', 'erdogan', 'ankara', 'istanbul', 'i̇stanbul', 'bist', 'tcmb', 'şimşek', 'simsek', 'karahan', 'fidan', ' tl ', 'türk lirası'],
};

const SEVERE_RAW = ['savaş', 'war', 'saldırı', 'attack', 'strike', 'patlama', 'explosion', 'deprem', 'earthquake', 'darbe', 'coup', 'yaptırım', 'sanction', 'çöküş', 'collapse', 'kriz', 'crisis', 'acil', 'emergency', 'rekor', 'record', 'işgal', 'invasion', 'füze', 'missile', 'ölü', 'killed', 'dead', 'default', 'iflas', 'bankrupt', 'ambargo', 'embargo', 'tsunami', 'yangın', 'wildfire', 'sel', 'flood'];

for (const k of Object.keys(K)) K[k] = K[k].map(fold);
const SEVERE = SEVERE_RAW.map(fold);

// Harita için kaba konumlar (ülke / bölge merkezi).
export const PLACES = {
  suriye: [35, 38.5], syria: [35, 38.5], irak: [33.3, 44.4], iraq: [33.3, 44.4], iran: [32.4, 53.7], yunanistan: [38.5, 23.3], greece: [38.5, 23.3],
  kıbrıs: [35.1, 33.4], cyprus: [35.1, 33.4], ermenistan: [40.1, 44.5], armenia: [40.1, 44.5], azerbaycan: [40.4, 49.9], azerbaijan: [40.4, 49.9],
  gürcistan: [41.7, 44.8], georgia: [41.7, 44.8], bulgaristan: [42.7, 23.3], bulgaria: [42.7, 23.3], rusya: [45.5, 40], russia: [45.5, 40],
  ukrayna: [47, 33], ukraine: [47, 33], karadeniz: [43.2, 34.5], 'black sea': [43.2, 34.5], israil: [31.8, 35], israel: [31.8, 35],
  gazze: [31.4, 34.4], gaza: [31.4, 34.4], lübnan: [33.9, 35.8], lebanon: [33.9, 35.8], libya: [32.5, 17], mısır: [30, 31.2], egypt: [30, 31.2],
  'kızıldeniz': [20, 38.5], 'red sea': [20, 38.5], ege: [38.5, 25.5], aegean: [38.5, 25.5],
};

const norm = s => ' ' + fold(s).replace(/[^\p{L}\p{N}&'%$]+/gu, ' ') + ' ';
const PLACE_KEYS = Object.keys(PLACES).map(p => [fold(p), PLACES[p]]);
const count = (t, list) => list.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);

// moves: piyasa teyidi için son değişimler (% olarak): { brent, usdtry, vix, xu100 }
export function impact(text, weights, moves = {}) {
  const t = norm(text);
  const ch = {};
  for (const k of Object.keys(K)) ch[k] = Math.min(1, count(t, K[k]) / 2);

  // Piyasa gerçekten tepki verdiyse ilgili kanalı güçlendir; vermediyse metin tek başına yeterli sayılmaz.
  const boost = (x, full) => Math.min(0.5, Math.abs(x || 0) / full);
  if (ch.energy) ch.energy = Math.min(1, ch.energy + boost(moves.brent, 6));
  if (ch.finance) ch.finance = Math.min(1, ch.finance + boost(moves.usdtry, 2) + boost(moves.vix, 20));

  // Normalizasyon en büyük 3 ağırlığa göre: gerçek olaylar nadiren 6 kanalın hepsine dokunur.
  // Böylece 3 kanalı tam tetikleyen bir olay 100'e ulaşabilir, tek kanallı olay orta kalır.
  let score = 0;
  for (const [k, w] of Object.entries(weights)) score += (ch[k] || 0) * w;
  const top3 = Object.values(weights).sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
  score = top3 ? Math.min(1, score / top3) : 0;

  const sev = Math.min(1, count(t, SEVERE) / 2);
  // Türkiye ile hiç bağı olmayan (hiçbir kanal tetiklenmeyen) haber sıfırda kalır.
  const final = Math.round(Math.min(100, score * 100 * (0.75 + 0.5 * sev)));
  const channels = Object.entries(ch).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const place = PLACE_KEYS.find(([p]) => t.includes(' ' + p));
  return { score: final, channels, severity: sev, place: place ? place[1] : null };
}

// Haber tekrarlarını birleştir: aynı olayı 10 site yazınca 10 kez saymayalım.
export function dedupe(items) {
  const seen = [];
  const out = [];
  for (const it of items.sort((a, b) => (b.impact?.score || 0) - (a.impact?.score || 0))) {
    const sig = new Set(norm(it.title).split(' ').filter(w => w.length > 3).map(w => w.slice(0, 5)));
    const dup = seen.find(s => jaccard(s.sig, sig) > 0.5);
    if (dup) { dup.item.also = (dup.item.also || 0) + 1; dup.item.srcs.add(it.srcName); continue; }
    it.srcs = new Set([it.srcName]);
    seen.push({ sig, item: it });
    out.push(it);
  }
  for (const it of out) { it.srcs = [...it.srcs]; }
  return out;
}

function jaccard(a, b) {
  let i = 0;
  for (const x of a) if (b.has(x)) i++;
  return i / (a.size + b.size - i || 1);
}
