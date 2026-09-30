// Tek kullanıcılı admin girişi: scrypt hash, imzalı httpOnly çerez, giriş denemesi sınırı.
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import { readJSON, writeJSON } from './store.mjs';

const SESSION_HOURS = 12;
const attempts = new Map(); // ip -> {n, until}

export const hasAdmin = () => !!readJSON('admin.json', null)?.hash;

export function setPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 10) throw new Error('Şifre en az 10 karakter olmalı');
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, 64, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const prev = readJSON('admin.json', {});
  // Oturum anahtarı şifre değişince yenilenir; eski oturumlar düşer.
  writeJSON('admin.json', { ...prev, salt: salt.toString('base64'), hash: hash.toString('base64'), sessionKey: randomBytes(32).toString('base64') });
}

export function checkPassword(pw, ip) {
  const a = attempts.get(ip);
  if (a && a.until > Date.now()) return { ok: false, wait: Math.ceil((a.until - Date.now()) / 1000) };
  const rec = readJSON('admin.json', null);
  if (!rec) return { ok: false };
  const hash = scryptSync(String(pw), Buffer.from(rec.salt, 'base64'), 64, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const ok = timingSafeEqual(hash, Buffer.from(rec.hash, 'base64'));
  if (!ok) {
    const n = (a?.n || 0) + 1;
    attempts.set(ip, { n, until: n >= 5 ? Date.now() + Math.min(2 ** (n - 5), 60) * 60_000 : 0 });
  } else attempts.delete(ip);
  return { ok };
}

function sign(payload) {
  const key = Buffer.from(readJSON('admin.json', {}).sessionKey || '', 'base64');
  return createHmac('sha256', key).update(payload).digest('base64url');
}

export function issueCookie(secure) {
  const exp = Date.now() + SESSION_HOURS * 3600_000;
  const payload = `${exp}.${randomBytes(9).toString('base64url')}`;
  return `radar_s=${payload}.${sign(payload)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_HOURS * 3600}${secure ? '; Secure' : ''}`;
}

export function isAuthed(req) {
  // Kurulum yapılmadan imza anahtarı yok: boş anahtarla sahte çerez üretilmesin.
  if (!readJSON('admin.json', null)?.sessionKey) return false;
  const m = /(?:^|;\s*)radar_s=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return false;
  const parts = m[1].split('.');
  if (parts.length !== 3) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const good = sign(payload);
  if (good.length !== parts[2].length || !timingSafeEqual(Buffer.from(good), Buffer.from(parts[2]))) return false;
  return Number(parts[0]) > Date.now();
}

export const clearCookie = 'radar_s=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0';
