<?php
/************************************************************************
 * DAILY WORKER LAKSAMANA — Endpoint API
 * ---------------------------------------------------------------------
 *   GET  ?action=getAll&dari=YYYY-MM-DD&sampai=YYYY-MM-DD
 *        -> {ok,data:{setting,pekerja:[...],ajuan:[...]}}
 *   GET  ?action=jadwalDW&dari=&sampai=
 *        -> {ok,data:{rows:[{id,dwId,nama,divisi,posisi,tgl,m,s,hadir}]}}
 *        DIPANGGIL MODUL JADWAL SHIFT. Hanya ajuan DISETUJUI, dan hanya
 *        kolom yang perlu untuk menggambar sel — tanpa no HP / PIN.
 *   GET  ?action=stats   -> {ok,data:{jumlah per tabel}}
 *   GET  ?action=ping    -> {ok,data:{pong,env,db}}
 *
 *   POST {action:'loginDW',       hp, pin}      -> {ok,data:{dw:{...}}}
 *   POST {action:'ajuanSaya',     dwId}         -> {ok,data:{ajuan,setting}}
 *   POST {action:'simpanPekerja', row:{...}, by}
 *   POST {action:'hapusPekerja',  id}
 *   POST {action:'simpanAjuan',   row:{...}, by} -- status SELALU MENUNGGU
 *   POST {action:'putusAjuan',    id, status, nota, by}
 *   POST {action:'putusBanyak',   ids:[...], status, nota, by}
 *   POST {action:'hapusAjuan',    id}
 *   POST {action:'simpanNilai',   id, hadir, nilai, nota, by}
 *   POST {action:'simpanSetting', data:{...}, by}
 *
 * Penulisan sengaja GRANULAR (bukan saveAll satu blob) — alasannya panjang
 * lebar di kepala lib_dw_mysql.php.
 *
 * Semua respons: {ok:true,data:...} atau {ok:false,error:"..."}.
 ************************************************************************/
require __DIR__ . '/lib_dw_mysql.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

function keluar($o) { echo json_encode($o, JSON_UNESCAPED_UNICODE); exit; }

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

function ambil($body, $k, $def = '') { return isset($body[$k]) ? $body[$k] : $def; }

try {
  switch ($action) {
    case 'getAll':
      keluar(array('ok' => true, 'data' => baca_semua(
        isset($_GET['dari']) ? $_GET['dari'] : '',
        isset($_GET['sampai']) ? $_GET['sampai'] : ''
      )));

    case 'jadwalDW':
      keluar(array('ok' => true, 'data' => jadwal_dw(
        isset($_GET['dari']) ? $_GET['dari'] : '',
        isset($_GET['sampai']) ? $_GET['sampai'] : ''
      )));

    case 'stats': keluar(array('ok' => true, 'data' => stats()));
    case 'ping':  keluar(array('ok' => true, 'data' => ping()));

    case 'loginDW':
      keluar(array('ok' => true, 'data' => login_dw(ambil($body, 'hp'), ambil($body, 'pin'))));

    case 'ajuanSaya':
      keluar(array('ok' => true, 'data' => ajuan_saya(ambil($body, 'dwId'))));

    case 'simpanPekerja':
      keluar(array('ok' => true, 'data' => simpan_pekerja(
        ambil($body, 'row', array()), ambil($body, 'by'))));

    case 'hapusPekerja':
      keluar(array('ok' => true, 'data' => hapus_pekerja(ambil($body, 'id'))));

    case 'simpanAjuan':
      keluar(array('ok' => true, 'data' => simpan_ajuan(
        ambil($body, 'row', array()), ambil($body, 'by'))));

    case 'putusAjuan':
      keluar(array('ok' => true, 'data' => putus_ajuan(
        ambil($body, 'id'), ambil($body, 'status'), ambil($body, 'nota'), ambil($body, 'by'))));

    case 'putusBanyak':
      keluar(array('ok' => true, 'data' => putus_banyak(
        ambil($body, 'ids', array()), ambil($body, 'status'), ambil($body, 'nota'), ambil($body, 'by'))));

    case 'hapusAjuan':
      keluar(array('ok' => true, 'data' => hapus_ajuan(ambil($body, 'id'))));

    case 'simpanNilai':
      keluar(array('ok' => true, 'data' => simpan_nilai(
        ambil($body, 'id'), ambil($body, 'hadir'), ambil($body, 'nilai'),
        ambil($body, 'nota'), ambil($body, 'by'))));

    case 'simpanSetting':
      keluar(array('ok' => true, 'data' => simpan_setting(
        ambil($body, 'data', null), ambil($body, 'by'))));

    default:
      keluar(array('ok' => false, 'error' => 'Aksi tidak dikenal: ' . $action));
  }
} catch (Throwable $e) {
  keluar(array('ok' => false, 'error' => $e->getMessage()));
}
