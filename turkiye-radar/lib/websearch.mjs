// Sohbet için web araması: radarın akışında olmayan güncel bilgiyi bulmak.
// Kaynaklar: Google News arama RSS'i (her zaman) + kendi SearXNG'n (tanımlıysa; genel web + haber).
// SearXNG doğrudan site adresi verdiği için ilk iki sonucun metni de okunur (Google News bağlantıları
// JS yönlendirmesi olduğundan okunamaz; onlardan yalnızca başlık ve yayıncı gelir).
import { fetchx, pool } from './http.mjs';
import { parseGoogleNews, parseSearx, similarity } from './verify.mjs';
import { extractArticle, lead } from './extract.mjs';

// Arama sonucundaki adres sunucu tarafından açıldığı için yerel ağ adreslerine gidilmez (SSRF koruması).
export function isPublicUrl(u) {
  try {
    const { protocol, hostname: h } = new URL(u);
    if (!/^https?:$/.test(protocol)) return false;
    return !(/^(localhost|0\.0\.0\.0|\[?::1\]?)$/i.test(h) || /\.(local|internal|lan)$/i.test(h)
      || /^(127|10)\.\d+\.\d+\.\d+$/.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^\[?f[cd]/i.test(h));
  } catch { return false; }
}

const when = t => (t ? new Date(t).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'tarih yok');

export async function webSearch(q, { lang = 'tr', searxng = '', max = 8, read = 2 } = {}) {
  q = String(q).trim().slice(0, 120);
  const loc = lang === 'en' ? 'hl=en-US&gl=US&ceid=US:en' : 'hl=tr&gl=TR&ceid=TR:tr';
  const [g, x] = await Promise.allSettled([
    fetchx(`https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:7d')}&${loc}`, { as: 'text', timeout: 10000, retries: 0 }).then(parseGoogleNews),
    searxng ? fetchx(`${searxng.replace(/\/$/, '')}/search?q=${encodeURIComponent(q)}&format=json&categories=general,news&language=${lang}`, { as: 'json', timeout: 15000, retries: 0 }).then(j => parseSearx(j)) : Promise.resolve([]),
  ]);
  // SearXNG sonuçları önce (okunabilir adres), aynı başlık iki kez gelmesin.
  const all = [...(x.value || []).map(r => ({ ...r, via: 'searxng' })), ...(g.value || []).map(r => ({ ...r, via: 'google-news' }))];
  const out = [];
  for (const r of all) if (!out.some(o => similarity(o.title, r.title) >= 0.8)) out.push(r);
  // Tarihi olan ve yeni olan önce; tarihsizler sona.
  out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const top = out.slice(0, max);
  const readable = top.filter(r => r.via === 'searxng' && isPublicUrl(r.link) && !/news\.google/.test(r.link)).slice(0, read);
  await pool(readable, 2, async r => {
    try {
      const { text } = extractArticle(await fetchx(r.link, { as: 'text', timeout: 9000, retries: 0, maxBytes: 1_500_000, browser: true }));
      if (text) r.text = lead(text, 700);
    } catch {}
  });
  return { q, results: top, errors: [g.status === 'rejected' && 'google-news', x.status === 'rejected' && 'searxng'].filter(Boolean) };
}

export function webText(res) {
  if (!res?.results?.length) return `WEB ARAMASI (sorgu: "${res?.q}"): sonuç bulunamadı${res?.errors?.length ? ` (erişilemeyen: ${res.errors.join(', ')})` : ''}.`;
  return `WEB ARAMASI (sorgu: "${res.q}", ${res.results.length} sonuç, yeniden eskiye):\n` + res.results.map((r, i) =>
    `${i + 1}. [${r.src}, ${when(r.ts)}] ${r.title}${r.text ? `\n   Metin: ${r.text}` : ''}`).join('\n');
}
