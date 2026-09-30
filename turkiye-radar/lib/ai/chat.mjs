// Analizle sohbet. Model yalnızca şu verilerle cevap verir:
//  - seçilen analizin kendisi (ve eski bir analizse o anki veri özeti),
//  - radarın ŞU ANKİ gerçek veri özeti (piyasa, haber, tarayıcı, kontroller),
//  - hafıza (ölçülmüş isabet ve dersler),
//  - her soruda, sorudaki hisse/varlık/konu kelimelerine göre seçilen ek veri (hisse satırı, fiyat, haber).
// Sağlayıcıdan bağımsız çalışsın diye araç çağrısı (tool use) yerine veri soru anında seçilip eklenir.
import { complete, costUSD } from './providers.mjs';
import { readJSON, writeJSON } from '../store.mjs';
import { buildDigest, activeProvider, spentToday, spendLog, unverifiedNumbers, TAIL } from './analyze.mjs';
import { memoryLines, noteLines, addNote } from './memory.mjs';
import { toc, readNode, dateNodes, searchMemory } from './memtree.mjs';
import { webSearch, webText } from '../websearch.mjs';
import { queryOf } from '../verify.mjs';
import { loadUniverse, MARKETS } from '../../sources/bist.mjs';
import { fold } from '../rss.mjs';

export const CHAT_SYSTEM = `Sen Türkiye Radar'ın analiz asistanısın. Kullanıcı kişisel kullanım için bir analiz hakkında soru soruyor.

Kurallar:
1. Yalnızca BAĞLAM ve SORUYLA İLGİLİ VERİ bölümlerindeki bilgileri kullan. Orada olmayan rakam, tarih ya da olay uydurma. Bilmiyorsan "bu veri radarda yok" de ve hangi verinin gerektiğini söyle.
2. Her önemli iddiada kaynağını kısaca belirt: rakamsa hangi satırdan (ör. "PİYASA: USDTRY 48,94"), haberse yayıncı adı. Analizdeki görüşle şu anki veri farklıysa bunu açıkça söyle; analizin zamanını ve verinin zamanını karıştırma.
3. [TEK KAYNAK], [UYUMSUZ], [YALANLAMA?] etiketli haberlere dayanırken bunu belirt. KONTROL satırında geçmeyen veriye güvenme.
4. Kâr, korunma ya da işlem sorularında somut ol ama "garanti", "kesin" deme; her öneride riski ve fikri geçersiz kılacak koşulu yaz. Tarayıcı stratejilerinin geçmiş karnesi zayıfsa bunu hatırlat. HAFIZA'daki isabet oranlarını dikkate al.
5. Muhalif ya da iktidara yakın yayınların bakışı sorulursa, o çizgideki haberlerin olayı nasıl anlattığını aktar; taraf tutma.
6. Türkçe, sade ve kısa yaz (en fazla 8-10 cümle ya da kısa maddeler). Kullanıcı ayrıntı isterse uzat.
7. KULLANICI NOTLARI kullanıcının kendisi hakkında verdiği bilgilerdir (portföy, risk tercihi, hedef); önerileri buna göre kişiselleştir.
8. Elindeki veri soruyu cevaplamaya yetmiyorsa cevap YAZMA; yalnızca şu satırlardan en fazla 3 tane yaz ve dur:
   ARA: <web'de aranacak kısa sorgu>   (güncel olay, radarda olmayan haber ya da açıklama için)
   OKU: <hafıza düğümü>               (HAFIZA AĞACI'ndaki kimlik: 2026-H39, 2026-09-25, 2026-09 ya da A<sayı>)
   BUL: <konu kelimeleri>             (geçmiş analizlerde ve sohbetlerde konu araması; ör. "altın", "THYAO faiz")
   Sonuçlar sana verilince soruyu cevapla. WEB ARAMASI sonuçlarını kullanırken yayıncıyı ve tarihi belirt; tarihi eski ya da tek kaynaklı sonucu güncel kesin bilgi gibi sunma.`;

