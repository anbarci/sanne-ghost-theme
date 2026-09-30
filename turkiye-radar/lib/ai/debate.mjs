// Hisse tartışması: boğa ve ayı karşılıklı savunur, hakem karar verir, risk gözden geçirir.
// Akış TradingAgents'tan (github.com/TauricResearch/TradingAgents, Apache-2.0) uyarlandı, kod alınmadı:
//  - Dört analist yerine radarın hazır verisi kullanılır (tarayıcı satırı, skor gerekçeleri, gündem, haber).
//    Bu hem 4 model çağrısı tasarruf eder hem de analistlerin rakam uydurma riskini kaldırır.
//  - 5 basamaklı karar (AL / ARTIR / TUT / AZALT / SAT). Okunamayan karar TUT sayılmaz, İNCELE olur:
//    okunamayan bir kararı "tut" diye kaydetmek, sonraki tartışmalara hiç verilmemiş bir karar taşır.
//  - "Çelişki var diye TUT deme": tartışmada çelişki her zaman olur; hakemin işi güçlü tarafı seçmek.
//  - Karar vadesi dolunca endekse göre getiri (alfa) ölçülür ve aynı hissenin sonraki tartışmasına
//    geçmiş olarak girer. Kısa pencere uzun vadeli tezi çürütmez; bu da hakeme söylenir.
import { complete, costUSD, parseJSON } from './providers.mjs';
import { readJSON, writeJSON } from '../store.mjs';
import { activeProvider, spentToday, spendLog, unverifiedNumbers } from './analyze.mjs';
import { retrieve } from './chat.mjs';

export const RATINGS = ['AL', 'ARTIR', 'TUT', 'AZALT', 'SAT'];
export const REVIEW = 'İNCELE';
const BENCH = { tr: 'XU100', us: 'SP500', eu: 'STOXX50' };
const f = (x, d = 2) => (x == null || !Number.isFinite(+x) ? '-' : Number(x).toLocaleString('tr-TR', { maximumFractionDigits: d }));
const pc = x => (x == null ? '-' : `${x > 0 ? '+' : ''}${f(x * 100, 1)}%`);

const str = { type: 'string' }, obj = props => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props });
const JUDGE_SCHEMA = obj({ karar: { type: 'string', enum: RATINGS }, gerekce: str, adimlar: { type: 'array', items: str }, degistirir: str, vade_gun: { type: 'integer' }, guven: { type: 'string', enum: ['dusuk', 'orta', 'yuksek'] } });
const RISK_SCHEMA = obj({ karar: { type: 'string', enum: RATINGS }, boyut: { type: 'string', enum: ['yok', 'kucuk', 'normal'] }, zarar_kes: str, uyari: str });
const tryJSON = t => { try { return parseJSON(t) || {}; } catch { return {}; } };

const RULES = `Kurallar: Yalnızca VERİ bölümündeki bilgileri kullan; orada olmayan rakam, tarih, bilanço kalemi ya da olay uydurma. Veri yetmiyorsa bunu söyle. Türkçe, sade, en fazla 8 cümle. Rakam kullanırken VERİ'deki satırı an.`;

const BULL = `Sen bir hisse tartışmasında BOĞA tarafısın: bu hisseye yatırım yapmayı savunuyorsun. Güçlü yanları (trend, gündem, haber, göreli güç) kanıta dayanarak öne çıkar. Ayının itirazı varsa ona doğrudan cevap ver. ${RULES}`;
const BEAR = `Sen bir hisse tartışmasında AYI tarafısın: bu hisseden uzak durmayı ya da azaltmayı savunuyorsun. Riskleri (aşırı alım, zayıf trend, olumsuz haber, oynaklık, makro baskı) kanıta dayanarak öne çıkar ve boğanın her iddiasına doğrudan cevap ver; abartılı iyimserliği göster. ${RULES}`;

