# Türkiye Radar

Kendi bilgisayarında çalışan, Türkiye merkezli bir haber, piyasa ve risk paneli. Dünyada olup biteni toplar ve her olay için tek bir soruya cevap arar: **bu Türkiye'yi ne kadar, hangi kanaldan etkiler?**

Fikir [Crucix](https://github.com/calesthio/Crucix)'ten geliyor. Kod sıfırdan yazıldı; Crucix'in AGPL kodu kullanılmadı.

## Ne yapar

- **Türkiye Etki Skoru (0-100).** Her haber altı kanalda puanlanır: jeopolitik, enerji, ticaret, finans, turizm, doğrudan. Piyasa gerçekten tepki verdiyse skor yükselir. Örneğin Brent %5 yükseldiyse enerji haberleri öne çıkar. Ağırlıkları yönetim panelinden değiştirebilirsin.
- **Haberin tam metni.** RSS'teki başlıkla yetinmez, en önemli 40 haberin sayfasını açıp asıl metni çıkarır. Başlık içerikle örtüşmüyorsa ya da başlıktaki rakam metinde yoksa "başlık yanıltıcı olabilir" uyarısı gösterir. Örnek: "ŞOK! Emeklilere 50 bin lira" başlığının altında ihale haberi var.
- **Aynı olay tek satır.** On site aynı haberi yazdıysa bir kez gösterilir, yanında "+9 kaynak" yazar.
- **Yayın çizgisi dengesi.** Kaynaklar etiketli: resmi, iktidara yakın, muhalif, bağımsız, ana akım, uluslararası, yabancı devlet. Yapay zekaya giden özet bu çizgilerden sırayla seçilir. Böylece analiz, hangi tarafın haberi çoksa ona kaymaz.
- **Üç bakış açısı.** Aynı veriden kötümser, iyimser ve tarafsız yorum üretir. Her yorum özetteki somut bir rakama ya da habere dayanmak zorunda. Bunlara ek olarak varlık beklentileri (dolar, euro, gram altın, BIST, Brent, BTC) ve kişisel işlem fikirleri gelir.
- **Tahmin karnesi.** Yapay zekanın "USD/TRY 7 günde yükselir, %65" gibi her tahmini kaydedilir. Vade dolunca gerçek fiyatla karşılaştırılır ve Brier skoru hesaplanır. Hangi modelin gerçekten işe yaradığını veriyle görürsün. Dil modellerinin piyasa tahmininde genelde yazı-turadan çok iyi olmadığını unutma: karne bunu açıkça gösterecek.
- **Olağandışı hareket tespiti.** Her varlığın kendi normal günlük oynaklığına göre alarm verir: 1,5 × son bir aydaki ortalama mutlak getiri. Fikir PanWatch'taki ATR% yaklaşımından geliyor. Böylece BTC'nin sıradan %3'lük hareketi alarm üretmez, dolar/TL'nin %1,5'lik hareketi üretir.
- **Uyarılar.** Deprem (M4,5 ve üstü), olağandışı piyasa hareketi ve yüksek etkili haber Telegram'a gider.

## Kurulum

Node.js 22 veya üstü gerekir.

```bash
cd turkiye-radar
npm install --omit=dev
npm start
```

Konsolda bir **kurulum anahtarı** yazar. Tarayıcıda `http://127.0.0.1:3120/admin` adresini aç, bu anahtarla şifreni belirle. Sonra yapay zeka sağlayıcısını ve istediğin API anahtarlarını ekle.

Docker ile:

```bash
cp .env.example .env
docker compose up -d
```

Panel sadece bu makineden erişilebilir (`127.0.0.1`). Telefondan erişmek istersen önüne HTTPS'li bir ters vekil koy (Caddy, Tailscale Serve vb.). Portu doğrudan internete açma.

## Yapay zeka sağlayıcıları

Yönetim panelinde "Hazır ayar" listesinden seçip anahtarı girmen yeterli. Üç adaptör bütün pazarı kapsıyor:

| Tür | Kapsadığı |
|---|---|
| `anthropic` | Claude (resmi SDK). Önbellek ve reddetme yedeği otomatik. |
| `openai` uyumlu | OpenAI, OpenRouter, DeepSeek, Groq, Mistral, xAI, Together, **Ollama**, **LM Studio** |
| `gemini` | Google Gemini |

Tamamen gizli çalışmak istersen Ollama veya LM Studio seç. Bu durumda veri makinenden hiç çıkmaz.

### Token neden az harcanıyor

1. **Tek çağrı.** Üç bakış açısı ayrı ayrı istenmiyor; veri bir kez gönderiliyor.
2. **Sıkıştırılmış özet.** Ham JSON gitmiyor. Yaklaşık 50 satırlık, 6000 karakteri aşmayan bir özet gidiyor (~1700 token).
3. **Önbellek.** Sabit talimat metni Anthropic'te 1 saat önbellekte tutuluyor. Tekrarlanan kısım yaklaşık %90 daha ucuza okunuyor.
4. **Gereksiz çağrı yok.** Veri değişmediyse ya da değişim puanı eşiğin altındaysa çağrı yapılmıyor. Varsayılan en sık saatte bir.
5. **Maliyet görünür.** Her analizin token sayısı ve dolar maliyeti panelde listeleniyor.

Kaba hesap: Claude Opus 5.5 ile analiz başına yaklaşık 3 bin token girdi ve 1,5 bin token çıktı. Bu da analiz başına 4 sent civarı eder. Günde 12 analiz yaklaşık 0,5 dolar tutar. Modelin düşünme token'ları çıktıya eklenir; gerçek rakamı panel gösterir. Daha ucuza indirmek için efor ayarını "low" yap ya da daha küçük bir model seç.

## Veri kaynakları

Anahtar gerekmeyenler ilk açılışta çalışır. "Durum" sütunu şunu gösterir:
- **✓**: Resmi dokümandan doğrulandı.
- **~**: Bilinen uç nokta, ama geliştirme ortamının ağ kısıtı yüzünden canlı denenemedi. İlk çalıştırmada yönetim panelindeki "Veri kaynakları" tablosundan kontrol et.

| Kaynak | Veri | Anahtar | Durum |
|---|---|---|---|
| Yahoo Finance | Dolar, euro, altın, Brent, BIST 100/30/Banka, VIX, DXY, izleme listesi (gecikmeli) | yok | ~ |
| BtcTurk | BTC/TL, USDT/TL (USDT makası buradan hesaplanır) | yok | ~ |
| TCMB `today.xml` | Gösterge kurlar | yok | ~ |
| TCMB EVDS3 | İstediğin seri: kur, TÜFE, rezerv… | ücretsiz | ✓ (anahtar HTTP başlığında) |
| EPİAŞ Şeffaflık 2.0 | Elektrik piyasa takas fiyatı (PTF) | ücretsiz üyelik | ✓ (TGT girişi) |
| Resmi Gazete | Günün mevzuat başlıkları | yok | ~ |
| AFAD → Kandilli → EMSC → USGS | Depremler, kurumlar arası birleştirilmiş | yok | ✓ AFAD |
| 44 RSS akışı | Yerli + dünya basını, yayın çizgisi etiketli | yok | ~ |
| GDELT | Dünya basınında Türkiye haberleri ve ton | yok | ~ |
| Dünya Bankası + IMF | Enflasyon, büyüme, cari denge, işsizlik ve IMF tahminleri | yok | ~ |
| FRED | Fed faizi, ABD 10 yıllık, dolar endeksi, yüksek getiri spreadi | ücretsiz | ~ |
| NASA FIRMS | Türkiye'deki aktif yangınlar | ücretsiz | ~ |
| Open-Meteo | 8 ilde hava ve fırtına/aşırı sıcak uyarısı | yok | ~ |

Yerelde erişilemeyen kaynaklar için kullanılan küresel alternatifler:

| Yerel kaynak | Sorun | Yerine |
|---|---|---|
| KAP | Veri yayını ücretli, Borsa İstanbul sözleşmesi gerekiyor | İzleme listendeki hisseler için Google News (TR) |
| TÜİK API | Anahtar için Türk hattıyla SMS doğrulaması gerekiyor | Dünya Bankası + IMF (anahtarsız), EVDS'deki TÜFE serisi |
| Türkiye 5 yıllık CDS | Ücretsiz ve güvenilir API yok | iShares MSCI Turkey ETF (TUR, USD). Yabancı iştahının vekili, CDS'nin kendisi değil. |
| MGM | Resmi API yok | Open-Meteo |
| Kandilli | Resmi API yok, sayfa kazınıyor | AFAD ana kaynak, EMSC yedek |

**Gram altın** hesaplanan bir değerdir: ons × USD/TRY / 31,1035. Kuyumcu ve Kapalıçarşı fiyatı makas ve işçilik yüzünden bundan farklı olur.

## Gizlilik ve güvenlik

- Harici CDN, font veya analitik yok. Harita çevrimdışı çizilir (Natural Earth verisinden üretilen `public/map.json`).
- `Referrer-Policy: no-referrer`: habere tıkladığında haber sitesi panelin adresini görmez.
- Tüm veri ve API uçları giriş ister. Şifre scrypt ile saklanır. Oturum çerezi imzalı, `HttpOnly` ve `SameSite=Strict`. Beş hatalı denemeden sonra kilitlenir.
- API anahtarları diskte AES-256-GCM ile şifrelidir. Ana anahtar `runtime/.master.key` dosyasında ya da `RADAR_SECRET` ortam değişkenindedir.
- Durum değiştiren her istek özel bir başlık ister (CSRF koruması). Sıkı bir CSP tanımlı, satır içi betik yok.
- Sunucunun kendi yaptığı isteklerde (haber siteleri, API'ler) senin IP adresin görünür. Bunu gizlemek istiyorsan sunucuyu VPN arkasında çalıştır.

## Bilinen sınırlar

- Yahoo Finance resmi bir API değil. Kural değiştirirse piyasa verisi kesilebilir; kaynak durum tablosunda "hata" olarak görünür.
- Başlık-içerik uyumu kelime örtüşmesine dayanır. Çok kısa ya da yalnızca meta açıklaması olan haberlerde ölçüm yapılmaz.
- Google News linkleri yönlendirme sayfası olduğu için bu haberlerin tam metni çoğu zaman çıkmaz; RSS özeti kullanılır.
- Yayın çizgisi etiketleri bir başlangıç önerisidir. Kendi değerlendirmene göre panelden değiştir.
- İşlem fikirleri model çıktısıdır, yatırım tavsiyesi değildir.

## Geliştirme

```bash
npm test          # birim + sahte ağla uçtan uca testler
npm run sweep     # sunucusuz tek tarama; kaynak durumları + AI özeti uzunluğu
npm run build:map # haritayı yeniden üret (devDependencies gerekir)
```

Claude Code skill'leri `.claude/skills/` altında:

| Skill | Ne için |
|---|---|
| `radar-kaynak-ekle` | Yeni kaynak ekleme kuralları ve test yöntemi |
| `radar-denetim` | Güvenlik, gizlilik, token maliyeti ve tasarım kontrol listesi |
| `hallmark` | Arayüzün "yapay zeka yapmış" gibi görünmemesi için tasarım kuralları ([nutlope/hallmark](https://github.com/nutlope/hallmark), MIT, olduğu gibi eklendi) |

Denetlenip repoya eklenmeyenler:

- **[anidoodle](https://github.com/alexgreensh/anidoodle)** (Apache 2.0): 348 betik ve 6,7 MB. Radarın çalışmasıyla ilgisi yok. Logo veya tanıtım animasyonu istersen kullanıcı düzeyinde kur.
- **[token-optimizer](https://github.com/alexgreensh/token-optimizer)** (PolyForm Noncommercial; kişisel kullanım serbest): Claude Code'a hook kurar ve `~/.claude` altındaki tüm oturum kayıtlarını okur. Gizlilik politikası "sıfır ağ çağrısı" der, ama kendi panosu Google Fonts'tan dosya çekiyor. Bu uygulamanın çalışma zamanı token'larına etkisi yoktur, geliştirme sırasında Claude Code'un harcamasını azaltır. Kurmak istersen kendi README'sine göre kullanıcı düzeyinde kur.

## Teşekkür

- RSS listesinin çıkış noktası: [bakinazik/rss](https://github.com/bakinazik/rss). Oradaki adresler kullanıldı; tasarım kodu kopyalanmadı, çünkü repoda lisans yok.
- Fikir: [Crucix](https://github.com/calesthio/Crucix)
- Olağandışı hareket eşiği fikri: [PanWatch](https://github.com/TNT-Likely/PanWatch)
- Harita verisi: Natural Earth, [world-atlas](https://github.com/topojson/world-atlas) paketi üzerinden
