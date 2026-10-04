// Gündem katalizörleri: haber ve piyasa hareketinden "bu gelişme şu hisseye yarar/zarar" zinciri kurar.
// Kural tabanlıdır (data/themes.json). Geçmiş haber arşivi olmadığı için geriye dönük test edilemez;
// isabeti yalnızca ileriye dönük seçim karnesiyle (picks) ölçülür ve arayüzde bu açıkça yazılır.
import { readFileSync } from 'node:fs';
import { fold } from './rss.mjs';

export const THEMES = JSON.parse(readFileSync(new URL('../data/themes.json', import.meta.url), 'utf8')).temalar;

// Kök sözlüğü: kelime bu köklerden biriyle başlıyorsa sayılır (Türkçe ekler için önek eşleşmesi yeterli).
const POS = 'yüksel artt artış rekor büyüd büyüme toparlan anlaşma sipariş ihale kazand onaylan güçlen iyileş olumlu kâr surge soar rise rising jump gain record growth deal order contract approv beat upgrade strong rally boost'.split(' ').map(fold);
const NEG = 'düştü düşüş geriled azald kayıp zarar iptal yasak kriz daral çöktü çöküş uyarı yaptırım olumsuz iflas grev fall falls fell drop plung declin loss ban crisis sanction slump miss warn downgrade weak halt recall lawsuit'.split(' ').map(fold);

const words = t => t.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const count = (ws, stems) => ws.reduce((a, w) => a + (stems.some(s => w.startsWith(s)) ? 1 : 0), 0);
export const tone = text => { const ws = words(fold(text)); return count(ws, POS) - count(ws, NEG); };

// Anahtar kelime başından eşleşir (Türkçe ekler serbest); kısa anahtarlar (fed, ons, lng) tam kelime olmalı.
const has = (t, k) => (k.trim().length <= 4 ? t.includes(` ${k.trim()} `) : t.includes(` ${k}`));
const norm = t => fold(` ${t || ''} `.replace(/[^\p{L}\p{N}%.,]+/gu, ' '));
const textOf = n => norm(`${n.title} ${n.lead || ''}`);
const hits = (t, k) => { const kk = k.trim().length <= 4 ? ` ${k.trim()} ` : ` ${k}`; let c = 0; for (let i = t.indexOf(kk); i >= 0; i = t.indexOf(kk, i + kk.length)) c++; return c; };
// Habere temanın konusu mu, yoksa geçerken mi anılıyor? Anahtar başlıkta geçmeli; ya özette en az iki kez geçmeli;
// ya da başlık temanın etkilediği bir şirketi anmalı ("Aselsan'dan 488,5 milyon euroluk sözleşme").
// 2026-10-03 gerçek veride özetteki tek geçiş şunları temaya bağlıyordu: Allianz büyüme tahmini → yapay zekâ çipleri,
// İran yaptırımı ("iç otomotiv pazarı") → Avrupa otomotivi, orman yazısı ("turizm vb. tahsisler") → turizm.
function about(n, keys, names) {
  const T = norm(n.title);
  if (keys.some(k => has(T, k))) return true;
  const L = norm(n.lead);
  if (keys.reduce((a, k) => a + hits(L, k), 0) >= 2) return true;
  return names.some(k => has(T, k)) && keys.some(k => has(L, k));
}

function themeDirection(th, hits, markets) {
  const d = th.surucu;
  if (d.tip === 'piyasa') {
    const chg = markets?.[d.gosterge]?.chg;
    if (chg == null || markets[d.gosterge].roll === 'şüpheli' || Math.abs(chg) < d.esik) return null;
    return { yon: Math.sign(chg), guc: Math.min(100, Math.round((Math.abs(chg) / d.esik) * 30 + Math.min(hits.length, 5) * 8)), neden: `${d.gosterge} bugün ${chg > 0 ? '+' : ''}${String(chg).replace('.', ',')}%` };
  }
  if (hits.length < 2) return null; // tek başlık, yön iddiası için zayıf kanıt
  let net = 0;
  // Yön yalnızca başlıktan okunur: özet bağlam taşır ve kelime sayımı onu ters okur (2026-10-03: "Fed'in faiz artırma
  // ihtimalinin %22'ye gerilemesi" güvercin bir haberdi, "artır" kökü yüzünden şahin sayıldı).
  for (const h of hits) {
    const ws = words(norm(h.n.title));
    h.yon = d.yukari || d.asagi ? Math.sign(count(ws, (d.yukari || []).map(fold)) - count(ws, (d.asagi || []).map(fold))) : Math.sign(tone(norm(h.n.title)));
    net += h.yon;
  }
  // Haberlerin çoğunluğu aynı yöne bakmıyorsa yön yok sayılır.
  if (Math.abs(net) < Math.max(2, hits.length / 3)) return null; // en az iki haber net olarak aynı yönde
  return { yon: Math.sign(net), guc: Math.min(100, Math.round(20 + (Math.abs(net) / hits.length) * 30 + Math.min(hits.length, 6) * 8)), neden: `${hits.length} haberin ${Math.abs(net)} fazlası ${net > 0 ? 'olumlu' : 'olumsuz'} yönde` };
}

