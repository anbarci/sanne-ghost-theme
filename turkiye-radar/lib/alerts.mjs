// Telegram uyarıları: FLASH ve PRIORITY olaylar, tekrar etmeden ve saatte en fazla 12 mesaj.
import { readJSON, writeJSON, getSecret } from './store.mjs';
import { hash } from './rss.mjs';

const ICON = { FLASH: '🔴', PRIORITY: '🟠', ROUTINE: '🔵' };

export async function sendTelegram(settings, text) {
  const token = getSecret(settings, 'TELEGRAM_BOT_TOKEN');
  const chat = settings.telegram.chatId || getSecret(settings, 'TELEGRAM_CHAT_ID');
  if (!token || !chat) throw new Error('Telegram token veya chat id eksik');
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(10000),
    body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000), disable_web_page_preview: true }),
  });
  if (!r.ok) throw new Error(`Telegram HTTP ${r.status}`);
}

export async function dispatchAlerts(snap, settings, analysis) {
  if (!settings.telegram.enabled) return;
  const log = readJSON('alerts.json', { sent: {}, recent: [] });
  const hourAgo = Date.now() - 3600e3;
  log.recent = log.recent.filter(t => t > hourAgo);
  const fresh = (snap.delta?.events || []).filter(e => e.tier !== 'ROUTINE' && !log.sent[hash(e.text)]);
  const msgs = fresh.map(e => `${ICON[e.tier]} ${e.tier}\n${e.text}`);
  if (analysis?.result && settings.telegram.sendAnalysis) {
    const r = analysis.result;
    msgs.push(`🧭 Analiz (${analysis.model})\n${r.ozet}\n\n🔴 ${r.kotumser.yorum}\n🟢 ${r.iyimser.yorum}\n⚪ ${r.tarafsiz.yorum}`);
  }
  for (const m of msgs) {
    if (log.recent.length >= 12) break;
    try { await sendTelegram(settings, m); log.recent.push(Date.now()); } catch (e) { console.warn('[telegram]', e.message); break; }
  }
  for (const e of fresh) log.sent[hash(e.text)] = Date.now();
  for (const [k, t] of Object.entries(log.sent)) if (Date.now() - t > 3 * 864e5) delete log.sent[k];
  writeJSON('alerts.json', log);
}
