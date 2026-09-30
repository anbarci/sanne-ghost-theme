// Çok sağlayıcılı LLM katmanı. Üç adaptör tüm pazarı kapsar:
//  - anthropic : resmi @anthropic-ai/sdk
//  - openai    : OpenAI uyumlu /chat/completions (OpenAI, OpenRouter, DeepSeek, Groq, Mistral, xAI, Together, Ollama, LM Studio...)
//  - gemini    : Google Generative Language API
import Anthropic from '@anthropic-ai/sdk';

export const PRESETS = [
  { kind: 'anthropic', name: 'Anthropic Claude', baseUrl: '', model: 'claude-opus-5-5', models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5', 'claude-fable-5-1'] },
  { kind: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  { kind: 'openai', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { kind: 'openai', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
  { kind: 'openai', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
  { kind: 'openai', name: 'Mistral', baseUrl: 'https://api.mistral.ai/v1' },
  { kind: 'openai', name: 'xAI Grok', baseUrl: 'https://api.x.ai/v1' },
  { kind: 'openai', name: 'Together', baseUrl: 'https://api.together.xyz/v1' },
  { kind: 'openai', name: 'Ollama (yerel, gizli)', baseUrl: 'http://localhost:11434/v1', noKey: true },
  { kind: 'openai', name: 'LM Studio (yerel, gizli)', baseUrl: 'http://localhost:1234/v1', noKey: true },
  { kind: 'gemini', name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
];

// Anthropic birinci taraf fiyatları ($/1M token, girdi/çıktı). Diğer sağlayıcılarda sadece token sayısı gösterilir.
const PRICE = { 'claude-opus-5-5': [4, 20], 'claude-sonnet-5-5': [2, 10], 'claude-haiku-4-5': [1, 5], 'claude-fable-5-1': [10, 50] };
export const costUSD = (model, u) => (PRICE[model] ? (u.in * PRICE[model][0] + u.out * PRICE[model][1] + (u.cacheRead || 0) * PRICE[model][0] * 0.1 + (u.cacheWrite || 0) * PRICE[model][0] * 2) / 1e6 : null);

// Reddedilen isteği başka modelde yeniden deneyen sunucu tarafı yedek; bu modellerde varsayılan açık.
const FALLBACK_MODELS = /^claude-(opus-5|sonnet-5-5|fable-5-1)/;

export async function complete(p, key, system, user, schema) {
  if (p.kind === 'anthropic') return anthropic(p, key, system, user, schema);
  if (p.kind === 'gemini') return gemini(p, key, system, user);
  return openaiCompat(p, key, system, user);
}

async function anthropic(p, key, system, user, schema) {
  const client = new Anthropic({ apiKey: key, timeout: 180_000, maxRetries: 2 });
  const req = {
    model: p.model,
    max_tokens: p.maxTokens || 6000,
    // Sabit sistem metni önbelleklenir; her çağrıda sadece değişen veri özeti ücretlendirilir.
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral', ttl: '1h' } }],
    messages: [{ role: 'user', content: user }],
    output_config: { format: { type: 'json_schema', schema } },
  };
  // Haiku 4.5 "effort" parametresini kabul etmiyor; diğer güncel modellerde maliyet/kalite ayarı budur.
  if (!/haiku/.test(p.model)) req.output_config.effort = p.effort || 'medium';
  if (FALLBACK_MODELS.test(p.model)) { req.betas = ['server-side-fallback-2026-07-01']; req.fallbacks = 'default'; }
  const r = await client.beta.messages.create(req);
  if (r.stop_reason === 'refusal') throw new Error(`Model yanıt vermeyi reddetti (${r.stop_details?.category || 'bilinmiyor'})`);
  if (r.stop_reason === 'max_tokens') throw new Error('Çıktı max_tokens sınırında kesildi; admin panelinden artırın');
  const text = r.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return { text, model: r.model, usage: { in: r.usage.input_tokens, out: r.usage.output_tokens, cacheRead: r.usage.cache_read_input_tokens || 0, cacheWrite: r.usage.cache_creation_input_tokens || 0 } };
}

async function openaiCompat(p, key, system, user) {
  const body = {
    model: p.model, max_tokens: p.maxTokens || 6000, temperature: 0.3,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    response_format: { type: 'json_object' },
  };
  const headers = { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) };
  const url = p.baseUrl.replace(/\/$/, '') + '/chat/completions';
  let r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(180_000) });
  if (r.status === 400) { // bazı sağlayıcılar response_format desteklemiyor: onsuz tekrar dene
    delete body.response_format;
    r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(180_000) });
  }
  if (!r.ok) throw new Error(`${p.name || 'sağlayıcı'} HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return { text: j.choices?.[0]?.message?.content || '', model: j.model || p.model, usage: { in: j.usage?.prompt_tokens || 0, out: j.usage?.completion_tokens || 0, cacheRead: j.usage?.prompt_tokens_details?.cached_tokens || 0 } };
}

async function gemini(p, key, system, user) {
  const url = `${(p.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '')}/models/${encodeURIComponent(p.model)}:generateContent`;
  const r = await fetch(url, {
    method: 'POST', signal: AbortSignal.timeout(180_000),
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: p.maxTokens || 6000, temperature: 0.3 },
    }),
  });
  if (!r.ok) throw new Error(`Gemini HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return { text: j.candidates?.[0]?.content?.parts?.map(x => x.text).join('') || '', model: p.model, usage: { in: j.usageMetadata?.promptTokenCount || 0, out: j.usageMetadata?.candidatesTokenCount || 0, cacheRead: j.usageMetadata?.cachedContentTokenCount || 0 } };
}

// Modeller bazen JSON'u ``` içine sarar ya da başına açıklama ekler: ilk { ... son } aralığını al.
export function parseJSON(text) {
  try { return JSON.parse(text); } catch {}
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(text.slice(a, b + 1));
  throw new Error('Model geçerli JSON döndürmedi');
}
