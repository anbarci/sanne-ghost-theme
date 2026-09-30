// Radarın hafızasını bir Obsidian kasasına Markdown olarak yazar (claude-obsidian ile uyumlu biçim:
// YAML ön bilgi type/title/status/created/updated/tags, notlar wiki/ altında, [[bağlantı]] ile örülü).
// Yalnızca <kasa>/wiki/radar/ klasörüne yazılır; kullanıcının kendi notlarına dokunulmaz. Radarın ürettiği
// dosyalar "generated_by: turkiye-radar" taşır; yeniden aktarımda yalnızca bunlar güncellenir ya da silinir.
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readJSON } from './store.mjs';
import { loadArchive } from './ai/memtree.mjs';
import { loadMemory, STABLE } from './ai/memory.mjs';
import { THEMES } from './catalysts.mjs';

const MARK = 'generated_by: turkiye-radar';
const TZ = 'Europe/Istanbul';
const day = t => new Date(t).toLocaleDateString('sv-SE', { timeZone: TZ });
const hm = t => new Date(t).toLocaleTimeString('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const slug = t => `${day(t)}-${hm(t).replace(':', '')}`;
const f = (x, d = 2) => (x == null ? '—' : Number(x).toLocaleString('tr-TR', { maximumFractionDigits: d }));
const esc = s => String(s ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
const yq = s => JSON.stringify(String(s ?? '')); // YAML'de güvenli tek satır metin
const YON = { yukari: 'yukarı', asagi: 'aşağı', yatay: 'yatay' };
const ASSET_AD = { USDTRY: 'Dolar/TL', EURTRY: 'Euro/TL', GRAM_ALTIN: 'Gram altın', XU100: 'BIST 100', BRENT: 'Brent petrol', BTCTRY: 'Bitcoin/TL' };

function front({ type, title, tags, status = 'developing', created, updated, extra = {} }) {
  const lines = ['---', `type: ${type}`, `title: ${yq(title)}`, `status: ${status}`, `created: ${created}`, `updated: ${updated}`, 'tags:', ...tags.map(t => `  - ${t}`), MARK];
  for (const [k, v] of Object.entries(extra)) if (v != null) lines.push(`${k}: ${typeof v === 'number' ? v : yq(v)}`);
  return [...lines, '---', ''].join('\n');
}

export function exportVault(vault, { now = Date.now() } = {}) {
  const root = join(vault, 'wiki', 'radar');
  for (const d of ['analizler', 'varliklar', 'temalar']) mkdirSync(join(root, d), { recursive: true });
  const today = day(now);
  const written = new Set();
  const put = (rel, text) => { writeFileSync(join(root, rel), text); written.add(rel); };

  const arr = [...loadArchive()].sort((a, b) => a.at - b.at);
  const full = new Map(readJSON('analyses.json', []).map(a => [a.at, a])); // kaynak kaydı (provenance) son 60 analizde
  const preds = readJSON('predictions.json', []);
  const predOf = (at, kod) => preds.find(p => p.id === `${at}-${kod}`);
  const outcome = p => (!p ? '' : !p.done ? 'bekliyor' : p.hit ? `tuttu (${f(p.chg)}%)` : `tutmadı (${f(p.chg)}%)`);

  // Analizler: her biri bir kaynak notu; varlıklara ve gün notlarına bağlanır.
  for (const a of arr) {
    const s = slug(a.at), prov = full.get(a.at)?.provenance;
    const news = prov?.haberler?.length ? prov.haberler.map(n => `- [${esc(n.title)}](${n.link}) — ${esc(n.src)}${n.teyit ? `, teyit: ${esc(n.teyit)}` : ''}${n.uyumsuz ? ', başlık uyumsuz' : ''}`) : (a.haberler || []).map(h => `- ${esc(h)}`);
    put(`analizler/${s}.md`, front({ type: 'source', title: `Analiz ${day(a.at)} ${hm(a.at)}`, tags: ['radar', 'analiz'], status: 'evergreen', created: day(a.at), updated: day(a.at), extra: { model: a.model, kotumser: a.kotumser, iyimser: a.iyimser } }) + [
      `# Analiz · ${day(a.at)} ${hm(a.at)}`, '',
      `> ${esc(a.ozet)}`, '',
      a.tarafsiz ? `**Tarafsız:** ${esc(a.tarafsiz)}\n` : '',
      `**Senaryo:** kötümser %${a.kotumser ?? '—'}, iyimser %${a.iyimser ?? '—'} · ${esc(a.provider || '')} · ${esc(a.model || '')}`, '',
      '## Tahminler', '',
      a.varliklar?.length ? ['| Varlık | Yön | Olasılık | Vade | Sonuç |', '|---|---|---|---|---|', ...a.varliklar.map(v => `| [[${v.kod}]] | ${YON[v.yon] || v.yon} | %${v.olasilik} | ${v.vade_gun} gün | ${outcome(predOf(a.at, v.kod)) || '—'} |`)].join('\n') : '_Tahmin yok._', '',
      a.fikirler?.length ? `## Fikirler\n\n${a.fikirler.map(x => `- ${esc(x)}`).join('\n')}\n` : '',
      a.eylem?.length ? `## Eylem planı\n\n${a.eylem.map(x => `- ${esc(x)}`).join('\n')}\n` : '',
      a.ders ? `## Ders\n\n${esc(a.ders)} — bkz. [[Dersler]]\n` : '',
      Object.keys(a.fiyat || {}).length ? `## O anki fiyatlar\n\n${Object.entries(a.fiyat).map(([k, v]) => `- [[${k}]]: ${f(v, 4)}`).join('\n')}\n` : '',
      news.length ? `## Dayandığı haberler\n\n${news.join('\n')}\n` : '',
      `Gün: [[radar-${day(a.at)}|${day(a.at)}]] · Dizin: [[Radar]]`, '',
    ].filter(x => x !== '').join('\n'));
  }

  // Varlıklar: her tahminin sonucu ve isabet oranı (fiyatlardan ölçülür, model yazmaz).
  const kods = new Set(preds.map(p => p.kod));
  for (const a of arr) for (const v of a.varliklar || []) kods.add(v.kod);
  const snap = readJSON('latest.json', {}) || {};
  for (const k of kods) {
    const ps = preds.filter(p => p.kod === k).sort((x, y) => y.at - x.at);
    const done = ps.filter(p => p.done), hit = done.filter(p => p.hit).length;
    const px = k === 'BTCTRY' ? snap.crypto?.BTCTRY?.price : snap.markets?.[k]?.price;
    put(`varliklar/${k}.md`, front({ type: 'entity', title: k, tags: ['radar', 'varlik'], created: today, updated: today, extra: { ad: ASSET_AD[k] || k, isabet: done.length ? Math.round((hit / done.length) * 100) : null } }) + [
      `# ${k} · ${ASSET_AD[k] || ''}`, '',
      px != null ? `Son fiyat: **${f(px, 4)}** (${today})\n` : '',
      done.length ? `Sonuçlanan ${done.length} tahminin **${hit}**'i tuttu (%${Math.round((hit / done.length) * 100)}).\n` : 'Henüz sonuçlanan tahmin yok.\n',
      '| Tarih | Tahmin | Olasılık | Sonuç | Analiz |', '|---|---|---|---|---|',
      ...ps.slice(0, 200).map(p => `| ${day(p.at)} | ${YON[p.yon] || p.yon} | %${Math.round(p.p * 100)} | ${outcome(p)} | [[${slug(p.at)}]] |`), '',
      'Dizin: [[Radar]]', '',
    ].filter(x => x !== '').join('\n'));
  }

  // Temalar: gündem kuralları ve bugünkü durumu.
  const active = new Map();
  for (const sc of Object.values(snap.screeners || {})) for (const t of sc?.catalysts || []) if (!active.has(t.id)) active.set(t.id, t);
  for (const th of THEMES) {
    const t = active.get(th.id);
    put(`temalar/tema-${th.id}.md`, front({ type: 'concept', title: th.ad, tags: ['radar', 'tema'], created: today, updated: today, extra: { surucu: th.surucu.tip } }) + [
      `# ${th.ad}`, '',
      t ? `**Bugün aktif:** ${t.yon > 0 ? 'yukarı' : 'aşağı'} · güç ${t.guc} · ${esc(t.neden)}\n\n${t.kanit.map(k => `- [${esc(k.title)}](${k.link}) — ${esc(k.src)}`).join('\n')}\n` : '_Bugün aktif değil._\n',
      `Anahtar kelimeler: ${th.anahtar.map(esc).join(', ')}`, '',
      `Yön: ${th.surucu.tip === 'piyasa' ? `${th.surucu.gosterge} günlük değişimi, eşik %${th.surucu.esik}` : 'haber dilindeki yön kelimeleri'}`, '',
      '## Etkilediği hisseler', '', ...th.etkiler.map(e => `- [[${e.kod}]] ${e.yon > 0 ? '▲' : '▼'} ${esc(e.neden)}`), '',
      'Dizin: [[Radar]]', '',
    ].join('\n'));
  }

  // Dersler: pekişme sayısıyla; kararlı olanlar ilke.
  const ders = [...loadMemory().dersler].sort((a, b) => (b.sayi || 1) - (a.sayi || 1) || b.at - a.at);
  put('Dersler.md', front({ type: 'concept', title: 'Dersler', tags: ['radar', 'hafiza'], created: today, updated: today }) + [
    '# Yapay zekanın kendi hatalarından çıkardığı dersler', '',
    `${STABLE} kez doğrulanan ders kararlı ilke olur ve otomatik silinmez.`, '',
    ...ders.map(d => `- ${(d.sayi || 1) >= STABLE ? '**İlke** ' : ''}${esc(d.text)} _(${d.sayi || 1} kez, son ${day(d.son || d.at)})_`), '',
    'Dizin: [[Radar]]', '',
  ].join('\n'));

  // Gün notları: o günün analizleri. "radar-" ön eki kullanıcının kendi günlük notlarıyla ad çakışmasın diye.
  const byDay = new Map();
  for (const a of arr) (byDay.get(day(a.at)) || byDay.set(day(a.at), []).get(day(a.at))).push(a);
  mkdirSync(join(root, 'gunler'), { recursive: true });
  for (const [d, xs] of byDay) put(`gunler/radar-${d}.md`, front({ type: 'meta', title: d, tags: ['radar', 'gun'], status: 'evergreen', created: d, updated: d }) + [`# ${d}`, '', ...xs.map(a => `- [[${slug(a.at)}|${hm(a.at)}]] ${esc(String(a.ozet).slice(0, 160))}`), '', 'Dizin: [[Radar]]', ''].join('\n'));

  // Dizin (içerik haritası) ve son durum.
  const last = arr.at(-1);
  put('Radar.md', front({ type: 'meta', title: 'Radar', tags: ['radar', 'index'], status: 'evergreen', created: today, updated: today }) + [
    '# Türkiye Radar', '',
    last ? `**Son analiz** (${day(last.at)} ${hm(last.at)}): ${esc(last.ozet)} → [[${slug(last.at)}]]\n` : '',
    '## Varlıklar', '', [...kods].sort().map(k => `[[${k}]]`).join(' · ') || '—', '',
    '## Temalar', '', THEMES.map(t => `[[tema-${t.id}|${t.ad}]]`).join(' · '), '',
    '## Hafıza', '', '[[Dersler]]', '',
    '## Günler', '', ...[...byDay.keys()].reverse().slice(0, 120).map(d => `- [[radar-${d}|${d}]] (${byDay.get(d).length} analiz)`), '',
    `_Radar tarafından ${today} tarihinde üretildi. Bu klasördeki dosyalar her aktarımda yeniden yazılır; kendi notlarını başka bir klasörde tut._`, '',
  ].filter(x => x !== '').join('\n'));

  // Artık karşılığı olmayan, radarın ürettiği eski dosyaları temizle (başka dosyalara dokunma).
  let removed = 0;
  for (const sub of ['', 'analizler', 'varliklar', 'temalar', 'gunler']) {
    const dir = join(root, sub);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const rel = sub ? `${sub}/${name}` : name;
      if (!name.endsWith('.md') || written.has(rel)) continue;
      try { if (readFileSync(join(dir, name), 'utf8').includes(MARK)) { rmSync(join(dir, name)); removed++; } } catch {}
    }
  }
  return { dir: root, files: written.size, removed };
}
