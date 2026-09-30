// Uçtan uca: sahte fetch ile gerçekçi yanıtlar -> tarama -> etki skoru -> özet -> AI (OpenAI uyumlu) -> tahmin karnesi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.RADAR_DATA_DIR = mkdtempSync(join(tmpdir(), 'radar-p-'));
const { loadSettings, saveSettings, setSecret, readJSON } = await import('../lib/store.mjs');

const yahoo = (price, prev) => ({ chart: { result: [{ meta: { regularMarketPrice: price, chartPreviousClose: prev, regularMarketTime: 1790000000, currency: 'TRY' }, indicators: { quote: [{ close: [prev * 0.99, prev * 1.004, prev * 0.998, prev, price] }] } }] } });
const PRICES = { 'USDTRY=X': [41.8, 41.5], 'EURTRY=X': [48.9, 48.7], 'GC=F': [3900, 3880], 'BZ=F': [92, 86], 'XU100.IS': [10500, 10800], '^VIX': [24, 19] };
const ARTICLE = `<html><article><p>${'İsrail ile İran arasındaki gerilim tırmanırken Brent petrol yüzde 7 yükseldi; Türkiye enerji ithalatı nedeniyle cari açık riskiyle karşı karşıya. '.repeat(3)}</p></article></html>`;
const BAIT = `<html><article><p>${'Hazine bugün iç borçlanma ihalesinde 12 milyar lira borçlandı, faiz yüzde 38 oldu. '.repeat(3)}</p></article></html>`;
const rss = `<rss><channel>
<item><title>İsrail-İran gerilimi: Brent petrol yüzde 7 yükseldi</title><link>https://haber.test/a1</link><description>Enerji fiyatları sert yükseldi</description><pubDate>${new Date().toUTCString()}</pubDate></item>
<item><title>ŞOK! Emeklilere 50 bin lira müjde</title><link>https://haber.test/a2</link><description>İhale sonuçları</description><pubDate>${new Date().toUTCString()}</pubDate></item>
<item><title>Oslo'da ekmek yarışması</title><link>https://haber.test/a3</link><description>Yerel haber</description><pubDate>${new Date().toUTCString()}</pubDate></item>
</channel></rss>`;

let aiCalls = 0;
const AI_OUT = {
  ozet: 'Enerji şoku TL üzerinde baskı yaratıyor.',
  kotumser: { yorum: 'Brent %7 arttı, cari açık genişler.', dayanak: ['BRENT +6,98%'], olasilik: 35 },
  iyimser: { yorum: 'Rezerv tamponu var.', dayanak: ['USDTRY sınırlı +0,72%'], olasilik: 20 },
  tarafsiz: { yorum: 'Baz senaryo kontrollü değer kaybı.', dayanak: ['VIX 24'], izle: ['Brent 95$'] },
  varliklar: [{ kod: 'USDTRY', yon: 'yukari', vade_gun: 1, olasilik: 70, gerekce: 'enerji' }],
  fikirler: [{ baslik: 'Enerji hedge', enstruman: 'Brent', yon: 'al', gerekce: 'jeopolitik', risk: 'ateşkes', gecersiz_kilan: 'Brent < 85' }],
  guven: 'orta',
};

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  const text = (t, ct = 'text/xml') => new Response(t, { headers: { 'content-type': ct } });
  if (u.includes('finance.yahoo.com')) {
    const sym = decodeURIComponent(u.split('/chart/')[1].split('?')[0]);
    return PRICES[sym] ? json(yahoo(...PRICES[sym])) : json({}, 404);
  }
  if (u.includes('btcturk')) return json({ data: [{ pair: 'USDTTRY', last: '42.5', dailyPercent: '0.9' }, { pair: 'BTCTRY', last: '4700000', dailyPercent: '-2.1' }] });
  if (u.includes('deprem.afad')) return json([{ date: new Date(Date.now() - 3600e3).toISOString().slice(0, 19), magnitude: '4.8', latitude: '38.3', longitude: '38.1', depth: '7', location: 'Malatya' }]);
  if (u.includes('usgs')) return json({ features: [{ properties: { mag: 5.1, place: 'Japan', time: Date.now() }, geometry: { coordinates: [140, 36, 10] } }] });
  if (u.includes('haber.test/a1')) return text(ARTICLE, 'text/html');
  if (u.includes('haber.test/a2')) return text(BAIT, 'text/html');
  if (u.includes('haber.test/a3')) return text('<p>kısa</p>', 'text/html');
  if (u.includes('ai.test/v1/chat/completions')) {
    aiCalls++;
    const b = JSON.parse(opts.body);
    assert.equal(b.messages[0].role, 'system');
    return json({ model: 'test-model', choices: [{ message: { content: JSON.stringify(AI_OUT) } }], usage: { prompt_tokens: 900, completion_tokens: 300 } });
  }
  if (/\.rss|rss|feed|export|xml/.test(u) && !u.includes('google')) return text(rss);
  return new Response('yok', { status: 403 });
};

