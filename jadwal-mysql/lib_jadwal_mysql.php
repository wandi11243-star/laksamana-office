<?php
/************************************************************************
 * JADWAL SHIFT LAKSAMANA — Backend PHP + MySQL
 * ---------------------------------------------------------------------
 * SENGAJA BUKAN BLOB JSON SATU BARIS seperti kompas-api-mysql.
 *
 * Modul ini punya BANYAK penyunting yang bekerja BERSAMAAN: tiap divisi
 * (Bar, Kitchen, Floor, Cashier, Office) punya head sendiri, dan mereka
 * menyusun jadwal minggu depan kira-kira di waktu yang sama — Sabtu/Minggu
 * malam. Kalau seluruh state dikirim sebagai satu blob, head Bar yang
 * menekan Simpan belakangan akan MENGHAPUS pekerjaan head Kitchen tanpa
 * ada yang sadar: layarnya bilang "tersimpan", dan barisnya baru ketahuan
 * hilang hari Senin.
 *
 * Karena itu penulisan di sini GRANULAR — satu baris per (kru × tanggal):
 *
 *   jadwal_sel        satu sel jadwal. PK (user_id, tgl).
 *   jadwal_pengajuan  pengajuan off/izin/cuti/tukar dari kru + putusannya.
 *   jadwal_setting    satu baris blob: definisi shift, head per divisi,
 *                     dan penyesuaian divisi manual. Ini memang jarang
 *                     berubah dan hanya admin yang menyentuhnya, jadi blob
 *                     di sini aman.
 *
 * Dua head yang menyunting divisi berbeda tidak pernah menyentuh baris yang
 * sama, jadi tidak ada yang perlu di-lock dan tidak ada yang bisa hilang.
 *
 * `user_id` di sini adalah ID user Office (account-api-mysql) apa adanya —
 * modul ini TIDAK punya daftar pegawai sendiri. Nama, divisi, dan jabatan
 * selalu ditarik ulang dari Office lewat listDivisiRoster. Konsekuensinya
 * disengaja: kru yang dihapus di Office langsung hilang dari jadwal, dan
 * tidak ada dua sumber nama yang bisa berbeda isi.
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

function json_enc($v) { return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); }
function s($v) { return trim((string)$v); }
function ms() { return (int)(microtime(true) * 1000); }

/* Tanggal HARUS divalidasi bentuknya, bukan cuma diserahkan ke MySQL:
   kolomnya DATE, dan MySQL dengan mode longgar diam-diam mengubah
   '2026-13-45' jadi '0000-00-00'. Sel jadwal yang mendarat di tanggal nol
   tidak pernah muncul lagi di layar mana pun — hilang tanpa error. */
function tgl_valid($v) {
  $v = s($v);
  if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m)) return '';
  return checkdate((int)$m[2], (int)$m[3], (int)$m[1]) ? $v : '';
}
function jam_valid($v) {
  $v = s($v);
  return preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $v) ? $v : '';
}

/* Menambahkan kolom yang lahir belakangan ke tabel yang SUDAH ada.

   Dibutuhkan karena CREATE TABLE IF NOT EXISTS diam saja kalau tabelnya
   sudah ada — termasuk saat bentuknya sudah ketinggalan. Pemasangan lama
   akan terus jalan tanpa kolom baru, dan gejalanya muncul jauh dari
   sebabnya: satu INSERT gagal "Unknown column" di server, yang di layar kru
   cuma terbaca "gagal mengirim pengajuan".

   MySQL tidak punya ADD COLUMN IF NOT EXISTS (itu MariaDB), jadi
   keberadaannya ditanyakan dulu ke information_schema. Dibungkus try/catch
   karena kegagalan di sini tidak boleh mematikan seluruh modul: kalau
   kolomnya memang sudah ada, ALTER hanya akan melempar dan sisa aplikasi
   tetap berjalan seperti biasa. */
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

/* Semua tabel dibuat saat pertama dipakai, jadi pemasangan tidak pernah
   gagal cuma karena schema.sql lupa dijalankan. schema.sql tetap ada
   sebagai dokumentasi bentuk tabel. */
