// İzleme listesi ve fiyat alarmları. PanWatch'ın koşullu fiyat alarmlarından uyarlandı (kod alınmadı):
// koşul + eşik + tekrar kuralı; tetiklenince Telegram'a (açıksa) ve açık panele bildirim.
// Alarmlar üyeye özeldir. Bir alarm aynı İstanbul gününde en fazla bir kez tetiklenir; "bir kez" seçilirse
// tetiklenince kapanır. Fiyat kaynağı radarın kendi verisi: döviz/emtia dakikada bir (canlı katman),
// hisseler tam taramada (15 dk) ve Yahoo'nun 15 dk gecikmesiyle. Arayüz bunu yazar.
import { readJSON, writeJSON } from './store.mjs';

export const KOSUL = { ustu: 'fiyat ≥', alti: 'fiyat ≤', artis: 'günlük değişim ≥ %', dusus: 'günlük düşüş ≥ %' };
const MAX_LISTE = 40, MAX_ALARM = 50;
const trDay = t => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const kodOf = x => String(x || '').toUpperCase().replace(/[^A-Z0-9_.]/g, '').slice(0, 15);
const f = (x, d = 2) => Number(x).toLocaleString('tr-TR', { maximumFractionDigits: d });

export const loadWatch = uid => ({ liste: [], alarmlar: [], log: [], ...(readJSON('watch.json', {})[uid] || {}) });
function saveWatch(uid, w) { const all = readJSON('watch.json', {}); all[uid] = w; writeJSON('watch.json', all); return w; }

// Radarın bildiği son fiyat: piyasa şeridi (canlı), kripto, ya da tarayıcı satırı (her piyasa).
export function quoteOf(snap, kod) {
  const m = snap?.markets?.[kod];
  if (m?.price != null) return { price: m.price, chg: m.roll === 'şüpheli' ? null : m.chg, ad: kod, kaynak: m.live ? 'canlı' : 'tarama' };
  if (kod === 'BTCTRY' && snap?.crypto?.BTCTRY) return { price: snap.crypto.BTCTRY.price, chg: snap.crypto.BTCTRY.chg, ad: 'Bitcoin/TL', kaynak: 'BtcTurk' };
  for (const sc of Object.values(snap?.screeners || {})) {
    const r = sc?.rows?.find(x => x.kod === kod);
    if (r) return { price: r.price, chg: r.r1 == null ? null : r.r1 * 100, ad: r.ad, kaynak: 'tarama', m: sc.market };
  }
  return null;
}

export function toggleWatch(uid, kod) {
  kod = kodOf(kod);
  if (!kod) throw new Error('Kod boş');
  const w = loadWatch(uid);
  if (w.liste.includes(kod)) w.liste = w.liste.filter(x => x !== kod);
  else { if (w.liste.length >= MAX_LISTE) throw new Error(`İzleme listesi en fazla ${MAX_LISTE} kod`); w.liste.push(kod); }
  return saveWatch(uid, w);
}

export function addAlarm(uid, { kod, kosul, deger, tekrar }, snap = readJSON('latest.json', null)) {
  kod = kodOf(kod);
  deger = Number(String(deger).replace(',', '.'));
  if (!kod || !KOSUL[kosul] || !Number.isFinite(deger) || deger <= 0) throw new Error('Kod, koşul ya da eşik geçersiz');
  if (!quoteOf(snap, kod)) throw new Error('Bu kodun fiyatı radarda yok');
  const w = loadWatch(uid);
  if (w.alarmlar.length >= MAX_ALARM) throw new Error(`En fazla ${MAX_ALARM} alarm`);
  const a = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, kod, kosul, deger, tekrar: tekrar === 'bir' ? 'bir' : 'gunluk', aktif: true, olustu: Date.now(), son: null, tetik: 0 };
  w.alarmlar.push(a);
  if (!w.liste.includes(kod) && w.liste.length < MAX_LISTE) w.liste.push(kod);
  saveWatch(uid, w);
  return a;
}

export function deleteAlarm(uid, id) {
  const w = loadWatch(uid);
  w.alarmlar = w.alarmlar.filter(a => a.id !== id);
  return saveWatch(uid, w);
}

export function alarmText(a, q) {
  const what = a.kosul === 'ustu' ? `${f(a.deger, 4)} üstüne çıktı` : a.kosul === 'alti' ? `${f(a.deger, 4)} altına indi` : a.kosul === 'artis' ? `bugün %${f(a.deger)} üstü yükseldi` : `bugün %${f(a.deger)} üstü düştü`;
  return `${a.kod} ${what}: ${f(q.price, 4)}${q.chg != null ? ` (gün ${q.chg > 0 ? '+' : ''}${f(q.chg)}%)` : ''}`;
}

export const hit = (a, q) => (a.kosul === 'ustu' ? q.price >= a.deger : a.kosul === 'alti' ? q.price <= a.deger
  : q.chg == null ? false : a.kosul === 'artis' ? q.chg >= a.deger : q.chg <= -a.deger);

// Tüm üyelerin alarmlarını son veriyle dener. Tetiklenenler kaydedilir ve döndürülür (bildirim çağırana ait).
export function checkAlarms(snap, now = Date.now()) {
  const all = readJSON('watch.json', {});
  const fired = [];
  for (const [uid, w] of Object.entries(all)) {
    for (const a of w.alarmlar || []) {
      if (!a.aktif || (a.son && trDay(a.son) === trDay(now))) continue;
      const q = quoteOf(snap, a.kod);
      if (!q || !hit(a, q)) continue;
      a.son = now; a.tetik++;
      if (a.tekrar === 'bir') a.aktif = false;
      const text = alarmText(a, q);
      (w.log ||= []).unshift({ at: now, id: a.id, kod: a.kod, text });
      w.log = w.log.slice(0, 50);
      fired.push({ uid, text });
    }
  }
  if (fired.length) writeJSON('watch.json', all);
  return fired;
}