const f = (x, d = 2) => (x == null || !Number.isFinite(+x) ? '-' : Number(x).toLocaleString('tr-TR', { maximumFractionDigits: d }));
const pc = x => (x == null ? '-' : `${x > 0 ? '+' : ''}${f(x * 100, 1)}%`);
const when = t => new Date(t).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

// Analiz sonucunun sohbet için kısaltılmış hali (dayanak listeleri çıkarılır, yorumlar kalır).
function analysisText(a) {
  const r = a.result || {};
  const L = [`ÖZET: ${r.ozet}`];
  for (const [k, ad] of [['kotumser', 'Kötümser'], ['iyimser', 'İyimser'], ['tarafsiz', 'Tarafsız']]) if (r[k]) L.push(`${ad}${r[k].olasilik != null ? ` (%${r[k].olasilik})` : ''}: ${r[k].yorum}`);
  if (r.cerceve) L.push(`Muhalif çerçeve: ${r.cerceve.muhalif?.yorum}`, `Yandaş çerçeve: ${r.cerceve.yandas?.yorum}`);
  for (const [k, ad] of [['cozum', 'Çözüm'], ['korunma', 'Korunma'], ['firsat', 'Fırsat']]) if (r[k]?.length) L.push(`${ad}: ${r[k].join(' ; ')}`);
  if (r.eylem?.length) L.push('Eylem planı: ' + r.eylem.map(e => `${e.adim} (risk: ${e.risk})`).join(' ; '));
  if (r.varliklar?.length) L.push('Varlık beklentileri: ' + r.varliklar.map(v => `${v.kod} ${v.yon} %${v.olasilik}/${v.vade_gun}g`).join(', '));
  if (r.fikirler?.length) L.push('Fikirler: ' + r.fikirler.map(x => `${x.baslik} [${x.yon} ${x.enstruman}] geçersiz kılan: ${x.gecersiz_kilan}`).join(' ; '));
  if (r.eksik_veri?.length) L.push(`Eksik veri: ${r.eksik_veri.join(' ; ')}`);
  return L.join('\n');
}

export function buildContext(a, snap, hist = readJSON('analyses.json', [])) {
  const L = [`BAĞLAM`, `ANALİZ (${when(a.at)}, ${a.provider} · ${a.model}):`, analysisText(a)];
  // Eski bir analiz seçildiyse o anki veri de verilir: "o gün ne biliyordun?" sorusu cevaplanabilsin.
  if (hist[0] && hist[0].at !== a.at && a.provenance?.digest) L.push('', `ANALİZ ANINDAKİ VERİ ÖZETİ (${when(a.at)}):`, a.provenance.digest.replace(TAIL, ''));
  if (snap) L.push('', `ŞU ANKİ GERÇEK VERİ (${when(snap.at)}):`, buildDigest(snap).replace(TAIL, ''));
  const notes = noteLines();
  if (notes.length) L.push('', 'KULLANICI NOTLARI:', ...notes.map(x => `- ${x}`));
  const mem = memoryLines();
  if (mem.length) L.push('', 'HAFIZA:', ...mem.map(x => `- ${x}`));
  const tree = toc();
  if (tree) L.push('', tree);
  return L.join('\n');
}

// Sorudaki varlık kelimeleri → piyasa anahtarları.
const ASSET_WORDS = {
  USDTRY: ['dolar', 'usd', 'kur'], EURTRY: ['euro', 'avro', 'eur'], GRAM_ALTIN: ['altın', 'gram', 'gold'], ONS: ['ons', 'altın'],
  BRENT: ['brent', 'petrol', 'oil'], TTF: ['doğalgaz', 'gaz'], XU100: ['borsa', 'bist', 'endeks'], XBANK: ['banka'],
  VIX: ['vix', 'korku'], US10Y: ['tahvil', 'faiz'], SP500: ['s&p', 'abd borsa', 'amerika'], NASDAQ: ['nasdaq'], DAX: ['dax', 'almanya'],
  STOXX50: ['avrupa'], NIKKEI: ['nikkei', 'japonya'], SHANGHAI: ['çin', 'şanghay'], DXY: ['dolar endeksi', 'dxy'],
};
const stems = t => fold(t).split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 4).map(w => w.slice(0, 5));

