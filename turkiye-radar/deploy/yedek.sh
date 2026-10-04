#!/usr/bin/env sh
# runtime/ klasörünün günlük yedeği (üyeler, ayarlar, analiz arşivi, hafıza). Son 14 gün tutulur.
# cron: 30 3 * * * /opt/turkiye-radar/deploy/yedek.sh
# Not: .master.key de yedeğe girer. Yedeği sunucu dışına taşırken şifreli tut; anahtar olmadan
# ayarlardaki API anahtarları çözülemez.
set -eu
SRC=/opt/turkiye-radar/runtime
DST=/var/backups/radar
mkdir -p "$DST"; chmod 700 "$DST"
tar -czf "$DST/runtime-$(date +%F).tar.gz" -C "$SRC" .
find "$DST" -name 'runtime-*.tar.gz' -mtime +14 -delete
