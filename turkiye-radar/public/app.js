import { $, esc, safeUrl, api, nf, pct, dir, ago, toast, initTheme } from './common.js';

initTheme($('#btn-theme'));
let data = null, map = null, shown = 40;
const filt = { cat: '', stance: '', min: 15, bad: false, q: '' };
const lastPrice = {};
const fold = s => String(s || '').toLocaleLowerCase('tr').replace(/ı/g, 'i');

const TAPE = [
  ['USDTRY', 'Dolar/TL', 4], ['EURTRY', 'Euro/TL', 4], ['GRAM_ALTIN', 'Gram altın', 0], ['XU100', 'BIST 100', 0], ['XBANK', 'BIST Banka', 0],
  ['BRENT', 'Brent $', 2], ['ONS', 'Ons altın $', 0], ['VIX', 'VIX', 2], ['DXY', 'Dolar endeksi', 2], ['TUR_ETF', 'TUR ETF $', 2],
];
const NOTE = { GRAM_ALTIN: 'Hesaplanan: ons × USD/TRY / 31,1035. Kuyumcu fiyatı farklıdır.', TUR_ETF: 'iShares MSCI Turkey ETF (USD). Yabancı iştahının vekili; CDS değildir.' };
const STANCE_LABEL = { resmi: 'resmi', 'iktidara-yakın': 'iktidara yakın', muhalif: 'muhalif', bağımsız: 'bağımsız', 'ana-akım': 'ana akım', uluslararası: 'uluslararası', 'yabancı-devlet': 'yabancı devlet', ekonomi: 'ekonomi', dünya: 'dünya basını', toplayıcı: 'toplayıcı', doğrulama: 'doğrulama', sektör: 'sektör' };
const CH_LABEL = { geo: 'jeopolitik', energy: 'enerji', trade: 'ticaret', finance: 'finans', tourism: 'turizm', direct: 'doğrudan' };

function spark(vals) {
  if (!vals?.length) return '';
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1 || 1)) * 100},${20 - ((v - lo) / span) * 18}`).join(' ');
  return `<svg viewBox="0 0 100 22" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}"/></svg>`;
}

function renderTape(s) {
  const m = s.markets || {};
  const items = TAPE.filter(([k]) => m[k]).map(([k, label, d]) => {
    const x = m[k];
    return `<div class="tick ${x.anomaly ? 'anomaly' : ''} ${dir(x.chg)}c" data-k="${k}" title="${esc([NOTE[k], x.roll === 'şüpheli' ? 'Vadeli kontrat devri şüphesi: günlük değişim güvenilir değil.' : x.roll ? `Değişim ${x.roll} kontratından hesaplandı (devir düzeltmesi).` : '', x.anomaly ? `Olağandışı hareket: normal günlük oynaklık %${nf(x.vol)}` : ''].filter(Boolean).join(' '))}">
      <div class="k"><span>${esc(label)}</span><span class="${x.roll === 'şüpheli' ? 'muted' : dir(x.chg)}">${x.roll === 'şüpheli' ? 'devir?' : pct(x.chg)}</span></div>
      <b>${nf(x.price, d)}</b>${spark(x.spark)}</div>`;
  });
  if (s.crypto?.BTCTRY) items.push(`<div class="tick"><div class="k"><span>BTC/TL</span><span class="${dir(s.crypto.BTCTRY.chg)}">${pct(s.crypto.BTCTRY.chg)}</span></div><b>${nf(s.crypto.BTCTRY.price, 0)}</b></div>`);
  if (s.usdtPremium != null) items.push(`<div class="tick" title="USDT/TRY ile resmi kur farkı. Pozitif ve büyüyorsa dövize talep baskısı var."><div class="k"><span>USDT makası</span></div><b class="${s.usdtPremium > 1 ? 'down' : ''}">%${nf(s.usdtPremium)}</b></div>`);
  $('#tape').innerHTML = items.join('') || '<p class="empty">Piyasa verisi henüz yok.</p>';
  // Son yüklemeden bu yana fiyatı değişen kutu kısa süre renklenir (OpenTerminal'daki flaş fikri).
  for (const el of document.querySelectorAll('.tick[data-k]')) {
    const k = el.dataset.k, p = m[k].price, was = lastPrice[k];
    if (was != null && p !== was) el.classList.add(p > was ? 'flash-up' : 'flash-down');
    lastPrice[k] = p;
  }
}

