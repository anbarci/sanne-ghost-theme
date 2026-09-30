// Türkiye resmi kaynakları: TCMB, EVDS3, EPİAŞ, Resmi Gazete.
import { fetchx } from '../lib/http.mjs';
import { stripTags } from '../lib/rss.mjs';

export const tcmb = {
  id: 'tcmb', name: 'TCMB gösterge kurlar', group: 'türkiye', ttlMin: 60,
  async run() {
    const xml = await fetchx('https://www.tcmb.gov.tr/kurlar/today.xml', { as: 'text' });
    const date = /Tarih="([^"]+)"/.exec(xml)?.[1];
    const out = { date, rates: {} };
    for (const m of xml.matchAll(/<Currency[^>]*Kod="(\w+)"[\s\S]*?<\/Currency>/g)) {
      if (!['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'RUB', 'CNY', 'SAR'].includes(m[1])) continue;
      const g = t => parseFloat(new RegExp(`<${t}>([^<]*)</${t}>`).exec(m[0])?.[1]);
      out.rates[m[1]] = { buy: g('ForexBuying'), sell: g('ForexSelling'), unit: g('Unit') || 1 };
    }
    return out;
  },
};

const ddmmyyyy = d => `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;

export const evds = {
  id: 'evds', name: 'TCMB EVDS3', group: 'türkiye', ttlMin: 360, needs: ['EVDS_API_KEY'],
  async run({ settings, secret }) {
    const key = secret('EVDS_API_KEY');
    const end = new Date(), start = new Date(Date.now() - 420 * 864e5);
    const url = `https://evds3.tcmb.gov.tr/igmevdsms-dis/series=${settings.evdsSeries.join('-')}&startDate=${ddmmyyyy(start)}&endDate=${ddmmyyyy(end)}&type=json`;
    const j = await fetchx(url, { headers: { key }, as: 'json' }); // anahtar URL'de değil başlıkta
    const out = {};
    for (const s of settings.evdsSeries) {
      const col = s.replace(/\./g, '_');
      const rows = (j.items || []).filter(r => r[col] != null && r[col] !== '');
      const last = rows.at(-1), prev = rows.at(-2);
      if (last) out[s] = { date: last.Tarih, value: +last[col], prev: prev ? +prev[col] : null };
      // TÜFE endeksi için yıllık değişim: 12 dönem öncesiyle kıyas
      if (last && rows.length > 12) out[s].yoy = Math.round((last[col] / rows.at(-13)[col] - 1) * 10000) / 100;
    }
    return out;
  },
};

export const epias = {
  id: 'epias', name: 'EPİAŞ PTF (elektrik)', group: 'türkiye', ttlMin: 120, needs: ['EPIAS_USER', 'EPIAS_PASS'],
  async run({ secret }) {
    const body = new URLSearchParams({ username: secret('EPIAS_USER'), password: secret('EPIAS_PASS') });
    const r = await fetch('https://giris.epias.com.tr/cas/v1/tickets', { method: 'POST', body, headers: { accept: 'text/plain', 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(15000) });
    const tgt = (await r.text()).trim() || r.headers.get('location')?.split('/').pop();
    if (!r.ok || !tgt) throw new Error('EPİAŞ girişi başarısız');
    const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
    const j = await fetchx('https://seffaflik.epias.com.tr/electricity-service/v1/markets/dam/data/mcp', {
      method: 'POST', as: 'json', headers: { TGT: tgt, 'content-type': 'application/json' },
      body: JSON.stringify({ startDate: `${day}T00:00:00+03:00`, endDate: `${day}T23:00:00+03:00` }),
    });
    const items = (j.items || []).map(x => ({ hour: x.hour, price: x.price }));
    const prices = items.map(x => x.price);
    return { day, avg: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null, max: Math.max(...prices), min: Math.min(...prices), items };
  },
};

export const resmiGazete = {
  id: 'resmigazete', name: 'Resmi Gazete', group: 'türkiye', ttlMin: 180,
  async run() {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), g = String(d.getDate()).padStart(2, '0');
    const url = `https://www.resmigazete.gov.tr/eskiler/${y}/${m}/${y}${m}${g}.htm`;
    const html = await fetchx(url, { as: 'text' });
    const items = [];
    for (const a of html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const t = stripTags(a[2]);
      if (t.length > 25 && /eskiler|\.pdf|\.htm/i.test(a[1])) items.push({ title: t.slice(0, 220), link: new URL(a[1], url).href });
    }
    return { date: `${g}.${m}.${y}`, url, items: items.slice(0, 40) };
  },
};
