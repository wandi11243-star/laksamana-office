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
 *   POST {action:'simpanSel',       rows:[...], hapus:[...]}
 *   POST {action:'simpanSetting',   data:{...}}
 *   POST {action:'simpanPengajuan', row:{...}}
 *   POST {action:'putusPengajuan',  id, status:'DISETUJUI'|'DITOLAK', nota}
 *   POST {action:'hapusPengajuan',  id}
 *
 * TIAP PERMINTAAN MEMBAWA `sesi` — token sesi Office; lewat ?sesi= untuk GET,
 * lewat body untuk POST. Tanpa itu jawabannya `sesi_tidak_sah`. Daftar siapa
 * boleh apa ada di bagian PENJAGA di bawah; ringkasnya, jadwal sebuah divisi
 * hanya bisa disusun head divisi itu.
 *
 * `by` SUDAH TIDAK DIPAKAI walau frontend masih mengirimnya: nama pemutus
 * diambil dari identitas yang terbukti, bukan dari yang diketik client.
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

/* ======================================================================
   PENJAGA — SIAPA BOLEH MELAKUKAN APA
   ----------------------------------------------------------------------
   Aturannya satu kalimat: JADWAL SEBUAH DIVISI DISUSUN HEAD DIVISI ITU.
   Admin modul boleh semuanya. Kru biasa boleh MENGAJUKAN (off/izin/cuti/
   tukar) untuk dirinya sendiri, dan tidak lebih — yang memutuskan tetap
   head.

   Diperiksa PER BARIS, bukan sekali di depan: satu simpanSel bisa memuat
   puluhan sel milik orang yang berbeda-beda, dan divisi yang sedang dibuka
   di layar pengirim bukan bukti apa pun. Lihat jdw_wajib_boleh_baris().

   `shiftHari` SENGAJA DIBIARKAN TERBUKA. Ia dipanggil backend Absensi
   server-ke-server, dan config.php di sana hanya bisa diubah manual lewat
   cPanel — menutupnya berarti absensi kedua situs mati sampai ada yang
   menyuntingnya, tanpa satu pun galat yang menyebut sebabnya. Isinya memang
   sudah setipis mungkin: kode shift + jam untuk satu orang pada satu hari.
   `ping`/`stats` juga terbuka karena dipakai langkah Verifikasi di kedua
   workflow FTP dan tidak memulangkan satu baris data pun.
   ====================================================================== */
/* DUA sebab penolakan yang berbeda, dan sengaja dibedakan: token yang tidak
   dikenali disembuhkan dengan masuk ulang, akun tanpa kunci modul TIDAK.

   Nama centangnya disebut persis seperti di Kelola Akses — "Roster · Jadwal
   Shift", bukan "Jadwal Shift". Kartunya di portal bernama Roster dan memuat
   DUA kunci bersebelahan, dan tertukar centang di situ persis yang membuat
   pegawai tetap mendarat di Daily Worker: pemilih panel mengalihkan sendiri
   ke satu-satunya panel yang ia pegang, tanpa mengatakan apa pun. */
function wajib_office($body) {
  $u = sesi_user($body);
  if (!$u) sesi_tolak_tak_dikenal();
  if (!sesi_punya_modul($u, 'jadwal')) sesi_tolak_tanpa_modul('Roster · Jadwal Shift');
  return $u;
}
function wajib_admin($body, $apa) {
  $u = wajib_office($body);
  if (!jdw_admin($u)) sesi_tolak_tak_berhak($apa . ' hanya bisa dilakukan admin modul Jadwal Shift.');
  return $u;
}
/* Nama untuk kolom `*_oleh`, dari identitas yang TERBUKTI — bukan dari `by`
   yang dikirim client dan bisa diketik siapa saja. */
function nama_pemanggil($u) { return ($u && isset($u['name'])) ? (string)$u['name'] : ''; }

