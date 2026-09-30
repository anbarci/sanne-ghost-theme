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
const M = await import('../lib/members.mjs');
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
  const r = extractArticle(html);
  assert.match(r.text, /politika faizini/);
  assert.equal(r.via, 'jsonld');
});

test('Tam metin: <article> paragrafları, çerez uyarısı atılır', () => {
  const html = `<article><p>Bu sitede çerez kullanılmaktadır, devam ederek kabul etmiş olursunuz.</p><p>${'Brent petrol varil başına 90 doların üzerine çıktı ve piyasalarda risk iştahı azaldı. '.repeat(4)}</p></article>`;
  const t = extractArticle(html).text;
  assert.match(t, /Brent/);
  assert.doesNotMatch(t, /çerez/);
});

test('Readability: <article> olmayan tipik haber sitesi şablonu', () => {
  const para = 'Merkez Bankası Para Politikası Kurulu, politika faizini yüzde 40 seviyesinde sabit tutma kararı aldı ve enflasyon görünümüne ilişkin değerlendirmelerini paylaştı. ';
  const html = `<html><head><title>x</title></head><body>
    <nav class="menu"><a href="/">Anasayfa</a><a href="/eko">Ekonomi</a><a href="/spor">Spor</a></nav>
    <div class="sidebar"><h3>En çok okunanlar</h3><ul>${'<li><a href="/x">Başka bir haber başlığı burada</a></li>'.repeat(12)}</ul></div>
    <div class="haber-detay content"><h1>Faiz kararı</h1><div class="detail-text"><p>${para}</p><p>${para.replace('40', '41')}</p><p>${para.replace('40', '42')}</p></div></div>
    <div class="related"><h3>İlgili haberler</h3>${'<a href="/y">İlgili haber linki başlığı burada yer alıyor</a>'.repeat(10)}</div>
    <footer>Tüm hakları saklıdır</footer></body></html>`;
  const r = extractArticle(html);
  assert.equal(r.via, 'readability');
  assert.match(r.text, /politika faizini/);
  assert.doesNotMatch(r.text, /En çok okunanlar|İlgili haber/);
});

test('JS ile yüklenen sayfa nedeniyle etiketlenir', () => {
  const html = '<html><body><div id="root"></div>' + '<script src="/a.js"></script>'.repeat(20) + '</body></html>';
  assert.deepEqual(extractArticle(html), { text: '', via: 'js-sayfa' });
});

test('Kandilli XML ve metin ayrıştırma', async () => {
  const { parseKandilliXml, parseKandilliText } = await import('../sources/quakes.mjs');
  const xml = '<?xml version="1.0"?><eqlist><earhquake name="2026.09.30 04:12:33" lokasyon="PUTURGE (MALATYA)                  " lat="38.2010" lng="38.8712" mag="4.8" Depth="7.0"/></eqlist>';
  const [e] = parseKandilliXml(xml);
  assert.equal(e.mag, 4.8); assert.equal(e.lon, 38.8712); assert.equal(e.place, 'PUTURGE (MALATYA)');
  assert.equal(new Date(e.t).toISOString(), '2026-09-30T01:12:33.000Z');
  const txt = '2026.09.30 04:12:33  38.2010   38.8712        7.0      -.-  4.8  -.-   PUTURGE (MALATYA)                                 İlksel\n';
  assert.equal(parseKandilliText(txt)[0].mag, 4.8);
});

