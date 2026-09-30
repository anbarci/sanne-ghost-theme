// Deprem: AFAD -> Kandilli -> EMSC -> USGS. Kurumlar aynı depremi ayrı bildirir; birleştirilir.
import { fetchx } from '../lib/http.mjs';

const BOX = { minlat: 34, maxlat: 43.5, minlon: 24, maxlon: 46 };
const inBox = e => e.lat >= BOX.minlat && e.lat <= BOX.maxlat && e.lon >= BOX.minlon && e.lon <= BOX.maxlon;
const iso = d => d.toISOString().slice(0, 19);
// AFAD saatleri UTC gelir ama bazen "Z" eki olmadan.
const utc = s => Date.parse(/Z|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z');

// Sitenin kendi kullandığı uç (2026'da güncel). Eski apiv2 GET yedekte.
async function afad() {
  const end = new Date(), start = new Date(Date.now() - 864e5);
  try {
    const j = await fetchx('https://deprem.afad.gov.tr/EventData/GetEventsByFilter', {
      method: 'POST', as: 'json',
      headers: { 'content-type': 'application/json', accept: 'application/json', origin: 'https://deprem.afad.gov.tr', referer: 'https://deprem.afad.gov.tr/last-earthquakes' },
      body: JSON.stringify({
        EventSearchFilterList: [{ FilterType: 9, Value: end.toISOString() }, { FilterType: 8, Value: start.toISOString() }],
        Skip: 0, Take: 300, SortDescriptor: { field: 'eventDate', dir: 'desc' },
      }),
    });
    const list = j?.eventList;
    if (Array.isArray(list)) return list.map(e => ({ t: utc(e.eventDate), mag: +e.magnitude, lat: +e.latitude, lon: +e.longitude, depth: +e.depth, place: String(e.location || '').trim(), src: 'AFAD' }));
  } catch {}
  const j = await fetchx(`https://deprem.afad.gov.tr/apiv2/event/filter?start=${iso(start)}&end=${iso(end)}&minmag=2&orderby=timedesc&limit=300`, { as: 'json' });
  return (Array.isArray(j) ? j : []).map(e => ({ t: utc(e.date), mag: +e.magnitude, lat: +e.latitude, lon: +e.longitude, depth: +e.depth, place: e.location || e.province, src: 'AFAD' }));
}

// Kandilli XML'inde etiket adı "earhquake" (kaynağın kendi yazım hatası).
export function parseKandilliXml(xml) {
  const out = [];
  for (const m of xml.matchAll(/<earhquake\b([^>]*)\/?>/g)) {
    const a = {};
    for (const [, k, v] of m[1].matchAll(/(\w+)="([^"]*)"/g)) a[k] = v;
    const t = Date.parse(String(a.name).replace(/\./g, '-').replace(' ', 'T') + '+03:00');
    out.push({ t, lat: +a.lat, lon: +a.lng, depth: +a.Depth, mag: +a.mag, place: String(a.lokasyon || '').trim().replace(/\s{2,}.*/, ''), src: 'Kandilli' });
  }
  return out;
}

export function parseKandilliText(txt) {
  const out = [];
  for (const m of txt.matchAll(/^(\d{4}\.\d\d\.\d\d \d\d:\d\d:\d\d)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+\S+\s+([\d.]+)\s+\S+\s+(.+?)\s{2,}/gm)) {
    out.push({ t: Date.parse(m[1].replace(/\./g, '-').replace(' ', 'T') + '+03:00'), lat: +m[2], lon: +m[3], depth: +m[4], mag: +m[5], place: m[6].trim(), src: 'Kandilli' });
  }
  return out;
}

async function kandilli() {
  let list;
  try {
    list = parseKandilliXml(await fetchx(`http://udim.koeri.boun.edu.tr/zeqmap/xmlt/son24saat.xml?v=${Date.now()}`, { as: 'text' }));
  } catch {}
  if (!list?.length) list = parseKandilliText(await fetchx('http://www.koeri.boun.edu.tr/scripts/lst0.asp', { as: 'text' }));
  return list.filter(e => Date.now() - e.t < 864e5);
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
    const names = ['AFAD', 'Kandilli', 'EMSC', 'USGS'];
    const results = await Promise.allSettled([afad(), kandilli(), emsc(), usgsWorld()]);
    if (results.every(r => r.status === 'rejected')) throw new Error('hiçbir deprem kaynağına ulaşılamadı');
    const status = {};
    const all = [];
    results.forEach((r, i) => {
      status[names[i]] = r.status === 'fulfilled' ? r.value.length : `hata: ${r.reason?.message}`;
      if (r.status === 'fulfilled') all.push(...r.value.filter(e => Number.isFinite(e.mag) && Number.isFinite(e.t) && (e.world || inBox(e))));
    });
    // 90 sn ve ~30 km içindeki kayıtlar aynı deprem sayılır; ilk gelen (öncelikli) kurum kalır.
    const merged = [];
    for (const e of all) {
      const d = merged.find(x => Math.abs(x.t - e.t) < 90e3 && Math.abs(x.lat - e.lat) < 0.3 && Math.abs(x.lon - e.lon) < 0.3);
      if (d) { d.also = [...new Set([...(d.also || []), e.src])]; continue; }
      merged.push(e);
    }
    merged.sort((a, b) => b.t - a.t);
    const local = merged.filter(e => !e.world);
    return { status, local: local.slice(0, 150), world: merged.filter(e => e.world).slice(0, 40), maxLocal: local.reduce((m, e) => Math.max(m, e.mag), 0) };
  },
};
