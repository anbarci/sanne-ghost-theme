import { $, api, initTheme } from './common.js';

initTheme();
const err = m => { $('#auth-err').textContent = m || ''; };
// Yalnızca site içi dönüş adresi (açık yönlendirme olmasın).
const go = () => { const g = new URLSearchParams(location.search).get('geri') || '/'; location.href = /^\/(?![\/\\])/.test(g) ? g : '/'; };

const a = await api('/api/auth').catch(() => ({}));
if (a.authed) go();
if (a.setup) {
  $('#auth-tabs').hidden = true; $('#f-login').hidden = true; $('#f-setup').hidden = false;
}
// Davet bağlantısı: /giris?davet=KOD
const inv = new URLSearchParams(location.search).get('davet');
const tab = t => {
  document.querySelectorAll('#auth-tabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.t === t)));
  $('#f-login').hidden = t !== 'login'; $('#f-register').hidden = t !== 'register'; err();
};
if (inv && !a.setup) { tab('register'); $('#r-code').value = inv; }
$('#auth-tabs').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) tab(b.dataset.t); });

const submit = (id, path, body) => $(id).addEventListener('submit', async e => {
  e.preventDefault(); err();
  const btn = e.target.querySelector('[type=submit]'); btn.disabled = true;
  try { await api(path, body()); go(); } catch (x) { err(x.message); } finally { btn.disabled = false; }
});
submit('#f-login', '/api/login', () => ({ ad: $('#l-ad').value.trim(), password: $('#l-pw').value }));
submit('#f-register', '/api/register', () => ({ code: $('#r-code').value.trim(), ad: $('#r-ad').value.trim().toLowerCase(), password: $('#r-pw').value }));
submit('#f-setup', '/api/setup', () => ({ token: $('#s-token').value.trim(), ad: $('#s-ad').value.trim().toLowerCase(), password: $('#s-pw').value }));
