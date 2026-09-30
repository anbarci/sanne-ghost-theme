// Küresel açık kaynaklar. TÜİK (SMS doğrulamalı anahtar) ve ücretli veriler yerine
// Dünya Bankası + IMF (anahtarsız), FRED, NASA FIRMS ve Open-Meteo kullanılır.
import { fetchx, pool } from '../lib/http.mjs';

export const macro = {
  id: 'macro', name: 'Makro (Dünya Bankası + IMF)', group: 'makro', ttlMin: 1440,
  async run() {
    const wb = { enflasyon: 'FP.CPI.TOTL.ZG', buyume: 'NY.GDP.MKTP.KD.ZG', cariDenge_GSYH: 'BN.CAB.XOKA.GD.ZS', issizlik: 'SL.UEM.TOTL.ZS', disBorc_GNI: 'DT.DOD.DECT.GN.ZS', turizmGeliri_usd: 'ST.INT.RCPT.CD' };
    const out = { worldBank: {}, imf: {} };
    await pool(Object.entries(wb), 4, async ([k, code]) => {
      const j = await fetchx(`https://api.worldbank.org/v2/country/TUR/indicator/${code}?format=json&mrnev=1`, { as: 'json' });
      const r = j?.[1]?.[0];
      if (r) out.worldBank[k] = { year: r.date, value: Math.round(r.value * 100) / 100 };
    });
    // IMF WEO: geçmiş + tahmin (örn. gelecek yıl enflasyon beklentisi)
    const imf = { enflasyon: 'PCPIPCH', buyume: 'NGDP_RPCH', cariDenge_GSYH: 'BCA_NGDPD', issizlik: 'LUR' };
    const y = new Date().getFullYear();
    await pool(Object.entries(imf), 4, async ([k, code]) => {
      const j = await fetchx(`https://www.imf.org/external/datamapper/api/v1/${code}/TUR`, { as: 'json' });
      const v = j?.values?.[code]?.TUR || {};
      if (v[y] != null) out.imf[k] = { [y - 1]: v[y - 1], [y]: v[y], [y + 1]: v[y + 1] };
    });
    if (!Object.keys(out.worldBank).length && !Object.keys(out.imf).length) throw new Error('Dünya Bankası ve IMF yanıt vermedi');
    return out;
  },
};

// FRED'in grafik CSV'si anahtar istemez (OpenTerminal'daki yöntem). cosd ile son 90 güne kısıtlanır.
export function lastTwoCsv(csv) {
  const rows = csv.trim().split('\n').slice(1).map(l => l.split(',')).filter(r => r[1] && r[1] !== '.' && Number.isFinite(+r[1]));
  const [a, b] = rows.slice(-2).reverse();
  return a ? { date: a[0], value: +a[1], prev: b ? +b[1] : null } : null;
}

