<?php
/************************************************************************
 * HOWANDI LIFE OS — API
 * ---------------------------------------------------------------------
 * Kontrak DISAMAKAN dengan Apps Script lama supaya frontend cukup ganti
 * URL, tanpa ubah logika:
 *
 *   GET  ?action=getAll&token=... -> {ok:true, data:{...S...}}
 *   GET  ?action=ping             -> {ok:true, data:{time}}
 *   GET  ?action=stats&token=...  -> {ok:true, data:{jumlah per tabel}}
 *   POST {action:'saveAll', token, data:S} -> {ok:true, data:{...S...}}
 *
 * Body POST dikirim text/plain (simple request) supaya tidak kena preflight
 * CORS — sama seperti versi Apps Script.
 ************************************************************************/

// config.local.php: untuk tes di laptop tanpa menyentuh kredensial produksi.
if (file_exists(__DIR__ . '/config.local.php')) {
  require_once __DIR__ . '/config.local.php';
} else {
  require_once __DIR__ . '/config.php';
}
require_once __DIR__ . '/lib_hlife_mysql.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function jawab($arr, $kode = 200) {
  http_response_code($kode);
  echo json_encode($arr, JSON_UNESCAPED_UNICODE);
  exit;
}

$metode = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? '';

/* Token dicek untuk semua aksi data. Catatan jujur: token ini ada di dalam
   HTML yang dikirim ke browser, jadi bukan rahasia — dia menyaring
   permintaan asal-asalan, bukan menahan orang yang niat. Penjaga sebenarnya
   adalah gerbang SSO Office (lm_session) di halaman. */
function cek_token($body = null) {
  if (!defined('API_TOKEN') || API_TOKEN === '') return;
  $t = $_GET['token'] ?? ($body && isset($body->token) ? $body->token : '');
  if (!is_string($t) || !hash_equals(API_TOKEN, $t)) {
    jawab(['ok' => false, 'error' => 'token salah'], 403);
  }
}

try {
  if ($metode === 'GET') {
    if ($action === 'ping') jawab(['ok' => true, 'data' => ['time' => gmdate('c')]]);
    cek_token();
    $pdo = hl_pdo();
    if ($action === 'stats')  jawab(['ok' => true, 'data' => hl_stats($pdo)]);
    if ($action === 'getAll') jawab(['ok' => true, 'data' => hl_ambil_semua($pdo)]);
    jawab(['ok' => false, 'error' => 'action tidak dikenal'], 400);
  }

  if ($metode === 'POST') {
    $mentah = file_get_contents('php://input');
    // TANPA flag assoc — WAJIB. Lihat catatan di lib_hlife_mysql.php:
    // {} dan [] jadi tidak terbedakan, dan objek kosong berubah jadi Array
    // di frontend -> data hilang diam-diam saat simpan berikutnya.
    $body = json_decode($mentah);
    if (!is_object($body)) jawab(['ok' => false, 'error' => 'body bukan JSON'], 400);
    cek_token($body);

    $act = $body->action ?? $action;
    if ($act !== 'saveAll') jawab(['ok' => false, 'error' => 'action tidak dikenal'], 400);

    $pdo   = hl_pdo();
    $hasil = hl_simpan_semua($pdo, $body->data ?? null);
    if (empty($hasil['ok'])) {
      jawab(['ok' => false, 'error' => $hasil['error'] ?? 'gagal simpan'], 400);
    }
    // Apps Script lama membalas seluruh state, tapi frontend MEMBUANGNYA
    // (flushSave cuma `await apiSaveState(S)`, nilainya tidak dipakai).
    // Jadi balasan dibuat ringan saja — membaca ulang seluruh tabel tiap
    // simpan hanya memperlambat tanpa ada yang membacanya.
    jawab(['ok' => true, 'data' => ['saved' => true]]);
  }

  jawab(['ok' => false, 'error' => 'metode tidak didukung'], 405);

} catch (Throwable $e) {
  error_log('[hlife-api] ' . $e->getMessage());
  jawab(['ok' => false, 'error' => 'kesalahan server'], 500);
}