test('FRED grafik CSV: eksik değerler (.) atlanır', async () => {
  const { lastTwoCsv } = await import('../sources/global.mjs');
  assert.deepEqual(lastTwoCsv('observation_date,DGS10\n2026-09-25,4.20\n2026-09-26,4.31\n2026-09-29,.\n'), { date: '2026-09-26', value: 4.31, prev: 4.2 });
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

test('Üyelik: eski admin şifresi taşınır, sahte/eski çerez geçmez, deneme sınırı', async () => {
  const { createHmac, scryptSync, randomBytes } = await import('node:crypto');
  const { writeJSON } = await import('../lib/store.mjs');
  // Eski tek kullanıcılı kurulum: admin.json'daki şifre "admin" yöneticisine taşınmalı.
  const salt = randomBytes(16);
  writeJSON('admin.json', { salt: salt.toString('base64'), hash: scryptSync('eski-guclu-sifre', salt, 64, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('base64'), sessionKey: randomBytes(32).toString('base64') });
  const r0 = M.login('admin', 'eski-guclu-sifre', '1.1.1.1');
  assert.ok(r0.ok && r0.user.rank === 'yonetici');
  const cookie = M.issueCookie(r0.user, false).split(';')[0];
  const me = M.currentUser({ headers: { cookie } });
  assert.equal(me.ad, 'admin'); assert.equal(me.rutbe.admin, true);
  assert.equal(M.currentUser({ headers: { cookie: cookie.slice(0, -2) + 'xx' } }), null);
  const payload = `${Date.now() + 1e7}.u1.1.x`;
  assert.equal(M.currentUser({ headers: { cookie: `radar_s=${payload}.${createHmac('sha256', Buffer.alloc(0)).update(payload).digest('base64url')}` } }), null);
  // Şifre değişince eski oturum düşer.
  M.updateUser('u1', { password: 'yeni-guclu-sifre-1' }, null);
  assert.equal(M.currentUser({ headers: { cookie } }), null);
  for (let i = 0; i < 5; i++) M.login('admin', 'yanlis', '2.2.2.2');
  const r = M.login('admin', 'yeni-guclu-sifre-1', '2.2.2.2');
  assert.ok(!r.ok && r.wait > 0, 'kilitlenmeli');
  assert.throws(() => M.createUser({ ad: 'x', password: 'uzun-sifre-123' }), /Kullanıcı adı/);
  assert.throws(() => M.createUser({ ad: 'ali', password: 'kısa' }), /10 karakter/);
});

test('Üyelik: davet kodu, rütbe özellikleri, günlük kota, son yönetici korunur', () => {
  const code = M.createInvite({ rank: 'pro', uses: 1, days: 3 }, { ad: 'admin' });
  assert.throws(() => M.createInvite({ rank: 'yonetici' }), /yönetici/);
  const u = M.register({ ad: 'ayse', password: 'ayse-guclu-sifre', code });
  assert.equal(u.rank, 'pro');
  assert.throws(() => M.register({ ad: 'mehmet', password: 'mehmet-guclu-sifre', code }), /geçersiz/);
  const me = M.currentUser({ headers: { cookie: M.issueCookie(u, false).split(';')[0] } });
  assert.equal(me.rutbe.trade, true); assert.equal(me.rutbe.admin, false); assert.equal(me.rutbe.sohbet, 30);
  const low = { ...me, rutbe: { ...me.rutbe, sohbet: 2 } };
  assert.ok(M.useQuota(low, 'sohbet').ok); assert.ok(M.useQuota(low, 'sohbet').ok);
  assert.equal(M.useQuota(low, 'sohbet').ok, false);
  assert.throws(() => M.updateUser('u1', { rank: 'temel' }, { id: 'baska' }), /Son yönetici/);
  assert.throws(() => M.deleteUser('u1', { id: 'baska' }), /Son yönetici/);
  M.updateUser(u.id, { disabled: true }, { id: 'u1' });
  assert.equal(M.login('ayse', 'ayse-guclu-sifre', '3.3.3.3').ok, false);
});

test('parseJSON: kod bloğu içindeki JSON', () => {
  assert.deepEqual(parseJSON('İşte:\n```json\n{"a":1}\n```'), { a: 1 });
});

test('stripTags boşlukları sadeleştirir', () => {
  assert.equal(stripTags('<b>a</b>\n\n  <i>b</i>'), 'a b');
});

test('DeepSeek: düşünme kapalı/açık istek gövdesi', async () => {
  const { openaiBody } = await import('../lib/ai/providers.mjs');
  const p = { baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash' };
  const off = openaiBody(p, 's', 'u');
  assert.deepEqual(off.thinking, { type: 'disabled' });
  assert.equal(off.temperature, 0.3);
  assert.deepEqual(off.response_format, { type: 'json_object' });
  const on = openaiBody({ ...p, thinking: 'on', effort: 'high' }, 's', 'u');
  assert.deepEqual(on.thinking, { type: 'enabled' });
  assert.equal(on.reasoning_effort, 'high');
  assert.equal(on.temperature, undefined);
  assert.equal(openaiBody({ baseUrl: 'https://api.openai.com/v1', model: 'x' }, 's', 'u').thinking, undefined);
});

test('Önbellek sayacı: DeepSeek ve OpenAI biçimleri', async () => {
  const { openaiUsage } = await import('../lib/ai/providers.mjs');
  assert.deepEqual(openaiUsage({ prompt_tokens: 2000, completion_tokens: 500, prompt_cache_hit_tokens: 1500 }), { in: 500, out: 500, cacheRead: 1500, reasoning: 0 });
  assert.equal(openaiUsage({ prompt_tokens: 100, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 60 } }).in, 40);
});

test('Maliyet: DeepSeek sakin saat indirimi ve bilinmeyen model', async () => {
  const { costUSD, isOffPeak } = await import('../lib/ai/providers.mjs');
  const u = { in: 1e6, out: 1e6, cacheRead: 0 };
  const peak = Date.parse('2026-09-30T10:00:00Z'), off = Date.parse('2026-09-30T20:00:00Z');
  assert.ok(!isOffPeak(peak) && isOffPeak(off) && isOffPeak(Date.parse('2026-09-30T00:10:00Z')));
  assert.equal(costUSD('deepseek-flash', u, peak), 1.5);
  assert.equal(costUSD('deepseek-flash', u, off), 0.75);
  assert.equal(costUSD('claude-opus-5-5', { in: 1e6, out: 0, cacheRead: 1e6 }), 4.4);
  assert.equal(costUSD('bilinmeyen-model', u), null);
});

test('Günlük harcama İstanbul gününe göre toplanır', async () => {
  const { spentToday } = await import('../lib/ai/analyze.mjs');
  const now = Date.parse('2026-09-30T10:00:00Z');
  const hist = [
    { at: Date.parse('2026-09-30T08:00:00Z'), cost: 0.1, usage: { in: 100, out: 50, cacheRead: 10 } },
    { at: Date.parse('2026-09-29T20:30:00Z'), cost: 0.2, usage: { in: 1, out: 1 } }, // İstanbul'da 23:30, dün
  ];
  assert.deepEqual(spentToday(hist, now), { usd: 0.1, tokens: 160 });
});

// Aşağıdaki örnekler 2026-09-30'da canlı uçlardan alınan yanıtların kısaltılmış halidir.
test('currency-api (gerçek biçim): kur, ons ve gümüş türetilir', async () => {
  const { fromUsdRates } = await import('../sources/markets.mjs');
  const cur = { date: '2026-09-29', usd: { try: 48.99546313, eur: 0.88022588, xau: 0.0002421835, xag: 0.016496894 } };
  const prev = { date: '2026-09-28', usd: { try: 48.95, eur: 0.879, xau: 0.000238, xag: 0.0163 } };
  const r = fromUsdRates(cur, prev);
  assert.equal(r.USDTRY.price, 48.9955);
  assert.equal(r.EURTRY.price, 55.6624);
  assert.equal(Math.round(r.ONS.price), 4129);
  assert.ok(r.ONS.chg < 0 && r.USDTRY.chg > 0);
  assert.equal(r.USDTRY.src, 'currency-api');
});

test('İş Yatırım HisseTekil (gerçek biçim): hisse ve BIST 100', async () => {
  const { fromIsYatirim } = await import('../sources/markets.mjs');
  const row = (d, c, e) => ({ HGDG_HS_KODU: 'THYAO', HGDG_TARIH: d, HGDG_KAPANIS: c, END_ENDEKS_KODU: '01', END_DEGER: e, DD_DEGER: 48.8 });
  const r = fromIsYatirim([row('26-09-2026', 290, 12800), row('29-09-2026', 293.5, 12592.76), row('30-09-2026', 298.1, 12290.58)], 'THYAO');
  assert.equal(r.THYAO.price, 298.1);
  assert.equal(r.XU100.price, 12290.58);
  assert.equal(r.XU100.chg, -2.4); // haberdeki "dün 12.592,76 kapanış" ile tutarlı
});

test('Vadeli kontrat devri: sahte hareket yerine gerçek kontrat seçilir', async () => {
  const { contractSymbols, pickContract } = await import('../sources/markets.mjs');
  assert.deepEqual(contractSymbols('BZ', new Date('2026-09-30T12:00:00Z')), ['BZU26.NYM', 'BZV26.NYM', 'BZX26.NYM', 'BZZ26.NYM']);
  assert.deepEqual(contractSymbols('TTF'), []);
  // 2026-09-30 gerçek değerleri: BZ=F 96.33 (seri -%6,1), BZX26 102.76, BZZ26 96.33
  const front = { price: 96.33, chg: -6.1 };
  const hit = pickContract(front, [null, { sym: 'BZX26.NYM', price: 102.76 }, { sym: 'BZZ26.NYM', price: 96.33 }]);
  assert.equal(hit.sym, 'BZZ26.NYM');
});

test('BIST bedelsiz/bölünme düzeltmesi (KONTR 2025-12-01 gerçek değerleri)', async () => {
  const { fixCorporateActions } = await import('../sources/bist.mjs');
  const s = { t: ['2025-11-28', '2025-12-01', '2025-12-02'], o: [33, 16.8, 17.2], h: [34, 17.5, 17.6], l: [32.8, 16.7, 17], c: [33.4, 17.18, 17.4], v: [100, 210, 190] };
  fixCorporateActions(s);
  assert.deepEqual(s.adjusted, ['2025-12-01']);
  assert.ok(Math.abs(s.c[1] / s.c[0] - 1) < 0.1, 'düzeltme sonrası günlük hareket marj içinde olmalı');
  const real = { t: ['a', 'b'], o: [10, 9.1], h: [10, 9.2], l: [10, 9], c: [10, 9], v: [1, 1] };
  fixCorporateActions(real);
  assert.equal(real.adjusted, undefined, 'gerçek %10 taban düzeltilmemeli');
});

test('Tarayıcı: göstergeler ve skor sentetik trendde mantıklı', async () => {
  const { sma, rsi, spearman } = await import('../lib/ta.mjs');
  assert.deepEqual(sma([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
  const up = Array.from({ length: 30 }, (_, i) => 100 + i);
  assert.equal(rsi(up, 14).at(-1), 100);
  assert.equal(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1);
  assert.equal(spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1);
  const { prepare, screen, backtest, gapDays } = await import('../lib/screener.mjs');
  assert.equal(gapDays('2026-09-28', '2026-09-30'), 1);
  assert.equal(gapDays('2026-09-25', '2026-09-28'), 0, 'hafta sonu boşluk sayılmaz');
  const mk = (kod, drift) => {
    const t = [], c = [];
    for (let i = 0; i < 320; i++) { const d = new Date(Date.UTC(2025, 0, 1) + i * 864e5); t.push(d.toISOString().slice(0, 10)); c.push(100 * (1 + drift) ** i * (1 + 0.01 * Math.sin(i))); }
    return prepare({ kod, ad: kod, t, o: c, h: c.map(x => x * 1.01), l: c.map(x => x * 0.99), c, v: c.map(() => 1000) });
  };
  const P = [mk('YUKARI', 0.003), mk('YATAY', 0), mk('ASAGI', -0.003)];
  const rows = screen(P, null);
  const by = Object.fromEntries(rows.map(r => [r.kod, r.scores.trend.score]));
  assert.ok(by.YUKARI > by.YATAY && by.YATAY >= by.ASAGI, JSON.stringify(by));
  const bt = backtest(P, null);
  assert.ok(bt.presets.trend && bt.presets.donus && bt.presets.sakin);
});

test('Rakam doğrulama: veride olmayan sayı yakalanır', async () => {
  const { verifyNumbers } = await import('../lib/ai/analyze.mjs');
  const digest = 'PİYASA: USDTRY 49 (+0,01%) | XU100 12.290,58 (-2,4%) | BRENT 96,33 (+0,17%)';
  const r = { kotumser: { yorum: 'BIST 12.290 seviyesinde, %-2,4 düştü.', dayanak: ['Brent 96,3 dolar', 'USDTRY 52,7 olursa'] }, iyimser: { yorum: '', dayanak: [] }, tarafsiz: { yorum: '7 gün izlenmeli', dayanak: [] }, fikirler: [] };
  assert.deepEqual(verifyNumbers(r, digest), ['52,7']);
});

test('Tarayıcı canlı takip: kayıt, vade ve endekse göre puan', async () => {
  const { recordPicks, scorePicks, picksSummary } = await import('../lib/picks.mjs');
  const { writeJSON } = await import('../lib/store.mjs');
  writeJSON('picks.json', []);
  const row = (kod, s, price) => ({ kod, price, scores: { trend: { score: s }, donus: { score: 100 - s }, sakin: { score: 50 } } });
  const sc = { rows: [row('AAA', 90, 10), row('BBB', 10, 20)], index: { price: 1000 } };
  const t0 = Date.parse('2026-09-01T09:00:00Z');
  recordPicks(sc, t0);
  recordPicks(sc, t0 + 3600e3); // aynı gün ikinci kez kaydedilmez
  const series = { t: ['2026-09-01', '2026-09-15', '2026-09-16'] };
  const ohlc = { series: { AAA: { ...series, c: [10, 11, 11] }, BBB: { ...series, c: [20, 19, 19] }, XU100: { ...series, c: [1000, 1020, 1020] } } };
  const picks = scorePicks(ohlc);
  assert.equal(picks.length, 6); // 3 strateji x 2 hisse (evrende 2 hisse var)
  const s = picksSummary(picks);
  assert.equal(s.trend.done, 2);
  const aaa = picks.find(p => p.kod === 'AAA' && p.preset === 'trend');
  assert.ok(Math.abs(aaa.excess - 0.08) < 1e-9, 'AAA %10, endeks %2 -> fark %8');
});

test('Tam metin: Next.js gömülü JSON (__NEXT_DATA__)', () => {
  const body = '<p>Merkez Bankası rezervleri geçen hafta 3 milyar dolar arttı ve toplam brüt rezerv yeni zirveye ulaştı.</p>'.repeat(4);
  const html = `<html><body><div id="__next"></div><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { article: { title: 'x', url: 'https://a.b/c', content: body } } } })}</script></body></html>`;
  const r = extractArticle(html);
  assert.equal(r.via, 'gömülü-json');
  assert.match(r.text, /brüt rezerv/);
  assert.doesNotMatch(r.text, /<p>/);
});

test('Gündem katalizörü: piyasa hareketi ve haber yönü hisseye zincirlenir', async () => {
  const { catalysts, gundemScore, tone } = await import('../lib/catalysts.mjs');
  const news = [
    { title: 'Brent petrol OPEC kararıyla sert yükseldi', lead: '', impact: { score: 60 } },
    { title: 'TCMB politika faizi kararında 250 baz puan indirim yaptı', lead: '', impact: { score: 80 } },
    { title: 'Merkez bankası faiz kararı: politika faizi indirimi sürdü', lead: '', impact: { score: 70 } },
  ];
  const markets = { BRENT: { chg: 3.1 } };
  const kods = new Set(['THYAO', 'TUPRS', 'AKBNK']);
  const { themes, byKod } = catalysts(news, markets, 'tr', kods);
  const petrol = themes.find(t => t.id === 'petrol');
  assert.equal(petrol.yon, 1);
  assert.deepEqual(petrol.etkiler.map(e => [e.kod, e.yon]), [['THYAO', -1], ['TUPRS', 1]]);
  assert.equal(themes.find(t => t.id === 'tcmb_faiz').yon, 1);
  assert.ok(byKod.AKBNK.net > 0 && byKod.THYAO.net < 0);
  assert.equal(gundemScore(byKod.THYAO).score, 0);
  assert.ok(gundemScore(byKod.THYAO).risk[0].includes('Yakıt'));
  // Eşik altı hareket ve haber yoksa tema doğmaz; ABD'ye özgü tema TR'de görünmez.
  assert.equal(catalysts([], { BRENT: { chg: 0.4 } }, 'tr', kods).themes.length, 0);
  assert.ok(tone('Satışlar rekor kırdı, kâr arttı') > 0 && tone('Şirket zarar açıkladı, üretim durdu, iflas') < 0);
});

test('AI hafızası: son 3 analiz ve tahmin sonuçları özete girer, hash dışında kalır', async () => {
  const { prevAnalyses, buildDigest } = await import('../lib/ai/analyze.mjs');
  const at = Date.UTC(2026, 8, 29, 9);
  const hist = [1, 2, 3, 4].map(i => ({ at: at - i * 36e5, result: { ozet: `özet ${i}`, varliklar: [{ kod: 'USDTRY', yon: 'yukari', olasilik: 60, vade_gun: 7 }] } }));
  const preds = [{ id: `${hist[0].at}-USDTRY`, done: true, hit: false, chg: -0.8 }];
  const prev = prevAnalyses(hist, preds);
  assert.equal(prev.length, 3);
  assert.match(prev[0].varliklar, /USDTRY↑%60\/7g TUTMADI\(-0,8%\)/);
  const d = buildDigest({ news: [], markets: {} }, prev);
  assert.match(d, /ÖNCEKİ ANALİZLER[\s\S]*özet 1[\s\S]*özet 3/);
  assert.equal(d.replace(/\nÖNCEKİ ANALİZLER[\s\S]*$/, '').includes('özet'), false);
});

test('Dünya skoru: Türkiye bağı olmayan küresel haber de puan alır', () => {
  const w = impact('Oil prices surge as OPEC cuts output amid war fears', W);
  assert.ok(w.world >= 40, `world ${w.world}`);
  assert.deepEqual(impact('Fed holds rates, Wall Street falls', W).wplace, [40.7, -74]);
});

test('Veri kontrolleri: kaynaklar arası fark ve bayat veri yakalanır', async () => {
  const { runChecks } = await import('../lib/checks.mjs');
  const now = Date.UTC(2026, 8, 30, 10);
  const s = {
    markets: { USDTRY: { price: 48.94, time: now - 36e5 }, EURTRY: { price: 55.66, time: now - 36e5 }, BRENT: { price: 96, time: now - 100 * 36e5, roll: 'şüpheli' } },
    tcmb: { date: '29.09.2026', rates: { USD: { sell: 49.0013 } } },
    ecb: { EURTRY: { date: '2026-09-29', value: 57.9 }, EURUSD: { date: '2026-09-29', value: 1.1355 } },
  };
  const c = Object.fromEntries(runChecks(s, now).map(x => [x.ad, x]));
  assert.equal(c['Dolar/TL: Yahoo ↔ TCMB'].ok, true);
  assert.equal(c['Euro/TL: Yahoo ↔ ECB'].ok, false); // %3,9 fark
  assert.equal(c['Çapraz kur EUR/USD'].ok, true);   // 55,66/48,94 = 1,137
  assert.equal(c['Vadeli kontrat devri'].ok, false);
  assert.match(c['Fiyatların tazeliği'].detay, /BRENT \(100 sa\)/);
});

test('Çapraz teyit: benzer başlık, kendi kaynağı sayılmaz, ajans kopyası ve yalanlama', async () => {
  const { judge, queryOf, parseGoogleNews } = await import('../lib/verify.mjs');
  const xml = ['Brent petrol 96 doların altına geriledi - Dünya Gazetesi|Dünya Gazetesi', 'Brent petrol 96 doların altına geriledi - Mynet|Mynet',
    'Brent petrolün varili 96 doların altına geriledi - Ekotürk|ekotürk', 'Altın fiyatları rekor kırdı - Sözcü|Sözcü',
    'Brent petrol geriledi iddiası asılsız çıktı - Teyit|Teyit']
    .map(x => { const [t, s] = x.split('|'); return `<item><title>${t}</title><link>https://news.google.com/x</link><pubDate>Tue, 29 Sep 2026 10:00:00 GMT</pubDate><source url="https://x">${s}</source></item>`; }).join('');
  const r = judge({ title: 'Brent petrol 96 doların altına geriledi', srcName: 'Dünya' }, parseGoogleNews(xml), Date.UTC(2026, 8, 30, 9));
  assert.deepEqual(r.ornek.map(o => o.src).sort(), ['Mynet', 'Teyit', 'ekotürk']);
  assert.equal(r.ozgun, 2); // Mynet aynı başlık: ajans kopyası
  assert.equal(r.durum, 'yalanlama');
  assert.equal(queryOf("İran'dan Körfez enerji altyapısına saldırı tehdidi"), 'İran Körfez enerji altyapısına saldırı tehdidi');
});

test('SearXNG: yayıncı ve tarih çıkarılır, tarihsiz ve eski sonuç teyit sayılmaz', async () => {
  const { parseSearx, judge } = await import('../lib/verify.mjs');
  const now = Date.UTC(2026, 8, 30, 9);
  const j = { results: [
    { title: 'Brent petrol 96 doların altına geriledi', url: 'https://www.dunya.com/enerji/x', metadata: '12 hours ago | Dünya Gazetesi' },
    { title: 'Brent petrol 95,80 dolara geriledi', url: 'https://www.malatyaguncel.com/x', publishedDate: '2026-09-29T20:20:00' },
    { title: 'Brent petrol 104,44 dolara geriledi', url: 'https://mansethaber.com/x', content: 'Manşet Haber / 2 weeks ago' },
    { title: 'Brent petrol geriledi', url: 'https://tarihsiz.com/x' },
  ] };
  const c = parseSearx(j, now);
  assert.equal(c[0].src, 'Dünya Gazetesi');
  assert.equal(c[0].ts, now - 12 * 36e5);
  assert.equal(c[1].src, 'malatyaguncel.com');
  const r = judge({ title: 'Brent petrol 96 doların altına geriledi', srcName: 'Investing', link: 'https://tr.investing.com/a' }, c, now);
  assert.deepEqual(r.ornek.map(o => o.src).sort(), ['Dünya Gazetesi', 'malatyaguncel.com']); // 2 hafta önceki ve tarihsiz atıldı
});

test('Hafıza: ölçülmüş isabet, kalibrasyon, yön yanlılığı; tekrar eden ders eklenmez', async () => {
  const { statLessons, addLesson, loadMemory } = await import('../lib/ai/memory.mjs');
  const P = (kod, yon, p, actual) => ({ kod, yon, p, actual, done: true, hit: yon === actual });
  const preds = [P('USDTRY', 'asagi', 0.7, 'yukari'), P('USDTRY', 'asagi', 0.75, 'yukari'), P('USDTRY', 'yukari', 0.6, 'yukari'),
    P('XU100', 'yukari', 0.8, 'asagi'), P('XU100', 'yukari', 0.7, 'yatay'), P('XU100', 'yukari', 0.65, 'asagi')];
  const L = statLessons(preds);
  assert.ok(L.some(x => /USDTRY: 3 tahminin 1'i tuttu \(tutmayanların çoğu "asagi"/.test(x)), L.join('\n'));
  assert.ok(L.some(x => /%65 ve üstü güvenle verdiğin 5 tahminin %0'i tuttu: güvenini düşür/.test(x)), L.join('\n'));
  assert.ok(addLesson('Kurda yukarı yönlü trendde aşağı tahmini vermeden önce TCMB kararını beklemeliyim.'));
  assert.equal(addLesson('Kurda yukarı yönlü trendde aşağı tahmini vermeden önce TCMB kararını beklemeliyim!'), 'pekisti');
  assert.equal(loadMemory().dersler.length, 1);
  assert.equal(loadMemory().dersler[0].sayi, 2);
});

test('Sohbet verisi: sorudaki hisse, varlık ve konu kelimeleri ilgili veriyi getirir', async () => {
  const { retrieve } = await import('../lib/ai/chat.mjs');
  const row = { kod: 'THYAO', ad: 'Türk Hava Yolları', price: 300, r1: 0.01, r21: -0.05, r63: 0.1, rsi: 45, dist52: 0.12, atr: 2.1, volRatio: 1.2,
    scores: { trend: { score: 50, setup: 'İzle', why: ['x'], risk: [] }, gundem: { score: 0, setup: 'Gündem aleyhine', why: [], risk: ['Petrol yukarı → Yakıt'] } }, news: { titles: [{ title: 'THY yeni uçak aldı', src: 'AA' }] } };
  const snap = {
    at: Date.now(), markets: { BRENT: { price: 96, chg: 1.2, vol: 1.8, spark: [90, 96] } },
    screeners: { tr: { ad: 'Türkiye', bench: { ad: 'BIST 100' }, rows: [row], backtest: { presets: { trend: { excess: -0.003, hit: 0.46 } } }, catalysts: [{ ad: 'Petrol fiyatı', yon: 1, neden: 'BRENT +1,2%', etkiler: [{ kod: 'THYAO', yon: -1, neden: 'Yakıt maliyeti' }] }] } },
    news: [{ id: 'a', title: 'Petrol fiyatları Hürmüz gerilimiyle yükseldi', lead: 'Brent 96 dolar', srcName: 'AA', stance: 'resmi', ts: Date.now(), impact: { score: 70 } }],
  };
  const r = retrieve('THY hissesi petrol fiyatları yüzünden düşer mi?', snap);
  assert.match(r, /HİSSE THYAO/);
  assert.match(r, /Gündem: Petrol fiyatı yukarı .* Yakıt maliyeti/);
  assert.match(r, /FİYATLAR: BRENT 96/);
  assert.match(r, /HABER \[AA\/resmi.*Petrol fiyatları Hürmüz/);
  assert.equal(retrieve('merhaba', snap), '');
});

test('Sohbet sıkıştırma: son 8 mesaj aynen, eskiler soru → ilk cümle özetine iner', async () => {
  const { compactHistory } = await import('../lib/ai/chat.mjs');
  const turns = Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: i % 2 ? `Cevap ${i}. İkinci cümle.` : `Soru ${i}` }));
  const { summary, recent } = compactHistory(turns);
  assert.equal(recent.length, 8);
  assert.match(summary, /4 mesaj[\s\S]*S: Soru 0 → C: Cevap 1\.\n- S: Soru 2 → C: Cevap 3\./);
  assert.equal(compactHistory(turns.slice(0, 4)).summary, '');
});

test('Canlı fiyat: spark ayrıştırma, gecikme, kontrat devrinde değişim korunur, gram altın yeniden hesaplanır', async () => {
  const { parseSpark, mergeLive } = await import('../lib/live.mjs');
  const now = 1790760210000;
  const j = { 'USDTRY=X': { timestamp: [1790760200, 1790760202], close: [49, 49.01], previousClose: 49.0005 },
    'GC=F': { timestamp: [1790759600], close: [4221.6], previousClose: 4179.7 }, 'BZ=F': { timestamp: [1790759600], close: [97.3], previousClose: 90 } };
  const q = parseSpark(j, [['USDTRY', 'USDTRY=X'], ['ONS', 'GC=F'], ['BRENT', 'BZ=F'], ['YOK', 'YOK']], now);
  assert.equal(q.USDTRY.delaySec, 8);
  assert.equal(q.ONS.chg, 1);
  assert.equal(q.YOK, undefined);
  const m = mergeLive({ USDTRY: { price: 48.9, chg: 0, vol: 0.1 }, ONS: { price: 4100, chg: 0, vol: 1 }, BRENT: { price: 90, chg: 1.2, roll: 'BZX26', vol: 2 }, GRAM_ALTIN: { derived: true } }, q);
  assert.equal(m.BRENT.chg, 1.2); // devir düzeltmeli değişim canlı veriyle ezilmez
  assert.equal(m.BRENT.price, 97.3);
  assert.equal(m.GRAM_ALTIN.price, Math.round(4221.6 * 49.01 / 31.1035 * 100) / 100);
  assert.equal(m.USDTRY.live, true);
});

test('Hafıza ağacı: hafta kimliği, tarih ifadeleri, düğüm okuma ve konu araması', async () => {
  const m = await import('../lib/ai/memtree.mjs');
  const now = Date.UTC(2026, 8, 30, 9);
  assert.equal(m.weekOf(now), '2026-H40');
  assert.equal(m.weekOf(Date.UTC(2025, 11, 29)), '2026-H01');
  assert.deepEqual(m.dateNodes('25 Eylül ve dün ne demiştin?', now), ['2026-09-25', '2026-09-29']);
  assert.deepEqual(m.dateNodes('geçen hafta', now), ['2026-H39']);
  const arr = [1, 2, 8].map(d => ({ at: now - d * 864e5, provider: 'P', ozet: d === 8 ? 'Altın yükseliş trendinde' : `özet ${d}`, varliklar: [{ kod: 'USDTRY', yon: 'yukari', olasilik: 60, vade_gun: 7 }], fikirler: [], eylem: [], ders: '', haberler: [], fiyat: { USDTRY: 48 + d / 10 } }));
  const preds = [{ id: `${arr[0].at}-USDTRY`, at: arr[0].at, done: true, hit: false, chg: -0.8 }];
  assert.match(m.readNode('2026-09-29', arr, preds), /USDTRY yukari %60\/7g TUTMADI \(-0,8%\)/);
  assert.match(m.toc(now, arr, preds), /\[2026-H40\] 2 analiz \| USDTRY 48,2→48,1 \| tahmin 0\/1 tuttu/);
  const chats = { [arr[1].at]: { at: arr[1].at, turns: [{ role: 'user', content: 'Gram altın alayım mı?', at: now }, { role: 'assistant', content: 'Riskli.' }] } };
  const r = m.searchMemory('altın', arr, chats);
  assert.match(r, /2 eşleşme/);
  assert.match(r, /analiz: Altın yükseliş/);
  assert.match(r, /sohbet: S: Gram altın alayım mı\? → C: Riskli\./);
});

test('Web araması: yerel ağ adresleri açılmaz', async () => {
  const { isPublicUrl } = await import('../lib/websearch.mjs');
  for (const u of ['http://localhost:3120/api', 'http://127.0.0.1/', 'http://192.168.1.1/', 'http://10.0.0.5/', 'http://172.20.0.1/', 'http://nas.local/', 'file:///etc/passwd', 'http://[::1]/'])
    assert.equal(isPublicUrl(u), false, u);
  assert.equal(isPublicUrl('https://www.aa.com.tr/tr/ekonomi/x'), true);
});

test('API anahtarı kontrolü: adres, boşluk ve yanlış önek yakalanır', async () => {
  const { checkKey } = await import('../lib/keycheck.mjs');
  const ds = { baseUrl: 'https://api.deepseek.com', kind: 'openai' };
  assert.match(checkKey('https://api.deepseek.com', ds), /adres girilmiş/);
  assert.match(checkKey('api.deepseek.com', ds), /adres girilmiş/);
  assert.match(checkKey('sk-abc def', ds), /boşluk/);
  assert.match(checkKey('abc123', ds), /sk-/);
  assert.equal(checkKey('sk-1234567890abcdef', ds), null);
  assert.equal(checkKey('', ds), null);
  assert.match(checkKey('sk-123', { kind: 'anthropic', baseUrl: '' }), /sk-ant-/);
});

test('Model çıktısı normalizasyonu: DeepSeek tarzı kaymış alan adları düzelir', async () => {
  const { normalizeResult } = await import('../lib/ai/analyze.mjs');
  const r = normalizeResult({ varliklar: [{ varlik: 'Dolar/TL', yön: 'Yukarı', vade: '7 gün', olasılık: '%65', gerekçe: 'x' }, { ad: 'BIST 100', yon: 'düşüş', olasilik: 0.55 }, { kod: 'XU100', yon: 'yatay' }],
    fikirler: [{ başlık: 'A', yön: 'Al' }], eylem: ['Altın al'], guven: 'yüksek', kotumser: { yorum: 'k', dayanak: 'tek', olasilik: '%30' } });
  assert.deepEqual(r.varliklar.map(v => [v.kod, v.yon, v.vade_gun, v.olasilik]), [['USDTRY', 'yukari', 7, 65], ['XU100', 'asagi', 7, 55]]);
  assert.equal(r.fikirler[0].yon, 'al');
  assert.deepEqual(r.eylem[0], { adim: 'Altın al', neden: '', risk: '' });
  assert.equal(r.guven, 'yuksek');
  assert.deepEqual(r.kotumser.dayanak, ['tek']);
  assert.equal(r.kotumser.olasilik, 30);
  const m = normalizeResult({ varliklar: { USDTRY: { yon: 'yukari', olasilik: 60 }, GRAM_ALTIN: 'yukari' } });
  assert.deepEqual(m.varliklar.map(v => v.kod), ['USDTRY', 'GRAM_ALTIN']);
});

test('Ders hafızası (PSSA kuralları): pekişen ders kararlı olur, kapasitede korunur, okuma sınırlı ve bağlama göre', async () => {
  const { addLesson, loadMemory, pickLessons, memoryLines, CAPACITY } = await import('../lib/ai/memory.mjs');
  const { writeJSON } = await import('../lib/store.mjs');
  writeJSON('memory.json', { dersler: [], notlar: [] });
  const t0 = Date.UTC(2026, 8, 1);
  const stable = 'Petrol yükselirken havayolu hisselerinde iyimser tahmin vermemeliyim';
  for (let i = 0; i < 3; i++) addLesson(stable + '.'.repeat(i), t0 + i);
  // Kapasiteyi alakasız, birbirine benzemeyen derslerle doldur: kararlı ders silinmemeli.
  const words = ['altın', 'bitcoin', 'euro', 'tahvil', 'enflasyon', 'bütçe', 'ihracat', 'turizm', 'konut', 'otomotiv', 'çelik', 'savunma', 'banka', 'teknoloji', 'gıda', 'tekstil', 'kimya', 'enerji', 'sigorta', 'perakende', 'lojistik', 'madencilik', 'telekom', 'havacılık', 'inşaat', 'kağıt', 'cam', 'tarım', 'sağlık', 'eğitim', 'medya', 'spor', 'oyun', 'yazılım', 'donanım'];
  const n = words.length;
  words.forEach((w, i) => addLesson(`${w} ${words[(i + 7) % n]} ${words[(i + 19) % n]} ${1000 + i * 37}`, t0 + 100 + i));
  const d = loadMemory().dersler;
  assert.equal(d.length, CAPACITY);
  assert.ok(d.some(x => x.text.startsWith('Petrol') && x.sayi === 3), 'kararlı ders korunmalı');
  const { stable: st, rest } = pickLessons('Brent petrol sert yükseldi, THYAO havayolu baskı altında', t0 + 1000, d);
  assert.equal(st.length, 1);
  assert.ok(rest.length <= 4, 'okuma sınırlı');
  assert.ok(!d.some(x => x.text.startsWith('altın ')), 'en eski kararsız ders kapasitede çıkmalı');
  const lines = memoryLines('donanım fiyatı rekor', []);
  assert.match(lines[0], /^ilke \(3 kez doğrulandı\): Petrol/);
  assert.ok(lines.some(l => /ders: donanım /.test(l)), 'bağlama en ilgili ders seçilmeli');
  assert.ok(lines.length <= 1 + 4);
});

test('API anahtarı: yalnızca özet saklanır, doğru anahtar üyeyi salt okunur tanır, silinince geçmez', () => {
  const u = M.createUser({ ad: 'araci', password: 'araci-guclu-sifre', rank: 'pro' });
  const tok = M.createToken(u.id, 'tooljet');
  assert.match(tok, /^rdr_[0-9a-f]{8}_[A-Za-z0-9_-]{20,}$/);
  assert.ok(!JSON.stringify(M.listTokens(u.id)).includes(tok.split('_')[2]), 'gizli kısım listede olmamalı');
  const who = M.currentUser({ headers: { authorization: `Bearer ${tok}` } });
  assert.equal(who.ad, 'araci'); assert.equal(who.readonly, true); assert.equal(who.rutbe.trade, true);
  assert.equal(M.currentUser({ headers: { authorization: `Bearer ${tok.slice(0, -2)}xx` } }), null);
  M.deleteToken(u.id, tok.split('_')[1]);
  assert.equal(M.currentUser({ headers: { authorization: `Bearer ${tok}` } }), null);
});
