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
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS `dw_setting` (
       `id`         TINYINT UNSIGNED NOT NULL PRIMARY KEY,
       `data`       LONGTEXT         NOT NULL,
       `updated_at` BIGINT           NOT NULL DEFAULT 0,
       `updated_by` VARCHAR(120)     NOT NULL DEFAULT \'\'
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
  $sudah = true;
}

/* ==================== BACA ====================
   Bentuk balasan sengaja pendek (kunci satu-dua huruf untuk ajuan) —
   halaman kalender bisa memuat sebulan × puluhan DW sekaligus.

   Pekerja dikirim SELURUHNYA tanpa batas tanggal: talent pool-nya berukuran
   puluhan, bukan ribuan, dan hampir setiap halaman butuh namanya untuk
   menerjemahkan `dw_id` di ajuan. Yang dibatasi tanggal hanya ajuan. */
function baca_semua($dari, $sampai) {
  $pdo = db();
  pastikan_tabel($pdo);

  $pekerja = array();
  $q = $pdo->query(
    'SELECT `id`,`nama`,`no_hp`,`pin`,`gender`,`area`,`bank`,
            `bayar_jenis`,`bayar_nomor`,`bayar_nama`,`divisi`,`posisi`,
            `skill`,`status`,`catatan`,`dibuat_at`
       FROM `dw_pekerja` ORDER BY `nama`');
  foreach ($q->fetchAll() as $r) {
    $pekerja[] = array(
      'id' => $r['id'], 'nama' => $r['nama'], 'hp' => $r['no_hp'],
      /* PIN tidak pernah dikirim apa adanya. HR cuma perlu tahu SUDAH atau
         BELUM diberi PIN; nilainya sendiri tidak ada gunanya di layar dan
         hanya menambah satu tempat lagi ia bisa bocor. */
      'adaPin' => ($r['pin'] !== '' ? 1 : 0),
      'gender' => $r['gender'], 'area' => $r['area'], 'bank' => $r['bank'],
      'bayarJenis' => isset($r['bayar_jenis']) ? $r['bayar_jenis'] : 'BANK',
      'bayarNomor' => isset($r['bayar_nomor']) ? $r['bayar_nomor'] : '',
      'bayarNama'  => isset($r['bayar_nama'])  ? $r['bayar_nama']  : '',
      'divisi' => $r['divisi'], 'posisi' => $r['posisi'],
      'skill' => $r['skill'], 'status' => $r['status'],
      'catatan' => $r['catatan'], 'dibuatAt' => (int)$r['dibuat_at'],
    );
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

  return array('setting' => baca_setting(), 'pekerja' => $pekerja, 'ajuan' => $ajuan);
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
  if ($hp === '')   throw new Exception('No. HP wajib diisi — nomor inilah identitas DW dan cara ia masuk sendiri');

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

  /* PIN hanya ditulis kalau memang dikirim. Form sunting yang tidak
     menyertakan field PIN karena tidak diubah TIDAK boleh mengosongkannya —
     kalau tidak, tiap kali HR memperbaiki ejaan nama, DW-nya terkunci di
     luar tanpa ada yang tahu sebabnya. */
  $adaPin = array_key_exists('pin', $row);
  $pin = $adaPin ? preg_replace('/\D+/', '', (string)$row['pin']) : '';
  $pin = substr($pin, 0, 8);

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
    $arg[':pin'] = $pin;
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
         (`id`,`nama`,`no_hp`,`pin`,`gender`,`area`,`bank`,
          `bayar_jenis`,`bayar_nomor`,`bayar_nama`,`divisi`,`posisi`,`skill`,
          `status`,`catatan`,`dibuat_at`,`dibuat_oleh`,`updated_at`,`updated_oleh`)
       VALUES (:id,:nm,:hp,:pin,:g,:ar,:bk,:bj,:bn,:ba,:dv,:ps,:sk,:st,:ct,:t,:by,:t2,:by2)');
    $st->execute($arg);
  } else {
    $sqlPin = $adaPin ? '`pin`=:pin, ' : '';
    if ($adaPin) $arg[':pin'] = $pin;
    $st = $pdo->prepare(
      'UPDATE `dw_pekerja` SET
         `nama`=:nm, `no_hp`=:hp, ' . $sqlPin . '`gender`=:g, `area`=:ar, `bank`=:bk,
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

/* ==================== MASUK MANDIRI (DW) ====================
   DW tidak punya akun Office. Gerbangnya: no HP + PIN 4 angka yang diberi
   HR. Yang dibalas hanya identitas seperlunya — tidak pernah PIN, dan tidak
   pernah daftar pekerja lain.

   Yang BLOKIR/NONAKTIF ditolak di sini, bukan disaring belakangan di
   frontend: kalau hanya disembunyikan di layar, ajuannya tetap bisa
   dikirim langsung ke API. */
function login_dw($hp, $pin) {
  $pdo = db();
  pastikan_tabel($pdo);
  $hp  = hp_normal($hp);
  $pin = preg_replace('/\D+/', '', (string)$pin);
  if ($hp === '' || $pin === '') throw new Exception('No. HP dan PIN wajib diisi');

  $st = $pdo->prepare('SELECT * FROM `dw_pekerja` WHERE `no_hp`=:h');
  $st->execute(array(':h' => $hp));
  $r = $st->fetch();
  if (!$r || $r['pin'] === '' || !hash_equals((string)$r['pin'], (string)$pin)) {
    // Pesan sengaja tidak membedakan "nomor tidak ada" dan "PIN salah".
    throw new Exception('No. HP atau PIN salah. Kalau lupa, hubungi HR.');
  }
  /* BLOKIR ikut ditolak walau statusnya sudah dihapus dari daftar pilihan:
     baris lama di database masih bisa memuatnya, dan yang dulu diblokir
     jelas tidak boleh tiba-tiba bisa masuk lagi hanya karena labelnya
     dipensiunkan. */
  if ($r['status'] === 'NONAKTIF' || $r['status'] === 'BLOKIR') {
    throw new Exception('Akun Anda sudah tidak aktif. Hubungi HR.');
  }

  return array('dw' => array(
    'id' => $r['id'], 'nama' => $r['nama'], 'hp' => $r['no_hp'],
    'divisi' => $r['divisi'], 'posisi' => $r['posisi'], 'status' => $r['status'],
  ));
}

/* Ajuan + riwayat MILIK SATU DW saja. Dipakai halaman "Jadwal Saya" saat
   yang masuk adalah DW-nya sendiri — ia tidak boleh menerima getAll yang
   berisi seluruh talent pool beserta nomor telepon semua orang. */
function ajuan_saya($dwId) {
  $pdo = db();
  pastikan_tabel($pdo);
  $st = $pdo->prepare('SELECT * FROM `dw_ajuan` WHERE `dw_id`=:d ORDER BY `tgl` DESC LIMIT 200');
  $st->execute(array(':d' => s($dwId)));
  $out = array();
  foreach ($st->fetchAll() as $r) $out[] = bentuk_ajuan($r);
  return array('ajuan' => $out, 'setting' => baca_setting());
}

/* ==================== AJUAN ====================
   Sama seperti pengajuan di modul Jadwal: endpoint pembuatan SELALU memaksa
   status MENUNGGU, apa pun yang dikirim client. Kalau tidak, siapa pun yang
   bisa memanggil API bisa mengirim ajuannya sendiri dengan status DISETUJUI
   dan langsung muncul di kalender tanpa pernah dilihat HR. */
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

/* ==================== SETTING ==================== */
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
