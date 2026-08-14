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
 *   POST {action:'loginDW',       hp, pin}      -> {ok,data:{token,dw:{...}}}
 *   POST {action:'logoutDW'}                    -- mencabut token di server
 *   POST {action:'ajuanSaya'}                   -> {ok,data:{ajuan,setting}}
 *   POST {action:'simpanPekerja', row:{...}}
 *   POST {action:'hapusPekerja',  id}
 *   POST {action:'simpanAjuan',   row:{...}}     -- status SELALU MENUNGGU
 *   POST {action:'putusAjuan',    id, status, nota}
 *   POST {action:'putusBanyak',   ids:[...], status, nota}
 *   POST {action:'hapusAjuan',    id}
 *   POST {action:'simpanHadir',   id, hadir, nota}
 *   POST {action:'tandaiBayar',   senin, kunci, nyala}
 *   POST {action:'simpanSetting', data:{...}}
 *
 * TIAP PERMINTAAN MEMBAWA `sesi` — token sesi Office (staf) atau token dari
 * loginDW (daily worker); lewat ?sesi= untuk GET, lewat body untuk POST.
 * Tanpa itu jawabannya `sesi_tidak_sah`. Daftar siapa boleh apa ada di
 * bagian PENJAGA di bawah.
 *
 * `by` SUDAH TIDAK DIPAKAI lagi walau frontend masih mengirimnya: nama
 * pemutus sekarang diambil dari identitas yang terbukti, bukan dari yang
 * diketik client. Kolom "disetujui oleh" yang bisa diisi sendiri tidak
 * menjawab apa pun saat ditanyakan berbulan-bulan kemudian.
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

/* ======================================================================
   PENJAGA — SIAPA BOLEH MELAKUKAN APA
   ----------------------------------------------------------------------
   Aturannya satu kalimat: YANG MEMUTUSKAN DI MODUL INI HANYA HRD. Selain
   itu, seorang daily worker boleh mengurus ajuannya SENDIRI — mengirim dan
   membatalkan, tidak lebih.

   Ditulis di sini, di satu tempat, bukan disebar sebagai `if` di dalam tiap
   fungsi lib: daftar yang bisa dibaca sekali dari atas ke bawah bisa
   dipastikan lengkap, sedangkan pemeriksaan yang tersebar selalu menyisakan
   satu aksi yang terlupa — dan yang terlupa tidak pernah melapor.

   Tiga aksi sengaja DIBIARKAN TERBUKA, dan ini keputusan sadar:
     ping / stats  — tidak memulangkan satu baris data pun, dan dipakai
                     langkah Verifikasi di kedua workflow FTP.
     jadwalDW      — dibaca modul Jadwal Shift dari peramban SELURUH kru, dan
                     dibaca backend Absensi server-ke-server (yang config-nya
                     hanya bisa diubah manual di cPanel). Isinya memang sudah
                     dipilih seminimal mungkin justru karena ini: nama, divisi,
                     posisi, jam — tanpa no HP, tanpa PIN, tanpa catatan HR.
                     Yang bocor kalau seseorang memanggilnya: siapa masuk hari
                     apa. Itu informasi yang memang tertempel di papan venue.
   Menutup jadwalDW berarti mematikan absensi di kedua situs sampai ada yang
   menyunting config.php di cPanel — kegagalan yang tidak menimbulkan galat di
   mana pun, dan justru itu yang paling mahal di repo ini.
   ====================================================================== */

/* Staf Office dengan akses modul DW. DUA sebab penolakan yang berbeda, dan
   sengaja dibedakan: token yang tidak dikenali disembuhkan dengan masuk ulang,
   akun tanpa kunci modul TIDAK — menyuruhnya masuk ulang cuma membuatnya
   berputar tanpa pernah tahu apa yang kurang. */
