// AI analizi: tek çağrıda üç bakış açısı + varlık beklentileri + işlem fikirleri.
// Token tasarrufu: (1) sıkıştırılmış veri özeti, (2) değişmeyen sistem metni önbellekte,
// (3) özet değişmediyse ya da delta küçükse çağrı yapılmaz, (4) üç ayrı çağrı yerine tek çağrı.
import { createHash } from 'node:crypto';
import { complete, parseJSON, costUSD } from './providers.mjs';
import { readJSON, writeJSON, getSecret } from '../store.mjs';

export const ASSETS = ['USDTRY', 'EURTRY', 'GRAM_ALTIN', 'XU100', 'BRENT', 'BTCTRY'];

const str = { type: 'string' };
const strs = { type: 'array', items: str };
const view = (extra = {}) => ({ type: 'object', additionalProperties: false, required: ['yorum', 'dayanak', ...Object.keys(extra)], properties: { yorum: str, dayanak: strs, ...extra } });

export const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['ozet', 'kotumser', 'iyimser', 'tarafsiz', 'varliklar', 'fikirler', 'guven'],
  properties: {
    ozet: str,
    kotumser: view({ olasilik: { type: 'integer' } }),
    iyimser: view({ olasilik: { type: 'integer' } }),
    tarafsiz: view({ izle: strs }),
    varliklar: {
      type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['kod', 'yon', 'vade_gun', 'olasilik', 'gerekce'],
        properties: { kod: { type: 'string', enum: ASSETS }, yon: { type: 'string', enum: ['yukari', 'asagi', 'yatay'] }, vade_gun: { type: 'integer' }, olasilik: { type: 'integer' }, gerekce: str },
      },
    },
    fikirler: {
      type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['baslik', 'enstruman', 'yon', 'gerekce', 'risk', 'gecersiz_kilan'],
        properties: { baslik: str, enstruman: str, yon: { type: 'string', enum: ['al', 'sat', 'bekle', 'koru'] }, gerekce: str, risk: str, gecersiz_kilan: str },
      },
    },
    guven: { type: 'string', enum: ['dusuk', 'orta', 'yuksek'] },
  },
};

// Sabit sistem metni: tarih/saat gibi değişken hiçbir şey içermez, yoksa önbellek her seferinde bozulur.
export const SYSTEM = `Sen Türkiye odaklı bir makro-finans analistisin. Kullanıcıya verilen VERİ ÖZETİ dışında bilgi kullanma; bilmediğin şeyi uydurma.

Görev: Türkiye ekonomisi ve piyasaları (dolar/TL, euro/TL, gram altın, BIST, Brent, kripto) için aynı veriden üç ayrı bakış açısı üret.
- kotumser: Veride kötüye işaret eden ne varsa onu öne çıkar. Riskleri, zincirleme etkileri anlat.
- iyimser: Veride iyiye işaret eden ne varsa onu öne çıkar. Toparlanma kanallarını anlat.
- tarafsiz: İki tarafı tart, hangi senaryonun neden daha olası olduğunu söyle, belirsizlikleri ve "izle" listesinde takip edilecek somut göstergeleri ver.

Kurallar:
1. Her "dayanak" maddesi özetteki somut bir veriye atıf yapmalı (rakam, kaynak adı ya da haber başlığı). Atıf yapamıyorsan o maddeyi yazma.
2. kotumser.olasilik + iyimser.olasilik <= 100 olsun; kalan kısım "baz senaryo"dur.
3. [UYUMSUZ] etiketli haberlerin başlığı içerikle örtüşmüyor; başlığa değil özetteki içeriğe güven.
4. Haberlerin yayın çizgisi etiketli (resmi, iktidara-yakın, muhalif, bağımsız, uluslararası, dünya). Tek bir çizginin anlatısına yaslanma; çelişki varsa belirt.
5. varliklar: her varlık için en fazla 1 kayıt, vade_gun 1-30 arası. yukari = vade sonunda +%0,5'ten fazla, asagi = -%0,5'ten fazla düşüş, yatay = arada. olasilik 0-100 kalibre edilmiş olsun: emin değilsen 50-60 civarı ver.
6. fikirler: en fazla 5, kişisel kullanım içindir. Her fikirde somut gerekçe, risk ve fikri geçersiz kılacak koşul (seviye ya da olay) olsun.
7. Türkçe yaz. Kısa ve net ol: ozet en fazla 2 cümle, her yorum en fazla 4 cümle, her dayanak tek cümle.
8. Yalnızca şemaya uyan JSON döndür.`;

