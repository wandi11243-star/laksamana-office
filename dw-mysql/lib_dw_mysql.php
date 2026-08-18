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
  /* USULAN NAMA DARI HEAD — id daily worker, dipisah koma.
     ---------------------------------------------------------------------
     Head boleh menyebut siapa yang ia mau ("yang kemarin itu saja"), dan
     kalau ia menyebutnya HRD tinggal menekan Setujui. Disimpan sebagai
     USULAN, bukan langsung jadi baris `dw_ajuan`: kalau langsung jadi ajuan,
     head efektif menjadwalkan orang sendiri dan pembagian "head meminta, HRD
     memutuskan" runtuh — padahal HRD-lah yang tahu orang itu sudah dipesan
     divisi lain atau sedang tidak dipakai lagi.
     Kosong = head tidak menyebut siapa pun, HRD yang memilih. */
  pastikan_kolom($pdo, 'dw_permintaan', 'usulan', "VARCHAR(400) NOT NULL DEFAULT ''");

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
  foreach ($hr as $id) { if ((string)$id === (string)$u['id']) return true; }
  if (count($hr)) return false;

  /* DAFTAR HRD MASIH KOSONG = belum disetel. Semua pemegang modul dianggap
     berhak, supaya pemasangan yang sudah jalan tidak mendadak mengunci semua
     orang di luar — termasuk admin yang seharusnya mengisi daftarnya.

     KECUALI HEAD DIVISI, dan ini bukan pengecualian kecil. Sejak head ikut
     memegang kunci modul (14 Agustus 2026), aturan lama "kosong = semua"
     diam-diam menjadikan SETIAP head sebagai HRD: ia bisa menyetujui
     permintaannya sendiri, menunjuk orang, menyunting talent pool, dan
     menandai transfer. Persis pembagian tugas yang sengaja dibuat — head
     meminta, HRD memenuhi — runtuh tanpa satu pun layar menyebutkannya, dan
     runtuhnya justru pada pemasangan yang paling umum: yang daftar HRD-nya
     memang belum pernah diisi.

     Head tetap MELIHAT semuanya (dw_boleh_lihat); yang ditahan cuma
     memutuskan. */
  return !dw_head($u);
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
/* MENUTUP YANG TANGGALNYA SUDAH LEWAT.
   ---------------------------------------------------------------------
   Permintaan dan ajuan yang tidak pernah diputuskan tetap MENUNGGU selamanya.
   Akibatnya bukan sekadar daftar yang panjang: antrean HRD makin lama makin
   penuh oleh hari-hari yang sudah berlalu, dan yang benar-benar mendesak —
   permintaan untuk BESOK — tenggelam di antaranya. Yang paling mahal justru
   itu; DW dihubungi H-1 malam atau tidak sama sekali.

   Dijalankan saat DIBACA, bukan lewat cron: hosting ini tidak punya penjadwal
   yang bisa diandalkan, dan penutupan yang bergantung pada cron yang mati
   adalah penutupan yang tidak pernah terjadi. Sekali sehari atau seratus kali
   sehari hasilnya sama — UPDATE-nya idempoten.

   'KEDALUWARSA', bukan 'DITOLAK': tidak ada manusia yang menolaknya, dan
   menulis DITOLAK berarti riwayatnya berbohong tentang siapa yang memutuskan.
   Hari ini dihitung WIB (bukan UTC): di server yang jamnya UTC, permintaan
   untuk hari ini akan tertutup sendiri setiap sore lewat pukul 17.00 WIB. */
