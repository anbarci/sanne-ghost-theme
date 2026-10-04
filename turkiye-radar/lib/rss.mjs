// Bağımlılıksız RSS 2.0 / RDF / Atom ayrıştırıcı. Hız için regex tabanlı; bozuk XML'de bile iş görür.
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}

export const stripTags = s => decodeEntities(decodeEntities(String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' ')).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

function tag(block, name) {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  if (!m) return '';
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(m[1]);
  return cdata ? cdata[1] : m[1];
}

function atomLink(block) {
  const alt = /<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)/i.exec(block) || /<link[^>]*href=["']([^"']+)/i.exec(block);
  return alt ? decodeEntities(alt[1]) : '';
}

export function parseFeed(xml, source = {}) {
  const items = [];
  const re = /<(item|entry)[\s>][\s\S]*?<\/\1>/gi;
  let m;
  while ((m = re.exec(xml)) && items.length < 60) {
    const b = m[0];
    const title = stripTags(tag(b, 'title'));
    let link = stripTags(tag(b, 'link')) || atomLink(b) || stripTags(tag(b, 'guid'));
    if (!title || !/^https?:/i.test(link)) continue;
    const rawDesc = tag(b, 'content:encoded') || tag(b, 'description') || tag(b, 'summary') || tag(b, 'content');
    const date = stripTags(tag(b, 'pubDate') || tag(b, 'dc:date') || tag(b, 'published') || tag(b, 'updated'));
    const t = Date.parse(date);
    items.push({
      id: hash(link),
      title,
      link,
      summary: stripTags(rawDesc).slice(0, 600),
      ts: Number.isFinite(t) ? t : Date.now(),
      src: source.id, srcName: source.name, stance: source.stance, lang: source.lang || 'tr',
    });
  }
  return items;
}

// Türkçe + İngilizce güvenli küçük harf: 'Israel' tr yerelinde 'ısrael' olur, eşleşme kaçar.
// Bu yüzden ı ve i ayrımı kaldırılır; hem metne hem sözlüğe aynı katlama uygulanır.
export const fold = s => String(s).toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/\u0307/g, '');

// FNV-1a: hızlı, kararlı kısa kimlik.
export function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}
