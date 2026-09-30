// Yapay zekanın hafızası: hatalarından çıkan dersler. İki kaynaktan beslenir:
//  1) İstatistik (model kullanılmaz): vadesi dolan tahminlerin varlık başına isabeti, yüksek güvenle verilen
//     tahminlerin gerçek isabeti (kalibrasyon), yön yanlılığı. Bunlar uydurulamaz; fiyatlardan hesaplanır.
//  2) Modelin kendi yazdığı ders (analizdeki "ders" alanı). Tekrarlar ayıklanır, en fazla 15 tutulur.
// Hafıza her analizde veri özetine "HAFIZA" satırları olarak girer.
import { readJSON, writeJSON } from '../store.mjs';
import { similarity } from '../verify.mjs';

const pct = x => Math.round(x * 100);

export function statLessons(preds) {
  const done = preds.filter(p => p.done);
  if (done.length < 3) return [];
  const out = [];
  const by = {};
  for (const p of done) (by[p.kod] ||= []).push(p);
  for (const [kod, xs] of Object.entries(by)) {
    if (xs.length < 3) continue;
    const hit = xs.filter(x => x.hit).length;
    const wrongDir = xs.filter(x => !x.hit).map(x => x.yon);
    const common = wrongDir.sort((a, b) => wrongDir.filter(v => v === b).length - wrongDir.filter(v => v === a).length)[0];
    out.push(`${kod}: ${xs.length} tahminin ${hit}'i tuttu${hit / xs.length < 0.5 && common ? ` (tutmayanların çoğu "${common}" dediklerin)` : ''}`);
  }
  const high = done.filter(p => p.p >= 0.65);
  if (high.length >= 3) {
    const r = high.filter(p => p.hit).length / high.length;
    out.push(`%65 ve üstü güvenle verdiğin ${high.length} tahminin %${pct(r)}'i tuttu${r < 0.6 ? ': güvenini düşür' : ''}`);
  }
  if (done.length >= 5) {
    for (const yon of ['yukari', 'asagi', 'yatay']) {
      const share = done.filter(p => p.yon === yon).length / done.length;
      const real = done.filter(p => p.actual === yon).length / done.length;
      if (share >= 0.6 && share - real >= 0.25) out.push(`Tahminlerin %${pct(share)}'i "${yon}", gerçekleşen ise %${pct(real)}: yön yanlılığı var`);
    }
  }
  return out;
}

export const loadMemory = () => ({ dersler: [], notlar: [], ...readJSON('memory.json', {}) });

// Kullanıcı notları: sohbette "hatırla: ..." ya da Hafıza panelinden. Portföy, risk tercihi, hedef gibi
// kalıcı bilgiler; her analize ve sohbete girer, böylece öneriler kişiye göre olur.
// Notlar üyeye aittir (uid). Ortak analize yalnızca yönetici üyelerin notları girer; bir üyenin portföy
// notu başka üyelerin gördüğü analize sızmasın.
export function addNote(text, uid, at = Date.now()) {
  text = String(text || '').trim().slice(0, 300);
  if (text.length < 3) return false;
  const m = loadMemory();
  const mine = m.notlar.filter(n => n.uid === uid && n.text !== text);
  m.notlar = [{ at, text, uid }, ...mine.slice(0, 29), ...m.notlar.filter(n => n.uid !== uid)];
  writeJSON('memory.json', m);
  return true;
}
export function deleteNote(at, uid) {
  const m = loadMemory();
  m.notlar = m.notlar.filter(n => !(n.at === at && n.uid === uid));
  writeJSON('memory.json', m);
}
export const myNotes = uid => loadMemory().notlar.filter(n => n.uid === uid);
export const noteLines = uid => myNotes(uid).slice(0, 15).map(n => n.text);
export function ownerNoteLines() {
  const admins = new Set(readJSON('users.json', []).filter(u => u.rank === 'yonetici').map(u => u.id));
  return loadMemory().notlar.filter(n => !n.uid || admins.has(n.uid)).slice(0, 15).map(n => n.text);
}

