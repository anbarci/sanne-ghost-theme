---
target: Türkiye Radar arayüzü (public/index.html)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/sanne-ghost-theme/turkiye-radar/public/index.html"
target_fingerprint: "sha256:74d0a41fe0a98dae9fe494c1371f8ff2ac44462e32e03696a5dfe1cb4dd177a6"
target_path: /home/user/sanne-ghost-theme/turkiye-radar/public/index.html
timestamp: 2026-10-04T05-27-13Z
slug: public-index-html
---
⚠️ DEGRADED: single-context (alt ajan kullanıcı tarafından istenmedi; A önce yazılıp sabitlendi, sonra dedektör çalıştı)

## Tasarım sağlığı (Nielsen)
| # | İlke | Puan | Ana sorun |
|---|---|---|---|
| 1 | Sistem durumu görünürlüğü | 3 | Gecikme etiketleri ve "güncellendi/taranıyor" iyi; "Takvim alınamadı." nedeni söylenmiyor |
| 2 | Gerçek dünyayla uyum | 3 | Ham değerler sızıyor ("yukari"), açıklamasız jargon (IC, t, D1/R1) |
| 3 | Kullanıcı denetimi | 3 | Alarm silmede geri alma yok, filtreleri tek tıkla temizleme yok |
| 4 | Tutarlılık | 3 | Üstteki ikon düğmeler etiketsiz, başka yerlerde aynı eylemler metinli |
| 5 | Hata önleme | 2 | Alarm eşiği serbest metin (100000 kabul edildi), silmede onay yok |
| 6 | Hatırlamak yerine tanıma | 3 | Komut paleti ve yıldızlar iyi; jargonun ipucu yok |
| 7 | Esneklik ve verim | 3 | Ctrl+K, R/A/T, 1-4 kısayolları var; toplu işlem yok |
| 8 | Sade tasarım | 2 | Gündem: 30 kart × 5-7 eşit rozet; mobilde 11.760 px |
| 9 | Hatadan kurtulma | 3 | Türkçe hatalar ne yapılacağını söylüyor; kaynak hataları sebepsiz |
| 10 | Yardım | 2 | Bağlamsal yardım az; terimler açıklanmıyor |
| **Toplam** | | **27/40** | **Kabul edilebilir** |

## Özgünlük kararı
LLM: Kategoriye özgü öğeler gerçekten bu ürünün: yayın çizgisi (muhalif/yandaş) çerçevesi, Türkiye etki skoru, teyit rozeti, gecikme etiketleri, destek/direnç merdiveni, "kanıtlanmış üstünlük yok" karnesi. Başka bir ürün bunları aynen kullanamaz. Zayıf taraf: haber kartı + rozet dizisi ve KPI kartları jenerik pano kalıbı; her şey aynı ağırlıkta.
Dedektör (CLI, public/): 49 bulgu; 42 tavsiye "ince kenarlık + geniş gölge" (tek bir --shadow belirteci panellerde kenarlıkla birlikte), 2 genişlik animasyonu (app.css:443, 497), 2 yuvarlak köşede kalın vurgu kenarlığı, 1 koyu zeminde renkli parlama (Sohbet düğmesi), 2 kırpan kapsayıcı.
Tarayıcı (4 görünüm): Gündem 58, Trade 81, Dünya 79, Analiz 93 işaret. Gerçek olanlar: işlevsel yazılar 11 px altında ("kapalı" 9,9 px, 34+ kez; "Trend devamı" 10,6 px), düz tipografi hiyerarşisi (gövde 13,4 / h1 17,6 px), tarayıcı satırında metin taşması (span.sub 16-88 px), arama kutusu yer tutucusu kontrastı 4,0:1. Yanlış alarm: kapalı kullanıcı menüsü ve dedektörün kendi etiketleri "örtüşen metin" sayıldı; grafik kütüphanesinin iç kırpması.

## Genel izlenim
Veri dürüstlüğü ve Türkiye'ye özgü bağlam güçlü; arayüz ise her şeyi aynı sesle söylüyor. En büyük fırsat: Gündem'i "önce ne bilmeliyim" sırasına sokmak.

