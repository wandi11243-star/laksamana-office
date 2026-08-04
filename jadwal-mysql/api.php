<?php
/************************************************************************
 * JADWAL SHIFT LAKSAMANA — Endpoint API
 * ---------------------------------------------------------------------
 *   GET  ?action=getAll&dari=YYYY-MM-DD&sampai=YYYY-MM-DD
 *        -> {ok,data:{setting,sel:[{u,d,t,m,s,n}],pengajuan:[...]}}
 *        dari/sampai boleh dikosongkan (semua sel ikut terkirim) — hanya
 *        dipakai untuk ekspor/diagnostik, layar biasa selalu membatasi.
 *   GET  ?action=stats   -> {ok,data:{jumlah per tabel}}
 *   GET  ?action=ping    -> {ok,data:{pong,env,db}}
 *
 *   POST {action:'simpanSel',       rows:[...], hapus:[...], by:'Nama'}
 *   POST {action:'simpanSetting',   data:{...}, by:'Nama'}
 *   POST {action:'simpanPengajuan', row:{...},  by:'Nama'}
 *   POST {action:'putusPengajuan',  id, status:'DISETUJUI'|'DITOLAK', nota, by}
 *   POST {action:'hapusPengajuan',  id}
 *
 * Penulisan sengaja GRANULAR (bukan saveAll satu blob) karena tiap divisi
 * punya head sendiri yang menyunting bersamaan — alasannya panjang lebar di
 * kepala lib_jadwal_mysql.php.
 *
 * Semua respons: {ok:true,data:...} atau {ok:false,error:"..."}.
 ************************************************************************/
require __DIR__ . '/lib_jadwal_mysql.php';

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

    case 'stats': keluar(array('ok' => true, 'data' => stats()));
    case 'ping':  keluar(array('ok' => true, 'data' => ping()));

    case 'simpanSel':
      keluar(array('ok' => true, 'data' => simpan_sel(
        ambil($body, 'rows', array()), ambil($body, 'hapus', array()), ambil($body, 'by'))));

    case 'simpanSetting':
      keluar(array('ok' => true, 'data' => simpan_setting(
        ambil($body, 'data', null), ambil($body, 'by'))));

    case 'simpanPengajuan':
      keluar(array('ok' => true, 'data' => simpan_pengajuan(
        ambil($body, 'row', array()), ambil($body, 'by'))));

    case 'putusPengajuan':
      keluar(array('ok' => true, 'data' => putus_pengajuan(
        ambil($body, 'id'), ambil($body, 'status'), ambil($body, 'nota'), ambil($body, 'by'))));

    case 'hapusPengajuan':
      keluar(array('ok' => true, 'data' => hapus_pengajuan(ambil($body, 'id'))));

    default:
      keluar(array('ok' => false, 'error' => 'Aksi tidak dikenal: ' . $action));
  }
} catch (Throwable $e) {
  keluar(array('ok' => false, 'error' => $e->getMessage()));
}