// Ders hafızası, PSSA'nın (github.com/Sparticle62ops/pssa) hafıza kurallarından uyarlandı (kod alınmadı):
//  - Yenilik kapısı: yeni ders ancak mevcutlara benzemiyorsa yeni kayıt olur.
//  - Pekiştirme: benzer ders tekrar gelirse silinmez; "sayı" artar ve tarihi yenilenir.
//  - Koruma (PSSA'daki refractory sayacı): 3 kez pekişen ders "kararlı" olur; kapasite dolunca otomatik
//    silinmez, tek seferlik ters bir dersle yerinden oynamaz. Yalnızca kullanıcı silebilir.
//  - Kapasite 30: dolunca kararlı olmayanlardan puanı en düşük olan (sayı × tazelik) çıkar.
//  - Sınırlı okuma: özete tüm hafıza değil, kararlı ilkeler (en fazla 3) + o anki bağlama en ilgili 4 ders
//    girer. Hafıza büyüdükçe token maliyeti büyümez.
export const STABLE = 3, CAPACITY = 30;
const score = (d, now) => (d.sayi || 1) * Math.exp(-(now - (d.son || d.at)) / (30 * 864e5)); // 30 günde ~e kat söner

export function addLesson(text, at = Date.now()) {
  text = String(text || '').trim().slice(0, 240);
  if (text.length < 15) return false;
  const m = loadMemory();
  let best = null, bestSim = 0;
  for (const d of m.dersler) { const sim = similarity(text, d.text); if (sim > bestSim) { bestSim = sim; best = d; } }
  if (best && bestSim >= 0.6) { // pekiştirme
    best.sayi = (best.sayi || 1) + 1; best.son = at;
    writeJSON('memory.json', m);
    return 'pekisti';
  }
  m.dersler.push({ at, son: at, text, sayi: 1 });
  if (m.dersler.length > CAPACITY) {
    const loose = m.dersler.filter(d => (d.sayi || 1) < STABLE);
    if (loose.length) { const worst = loose.reduce((a, b) => (score(a, at) <= score(b, at) ? a : b)); m.dersler = m.dersler.filter(d => d !== worst); }
  }
  writeJSON('memory.json', m);
  return 'yeni';
}

export function deleteLesson(at) {
  const m = loadMemory();
  m.dersler = m.dersler.filter(d => d.at !== at);
  writeJSON('memory.json', m);
}

const stems = t => new Set(String(t).toLocaleLowerCase('tr').split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 4).map(w => w.slice(0, 5)));
// Bağlama göre seçim: kararlı ilkeler + ilgililik (ortak kelime kökü) ve pekiştirme puanına göre en iyi 4 ders.
export function pickLessons(context = '', now = Date.now(), dersler = loadMemory().dersler) {
  const stable = dersler.filter(d => (d.sayi || 1) >= STABLE).sort((a, b) => (b.sayi || 1) - (a.sayi || 1)).slice(0, 3);
  const ctx = stems(context);
  const rel = d => { let n = 0; for (const w of stems(d.text)) if (ctx.has(w)) n++; return n; };
  const rest = dersler.filter(d => !stable.includes(d))
    .map(d => ({ d, k: rel(d) * 2 + score(d, now) }))
    .sort((a, b) => b.k - a.k).slice(0, 4).map(x => x.d);
  return { stable, rest };
}

// Özete girecek satırlar: önce ölçülen (fiyatlardan), sonra kararlı ilkeler, sonra bağlama en ilgili dersler.
export function memoryLines(context = '', preds = readJSON('predictions.json', [])) {
  const { stable, rest } = pickLessons(context);
  return [...statLessons(preds).map(x => `ölçüm: ${x}`), ...stable.map(d => `ilke (${d.sayi} kez doğrulandı): ${d.text}`), ...rest.map(d => `ders: ${d.text}`)];
}
