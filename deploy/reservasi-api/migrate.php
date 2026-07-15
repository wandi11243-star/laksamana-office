<?php
/************************************************************************
 * MIGRASI SEKALI JALAN — Apps Script (Google Sheet)  ->  cPanel (PHP)
 * ---------------------------------------------------------------------
 * Menarik SELURUH data dari backend Apps Script lama lalu menyimpannya ke
 * penyimpanan PHP (db/data.json + db/files/). Dijalankan SERVER-KE-SERVER,
 * jadi ~6 MB foto tidak lalu-lalang lewat HP/browser Anda.
 *
 * CARA PAKAI:
 *   1. Isi TOKEN di bawah dengan kata sandi bebas (supaya orang lain tidak
 *      bisa memicu migrasi).
 *   2. Buka di browser:
 *        https://laksamanamuda.id/reservasi-api/migrate.php?token=TOKEN_ANDA
 *   3. Baca hasilnya. Kalau timeout/putus di tengah, JALANKAN LAGI —
 *      aman diulang: foto yang sudah tersalin akan dilewati.
 *   4. Verifikasi: https://laksamanamuda.id/reservasi-api/api.php?action=stats
 *
 * SETELAH BERHASIL: file ini sebaiknya DIHAPUS dari server.
 ************************************************************************/

require __DIR__ . '/lib_reservasi.php';

/* ---------- WAJIB DIISI ---------- */
$TOKEN = 'lm-migrasi-7h3k9x2q';   // sekali pakai; HAPUS file ini setelah migrasi selesai
$APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw6wIxPqrTckcJwEYK8ZssZ62FQwyO2GRU7UxlOiNwXcFpgZ_nM1-eWcKzUU6sI34L0/exec';

header('Content-Type: text/plain; charset=utf-8');
if (!isset($_GET['token']) || $_GET['token'] !== $TOKEN || $TOKEN === 'ganti-token-ini') {
  http_response_code(403);
  exit("Akses ditolak.\n\nIsi \$TOKEN di dalam migrate.php, lalu buka:\n  migrate.php?token=TOKEN_ANDA\n");
}

@set_time_limit(600);   // migrasi bisa beberapa menit

/* ---------- Ambil URL (cURL, fallback file_get_contents) ---------- */
function ambil($url) {
  if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, array(
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_FOLLOWLOCATION => true,   // Apps Script /exec selalu redirect
      CURLOPT_TIMEOUT => 120,
      CURLOPT_SSL_VERIFYPEER => true,
    ));
    $res = curl_exec($ch);
    $err = curl_error($ch);
    curl_close($ch);
    if ($res === false) throw new Exception('cURL gagal: ' . $err);
    return $res;
  }
  if (!ini_get('allow_url_fopen')) throw new Exception('Hosting tidak mengizinkan cURL maupun allow_url_fopen. Hubungi Rumahweb.');
  $res = @file_get_contents($url);
  if ($res === false) throw new Exception('file_get_contents gagal');
  return $res;
}

function ambil_json($url) {
  $raw = ambil($url);
  $obj = json_decode($raw, true);
  if (!is_array($obj)) throw new Exception('Balasan bukan JSON: ' . substr($raw, 0, 200));
  if (empty($obj['ok'])) throw new Exception('Server lama menolak: ' . (isset($obj['error']) ? $obj['error'] : '?'));
  return isset($obj['data']) ? $obj['data'] : null;
}

$t0 = microtime(true);
echo "=== MIGRASI Apps Script -> cPanel ===\n\n";

try {
  db_pastikan_folder();

  /* 1) Tarik blob utama dari Apps Script */
  echo "[1/3] Menarik data utama dari Apps Script...\n";
  $state = ambil_json($APPS_SCRIPT_URL . '?action=getAll&t=' . time());
  if (!is_array($state)) throw new Exception('Data kosong');
  $nres = isset($state['reservations']) ? count($state['reservations']) : 0;
  echo "      OK — {$nres} reservasi, blob " . number_format(strlen(json_encode($state)) / 1048576, 2) . " MB\n\n";

  /* 2) Salin setiap foto. Blob dari Apps Script v2 memuat penanda "@f:<key>";
        isinya ditarik satu per satu lewat ?action=getFile. Foto yang sudah ada
        di sini dilewati, jadi aman kalau proses ini diulang. */
  echo "[2/3] Menyalin foto bukti...\n";
  $perlu = array();
  each_file_field($state, function (&$obj, $field, $key) use (&$perlu) {
    if (!isset($obj[$field]) || $obj[$field] === '') return;
    if (is_ref($obj[$field])) {
      // penanda: ambil key aslinya dari penandanya (bukan key hasil hitung),
      // supaya tetap cocok walau penamaan di server lama berbeda.
      $perlu[] = array('ref' => substr($obj[$field], strlen(FILE_TAG)), 'key' => $key);
    }
    // kalau masih inline, nanti externalize() yang menanganinya di langkah 3.
  });

  $salin = 0; $lewat = 0; $gagal = 0; $bytes = 0;
  foreach ($perlu as $f) {
    $tujuan = file_path($f['key']);
    if (file_exists($tujuan) && filesize($tujuan) > 0) { $lewat++; continue; }   // sudah ada → lewati
    try {
      $d = ambil_json($APPS_SCRIPT_URL . '?action=getFile&key=' . rawurlencode($f['ref']) . '&t=' . time());
      $isi = isset($d['data']) ? $d['data'] : '';
      if ($isi === '') { $gagal++; echo "      ! kosong: {$f['ref']}\n"; continue; }
      put_file(array('key' => $f['key'], 'data' => $isi));
      $salin++; $bytes += strlen($isi);
    } catch (Exception $e) {
      $gagal++; echo "      ! gagal {$f['ref']}: " . $e->getMessage() . "\n";
    }
  }
  echo "      OK — {$salin} disalin, {$lewat} dilewati (sudah ada), {$gagal} gagal, "
     . number_format($bytes / 1048576, 2) . " MB\n\n";

  /* 3) Simpan (externalize menangani foto yang mungkin masih inline) */
  echo "[3/3] Menyimpan ke penyimpanan PHP...\n";
  $lock = db_lock();
  try { $out = save_all($state); } finally { db_unlock($lock); }
  echo "      OK — blob " . number_format($out['blobChars'] / 1048576, 3) . " MB"
     . ", foto inline dipisah: {$out['fotoDipisah']}\n\n";

  $s = stats();
  echo "=== SELESAI dalam " . round(microtime(true) - $t0, 1) . " detik ===\n";
  echo "  reservasi        : {$s['reservations']}\n";
  echo "  blob             : {$s['blobMB']} MB\n";
  echo "  foto tersimpan   : {$s['fileFoto']} file\n";
  echo "  foto masih inline: {$s['fotoMasihInline']}  (harus 0)\n\n";
  if ($gagal > 0) {
    echo "PERHATIAN: {$gagal} foto gagal disalin. Jalankan ulang migrate.php\n";
    echo "(yang sudah tersalin akan dilewati).\n\n";
  }
  echo "Langkah berikutnya:\n";
  echo "  1. Cek: api.php?action=stats\n";
  echo "  2. Ganti APPS_SCRIPT_URL di aplikasi ke URL api.php ini.\n";
  echo "  3. Setelah aplikasi jalan normal, HAPUS migrate.php dari server.\n";

} catch (Throwable $e) {
  http_response_code(500);
  echo "\n!!! GAGAL: " . $e->getMessage() . "\n\n";
  echo "Data di Google Sheet TIDAK tersentuh — aman. Perbaiki lalu jalankan lagi.\n";
}
