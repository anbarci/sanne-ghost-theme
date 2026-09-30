// Çok sağlayıcılı LLM katmanı. Üç adaptör tüm pazarı kapsar:
//  - anthropic : resmi @anthropic-ai/sdk
//  - openai    : OpenAI uyumlu /chat/completions (OpenAI, OpenRouter, DeepSeek, Groq, Mistral, xAI, Together, Ollama, LM Studio...)
//  - gemini    : Google Generative Language API
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../store.mjs';

// deepseek-chat / deepseek-reasoner takma adları 2026-07-24'te kaldırıldı.
export const PRESETS = [
  { kind: 'openai', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', models: ['deepseek-flash', 'deepseek-v4-pro'] },
  { kind: 'anthropic', name: 'Anthropic Claude', baseUrl: '', model: 'claude-opus-5-5', models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5', 'claude-fable-5-1'] },
  { kind: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  { kind: 'openai', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { kind: 'openai', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
  { kind: 'openai', name: 'Mistral', baseUrl: 'https://api.mistral.ai/v1' },
  { kind: 'openai', name: 'xAI Grok', baseUrl: 'https://api.x.ai/v1' },
  { kind: 'openai', name: 'Together', baseUrl: 'https://api.together.xyz/v1' },
  { kind: 'openai', name: 'Ollama (yerel, gizli)', baseUrl: 'http://localhost:11434/v1', noKey: true },
  { kind: 'openai', name: 'LM Studio (yerel, gizli)', baseUrl: 'http://localhost:1234/v1', noKey: true },
  { kind: 'gemini', name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
];

const PRICING = JSON.parse(readFileSync(join(ROOT, 'data/pricing.json'), 'utf8'));
const PRICE_KEYS = Object.keys(PRICING.models).sort((a, b) => b.length - a.length);
const mins = hm => { const [h, m] = hm.split(':'); return +h * 60 + +m; };

export function isOffPeak(at, [from, to] = PRICING.offPeakUTC) {
  const d = new Date(at), now = d.getUTCHours() * 60 + d.getUTCMinutes(), a = mins(from), b = mins(to);
  return a < b ? now >= a && now < b : now >= a || now < b; // gece yarısını aşan pencere
}

// u.in önbelleksiz girdi, u.cacheRead önbellekten okunan, u.cacheWrite (Anthropic 1 saatlik) yazılan token.
// Bilinmeyen modelde null döner; panel sadece token sayısını gösterir.
export function costUSD(model, u, at = Date.now()) {
  const key = PRICE_KEYS.find(k => String(model).includes(k));
  if (!key) return null;
  const base = PRICING.models[key];
  const p = base.offPeak && isOffPeak(at) ? { ...base, ...base.offPeak } : base;
  return (u.in * p.in + u.out * p.out + (u.cacheRead || 0) * (p.cacheRead ?? p.in * 0.1) + (u.cacheWrite || 0) * p.in * 2) / 1e6;
}

// Reddedilen isteği başka modelde yeniden deneyen sunucu tarafı yedek; bu modellerde varsayılan açık.
const FALLBACK_MODELS = /^claude-(opus-5|sonnet-5-5|fable-5-1)/;

// user: tek mesaj (metin) ya da sohbet geçmişi [{ role: 'user'|'assistant', content }].
// schema verilirse JSON çıktı istenir; verilmezse düz metin (sohbet).
const toMsgs = user => (Array.isArray(user) ? user : [{ role: 'user', content: user }]);
export async function complete(p, key, system, user, schema) {
  if (p.kind === 'anthropic') return anthropic(p, key, system, user, schema);
  if (p.kind === 'gemini') return gemini(p, key, system, user, !!schema);
  return openaiCompat(p, key, system, user, !!schema);
}

async function anthropic(p, key, system, user, schema) {
  const client = new Anthropic({ apiKey: key, timeout: 180_000, maxRetries: 2 });
  const req = {
    model: p.model,
    max_tokens: p.maxTokens || 6000,
    // Sabit sistem metni önbelleklenir; her çağrıda sadece değişen veri özeti ücretlendirilir.
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral', ttl: '1h' } }],
    messages: toMsgs(user),
    output_config: schema ? { format: { type: 'json_schema', schema } } : {},
  };
  // Haiku 4.5 "effort" parametresini kabul etmiyor; diğer güncel modellerde maliyet/kalite ayarı budur.
  if (!/haiku/.test(p.model)) req.output_config.effort = p.effort || 'medium';
  if (!Object.keys(req.output_config).length) delete req.output_config; // Haiku ile düz metin sohbet
  if (FALLBACK_MODELS.test(p.model)) { req.betas = ['server-side-fallback-2026-07-01']; req.fallbacks = 'default'; }
  const r = await client.beta.messages.create(req);
  if (r.stop_reason === 'refusal') throw new Error(`Model yanıt vermeyi reddetti (${r.stop_details?.category || 'bilinmiyor'})`);
  if (r.stop_reason === 'max_tokens') throw new Error('Çıktı max_tokens sınırında kesildi; admin panelinden artırın');
  const text = r.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return { text, model: r.model, usage: { in: r.usage.input_tokens, out: r.usage.output_tokens, cacheRead: r.usage.cache_read_input_tokens || 0, cacheWrite: r.usage.cache_creation_input_tokens || 0 } };
}

export const isDeepSeek = p => /deepseek\.com/i.test(p.baseUrl || '');

export function openaiBody(p, system, user, json = true) {
  const body = {
    model: p.model, max_tokens: p.maxTokens || 6000,
    messages: [{ role: 'system', content: system }, ...toMsgs(user)],
    ...(json ? { response_format: { type: 'json_object' } } : {}),
  };
  if (isDeepSeek(p)) {
    // Düşünme kapalıyken hem ucuz hem JSON çıktısı daha kararlı; açılırsa temperature desteklenmiyor.
    if (p.thinking === 'on') { body.thinking = { type: 'enabled' }; body.reasoning_effort = p.effort === 'low' ? 'low' : p.effort === 'medium' ? 'medium' : 'high'; }
    else { body.thinking = { type: 'disabled' }; body.temperature = 0.3; }
  } else body.temperature = 0.3;
  return body;
}

async function post(url, headers, body) {
  for (let i = 0; ; i++) {
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(240_000) });
    if ((r.status === 429 || r.status >= 500) && i < 2) {
      const ra = Number(r.headers.get('retry-after'));
      await new Promise(res => setTimeout(res, (Number.isFinite(ra) && ra > 0 ? Math.min(ra, 20) : 2 ** i * 2) * 1000));
      continue;
    }
    return r;
  }
}

async function openaiCompat(p, key, system, user, json = true) {
  const body = openaiBody(p, system, user, json);
  const headers = { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) };
  const url = p.baseUrl.replace(/\/$/, '') + '/chat/completions';
  let r = await post(url, headers, body);
  if (r.status === 400) { // bazı sağlayıcılar response_format / thinking tanımıyor: onlarsız tekrar dene
    delete body.response_format; delete body.thinking; delete body.reasoning_effort;
    r = await post(url, headers, body);
  }
  if (!r.ok) throw new Error(`${p.name || 'sağlayıcı'} HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const c = j.choices?.[0];
  if (c?.finish_reason === 'length') throw new Error('Çıktı max_tokens sınırında kesildi; admin panelinden artırın');
  if (!c?.message?.content && c?.message?.reasoning_content) throw new Error('Model sadece düşünme metni döndürdü; düşünmeyi kapatın veya max_tokens artırın');
  return { text: c?.message?.content || '', model: j.model || p.model, usage: openaiUsage(j.usage) };
}

// DeepSeek önbellek isabetini prompt_cache_hit_tokens, OpenAI prompt_tokens_details.cached_tokens ile bildirir.
// İkisinde de prompt_tokens önbellekten okunanları içerir; maliyet için ayrılır.
export function openaiUsage(u = {}) {
  const hit = u.prompt_cache_hit_tokens ?? u.prompt_tokens_details?.cached_tokens ?? 0;
  return { in: Math.max(0, (u.prompt_tokens || 0) - hit), out: u.completion_tokens || 0, cacheRead: hit, reasoning: u.completion_tokens_details?.reasoning_tokens || 0 };
}

async function gemini(p, key, system, user, json = true) {
  const url = `${(p.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '')}/models/${encodeURIComponent(p.model)}:generateContent`;
  const r = await fetch(url, {
    method: 'POST', signal: AbortSignal.timeout(180_000),
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: toMsgs(user).map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { ...(json ? { responseMimeType: 'application/json' } : {}), maxOutputTokens: p.maxTokens || 6000, temperature: 0.3 },
    }),
  });
  if (!r.ok) throw new Error(`Gemini HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return { text: j.candidates?.[0]?.content?.parts?.map(x => x.text).join('') || '', model: p.model, usage: { in: Math.max(0, (j.usageMetadata?.promptTokenCount || 0) - (j.usageMetadata?.cachedContentTokenCount || 0)), out: (j.usageMetadata?.candidatesTokenCount || 0) + (j.usageMetadata?.thoughtsTokenCount || 0), cacheRead: j.usageMetadata?.cachedContentTokenCount || 0 } };
}

// Modeller bazen JSON'u ``` içine sarar ya da başına açıklama ekler: ilk { ... son } aralığını al.
export function parseJSON(text) {
  try { return JSON.parse(text); } catch {}
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(text.slice(a, b + 1));
  throw new Error('Model geçerli JSON döndürmedi');
}
