<?php
/************************************************************************
 * BD OS LAKSAMANA MUDA — Endpoint API
 * ---------------------------------------------------------------------
 * Kontrak dibuat sama persis dengan event-mysql & marketing-mysql supaya
 * frontend cukup ganti alamatnya:
 *
 *   GET  ?action=getAll                 -> {ok,data:{people,projects,tasks,...}}
 *   GET  ?action=stats                  -> {ok,data:{...jumlah per tabel}}
 *   GET  ?action=ping                   -> {ok,data:{pong,env,db,versi,ts}}
 *   POST {action:"saveAll", data:{...}} -> {ok,data:{saved:true,jumlah:{...}}}
 *   POST {action:"addPo", items:[...]}  -> {ok,data:{added,ts}}        (sisip saja)
 *   POST {action:"setRealisasi", id, realisasi, oleh}
 *                                       -> {ok,data:{id,item,realisasi,sebelum,proses,status,ts}}
 *                        Realisasi + penanda "sudah diproses" (status pindah
 *                        ke tahap terakhir) di satu baris PO. Dipakai Finance →
 *                        Kas Kecil. Keduanya SENGAJA bukan saveAll: saveAll
 *                        merekonsiliasi dan menghapus baris yang tidak ikut
 *                        di kiriman, sementara modul lain tidak pernah
 *                        memegang state BD seutuhnya.
 ************************************************************************/

require __DIR__ . '/lib_bd_mysql.php';

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

  } else if ($action === 'ping') {
    keluar(array('ok' => true, 'data' => array_merge(
      array('pong' => true, 'backend' => 'php-mysql'), identitas(), array('ts' => gmdate('c')))));

  } else if ($action === 'addPo') {
    /* Hanya-menyisipkan, dipakai modul lain (Marketing) untuk mengirim
       request pembelian ke papan Purchasing BD. SENGAJA bukan saveAll —
       saveAll merekonsiliasi dan akan menghapus semua baris yang tidak ikut
       di kiriman, dan modul lain tidak pernah memegang state BD seutuhnya. */
    $lock = db_lock();
    try { $out = tambah_po(isset($body['items']) ? $body['items'] : null); }
    finally { db_unlock($lock); }
    keluar(array('ok' => true, 'data' => $out));

  } else if ($action === 'setRealisasi') {
    /* Satu bidang, satu baris. Dipakai Finance → Kas Kecil untuk menulis
       balik nominal belanja sebuah PO. Alasan kenapa BUKAN saveAll ada di
       set_realisasi(); ringkasnya sama dengan addPo: saveAll menghapus baris
       yang tidak ikut di kiriman. */
    $lock = db_lock();
    try { $out = set_realisasi(isset($body['id']) ? $body['id'] : '',
                               array_key_exists('realisasi', $body) ? $body['realisasi'] : '',
                               isset($body['oleh']) ? $body['oleh'] : ''); }
    finally { db_unlock($lock); }
    keluar(array('ok' => true, 'data' => $out));

  } else if ($action === 'saveAll') {
    $lock = db_lock();
    try { $out = save_all(isset($body['data']) ? $body['data'] : null,
                          isset($body['sinceTs']) ? (int)$body['sinceTs'] : 0,
                          isset($body['dikenal']) && is_array($body['dikenal']) ? $body['dikenal'] : null); }
    finally { db_unlock($lock); }
    keluar(array('ok' => true, 'data' => $out));

  } else {
    keluar(array('ok' => false, 'error' => 'Aksi tidak dikenal: ' . $action));
  }
} catch (Throwable $e) {
  keluar(array('ok' => false, 'error' => $e->getMessage()));
}
