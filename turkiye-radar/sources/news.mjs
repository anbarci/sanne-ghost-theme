// Haber: yerli RSS (yayın çizgisi etiketli) + dünya basını + GDELT + izleme listesi için Google News.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchx, pool } from '../lib/http.mjs';
import { parseFeed, hash } from '../lib/rss.mjs';
import { ROOT, readJSON } from '../lib/store.mjs';

// Admin panelinden düzenlenen liste runtime/feeds.json'da; yoksa varsayılan data/feeds.json.
export const loadFeeds = () => readJSON('feeds.json', null) || JSON.parse(readFileSync(join(ROOT, 'data/feeds.json'), 'utf8'));

export const rss = {
  id: 'rss', name: 'RSS akışları', group: 'haber', ttlMin: 10,
  async run({ settings }) {
    const feeds = loadFeeds().filter(f => f.on !== false);
    // KAP bildirimleri ücretli; izleme listesindeki hisselerin KAP haberlerini Google News'ten yakalıyoruz.
    const tickers = settings.watchlist.map(s => s.replace('.IS', '')).join(' OR ');
    if (tickers) feeds.push({ id: 'gn-kap', name: 'Google News · KAP/izleme', stance: 'toplayıcı', cat: 'şirket', url: `https://news.google.com/rss/search?q=(${encodeURIComponent(tickers)})+when:2d&hl=tr&gl=TR&ceid=TR:tr` });
    const status = {};
    const lists = await pool(feeds, 8, async f => {
      try {
        const xml = await fetchx(f.url, { as: 'text', timeout: 10000, retries: 0, browser: true });
        const items = parseFeed(xml, f).map(i => ({ ...i, cat: f.cat }));
        status[f.id] = items.length;
        return items;
      } catch (e) { status[f.id] = `hata: ${e.message}`; return []; }
    });
    if (lists.every(l => !l.length)) throw new Error(`hiçbir akış okunamadı (${Object.values(status)[0]})`);
    const cutoff = Date.now() - 36 * 3600e3;
    return { status, items: lists.flat().filter(i => i.ts > cutoff) };
  },
};

// GDELT: dünya basınında Türkiye nasıl konuşuluyor? (100+ dil, anahtarsız)
export const gdelt = {
  id: 'gdelt', name: 'GDELT (dünya basını)', group: 'haber', ttlMin: 60, timeoutSec: 110,
  async run() {
    const q = encodeURIComponent('(Turkey OR Türkiye OR Erdogan OR "Turkish lira") sourcelang:english');
    const j = await fetchx(`https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&format=json&maxrecords=75&timespan=12h&sort=datedesc`, { as: 'json', timeout: 35000, retryWait: 6000 });
    const items = (j.articles || []).map(a => ({
      id: hash(a.url), title: a.title, link: a.url, summary: '', lang: 'en', cat: 'dünya',
      ts: Date.parse(a.seendate?.replace(/(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z/, '$1-$2-$3T$4:$5:$6Z')) || Date.now(),
      src: 'gdelt', srcName: a.domain, stance: 'dünya',
    }));
    // Ton zaman serisi: dünya basınının Türkiye'ye bakışı olumlu mu olumsuz mu?
    let tone = null;
    try {
      await new Promise(r => setTimeout(r, 5500)); // GDELT: 5 sn'de en fazla bir istek
      const t = await fetchx(`https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent('(Turkey OR Türkiye)')}&mode=timelinetone&format=json&timespan=7d`, { as: 'json', timeout: 35000, retryWait: 6000 });
      tone = (t.timeline?.[0]?.data || []).map(p => [p.date, Math.round(p.value * 100) / 100]);
    } catch {}
    return { items, tone };
  },
};
