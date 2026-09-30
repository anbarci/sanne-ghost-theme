// Türkiye ve çevresinin sade SVG haritasını üretir (Natural Earth 1:50m, world-atlas paketi).
// Çıktı public/map.json. Çalışma zamanında harita karosu ya da harici CDN kullanılmaz: gizlilik ve hız.
import { readFileSync, writeFileSync } from 'node:fs';
import { feature } from 'topojson-client';

export const VIEW = { lon0: 19, lon1: 50, lat0: 29.5, lat1: 46.5, w: 1000 };
VIEW.h = Math.round(((VIEW.lat1 - VIEW.lat0) / (VIEW.lon1 - VIEW.lon0)) * VIEW.w / Math.cos((38 * Math.PI) / 180));
const px = ([lon, lat]) => [((lon - VIEW.lon0) / (VIEW.lon1 - VIEW.lon0)) * VIEW.w, ((VIEW.lat1 - lat) / (VIEW.lat1 - VIEW.lat0)) * VIEW.h];

const topo = JSON.parse(readFileSync(new URL('../node_modules/world-atlas/countries-50m.json', import.meta.url)));
const geo = feature(topo, topo.objects.countries);
const inView = c => c.some(([lon, lat]) => lon > VIEW.lon0 - 5 && lon < VIEW.lon1 + 5 && lat > VIEW.lat0 - 5 && lat < VIEW.lat1 + 5);

const out = [];
for (const f of geo.features) {
  const polys = f.geometry?.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry?.type === 'MultiPolygon' ? f.geometry.coordinates : [];
  let d = '';
  for (const poly of polys) for (const ring of poly) {
    if (!inView(ring)) continue;
    let last = null;
    ring.forEach((pt, i) => {
      const [x, y] = px(pt).map((v, k) => Math.round(Math.min((k ? VIEW.h : VIEW.w) + 15, Math.max(-15, v)))); // görüş alanı dışını kenara kırp
      if (last && Math.abs(last[0] - x) < 1.5 && Math.abs(last[1] - y) < 1.5 && i < ring.length - 1) return; // görünmeyen detayı at: dosya küçülür
      d += (last ? 'L' : 'M') + x + ' ' + y;
      last = [x, y];
    });
    d += 'Z';
  }
  if (d) out.push({ name: f.properties.name, tr: f.properties.name === 'Turkey', d });
}
writeFileSync(new URL('../public/map.json', import.meta.url), JSON.stringify({ view: VIEW, countries: out }));
console.log(`map.json: ${out.length} ülke, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
