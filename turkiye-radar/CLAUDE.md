# Türkiye Radar

Kişisel, Türkiye merkezli istihbarat ve piyasa paneli. Node 22, veritabanı yok: `runtime/*.json`.

- **Her istekte önce `KARARLAR.md`'yi oku.** Ne, neden yapıldı; neyin hatalı çıktığı ve kanıtı orada. Değişiklik oradaki bir kararla çelişiyorsa gerekçeyi yeniden tart. İş bitince ilgili bölüme tarihli kayıt ekle (ne · neden · kanıt · test).
- Her özelliği canlı veriyle dene ve ekran görüntüsüyle bak; birim testi tek başına yeterli değil.
- Kaynak ekleme: `radar-kaynak-ekle` skill'i
- Denetim (güvenlik, gizlilik, token, tasarım): `radar-denetim` skill'i
- Arayüz değişikliği: kullanıcı düzeyinde kurulu hallmark / anti-slop skill'leriyle denetle (repoya eklenmez)
- Test: `npm test`. Ağsız tek tarama: `npm run sweep`
- Arayüz metinleri ve kod yorumları Türkçe.