function wajib_office($body) {
  $u = sesi_user($body);
  if (!$u) sesi_tolak_tak_dikenal();
  if (!sesi_punya_modul($u, 'dw')) sesi_tolak_tanpa_modul('Roster · Daily Worker');
  return $u;
}
/* Yang berhak memutuskan. Inilah pintu untuk seluruh aksi tulis HR. */
function wajib_hrd($body, $apa) {
  $u = wajib_office($body);
  if (!dw_hrd($u)) sesi_tolak_tak_berhak($apa . ' hanya bisa dilakukan HRD. Minta admin modul menambahkan Anda di Pengaturan → Hak Akses.');
  return $u;
}
function wajib_admin($body, $apa) {
  $u = wajib_office($body);
  if (!dw_admin($u)) sesi_tolak_tak_berhak($apa . ' hanya bisa dilakukan admin modul Daily Worker.');
  return $u;
}
/* Nama pemanggil untuk kolom `*_oleh`. Diambil dari IDENTITAS YANG SUDAH
   TERBUKTI, bukan dari `by` yang dikirim client — `by` bisa diketik siapa
   saja, dan kolom "disetujui oleh" yang bisa diketik sendiri tidak menjawab
   apa pun saat ditanyakan berbulan-bulan kemudian. */
function nama_pemanggil($u, $dw = null) {
  if ($u && isset($u['name'])) return (string)$u['name'];
  if ($dw && isset($dw['nama'])) return $dw['nama'] . ' (DW)';
  return '';
}

