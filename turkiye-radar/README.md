# Türkiye Radar

Kendi bilgisayarında çalışan, Türkiye merkezli bir haber, piyasa ve risk paneli. Dünyada olup biteni toplar ve her olay için tek bir soruya cevap arar: **bu Türkiye'yi ne kadar, hangi kanaldan etkiler?**

Fikir [Crucix](https://github.com/calesthio/Crucix)'ten geliyor. Kod sıfırdan yazıldı; Crucix'in AGPL kodu kullanılmadı.

## Ne yapar

- **Türkiye Etki Skoru (0-100).** Her haber altı kanalda puanlanır: jeopolitik, enerji, ticaret, finans, turizm, doğrudan. Piyasa gerçekten tepki verdiyse skor yükselir. Örneğin Brent %5 yükseldiyse enerji haberleri öne çıkar. Ağırlıkları yönetim panelinden değiştirebilirsin.
- **Haberin tam metni.** RSS'teki başlıkla yetinmez, en önemli 40 haberin sayfasını açıp asıl metni çıkarır. Sıra: sayfadaki JSON-LD `articleBody`, sonra Mozilla Readability (Firefox okuma modunun kütüphanesi), sonra paragraf taraması, en son meta açıklama. Çıkamayanların nedeni (JS ile yüklenen sayfa, HTTP 403 vb.) yönetim panelinde listelenir. Başlık içerikle örtüşmüyorsa ya da başlıktaki rakam metinde yoksa "başlık yanıltıcı olabilir" uyarısı gösterir. Örnek: "ŞOK! Emeklilere 50 bin lira" başlığının altında ihale haberi var.
- **Aynı olay tek satır.** On site aynı haberi yazdıysa bir kez gösterilir, yanında "+9 kaynak" yazar.
- **Yayın çizgisi dengesi.** Kaynaklar etiketli: resmi, iktidara yakın, muhalif, bağımsız, ana akım, uluslararası, yabancı devlet. Yapay zekaya giden özet bu çizgilerden sırayla seçilir. Böylece analiz, hangi tarafın haberi çoksa ona kaymaz.
- **Üç bakış açısı.** Aynı veriden kötümser, iyimser ve tarafsız yorum üretir. Her yorum özetteki somut bir rakama ya da habere dayanmak zorunda. Bunlara ek olarak varlık beklentileri (dolar, euro, gram altın, BIST, Brent, BTC) ve kişisel işlem fikirleri gelir.
- **Tahmin karnesi.** Yapay zekanın "USD/TRY 7 günde yükselir, %65" gibi her tahmini kaydedilir. Vade dolunca gerçek fiyatla karşılaştırılır ve Brier skoru hesaplanır. Hangi modelin gerçekten işe yaradığını veriyle görürsün. Dil modellerinin piyasa tahmininde genelde yazı-turadan çok iyi olmadığını unutma: karne bunu açıkça gösterecek.
- **Olağandışı hareket tespiti.** Her varlığın kendi normal günlük oynaklığına göre alarm verir: 1,5 × son bir aydaki ortalama mutlak getiri. Fikir PanWatch'taki ATR% yaklaşımından geliyor. Böylece BTC'nin sıradan %3'lük hareketi alarm üretmez, dolar/TL'nin %1,5'lik hareketi üretir.
- **Günlük bütçe.** Günlük dolar ve token sınırı var (varsayılan 1 $ ve 300 bin token). Dolunca analiz durur, elle tetiklense bile.
- **Uyarılar.** Deprem (M4,5 ve üstü), olağandışı piyasa hareketi ve yüksek etkili haber Telegram'a gider.

## Hisse tarayıcısı ve grafikler

61 likit BIST hissesi (`data/bist-universe.json`) için 2 yıllık günlük veri çekilir ve üç stratejiyle sıralanır:

| Strateji | Ne arar |
|---|---|
| Trend ve momentum | 50/200 günlük ortalamanın üstünde, son 3 ayda güçlü, endeksi geçen, RSI 50-68, hacim artışı, 52 hafta zirvesine yakın |
| Düşüş sonrası toparlanma | Son 1 ayda en çok düşen ama 200 günlük ortalamanın üstünde kalan, aşırı satımda ve MACD'si dönen |
| Sakin yükseliş | Oynaklığı düşük, uzun vadeli trendi yukarı |

Her hisseye tıklayınca mum grafik (50 ve 200 günlük ortalama, hacim, RSI), skorun nedenleri, riskler ve hisseyi anan güncel haberler açılır. Piyasa şeridindeki kutular da (BIST 100, dolar, Brent…) tıklanınca grafiğe gelir.

**Önemli: tarayıcı "yükselecek hisseyi" bilmez.** Her stratejinin geçmiş başarısı ölçülür ve panelde yanında gösterilir. 30 Eylül 2026'daki ölçüm (Ağustos 2025 – Eylül 2026, 10 işlem günü tutma, ~56 ölçüm):

| Strateji | İlk %20'nin BIST 100'e göre getirisi | Endeksi geçme oranı | IC |
|---|---|---|---|
| Trend ve momentum | %-0,3 | %46 | 0,02 (anlamsız) |
| Düşüş sonrası toparlanma | %-0,5 | %44 | 0,02 (anlamsız) |
| Sakin yükseliş | %-0,4 | %45 | 0,01 (anlamsız) |

Tek tek 10 teknik faktör de (momentum, göreli güç, RSI, 52 hafta zirvesi, hacim, oynaklık, MACD) ayrı ayrı test edildi. Hiçbiri istatistiksel olarak anlamlı değil ve verinin ilk yarısında görünen zayıf sinyaller ikinci yarıda kayboluyor. Yani bu dönemde kısa vadeli teknik göstergeler BIST'te güvenilir bir üstünlük sağlamadı. Panel bunu açıkça yazar, AI da hisse fikri verirken bu karneyi belirtmek zorundadır.

Kanıtı zamanla biriktirmek için her gün her stratejinin ilk 5 hissesi kaydedilir ve 14 gün sonra BIST 100'e göre puanlanır ("Karne" paneli). Bu kısım sonradan ayarlanamaz; gerçek zamanlı ölçümdür.

Ölçümün dürüst olması için:
- Sinyal t günü kapanışında hesaplanır, işleme t+1 kapanışında girilir (ileriye bakma yok). Örnekler 5 günde bir alınır (çakışan pencereler sonucu şişirmesin).
- Fiyatlar temettüye göre düzeltilir (Yahoo `adjclose`). Yahoo'nun kaçırdığı bedelsiz/bölünmeler, BIST'in ±%10 marjı kullanılarak yakalanır (ör. KONTR 2025-12-01).
- Yahoo'nun boş bıraktığı günler ve seans içi kısmi bar işaretlenir; hacim oranı kısmi günden hesaplanmaz.
- AI yanıtındaki rakamlar veri özetinde aranır; bulunamayanlar "doğrulanamayan rakam" olarak gösterilir.

## Kurulum

**En kolay yol:** [Node.js](https://nodejs.org) 22.21 veya üstünü kur (LTS sürümü yeterli). Sonra klasördeki başlatma dosyasına çift tıkla:

- Windows: `baslat.bat`
- Mac / Linux: `baslat.sh` (Terminal'de `./baslat.sh`)

İlk açılışta bağımlılıklar kurulur ve tarayıcıda yönetim sayfası açılır. Konsolda yazan **kurulum anahtarı** ile şifreni belirle. Sonraki açılışlarda sadece şifre sorulur.

Elle kurmak istersen:

Node.js 22.21 veya üstü gerekir. `npm start`, kurumsal ağlarda `HTTPS_PROXY` değişkenine uyması için Node'u `--use-env-proxy` bayrağıyla başlatır (Node'un yerleşik `fetch`'i bu değişkeni kendiliğinden okumaz).

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
| **DeepSeek** | `deepseek-flash` (varsayılan) ve `deepseek-v4-pro`. Düşünme modu ayrı bir ayar; kapalıyken en ucuzu ve JSON çıktısı daha kararlı. Önbellek isabetleri (`prompt_cache_hit_tokens`) ayrı sayılır. |
| `openai` uyumlu | OpenAI, OpenRouter, Groq, Mistral, xAI, Together, **Ollama**, **LM Studio** |
| `gemini` | Google Gemini |

Tamamen gizli çalışmak istersen Ollama veya LM Studio seç. Bu durumda veri makinenden hiç çıkmaz.

### Token neden az harcanıyor

1. **Tek çağrı.** Üç bakış açısı ayrı ayrı istenmiyor; veri bir kez gönderiliyor.
2. **Sıkıştırılmış özet.** Ham JSON gitmiyor. Yaklaşık 50 satırlık, 6000 karakteri aşmayan bir özet gidiyor (~1700 token).
3. **Önbellek.** Sabit talimat metni Anthropic'te 1 saat önbellekte tutuluyor. Tekrarlanan kısım yaklaşık %90 daha ucuza okunuyor.
4. **Gereksiz çağrı yok.** Veri değişmediyse ya da değişim puanı eşiğin altındaysa çağrı yapılmıyor. Varsayılan en sık saatte bir.
5. **Maliyet görünür.** Her analizin token sayısı ve dolar maliyeti panelde listeleniyor.

Kaba hesap (fiyatlar `data/pricing.json` içinde, panelden görülen rakam esastır):

- **DeepSeek `deepseek-flash`, düşünme kapalı:** analiz başına yaklaşık 0,2 sent. Sabit talimat metni önbellekten okunduğu için girdinin çoğu 1M token başına 0,006 $'dan faturalanır. Sakin saatlerde fiyat yarıya iner. Günde 12 analiz yaklaşık 2-3 sent.
- **Claude Opus 5.5:**  analiz başına yaklaşık 3 bin token girdi ve 1,5 bin token çıktı. Bu da analiz başına 4 sent civarı eder. Günde 12 analiz yaklaşık 0,5 dolar tutar. Modelin düşünme token'ları çıktıya eklenir; gerçek rakamı panel gösterir. Claude'da maliyeti efor ayarı "low" ya da daha küçük bir model düşürür.

DeepSeek'in `deepseek-chat` ve `deepseek-reasoner` adları 24 Temmuz 2026'da kaldırıldı. Eski entegrasyonlarda (ör. WPContentBot'un fiyat tablosu) bu adlar hâlâ geçiyorsa güncellenmeli.

## Veri kaynakları

Anahtar gerekmeyenler ilk açılışta çalışır. "Durum" sütunundaki **canlı** işareti, kaynağın 30 Eylül 2026'da gerçek istekle denendiğini ve verinin ayrıştırıldığını gösterir.

| Kaynak | Veri | Anahtar | Durum |
|---|---|---|---|
| Yahoo Finance | Dolar, euro, altın, Brent, BIST 100/30/Banka, VIX, DXY, izleme listesi (gecikmeli). Yedek: Stooq | yok | canlı |
| BtcTurk | BTC/TL, USDT/TL (USDT makası buradan hesaplanır) | yok | canlı |
| TCMB `today.xml` | Gösterge kurlar | yok | canlı |
| TCMB EVDS3 | İstediğin seri: kur, TÜFE, rezerv… | ücretsiz | anahtar gerekli; biçim resmi dokümandan, canlı denenmedi |
| EPİAŞ Şeffaflık 2.0 | Elektrik piyasa takas fiyatı (PTF) | ücretsiz üyelik | üyelik gerekli; biçim dokümandan, canlı denenmedi |
| Resmi Gazete | Günün mevzuat başlıkları | yok | canlı |
| AFAD → Kandilli → EMSC → USGS | Depremler, kurumlar arası birleştirilmiş. AFAD'da sitenin kendi kullandığı `EventData/GetEventsByFilter` (POST), yedekte eski `apiv2`. Kandilli'de `son24saat.xml`, yedekte metin sayfası. | yok | canlı (AFAD, EMSC, USGS). Kandilli bu geliştirme ortamının izin listesinde değildi, denenemedi |
| 44 RSS akışı | Yerli + dünya basını, yayın çizgisi etiketli | yok | canlı |
| GDELT | Dünya basınında Türkiye haberleri ve ton | yok | denendi: bu ortamın IP'sine 429 verdi; saatte bir sorgulanır |
| Dünya Bankası + IMF | Enflasyon, büyüme, cari denge, işsizlik ve IMF tahminleri | yok | canlı |
| FRED (grafik CSV) | Fed faizi, ABD 10 yıllık, dolar endeksi, yüksek getiri spreadi | **yok** | canlı |
| ECB | EUR/TRY referans kuru (TCMB'den bağımsız ikinci kaynak) | yok | canlı |
| Forex Factory | Ekonomik takvim: Fed, ECB, ABD TÜFE, Çin GSYH… (beklenti ve önceki değer) | yok | canlı |
| açık kur API (fawazahmed0, jsDelivr) | Yahoo düşerse dolar, euro, ons altın, gümüş (günlük) | yok | canlı |
| İş Yatırım | Yahoo düşerse izleme listesi hisseleri ve BIST 100 (her satırda endeks değeri var) | yok | canlı, haberdeki kapanışla tutarlı |
| Stooq | Son yedek | yok | bu ortamda bağlantıyı kesti |
| Binance | BtcTurk düşerse USDT/TRY ve BTC/TRY yedeği | yok | canlı |
| NASA FIRMS | Türkiye'deki aktif yangınlar | ücretsiz | anahtar gerekli; canlı denenmedi |
| Open-Meteo | 8 ilde hava ve fırtına/aşırı sıcak uyarısı | yok | canlı |

Yerelde erişilemeyen kaynaklar için kullanılan küresel alternatifler:

| Yerel kaynak | Sorun | Yerine |
|---|---|---|
| KAP | Veri yayını ücretli, Borsa İstanbul sözleşmesi gerekiyor | İzleme listendeki hisseler için Google News (TR) |
| TÜİK API | Anahtar için Türk hattıyla SMS doğrulaması gerekiyor | Dünya Bankası + IMF (anahtarsız), EVDS'deki TÜFE serisi |
| Türkiye 5 yıllık CDS | Ücretsiz ve güvenilir API yok | iShares MSCI Turkey ETF (TUR, USD). Yabancı iştahının vekili, CDS'nin kendisi değil. |
| MGM | Resmi API yok | Open-Meteo |
| Kandilli | Resmi API yok, sayfa kazınıyor | AFAD ana kaynak, EMSC yedek |

**Gram altın** hesaplanan bir değerdir: ons × USD/TRY / 31,1035. Kuyumcu ve Kapalıçarşı fiyatı makas ve işçilik yüzünden bundan farklı olur.

## Gerçek veriyle doğrulamada bulunanlar

Demo verisiyle geçen testler gerçek veride şu hataları ortaya çıkardı. Hepsi düzeltildi:

- **Sahte tarayıcı kimliği API'leri kilitliyordu.** Yahoo 429 veriyor, FRED ve IMF isteği reddediyordu. API'lere artık dürüst bir kimlikle (`TurkiyeRadar/0.1`) gidiliyor; haber sayfaları ve RSS için tarayıcı kimliği korunuyor.
- **Etki skoru doymuştu.** Tam metin geldikten sonra gövdedeki her kelime başlıktaki kadar sayılıyordu; bir tarım köşe yazısı 100 alıyordu. Başlık 0,6, gövde 0,15 ağırlıkla yeniden ayarlandı. 300 gerçek haberde 60 üstü 7 haber kaldı, en üstte İran-petrol ve Hürmüz haberleri.
- **IMF ülke filtresini yok sayıyor**, 228 ülkeyi birden döndürüyor (121 KB). Sorun değil ama beklenmedik.
- **Node vekil değişkenini okumuyor.** `--use-env-proxy` bayrağı eklendi.
- Tam metin çıkarma: 40 haberin 40'ı başarılı (30 JSON-LD, 10 Readability).

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
- GDELT bazı IP'lere 429 veriyor ve bağlantısı yavaş (10 saniyeyi aşabiliyor). Düşerse dünya basını akışı Google News ve BBC/DW/Al Jazeera RSS'lerinden gelmeye devam eder.
- AFAD'ın POST uç noktası resmi olarak belgelenmiş bir API değil, sitenin kendi kullandığı adres; değişirse eski `apiv2` yedeğine düşülür.
- DeepSeek'in yoğun/sakin saat pencereleri resmi dokümandan doğrulanamadı. `data/pricing.json` içindeki `offPeakUTC` değerini kontrol et.
- Forex Factory takviminde TL olayları (TCMB PPK, TÜİK enflasyon) yok. Bunlar haber akışından ve EVDS'ten izleniyor.
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

Aşağıdakiler **geliştirme sırasında kullanıldı, repoya eklenmedi**:

| Araç | Nasıl kullanıldı |
|---|---|
| [token-optimizer](https://github.com/alexgreensh/token-optimizer) | Oturumun bağlam yükü ölçüldü (başlangıç yükü %1,3). Dosyalar hedefli okundu, büyük çıktılar basılmadı. Uygulamanın kendisi için aynı ilke: AI'a ham veri değil sıkıştırılmış özet gider. |
| [hallmark](https://github.com/nutlope/hallmark), [anti-slop](https://github.com/miqdadbadjuber/anti-slop) | Arayüz ve kod bu kurallarla denetlendi: renk ve font sadece token üzerinden, italik başlık yok, süslü ayırıcı yorum yok, sol renkli şerit ve büyük harfli etiket kaldırıldı, sayılar `tabular-nums`. |
| [OpenTerminal](https://github.com/ErTasselli/OpenTerminal) | Anahtarsız veri uçları (FRED CSV, ECB, Stooq, Binance, Forex Factory) ve fiyat değişince flaş fikri buradan alındı. |
| WPContentBot | Tam metin çıkarmada "kanıtlanmış kütüphane birincil, kendi çıkarıcı yedek" düzeni, `Retry-After` ile geri çekilme, günlük token limiti ve neden etiketli tanı kayıtları buradan alındı. WPContentBot'taki SSL hatasında sertifika doğrulamasını kapatıp yeniden deneme davranışı bilerek alınmadı. |
| [anidoodle](https://github.com/alexgreensh/anidoodle) | İncelendi. Ürün verisiyle ilgisi olmayan dekoratif çizim, anti-slop'un "ürünle bağı olmayan illüstrasyon" kuralına takıldığı için panoya eklenmedi. |

## Teşekkür

- RSS listesinin çıkış noktası: [bakinazik/rss](https://github.com/bakinazik/rss). Oradaki adresler kullanıldı; tasarım kodu kopyalanmadı, çünkü repoda lisans yok.
- Fikir: [Crucix](https://github.com/calesthio/Crucix)
- Olağandışı hareket eşiği fikri: [PanWatch](https://github.com/TNT-Likely/PanWatch)
- Temettü düzeltmesi, IC ölçümü ve rakam doğrulama fikirleri: [Vibe-Trading](https://github.com/HKUDS/Vibe-Trading) (MIT)
- Pano yerleşimi için görsel referans: [sc-datav](https://github.com/knight-L/sc-datav)
- `__NEXT_DATA__` gibi gömülü içerik fikri: [webclaw](https://github.com/0xMassi/webclaw) (AGPL; kod alınmadı)
- Grafikler: [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts) (Apache 2.0)
- Anahtarsız piyasa uçları: [OpenTerminal](https://github.com/ErTasselli/OpenTerminal)
- AFAD ve Kandilli'nin güncel biçimi: [orhanayd/kandilli-rasathanesi-api](https://github.com/orhanayd/kandilli-rasathanesi-api)
- Tam metin: [Mozilla Readability](https://github.com/mozilla/readability) (Apache 2.0), [linkedom](https://github.com/WebReflection/linkedom) (ISC)
- Harita verisi: Natural Earth, [world-atlas](https://github.com/topojson/world-atlas) paketi üzerinden
