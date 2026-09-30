---
name: radar-denetim
description: Türkiye Radar için güvenlik, gizlilik, token maliyeti ve tasarım denetimi. "denetle", "audit", "güvenli mi", "token harcaması", "yayına almadan önce kontrol" denince kullan.
---

# Radar denetimi

Sırayla çalıştır ve her maddeye geçti/kaldı yaz. Düzeltme önermeden önce kanıt göster.

## 1. Testler
```bash
npm test
```
Hepsi geçmeli. Yeni bir özellik ekleniyorsa teste de bir satır eklenmeli.

## 2. Güvenlik
Sunucuyu geçici bir veri dizinine bağlayıp başlat:
```bash
RADAR_DATA_DIR=$(mktemp -d) PORT=3199 node server.mjs &
```
Sonra şunları kontrol et:
- `curl -s -o /dev/null -w "%{http_code}" localhost:3199/api/data` → **401** dönmeli.
- `curl -X POST localhost:3199/api/login -d '{}'` → **403 CSRF** dönmeli (`x-radar` başlığı yok).
- `curl --path-as-is localhost:3199/../package.json` → **404** dönmeli.
- `curl -D - localhost:3199/` → yanıtta `content-security-policy` ve `referrer-policy: no-referrer` olmalı.
- `/api/admin/settings` yanıtında hiçbir sır değeri olmamalı, sadece `secretsSet` isimleri.
- Varsayılan `HOST` `127.0.0.1` olmalı. `docker-compose.yml` de portu `127.0.0.1:` ile yayınlamalı.
- `grep -n innerHTML public/*.js` çıktısındaki her şablon değişkeni ya `esc()`'ten geçmeli ya da bizim ürettiğimiz bir sayı olmalı.

## 3. Gizlilik (izlenmeyi önleme)
- `grep -rnoE "https?://" public/` çıktısında yalnızca veri linkleri (Resmi Gazete vb.) görünmeli. CDN, Google Fonts veya analitik adresi olmamalı.
- Harita `public/map.json` dosyasından çiziliyor. Harita karosu sunucusu kullanılmamalı.
- Dış linklerde `rel="noopener noreferrer"` olmalı.

## 4. Token maliyeti
- `npm run sweep` sonundaki "AI özeti" satırına bak. Hedef **6000 karakterin altı**, yani yaklaşık 1700 token.
- Yönetim → "Analiz geçmişi" tablosunda şunlar kontrol edilmeli:
  - Anthropic'te 1 saat içindeki ikinci çağrıdan itibaren `Önbellek` sütunu > 0 olmalı.
  - `aiMinDelta` ve `aiIntervalMin` gereksiz çağrıları engellemeli: aynı veriyle ikinci çağrı "Veri değişmedi" diye atlanır.
- Sistem metnine (`SYSTEM`) tarih veya saat gibi değişken bir şey eklenmemeli. Eklenirse önbellek her çağrıda bozulur.

## 5. Tasarım
`public/` için hallmark denetimini çalıştır: `hallmark audit public/index.html`. Özellikle şunlara bak:
- Renkler sadece token üzerinden, satır içi hex yok.
- Sayılarda `tabular-nums` kullanılmış.
- 320, 375 ve 768 px'de yatay kaydırma yok.
- İtalik başlık yok.
- Her butonda `:focus-visible` durumu var.

## 6. Veri dürüstlüğü
- Kaynak hata verdiğinde panelde "hata" görünmeli. Boş veri başarı gibi gösterilmemeli.
- Hesaplanan değerler (gram altın, USDT makası, TUR ETF'nin CDS vekilliği) arayüzde veya ipucunda "hesaplanan" / "vekil" olarak açıklanmalı.
