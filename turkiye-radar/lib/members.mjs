// Üyelik: çok kullanıcı, rütbeler ve rütbeye göre özellikler.
// Kayıt yalnızca yöneticinin ürettiği davet koduyla olur (açık kayıt yok). Şifreler scrypt ile saklanır.
// Oturum çereze kullanıcı kimliği ve kullanıcının "sürüm" sayacıyla imzalanır: şifre ya da rütbe değişince
// ya da üye kapatılınca o kullanıcının açık oturumları geçersiz olur.
import { scryptSync, randomBytes, timingSafeEqual, createHmac, createHash } from 'node:crypto';
import { readJSON, writeJSON } from './store.mjs';

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SESSION_HOURS = 12;
const attempts = new Map(); // ip -> { n, until }

// Rütbeler ve özellikleri. Yönetici panelinden sayılar ve aç/kapa değerleri değiştirilebilir (settings.ranks).
export const FEATURES = {
  gundem: 'Gündem, haberler, piyasa şeridi, harita, takvim',
  dunya: 'Dünya görünümü',
  analizTam: 'Analizin tamamı (eylem planı, fikirler, varlık beklentileri)',
  trade: 'Trade: hisse tarayıcısı, grafikler, gündem katalizörleri',
  gecmis: 'Geçmiş analizler ve kaynak kaydı',
  portfoy: 'Portföy tablosu (canlı değer, kâr/zarar)',
  notlar: 'Kişisel notlar (analiz sohbetine girer)',
  web: 'Sohbette web araması',
  tara: '"Şimdi tara" düğmesi',
  sohbet: 'Günlük sohbet mesajı',
  tartisma: 'Günlük hisse tartışması (boğa / ayı / hakem)',
  analizTetik: 'Günlük elle analiz başlatma',
  admin: 'Yönetim paneli',
};
export const DEFAULT_RANKS = {
  temel: { ad: 'Temel', sira: 1, gundem: true, dunya: true, analizTam: false, trade: false, gecmis: false, portfoy: false, notlar: false, web: false, tara: false, sohbet: 0, tartisma: 0, analizTetik: 0, admin: false },
  pro: { ad: 'Pro', sira: 2, gundem: true, dunya: true, analizTam: true, trade: true, gecmis: true, portfoy: true, notlar: true, web: true, tara: false, sohbet: 30, tartisma: 3, analizTetik: 0, admin: false },
  elit: { ad: 'Elit', sira: 3, gundem: true, dunya: true, analizTam: true, trade: true, gecmis: true, portfoy: true, notlar: true, web: true, tara: true, sohbet: 150, tartisma: 10, analizTetik: 5, admin: false },
  yonetici: { ad: 'Yönetici', sira: 4, gundem: true, dunya: true, analizTam: true, trade: true, gecmis: true, portfoy: true, notlar: true, web: true, tara: true, sohbet: 100000, tartisma: 100000, analizTetik: 100000, admin: true },
};
export function ranks(settings = readJSON('settings.json', {})) {
  const out = {};
  for (const [k, def] of Object.entries(DEFAULT_RANKS)) out[k] = { ...def, ...(settings.ranks?.[k] || {}) };
  out.yonetici.admin = true; // yöneticinin panel erişimi kapatılamaz (kendini kilitleme)
  return out;
}

const loadUsers = () => readJSON('users.json', null);
const saveUsers = u => writeJSON('users.json', u);
const hashPw = (pw, salt = randomBytes(16)) => ({ salt: salt.toString('base64'), hash: scryptSync(String(pw), salt, 64, SCRYPT).toString('base64') });
const validName = n => /^[a-z0-9._-]{3,32}$/.test(n);
const checkPw = pw => { if (typeof pw !== 'string' || pw.length < 10) throw new Error('Şifre en az 10 karakter olmalı'); };

// Eski tek kullanıcılı kurulumdan geçiş: admin.json'daki şifre "admin" adlı yönetici üyeye taşınır.
export function users() {
  let u = loadUsers();
  if (!u) {
    const a = readJSON('admin.json', null);
    u = a?.hash ? [{ id: 'u1', ad: 'admin', salt: a.salt, hash: a.hash, rank: 'yonetici', ver: 1, created: Date.now() }] : [];
    saveUsers(u);
  }
  return u;
}
export const hasAnyUser = () => users().length > 0;

function sessionKey() {
  const a = readJSON('admin.json', {});
  if (!a.sessionKey) { a.sessionKey = randomBytes(32).toString('base64'); writeJSON('admin.json', a); }
  return Buffer.from(a.sessionKey, 'base64');
}
const sign = payload => createHmac('sha256', sessionKey()).update(payload).digest('base64url');

