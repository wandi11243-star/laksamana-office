<?php
/************************************************************************
 * KOMPAS LAKSAMANA — Endpoint API
 * ---------------------------------------------------------------------
 *   GET  ?action=getAll  -> {ok,data:{daily,targets,cashiers,pics,settings,log}}
 *   GET  ?action=omsetPic&dari=YYYY-MM-DD&sampai=YYYY-MM-DD
 *                        -> {ok,data:{dari,sampai,hariAda,hariIsi,pic:[...],total:{...}}}
 *                           Read-only, dipakai modul Marketing > Performance.
 *   GET  ?action=stats   -> {ok,data:{...jumlah per tabel}}
 *   GET  ?action=ping    -> {ok,data:{pong,env,db}}
 *   POST {action:"saveAll", data:{...}} -> {ok,data:{saved,jumlah}}
 *   POST {action:"simpanTarget", data:{companyMonthlyTarget,useWorkingDays,
 *         workingDaysPerMonth,target:{<idPIC>:<rupiah>},by}}
 *                        -> {ok,data:{saved,ubah,hilang:[...]}}
 *                           Tulis SEMPIT: hanya menambal target, tidak pernah
 *                           mengirim seluruh state. Dipakai panel Finance >
 *                           Kas Kecil & Performa, yang memang tidak boleh
 *                           menulis blob ini utuh.
 *   POST {action:"simpanRekap", data:{hari:{"YYYY-MM-DD":{setor,mdr:{kunci:n},
 *         aktual:{kunci:n|''}, mdrManual:{kunci:n|''}, esb:{grup:bool}}},
 *         setoran:{tambah:[{tgl,tujuan,catatan,hari:[...]}],
 *         hapus:[id]}, by}}
 *                        -> {ok,data:{saved,ubah,hari,takDikenal:[...],setoran:[...]}}
 *                           Tulis SEMPIT juga. Dipakai menu Rekap Penjualan di
 *                           panel Finance > Kas Kecil. TIDAK bisa menulis
 *                           reports[].pay — angka POS/Actual tetap milik Daily
 *                           Report. Nominal setoran DIHITUNG SERVER dari cash
 *                           actual hari-hari yang dicakup, bukan dikirim
 *                           peramban.
 *
 * Semua respons: {ok:true,data:...} atau {ok:false,error:"..."}.
 ************************************************************************/
require __DIR__ . '/lib_kompas_mysql.php';

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

try {
  if ($action === 'getAll')      keluar(array('ok' => true, 'data' => baca_state()));
  else if ($action === 'omsetPic') keluar(array('ok' => true, 'data' => omset_pic(
    isset($_GET['dari'])   ? $_GET['dari']   : '',
    isset($_GET['sampai']) ? $_GET['sampai'] : '')));
  else if ($action === 'stats')  keluar(array('ok' => true, 'data' => stats()));
  else if ($action === 'ping')   keluar(array('ok' => true, 'data' => ping()));
  else if ($action === 'saveAll') {
    $lock = db_lock();
    try { $out = save_all(isset($body['data']) ? $body['data'] : null); }
    finally { db_unlock($lock); }
    keluar(array('ok' => true, 'data' => $out));
  }
  /* Kunci yang SAMA dengan saveAll, bukan kunci sendiri. simpan_target
     membaca-mengubah-menulis blob yang sama; kunci terpisah berarti dua jalur
     tulis bisa berjalan bersamaan dan yang belakangan menimpa yang duluan. */
  else if ($action === 'simpanTarget') {
    $lock = db_lock();
    try { $out = simpan_target(isset($body['data']) ? $body['data'] : null); }
    finally { db_unlock($lock); }
    keluar(array('ok' => true, 'data' => $out));
  }
  else if ($action === 'simpanRekap') {
    $lock = db_lock();
    try { $out = simpan_rekap(isset($body['data']) ? $body['data'] : null); }
    finally { db_unlock($lock); }
    keluar(array('ok' => true, 'data' => $out));
  }
  else keluar(array('ok' => false, 'error' => 'Aksi tidak dikenal: ' . $action));
} catch (Throwable $e) {
  keluar(array('ok' => false, 'error' => $e->getMessage()));
}
