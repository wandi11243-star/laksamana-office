<?php
/************************************************************************
 * HR / PEOPLE OS — API
 * ---------------------------------------------------------------------
 * Kontrak DISAMAKAN dengan Apps Script lama supaya frontend cukup ganti
 * URL, tanpa ubah logika:
 *
 *   GET  ?action=getAll   -> {ok:true, data:{...S..., _rev, _savedAt, _savedBy}}
 *   GET  ?action=ping     -> {ok:true, data:{time}}
 *   GET  ?action=stats    -> {ok:true, data:{jumlah per tabel}}
 *   POST {action:'saveAll', data:S, baseRev, by}
 *        -> {ok:true,  data:{rev}}
 *        -> {ok:false, error:'conflict', savedBy, savedAt, rev}
 *
 * Body POST dikirim sebagai text/plain (simple request) supaya tidak kena
 * preflight CORS — sama seperti modul lain.
 ************************************************************************/

// config.local.php: untuk tes di laptop tanpa menyentuh kredensial produksi.
if (file_exists(__DIR__ . '/config.local.php')) {
  require_once __DIR__ . '/config.local.php';
} else {
  require_once __DIR__ . '/config.php';
}
require_once __DIR__ . '/lib_hr_mysql.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function jawab($arr, $kode = 200) {
  http_response_code($kode);
  echo json_encode($arr, JSON_UNESCAPED_UNICODE);
  exit;
}

// Token opsional. Kalau API_TOKEN diisi, request wajib membawa ?token= sama.
if (defined('API_TOKEN') && API_TOKEN !== '') {
  $t = $_GET['token'] ?? '';
  if (!hash_equals(API_TOKEN, (string)$t)) jawab(['ok' => false, 'error' => 'token salah'], 403);
}

$metode = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? '';

try {
  if ($metode === 'GET') {
    if ($action === 'ping') {
      jawab(['ok' => true, 'data' => ['time' => gmdate('c')]]);
    }
    $pdo = hr_pdo();
    if ($action === 'stats') {
      jawab(['ok' => true, 'data' => hr_stats($pdo)]);
    }
    if ($action === 'getAll') {
      jawab(['ok' => true, 'data' => hr_ambil_semua($pdo)]);
    }
    jawab(['ok' => false, 'error' => 'action tidak dikenal'], 400);
  }

  if ($metode === 'POST') {
    $mentah = file_get_contents('php://input');
    // TANPA flag assoc — WAJIB. json_decode('{}', true) dan json_decode('[]', true)
    // sama-sama menghasilkan [], jadi peta kosong (kpiActuals, monthlyInputs,
    // reviews.layers) akan tersimpan sebagai [] lalu kembali ke frontend
    // sebagai Array. Properti bernama yang ditulis ke Array dibuang oleh
    // JSON.stringify saat simpan berikutnya — data hilang tanpa pesan error.
    $body = json_decode($mentah);
    if (!is_object($body)) jawab(['ok' => false, 'error' => 'body bukan JSON'], 400);

    $act = $body->action ?? $action;
    if ($act !== 'saveAll') jawab(['ok' => false, 'error' => 'action tidak dikenal'], 400);

    $pdo  = hr_pdo();
    $hasil = hr_simpan_semua(
      $pdo,
      $body->data ?? null,
      property_exists($body, 'baseRev') ? $body->baseRev : null,
      $body->by ?? ''
    );

    if (!empty($hasil['ok'])) {
      jawab(['ok' => true, 'data' => ['rev' => $hasil['rev']]]);
    }
    if (($hasil['error'] ?? '') === 'conflict') {
      // Frontend membaca j.error === 'conflict' + savedBy/savedAt untuk
      // modal "Perubahan Tidak Tersimpan". HTTP tetap 200: ini hasil yang
      // sah, bukan error transport.
      jawab(['ok' => false, 'error' => 'conflict',
             'savedBy' => $hasil['savedBy'], 'savedAt' => $hasil['savedAt'],
             'rev' => $hasil['rev']]);
    }
    jawab(['ok' => false, 'error' => $hasil['error'] ?? 'gagal simpan'], 400);
  }

  jawab(['ok' => false, 'error' => 'metode tidak didukung'], 405);

} catch (Throwable $e) {
  // Pesan asli hanya ke log server — jangan bocorkan struktur DB ke browser.
  error_log('[hr-api] ' . $e->getMessage());
  jawab(['ok' => false, 'error' => 'kesalahan server'], 500);
}
