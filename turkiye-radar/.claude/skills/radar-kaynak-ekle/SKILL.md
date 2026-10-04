---
name: radar-kaynak-ekle
description: Türkiye Radar'a yeni veri kaynağı (API, RSS, kazıma) ekleme. "kaynak ekle", "yeni API bağla", "şu siteyi de çek", "veri kaynağı" denince kullan.
---

# Radar'a kaynak ekleme

## Sözleşme
`sources/*.mjs` içinde bir nesne dışa aktar ve `sources/index.mjs`'teki `SOURCES` dizisine ekle:

```js
export const ornek = {
  id: 'ornek',              // benzersiz, küçük harf
  name: 'Örnek (açıklama)', // panelde görünür
  group: 'türkiye',         // piyasa | türkiye | afet | haber | makro
  ttlMin: 30,               // veri bu kadar dakika tazeyse tekrar çekilmez
  needs: ['ORNEK_API_KEY'], // anahtar gerekmiyorsa bu alanı yazma
  async run({ settings, secret }) { /* ... */ return data; },
};
```

## Kurallar
1. Her istek `lib/http.mjs` içindeki `fetchx` ile yapılır: zaman aşımı, boyut sınırı, 1254 kodlaması orada çözülüyor. Çıplak `fetch` kullanma. Tek istisna, yanıt başlığı gereken istekler (EPİAŞ TGT gibi).
2. **Sessiz başarısızlık yasak.** Bütün alt istekler başarısızsa `throw` et. Boş sonucu "✓" diye göstermek, ağ engellendiğinde bulunan gerçek bir hataydı.
3. Anahtarı URL'ye değil, API izin veriyorsa başlığa koy (EVDS3: `headers: { key }`).
4. Sayıları `+x` ile sayıya çevir. Dış kaynaktan gelen metin arayüze sadece `esc()` üzerinden gider.
5. Harita için konum varsa `{lat, lon}` döndür. Haber benzeri öğeler `{id, title, link, ts, src, srcName, stance, cat, lang, summary}` biçiminde olmalı ve `lib/sweep.mjs` içindeki `rawNews` dizisine eklenmeli.
6. **Token bütçesi:** AI özetine giren her satır para demek. Yeni kaynağı `lib/ai/analyze.mjs` içindeki `buildDigest`'e **tek satır** olarak ekle. Boşsa satırı hiç yazma.
7. Yerel kaynak kapalı veya ücretliyse küresel açık alternatifini yedek olarak ekle. Örnekler:
   - Deprem: AFAD → EMSC → USGS
   - KAP → Google News
   - CDS → TUR ETF

## Test
`test/pipeline.test.mjs` içindeki sahte `fetch` yönlendiricisine kaynağın gerçekçi bir yanıtını ekle ve sonucu doğrula. Canlı deneme için şunu çalıştır:

```bash
npm run sweep   # kaynak durumlarını ve AI özetinin karakter sayısını basar
npm test
```
