<?php
/************************************************************************
 * DAILY WORKER LAKSAMANA — Backend PHP + MySQL
 * ---------------------------------------------------------------------
 * Modul ini mengurus pekerja harian (part time) yang BUKAN pegawai Office:
 * mereka tidak punya akun Office, tidak muncul di listDivisiRoster, dan
 * daftarnya berganti tiap bulan. Karena itu — beda dengan jadwal-api-mysql
 * yang sengaja tidak punya tabel orang — di sini daftar orangnya memang
 * tinggal di database sendiri (`dw_pekerja`).
 *
 * ALUR YANG DILAYANI FILE INI:
 *   1. DW (atau HR atas namanya) mengajukan tanggal + jam kerja  -> dw_ajuan
 *   2. HR menyetujui / menolak                                   -> putus_ajuan
 *   3. Yang DISETUJUI dibaca modul Jadwal Shift lewat `jadwal_dw`
 *      dan digambar di kalender, terpisah dari kru shift tetap.
 *
 * Langkah 3 sengaja berupa PEMBACAAN, bukan penyalinan baris ke
 * `jadwal_sel`. Kalau disalin, ada dua kebenaran untuk hari yang sama:
 * ajuan yang dibatalkan di sini tidak ikut hilang dari sana, dan yang
 * salah selalu yang jarang dilihat. Satu sumber, dibaca dua tempat.
 *
 * PENULISAN GRANULAR per baris, bukan saveAll satu blob — alasannya sama
 * dengan modul Jadwal: HR, head divisi, dan DW-nya sendiri bisa menulis di
 * waktu berdekatan, dan blob membuat yang menyimpan belakangan menghapus
 * kerja yang lain tanpa error apa pun.
 *
 * File ini HANYA berisi fungsi (tanpa efek samping saat di-include).
 ************************************************************************/

if (file_exists(__DIR__ . '/config.local.php')) require_once __DIR__ . '/config.local.php';
else                                            require_once __DIR__ . '/config.php';

/* Identitas pemanggil. Sampai berkas ini ada, seluruh hak akses modul hidup
   hanya di layar dan API-nya terbuka untuk siapa saja — lihat kepala
   lib_sesi.php untuk apa saja yang bisa diambil dan diubah orang asing. */
require_once __DIR__ . '/lib_sesi.php';

function db() {
  static $pdo = null;
  if ($pdo !== null) return $pdo;
  $dsn = 'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
  $pdo = new PDO($dsn, DB_USER, DB_PASS, array(
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
  ));
  return $pdo;
}

/* Menambahkan kolom yang lahir belakangan ke tabel yang SUDAH ada.
   CREATE TABLE IF NOT EXISTS diam saja kalau tabelnya sudah ada — termasuk
   saat bentuknya sudah ketinggalan. MySQL tidak punya ADD COLUMN IF NOT
   EXISTS (itu MariaDB), jadi keberadaannya ditanyakan dulu ke
   information_schema. Kegagalan di sini tidak boleh mematikan modul. */
function pastikan_kolom($pdo, $tabel, $kolom, $ddl) {
  try {
    $st = $pdo->prepare(
      'SELECT COUNT(*) c FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :k');
    $st->execute(array(':t' => $tabel, ':k' => $kolom));
    $row = $st->fetch();
    if ($row && (int)$row['c'] > 0) return;
    $pdo->exec('ALTER TABLE `' . $tabel . '` ADD COLUMN `' . $kolom . '` ' . $ddl);
  } catch (Throwable $e) {
    // Diam: kolomnya kemungkinan sudah ada, atau user DB tidak punya ALTER.
  }
}

function json_enc($v) { return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); }
function s($v) { return trim((string)$v); }
function ms() { return (int)(microtime(true) * 1000); }
function pot($v, $n) { return mb_substr(s($v), 0, $n); }

/* Tanggal HARUS divalidasi bentuknya, bukan diserahkan ke MySQL: kolomnya
   DATE, dan MySQL dengan mode longgar diam-diam mengubah '2026-13-45' jadi
   '0000-00-00'. Ajuan yang mendarat di tanggal nol tidak pernah muncul lagi
   di kalender mana pun — hilang tanpa error. Sama persis dengan alasan di
   lib_jadwal_mysql.php. */
function tgl_valid($v) {
  $v = s($v);
  if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m)) return '';
  return checkdate((int)$m[2], (int)$m[3], (int)$m[1]) ? $v : '';
}
function jam_valid($v) {
  $v = s($v);
  return preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $v) ? $v : '';
}

/* Nomor HP dinormalkan SEBELUM disimpan maupun sebelum dicari. Orang yang
   sama menulis nomornya sebagai "0812-3456-7890", "+62 812 3456 7890", dan
   "81234567890" pada tiga kesempatan berbeda; tanpa normalisasi, kunci unik
   `uq_pekerja_hp` tidak menahan apa pun dan satu orang bisa terdaftar tiga
   kali. Bentuk baku: hanya angka, diawali '0'. */
function hp_normal($v) {
  $d = preg_replace('/\D+/', '', (string)$v);
  if ($d === '') return '';
  if (substr($d, 0, 2) === '62') $d = '0' . substr($d, 2);
  elseif (substr($d, 0, 1) !== '0') $d = '0' . $d;
  return substr($d, 0, 20);
}

/* Tiga saja, dan divalidasi di SINI juga — bukan cuma di layar. Nilai asing
   yang lolos ke kolom ini membuat halaman Pembayaran menggabungkan orang ke
   kelompok yang tidak ada di daftar penyaringnya, lalu mereka hilang dari
   layar tanpa satu pun galat. */
function bayar_jenis_sah($v) {
  $v = strtoupper(preg_replace('/[^A-Za-z]/', '', (string)$v));
  return in_array($v, array('BANK', 'GOPAY', 'DANA'), true) ? $v : 'BANK';
}

function id_baru($awalan) {
  return $awalan . base_convert((string)ms(), 10, 36) . random_int(100, 999);
}

/* Semua tabel dibuat saat pertama dipakai, jadi pemasangan tidak pernah
   gagal cuma karena schema.sql lupa dijalankan. schema.sql tetap ada
   sebagai dokumentasi bentuk tabel. */
