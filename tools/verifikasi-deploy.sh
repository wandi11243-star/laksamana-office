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
#
# DAFTAR MODULNYA TIDAK DITULIS TANGAN LAGI (6 Agustus 2026).
# Versi lama menyebutkan modulnya satu per satu, dan `stock/usage/` tidak
# pernah masuk daftar itu — juga stock/tree, howandi_life, hr, dan ticketing.
# Akibatnya, ketika deploy/stock/usage/index.html gagal mendarat di server dev,
# verifikasi tetap melaporkan hijau: SELURUH jaring pengaman di workflow
# (3 percobaan FTP + 2 unggah paksa) digerbangi oleh keluaran skrip ini, jadi
# tak satu pun menyala. Yang tersisa cuma laporan user "kok belum berubah",
# dan berkasnya diam di versi commit sebelumnya selama berhari-hari.
#
# Daftar yang harus diingat manusia akan selalu tertinggal dari repo yang
# bertambah. Sekarang diambil dari repo itu sendiri: setiap deploy/**/index.html
# diperiksa, jadi modul baru ikut terjaga tanpa ada yang perlu menambahkannya.
#
# TIDAK SEMUA MODUL BERDIRI DI BAWAH SATU BASE (8 Agustus 2026).
# Pengambilan daftar dari repo di atas membawa satu anggapan diam-diam: setiap
# deploy/<modul>/ pasti dapat alamat <base>/<modul>/. Di dev itu benar. Di
# PRODUKSI tidak: `ticketing` adalah situs CUSTOMER yang punya alamat sendiri
# di laksamanamuda.id/ticketing, dan deploy.yml SENGAJA mengecualikannya dari
# unggahan Office (`exclude: ticketing/**`) supaya tidak ada salinan kedua di
# team.laksamanamuda.id/office/ticketing/ yang ../ticketing-api/-nya menunjuk
# folder tak pernah ada.
#
# Akibatnya verifikasi produksi mencari ticketing di host yang memang tidak
# pernah memilikinya, dan membalas 404 setinggi 1.251 byte — GAGAL yang pasti
# terjadi di SETIAP deploy produksi, untuk berkas yang sebenarnya sudah
# mendarat sempurna di tempat yang benar. Dilaporkan user 8 Agustus 2026.
#
# Karena itu modul boleh diberi base sendiri lewat argumen tambahan:
#   bash tools/verifikasi-deploy.sh https://team.laksamanamuda.id \
#        ticketing=https://laksamanamuda.id/ticketing
#
# Ini MENGALIHKAN, bukan melewati. Isinya tetap dibandingkan byte per byte —
# menambahkan "lewati saja" akan mengubah satu-satunya penjaga yang membuktikan
# berkas benar-benar mendarat menjadi penjaga yang bisa dimatikan diam-diam,
# dan itulah persis kegagalan yang skrip ini dibuat untuk menangkap.
# ============================================================================
set -u
base="${1:-}"
if [ -z "$base" ]; then
  echo "pemakaian: bash tools/verifikasi-deploy.sh <base-url> [modul=<base-url-lain> ...]" >&2
  exit 2
fi
base="${base%/}"
shift
# Sisa argumen = daftar override "modul=url". Kosong pun aman: `$*` jadi string
# kosong dan perulangan di bawah tidak pernah berjalan.
override="$*"
# Base khusus untuk satu modul, kalau ada. Mengembalikan status 1 kalau tidak.
base_modul() {
  _kunci="$1"
  for _kv in $override; do
    case "$_kv" in
      "$_kunci="*) printf '%s' "${_kv#*=}"; return 0 ;;
    esac
  done
  return 1
}
ci="${GITHUB_SHA:-manual-$(date +%s)}"   # pemecah cache; tanpa ini bisa kena salinan lama CDN/proxy
gagal=0

# Root ditandai "." (bukan string kosong): ekspansi `for m in $daftar` tanpa
# tanda kutip MEMBUANG baris kosong, jadi root index.html justru jadi satu-
# satunya halaman yang tidak pernah diperiksa.
daftar=$(cd deploy && find . -name index.html | sed 's|/index\.html$||; s|^\./||' | sort)
jumlah=$(printf '%s\n' "$daftar" | grep -c '' )
# Penjaga: find yang gagal / folder deploy yang kosong akan membuat loop di
# bawah tidak memeriksa apa pun DAN keluar dengan status 0 — persis kegagalan
# diam-diam yang skrip ini dibuat untuk menangkap.
if [ "$jumlah" -lt 5 ]; then
  echo "GAGAL   cuma $jumlah halaman yang ditemukan di deploy/ — daftarnya tidak masuk akal" >&2
  exit 1
fi
echo "Memeriksa $jumlah halaman terhadap ${base}"

for p in $daftar; do
  if [ "$p" = "." ]; then m=""; else m="$p/"; fi
  src="deploy/${m}index.html"
  if [ ! -f "$src" ]; then
    echo "LEWAT   ${m:-/} (tidak ada di repo)"
    continue
  fi
  # Alamat yang ditembak: base biasa, atau base khusus modul ini kalau
  # diberikan. Base khusus DITULIS di keluaran supaya kalau ia salah, yang
  # membaca log bisa melihat ke mana skrip ini sebenarnya menembak.
  if bm=$(base_modul "$p"); then
    url="${bm%/}/index.html?ci=${ci}"
    ket=" [base khusus: ${bm%/}]"
  else
    url="${base}/${m}index.html?ci=${ci}"
    ket=""
  fi
  curl -s -m 90 "$url" -o /tmp/live.html || true
  tr -d '\r' < "$src" > /tmp/a
  tr -d '\r' < /tmp/live.html > /tmp/b
  if cmp -s /tmp/a /tmp/b; then
    echo "OK      ${m:-/} ($(wc -c < /tmp/b) byte, sama persis dgn repo)${ket}"
  else
    echo "GAGAL   ${m:-/} — isi di server BEDA dari repo (tidak ter-upload / terpotong / salah folder)${ket}"
    echo "        repo=$(wc -c < /tmp/a) byte, server=$(wc -c < /tmp/b) byte"
    grep -q '</html>' /tmp/b || echo "        server tidak punya </html> → terpotong atau 404"
    gagal=1
  fi
done

exit $gagal
