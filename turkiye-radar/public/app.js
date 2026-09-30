import { $, esc, safeUrl, api, nf, pct, dir, ago, toast, initTheme } from './common.js';
import { createChart, CandlestickSeries, LineSeries, HistogramSeries, LineStyle, CrosshairMode } from '/vendor/lwc.mjs';

let data = null, map = null, world = null, shown = 30;
const ui = { view: 'gundem', market: 'tr', preset: 'gundem', sel: 'XU100', range: 252, showAll: false };
const filt = { cat: '', stance: '', min: 15, bad: false, q: '' };
const lastPrice = {};
const fold = s => String(s || '').toLocaleLowerCase('tr').replace(/ı/g, 'i');
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const arrow = x => (x > 0.05 ? '▲' : x < -0.05 ? '▼' : '■');
const chg = x => (x == null ? '—' : `<span class="${dir(x)}">${arrow(x)} ${pct(x)}</span>`);

const TAPE = [
  ['XU100', 'BIST 100', 0], ['USDTRY', 'Dolar/TL', 4], ['EURTRY', 'Euro/TL', 4], ['GRAM_ALTIN', 'Gram altın', 0], ['XBANK', 'BIST Banka', 0],
  ['BRENT', 'Brent $', 2], ['ONS', 'Ons altın $', 0], ['VIX', 'VIX', 2], ['DXY', 'Dolar endeksi', 2], ['TUR_ETF', 'TUR ETF $', 2],
];
const TAPE_WORLD = [
  ['SP500', 'S&P 500', 0], ['NASDAQ', 'Nasdaq', 0], ['STOXX50', 'Euro Stoxx 50', 0], ['DAX', 'DAX', 0], ['FTSE', 'FTSE 100', 0], ['NIKKEI', 'Nikkei 225', 0],
  ['SHANGHAI', 'Şanghay', 0], ['XU100', 'BIST 100', 0], ['DXY', 'Dolar endeksi', 2], ['US10Y', 'ABD 10y %', 2], ['BRENT', 'Brent $', 2], ['ONS', 'Ons altın $', 0], ['VIX', 'VIX', 2], ['EEM', 'Gelişen piy. ETF', 2],
];
const NOTE = { GRAM_ALTIN: 'Hesaplanan: ons × USD/TRY / 31,1035. Kuyumcu fiyatı farklıdır.', TUR_ETF: 'iShares MSCI Turkey ETF (USD). Yabancı iştahının vekili; CDS değildir.' };
const NAMES = Object.fromEntries([...TAPE_WORLD, ...TAPE].map(([k, n]) => [k, n]));
const STANCE_LABEL = { resmi: 'resmi', 'iktidara-yakın': 'iktidara yakın', muhalif: 'muhalif', bağımsız: 'bağımsız', 'ana-akım': 'ana akım', uluslararası: 'uluslararası', 'yabancı-devlet': 'yabancı devlet', ekonomi: 'ekonomi', dünya: 'dünya basını', toplayıcı: 'toplayıcı', doğrulama: 'doğrulama', sektör: 'sektör' };
const CH_LABEL = { geo: 'jeopolitik', energy: 'enerji', trade: 'ticaret', finance: 'finans', tourism: 'turizm', direct: 'doğrudan' };
const PRESET_LABEL = { gundem: 'Gündem', trend: 'Trend', donus: 'Toparlanma', sakin: 'Sakin yükseliş' };
const screener = () => data?.snap?.screeners?.[ui.market] || (ui.market === 'tr' ? data?.snap?.screener : null);

function spark(vals, cls = '') {
  if (!vals?.length) return '';
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const pts = vals.map((v, i) => `${((i / (vals.length - 1 || 1)) * 100).toFixed(1)},${(22 - ((v - lo) / span) * 20).toFixed(1)}`).join(' ');
  const col = vals.at(-1) >= vals[0] ? css('--up') : css('--down');
  return `<svg viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true" class="${cls}"><polyline points="${pts}" stroke="${col}"/></svg>`;
}

// Piyasa şeridi
function renderTape(s) {
  const m = s.markets || {};
  const items = (ui.view === 'dunya' ? TAPE_WORLD : TAPE).filter(([k]) => m[k]).map(([k, label, d]) => {
    const x = m[k], roll = x.roll === 'şüpheli';
    const when = x.time ? new Date(x.time).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    const lag = x.delaySec == null ? '' : x.delaySec < 90 ? 'canlı' : x.delaySec < 3600 ? `${Math.round(x.delaySec / 60)} dk` : 'kapalı';
    const title = [x.src ? `Kaynak: ${x.src}${when ? ', son işlem ' + when : ''}.` : '', x.delaySec != null ? `Gecikme: ${x.delaySec < 90 ? x.delaySec + ' sn' : Math.round(x.delaySec / 60) + ' dk'}${x.delaySec >= 3600 ? ' (piyasa kapalı olabilir)' : ''}.` : '', NOTE[k], roll ? 'Vadeli kontrat devri şüphesi: günlük değişim güvenilir değil.' : x.roll ? `Değişim ${x.roll} kontratından.` : '', x.anomaly ? `Olağandışı hareket (normal günlük oynaklık %${nf(x.vol)})` : ''].filter(Boolean).join(' ');
    const clickable = k !== 'GRAM_ALTIN';
    return `<${clickable ? 'button type="button"' : 'div'} class="tick ${clickable ? '' : 'static'} ${x.anomaly ? 'anomaly' : ''}" data-k="${k}" ${clickable ? `aria-pressed="${ui.sel === k}"` : ''} title="${esc(title)}">
      <div class="k"><span>${esc(label)}</span>${roll ? '<span class="muted">devir?</span>' : chg(x.chg)}</div><b>${nf(x.price, d)}${lag ? `<i class="lag ${lag === 'canlı' ? 'on' : ''}">${lag}</i>` : ''}</b></${clickable ? 'button' : 'div'}>`;
  });
  if (s.crypto?.BTCTRY && ui.view !== 'dunya') items.push(`<div class="tick static"><div class="k"><span>BTC/TL</span>${chg(s.crypto.BTCTRY.chg)}</div><b>${nf(s.crypto.BTCTRY.price, 0)}</b></div>`);
  if (s.usdtPremium != null && ui.view !== 'dunya') items.push(`<div class="tick static" title="USDT/TRY ile resmi kur farkı. Büyürse dövize talep baskısı var."><div class="k"><span>USDT makası</span></div><b>%${nf(s.usdtPremium)}</b></div>`);
  $('#tape').innerHTML = items.join('') || '<p class="empty">Piyasa verisi henüz yok.</p>';
  for (const el of document.querySelectorAll('.tick[data-k]')) {
    const k = el.dataset.k, p = m[k]?.price, was = lastPrice[k];
    if (was != null && p !== was) el.classList.add(p > was ? 'flash-up' : 'flash-down');
    lastPrice[k] = p;
  }
}

// Tarayıcı
function sortedRows() {
  const rows = (screener()?.rows || []).filter(r => r.scores[ui.preset] && (ui.preset !== 'gundem' || r.scores.gundem.score > 0 || r.scores.gundem.risk.length));
  return rows.sort((a, b) => b.scores[ui.preset].score - a.scores[ui.preset].score || a.scores[ui.preset].risk.length - b.scores[ui.preset].risk.length);
}

