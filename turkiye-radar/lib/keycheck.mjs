// Sık yapılan hata: API anahtarı alanına Base URL yapıştırmak ya da tarayıcının şifre yöneticisinin alanı doldurması.
export function checkKey(key, p) {
  if (!key) return null; // boş = mevcut anahtar değişmesin
  if (/:\/\/|^www\.|\.(com|ai|io|net|org)(\/|$)/i.test(key)) return 'API anahtarı alanına bir adres girilmiş görünüyor (ör. https://api.deepseek.com). Adres "Base URL" alanına, anahtar (DeepSeek için sk- ile başlar) "API anahtarı" alanına yazılmalı.';
  if (/\s/.test(key)) return 'API anahtarında boşluk var; anahtarı tek parça olarak yapıştırın.';
  if (/deepseek\.com/i.test(p.baseUrl) && !/^sk-/.test(key)) return 'DeepSeek anahtarı "sk-" ile başlar. platform.deepseek.com → API keys bölümünden kopyalayın.';
  if (p.kind === 'anthropic' && !/^sk-ant-/.test(key)) return 'Anthropic anahtarı "sk-ant-" ile başlar.';
  return null;
}
