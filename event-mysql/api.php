<?php
/************************************************************************
 * EVENT MANAGEMENT SYSTEM (EMS) LAKSAMANA MUDA — Endpoint API
 * ---------------------------------------------------------------------
 * Kontrak sengaja dibuat SAMA BENTUKNYA dengan backend reservasi, supaya
 * lapisan API di frontend bisa disalin apa adanya:
 *
 *   GET  ?action=getAll                 -> {ok,data:{talents,events,...}}
 *   GET  ?action=stats                  -> {ok,data:{...jumlah per tabel}}
 *   GET  ?action=ping                   -> {ok,data:{pong,env,db,versi,ts}}
 *   POST {action:"saveAll", data:{...}} -> {ok,data:{saved:true,jumlah:{...}}}
 *   POST {action:"upload", dataBase64, fileName, mimeType}
 *                                       -> {ok,data:{key,name,size,at}}
 *   GET  ?action=file&key=...           -> berkasnya sendiri (bukan JSON)
 *   GET  ?action=eventsHari&tgl=YYYY-MM-DD
 *                                       -> {ok,data:{events:[...]}}
 *
 * Semua respons: {ok:true,data:...} atau {ok:false,error:"..."}.
 ************************************************************************/

require __DIR__ . '/lib_event_mysql.php';

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

// cek token bila diaktifkan (config.php)
if (defined('API_TOKEN') && API_TOKEN !== '') {
  $tok = isset($_GET['token']) ? $_GET['token'] : (isset($body['token']) ? $body['token'] : '');
  if (!hash_equals(API_TOKEN, (string)$tok)) keluar(array('ok' => false, 'error' => 'token salah'));
}

try {
  if ($action === 'getAll') {
    keluar(array('ok' => true, 'data' => baca_state()));

  } else if ($action === 'stats') {
    keluar(array('ok' => true, 'data' => stats()));

  } else if ($action === 'ping') {
    keluar(array('ok' => true, 'data' => array_merge(
      array('pong' => true, 'backend' => 'php-mysql'), identitas(), array('ts' => gmdate('c')))));

  } else if ($action === 'saveAll') {
    $lock = db_lock();
    try { $out = save_all(isset($body['data']) ? $body['data'] : null); }
    finally { db_unlock($lock); }
    keluar(array('ok' => true, 'data' => $out));

  } else if ($action === 'eventsHari') {
    // Event satu tanggal (yang belum jadi dibuang) — dibaca Finance > Omset >
    // Breakdown Sumber. Sengaja sempit; jangan diarahkan ke getAll.
    keluar(array('ok' => true, 'data' => events_hari(isset($_GET['tgl']) ? $_GET['tgl'] : '')));

  } else if ($action === 'file') {
    // Menyajikan berkas (bukti transfer, dokumen talent, poster event).
    // Bukan JSON — sajikan_berkas() mengatur header & keluar sendiri.
    sajikan_berkas(isset($_GET['key']) ? $_GET['key'] : '');

  } else if ($action === 'upload') {
    // Terima {dataBase64,fileName,mimeType} -> balas {key,name,size,at}.
    // Frontend menyimpan penunjuk itu di state, dan menampilkannya lewat
    // api.php?action=file&key=...
    keluar(array('ok' => true, 'data' => simpan_berkas($body)));

  } else {
    keluar(array('ok' => false, 'error' => 'Aksi tidak dikenal: ' . $action));
  }
} catch (Throwable $e) {
  keluar(array('ok' => false, 'error' => $e->getMessage()));
}
