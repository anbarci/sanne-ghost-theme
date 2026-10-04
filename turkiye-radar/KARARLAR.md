# Türkiye Radar · Karar ve hata günlüğü

Bu dosya projenin hafızasıdır: ne yapıldı, neden yapıldı, neyin hatalı çıktığı, nasıl düzeltildiği ve bunun kanıtı.

**Her yeni istekte önce bu dosya okunur.** Değişiklik buradaki bir kararla çelişiyorsa ya kararın gerekçesi
yeniden tartılır ve kayıt güncellenir, ya da değişiklik o karara uydurulur. Her değişiklikten sonra ilgili
bölüme tarihli bir kayıt eklenir: **ne · neden · kanıt · test**. "Kanıt" gerçek veriden bir ölçüm, bir hata
çıktısı ya da bir ekran görüntüsünün anlattığıdır; tahmin değildir.

İlk plan konuşmada yapıldı ve repoya yazılmadı. Bu dosya 2026-10-03'te commit geçmişinden, README'deki doğrulama
kayıtlarından ve konuşmadaki kararlardan geriye doğru derlendi; o tarihten sonrası canlı tutulur.

---

## 1. Değişmez ilkeler

| İlke | Gerekçe |
|---|---|
| Yalnızca gerçek veri. Demo/sahte veri arayüze girmez; testlerde sahte veri açıkça işaretlenir. | Kullanıcı isteği. Demo veriyle geçen testler gerçek veride çok sayıda hata saklıyordu (bkz. 3. bölüm). |
| Her özellik canlı veriyle denenir, ekran görüntüsü alınır. Birim testi tek başına "bitti" demek değildir. | 2026-10-03'te yeni testler geçiyordu ama ekran görüntüsü 1 günlük eski fiyatı ve yanlış değişimi gösterdi. |
| Dürüstlük ("dost acı söyler"): kanıtlanmamış üstünlük iddia edilmez; strateji karnesi kötüyse arayüz bunu yazar. | Tarayıcı stratejileri geriye dönük testte BIST 100'ü geçemedi; panel bunu açıkça gösteriyor. |
| Kişisel kullanım (2026-10-02 kararı). Yaygınlaştırma / ücretli üyelik yok. | Maliyet ve SPK (yatırım danışmanlığı izni) / KVKK riski. Üyelik altyapısı duruyor ama kapatılabilir. |
| Gizlilik: harici CDN, font, analitik yok; panel varsayılan olarak yalnızca 127.0.0.1. | Kullanıcı tercihi; Crucix'te CDN üzerinden IP sızıyordu. |
| Kullanıcının şifresi koda, repoya, commit'e yazılmaz. Şifre `npm run sifre -- admin` ile yerelde verilir. | Kullanıcı sohbette şifre yazdı; repoya girmesi geri alınamaz bir sızıntı olurdu. |
| Obsidian kasa yolu web panelinden verilemez, yalnızca `RADAR_OBSIDIAN_DIR`. | Panele erişen biri diske istediği yere yazdıramasın. |
| API anahtarları (`rdr_…`) salt okunur, yalnızca `GET /api/v1/*`. | Dış araç (ToolJet, Excel) sızarsa veri değiştiremesin. |
| Web aramasında yerel ağ adresleri açılmaz (SSRF koruması). | SearXNG/okuma isteği iç ağı taramasın. |
| AGPL/GPL kodu alınmaz; fikir uyarlanır ve README "Teşekkür"de anılır. | Crucix, webclaw, ToolJet (AGPL), PSSA, CSVLint (GPL). |
| Commit mesajlarında model adı yok; yalnızca `claude/wonderful-hopper-bug6lv` dalına gönderilir. | Oturum kuralları. PR: [anbarci/sanne-ghost-theme#1](https://github.com/anbarci/sanne-ghost-theme/pull/1). |

## 2. Mimari (kısa)

- Node 22, veritabanı yok: `runtime/*.json`. Tek sunucu `server.mjs`, arayüz `public/` (modül JS, sıkı CSP: satır içi stil yok, genişlikler CSSOM ile).
- Tarama (`lib/sweep.mjs`) 15 dk'da bir; fiyat şeridi dakikada bir tek Yahoo spark isteğiyle (`lib/live.mjs`).
- Trade: `lib/screener.mjs` (skor + geriye dönük test), `lib/levels.mjs` (teknik görünüm, destek/direnç), `lib/catalysts.mjs` + `data/themes.json` (gündem → hisse), `lib/ai/debate.mjs` (boğa–ayı), `lib/watch.mjs` (izleme, alarm).
- Yapay zekâ: DeepSeek varsayılan; tek analiz çağrısı + sohbet + tartışma, ortak günlük bütçe.
- Hafıza: ölçülmüş isabet + PSSA kurallı dersler + sınırsız arşiv ağacı (analizler ve tartışmalar) + Obsidian aktarımı.

---

## 3. Kayıt

### Veri ve kaynaklar

**2026-09-30 · Dürüst kullanıcı ajanı**
- Ne: API'lere `TurkiyeRadar/0.1` kimliğiyle gidiliyor; haber sayfalarında tarayıcı kimliği kalıyor.
- Neden / kanıt: Sahte Chrome kimliği Yahoo'dan 429 aldı; FRED ve IMF isteği reddetti.

**2026-09-30 · Etki skoru doymuştu**
- Kanıt: Tam metinde gövdedeki her kelime başlıktaki kadar sayılıyordu; bir tarım köşe yazısı 100 aldı.
- Düzeltme: Başlık 0,6, gövde 0,15 ağırlık. 300 gerçek haberle ayarlandı; 60 üstünde 7 haber kaldı.

**2026-09-30 · Vadeli kontrat devri (1. kez)**
- Kanıt: Brent serisi -%6,1 gösterdi; iki kontrat da gerçekte yaklaşık +%0,2 idi.
- Düzeltme: Seri sıçrayınca fiyatı eşleşen gerçek kontrat bulunur, değişim onun geçmişinden hesaplanır.

**2026-09-30 · Vadeli kontrat devri (2. kez)**
- Kanıt: Aynı akşam seri -%4,73 gösterdi; Aralık kontratının (BZZ26) kendi geçmişi +%1,6. Eşik (2 × oynaklık = %4,88) bunu kaçırdı ve gündem "petrol düştü → THY lehine" diye yanlış sinyal üretti.
- Düzeltme: Eşik 1,5 × oynaklığa indi. Kontrat bulunamazsa (Yahoo 429) canlı fiyatın kendi önceki kapanışı kullanılır ve petrol teması üretilmez.
- Test: `units: Vadeli kontrat devri`, `mergeLive`.

**2026-09-30 · Node vekil ayarını okumuyordu**
- Kanıt: `curl` 200 alırken `fetch` 403 aldı.
- Düzeltme: `--use-env-proxy` bayrağı eklendi.

**2026-09-30 · Kaynaklar sessizce başarısız oluyordu**
- Kanıt: Ağ yokken kaynaklar "başarılı" görünüyordu.
- Düzeltme: Hata artık açıkça gösteriliyor.

**2026-09-30 · İngilizce haberler kaçıyordu**
- Kanıt: Türkçe küçük harf kuralı "Israel"i "ısrael" yaptı.
- Düzeltme: Katlama (`fold`) dile duyarsız hale getirildi.

**2026-09-30 · Çapraz teyit hataları**
- Kanıt: Gerçek veride dört ayrı hata çıktı:
  - "asılsız" kelimesi katlanınca eşleşmiyordu;
  - "denies" geçen haber kendini yalanlama sanıyordu;
  - yayıncının kendisi teyit sayılıyordu (Dünya → Dünya Gazetesi, BirGün → birgun.net);
  - eski teyit sonucu RSS önbelleğiyle taşınıyordu;
  - SearXNG 2 hafta önceki haberi bugünkünü teyit eder gibi döndü.
- Düzeltme:
  - ASCII kalıplar kullanılıyor;
  - "denies" çıkarıldı;
  - yayıncının kendisi `pubTokens` ile dışlanıyor;
  - teyit önbellekten değil, her taramada yeniden hesaplanıyor;
  - tarihsiz ya da 72 saatten eski sonuç sayılmıyor.

**2026-09-30 · Fiyat gecikmeleri ölçüldü**
- Döviz yaklaşık 2–8 sn, vadeli yaklaşık 10 dk, BIST 15 dk. Gerçek zamanlı BIST lisans ister.
- Şeritte her fiyatın yanında gecikmesi yazar.

**2026-10-03 · Yahoo son günün kapanışını boş bırakıyor**
- Kanıt: Cuma (02.10) için 61 BIST ve 38 Avrupa hissesinin günlük barında `close: null` geldi. Açılış, yüksek, düşük ve hacim doluydu; gerçek kapanış yalnızca `meta.regularMarketPrice`'ta vardı (THYAO 292). Bar atıldığı için iki hata çıktı:
  1. Tarayıcı bir gün geride kaldı (THYAO 286,50).
  2. Şeritte izlenen hisselerin günlük değişimi iki gün öncesine göre hesaplandı: +%3,09 göründü, doğrusu +%1,92.
- Nasıl yakalandı: Ekran görüntüsünde izleme listesi 292, grafik 286,50 gösterdi.
- Düzeltme:
  - `parseYahoo`: Son bar özet fiyatla tamamlanır, ama yalnızca özet fiyat aynı güne aitse. `filled` alanı işaretlenir, arayüz bunu not olarak yazar.
  - `markets.yahoo`: Aynı tamamlama burada da yapılır.
- Doğrulama: Yeniden taramada 61 + 38 hisse tamamlandı; THYAO her yerde 292 / +%1,92.
- Test: `units: Yahoo son günün kapanışını boş bırakınca…` (gerçek yanıtla).

### Gündem temaları (catalysts)

**2026-09-30 · Kelime eşleşmesi yanlış pozitif verdi**
- Kanıt:
  - "altına geriledi" haberi altın teması sayıldı;
  - Fed haberi TCMB temasına girdi;
  - şirket tonu "cost" kelimesini Costco'ya, "race" kelimesini Ferrari'ye bağladı;
  - tek başlık tema doğuruyordu.
- Düzeltme:
  - kelime başından eşleşme;
  - `gerekli` ve `haric` listeleri;
  - en az 2 haber ve net 2 haber aynı yönde olmalı;
  - şirket düzeyinde ton tamamen kaldırıldı.

**2026-10-03 · Savunma teması ters yön verdi**
- Kanıt: Aselsan'ın 488,5 milyon euroluk sözleşmesi ve Raytheon'un SM-6 sözleşmesi haberleri varken tema "23 haberin 9 fazlası olumsuz → ASELS ▼" dedi. Genel ton sözlüğü savaş haberlerini olumsuz sayıyor, oysa bu haberler savunma talebini artırıyor.
- Düzeltme: Temaya kendi yön kelimeleri verildi.
  - Yukarı: sözleşme, sipariş, ihale, ihracat, üretim, deploy, contract…
  - Aşağı: iptal, ateşkes, ambargo, ertele, cancel…
- Doğrulama: Gerçek veride sonuç "12 haberin 5 fazlası olumlu" çıktı.
- Test: `units: Savunma teması…` (gerçek başlıklarla).
- Ders: Ton sözlüğü bağlamdan bağımsız değil; bir temanın yönü genel tondan okunuyorsa gerçek başlıklarla kontrol edilmeli.

**2026-10-03 (2. tur) · 13 temanın tamamı gerçek haberlerle denetlendi**
- Neden: Savunma dersinden sonra "Açık konular" bölümünde "yönü gerçek başlıklarla dene" yazıyordu; bu yalnızca savunmada yapılmıştı.
- Kanıt (297 gerçek haber):
  - Çelik temasının 4 haberinin 3'ü soyadı "Çelik" olan kişilerdi (Özgür Çelik, Erhan Çelik, "İl Başkanı Çelik").
  - Özette geçerken anılan kelime haberi temaya bağlıyordu:
    - Allianz büyüme tahmini ("yapay zekaya ilişkin soru işaretleri") yapay zekâ çiplerine,
    - İran yaptırımı ("İran'ın iç otomotiv pazarı") Avrupa otomotivine,
    - orman yazısı ("turizm vb. tahsisler") ve Gebele gezi yazısı turizme bağlanmıştı.
  - Fed teması özetteki "faiz artırma ihtimalinin %22'ye gerilemesi"ni (güvercin) "artır" kökü yüzünden şahin saydı ve GARAN/AKBNK ▼ üretti.
  - Fed "olumsuz" derken ilk kanıt tam ters yöndeki "faiz artışı için aciliyet görmüyor" haberiydi.
- Düzeltme (`lib/catalysts.mjs`):
  1. Haber temaya ancak şu koşullardan biriyle girer: anahtar başlıkta geçer; ya da özette en az iki kez geçer; ya da başlık temanın etkilediği bir şirketi anar ("Aselsan'dan 488,5 milyon euroluk sözleşme").
  2. Yön yalnızca başlıktan okunur.
  3. Kanıt listesinde yönü taşıyan haberler önce gelir.
  4. Çelik anahtarları "çelik üretim/ihracat/fiyat", "steel", "inşaat demiri" gibi kalıplara daraltıldı; çıplak "tarife/tariff" çıkarıldı.
  5. Turizm anahtarları "turist sayısı", "turizm geliri", "doluluk" gibi talep kalıplarına daraltıldı.
  6. Petrol anahtarlarına başlıkta kullanılan "varil", "barrel", "diesel", "motorin", "tanker" eklendi; kural sıkılaşınca G7'nin 100 milyon varil haberi dışarıda kalıyordu.
  7. Fed yönüne "artır" ve "indir" kökleri eklendi.
- Kuralın bedeli (dürüst kayıt): Kural ilk denemede Aselsan sözleşmesini ve G7 petrol haberini de düşürdü; şirket adı koşulu ve petrol anahtarları bu yüzden eklendi.
- Sonuç: Savunma doğru kanıtlarla kaldı (Raytheon, Ukrayna'nın Patriot üretimi, Aselsan). Fed teması bugün oluşmuyor; tek net şahin başlık var, yanlış bir "banka ▼" sinyali vermekten iyi.
- Test: `units: Tema eşleşmesi: özette geçerken anılan konu…` (gerçek başlıklar).
- Sınır: Kelime kuralı olumsuzlamayı hâlâ okuyamaz ("artış için aciliyet görmüyor"). Bu yüzden yön için en az iki net başlık şartı korunuyor.

### Tarayıcı ve Trade

**2026-09-30 · Geriye dönük test dürüst kurgulandı**
- Kurgu: Sinyal t gününde, giriş t+1'de, çıkış t+1+10'da; ölçüm her 5 günde bir.
- Kanıt: 2025-08 → 2026-09 arasında hiçbir strateji endeksi geçemedi. Panel "Kanıtlanmış üstünlük yok" yazar.

**2026-09-30 · Temettü ve bedelsiz düzeltmesi**
- Temettü için `adjclose` kullanılıyor (Vibe-Trading'den).
- Bedelsiz için BIST'in ±%10 marj kuralı kullanılıyor. Kanıt: KONTR 2025-12-01'de 33,40'tan 17,18'e düştü.

**2026-09-30 · Portföy THYAO'yu dolarla fiyatladı**
- Neden: Şerit kaydı önce bulunuyordu.
- Düzeltme: Önce tarayıcı satırına bakılıyor; `.IS` kodlu hisseler TRY sayılıyor.

**2026-09-30 · Boğa–ayı tartışması**
- Kaynak: TradingAgents'ın akışı (Apache-2.0); kod alınmadı.
- Kararlar:
  - 4 model çağrısı yapılıyor, analist çağrısı yok: radarın verisi doğrudan veri sayfası olarak veriliyor.
  - Okunamayan karar TUT değil İNCELE sayılıyor.
  - Risk gözden geçiricisi kararı yalnızca temkinliye çekebiliyor.
  - Karar endekse göre (alfa) puanlanıyor.
- Kanıt: Sahte modelin uydurduğu "RSI 62", "280" gibi rakamlar "veride yok" diye işaretlendi; uydurma rakam denetimi çalışıyor.

**2026-10-03 · Teknik görünüm ve destek/direnç**
- Kaynak: PanWatch fikri (MIT); kod alınmadı.
- Ne: `lib/levels.mjs`:
  - Altı gösterge (ana/kısa trend, MACD, RSI, hacim, göreli güç) ayrı ayrı olumlu/olumsuz/nötr.
  - Son bir yılın dönüş noktalarından kümelenmiş, kaç kez test edildiği sayılmış seviyeler.
  - Seviyeler grafikte D1/D2/R1/R2 çizgisi olarak çiziliyor.
  - Tarayıcı satırına ve sohbet/tartışma veri sayfasına giriyor.
- Neden:
  1. Tartışmada model "280 altı" gibi seviyeler yazıyordu ama veride seviye yoktu, bu yüzden "doğrulanamayan rakam" çıkıyordu. Artık seviyeler veride var.
  2. Detay paneli çıplak bir sayı listesiydi.
- Sınır: Bu bir tarif, sinyal değil. Arayüz trend stratejisinin endeksi geçemediğini yazmaya devam ediyor.

**2026-10-03 · İzleme listesi ve fiyat alarmları**
- Kaynak: PanWatch fikri; kod alınmadı.
- Ne: `lib/watch.mjs`:
  - Üyeye özel liste; koşul + eşik + tekrar (günde bir / bir kez).
  - Dakikalık fiyat döngüsünde ve taramada denetleniyor; Telegram açıksa oraya gidiyor.
- Kararlar:
  - SSE ile yalnızca "alarm var" sinyali yayınlanıyor; metin üyenin kendi listesinden okunuyor. Neden: bir üyenin alarmı başkasının tarayıcısına düşmesin.
  - Kayıt dosyası `watch.json`. `alerts.json` Telegram olay kaydı olarak kullanılıyor; karışmasın diye ayrıldı.
- Doğrulama: Gerçek veride alarm kuruldu; bir dakika içinde "SOKM 100.000 altına indi: 57,15" kaydı düştü.

**2026-10-03 · Trade tasarım düzeltmeleri**
- Kanıt: Ekran görüntülerinde dört sorun görüldü:
  - Varsayılan strateji "Gündem" ilk açılışta yalnızca "Gündem aleyhine, 0 puan" iki satır gösteriyordu.
  - Telefonda grafik listenin üstündeydi; hisse seçmek için uzun kaydırma gerekiyordu.
  - Sohbet düğmesi son satırları örtüyordu.
  - Detay paneli düz bir sayı listesiydi.
- Düzeltme:
  - Varsayılan strateji Trend.
  - Gündem stratejisinde lehine ve aleyhine hisseler ayrı başlıkta; aleyhine olanlar puan yerine "aleyhine" etiketi taşıyor.
  - ≤720 px'te liste önce geliyor; hisse seçilince grafiğe kayılıyor; altta 84 px boşluk bırakıldı.
  - Detay: teknik görünüm, seviye merdiveni, strateji gerekçesi ve haberler.
  - Grafik başlığına "☆ İzle" ve "Alarm kur" eklendi. Alarm formu eşik olarak en yakın direnç ya da desteği öneriyor.
  - Fiyat basamakları her yerde grafik başlığıyla aynı kurala uyuyor.
- Doğrulama: 1440 ve 390 px'te yatay kayma 0, konsol hatası yok.

**2026-10-03 (2. tur) · İlk turda denenmeyen ekranlar**
- Neden: İlk turda yalnızca Türkiye, koyu tema, 1440 ve 390 px denenmişti.
- Kanıt (ekran görüntüleri):
  1. Açık temaya geçince destek/direnç çizgileri kayboluyordu. Tema değişince grafik yeniden kuruluyor, çizgiler eski seriyle gidiyordu.
  2. 1024 px'te hisse listesi tam genişlikte tek sütundu; satırın ortası boş kalıyordu.
  3. "6 göstergenin 5'i olumlu, 0'i olumsuz" yazıyordu. Aynı ek hatası 9 yerde vardı: hafıza ("2'i dolar", "%0'i tuttu"), Obsidian ve tartışma karnesi. İki mevcut test yanlış eki doğru diye kabul ediyordu.
  4. Yönetici için "Bugün kalan hak: 100000" yazıyordu.
- Düzeltme:
  1. Çizgiler `fillChart` içinde her çizimde yeniden kuruluyor.
  2. 721–1100 px'te liste iki sütun.
  3. `lib/tr.mjs` / `common.js` `ek()`: ek sayının okunuşuna uyuyor (0'ı, 2'si, 3'ü, 6'sı, %60'ı). Testler düzeltildi.
  4. Yönetici için "Sınırsız" yazıyor.
- Doğrulama:
  - ABD (NVDA) ve Avrupa (SU) seçildi; teknik görünüm ve 4 seviye geldi.
  - Telefonda alarm formu ekrana sığıyor.
  - 1024 ve 390 px'te yatay kayma 0, konsol hatası yok.
- Test: `units: Sayıdan sonra gelen ek…`.

### Yapay zekâ

**2026-09-30 · DeepSeek 401**
- Kanıt: Anahtar alanına `https://api.deepseek.com` yapıştırılmıştı.
- Düzeltme:
  - `checkKey` adresi, boşluğu ve yanlış öneki reddediyor (DeepSeek `sk-`, Anthropic `sk-ant-`).
  - Alana `autocomplete=new-password` eklendi.
  - 401 ve 402 hataları Türkçe açıklanıyor.

**2026-09-30 · Varlık sütunu boştu, tahminler puanlanmıyordu**
- Kanıt: DeepSeek JSON alan adlarını kaydırıyordu (`varlik`, `ad`, `Dolar/TL`, `%65`).
- Düzeltme:
  - Sistem talimatına birebir alan adlarıyla bir JSON şablonu eklendi.
  - `normalizeResult` kayan adları düzeltiyor; eski kayıtlar okunurken de düzeltiliyor.

**2026-09-30 · FAB benchmark kuralları**
- "Olguyu yorumdan ayır" ve "eksik veriyi uydurma, söyle" kuralları eklendi.
- DeepSeek FAB'da birinci, ama zor görevlerde %29'da kalıyor ve tutarsız. Karne bu yüzden var.

**2026-10-03 · TL etkisi**
- Ne: TL ile fiyatlanan varlıklarda (XU100, gram altın, BTC/TL) tahminin dolar bazındaki sonucu da saklanıyor.
- Neden: Nominal "yukarı" tahmini TL'nin değer kaybı sayesinde tutmuş görünebilir.

### Hafıza

**2026-09-30 · Hafıza katmanları**
- PSSA kuralları:
  - benzer ders tekrar gelince pekişiyor;
  - 3 kez doğrulanan ders kalıcı ilke oluyor;
  - kapasite 30 ders;
  - analize ≤3 ilke ve en ilgili 4 ders giriyor.
- PageIndex ağacı: ay → hafta → gün → analiz.
- Feynman araması ve kaynak kaydı.
- dbx sıkıştırması: son 8 mesaj aynen, eskileri özetleniyor.
- Test verisinde bulunan hata: Dersler birbirine fazla benziyordu ve en eski ders siliniyordu. Test verisi düzeltildi.

**2026-09-30 · Tartışmalar arşive, ağaca, aramaya ve Obsidian'a**
- Ne:
  - `debate-archive.json` sınırsız tutuluyor; puanlama arşiv üzerinden yapılıyor.
  - Ağaçta tek tartışma `T<zaman>` ile açılıyor.
- Neden: Kullanıcı tartışmaların hatırlanmasını istedi; eski düzende son 300'ün dışı siliniyordu.

### Arayüz ve tasarım

**2026-09-30 · Anti-slop denetimi**
- Süslü ayırıcılar, renkli sol şerit ve büyük harfli etiketler kaldırıldı.
- hallmark skill'i projeden çıkarıldı (kullanıcı isteği).

**2026-09-30 · Gösterge kartları**
- Kanıt: Dolar/altın/BIST kartları "yamuk" ve eşit değildi; kıvılcım grafik sayıların üzerine biniyordu.
- Düzeltme: Dört eşit sütun; kıvılcım grafik altta. 1440/1024/390 px'te kart yükseklikleri ölçülüp eşit bulundu.

**2026-09-30 · Dünya haritası**
- Kanıt: Ülke sınırları gün değiştirme çizgisinde haritayı yatay kesen çizgiler oluşturuyordu.
- Düzeltme: Halkalar bölündü, Antarktika çıkarıldı.

**2026-10-04 · impeccable critique (arayüz denetimi)**
- Ne: [impeccable](https://github.com/pbakaus/impeccable) (Apache-2.0) `critique` protokolü uygulandı:
  - A: tasarım incelemesi, Nielsen puanları, bilişsel yük, personalar.
  - B: 61 kurallı dedektör (CLI + 4 görünümde tarayıcıya enjekte).
  - Alt ajan istenmediği için tek bağlamda yapıldı (raporda belirtildi).
- Sonuç: **27/40, kabul edilebilir.** Kayıt: `.impeccable/critique/2026-10-04T05-27-13Z__public-index-html.md`.
- Öncelikli bulgular (kanıtlı):
  - P1: Haberde çözülmemiş HTML kodları (`&ccedil;` vb., Bloomberg HT).
  - P1: Mobil Gündem 11.760 px; önemli paneller 8.000 px altında.
  - P2: Rozet çorbası ve düz tipografi hiyerarşisi (13,4 / 17,6 px).
  - P2: 11 px altı işlevsel yazılar ("kapalı" 9,9 px) ve 4,0:1 yer tutucu kontrastı.
  - P2: Tarayıcı satırında 1 aylık değişimin kesilmesi.
- Dedektörün yanlış alarmları: kapalı menü ve kendi etiketleri "örtüşen metin"; grafik kütüphanesinin iç kırpması.
- Durum: Düzeltmeler kullanıcının öncelik seçimini bekliyor.

### Güvenlik ve altyapı

**2026-09-30 · Kurulumdan önce sahte çerezle girilebiliyordu**
- Düzeltildi.

**2026-09-30 · Vekil arkasında giriş kilidi herkese ortaktı**
- Kanıt: Caddy arkasında bütün istekler 127.0.0.1'den geliyormuş gibi görünüyordu.
- Düzeltme: `RADAR_TRUST_PROXY=1` iken X-Forwarded-For'un son girdisine bakılıyor.
- Test: Bir IP'yi kilitledim, başka IP'den giriş denemesi normal devam etti. Başlığa sahte adres eklemek de işe yaramadı.

**2026-09-30 · Kaynak zaman aşımı sayaçları temizlenmiyordu**
- Kanıt: Testler 45 saniye sürüyordu.
- Düzeltme: Sayaçlar temizleniyor; testler 1 saniyeye indi.

---

## 4. İncelenip kullanılmayanlar

| Seçenek | Neden |
|---|---|
| botasaurus | Bot tespitini atlatmak; radar dürüst kimlikle gidiyor. Teyit için Google News RSS yetti. |
| proxy-scraper | Açık proxy'ler hem gizliliği bozar hem tuzak sunucu riski taşır. |
| Univer | 118 MB bağımlılık, ~7 MB JS; bütün arayüz ~200 KB. |
| ToolJet (gömülü) | AGPL ve ağır. Onun yerine salt okunur API eklendi. |
| OpenStock | Kendi belgelerine göre ücretsiz planda BIST fiyatı yok. |
| token-optimizer | `~/.claude` altındaki tüm oturumları okuyor; "sıfır ağ" dese de Google Fonts çekiyor. |
| anidoodle | Veri panosunda dekoratif çizim işe yaramıyor. |
| Mağaza mobil uygulaması | Apple 3.2.1 ve 4.2, SPK. Önce PWA önerildi; kullanıcı vazgeçti. |
| TypeSafe Jev | Erken erişim, Türkçe desteği belirsiz, iddialar bağımsız doğrulanmamış. Erişim gelirse yalnızca tema sınıflandırmasında karşılaştırmalı denenecek. |

## 5. Açık konular

- **Gündem temaları hâlâ kural tabanlı.** Yeni bir tema eklenirken eşleşmesi ve yönü gerçek başlıklarla denenmeli; 2026-10-03'te 13 temanın hepsi denetlendi. Kelime kuralı olumsuzlamayı okuyamaz.
- **Yahoo resmi bir API değil.** Boş kapanış, kontrat devri ve 429 gibi yeni tuhaflıklar çıkabilir. Kaynak durum tablosu ve kontroller izlenmeli.
- **Hisse alarmları en iyi ihtimalle 15 + 15 dk gecikmeli.** Tarama aralığı ve Yahoo gecikmesi; gerçek zamanlı BIST ücretli lisans ister.
- **Gerçek DeepSeek ile tartışmanın süresi ve maliyeti ölçülmedi.** Bu ortamda API anahtarı yok; kullanıcının ilk gerçek denemesi bekleniyor.
- **Radar tema reposunda duruyor.** Ayrı bir `turkiye-radar` reposuna taşıma kullanıcının onayını bekliyor.
