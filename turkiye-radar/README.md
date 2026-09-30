# Türkiye Radar

Kendi bilgisayarında çalışan, Türkiye merkezli bir haber, piyasa ve risk paneli. Dünyada olup biteni toplar ve her olay için tek bir soruya cevap arar: **bu Türkiye'yi ne kadar, hangi kanaldan etkiler?**

Fikir [Crucix](https://github.com/calesthio/Crucix)'ten geliyor. Kod sıfırdan yazıldı; Crucix'in AGPL kodu kullanılmadı.

## Ne yapar

- **Türkiye Etki Skoru (0-100).** Her haber altı kanalda puanlanır: jeopolitik, enerji, ticaret, finans, turizm, doğrudan. Piyasa gerçekten tepki verdiyse skor yükselir. Örneğin Brent %5 yükseldiyse enerji haberleri öne çıkar. Ağırlıkları yönetim panelinden değiştirebilirsin.
- **Haberin tam metni.** RSS'teki başlıkla yetinmez, en önemli 40 haberin sayfasını açıp asıl metni çıkarır. Sıra: sayfadaki JSON-LD `articleBody`, sonra Mozilla Readability (Firefox okuma modunun kütüphanesi), sonra paragraf taraması, en son meta açıklama. Çıkamayanların nedeni (JS ile yüklenen sayfa, HTTP 403 vb.) yönetim panelinde listelenir. Başlık içerikle örtüşmüyorsa ya da başlıktaki rakam metinde yoksa "başlık yanıltıcı olabilir" uyarısı gösterir. Örnek: "ŞOK! Emeklilere 50 bin lira" başlığının altında ihale haberi var.
- **Çapraz teyit.** En önemli 12 haber (yönetimden değişir, 0 = kapalı) Google News'in herkese açık arama RSS'inde aranır: başlıktan seçilen ayırt edici kelimelerle, son 2 gün. Haberin kendi yayıncısı sayılmaz, benzerliği düşük sonuçlar atılır, neredeyse aynı başlıklar ajans kopyası olarak ayrıca sayılır. Kartta "yaygın 23", "birkaç kaynak 4", "tek kaynak" ya da "yalanlama başlığı" yazar; üzerine gelince örnek başlıklar görünür. AI özetinde [TEK KAYNAK] ve [YALANLAMA?] etiketleri çıkar. 12 haber yaklaşık 3 saniye sürer, sonuç 6 saat saklanır. Google'a yalnızca başlıktan birkaç kelime gider; çerez ya da hesap bilgisi gitmez.
  - Önemli: çok kaynak "doğru" demek değildir. Ajans haberini 20 site aynen basabilir; bu yüzden "özgün" başlık sayısı ayrıca tutulur. "Tek kaynak" da "yanlış" demek değildir; özel haber, röportaj ya da analiz olabilir.
  - Yalanlama tespiti yalnızca doğrulama diline bakar (asılsız, yalanlandı, gerçeği yansıtmıyor, fact check). İngilizce "denies" bilinçli olarak yok: gerçek veride "Trump denies easing sanctions" haberin kendisiydi, yalanlama değil.
  - **İsteğe bağlı SearXNG.** Yönetimde kendi [SearXNG](https://github.com/searxng/searxng) adresini girersen (JSON çıktısı açık olmalı) her haber hem Google News'te hem SearXNG'de aranır, yayıncılar birleştirilir. SearXNG tek sorguyu Bing, DuckDuckGo, Google News, Brave ve Reuters'a dağıtır. 30 Eylül'de 12 haberle yapılan karşılaştırma: Google yaygın haberde çok daha fazla yayıncı saydı (Brent haberinde 24'e 4); SearXNG ise Google'ın "tek kaynak" dediği iki haberi (DW'nin İran-Körfez, Guardian'ın Belçika haberi) başka motorlarda buldu. Birlikte: 12 haber 4,8 saniye. Kurulum (Docker):
    ```bash
    docker run -d --name searxng -p 127.0.0.1:8888:8080 -v ./searxng:/etc/searxng searxng/searxng
    # ./searxng/settings.yml içinde: search: formats: [html, json]   ve   server: limiter: false
    ```
    Dikkat: SearXNG aramaları senin IP'nden motorlara iletir; daha anonim değil, ama çerez taşımaz ve tek şirkete bağlı kalmazsın. Brave ve Wikinews birkaç sorguda "çok fazla istek" deyip askıya alındı; motorlar kendi sınırlarını uygular. SearXNG sonuçlarında tarih yoksa sonuç sayılmaz, çünkü denemede 2 hafta önceki "Brent 104,44'e geriledi" haberi bugünkü "96'nın altına geriledi" haberini teyit ediyordu.
  - Botasaurus gibi bot korumasını atlatan bir araçla Google arama sayfası kazımak yerine resmi RSS seçildi: kazıma Google kurallarına aykırı, captcha ile sık bozulur ve Chrome gerektirir.
- **Aynı olay tek satır.** On site aynı haberi yazdıysa bir kez gösterilir, yanında "+9 kaynak" yazar.
- **Yayın çizgisi dengesi.** Kaynaklar etiketli: resmi, iktidara yakın, muhalif, bağımsız, ana akım, uluslararası, yabancı devlet. Yapay zekaya giden özet bu çizgilerden sırayla seçilir. Böylece analiz, hangi tarafın haberi çoksa ona kaymaz.
- **Üç bakış açısı.** Aynı veriden kötümser, iyimser ve tarafsız yorum üretir. Her yorum özetteki somut bir rakama ya da habere dayanmak zorunda. Bunlara ek olarak varlık beklentileri (dolar, euro, gram altın, BIST, Brent, BTC) ve kişisel işlem fikirleri gelir.
- **Kaynak kaydı.** Her analiz, modele giden veri özetinin tamamını ve dayandığı haberleri (bağlantı, yayıncı, etki skoru, teyit durumu) birlikte saklar. Analizler sayfasında "Bu analiz neye dayandı" bölümünde görünür. Haber sonradan akıştan düşse de "model bunu nereden çıkardı?" sorusu cevaplanabilir. Fikir [Feynman](https://github.com/Companion-Inc/feynman)'ın provenance dosyasından.
- **Daha fazla bakış açısı.** Kötümser / iyimser / tarafsız yoruma ek olarak her analizde:
  - **Yayın çizgilerine göre:** muhalif ve iktidara yakın basının olayı nasıl anlattığı (modelin görüşü değil; o çizgideki haber başlıklarına dayanır, haber yoksa "bu çizgiden haber yok" der),
  - **Çözüm:** sorunu hafifletecek politika ya da kurum adımları,
  - **Nasıl daha az etkilenirim:** hane ve küçük yatırımcı için korunma adımları,
  - **Kim kazançlı çıkar:** hangi sektör, varlık ya da şirket tipi,
  - **Ne yaparsam kârlı çıkarım:** adım adım kişisel plan; her adımda neden ve risk. "Garanti" dili yasak.
  Bu alanlar çıktıyı analiz başına yaklaşık 500 token büyütür (DeepSeek'te sentin onda biri kadar).
- **Analizle sohbet.** Gündem sekmesinde son analizin, Analizler sekmesinde her geçmiş analizin altında sohbet kutusu var. Model şunlarla cevap verir: analizin kendisi, radarın ŞU ANKİ veri özeti, hafıza ve sorudan seçilen ek veri. Soruda bir hisse (kod ya da ad: "THY", "Aselsan", "Nvidia"), bir varlık ("dolar", "altın", "petrol") ya da konu kelimesi geçerse o hissenin tarayıcı satırı, skor gerekçeleri, strateji karnesi, gündem zinciri, fiyatlar ve ilgili haberler (teyit etiketleriyle) soruya eklenir. Eski bir analizle konuşurken o anki veri özeti de verilir, böylece "o gün ne biliyordun, bugün ne değişti?" sorulabilir. Cevaptaki rakamlar verilerde aranır; bulunamayanlar uyarı olarak gösterilir. Son 8 mesaj bağlam olarak gider; sohbet de günlük bütçeye sayılır.
- **Sohbette web araması.** Radarın akışında olmayan güncel bir bilgi gerekirse sohbet web'de arar: Google News arama RSS'i ve tanımlıysa kendi SearXNG'n. Soru "son durum", "bugün", "ne zaman", "açıkladı" gibi güncellik içeriyorsa arama soru anında yapılır; değilse model veri yetmediğini görünce `ARA: <sorgu>` satırıyla ister, sonuçlar verilip bir kez daha sorulur. SearXNG sonuçlarında ilk iki haberin metni de okunur (canlı denemede "TCMB politika faizi %37, PPK kararı 22 Ekim" bilgisi CNN Türk ve Ekotürk metninden geldi). Sohbet kutusundaki "web'de ara" işaretini kaldırırsan arama yapılmaz. Yerel ağ adresleri (127.0.0.1, 192.168.x, .local) açılmaz. Bilinen sınır: bir alan adının iç IP'ye çözülmesi (DNS rebinding) ya da yönlendirme ile iç ağa gidilmesi ayrıca denetlenmiyor; sunucu yalnızca 127.0.0.1'i dinlediği ve kişisel kullanım için olduğu için risk düşük.
- **Kendi hafızası.** Yapay zeka hatalarından ders çıkarır; iki kaynaktan:
  - *Ölçüm* (model kullanılmaz, uydurulamaz): vadesi dolan tahminlerde varlık başına isabet ("USDTRY: 6 tahminin 2'si tuttu, tutmayanların çoğu 'aşağı' dediklerin"), yüksek güvenle verilen tahminlerin gerçek isabeti ("%65+ güvenle verdiğin 8 tahminin %38'i tuttu: güvenini düşür"), yön yanlılığı.
  - *Kendi dersleri:* her analizde tutmayan tahminlere bakıp tek cümlelik ders yazar; tekrar edenler ayıklanır, en fazla 15 tutulur.
  Hafıza her analize ve sohbete "HAFIZA" olarak girer. Analizler sekmesinde görünür; yanlış bulduğun dersi silebilirsin.
  - *Senin notların:* sohbette "hatırla: portföyümde THYAO ve altın var, riskten kaçınırım" yazarsan (model çağrılmadan) kalıcı not olur; Hafıza panelinden de eklenip silinebilir. Notlar her analize ve sohbete girer; korunma ve eylem önerileri buna göre kişiselleşir.
  - *Hafıza ağacı ve sınırsız arşiv* ([PageIndex](https://github.com/VectifyAI/PageIndex) fikri): tüm analizler kalıcı arşivde tutulur (en fazla 5000, ~7 MB; ekrandaki liste son 60). Arşivden model kullanmadan ay → hafta → gün → analiz ağacı ve her düğüm için sayısal özet çıkar ("[2026-H39] 12 analiz | USDTRY 48,3→48,9 | tahmin 5/9 tuttu | son görüş: …"). Sohbette model bu içindekiler tablosunu görür; ayrıntı için `OKU: 2026-H39` ister. Soruda "dün", "geçen hafta", "3 gün önce", "25 Eylül", "25.09" geçerse ilgili düğüm kendiliğinden açılır. PageIndex'in vektörsüz, gerekçeli gezinme yaklaşımı; vektör veritabanı ve ek model çağrısı yok.
  - *Konu araması* ([Feynman](https://github.com/Companion-Inc/feynman)'ın session-search fikri): `BUL: altın` tüm arşivde ve eski sohbetlerde arar, sonuçları düğüm kimliğiyle döndürür.
  - *Ders hafızasının kuralları* ([PSSA](https://github.com/Sparticle62ops/pssa)'nın plastik hafıza kurallarından uyarlandı; GPL-3 olduğu için kod alınmadı, yalnızca fikir): benzer ders tekrar gelirse silinmez, **pekişir** (sayısı artar). 3 kez pekişen ders **kararlı ilke** olur: kapasite (30) dolunca otomatik silinmez, tek seferlik ters bir dersle yerinden oynamaz; yalnızca sen silebilirsin. Kapasite dolunca kararsızlardan puanı en düşük olan (pekişme × tazelik, 30 günde söner) çıkar. Özete tüm hafıza değil, kararlı ilkeler (en fazla 3) ve o anki verilere en ilgili 4 ders girer; hafıza büyüdükçe token maliyeti büyümez. PSSA'nın kendisi (1,5 milyon parametreli deneysel Rust dil modeli) radarda yapay zeka olarak kullanılamaz; yazarı da bu ölçekte metin kalitesinin zayıf olduğunu belirtiyor.
  - *Sohbet sıkıştırma* ([dbx](https://github.com/t8y2/dbx)'in context compaction fikri, modelsiz): son 8 mesaj aynen gider, daha eskileri "soru → cevabın ilk cümlesi" özetine iner; uzun sohbet token'ı şişirmez ama konuşmanın başı unutulmaz.
- **Otomatik analiz saati.** Yönetimde "Otomatik analiz": yalnızca önemli değişimde (varsayılan), saatte bir, 2, 3, 6, 12 saatte ya da günde bir. Saatli modda veri değişmemiş olsa da analiz yapılır; arada büyük bir olay olursa olay tetiği yine çalışır. Günlük dolar/token sınırı her durumda geçerli. Tarama 15 dakikada bir olduğu için saat en fazla 15 dk kayar.
- **Tahmin karnesi.** Yapay zekanın "USD/TRY 7 günde yükselir, %65" gibi her tahmini kaydedilir. Vade dolunca gerçek fiyatla karşılaştırılır ve Brier skoru hesaplanır. Hangi modelin gerçekten işe yaradığını veriyle görürsün. Dil modellerinin piyasa tahmininde genelde yazı-turadan çok iyi olmadığını unutma: karne bunu açıkça gösterecek.
- **Olağandışı hareket tespiti.** Her varlığın kendi normal günlük oynaklığına göre alarm verir: 1,5 × son bir aydaki ortalama mutlak getiri. Fikir PanWatch'taki ATR% yaklaşımından geliyor. Böylece BTC'nin sıradan %3'lük hareketi alarm üretmez, dolar/TL'nin %1,5'lik hareketi üretir.
- **Günlük bütçe.** Günlük dolar ve token sınırı var (varsayılan 1 $ ve 300 bin token). Dolunca analiz durur, elle tetiklense bile.
- **Uyarılar.** Deprem (M4,5 ve üstü), olağandışı piyasa hareketi ve yüksek etkili haber Telegram'a gider.

## Üyelik ve rütbeler

Panel birden çok kişiyle kullanılabilir. Açık kayıt yok; yönetici bir **davet kodu** (ya da `/giris?davet=...` bağlantısı) üretir, kişi o kodla hesap açar ve rütbesi koddan gelir. Yönetici üyeleri doğrudan da ekleyebilir, rütbe değiştirebilir, hesabı kapatabilir, şifre sıfırlayabilir.

| Özellik | Temel | Pro | Elit | Yönetici |
|---|---|---|---|---|
| Gündem, haberler, şerit, harita, takvim, Dünya | ✓ | ✓ | ✓ | ✓ |
| Analizin özeti ve bakış açıları | ✓ | ✓ | ✓ | ✓ |
| Analizin tamamı (eylem planı, korunma, beklentiler, fikirler) | | ✓ | ✓ | ✓ |
| Trade (tarayıcı, grafik, katalizörler) | | ✓ | ✓ | ✓ |
| Geçmiş analizler ve kaynak kaydı | | ✓ | ✓ | ✓ |
| Portföy tablosu | | ✓ | ✓ | ✓ |
| Kişisel notlar, sohbette web araması | | ✓ | ✓ | ✓ |
| Günlük sohbet mesajı | | 30 | 150 | sınırsız |
| "Şimdi tara", günlük elle analiz | | | ✓, 5 | ✓ |
| Yönetim paneli | | | | ✓ |

Rütbe adları, aç/kapa özellikleri ve günlük sınırlar yönetim panelindeki matristen değiştirilir. Yöneticinin panel erişimi kapatılamaz, son yönetici düşürülemez ya da silinemez.

Ayrıntılar:
- Şifreler scrypt ile saklanır; 5 hatalı denemeden sonra IP bazında giderek uzayan bekleme vardır. Kullanıcı yoksa da aynı süre harcanır (kullanıcı adı tahmini zamanlamadan anlaşılmasın).
- Oturum çerezi kullanıcı kimliği ve kullanıcının sürüm sayacıyla imzalanır; şifre ya da rütbe değişince veya hesap kapatılınca o kişinin açık oturumları düşer.
- Sohbetler, notlar ve portföy kişiye özeldir. Ortak analize yalnızca yönetici üyelerin notları girer (bir üyenin portföy notu başkasının gördüğü analize sızmasın).
- Kilitli bölümler arayüzde gizlenmez; kilit simgesiyle gösterilir ve Üyelik sayfasına yönlendirir. Asıl denetim sunucudadır: rütbenin açmadığı veri API'den hiç gönderilmez.
- Eski tek kullanıcılı kurulumdan geçiş kendiliğindendir: kullanıcı adı `admin`, şifre aynı.

**Hukuki uyarı (üyeliği para karşılığı ya da başkalarına açacaksan önce oku):** Türkiye'de başkalarına ücret karşılığı ya da düzenli olarak kişiye özel yatırım önerisi vermek "yatırım danışmanlığı" sayılır ve SPK izni gerektirir (6362 sayılı Sermaye Piyasası Kanunu). Bu paneldeki "Ne yaparsam kârlı çıkarım", işlem fikirleri ve tarayıcı listeleri kişisel kullanım için tasarlandı. Üyelere açarken bu bölümleri kapatmak (rütbe matrisinden "Analizin tamamı" ve "Trade") ve açık bir "yatırım tavsiyesi değildir" metni koymak gerekir; ücretli üyelik düşünüyorsan bir hukukçuya danış. Üye verisi (kullanıcı adı, sohbetler, portföy) KVKK kapsamında kişisel veridir: aydınlatma metni ve silme talebi süreci gerekir. Ödeme altyapısı (iyzico, Stripe vb.) bilerek eklenmedi.

## Portföy

Pro ve üstü rütbelerde "Portföy" sekmesi bir tablo gibi çalışır: hücreye yaz, Enter ile alt satıra in; değişiklikler kendiliğinden kaydedilir. Kod olarak dolar/euro/gram altın/BTC ya da üç piyasadaki herhangi bir hisse yazılabilir. Her satır canlı fiyatla değerlenir (şeritteki gecikme geçerli), hissenin para birimi (₺, $, €) kendiliğinden bilinir ve toplamlar TL'ye çevrilir. Üstte toplam değer, bugünkü değişim, toplam kâr/zarar ve dolar bazında değer; altta dağılım çubuğu (renk körlüğü testinden geçmiş kategorik palet, her dilimde etiket ve yüzde).

[Univer](https://github.com/dream-num/univer) (tam bir tablo/ofis SDK'sı) incelendi ama gömülmedi: çekirdek paketleri 118 MB bağımlılık ve ~7 MB tarayıcı kodu getiriyor, React ve derleme adımı istiyor. Tüm radar arayüzü ~200 KB. Portföy için gereken (düzenlenebilir hücre, canlı hesap, toplam, dağılım) bu ağırlık olmadan yazıldı. İleride formül, çoklu sayfa ya da Excel içe/dışa aktarma gerekirse Univer ayrı, isteğe bağlı bir sayfa olarak eklenebilir.

## Dış araçlara veri (ToolJet, Grafana, Excel)

Radarın verisiyle kendi ekranlarını kurmak istersen Üyelik sayfasından **salt okunur API anahtarı** üret (üye başına en fazla 5; anahtar yalnızca üretilirken gösterilir, diskte SHA-256 özeti durur). Anahtar yalnızca aşağıdaki düz tabloları okuyabilir; yazma, ayarlar, sohbet ve diğer her şey kapalıdır. Rütbe kuralları anahtarda da geçerli (Temel anahtar tarayıcı tablosunu alamaz).

| Uç | İçerik |
|---|---|
| `GET /api/v1/piyasa` | Kod, fiyat, günlük değişim %, oynaklık, gecikme, zaman |
| `GET /api/v1/haberler?limit=100` | Başlık, kaynak, yayın çizgisi, etki, dünya etkisi, teyit durumu |
| `GET /api/v1/analiz` | Son analizin özeti ve varlık beklentileri |
| `GET /api/v1/tarayici?piyasa=tr\|us\|eu` | Hisseler, getiriler (%), RSI, strateji skorları |
| `GET /api/v1/portfoy` | Kendi portföy satırların |

Başlık: `Authorization: Bearer rdr_...`. Sonuna `&format=csv` (ya da `?format=csv`) eklersen Excel'in açabileceği UTF-8 CSV gelir.

**[ToolJet](https://github.com/ToolJet/ToolJet) ile:** ToolJet ayrı bir platformdur (Postgres ve Docker ister, AGPL-3); radarın içine gömülmez, yanında çalışır. Mac'te Docker Desktop ile:
```bash
docker run -d --name tooljet --restart unless-stopped -p 8080:80 -v tooljet_data:/var/lib/postgresql/13/main tooljet/try:ee-lts-latest
```
http://localhost:8080 → yeni uygulama → veri kaynağı olarak **REST API**: temel adres `http://host.docker.internal:3120/api/v1`, başlık `Authorization: Bearer <anahtar>`. Sonra bir tablo ya da grafik bileşenine `piyasa`, `tarayici?piyasa=tr` gibi sorguları bağla. ToolJet sorguları kendi sunucusundan yaptığı için tarayıcı izin (CORS) ayarı gerekmez. Not: `tooljet/try` imajı Enterprise deneme sürümüdür; tamamen açık kaynak topluluk sürümü için ToolJet'in Docker kurulum belgesindeki CE imajını kullan. Radar sunucusunu internete açma; anahtar sızarsa Üyelik sayfasından sil.

## Görünümler

Üstteki sekmelerle, 1-5 tuşlarıyla ya da **Ctrl+K komut paletiyle** geçilir (paletten hisse adı yazıp grafiğe, komut yazıp taramaya da gidilir). Sohbet her sayfada sağ alttaki düğmeden ya da C tuşuyla açılan çekmecededir. Gündem'in üstünde dört temel gösterge (kıvılcım grafikli, gecikmesiyle), senaryo dengesi çubuğu ve durum sayaçları (olağandışı hareket, yüksek etkili haber, geçmeyen kontrol) vardır; analiz kartı sekmelidir (Bakış açıları / Ne yapmalı / Beklentiler ve fikirler). Adres çubuğu görünümü tutar, yer imi olarak kaydedilebilir.

| Sekme | İçerik |
|---|---|
| **Gündem** (varsayılan) | Merkezde yapay zeka değerlendirmesi ve Türkiye'ye etkisine göre haberler. Yanda "gündemden hisselere" özeti, Türkiye haritası, ekonomik takvim, depremler; altta makro veri, karne, Resmi Gazete, kaynak durumu. |
| **Trade** | Piyasa seçimi (Türkiye / ABD / Avrupa), strateji seçimi, hisse listesi, mum grafik, gündem katalizörleri. |
| **Dünya** | Dünya endeksleri (S&P 500, Nasdaq, Euro Stoxx 50, DAX, FTSE, Nikkei, Şanghay…), dünya haritası (M5+ depremler, haber odakları, merkezde Türkiye), küresel etkisine göre haberler, ABD ve Avrupa gündemi. |
| **Analizler** | Geçmiş yapay zeka analizleri. Her biri kendi sayfasında (`#analiz/<zaman>`) açılır; varlık tahminlerinin tutup tutmadığı yanında yazar. |

**Veri ne kadar güncel?** Fiyat şeridi dakikada bir, tek bir Yahoo isteğiyle (21 sembol) ve BtcTurk'ten yenilenir; haberler ve tarayıcı 15 dakikada bir. Gerçek gecikme her kutunun üstünde yazar ("canlı", "15 dk", "kapalı"). 30 Eylül 2026 ölçümü:

| Veri | Gecikme | Neden |
|---|---|---|
| Dolar/TL, Euro/TL | 1-8 saniye | Döviz piyasası Yahoo'da neredeyse anlık |
| USDT/TL, BTC/TL (BtcTurk) | anlık | Borsanın kendi API'si |
| Ons altın, gümüş, Brent (vadeli) | ~10 dk | Vadeli piyasa verisi gecikmeli yayınlanır |
| BIST 100, BIST 30, banka endeksi | 15 dk | Borsa İstanbul verisi ücretsiz kaynaklarda 15 dk gecikmelidir; anlık BIST verisi lisanslı ve ücretlidir (Matriks, Foreks vb.) |
| ABD, Avrupa, Asya endeksleri | 15 dk ya da "kapalı" | Seans dışında son kapanış gösterilir |

Gram altın ons × dolar/TL'den hesaplandığı için ons'un gecikmesini taşır. Denenen ücretsiz Türk kaynakları (truncgil, genelpara) bağlantıyı kesti ya da Cloudflare ile engelledi.

**Yapay zeka önceki analizlerini hatırlar.** Her yeni analize son 3 analizin özeti ve varlık tahminlerinin sonucu ("USDTRY↑ %60/7g TUTMADI(-0,8%)") eklenir. Model görüşünü değiştirdiyse nedenini söylemek zorundadır. Bu satırlar "veri değişti mi?" kontrolünün dışında tutulur, yani tek başına yeni analiz tetiklemez.

**Dünya haberleri analize girer.** Türkiye skoru düşük ama küresel piyasayı oynatan haberler ayrı bir "Dünya skoru"yla seçilir (finans, enerji, ticaret, jeopolitik, şiddet; Türkiye bağı aranmaz). En yüksek 5'i AI özetine "DÜNYA" satırı olarak girer. ABD ve Avrupa tarayıcılarının özeti de gider.

**Veri kontrolleri.** Aynı büyüklük iki bağımsız kaynaktan karşılaştırılır: dolar/TL Yahoo ile TCMB, euro/TL Yahoo ile ECB, EUR/USD çapraz kuru ECB ile. Ayrıca bayat fiyatlar, şüpheli vadeli kontrat devirleri ve tarayıcı dosyalarının yaşı denetlenir. Geçmeyen kontrol panelde ✕ ile görünür ve AI özetine "KONTROL" satırı olarak gider; model o veriye dayanmamak zorundadır. 30 Eylül'deki gerçek veride sonuç: kur farkları %0,04-0,16 arasında, TTF gaz kontratında devir şüphesi yakalandı. Piyasa şeridindeki her kutunun üzerine gelince kaynağı ve son işlem saati görünür.

## Hisse tarayıcısı ve grafikler

Üç piyasa taranır; Trade sekmesinden geçilir:

| Piyasa | Evren | Karşılaştırma |
|---|---|---|
| Türkiye | 61 likit BIST hissesi (`data/bist-universe.json`) | BIST 100 |
| ABD | 42 büyük şirket, sektör dengeli (`data/universe-us.json`) | S&P 500 |
| Avrupa | 38 büyük şirket (`data/universe-eu.json`) | Euro Stoxx 50 |

Her biri için 2 yıllık günlük veri çekilir ve dört stratejiyle sıralanır:

| Strateji | Ne arar |
|---|---|
| Trend ve momentum | 50/200 günlük ortalamanın üstünde, son 3 ayda güçlü, endeksi geçen, RSI 50-68, hacim artışı, 52 hafta zirvesine yakın |
| Düşüş sonrası toparlanma | Son 1 ayda en çok düşen ama 200 günlük ortalamanın üstünde kalan, aşırı satımda ve MACD'si dönen |
| Sakin yükseliş | Oynaklığı düşük, uzun vadeli trendi yukarı |
| Gündem | Güncel haber ya da fiyat hareketinin neden→sonuç zinciriyle olumlu etkilediği hisseler (aşağıda) |

Her hisseye tıklayınca mum grafik (50 ve 200 günlük ortalama, hacim, RSI), skorun nedenleri, riskler ve hisseyi anan güncel haberler açılır. Piyasa şeridindeki kutular da (BIST 100, dolar, Brent…) tıklanınca grafiğe gelir.

**Önemli: tarayıcı "yükselecek hisseyi" bilmez.** Her stratejinin geçmiş başarısı ölçülür ve panelde yanında gösterilir. 30 Eylül 2026'daki ölçüm (Ağustos 2025 – Eylül 2026, 10 işlem günü tutma, ~56 ölçüm):

| Strateji | İlk %20'nin BIST 100'e göre getirisi | Endeksi geçme oranı | IC |
|---|---|---|---|
| Trend ve momentum | %-0,3 | %46 | 0,02 (anlamsız) |
| Düşüş sonrası toparlanma | %-0,5 | %44 | 0,02 (anlamsız) |
| Sakin yükseliş | %-0,4 | %45 | 0,01 (anlamsız) |

ABD ve Avrupa'da aynı ölçüm (30 Eylül 2026): ABD'de trend %+0,3 (t -0,9), toparlanma %+0,6 (t 0,8), sakin %-0,1; Avrupa'da hepsi %+0,1 civarı. Hiçbiri istatistiksel olarak anlamlı değil.

Tek tek 10 teknik faktör de (momentum, göreli güç, RSI, 52 hafta zirvesi, hacim, oynaklık, MACD) ayrı ayrı test edildi. Hiçbiri istatistiksel olarak anlamlı değil ve verinin ilk yarısında görünen zayıf sinyaller ikinci yarıda kayboluyor. Yani bu dönemde kısa vadeli teknik göstergeler BIST'te güvenilir bir üstünlük sağlamadı. Panel bunu açıkça yazar, AI da hisse fikri verirken bu karneyi belirtmek zorundadır.

Kanıtı zamanla biriktirmek için her gün her stratejinin ilk 5 hissesi kaydedilir ve 14 gün sonra BIST 100'e göre puanlanır ("Karne" paneli). Bu kısım sonradan ayarlanamaz; gerçek zamanlı ölçümdür.

### Gündem katalizörleri: "bu gelişme şu hisseye yarar"

`data/themes.json` içinde 13 tema var: petrol, Avrupa doğalgazı, altın, TCMB faizi, Fed faizi, savunma, bölgesel çatışma, turizm, yenilenebilir enerji, çelik, Avrupa otomotivi, yapay zeka çipleri, obezite ilaçları. Her tema üç şey söyler: hangi haberler onu anlatır, yönü neyden anlaşılır, hangi hisseyi hangi nedenle etkiler.

Basit örnek: Brent bugün %3 yükseldi → "Petrol fiyatı ▲" teması doğar → TÜPRAŞ ▲ (stok değer kazancı), THY ▼ (yakıt, havayolunun en büyük gider kalemi), Pegasus ▼.

Ayrıntı:
- **Yön iki yoldan gelir.** Petrol, gaz, altın gibi fiyatı olan temalarda yön, göstergenin günlük değişiminden (eşiği aşarsa) okunur. Faiz, savunma, turizm gibi temalarda haber metnindeki yön kelimelerinden (indirim/artırım, ateşkes/saldırı) ya da genel olumlu/olumsuz kök sözlüğünden okunur. En az iki haberin net olarak aynı yönü göstermesi gerekir; tek başlık yetmez.
- **Yanlış eşleşmeye karşı kurallar.** Anahtar kelime başından eşleşir ("altın", "altına geriledi"yi yakalamaz). TCMB teması haberde TCMB/Merkez Bankası/PPK geçmesini ister ve Fed/ECB geçen haberi saymaz. Uzak savaş haberleri THY'yi sürekli eksiye çekmesin diye çatışma teması yalnızca Türkiye etki skoru 45'in üstündeki haberleri sayar.
- **Şirket haberlerinin tonu kullanılmıyor.** Denendi, gerçek veride tutmadı: "cost" kelimesi Costco'ya, "race" Ferrari'ye, bir aracı kurumun "ASELS satışları" raporu Aselsan'a olumsuz haber diye bağlandı. Kelime sayarak şirket düzeyinde ton ölçmek güvenilir değil.
- **Test edilemez, ölçülür.** Geçmiş haber arşivi olmadığı için geriye dönük test yapılamıyor. Bu yüzden panelde "Test edilmemiş" etiketiyle çıkar ve her gün ilk 5'i canlı takibe girer.
- Zincirler AI özetine "GÜNDEM" satırı olarak gider; model hisse fikrinde "gelişme → etki kanalı → şirket" zincirini yazmak zorundadır.

Tema eklemek için `data/themes.json` dosyasına aynı biçimde bir kayıt eklemek yeterli.

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
2. **Sıkıştırılmış özet.** Ham JSON gitmiyor. Yaklaşık 60 satırlık, 7000 karakter civarı bir özet gidiyor (~2000 token). Dünya haberleri, ABD/Avrupa özeti, gündem zincirleri ve son 3 analizin hafızası eklenince özet ~%15 büyüdü.
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
- Gündem temaları kural tabanlıdır; piyasanın haberi zaten fiyatlamış olabileceğini bilmez. Güç puanı (0-100) kanıtın miktarını gösterir, getiri beklentisini değil.
- Dünya haber odakları ülke adından çıkarılır (ör. "Wall Street" → New York). Bir haber birden çok ülke anıyorsa ilki alınır.
- CNBC ve NPR akışları bu ortamda 403 döndüğü için eklenmedi. Eklenen dünya kaynakları (MarketWatch, Guardian, Nikkei Asia, France 24, FT, OilPrice, Investing) canlı doğrulandı.

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
- Harita verisi: Natural Earth (kamu malı), [world-atlas](https://github.com/topojson/world-atlas) paketi üzerinden. Dünya haritası tek seferlik SVG yoluna çevrildi (`public/world.json`), çalışırken dışarıya istek atılmaz.
- Koyu lacivert finans paleti ve "finans panelinde koyu varsayılan" kararı: [ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill). Yükseliş/düşüş renkleri yeni yüzeye karşı renk körlüğü testinden yeniden geçirildi.
- Kaynaklar arası kontrol fikri: [Libreta](https://github.com/danielochoa94/libreta) (Apache 2.0; kod alınmadı, "checks.yaml" yaklaşımı uyarlandı).
- AI talimatındaki "olguyu yorumdan ayır, eksik veriyi söyle, tahminle doldurma" kuralları: [FAB – Finance Agents Benchmark](https://github.com/SecondState-ai/finance-agents-benchmark) sistem talimatından. FAB'da DeepSeek V4.1 Flash %60 ile birinci; ama zor görevlerde %29'da kalıyor ve 50 görevin yalnızca 23'ünü üç denemede de geçebiliyor. Yani aynı soruya her seferinde aynı cevabı vermiyor; karnenin önemi bu.
- İncelenip kullanılmayanlar: [botasaurus](https://github.com/omkarcloud/botasaurus) (bot tespitini atlatan Python/Chrome kazıyıcı; radar sitelere dürüst kimlikle gidiyor, üstelik gerçek engeller bot tespiti değil: Kandilli ağ izin listesinde yok, GDELT hız sınırı koyuyor), [proxy-scraper](https://github.com/maximilianfeix/proxy-scraper) (açık proxy'ler hem gizliliği bozar hem veri kaynaklarının engellemesine yol açar; radar kendi IP'sinden, dürüst kullanıcı ajanıyla istek atar), [CSVLint](https://github.com/BdR76/CSVLint) (Notepad++ eklentisi; kullanılan CSV'ler FRED/ECB/FIRMS'ün sabit biçimli dosyaları).
