@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 22.21 veya ustu gerekli: https://nodejs.org & pause & exit /b 1)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=21)?0:1)" || (echo Node.js surumu eski. 22.21 veya ustunu kurun: https://nodejs.org & pause & exit /b 1)
if not exist node_modules (echo Ilk kurulum: bagimliliklar yukleniyor... & call npm install --omit=dev || (pause & exit /b 1))
echo.
echo Panel: http://127.0.0.1:3120   Ilk acilista konsoldaki "kurulum anahtari" ile /admin sayfasinda sifre belirleyin.
start "" http://127.0.0.1:3120/admin
call npm start
pause