const f = (x, d = 2) => (x == null ? '-' : Number(x).toLocaleString('tr-TR', { maximumFractionDigits: d }));
const sign = x => (x > 0 ? '+' : '') + f(x);

// Farklı yayın çizgilerinden dengeli haber seçimi: en yüksek skorlulardan, çizgi başına sırayla.
function balancedNews(news, n = 16) {
  const by = {};
  for (const it of news.filter(x => x.impact?.score >= 20)) (by[it.stance] ||= []).push(it);
  const out = [];
  const keys = Object.keys(by);
  for (let round = 0; out.length < n && keys.some(k => by[k][round]); round++) {
    for (const k of keys) if (by[k][round] && out.length < n) out.push(by[k][round]);
  }
  return out.sort((a, b) => b.impact.score - a.impact.score);
}

export function buildDigest(s, prevSummary) {
  const m = s.markets || {};
  const L = [];
  const mk = ['USDTRY', 'EURTRY', 'GRAM_ALTIN', 'ONS', 'XU100', 'XBANK', 'BRENT', 'TTF', 'DXY', 'VIX', 'US10Y', 'SP500', 'TUR_ETF']
    .filter(k => m[k]).map(k => `${k} ${f(m[k].price)} (${sign(m[k].chg)}%${m[k].anomaly ? ' OLAĞANDIŞI' : ''})`);
  if (mk.length) L.push('PİYASA: ' + mk.join(' | '));
  if (s.crypto?.BTCTRY) L.push(`KRİPTO: BTCTRY ${f(s.crypto.BTCTRY.price, 0)} (${sign(s.crypto.BTCTRY.chg)}%) | USDT/TRY makası %${f(s.usdtPremium)}`);
  const w = Object.entries(m).filter(([k, v]) => v.sym?.endsWith?.('.IS') && !['XU100', 'XU030', 'XBANK'].includes(k));
  if (w.length) L.push('İZLEME: ' + w.map(([k, v]) => `${k} ${sign(v.chg)}%`).join(' '));
  if (s.tcmb?.rates?.USD) L.push(`TCMB ${s.tcmb.date}: USD ${s.tcmb.rates.USD.sell} EUR ${s.tcmb.rates.EUR?.sell}`);
  if (s.evds && Object.keys(s.evds).length) L.push('EVDS: ' + Object.entries(s.evds).map(([k, v]) => `${k}=${f(v.value)}${v.yoy != null ? ` (yıllık %${v.yoy})` : ''} [${v.date}]`).join(' | '));
  if (s.fred && Object.keys(s.fred).length) L.push('ABD: ' + Object.entries(s.fred).map(([k, v]) => `${k} ${v.value}`).join(' | '));
  const imf = s.macro?.imf;
  if (imf && Object.keys(imf).length) L.push('IMF TR tahmin: ' + Object.entries(imf).map(([k, v]) => `${k} ${Object.entries(v).map(([y, x]) => `${y}:${f(x, 1)}`).join('/')}`).join(' | '));
  if (s.epias?.avg) L.push(`ELEKTRİK PTF ${s.epias.day}: ort ${s.epias.avg} TL/MWh`);
  const q = s.quakes?.local?.filter(x => x.mag >= 4) || [];
  if (q.length) L.push('DEPREM(24s,M4+): ' + q.slice(0, 5).map(x => `M${x.mag} ${x.place}`).join('; '));
  if (s.fires?.count) L.push(`YANGIN: ${s.fires.count} sıcak nokta (NASA FIRMS, 24s)`);
  if (s.tone?.length) L.push(`DÜNYA BASINI TR TONU (GDELT, 7g): son ${s.tone.at(-1)[1]}, 7g önce ${s.tone[0][1]}`);
  if (s.resmiGazete?.items?.length) L.push('RESMİ GAZETE: ' + s.resmiGazete.items.slice(0, 5).map(x => x.title.slice(0, 90)).join(' ; '));
  L.push('HABERLER (etki 0-100 | kanallar | kaynak/çizgi):');
  for (const n of balancedNews(s.news || [])) {
    L.push(`- [${n.impact.score}|${n.impact.channels.slice(0, 3).join(',')}|${n.srcName}/${n.stance}${n.also ? `,+${n.also} kaynak` : ''}]${n.misleading ? ' [UYUMSUZ]' : ''} ${n.title}${n.lead ? ' — ' + n.lead.slice(0, 200) : ''}`);
  }
  if (s.delta?.events?.length) L.push('SON DEĞİŞİMLER: ' + s.delta.events.slice(0, 8).map(e => e.text).join(' ; '));
  if (prevSummary) L.push('ÖNCEKİ ANALİZ ÖZETİ: ' + prevSummary);
  return L.join('\n');
}

