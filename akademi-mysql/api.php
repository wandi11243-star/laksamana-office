<?php
/************************************************************************
 * AKADEMI LAKSAMANA MUDA — Endpoint API
 * ---------------------------------------------------------------------
 * Pengganti Google Apps Script. Kontrak dibuat semirip mungkin supaya
 * frontend cukup ganti alamatnya:
 *
 *   GET  ?action=getAll                 -> {ok,data:{clients,events,...}}
 *   GET  ?action=stats                  -> {ok,data:{...jumlah per tabel}}
 *   GET  ?action=ping                   -> {ok,data:{pong:true}}
 *   POST {action:"saveAll", data:{...}} -> {ok,data:{saved:true,bentrok:[...]}}
 *
 * Catatan: `bentrok` berisi baris yang ditolak karena orang lain menyimpan
 * duluan. saveAll TETAP ok:true — perubahan lain yang tidak bertabrakan
 * tersimpan. Aplikasi yang wajib menampilkan daftar bentrok ke user.
 ************************************************************************/

require __DIR__ . '/lib_akademi_mysql.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

function keluar($obj) { echo json_encode($obj, JSON_UNESCAPED_UNICODE); exit; }

$method = $_SERVER['REQUEST_METHOD'];
$body = array();
if ($method === 'POST') {
  $raw = file_get_contents('php://input');
  $body = json_decode($raw, true);
  if (!is_array($body)) $body = array();
}

$action = $method === 'POST'
  ? (isset($body['action']) ? $body['action'] : '')
  : (isset($_GET['action']) ? $_GET['action'] : 'getAll');

if (defined('API_TOKEN') && API_TOKEN !== '') {
  $tok = isset($_GET['token']) ? $_GET['token'] : (isset($body['token']) ? $body['token'] : '');
  if (!hash_equals(API_TOKEN, (string)$tok)) keluar(array('ok' => false, 'error' => 'token salah'));
}

try {
  if ($action === 'getAll') {
    keluar(array('ok' => true, 'data' => baca_state()));

  } else if ($action === 'stats') {
    keluar(array('ok' => true, 'data' => stats()));

  } else if ($action === 'trainingStats') {
    // Dibaca modul `hr` (Staff Performance) untuk komponen Training di People
    // Score. Baca-saja, dan yang dibagi cuma PERSEN penyelesaian per userId,
    // bukan isi materi atau jawaban kuis. Lihat docs/hr-akademi-integration.md.
    keluar(array('ok' => true, 'data' => training_stats()));

  } else if ($action === 'ping') {
    keluar(array('ok' => true, 'data' => array('pong' => true, 'backend' => 'php-mysql', 'ts' => gmdate('c'))));

  } else if ($action === 'receipt') {
    // Sajikan file bukti transfer langsung ke browser (gambar/PDF).
    // Bukan JSON — stream_receipt() mengatur header & keluar sendiri.
    stream_receipt(isset($_GET['key']) ? $_GET['key'] : '');

  } else if ($action === 'uploadReceipt') {
    // Simpan file bukti ke disk (di luar web root). Frontend membangun URL
    // tampilnya dari key: API_URL + '?action=receipt&key=' + key.
    $out = save_receipt($body);
    keluar(array('ok' => true, 'data' => $out));

  } else if ($action === 'saveAll') {
    $lock = db_lock();
    try { $out = save_all(isset($body['data']) ? $body['data'] : null); }
    finally { db_unlock($lock); }
    keluar(array('ok' => true, 'data' => $out));

  } else {
    keluar(array('ok' => false, 'error' => 'Aksi tidak dikenal: ' . $action));
  }
} catch (Throwable $e) {
  keluar(array('ok' => false, 'error' => $e->getMessage()));
}
