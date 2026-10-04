#!/usr/bin/env sh
# Türkiye Radar'ı başlatır: Node sürümünü kontrol eder, ilk açılışta bağımlılıkları kurar, tarayıcıyı açar.
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "Node.js 22.21 veya üstü gerekli: https://nodejs.org"; exit 1; }
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=21)?0:1)" || { echo "Node.js sürümü eski; 22.21 veya üstünü kurun."; exit 1; }
[ -d node_modules ] || npm install --omit=dev || exit 1
URL=http://127.0.0.1:3120/admin
( sleep 2; command -v open >/dev/null 2>&1 && open "$URL" || xdg-open "$URL" >/dev/null 2>&1 ) &
echo "Panel: http://127.0.0.1:3120 — ilk açılışta konsoldaki kurulum anahtarıyla /admin'de şifre belirleyin."
exec npm start