export const fred = {
  id: 'fred', name: 'FRED (ABD Fed verileri, anahtarsız)', group: 'makro', ttlMin: 360, timeoutSec: 60,
  async run() {
    const series = { fedFaiz: 'DFF', abd10y: 'DGS10', dolarEndeksi: 'DTWEXBGS', yuksekGetiriSpread: 'BAMLH0A0HYM2', abdEnflasyonBeklenti5y: 'T5YIE' };
    const cosd = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
    const out = {};
    await pool(Object.entries(series), 1, async ([k, id]) => { // sırayla: FRED paralel isteğe 429 veriyor
      const r = lastTwoCsv(await fetchx(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${cosd}`, { as: 'text', ttl: 3600e3, retryWait: 3000 }));
      if (r) out[k] = r;
    });
    if (!Object.keys(out).length) throw new Error('FRED yanıt vermedi');
    return out;
  },
};

// ECB referans kuru: TCMB'den bağımsız ikinci bir EUR/TRY kaynağı.
export const ecb = {
  id: 'ecb', name: 'ECB EUR/TRY referans kuru', group: 'makro', ttlMin: 360,
  async run() {
    const csv = await fetchx('https://data-api.ecb.europa.eu/service/data/EXR/D.TRY.EUR.SP00.A?format=csvdata&lastNObservations=2', { as: 'text' });
    const [head, ...rows] = csv.trim().split('\n');
    const h = head.split(','), iT = h.indexOf('TIME_PERIOD'), iV = h.indexOf('OBS_VALUE');
    const pts = rows.map(r => r.split(',')).map(c => ({ date: c[iT], value: +c[iV] })).filter(p => Number.isFinite(p.value));
    if (!pts.length) throw new Error('ECB boş yanıt');
    return { EURTRY: pts.at(-1), prev: pts.at(-2)?.value ?? null };
  },
};

// Forex Factory'nin herkese açık JSON takvimi (anahtarsız). TRY olayları yok; Fed/ECB/CPI gibi TL'yi etkileyenler var.
const CAL_CCY = new Set(['USD', 'EUR', 'CNY', 'GBP', 'JPY']);
export const calendar = {
  id: 'calendar', name: 'Ekonomik takvim (Forex Factory)', group: 'makro', ttlMin: 180,
  async run() {
    const weeks = await Promise.allSettled(['thisweek', 'nextweek'].map(w => fetchx(`https://nfs.faireconomy.media/ff_calendar_${w}.json`, { as: 'json' })));
    const rows = weeks.flatMap(w => (w.status === 'fulfilled' && Array.isArray(w.value) ? w.value : []));
    if (!rows.length) throw new Error('takvim alınamadı');
    const from = Date.now() - 864e5, to = Date.now() + 8 * 864e5;
    return rows
      .map(r => ({ title: r.title, ccy: r.country, t: Date.parse(r.date), impact: r.impact, forecast: r.forecast || null, previous: r.previous || null }))
      .filter(r => r.t > from && r.t < to && CAL_CCY.has(r.ccy) && (r.impact === 'High' || (r.impact === 'Medium' && (r.ccy === 'USD' || r.ccy === 'EUR'))))
      .sort((a, b) => a.t - b.t)
      .slice(0, 40);
  },
};

export const firms = {
  id: 'firms', name: 'NASA FIRMS (yangın)', group: 'afet', ttlMin: 60, needs: ['FIRMS_MAP_KEY'],
  async run({ secret }) {
    const csv = await fetchx(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${secret('FIRMS_MAP_KEY')}/VIIRS_SNPP_NRT/25.5,35.8,44.9,42.2/1`, { as: 'text', timeout: 20000 });
    const [head, ...rows] = csv.trim().split('\n');
    const h = head.split(',');
    const iLat = h.indexOf('latitude'), iLon = h.indexOf('longitude'), iFrp = h.indexOf('frp'), iConf = h.indexOf('confidence');
    const pts = rows.map(r => r.split(',')).filter(c => c[iConf] !== 'l').map(c => [+c[iLat], +c[iLon], +c[iFrp] || 0]);
    // Aynı yangının pikselleri: 0.1° ızgarada birleştir, haritayı boğmasın.
    const grid = new Map();
    for (const [la, lo, f] of pts) {
      const k = `${la.toFixed(2).slice(0, -1)},${lo.toFixed(2).slice(0, -1)}`;
      const g = grid.get(k) || { lat: la, lon: lo, frp: 0, n: 0 };
      g.frp += f; g.n++; grid.set(k, g);
    }
    const clusters = [...grid.values()].sort((a, b) => b.frp - a.frp).slice(0, 200);
    return { count: pts.length, clusters };
  },
};

const CITIES = [['İstanbul', 41.01, 28.97], ['Ankara', 39.93, 32.86], ['İzmir', 38.42, 27.14], ['Antalya', 36.89, 30.71], ['Adana', 37, 35.32], ['Erzurum', 39.9, 41.27], ['Trabzon', 41, 39.72], ['Diyarbakır', 37.91, 40.23]];

export const weather = {
  id: 'weather', name: 'Hava (Open-Meteo)', group: 'afet', ttlMin: 60,
  async run() {
    const lat = CITIES.map(c => c[1]).join(','), lon = CITIES.map(c => c[2]).join(',');
    const j = await fetchx(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,precipitation&daily=temperature_2m_max,precipitation_sum,wind_gusts_10m_max&forecast_days=2&timezone=Europe%2FIstanbul`, { as: 'json' });
    const arr = Array.isArray(j) ? j : [j];
    return arr.map((c, i) => ({
      city: CITIES[i][0], lat: CITIES[i][1], lon: CITIES[i][2],
      temp: c.current?.temperature_2m, code: c.current?.weather_code, wind: c.current?.wind_speed_10m,
      tomorrowMax: c.daily?.temperature_2m_max?.[1], rainTomorrow: c.daily?.precipitation_sum?.[1], gust: c.daily?.wind_gusts_10m_max?.[1],
      warn: (c.daily?.wind_gusts_10m_max?.[1] > 70 ? 'fırtına ' : '') + (c.daily?.precipitation_sum?.[1] > 40 ? 'yoğun yağış ' : '') + (c.daily?.temperature_2m_max?.[1] > 40 ? 'aşırı sıcak' : ''),
    }));
  },
};
