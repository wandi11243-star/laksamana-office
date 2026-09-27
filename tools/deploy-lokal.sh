#!/usr/bin/env bash
# deploy-lokal.sh — deploy lewat FTP langsung dari laptop, TANPA GitHub Actions
#
#   bash tools/deploy-lokal.sh prod <commit-terakhir-yang-sudah-live>
#   bash tools/deploy-lokal.sh dev  <commit-terakhir-yang-sudah-live>
#
# Contoh: bash tools/deploy-lokal.sh prod 26c1ef5
#
# Dipakai saat GitHub Actions berhenti jalan (27 September 2026: "The job was
# not started because recent account payments have failed…"). Aturannya
# DISALIN dari .github/workflows/deploy.yml & deploy-dev.yml:
#   - pemetaan folder repo -> folder server yang SAMA;
#   - config*.php, *.sql, *.md TIDAK PERNAH diunggah (config.php di server
#     berisi password database — tertimpa, seluruh modulnya mati);
#   - deploy/ticketing/ ke folder ticketing sendiri (produksi).
#
# YANG SENGAJA BERBEDA dari workflow:
#   - Yang diunggah HANYA berkas yang berubah antara <commit-terakhir-live> dan
#     cabangnya (origin/main untuk prod, origin/develop untuk dev), dan isinya
#     diambil dari COMMIT itu lewat `git show` — bukan dari folder kerja, jadi
#     suntingan yang belum di-commit tidak pernah ikut naik.
#   - TIDAK PERNAH MENGHAPUS apa pun di server. Berkas yang dihapus di repo
#     cuma dilaporkan (aturan 0 repo ini).
#   - Password TIDAK PERNAH jadi argumen (tercatat di riwayat shell): dibaca
#     dari FTP_PASS kalau ada, kalau tidak ditanyakan tanpa ditampilkan.
#   - Sesudah unggah, tiap halaman deploy/*.html dibandingkan dengan isinya
#     di server lewat HTTPS (CRLF dibuang) — transfer FTP ke Rumahweb pernah
#     terputus di tengah sambil melaporkan sukses.
#
# Butuh: git, curl (keduanya ada di Git Bash).
set -u
TARGET="${1:-}"; DARI="${2:-}"
if [ "$TARGET" != "prod" ] && [ "$TARGET" != "dev" ] || [ -z "$DARI" ]; then
  echo "Pakai: bash tools/deploy-lokal.sh prod|dev <commit-terakhir-yang-sudah-live>"; exit 2
fi
cd "$(dirname "$0")/.." || exit 2
command -v curl >/dev/null || { echo "curl tidak ada"; exit 2; }

if [ "$TARGET" = "prod" ]; then
  REF=origin/main; WEB=https://team.laksamanamuda.id
  peta() { case "$1" in
    deploy/ticketing/*) echo "/public_html/ticketing/${1#deploy/ticketing/}";;
    deploy/*)           echo "/public_html/office/${1#deploy/}";;
    absensi-mysql/*)    echo "/public_html/absensi/api/${1#absensi-mysql/}";;
    absensi/*)          echo "/public_html/absensi/${1#absensi/}";;
    ticketing-mysql/*)  echo "/public_html/ticketing-api/${1#ticketing-mysql/}";;
    account-mysql/*|bd-mysql/*|dw-mysql/*|event-mysql/*|finance-mysql/*|jadwal-mysql/*|kompas-mysql/*|marketing-mysql/*|stock-mysql/*)
      m="${1%%/*}"; echo "/public_html/office/${m%-mysql}-api-mysql/${1#*/}";;
    *) echo "";; esac; }
else
  REF=origin/develop; WEB=https://dev.laksamanamuda.id
  peta() { case "$1" in
    deploy/*)           echo "/${1#deploy/}";;
    absensi-mysql/*)    echo "/absensi/api/${1#absensi-mysql/}";;
    absensi/*)          echo "/absensi/${1#absensi/}";;
    ticketing-mysql/*)  echo "/ticketing-api/${1#ticketing-mysql/}";;
    account-mysql/*|bd-mysql/*|dw-mysql/*|event-mysql/*|finance-mysql/*|jadwal-mysql/*|kompas-mysql/*|marketing-mysql/*|stock-mysql/*)
      m="${1%%/*}"; echo "/${m%-mysql}-api-mysql/${1#*/}";;
    *) echo "";; esac; }
