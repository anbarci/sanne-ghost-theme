import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.RADAR_DATA_DIR = mkdtempSync(join(tmpdir(), 'radar-d-'));
const { readJSON, writeJSON, loadSettings, saveSettings, setSecret } = await import('../lib/store.mjs');
const { debate, scoreDebates, parseRating, finalRating, pastLines, REVIEW } = await import('../lib/ai/debate.mjs');
const { debateLessons, memoryLines } = await import('../lib/ai/memory.mjs');
const { spendLog, spentToday } = await import('../lib/ai/analyze.mjs');

const snap = {
  at: Date.now(),
  markets: { XU100: { price: 10000, chg: 1 }, USDTRY: { price: 41.8, chg: 0.1 } },
  screeners: {
    tr: {
      ad: 'Türkiye', bench: { kod: 'XU100', ad: 'BIST 100' }, catalysts: [], backtest: null,
      rows: [{ kod: 'THYAO', ad: 'Türk Hava Yolları', price: 300, r1: 0.01, r21: 0.05, r63: 0.1, rsi: 62, dist52: -0.05, atr: 2.1, volRatio: 1.3,
        scores: { trend: { score: 70, setup: 'trend', why: ['50 günlük ortalamanın üstünde'], risk: [] } }, news: { titles: [{ title: 'THY yeni uçak siparişi verdi', src: 'AA' }] } }],
    },
  },
  news: [], world: [],
};

let calls = [], judgeOut = { karar: 'ARTIR', gerekce: 'Trend güçlü, RSI 62 aşırı değil.', adimlar: ['Kademeli al'], degistirir: '280 altı kapanış', vade_gun: 7, guven: 'orta' }, riskOut = { karar: 'AL', boyut: 'kucuk', zarar_kes: '280 altı', uyari: 'Petrol fiyatı' };
globalThis.fetch = async (url, opts) => {
  const b = JSON.parse(opts.body), sys = b.messages[0].content, user = b.messages.at(-1).content;
  calls.push({ sys, user, json: !!b.response_format });
  const content = /BOĞA tarafısın/.test(sys) ? 'Boğa: trend güçlü, haber olumlu.'
    : /AYI tarafısın/.test(sys) ? 'Ayı: RSI 62, 999 hedefi abartı.'
    : /hakemisin/.test(sys) ? JSON.stringify(judgeOut) : JSON.stringify(riskOut);
  return new Response(JSON.stringify({ model: 'test-model', choices: [{ message: { content } }], usage: { prompt_tokens: 500, completion_tokens: 100 } }), { headers: { 'content-type': 'application/json' } });
};

const s = loadSettings();
s.providers = [{ id: 'p1', name: 'Test', kind: 'openai', baseUrl: 'https://ai.test/v1', model: 'test-model' }];
s.activeProvider = 'p1';
setSecret(s, 'AI_KEY_p1', 'k');
saveSettings(s);

test('karar ölçeği: okunamayan karar TUT değil İNCELE; risk hakemden iyimser olamaz', () => {
  assert.equal(parseRating('artır'), 'ARTIR');
  assert.equal(parseRating('**Al**'), 'AL');
  assert.equal(parseRating('Hold'), REVIEW);
  assert.equal(parseRating(undefined), REVIEW);
  assert.equal(finalRating('ARTIR', 'AL'), 'ARTIR');
  assert.equal(finalRating('ARTIR', 'TUT'), 'TUT');
  assert.equal(finalRating('SAT', 'AL'), 'SAT');
  assert.equal(finalRating('AL', REVIEW), 'AL');
  assert.equal(finalRating(REVIEW, 'AL'), REVIEW);
});

test('tartışma: 4 çağrı sırayla, ayı boğayı görür, hakem ikisini, uydurma rakam yakalanır', async () => {
  const d = await debate('THYAO', loadSettings(), { snap, uid: 'u1' });
  assert.equal(calls.length, 4);
  assert.match(calls[0].user, /HİSSE THYAO[\s\S]*RSI 62[\s\S]*THY yeni uçak siparişi/);
  assert.match(calls[1].user, /BOĞA:\nBoğa: trend güçlü/);
  assert.match(calls[2].user, /BOĞA:[\s\S]*AYI:/);
  assert.ok(calls[2].json && calls[3].json && !calls[0].json);
  assert.match(calls[3].user, /HAKEM KARARI: ARTIR/);
  assert.equal(d.karar, 'ARTIR', 'risk daha iyimser (AL) yazdı, hakemin kararı geçerli');
  assert.equal(d.vade, 7);
  assert.equal(d.bench, 'XU100');
  assert.equal(d.benchPrice, 10000);
  assert.deepEqual(d.unverified, ['999', '280'], 'veride olmayan seviyeler de işaretlenir');
  assert.equal(d.usage.in, 2000);
  assert.equal(spentToday(spendLog()).tokens, 2400, 'tartışma günlük bütçeye sayılır');

  riskOut = { karar: 'TUT', boyut: 'yok', zarar_kes: '-', uyari: 'Seçim belirsizliği' };
  const d2 = await debate('THYAO', loadSettings(), { snap });
  assert.equal(d2.karar, 'TUT');
  assert.equal(d2.hakemKarar, 'ARTIR');
  assert.match(calls.at(-2).user, /GEÇMİŞ KARARLAR \(THYAO\):\n- .*ARTIR dedin; vadesi dolmadı/);

  judgeOut = { karar: 'bilmiyorum' };
  const d3 = await debate('THYAO', loadSettings(), { snap });
  assert.equal(d3.karar, REVIEW);
  await assert.rejects(debate('YOKBOYLE', loadSettings(), { snap }), e => /tarayıcıda yok/.test(e.message) && e.early === true);
});

