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

export const fred = {
  id: 'fred', name: 'FRED (ABD Fed verileri)', group: 'makro', ttlMin: 360, needs: ['FRED_API_KEY'],
  async run({ secret }) {
    const key = secret('FRED_API_KEY');
    const series = { fedFaiz: 'DFF', abd10y: 'DGS10', dolarEndeksi: 'DTWEXBGS', yuksekGetiriSpread: 'BAMLH0A0HYM2', abdEnflasyonBeklenti5y: 'T5YIE' };
    const out = {};
    await pool(Object.entries(series), 4, async ([k, id]) => {
      const j = await fetchx(`https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${key}&file_type=json&sort_order=desc&limit=2`, { as: 'json' });
      const [a, b] = (j.observations || []).filter(o => o.value !== '.');
      if (a) out[k] = { date: a.date, value: +a.value, prev: b ? +b.value : null };
    });
    return out;
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
