// Çapraz teyit: önemli bir haberi başka kaç bağımsız yayıncı veriyor, yalanlama var mı?
// Google News'in herkese açık arama RSS'i kullanılır (news.google.com/rss/search). Arama sayfası kazınmaz,
// bot korumasını atlatan araç (ör. Botasaurus) gerekmez; kimlik gizlenmez.
// Gizlilik: Google'a yalnızca başlıktan seçilen birkaç kelime gider, çerez ya da hesap bilgisi gitmez.
import { fetchx, pool } from './http.mjs';
import { readJSON, writeJSON } from './store.mjs';
import { stripTags, fold } from './rss.mjs';

const STOP = new Set('ve veya ile ama için gibi daha çok bir bu şu da de ki mi ne en son yeni flaş dakika olan oldu etti eden diye ise kadar sonra önce the a an of to in on for and is are was were with from at by as after over amid says said new'.split(' ').map(fold));
const stem = w => fold(w).replace(/[^\p{L}\p{N}]/gu, '').slice(0, 5);
const words = t => t.replace(/\s+-\s+[^-]+$/, '').replace(/['’]\p{L}+/gu, '').split(/[\s'’‘"“”:;,.!?()\[\]]+/).filter(w => w.length > 2 && !STOP.has(fold(w)));
const GENERIC = new Set(['the', 'haber', 'haberleri', 'news', 'gazete', 'gazetesi', 'turkiye', 'turkey', 'world', 'ekonomi', 'google', 'dunya', 'turkce', 'english', 'online', 'www', 'ajansi', 'agency']);
const plain = t => fold(t).normalize('NFD').replace(/\p{M}/gu, '');
// Yayıncı adını karşılaştırılabilir kelimelere indirger; genel kelimeler (haber, gazete, dünya…) tek başına kalırsa korunur.
export function pubTokens(name) {
  const ws = plain(name || '').replace(/\.(com|net|org)(\.tr)?\b/g, '').split(/[^a-z0-9]+/).filter(w => w.length >= 3);
  const core = ws.filter(w => !GENERIC.has(w));
  return core.length ? core : ws;
}
// Yalnızca doğrulama/yalanlama diline özgü ifadeler (katlanmış, aksansız: "asılsız" → "asilsiz").
// İngilizce "denies" bilinçli olarak yok: "Trump denies easing sanctions" haberin kendisidir, habere yalanlama değil.
const DENY = /yalanla|asilsiz|gercegi yansitmiyor|dezenformasyon|iddialarina yanit|fact.?check|debunk|fake news|false claim/;

// Sorgu: özel adlar ve rakamlar önce (ayırt edici olanlar), en fazla 6 kelime.
export function queryOf(title, n = 6) {
  const ws = [...new Set(words(title))];
  const rank = w => (/\d/.test(w) ? 0 : /^\p{Lu}/u.test(w) ? 1 : 2);
  return ws.sort((a, b) => rank(a) - rank(b)).slice(0, n).join(' ');
}

// Bizim başlığımızdaki kelime köklerinin ne kadarı adayda geçiyor (0-1).
export function similarity(a, b) {
  const A = new Set(words(a).map(stem)), B = new Set(words(b).map(stem));
  if (!A.size) return 0;
  let hit = 0;
  for (const x of A) if (B.has(x)) hit++;
  return hit / A.size;
}

export function parseGoogleNews(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, b]) => ({
    title: stripTags(/<title>([\s\S]*?)<\/title>/.exec(b)?.[1] || '').replace(/\s+-\s+[^-]+$/, ''),
    src: stripTags(/<source[^>]*>([\s\S]*?)<\/source>/.exec(b)?.[1] || ''),
    link: stripTags(/<link>([\s\S]*?)<\/link>/.exec(b)?.[1] || ''),
    ts: Date.parse(/<pubDate>([^<]+)/.exec(b)?.[1] || '') || null,
  })).filter(x => x.title && x.src);
}

// Adaylardan teyit sonucu: benzer başlıklı, farklı yayıncılı haberler; neredeyse aynı başlık = muhtemelen ajans kopyası.
export function judge(item, cands) {
  // Kendi kaynağımızı sayma: "Anadolu Ajansı Ekonomi" ile "Anadolu Ajansı", "BirGün" ile "birgun.net" aynı yayıncı.
  const own = pubTokens(item.srcName);
  const seen = new Map();
  for (const c of cands) {
    const s = similarity(item.title, c.title);
    const key = pubTokens(c.src).join(' ');
    if (s < 0.4 || !key || own.some(w => key.split(' ').includes(w)) || seen.has(key)) continue;
    seen.set(key, { ...c, s, kopya: s >= 0.85 && similarity(c.title, item.title) >= 0.85 });
  }
  const list = [...seen.values()];
  const deny = list.filter(c => DENY.test(plain(c.title)));
  const n = list.length;
  return {
    kaynak: n,
    ozgun: list.filter(c => !c.kopya).length,
    durum: deny.length ? 'yalanlama' : n >= 5 ? 'yaygın' : n >= 2 ? 'birkaç' : n === 1 ? 'az' : 'tek',
    ornek: list.sort((a, b) => b.s - a.s).slice(0, 4).map(({ title, src, link }) => ({ title, src, link })),
    yalanlama: deny.slice(0, 2).map(({ title, src, link }) => ({ title, src, link })),
  };
}

let blockedUntil = 0;
// news: puana göre sıralı liste. En önemli `top` haber için teyit arar; sonuç 6 saat önbellekte.
export async function corroborate(news, { top = 12, minImpact = 40 } = {}) {
  const cache = readJSON('verify.json', {});
  const now = Date.now();
  for (const [k, v] of Object.entries(cache)) if (now - v.t > 6 * 36e5) delete cache[k];
  const want = news.filter(n => n.impact.score >= minImpact).slice(0, top);
  const need = want.filter(n => !cache[n.id]);
  let asked = 0, failed = 0;
  await pool(need, 2, async n => {
    if (Date.now() < blockedUntil) return;
    const q = queryOf(n.title);
    if (q.split(' ').length < 2) return;
    const loc = n.lang === 'en' ? 'hl=en-US&gl=US&ceid=US:en' : 'hl=tr&gl=TR&ceid=TR:tr';
    const search = async q => { asked++; return judge(n, parseGoogleNews(await fetchx(`https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:2d')}&${loc}`, { as: 'text', timeout: 10000, retries: 0 }))); };
    try {
      // Arama kelimeleri VE ile bağlanır; 6 kelime hiç sonuç vermezse ayırt edici ilk 4 kelimeyle bir kez daha denenir.
      let res = await search(q), used = q;
      const q4 = queryOf(n.title, 4);
      if (!res.kaynak && q4 !== q) { res = await search(q4); used = q4; }
      cache[n.id] = { t: Date.now(), q: used, res };
    } catch (e) {
      failed++;
      if (e.status === 429 || e.status === 503) blockedUntil = Date.now() + 30 * 60e3; // sınırlandıysak yarım saat dur
    }
  });
  writeJSON('verify.json', cache);
  // Haber nesneleri kaynağın diskteki önbelleğinden gelir; eski bir teyit sonucu üstlerinde kalmasın.
  for (const n of news) n.teyit = cache[n.id] ? { ...cache[n.id].res, q: cache[n.id].q } : undefined;
  return { asked, failed, cached: want.length - need.length };
}
