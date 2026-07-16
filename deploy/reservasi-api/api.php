<?php
/************************************************************************
 * RESERVASI LAKSAMANA MUDA — Endpoint API (cPanel / Rumahweb)
 * ---------------------------------------------------------------------
 * Kontrak SAMA PERSIS dengan backend Apps Script, jadi aplikasi cukup
 * ganti URL-nya saja:
 *
 *   GET  ?action=getAll                      -> {ok,data:{reservations,master,audit}}
 *   GET  ?action=getFile&key=<key>           -> {ok,data:{key,data}}
 *   GET  ?action=stats                       -> {ok,data:{...}}
 *   GET  ?action=ping                        -> {ok,data:{pong:true}}
 *   POST {action:"saveAll", data:{...}}      -> {ok,data:{...}}
 *   POST {action:"putFile", data:{key,data}} -> {ok,data:{key,len}}
 *
 * PASANG: taruh file ini + lib_reservasi.php (+ migrate.php) dalam SATU
 * folder di public_html, mis. public_html/reservasi-api/.
 * URL-nya jadi: https://laksamanamuda.id/reservasi-api/api.php
 ************************************************************************/

require __DIR__ . '/lib_reservasi.php';

/* ---------- CORS + JSON ----------
   Server sendiri (bukan Apps Script) jadi header CORS bisa kita atur penuh.
   Aplikasi POST pakai text/plain (simple request), jadi biasanya tanpa
   preflight — tapi header ini tetap dipasang agar aman dari origin mana pun. */
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

// Preflight (kalau ada)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

function keluar($obj) { echo json_encode($obj, JSON_UNESCAPED_UNICODE); exit; }

/* ---------- (OPSIONAL) KUNCI AKSES ----------
   Kosongkan = terbuka (sama seperti Apps Script "Anyone"). Kalau diisi, tiap
   request wajib menyertakan ?key=... atau field "key" yang sama. Untuk
   mengaktifkan: isi API_TOKEN lalu tambahkan token yang sama di aplikasi. */
$API_TOKEN = '';   // mis. 'lm-2026-rahasia'

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

// cek token bila diaktifkan
if ($API_TOKEN !== '') {
  $tok = isset($_GET['token']) ? $_GET['token'] : (isset($body['token']) ? $body['token'] : '');
  if (!hash_equals($API_TOKEN, (string)$tok)) keluar(array('ok' => false, 'error' => 'token salah'));
}

try {
  if ($action === 'getAll') {
    keluar(array('ok' => true, 'data' => baca_state()));

  } else if ($action === 'getFile') {
    $key = $method === 'POST' ? (isset($body['data']['key']) ? $body['data']['key'] : @$body['key'])
                              : @$_GET['key'];
    keluar(array('ok' => true, 'data' => get_file($key)));

  } else if ($action === 'stats') {
    keluar(array('ok' => true, 'data' => stats()));

  } else if ($action === 'ping') {
    keluar(array('ok' => true, 'data' => array('pong' => true, 'backend' => 'php', 'ts' => gmdate('c'))));

  } else if ($action === 'saveAll') {
    $lock = db_lock();
    try { $out = save_all(isset($body['data']) ? $body['data'] : null); }
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