fi
dilarang() { case "$(basename "$1")" in config*.php|*.sql|*.md) return 0;; esac; return 1; }

git fetch -q origin || { echo "git fetch gagal"; exit 1; }
git cat-file -e "$DARI^{commit}" 2>/dev/null || { echo "Commit $DARI tidak ada."; exit 1; }

UNGGAH=(); HAPUS=()
while IFS=$'\t' read -r st f; do
  [ -z "$f" ] && continue
  tujuan="$(peta "$f")"; [ -z "$tujuan" ] && continue
  dilarang "$f" && { echo "  lewati (tidak pernah diunggah): $f"; continue; }
  if [ "$st" = "D" ]; then HAPUS+=("$f"); else UNGGAH+=("$f"); fi
done < <(git diff --name-status --no-renames "$DARI" "$REF")

echo ""; echo "Target: $TARGET  ·  $DARI .. $REF ($(git rev-parse --short "$REF"))"
if [ ${#UNGGAH[@]} -eq 0 ]; then echo "Tidak ada berkas situs/backend yang berubah — tidak ada yang perlu diunggah."; exit 0; fi
echo "Akan diunggah (${#UNGGAH[@]}):"; for f in "${UNGGAH[@]}"; do echo "  $f  ->  $(peta "$f")"; done
[ ${#HAPUS[@]} -gt 0 ] && { echo "Dihapus di repo, TIDAK dihapus di server (hapus manual kalau perlu):"; printf '  %s\n' "${HAPUS[@]}"; }

: "${FTP_HOST:?Setel FTP_HOST dulu, mis. export FTP_HOST=ftp.laksamanamuda.id}"
: "${FTP_USER:?Setel FTP_USER dulu}"
if [ -z "${FTP_PASS:-}" ]; then read -r -s -p "Password FTP $FTP_USER: " FTP_PASS; echo; fi
read -r -p "Lanjutkan unggah? (ketik ya) " jwb; [ "$jwb" = "ya" ] || { echo "Dibatalkan."; exit 1; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
gagal=0
for f in "${UNGGAH[@]}"; do
  git show "$REF:$f" > "$TMP/isi" || { echo "GAGAL baca $f"; gagal=1; continue; }
  ok=0
  for coba in 1 2 3; do
    if curl -s --show-error --ftp-create-dirs --connect-timeout 30 --max-time 300 \
         --user "$FTP_USER:$FTP_PASS" -T "$TMP/isi" "ftp://$FTP_HOST$(peta "$f")"; then ok=1; break; fi
    echo "  percobaan $coba gagal: $f"; sleep 3
  done
  [ $ok = 1 ] && echo "  OK  $f" || { echo "  GAGAL $f"; gagal=1; }
done

echo ""; echo "Verifikasi isi halaman di server:"
for f in "${UNGGAH[@]}"; do
  case "$f" in deploy/*.html|deploy/*.js|deploy/*.css) ;; *) continue;; esac
  [ "$TARGET" = "prod" ] && case "$f" in deploy/ticketing/*) continue;; esac
  url="$WEB/${f#deploy/}"; url="${url%index.html}"
  git show "$REF:$f" | tr -d '\r' > "$TMP/repo"
  curl -s --max-time 60 "$url?v=$RANDOM" | tr -d '\r' > "$TMP/live"
  if cmp -s "$TMP/repo" "$TMP/live"; then echo "  SAMA  $url"
  else echo "  BEDA  $url  (repo $(wc -c <"$TMP/repo") byte, server $(wc -c <"$TMP/live") byte)"; gagal=1; fi
done
[ $gagal = 0 ] && echo "Selesai — semua terunggah & terverifikasi." || { echo "ADA YANG GAGAL — lihat di atas."; exit 1; }