function renderAI(a) {
  if (!a?.result) return;
  const r = a.result;
  const view = (cls, title, v, extra = '') => `<div class="view ${cls}"><h3>${title}${v.olasilik != null ? `<span class="num small">%${esc(v.olasilik)}</span>` : ''}</h3><p>${esc(v.yorum)}</p><ul>${(v.dayanak || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>${extra}</div>`;
  const izle = r.tarafsiz.izle?.length ? `<p class="small muted">İzlenecekler: ${r.tarafsiz.izle.map(esc).join(' · ')}</p>` : '';
  const assets = (r.varliklar || []).map(v => `<tr><td>${esc(v.kod)}</td><td class="${v.yon === 'yukari' ? 'up' : v.yon === 'asagi' ? 'down' : 'flat'}">${esc(v.yon)}</td><td class="n">${esc(v.vade_gun)}g</td><td class="n">%${esc(v.olasilik)}</td><td class="small muted">${esc(v.gerekce)}</td></tr>`).join('');
  const ideas = (r.fikirler || []).map(f => `<div class="idea"><div class="inline"><span class="tag ${esc(f.yon)}">${esc(f.yon)}</span><b>${esc(f.baslik)}</b><span class="small muted">${esc(f.enstruman)}</span></div><div class="small">${esc(f.gerekce)}</div><div class="small muted">Risk: ${esc(f.risk)}</div><div class="small muted">Geçersiz kılan: ${esc(f.gecersiz_kilan)}</div></div>`).join('');
  $('#ai-body').innerHTML = `
    <p class="lead-sum">${esc(r.ozet)}</p>
    <div class="views">${view('bear', 'Kötümser', r.kotumser)}${view('bull', 'İyimser', r.iyimser)}${view('base', 'Tarafsız', r.tarafsiz, izle)}</div>
    <div class="subgrid">
      <div><h3 class="small muted">Varlık beklentileri</h3><div class="scroll-x"><table><thead><tr><th>Varlık</th><th>Yön</th><th class="n">Vade</th><th class="n">Olas.</th><th>Neden</th></tr></thead><tbody>${assets}</tbody></table></div></div>
      <div><h3 class="small muted">Fikirler (kişisel)</h3><div class="ideas">${ideas || '<p class="empty">Fikir yok.</p>'}</div></div>
    </div>
    <p class="note">Model çıktısıdır, yatırım tavsiyesi değildir. Güven: ${esc(r.guven)}. Varlık beklentileri tahmin karnesinde gerçek fiyatlarla puanlanır.</p>`;
  const cost = a.cost != null ? ` · $${a.cost.toFixed(4)}` : '';
  $('#ai-meta').textContent = `${a.provider} · ${a.model} · ${ago(a.at)} · ${a.usage.in + (a.usage.cacheRead || 0)}→${a.usage.out} token${cost}`;
}