function pastikan_tabel($pdo) {
  static $sudah = false;
  if ($sudah) return;
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS `dw_pekerja` (
       `id`           VARCHAR(32)  NOT NULL PRIMARY KEY,
       `nama`         VARCHAR(120) NOT NULL,
       `no_hp`        VARCHAR(32)  NOT NULL,
       `pin`          VARCHAR(8)   NOT NULL DEFAULT \'\',
       `gender`       VARCHAR(10)  NOT NULL DEFAULT \'\',
       `area`         VARCHAR(80)  NOT NULL DEFAULT \'\',
       `bank`         VARCHAR(120) NOT NULL DEFAULT \'\',
       `bayar_jenis`  VARCHAR(16)  NOT NULL DEFAULT \'BANK\',
       `bayar_nomor`  VARCHAR(60)  NOT NULL DEFAULT \'\',
       `bayar_nama`   VARCHAR(120) NOT NULL DEFAULT \'\',
       `divisi`       VARCHAR(16)  NOT NULL DEFAULT \'\',
       `posisi`       VARCHAR(60)  NOT NULL DEFAULT \'\',
       `skill`        VARCHAR(255) NOT NULL DEFAULT \'\',
       `status`       VARCHAR(16)  NOT NULL DEFAULT \'AKTIF\',
       `catatan`      VARCHAR(255) NOT NULL DEFAULT \'\',
       `dibuat_at`    BIGINT       NOT NULL DEFAULT 0,
       `dibuat_oleh`  VARCHAR(120) NOT NULL DEFAULT \'\',
       `updated_at`   BIGINT       NOT NULL DEFAULT 0,
       `updated_oleh` VARCHAR(120) NOT NULL DEFAULT \'\',
       UNIQUE KEY `uq_pekerja_hp` (`no_hp`),
       KEY `idx_pekerja_status` (`status`),
       KEY `idx_pekerja_divisi` (`divisi`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS `dw_ajuan` (
       `id`          VARCHAR(32)  NOT NULL PRIMARY KEY,
       `dw_id`       VARCHAR(32)  NOT NULL,
       `tgl`         DATE         NOT NULL,
       `jam_mulai`   VARCHAR(5)   NOT NULL DEFAULT \'\',
       `jam_selesai` VARCHAR(5)   NOT NULL DEFAULT \'\',
       `divisi`      VARCHAR(16)  NOT NULL DEFAULT \'\',
       `posisi`      VARCHAR(60)  NOT NULL DEFAULT \'\',
       `catatan`     VARCHAR(255) NOT NULL DEFAULT \'\',
       `status`      VARCHAR(16)  NOT NULL DEFAULT \'MENUNGGU\',
       `dibuat_at`   BIGINT       NOT NULL DEFAULT 0,
       `dibuat_oleh` VARCHAR(120) NOT NULL DEFAULT \'\',
       `putus_at`    BIGINT       NOT NULL DEFAULT 0,
       `putus_oleh`  VARCHAR(120) NOT NULL DEFAULT \'\',
       `putus_nota`  VARCHAR(255) NOT NULL DEFAULT \'\',
       `hadir`       VARCHAR(10)  NOT NULL DEFAULT \'\',
       `hadir_nota`  VARCHAR(255) NOT NULL DEFAULT \'\',
       `hadir_oleh`  VARCHAR(120) NOT NULL DEFAULT \'\',
       `hadir_at`    BIGINT       NOT NULL DEFAULT 0,
       UNIQUE KEY `uq_ajuan_orang_tgl` (`dw_id`, `tgl`),
       KEY `idx_ajuan_tgl` (`tgl`),
       KEY `idx_ajuan_status` (`status`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
  /* Tabel yang sudah terlanjur dibuat masih memakai nama lama (nilai_*) dan
     tidak akan berubah oleh CREATE TABLE IF NOT EXISTS. Tiga kolom di bawah
     ditambahkan agar pemasangan lama ikut punya bentuk yang baru. Kolom
     `nilai*` yang lama sengaja TIDAK di-DROP: menghapus kolom tidak pernah
     bisa dibatalkan, sedangkan membiarkannya menganggur tidak merugikan apa
     pun karena semua kueri di sini menyebut kolomnya satu per satu. */
  pastikan_kolom($pdo, 'dw_ajuan', 'hadir_nota', "VARCHAR(255) NOT NULL DEFAULT ''");
  pastikan_kolom($pdo, 'dw_ajuan', 'hadir_oleh', "VARCHAR(120) NOT NULL DEFAULT ''");
  pastikan_kolom($pdo, 'dw_ajuan', 'hadir_at',   "BIGINT       NOT NULL DEFAULT 0");
  /* Tujuan pembayaran dipecah tiga kolom, bukan satu teks bebas seperti
     `bank` yang lama. Alasannya bukan kerapian: halaman Pembayaran
     MENGGABUNGKAN orang yang tujuannya sama supaya sekali transfer bisa
     untuk beberapa orang, dan penggabungan itu mustahil kalau nomornya
     ditulis "BCA 1234", "bca-1234", dan "1234 (BCA)" oleh tiga orang yang
     berbeda. Kolom `bank` yang lama TIDAK di-DROP: isinya masih ditampilkan
     sebagai keterangan sampai HR sempat memisahnya sendiri. */
  pastikan_kolom($pdo, 'dw_pekerja', 'bayar_jenis', "VARCHAR(16)  NOT NULL DEFAULT 'BANK'");
  pastikan_kolom($pdo, 'dw_pekerja', 'bayar_nomor', "VARCHAR(60)  NOT NULL DEFAULT ''");
  pastikan_kolom($pdo, 'dw_pekerja', 'bayar_nama',  "VARCHAR(120) NOT NULL DEFAULT ''");
  /* PERMINTAAN DW — head meminta, HRD memenuhi.
     ---------------------------------------------------------------------
     Bedanya dengan `dw_ajuan` mendasar: baris di sini BELUM PUNYA ORANG.
     Isinya "divisi X butuh 3 orang tanggal sekian, jam sekian" — dan itu
     memang bentuk pertanyaannya di lapangan. Head tahu berapa orang yang ia
     butuhkan dan jam berapa; siapa orangnya urusan HRD, yang memegang talent
     pool, tahu siapa yang sudah dipakai di divisi lain hari itu, dan yang
     menanggung akibat uangnya.

     Memaksa head menyebut nama sejak awal (bentuk lama) membuat dua hal
     buruk: head menebak-nebak siapa yang senggang, dan bentrok antar divisi
     baru ketahuan di antrean HRD saat orangnya sudah dijanjikan.

     `terpenuhi` TIDAK disimpan sebagai kolom — ia dihitung dari jumlah baris
     `dw_ajuan` yang menunjuk ke sini. Angka yang disimpan dua kali pasti
     berbeda suatu saat, dan yang salah selalu yang jarang dilihat. */
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS `dw_permintaan` (
       `id`          VARCHAR(32)  NOT NULL PRIMARY KEY,
       `divisi`      VARCHAR(16)  NOT NULL DEFAULT \'\',
       `tgl`         DATE         NOT NULL,
       `jam_mulai`   VARCHAR(5)   NOT NULL DEFAULT \'\',
       `jam_selesai` VARCHAR(5)   NOT NULL DEFAULT \'\',
       `posisi`      VARCHAR(60)  NOT NULL DEFAULT \'\',
       `jumlah`      INT          NOT NULL DEFAULT 1,
       `catatan`     VARCHAR(255) NOT NULL DEFAULT \'\',
       `status`      VARCHAR(16)  NOT NULL DEFAULT \'MENUNGGU\',
       `dibuat_at`   BIGINT       NOT NULL DEFAULT 0,
       `dibuat_oleh` VARCHAR(120) NOT NULL DEFAULT \'\',
       `putus_at`    BIGINT       NOT NULL DEFAULT 0,
       `putus_oleh`  VARCHAR(120) NOT NULL DEFAULT \'\',
       `putus_nota`  VARCHAR(255) NOT NULL DEFAULT \'\',
       KEY `idx_minta_tgl` (`tgl`),
       KEY `idx_minta_status` (`status`),
       KEY `idx_minta_divisi` (`divisi`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
  /* Penghubung penugasan ke permintaannya. Kosong = ajuan yang dibuat
     langsung (head menunjuk orangnya sendiri, atau HRD menjadwalkan biasa). */
  pastikan_kolom($pdo, 'dw_ajuan', 'permintaan_id', "VARCHAR(32) NOT NULL DEFAULT ''");

  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS `dw_setting` (
       `id`         TINYINT UNSIGNED NOT NULL PRIMARY KEY,
       `data`       LONGTEXT         NOT NULL,
       `updated_at` BIGINT           NOT NULL DEFAULT 0,
       `updated_by` VARCHAR(120)     NOT NULL DEFAULT \'\'
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
  $sudah = true;
}

/* ==================== SIAPA YANG MEMANGGIL ====================
   SATU jenis pemakai saja: staf Office, dibuktikan lewat token sesi Office
   ke account-api (whoami), server-ke-server.

   Daily worker tidak punya akun dan tidak pernah memanggil API ini — lihat
   bagian TIDAK ADA JALUR MASUK UNTUK DW di bawah. */

/* Staf Office yang punya akses modul ini, atau null. Akses modulnya ikut
   diperiksa DI SINI — bukan cuma "token sah": akun Office yang tidak dicentang
   modul DW tetap punya token yang sah untuk modul lain, dan tanpa baris ini
   ia bisa membaca seluruh talent pool lewat token itu. */
function dw_office($body = null) {
  $u = sesi_user($body);
  if (!$u) return null;
  return sesi_punya_modul($u, 'dw') ? $u : null;
}
function dw_admin($u) { return sesi_admin_modul($u, 'dw'); }

/* Head divisi. Datang dari whoami (`headDivisi`) — account-api yang
   menanyakannya ke modul Jadwal, jadi modul ini tidak perlu satu perjalanan
   server-ke-server lagi untuk pertanyaan yang sama.

   HEAD BOLEH MELIHAT SELURUH ISI MODUL INI, termasuk nomor HP talent pool dan
   daftar pembayaran. Itu keputusan pemiliknya, dan bukan keputusan setengah:
   head-lah yang mengajukan kebutuhan DW divisinya, dan menyembunyikan separuh
   layar dari orang yang diminta memakainya cuma membuat ia menelepon HR untuk
   hal yang seharusnya bisa ia lihat sendiri.

   Yang TIDAK ikut: MEMUTUSKAN. Menyetujui ajuan berarti mengeluarkan uang, dan
   itu tetap HRD. Lihat wajib_hrd() di api.php. */
function dw_head($u) {
  if (!$u) return false;
  $h = (isset($u['headDivisi']) && is_array($u['headDivisi'])) ? $u['headDivisi'] : array();
  return count($h) > 0;
}
/* Boleh melihat isi penuh: HRD atau head. */
function dw_boleh_lihat($u) { return dw_hrd($u) || dw_head($u); }

/* Berhak MEMUTUSKAN di modul ini — inilah "HRD" yang dimaksud.
   Aturannya SAMA PERSIS dengan isHR() di deploy/dw/index.html, termasuk
   bagian yang mudah terlewat: daftar kosong berarti SEMUA staf Office yang
   punya akses modul dianggap berhak. Itu disengaja, dan menyalinnya ke sini
   wajib — kalau backend lebih ketat daripada layar, pemasangan yang sudah
   jalan (daftarnya memang masih kosong) mendadak mengunci semua orang di
   luar begitu versi ini mendarat, termasuk admin yang seharusnya mengisi
   daftarnya. */
function dw_hrd($u) {
  if (!$u) return false;
  if (dw_admin($u)) return true;
  $st = baca_setting();
  $hr = (is_object($st) && isset($st->hr) && is_array($st->hr)) ? $st->hr : array();
  if (!count($hr)) return true;
  foreach ($hr as $id) { if ((string)$id === (string)$u['id']) return true; }
  return false;
}



/* ==================== BACA ====================
   Bentuk balasan sengaja pendek (kunci satu-dua huruf untuk ajuan) —
   halaman kalender bisa memuat sebulan × puluhan DW sekaligus.

   Pekerja dikirim SELURUHNYA tanpa batas tanggal: talent pool-nya berukuran
   puluhan, bukan ribuan, dan hampir setiap halaman butuh namanya untuk
   menerjemahkan `dw_id` di ajuan. Yang dibatasi tanggal hanya ajuan. */
/* $penuh = pemanggilnya boleh melihat isi penuh (HRD atau head divisi). Yang
   TIDAK berhak tetap menerima daftar orangnya — Dashboard dan Kalender DW
   memang terbuka untuk seluruh staf yang punya akses modul, dan keduanya butuh
   nama untuk menerjemahkan `dw_id` — tapi TANPA nomor HP dan tanpa tujuan
   pembayaran.

   Disaring DI SINI, bukan di layar. Sebelumnya satu GET memulangkan nomor HP
   seluruh talent pool kepada siapa pun; layar staf non-HR memang tidak
   menampilkannya (lihat `p&&boleh` di bukaAjuan), tapi datanya sudah terlanjur
   sampai di perangkatnya dan tinggal dibuka di tab Network. Yang tidak dikirim
   tidak bisa bocor. */
function baca_semua($dari, $sampai, $penuh = true) {
  $pdo = db();
  pastikan_tabel($pdo);

  $pekerja = array();
  $q = $pdo->query(
    'SELECT `id`,`nama`,`no_hp`,`gender`,`area`,`bank`,
            `bayar_jenis`,`bayar_nomor`,`bayar_nama`,`divisi`,`posisi`,
            `skill`,`status`,`catatan`,`dibuat_at`
       FROM `dw_pekerja` ORDER BY `nama`');
  foreach ($q->fetchAll() as $r) {
    $baris = array(
      'id' => $r['id'], 'nama' => $r['nama'],
      'gender' => $r['gender'], 'area' => $r['area'],
      'divisi' => $r['divisi'], 'posisi' => $r['posisi'],
      'skill' => $r['skill'], 'status' => $r['status'],
      'dibuatAt' => (int)$r['dibuat_at'],
    );
    if ($penuh) {
      /* Hanya untuk yang berhak memutuskan: nomor HP, tujuan transfer, dan
         catatan HR tentang orangnya. Ketiganya tidak dipakai satu pun halaman
         yang terbuka untuk staf biasa. */
      $baris['hp']         = $r['no_hp'];
      $baris['bank']       = $r['bank'];
      $baris['bayarJenis'] = isset($r['bayar_jenis']) ? $r['bayar_jenis'] : 'BANK';
      $baris['bayarNomor'] = isset($r['bayar_nomor']) ? $r['bayar_nomor'] : '';
      $baris['bayarNama']  = isset($r['bayar_nama'])  ? $r['bayar_nama']  : '';
      $baris['catatan']    = $r['catatan'];
    }
    $pekerja[] = $baris;
  }

  /* Ajuan: yang di dalam rentang tanggal + SEMUA yang masih MENUNGGU.
     Yang menunggu wajib selalu kelihatan oleh HR walau tanggalnya di luar
     bulan yang sedang dibuka — justru itu yang perlu diputuskan lebih dulu.
     Sama seperti pengajuan di modul Jadwal. */
  $a = tgl_valid($dari); $b = tgl_valid($sampai);
  if ($a !== '' && $b !== '') {
    $st = $pdo->prepare(
      'SELECT * FROM `dw_ajuan`
        WHERE (`tgl` BETWEEN :a AND :b) OR `status` = \'MENUNGGU\'
        ORDER BY `tgl`');
    $st->execute(array(':a' => $a, ':b' => $b));
  } else {
    $st = $pdo->query('SELECT * FROM `dw_ajuan` ORDER BY `tgl`');
  }
  $ajuan = array();
  foreach ($st->fetchAll() as $r) $ajuan[] = bentuk_ajuan($r);

  /* Permintaan: yang di dalam rentang + SEMUA yang masih MENUNGGU, aturan
     yang sama dengan ajuan di atas dan alasannya sama — yang menunggu wajib
     selalu kelihatan HRD walau tanggalnya di luar bulan yang sedang dibuka. */
  $minta = array();
  if ($a !== '' && $b !== '') {
    $st = $pdo->prepare(
      'SELECT * FROM `dw_permintaan`
        WHERE (`tgl` BETWEEN :a AND :b) OR `status` = \'MENUNGGU\'
        ORDER BY `tgl`');
    $st->execute(array(':a' => $a, ':b' => $b));
  } else {
    $st = $pdo->query('SELECT * FROM `dw_permintaan` ORDER BY `tgl`');
  }
  foreach ($st->fetchAll() as $r) $minta[] = bentuk_permintaan($r);

  return array('setting' => baca_setting(), 'pekerja' => $pekerja,
               'ajuan' => $ajuan, 'permintaan' => $minta);
}

function bentuk_permintaan($r) {
  return array(
    'id' => $r['id'], 'divisi' => $r['divisi'], 'tgl' => $r['tgl'],
    'm' => $r['jam_mulai'], 's' => $r['jam_selesai'],
    'posisi' => $r['posisi'], 'jumlah' => (int)$r['jumlah'],
    'catatan' => $r['catatan'], 'status' => $r['status'],
    'dibuatAt' => (int)$r['dibuat_at'], 'dibuatOleh' => $r['dibuat_oleh'],
    'putusAt' => (int)$r['putus_at'], 'putusOleh' => $r['putus_oleh'],
    'putusNota' => $r['putus_nota'],
  );
}

/* Peran pemanggil, dibalas bersama datanya.
   ---------------------------------------------------------------------
   Layar perlu tahu tiga hal untuk menggambar dirinya: boleh memutuskan
   (HRD), boleh melihat isi penuh (HRD atau head), dan boleh mengubah
   pengaturan (admin modul). Ketiganya DIHITUNG DI SERVER dan dikirim jadi,
   bukan disimpulkan ulang di peramban dari daftar modul & setting —
   dua tempat yang menyimpulkan hal yang sama pasti akan berbeda pendapat
   suatu saat, dan yang berbeda pendapat soal hak akses tidak pernah
   melapor. Layar cuma menggambar apa yang server sudah putuskan. */
function peran_pemanggil($u) {
  return array(
    'hrd'   => dw_hrd($u) ? 1 : 0,
    'head'  => dw_head($u) ? 1 : 0,
    'lihat' => dw_boleh_lihat($u) ? 1 : 0,
    'admin' => dw_admin($u) ? 1 : 0,
    'nama'  => ($u && isset($u['name'])) ? (string)$u['name'] : '',
  );
}

function bentuk_ajuan($r) {
  return array(
    'id' => $r['id'], 'dwId' => $r['dw_id'], 'tgl' => $r['tgl'],
    'm' => $r['jam_mulai'], 's' => $r['jam_selesai'],
    'divisi' => $r['divisi'], 'posisi' => $r['posisi'],
    'catatan' => $r['catatan'], 'status' => $r['status'],
    'dibuatAt' => (int)$r['dibuat_at'], 'dibuatOleh' => $r['dibuat_oleh'],
    'putusAt' => (int)$r['putus_at'], 'putusOleh' => $r['putus_oleh'],
    'putusNota' => $r['putus_nota'],
    /* isset() karena kolomnya berganti nama 5 Agustus 2026 (nilai_* -> hadir_*):
       baris dari tabel yang belum sempat di-ALTER tidak punya kuncinya. */
    'hadir' => $r['hadir'],
    'hadirNota' => isset($r['hadir_nota']) ? $r['hadir_nota'] : '',
    'hadirOleh' => isset($r['hadir_oleh']) ? $r['hadir_oleh'] : '',
  );
}

function baca_setting() {
  try {
    $row = db()->query('SELECT `data` FROM `dw_setting` WHERE `id`=1')->fetch();
    if (!$row || $row['data'] === null || $row['data'] === '') return new stdClass();
    $v = json_decode($row['data']);
    return $v === null ? new stdClass() : $v;
  } catch (Throwable $e) {
    return new stdClass();   // tabel belum ada — aplikasi mulai dari default
  }
}

/* ==================== JEMBATAN KE MODUL JADWAL SHIFT ====================
   INI endpoint yang membuat "tersinkronisasi dengan Jadwal Shift" itu nyata.
   Modul Jadwal memanggilnya tiap kali memuat rentang tanggal, lalu
   menggambar barisnya di bawah kru tetap — disorot dan dipisah.

   Yang dikirim SENGAJA minimal: hanya yang dibutuhkan untuk menggambar satu
   sel kalender. Tidak ada no_hp, tidak ada PIN, tidak ada catatan HR. Modul
   Jadwal dibuka oleh seluruh kru yang punya akses jadwal, dan nomor telepon
   puluhan pekerja harian tidak ada urusannya dengan siapa masuk hari Rabu.

   Hanya DISETUJUI yang keluar. Yang masih MENUNGGU belum tentu jadi, dan
   menampilkannya di kalender membuat head mengira lubangnya sudah terisi —
   kesalahan yang paling mahal di modul ini karena kelihatan meyakinkan. */
function jadwal_dw($dari, $sampai) {
  $pdo = db();
  pastikan_tabel($pdo);
  $a = tgl_valid($dari); $b = tgl_valid($sampai);
  if ($a === '' || $b === '') throw new Exception('jadwalDW butuh dari & sampai (YYYY-MM-DD)');
  if ($b < $a) { $t = $a; $a = $b; $b = $t; }

  $st = $pdo->prepare(
    'SELECT j.`id`, j.`dw_id`, j.`tgl`, j.`jam_mulai`, j.`jam_selesai`,
            j.`divisi`, j.`posisi`, j.`hadir`, p.`nama`, p.`status` AS st_orang
       FROM `dw_ajuan` j
       LEFT JOIN `dw_pekerja` p ON p.`id` = j.`dw_id`
      WHERE j.`status` = \'DISETUJUI\' AND j.`tgl` BETWEEN :a AND :b
      ORDER BY p.`nama`, j.`tgl`');
  $st->execute(array(':a' => $a, ':b' => $b));

  $rows = array();
  foreach ($st->fetchAll() as $r) {
    $rows[] = array(
      'id' => $r['id'], 'dwId' => $r['dw_id'],
      /* Pekerja yang barisnya sudah dihapus tapi ajuannya tertinggal tetap
         digambar dengan nama pengganti, bukan dibuang diam-diam: sel yang
         hilang dari kalender jauh lebih berbahaya daripada nama yang aneh. */
      'nama' => ($r['nama'] === null || $r['nama'] === '') ? '(DW dihapus)' : $r['nama'],
      'divisi' => $r['divisi'], 'posisi' => $r['posisi'],
      'tgl' => $r['tgl'], 'm' => $r['jam_mulai'], 's' => $r['jam_selesai'],
      'hadir' => $r['hadir'],
    );
  }
  return array('rows' => $rows, 'dari' => $a, 'sampai' => $b);
}

/* ==================== PEKERJA ==================== */
function simpan_pekerja($row, $by) {
  $pdo = db();
  pastikan_tabel($pdo);
  $row = (array)$row;

  $id   = pot(isset($row['id']) ? $row['id'] : '', 32);
  $nama = pot(isset($row['nama']) ? $row['nama'] : '', 120);
  $hp   = hp_normal(isset($row['hp']) ? $row['hp'] : '');
  if ($nama === '') throw new Exception('Nama DW wajib diisi');
  if ($hp === '')   throw new Exception('No. HP wajib diisi — nomor inilah identitas DW, dan lewat itu HR mengabarinya');

  /* Bentrok nomor dijawab dengan kalimat yang bisa ditindaklanjuti, bukan
     dengan SQLSTATE 23000 yang tidak berarti apa-apa buat staf HR. */
  $cek = $pdo->prepare('SELECT `id`,`nama` FROM `dw_pekerja` WHERE `no_hp`=:h');
  $cek->execute(array(':h' => $hp));
  $bentrok = $cek->fetch();
  if ($bentrok && $bentrok['id'] !== $id) {
    throw new Exception('No. HP ' . $hp . ' sudah terdaftar atas nama ' . $bentrok['nama'] . '. Sunting data itu, jangan buat baru.');
  }

  $baru = ($id === '');
  if ($baru) $id = id_baru('DW');

  /* Hanya dua status. Tiga label lama (PANTAU/BLOKIR/…) bukan fakta melainkan
     penilaian, dan batas antar mereka tidak pernah jelas — "Pantau" vs
     "Blokir" berakhir jadi perdebatan label, sedangkan "Blokir" dan
     "Tidak Aktif" sama saja akibatnya. Yang perlu diputuskan HR cuma satu:
     orang ini masih dipakai atau tidak. Baris lama dipetakan, bukan ditolak. */
  $status = strtoupper(pot(isset($row['status']) ? $row['status'] : 'AKTIF', 16));
  if ($status === 'PANTAU') $status = 'AKTIF';      // dulu masih boleh dijadwalkan
  if ($status === 'BLOKIR') $status = 'NONAKTIF';   // dulu tidak boleh
  if (!in_array($status, array('AKTIF', 'NONAKTIF'), true)) $status = 'AKTIF';

  /* PIN TIDAK LAGI DITULIS MAUPUN DIBACA. Gerbang masuk mandiri DW sudah
     dicabut, jadi kolomnya tidak punya arti lagi — dan menulis nilai ke kolom
     yang tidak dipakai siapa pun cuma menyisakan rahasia yang menunggu bocor.
     Kolomnya sendiri sengaja tidak di-DROP; lihat alasannya di bawah. */

  $now = ms();
  $by  = pot($by, 120);
  $arg = array(
    ':id' => $id, ':nm' => $nama, ':hp' => $hp,
    ':g'  => pot(isset($row['gender']) ? $row['gender'] : '', 10),
    ':ar' => pot(isset($row['area']) ? $row['area'] : '', 80),
    ':bk' => pot(isset($row['bank']) ? $row['bank'] : '', 120),
    ':bj' => bayar_jenis_sah(isset($row['bayarJenis']) ? $row['bayarJenis'] : ''),
    ':bn' => pot(isset($row['bayarNomor']) ? $row['bayarNomor'] : '', 60),
    ':ba' => pot(isset($row['bayarNama']) ? $row['bayarNama'] : '', 120),
    ':dv' => pot(isset($row['divisi']) ? $row['divisi'] : '', 16),
    ':ps' => pot(isset($row['posisi']) ? $row['posisi'] : '', 60),
    ':sk' => pot(isset($row['skill']) ? $row['skill'] : '', 255),
    ':st' => $status,
    ':ct' => pot(isset($row['catatan']) ? $row['catatan'] : '', 255),
    ':t'  => $now, ':by' => $by,
  );

  if ($baru) {
    /* `:t2`/`:by2` BUKAN kelebihan — koneksi ini memakai
       PDO::ATTR_EMULATE_PREPARES => false, jadi prepared statement-nya asli
       MySQL dan penanda bernama diikat BERDASARKAN POSISI. Satu nama yang
       dipakai dua kali (dulu `:t` untuk dibuat_at DAN updated_at) membuat
       jumlah parameter tidak cocok, dan PDO menolaknya dengan
       "SQLSTATE[HY093]: Invalid parameter number" — pesan yang sama sekali
       tidak menyebut nama kolom mana pun. Tiap penanda harus unik. */
    $arg[':t2']  = $now;
    $arg[':by2'] = $by;
    $st = $pdo->prepare(
      'INSERT INTO `dw_pekerja`
         (`id`,`nama`,`no_hp`,`gender`,`area`,`bank`,
          `bayar_jenis`,`bayar_nomor`,`bayar_nama`,`divisi`,`posisi`,`skill`,
          `status`,`catatan`,`dibuat_at`,`dibuat_oleh`,`updated_at`,`updated_oleh`)
       VALUES (:id,:nm,:hp,:g,:ar,:bk,:bj,:bn,:ba,:dv,:ps,:sk,:st,:ct,:t,:by,:t2,:by2)');
    $st->execute($arg);
  } else {
    $st = $pdo->prepare(
      'UPDATE `dw_pekerja` SET
         `nama`=:nm, `no_hp`=:hp, `gender`=:g, `area`=:ar, `bank`=:bk,
         `bayar_jenis`=:bj, `bayar_nomor`=:bn, `bayar_nama`=:ba,
         `divisi`=:dv, `posisi`=:ps, `skill`=:sk, `status`=:st, `catatan`=:ct,
         `updated_at`=:t, `updated_oleh`=:by
       WHERE `id`=:id');
    $st->execute($arg);
  }
  return array('saved' => true, 'id' => $id, 'baru' => $baru);
}

/* Menghapus pekerja TIDAK menghapus ajuannya. Riwayat kerja dan kehadiran
   adalah catatan yang sudah terjadi; membuangnya bersama orangnya membuat
   rekap bulan lalu berubah angka setelah HR merapikan daftar. Ajuan yang
   yatim tetap tergambar dengan nama "(DW dihapus)" — lihat jadwal_dw. */
function hapus_pekerja($id) {
  $pdo = db();
  pastikan_tabel($pdo);
  $st = $pdo->prepare('DELETE FROM `dw_pekerja` WHERE `id`=:id');
  $st->execute(array(':id' => s($id)));
  return array('deleted' => true, 'id' => s($id));
}

/* ==================== TIDAK ADA JALUR MASUK UNTUK DW ====================
   Daily worker TIDAK punya akun dan TIDAK pernah membuka sistem ini.

   Sampai 14 Agustus 2026 ada gerbang no HP + PIN di sini: DW mengajukan
   tanggal kerjanya sendiri dari HP-nya, HR menyetujui. Seluruh jalur itu
   DICABUT — bukan disembunyikan — karena alurnya memang bukan itu:

     head  mengajukan "hari ini butuh N orang, jam sekian"
     HRD   menyetujui lalu MENUNJUK siapa yang dipakai

   Orangnya diberi tahu lewat WhatsApp seperti biasa, dan tidak pernah perlu
   membuka apa pun. Yang ikut hilang: loginDW, logoutDW, ajuanSaya, tabel
   `dw_sesi`, dan pembatas percobaan PIN (`dw_login_gagal`) — pembatas itu
   lahir hanya untuk menjaga gerbang yang sekarang sudah tidak ada.

   Kolom `pin` di `dw_pekerja` SENGAJA TIDAK DI-DROP. Menghapus kolom tidak
   bisa dibatalkan, sedangkan membiarkannya menganggur tidak merugikan apa
   pun: semua kueri di berkas ini menyebut kolomnya satu per satu, dan `pin`
   tidak lagi ada di antaranya — tidak dibaca, tidak ditulis, tidak dikirim.
   ======================================================================== */

/* ==================== AJUAN ====================
   Sama seperti pengajuan di modul Jadwal: endpoint pembuatan SELALU memaksa
   status MENUNGGU, apa pun yang dikirim client. Kalau tidak, siapa pun yang
   bisa memanggil API bisa mengirim ajuannya sendiri dengan status DISETUJUI
   dan langsung muncul di kalender tanpa pernah dilihat HR. */
/* Menit sejak 00:00. Sepasang dengan menitJamDW() di frontend. */
function menit_jam($v) {
  $p = explode(':', (string)$v);
  return ((int)(isset($p[0]) ? $p[0] : 0)) * 60 + ((int)(isset($p[1]) ? $p[1] : 0));
}
/* Panjang shift dalam menit. Selesai yang lebih kecil atau sama dengan mulai
   berarti lewat tengah malam (18:00-02:00 = 480 menit, bukan -960). Aturan
   yang sama dengan durasiJam() di frontend — dua tempat yang berbeda pendapat
   soal shift malam akan menghitung upah berbeda pula. */
function durasi_menit($m, $s) {
  $a = menit_jam($m); $b = menit_jam($s);
  if ($b <= $a) $b += 1440;
  return $b - $a;
}
/* Tanggal ISO digeser n hari. */
function geser_hari($iso, $n) {
  $t = strtotime($iso . ' 12:00:00');
  return $t === false ? $iso : date('Y-m-d', $t + $n * 86400);
}

function simpan_ajuan($row, $by) {
  $pdo = db();
  pastikan_tabel($pdo);
  $row = (array)$row;

  $dw  = pot(isset($row['dwId']) ? $row['dwId'] : '', 32);
  $tgl = tgl_valid(isset($row['tgl']) ? $row['tgl'] : '');
  $m   = jam_valid(isset($row['m']) ? $row['m'] : '');
  $sj  = jam_valid(isset($row['s']) ? $row['s'] : '');
  if ($dw === '' || $tgl === '') throw new Exception('Ajuan butuh DW dan tanggal');
  if ($m === '' || $sj === '')   throw new Exception('Jam mulai dan jam selesai wajib diisi');

  $orang = $pdo->prepare('SELECT `nama`,`status`,`divisi`,`posisi` FROM `dw_pekerja` WHERE `id`=:id');
  $orang->execute(array(':id' => $dw));
  $o = $orang->fetch();
  if (!$o) throw new Exception('DW tidak ditemukan: ' . $dw);
  if ($o['status'] === 'NONAKTIF' || $o['status'] === 'BLOKIR') {
    throw new Exception($o['nama'] . ' berstatus tidak aktif dan tidak bisa dijadwalkan.');
  }

  /* Divisi/posisi ikut disalin ke barisnya, bukan selalu diambil dari
     master. Seorang DW bisa dipanggil ke Bar minggu ini dan Kitchen minggu
     depan; kalau kalender membaca divisi dari master, riwayat lama ikut
     berpindah kolom setiap kali HR mengubah divisi utamanya. */
  $divisi = pot(isset($row['divisi']) && s($row['divisi']) !== '' ? $row['divisi'] : $o['divisi'], 16);
  $posisi = pot(isset($row['posisi']) && s($row['posisi']) !== '' ? $row['posisi'] : $o['posisi'], 60);

  /* ================= BENTROK LINTAS DIVISI =================
     Kunci unik (dw_id, tgl) berarti satu orang cuma punya SATU baris per
     hari — dan ON DUPLICATE KEY di bawah menimpanya tanpa bertanya. Untuk
     head yang mengubah ajuannya sendiri itu memang yang diinginkan.

     Yang TIDAK diinginkan: head Kitchen memanggil ARIF untuk 15 Agustus,
     padahal head Bar sudah memanggil ARIF di tanggal yang sama dan sudah
     disetujui. Yang terjadi bukan galat, bukan pula dua baris: baris Bar
     BERUBAH jadi baris Kitchen dan turun ke MENUNGGU. Head Bar tidak
     diberi tahu apa pun; ia baru sadar malam itu, saat orangnya tidak
     datang. Satu orang tidak bisa bekerja di dua divisi pada hari yang
     sama, jadi ini memang bentrok — dan bentrok harus berhenti di sini.

     Kenapa di backend, padahal frontend sudah punya peringatan serupa:
     frontend cuma melihat ajuan yang termuat di rentang layarnya. Ajuan
     divisi lain di luar rentang itu TIDAK ada di memorinya, jadi
     peringatannya diam. Dua head yang menyimpan berdekatan juga sama —
     keduanya membaca keadaan sebelum yang lain menulis. Backend adalah
     satu-satunya tempat yang selalu melihat baris yang sebenarnya.

     Bukan larangan mutlak: `timpa` melewatkannya, dipakai frontend
     sesudah orangnya membaca konfirmasi yang menyebut divisi lawannya.
     Yang DITOLAK dan DIBATALKAN tidak dihitung — menimpanya justru yang
     diinginkan. */
  $timpa = !empty($row['timpa']);
  $lama = $pdo->prepare('SELECT `id`,`divisi`,`posisi`,`jam_mulai`,`jam_selesai`,`status`
                           FROM `dw_ajuan` WHERE `dw_id`=:dw AND `tgl`=:tg');
  $lama->execute(array(':dw' => $dw, ':tg' => $tgl));
  $L = $lama->fetch();
  if (!$timpa && $L && ($L['status'] === 'MENUNGGU' || $L['status'] === 'DISETUJUI')
      && $L['divisi'] !== '' && $L['divisi'] !== $divisi) {
    return array('saved' => false, 'bentrok' => array(
      'nama'    => $o['nama'],
      'tgl'     => $tgl,
      'divisi'  => $L['divisi'],      // divisi yang SUDAH memesan
      'posisi'  => $L['posisi'],
      'm'       => $L['jam_mulai'],
      's'       => $L['jam_selesai'],
      'status'  => $L['status'],
      'divisiBaru' => $divisi,
      'mBaru'   => $m,
      'sBaru'   => $sj,
    ));
  }

  /* ---- Bentrok yang MELEWATI TENGAH MALAM ----
     Guard di atas hanya melihat tanggal yang sama, dan kunci (dw_id, tgl)
     memang menjamin satu baris per hari. Yang TIDAK dijamin siapa pun:
     ARIF Bar 15 Agustus 18:00-02:00 dan ARIF Kitchen 16 Agustus 01:00-08:00
     adalah DUA baris dengan tanggal berbeda — keduanya sah menurut kunci
     unik, keduanya lolos guard di atas, dan keduanya bertindih satu jam
     penuh di dunia nyata. Orangnya baru pulang jam 2 pagi.

     Karena itu tetangganya ikut dibaca: baris H-1 yang jamnya tumpah ke
     hari ini, dan baris H+1 yang tersenggol kalau ajuan ini sendiri yang
     tumpah. Berlaku juga untuk divisi yang SAMA — 18:00-02:00 lalu
     01:00-08:00 tetap mustahil walau head-nya satu orang. */
  $ms = menit_jam($m); $ns = $ms + durasi_menit($m, $sj);   // menit relatif hari ini
  $tet = $pdo->prepare('SELECT `tgl`,`divisi`,`posisi`,`jam_mulai`,`jam_selesai`,`status`
                          FROM `dw_ajuan`
                         WHERE `dw_id`=:dw AND `tgl` IN (:t1,:t2)
                           AND (`status`=\'MENUNGGU\' OR `status`=\'DISETUJUI\')');
  $tet->execute(array(':dw' => $dw, ':t1' => geser_hari($tgl, -1), ':t2' => geser_hari($tgl, 1)));
  foreach ($tet->fetchAll() as $T) {
    /* Offset hari: baris kemarin dimulai 1440 menit lebih awal, baris besok
       1440 menit lebih lambat. Dengan begitu keduanya bisa dibandingkan di
       satu garis waktu yang sama. */
    $off = ($T['tgl'] < $tgl) ? -1440 : 1440;
    $as = menit_jam($T['jam_mulai']) + $off;
    $ae = $as + durasi_menit($T['jam_mulai'], $T['jam_selesai']);
    if (max($as, $ms) < min($ae, $ns)) {
      if ($timpa) break;   // sudah dibaca & disetujui orangnya di layar
      return array('saved' => false, 'bentrok' => array(
        'nama'    => $o['nama'],
        'tgl'     => $T['tgl'],
        'divisi'  => $T['divisi'],
        'posisi'  => $T['posisi'],
        'm'       => $T['jam_mulai'],
        's'       => $T['jam_selesai'],
        'status'  => $T['status'],
        'divisiBaru' => $divisi,
        'mBaru'   => $m,
        'sBaru'   => $sj,
        'lintasHari' => true,
        'tglBaru' => $tgl,
      ));
    }
  }


  $id = pot(isset($row['id']) ? $row['id'] : '', 32);
  if ($id === '') $id = id_baru('AJ');

  /* ON DUPLICATE KEY di sini menangani dua kunci sekaligus: PRIMARY (id)
     saat ajuan yang sama disunting, dan uq_ajuan_orang_tgl saat orang yang
     sama mengirim ulang untuk tanggal yang sama. Keduanya berakhir sebagai
     SATU baris yang kembali MENUNGGU — itulah yang diinginkan: ajuan yang
     diubah harus disetujui ulang, tidak boleh diam-diam tetap DISETUJUI
     dengan jam yang sudah berbeda. */
  $st = $pdo->prepare(
    'INSERT INTO `dw_ajuan`
       (`id`,`dw_id`,`tgl`,`jam_mulai`,`jam_selesai`,`divisi`,`posisi`,`catatan`,
        `status`,`dibuat_at`,`dibuat_oleh`)
     VALUES (:id,:dw,:tg,:m,:s,:dv,:ps,:ct,\'MENUNGGU\',:t,:by)
     ON DUPLICATE KEY UPDATE
       `jam_mulai`=VALUES(`jam_mulai`), `jam_selesai`=VALUES(`jam_selesai`),
       `divisi`=VALUES(`divisi`), `posisi`=VALUES(`posisi`),
       `catatan`=VALUES(`catatan`), `status`=\'MENUNGGU\',
       `dibuat_at`=VALUES(`dibuat_at`), `dibuat_oleh`=VALUES(`dibuat_oleh`),
       `putus_at`=0, `putus_oleh`=\'\', `putus_nota`=\'\'');
  $st->execute(array(
    ':id' => $id, ':dw' => $dw, ':tg' => $tgl, ':m' => $m, ':s' => $sj,
    ':dv' => $divisi, ':ps' => $posisi,
    ':ct' => pot(isset($row['catatan']) ? $row['catatan'] : '', 255),
    ':t' => ms(), ':by' => pot($by, 120),
  ));

  /* Baris hasil dibaca ulang: kalau yang terpicu adalah kunci
     (dw_id, tgl), `id` yang benar-benar tersimpan adalah id LAMA, bukan
     yang baru saja dibuat di atas. Frontend perlu id yang asli untuk
     tombol Batal-nya. */
  $ambil = $pdo->prepare('SELECT * FROM `dw_ajuan` WHERE `dw_id`=:dw AND `tgl`=:tg');
  $ambil->execute(array(':dw' => $dw, ':tg' => $tgl));
  $ada = $ambil->fetch();
  return array('saved' => true, 'row' => $ada ? bentuk_ajuan($ada) : null);
}

function putus_ajuan($id, $status, $nota, $by) {
  $pdo = db();
  pastikan_tabel($pdo);
  $id = s($id);
  $status = strtoupper(s($status));
  if (!in_array($status, array('DISETUJUI', 'DITOLAK', 'MENUNGGU', 'BATAL'), true)) {
    throw new Exception('Status putusan tidak dikenal: ' . $status);
  }
  $st = $pdo->prepare(
    'UPDATE `dw_ajuan` SET `status`=:s, `putus_at`=:t, `putus_oleh`=:by, `putus_nota`=:n
      WHERE `id`=:id');
  $st->execute(array(
    ':s' => $status, ':t' => ms(), ':by' => pot($by, 120),
    ':n' => pot($nota, 255), ':id' => $id,
  ));
  if ($st->rowCount() === 0) {
    // rowCount 0 juga terjadi kalau statusnya sudah sama persis — bukan error.
    $ada = $pdo->prepare('SELECT 1 FROM `dw_ajuan` WHERE `id`=:id');
    $ada->execute(array(':id' => $id));
    if (!$ada->fetch()) throw new Exception('Ajuan tidak ditemukan: ' . $id);
  }
  return array('saved' => true, 'id' => $id, 'status' => $status);
}

/* Putusan borongan — HR menyetujui seluruh antrean satu hari sekaligus.
   Satu transaksi supaya tidak pernah berhenti di tengah dan meninggalkan
   separuh hari yang statusnya campur tanpa ada yang sadar. */
function putus_banyak($ids, $status, $nota, $by) {
  if (!is_array($ids) || !count($ids)) return array('saved' => true, 'jumlah' => 0);
  $status = strtoupper(s($status));
  if (!in_array($status, array('DISETUJUI', 'DITOLAK', 'MENUNGGU', 'BATAL'), true)) {
    throw new Exception('Status putusan tidak dikenal: ' . $status);
  }
  $pdo = db();
  pastikan_tabel($pdo);
  $n = 0;
  $pdo->beginTransaction();
  try {
    $st = $pdo->prepare(
      'UPDATE `dw_ajuan` SET `status`=:s, `putus_at`=:t, `putus_oleh`=:by, `putus_nota`=:n
        WHERE `id`=:id');
    foreach ($ids as $id) {
      $st->execute(array(
        ':s' => $status, ':t' => ms(), ':by' => pot($by, 120),
        ':n' => pot($nota, 255), ':id' => s($id),
      ));
      $n++;
    }
    $pdo->commit();
  } catch (Throwable $e) {
    $pdo->rollBack();
    throw $e;
  }
  return array('saved' => true, 'jumlah' => $n, 'status' => $status);
}

function hapus_ajuan($id) {
  $pdo = db();
  pastikan_tabel($pdo);
  $st = $pdo->prepare('DELETE FROM `dw_ajuan` WHERE `id`=:id');
  $st->execute(array(':id' => s($id)));
  return array('deleted' => true, 'id' => s($id));
}

/* ==================== PERMINTAAN DW (head -> HRD) ====================
   DUA CARA head meminta daily worker, dan keduanya memang dipakai:

     1. TUNJUK ORANGNYA LANGSUNG — head sudah tahu siapa yang mau dipakai
        (mis. anak yang minggu lalu bagus dan sudah dihubunginya sendiri).
        Ini lewat simpan_ajuan() biasa; hasilnya baris MENUNGGU yang tinggal
        disetujui HRD. Head TIDAK bisa menyetujui punyanya sendiri.

     2. MINTA JUMLAHNYA SAJA — "Sabtu butuh 3 orang, 16:00–23:00". Head sering
        tidak tahu siapa yang senggang, dan menebak-nebak justru sumber
        bentrok: orang yang sama dijanjikan dua divisi. Yang punya jawabannya
        HRD, yang memegang talent pool. Inilah yang dilayani bagian ini.

   Yang menyambung keduanya: penugasan menghasilkan baris `dw_ajuan` yang sama
   persis bentuknya dengan cara 1, cuma `permintaan_id`-nya terisi. Jadi
   kalender, rekap, dan pembayaran tidak perlu tahu sebuah shift lahir dari
   jalur yang mana — satu bentuk, satu tempat dibaca. */

function permintaan_by_id($id) {
  $pdo = db();
  pastikan_tabel($pdo);
  $st = $pdo->prepare('SELECT * FROM `dw_permintaan` WHERE `id`=:id');
  $st->execute(array(':id' => s($id)));
  $r = $st->fetch();
  return $r ? $r : null;
}

/* Berapa orang yang SUDAH ditugaskan untuk permintaan ini. Dihitung, tidak
   disimpan — lihat alasannya di kepala tabelnya. Yang BATAL/DITOLAK tidak
   ikut: orangnya memang tidak jadi datang, jadi lubangnya terbuka lagi. */
function permintaan_terpenuhi($id) {
  $pdo = db();
  $st = $pdo->prepare(
    'SELECT COUNT(*) c FROM `dw_ajuan`
      WHERE `permintaan_id`=:id AND (`status`=\'MENUNGGU\' OR `status`=\'DISETUJUI\')');
  $st->execute(array(':id' => s($id)));
  $r = $st->fetch();
  return $r ? (int)$r['c'] : 0;
}

function simpan_permintaan($row, $by) {
  $pdo = db();
  pastikan_tabel($pdo);
  $row = (array)$row;

  $tgl = tgl_valid(isset($row['tgl']) ? $row['tgl'] : '');
  $m   = jam_valid(isset($row['m']) ? $row['m'] : '');
  $sj  = jam_valid(isset($row['s']) ? $row['s'] : '');
  $div = pot(isset($row['divisi']) ? $row['divisi'] : '', 16);
  $jml = (int)(isset($row['jumlah']) ? $row['jumlah'] : 0);
  if ($tgl === '')             throw new Exception('Tanggal permintaan wajib diisi');
  if ($m === '' || $sj === '') throw new Exception('Jam mulai dan jam selesai wajib diisi');
  if ($div === '')             throw new Exception('Divisi wajib diisi');
  /* Batas atas ada dengan sengaja. Bukan karena 50 orang mustahil, tapi karena
     angka sebesar itu hampir selalu salah ketik — dan HRD baru menyadarinya
     setelah membuka daftar penugasan berisi lima puluh baris kosong. Kalau
     memang butuh lebih, dua permintaan lebih jujur dibaca. */
  if ($jml < 1 || $jml > 30)   throw new Exception('Jumlah orang harus antara 1 dan 30');

  $id = pot(isset($row['id']) ? $row['id'] : '', 32);
  $baru = ($id === '');
  if ($baru) $id = id_baru('PM');

  $arg = array(
    ':id' => $id, ':dv' => $div, ':tg' => $tgl, ':m' => $m, ':s' => $sj,
    ':ps' => pot(isset($row['posisi']) ? $row['posisi'] : '', 60),
    ':jm' => $jml,
    ':ct' => pot(isset($row['catatan']) ? $row['catatan'] : '', 255),
    ':t' => ms(), ':by' => pot($by, 120),
  );
  if ($baru) {
    $st = $pdo->prepare(
      'INSERT INTO `dw_permintaan`
         (`id`,`divisi`,`tgl`,`jam_mulai`,`jam_selesai`,`posisi`,`jumlah`,`catatan`,
          `status`,`dibuat_at`,`dibuat_oleh`)
       VALUES (:id,:dv,:tg,:m,:s,:ps,:jm,:ct,\'MENUNGGU\',:t,:by)');
  } else {
    /* Menyunting permintaan MENGEMBALIKANNYA ke MENUNGGU dan menghapus jejak
       putusannya — alasannya sama dengan ajuan: yang diubah harus dilihat
       ulang HRD, tidak boleh diam-diam tetap DISETUJUI dengan jumlah yang
       sudah berbeda. */
    $st = $pdo->prepare(
      'UPDATE `dw_permintaan` SET
         `divisi`=:dv, `tgl`=:tg, `jam_mulai`=:m, `jam_selesai`=:s,
         `posisi`=:ps, `jumlah`=:jm, `catatan`=:ct,
         `status`=\'MENUNGGU\', `dibuat_at`=:t, `dibuat_oleh`=:by,
         `putus_at`=0, `putus_oleh`=\'\', `putus_nota`=\'\'
       WHERE `id`=:id');
  }
  $st->execute($arg);
  $ada = permintaan_by_id($id);
  return array('saved' => true, 'row' => $ada ? bentuk_permintaan($ada) : null);
}

function putus_permintaan($id, $status, $nota, $by) {
  $pdo = db();
  pastikan_tabel($pdo);
  $status = strtoupper(s($status));
  if (!in_array($status, array('DISETUJUI', 'DITOLAK', 'MENUNGGU', 'BATAL'), true)) {
    throw new Exception('Status putusan tidak dikenal: ' . $status);
  }
  $st = $pdo->prepare(
    'UPDATE `dw_permintaan` SET `status`=:s, `putus_at`=:t, `putus_oleh`=:by, `putus_nota`=:n
      WHERE `id`=:id');
  $st->execute(array(
    ':s' => $status, ':t' => ms(), ':by' => pot($by, 120),
    ':n' => pot($nota, 255), ':id' => s($id),
  ));
  if ($st->rowCount() === 0 && !permintaan_by_id($id)) {
    throw new Exception('Permintaan tidak ditemukan: ' . s($id));
  }
  return array('saved' => true, 'id' => s($id), 'status' => $status);
}

/* HRD menunjuk orang untuk sebuah permintaan.
   ---------------------------------------------------------------------
   Menugaskan SEKALIGUS MENYETUJUI: yang menunjuk memang orang yang berhak
   memutuskan, jadi meminta ia menekan Setujui sekali lagi untuk baris yang
   baru saja ia buat sendiri cuma langkah kosong — yang akan dilewati lalu
   dilupakan, dan shift yang tertinggal di MENUNGGU tidak muncul sama sekali
   di kalender Jadwal Shift.

   Bentroknya tetap dijaga: tiap penugasan lewat simpan_ajuan() yang sama,
   jadi orang yang sudah dipesan divisi lain hari itu tetap tertahan. Yang
   tertahan DILAPORKAN BALIK, bukan dilewati diam-diam — penugasan yang
   diam-diam kurang satu orang baru ketahuan malam itu, saat kurang orang. */
function tugaskan_dw($permintaanId, $dwIds, $by) {
  $pdo = db();
  pastikan_tabel($pdo);
  $pm = permintaan_by_id($permintaanId);
  if (!$pm) throw new Exception('Permintaan tidak ditemukan: ' . s($permintaanId));
  if (!is_array($dwIds) || !count($dwIds)) throw new Exception('Pilih dulu siapa yang ditugaskan');

  $now = ms();
  $by  = pot($by, 120);
  $masuk = array(); $tertahan = array();

  foreach ($dwIds as $dwId) {
    $dwId = pot($dwId, 32);
    if ($dwId === '') continue;
    /* `timpa` sengaja TIDAK dinyalakan: kalau orangnya sudah dipesan divisi
       lain hari itu, penugasan ini HARUS berhenti dan dilaporkan. HRD yang
       memutuskan mau memindahkan atau memilih orang lain, dan keputusan itu
       tidak boleh diambil diam-diam oleh kode. */
    $hasil = simpan_ajuan(array(
      'dwId' => $dwId, 'tgl' => $pm['tgl'],
      'm' => $pm['jam_mulai'], 's' => $pm['jam_selesai'],
      'divisi' => $pm['divisi'], 'posisi' => $pm['posisi'],
      'catatan' => $pm['catatan'],
    ), $by);
    if (empty($hasil['saved'])) { $tertahan[] = $hasil['bentrok']; continue; }

    $aj = isset($hasil['row']) ? $hasil['row'] : null;
    if (!$aj) continue;
    /* Langsung DISETUJUI + ditandai milik permintaan ini. Dilakukan DI SINI,
       bukan di dalam simpan_ajuan(), karena simpan_ajuan SELALU memaksa
       MENUNGGU dengan sengaja — penjaga yang tidak boleh dilonggarkan untuk
       jalur mana pun (lihat komentarnya di sana). */
    $up = $pdo->prepare(
      'UPDATE `dw_ajuan` SET `permintaan_id`=:pm, `status`=\'DISETUJUI\',
         `putus_at`=:t, `putus_oleh`=:by, `putus_nota`=\'Ditugaskan dari permintaan head\'
       WHERE `id`=:id');
    $up->execute(array(':pm' => $pm['id'], ':t' => $now, ':by' => $by, ':id' => $aj['id']));
    $masuk[] = array('id' => $aj['id'], 'dwId' => $dwId);
  }

  /* Permintaan ikut DISETUJUI begitu ada yang ditugaskan — walau baru
     sebagian. "Sebagian" sengaja BUKAN status tersendiri: berapa yang sudah
     terisi dihitung dari barisnya (permintaan_terpenuhi) dan ditulis apa
     adanya di layar, "2 dari 3". Menambah status SEBAGIAN cuma melahirkan
     keadaan keempat yang harus diingat semua orang tanpa menjawab apa pun. */
  if (count($masuk)) {
    $pdo->prepare(
      'UPDATE `dw_permintaan` SET `status`=\'DISETUJUI\', `putus_at`=:t, `putus_oleh`=:by
        WHERE `id`=:id')->execute(array(':t' => $now, ':by' => $by, ':id' => $pm['id']));
  }
  return array('saved' => true, 'masuk' => count($masuk), 'ditugaskan' => $masuk,
               'tertahan' => $tertahan, 'terpenuhi' => permintaan_terpenuhi($pm['id']),
               'jumlah' => (int)$pm['jumlah']);
}

function hapus_permintaan($id) {
  $pdo = db();
  pastikan_tabel($pdo);
  /* Penugasan yang sudah terbit TIDAK ikut terhapus — orangnya sudah
     dijanjikan datang, dan menghapus permintaannya tidak membatalkan janji
     itu. Yang lepas cuma tautannya. */
  $pdo->prepare('UPDATE `dw_ajuan` SET `permintaan_id`=\'\' WHERE `permintaan_id`=:id')
      ->execute(array(':id' => s($id)));
  $pdo->prepare('DELETE FROM `dw_permintaan` WHERE `id`=:id')->execute(array(':id' => s($id)));
  return array('deleted' => true, 'id' => s($id));
}

/* ==================== KEHADIRAN SETELAH KERJA ====================
   Ditulis ke baris ajuan yang sama. `hadir` = ALFA itulah yang jadi catatan
   no-show — angka yang paling dicari HR sebelum memanggil orang yang sama
   lagi.

   TIDAK ADA PENILAIAN di sini. Sempat ada skor bintang 1–5, dan itu dibuang:
   ia pendapat satu orang tentang shift semalam, tidak pernah dipakai untuk
   memutuskan apa pun, tapi selalu menuntut diisi. Kolom wajib yang tidak
   berguna adalah cara tercepat membuat orang berhenti mengisi SELURUH
   formulirnya — termasuk kehadiran yang justru penting. */
function simpan_hadir($id, $hadir, $nota, $by) {
  $pdo = db();
  pastikan_tabel($pdo);
  $hadir = strtoupper(s($hadir));
  if (!in_array($hadir, array('', 'HADIR', 'TELAT', 'ALFA'), true)) {
    throw new Exception('Kehadiran tidak dikenal: ' . $hadir);
  }
  $st = $pdo->prepare(
    'UPDATE `dw_ajuan` SET `hadir`=:h, `hadir_nota`=:n, `hadir_oleh`=:by, `hadir_at`=:t
      WHERE `id`=:id');
  $st->execute(array(
    ':h' => $hadir, ':n' => pot($nota, 255),
    ':by' => pot($by, 120), ':t' => ms(), ':id' => s($id),
  ));
  return array('saved' => true, 'id' => s($id));
}

/* Satu ajuan apa adanya — dipakai penjaga di api.php untuk memastikan yang
   membatalkan sebuah ajuan memang pemiliknya. */
function ajuan_by_id($id) {
  $pdo = db();
  pastikan_tabel($pdo);
  $st = $pdo->prepare('SELECT * FROM `dw_ajuan` WHERE `id`=:id');
  $st->execute(array(':id' => s($id)));
  $r = $st->fetch();
  return $r ? $r : null;
}

/* ==================== SETTING ====================
   simpan_setting() menulis SELURUH blob dan karena itu dikunci untuk admin
   modul saja (lihat api.php). Tapi penanda "sudah ditransfer" di halaman
   Pembayaran ditekan HR biasa, belasan kali berturut-turut — kalau ia ikut
   lewat simpan_setting, dua orang yang menandai berbarengan saling menimpa
   seluruh tarif dan kuota, bukan cuma centangnya.

   Karena itu penandanya punya jalur sendiri yang MENGUBAH SATU KUNCI saja,
   dibaca-ubah-tulis di dalam satu transaksi. */
function tandai_bayar($senin, $kunciTujuan, $nyala, $by) {
  $senin = tgl_valid($senin);
  $kunciTujuan = pot($kunciTujuan, 120);
  if ($senin === '' || $kunciTujuan === '') throw new Exception('Penanda pembayaran butuh minggu & tujuan');
  $pdo = db();
  pastikan_tabel($pdo);
  $pdo->beginTransaction();
  try {
    $row = $pdo->query('SELECT `data` FROM `dw_setting` WHERE `id`=1 FOR UPDATE')->fetch();
    $data = ($row && $row['data'] !== '') ? json_decode($row['data'], true) : array();
    if (!is_array($data)) $data = array();
    if (!isset($data['bayarLunas']) || !is_array($data['bayarLunas'])) $data['bayarLunas'] = array();
    $k = $senin . '|' . $kunciTujuan;
    if ($nyala) $data['bayarLunas'][$k] = array('at' => ms(), 'oleh' => pot($by, 120));
    else        unset($data['bayarLunas'][$k]);
    $st = $pdo->prepare(
      'INSERT INTO `dw_setting` (`id`,`data`,`updated_at`,`updated_by`) VALUES (1,:d,:ua,:ub)
       ON DUPLICATE KEY UPDATE `data`=VALUES(`data`), `updated_at`=VALUES(`updated_at`), `updated_by`=VALUES(`updated_by`)');
    $st->execute(array(':d' => json_enc($data), ':ua' => ms(), ':ub' => pot($by, 120)));
    $pdo->commit();
  } catch (Throwable $e) {
    $pdo->rollBack();
    throw $e;
  }
  return array('saved' => true, 'kunci' => $senin . '|' . $kunciTujuan, 'nyala' => $nyala ? 1 : 0);
}

function simpan_setting($data, $by) {
  if (!is_array($data) && !is_object($data)) throw new Exception('Payload setting kosong/invalid');
  $pdo = db();
  pastikan_tabel($pdo);
  $st = $pdo->prepare(
    'INSERT INTO `dw_setting` (`id`,`data`,`updated_at`,`updated_by`) VALUES (1,:d,:ua,:ub)
     ON DUPLICATE KEY UPDATE `data`=VALUES(`data`), `updated_at`=VALUES(`updated_at`), `updated_by`=VALUES(`updated_by`)');
  $st->execute(array(':d' => json_enc($data), ':ua' => ms(), ':ub' => pot($by, 120)));
  return array('saved' => true, 'ts' => gmdate('c'));
}

/* ==================== DIAGNOSTIK ==================== */
function ping() {
  return array('pong' => true, 'backend' => 'php-mysql',
               'env' => defined('ENV_LABEL') ? ENV_LABEL : '?',
               'db' => DB_NAME, 'ts' => gmdate('c'));
}
function stats() {
  $out = array('backend' => 'php-mysql',
               'env' => defined('ENV_LABEL') ? ENV_LABEL : '?', 'db' => DB_NAME,
               'pekerja' => 0, 'ajuan' => 0, 'menunggu' => 0, 'disetujui' => 0, 'ada' => false);
  try {
    $pdo = db();
    pastikan_tabel($pdo);
    $out['pekerja']   = (int)$pdo->query('SELECT COUNT(*) c FROM `dw_pekerja`')->fetch()['c'];
    $out['ajuan']     = (int)$pdo->query('SELECT COUNT(*) c FROM `dw_ajuan`')->fetch()['c'];
    $out['menunggu']  = (int)$pdo->query('SELECT COUNT(*) c FROM `dw_ajuan` WHERE `status`=\'MENUNGGU\'')->fetch()['c'];
    $out['disetujui'] = (int)$pdo->query('SELECT COUNT(*) c FROM `dw_ajuan` WHERE `status`=\'DISETUJUI\'')->fetch()['c'];
    $out['ada'] = true;
  } catch (Throwable $e) {
    $out['error'] = $e->getMessage();
  }
  return $out;
}