function renderScreener() {
  const sc = screener();
  document.querySelectorAll('#regions button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === ui.market)));
  $('#presets').innerHTML = Object.entries(PRESET_LABEL).map(([id, l]) => `<button type="button" data-p="${id}" aria-pressed="${ui.preset === id}">${l}</button>`).join('');
  renderCats(sc);
  if (!sc?.rows?.length) { $('#slist').innerHTML = '<li class="empty">Bu piyasanın fiyat verisi henüz yok (ilk tarama birkaç dakika sürebilir).</li>'; $('#verdict').hidden = true; $('#scr-sub').textContent = ''; return; }
  $('#scr-sub').textContent = `${sc.ad} · ${sc.rows.length} hisse · ${ago(sc.asOf)}`;
  const b = sc.backtest?.presets?.[ui.preset], live = sc.live?.[ui.preset];
  const proven = b && b.excess > 0 && b.icT >= 2;
  $('#verdict').hidden = false;
  const liveTxt = live ? `Canlı takip (14 gün): ${live.open} açık, ${live.done} sonuçlandı${live.done ? `, ${esc(sc.bench.ad)}'e göre ${pct(live.excess * 100)}, geçme oranı %${Math.round(live.beat * 100)}` : ''}` : 'Canlı takip henüz başlamadı';
  if (ui.preset === 'gundem') {
    $('#verdict').innerHTML = `<div class="inline"><span class="tag warn">Test edilmemiş</span></div>
      <div>Haber ve piyasa hareketinden kurulan neden→sonuç zincirleri. Geçmiş haber arşivi olmadığı için geriye dönük ölçülemez; kanıt ancak canlı takiple birikir.</div>
      <div class="row2 small muted"><span>${liveTxt}</span></div>`;
  } else $('#verdict').innerHTML = b ? `
    <div class="inline"><span class="tag ${proven ? 'acc' : 'warn'}">${proven ? 'Geçmişte zayıf bir üstünlük gösterdi' : 'Kanıtlanmış üstünlük yok'}</span></div>
    <div>Son bir yılda (${esc(sc.backtest.from)} → ${esc(sc.backtest.to)}) bu stratejinin ilk %20'si, ${sc.backtest.hold} işlem gününde <b>${esc(sc.bench.ad)}'e göre ${pct(b.excess * 100)}</b> getirdi; endeksi geçme oranı <b>%${Math.round(b.hit * 100)}</b>.</div>
    <div class="row2 small muted"><span>IC ${nf(b.ic, 3)} (t ${nf(b.icT, 1)})</span><span>${b.samples} ölçüm</span><span>${liveTxt}</span></div>` : '';
  const rows = sortedRows();
  const list = ui.showAll ? rows : rows.slice(0, 15);
  $('#slist').innerHTML = list.map((r, i) => {
    const s = r.scores[ui.preset];
    return `<li class="srow" role="option" data-kod="${esc(r.kod)}" aria-selected="${ui.sel === r.kod}" tabindex="0">
      <span class="rk">${i + 1}</span>
      <span class="nm"><b>${esc(r.kod)}</b>${!['İzle', 'Gündem yok'].includes(s.setup) ? `<span class="tag ${s.setup === 'Gündem aleyhine' ? 'bad' : 'acc'}">${esc(s.setup)}</span>` : ''}<span class="sub">${esc(r.ad)} · 1a ${chg(r.r21 * 100)}</span></span>
      ${spark(r.spark)}
      <span class="sc"><b>${s.score}</b><span class="meter"><i data-w="${s.score}"></i></span></span></li>`;
  }).join('') + (!rows.length ? `<li class="empty">${ui.preset === 'gundem' ? 'Şu an bu piyasada hisseye bağlanan bir gündem yok.' : 'Satır yok.'}</li>` : '') + (rows.length > 15 ? `<li><button class="btn sm more" type="button" id="scr-all">${ui.showAll ? 'İlk 15' : `Tümü (${rows.length})`}</button></li>` : '');
  // CSP satır içi style özniteliğine izin vermez; genişlik CSSOM ile verilir.
  document.querySelectorAll('.meter i[data-w]').forEach(i => { i.style.width = `${i.dataset.w}%`; });
}

// Gündem katalizörleri: tema → yön → etkilenen hisseler (tıklanınca grafikte açılır).
const yonTxt = y => (y > 0 ? '<span class="up">▲</span>' : '<span class="down">▼</span>');
function catHTML(t, compact = false) {
  const eff = t.etkiler.map(e => `<button type="button" class="chip eff" data-kod="${esc(e.kod)}" title="${esc(e.neden)}">${yonTxt(e.yon)} ${esc(e.kod)}</button>`).join('');
  const ev = compact ? '' : `<ul class="ev">${t.kanit.map(k => `<li><a href="${esc(safeUrl(k.link))}" target="_blank" rel="noopener noreferrer">${esc(k.title)}</a> <span class="muted small">${esc(k.src || '')}</span></li>`).join('')}</ul>`;
  const why = compact ? '' : `<ul class="why">${t.etkiler.map(e => `<li>${yonTxt(e.yon)} <b>${esc(e.kod)}</b>: ${esc(e.neden)}</li>`).join('')}</ul>`;
  return `<div class="cat"><div class="cat-h">${yonTxt(t.yon)} <b>${esc(t.ad)}</b><span class="small muted">${esc(t.neden)}</span><span class="num small muted" title="Güç (0-100)">${t.guc}</span></div><div class="effs">${eff}</div>${why}${ev}</div>`;
}
function renderCats(sc) {
  const list = sc?.catalysts || [];
  $('#cat-sub').textContent = sc ? `${sc.ad} · ${list.length} tema` : '';
  $('#cats').innerHTML = list.map(t => catHTML(t)).join('') || '<p class="empty">Şu an yönü belli bir gündem teması yok. Tema, ya ilgili fiyat eşiği aştığında ya da en az iki haber aynı yönü gösterdiğinde doğar.</p>';
}
function renderCatMini(s) {
  const list = s.screeners?.tr?.catalysts || [];
  $('#cat-mini').innerHTML = list.slice(0, 4).map(t => catHTML(t, true)).join('') || '<p class="empty">Şu an hisseye bağlanan belirgin bir gündem yok.</p>';
}

// Grafik
let chart = null, series = null, chartData = null;
function buildChart() {
  chart?.remove();
  const el = $('#chart');
  chart = createChart(el, {
    autoSize: true,
    layout: { background: { color: css('--surface') }, textColor: css('--muted'), fontFamily: css('--font'), fontSize: 11, attributionLogo: false, panes: { separatorColor: css('--line'), separatorHoverColor: css('--line-2') } },
    grid: { vertLines: { visible: false }, horzLines: { color: css('--line') } },
    rightPriceScale: { borderColor: css('--line') },
    timeScale: { borderColor: css('--line'), rightOffset: 3 },
    crosshair: { mode: CrosshairMode.Normal },
    localization: { locale: 'tr-TR' },
  });
  const up = css('--up'), down = css('--down');
  series = {
    candle: chart.addSeries(CandlestickSeries, { upColor: 'rgba(0,0,0,0)', downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down, priceLineVisible: false }),
    s50: chart.addSeries(LineSeries, { color: css('--ink-2'), lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }),
    s200: chart.addSeries(LineSeries, { color: css('--muted'), lineWidth: 2, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }),
    vol: chart.addSeries(HistogramSeries, { color: css('--line-2'), priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false }, 1),
    rsi: chart.addSeries(LineSeries, { color: css('--accent'), lineWidth: 2, priceLineVisible: false, lastValueVisible: true }, 2),
  };
  for (const p of [30, 70]) series.rsi.createPriceLine({ price: p, color: css('--line-2'), lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true });
  const panes = chart.panes();
  panes[1]?.setHeight(70); panes[2]?.setHeight(90);
  chart.subscribeCrosshairMove(p => legend(p?.time));
  if (chartData) fillChart();
}

function legend(time) {
  const d = chartData;
  if (!d) return;
  const i = time ? d.t.indexOf(typeof time === 'string' ? time : `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`) : d.t.length - 1;
  if (i < 0) return;
  const c = i > 0 ? (d.c[i] / d.c[i - 1] - 1) * 100 : null;
  $('#legend').innerHTML = `${esc(d.t[i])} · A ${nf(d.o[i])} Y ${nf(d.h[i])} D ${nf(d.l[i])} K ${nf(d.c[i])} ${chg(c)}<span class="leg2"><br><span class="l50">SMA50 ${nf(d.sma50[i])}</span> · <span class="l200">SMA200 ${nf(d.sma200[i])}</span> · RSI ${nf(d.rsi[i], 0)}</span>`;
}

function fillChart() {
  const d = chartData, T = d.t;
  const line = xs => xs.map((v, i) => (v == null ? { time: T[i] } : { time: T[i], value: v }));
  series.candle.setData(T.map((t, i) => ({ time: t, open: d.o[i], high: d.h[i], low: d.l[i], close: d.c[i] })));
  series.s50.setData(line(d.sma50));
  series.s200.setData(line(d.sma200));
  series.vol.setData(T.map((t, i) => ({ time: t, value: d.v[i] || 0 })));
  series.rsi.setData(line(d.rsi));
  setRange();
  legend();
}

function setRange() {
  if (!chartData || !chart) return;
  const n = chartData.t.length;
  chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - ui.range), to: n + 2 });
}