export function activeProvider(settings) {
  const p = settings.providers.find(x => x.id === settings.activeProvider) || settings.providers[0];
  return p ? { ...p, key: getSecret(settings, `AI_KEY_${p.id}`) } : null;
}

export async function analyze(snap, settings, { force = false } = {}) {
  const p = activeProvider(settings);
  if (!p) return { skipped: 'Yapay zeka sağlayıcısı tanımlı değil (admin paneli)' };
  const hist = readJSON('analyses.json', []);
  const last = hist[0];
  const digest = buildDigest(snap, last?.result?.tarafsiz?.yorum);
  const h = createHash('sha1').update(digest.replace(/ÖNCEKİ ANALİZ ÖZETİ:.*$/m, '')).digest('hex');
  if (!force && last) {
    const ageMin = (Date.now() - last.at) / 60e3;
    if (last.hash === h) return { skipped: 'Veri değişmedi' };
    if (ageMin < settings.aiIntervalMin) return { skipped: `Son analiz ${Math.round(ageMin)} dk önce` };
    if ((snap.delta?.score || 0) < settings.aiMinDelta && ageMin < settings.aiIntervalMin * 4) return { skipped: `Değişim puanı düşük (${snap.delta?.score || 0} < ${settings.aiMinDelta})` };
  }
  const t0 = Date.now();
  const r = await complete(p, p.key, SYSTEM, `VERİ ÖZETİ (${new Date(snap.at).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}):\n${digest}`, SCHEMA);
  const result = parseJSON(r.text);
  const entry = { at: Date.now(), hash: h, provider: p.name, model: r.model, ms: Date.now() - t0, usage: r.usage, cost: costUSD(p.model, r.usage), digestChars: digest.length, result };
  writeJSON('analyses.json', [entry, ...hist].slice(0, 60));
  recordPredictions(entry, snap);
  return entry;
}

// ---- Tahmin karnesi ----
const priceOf = (snap, kod) => (kod === 'BTCTRY' ? snap.crypto?.BTCTRY?.price : snap.markets?.[kod]?.price);

function recordPredictions(entry, snap) {
  const preds = readJSON('predictions.json', []);
  for (const v of entry.result.varliklar || []) {
    const base = priceOf(snap, v.kod);
    if (!base) continue;
    const days = Math.min(30, Math.max(1, v.vade_gun | 0));
    preds.push({ id: `${entry.at}-${v.kod}`, at: entry.at, due: entry.at + days * 864e5, kod: v.kod, yon: v.yon, p: Math.min(100, Math.max(0, v.olasilik)) / 100, base, model: entry.model, provider: entry.provider });
  }
  writeJSON('predictions.json', preds.slice(-2000));
}

export function scorePredictions(snap) {
  const preds = readJSON('predictions.json', []);
  let changed = false;
  for (const x of preds) {
    if (x.done || Date.now() < x.due) continue;
    const now = priceOf(snap, x.kod);
    if (!now) continue;
    const chg = (now / x.base - 1) * 100;
    const actual = chg > 0.5 ? 'yukari' : chg < -0.5 ? 'asagi' : 'yatay';
    x.done = true; x.actual = actual; x.chg = Math.round(chg * 100) / 100;
    x.hit = actual === x.yon;
    x.brier = (x.p - (x.hit ? 1 : 0)) ** 2; // 0 = kusursuz, 0.25 = yazı-tura, 1 = tamamen yanlış ve emin
    changed = true;
  }
  if (changed) writeJSON('predictions.json', preds);
  return preds;
}

export function scorecard() {
  const preds = readJSON('predictions.json', []);
  const done = preds.filter(x => x.done);
  const by = {};
  for (const x of done) {
    const k = `${x.provider} · ${x.model}`;
    const b = (by[k] ||= { n: 0, hit: 0, brier: 0 });
    b.n++; b.hit += x.hit ? 1 : 0; b.brier += x.brier;
  }
  return {
    open: preds.filter(x => !x.done).length,
    done: done.length,
    models: Object.entries(by).map(([k, b]) => ({ model: k, n: b.n, isabet: Math.round((b.hit / b.n) * 100), brier: Math.round((b.brier / b.n) * 1000) / 1000 })),
    recent: done.slice(-30).reverse(),
  };
}