## İyi çalışanlar
- Rakamlar her yerde eş genişlikli yazı tipi ve yön oku + renkle; renk tek başına anlam taşımıyor.
- Kanıtın yanında kusur da söyleniyor: gecikme, teyit sayısı, "kanıtlanmış üstünlük yok", veride bulunamayan rakamlar.
- Trade akışı (liste → grafik → teknik görünüm → seviyeler → alarm) tek ekranda ve sırası mantıklı.

## Öncelikli sorunlar
1. [P1] Haber metninde çözülmemiş HTML kodları (`&ccedil;`, `&ouml;`, `&uuml;`; Bloomberg HT ve dünya listesi). Okunurluğu ve güveni bozuyor. Düzeltme: `decodeEntities` tam Latin-1 adlandırılmış kodları çözsün, test eklensin. Komut: harden.
2. [P1] Mobilde Gündem 11.760 px; haber listesi tek başına 6.476 px, "Gündemden hisselere", harita, takvim ve veri kontrolleri 8.000 px'in altında. Düzeltme: mobilde haberler 8 ile sınırlı + "Tümü", yan paneller haberlerin önüne. Komut: layout.
3. [P2] Rozet çorbası ve düz hiyerarşi: her haber kartında 5-7 eşit rozet, başlık/gövde/etiket boyları birbirine yakın (13,4 / 14,7 / 16 / 17,6 px). Düzeltme: kartta en fazla 2 rozet (teyit + etki), kategori ve yayın çizgisi tek satır metin; h2/h1 ölçeği büyüt. Komut: distill, typeset.
4. [P2] 11 px altı işlevsel yazılar ("kapalı" 9,9 px, "Trend devamı" 10,6 px) ve 4,0:1 yer tutucu kontrastı. Düzeltme: alt sınır 11 px, yer tutucu rengi --muted'in AA geçen tonu. Komut: typeset, audit.
5. [P2] Tarayıcı satırında 1 aylık değişim kesiliyor ("1a ▼ -3,4…"): karar için gereken sayı görünmüyor. Düzeltme: alt satırda şirket adını kısalt, değişimi ayrı ve kesilmeyen bir öğe yap. Komut: layout.

## Persona kırmızı bayrakları
- Alex (güçlü kullanıcı): Kısayollar var ama tarayıcı listesinden klavyeyle izleme/alarm kurulamıyor; Gündem'de 11 filtre denetimi tek sırada.
- Sam (erişilebilirlik): Odak halkaları görünür; ama üstteki yenile ve analiz düğmeleri yalnızca simge, mobilde metin yok; 9,9 px "kapalı" etiketi büyütmede bile zor.
- Casey (mobil): Birincil bilgiler (hisseler, takvim, kontroller) 8.000 px aşağıda; üst başlık 135 px yer kaplıyor; Sohbet düğmesi skor sütununu örtüyor.

## Küçük gözlemler
- Sohbet düğmesi masaüstünde de içerik örtüyor (Dünya sağ paneli, Analiz kanıt listesi) ve koyu zeminde turuncu parlama kullanıyor.
- Boş portföyde dört büyük "₺0,00" kartı boş durumu bastırıyor.
- Piyasa şeridi sağda kesiliyor, kaydırılabileceğine dair ipucu yok.
- "Tahminlerin sonucu" tablosunda ham "yukari" yazıyor.
- Panellerde kenarlık + geniş gölge birlikte; birini seç (dedektörün 42 uyarısı tek belirteçten).
- Üyelik ve rütbe ekranı kişisel kullanım kararından sonra fazla yük.

## Düşünülecek sorular
- Gündem'in ilk ekranı tek bir cümleyle "bugün neyi değiştirmeli" diyebilir mi?
- Haber kartından hangi rozet kalkarsa karar kalitesi düşer? Hiçbiri düşmüyorsa neden orada?
- Kişisel araçta üyelik ekranları görünür kalmalı mı?
