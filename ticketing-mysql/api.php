<?php
/************************************************************************
 * LAKSAMANA MUDA TICKETING — endpoint publik (situs customer)
 * ---------------------------------------------------------------------
 *   GET  ?action=ping                          -> {ok,data:{env,db,xendit}}
 *   GET  ?action=events                        -> daftar event yang dijual
 *   GET  ?action=event&id=                     -> satu event + kelas tiket
 *   GET  ?action=denah&id=[&hold=]             -> objek denah + status kursi
 *   POST {action:"hold",   event_id, seats[], hold_token?}
 *   POST {action:"release",hold_token, seats?}
 *   POST {action:"checkout",event_id,hold_token,name,email,phone}
 *                                              -> {invoice_url,ref,access_token}
 *   POST {action:"webhook", ...}               <- DARI XENDIT, bukan browser
 *   POST {action:"simbayar",ref,token}         -> hanya di dev (XENDIT_MOCK)
 *   POST {action:"daftar"|"masuk", email,password,...} -> {user,token}
 *   POST {action:"keluar", sesi}
 *   GET  ?action=saya&sesi=                    -> akun yang sedang masuk
 *   GET  ?action=tiketSaya&sesi=               -> riwayat tiket akun itu
 *   GET  ?action=ujiEmail&ke=                  -> uji SMTP (bukan di produksi)
 *   GET  ?action=order&ref=&token=             -> status + e-ticket
 *
 * Sengaja TIDAK ada endpoint yang memulangkan seluruh isi database, dan
 * tidak ada satu pun yang menerima harga dari pemanggil.
 ************************************************************************/

require __DIR__ . '/lib_ticketing.php';

/* CORS: situs customer bisa berada di domain lain dari API-nya
   (laksamanamuda.id/ticketing memanggil office.laksamanamuda.id/...),
   jadi GET dibuka. Yang menjaga bukan CORS — CORS hanya aturan browser dan
   tidak menghalangi curl sama sekali — melainkan endpoint yang memang
   sempit dan token akses per pesanan. */
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, x-callback-token');
header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

function keluar($o) { echo json_encode($o, JSON_UNESCAPED_UNICODE); exit; }

$metode = $_SERVER['REQUEST_METHOD'];
$body = array();
if ($metode === 'POST') {
  $raw = file_get_contents('php://input');
  $body = json_decode($raw, true);
  if (!is_array($body)) $body = array();
}
$aksi = $metode === 'POST'
  ? (isset($body['action']) ? $body['action'] : '')
  : (isset($_GET['action']) ? $_GET['action'] : 'events');

/* Webhook Xendit tidak mengirim {action:...} — ia mengirim badan invoice apa
   adanya. Dikenali dari header khusus miliknya, bukan dari isi badan yang
   bisa ditiru siapa saja. */
$hdr = isset($_SERVER['HTTP_X_CALLBACK_TOKEN']) ? $_SERVER['HTTP_X_CALLBACK_TOKEN'] : '';
if ($metode === 'POST' && $hdr !== '' && $aksi === '') $aksi = 'webhook';

$G = function ($k, $d = '') { return isset($_GET[$k]) ? $_GET[$k] : $d; };
$B = function ($k, $d = '') use ($body) { return isset($body[$k]) ? $body[$k] : $d; };