test('vade dolunca endekse göre puanlama ve hafıza satırı', () => {
  // Arşivdeki vadeyi geçmişe çek; arayüz listesinden düşmüş bir karar da puanlanmalı.
  const arch = readJSON('debate-archive.json');
  assert.equal(arch.length, 3, 'her tartışma arşive girer');
  for (const d of arch) d.due = Date.now() - 1;
  writeJSON('debate-archive.json', arch);
  writeJSON('debates.json', readJSON('debates.json').slice(0, 2));
  const later = { ...snap, markets: { ...snap.markets, XU100: { price: 10500 } }, screeners: { tr: { ...snap.screeners.tr, rows: [{ ...snap.screeners.tr.rows[0], price: 330 }] } } };
  const scored = scoreDebates(later);
  const artir = scored.find(d => d.karar === 'ARTIR');
  assert.ok(Math.abs(artir.getiri - 0.1) < 1e-9 && Math.abs(artir.alfa - 0.05) < 1e-9);
  assert.equal(artir.hit, true);
  assert.ok(readJSON('debates.json').every(d => d.done), 'sonuç arayüz listesine de işlenir');
  assert.equal(scored.find(d => d.karar === 'TUT').hit, null, 'TUT yönsüz');
  assert.equal(scored.find(d => d.karar === REVIEW).hit, null);
  assert.match(pastLines('THYAO').at(-1), /ARTIR dedin; \d+ günde hisse \+10%, endekse göre \+5% \(tuttu\)/);

  assert.deepEqual(debateLessons(), [], '3 karardan az: satır yok');
  writeJSON('debate-archive.json', [...scored, ...[1, 2].map(i => ({ ...artir, id: `x${i}`, at: artir.at - i * 864e5 * 40, alfa: -0.02, hit: false }))]);
  assert.deepEqual(debateLessons(), ['Hisse tartışmalarında AL/ARTIR dediğin 3 kararın 1\'i endekse göre tuttu (ortalama alfa +0,3%)']);
  assert.ok(memoryLines('').some(x => x.startsWith('ölçüm: Hisse tartışmalarında')));
});

test('TL varlıkta nominal isabet ile dolar bazı ayrı ölçülür', async () => {
  const { statLessons } = await import('../lib/ai/memory.mjs');
  // XU100 %3 arttı ama dolar %5 arttı: nominalde "yukarı" tuttu, dolar bazında kayıp.
  const p = { done: true, kod: 'XU100', yon: 'yukari', actual: 'yukari', hit: true, p: 0.6, chgUsd: -1.9 };
  const lines = statLessons([p, { ...p }, { ...p, chgUsd: 2 }]);
  assert.ok(lines.some(x => /tutan 3 "yukari" tahmininin 2'i dolar bazında kayıptı/.test(x)), lines.join('\n'));
});

test('tartışmalar hafıza ağacında, aramada ve Obsidian notlarında', async () => {
  const { toc, readNode, searchMemory, dateNodes } = await import('../lib/ai/memtree.mjs');
  const { exportVault } = await import('../lib/obsidian.mjs');
  const arch = readJSON('debate-archive.json');
  const d = arch.find(x => x.karar === 'TUT');
  const day = new Date(d.at).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
  // Analiz hiç yokken de ağaç tartışmalardan kurulur.
  assert.match(toc(), /HAFIZA AĞACI[\s\S]*tartışma[\s\S]*THYAO TUT/);
  const node = readNode(day);
  assert.match(node, /TARTIŞMALAR \(\d\):[\s\S]*THYAO: TUT \(hakem ARTIR dedi, risk temkinliye çekti\)[\s\S]*Gerekçe: Trend güçlü/);
  assert.ok(dateNodes('bugün THYAO için ne demiştin?').includes(day));
  assert.match(readNode(`T${d.at}`), /Risk uyarısı: Seçim belirsizliği[\s\S]*Boğa: Boğa: trend güçlü/);
  assert.match(searchMemory('THYAO'), /\[T\d+\] .*tartışma THYAO: /);
  assert.match(searchMemory('seçim belirsizliği'), /tartışma THYAO: TUT/);

  const vault = mkdtempSync(join(tmpdir(), 'kasa-'));
  exportVault(vault);
  const { readFileSync } = await import('node:fs');
  const note = readFileSync(join(vault, 'wiki/radar/varliklar/THYAO.md'), 'utf8');
  assert.match(note, /type: entity[\s\S]*# THYAO · Türk Hava Yolları/);
  assert.match(note, /\| Tarih \| Karar \| Hakem \| Vade \| Sonuç \|/);
  assert.match(note, /endekse göre \+5% · tuttu/);
  assert.match(note, /Kararı değiştirir: 280 altı kapanış/);
  assert.match(readFileSync(join(vault, 'wiki/radar/Radar.md'), 'utf8'), /## Hisse tartışmaları[\s\S]*\[\[THYAO\]\]/);
  assert.match(readFileSync(join(vault, `wiki/radar/gunler/radar-${day}.md`), 'utf8'), /Tartışma: \[\[THYAO\]\] TUT/);
});
