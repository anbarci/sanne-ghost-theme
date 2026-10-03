// Ortak yardımcılar: API çağrısı, HTML kaçışı, tema, biçimlendirme.
export const $ = (s, r = document) => r.querySelector(s);

// Dış kaynaklardan gelen HER metin bu fonksiyondan geçer (XSS koruması).
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const safeUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : '#'; } catch { return '#'; } };

export async function api(path, body, method) {
  const r = await fetch(path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: body ? { 'content-type': 'application/json', 'x-radar': '1' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  if (r.status === 401 && location.pathname !== '/giris') { location.href = `/giris?geri=${encodeURIComponent(location.pathname + location.hash)}`; throw new Error('Giriş gerekli'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok && j.error) throw new Error(j.error);
  return j;
}

// Sayıdan sonra gelen iyelik eki ("5'i", "3'ü", "6'sı", "0'ı"); lib/tr.mjs ile aynı kural.
const BIRLER = ['', 'i', 'si', 'ü', 'ü', 'i', 'sı', 'si', 'i', 'u'], ONLAR = ['', 'u', 'si', 'u', 'ı', 'si', 'ı', 'i', 'i', 'ı'];
export function ek(n) {
  n = Math.abs(Math.round(Number(n)));
  return `${n}'${n === 0 ? 'ı' : n % 10 ? BIRLER[n % 10] : n % 100 ? ONLAR[(n / 10) % 10] : n % 1000 ? 'ü' : n % 1e6 ? 'i' : 'u'}`;
}
export const nf = (x, d = 2) => (x == null || !Number.isFinite(+x) ? '—' : (+x).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const pct = x => (x == null ? '—' : (x > 0 ? '+' : '') + nf(x, 2) + '%');
export const dir = x => (x > 0.05 ? 'up' : x < -0.05 ? 'down' : 'flat');
export const ago = t => {
  if (!t) return '—';
  const m = Math.round((Date.now() - t) / 60e3);
  if (m < 1) return 'şimdi';
  if (m < 60) return `${m} dk önce`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} sa önce` : `${Math.round(h / 24)} gün önce`;
};

export function toast(msg, ms = 3200) {
  const el = document.createElement('div');
  el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = msg;
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
}

export function initTheme(btn) {
  let saved = null;
  try { saved = localStorage.getItem('radar-theme'); } catch {}
  const t = saved || 'dark'; // finans paneli: koyu varsayılan (ui-ux-pro-max önerisi); açık tema düğmeyle
  document.documentElement.dataset.theme = t;
  btn?.addEventListener('click', () => {
    const n = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = n;
    try { localStorage.setItem('radar-theme', n); } catch {}
  });
}
