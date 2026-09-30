// Tek fetch katmanı: zaman aşımı, boyut sınırı, tekrar deneme, kısa ömürlü önbellek.
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36';
const MAX_BYTES = 2_000_000;
const cache = new Map(); // url -> { t, v }

export async function fetchx(url, { timeout = 12000, retries = 1, headers = {}, method = 'GET', body, as = 'auto', ttl = 0, maxBytes = MAX_BYTES } = {}) {
  const key = method === 'GET' && ttl ? url : null;
  if (key) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.t < ttl) return hit.v;
  }
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeout);
    try {
      const res = await fetch(url, {
        method, body, signal: ac.signal, redirect: 'follow',
        headers: { 'user-agent': UA, 'accept-language': 'tr-TR,tr;q=0.9,en;q=0.8', ...headers },
      });
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} ${url}`);
        err.status = res.status;
        if (res.status < 500 && res.status !== 429) throw err; // 4xx: tekrar denemenin anlamı yok
        const ra = Number(res.headers.get('retry-after'));
        throw Object.assign(err, { retry: true, wait: Number.isFinite(ra) && ra > 0 ? Math.min(ra, 10) * 1000 : 0 });
      }
      const buf = await readCapped(res, maxBytes);
      const ctype = res.headers.get('content-type') || '';
      const text = decode(buf, ctype);
      const v = as === 'text' || (as === 'auto' && !/json/.test(ctype)) ? text : JSON.parse(text);
      if (key) cache.set(key, { t: Date.now(), v });
      return v;
    } catch (e) {
      lastErr = e;
      if (e.status && !e.retry) break;
      if (i < retries) await sleep(e.wait || 600 * 2 ** i);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

async function readCapped(res, max) {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { reader.cancel(); break; }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

// Bazı Türk siteleri hâlâ windows-1254 / iso-8859-9 kullanıyor.
function decode(buf, ctype) {
  let cs = /charset=([\w-]+)/i.exec(ctype)?.[1];
  if (!cs) {
    const head = Buffer.from(buf.subarray(0, 1024)).toString('latin1');
    cs = /encoding=["']([\w-]+)/i.exec(head)?.[1] || /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  }
  try { return new TextDecoder(cs || 'utf-8').decode(buf); } catch { return new TextDecoder().decode(buf); }
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

// Basit eşzamanlılık sınırlayıcı: aynı anda en fazla n iş.
export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await fn(items[idx], idx); } catch (e) { out[idx] = { error: e.message }; }
    }
  }));
  return out;
}
