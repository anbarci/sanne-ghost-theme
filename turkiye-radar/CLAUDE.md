# Türkiye Radar

Kişisel, Türkiye merkezli istihbarat ve piyasa paneli. Node 22, tek bağımlılık (`@anthropic-ai/sdk`). Veritabanı yok: `runtime/*.json`.

- Kaynak ekleme: `radar-kaynak-ekle` skill'i
- Denetim (güvenlik, gizlilik, token, tasarım): `radar-denetim` skill'i
- Arayüz değişikliği: `hallmark` skill'i (vendored, MIT)
- Test: `npm test`. Ağsız tek tarama: `npm run sweep`
- Arayüz metinleri ve kod yorumları Türkçe.
