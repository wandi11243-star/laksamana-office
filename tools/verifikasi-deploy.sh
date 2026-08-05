#!/usr/bin/env bash
# ============================================================================
# Membuktikan berkas frontend DI SERVER benar-benar sama dengan yang di repo.
#
# Pemakaian:  bash tools/verifikasi-deploy.sh https://dev.laksamanamuda.id
#
# Kenapa membandingkan ISI, bukan sekadar mencari "</html>": halaman 404 dan
# berkas LAMA yang masih utuh dua-duanya punya </html>, jadi deploy yang sama
# sekali tidak mendarat tetap akan dilaporkan lulus. Sudah kejadian.
#
# FTP mengubah CRLF→LF, jadi \r dibuang di kedua sisi lebih dulu — tanpa itu
# hasilnya selalu "beda" sebanyak jumlah baris.
#
# Dipisah jadi berkas sendiri (4 Agustus 2026) karena sekarang dijalankan DUA
# KALI dalam satu run: sekali untuk memutuskan perlu-tidaknya unggah paksa,
# sekali lagi sesudahnya sebagai penentu. Menyalin skripnya dua kali di dalam
# YAML berarti dua salinan yang lambat laun berbeda.
# ============================================================================
set -u
base="${1:-}"
if [ -z "$base" ]; then
  echo "pemakaian: bash tools/verifikasi-deploy.sh <base-url>" >&2
  exit 2
fi
base="${base%/}"
ci="${GITHUB_SHA:-manual-$(date +%s)}"   # pemecah cache; tanpa ini bisa kena salinan lama CDN/proxy
gagal=0

for m in "" marketing/ reservasi/ event/ akademi/ konten/ stock/ bd/ kompas/ cashier/ jadwal/ dw/; do
  src="deploy/${m}index.html"
  if [ ! -f "$src" ]; then
    echo "LEWAT   ${m:-/} (tidak ada di repo)"
    continue
  fi
  curl -s -m 90 "${base}/${m}index.html?ci=${ci}" -o /tmp/live.html || true
  tr -d '\r' < "$src" > /tmp/a
  tr -d '\r' < /tmp/live.html > /tmp/b
  if cmp -s /tmp/a /tmp/b; then
    echo "OK      ${m:-/} ($(wc -c < /tmp/b) byte, sama persis dgn repo)"
  else
    echo "GAGAL   ${m:-/} — isi di server BEDA dari repo (tidak ter-upload / terpotong / salah folder)"
    echo "        repo=$(wc -c < /tmp/a) byte, server=$(wc -c < /tmp/b) byte"
    grep -q '</html>' /tmp/b || echo "        server tidak punya </html> → terpotong atau 404"
    gagal=1
  fi
done

exit $gagal