function renderNews(s) {
  const news = s.news || [];
  const cats = ['', ...new Set(news.map(n => n.cat).filter(Boolean))];
  $('#cat-filters').innerHTML = cats.map(c => `<button class="chip" type="button" data-cat="${esc(c)}" aria-pressed="${filt.cat === c}">${esc(c || 'tümü')}</button>`).join('');
  const st = $('#stance');
  const stances = [...new Set(news.map(n => n.stance).filter(Boolean))];
  st.innerHTML = '<option value="">tümü</option>' + stances.map(x => `<option value="${esc(x)}" ${filt.stance === x ? 'selected' : ''}>${esc(STANCE_LABEL[x] || x)}</option>`).join('');
  const q = fold(filt.q);
  const list = news.filter(n => (!filt.cat || n.cat === filt.cat) && (!filt.stance || n.stance === filt.stance) && n.impact.score >= filt.min && (!filt.bad || n.misleading) && (!q || fold(n.title + ' ' + (n.lead || '') + ' ' + n.srcName).includes(q)));
  $('#news-count').textContent = `${list.length} / ${news.length}`;
  $('#news').innerHTML = list.slice(0, shown).map(n => {
    const ch = n.impact.channels.slice(0, 3).map(c => `<span class="tag">${CH_LABEL[c] || c}</span>`).join(' ');
    const warn = n.misleading ? `<div class="warn">Başlık içerikle zayıf örtüşüyor (uyum %${n.check?.score ?? '?'}${n.check?.numMiss ? `, başlıktaki ${n.check.numMiss} rakam metinde yok` : ''}). Özetteki içeriğe güvenin.</div>` : '';
    return `<li><div class="score ${n.impact.score >= 60 ? 'hi' : ''}" title="Türkiye Etki Skoru">${n.impact.score}</div><div>
      <h3><a href="${esc(safeUrl(n.link))}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a></h3>
      <div class="src"><span>${esc(n.srcName)}</span><span class="tag">${esc(STANCE_LABEL[n.stance] || n.stance || '')}</span>${n.also ? `<span class="tag acc">+${n.also} kaynak</span>` : ''}${ch}<span>${ago(n.ts)}</span></div>
      ${n.lead ? `<p class="lead">${esc(n.lead)}</p>` : ''}${warn}</div></li>`;
  }).join('') || '<li class="empty">Filtreye uyan haber yok.</li>';
  $('#news-more').hidden = list.length <= shown;
}

async function renderMap(s) {
  if (!map) map = await fetch('/map.json').then(r => r.json()).catch(() => null);
  if (!map) return;
  const V = map.view;
  const P = (lat, lon) => [((lon - V.lon0) / (V.lon1 - V.lon0)) * V.w, ((V.lat1 - lat) / (V.lat1 - V.lat0)) * V.h];
  const inside = (lat, lon) => lat > V.lat0 && lat < V.lat1 && lon > V.lon0 && lon < V.lon1;
  let g = map.countries.map(c => `<path class="${c.tr ? 'tr' : ''}" d="${c.d}"><title>${esc(c.name)}</title></path>`).join('');
  for (const f of s.fires?.clusters || []) if (inside(f.lat, f.lon)) { const [x, y] = P(f.lat, f.lon); g += `<circle class="f" cx="${x}" cy="${y}" r="${Math.min(6, 2 + Math.log10(f.frp + 1))}"><title>Yangın, FRP ${Math.round(f.frp)}</title></circle>`; }
  for (const q of s.quakes?.local || []) if (inside(q.lat, q.lon)) { const [x, y] = P(q.lat, q.lon); g += `<circle class="q" cx="${x}" cy="${y}" r="${Math.max(2, (q.mag - 1.5) * 3)}"><title>M${q.mag} ${esc(q.place)} (${esc(q.src)})</title></circle>`; }
  const hot = {};
  for (const n of (s.news || []).slice(0, 80)) if (n.impact.place) { const k = n.impact.place.join(); (hot[k] ||= { p: n.impact.place, n: 0, t: n.title }).n++; }
  for (const h of Object.values(hot)) if (inside(...h.p)) { const [x, y] = P(...h.p); g += `<rect class="n" x="${x - 5}" y="${y - 5}" width="10" height="10" transform="rotate(45 ${x} ${y})"><title>${h.n} haber: ${esc(h.t)}</title></rect>`; }
  const svg = $('#map');
  svg.setAttribute('viewBox', `0 0 ${V.w} ${V.h}`);
  svg.innerHTML = g;
}