function tutup_kedaluwarsa($pdo) {
  $hariIni = gmdate('Y-m-d', time() + 7 * 3600);
  $now = ms();
  try {
    $pdo->prepare(
      'UPDATE `dw_permintaan`
          SET `status`=\'KEDALUWARSA\', `putus_at`=:t, `putus_oleh`=\'(sistem)\',
              `putus_nota`=\'Tanggalnya lewat tanpa diputuskan\'
        WHERE `status`=\'MENUNGGU\' AND `tgl` < :h')
      ->execute(array(':t' => $now, ':h' => $hariIni));
    $pdo->prepare(
      'UPDATE `dw_ajuan`
          SET `status`=\'KEDALUWARSA\', `putus_at`=:t, `putus_oleh`=\'(sistem)\',
              `putus_nota`=\'Tanggalnya lewat tanpa diputuskan\'
        WHERE `status`=\'MENUNGGU\' AND `tgl` < :h')
      ->execute(array(':t' => $now, ':h' => $hariIni));
  } catch (Throwable $e) {
    /* Gagal menutup TIDAK boleh menjatuhkan pembacaan. Ini kerapian, bukan
       kebenaran data — modul yang mati total karena satu UPDATE kebersihan
       gagal adalah pertukaran yang jelas salah. */
  }
}

