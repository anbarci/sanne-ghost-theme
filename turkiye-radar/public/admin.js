import { $, esc, api, toast, initTheme, ago } from './common.js';

initTheme($('#btn-theme'));
let S = null;
const SECRETS = [
  ['EVDS_API_KEY', 'TCMB EVDS3 anahtarı', 'evds3.tcmb.gov.tr → Profilim → API Key'],
  ['FIRMS_MAP_KEY', 'NASA FIRMS anahtarı', 'firms.modaps.eosdis.nasa.gov/api, ücretsiz'],
  ['EPIAS_USER', 'EPİAŞ kullanıcı adı', 'Şeffaflık Platformu üyeliği'],
  ['EPIAS_PASS', 'EPİAŞ şifresi', ''],
  ['TELEGRAM_BOT_TOKEN', 'Telegram bot token', '@BotFather'],
];
const W_LABEL = { geo: 'Jeopolitik', energy: 'Enerji', trade: 'Ticaret', finance: 'Finans', tourism: 'Turizm', direct: 'Doğrudan' };
const STANCES = ['resmi', 'iktidara-yakın', 'muhalif', 'bağımsız', 'ana-akım', 'uluslararası', 'yabancı-devlet', 'ekonomi', 'dünya', 'toplayıcı', 'doğrulama', 'sektör', 'diğer'];

async function boot() {
  const a = await api('/api/auth');
  if (!a.authed) { location.href = '/giris?geri=/admin'; return; }
  $('#btn-logout').hidden = false;
  $('#who').textContent = `${a.user.ad} · ${a.user.rutbe.ad}`;
  if (!a.user.rutbe.admin) { $('#noadmin').hidden = false; return; }
  $('#app').hidden = false;
  await refresh();
}

