import { markets, crypto } from './markets.mjs';
import { tcmb, evds, epias, resmiGazete } from './turkey.mjs';
import { quakes } from './quakes.mjs';
import { rss, gdelt } from './news.mjs';
import { macro, fred, ecb, calendar, firms, weather } from './global.mjs';

// Yeni kaynak eklemek: modül yaz, buraya ekle. Ayrıntı: .claude/skills/radar-kaynak-ekle/SKILL.md
export const SOURCES = [markets, crypto, tcmb, evds, epias, resmiGazete, quakes, rss, gdelt, macro, fred, ecb, calendar, firms, weather];