const JUDGE = `Sen tartışmanın hakemisin. Boğa ve ayının argümanlarını tartıp tek bir karar ver.
Karar ölçeği (tam olarak biri):
- AL: boğa tezi açıkça güçlü; pozisyon aç ya da büyüt
- ARTIR: olumlu; kademeli artır
- TUT: kanıt dengede ya da karar vermeye yetmeyecek kadar zayıf
- AZALT: temkinli; pozisyonu küçült
- SAT: ayı tezi açıkça güçlü; çık ya da uzak dur
Tartışmada çelişki her zaman olur; hangi tarafın güçlü olduğuna karar vermek senin işin, bu yüzden çelişki tek başına TUT sebebi değildir. Güçlü tarafı seç, kararın gücünü tarafın ne kadar açık kazandığına göre ayarla. TUT'u yalnızca tartıdıktan sonra da denge sürüyorsa ya da kanıt çok zayıfsa ver; kararlı görünmek için yön uydurma. Hangi tarafın önce ya da son konuştuğu önemsiz.
GEÇMİŞ KARARLAR bölümü varsa dikkate al; ama kısa bir pencere uzun vadeli bir tezi çürütmez.
Yalnızca şu JSON'u döndür:
{"karar":"AL|ARTIR|TUT|AZALT|SAT","gerekce":"hangi argümanlar belirledi (2-4 cümle)","adimlar":["somut adım"],"degistirir":"bu kararı ne değiştirir (fiyat seviyesi ya da olay)","vade_gun":10,"guven":"dusuk|orta|yuksek"}
vade_gun 5-30 arası. ${RULES}`;

const RISK = `Sen temkinli risk gözden geçiricisisin. Hakemin kararını sermayeyi koruma gözüyle incele: oynaklık, haber riski, likidite, makro baskı. Hakemden daha iyimser bir karara geçemezsin; ya aynı kararı onaylar ya da bir-iki basamak temkinliye çekersin.
Yalnızca şu JSON'u döndür:
{"karar":"AL|ARTIR|TUT|AZALT|SAT","boyut":"yok|kucuk|normal","zarar_kes":"hangi koşulda çıkılır (VERİ'deki seviyelerle)","uyari":"hakemin gözden kaçırdığı en önemli risk (1-2 cümle)"}
${RULES}`;

export function parseRating(x) {
  const t = String(x ?? '').toLocaleUpperCase('tr').replace(/[^A-ZÇĞİÖŞÜ]/g, '');
  return RATINGS.includes(t) ? t : REVIEW;
}
// Risk gözden geçiricisi hakemden iyimser olamaz: daha iyimser bir karar yazarsa hakemin kararı geçerli.
export function finalRating(judge, risk) {
  if (judge === REVIEW) return REVIEW;
  if (risk === REVIEW) return judge;
  return RATINGS.indexOf(risk) >= RATINGS.indexOf(judge) ? risk : judge;
}

export function findRow(snap, kod, market) {
  for (const [m, sc] of Object.entries(snap?.screeners || {})) {
    if (market && m !== market) continue;
    const r = sc?.rows?.find(x => x.kod === kod);
    if (r) return { m, sc, r };
  }
  return null;
}

// Aynı hissenin son kararları ve sonuçları (TradingAgents'ın hafıza günlüğündeki "aynı sembol" bağlamı).
export function pastLines(kod, all = readJSON('debates.json', [])) {
  return all.filter(d => d.kod === kod).slice(0, 3).map(d => {
    const when = new Date(d.at).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
    return d.done
      ? `${when}: ${d.karar} dedin; ${d.gun} günde hisse ${pc(d.getiri)}, endekse göre ${pc(d.alfa)} (${d.hit == null ? 'yönsüz karar' : d.hit ? 'tuttu' : 'tutmadı'})`
      : `${when}: ${d.karar} dedin; vadesi dolmadı`;
  });
}

export function sheet(snap, kod, market) {
  const hit = findRow(snap, kod, market);
  if (!hit) return null;
  const mk = snap.markets || {};
  const macro = ['USDTRY', 'XU100', 'SP500', 'BRENT', 'VIX', 'US10Y'].filter(k => mk[k]).map(k => `${k} ${f(mk[k].price, 4)} (gün ${mk[k].chg > 0 ? '+' : ''}${f(mk[k].chg)}%)`).join(' | ');
  const ret = retrieve(hit.r.kod, snap).replace(/^SORUYLA İLGİLİ VERİ/, 'VERİ');
  const past = pastLines(kod);
  return { ...hit, text: `${ret}\nPİYASA: ${macro}${past.length ? `\nGEÇMİŞ KARARLAR (${kod}):\n${past.map(x => `- ${x}`).join('\n')}` : ''}` };
}

// Model çağrılmadan önceki hatalar: sunucu bu durumda kullanıcının günlük hakkını geri verir.
const early = msg => Object.assign(new Error(msg), { early: true });

