// Sayıdan sonra gelen iyelik eki: "5'i", "3'ü", "6'sı", "0'ı", "%60'ı". Ek, sayının okunuşunun son kelimesine uyar
// (sıfır, bir, iki, üç, dört, beş, altı, yedi, sekiz, dokuz; on, yirmi, otuz, kırk, elli, altmış, yetmiş, seksen, doksan; yüz; bin).
// Arayüzdeki kopyası public/common.js içinde; ikisi aynı kalmalı.
const BIRLER = ['', 'i', 'si', 'ü', 'ü', 'i', 'sı', 'si', 'i', 'u'];
const ONLAR = ['', 'u', 'si', 'u', 'ı', 'si', 'ı', 'i', 'i', 'ı'];
export function ek(n) {
  n = Math.abs(Math.round(Number(n)));
  const e = n === 0 ? 'ı' : n % 10 ? BIRLER[n % 10] : n % 100 ? ONLAR[(n / 10) % 10] : n % 1000 ? 'ü' : n % 1e6 ? 'i' : 'u';
  return `${n}'${e}`;
}
