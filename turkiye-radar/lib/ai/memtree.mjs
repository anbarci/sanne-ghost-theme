// Hafıza ağacı (PageIndex fikri: vektör araması yerine içindekiler ağacı + gerekince düğümü açıp okuma).
// Tüm analizler sınırsız bir arşivde tutulur (analyses.json yalnızca son 60'ı taşır). Arşivden, model
// kullanmadan, ay → hafta → gün → analiz ağacı ve her düğüm için sayılarla bir özet çıkarılır.
// Sohbette model önce kısa içindekiler tablosunu görür; "OKU: 2026-H39" gibi bir satırla düğüm ister,
// ya da soru "dün", "geçen hafta", "25 Eylül" gibi bir tarih içeriyorsa ilgili düğüm kendiliğinden açılır.
import { readJSON, writeJSON } from '../store.mjs';
import { fold } from '../rss.mjs';

const TZ = 'Europe/Istanbul';
const dayOf = t => new Date(t).toLocaleDateString('sv-SE', { timeZone: TZ });
const monthOf = t => dayOf(t).slice(0, 7);
// ISO hafta: "2026-H39" (Türkçe "hafta").
export function weekOf(t) {
  const d = new Date(`${dayOf(t)}T00:00:00Z`);
  const wd = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - wd + 3);
  const y = d.getUTCFullYear(), first = new Date(Date.UTC(y, 0, 4));
  const w = 1 + Math.round(((d - first) / 864e5 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return `${y}-H${String(w).padStart(2, '0')}`;
}
const hm = t => new Date(t).toLocaleTimeString('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const f = (x, d = 2) => (x == null ? '-' : Number(x).toLocaleString('tr-TR', { maximumFractionDigits: d }));
const PX = ['USDTRY', 'EURTRY', 'GRAM_ALTIN', 'XU100', 'BRENT'];

// Arşiv kaydı: analizin sohbete yetecek özü (~1,5 KB). Veri özetinin tamamı son analizlerde provenance'ta durur.
export function archiveEntry(a, snap) {
  const r = a.result || {};
  return {
    at: a.at, provider: a.provider, model: a.model,
    ozet: r.ozet, tarafsiz: r.tarafsiz?.yorum, kotumser: r.kotumser?.olasilik, iyimser: r.iyimser?.olasilik,
    varliklar: (r.varliklar || []).map(v => ({ kod: v.kod, yon: v.yon, olasilik: v.olasilik, vade_gun: v.vade_gun })),
    fikirler: (r.fikirler || []).map(x => `${x.baslik} [${x.yon}]`), eylem: (r.eylem || []).map(e => e.adim), ders: r.ders || '',
    haberler: (a.provenance?.haberler || []).slice(0, 6).map(n => `${n.title} [${n.src}]`),
    fiyat: Object.fromEntries(PX.filter(k => snap?.markets?.[k]).map(k => [k, snap.markets[k].price])),
  };
}

export function archive(a, snap) {
  const arr = readJSON('archive.json', []);
  if (!arr.some(x => x.at === a.at)) arr.push(archiveEntry(a, snap));
  writeJSON('archive.json', arr.slice(-5000)); // ~7 MB'a kadar; saatlik analizle 7 aydan fazla
}

// İlk çalıştırmada son 60 analizden arşiv doldurulur.
export function loadArchive() {
  let arr = readJSON('archive.json', null);
  if (!arr) {
    arr = readJSON('analyses.json', []).map(a => archiveEntry(a, null)).reverse();
    writeJSON('archive.json', arr);
  }
  return arr;
}

// Bir grup analizin sayısal özeti: fiyatın ilk→son hali, tahminlerin sonucu, en sık tekrarlanan ders.
function groupSummary(items, preds) {
  if (!items.length) return 'analiz yok';
  const first = items[0], last = items.at(-1);
  const px = PX.filter(k => first.fiyat?.[k] && last.fiyat?.[k]).slice(0, 3).map(k => `${k} ${f(first.fiyat[k])}→${f(last.fiyat[k])}`);
  const ats = new Set(items.map(x => x.at));
  const ps = preds.filter(p => ats.has(p.at) && p.done);
  const hit = ps.filter(p => p.hit).length;
  return [`${items.length} analiz`, px.join(', '), ps.length ? `tahmin ${hit}/${ps.length} tuttu` : '', `son görüş: ${String(last.ozet || '').slice(0, 110)}`].filter(Boolean).join(' | ');
}

export function buildTree(arr = loadArchive(), preds = readJSON('predictions.json', [])) {
  const months = new Map();
  for (const a of [...arr].sort((x, y) => x.at - y.at)) {
    const m = monthOf(a.at), w = weekOf(a.at), d = dayOf(a.at);
    if (!months.has(m)) months.set(m, new Map());
    const weeks = months.get(m);
    if (!weeks.has(w)) weeks.set(w, new Map());
    const days = weeks.get(w);
    if (!days.has(d)) days.set(d, []);
    days.get(d).push(a);
  }
  return { months, preds };
}

// Sohbete giden içindekiler: son 6 hafta hafta hafta, daha eskisi ay ay. Her satır bir düğüm kimliği taşır.
export function toc(now = Date.now(), arr = loadArchive(), preds = readJSON('predictions.json', [])) {
  if (!arr.length) return '';
  const { months } = buildTree(arr, preds);
  const recentWeeks = new Set(Array.from({ length: 6 }, (_, i) => weekOf(now - i * 7 * 864e5)));
  const L = [];
  for (const [m, weeks] of [...months].reverse()) {
    const wk = [...weeks].reverse();
    if (wk.some(([w]) => recentWeeks.has(w))) {
      for (const [w, days] of wk) L.push(`[${w}] ${groupSummary([...days.values()].flat(), preds)}`);
    } else L.push(`[${m}] ${groupSummary([...weeks.values()].flatMap(d => [...d.values()].flat()), preds)}`);
  }
  return `HAFIZA AĞACI (geçmiş analizlerin içindekiler tablosu; ayrıntı için düğüm kimliğiyle OKU):\n${L.slice(0, 14).join('\n')}`;
}

// Düğüm okuma: ay → haftalar, hafta → günler ve analiz satırları, gün → analizlerin ayrıntısı, A<zaman> → tek analiz.
export function readNode(id, arr = loadArchive(), preds = readJSON('predictions.json', [])) {
  id = String(id).trim().replace(/^\[|\]$/g, '');
  const byAt = new Map(arr.map(a => [String(a.at), a]));
  const outcome = a => a.varliklar.map(v => {
    const p = preds.find(x => x.id === `${a.at}-${v.kod}`);
    return `${v.kod} ${v.yon} %${v.olasilik}/${v.vade_gun}g${p?.done ? (p.hit ? ' TUTTU' : ` TUTMADI (${f(p.chg)}%)`) : ''}`;
  }).join(', ');
  const detail = a => [`[A${a.at}] ${dayOf(a.at)} ${hm(a.at)} · ${a.provider}`, `Özet: ${a.ozet}`, a.tarafsiz ? `Tarafsız: ${a.tarafsiz}` : '',
    `Kötümser %${a.kotumser ?? '-'} / iyimser %${a.iyimser ?? '-'}`, a.varliklar.length ? `Tahminler: ${outcome(a)}` : '',
    a.fikirler.length ? `Fikirler: ${a.fikirler.join(' ; ')}` : '', a.eylem?.length ? `Eylem: ${a.eylem.join(' ; ')}` : '',
    a.ders ? `Ders: ${a.ders}` : '', a.haberler.length ? `Dayandığı haberler: ${a.haberler.join(' ; ')}` : '',
    Object.keys(a.fiyat || {}).length ? `Fiyatlar: ${Object.entries(a.fiyat).map(([k, v]) => `${k} ${f(v)}`).join(', ')}` : ''].filter(Boolean).join('\n');
  if (/^A\d+$/.test(id)) { const a = byAt.get(id.slice(1)); return a ? detail(a) : `${id}: bulunamadı`; }
  const pick = [...arr].sort((x, y) => x.at - y.at).filter(a => (/^\d{4}-\d{2}-\d{2}$/.test(id) ? dayOf(a.at) === id : /^\d{4}-H\d{2}$/.test(id) ? weekOf(a.at) === id : /^\d{4}-\d{2}$/.test(id) ? monthOf(a.at) === id : false));
  if (!pick.length) return `${id}: bu dönemde analiz yok`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(id) || pick.length <= 4) return `DÜĞÜM ${id}:\n${pick.map(detail).join('\n---\n')}`;
  // Hafta/ay: gün gün özet + her analiz tek satır (kimliğiyle).
  const days = new Map();
  for (const a of pick) (days.get(dayOf(a.at)) || days.set(dayOf(a.at), []).get(dayOf(a.at))).push(a);
  return `DÜĞÜM ${id}: ${groupSummary(pick, preds)}\n` + [...days].map(([d, xs]) => `[${d}] ${groupSummary(xs, preds)}\n` + xs.map(a => `  [A${a.at}] ${hm(a.at)} ${String(a.ozet).slice(0, 140)}`).join('\n')).join('\n');
}

const AYLAR = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik'];
// Sorudaki tarih ifadelerini düğüm kimliklerine çevirir (model çağrısı olmadan).
export function dateNodes(q, now = Date.now()) {
  const t = fold(q).normalize('NFD').replace(/\p{M}/gu, '');
  const ids = [];
  const y0 = new Date(now).getUTCFullYear();
  // Açık tarihler önce ("25 Eylül", "25.09", "25/09/2026"), sonra göreli ifadeler.
  for (const m of t.matchAll(/(\d{1,2})\s+(ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)/g)) ids.push(`${y0}-${String(AYLAR.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`);
  for (const m of t.matchAll(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?\b/g)) {
    if (+m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) ids.push(`${m[3] || y0}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
  }
  if (/\bdun\b|dunku/.test(t)) ids.push(dayOf(now - 864e5));
  if (/\bbugun|bu sabah|bugunku/.test(t)) ids.push(dayOf(now));
  const ago = /(\d+)\s*gun (once|evvel)/.exec(t);
  if (ago) ids.push(dayOf(now - +ago[1] * 864e5));
  if (/gecen hafta|onceki hafta/.test(t)) ids.push(weekOf(now - 7 * 864e5));
  if (/bu hafta/.test(t)) ids.push(weekOf(now));
  if (/gecen ay|onceki ay/.test(t)) { const d = new Date(now); d.setUTCMonth(d.getUTCMonth() - 1); ids.push(monthOf(d)); }
  return [...new Set(ids)].slice(0, 4);
}

// Konu araması (Feynman'ın session-search fikri): tüm analiz arşivinde ve eski sohbetlerde kelime kökü eşleşmesi.
// Sonuçlar düğüm kimliğiyle döner; model ayrıntı için OKU ile açabilir.
const stems = t => fold(t).split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 3).map(w => w.slice(0, 5));
export function searchMemory(q, arr = loadArchive(), chats = readJSON('chats.json', {}), max = 8) {
  const qs = [...new Set(stems(q))];
  if (!qs.length) return `BUL "${q}": aranacak kelime yok`;
  const score = text => { const ts = new Set(stems(text)); return qs.filter(w => ts.has(w)).length; };
  const hits = [];
  for (const a of arr) {
    const text = [a.ozet, a.tarafsiz, ...(a.fikirler || []), ...(a.eylem || []), a.ders, ...(a.haberler || [])].filter(Boolean).join(' ');
    const s = score(text);
    if (s) hits.push({ s, at: a.at, line: `[A${a.at}] ${dayOf(a.at)} ${hm(a.at)} analiz: ${String(a.ozet).slice(0, 160)}` });
  }
  for (const c of Object.values(chats)) {
    for (let i = 0; i < (c.turns || []).length; i++) {
      const t = c.turns[i];
      if (t.role !== 'user') continue;
      const ans = c.turns[i + 1]?.content || '';
      const s = score(`${t.content} ${ans}`);
      if (s) hits.push({ s, at: t.at, line: `[A${c.at}] ${dayOf(t.at)} ${hm(t.at)} sohbet: S: ${t.content.slice(0, 100)} → C: ${ans.replace(/\s+/g, ' ').slice(0, 160)}` });
    }
  }
  hits.sort((x, y) => y.s - x.s || y.at - x.at);
  return hits.length ? `BUL "${q}" (${hits.length} eşleşme, en ilgili ${Math.min(max, hits.length)}):\n${hits.slice(0, max).map(h => h.line).join('\n')}` : `BUL "${q}": arşivde ve sohbetlerde eşleşme yok`;
}
