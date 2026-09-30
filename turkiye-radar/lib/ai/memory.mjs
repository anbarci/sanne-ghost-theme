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

export const loadMemory = () => readJSON('memory.json', { dersler: [] });

export function addLesson(text, at = Date.now()) {
  text = String(text || '').trim().slice(0, 240);
  if (text.length < 15) return false;
  const m = loadMemory();
  if (m.dersler.some(d => similarity(text, d.text) >= 0.6)) return false; // aynı dersi tekrar yazma
  m.dersler = [{ at, text }, ...m.dersler].slice(0, 15);
  writeJSON('memory.json', m);
  return true;
}

export function deleteLesson(at) {
  const m = loadMemory();
  m.dersler = m.dersler.filter(d => d.at !== at);
  writeJSON('memory.json', m);
}

// Özete girecek satırlar: önce ölçülen, sonra modelin kendi dersleri (en yeni 6).
export function memoryLines(preds = readJSON('predictions.json', [])) {
  return [...statLessons(preds).map(x => `ölçüm: ${x}`), ...loadMemory().dersler.slice(0, 6).map(d => `ders: ${d.text}`)];
}
