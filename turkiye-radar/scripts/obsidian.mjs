// Radarın hafızasını Obsidian kasasına aktarır: node scripts/obsidian.mjs <kasa-klasörü>
// Yalnızca <kasa>/wiki/radar/ altına yazar. Sunucu çalışırken de kullanılabilir.
// Her analizden sonra kendiliğinden aktarım için sunucuyu RADAR_OBSIDIAN_DIR=<kasa> ile başlat.
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { exportVault } from '../lib/obsidian.mjs';

const dir = process.argv[2] || process.env.RADAR_OBSIDIAN_DIR;
if (!dir) { console.error('Kullanım: npm run obsidian -- <kasa-klasörü>'); process.exit(1); }
const vault = resolve(dir.replace(/^~(?=\/|$)/, process.env.HOME || '~'));
if (!existsSync(vault)) { console.error(`Klasör yok: ${vault} (önce Obsidian'da kasayı oluştur)`); process.exit(1); }
const r = exportVault(vault);
console.log(`${r.files} not yazıldı, ${r.removed} eski not silindi → ${r.dir}`);
