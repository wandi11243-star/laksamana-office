<?php
/************************************************************************
 * FINANCE LAKSAMANA — Endpoint API (Kas Kecil)
 * ---------------------------------------------------------------------
 *   GET/POST ?action=getAll   -> {ok,data:{pos,kategori,trx}}
 *   POST     ?action=simpanTrx {id?,tgl,keterangan,kategori_id,input,bon,baris[]}
 *   POST     ?action=hapusTrx  {id}
 *   POST     ?action=tandai    {id,field:"input"|"bon",nilai:0|1}
 *   POST     ?action=simpanPos / nonaktifPos / aktifPos / hapusPos
 *   POST     ?action=simpanKategori / nonaktifKategori / aktifKategori / hapusKategori
 *   GET      ?action=ping   -> {ok,data:{pong,env,db}}
 *   GET      ?action=stats  -> {ok,data:{...jumlah per tabel}}
 *
 * Semua respons: {ok:true,data:...} atau {ok:false,error:"..."}.
 *
 * TIDAK ADA saveAll di sini, dan itu disengaja — lihat catatan panjang di
 * lib_finance_mysql.php. Kas kecil ditulis granular supaya dua orang finance
 * yang mencatat berbarengan tidak saling menghapus.
 *
 * `action` dibaca dari QUERY STRING lebih dulu, baru dari body. Frontend
 * mengirim keduanya; query string dipakai supaya permintaan yang gagal masih
 * bisa dikenali dari access log server, yang tidak pernah memuat body POST.
 ************************************************************************/
require __DIR__ . '/lib_finance_mysql.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

function keluar($o) { echo json_encode($o, JSON_UNESCAPED_UNICODE); exit; }

$body = array();
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $raw = file_get_contents('php://input');
  $body = json_decode($raw, true);
  if (!is_array($body)) $body = array();
}
$action = isset($_GET['action']) ? (string)$_GET['action']
        : (isset($body['action']) ? (string)$body['action'] : 'getAll');

if (defined('API_TOKEN') && API_TOKEN !== '') {
  $tok = isset($_GET['token']) ? $_GET['token'] : (isset($body['token']) ? $body['token'] : '');
  if (!hash_equals(API_TOKEN, (string)$tok)) keluar(array('ok' => false, 'error' => 'token salah'));
}

$id = isset($body['id']) ? $body['id'] : 0;

try {
  switch ($action) {
    case 'getAll':
      keluar(array('ok' => true, 'data' => baca_semua()));

    case 'simpanTrx':
      keluar(array('ok' => true, 'data' => simpan_trx($body)));

    case 'hapusTrx':
      keluar(array('ok' => true, 'data' => hapus_trx($id)));

    case 'tandai':
      keluar(array('ok' => true, 'data' => tandai_trx(
        $id,
        isset($body['field']) ? (string)$body['field'] : '',
        !empty($body['nilai'])
      )));

    case 'simpanPos':        keluar(array('ok' => true, 'data' => simpan_daftar('kk_pos', $body)));
    case 'nonaktifPos':      keluar(array('ok' => true, 'data' => aktif_daftar('kk_pos', $id, false)));
    case 'aktifPos':         keluar(array('ok' => true, 'data' => aktif_daftar('kk_pos', $id, true)));
    case 'hapusPos':         keluar(array('ok' => true, 'data' => hapus_pos($id)));

    case 'simpanKategori':   keluar(array('ok' => true, 'data' => simpan_daftar('kk_kategori', $body)));
    case 'nonaktifKategori': keluar(array('ok' => true, 'data' => aktif_daftar('kk_kategori', $id, false)));
    case 'aktifKategori':    keluar(array('ok' => true, 'data' => aktif_daftar('kk_kategori', $id, true)));
    case 'hapusKategori':    keluar(array('ok' => true, 'data' => hapus_kategori($id)));

    case 'ping':             keluar(array('ok' => true, 'data' => ping()));
    case 'stats':            keluar(array('ok' => true, 'data' => stats()));

    default:
      keluar(array('ok' => false, 'error' => 'Aksi tidak dikenal: ' . $action));
  }
} catch (Throwable $e) {
  keluar(array('ok' => false, 'error' => $e->getMessage()));
}
