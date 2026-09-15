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
 *   POST {action:'simpanPekerja', row:{...}}
 *   POST {action:'hapusPekerja',  id}
 *   POST {action:'simpanAjuan',      row:{...}}  -- status SELALU MENUNGGU
 *   POST {action:'simpanPermintaan', row:{...}}  -- head minta N orang
 *   POST {action:'putusPermintaan',  id, status, nota}
 *   POST {action:'tugaskanDW',       permintaanId, dwIds:[...]}
 *   POST {action:'hapusPermintaan',  id}
 *   POST {action:'putusAjuan',    id, status, nota}
 *   POST {action:'putusBanyak',   ids:[...], status, nota}
 *   POST {action:'hapusAjuan',    id}
 *   POST {action:'simpanHadir',   id, hadir, nota}
 *   POST {action:'tandaiBayar',   senin, kunci, nyala}
 *   POST {action:'simpanSetting', data:{...}}
 *
 * TIAP PERMINTAAN MEMBAWA `sesi` — token sesi Office, lewat ?sesi= untuk GET
 * dan lewat body untuk POST. Tanpa itu jawabannya `sesi_tidak_sah`. Daftar
 * siapa boleh apa ada di bagian PENJAGA di bawah.
 *
 * DAILY WORKER TIDAK PUNYA AKUN dan tidak pernah memanggil API ini. Gerbang
 * no HP + PIN beserta loginDW/logoutDW/ajuanSaya dicabut 14 Agustus 2026 —
 * alurnya sekarang: head mengajukan kebutuhan, HRD menyetujui lalu menunjuk
 * siapa yang dipakai.
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
   Aturannya satu kalimat: SELURUH modul ini hanya untuk HRD. Daily worker
   tidak punya akun dan tidak pernah memanggilnya.

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
/* Head divisi, untuk DIVISINYA SENDIRI. Head Bar tidak boleh meminta DW
   untuk Kitchen — bukan karena curiga, tapi karena permintaan yang mendarat
   di divisi yang salah baru ketahuan saat orangnya datang ke tempat yang
   salah, dan yang mengirimnya sudah lupa pernah salah pilih. HRD boleh
   semuanya. */
function wajib_minta($body, $divisi) {
  $u = wajib_office($body);
  if (dw_hrd($u)) return $u;
  $h = (isset($u['headDivisi']) && is_array($u['headDivisi'])) ? $u['headDivisi'] : array();
  if (!count($h)) {
    sesi_tolak_tak_berhak('Hanya head divisi dan HRD yang bisa meminta daily worker.');
  }
  if ($divisi !== '' && !in_array($divisi, $h, true)) {
    sesi_tolak_tak_berhak('Anda head divisi ' . implode(', ', $h)
      . ' — permintaan untuk divisi ' . $divisi . ' harus diajukan head divisi itu.');
  }
  return $u;
}
/* KEHADIRAN & PENGGANTI: HRD, atau HEAD DIVISI SHIFT ITU.
   ---------------------------------------------------------------------
   Beda dari menyetujui, yang tetap HRD saja. Yang tahu siapa benar-benar
   datang malam itu adalah orang yang ada di lokasi, dan itu head divisinya —
   menguncinya untuk HRD berarti HRD menelepon empat head tiap pagi sebelum
   bisa membayar siapa pun, dan yang ditunggu-tunggu begitu akhirnya diisi
   asal-asalan. Persis itu yang mematikan pencatatan kehadiran versi pertama
   (dicabut 6 Agustus 2026).

   Ini MENYENTUH UANG, jadi dua hal wajib ada dan sudah ada: `hadir_oleh` +
   `hadir_at` mencatat siapa dan kapan, dan divisinya dijepit per baris —
   head Bar tidak bisa menandai kehadiran shift Kitchen. Divisinya dibaca
   dari BARIS di database, bukan dari yang dikirim layar. */