const { sweep } = await import('../lib/sweep.mjs');
const { analyze, buildDigest, scorePredictions, scorecard } = await import('../lib/ai/analyze.mjs');

test('tarama + zenginleştirme + delta', async () => {
  const s = loadSettings();
  s.watchlist = []; saveSettings(s);
  const snap = await sweep({ force: true });

  assert.equal(snap.markets.USDTRY.price, 41.8);
  assert.ok(snap.markets.GRAM_ALTIN.price > 5000, 'gram altın hesaplanmalı');
  assert.ok(snap.markets.BRENT.anomaly, 'Brent %7 olağandışı sayılmalı');
  assert.equal(snap.usdtPremium, Math.round((42.5 / 41.8 - 1) * 10000) / 100);

  const ids = snap.news.map(n => n.title);
  assert.equal(ids.filter(t => t.startsWith('İsrail')).length, 1, 'aynı haber tekilleşmeli');
  const top = snap.news[0];
  assert.match(top.title, /İsrail/);
  assert.ok(top.impact.score >= 40, `skor ${top.impact.score}`);
  assert.ok(top.lead.includes('Brent'), 'tam metinden öz çıkmalı');

  const bait = snap.news.find(n => n.title.startsWith('ŞOK'));
  assert.ok(bait.misleading, 'tık tuzağı başlık işaretlenmeli');
  const oslo = snap.news.find(n => n.title.includes('Oslo'));
  assert.equal(oslo.impact.score, 0);

  assert.equal(snap.quakes.local[0].mag, 4.8);
  assert.ok(snap.delta.events.some(e => /Deprem M4.8/.test(e.text)));
  assert.ok(snap.delta.events.some(e => /BRENT olağan dışı/.test(e.text)));
  assert.ok(snap.sources.find(x => x.id === 'evds').missing.length, 'anahtarsız kaynak eksik görünmeli');
});

test('AI özeti kompakt ve dengeli', () => {
  const snap = readJSON('latest.json');
  const d = buildDigest(snap);
  assert.match(d, /PİYASA: USDTRY/);
  assert.match(d, /\[UYUMSUZ\] ŞOK!/);
  assert.ok(d.length < 6000, `özet ${d.length} karakter`);
});

test('AI analizi: tek çağrı, tekrar çağrı yapılmaz, tahmin karnesi puanlanır', async () => {
  const s = loadSettings();
  s.providers = [{ id: 'p1', name: 'Test', kind: 'openai', baseUrl: 'https://ai.test/v1', model: 'test-model' }];
  s.activeProvider = 'p1';
  setSecret(s, 'AI_KEY_p1', 'k');
  saveSettings(s);

  const snap = readJSON('latest.json');
  const a = await analyze(snap, loadSettings());
  assert.equal(aiCalls, 1);
  assert.equal(a.result.kotumser.olasilik, 35);
  assert.equal(a.usage.in, 900);

  const again = await analyze(snap, loadSettings());
  assert.ok(again.skipped, 'aynı veriyle ikinci çağrı yapılmamalı');
  assert.equal(aiCalls, 1);

  // Vade dolmuş gibi davran: USDTRY %2 yükselmiş olsun -> tahmin tuttu.
  const preds = readJSON('predictions.json');
  preds[0].due = Date.now() - 1;
  (await import('../lib/store.mjs')).writeJSON('predictions.json', preds);
  scorePredictions({ ...snap, markets: { ...snap.markets, USDTRY: { price: 41.8 * 1.02 } } });
  const sc = scorecard();
  assert.equal(sc.done, 1);
  assert.equal(sc.models[0].isabet, 100);
  assert.equal(sc.models[0].brier, 0.09);
});