// Üyeler, davetler, rütbe matrisi
let MB = null;
async function renderMembers() {
  MB = await api('/api/admin/members');
  const rankOpts = sel => Object.entries(MB.ranks).map(([k, r]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(r.ad)}</option>`).join('');
  $('#mem-n').textContent = `${MB.users.length} üye`;
  $('#members').innerHTML = `<thead><tr><th>Üye</th><th>Rütbe</th><th>Durum</th><th>Son giriş</th><th class="n">Bugün sohbet</th><th></th></tr></thead><tbody>${MB.users.map(u => `<tr data-id="${esc(u.id)}">
    <td><b>${esc(u.ad)}</b><div class="small muted">${new Date(u.created).toLocaleDateString('tr-TR')}</div></td>
    <td><select data-f="rank" aria-label="Rütbe">${rankOpts(u.rank)}</select></td>
    <td>${u.disabled ? '<span class="err">kapalı</span>' : '<span class="ok">aktif</span>'}</td>
    <td class="small">${u.lastLogin ? ago(u.lastLogin) : '—'}</td>
    <td class="n">${u.usage?.sohbet || 0}</td>
    <td><div class="inline"><button class="btn sm" data-act="toggle">${u.disabled ? 'Aç' : 'Kapat'}</button><button class="btn sm" data-act="pw">Şifre sıfırla</button><button class="btn sm danger" data-act="del">Sil</button></div></td></tr>`).join('')}</tbody>`;
  $('#i-rank').innerHTML = rankOpts('pro').replace(/<option value="yonetici"[^>]*>[^<]*<\/option>/, '');
  $('#m-rank').innerHTML = rankOpts('temel');
  $('#invites').innerHTML = MB.invites.length ? `<thead><tr><th>Kod</th><th>Rütbe</th><th class="n">Kullanım</th><th>Bitiş</th><th></th></tr></thead><tbody>${MB.invites.map(i => `<tr><td class="small num">${esc(i.code.slice(0, 4))}…</td><td>${esc(MB.ranks[i.rank]?.ad || i.rank)}</td><td class="n">${i.used}/${i.uses}</td><td class="small">${new Date(i.exp).toLocaleDateString('tr-TR')}</td><td><button class="btn sm danger" data-inv="${esc(i.code)}">İptal</button></td></tr>`).join('')}</tbody>` : '';
  const feats = Object.entries(MB.features);
  $('#ranks').innerHTML = `<thead><tr><th>Özellik</th>${Object.entries(MB.ranks).map(([k, r]) => `<th><input data-rk="${k}" data-f="ad" value="${esc(r.ad)}" aria-label="Rütbe adı" class="rk-name"></th>`).join('')}</tr></thead><tbody>${feats.map(([f, label]) => `<tr><td>${esc(label)}</td>${Object.entries(MB.ranks).map(([k, r]) => `<td class="c">${typeof r[f] === 'number' ? `<input type="number" min="0" max="100000" data-rk="${k}" data-f="${f}" value="${r[f]}" aria-label="${esc(label)}">` : `<input type="checkbox" data-rk="${k}" data-f="${f}" ${r[f] ? 'checked' : ''} ${k === 'yonetici' && f === 'admin' ? 'disabled' : ''} aria-label="${esc(label)}">`}</td>`).join('')}</tr>`).join('')}</tbody>`;
}
$('#members').addEventListener('change', async e => {
  const s = e.target.closest('select[data-f=rank]'); if (!s) return;
  try { await api('/api/admin/member', { id: s.closest('tr').dataset.id, rank: s.value }); toast('Rütbe değişti; üyenin oturumu yenilenir'); } catch (x) { toast(x.message, 5000); }
  renderMembers();
});
$('#members').addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const id = b.closest('tr').dataset.id, u = MB.users.find(x => x.id === id);
  try {
    if (b.dataset.act === 'toggle') await api('/api/admin/member', { id, disabled: !u.disabled });
    if (b.dataset.act === 'pw') { const pw = prompt(`${u.ad} için yeni şifre (en az 10 karakter)`); if (!pw) return; await api('/api/admin/member', { id, password: pw }); toast('Şifre sıfırlandı'); }
    if (b.dataset.act === 'del') { if (!confirm(`${u.ad} silinsin mi? Notları ve sohbetleri kalır ama hesaba girilemez.`)) return; await api('/api/admin/member/delete', { id }); }
  } catch (x) { toast(x.message, 5000); }
  renderMembers();
});
$('#inv-form').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const { code } = await api('/api/admin/invite', { rank: $('#i-rank').value, uses: +$('#i-uses').value, days: +$('#i-days').value });
    const link = `${location.origin}/giris?davet=${encodeURIComponent(code)}`;
    $('#inv-out').hidden = false;
    $('#inv-out').innerHTML = `Kod: <b class="num">${esc(code)}</b> · Bağlantı: <span class="num">${esc(link)}</span> <button class="btn sm" type="button" id="inv-copy">Kopyala</button><br><span class="small muted">Kod yalnızca şimdi tam gösterilir.</span>`;
    $('#inv-copy').onclick = () => navigator.clipboard?.writeText(link).then(() => toast('Kopyalandı'));
    renderMembers();
  } catch (x) { toast(x.message, 5000); }
});
$('#invites').addEventListener('click', async e => { const b = e.target.closest('[data-inv]'); if (!b) return; await api('/api/admin/invite/delete', { code: b.dataset.inv }); renderMembers(); });
$('#mk-form').addEventListener('submit', async e => {
  e.preventDefault();
  try { await api('/api/admin/member/create', { ad: $('#m-ad').value.trim().toLowerCase(), password: $('#m-pw').value, rank: $('#m-rank').value }); e.target.reset(); toast('Üye eklendi'); renderMembers(); } catch (x) { toast(x.message, 5000); }
});
$('#ranks-save').addEventListener('click', async () => {
  const out = {};
  document.querySelectorAll('#ranks [data-rk]').forEach(i => { (out[i.dataset.rk] ||= {})[i.dataset.f] = i.type === 'checkbox' ? i.checked : i.type === 'number' ? +i.value : i.value; });
  try { await api('/api/admin/ranks', { ranks: out }); toast('Rütbeler kaydedildi'); renderMembers(); } catch (x) { toast(x.message, 5000); }
});

async function refresh() {
  S = await api('/api/admin/settings');
  renderProviders(); renderSecrets(); renderSources(); renderSettings(); renderFeeds(); renderHistory(); renderMembers();
}

function renderProviders() {
  const { providers, activeProvider, secretsSet } = S.settings;
  $('#providers').innerHTML = `<thead><tr><th>Ad</th><th>Tür</th><th>Model</th><th>Anahtar</th><th></th></tr></thead><tbody>` +
    (providers.map(p => `<tr><td>${esc(p.name)} ${p.id === activeProvider ? '<span class="tag acc">aktif</span>' : ''}</td><td>${esc(p.kind)}</td><td class="small">${esc(p.model)}</td><td>${secretsSet.includes('AI_KEY_' + p.id) ? '<span class="ok">var</span>' : '<span class="muted">yok</span>'}</td>
      <td><div class="inline"><button class="btn" data-act="use" data-id="${esc(p.id)}">Aktif yap</button><button class="btn" data-act="test" data-id="${esc(p.id)}">Test</button><button class="btn" data-act="edit" data-id="${esc(p.id)}">Düzenle</button><button class="btn danger" data-act="del" data-id="${esc(p.id)}">Sil</button></div></td></tr>`).join('') ||
      '<tr><td colspan="5" class="empty">Henüz sağlayıcı yok.</td></tr>') + '</tbody>';
  const sel = $('#preset');
  if (!sel.options.length) {
    sel.innerHTML = '<option value="">seçin…</option>' + S.presets.map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join('');
    sel.onchange = () => {
      const p = S.presets[sel.value];
      if (!p) return;
      $('#p-name').value = p.name; $('#p-kind').value = p.kind; $('#p-url').value = p.baseUrl; $('#p-model').value = p.model || '';
      $('#model-list').innerHTML = (p.models || []).map(m => `<option value="${esc(m)}">`).join('');
      $('#p-key').placeholder = p.noKey ? 'yerel sağlayıcı: anahtar gerekmez' : 'API anahtarı';
    };
  }
}

$('#providers').addEventListener('click', async e => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const id = b.dataset.id, p = S.settings.providers.find(x => x.id === id);
  if (b.dataset.act === 'use') { await api('/api/admin/provider/active', { id }); toast('Aktif sağlayıcı değişti'); return refresh(); }
  if (b.dataset.act === 'del') { await api('/api/admin/provider/delete', { id }); toast('Silindi'); return refresh(); }
  if (b.dataset.act === 'edit') {
    $('#p-id').value = p.id; $('#p-name').value = p.name; $('#p-kind').value = p.kind; $('#p-url').value = p.baseUrl; $('#p-model').value = p.model; $('#p-effort').value = p.effort || 'medium'; $('#p-think').value = p.thinking || 'off'; $('#p-max').value = p.maxTokens || 6000;
    $('#p-name').focus(); return;
  }
  if (b.dataset.act === 'test') {
    b.disabled = true; b.textContent = 'deneniyor…';
    const r = await api('/api/admin/provider/test', { id }).catch(err => ({ ok: false, error: err.message }));
    b.disabled = false; b.textContent = 'Test';
    toast(r.ok ? `Çalışıyor: ${r.model}, ${r.ms} ms, ${r.usage.in}→${r.usage.out} token` : `Hata: ${r.error}`, 8000);
  }
});

$('#prov-form').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await api('/api/admin/provider', { id: $('#p-id').value || undefined, name: $('#p-name').value, kind: $('#p-kind').value, baseUrl: $('#p-url').value, model: $('#p-model').value, key: $('#p-key').value, effort: $('#p-effort').value, thinking: $('#p-think').value, maxTokens: +$('#p-max').value });
    e.target.reset(); $('#p-id').value = ''; toast('Kaydedildi'); refresh();
  } catch (err) { toast(err.message); }
});
$('#p-reset').addEventListener('click', () => { $('#p-id').value = ''; });

function renderSecrets() {
  const set = S.settings.secretsSet;
  $('#secrets').innerHTML = SECRETS.map(([k, label, hint]) => `<div class="row"><label>${esc(label)} <span class="small">${set.includes(k) ? '<span class="ok">kayıtlı</span>' : '<span class="muted">boş</span>'} ${hint ? '· ' + esc(hint) : ''}</span><input type="password" autocomplete="off" data-secret="${k}" placeholder="${set.includes(k) ? '••••••• (değiştirmek için yazın)' : ''}"></label>
    <div class="inline"><button class="btn" data-save="${k}" type="button">Kaydet</button>${set.includes(k) ? `<button class="btn danger" data-clear="${k}" type="button">Sil</button>` : ''}</div></div>`).join('');
}
$('#secrets').addEventListener('click', async e => {
  const k = e.target.dataset.save || e.target.dataset.clear;
  if (!k) return;
  const value = e.target.dataset.clear ? null : $(`[data-secret="${k}"]`).value.trim();
  if (e.target.dataset.save && !value) return toast('Değer boş');
  await api('/api/admin/secret', { name: k, value }); toast('Güncellendi'); refresh();
});

const VIA = { jsonld: 'JSON-LD', 'gömülü-json': 'gömülü JSON', readability: 'Readability', paragraf: 'paragraf', meta: 'sadece meta özet', 'js-sayfa': 'JS ile yüklenen sayfa', boş: 'boş sayfa', ağ: 'ağ hatası' };
function renderArtStats() {
  const st = Object.entries(S.articleStats || {}).sort((a, b) => b[1] - a[1]);
  $('#art-stats').textContent = st.length ? 'Haber tam metni: ' + st.map(([k, n]) => `${VIA[k] || k.replace('http-', 'HTTP ')} ${n}`).join(' · ') : '';
}

function renderSources() {
  renderArtStats();
  $('#sources').innerHTML = '<thead><tr><th>Açık</th><th>Kaynak</th><th>Durum</th><th class="n">Süre</th></tr></thead><tbody>' + S.sources.map(s => `<tr>
    <td><input type="checkbox" data-src="${esc(s.id)}" ${s.enabled ? 'checked' : ''} aria-label="${esc(s.name)}"></td>
    <td>${esc(s.name)}<div class="small muted">${esc(s.group)}${s.needs.length ? ' · anahtar: ' + s.needs.map(esc).join(', ') : ''}</div></td>
    <td class="small">${s.missing.length ? '<span class="muted">anahtar eksik</span>' : s.ok ? `<span class="ok">tamam</span> ${ago(s.at)}` : s.error ? `<span class="err">${esc(s.error)}</span>` : '<span class="muted">bekliyor</span>'}</td>
    <td class="n small">${s.ms ? s.ms + ' ms' : ''}</td></tr>`).join('') + '</tbody>';
}
$('#sources').addEventListener('change', async e => {
  const id = e.target.dataset.src;
  if (!id) return;
  const sources = { ...S.settings.sources, [id]: e.target.checked };
  if (e.target.checked) delete sources[id];
  await api('/api/admin/settings', { sources }); toast('Kaydedildi'); refresh();
});
$('#btn-sweep').addEventListener('click', async () => { await api('/api/sweep', {}); toast('Tarama başladı; birkaç saniye sonra yenileyin'); });

function renderSettings() {
  const s = S.settings;
  $('#s-int').value = s.intervalMin; $('#s-aiint').value = s.aiIntervalMin; $('#s-auto').value = String(s.aiAutoHours || 0); $('#s-aimin').value = s.aiMinDelta; $('#s-art').value = s.fetchArticles; $('#s-ver').value = s.verifyTop ?? 12; $('#s-sx').value = s.searxngUrl || ''; $('#s-usd').value = s.aiDailyUSD; $('#s-tok').value = s.aiDailyTokens;
  $('#s-watch').value = s.watchlist.join(', '); $('#s-evds').value = s.evdsSeries.join(', ');
  $('#weights').innerHTML = Object.entries(s.weights).map(([k, v]) => `<label>${W_LABEL[k] || k} <input type="number" step="0.05" min="0" max="1" data-w="${k}" value="${v}"></label>`).join('');
  $('#tg-on').checked = s.telegram.enabled; $('#tg-ai').checked = !!s.telegram.sendAnalysis; $('#tg-chat').value = s.telegram.chatId || '';
}
$('#set-form').addEventListener('submit', async e => {
  e.preventDefault();
  const weights = {};
  document.querySelectorAll('[data-w]').forEach(i => { weights[i.dataset.w] = +i.value; });
  const list = v => v.split(',').map(x => x.trim()).filter(Boolean);
  await api('/api/admin/settings', { intervalMin: +$('#s-int').value, aiIntervalMin: +$('#s-aiint').value, aiAutoHours: +$('#s-auto').value, aiMinDelta: +$('#s-aimin').value, fetchArticles: +$('#s-art').value, verifyTop: +$('#s-ver').value, searxngUrl: $('#s-sx').value.trim(), aiDailyUSD: +$('#s-usd').value, aiDailyTokens: +$('#s-tok').value, watchlist: list($('#s-watch').value), evdsSeries: list($('#s-evds').value), weights });
  toast('Kaydedildi'); refresh();
});
$('#tg-form').addEventListener('submit', async e => {
  e.preventDefault();
  await api('/api/admin/settings', { telegram: { enabled: $('#tg-on').checked, sendAnalysis: $('#tg-ai').checked, chatId: $('#tg-chat').value.trim() } });
  toast('Kaydedildi');
});
$('#tg-test').addEventListener('click', async () => { const r = await api('/api/admin/telegram-test', {}); toast(r.ok ? 'Gönderildi' : 'Hata: ' + r.error, 6000); });

let feeds = [];
function renderFeeds() {
  feeds = S.feeds.map(f => ({ ...f }));
  drawFeeds();
}
function drawFeeds() {
  $('#feed-n').textContent = `${feeds.filter(f => f.on !== false).length} açık / ${feeds.length}`;
  $('#feeds').innerHTML = '<thead><tr><th>Açık</th><th>Ad</th><th>URL</th><th>Çizgi</th><th>Kategori</th><th>Dil</th></tr></thead><tbody>' + feeds.map((f, i) => `<tr>
    <td><input type="checkbox" data-i="${i}" data-k="on" ${f.on !== false ? 'checked' : ''} aria-label="açık"></td>
    <td><input data-i="${i}" data-k="name" value="${esc(f.name)}"></td>
    <td><input data-i="${i}" data-k="url" value="${esc(f.url)}"></td>
    <td><select data-i="${i}" data-k="stance">${STANCES.map(s => `<option ${s === f.stance ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
    <td><input data-i="${i}" data-k="cat" value="${esc(f.cat || '')}"></td>
    <td><select data-i="${i}" data-k="lang"><option ${f.lang !== 'en' ? 'selected' : ''}>tr</option><option ${f.lang === 'en' ? 'selected' : ''}>en</option></select></td></tr>`).join('') + '</tbody>';
}
$('#feeds').addEventListener('change', e => {
  const { i, k } = e.target.dataset;
  if (i == null) return;
  feeds[i][k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
});
$('#feed-add').addEventListener('click', () => { feeds.push({ id: 'yeni-' + Date.now().toString(36), name: '', url: 'https://', stance: 'diğer', cat: 'gündem', lang: 'tr', on: true }); drawFeeds(); });
$('#feed-save').addEventListener('click', async () => { const r = await api('/api/admin/feeds', { feeds }); toast(`${r.n} kaynak kaydedildi`); refresh(); });

async function renderHistory() {
  const h = await api('/api/analyses');
  const total = h.reduce((a, x) => a + (x.cost || 0), 0);
  $('#hist').innerHTML = `<thead><tr><th>Zaman</th><th>Model</th><th class="n">Girdi</th><th class="n">Önbellek</th><th class="n">Çıktı</th><th class="n">$</th><th class="n">sn</th></tr></thead><tbody>` +
    h.slice(0, 30).map(x => `<tr><td class="small">${ago(x.at)}</td><td class="small">${esc(x.model)}</td><td class="n">${x.usage.in}</td><td class="n">${x.usage.cacheRead || 0}</td><td class="n">${x.usage.out}</td><td class="n">${x.cost != null ? x.cost.toFixed(4) : '—'}</td><td class="n">${Math.round(x.ms / 1000)}</td></tr>`).join('') +
    `</tbody><tfoot><tr><td colspan="5">Toplam (son ${h.length} analiz)</td><td class="n">${total.toFixed(3)}</td><td></td></tr></tfoot>`;
}

$('#pw-form').addEventListener('submit', async e => {
  e.preventDefault();
  try { await api('/api/me/password', { old: $('#pw-old').value, new: $('#pw-new').value }); e.target.reset(); toast('Şifre değişti'); } catch (err) { toast(err.message); }
});
$('#btn-logout').addEventListener('click', async () => { await api('/api/logout', {}); location.href = '/giris'; });

boot().catch(e => toast(e.message));
