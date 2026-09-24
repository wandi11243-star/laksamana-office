<?php
/************************************************************************
 * RESERVASI LAKSAMANA MUDA — Endpoint API (versi MySQL / Jalan B)
 * ---------------------------------------------------------------------
 * Kontrak SAMA PERSIS dengan backend Apps Script & backend PHP-file, jadi
 * aplikasi cukup mengarah ke URL api.php ini:
 *
 *   GET  ?action=getAll                      -> {ok,data:{reservations,master,audit}}
 *   GET  ?action=getFile&key=<key>           -> {ok,data:{key,data}}
 *   GET  ?action=stats                       -> {ok,data:{...}}
 *   GET  ?action=ping                        -> {ok,data:{pong:true}}
 *   POST {action:"saveAll", data:{...}}      -> {ok,data:{...}}
 *   POST {action:"putFile", data:{key,data}} -> {ok,data:{key,len}}
 *
 * Bedanya dengan yang live: state disimpan di MySQL (lihat lib + config).
 ************************************************************************/

require __DIR__ . '/lib_reservasi_mysql.php';

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
    $st = baca_state();
    $st['_ver'] = read_ver();     // nomor versi utk penjaga anti-timpa (dipakai saveAll)
    keluar(array('ok' => true, 'data' => $st));

  } else if ($action === 'ver') {
    /* Nomor versi SAJA (24 September 2026). Polling di layar menanyakan ini
       dulu dan baru menarik getAll — seluruh riwayat reservasi, 2,6 MB — kalau
       nomornya berubah. Satu SELECT satu baris; tidak membaca tabel reservasi. */
    keluar(array('ok' => true, 'data' => array('ver' => read_ver())));

  } else if ($action === 'getFile') {
    $key = $method === 'POST' ? (isset($body['data']['key']) ? $body['data']['key'] : @$body['key'])
                              : @$_GET['key'];
    keluar(array('ok' => true, 'data' => get_file($key)));

  } else if ($action === 'stats') {
    keluar(array('ok' => true, 'data' => stats()));

  } else if ($action === 'ping') {
    keluar(array('ok' => true, 'data' => array('pong' => true, 'backend' => 'php-mysql', 'ts' => gmdate('c'))));

  } else if ($action === 'saveAll') {
    $baseVer = isset($body['baseVer']) ? $body['baseVer'] : null;
    $lock = db_lock();
    try { $out = save_all(isset($body['data']) ? $body['data'] : null, $baseVer); }
    finally { db_unlock($lock); }
    keluar(array('ok' => true, 'data' => $out));

  } else if ($action === 'putFile') {
    $lock = db_lock();
    try { $out = put_file(isset($body['data']) ? $body['data'] : null); }
    finally { db_unlock($lock); }
    keluar(array('ok' => true, 'data' => $out));

  } else {
    keluar(array('ok' => false, 'error' => 'Aksi tidak dikenal: ' . $action));
  }
} catch (Throwable $e) {
  keluar(array('ok' => false, 'error' => $e->getMessage()));
}