export async function debate(kod, settings, { market, uid = null, snap = readJSON('latest.json', null) } = {}) {
  kod = String(kod || '').toUpperCase().replace(/[^A-Z0-9_.]/g, '').slice(0, 15);
  const sh = sheet(snap, kod, market);
  if (!sh) throw early('Bu hisse tarayıcıda yok');
  const p = activeProvider(settings);
  if (!p) throw early('Yapay zeka sağlayıcısı tanımlı değil (yönetim paneli)');
  const spent = spentToday(spendLog());
  if (settings.aiDailyUSD > 0 && spent.usd >= settings.aiDailyUSD) throw early(`Günlük bütçe doldu ($${spent.usd.toFixed(3)} / $${settings.aiDailyUSD})`);
  if (settings.aiDailyTokens > 0 && spent.tokens >= settings.aiDailyTokens) throw early('Günlük token sınırı doldu');

  const opts = { ...p, maxTokens: Math.min(p.maxTokens || 6000, 1500) };
  const usage = { in: 0, out: 0, cacheRead: 0 };
  const call = async (system, user, schema) => {
    const r = await complete(opts, p.key, system, user, schema);
    for (const k of Object.keys(usage)) usage[k] += r.usage?.[k] || 0;
    return r;
  };
  const head = `HİSSE: ${sh.r.kod} (${sh.r.ad})\n${sh.text}`;
  const bull = (await call(BULL, `${head}\n\nİlk konuşan sensin; boğa tezini kur.`)).text.trim();
  const bear = (await call(BEAR, `${head}\n\nBOĞA:\n${bull}\n\nAyı tezini kur ve boğaya cevap ver.`)).text.trim();
  const jr = await call(JUDGE, `${head}\n\nBOĞA:\n${bull}\n\nAYI:\n${bear}`, JUDGE_SCHEMA);
  const judge = tryJSON(jr.text);
  const jk = parseRating(judge.karar);
  const rr = await call(RISK, `${head}\n\nHAKEM KARARI: ${jk}\nGerekçe: ${judge.gerekce || '-'}\nAdımlar: ${(judge.adimlar || []).join(' ; ')}`, RISK_SCHEMA);
  const risk = tryJSON(rr.text);
  const karar = finalRating(jk, parseRating(risk.karar));
  const gun = Math.min(30, Math.max(5, judge.vade_gun | 0 || 10));
  const at = Date.now();
  const bench = BENCH[sh.m];
  const all = readJSON('debates.json', []);
  const entry = {
    id: `${at}-${kod}`, at, uid, kod, ad: sh.r.ad, m: sh.m, price: sh.r.price, bench, benchPrice: snap.markets?.[bench]?.price ?? null,
    karar, hakemKarar: jk, due: at + gun * 864e5, vade: gun,
    boga: bull, ayi: bear,
    hakem: { gerekce: String(judge.gerekce || ''), adimlar: (Array.isArray(judge.adimlar) ? judge.adimlar : []).map(String).slice(0, 5), degistirir: String(judge.degistirir || ''), guven: String(judge.guven || '') },
    risk: { boyut: String(risk.boyut || ''), zarar_kes: String(risk.zarar_kes || ''), uyari: String(risk.uyari || '') },
    provider: p.name, model: jr.model, usage, cost: costUSD(p.model, usage),
  };
  entry.unverified = unverifiedNumbers([bull, bear, entry.hakem.gerekce, entry.hakem.degistirir, entry.risk.zarar_kes, entry.risk.uyari].join('\n'), head);
  writeJSON('debates.json', [entry, ...all].slice(0, 300));
  return entry;
}

// Vadesi dolan kararların endekse göre sonucu. AL/ARTIR endeksi geçerse, AZALT/SAT geride kalırsa tutmuş sayılır;
// TUT ve İNCELE yönsüzdür, getirisi yazılır ama isabete girmez.
export function scoreDebates(snap, now = Date.now()) {
  const all = readJSON('debates.json', []);
  let changed = false;
  for (const d of all) {
    if (d.done || now < d.due || !d.price) continue;
    const row = findRow(snap, d.kod, d.m)?.r;
    const b = snap?.markets?.[d.bench]?.price;
    if (!row?.price || !b || !d.benchPrice) continue;
    const getiri = row.price / d.price - 1, alfa = getiri - (b / d.benchPrice - 1);
    Object.assign(d, { done: true, getiri, alfa, gun: Math.round((now - d.at) / 864e5),
      hit: ['AL', 'ARTIR'].includes(d.karar) ? alfa > 0 : ['AZALT', 'SAT'].includes(d.karar) ? alfa < 0 : null });
    changed = true;
  }
  if (changed) writeJSON('debates.json', all);
  return all;
}