function renderSide(s) {
  const q = s.quakes;
  $('#eq-src').textContent = q?.status ? Object.entries(q.status).map(([k, v]) => `${k}: ${typeof v === 'number' ? v : '✕'}`).join(' · ') : '';
  $('#eq').innerHTML = (q?.local || []).filter(e => e.mag >= 2.5).slice(0, 12).map(e => `<li><span><b class="num ${e.mag >= 4.5 ? 'down' : ''}">M${nf(e.mag, 1)}</b> ${esc(e.place)}</span><span class="small muted">${ago(e.t)}</span></li>`).join('') || '<li class="empty">Kayda değer deprem yok.</li>';

  const rows = [];
  const ev = s.evds || {};
  const EV = { 'TP.DK.USD.A.YTL': 'TCMB USD alış', 'TP.DK.EUR.A.YTL': 'TCMB EUR alış', 'TP.FG.J0': 'TÜFE endeksi' };
  for (const [k, v] of Object.entries(ev)) rows.push([`${EV[k] || k}${v.yoy != null ? ' (yıllık %' + nf(v.yoy) + ')' : ''}`, nf(v.value)]);
  if (!Object.keys(ev).length && s.tcmb?.rates?.USD) rows.push([`TCMB USD satış (${s.tcmb.date})`, nf(s.tcmb.rates.USD.sell, 4)]);
  const imf = s.macro?.imf || {}, wb = s.macro?.worldBank || {};
  const y = new Date().getFullYear();
  if (imf.enflasyon) rows.push([`IMF enflasyon ${y}/${y + 1}`, `${nf(imf.enflasyon[y], 1)} / ${nf(imf.enflasyon[y + 1], 1)}`]);
  if (imf.buyume) rows.push([`IMF büyüme ${y}/${y + 1}`, `${nf(imf.buyume[y], 1)} / ${nf(imf.buyume[y + 1], 1)}`]);
  if (imf.cariDenge_GSYH) rows.push([`IMF cari denge/GSYH ${y}`, nf(imf.cariDenge_GSYH[y], 1)]);
  if (wb.issizlik) rows.push([`İşsizlik (DB ${wb.issizlik.year})`, nf(wb.issizlik.value, 1)]);
  const F = { fedFaiz: 'Fed faizi', abd10y: 'ABD 10y', yuksekGetiriSpread: 'HY spread', abdEnflasyonBeklenti5y: 'ABD 5y enf. bekl.' };
  for (const [k, v] of Object.entries(s.fred || {})) if (F[k]) rows.push([F[k], nf(v.value)]);
  if (s.ecb?.EURTRY) rows.push([`ECB EUR/TRY (${s.ecb.EURTRY.date})`, nf(s.ecb.EURTRY.value, 4)]);
  if (s.epias?.avg) rows.push([`Elektrik PTF ort. ${s.epias.day}`, `${nf(s.epias.avg, 0)} TL`]);
  if (s.fires?.count != null) rows.push(['Aktif yangın noktası (FIRMS)', nf(s.fires.count, 0)]);
  if (s.tone?.length) rows.push(['Dünya basını TR tonu (GDELT)', nf(s.tone.at(-1)[1])]);
  $('#macro').innerHTML = rows.length ? `<dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : '<p class="empty">Veri yok. EVDS/FRED anahtarlarını yönetim panelinden ekleyin.</p>';

  $('#wx').innerHTML = (s.weather || []).map(w => `<li><span>${esc(w.city)} ${w.warn ? `<span class="tag acc">${esc(w.warn.trim())}</span>` : ''}</span><span class="num">${nf(w.temp, 0)}° · ${nf(w.wind, 0)} km/s</span></li>`).join('') || '<li class="empty">—</li>';

  const rg = s.resmiGazete;
  $('#rg-link').href = safeUrl(rg?.url || 'https://www.resmigazete.gov.tr/');
  $('#rg').innerHTML = (rg?.items || []).slice(0, 8).map(i => `<li><span><a href="${esc(safeUrl(i.link))}" target="_blank" rel="noopener noreferrer">${esc(i.title)}</a></span></li>`).join('') || '<li class="empty">Bugünkü sayı alınamadı.</li>';

  $('#srcs').innerHTML = (s.sources || []).map(x => `<li><span>${esc(x.name)}</span><span class="${x.ok ? 'ok' : x.missing?.length || !x.enabled ? 'muted' : 'err'}">${!x.enabled ? 'kapalı' : x.missing?.length ? 'anahtar yok' : x.ok ? ago(x.at) : 'hata'}</span></li>`).join('');
}

const CCY_TR = { USD: 'ABD', EUR: 'Euro Bölgesi', CNY: 'Çin', GBP: 'İngiltere', JPY: 'Japonya' };
function renderCal(list) {
  const fmt = new Intl.DateTimeFormat('tr-TR', { weekday: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
  $('#cal').innerHTML = (list || []).filter(e => e.t > Date.now() - 6 * 3600e3).slice(0, 12).map(e => `<li><span><span class="tag ${e.impact === 'High' ? 'acc' : ''}">${esc(CCY_TR[e.ccy] || e.ccy)}</span> ${esc(e.title)}${e.forecast || e.previous ? `<span class="small muted"> · bekl. ${esc(e.forecast || '—')} / önc. ${esc(e.previous || '—')}</span>` : ''}</span><span class="small muted num">${esc(fmt.format(e.t))}</span></li>`).join('') || '<li class="empty">Takvim alınamadı.</li>';
}

function renderScore(sc) {
  if (!sc) return;
  const rows = sc.models.map(m => `<tr><td>${esc(m.model)}</td><td class="n">${esc(m.n)}</td><td class="n">%${esc(m.isabet)}</td><td class="n">${esc(m.brier)}</td></tr>`).join('');
  $('#score').innerHTML = `<p class="small muted">${sc.done} tahmin sonuçlandı, ${sc.open} açık. Brier 0'a yakınsa iyi; 0,25 yazı-tura seviyesi.</p>
    ${rows ? `<div class="scroll-x"><table><thead><tr><th>Model</th><th class="n">n</th><th class="n">İsabet</th><th class="n">Brier</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}`;
}

function renderStatus(st) {
  const busy = st?.sweeping || st?.analyzing;
  $('#pulse').className = 'pulse ' + (busy ? 'busy' : 'live');
  $('#btn-sweep').disabled = !!st?.sweeping;
  $('#btn-ai').disabled = !!st?.analyzing;
  if (busy) $('#stamp').textContent = st.sweeping ? 'taranıyor…' : 'analiz ediliyor…';
  else if (data?.snap) $('#stamp').textContent = `güncellendi ${ago(data.snap.at)}${st?.lastAnalysisNote ? ' · ' + st.lastAnalysisNote : ''}`;
}

async function load() {
  data = await api('/api/data');
  if (!data.snap) { $('#stamp').textContent = 'ilk tarama sürüyor…'; return; }
  renderTape(data.snap); renderNews(data.snap); renderSide(data.snap); renderAI(data.analysis); renderScore(data.score); renderCal(data.snap.calendar);
  renderStatus(data.status);
  renderMap(data.snap);
}

$('#cat-filters').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (!b) return; filt.cat = b.dataset.cat; shown = 40; renderNews(data.snap); });
$('#stance').addEventListener('change', e => { filt.stance = e.target.value; shown = 40; renderNews(data.snap); });
$('#minimp').addEventListener('input', e => { filt.min = +e.target.value; $('#minimp-v').textContent = e.target.value; renderNews(data.snap); });
$('#only-bad').addEventListener('change', e => { filt.bad = e.target.checked; renderNews(data.snap); });
let qTimer;
$('#q').addEventListener('input', e => { clearTimeout(qTimer); qTimer = setTimeout(() => { filt.q = e.target.value; shown = 40; renderNews(data.snap); }, 150); });
// Kısayollar: R tara, A analiz, T tema, / arama. Yazı alanındayken devre dışı.
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === '/') { e.preventDefault(); $('#q').focus(); }
  else if (k === 'r') $('#btn-sweep').click();
  else if (k === 'a') $('#btn-ai').click();
  else if (k === 't') $('#btn-theme').click();
});
$('#news-more').addEventListener('click', () => { shown += 40; renderNews(data.snap); });
$('#btn-sweep').addEventListener('click', async () => { await api('/api/sweep', {}); toast('Tarama başladı'); });
$('#btn-ai').addEventListener('click', async () => {
  $('#btn-ai').disabled = true;
  try { const r = await api('/api/analyze', {}); if (r.error || r.skipped) toast(r.error || r.skipped, 6000); else await load(); }
  catch (e) { toast(e.message, 6000); } finally { $('#btn-ai').disabled = false; }
});

// Canlı güncelleme (SSE). Bağlantı düşerse tarayıcı kendisi yeniden bağlanır.
const es = new EventSource('/events');
es.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.type === 'status') { if (data) data.status = m.status; renderStatus(m.status); }
  if (m.type === 'update') load();
};
setInterval(() => data && renderStatus(data.status), 60e3);
load().catch(e => toast(e.message));