function pastikan_tabel($pdo) {
  static $sudah = false;
  if ($sudah) return;
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS `jadwal_sel` (
       `user_id`     VARCHAR(64)  NOT NULL,
       `tgl`         DATE         NOT NULL,
       `shift`       VARCHAR(16)  NOT NULL DEFAULT \'\',
       `jam_mulai`   VARCHAR(5)   NOT NULL DEFAULT \'\',
       `jam_selesai` VARCHAR(5)   NOT NULL DEFAULT \'\',
       `catatan`     VARCHAR(120) NOT NULL DEFAULT \'\',
       `updated_at`  BIGINT       NOT NULL DEFAULT 0,
       `updated_by`  VARCHAR(120) NOT NULL DEFAULT \'\',
       PRIMARY KEY (`user_id`, `tgl`),
       KEY `idx_sel_tgl` (`tgl`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS `jadwal_pengajuan` (
       `id`          VARCHAR(32)  NOT NULL PRIMARY KEY,
       `user_id`     VARCHAR(64)  NOT NULL,
       `jenis`       VARCHAR(16)  NOT NULL DEFAULT \'OFF\',
       `tgl_mulai`   DATE         NOT NULL,
       `tgl_selesai` DATE         NOT NULL,
       `alasan`      TEXT         NULL,
       `status`      VARCHAR(16)  NOT NULL DEFAULT \'MENUNGGU\',
       `dibuat_at`   BIGINT       NOT NULL DEFAULT 0,
       `dibuat_oleh` VARCHAR(120) NOT NULL DEFAULT \'\',
       `putus_at`    BIGINT       NOT NULL DEFAULT 0,
       `putus_oleh`  VARCHAR(120) NOT NULL DEFAULT \'\',
       `putus_nota`  VARCHAR(255) NOT NULL DEFAULT \'\',
       KEY `idx_aju_user` (`user_id`),
       KEY `idx_aju_status` (`status`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
  /* Kolom yang lahir belakangan. CREATE TABLE IF NOT EXISTS TIDAK menyentuh
     tabel yang sudah ada, jadi tanpa tiga baris ini pemasangan lama akan
     terus berjalan tanpa kolomnya dan setiap simpan_pengajuan gagal dengan
     "Unknown column" — di server, bukan di sini, dan cuma kelihatan sebagai
     "kirim pengajuan gagal" di layar kru. */
  pastikan_kolom($pdo, 'jadwal_pengajuan', 'shift',       "VARCHAR(16)  NOT NULL DEFAULT ''");
  pastikan_kolom($pdo, 'jadwal_pengajuan', 'jam_mulai',   "VARCHAR(5)   NOT NULL DEFAULT ''");
  pastikan_kolom($pdo, 'jadwal_pengajuan', 'jam_selesai', "VARCHAR(5)   NOT NULL DEFAULT ''");
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS `jadwal_setting` (
       `id`         TINYINT UNSIGNED NOT NULL PRIMARY KEY,
       `data`       LONGTEXT         NOT NULL,
       `updated_at` BIGINT           NOT NULL DEFAULT 0,
       `updated_by` VARCHAR(120)     NOT NULL DEFAULT \'\'
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
  $sudah = true;
}

/* ==================== BACA ====================
   $dari/$sampai membatasi sel yang dikirim. Frontend hanya pernah
   menampilkan satu bulan sekaligus, dan tanpa batas ini balasannya tumbuh
   selamanya (40 kru × 365 hari per tahun) padahal 99%-nya tidak dipakai.

   Pengajuan TIDAK ikut dibatasi tanggal: yang berstatus MENUNGGU harus
   selalu kelihatan oleh head, termasuk kalau tanggalnya di luar bulan yang
   sedang dilihat — justru itu yang perlu diputuskan lebih dulu. Yang sudah
   diputus dibatasi 200 terbaru supaya tidak menumpuk selamanya. */
function baca_semua($dari, $sampai) {
  $pdo = db();
  pastikan_tabel($pdo);

  $sel = array();
  $d = tgl_valid($dari); $sm = tgl_valid($sampai);
  if ($d !== '' && $sm !== '') {
    $st = $pdo->prepare(
      'SELECT `user_id`,`tgl`,`shift`,`jam_mulai`,`jam_selesai`,`catatan`
         FROM `jadwal_sel` WHERE `tgl` BETWEEN :a AND :b');
    $st->execute(array(':a' => $d, ':b' => $sm));
  } else {
    $st = $pdo->query(
      'SELECT `user_id`,`tgl`,`shift`,`jam_mulai`,`jam_selesai`,`catatan` FROM `jadwal_sel`');
  }
  foreach ($st->fetchAll() as $r) {
    $sel[] = array(
      'u' => $r['user_id'], 'd' => $r['tgl'], 't' => $r['shift'],
      'm' => $r['jam_mulai'], 's' => $r['jam_selesai'], 'n' => $r['catatan'],
    );
  }

  $aju = array();
  $q = $pdo->query(
    'SELECT * FROM (
       SELECT * FROM `jadwal_pengajuan` WHERE `status` = \'MENUNGGU\'
       UNION ALL
       SELECT * FROM (SELECT * FROM `jadwal_pengajuan` WHERE `status` <> \'MENUNGGU\'
                      ORDER BY `putus_at` DESC LIMIT 200) x
     ) y ORDER BY `dibuat_at` DESC');
  foreach ($q->fetchAll() as $r) {
    $aju[] = array(
      'id' => $r['id'], 'userId' => $r['user_id'], 'jenis' => $r['jenis'],
      'dari' => $r['tgl_mulai'], 'sampai' => $r['tgl_selesai'],
      'alasan' => (string)$r['alasan'], 'status' => $r['status'],
      /* Shift yang DIMINTA kru. Diisi untuk jenis TUKAR/UBAH — sebelumnya
         maksudnya cuma ada di dalam kalimat `alasan`, dan head harus
         menerjemahkan prosa jadi sel jadwal sendiri sesudah menyetujui.
         isset() dipakai karena kolomnya lahir belakangan: baris lama
         (dan pemasangan yang ALTER-nya gagal) tidak punya kuncinya. */
      'shift' => isset($r['shift']) ? (string)$r['shift'] : '',
      'jamMulai' => isset($r['jam_mulai']) ? (string)$r['jam_mulai'] : '',
      'jamSelesai' => isset($r['jam_selesai']) ? (string)$r['jam_selesai'] : '',
      'dibuatAt' => (int)$r['dibuat_at'], 'dibuatOleh' => $r['dibuat_oleh'],
      'putusAt' => (int)$r['putus_at'], 'putusOleh' => $r['putus_oleh'],
      'putusNota' => $r['putus_nota'],
    );
  }

  return array('setting' => baca_setting(), 'sel' => $sel, 'pengajuan' => $aju);
}

function baca_setting() {
  try {
    $row = db()->query('SELECT `data` FROM `jadwal_setting` WHERE `id`=1')->fetch();
    if (!$row || $row['data'] === null || $row['data'] === '') return new stdClass();
    $v = json_decode($row['data']);
    return $v === null ? new stdClass() : $v;
  } catch (Throwable $e) {
    return new stdClass();   // tabel belum ada — aplikasi mulai dari default
  }
}

/* ==================== TULIS SEL ====================
   $rows = sel yang diisi/diubah, $hapus = sel yang dikosongkan.
   Keduanya dalam satu transaksi supaya "hapus lalu isi" (mis. Isi Cepat
   yang menimpa satu minggu) tidak pernah berhenti di tengah dan
   meninggalkan minggu yang separuh kosong.

   Sengaja TANPA GET_LOCK global: yang ditulis hanya baris milik kru yang
   memang sedang disunting, jadi head divisi lain tidak perlu menunggu. */
function simpan_sel($rows, $hapus, $by) {
  $pdo = db();
  pastikan_tabel($pdo);
  if (!is_array($rows))  $rows  = array();
  if (!is_array($hapus)) $hapus = array();

  $now = ms();
  $by  = mb_substr(s($by), 0, 120);
  $nIsi = 0; $nHapus = 0;

  $pdo->beginTransaction();
  try {
    $up = $pdo->prepare(
      'INSERT INTO `jadwal_sel`
         (`user_id`,`tgl`,`shift`,`jam_mulai`,`jam_selesai`,`catatan`,`updated_at`,`updated_by`)
       VALUES (:u,:d,:t,:m,:s,:n,:ua,:ub)
       ON DUPLICATE KEY UPDATE
         `shift`=VALUES(`shift`), `jam_mulai`=VALUES(`jam_mulai`),
         `jam_selesai`=VALUES(`jam_selesai`), `catatan`=VALUES(`catatan`),
         `updated_at`=VALUES(`updated_at`), `updated_by`=VALUES(`updated_by`)');
    $del = $pdo->prepare('DELETE FROM `jadwal_sel` WHERE `user_id`=:u AND `tgl`=:d');

    foreach ($rows as $r) {
      $r = (array)$r;
      $u = mb_substr(s(isset($r['u']) ? $r['u'] : ''), 0, 64);
      $d = tgl_valid(isset($r['d']) ? $r['d'] : '');
      $t = mb_substr(s(isset($r['t']) ? $r['t'] : ''), 0, 16);
      if ($u === '' || $d === '' || $t === '') continue;    // baris cacat dilewati, bukan menggagalkan sisanya
      $up->execute(array(
        ':u' => $u, ':d' => $d, ':t' => $t,
        ':m' => jam_valid(isset($r['m']) ? $r['m'] : ''),
        ':s' => jam_valid(isset($r['s']) ? $r['s'] : ''),
        ':n' => mb_substr(s(isset($r['n']) ? $r['n'] : ''), 0, 120),
        ':ua' => $now, ':ub' => $by,
      ));
      $nIsi++;
    }
    foreach ($hapus as $r) {
      $r = (array)$r;
      $u = mb_substr(s(isset($r['u']) ? $r['u'] : ''), 0, 64);
      $d = tgl_valid(isset($r['d']) ? $r['d'] : '');
      if ($u === '' || $d === '') continue;
      $del->execute(array(':u' => $u, ':d' => $d));
      $nHapus++;
    }
    $pdo->commit();
  } catch (Throwable $e) {
    $pdo->rollBack();
    throw $e;
  }
  return array('saved' => true, 'isi' => $nIsi, 'hapus' => $nHapus, 'ts' => gmdate('c'));
}

/* ==================== SETTING ==================== */
function simpan_setting($data, $by) {
  if (!is_array($data) && !is_object($data)) throw new Exception('Payload setting kosong/invalid');
  $pdo = db();
  pastikan_tabel($pdo);
  $st = $pdo->prepare(
    'INSERT INTO `jadwal_setting` (`id`,`data`,`updated_at`,`updated_by`) VALUES (1,:d,:ua,:ub)
     ON DUPLICATE KEY UPDATE `data`=VALUES(`data`), `updated_at`=VALUES(`updated_at`), `updated_by`=VALUES(`updated_by`)');
  $st->execute(array(':d' => json_enc($data), ':ua' => ms(), ':ub' => mb_substr(s($by), 0, 120)));
  return array('saved' => true, 'ts' => gmdate('c'));
}

/* ==================== PENGAJUAN ====================
   Kru mengajukan, head/admin memutuskan. Yang MEMUTUSKAN tidak pernah
   memakai endpoint ini — `status` di sini selalu dipaksa MENUNGGU, apa pun
   yang dikirim client. Kalau tidak, siapa pun yang bisa memanggil API bisa
   mengirim pengajuannya sendiri dengan status DISETUJUI dan melewati head. */
function simpan_pengajuan($row, $by) {
  $pdo = db();
  pastikan_tabel($pdo);
  $row = (array)$row;

  $id = mb_substr(s(isset($row['id']) ? $row['id'] : ''), 0, 32);
  if ($id === '') $id = 'A' . base_convert((string)ms(), 10, 36) . random_int(100, 999);
  $u  = mb_substr(s(isset($row['userId']) ? $row['userId'] : ''), 0, 64);
  $a  = tgl_valid(isset($row['dari']) ? $row['dari'] : '');
  $b  = tgl_valid(isset($row['sampai']) ? $row['sampai'] : '');
  if ($b === '') $b = $a;
  $jenis = strtoupper(mb_substr(s(isset($row['jenis']) ? $row['jenis'] : 'OFF'), 0, 16));
  if ($u === '' || $a === '') throw new Exception('Pengajuan butuh kru dan tanggal');
  if ($b < $a) { $t = $a; $a = $b; $b = $t; }

  $st = $pdo->prepare(
    'INSERT INTO `jadwal_pengajuan`
       (`id`,`user_id`,`jenis`,`tgl_mulai`,`tgl_selesai`,`alasan`,`status`,`dibuat_at`,`dibuat_oleh`,
        `shift`,`jam_mulai`,`jam_selesai`)
     VALUES (:id,:u,:j,:a,:b,:al,\'MENUNGGU\',:t,:by,:sh,:jm,:js)
     ON DUPLICATE KEY UPDATE
       `jenis`=VALUES(`jenis`), `tgl_mulai`=VALUES(`tgl_mulai`),
       `tgl_selesai`=VALUES(`tgl_selesai`), `alasan`=VALUES(`alasan`),
       `shift`=VALUES(`shift`), `jam_mulai`=VALUES(`jam_mulai`),
       `jam_selesai`=VALUES(`jam_selesai`)');
  $st->execute(array(
    ':id' => $id, ':u' => $u, ':j' => $jenis, ':a' => $a, ':b' => $b,
    ':al' => mb_substr(s(isset($row['alasan']) ? $row['alasan'] : ''), 0, 2000),
    ':t' => ms(), ':by' => mb_substr(s($by), 0, 120),
    /* Shift yang diminta. TIDAK divalidasi terhadap daftar shift: definisi
       shift tinggal di jadwal_setting sebagai blob JSON dan admin bebas
       menambah/mengganti namanya, jadi daftar sah di sini akan selalu
       ketinggalan. Frontend hanya menawarkan shift yang ada, dan putusan
       akhir tetap di tangan head yang menyetujui. */
    ':sh' => mb_substr(s(isset($row['shift']) ? $row['shift'] : ''), 0, 16),
    ':jm' => jam_valid(isset($row['jamMulai']) ? $row['jamMulai'] : ''),
    ':js' => jam_valid(isset($row['jamSelesai']) ? $row['jamSelesai'] : ''),
  ));
  return array('saved' => true, 'id' => $id);
}

function putus_pengajuan($id, $status, $nota, $by) {
  $pdo = db();
  pastikan_tabel($pdo);
  $id = s($id);
  $status = strtoupper(s($status));
  if (!in_array($status, array('DISETUJUI', 'DITOLAK', 'MENUNGGU'), true)) {
    throw new Exception('Status putusan tidak dikenal: ' . $status);
  }
  $st = $pdo->prepare(
    'UPDATE `jadwal_pengajuan`
        SET `status`=:s, `putus_at`=:t, `putus_oleh`=:by, `putus_nota`=:n
      WHERE `id`=:id');
  $st->execute(array(
    ':s' => $status, ':t' => ms(), ':by' => mb_substr(s($by), 0, 120),
    ':n' => mb_substr(s($nota), 0, 255), ':id' => $id,
  ));
  if ($st->rowCount() === 0) {
    // rowCount 0 juga terjadi kalau statusnya sudah sama persis — bukan error.
    $ada = $pdo->prepare('SELECT 1 FROM `jadwal_pengajuan` WHERE `id`=:id');
    $ada->execute(array(':id' => $id));
    if (!$ada->fetch()) throw new Exception('Pengajuan tidak ditemukan: ' . $id);
  }
  return array('saved' => true, 'id' => $id, 'status' => $status);
}

function hapus_pengajuan($id) {
  $pdo = db();
  pastikan_tabel($pdo);
  $st = $pdo->prepare('DELETE FROM `jadwal_pengajuan` WHERE `id`=:id');
  $st->execute(array(':id' => s($id)));
  return array('deleted' => true, 'id' => s($id));
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
               'sel' => 0, 'pengajuan' => 0, 'menunggu' => 0, 'ada' => false);
  try {
    $pdo = db();
    $out['sel']       = (int)$pdo->query('SELECT COUNT(*) n FROM `jadwal_sel`')->fetch()['n'];
    $out['pengajuan'] = (int)$pdo->query('SELECT COUNT(*) n FROM `jadwal_pengajuan`')->fetch()['n'];
    $out['menunggu']  = (int)$pdo->query('SELECT COUNT(*) n FROM `jadwal_pengajuan` WHERE `status`=\'MENUNGGU\'')->fetch()['n'];
    $out['ada'] = true;
  } catch (Throwable $e) { /* tabel belum dibuat — biarkan nol, bukan error */ }
  $out['ts'] = gmdate('c');
  return $out;
}