function wajib_hadir($body, $id) {
  $a = ajuan_by_id($id);
  /* Baris yang tidak ada tetap melewati gerbang umum, lalu lib yang
     melemparkan pesan yang benar. Menolaknya di sini sebagai 'tidak berhak'
     membuat id yang salah ketik terbaca sebagai masalah hak akses. */
  return wajib_minta($body, $a ? (string)$a['divisi'] : '');
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
function nama_pemanggil($u) {
  return ($u && isset($u['name'])) ? (string)$u['name'] : '';
}

try {
  switch ($action) {
    case 'getAll': {
      /* Butuh sesi Office. HRD dan HEAD DIVISI menerima isi penuh; staf lain
         tetap dilayani — Dashboard dan Kalender DW memang terbuka untuknya —
         tapi tanpa no HP dan tanpa tujuan transfer siapa pun. */
      $u = wajib_office($body);
      $data = baca_semua(
        isset($_GET['dari']) ? $_GET['dari'] : '',
        isset($_GET['sampai']) ? $_GET['sampai'] : '',
        dw_boleh_lihat($u)
      );
      /* Peran ikut dikirim supaya layar tidak menyimpulkannya sendiri dari
         daftar modul & setting — lihat peran_pemanggil(). */
      $data['peran'] = peran_pemanggil($u);
      keluar(array('ok' => true, 'data' => $data));
    }

    case 'jadwalDW':
      keluar(array('ok' => true, 'data' => jadwal_dw(
        isset($_GET['dari']) ? $_GET['dari'] : '',
        isset($_GET['sampai']) ? $_GET['sampai'] : ''
      )));

    case 'stats': keluar(array('ok' => true, 'data' => stats()));
    case 'ping':  keluar(array('ok' => true, 'data' => ping()));

    case 'simpanPekerja': {
      $u = wajib_hrd($body, 'Mengubah data daily worker');
      keluar(array('ok' => true, 'data' => simpan_pekerja(
        ambil($body, 'row', array()), nama_pemanggil($u))));
    }

    case 'hapusPekerja':
      wajib_hrd($body, 'Menghapus daily worker');
      keluar(array('ok' => true, 'data' => hapus_pekerja(ambil($body, 'id'))));

    case 'simpanAjuan': {
      /* CARA 1 — head menunjuk orangnya langsung untuk divisinya sendiri,
         atau HRD menjadwalkan seperti biasa. Hasilnya SELALU baris MENUNGGU
         (simpan_ajuan memaksanya), jadi head tetap tidak bisa menyetujui
         pilihannya sendiri — yang memutuskan tetap HRD. */
      $row = (array)ambil($body, 'row', array());
      $u = wajib_minta($body, pot(isset($row['divisi']) ? $row['divisi'] : '', 16));
      keluar(array('ok' => true, 'data' => simpan_ajuan($row, nama_pemanggil($u))));
    }

    /* CARA 2 — head meminta JUMLAHNYA saja, HRD yang menunjuk orangnya. */
    case 'simpanPermintaan': {
      $row = (array)ambil($body, 'row', array());
      $u = wajib_minta($body, pot(isset($row['divisi']) ? $row['divisi'] : '', 16));
      keluar(array('ok' => true, 'data' => simpan_permintaan($row, nama_pemanggil($u))));
    }

    case 'putusPermintaan': {
      /* Menyetujui/menolak permintaan: HRD saja. Head boleh MEMBATALKAN
         permintaannya sendiri — menarik kembali apa yang ia minta bukan
         keputusan HRD, dan memaksanya menelepon untuk itu cuma membuat
         permintaan hantu menumpuk di antrean. */
      $id = ambil($body, 'id');
      $status = strtoupper(trim((string)ambil($body, 'status')));
      $u = wajib_office($body);
      if (!dw_hrd($u)) {
        $pm = permintaan_by_id($id);
        $h = (isset($u['headDivisi']) && is_array($u['headDivisi'])) ? $u['headDivisi'] : array();
        if ($status !== 'BATAL' || !$pm || !in_array($pm['divisi'], $h, true)) {
          sesi_tolak_tak_berhak('Menyetujui atau menolak permintaan hanya bisa dilakukan HRD.');
        }
      }
      keluar(array('ok' => true, 'data' => putus_permintaan(
        $id, $status, ambil($body, 'nota'), nama_pemanggil($u))));
    }

    case 'tugaskanDW': {
      /* MENUNJUK ORANGNYA — HRD saja, dan inilah inti pembagian tugasnya:
         head tahu berapa yang ia butuhkan, HRD tahu siapa yang senggang dan
         menanggung akibat uangnya. */
      $u = wajib_hrd($body, 'Menugaskan daily worker');
      keluar(array('ok' => true, 'data' => tugaskan_dw(
        ambil($body, 'permintaanId'), ambil($body, 'dwIds', array()), nama_pemanggil($u))));
    }

    case 'hapusPermintaan': {
      $id = ambil($body, 'id');
      $u = wajib_office($body);
      if (!dw_hrd($u)) {
        $pm = permintaan_by_id($id);
        $h = (isset($u['headDivisi']) && is_array($u['headDivisi'])) ? $u['headDivisi'] : array();
        if (!$pm || !in_array($pm['divisi'], $h, true)) {
          sesi_tolak_tak_berhak('Permintaan ini bukan milik divisi Anda.');
        }
      }
      keluar(array('ok' => true, 'data' => hapus_permintaan($id)));
    }

    case 'putusAjuan': {
      /* INI PINTU YANG PALING MAHAL DI MODUL INI. Yang disetujui di sini
         langsung berdiri di kalender Jadwal Shift dan ikut terhitung sebagai
         uang yang harus ditransfer minggu itu di halaman Pembayaran.

         HRD saja. Pengecualian "DW boleh membatalkan ajuannya sendiri" ikut
         hilang bersama gerbang masuknya — tidak ada lagi DW yang bisa
         memanggil endpoint ini. */
      $u = wajib_hrd($body, 'Memutuskan ajuan daily worker');
      keluar(array('ok' => true, 'data' => putus_ajuan(
        ambil($body, 'id'), ambil($body, 'status'),
        ambil($body, 'nota'), nama_pemanggil($u))));
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
      $u = wajib_hadir($body, ambil($body, 'id'));
      keluar(array('ok' => true, 'data' => simpan_hadir(
        ambil($body, 'id'), ambil($body, 'hadir'),
        ambil($body, 'nota'), nama_pemanggil($u))));
    }

    /* Pengganti di lokasi. Gerbangnya SAMA dengan kehadiran: yang tahu siapa
       yang akhirnya datang adalah orang yang ada di sana. */
    case 'gantiOrang': {
      $u = wajib_hadir($body, ambil($body, 'id'));
      keluar(array('ok' => true, 'data' => ganti_orang(
        ambil($body, 'id'), ambil($body, 'dwBaru'),
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
      /* HRD boleh menyetel tarif, kuota, jam bawaan, dan daftar posisi — itu
         memang pekerjaannya. Yang tidak ikut: daftar HRD itu sendiri, yang
         dipertahankan server kalau pemanggilnya bukan admin modul. Lihat
         simpan_setting(). */
      $u = wajib_hrd($body, 'Mengubah pengaturan modul');
      keluar(array('ok' => true, 'data' => simpan_setting(
        ambil($body, 'data', null), nama_pemanggil($u), dw_admin($u))));
    }

    /* Mengosongkan seluruh permintaan & pengajuan supaya modul bisa dimulai
       dari nol. ADMIN MODUL saja -- bukan HRD. Menyetujui ajuan adalah
       pekerjaan HRD sehari-hari; menghapus seluruh riwayatnya bukan, dan
       tombol yang berada satu halaman dengan tarif tidak boleh bisa ditekan
       oleh setiap orang yang berwenang menyetel tarif.

       `pekerja` (talent pool) hanya ikut kalau diminta eksplisit. Kata kunci
       konfirmasinya diperiksa lagi di sini supaya panggilan API yang nyasar
       -- tanpa lewat layar dan modalnya -- tidak bisa menghapus apa pun. */
    case 'kosongkanSemua': {
      $u = wajib_admin($body, 'Mengosongkan seluruh data modul');
      if (s(ambil($body, 'konfirmasi', '')) !== 'HAPUS SEMUA') {
        throw new Exception('Konfirmasi tidak cocok — pengosongan dibatalkan.');
      }
      keluar(array('ok' => true, 'data' => kosongkan_semua(
        !empty($body['pekerja']), nama_pemanggil($u))));
    }

    default:
      keluar(array('ok' => false, 'error' => 'Aksi tidak dikenal: ' . $action));
  }
} catch (Throwable $e) {
  keluar(array('ok' => false, 'error' => $e->getMessage()));
}
