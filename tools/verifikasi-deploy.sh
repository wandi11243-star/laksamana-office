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

# FOLDER SEMENTARA SENDIRI, BUKAN /tmp YANG DIPATOK (6 September 2026).
#
# Versi lama menulis ke /tmp/live.html dan tiga berkas pembanding di /tmp.
# Dua hal yang diandalkannya sama-sama bisa meleset: bahwa folder itu ada dan
# bisa ditulis di mesin yang menjalankan skrip ini (di Git Bash Windows tidak
# selalu), dan bahwa tidak ada dua pemeriksaan yang berjalan bersamaan —
# padahal workflow memanggil skrip ini TIGA KALI dalam satu run, dan nama
# berkas yang dipatok membuat keduanya saling menimpa kalau kelak dijalankan
# paralel.
#
# mktemp memilihkan tempat yang memang bisa ditulis, menghormati $TMPDIR, dan
# memberi nama yang tidak mungkin bertabrakan.
# CURL WAJIB ADA, dan ketiadaannya dikatakan SEKALI DI DEPAN (6 September
# 2026). Tanpa penjaga ini, curl yang tidak terpasang membuat setiap halaman
# gagal satu per satu dengan sebab yang sama — 29 baris merah untuk satu
# perintah yang kurang, dan sebab aslinya tenggelam di baris pertama yang
# sudah lama tergulung ke atas layar.
if ! command -v curl >/dev/null 2>&1; then
  echo "GAGAL   curl tidak ada di PATH — skrip ini tidak bisa mengambil apa pun." >&2
  echo "        Ini kegagalan MESIN yang menjalankan skrip, BUKAN kegagalan deploy:" >&2
  echo "        keadaan berkas di server sama sekali belum terperiksa." >&2
  exit 2
fi
kerja=$(mktemp -d 2>/dev/null) || kerja=""
if [ -z "$kerja" ] || [ ! -d "$kerja" ]; then
  echo "GAGAL   tidak bisa membuat folder sementara — periksa TMPDIR/izin tulis." >&2
  echo "        Ini kegagalan MESIN yang menjalankan skrip, bukan kegagalan deploy." >&2
  exit 2
fi
trap 'rm -rf "$kerja"' EXIT

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
  # UNDUHAN YANG GAGAL BUKAN BUKTI ISINYA BERBEDA (6 September 2026).
  #
  # Sampai tanggal ini baris curl-nya berakhir `|| true`, dan hasilnya
  # langsung dipakai membandingkan. Kalau curl tidak menghasilkan berkas sama
  # sekali — jaringan mati, DNS diblokir, folder sementara tak bisa ditulis —
  # maka pembacaan berkasnya gagal, pembandingnya tidak pernah lahir, dan
  # SETIAP halaman jatuh ke cabang di bawah dengan bunyi "isi di server BEDA
  # dari repo, server= byte".
  #
  # Dilaporkan user 6 September 2026: 29 halaman dilaporkan GAGAL dengan sebab
  # yang identik, padahal 27 di antaranya dijawab server HTTP 200 dengan isi
  # yang benar — yang betul-betul tertinggal cuma 2. Yang membacanya
  # menyimpulkan seluruh deploy gagal lalu mencari sebabnya di FTP, padahal
  # yang rusak mesin yang menjalankan skripnya.
  #
  # Kegagalan ALAT dan kegagalan DEPLOY wajib terbaca berbeda: yang satu
  # berarti "periksa mesin yang menjalankan ini", yang satu "berkasnya tidak
  # mendarat di server". Menyamakan keduanya membuat satu-satunya penjaga
  # deploy di repo ini berbohong ke dua arah sekaligus — ia meneriakkan gagal
  # untuk deploy yang sehat, dan orang yang sudah terbiasa mengabaikan
  # teriakannya tidak akan percaya waktu ia benar.
  kode=$(curl -s -m 90 -o "$kerja/live.html" -w '%{http_code}' "$url" 2>/dev/null) || kode=""
  if [ ! -s "$kerja/live.html" ]; then
    echo "TAK TERBACA ${m:-/} — tidak ada isi yang bisa dibandingkan (http=${kode:-curl gagal})${ket}"
    case "${kode:-}" in
      ""|000)
        echo "        curl tidak memulangkan apa pun: jaringan, DNS, atau folder"
        echo "        sementara tidak bisa ditulis. INI BUKAN bukti deploy gagal —"
        echo "        periksa mesin yang menjalankan skrip ini lebih dulu." ;;
      *)
        echo "        server menjawab http=$kode dengan badan kosong." ;;
    esac
    gagal=1
    continue
  fi
  tr -d '\r' < "$src" > "$kerja/a"
  tr -d '\r' < "$kerja/live.html" > "$kerja/b"
  if cmp -s "$kerja/a" "$kerja/b"; then
    echo "OK      ${m:-/} ($(wc -c < "$kerja/b") byte, sama persis dgn repo)${ket}"
  else
    echo "GAGAL   ${m:-/} — isi di server BEDA dari repo (tidak ter-upload / terpotong / salah folder)${ket}"
    # Kode HTTP-nya disebut DI BARIS ANGKA. Tanpa itu "404" dan "berkas lama
    # yang masih utuh" terbaca sama persis, padahal jalan keluarnya berbeda:
    # yang satu berkasnya tidak ada, yang satu ada tapi versinya tertinggal.
    echo "        repo=$(wc -c < "$kerja/a") byte, server=$(wc -c < "$kerja/b") byte, http=${kode:-?}"
    grep -q '</html>' "$kerja/b" || echo "        server tidak punya </html> → terpotong atau 404"
    # BERKAS MANA YANG SEBENARNYA DISAJIKAN (4 September 2026).
    #
    # "isi di server BEDA" menyebut tiga kemungkinan sekaligus, dan yang
    # membacanya harus menebak yang mana. Padahal jawabannya sering ada di
    # repo ini juga: 3 September 2026 deploy produksi gagal di dw/, dan isi
    # yang disajikan server ternyata cashier/index.html PERSIS — berkas yang
    # diunggah tepat SEBELUM dw (urutannya alfabetis). Itu bukan transfer
    # terpotong dan bukan berkas yang tidak mendarat, melainkan aliran data
    # FTP yang tertukar antar berkas; ketiga dugaan di baris atas menuntun ke
    # arah yang salah, dan yang mencari sebabnya membuang waktu memeriksa
    # ukuran berkas dan izin folder.
    #
    # Jadi dicari: adakah halaman LAIN di repo yang isinya sama persis dengan
    # yang dipulangkan server. Kalau ada, namanya disebut.
    for _q in $daftar; do
      if [ "$_q" = "." ]; then _qm=""; else _qm="$_q/"; fi
      [ "$_q" = "$p" ] && continue
      _qs="deploy/${_qm}index.html"
      [ -f "$_qs" ] || continue
      tr -d '\r' < "$_qs" > "$kerja/c"
      if cmp -s "$kerja/c" "$kerja/b"; then
        echo "        server menyajikan isi ${_qm}index.html — BERKASNYA TERTUKAR,"
        echo "        bukan terpotong. Aliran FTP menulis berkas tetangga ke sini;"
        echo "        unggah paksa berikutnya biasanya membetulkannya."
        break
      fi
    done
    gagal=1
  fi
done

exit $gagal