export function createUser({ ad, password, rank = 'temel' }) {
  ad = String(ad || '').trim().toLowerCase();
  if (!validName(ad)) throw new Error('Kullanıcı adı 3-32 karakter: küçük harf, rakam, nokta, tire');
  checkPw(password);
  if (!DEFAULT_RANKS[rank]) throw new Error('Geçersiz rütbe');
  const u = users();
  if (u.some(x => x.ad === ad)) throw new Error('Bu kullanıcı adı alınmış');
  const rec = { id: `u${Date.now().toString(36)}${randomBytes(3).toString('hex')}`, ad, ...hashPw(password), rank, ver: 1, created: Date.now() };
  saveUsers([...u, rec]);
  return rec;
}

export function login(ad, password, ip) {
  const a = attempts.get(ip);
  if (a && a.until > Date.now()) return { ok: false, wait: Math.ceil((a.until - Date.now()) / 1000) };
  const u = users().find(x => x.ad === String(ad || '').trim().toLowerCase());
  // Kullanıcı yoksa da aynı süre harcansın (kullanıcı adı tahmini zamanlamadan anlaşılmasın).
  const salt = u ? Buffer.from(u.salt, 'base64') : randomBytes(16);
  const h = scryptSync(String(password), salt, 64, SCRYPT);
  const ok = !!u && !u.disabled && timingSafeEqual(h, Buffer.from(u.hash, 'base64'));
  if (!ok) {
    const n = (a?.n || 0) + 1;
    attempts.set(ip, { n, until: n >= 5 ? Date.now() + Math.min(2 ** (n - 5), 60) * 60_000 : 0 });
    return { ok: false };
  }
  attempts.delete(ip);
  const all = users(); const me = all.find(x => x.id === u.id); me.lastLogin = Date.now(); saveUsers(all);
  return { ok: true, user: u };
}

export function issueCookie(user, secure) {
  const exp = Date.now() + SESSION_HOURS * 3600_000;
  const payload = `${exp}.${user.id}.${user.ver || 1}.${randomBytes(6).toString('base64url')}`;
  return `radar_s=${payload}.${sign(payload)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_HOURS * 3600}${secure ? '; Secure' : ''}`;
}
export const clearCookie = 'radar_s=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0';

// Salt okunur API anahtarları (ToolJet, Grafana, Excel gibi dış araçlar için). Anahtar yalnızca üretilirken
// gösterilir; diskte SHA-256 özeti durur. Biçim: rdr_<kimlik>_<gizli>. Anahtarla yalnızca GET istekleri yapılır.
const sha = x => createHash('sha256').update(x).digest('hex');
export function createToken(uid, name) {
  const all = users(); const u = all.find(x => x.id === uid);
  if (!u) throw new Error('Üye bulunamadı');
  u.tokens ||= [];
  if (u.tokens.length >= 5) throw new Error('En fazla 5 anahtar; önce birini sil');
  const id = randomBytes(4).toString('hex'), secret = randomBytes(24).toString('base64url');
  u.tokens.push({ id, name: String(name || 'araç').slice(0, 40), hash: sha(secret), created: Date.now(), last: null });
  saveUsers(all);
  return `rdr_${id}_${secret}`;
}
export function deleteToken(uid, id) {
  const all = users(); const u = all.find(x => x.id === uid);
  if (u?.tokens) { u.tokens = u.tokens.filter(t => t.id !== id); saveUsers(all); }
}
export const listTokens = uid => (users().find(x => x.id === uid)?.tokens || []).map(({ hash, ...t }) => t);
function tokenUser(header) {
  const m = /^Bearer\s+rdr_([0-9a-f]{8})_([A-Za-z0-9_-]{20,})$/.exec(header || '');
  if (!m) return null;
  const all = users();
  for (const u of all) {
    const t = u.tokens?.find(x => x.id === m[1]);
    if (!t) continue;
    const a = Buffer.from(sha(m[2])), b = Buffer.from(t.hash);
    if (u.disabled || a.length !== b.length || !timingSafeEqual(a, b)) return null;
    if (!t.last || Date.now() - t.last > 60e3) { t.last = Date.now(); saveUsers(all); }
    const R = ranks();
    return { id: u.id, ad: u.ad, rank: u.rank, rutbe: R[u.rank] || R.temel, readonly: true };
  }
  return null;
}

// Çerezden (ya da "Authorization: Bearer rdr_..." başlığından) oturumdaki üye; rütbe ve özellikleriyle, yoksa null.
export function currentUser(req) {
  if (req.headers.authorization) return tokenUser(req.headers.authorization);
  const m = /(?:^|;\s*)radar_s=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return null;
  const parts = m[1].split('.');
  if (parts.length !== 5) return null;
  const payload = parts.slice(0, 4).join('.');
  const good = sign(payload);
  if (good.length !== parts[4].length || !timingSafeEqual(Buffer.from(good), Buffer.from(parts[4]))) return null;
  if (Number(parts[0]) < Date.now()) return null;
  const u = users().find(x => x.id === parts[1]);
  if (!u || u.disabled || String(u.ver || 1) !== parts[2]) return null;
  const R = ranks();
  return { id: u.id, ad: u.ad, rank: u.rank, rutbe: R[u.rank] || R.temel };
}