try {
  if ($aksi === 'ping') {
    keluar(array('ok' => true, 'data' => array_merge(
      array('pong' => true, 'backend' => 'ticketing-php-mysql'), identitas(), array('ts' => gmdate('c')))));

  } else if ($aksi === 'events') {
    keluar(array('ok' => true, 'data' => events_publik()));

  } else if ($aksi === 'event') {
    $e = event_satu($G('id'));
    if (!$e) keluar(array('ok' => false, 'error' => 'Event tidak ditemukan atau belum dijual.'));
    keluar(array('ok' => true, 'data' => $e));

  } else if ($aksi === 'denah') {
    keluar(array('ok' => true, 'data' => denah($G('id'), $G('hold'))));

  } else if ($aksi === 'hold') {
    $seats = $B('seats', array());
    if (!is_array($seats) || !$seats) keluar(array('ok' => false, 'error' => 'Tidak ada kursi yang dipilih.'));
    keluar(array('ok' => true, 'data' => tahan_kursi($B('event_id'), $seats, $B('hold_token'))));

  } else if ($aksi === 'release') {
    $s = $B('seats', null);
    keluar(array('ok' => true, 'data' => lepas_kursi($B('hold_token'), is_array($s) ? $s : null)));

  } else if ($aksi === 'checkout') {
    keluar(array('ok' => true, 'data' => checkout($body)));

  } else if ($aksi === 'webhook') {
    keluar(array('ok' => true, 'data' => webhook_xendit($body, $hdr)));

  } else if ($aksi === 'simbayar') {
    // Hanya hidup di server non-produksi yang menyalakan XENDIT_MOCK.
    keluar(array('ok' => true, 'data' => simulasi_bayar($B('ref'), $B('token'))));

  /* ---- akun pembeli ----
     Token sesi dikirim di badan (POST) atau ?sesi= (GET). Tidak memakai
     cookie: backend ini dipanggil dari halaman yang bisa berada di domain
     berbeda, dan cookie tidak selalu ikut terkirim di situ. */
  } else if ($aksi === 'daftar') {
    keluar(array('ok' => true, 'data' => daftar($body)));

  } else if ($aksi === 'masuk') {
    keluar(array('ok' => true, 'data' => masuk($body)));

  } else if ($aksi === 'keluar') {
    keluar(array('ok' => true, 'data' => keluar_sesi($B('sesi'))));

  } else if ($aksi === 'saya') {
    keluar(array('ok' => true, 'data' => user_publik(user_dari_sesi($G('sesi')))));

  } else if ($aksi === 'tiketSaya') {
    keluar(array('ok' => true, 'data' => tiket_saya(user_dari_sesi($G('sesi')))));

  } else if ($aksi === 'ujiEmail') {
    /* Uji kirim sebelum ada pembeli sungguhan yang mengandalkannya. Hanya di
       server non-produksi: di produksi ia jadi alat orang asing mengirim
       email atas nama domainmu. */
    if (env_nyata() === 'produksi') keluar(array('ok' => false, 'error' => 'Uji email tidak tersedia di produksi.'));
    /* Alamat diperiksa di sini supaya salah ketik dijawab kalimat yang bisa
       ditindaklanjuti, bukan pesan mentah SMTP seperti "501 recipient address
       must contain a domain" — yang benar tapi tidak memberi tahu apa yang
       harus diperbaiki. */
    if (!filter_var($G('ke'), FILTER_VALIDATE_EMAIL))
      keluar(array('ok' => false, 'error' => 'Isi ?ke= dengan alamat email lengkap, mis. ?ke=nama@gmail.com (dapat: "' . $G('ke') . '").'));
    kirim_email($G('ke'), 'Uji kirim Laksamana Muda Ticketing',
      '<p>Kalau email ini sampai, SMTP sudah benar.</p>');
    keluar(array('ok' => true, 'data' => array('terkirim_ke' => $G('ke'))));

  } else if ($aksi === 'order') {
    keluar(array('ok' => true, 'data' => status_pesanan($G('ref'), $G('token'))));

  } else {
    keluar(array('ok' => false, 'error' => 'Aksi tidak dikenal: ' . $aksi));
  }
} catch (Throwable $e) {
  /* WEBHOOK YANG GAGAL HARUS MENJAWAB NON-2xx.
     Semua respons di sini berstatus 200, dan untuk browser itu benar. Tapi
     Xendit membaca 2xx sebagai "sudah diterima" lalu berhenti mengirim —
     jadi kalau database sedang tumbang saat webhook datang, pembayaran itu
     hilang selamanya meski auto-retry dinyalakan: tidak ada yang perlu
     diulang menurut Xendit.
     Khusus jalur webhook, galat dijawab 500 supaya auto-retry benar-benar
     berjalan. Token yang salah dijawab 401: itu salah konfigurasi, mengulang
     tidak menolong, dan kegagalannya justru harus terlihat di dashboard. */
  if ($aksi === 'webhook') {
    $tokenSalah = strpos($e->getMessage(), 'callback') !== false || strpos($e->getMessage(), 'Token') !== false;
    http_response_code($tokenSalah ? 401 : 500);
  }
  keluar(array('ok' => false, 'error' => $e->getMessage()));
}