export function retrieve(q, snap) {
  if (!snap) return '';
  const fq = ` ${fold(q)} `, L = [];
  // Hisseler: kod ya da şirket adı geçiyorsa tarayıcı satırı, skor gerekçeleri ve haberleri.
  const hits = [];
  for (const [m, sc] of Object.entries(snap.screeners || {})) {
    if (!sc) continue;
    const uni = new Map(loadUniverse(m).map(u => [u.kod, u]));
    for (const r of sc.rows) {
      const names = [r.kod, ...(uni.get(r.kod)?.anahtar || [])].map(x => fold(x).trim()).filter(x => x.length >= 3);
      if (names.some(n => new RegExp(`(^|[^\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').test(fq))) hits.push({ m, sc, r });
    }
  }
  for (const { m, sc, r } of hits.slice(0, 4)) {
    const s = r.scores, cat = (sc.catalysts || []).filter(t => t.etkiler.some(e => e.kod === r.kod));
    L.push(`HİSSE ${r.kod} (${r.ad}, ${MARKETS[m].ad}, karşılaştırma ${sc.bench.ad}): fiyat ${f(r.price)} | 1g ${pc(r.r1)} 1a ${pc(r.r21)} 3a ${pc(r.r63)} | RSI ${f(r.rsi, 0)} | 52h zirveye ${pc(r.dist52)} | günlük oynaklık %${f(r.atr, 1)} | hacim/20g ${f(r.volRatio)}x`);
    for (const [id, ad] of [['trend', 'Trend'], ['donus', 'Toparlanma'], ['sakin', 'Sakin'], ['gundem', 'Gündem']]) {
      if (!s[id]) continue;
      const b = sc.backtest?.presets?.[id];
      L.push(`  ${ad} skoru ${s[id].score} (${s[id].setup})${b ? ` [strateji geçmişi: endekse göre ${pc(b.excess)}, isabet %${Math.round(b.hit * 100)}]` : ''}: ${[...s[id].why, ...s[id].risk.map(x => 'risk: ' + x)].join('; ') || '-'}`);
    }
    for (const t of cat) L.push(`  Gündem: ${t.ad} ${t.yon > 0 ? 'yukarı' : 'aşağı'} (${t.neden}) → ${t.etkiler.find(e => e.kod === r.kod).neden}`);
    for (const n of r.news?.titles || []) L.push(`  Haber: ${n.title} [${n.src}]`);
  }
  // Piyasa varlıkları
  const mk = snap.markets || {};
  const keys = Object.entries(ASSET_WORDS).filter(([k, ws]) => mk[k] && ws.some(w => fq.includes(fold(w)))).map(([k]) => k);
  if (keys.length) L.push('FİYATLAR: ' + keys.map(k => { const x = mk[k]; const m1 = x.spark?.length > 1 ? x.price / x.spark[0] - 1 : null; return `${k} ${f(x.price, 4)} (gün ${x.chg > 0 ? '+' : ''}${f(x.chg)}%, ~1 ay ${pc(m1)}, normal günlük oynaklık %${f(x.vol)}${x.roll === 'şüpheli' ? ', kontrat devri: değişim güvenilmez' : ''})`; }).join(' | '));
  if (snap.crypto?.BTCTRY && /bitcoin|btc|kripto/.test(fq)) L.push(`KRİPTO: BTCTRY ${f(snap.crypto.BTCTRY.price, 0)} (${f(snap.crypto.BTCTRY.chg)}%) | USDT/TRY makası %${f(snap.usdtPremium)}`);
  // Haberler: sorudaki kelime köklerinin en çok geçtiği haberler (Türkiye ve dünya listeleri birlikte).
  const qs = [...new Set(stems(q))];
  if (qs.length) {
    const pool = [...(snap.news || []), ...(snap.world || [])];
    const seen = new Set();
    const scored = pool.filter(n => !seen.has(n.id) && seen.add(n.id)).map(n => {
      const ts = new Set(stems(`${n.title} ${n.lead || ''}`));
      return { n, s: qs.filter(w => ts.has(w)).length };
    }).filter(x => x.s >= Math.min(2, qs.length)).sort((a, b) => b.s - a.s || b.n.impact.score - a.n.impact.score).slice(0, 6);
    for (const { n } of scored) {
      const tag = n.teyit ? (n.teyit.durum === 'tek' ? ' [TEK KAYNAK]' : n.teyit.durum === 'yalanlama' ? ' [YALANLAMA?]' : ` [teyit ${n.teyit.kaynak}]`) : '';
      L.push(`HABER [${n.srcName}/${n.stance}, ${when(n.ts)}]${n.misleading ? ' [UYUMSUZ]' : ''}${tag}: ${n.title}${n.lead ? ' — ' + n.lead.slice(0, 220) : ''}`);
    }
  }
  return L.length ? `SORUYLA İLGİLİ VERİ (${when(snap.at)}):\n${L.join('\n')}` : '';
}

const chatKey = at => String(at);
export const loadChat = at => readJSON('chats.json', {})[chatKey(at)]?.turns || [];

const NOTE_CMD = /^\s*(hatırla|hatirla|not al|unutma|aklında tut)\s*[:,]?\s*/i;
// Son dakika / güncellik isteyen sorularda web araması soru anında yapılır (modelin ayrıca istemesi beklenmez).
const RECENT = /son dakika|son durum|son gelişme|bugün|şu an|şimdi|güncel|en son|az önce|bu sabah|bu akşam|açıklandı mı|açıkladı|ne oldu|ne zaman|kaç oldu|latest|today|breaking/i;
const TOOL_LINE = /^\s*(ARA|OKU|BUL)\s*:\s*(.+?)\s*$/gim;

// Uzayan sohbeti sıkıştırma (dbx'teki context compaction fikri, modelsiz): son 8 mesaj aynen gider,
// daha eskileri "soru → cevabın ilk cümlesi" satırlarına indirgenir.
export function compactHistory(turns, keep = 8) {
  const old = turns.slice(0, -keep), recent = turns.slice(-keep).map(t => ({ role: t.role, content: t.content }));
  if (!old.length) return { summary: '', recent };
  const L = [];
  for (let i = 0; i < old.length; i++) {
    if (old[i].role !== 'user') continue;
    const ans = old[i + 1]?.role === 'assistant' ? old[i + 1].content.replace(/\s+/g, ' ').split(/(?<=[.!?])\s/)[0].slice(0, 180) : '';
    L.push(`- S: ${old[i].content.slice(0, 140)}${ans ? ` → C: ${ans}` : ''}`);
  }
  return { summary: `BU SOHBETİN ÖNCEKİ KISMI (özet, ${old.length} mesaj):\n${L.slice(-15).join('\n')}`, recent };
}

export async function runTools(lines, { settings, lang = 'tr' }) {
  const out = [], used = [];
  for (const [, kind, arg] of lines.slice(0, 3)) {
    if (/^ARA$/i.test(kind)) {
      const r = await webSearch(arg, { lang, searxng: settings.searxngUrl }).catch(e => ({ q: arg, results: [], errors: [e.message] }));
      out.push(webText(r)); used.push(`web: ${arg} (${r.results.length} sonuç)`);
    } else if (/^BUL$/i.test(kind)) {
      out.push(searchMemory(arg)); used.push(`hafızada arama: ${arg}`);
    } else {
      out.push(readNode(arg).slice(0, 3500)); used.push(`hafıza: ${arg}`);
    }
  }
  return { text: out.join('\n\n'), used };
}

export async function chat(at, q, settings, { web = true } = {}) {
  q = String(q || '').trim().slice(0, 1500);
  if (!q) throw new Error('Soru boş');
  const hist = readJSON('analyses.json', []);
  const a = hist.find(x => x.at === +at) || hist[0];
  if (!a) throw new Error('Önce bir analiz gerekli');
  const chats = readJSON('chats.json', {});
  const c = (chats[chatKey(a.at)] ||= { at: a.at, turns: [] });
  const save = turn => { c.turns.push({ role: 'user', content: q, at: Date.now() }, turn); c.turns = c.turns.slice(-60); writeJSON('chats.json', chats); return turn; };
  // "hatırla: portföyümde THYAO var" → kalıcı not; model çağrılmaz.
  if (NOTE_CMD.test(q)) {
    const text = q.replace(NOTE_CMD, '');
    return save({ role: 'assistant', content: addNote(text) ? `Not kaydedildi: "${text}". Bundan sonraki analizlerde ve sohbetlerde dikkate alınacak. Hafıza panelinden silebilirsin.` : 'Not boş olduğu için kaydedilmedi.', at: Date.now(), tools: ['not'] });
  }
  const p = activeProvider(settings);
  if (!p) throw new Error('Yapay zeka sağlayıcısı tanımlı değil (yönetim paneli)');
  const spent = spentToday(spendLog());
  if (settings.aiDailyUSD > 0 && spent.usd >= settings.aiDailyUSD) throw new Error(`Günlük bütçe doldu ($${spent.usd.toFixed(3)} / $${settings.aiDailyUSD})`);
  if (settings.aiDailyTokens > 0 && spent.tokens >= settings.aiDailyTokens) throw new Error('Günlük token sınırı doldu');
  const snap = readJSON('latest.json', null);
  const { summary, recent } = compactHistory(c.turns);
  // Bağlam sistem metnine gömülür: aynı sohbet içinde değişmediği sürece sağlayıcının önbelleğinden okunur.
  const context = buildContext(a, snap, hist) + (summary ? `\n\n${summary}` : '');
  const system = `${CHAT_SYSTEM}\n\n${context}`;
  // Soru anında eklenen veri: sorudaki hisse/varlık/haber + tarih ifadelerinin hafıza düğümleri + (gerekirse) web.
  const used = [];
  const parts = [retrieve(q, snap)];
  for (const id of dateNodes(q)) { parts.push(readNode(id).slice(0, 2500)); used.push(`hafıza: ${id}`); }
  if (web && RECENT.test(q)) {
    const r = await webSearch(queryOf(q, 6), { searxng: settings.searxngUrl }).catch(() => null);
    if (r) { parts.push(webText(r)); used.push(`web: ${r.q} (${r.results.length} sonuç)`); }
  }
  const extra = parts.filter(Boolean).join('\n\n');
  const msgs = [...recent, { role: 'user', content: extra ? `${extra}\n\nSORU: ${q}` : q }];
  const opts = { ...p, maxTokens: Math.min(p.maxTokens || 6000, 2500) };
  const usage = { in: 0, out: 0, cacheRead: 0 };
  const add = u => { for (const k of Object.keys(usage)) usage[k] += u?.[k] || 0; };
  let r = await complete(opts, p.key, system, msgs);
  add(r.usage);
  let toolText = '';
  // En fazla bir araç turu: model ARA/OKU istediyse çalıştır, sonuçlarla bir kez daha sor.
  const lines = [...r.text.matchAll(TOOL_LINE)];
  if (lines.length && r.text.replace(TOOL_LINE, '').trim().length < 40) {
    const t = await runTools(lines, { settings });
    used.push(...t.used); toolText = t.text;
    msgs.push({ role: 'assistant', content: r.text.trim() }, { role: 'user', content: `ARAÇ SONUÇLARI:\n${t.text}\n\nŞimdi soruyu cevapla. Artık ARA ya da OKU yazma.` });
    r = await complete(opts, p.key, system, msgs);
    add(r.usage);
  }
  const answer = r.text.replace(TOOL_LINE, '').trim();
  return save({ role: 'assistant', content: answer, at: Date.now(), model: r.model, usage, cost: costUSD(p.model, usage), tools: used,
    unverified: unverifiedNumbers(answer, `${context}\n${extra}\n${toolText}\n${q}`), used: extra ? extra.split('\n').length - 1 : 0 });
}

export function clearChat(at) {
  const chats = readJSON('chats.json', {});
  delete chats[chatKey(at)];
  writeJSON('chats.json', chats);
}
