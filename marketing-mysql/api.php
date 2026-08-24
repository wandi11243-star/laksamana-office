<?php
/************************************************************************
 * MARKETING / CRM LAKSAMANA MUDA — Endpoint API
 * ---------------------------------------------------------------------
 * Pengganti Google Apps Script. Kontrak dibuat semirip mungkin supaya
 * frontend cukup ganti alamatnya:
 *
 *   GET  ?action=getAll                 -> {ok,data:{clients,events,...}}
 *   GET  ?action=stats                  -> {ok,data:{...jumlah per tabel}}
 *   GET  ?action=ping                   -> {ok,data:{pong,env,db,versi,ts}}
 *   POST {action:"saveAll", data:{...}} -> {ok,data:{saved:true,bentrok:[...]}}
 *   GET  ?action=eventsHari&tgl=YYYY-MM-DD
 *                                       -> {ok,data:{events:[...],vip:[...],settings:{...}}}
 *   GET  ?action=designReqs[&aktif=1]   -> {ok,data:{reqs:[...],opsi:{...}}}
 *   GET  ?action=designReq&id=...       -> {ok,data:{req:{...lengkap dgn refs}}}
 *   POST {action:"designReqSet",id,status,picNama}
 *                                       -> {ok,data:{id,status}}
 *   POST {action:"designReqOpsi",opsi:{brands,pics,platforms}}
 *                                       -> {ok,data:{disimpan,...}}
 *
 * Catatan: `bentrok` berisi baris yang ditolak karena orang lain menyimpan
 * duluan. saveAll TETAP ok:true — perubahan lain yang tidak bertabrakan
 * tersimpan. Aplikasi yang wajib menampilkan daftar bentrok ke user.
 ************************************************************************/

require __DIR__ . '/lib_marketing_mysql.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

function keluar($obj) { echo json_encode($obj, JSON_UNESCAPED_UNICODE); exit; }

$method = $_SERVER['REQUEST_METHOD'];
$body = array();
if ($method === 'POST') {
  // Unggahan Surat Penawaran bisa ~54MB (40MB berkas + pembengkakan base64).
  // memory_limit BISA dinaikkan saat jalan; post_max_size TIDAK — itu harus
  // lewat .user.ini / php.ini di folder ini.
  if ((int)ini_get('memory_limit') > 0 && (int)ini_get('memory_limit') < 256) @ini_set('memory_limit', '256M');
  $raw = file_get_contents('php://input');
  /* Body kosong padahal browser mengirim isi = PHP MEMBUANGNYA karena melewati
     post_max_size. Tanpa penjelasan ini, kegagalannya muncul sebagai "file
     kosong" atau "action tidak dikenal" — menyesatkan, dan yang sebenarnya
     perlu diubah ada di konfigurasi server, bukan di aplikasi. */
  if ($raw === '' && !empty($_SERVER['CONTENT_LENGTH']) && (int)$_SERVER['CONTENT_LENGTH'] > 0) {
    keluar(array('ok' => false, 'error' =>
      'kiriman ' . round(((int)$_SERVER['CONTENT_LENGTH']) / 1048576, 1) . 'MB dibuang server: '
      . 'melewati post_max_size (' . ini_get('post_max_size') . '). '
      . 'Naikkan post_max_size & upload_max_filesize di .user.ini / php.ini folder API ini.'));
  }
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

  } else if ($action === 'eventsHari') {
    // Event 'Deal'/'Event Done' pada SATU tanggal — dibaca Finance > Omset >
    // Breakdown Sumber. Sengaja sempit; jangan diarahkan ke getAll.
    keluar(array('ok' => true, 'data' => events_hari(isset($_GET['tgl']) ? $_GET['tgl'] : '')));

  } else if ($action === 'designReqs') {
    // Request Design & Video dari modul Marketing — dibaca modul Konten untuk
    // Design Queue & Editing Queue. Sengaja sempit; jangan diarahkan ke getAll.
    // ?aktif=1 -> yang sudah selesai tidak ikut.
    keluar(array('ok' => true, 'data' =>
      design_reqs(isset($_GET['aktif']) && $_GET['aktif'] === '1')));

  } else if ($action === 'designReq') {
    // SATU permintaan lengkap dengan referensinya. Dipisah dari daftar karena
    // referensi gambar berupa data URI — lihat design_req_satu().
    keluar(array('ok' => true, 'data' =>
      design_req_satu(isset($_GET['id']) ? $_GET['id'] : '')));

  } else if ($action === 'designReqOpsi') {
    // Modul Konten menitipkan daftar brand / kru / platform miliknya supaya
    // formulir request di Marketing bisa memilihnya. Lihat design_req_opsi_set().
    $lock = db_lock();
    try { $out = design_req_opsi_set(isset($body['opsi']) ? $body['opsi'] : null); }
    finally { db_unlock($lock); }
    keluar(array('ok' => true, 'data' => $out));

  } else if ($action === 'designReqSet') {
    // Modul Konten menandai satu permintaan selesai / membukanya lagi.
    // Hanya menyentuh kunci kemajuan; isi permintaannya tetap milik Marketing.
    $lock = db_lock();
    try {
      $out = design_req_set(
        isset($body['id'])      ? $body['id']      : '',
        isset($body['status'])  ? $body['status']  : '',
        isset($body['picNama']) ? $body['picNama'] : '');
    } finally { db_unlock($lock); }
    keluar(array('ok' => true, 'data' => $out));

  } else if ($action === 'receipt') {
    // Sajikan file bukti transfer langsung ke browser (gambar/PDF).
    // Bukan JSON — stream_receipt() mengatur header & keluar sendiri.
    stream_receipt(isset($_GET['key']) ? $_GET['key'] : '');

  } else if ($action === 'uploadReceipt') {
    // Simpan file bukti ke disk (di luar web root). Frontend membangun URL
    // tampilnya dari key: API_URL + '?action=receipt&key=' + key.
    $out = save_receipt($body);
    keluar(array('ok' => true, 'data' => $out));

  } else if ($action === 'uploadChunk') {
    // Unggah bertahap: berkas besar dipotong ~2MB per permintaan supaya tidak
    // pernah menyentuh post_max_size. Lihat save_receipt_chunk().
    $out = save_receipt_chunk($body);
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
