// Haber sayfasından asıl metni çıkarır ve başlığın içerikle uyuşup uyuşmadığını ölçer.
// Sıra (en ucuzdan pahalıya): JSON-LD articleBody, Mozilla Readability, <p> taraması, meta açıklama.
import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import { stripTags, decodeEntities, fold } from './rss.mjs';

// { text, via } döner. via, panelde hangi yöntemin işe yaradığını göstermek için tutulur.
export function extractArticle(html) {
  // Türk haber sitelerinin çoğu NewsArticle şeması basıyor; DOM kurmadan en hızlı yol.
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const body = findKey(JSON.parse(m[1].trim()), 'articleBody');
      if (body && body.length > 200) return { text: tidy(stripTags(body)), via: 'jsonld' };
    } catch {}
  }

  // Next.js / Nuxt siteleri makaleyi sayfaya gömülü JSON olarak koyar; HTML gövdesi boş olabilir (webclaw fikri).
  const island = /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(html)?.[1] || /window\.__NUXT__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/i.exec(html)?.[1];
  if (island) {
    try {
      const body = longestText(JSON.parse(island));
      if (body.length > 300) return { text: tidy(stripTags(body)), via: 'gömülü-json' };
    } catch {}
  }

  try {
    const { document } = parseHTML(html);
    const r = new Readability(document, { charThreshold: 200 }).parse();
    const text = r?.textContent ? tidy(r.textContent.replace(/\n\s*\n+/g, '\n')) : '';
    if (text.length > 200) return { text, via: 'readability' };
  } catch {}

  const clean = html.replace(/<(script|style|noscript|svg|iframe|form|nav|footer|aside|header)[\s\S]*?<\/\1>/gi, ' ');
  const art = /<article[\s>][\s\S]*?<\/article>/i.exec(clean)?.[0];
  const p = (art && paragraphs(art).length > 150 ? paragraphs(art) : '') || paragraphs(clean);
  if (p.length > 150) return { text: tidy(p), via: 'paragraf' };

  const og = /<meta[^>]+(?:property|name)=["'](?:og:description|description)["'][^>]+content=["']([^"']+)/i.exec(html)?.[1];
  if (og) return { text: tidy(decodeEntities(og)), via: 'meta' };
  // Gövde boş ama sayfa betik dolu: içerik tarayıcıda JS ile yükleniyor.
  return { text: '', via: (html.match(/<script/gi) || []).length > 15 ? 'js-sayfa' : 'boş' };
}

// Gömülü JSON'da makale metni olabilecek en uzun metin alanını bulur (derinlik ve düğüm sayısı sınırlı).
function longestText(o) {
  let best = '', seen = 0;
  const walk = (x, d) => {
    if (!x || d > 12 || ++seen > 20000) return;
    if (typeof x === 'string') { if (x.length > best.length && x.includes(' ') && !/^https?:/.test(x)) best = x; return; }
    if (typeof x === 'object') for (const v of Array.isArray(x) ? x : Object.values(x)) walk(v, d + 1);
  };
  walk(o, 0);
  return best;
}

function findKey(o, k, depth = 0) {
  if (!o || typeof o !== 'object' || depth > 6) return null;
  if (typeof o[k] === 'string') return o[k];
  for (const v of Array.isArray(o) ? o : Object.values(o)) {
    const r = findKey(v, k, depth + 1);
    if (r) return r;
  }
  return null;
}

function paragraphs(html) {
  return [...html.matchAll(/<p[\s>][\s\S]*?<\/p>/gi)]
    .map(m => stripTags(m[0]))
    .filter(t => t.length > 40 && !/çerez|cookie|abone ol|tüm hakları|copyright|reklam/i.test(t))
    .join('\n');
}

const tidy = s => s.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim().slice(0, 6000);

const STOP = new Set('ve veya ile ama fakat için gibi daha çok bir bu şu o da de ki mi mı mu mü ne ya en son yeni flaş son dakika the a an of to in on for and is are was'.split(' '));
// JS'de \b Türkçe harfleri tanımaz; bu yüzden \p{L} ile sınır kontrolü.
const BAIT = /(?<!\p{L})(şok|flaş|bomba|olay|herkes|bakın|inanamayacaksınız|merak edilen|ortaya çıktı|işte o|son dakika|çılgın|ne oldu|neden|nasıl)(?!\p{L})|[!?]$|\.{3}$/iu;

const stem = w => fold(w).replace(/[^a-zçğöşü0-9]/g, '').slice(0, 5); // kaba Türkçe kök: ilk 5 harf

export function titleCheck(title, body) {
  const words = title.split(/\s+/).map(stem).filter(w => w.length > 2 && !STOP.has(w));
  if (!words.length || !body) return { score: null, bait: BAIT.test(title) };
  const lead = body.slice(0, 1500).split(/\s+/).map(stem);
  const set = new Set(lead);
  const hit = words.filter(w => set.has(w)).length;
  // Başlıktaki rakamlar metinde var mı? ("%50 zam" deyip metinde yoksa kırmızı bayrak)
  const nums = title.match(/\d+[.,]?\d*/g) || [];
  const numMiss = nums.filter(n => !body.includes(n)).length;
  const score = Math.max(0, Math.round((hit / words.length) * 100 - numMiss * 20));
  return { score, bait: BAIT.test(title), numMiss };
}

// Başlık yanıltıcı mı? Düşük uyum + tık tuzağı kalıbı birlikte güçlü sinyal.
// Eşikler demo verisinde kalibre edildi: haber başlıkları doğal olarak metni başka kelimelerle özetler,
// bu yüzden tek başına düşük örtüşme ancak çok düşükse (<%20) bayrak kaldırır.
export const isMisleading = c => c.score !== null && (c.score < 20 || (c.bait && c.score < 50) || (c.numMiss > 0 && c.score < 50));

// AI'a gönderilecek kısa öz: ilk 2 cümle, en fazla ~280 karakter.
export function lead(body, max = 280) {
  body = body.replace(/https?:\/\/\S+/g, '').replace(/\s{2,}/g, ' ').trim(); // bazı akışlar özet yerine link basıyor
  const s = body.replace(/\n/g, ' ').match(/[^.!?]+[.!?]+/g) || [body];
  let out = '';
  for (const x of s) { if ((out + x).length > max) break; out += x; }
  return (out || body.slice(0, max)).trim();
}
