import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.RADAR_DATA_DIR = mkdtempSync(join(tmpdir(), 'radar-u-'));
const { parseFeed, stripTags } = await import('../lib/rss.mjs');
const { extractArticle, titleCheck, isMisleading, lead } = await import('../lib/extract.mjs');
const { impact, dedupe } = await import('../lib/impact.mjs');
const { encrypt, decrypt, loadSettings } = await import('../lib/store.mjs');
const { setPassword, checkPassword, issueCookie, isAuthed } = await import('../lib/auth.mjs');
const { parseJSON } = await import('../lib/ai/providers.mjs');

const W = loadSettings().weights;

test('RSS 2.0: CDATA, entity ve Türkçe karakter', () => {
  const xml = `<rss><channel><item><title><![CDATA[Merkez Bankası faizi %50'de sabit tuttu]]></title><link>https://x.com/a</link><description>&lt;p&gt;Karar &amp; gerekçe&lt;/p&gt;</description><pubDate>Tue, 30 Sep 2026 10:00:00 +0300</pubDate></item></channel></rss>`;
  const [it] = parseFeed(xml, { id: 's', name: 'S', stance: 'resmi' });
  assert.equal(it.title, "Merkez Bankası faizi %50'de sabit tuttu");
  assert.equal(it.summary, 'Karar & gerekçe');
  assert.equal(it.stance, 'resmi');
  assert.ok(it.ts > 0);
});

test('Atom beslemesi ve link href', () => {
  const xml = `<feed><entry><title>Deneme</title><link rel="alternate" href="https://y.org/b?x=1&amp;y=2"/><updated>2026-09-30T07:00:00Z</updated><summary>Özet</summary></entry></feed>`;
  const [it] = parseFeed(xml, {});
  assert.equal(it.link, 'https://y.org/b?x=1&y=2');
});

test('Tam metin: JSON-LD articleBody önceliklidir', () => {
  const body = 'Türkiye Cumhuriyet Merkez Bankası politika faizini yüzde 50 seviyesinde sabit bıraktı. '.repeat(5);
  const html = `<html><script type="application/ld+json">{"@type":"NewsArticle","articleBody":${JSON.stringify(body)}}</script><p>menü</p></html>`;
  assert.match(extractArticle(html), /politika faizini/);
});

test('Tam metin: <article> paragrafları, çerez uyarısı atılır', () => {
  const html = `<article><p>Bu sitede çerez kullanılmaktadır, devam ederek kabul etmiş olursunuz.</p><p>${'Brent petrol varil başına 90 doların üzerine çıktı ve piyasalarda risk iştahı azaldı. '.repeat(4)}</p></article>`;
  const t = extractArticle(html);
  assert.match(t, /Brent/);
  assert.doesNotMatch(t, /çerez/);
});

test('Başlık-içerik uyumu: yanıltıcı başlık yakalanır', () => {
  const body = 'Hazine ve Maliye Bakanlığı bugün iç borçlanma ihalesi sonuçlarını açıkladı. İhalede 12 milyar lira borçlanıldı.';
  const bad = titleCheck('ŞOK! Emeklilere 50 bin lira ikramiye müjdesi', body);
  assert.ok(isMisleading(bad), JSON.stringify(bad));
  const good = titleCheck('Hazine ihalede 12 milyar lira borçlandı', body);
  assert.ok(!isMisleading(good), JSON.stringify(good));
});

test('lead() kısa öz üretir', () => {
  const l = lead('Birinci cümle burada. İkinci cümle de burada. Üçüncü cümle çok uzun olmasa da sığmayabilir.', 50);
  assert.equal(l, 'Birinci cümle burada. İkinci cümle de burada.');
});

test('Etki skoru: komşu savaş + enerji yüksek, alakasız haber sıfır', () => {
  const hi = impact('Israel strikes Iran oil facilities, Brent jumps; Turkey warns of regional war', W, { brent: 5 });
  const lo = impact('Local bakery in Oslo wins bread award', W);
  assert.ok(hi.score >= 50, `hi=${hi.score}`);
  assert.equal(lo.score, 0);
  assert.ok(hi.channels.includes('geo') && hi.channels.includes('energy'));
  assert.ok(hi.place, 'harita konumu bulunmalı');
});

test('Etki skoru: kelime sınırları (thyroid ≠ THY)', () => {
  const r = impact('New thyroid research published', W);
  assert.ok(!r.channels.includes('tourism'));
});

test('Tekilleştirme: aynı olay farklı kaynaklardan birleşir', () => {
  const mk = (title, srcName) => ({ title, srcName, impact: { score: 50 } });
  const out = dedupe([mk('Merkez Bankası politika faizini sabit tuttu', 'AA'), mk('Merkez Bankası politika faizini sabit bıraktı', 'Sözcü'), mk('Deprem Malatya', 'TRT')]);
  assert.equal(out.length, 2);
  assert.equal(out[0].also, 1);
  assert.deepEqual(out[0].srcs.sort(), ['AA', 'Sözcü']);
});

test('Şifreleme: gidiş-dönüş ve kurcalamaya karşı', () => {
  const e = encrypt('sk-gizli-anahtar');
  assert.notEqual(e, 'sk-gizli-anahtar');
  assert.equal(decrypt(e), 'sk-gizli-anahtar');
  const bad = e.slice(0, -4) + (e.at(-4) === 'A' ? 'B' : 'A') + e.slice(-3);
  assert.throws(() => decrypt(bad));
});

test('Admin: kurulumdan önce sahte çerez geçmez', async () => {
  const { createHmac } = await import('node:crypto');
  const payload = `${Date.now() + 1e7}.x`;
  const forged = `radar_s=${payload}.${createHmac('sha256', Buffer.alloc(0)).update(payload).digest('base64url')}`;
  assert.ok(!isAuthed({ headers: { cookie: forged } }));
});

test('Admin: şifre, çerez imzası ve deneme sınırı', () => {
  assert.throws(() => setPassword('kısa'));
  setPassword('uzun-ve-guclu-sifre');
  assert.ok(checkPassword('uzun-ve-guclu-sifre', '1.1.1.1').ok);
  const cookie = issueCookie(false).split(';')[0];
  assert.ok(isAuthed({ headers: { cookie } }));
  assert.ok(!isAuthed({ headers: { cookie: cookie.slice(0, -2) + 'xx' } }));
  for (let i = 0; i < 5; i++) checkPassword('yanlis', '2.2.2.2');
  const r = checkPassword('uzun-ve-guclu-sifre', '2.2.2.2');
  assert.ok(!r.ok && r.wait > 0, 'kilitlenmeli');
});

test('parseJSON: kod bloğu içindeki JSON', () => {
  assert.deepEqual(parseJSON('İşte:\n```json\n{"a":1}\n```'), { a: 1 });
});

test('stripTags boşlukları sadeleştirir', () => {
  assert.equal(stripTags('<b>a</b>\n\n  <i>b</i>'), 'a b');
});
