// Veri kontrolleri: aynı büyüklüğü iki bağımsız kaynaktan karşılaştırır ve bayat veriyi yakalar.
// Fikir Libreta'dan (checks.yaml: "bilanço denk mi?" gibi testler). Kod yazarken test ne ise veri için bu.
// Geçmeyen kontrol hem panelde görünür hem AI özetine "KONTROL" satırı olarak gider.

const pctDiff = (a, b) => (a / b - 1) * 100;
const f2 = x => x.toFixed(2).replace('.', ',');

export function runChecks(s, now = Date.now()) {
  const out = [];
  const add = (ad, ok, detay) => out.push({ ad, ok, detay });
  const m = s.markets || {};

  // 1) Dolar/TL: Yahoo (piyasa ortası) ile TCMB efektif satış (bir önceki iş günü 15:30). Arada gün farkı
  // ve alış-satış makası var; %1,5'i aşan fark kaynaklardan birinin yanlış olduğunu gösterir.
  const tcmbUsd = s.tcmb?.rates?.USD?.sell;
  if (m.USDTRY?.price && tcmbUsd) {
    const d = pctDiff(m.USDTRY.price, tcmbUsd);
    add('Dolar/TL: Yahoo ↔ TCMB', Math.abs(d) <= 1.5, `${m.USDTRY.price} / ${tcmbUsd} (TCMB ${s.tcmb.date}), fark %${f2(d)}`);
  }
  // 2) Euro/TL: Yahoo ile ECB referans kuru (günlük, 16:00 CET).
  const ecb = s.ecb?.EURTRY?.value;
  if (m.EURTRY?.price && ecb) {
    const d = pctDiff(m.EURTRY.price, ecb);
    add('Euro/TL: Yahoo ↔ ECB', Math.abs(d) <= 1.5, `${m.EURTRY.price} / ${ecb} (ECB ${s.ecb.EURTRY.date}), fark %${f2(d)}`);
  }
  // 3) Çapraz kur: EUR/TRY ÷ USD/TRY, ECB'nin kendi EUR/USD'sine yakın mı? (ECB'de EUR/USD varsa)
  if (m.EURTRY?.price && m.USDTRY?.price && s.ecb?.EURUSD?.value) {
    const d = pctDiff(m.EURTRY.price / m.USDTRY.price, s.ecb.EURUSD.value);
    add('Çapraz kur EUR/USD', Math.abs(d) <= 1, `hesaplanan ${(m.EURTRY.price / m.USDTRY.price).toFixed(4).replace('.', ',')} / ECB ${s.ecb.EURUSD.value}, fark %${f2(d)}`);
  }
  // 4) Vadeli kontrat devri şüphesi: günlük değişim güvenilmez.
  const roll = Object.entries(m).filter(([, v]) => v.roll === 'şüpheli').map(([k]) => k);
  if (roll.length) add('Vadeli kontrat devri', false, `${roll.join(', ')}: günlük değişim güvenilir değil`);
  // 5) Bayat fiyat: son işlem 3 günden (hafta sonu dahil) eskiyse.
  const stale = Object.entries(m).filter(([, v]) => v.time && now - v.time > 72 * 36e5).map(([k, v]) => `${k} (${Math.round((now - v.time) / 36e5)} sa)`);
  add('Fiyatların tazeliği', !stale.length, stale.length ? `Eski: ${stale.join(', ')}` : `${Object.values(m).filter(v => v.time).length} fiyat son 3 gün içinde`);
  // 6) Tarayıcı verisi: her piyasanın günlük fiyat dosyası 4 günden eski olmamalı; eksik hisse sayısı.
  for (const sc of Object.values(s.screeners || {})) {
    if (!sc) continue;
    const age = (now - new Date(sc.asOf).getTime()) / 36e5;
    const miss = sc.failed?.length || 0;
    add(`${sc.ad} fiyat dosyası`, age <= 96 && miss <= 3, `${Math.round(age)} sa önce, ${sc.rows.length} hisse${miss ? `, ${miss} hisse alınamadı` : ''}`);
  }
  return out;
}
