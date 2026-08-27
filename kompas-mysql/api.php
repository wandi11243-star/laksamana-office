<?php
/************************************************************************
 * KOMPAS LAKSAMANA — Endpoint API
 * ---------------------------------------------------------------------
 *   GET  ?action=getAll  -> {ok,data:{daily,targets,cashiers,pics,settings,log}}
 *   GET  ?action=omsetPic&dari=YYYY-MM-DD&sampai=YYYY-MM-DD
 *                        -> {ok,data:{dari,sampai,hariAda,hariIsi,pic:[...],total:{...}}}
 *                           Read-only, dipakai modul Marketing > Performance.
 *   GET  ?action=investorRingkas&sesi=<token>
                        -> {ok,data:{hariIni,kemarin,bulanIni,bulanLalu,
                            tahunan,harian,terakhir,adaData}}
                           Angka omset yang SUDAH DIJUMLAHKAN, untuk situs
                           investor.laksamanamuda.id. Satu-satunya aksi di
                           berkas ini yang berpagar: wajib token sesi Office
                           + kunci modul 'investor'. Alasannya di badan file.
   POST {action:"investorAgenda", sesi:<token>}
                        -> {ok,data:{event:[...],promo:[...],gagal:[...]}}
                           Agenda event & promo yang masih relevan, untuk
                           situs investor. Berpagar sama seperti
                           investorRingkas. Dikumpulkan server-ke-server
                           dari Marketing/Event/BD — peramban tidak pernah
                           memegang alamat getAll ketiganya.
   GET  ?action=stats   -> {ok,data:{...jumlah per tabel}}
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
  /* SATU-SATUNYA aksi di berkas ini yang MENANYAKAN SIAPA PEMANGGILNYA.
     Dipanggil investor.laksamanamuda.id — situs di luar Office, dibuka orang
     di luar perusahaan.

     Gerbangnya token sesi Office, diverifikasi server-ke-server ke
     account-api (lihat lib_sesi.php), bukan nama yang dikirim peramban:
     nama bisa diketik siapa saja. Kuncinya 'investor', dicentang lewat
     Kelola Akses — jadi memberi dan mencabut akses investor tidak perlu
     menyentuh berkas ini sama sekali.

     Aksi lain di berkas ini sengaja dibiarkan terbuka seperti semula:
     semuanya dipanggil dari dalam Office dan mengubah gerbangnya sekarang
     akan mematikan panel Finance tanpa satu pun pesan yang menyebut
     sebabnya. Yang dijaga di sini cuma pintu yang menghadap ke luar. */
  else if ($action === 'investorRingkas') {
    require_once __DIR__ . '/lib_sesi.php';
    $u = sesi_user($body);
    if (!$u) sesi_tolak_tak_dikenal();
    if (!sesi_punya_modul($u, 'investor')) sesi_tolak_tanpa_modul('Investor Compass');
    keluar(array('ok' => true, 'data' => ringkas_investor(),
                 'user' => array('nama' => isset($u['name']) ? $u['name'] : '')));
  }
  /* Pintu kedua untuk halaman investor: agenda event & promo, dikumpulkan
     dari Marketing / Event / BD OS server-ke-server. Gerbangnya sama persis
     dengan investorRingkas, dan alasannya ada di agenda_investor():
     ketiga modul itu punya getAll yang tidak menanyakan siapa pun.

     Aksi TERPISAH, bukan digabung ke investorRingkas: ia memicu tiga
     permintaan HTTP ke modul lain, dan halaman Ringkasan yang dibuka
     paling sering tidak perlu membayar itu. Dipanggil layar hanya saat
     tab Event atau Promo dibuka. */
  else if ($action === 'investorAgenda') {
    require_once __DIR__ . '/lib_sesi.php';
    $u = sesi_user($body);
    if (!$u) sesi_tolak_tak_dikenal();
    if (!sesi_punya_modul($u, 'investor')) sesi_tolak_tanpa_modul('Investor Compass');
    keluar(array('ok' => true, 'data' => agenda_investor()));
  }
  else keluar(array('ok' => false, 'error' => 'Aksi tidak dikenal: ' . $action));
} catch (Throwable $e) {
  keluar(array('ok' => false, 'error' => $e->getMessage()));
}
