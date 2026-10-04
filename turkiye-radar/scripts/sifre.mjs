// Bir üyenin şifresini terminalden belirler (panele giremediğinde ya da şifreyi unuttuğunda).
// Kullanım: node scripts/sifre.mjs <kullanıcı-adı>            → şifreyi gizli sorar
//           node scripts/sifre.mjs <kullanıcı-adı> <yeni-şifre> → doğrudan (kabuk geçmişine yazılır)
// Kullanıcı yoksa yönetici olarak oluşturulur. Sunucu çalışırken de kullanılabilir; açık oturumlar düşer.
import { users, updateUser, createUser } from '../lib/members.mjs';

const [ad = 'admin', arg] = process.argv.slice(2);
const ask = () => new Promise(res => {
  process.stdout.write('Yeni şifre (en az 10 karakter): ');
  const stdin = process.stdin; let pw = '';
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.resume(); stdin.setEncoding('utf8');
  stdin.on('data', ch => {
    for (const c of ch) {
      if (c === '\r' || c === '\n') { if (stdin.isTTY) stdin.setRawMode(false); stdin.pause(); process.stdout.write('\n'); return res(pw); }
      if (c === '\u0003') process.exit(1);
      if (c === '\u007f') pw = pw.slice(0, -1); else pw += c;
    }
  });
});
const pw = arg || await ask();
const u = users().find(x => x.ad === ad.toLowerCase());
try {
  if (u) { updateUser(u.id, { password: pw }, null); console.log(`"${u.ad}" kullanıcısının şifresi değişti.`); }
  else { createUser({ ad, password: pw, rank: 'yonetici' }); console.log(`"${ad}" yönetici olarak oluşturuldu.`); }
} catch (e) { console.error('Hata:', e.message); process.exit(1); }
