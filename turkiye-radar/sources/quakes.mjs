// Deprem: AFAD (resmi) -> Kandilli -> EMSC (Avrupa, açık) -> USGS (küresel, açık). Birleştirip tekilleştirir.
import { fetchx } from '../lib/http.mjs';

const BOX = { minlat: 34, maxlat: 43.5, minlon: 24, maxlon: 46 }; // Türkiye + komşu kuşak
const iso = d => d.toISOString().slice(0, 19);

async function afad() {
  const end = new Date(), start = new Date(Date.now() - 864e5);
  const j = await fetchx(`https://deprem.afad.gov.tr/apiv2/event/filter?start=${iso(start)}&end=${iso(end)}&minmag=2&orderby=timedesc&limit=200&minlat=${BOX.minlat}&maxlat=${BOX.maxlat}&minlon=${BOX.minlon}&maxlon=${BOX.maxlon}`, { as: 'json' });
  return (Array.isArray(j) ? j : []).map(e => ({ t: Date.parse(/Z|[+-]\d\d:?\d\d$/.test(e.date) ? e.date : e.date + 'Z'), /* AFAD apiv2 saatleri UTC */mag: +e.magnitude, lat: +e.latitude, lon: +e.longitude, depth: +e.depth, place: e.location || e.province, src: 'AFAD' }));
}

async function kandilli() {
  const txt = await fetchx('http://www.koeri.boun.edu.tr/scripts/lst0.asp', { as: 'text' });
  const out = [];
  for (const m of txt.matchAll(/^(\d{4}\.\d\d\.\d\d \d\d:\d\d:\d\d)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+\S+\s+([\d.]+)\s+\S+\s+(.+?)\s{2,}/gm)) {
    out.push({ t: Date.parse(m[1].replace(/\./g, '-').replace(' ', 'T') + '+03:00'), lat: +m[2], lon: +m[3], depth: +m[4], mag: +m[5], place: m[6].trim(), src: 'Kandilli' });
  }
  return out.filter(e => Date.now() - e.t < 864e5);
}

async function emsc() {
  const j = await fetchx(`https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=200&minmag=2&start=${iso(new Date(Date.now() - 864e5))}&minlat=${BOX.minlat}&maxlat=${BOX.maxlat}&minlon=${BOX.minlon}&maxlon=${BOX.maxlon}`, { as: 'json' });
  return (j.features || []).map(f => ({ t: Date.parse(f.properties.time), mag: f.properties.mag, lat: f.properties.lat, lon: f.properties.lon, depth: f.properties.depth, place: f.properties.flynn_region, src: 'EMSC' }));
}

async function usgsWorld() {
  const j = await fetchx('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson', { as: 'json' });
  return (j.features || []).map(f => ({ t: f.properties.time, mag: f.properties.mag, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], depth: f.geometry.coordinates[2], place: f.properties.place, src: 'USGS', world: true }));
}

export const quakes = {
  id: 'quakes', name: 'Depremler (AFAD, Kandilli, EMSC, USGS)', group: 'afet', ttlMin: 5,
  async run() {
    const results = await Promise.allSettled([afad(), kandilli(), emsc(), usgsWorld()]);
    const status = {};
    const all = [];
    results.forEach((r, i) => {
      const name = ['AFAD', 'Kandilli', 'EMSC', 'USGS'][i];
      status[name] = r.status === 'fulfilled' ? r.value.length : `hata: ${r.reason?.message}`;
      if (r.status === 'fulfilled') all.push(...r.value.filter(e => Number.isFinite(e.mag) && Number.isFinite(e.t)));
    });
    // Aynı depremi farklı kurumlar bildirir: 90 sn ve ~30 km içindekileri birleştir, öncelik sırası korunur.
    const merged = [];
    for (const e of all) {
      const d = merged.find(x => Math.abs(x.t - e.t) < 90e3 && Math.abs(x.lat - e.lat) < 0.3 && Math.abs(x.lon - e.lon) < 0.3);
      if (d) { d.also = [...new Set([...(d.also || []), e.src])]; continue; }
      merged.push(e);
    }
    if (results.every(r => r.status === 'rejected')) throw new Error('hiçbir deprem kaynağına ulaşılamadı');
    merged.sort((a, b) => b.t - a.t);
    const local = merged.filter(e => !e.world);
    return { status, local: local.slice(0, 150), world: merged.filter(e => e.world).slice(0, 40), maxLocal: local.reduce((m, e) => Math.max(m, e.mag), 0) };
  },
};