// news: zenginleştirilmiş haberler; markets: snap.markets; market: 'tr' | 'us' | 'eu';
// kods: evrendeki kodlar (Set) ya da kod → evren kaydı (Map; şirket adları "anahtar" alanından okunur).
// Şirkete özel haber tonu bilinçli olarak yok: gerçek veride "cost" Costco'ya, "race" Ferrari'ye,
// aracı kurum işlem raporu Aselsan'a "olumsuz" diye bağlandı. Kelime sayarak ton ölçmek şirket düzeyinde güvenilmez.
export function catalysts(news, markets, market, kods) {
  const texts = news.map(n => ({ n, t: textOf(n) }));
  const themes = [];
  for (const th of THEMES) {
    if (!th.piyasa.includes(market)) continue;
    const keys = th.anahtar.map(fold);
    const req = (th.gerekli || []).map(fold), ex = (th.haric || []).map(fold);
    const names = kods instanceof Map ? th.etkiler.flatMap(e => kods.get(e.kod)?.anahtar || []).map(fold) : [];
    const matched = texts.filter(x => (x.n.impact?.score ?? 100) >= (th.minEtki || 0) && about(x.n, keys, names)
      && (!req.length || req.some(k => has(x.t, k))) && !ex.some(k => has(x.t, k)));
    const dir = themeDirection(th, matched, markets);
    if (!dir) continue;
    const etkiler = th.etkiler.filter(e => kods.has(e.kod)).map(e => ({ kod: e.kod, yon: dir.yon * e.yon, neden: e.neden }));
    if (!etkiler.length) continue;
    // Kanıt olarak önce temanın yönünü taşıyan haberler gösterilir (2026-10-03: Fed teması "olumsuz" derken ilk kanıt
    // "faiz artışı için aciliyet görmüyor" idi). Piyasa temalarında yön fiyattan geldiği için sıra korunur.
    const ev = th.surucu.tip === 'piyasa' ? matched : [...matched].sort((a, b) => (b.yon === dir.yon) - (a.yon === dir.yon));
    themes.push({ id: th.id, ad: th.ad, ...dir, kanit: ev.slice(0, 3).map(({ n }) => ({ title: n.title, link: n.link, src: n.srcName })), etkiler });
  }
  themes.sort((a, b) => b.guc - a.guc);

  const byKod = {};
  const add = (kod, yon, guc, text) => { const o = (byKod[kod] ||= { net: 0, why: [], risk: [] }); o.net += (yon * guc) / 100; (yon > 0 ? o.why : o.risk).push(text); };
  for (const th of themes) for (const e of th.etkiler) add(e.kod, e.yon, th.guc, `${th.ad} ${th.yon > 0 ? 'yukarı' : 'aşağı'} (${th.neden}) → ${e.neden}`);
  return { themes, byKod };
}

// Tarayıcı satırı için "Gündem" skoru. Olumsuz etkiler skoru sıfırlar ve risk olarak görünür.
export function gundemScore(c) {
  if (!c) return { score: 0, setup: 'Gündem yok', why: [], risk: [] };
  return { score: Math.max(0, Math.min(100, Math.round(c.net * 60))), setup: c.net > 0 ? 'Gündem lehine' : c.net < 0 ? 'Gündem aleyhine' : 'Karışık', why: c.why.slice(0, 4), risk: c.risk.slice(0, 4) };
}