async function selectSymbol(kod) {
  ui.sel = kod;
  document.querySelectorAll('.srow').forEach(el => el.setAttribute('aria-selected', String(el.dataset.kod === kod)));
  document.querySelectorAll('.tick[data-k]').forEach(el => el.getAttribute('aria-pressed') != null && el.setAttribute('aria-pressed', String(el.dataset.k === kod)));
  const row = screener()?.rows?.find(r => r.kod === kod);
  $('#c-kod').textContent = kod;
  $('#c-ad').textContent = row?.ad || NAMES[kod] || '';
  const d = await api(`/api/chart?sym=${encodeURIComponent(kod)}`);
  if (d.error) { toast(d.error, 5000); return; }
  chartData = d;
  const last = d.c.at(-1), prev = d.c.at(-2);
  $('#c-px').textContent = nf(last, last > 100 ? 2 : last > 5 ? 3 : 4);
  $('#c-chg').innerHTML = chg(prev ? (last / prev - 1) * 100 : null);
  if (!chart) buildChart(); else fillChart();
  renderDetail(kod, row, d);
}

function renderDetail(kod, row, d) {
  if (!row) {
    const r = n => (d.c.length > n ? (d.c.at(-1) / d.c.at(-1 - n) - 1) * 100 : null);
    $('#c-detail').innerHTML = `<dl class="kv"><dt>1 ay</dt><dd>${chg(r(21))}</dd><dt>3 ay</dt><dd>${chg(r(63))}</dd><dt>1 yıl</dt><dd>${chg(r(252))}</dd><dt>RSI (14)</dt><dd>${nf(d.rsi.at(-1), 0)}</dd></dl>`;
    return;
  }
  const s = row.scores[ui.preset];
  const notes = [row.gap ? `Yahoo verisinde son ${row.gap} işlem günü eksik (değişimler bu boşluğu kapsar).` : '', row.partial ? 'Seans sürüyor: son bar kısmi, hacim oranı dünkü veriden.' : '', d.adjusted ? `Bedelsiz/bölünme düzeltmesi uygulandı: ${d.adjusted.join(', ')}` : ''].filter(Boolean);
  $('#c-detail').innerHTML = `
    <dl class="kv">
      <dt>Skor (${esc(PRESET_LABEL[ui.preset])})</dt><dd>${s.score}</dd>
      <dt>1 ay / 3 ay</dt><dd>${chg(row.r21 * 100)} / ${chg(row.r63 * 100)}</dd>
      <dt>RSI (14)</dt><dd>${nf(row.rsi, 0)}</dd>
      <dt>52 hafta zirvesine</dt><dd>%${nf(row.dist52 * 100, 1)}</dd>
      <dt>Günlük oynaklık</dt><dd>%${nf(row.atr, 1)}</dd>
      <dt>Hacim / 20g ort.</dt><dd>${nf(row.volRatio, 2)}×</dd>
    </dl>
    <div><h3>Neden bu sırada</h3><ul>${s.why.map(w => `<li>${esc(w)}</li>`).join('') || '<li class="muted">Belirgin olumlu koşul yok</li>'}</ul>
      ${s.risk.length ? `<h3 class="more">Riskler</h3><ul class="bad">${s.risk.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}</div>
    <div><h3>Güncel haberler</h3><ul>${row.news?.titles?.map(n => `<li><a href="${esc(safeUrl(n.link))}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a> <span class="muted small">${esc(n.src)}</span></li>`).join('') || '<li class="muted">Son 36 saatte anılmadı</li>'}</ul>
      ${notes.length ? `<p class="note">${notes.map(esc).join(' ')}</p>` : ''}</div>`;
}

// Yapay zeka
function renderAI(a, body = $('#ai-body'), meta = $('#ai-meta')) {
  if (!a?.result) return;
  const r = a.result;
  const view = (cls, title, v, extra = '') => `<div class="pov ${cls}"><h3><span><i class="dot"></i>${title}</span>${v.olasilik != null ? `<span class="num">%${esc(v.olasilik)}</span>` : ''}</h3><p>${esc(v.yorum)}</p><ul>${(v.dayanak || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>${extra}</div>`;
  const izle = r.tarafsiz.izle?.length ? `<p class="small muted">İzlenecekler: ${r.tarafsiz.izle.map(esc).join(' · ')}</p>` : '';
  const assets = (r.varliklar || []).map(v => `<tr><td>${esc(NAMES[v.kod] || v.kod || v.varlik || v.ad || '?')}</td><td class="${v.yon === 'yukari' ? 'up' : v.yon === 'asagi' ? 'down' : 'flat'}">${v.yon === 'yukari' ? '▲' : v.yon === 'asagi' ? '▼' : '■'} ${esc(v.yon)}</td><td class="n">${esc(v.vade_gun)}g</td><td class="n">%${esc(v.olasilik)}</td><td class="small muted">${esc(v.gerekce)}</td></tr>`).join('');
  const ideas = (r.fikirler || []).map(f => `<div class="idea"><div class="inline"><span class="tag ${esc(f.yon)}">${esc(f.yon)}</span><b>${esc(f.baslik)}</b><span class="small muted">${esc(f.enstruman)}</span></div><div>${esc(f.gerekce)}</div><div class="small muted">Risk: ${esc(f.risk)} · Geçersiz kılan: ${esc(f.gecersiz_kilan)}</div></div>`).join('');
  const eksik = r.eksik_veri?.length ? `<p class="small muted">Eksik veri: ${r.eksik_veri.map(esc).join(' · ')}</p>` : '';
  const list = xs => `<ul>${xs.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
  const frame = r.cerceve ? `<h3 class="more">Yayın çizgilerine göre</h3><div class="povs two">${view('opp', 'Muhalif basın', r.cerceve.muhalif)}${view('gov', 'İktidara yakın basın', r.cerceve.yandas)}</div>` : '';
  const acts = [['Çözüm', r.cozum], ['Nasıl daha az etkilenirim', r.korunma], ['Kim kazançlı çıkar', r.firsat]].filter(([, xs]) => xs?.length).map(([t, xs]) => `<div class="card"><h3>${t}</h3>${list(xs)}</div>`).join('')
    + (r.eylem?.length ? `<div class="card"><h3>Ne yaparsam kârlı çıkarım</h3><ol>${r.eylem.map(e => `<li><b>${esc(e.adim)}</b><div class="small">${esc(e.neden)}</div><div class="small muted">Risk: ${esc(e.risk)}</div></li>`).join('')}</ol></div>` : '');
  const ders = r.ders ? `<p class="small muted">Bu analizde kendi hatalarından çıkardığı ders: ${esc(r.ders)}</p>` : '';
  const bad = r.dogrulanamayan?.length ? `<p class="alert">Veri özetinde bulunamayan rakamlar: ${r.dogrulanamayan.map(esc).join(', ')}. Bu rakamlara güvenmeyin.</p>` : '';
  body.innerHTML = `
    <p class="lead-sum">${esc(r.ozet)}</p>
    <div class="povs">${view('bear', 'Kötümser', r.kotumser)}${view('bull', 'İyimser', r.iyimser)}${view('base', 'Tarafsız', r.tarafsiz, izle)}</div>
    ${frame}
    ${acts ? `<div class="cards">${acts}</div>` : ''}
    ${bad}${eksik}${ders}
    <div class="subgrid">
      <div><h3>Varlık beklentileri</h3><div class="scroll-x"><table><thead><tr><th>Varlık</th><th>Yön</th><th class="n">Vade</th><th class="n">Olas.</th><th>Neden</th></tr></thead><tbody>${assets}</tbody></table></div></div>
      <div><h3>Fikirler (kişisel)</h3><div class="ideas">${ideas || '<p class="empty">Fikir yok.</p>'}</div></div>
    </div>
    <p class="note">Model çıktısıdır, yatırım tavsiyesi değildir. Güven: ${esc(r.guven)}. Beklentiler karnede gerçek fiyatlarla puanlanır.</p>`;
  const cost = a.cost != null ? ` · $${a.cost.toFixed(4)}` : '';
  meta.textContent = `${a.provider} · ${a.model} · ${ago(a.at)} · ${a.usage.in + (a.usage.cacheRead || 0)}→${a.usage.out} token${cost}`;
}

// Sohbet: seçili analiz hakkında soru sor; cevaplar radarın gerçek verisine dayanır.
const SUGGEST = ['Bu durumda dolar/TL için ne yapmalıyım?', 'Hangi hisseler bu gelişmeden fayda görür?', 'Muhalif ve yandaş basın bu konuyu nasıl anlatıyor?', 'Analizden bu yana veriler ne değişti?', 'En büyük risk ne, nasıl korunurum?'];
const md = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
function turnHTML(t) {
  if (t.role === 'user') return `<div class="msg me">${esc(t.content)}</div>`;
  const warn = t.unverified?.length ? `<div class="warn">Verilerde bulunamayan rakamlar: ${t.unverified.map(esc).join(', ')}</div>` : '';
  const meta = [t.model, t.used ? `${t.used} satır ek veri` : '', ...(t.tools || []), t.cost != null ? `$${t.cost.toFixed(4)}` : ''].filter(Boolean).join(' · ');
  return `<div class="msg ai">${md(t.content)}${warn}<div class="small muted">${esc(meta)}</div></div>`;
}
async function mountChat(el, at) {
  el.innerHTML = `<h3 class="more">Analizle sohbet</h3>
    <div class="chips sugg">${SUGGEST.map(q => `<button type="button" class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    <div class="msgs" aria-live="polite"></div>
    <form class="ask"><textarea rows="2" maxlength="1500" placeholder="Soru sor (Enter gönderir, Shift+Enter yeni satır)" aria-label="Soru"></textarea><div class="inline"><button class="btn primary" type="submit">Sor</button><label class="inline small"><input type="checkbox" data-web checked> web'de ara</label><button class="btn ghost sm" type="button" data-clear>Sohbeti temizle</button></div></form>
    <p class="note">Cevaplar bu analize, radarın şu anki verisine, hafızaya ve gerekirse web aramasına (Google News, tanımlıysa SearXNG) dayanır. "hatırla: ..." ile başlayan mesaj kalıcı not olarak kaydedilir. Günlük bütçeye sayılır.</p>`;
  const box = el.querySelector('.msgs'), ta = el.querySelector('textarea'), btn = el.querySelector('[type=submit]');
  const show = turns => { box.innerHTML = turns.map(turnHTML).join(''); box.scrollTop = box.scrollHeight; };
  const { turns = [] } = await api(`/api/chat?at=${at || ''}`).catch(() => ({}));
  show(turns);
  const ask = async q => {
    q = q.trim(); if (!q || btn.disabled) return;
    btn.disabled = true; ta.value = '';
    box.insertAdjacentHTML('beforeend', `${turnHTML({ role: 'user', content: q })}<div class="msg ai muted">düşünüyor…</div>`); box.scrollTop = box.scrollHeight;
    try {
      const r = await api('/api/chat', { at, q, web: el.querySelector('[data-web]').checked });
      if (r.error) { toast(r.error, 6000); box.lastElementChild.textContent = r.error; }
      else { box.lastElementChild.outerHTML = turnHTML(r); box.scrollTop = box.scrollHeight; if (r.tools?.includes('not') && $('#mem')) renderMemory(); }
    } catch (e) { toast(e.message, 6000); } finally { btn.disabled = false; }
  };
  el.querySelector('form').addEventListener('submit', e => { e.preventDefault(); ask(ta.value); });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(ta.value); } });
  el.querySelector('.sugg').addEventListener('click', e => { const c = e.target.closest('[data-q]'); if (c) ask(c.dataset.q); });
  el.querySelector('[data-clear]').addEventListener('click', async () => { await api('/api/chat/clear', { at }); show([]); });
}

// Haberler
function renderNews(s) {
  const news = s.news || [];
  const cats = ['', ...new Set(news.map(n => n.cat).filter(Boolean))];
  $('#cat-filters').innerHTML = cats.map(c => `<button class="chip" type="button" data-cat="${esc(c)}" aria-pressed="${filt.cat === c}">${esc(c || 'tümü')}</button>`).join('');
  const stances = [...new Set(news.map(n => n.stance).filter(Boolean))];
  $('#stance').innerHTML = '<option value="">Tüm yayın çizgileri</option>' + stances.map(x => `<option value="${esc(x)}" ${filt.stance === x ? 'selected' : ''}>${esc(STANCE_LABEL[x] || x)}</option>`).join('');
  const q = fold(filt.q);
  const list = news.filter(n => (!filt.cat || n.cat === filt.cat) && (!filt.stance || n.stance === filt.stance) && n.impact.score >= filt.min && (!filt.bad || n.misleading) && (!q || fold(n.title + ' ' + (n.lead || '') + ' ' + n.srcName).includes(q)));
  $('#news-count').textContent = `${list.length} / ${news.length}`;
  $('#news').innerHTML = list.slice(0, shown).map(n => newsItem(n)).join('') || '<li class="empty">Filtreye uyan haber yok.</li>';
  $('#news-more').hidden = list.length <= shown;
}

// Çapraz teyit rozeti: kaç başka yayıncı verdi, yalanlama var mı (üzerine gelince örnekler).
const TEYIT = { yaygın: ['acc', 'yaygın'], birkaç: ['', 'birkaç kaynak'], az: ['', '1 kaynak daha'], tek: ['warn', 'tek kaynak'], yalanlama: ['bad', 'yalanlama başlığı'] };
function teyitTag(n) {
  const t = n.teyit;
  if (!t || (t.durum === 'tek' && n.also)) return '';
  const [cls, label] = TEYIT[t.durum] || ['', t.durum];
  const tip = [...(t.yalanlama || []).map(x => `Yalanlama: ${x.title} (${x.src})`), ...(t.ornek || []).map(x => `${x.src}: ${x.title}`)].join('\n') || `Google News'te benzer haber bulunamadı (sorgu: ${t.q})`;
  return `<span class="tag ${cls}" title="${esc(tip)}">${t.kaynak >= 2 && t.durum !== 'yalanlama' ? '✓ ' : ''}${esc(label)}${t.kaynak > 1 ? ` ${t.kaynak}` : ''}</span>`;
}

function newsItem(n, key = 'score') {
  const sc = n.impact[key] ?? 0;
  const ch = n.impact.channels.slice(0, 3).map(c => `<span class="tag">${CH_LABEL[c] || c}</span>`).join(' ');
  const warn = n.misleading ? `<div class="warn">Başlık içerikle zayıf örtüşüyor (uyum %${n.check?.score ?? '?'}${n.check?.numMiss ? `, başlıktaki ${n.check.numMiss} rakam metinde yok` : ''}).</div>` : '';
  return `<li><div class="score ${sc >= 60 ? 'hi' : ''}" title="${key === 'world' ? 'Küresel etki skoru' : 'Türkiye Etki Skoru'}">${sc}</div><div>
    <h3><a href="${esc(safeUrl(n.link))}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a></h3>
    <div class="src"><span>${esc(n.srcName)}</span>${teyitTag(n)}<span class="tag">${esc(STANCE_LABEL[n.stance] || n.stance || '')}</span>${n.also ? `<span class="tag acc">+${n.also} kaynak</span>` : ''}${ch}<span>${ago(n.ts)}</span>${key === 'world' && n.impact.score ? `<span class="small">TR etkisi ${n.impact.score}</span>` : ''}</div>
    ${n.lead ? `<p class="lead">${esc(n.lead)}</p>` : ''}${warn}</div></li>`;
}

async function renderMap(s) {
  if (!map) map = await fetch('/map.json').then(r => r.json()).catch(() => null);
  if (!map) return;
  const V = map.view;
  const P = (lat, lon) => [((lon - V.lon0) / (V.lon1 - V.lon0)) * V.w, ((V.lat1 - lat) / (V.lat1 - V.lat0)) * V.h];
  const inside = (lat, lon) => lat > V.lat0 && lat < V.lat1 && lon > V.lon0 && lon < V.lon1;
  let g = map.countries.map(c => `<path class="${c.tr ? 'tr' : ''}" d="${c.d}"><title>${esc(c.name)}</title></path>`).join('');
  for (const f of s.fires?.clusters || []) if (inside(f.lat, f.lon)) { const [x, y] = P(f.lat, f.lon); g += `<circle class="f" cx="${x}" cy="${y}" r="${Math.min(6, 2 + Math.log10(f.frp + 1))}"><title>Yangın, FRP ${Math.round(f.frp)}</title></circle>`; }
  for (const q of s.quakes?.local || []) if (inside(q.lat, q.lon)) { const [x, y] = P(q.lat, q.lon); g += `<circle class="q" cx="${x}" cy="${y}" r="${Math.max(2.5, (q.mag - 1.5) * 3.2)}"><title>M${q.mag} ${esc(q.place)} (${esc(q.src)})</title></circle>`; }
  const hot = {};
  for (const n of (s.news || []).slice(0, 80)) if (n.impact.place) { const k = n.impact.place.join(); (hot[k] ||= { p: n.impact.place, n: 0, t: n.title }).n++; }
  for (const h of Object.values(hot)) if (inside(...h.p)) { const [x, y] = P(...h.p); g += `<rect class="n" x="${x - 5}" y="${y - 5}" width="10" height="10" transform="rotate(45 ${x} ${y})"><title>${h.n} haber: ${esc(h.t)}</title></rect>`; }
  const svg = $('#map');
  svg.setAttribute('viewBox', `0 0 ${V.w} ${V.h}`);
  svg.innerHTML = g;
}

// Dünya görünümü
const WORLD_VB = { x: 0, y: 12, w: 360, h: 138 }; // enlem 78K ile 60G arası (Antarktika yok)
async function renderWorld(s) {
  if (!world) world = await fetch('/world.json').then(r => r.json()).catch(() => null);
  const P = (lat, lon) => [lon + 180, 90 - lat];
  let g = world ? `<path class="land" d="${world.d}"/>` : '';
  for (const q of (s.quakes?.world || []).filter(q => q.mag >= 5)) { const [x, y] = P(q.lat, q.lon); g += `<circle class="q" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${Math.max(1.2, (q.mag - 4) * 1.1).toFixed(1)}"><title>M${q.mag} ${esc(q.place)}</title></circle>`; }
  const hot = {};
  for (const n of s.world || []) if (n.impact.wplace) { const k = n.impact.wplace.join(); (hot[k] ||= { p: n.impact.wplace, n: 0, t: n.title }).n++; }
  for (const h of Object.values(hot)) { const [x, y] = P(...h.p); const r = Math.min(3.4, 1.4 + h.n * 0.4); g += `<rect class="n" x="${(x - r).toFixed(1)}" y="${(y - r).toFixed(1)}" width="${(2 * r).toFixed(1)}" height="${(2 * r).toFixed(1)}" transform="rotate(45 ${x.toFixed(1)} ${y.toFixed(1)})"><title>${h.n} haber: ${esc(h.t)}</title></rect>`; }
  const [tx, ty] = P(39, 35);
  g += `<circle class="trc" cx="${tx}" cy="${ty}" r="3.2"><title>Türkiye</title></circle><circle class="trc-ring" cx="${tx}" cy="${ty}" r="7"/>`;
  const svg = $('#wmap');
  svg.setAttribute('viewBox', `${WORLD_VB.x} ${WORLD_VB.y} ${WORLD_VB.w} ${WORLD_VB.h}`);
  svg.innerHTML = g;

  const m = s.markets || {};
  $('#wmk').innerHTML = `<thead><tr><th>Piyasa</th><th class="n">Son</th><th class="n">Gün</th><th class="n">Oynaklık</th></tr></thead><tbody>${TAPE_WORLD.filter(([k]) => m[k]).map(([k, l, d]) => `<tr><td><button type="button" class="linkbtn" data-open="${k}">${esc(l)}</button></td><td class="n">${nf(m[k].price, d)}</td><td class="n">${chg(m[k].chg)}</td><td class="n muted">%${nf(m[k].vol, 1)}</td></tr>`).join('')}</tbody>`;
  const wn = s.world || [];
  $('#wnews-count').textContent = `${wn.length} haber`;
  $('#wnews').innerHTML = wn.slice(0, 40).map(n => newsItem(n, 'world')).join('') || '<li class="empty">Dünya haberi yok.</li>';
  $('#wcats').innerHTML = ['us', 'eu'].map(k => s.screeners?.[k]).filter(Boolean).map(sc => `<h3>${esc(sc.ad)}</h3>${(sc.catalysts || []).map(t => catHTML(t, true)).join('') || '<p class="empty">Belirgin tema yok.</p>'}`).join('') || '<p class="empty">ABD/Avrupa verisi henüz yok.</p>';
}

// Analiz geçmişi
const fmtDT = t => new Date(t).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const GUVEN = { dusuk: 'düşük', orta: 'orta', yuksek: 'yüksek' };
async function renderHistory(at) {
  renderMemory();
  const list = await api('/api/analyses');
  $('#alist-sub').textContent = `${list.length} kayıt`;
  const cur = at || list[0]?.at;
  $('#alist').innerHTML = list.map(a => `<li><a href="#analiz/${a.at}" aria-current="${a.at === cur ? 'true' : 'false'}">
    <span class="a-h"><b>${esc(fmtDT(a.at))}</b><span class="small muted">${esc(a.provider)} · güven ${esc(GUVEN[a.guven] || a.guven || '—')}</span></span>
    <span class="a-o">${esc(a.ozet || '')}</span>
    <span class="small muted">kötümser %${esc(a.kotumser ?? '—')} · iyimser %${esc(a.iyimser ?? '—')}${a.cost != null ? ` · $${a.cost.toFixed(4)}` : ''}</span></a></li>`).join('') || '<li class="empty">Henüz analiz yok.</li>';
  if (!cur) return;
  const a = await api(`/api/analysis?at=${cur}`);
  renderAI(a, $('#adet'), $('#adet-meta'));
  const pv = a.provenance;
  if (pv) $('#adet').insertAdjacentHTML('beforeend', `<h3 class="more">Bu analiz neye dayandı</h3>
    <ol class="prov">${pv.haberler.map(n => `<li><a href="${esc(safeUrl(n.link))}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a> <span class="small muted">${esc(n.src)} · etki ${esc(n.etki ?? '—')}${n.teyit ? ` · teyit: ${esc(n.teyit)}` : ''}${n.uyumsuz ? ' · başlık uyumsuz' : ''}</span></li>`).join('')}</ol>
    ${pv.kontroller.length ? `<p class="small err">Geçmeyen veri kontrolleri: ${pv.kontroller.map(esc).join(' ; ')}</p>` : ''}
    <details class="digest"><summary class="small">Modele giden veri özetinin tamamı (${pv.digest.length} karakter)</summary><pre>${esc(pv.digest)}</pre></details>`);
  $('#adet').insertAdjacentHTML('beforeend', '<div id="chat-a"></div>');
  mountChat($('#chat-a'), a.at);
  const preds = a.predictions || [];
  if (preds.length) $('#adet').insertAdjacentHTML('beforeend', `<h3 class="more">Tahminlerin sonucu</h3><div class="scroll-x"><table><thead><tr><th>Varlık</th><th>Tahmin</th><th class="n">Olas.</th><th>Vade</th><th>Sonuç</th></tr></thead><tbody>${preds.map(p => `<tr><td>${esc(p.kod)}</td><td>${esc(p.yon)}</td><td class="n">%${Math.round(p.p * 100)}</td><td class="small">${esc(fmtDT(p.due))}</td><td>${p.done ? `<span class="${p.hit ? 'ok' : 'err'}">${p.hit ? 'tuttu' : 'tutmadı'}</span> <span class="small muted">${pct(p.chg)}</span>` : '<span class="muted">bekliyor</span>'}</td></tr>`).join('')}</tbody></table></div>`);
}

// Hafıza: ölçülmüş isabet (fiyatlardan) ve modelin kendi dersleri; yanlış bulduğun dersi silebilirsin.
async function renderMemory() {
  const m = await api('/api/memory').catch(() => null);
  if (!m) return;
  $('#mem').innerHTML = `<h3>Senin notların</h3>
    <form class="note-add inline"><input type="text" maxlength="300" placeholder="ör. Portföyümde THYAO ve altın var, riskten kaçınırım" aria-label="Not" class="grow"><button class="btn sm" type="submit">Ekle</button></form>
    ${m.notlar.length ? `<ul class="list small">${m.notlar.map(n => `<li><span>${esc(n.text)}</span><button type="button" class="btn ghost sm" data-delnote="${n.at}" aria-label="Notu sil">sil</button></li>`).join('')}</ul>` : '<p class="empty">Not yok. Sohbette "hatırla: ..." yazarak da ekleyebilirsin.</p>'}
    <h3 class="more">Ölçülmüş isabet</h3>
    ${m.olcum.length ? `<ul class="list small">${m.olcum.map(x => `<li><span>${esc(x)}</span></li>`).join('')}</ul>` : '<p class="empty">Ölçüm için en az 3 sonuçlanmış tahmin gerekiyor.</p>'}
    <h3 class="more">Kendi çıkardığı dersler</h3>
    ${m.dersler.length ? `<ul class="list small">${m.dersler.map(d => `<li><span>${esc(d.text)} <span class="muted">${esc(fmtDT(d.at))}</span></span><button type="button" class="btn ghost sm" data-del="${d.at}" aria-label="Dersi sil">sil</button></li>`).join('')}</ul>` : '<p class="empty">Henüz ders yok.</p>'}
    <details class="digest"><summary class="small">Hafıza ağacı (${m.arsiv} analiz arşivde)</summary><pre>${esc(m.agac || 'Arşiv boş.')}</pre></details>`;
}

const CCY_TR = { USD: 'ABD', EUR: 'Euro', CNY: 'Çin', GBP: 'İngiltere', JPY: 'Japonya' };
function renderSide(s) {
  const q = s.quakes;
  $('#eq-src').textContent = q?.status ? Object.entries(q.status).map(([k, v]) => `${k} ${typeof v === 'number' ? v : '✕'}`).join(' · ') : '';
  $('#eq').innerHTML = (q?.local || []).filter(e => e.mag >= 2.5).slice(0, 10).map(e => `<li><span><b class="num ${e.mag >= 4.5 ? 'down' : ''}">M${nf(e.mag, 1)}</b> ${esc(e.place)}</span><span class="small muted">${ago(e.t)}</span></li>`).join('') || '<li class="empty">Kayda değer deprem yok.</li>';
  const fmt = new Intl.DateTimeFormat('tr-TR', { weekday: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
  $('#cal').innerHTML = (s.calendar || []).filter(e => e.t > Date.now() - 6 * 3600e3).slice(0, 10).map(e => `<li><span><span class="tag ${e.impact === 'High' ? 'acc' : ''}">${esc(CCY_TR[e.ccy] || e.ccy)}</span> ${esc(e.title)}${e.forecast || e.previous ? `<span class="small muted"> · bekl. ${esc(e.forecast || '—')} / önc. ${esc(e.previous || '—')}</span>` : ''}</span><span class="small muted num">${esc(fmt.format(e.t))}</span></li>`).join('') || '<li class="empty">Takvim alınamadı.</li>';

  const rows = [];
  const EV = { 'TP.DK.USD.A.YTL': 'TCMB USD alış', 'TP.DK.EUR.A.YTL': 'TCMB EUR alış', 'TP.FG.J0': 'TÜFE endeksi' };
  for (const [k, v] of Object.entries(s.evds || {})) rows.push([`${EV[k] || k}${v.yoy != null ? ' (yıllık %' + nf(v.yoy) + ')' : ''}`, nf(v.value)]);
  if (s.tcmb?.rates?.USD) rows.push([`TCMB USD satış (${s.tcmb.date})`, nf(s.tcmb.rates.USD.sell, 4)]);
  if (s.ecb?.EURTRY) rows.push([`ECB EUR/TRY (${s.ecb.EURTRY.date})`, nf(s.ecb.EURTRY.value, 4)]);
  const imf = s.macro?.imf || {}, wb = s.macro?.worldBank || {}, y = new Date().getFullYear();
  if (imf.enflasyon) rows.push([`IMF enflasyon ${y}/${y + 1}`, `${nf(imf.enflasyon[y], 1)} / ${nf(imf.enflasyon[y + 1], 1)}`]);
  if (imf.buyume) rows.push([`IMF büyüme ${y}/${y + 1}`, `${nf(imf.buyume[y], 1)} / ${nf(imf.buyume[y + 1], 1)}`]);
  if (imf.cariDenge_GSYH) rows.push([`IMF cari denge/GSYH ${y}`, nf(imf.cariDenge_GSYH[y], 1)]);
  if (wb.issizlik) rows.push([`İşsizlik (DB ${wb.issizlik.year})`, nf(wb.issizlik.value, 1)]);
  const F = { fedFaiz: 'Fed faizi', abd10y: 'ABD 10 yıllık', yuksekGetiriSpread: 'Yüksek getiri spreadi', abdEnflasyonBeklenti5y: 'ABD 5y enflasyon beklentisi' };
  for (const [k, v] of Object.entries(s.fred || {})) if (F[k]) rows.push([F[k], nf(v.value)]);
  if (s.epias?.avg) rows.push([`Elektrik PTF ort. ${s.epias.day}`, `${nf(s.epias.avg, 0)} TL`]);
  if (s.tone?.length) rows.push(['Dünya basını TR tonu (GDELT)', nf(s.tone.at(-1)[1])]);
  $('#macro').innerHTML = rows.length ? `<dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : '<p class="empty">Veri yok.</p>';

  $('#wx').innerHTML = (s.weather || []).map(w => `<li><span>${esc(w.city)} ${w.warn ? `<span class="tag warn">${esc(w.warn.trim())}</span>` : ''}</span><span class="num">${nf(w.temp, 0)}° · ${nf(w.wind, 0)} km/s</span></li>`).join('') || '<li class="empty">—</li>';
  const rg = s.resmiGazete;
  $('#rg-link').href = safeUrl(rg?.url || 'https://www.resmigazete.gov.tr/');
  $('#rg').innerHTML = (rg?.items || []).slice(0, 8).map(i => `<li><span><a href="${esc(safeUrl(i.link))}" target="_blank" rel="noopener noreferrer">${esc(i.title)}</a></span></li>`).join('') || '<li class="empty">Bugünkü sayı alınamadı.</li>';
  const ck = s.checks || [];
  $('#chk-sub').textContent = ck.length ? `${ck.filter(c => c.ok).length}/${ck.length} geçti` : '';
  $('#checks').innerHTML = ck.map(c => `<li><span><span class="${c.ok ? 'ok' : 'err'}">${c.ok ? '✓' : '✕'}</span> ${esc(c.ad)}<span class="small muted"> · ${esc(c.detay)}</span></span></li>`).join('') || '<li class="empty">Henüz kontrol yok.</li>';
  $('#srcs').innerHTML = (s.sources || []).map(x => `<li><span>${esc(x.name)}</span><span class="${x.ok ? 'ok' : x.missing?.length || !x.enabled ? 'muted' : 'err'}">${!x.enabled ? 'kapalı' : x.missing?.length ? 'anahtar yok' : x.ok ? ago(x.at) : 'hata'}</span></li>`).join('');
}

function renderScore(sc) {
  if (!sc) return;
  const rows = sc.models.map(m => `<tr><td>${esc(m.model)}</td><td class="n">${esc(m.n)}</td><td class="n">%${esc(m.isabet)}</td><td class="n">${esc(m.brier)}</td></tr>`).join('');
  const live = data?.snap?.screener?.live || {};
  const lrows = Object.entries(live).map(([id, o]) => `<tr><td>${esc(PRESET_LABEL[id] || id)}</td><td class="n">${o.done}/${o.done + o.open}</td><td class="n">${o.beat != null ? '%' + Math.round(o.beat * 100) : '—'}</td><td class="n">${o.excess != null ? pct(o.excess * 100) : '—'}</td></tr>`).join('');
  $('#score').innerHTML = `<p class="small muted">AI tahminleri: ${sc.done} sonuçlandı, ${sc.open} açık. Brier 0'a yakınsa iyi; 0,25 yazı-tura.</p>
    ${rows ? `<div class="scroll-x"><table><thead><tr><th>Model</th><th class="n">n</th><th class="n">İsabet</th><th class="n">Brier</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}
    ${lrows ? `<h3 class="more">Türkiye tarayıcısı canlı takip (14 gün, BIST 100'e göre)</h3><div class="scroll-x"><table><thead><tr><th>Strateji</th><th class="n">Sonuç</th><th class="n">Geçti</th><th class="n">Fark</th></tr></thead><tbody>${lrows}</tbody></table></div>` : ''}`;
}

function renderStatus(st) {
  const busy = st?.sweeping || st?.analyzing;
  $('#pulse').className = 'pulse ' + (busy ? 'busy' : 'live');
  $('#btn-sweep').disabled = !!st?.sweeping;
  $('#btn-ai').disabled = !!st?.analyzing;
  if (busy) $('#stamp').textContent = st.sweeping ? 'taranıyor…' : 'analiz ediliyor…';
  else if (data?.snap) $('#stamp').textContent = `güncellendi ${ago(data.snap.at)}${st?.lastAnalysisNote ? ' · ' + st.lastAnalysisNote : ''}`;
}

// Görünümler: adres çubuğundaki #gundem / #trade / #dunya / #analizler / #analiz/<zaman>.
function route() {
  const h = location.hash.slice(1);
  const [v, arg] = h.split('/');
  ui.view = v === 'analiz' ? 'analizler' : ['gundem', 'trade', 'dunya', 'analizler'].includes(v) ? v : 'gundem';
  document.querySelectorAll('.view').forEach(el => { el.hidden = el.dataset.view !== ui.view; });
  document.querySelectorAll('.tabs a').forEach(a => a.setAttribute('aria-current', a.dataset.v === ui.view ? 'page' : 'false'));
  render(v === 'analiz' ? +arg : null);
}

function render(at) {
  if (ui.view === 'analizler') { renderHistory(at).catch(e => toast(e.message)); return; }
  if (!data?.snap) return;
  renderTape(data.snap);
  if (ui.view === 'gundem') {
    if (data.analysis?.at && $('#chat-g').dataset.at !== String(data.analysis.at)) { $('#chat-g').dataset.at = data.analysis.at; mountChat($('#chat-g'), data.analysis.at); }
    renderNews(data.snap); renderSide(data.snap); renderAI(data.analysis); renderScore(data.score); renderMap(data.snap); renderCatMini(data.snap); }
  else if (ui.view === 'trade') { renderScreener(); if (!chartData || !chart) selectSymbol(ui.sel); }
  else if (ui.view === 'dunya') renderWorld(data.snap);
}

async function load() {
  data = await api('/api/data');
  if (!data.snap) { $('#stamp').textContent = 'ilk tarama sürüyor…'; return; }
  renderStatus(data.status);
  render();
}

// Olaylar
$('#tape').addEventListener('click', e => { const b = e.target.closest('button.tick'); if (!b) return; if (ui.view !== 'trade') location.hash = '#trade'; selectSymbol(b.dataset.k); });
$('#presets').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (!b) return; ui.preset = b.dataset.p; renderScreener(); const row = screener()?.rows?.find(r => r.kod === ui.sel); if (row && chartData) renderDetail(ui.sel, row, chartData); });
$('#regions').addEventListener('click', e => {
  const b = e.target.closest('[data-m]'); if (!b || b.dataset.m === ui.market) return;
  ui.market = b.dataset.m; ui.showAll = false; renderScreener();
  const sc = screener(); selectSymbol(sortedRows()[0]?.kod || sc?.bench?.kod || 'XU100');
});
// Gündem kartlarındaki hisse çipleri: Trade görünümünde ilgili piyasada açar.
document.addEventListener('click', e => {
  const c = e.target.closest('.chip.eff, [data-open]'); if (!c) return;
  const kod = c.dataset.kod || c.dataset.open;
  const m = Object.entries(data?.snap?.screeners || {}).find(([, sc]) => sc?.rows?.some(r => r.kod === kod))?.[0];
  if (m) ui.market = m;
  if (ui.view !== 'trade') location.hash = '#trade';
  else renderScreener();
  selectSymbol(kod);
});
window.addEventListener('hashchange', route);
$('#mem').addEventListener('click', async e => {
  const b = e.target.closest('[data-del], [data-delnote]'); if (!b) return;
  if (b.dataset.del) await api('/api/memory/delete', { at: +b.dataset.del }); else await api('/api/memory/note/delete', { at: +b.dataset.delnote });
  renderMemory();
});
$('#mem').addEventListener('submit', async e => { e.preventDefault(); const i = e.target.querySelector('input'); if (i.value.trim()) { await api('/api/memory/note', { text: i.value }); renderMemory(); } });
$('#slist').addEventListener('click', e => {
  if (e.target.closest('#scr-all')) { ui.showAll = !ui.showAll; renderScreener(); return; }
  const r = e.target.closest('.srow'); if (r) { selectSymbol(r.dataset.kod); if (matchMedia('(max-width: 1100px)').matches) $('#grafik').scrollIntoView({ behavior: 'smooth' }); }
});
$('#slist').addEventListener('keydown', e => { const r = e.target.closest('.srow'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectSymbol(r.dataset.kod); } });
$('#ranges').addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (!b) return; ui.range = +b.dataset.r; document.querySelectorAll('#ranges button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); setRange(); });
$('#cat-filters').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (!b) return; filt.cat = b.dataset.cat; shown = 30; renderNews(data.snap); });
$('#stance').addEventListener('change', e => { filt.stance = e.target.value; shown = 30; renderNews(data.snap); });
$('#minimp').addEventListener('input', e => { filt.min = +e.target.value; $('#minimp-v').textContent = e.target.value; renderNews(data.snap); });
$('#only-bad').addEventListener('change', e => { filt.bad = e.target.checked; renderNews(data.snap); });
let qTimer;
$('#q').addEventListener('input', e => { clearTimeout(qTimer); qTimer = setTimeout(() => { filt.q = e.target.value; shown = 30; renderNews(data.snap); }, 150); });
$('#news-more').addEventListener('click', () => { shown += 30; renderNews(data.snap); });
$('#btn-sweep').addEventListener('click', async () => { await api('/api/sweep', {}); toast('Tarama başladı'); });
$('#btn-ai').addEventListener('click', async () => {
  $('#btn-ai').disabled = true;
  try { const r = await api('/api/analyze', {}); if (r.error || r.skipped) toast(r.error || r.skipped, 6000); else await load(); }
  catch (e) { toast(e.message, 6000); } finally { $('#btn-ai').disabled = false; }
});
initTheme($('#btn-theme'));
$('#btn-theme').addEventListener('click', () => { if (chart) buildChart(); if (data?.snap) render(); });
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === '/') { e.preventDefault(); if (ui.view !== 'gundem') location.hash = '#gundem'; $('#q').focus(); }
  else if (['1', '2', '3', '4'].includes(k)) location.hash = ['#gundem', '#trade', '#dunya', '#analizler'][+k - 1];
  else if (k === 'r') $('#btn-sweep').click();
  else if (k === 'a') $('#btn-ai').click();
  else if (k === 't') $('#btn-theme').click();
});

const es = new EventSource('/events');
es.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.type === 'status') { if (data) data.status = m.status; renderStatus(m.status); }
  if (m.type === 'update') load();
  if (m.type === 'quotes' && data?.snap) { Object.assign(data.snap, { markets: m.markets, crypto: m.crypto, usdtPremium: m.usdtPremium ?? data.snap.usdtPremium }); renderTape(data.snap); if (ui.view === 'dunya') renderWorld(data.snap); }
};
setInterval(() => data && renderStatus(data.status), 60e3);
route();
load().catch(e => toast(e.message));
