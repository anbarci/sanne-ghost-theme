// Sunucuyu açmadan tek tarama yapar ve özet basar. Kaynak hatalarını ayıklamak için.
import { sweep } from '../lib/sweep.mjs';
import { buildDigest } from '../lib/ai/analyze.mjs';

const snap = await sweep({ force: true });
for (const s of snap.sources) console.log(`${s.ok ? '✓' : s.missing.length ? '·' : '✕'} ${s.name.padEnd(38)} ${s.ok ? s.ms + ' ms' : s.error || ''}`);
console.log(`\n${snap.news.length} haber, ${snap.tookMs} ms\n`);
const d = buildDigest(snap);
console.log(d);
console.log(`\nAI özeti: ${d.length} karakter (~${Math.round(d.length / 3.5)} token)`);