try {
  switch ($action) {
    case 'getAll': {
      /* Butuh sesi Office. Yang BUKAN HRD tetap dilayani — Dashboard dan
         Kalender DW memang terbuka untuknya — tapi tanpa no HP dan tanpa
         tujuan transfer siapa pun. */
      $u = wajib_office($body);
      keluar(array('ok' => true, 'data' => baca_semua(
        isset($_GET['dari']) ? $_GET['dari'] : '',
        isset($_GET['sampai']) ? $_GET['sampai'] : '',
        dw_hrd($u)
      )));
    }

    case 'jadwalDW':
      keluar(array('ok' => true, 'data' => jadwal_dw(
        isset($_GET['dari']) ? $_GET['dari'] : '',
        isset($_GET['sampai']) ? $_GET['sampai'] : ''
      )));

    case 'stats': keluar(array('ok' => true, 'data' => stats()));
    case 'ping':  keluar(array('ok' => true, 'data' => ping()));

    case 'loginDW':
      keluar(array('ok' => true, 'data' => login_dw(ambil($body, 'hp'), ambil($body, 'pin'))));

    case 'logoutDW':
      keluar(array('ok' => true, 'data' => logout_dw(sesi_token($body))));

    case 'ajuanSaya': {
      /* `dwId` dari client TIDAK dipercaya sama sekali — yang dipakai adalah
         pemilik tokennya. Sebelumnya siapa pun bisa menyebut id orang lain
         dan menerima seluruh riwayat kerjanya. HR juga boleh membacanya
         (halaman profil DW memakai jalur ini). */
      $dw = dw_sesi_pemilik($body);
      if ($dw) keluar(array('ok' => true, 'data' => ajuan_saya($dw['id'])));
      $u = dw_office($body);
      if ($u && dw_hrd($u)) keluar(array('ok' => true, 'data' => ajuan_saya(ambil($body, 'dwId'))));
      sesi_tolak_tak_dikenal();
    }

    case 'simpanPekerja': {
      $u = wajib_hrd($body, 'Mengubah data daily worker');
      keluar(array('ok' => true, 'data' => simpan_pekerja(
        ambil($body, 'row', array()), nama_pemanggil($u))));
    }

    case 'hapusPekerja':
      wajib_hrd($body, 'Menghapus daily worker');
      keluar(array('ok' => true, 'data' => hapus_pekerja(ambil($body, 'id'))));

    case 'simpanAjuan': {
      /* DUA pemanggil yang sah, dan hanya dua: HRD yang mengisikan atas nama
         DW yang menelepon, dan DW itu sendiri UNTUK DIRINYA SENDIRI. Yang
         terakhir itu sebabnya dwId-nya dipaksa dari token — tanpa itu seorang
         DW bisa mengirim ajuan atas nama rekannya, dan yang muncul di antrean
         HR adalah nama orang yang tidak pernah menyanggupinya. */
      $row = ambil($body, 'row', array());
      $dw = dw_sesi_pemilik($body);
      if ($dw) {
        $row = (array)$row;
        $row['dwId'] = $dw['id'];
        keluar(array('ok' => true, 'data' => simpan_ajuan($row, nama_pemanggil(null, $dw))));
      }
      $u = wajib_hrd($body, 'Membuat ajuan atas nama daily worker');
      keluar(array('ok' => true, 'data' => simpan_ajuan($row, nama_pemanggil($u))));
    }

    case 'putusAjuan': {
      /* INI PINTU YANG PALING MAHAL DI MODUL INI. Yang disetujui di sini
         langsung berdiri di kalender Jadwal Shift dan ikut terhitung sebagai
         uang yang harus ditransfer minggu itu di halaman Pembayaran. Karena
         itu: menyetujui/menolak HANYA HRD.

         Satu-satunya pengecualian, dan sengaja sempit: seorang DW boleh
         MEMBATALKAN ajuannya SENDIRI (status BATAL, tidak ada status lain).
         Itu memang tombol yang ada di halaman "Pengajuan Saya" miliknya, dan
         membatalkan kesanggupan sendiri bukan keputusan HR. */
      $id = ambil($body, 'id');
      $status = strtoupper(trim((string)ambil($body, 'status')));
      $dw = dw_sesi_pemilik($body);
      if ($dw) {
        if ($status !== 'BATAL') {
          sesi_tolak_tak_berhak('Menyetujui atau menolak ajuan hanya bisa dilakukan HRD.');
        }
        $a = ajuan_by_id($id);
        if (!$a || $a['dw_id'] !== $dw['id']) {
          sesi_tolak_tak_berhak('Ajuan ini bukan milik Anda.');
        }
        keluar(array('ok' => true, 'data' => putus_ajuan(
          $id, 'BATAL', ambil($body, 'nota'), nama_pemanggil(null, $dw))));
      }
      $u = wajib_hrd($body, 'Memutuskan ajuan daily worker');
      keluar(array('ok' => true, 'data' => putus_ajuan(
        $id, $status, ambil($body, 'nota'), nama_pemanggil($u))));
    }

    case 'putusBanyak': {
      $u = wajib_hrd($body, 'Memutuskan ajuan daily worker');
      keluar(array('ok' => true, 'data' => putus_banyak(
        ambil($body, 'ids', array()), ambil($body, 'status'),
        ambil($body, 'nota'), nama_pemanggil($u))));
    }

    case 'hapusAjuan':
      wajib_hrd($body, 'Menghapus ajuan');
      keluar(array('ok' => true, 'data' => hapus_ajuan(ambil($body, 'id'))));

    case 'simpanHadir': {
      $u = wajib_hrd($body, 'Mencatat kehadiran');
      keluar(array('ok' => true, 'data' => simpan_hadir(
        ambil($body, 'id'), ambil($body, 'hadir'),
        ambil($body, 'nota'), nama_pemanggil($u))));
    }

    /* Penanda "sudah ditransfer" — HRD, bukan admin, karena inilah yang
       ditekan belasan kali saat mengerjakan transfer. Jalurnya sendiri
       (bukan simpanSetting) supaya dua orang yang menandai berbarengan tidak
       saling menimpa seluruh tarif dan kuota. */
    case 'tandaiBayar': {
      $u = wajib_hrd($body, 'Menandai pembayaran');
      keluar(array('ok' => true, 'data' => tandai_bayar(
        ambil($body, 'senin'), ambil($body, 'kunci'),
        !empty($body['nyala']), nama_pemanggil($u))));
    }

    case 'simpanSetting': {
      /* Menulis SELURUH blob setting: tarif, kuota, jam bawaan, dan daftar
         siapa yang berhak memutuskan. Yang terakhir itu sebabnya ini admin
         saja — HRD yang bisa menyunting daftar HRD bukan pembatasan. */
      $u = wajib_admin($body, 'Mengubah pengaturan modul');
      keluar(array('ok' => true, 'data' => simpan_setting(
        ambil($body, 'data', null), nama_pemanggil($u))));
    }

    default:
      keluar(array('ok' => false, 'error' => 'Aksi tidak dikenal: ' . $action));
  }
} catch (Throwable $e) {
  keluar(array('ok' => false, 'error' => $e->getMessage()));
}