// Günlük kullanım sayaçları (İstanbul günü): sohbet mesajı ve elle analiz.
const trDay = t => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
export function usage(uid) {
  const u = readJSON('usage.json', {});
  const today = trDay(Date.now());
  return u[uid]?.day === today ? u[uid] : { day: today, sohbet: 0, analizTetik: 0, tartisma: 0 };
}
export function useQuota(user, kind) {
  const limit = user.rutbe[kind] || 0;
  const all = readJSON('usage.json', {});
  const cur = usage(user.id);
  cur[kind] ||= 0;
  if (cur[kind] >= limit) return { ok: false, limit, used: cur[kind] };
  all[user.id] = { ...cur, [kind]: cur[kind] + 1 };
  writeJSON('usage.json', all);
  return { ok: true, limit, used: cur[kind] + 1 };
}

// Model çağrılmadan biten istekte (sağlayıcı yok, hisse yok, bütçe dolu) hak geri verilir.
export function refundQuota(user, kind) {
  const all = readJSON('usage.json', {});
  const cur = usage(user.id);
  if (cur[kind] > 0) { all[user.id] = { ...cur, [kind]: cur[kind] - 1 }; writeJSON('usage.json', all); }
}

// Yönetim işlemleri
export function listUsers() {
  return users().map(({ salt, hash, ...u }) => ({ ...u, usage: usage(u.id) }));
}
export function updateUser(id, { rank, disabled, password }, actor) {
  const all = users();
  const u = all.find(x => x.id === id);
  if (!u) throw new Error('Üye bulunamadı');
  const admins = all.filter(x => x.rank === 'yonetici' && !x.disabled);
  const losingAdmin = u.rank === 'yonetici' && ((rank && rank !== 'yonetici') || disabled);
  if (losingAdmin && admins.length <= 1) throw new Error('Son yönetici düşürülemez ya da kapatılamaz');
  if (id === actor?.id && (disabled || (rank && rank !== u.rank))) throw new Error('Kendi rütbeni ya da hesabını buradan değiştiremezsin');
  if (rank) { if (!DEFAULT_RANKS[rank]) throw new Error('Geçersiz rütbe'); u.rank = rank; }
  if (disabled != null) u.disabled = !!disabled;
  if (password) { checkPw(password); Object.assign(u, hashPw(password)); }
  u.ver = (u.ver || 1) + 1; // açık oturumlar düşer
  saveUsers(all);
}
export function deleteUser(id, actor) {
  const all = users();
  const u = all.find(x => x.id === id);
  if (!u) return;
  if (id === actor?.id) throw new Error('Kendi hesabını silemezsin');
  if (u.rank === 'yonetici' && all.filter(x => x.rank === 'yonetici').length <= 1) throw new Error('Son yönetici silinemez');
  saveUsers(all.filter(x => x.id !== id));
}
export function changeOwnPassword(id, oldPw, newPw) {
  const u = users().find(x => x.id === id);
  if (!u) throw new Error('Üye bulunamadı');
  const h = scryptSync(String(oldPw), Buffer.from(u.salt, 'base64'), 64, SCRYPT);
  if (!timingSafeEqual(h, Buffer.from(u.hash, 'base64'))) throw new Error('Mevcut şifre yanlış');
  updateUser(id, { password: newPw }, null);
  return users().find(x => x.id === id);
}

// Davet kodları: rütbe, kullanım sayısı ve son geçerlilik tarihiyle. Kod yalnızca oluşturulurken gösterilir.
export function createInvite({ rank = 'temel', uses = 1, days = 7 }, actor) {
  if (!DEFAULT_RANKS[rank] || rank === 'yonetici') throw new Error('Davetle yönetici oluşturulamaz');
  const code = randomBytes(9).toString('base64url');
  const inv = readJSON('invites.json', []);
  inv.push({ code, rank, uses: Math.max(1, Math.min(100, uses | 0)), used: 0, exp: Date.now() + Math.max(1, Math.min(90, days | 0)) * 864e5, by: actor?.ad, created: Date.now() });
  writeJSON('invites.json', inv);
  return code;
}
export const listInvites = () => readJSON('invites.json', []).filter(i => i.exp > Date.now() && i.used < i.uses);
export const deleteInvite = code => writeJSON('invites.json', readJSON('invites.json', []).filter(i => i.code !== code));

export function register({ ad, password, code }) {
  const inv = readJSON('invites.json', []);
  const i = inv.find(x => x.code === String(code || '').trim());
  if (!i || i.exp < Date.now() || i.used >= i.uses) throw new Error('Davet kodu geçersiz ya da süresi dolmuş');
  const user = createUser({ ad, password, rank: i.rank });
  i.used++;
  writeJSON('invites.json', inv);
  return user;
}

// İlk kurulum: hiç üye yokken, sunucu konsolundaki anahtarla ilk yönetici oluşturulur.
export function setupFirst({ ad, password }) {
  if (hasAnyUser()) throw new Error('Kurulum zaten yapılmış');
  return createUser({ ad: ad || 'admin', password, rank: 'yonetici' });
}