function baca_semua($dari, $sampai, $penuh = true) {
  $pdo = db();
  pastikan_tabel($pdo);
  tutup_kedaluwarsa($pdo);

  /* RIWAYAT RINGKAS PER ORANG — dihitung SERVER atas SELURUH tabel, bukan
     atas ajuan yang kebetulan termuat di rentang layar.
     ---------------------------------------------------------------------
     Dipakai HRD saat menunjuk orang: "kapan terakhir dipakai" adalah satu-
     satunya angka yang membuat pilihannya adil, dan tanpa itu daftar 40 nama
     dibaca menurut abjad — Andi dipanggil terus, dan yang di huruf belakang
     tidak pernah kebagian.

     Kenapa di server: `dw_ajuan` yang dikirim ke layar dibatasi rentang
     tanggal (lihat di bawah), jadi menghitungnya di layar akan menjawab
     "belum pernah" untuk orang yang justru rajin dipakai bulan lalu. Itu
     kelas kesalahan yang paling sering muncul di modul ini — angka yang
     benar menurut data yang ada, dan salah menurut kenyataan. */
  $riwayat = array();
  try {
    $awalBulan = gmdate('Y-m-01', time() + 7 * 3600);
    $rq = $pdo->prepare(
      'SELECT `dw_id`, MAX(`tgl`) AS terakhir,
              SUM(CASE WHEN `tgl` >= :ab THEN 1 ELSE 0 END) AS bulan_ini
         FROM `dw_ajuan` WHERE `status`=\'DISETUJUI\'
        GROUP BY `dw_id`');
    $rq->execute(array(':ab' => $awalBulan));
    foreach ($rq->fetchAll() as $r) {
      $riwayat[$r['dw_id']] = array(
        'terakhir' => (string)$r['terakhir'],
        'bulanIni' => (int)$r['bulan_ini'],
      );
    }
  } catch (Throwable $e) { $riwayat = array(); }

  $pekerja = array();
  $q2 = $pdo->query(
    'SELECT `id`,`nama`,`no_hp`,`gender`,`area`,`bank`,
            `bayar_jenis`,`bayar_nomor`,`bayar_nama`,`divisi`,`posisi`,
            `skill`,`status`,`catatan`,`dibuat_at`
       FROM `dw_pekerja` ORDER BY `nama`');
  foreach ($q2->fetchAll() as $r) {
    $baris = array(
      'id' => $r['id'], 'nama' => $r['nama'],
      'gender' => $r['gender'], 'area' => $r['area'],
      'divisi' => $r['divisi'], 'posisi' => $r['posisi'],
      'skill' => $r['skill'], 'status' => $r['status'],
      'dibuatAt' => (int)$r['dibuat_at'],
      /* '' = belum pernah dipakai sama sekali. Dibedakan dari 0 kali bulan
         ini, karena keduanya menuntun HRD ke keputusan yang berbeda. */
      'terakhirKerja' => isset($riwayat[$r['id']]) ? $riwayat[$r['id']]['terakhir'] : '',
      'kerjaBulanIni' => isset($riwayat[$r['id']]) ? $riwayat[$r['id']]['bulanIni'] : 0,
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
    /* isset() karena kolomnya lahir belakangan (14 Agustus 2026) dan baris
       lama dibaca dari tabel yang belum sempat dipatch di server dev. */
    'usulan' => (isset($r['usulan']) && s($r['usulan']) !== '')
                  ? array_values(array_filter(explode(',', $r['usulan'])))
                  : array(),
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
    /* Divisi yang di-head orang ini. Dipakai layar untuk menawarkan divisi
       mana saja yang boleh ia mintakan DW — dan supaya head yang cuma
       memegang satu divisi tidak disodori pemilih berisi satu pilihan. */
    'divisi' => ($u && isset($u['headDivisi']) && is_array($u['headDivisi']))
                ? array_values($u['headDivisi']) : array(),
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
    /* Penghubung ke permintaan head yang melahirkannya. isset() karena
       kolomnya lahir belakangan: baris dari tabel yang belum sempat di-ALTER
       tidak punya kuncinya. Tanpa baris ini kolomnya tertulis di database tapi
       tidak pernah sampai ke layar — halaman Permintaan menghitung "0 dari 3"
       untuk permintaan yang orangnya sudah ditugaskan, dan HRD menugaskan
       orang kedua kalinya. */
    'permintaanId' => isset($r['permintaan_id']) ? $r['permintaan_id'] : '',
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

/* ============ SATU PEMERIKSA BENTROK UNTUK SEMUA PINTU ============
   Sampai 14 Agustus 2026 pemeriksaan ini hidup HANYA di dalam simpan_ajuan(),
   jadi jalur yang tidak lewat sana tidak diperiksa sama sekali — dan jalur
   itu adalah `usulan` di simpan_permintaan(). Akibatnya: head Bar mengusulkan
   ARIF untuk Sabtu, head Kitchen mengusulkan ARIF untuk Sabtu juga, keduanya
   masuk antrean tanpa satu pun tanda. HRD menyetujui yang pertama, lalu yang
   kedua "gagal sebagian" tanpa sebab yang tertulis — di layar HRD, bukan di
   layar head yang membuat kesalahannya.

   Memulangkan baris yang bentrok (array) atau null. Yang DITOLAK, DIBATALKAN,
   dan KEDALUWARSA tidak dihitung: ketiganya berarti orangnya TIDAK jadi
   datang.

   Dua bentuk bentrok, dan keduanya harus ada:

   1. HARI YANG SAMA, DIVISI LAIN. Kunci unik (dw_id, tgl) berarti satu orang
      cuma punya satu baris per hari, dan ON DUPLICATE KEY menimpanya tanpa
      bertanya — untuk head yang membetulkan ajuannya sendiri itu memang yang
      diinginkan, tapi untuk divisi lain artinya baris Bar BERUBAH jadi baris
      Kitchen dan turun ke MENUNGGU tanpa ada yang diberi tahu.

   2. MELEWATI TENGAH MALAM. ARIF Bar 15 Agustus 18:00-02:00 dan ARIF Kitchen
      16 Agustus 01:00-08:00 adalah DUA baris bertanggal berbeda: keduanya sah
      menurut kunci unik, keduanya lolos pemeriksaan (1), dan keduanya
      bertindih satu jam penuh di dunia nyata. Berlaku juga untuk divisi yang
      SAMA — 18:00-02:00 lalu 01:00-08:00 tetap mustahil walau head-nya satu. */
function bentrok_ajuan_row($pdo, $dw, $tgl, $m, $sj, $divisi) {
  $lama = $pdo->prepare('SELECT `id`,`divisi`,`posisi`,`jam_mulai`,`jam_selesai`,`status`
                           FROM `dw_ajuan` WHERE `dw_id`=:dw AND `tgl`=:tg');
  $lama->execute(array(':dw' => $dw, ':tg' => $tgl));
  $L = $lama->fetch();
  if ($L && ($L['status'] === 'MENUNGGU' || $L['status'] === 'DISETUJUI')
      && $L['divisi'] !== '' && $L['divisi'] !== $divisi) {
    return array(
      'tgl' => $tgl, 'divisi' => $L['divisi'], 'posisi' => $L['posisi'],
      'm' => $L['jam_mulai'], 's' => $L['jam_selesai'], 'status' => $L['status'],
      'lintasHari' => false,
    );
  }

  /* Offset hari: baris kemarin dimulai 1440 menit lebih awal, baris besok
     1440 menit lebih lambat. Dengan begitu keduanya bisa dibandingkan di satu
     garis waktu yang sama. */
  $ms = menit_jam($m); $ns = $ms + durasi_menit($m, $sj);
  $tet = $pdo->prepare('SELECT `tgl`,`divisi`,`posisi`,`jam_mulai`,`jam_selesai`,`status`
                          FROM `dw_ajuan`
                         WHERE `dw_id`=:dw AND `tgl` IN (:t1,:t2)
                           AND (`status`=\'MENUNGGU\' OR `status`=\'DISETUJUI\')');
  $tet->execute(array(':dw' => $dw, ':t1' => geser_hari($tgl, -1), ':t2' => geser_hari($tgl, 1)));
  foreach ($tet->fetchAll() as $T) {
    $off = ($T['tgl'] < $tgl) ? -1440 : 1440;
    $as = menit_jam($T['jam_mulai']) + $off;
    $ae = $as + durasi_menit($T['jam_mulai'], $T['jam_selesai']);
    if (max($as, $ms) < min($ae, $ns)) {
      return array(
        'tgl' => $T['tgl'], 'divisi' => $T['divisi'], 'posisi' => $T['posisi'],
        'm' => $T['jam_mulai'], 's' => $T['jam_selesai'], 'status' => $T['status'],
        'lintasHari' => true,
      );
    }
  }
  return null;
}

/* Orang yang sudah DIUSULKAN head lain untuk shift yang bertindih, padahal
   belum satu pun jadi baris ajuan. Bukan bentrok yang sama kerasnya dengan di
   atas — belum ada yang dipesan — tapi membiarkannya berarti dua permintaan
   berdiri di antrean HRD dengan nama yang sama, dan salah satunya PASTI gagal
   saat ditugaskan. Yang membayarnya head yang kalah cepat: ia mengira orangnya
   sudah diamankan sejak kemarin.
   `abaikan` = id permintaan yang sedang disunting; tanpa itu, membuka Ubah
   lalu menekan Simpan membuat permintaan bentrok dengan dirinya sendiri. */
function bentrok_usulan($pdo, $dw, $tgl, $m, $sj, $divisi, $abaikan = '') {
  $ms = menit_jam($m); $ns = $ms + durasi_menit($m, $sj);
  $st = $pdo->prepare('SELECT `id`,`divisi`,`tgl`,`jam_mulai`,`jam_selesai`,`usulan`,`dibuat_oleh`
                         FROM `dw_permintaan`
                        WHERE `status`=\'MENUNGGU\' AND `tgl` IN (:t0,:t1,:t2)');
  $st->execute(array(':t0' => $tgl, ':t1' => geser_hari($tgl, -1), ':t2' => geser_hari($tgl, 1)));
  foreach ($st->fetchAll() as $P) {
    if ($abaikan !== '' && (string)$P['id'] === (string)$abaikan) continue;
    $us = ($P['usulan'] === null || s($P['usulan']) === '')
            ? array() : array_filter(explode(',', $P['usulan']));
    if (!in_array((string)$dw, array_map('strval', $us), true)) continue;
    $off = ($P['tgl'] === $tgl) ? 0 : (($P['tgl'] < $tgl) ? -1440 : 1440);
    $as = menit_jam($P['jam_mulai']) + $off;
    $ae = $as + durasi_menit($P['jam_mulai'], $P['jam_selesai']);
    /* Hari yang sama & divisi yang sama bukan bentrok: itu head yang sama
       menyusun ulang permintaannya, bukan dua orang berebut. */
    if ($off === 0 && $P['divisi'] === $divisi) continue;
    if (max($as, $ms) < min($ae, $ns)) {
      return array(
        'tgl' => $P['tgl'], 'divisi' => $P['divisi'], 'posisi' => '',
        'm' => $P['jam_mulai'], 's' => $P['jam_selesai'], 'status' => 'DIUSULKAN',
        'oleh' => $P['dibuat_oleh'], 'lintasHari' => ($off !== 0),
      );
    }
  }
  return null;
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
  /* Pemeriksaannya sendiri ada di bentrok_ajuan_row() — SATU tempat, dipakai
     juga oleh penyaring usulan di simpan_permintaan(). Sebelumnya logikanya
     hidup utuh di sini, jadi pintu mana pun yang tidak lewat simpan_ajuan()
     tidak diperiksa sama sekali. */
  $B = $timpa ? null : bentrok_ajuan_row($pdo, $dw, $tgl, $m, $sj, $divisi);
  if ($B) {
    $out = array(
      'nama'    => $o['nama'],
      'tgl'     => $B['tgl'],
      'divisi'  => $B['divisi'],      // divisi yang SUDAH memesan
      'posisi'  => $B['posisi'],
      'm'       => $B['m'],
      's'       => $B['s'],
      'status'  => $B['status'],
      'divisiBaru' => $divisi,
      'mBaru'   => $m,
      'sBaru'   => $sj,
    );
    if (!empty($B['lintasHari'])) { $out['lintasHari'] = true; $out['tglBaru'] = $tgl; }
    return array('saved' => false, 'bentrok' => $out);
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

  /* Id dihitung DI ATAS penyaringan usulan, bukan di bawahnya: bentrok_usulan
     perlu tahu permintaan mana yang sedang disunting supaya ia tidak dilaporkan
     bentrok dengan dirinya sendiri — membuka Ubah lalu menekan Simpan akan
     membuang seluruh usulannya. */
  $id = pot(isset($row['id']) ? $row['id'] : '', 32);
  $baru = ($id === '');
  if ($baru) $id = id_baru('PM');

  /* USULAN NAMA — disaring di SERVER, bukan dipercaya dari layar.
     Yang tidak ada di talent pool atau sudah NONAKTIF dibuang diam-diam:
     kalau dibiarkan lolos, HRD menekan Setujui lalu mendapat penugasan yang
     gagal sebagian tanpa pernah tahu sebabnya. Dipotong sebanyak `jumlah`
     karena angka itulah yang diminta — usulan yang lebih banyak dari
     kebutuhannya berarti head diam-diam menaikkan anggarannya sendiri. */
  $usulan = array();
  $ditolak = array();
  if (isset($row['usulan']) && is_array($row['usulan']) && count($row['usulan'])) {
    $minta = array();
    foreach ($row['usulan'] as $u) {
      $u = pot($u, 32);
      if ($u !== '' && !in_array($u, $minta, true)) $minta[] = $u;
    }
    if (count($minta)) {
      $tanda = implode(',', array_fill(0, count($minta), '?'));
      $cek = $pdo->prepare(
        'SELECT `id` FROM `dw_pekerja` WHERE `status`=\'AKTIF\' AND `id` IN (' . $tanda . ')');
      $cek->execute($minta);
      $sah = array();
      foreach ($cek->fetchAll() as $r) $sah[] = (string)$r['id'];
      /* Urutan pilihan head dipertahankan, bukan urutan yang dipulangkan
         database — yang pertama disebut biasanya yang paling ia inginkan. */
      foreach ($minta as $u) {
        if (!in_array($u, $sah, true) || count($usulan) >= $jml) continue;
        /* BENTROK JADWAL DIPERIKSA DI SINI (14 Agustus 2026), bukan nanti saat
           HRD menugaskan. Sebelumnya usulan lolos apa adanya: head Bar
           mengusulkan ARIF untuk Sabtu, head Kitchen mengusulkan ARIF untuk
           Sabtu juga, keduanya masuk antrean tanpa satu pun tanda. HRD
           menyetujui yang pertama, lalu yang kedua "gagal sebagian" — dan yang
           membaca kegagalannya adalah HRD, bukan head yang membuatnya, jadi
           tidak ada yang belajar apa pun dari situ.
           Dua sumber bentrok, keduanya diperiksa: baris ajuan yang sudah ada
           (bentrok_ajuan_row) dan usulan permintaan lain yang masih menunggu
           (bentrok_usulan). */
        $b = bentrok_ajuan_row($pdo, $u, $tgl, $m, $sj, $div);
        if (!$b) $b = bentrok_usulan($pdo, $u, $tgl, $m, $sj, $div, ($baru ? '' : $id));
        if ($b) { $b['dwId'] = $u; $b['nama'] = nama_pekerja($pdo, $u); $ditolak[] = $b; continue; }
        $usulan[] = $u;
      }
    }
  }

  $arg = array(
    ':id' => $id, ':dv' => $div, ':tg' => $tgl, ':m' => $m, ':s' => $sj,
    ':ps' => pot(isset($row['posisi']) ? $row['posisi'] : '', 60),
    ':jm' => $jml,
    ':ct' => pot(isset($row['catatan']) ? $row['catatan'] : '', 255),
    ':us' => pot(implode(',', $usulan), 400),
    ':t' => ms(), ':by' => pot($by, 120),
  );
  if ($baru) {
    $st = $pdo->prepare(
      'INSERT INTO `dw_permintaan`
         (`id`,`divisi`,`tgl`,`jam_mulai`,`jam_selesai`,`posisi`,`jumlah`,`catatan`,
          `usulan`,`status`,`dibuat_at`,`dibuat_oleh`)
       VALUES (:id,:dv,:tg,:m,:s,:ps,:jm,:ct,:us,\'MENUNGGU\',:t,:by)');
  } else {
    /* Menyunting permintaan MENGEMBALIKANNYA ke MENUNGGU dan menghapus jejak
       putusannya — alasannya sama dengan ajuan: yang diubah harus dilihat
       ulang HRD, tidak boleh diam-diam tetap DISETUJUI dengan jumlah yang
       sudah berbeda. */
    $st = $pdo->prepare(
      'UPDATE `dw_permintaan` SET
         `divisi`=:dv, `tgl`=:tg, `jam_mulai`=:m, `jam_selesai`=:s,
         `posisi`=:ps, `jumlah`=:jm, `catatan`=:ct, `usulan`=:us,
         `status`=\'MENUNGGU\', `dibuat_at`=:t, `dibuat_oleh`=:by,
         `putus_at`=0, `putus_oleh`=\'\', `putus_nota`=\'\'
       WHERE `id`=:id');
  }
  $st->execute($arg);
  $ada = permintaan_by_id($id);
  /* `bentrok` DIPULANGKAN, bukan ditelan. Permintaannya tetap tersimpan —
     head yang butuh 3 orang dan salah satu usulannya bentrok tetap butuh 3
     orang — tapi layarnya wajib menyebut siapa yang dilepas dan kenapa.
     Penyaringan diam-diam di sinilah asal keluhan "kok nama yang saya centang
     hilang sendiri". */
  return array('saved' => true, 'row' => $ada ? bentuk_permintaan($ada) : null,
               'bentrok' => $ditolak);
}
/* Nama satu DW untuk pesan bentrok. Dibaca terpisah, bukan lewat JOIN: yang
   memanggilnya paling banyak tiga puluh kali per simpan (batas `jumlah`), dan
   pesan bentrok yang menyebut id alih-alih nama tidak bisa ditindaklanjuti
   siapa pun. */
function nama_pekerja($pdo, $id) {
  $st = $pdo->prepare('SELECT `nama` FROM `dw_pekerja` WHERE `id`=:id');
  $st->execute(array(':id' => s($id)));
  $r = $st->fetch();
  return $r ? (string)$r['nama'] : (string)$id;
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

/* $bolehUbahHr = pemanggilnya admin modul. HRD boleh menyetel tarif, kuota,
   jam bawaan, dan daftar posisi — itu memang pekerjaannya, dan mengunci layar
   Pengaturan untuk admin saja berarti tiap perubahan tarif harus lewat orang
   yang tidak mengurus pembayarannya.

   Yang TIDAK boleh ia sentuh: daftar `hr` itu sendiri. Blob setting memuat
   siapa saja yang berhak memutuskan, dan HRD yang bisa menyunting daftar HRD
   bukan pembatasan apa pun — ia tinggal menambahkan siapa saja, termasuk
   dirinya sendiri kalau suatu saat dicabut. Jadi daftarnya DIPERTAHANKAN dari
   yang tersimpan, bukan diambil dari kiriman. */
function simpan_setting($data, $by, $bolehUbahHr = true) {
  if (!is_array($data) && !is_object($data)) throw new Exception('Payload setting kosong/invalid');
  $pdo = db();
  pastikan_tabel($pdo);
  if (!$bolehUbahHr) {
    $lama = json_decode(json_encode(baca_setting()), true);
    $hrLama = (is_array($lama) && isset($lama['hr']) && is_array($lama['hr'])) ? $lama['hr'] : array();
    $data = (array)$data;
    $data['hr'] = $hrLama;
  }
  $st = $pdo->prepare(
    'INSERT INTO `dw_setting` (`id`,`data`,`updated_at`,`updated_by`) VALUES (1,:d,:ua,:ub)
     ON DUPLICATE KEY UPDATE `data`=VALUES(`data`), `updated_at`=VALUES(`updated_at`), `updated_by`=VALUES(`updated_by`)');
  $st->execute(array(':d' => json_enc($data), ':ua' => ms(), ':ub' => pot($by, 120)));
  return array('saved' => true, 'ts' => gmdate('c'));
}

/* ==================== KOSONGKAN SELURUH DATA ====================
   Menghapus SELURUH permintaan head dan SELURUH pengajuan/penugasan DW,
   supaya modul bisa dimulai dari nol. Admin modul saja (dijaga di api.php),
   dan kata kunci konfirmasinya wajib ikut dikirim -- tidak ada undo, dan satu
   panggilan nyasar menghapus riwayat seluruh musim tanpa satu pun galat.

   TALENT POOL (`dw_pekerja`) hanya ikut kalau diminta eksplisit, dan
   bawaannya TIDAK. Isinya nama, nomor HP, dan rekam jejak no-show puluhan
   part-timer yang dikumpulkan berbulan-bulan; itu bukan "data jadwal" yang
   dimaksud saat orang menekan mulai dari nol, dan mengumpulkannya kembali
   berarti menelepon satu per satu. Yang ingin membersihkan orangnya juga
   harus mengatakannya sendiri.

   `dw_setting` tidak pernah ikut: tarif per posisi, kuota, jam siap pakai,
   posisi per divisi, dan daftar HRD adalah konfigurasi. Menghapusnya bersama
   data berarti setiap pembersihan diikuti menyetel ulang tarif -- dan tarif
   yang belum disetel dibayar NOL tanpa satu pun galat.

   Urutan hapus: ajuan dulu, baru permintaan, baru pekerja. Ajuan menunjuk
   keduanya, jadi urutan sebaliknya meninggalkan baris yang menunjuk ke id
   yang sudah tidak ada di antara dua DELETE -- tidak masalah di dalam satu
   transaksi, tapi urutan yang benar tetap lebih murah dibaca nanti. */
function kosongkan_semua($ikutPekerja, $by) {
  $pdo = db();
  pastikan_tabel($pdo);
  $pdo->beginTransaction();
  try {
    $nAjuan = (int)$pdo->exec('DELETE FROM `dw_ajuan`');
    $nMinta = (int)$pdo->exec('DELETE FROM `dw_permintaan`');
    $nOrang = $ikutPekerja ? (int)$pdo->exec('DELETE FROM `dw_pekerja`') : 0;
    $pdo->commit();
  } catch (Throwable $e) {
    $pdo->rollBack();
    throw $e;
  }
  return array('cleared' => true, 'ajuan' => $nAjuan, 'permintaan' => $nMinta,
               'pekerja' => $nOrang, 'ikutPekerja' => $ikutPekerja ? true : false,
               'oleh' => mb_substr(s($by), 0, 120), 'ts' => gmdate('c'));
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
