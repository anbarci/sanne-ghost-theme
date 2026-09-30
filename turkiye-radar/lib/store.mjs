// JSON dosya deposu + AES-256-GCM ile şifreli sır saklama. Harici veritabanı yok.
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = process.env.RADAR_DATA_DIR || join(ROOT, 'runtime');
mkdirSync(DATA, { recursive: true });

export function readJSON(name, fallback) {
  try { return JSON.parse(readFileSync(join(DATA, name), 'utf8')); } catch { return fallback; }
}

export function writeJSON(name, obj) {
  const p = join(DATA, name);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p + '.tmp', JSON.stringify(obj));
  renameSync(p + '.tmp', p); // atomik değiştirme: yarım dosya kalmaz
}

// Ana anahtar: RADAR_SECRET ortam değişkeni ya da runtime/.master.key (ilk açılışta üretilir).
function masterKey() {
  if (process.env.RADAR_SECRET) return createHash('sha256').update(process.env.RADAR_SECRET).digest();
  const p = join(DATA, '.master.key');
  if (!existsSync(p)) {
    writeFileSync(p, randomBytes(32).toString('base64'));
    try { chmodSync(p, 0o600); } catch {}
  }
  return Buffer.from(readFileSync(p, 'utf8'), 'base64');
}
const KEY = masterKey();

export function encrypt(plain) {
  if (!plain) return '';
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return 'v1:' + Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}

export function decrypt(blob) {
  if (!blob || !blob.startsWith('v1:')) return '';
  const b = Buffer.from(blob.slice(3), 'base64');
  const d = createDecipheriv('aes-256-gcm', KEY, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}

// Ayarlar: sırlar ("secrets" altındaki her şey) diskte şifreli durur.
const DEFAULTS = {
  intervalMin: 15,
  aiIntervalMin: 60,
  aiMinDelta: 12,          // bu puanın altında değişiklik varsa AI çağrılmaz (token tasarrufu)
  aiDailyUSD: 1,           // 0 = sınırsız
  aiDailyTokens: 300000,   // 0 = sınırsız
  providers: [],           // {id,name,kind,baseUrl,model,effort,maxTokens,secretRef}
  activeProvider: null,
  sources: {},             // {sourceId: false} ile kapatılır
  weights: { geo: 0.25, energy: 0.2, trade: 0.15, finance: 0.2, tourism: 0.05, direct: 0.15 },
  watchlist: ['THYAO.IS', 'ASELS.IS', 'TUPRS.IS', 'BIMAS.IS', 'KCHOL.IS', 'GARAN.IS'],
  evdsSeries: ['TP.DK.USD.A.YTL', 'TP.DK.EUR.A.YTL', 'TP.FG.J0'],
  fetchArticles: 40,       // her taramada tam metni çekilecek en fazla haber
  verifyTop: 12,           // Google News aramasıyla çapraz teyit edilecek en önemli haber sayısı (0 = kapalı)
  telegram: { enabled: false, chatId: '' },
  secrets: {},
};

export function loadSettings() {
  const s = { ...DEFAULTS, ...readJSON('settings.json', {}) };
  s.weights = { ...DEFAULTS.weights, ...s.weights };
  s.telegram = { ...DEFAULTS.telegram, ...s.telegram };
  return s;
}

export function saveSettings(s) { writeJSON('settings.json', s); }

export function getSecret(s, name) {
  if (process.env[name]) return process.env[name]; // .env her zaman önceliklidir
  try { return decrypt(s.secrets?.[name]); } catch { return ''; }
}

export function setSecret(s, name, value) {
  s.secrets ||= {};
  if (value === null || value === '') delete s.secrets[name];
  else s.secrets[name] = encrypt(value);
}

// Admin paneline sırların kendisi değil, sadece "var/yok" bilgisi gider.
export function publicSettings(s) {
  const { secrets, ...rest } = s;
  return { ...rest, secretsSet: Object.keys(secrets || {}) };
}