try {
  switch ($action) {
    case 'getAll':
      /* Butuh sesi Office dengan akses modul. Isinya seluruh jadwal
         perusahaan plus alasan tiap pengajuan izin/cuti — teks bebas yang
         sering memuat hal pribadi ("operasi", "urus kematian"). */
      wajib_office($body);
      keluar(array('ok' => true, 'data' => baca_semua(
        isset($_GET['dari']) ? $_GET['dari'] : '',
        isset($_GET['sampai']) ? $_GET['sampai'] : ''
      )));

    /* Endpoint SEMPIT untuk modul absensi: shift satu kru pada satu hari.
       Read-only, tanpa PIN, tanpa data pengajuan — sengaja setipis mungkin
       karena ia dipanggil tiap kali seseorang menekan tombol absen. */
    case 'shiftHari':
      keluar(array('ok' => true, 'data' => shift_hari_rentang(
        isset($_GET['user']) ? $_GET['user'] : ambil($body, 'user', ''),
        isset($_GET['dari']) ? $_GET['dari'] : ambil($body, 'dari', ''),
        isset($_GET['sampai']) ? $_GET['sampai'] : ambil($body, 'sampai', ''))));

    /* Daftar head divisi, dibaca MODUL LAIN — Office (untuk memberi head kunci
       modul Daily Worker) dan modul DW sendiri. Sengaja terbuka, dengan alasan
       yang sama seperti shiftHari: pemanggilnya server-ke-server, dan yang
       dipulangkan cuma id user + kode divisi. Tidak ada nama, tidak ada
       jadwal, tidak ada apa pun yang bisa dipakai di luar pertanyaannya —
       "siapa head divisi apa" memang sudah tertulis di layar Pengaturan yang
       dibuka seluruh pemegang akses modul. */
    case 'headIds':
      keluar(array('ok' => true, 'data' => array('heads' => head_ids())));

    case 'stats': keluar(array('ok' => true, 'data' => stats()));
    case 'ping':  keluar(array('ok' => true, 'data' => ping()));

    case 'simpanSel': {
      /* Tiap baris diperiksa terhadap divisi kru yang ditunjuknya di dalam
         simpan_sel — bukan di sini — karena satu kiriman bisa memuat
         puluhan orang dari divisi yang berbeda. */
      $u = wajib_office($body);
      keluar(array('ok' => true, 'data' => simpan_sel(
        ambil($body, 'rows', array()), ambil($body, 'hapus', array()),
        nama_pemanggil($u), $u)));
    }

    case 'simpanSetting': {
      /* Blob setting memuat daftar head tiap divisi DAN daftar manajemen.
         Siapa pun yang bisa menulisnya bisa mengangkat dirinya sendiri jadi
         head semua divisi — jadi ini admin modul saja, tanpa pengecualian. */
      $u = wajib_admin($body, 'Mengubah pengaturan modul');
      keluar(array('ok' => true, 'data' => simpan_setting(
        ambil($body, 'data', null), nama_pemanggil($u))));
    }

    case 'simpanPengajuan': {
      /* Kru mengajukan UNTUK DIRINYA SENDIRI. `userId` dipaksa dari identitas
         yang terbukti, bukan diterima apa adanya — kalau tidak, siapa pun
         bisa mengirimkan pengajuan cuti atas nama rekannya, dan head hanya
         melihat nama orang yang tidak pernah memintanya.

         Admin tetap boleh mengisikan atas nama orang lain: HR memang
         mencatatkan izin yang masuk lewat telepon. */
      $u = wajib_office($body);
      $row = (array)ambil($body, 'row', array());
      if (!jdw_admin($u)) $row['userId'] = (string)$u['id'];
      keluar(array('ok' => true, 'data' => simpan_pengajuan($row, nama_pemanggil($u))));
    }

    case 'putusPengajuan': {
      /* Sepasang dengan bisaPutuskan() di layar: yang memutuskan adalah head
         divisi SI PENGAJU — bukan head mana pun, dan jelas bukan pengajunya
         sendiri. Tanpa ini, kru yang mengajukan cuti tinggal memanggil
         endpoint ini sekali untuk menyetujui cutinya sendiri, dan sel
         jadwalnya ikut berubah tanpa satu pun head tahu. */
      $u = wajib_office($body);
      $a = pengajuan_by_id(ambil($body, 'id'));
      if (!$a) throw new Exception('Pengajuan tidak ditemukan: ' . ambil($body, 'id'));
      jdw_wajib_boleh_baris($u, $a['user_id']);
      keluar(array('ok' => true, 'data' => putus_pengajuan(
        ambil($body, 'id'), ambil($body, 'status'), ambil($body, 'nota'), nama_pemanggil($u))));
    }

    case 'hapusPengajuan': {
      /* Boleh dihapus pengajunya sendiri (menarik kembali sebelum diputus)
         atau head divisinya. */
      $u = wajib_office($body);
      $a = pengajuan_by_id(ambil($body, 'id'));
      if ($a && (string)$a['user_id'] !== (string)$u['id']) jdw_wajib_boleh_baris($u, $a['user_id']);
      keluar(array('ok' => true, 'data' => hapus_pengajuan(ambil($body, 'id'))));
    }

    default:
      keluar(array('ok' => false, 'error' => 'Aksi tidak dikenal: ' . $action));
  }
} catch (Throwable $e) {
  keluar(array('ok' => false, 'error' => $e->getMessage()));
}
