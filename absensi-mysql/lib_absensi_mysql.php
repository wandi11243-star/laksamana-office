<?php
/************************************************************************
 * ABSENSI LAKSAMANA — pustaka MySQL
 * ---------------------------------------------------------------------
 * SATU KALIMAT YANG MENJELASKAN SELURUH BERKAS INI:
 *   yang disimpan hanyalah KETUKAN; telat, lembur, dan durasi kerja tidak
 *   pernah disimpan, selalu dihitung ulang dari ketukan + shift.
 *
 * Alasannya: shift bisa berubah setelah absen (head merapikan jadwal
 * kemarin), dan sebuah pengajuan bisa disetujui berhari-hari kemudian.
 * Angka yang disimpan tidak ikut berubah oleh keduanya, dan laporan yang
 * salah karena itu tidak menimbulkan galat apa pun — ia hanya salah.
 *
 * TIGA SUMBER DI LUAR MODUL INI, semuanya lewat HTTP server-ke-server:
 *   account-api-mysql  action=whoami      -> siapa pemanggilnya (identitas)
 *   jadwal-api-mysql   action=shiftHari   -> shift kru tetap hari itu
 *   dw-api-mysql       action=jadwalDW    -> shift pekerja harian hari itu
 * Tidak ada satu pun yang dibaca langsung dari database, karena tiap modul
 * punya database & user MySQL sendiri (lihat config.sample.php masing-masing).
 ************************************************************************/

if (file_exists(__DIR__ . '/config.php'))      require __DIR__ . '/config.php';
else if (file_exists(__DIR__ . '/config.dev.php')) require __DIR__ . '/config.dev.php';
else                                            require __DIR__ . '/config.sample.php';

if (!defined('ENV_LABEL')) define('ENV_LABEL', 'dev');

/* ---------------------------------------------------------------------
 * Sambungan database
 * ------------------------------------------------------------------- */
function db() {
  static $pdo = null;
  if ($pdo instanceof PDO) return $pdo;
  $dsn = 'mysql:host=' . DB_HOST . ';port=' . (defined('DB_PORT') ? DB_PORT : 3306)
       . ';dbname=' . DB_NAME . ';charset=utf8mb4';
  $pdo = new PDO($dsn, DB_USER, DB_PASS, array(
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    /* Penanda bernama diikat BERDASARKAN POSISI karena emulasi dimatikan:
       satu nama yang dipakai dua kali dalam satu prepare() gagal dengan
       SQLSTATE[HY093] yang tidak menyebut kolom apa pun. Sudah memakan satu
       sesi penuh di modul DW pada 5 Agustus 2026 — jangan pernah memakai
       ulang satu nama penanda di berkas ini. */
    PDO::ATTR_EMULATE_PREPARES   => false,
  ));
  return $pdo;
}

function s($x) { return $x === null ? '' : (string)$x; }
function uid32($p = 'p') { return $p . dechex(time()) . bin2hex(random_bytes(5)); }

/* WIB dipakai eksplisit, bukan zona waktu server. Hosting bersama sering
   berjalan di UTC, dan absensi yang menghitung "telat" dengan jam yang
   bergeser 7 jam adalah kegagalan yang tidak terlihat sebagai galat. */
function wib($epochMs = null) {
  $ms = $epochMs === null ? (int)round(microtime(true) * 1000) : (int)$epochMs;
  return $ms + 7 * 3600 * 1000;
}
function jam_wib($epochMs)  { return gmdate('H:i', (int)floor(wib($epochMs) / 1000)); }
function tgl_wib($epochMs)  { return gmdate('Y-m-d', (int)floor(wib($epochMs) / 1000)); }
function menit_wib($epochMs){
  $d = (int)floor(wib($epochMs) / 1000);
  return ((int)gmdate('H', $d)) * 60 + (int)gmdate('i', $d);
}
function jam_ke_menit($hhmm) {
  $hhmm = s($hhmm);
  if (!preg_match('/^(\d{1,2}):(\d{2})$/', $hhmm, $m)) return -1;
  return ((int)$m[1]) * 60 + (int)$m[2];
}
function tgl_valid($t) {
  $t = s($t);
  return preg_match('/^\d{4}-\d{2}-\d{2}$/', $t) ? $t : '';
}

/* ---------------------------------------------------------------------
 * Pembuatan tabel & penambahan kolom pada pemasangan lama
 * ------------------------------------------------------------------- */
function pastikan_tabel($pdo = null) {
  static $sudah = false;
  if ($sudah) return;
  $pdo = $pdo ?: db();
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS `abs_lokasi` (
      `id` VARCHAR(32) NOT NULL PRIMARY KEY,
      `nama` VARCHAR(120) NOT NULL,
      `lat` DECIMAL(10,7) NOT NULL DEFAULT 0,
      `lng` DECIMAL(10,7) NOT NULL DEFAULT 0,
      `radius_m` INT NOT NULL DEFAULT 120,
      `aktif` TINYINT NOT NULL DEFAULT 1,
      `updated_at` BIGINT NOT NULL DEFAULT 0,
      `updated_by` VARCHAR(120) NOT NULL DEFAULT ""
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS `abs_wajah` (
      `subjek` VARCHAR(72) NOT NULL PRIMARY KEY,
      `nama` VARCHAR(120) NOT NULL DEFAULT "",
      `descriptor` TEXT NULL,
      `foto` MEDIUMTEXT NULL,
      `aktif` TINYINT NOT NULL DEFAULT 1,
      `daftar_at` BIGINT NOT NULL DEFAULT 0,
      `daftar_oleh` VARCHAR(120) NOT NULL DEFAULT ""
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS `abs_punch` (
      `id` VARCHAR(32) NOT NULL PRIMARY KEY,
      `subjek_tipe` VARCHAR(8) NOT NULL DEFAULT "USER",
      `subjek_id` VARCHAR(64) NOT NULL,
      `nama` VARCHAR(120) NOT NULL DEFAULT "",
      `tgl` DATE NOT NULL,
      `arah` VARCHAR(8) NOT NULL,
      `waktu` BIGINT NOT NULL DEFAULT 0,
      `jam` VARCHAR(5) NOT NULL DEFAULT "",
      `lat` DECIMAL(10,7) NOT NULL DEFAULT 0,
      `lng` DECIMAL(10,7) NOT NULL DEFAULT 0,
      `akurasi_m` INT NOT NULL DEFAULT 0,
      `lokasi_id` VARCHAR(32) NOT NULL DEFAULT "",
      `jarak_m` INT NOT NULL DEFAULT -1,
      `dalam_area` TINYINT NOT NULL DEFAULT 0,
      `wajah_skor` DECIMAL(5,4) NOT NULL DEFAULT 1,
      `wajah_ok` TINYINT NOT NULL DEFAULT 0,
      `shift_kode` VARCHAR(16) NOT NULL DEFAULT "",
      `shift_mulai` VARCHAR(5) NOT NULL DEFAULT "",
      `shift_selesai` VARCHAR(5) NOT NULL DEFAULT "",
      `shift_sumber` VARCHAR(8) NOT NULL DEFAULT "NONE",
      `dalam_shift` TINYINT NOT NULL DEFAULT 0,
      `status` VARCHAR(16) NOT NULL DEFAULT "VALID",
      `sebab` VARCHAR(32) NOT NULL DEFAULT "",
      `alasan` VARCHAR(255) NOT NULL DEFAULT "",
      `foto` MEDIUMTEXT NULL,
      `putus_at` BIGINT NOT NULL DEFAULT 0,
      `putus_oleh` VARCHAR(120) NOT NULL DEFAULT "",
      `putus_nota` VARCHAR(255) NOT NULL DEFAULT "",
      `dibuat_at` BIGINT NOT NULL DEFAULT 0,
      UNIQUE KEY `uq_punch` (`subjek_tipe`,`subjek_id`,`tgl`,`arah`),
      KEY `idx_punch_tgl` (`tgl`),
      KEY `idx_punch_status` (`status`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS `abs_setting` (
      `id` TINYINT UNSIGNED NOT NULL PRIMARY KEY,
      `data` LONGTEXT NOT NULL,
      `updated_at` BIGINT NOT NULL DEFAULT 0,
      `updated_by` VARCHAR(120) NOT NULL DEFAULT ""
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
  $sudah = true;
}

/* Menambah kolom pada pemasangan yang tabelnya sudah lahir lebih dulu.
   Pola yang sama dipakai jadwal & dw: menambah kolom lewat CREATE TABLE
   tidak berlaku untuk tabel yang sudah ada, dan pemasangan lama akan gagal
   dengan "Unknown column" yang membingungkan. */
function pastikan_kolom($pdo, $tabel, $kolom, $ddl) {
  try {
    $st = $pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS
                          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');
    $st->execute(array($tabel, $kolom));
    if ((int)$st->fetchColumn() === 0) $pdo->exec('ALTER TABLE `' . $tabel . '` ADD COLUMN ' . $ddl);
  } catch (Exception $e) { /* hak akses terbatas: dibiarkan, bukan menggagalkan permintaan */ }
}

/* ---------------------------------------------------------------------
 * PENGATURAN
 * ------------------------------------------------------------------- */
function setting_bawaan() {
  return array(
    /* Menit toleransi sebelum seseorang dihitung telat. Bukan kemurahan
       hati: GPS dan jam HP tidak pernah sepakat sampai ke detik, dan
       menghukum keterlambatan 40 detik membuat seluruh angka telat
       kehilangan arti. */
    'toleransiTelat'  => 5,
    /* Seberapa awal ketukan MASUK masih dianggap "di dalam shift". Kru yang
       datang 45 menit sebelum shift tidak sedang melanggar apa pun. */
    'awalMenit'       => 60,
    /* Seberapa lama sesudah shift berakhir ketukan PULANG masih wajar. */
    'akhirMenit'      => 180,
    /* Lembur di bawah angka ini diabaikan — 4 menit menunggu taksi bukan
       lembur, dan mencatatnya membuat laporan lembur penuh derau. */
    'lemburMinMenit'  => 15,
    /* Ambang kemiripan wajah (jarak euclidean face-api.js). 0.45 adalah
       nilai yang lazim: di bawahnya orang berbeda mulai lolos, di atasnya
       orang yang sama sering ditolak karena cahaya. */
    'wajahAmbang'     => 0.45,
    /* Wajah WAJIB atau sekadar bukti tambahan. Bawaannya tidak wajib supaya
       modul bisa dipakai sejak hari pertama sementara pendaftaran wajah
       masih berjalan; dinyalakan kalau semua kru sudah terdaftar. */
    'wajahWajib'      => false,
    /* Absen tanpa shift sama sekali. Bawaannya HARUS mengajukan — kalau
       dibalik, orang yang tidak dijadwalkan bisa mencatat hari kerja penuh
       tanpa satu pun persetujuan. */
    'tanpaShiftBoleh' => false,
    /* user_id Office yang boleh memutus pengajuan. Kosong = semua admin
       modul (dan hanya mereka). Pola yang sama dengan daftar HR di modul DW. */
    'hr'              => array(),
  );
}
function baca_setting() {
  $pdo = db(); pastikan_tabel($pdo);
  $st = $pdo->query('SELECT `data` FROM `abs_setting` WHERE `id` = 1');
  $row = $st->fetch();
  $d = $row ? json_decode($row['data'], true) : null;
  if (!is_array($d)) $d = array();
  return array_merge(setting_bawaan(), $d);
}
function simpan_setting($data, $by) {
  $pdo = db(); pastikan_tabel($pdo);
  $bersih = array_merge(setting_bawaan(), is_array($data) ? $data : array());
  $st = $pdo->prepare(
    'INSERT INTO `abs_setting` (`id`,`data`,`updated_at`,`updated_by`) VALUES (1,:d,:t,:b)
     ON DUPLICATE KEY UPDATE `data`=VALUES(`data`),`updated_at`=VALUES(`updated_at`),`updated_by`=VALUES(`updated_by`)');
  $st->execute(array(':d' => json_encode($bersih, JSON_UNESCAPED_UNICODE),
                     ':t' => (int)round(microtime(true) * 1000), ':b' => s($by)));
  return $bersih;
}

/* ---------------------------------------------------------------------
 * LOKASI & JARAK
 * ------------------------------------------------------------------- */
function daftar_lokasi($hanyaAktif = true) {
  $pdo = db(); pastikan_tabel($pdo);
  $sql = 'SELECT * FROM `abs_lokasi`' . ($hanyaAktif ? ' WHERE `aktif` = 1' : '') . ' ORDER BY `nama`';
  $out = array();
  foreach ($pdo->query($sql)->fetchAll() as $r) {
    $out[] = array('id' => $r['id'], 'nama' => $r['nama'],
      'lat' => (float)$r['lat'], 'lng' => (float)$r['lng'],
      'radius' => (int)$r['radius_m'], 'aktif' => (int)$r['aktif'] ? 1 : 0);
  }
  return $out;
}
function simpan_lokasi($row, $by) {
  $pdo = db(); pastikan_tabel($pdo);
  $id = s(isset($row['id']) ? $row['id'] : '');
  if ($id === '') $id = uid32('loc');
  $nama = trim(s(isset($row['nama']) ? $row['nama'] : ''));
  if ($nama === '') throw new Exception('Nama lokasi wajib diisi.');
  $st = $pdo->prepare(
    'INSERT INTO `abs_lokasi` (`id`,`nama`,`lat`,`lng`,`radius_m`,`aktif`,`updated_at`,`updated_by`)
     VALUES (:i,:n,:la,:lo,:r,:a,:t,:b)
     ON DUPLICATE KEY UPDATE `nama`=VALUES(`nama`),`lat`=VALUES(`lat`),`lng`=VALUES(`lng`),
       `radius_m`=VALUES(`radius_m`),`aktif`=VALUES(`aktif`),
       `updated_at`=VALUES(`updated_at`),`updated_by`=VALUES(`updated_by`)');
  $st->execute(array(':i' => $id, ':n' => $nama,
    ':la' => (float)(isset($row['lat']) ? $row['lat'] : 0),
    ':lo' => (float)(isset($row['lng']) ? $row['lng'] : 0),
    /* Radius minimal 30 m: akurasi GPS ponsel di dalam bangunan jarang
       lebih baik dari itu, dan radius 10 m menghasilkan kru yang berdiri di
       dalam kantor tapi dinyatakan di luar area. */
    ':r' => max(30, min(2000, (int)(isset($row['radius']) ? $row['radius'] : 120))),
    ':a' => empty($row['aktif']) ? 0 : 1,
    ':t' => (int)round(microtime(true) * 1000), ':b' => s($by)));
  return $id;
}
function hapus_lokasi($id) {
  $pdo = db(); pastikan_tabel($pdo);
  $st = $pdo->prepare('DELETE FROM `abs_lokasi` WHERE `id` = :i');
  $st->execute(array(':i' => s($id)));
  return $st->rowCount();
}

/* Jarak dua titik bumi dalam meter (haversine). Cukup akurat sampai
   ratusan kilometer; kesalahannya jauh di bawah akurasi GPS ponsel, jadi
   rumus yang lebih rumit tidak akan mengubah satu pun keputusan di sini. */
function jarak_meter($lat1, $lng1, $lat2, $lng2) {
  $R = 6371000.0;
  $p1 = deg2rad((float)$lat1); $p2 = deg2rad((float)$lat2);
  $dp = deg2rad((float)$lat2 - (float)$lat1);
  $dl = deg2rad((float)$lng2 - (float)$lng1);
  $a = sin($dp / 2) * sin($dp / 2) + cos($p1) * cos($p2) * sin($dl / 2) * sin($dl / 2);
  return (int)round($R * 2 * atan2(sqrt($a), sqrt(1 - $a)));
}

/* Lokasi kerja terdekat dari sebuah titik. Mengembalikan null kalau belum
   ada satu pun lokasi terdaftar — dan itu dibedakan dari "jauh dari semua
   lokasi": yang pertama berarti modulnya belum disiapkan, yang kedua
   berarti kru memang sedang di luar. Dua hal berbeda, dua pesan berbeda. */
function lokasi_terdekat($lat, $lng) {
  $best = null;
  foreach (daftar_lokasi(true) as $l) {
    if ($l['lat'] == 0 && $l['lng'] == 0) continue;   // lokasi yang belum diisi koordinatnya
    $j = jarak_meter($lat, $lng, $l['lat'], $l['lng']);
    if ($best === null || $j < $best['jarak']) $best = array('lokasi' => $l, 'jarak' => $j);
  }
  return $best;
}

/* ---------------------------------------------------------------------
 * WAJAH
 * ------------------------------------------------------------------- */
function kunci_subjek($tipe, $id) { return strtoupper(s($tipe)) . ':' . s($id); }

function simpan_wajah($tipe, $id, $nama, $descriptor, $foto, $by) {
  $pdo = db(); pastikan_tabel($pdo);
  if (!is_array($descriptor) || count($descriptor) !== 128)
    throw new Exception('Sidik wajah tidak lengkap (harus 128 angka). Coba daftarkan ulang.');
  foreach ($descriptor as $v) if (!is_numeric($v)) throw new Exception('Sidik wajah berisi nilai bukan angka.');
  $st = $pdo->prepare(
    'INSERT INTO `abs_wajah` (`subjek`,`nama`,`descriptor`,`foto`,`aktif`,`daftar_at`,`daftar_oleh`)
     VALUES (:s,:n,:d,:f,1,:t,:b)
     ON DUPLICATE KEY UPDATE `nama`=VALUES(`nama`),`descriptor`=VALUES(`descriptor`),
       `foto`=VALUES(`foto`),`aktif`=1,`daftar_at`=VALUES(`daftar_at`),`daftar_oleh`=VALUES(`daftar_oleh`)');
  $st->execute(array(':s' => kunci_subjek($tipe, $id), ':n' => s($nama),
    ':d' => json_encode(array_map('floatval', array_values($descriptor))),
    ':f' => $foto ? s($foto) : null,
    ':t' => (int)round(microtime(true) * 1000), ':b' => s($by)));
  return true;
}
function hapus_wajah($tipe, $id) {
  $pdo = db(); pastikan_tabel($pdo);
  $st = $pdo->prepare('DELETE FROM `abs_wajah` WHERE `subjek` = :s');
  $st->execute(array(':s' => kunci_subjek($tipe, $id)));
  return $st->rowCount();
}
/* Daftar wajah TANPA descriptor. Endpoint ini dibuka untuk layar HR supaya
   ia tahu siapa yang sudah/belum terdaftar — descriptor-nya sendiri tidak
   pernah ikut keluar dari server. */
function daftar_wajah() {
  $pdo = db(); pastikan_tabel($pdo);
  $out = array();
  foreach ($pdo->query('SELECT `subjek`,`nama`,`aktif`,`daftar_at`,`daftar_oleh`,
                               (`descriptor` IS NOT NULL) AS ada FROM `abs_wajah`')->fetchAll() as $r) {
    $p = explode(':', $r['subjek'], 2);
    $out[] = array('tipe' => $p[0], 'id' => isset($p[1]) ? $p[1] : '', 'nama' => $r['nama'],
      'aktif' => (int)$r['aktif'] ? 1 : 0, 'ada' => (int)$r['ada'] ? 1 : 0,
      'at' => (int)$r['daftar_at'], 'oleh' => $r['daftar_oleh']);
  }
  return $out;
}

/* Cocokkan descriptor yang baru diambil kamera dengan yang terdaftar.
   Mengembalikan array(skor, ok, terdaftar).

   PENCOCOKAN DIKERJAKAN DI SINI, BUKAN DI BROWSER. Kalau descriptor
   tersimpan dikirim ke HP kru untuk dibandingkan di sana, siapa pun yang
   membuka Developer Tools bisa membalas "cocok" tanpa menghadapkan wajah ke
   kamera sama sekali. */
function cocok_wajah($tipe, $id, $descriptor) {
  $pdo = db(); pastikan_tabel($pdo);
  $st = $pdo->prepare('SELECT `descriptor` FROM `abs_wajah` WHERE `subjek` = :s AND `aktif` = 1');
  $st->execute(array(':s' => kunci_subjek($tipe, $id)));
  $row = $st->fetch();
  if (!$row || !$row['descriptor']) return array('skor' => 1.0, 'ok' => false, 'terdaftar' => false);
  $simpan = json_decode($row['descriptor'], true);
  if (!is_array($simpan) || count($simpan) !== 128) return array('skor' => 1.0, 'ok' => false, 'terdaftar' => false);
  if (!is_array($descriptor) || count($descriptor) !== 128)
    return array('skor' => 1.0, 'ok' => false, 'terdaftar' => true);

  $sum = 0.0; $i = 0;
  foreach (array_values($simpan) as $v) {
    $d = (float)$v - (float)$descriptor[$i++];
    $sum += $d * $d;
  }
  $skor = sqrt($sum);
  $amb = (float)baca_setting()['wajahAmbang'];
  return array('skor' => round($skor, 4), 'ok' => $skor <= $amb, 'terdaftar' => true);
}

/* ---------------------------------------------------------------------
 * IDENTITAS PEMANGGIL — pola yang sama dengan stock-mysql
 * ------------------------------------------------------------------- */
function acc_url() {
  if (defined('ACCOUNT_API_URL') && ACCOUNT_API_URL !== '') return ACCOUNT_API_URL;
  $host = isset($_SERVER['SERVER_NAME']) ? $_SERVER['SERVER_NAME']
        : (isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '');
  if ($host === '') return '';
  $skema = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
  return $skema . '://' . $host . '/account-api-mysql/api.php';
}
function sisi_url($nama) {
  $host = isset($_SERVER['SERVER_NAME']) ? $_SERVER['SERVER_NAME']
        : (isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '');
  if ($host === '') return '';
  $skema = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
  return $skema . '://' . $host . '/' . $nama . '/api.php';
}

/* HTTP POST/GET sederhana ke modul tetangga. curl kalau ada, file_get_contents
   sebagai cadangan — sebagian hosting mematikan salah satunya. */
function http_json($url, $payload = null, $timeout = 8) {
  if ($url === '') return null;
  $jawab = null;
  if (function_exists('curl_init')) {
    $ch = curl_init($url);
    $opt = array(CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => $timeout, CURLOPT_FOLLOWLOCATION => true);
    if ($payload !== null) {
      $opt[CURLOPT_POST] = true;
      $opt[CURLOPT_POSTFIELDS] = json_encode($payload, JSON_UNESCAPED_UNICODE);
      $opt[CURLOPT_HTTPHEADER] = array('Content-Type: text/plain;charset=utf-8');
    }
    curl_setopt_array($ch, $opt);
    $jawab = curl_exec($ch);
    curl_close($ch);
  } else {
    $http = array('timeout' => $timeout);
    if ($payload !== null) {
      $http['method'] = 'POST';
      $http['header'] = "Content-Type: text/plain;charset=utf-8\r\n";
      $http['content'] = json_encode($payload, JSON_UNESCAPED_UNICODE);
    }
    $jawab = @file_get_contents($url, false, stream_context_create(array('http' => $http)));
  }
  if (!is_string($jawab) || $jawab === '') return null;
  $d = json_decode($jawab, true);
  return is_array($d) ? $d : null;
}

function whoami($token) {
  static $cache = array();
  $token = trim(s($token));
  if ($token === '') return null;
  if (array_key_exists($token, $cache)) return $cache[$token];
  $d = http_json(acc_url(), array('action' => 'whoami', 'token' => $token));
  if (!$d || empty($d['ok']) || empty($d['user'])) return $cache[$token] = null;
  return $cache[$token] = $d['user'];
}
/* Apakah akun ini diberi akses modul absensi di Office. Dipisah dari
   pemanggil_admin() karena keduanya menjawab pertanyaan berbeda: yang ini
   "boleh membuka", yang itu "boleh mengatur". */
function pemanggil_boleh($u) {
  if (!$u) return false;
  $m = isset($u['modules']) && is_array($u['modules']) ? $u['modules'] : array();
  return in_array('*', $m, true) || in_array('absensi', $m, true);
}

/* Login diteruskan ke account-api SERVER-KE-SERVER.
   Dua alasan, dan keduanya penting:
   1. API akun tidak perlu membuka CORS untuk subdomain absensi. Melonggarkan
      CORS di endpoint yang memegang PIN seluruh perusahaan adalah harga yang
      terlalu mahal untuk kenyamanan satu halaman.
   2. Alamat API akun cuma tertulis di SATU tempat (config.php). Kalau
      halaman HTML ikut menyimpannya, dev bisa diam-diam login ke akun
      produksi dan tidak ada yang terlihat salah. */
function teruskan_masuk($nama, $pin) {
  $nama = trim(s($nama)); $pin = trim(s($pin));
  if ($nama === '' || $pin === '') throw new Exception('Nama dan PIN wajib diisi.');
  $d = http_json(acc_url(), array('action' => 'login', 'name' => $nama, 'pin' => $pin));
  if (!$d) throw new Exception('Server akun tidak bisa dihubungi. Coba lagi sebentar.');
  if (empty($d['ok']) || empty($d['user'])) {
    $e = isset($d['error']) ? $d['error'] : '';
    /* Pesan mentah dari API akun ('invalid', 'missing') tidak berarti apa-apa
       bagi orang yang sedang berdiri di depan pintu. */
    if ($e === 'invalid') throw new Exception('Nama atau PIN salah.');
    if ($e === 'missing') throw new Exception('Nama dan PIN wajib diisi.');
    throw new Exception('Tidak bisa masuk' . ($e ? ': ' . $e : '.'));
  }
  $u = $d['user'];
  if (!pemanggil_boleh($u))
    throw new Exception('Akun ini belum diberi akses modul Absensi. Minta admin membukanya di Office.');
  if (empty($u['token']))
    throw new Exception('Server akun tidak memberi token sesi. Hubungi admin.');
  return $u;
}

function pemanggil_admin($u) {
  if (!$u) return false;
  $adm = isset($u['adminModules']) && is_array($u['adminModules']) ? $u['adminModules'] : array();
  return in_array('*', $adm, true) || in_array('absensi', $adm, true);
}
/* Boleh memutus pengajuan? Admin modul selalu boleh. Daftar `hr` yang kosong
   berarti HANYA admin — bukan "semua orang". Kalau dibalik, satu pengaturan
   yang lupa diisi diam-diam memberi seluruh kru hak menyetujui absensinya
   sendiri, dan tampilannya tetap normal. */
function pemanggil_hr($u) {
  if (!$u) return false;
  if (pemanggil_admin($u)) return true;
  $hr = baca_setting()['hr'];
  return is_array($hr) && in_array(s($u['id']), $hr, true);
}

/* ---------------------------------------------------------------------
 * SHIFT — dibaca dari modul jadwal (kru tetap) & dw (pekerja harian)
 * ------------------------------------------------------------------- */
/* Mengembalikan array(kode, mulai, selesai, sumber) atau null kalau orang
   ini memang tidak dijadwalkan hari itu.

   `mulai`/`selesai` selalu berupa HH:MM. Shift libur (OFF/IZIN/CUTI) pulang
   dengan jam kosong — itu BUKAN "tidak dijadwalkan", melainkan dijadwalkan
   untuk tidak bekerja, dan bedanya penting: absen saat OFF harus diajukan,
   dengan sebab yang menyebut OFF-nya. */
function shift_hari($tipe, $id, $tgl) {
  $tipe = strtoupper(s($tipe));
  $tgl  = tgl_valid($tgl);
  if ($tgl === '') return null;

  if ($tipe === 'DW') {
    $url = (defined('DW_API_URL') && DW_API_URL !== '') ? DW_API_URL : sisi_url('dw-api-mysql');
    if ($url === '') return null;
    $d = http_json($url . '?action=jadwalDW&dari=' . $tgl . '&sampai=' . $tgl);
    if (!$d || empty($d['ok']) || empty($d['data']['rows'])) return null;
    foreach ($d['data']['rows'] as $r) {
      if (s($r['dwId']) === s($id))
        return array('kode' => 'DW', 'mulai' => s($r['m']), 'selesai' => s($r['s']),
                     'sumber' => 'DW', 'libur' => 0);
    }
    return null;
  }

  $url = (defined('JADWAL_API_URL') && JADWAL_API_URL !== '') ? JADWAL_API_URL : sisi_url('jadwal-api-mysql');
  if ($url === '') return null;
  $d = http_json($url . '?action=shiftHari&user=' . rawurlencode(s($id)) . '&dari=' . $tgl . '&sampai=' . $tgl);
  if (!$d || empty($d['ok']) || empty($d['data']['rows'])) return null;
  foreach ($d['data']['rows'] as $r) {
    if (s($r['u']) === s($id))
      return array('kode' => s($r['t']), 'mulai' => s($r['m']), 'selesai' => s($r['s']),
                   'sumber' => 'ROSTER', 'libur' => empty($r['libur']) ? 0 : 1);
  }
  return null;
}

/* ---------------------------------------------------------------------
 * PENILAIAN SATU KETUKAN
 * ------------------------------------------------------------------- */
/* Apakah `menit` berada dalam rentang shift + toleransi. Shift yang
   berakhir sebelum jam mulainya (mis. 18:00-02:00) berarti melewati tengah
   malam — tanpa penanganan ini, seluruh shift malam dinyatakan "di luar
   shift" dan setiap kru malam harus mengajukan tiap hari. */
function dalam_rentang_shift($menit, $mulai, $selesai, $awal, $akhir) {
  $m = jam_ke_menit($mulai); $s = jam_ke_menit($selesai);
  if ($m < 0 || $s < 0) return false;
  if ($s <= $m) $s += 1440;
  $a = $m - $awal; $b = $s + $akhir;
  if ($menit >= $a && $menit <= $b) return true;
  /* Ketukan sesudah tengah malam untuk shift yang mulai kemarin: menitnya
     kecil (mis. 01:30 = 90) sementara rentangnya 1080..1560. */
  $menit2 = $menit + 1440;
  return ($menit2 >= $a && $menit2 <= $b);
}

/* Tanggal KERJA sebuah ketukan PULANG. Kru shift malam menekan pulang pada
   tanggal berikutnya menurut jam dinding, tapi hari kerjanya adalah tanggal
   ia masuk. Tanpa ini, jam pulang tercatat di hari yang tidak punya jam
   masuk, dan dua-duanya jadi tidak lengkap. */
function tgl_kerja_pulang($tipe, $id, $sekarangMs) {
  $pdo = db(); pastikan_tabel($pdo);
  $hariIni = tgl_wib($sekarangMs);
  $st = $pdo->prepare(
    'SELECT `tgl`,`waktu` FROM `abs_punch`
      WHERE `subjek_tipe`=:t AND `subjek_id`=:i AND `arah`="MASUK" AND `status`<>"DITOLAK"
        AND `waktu` >= :w ORDER BY `waktu` DESC LIMIT 1');
  $st->execute(array(':t' => strtoupper(s($tipe)), ':i' => s($id),
                     ':w' => (int)$sekarangMs - 18 * 3600 * 1000));
  $row = $st->fetch();
  return $row ? $row['tgl'] : $hariIni;
}

/* ---------------------------------------------------------------------
 * MENCATAT KETUKAN
 * ------------------------------------------------------------------- */
function catat_punch($p, $pemanggil) {
  $pdo = db(); pastikan_tabel($pdo);
  $set = baca_setting();

  $tipe = strtoupper(s(isset($p['tipe']) ? $p['tipe'] : 'USER'));
  if ($tipe !== 'USER' && $tipe !== 'DW') $tipe = 'USER';
  $id   = s(isset($p['id']) ? $p['id'] : '');
  $nama = s(isset($p['nama']) ? $p['nama'] : '');
  $arah = strtoupper(s(isset($p['arah']) ? $p['arah'] : ''));
  if ($arah !== 'MASUK' && $arah !== 'PULANG') throw new Exception('Arah absen harus MASUK atau PULANG.');
  if ($id === '') throw new Exception('Identitas tidak dikenali.');

  /* WAKTU DIAMBIL DARI SERVER, BUKAN DARI HP. Jam HP bisa diputar mundur
     dalam sepuluh detik lewat Pengaturan, dan absensi yang mempercayainya
     tidak mencatat apa pun yang berarti. */
  $now = (int)round(microtime(true) * 1000);

  $lat = (float)(isset($p['lat']) ? $p['lat'] : 0);
  $lng = (float)(isset($p['lng']) ? $p['lng'] : 0);
  $akr = (int)(isset($p['akurasi']) ? $p['akurasi'] : 0);

  $adaLokasi = count(daftar_lokasi(true)) > 0;
  $dekat = ($lat || $lng) ? lokasi_terdekat($lat, $lng) : null;
  $jarak = $dekat ? $dekat['jarak'] : -1;
  $lokId = $dekat ? $dekat['lokasi']['id'] : '';
  $dalamArea = $dekat ? ($dekat['jarak'] <= $dekat['lokasi']['radius']) : false;
  /* Belum ada lokasi terdaftar sama sekali = modulnya belum disiapkan.
     Menyatakan semua orang "di luar area" pada keadaan itu akan mengirim
     SELURUH absensi hari pertama ke antrean pengajuan. */
  if (!$adaLokasi) { $dalamArea = true; $jarak = -1; }

  $shift = shift_hari($tipe, $id, tgl_wib($now));
  $menit = menit_wib($now);
  $dalamShift = false;
  if ($shift && empty($shift['libur']))
    $dalamShift = dalam_rentang_shift($menit, $shift['mulai'], $shift['selesai'],
                                      (int)$set['awalMenit'], (int)$set['akhirMenit']);

  /* SELALU dipanggil, walau descriptor-nya tidak dikirim. Sebelumnya
     pemanggilannya dibungkus `if (isset($p['descriptor']))`, dan itu lubang
     yang paling lebar di seluruh modul ini: siapa pun yang mengirim
     permintaan TANPA descriptor tercatat sebagai "wajah belum terdaftar" dan
     lolos tanpa diperiksa sama sekali. cocok_wajah sendiri sudah menjawab
     terdaftar=true, ok=false untuk descriptor yang tidak sah. */
  $w = cocok_wajah($tipe, $id, isset($p['descriptor']) ? $p['descriptor'] : null);

  /* SIAPA YANG WAJAHNYA SUDAH DIDAFTARKAN, WAJIB COCOK — tanpa perlu
     menyalakan setelan apa pun.

     Sampai 10 Agustus 2026 pemeriksaan ini seluruhnya bergantung pada
     setelan `wajahWajib`, yang bawaannya MATI supaya modul bisa dipakai
     sejak hari pertama sementara pendaftaran wajah masih berjalan. Akibatnya
     wajah yang jelas-jelas BUKAN orangnya tetap menghasilkan absen VALID:
     skornya dicatat, ketidakcocokannya dicatat, dan tidak ada satu pun yang
     terjadi karenanya. Sudah diuji orang dan memang tembus.

     Aturan sekarang dipisah menurut keadaan, bukan menurut satu saklar:
       sudah terdaftar  -> HARUS cocok. Tidak cocok = masuk antrean HR.
       belum terdaftar  -> hanya dihalangi kalau `wajahWajib` menyala.
     Yang belum terdaftar tidak mungkin dicocokkan dengan apa pun, jadi
     menghalanginya secara bawaan cuma mengunci seluruh kru di hari pertama
     — dan yang terjadi berikutnya selalu sama: setelannya dimatikan orang,
     dan pemeriksaannya hilang untuk semua orang sekaligus. */
  $wajahHalangi = $w['terdaftar'] ? !$w['ok'] : !empty($set['wajahWajib']);

  $sebab = '';
  if (!$dalamArea)                          $sebab = 'LUAR_AREA';
  else if (!$shift)                         $sebab = empty($set['tanpaShiftBoleh']) ? 'TANPA_SHIFT' : '';
  else if (!empty($shift['libur']))         $sebab = 'HARI_LIBUR';
  else if (!$dalamShift)                    $sebab = 'LUAR_SHIFT';
  /* Dua sebab yang berbeda, dan bedanya penting bagi yang membacanya:
     WAJAH        = wajahnya terdaftar tapi tidak cocok — ini yang harus
                    dilihat HR dengan curiga.
     WAJAH_KOSONG = wajahnya belum pernah didaftarkan — pekerjaan admin,
                    bukan kecurigaan. Menyamakan keduanya membuat HR
                    menyetujui yang pertama sesering yang kedua. */
  if ($sebab === '' && $wajahHalangi)
    $sebab = $w['terdaftar'] ? 'WAJAH' : 'WAJAH_KOSONG';

  $status = $sebab === '' ? 'VALID' : 'MENUNGGU';
  $alasan = trim(s(isset($p['alasan']) ? $p['alasan'] : ''));
  if ($status === 'MENUNGGU' && $alasan === '')
    throw new Exception('Absen ini di luar ketentuan, jadi harus disertai alasan untuk diajukan.');

  $tgl = $arah === 'PULANG' ? tgl_kerja_pulang($tipe, $id, $now) : tgl_wib($now);

  /* MASUK: yang pertama menang. Ketukan kedua tidak menimpa dan tidak
     dianggap galat — kru yang menekan dua kali karena sinyal lambat tidak
     sedang melakukan kesalahan, ia cuma perlu diberi tahu sudah tercatat. */
  if ($arah === 'MASUK') {
    $st = $pdo->prepare('SELECT * FROM `abs_punch`
                          WHERE `subjek_tipe`=:t AND `subjek_id`=:i AND `tgl`=:d AND `arah`="MASUK"');
    $st->execute(array(':t' => $tipe, ':i' => $id, ':d' => $tgl));
    $ada = $st->fetch();
    if ($ada) return array('duplikat' => true, 'punch' => bentuk_punch($ada));
  }

  $row = array(
    ':id' => uid32('ab'), ':t' => $tipe, ':i' => $id, ':n' => $nama, ':d' => $tgl, ':a' => $arah,
    ':w' => $now, ':j' => jam_wib($now), ':la' => $lat, ':lo' => $lng, ':ak' => $akr,
    ':lk' => $lokId, ':jr' => $jarak, ':da' => $dalamArea ? 1 : 0,
    ':ws' => $w['skor'], ':wo' => $w['ok'] ? 1 : 0,
    ':sk' => $shift ? s($shift['kode']) : '', ':sm' => $shift ? s($shift['mulai']) : '',
    ':ss' => $shift ? s($shift['selesai']) : '', ':su' => $shift ? s($shift['sumber']) : 'NONE',
    ':ds' => $dalamShift ? 1 : 0, ':st' => $status, ':sb' => $sebab, ':al' => $alasan,
    ':fo' => isset($p['foto']) && $p['foto'] ? s($p['foto']) : null, ':cr' => $now,
  );
  $sql = 'INSERT INTO `abs_punch`
    (`id`,`subjek_tipe`,`subjek_id`,`nama`,`tgl`,`arah`,`waktu`,`jam`,`lat`,`lng`,`akurasi_m`,
     `lokasi_id`,`jarak_m`,`dalam_area`,`wajah_skor`,`wajah_ok`,`shift_kode`,`shift_mulai`,
     `shift_selesai`,`shift_sumber`,`dalam_shift`,`status`,`sebab`,`alasan`,`foto`,`dibuat_at`)
    VALUES (:id,:t,:i,:n,:d,:a,:w,:j,:la,:lo,:ak,:lk,:jr,:da,:ws,:wo,:sk,:sm,:ss,:su,:ds,:st,:sb,:al,:fo,:cr)';
  /* PULANG: yang terakhir menang — orang memang bisa pulang lalu diminta
     kembali, dan jam pulang yang sah adalah yang paling akhir. Kolom
     keputusan ikut dikosongkan: ketukan baru berarti pengajuan baru, bukan
     ketukan lama yang sudah disetujui. */
  if ($arah === 'PULANG') {
    $sql .= ' ON DUPLICATE KEY UPDATE `waktu`=VALUES(`waktu`),`jam`=VALUES(`jam`),
      `lat`=VALUES(`lat`),`lng`=VALUES(`lng`),`akurasi_m`=VALUES(`akurasi_m`),
      `lokasi_id`=VALUES(`lokasi_id`),`jarak_m`=VALUES(`jarak_m`),`dalam_area`=VALUES(`dalam_area`),
      `wajah_skor`=VALUES(`wajah_skor`),`wajah_ok`=VALUES(`wajah_ok`),
      `shift_kode`=VALUES(`shift_kode`),`shift_mulai`=VALUES(`shift_mulai`),
      `shift_selesai`=VALUES(`shift_selesai`),`shift_sumber`=VALUES(`shift_sumber`),
      `dalam_shift`=VALUES(`dalam_shift`),`status`=VALUES(`status`),`sebab`=VALUES(`sebab`),
      `alasan`=VALUES(`alasan`),`foto`=VALUES(`foto`),
      `putus_at`=0,`putus_oleh`="",`putus_nota`=""';
  }
  $pdo->prepare($sql)->execute($row);

  $st = $pdo->prepare('SELECT * FROM `abs_punch` WHERE `subjek_tipe`=:t AND `subjek_id`=:i AND `tgl`=:d AND `arah`=:a');
  $st->execute(array(':t' => $tipe, ':i' => $id, ':d' => $tgl, ':a' => $arah));
  return array('duplikat' => false, 'punch' => bentuk_punch($st->fetch()),
               'wajahTerdaftar' => $w['terdaftar']);
}

function bentuk_punch($r) {
  if (!$r) return null;
  return array(
    'id' => $r['id'], 'tipe' => $r['subjek_tipe'], 'uid' => $r['subjek_id'], 'nama' => $r['nama'],
    'tgl' => $r['tgl'], 'arah' => $r['arah'], 'waktu' => (int)$r['waktu'], 'jam' => $r['jam'],
    'lat' => (float)$r['lat'], 'lng' => (float)$r['lng'], 'akurasi' => (int)$r['akurasi_m'],
    'lokasi' => $r['lokasi_id'], 'jarak' => (int)$r['jarak_m'], 'dalamArea' => (int)$r['dalam_area'] ? 1 : 0,
    'wajahSkor' => (float)$r['wajah_skor'], 'wajahOk' => (int)$r['wajah_ok'] ? 1 : 0,
    'shift' => $r['shift_kode'], 'm' => $r['shift_mulai'], 's' => $r['shift_selesai'],
    'sumber' => $r['shift_sumber'], 'dalamShift' => (int)$r['dalam_shift'] ? 1 : 0,
    'status' => $r['status'], 'sebab' => $r['sebab'], 'alasan' => $r['alasan'],
    'putusAt' => (int)$r['putus_at'], 'putusOleh' => $r['putus_oleh'], 'putusNota' => $r['putus_nota'],
  );
}

/* ---------------------------------------------------------------------
 * KEPUTUSAN HR
 * ------------------------------------------------------------------- */
function putus_punch($id, $status, $nota, $by) {
  $pdo = db(); pastikan_tabel($pdo);
  $status = strtoupper(s($status));
  if ($status !== 'VALID' && $status !== 'DITOLAK')
    throw new Exception('Keputusan hanya boleh VALID atau DITOLAK.');
  $st = $pdo->prepare('UPDATE `abs_punch` SET `status`=:s,`putus_at`=:t,`putus_oleh`=:b,`putus_nota`=:n
                        WHERE `id`=:i AND `status`="MENUNGGU"');
  $st->execute(array(':s' => $status, ':t' => (int)round(microtime(true) * 1000),
                     ':b' => s($by), ':n' => s($nota), ':i' => s($id)));
  /* rowCount 0 berarti ketukannya sudah diputus orang lain lebih dulu —
     dua HR yang membuka antrean bersamaan. Itu bukan galat, tapi harus
     dikatakan, karena kalau diam yang kedua mengira keputusannyalah yang
     berlaku. */
  return $st->rowCount() > 0;
}

/* ---------------------------------------------------------------------
 * REKAP — SEMUA ANGKA DIHITUNG DI SINI, TIDAK ADA YANG DISIMPAN
 * ------------------------------------------------------------------- */
/* Satu hari kerja seseorang: jam masuk, jam pulang, telat, lembur, durasi.
   Ketukan DITOLAK tidak dihitung sama sekali; ketukan MENUNGGU dihitung
   sebagai "belum sah" — angkanya tetap ditampilkan supaya HR tahu apa yang
   sedang ia putuskan, tapi ditandai. */
function hitung_hari($masuk, $pulang, $set) {
  $out = array('telat' => 0, 'lembur' => 0, 'cepat' => 0, 'durasi' => 0, 'lengkap' => 0);
  if (!$masuk || !$pulang) {
    if ($masuk) $out['lengkap'] = 0;
    // tetap hitung telat walau belum pulang — itu sudah pasti
  }
  $tol = (int)$set['toleransiTelat'];
  if ($masuk && $masuk['status'] !== 'DITOLAK') {
    $m = jam_ke_menit($masuk['m']);
    if ($m >= 0) {
      $datang = jam_ke_menit($masuk['jam']);
      /* Datang sesudah tengah malam untuk shift yang mulai malam sebelumnya:
         selisihnya negatif besar, dan tanpa koreksi ini ia terbaca sebagai
         "datang 22 jam lebih awal". */
      if ($datang + 720 < $m) $datang += 1440;
      $out['telat'] = max(0, $datang - ($m + $tol));
    }
  }
  if ($masuk && $pulang && $masuk['status'] !== 'DITOLAK' && $pulang['status'] !== 'DITOLAK') {
    $out['durasi'] = max(0, (int)round(($pulang['waktu'] - $masuk['waktu']) / 60000));
    $out['lengkap'] = 1;
    $sel = jam_ke_menit($masuk['s']);
    if ($sel >= 0) {
      $mul = jam_ke_menit($masuk['m']);
      if ($mul >= 0 && $sel <= $mul) $sel += 1440;
      $keluar = jam_ke_menit($pulang['jam']);
      if ($mul >= 0 && $keluar + 720 < $mul) $keluar += 1440;
      $lem = $keluar - $sel;
      $out['lembur'] = $lem >= (int)$set['lemburMinMenit'] ? $lem : 0;
      $out['cepat']  = max(0, $sel - $keluar);
    }
  }
  return $out;
}

function rekap($dari, $sampai, $subjekId = '', $tipe = '') {
  $pdo = db(); pastikan_tabel($pdo);
  $set = baca_setting();
  $a = tgl_valid($dari); $b = tgl_valid($sampai);
  if ($a === '' || $b === '') throw new Exception('rekap butuh dari & sampai (YYYY-MM-DD)');
  if ($b < $a) { $t = $a; $a = $b; $b = $t; }

  $sql = 'SELECT * FROM `abs_punch` WHERE `tgl` BETWEEN :a AND :b';
  $par = array(':a' => $a, ':b' => $b);
  if ($subjekId !== '') { $sql .= ' AND `subjek_id` = :i'; $par[':i'] = s($subjekId); }
  if ($tipe !== '')     { $sql .= ' AND `subjek_tipe` = :t'; $par[':t'] = strtoupper(s($tipe)); }
  $sql .= ' ORDER BY `tgl`, `nama`, `arah`';
  $st = $pdo->prepare($sql); $st->execute($par);

  $hari = array();
  foreach ($st->fetchAll() as $r) {
    $p = bentuk_punch($r);
    $k = $p['tipe'] . '|' . $p['uid'] . '|' . $p['tgl'];
    if (!isset($hari[$k])) $hari[$k] = array('tipe' => $p['tipe'], 'uid' => $p['uid'],
      'nama' => $p['nama'], 'tgl' => $p['tgl'], 'masuk' => null, 'pulang' => null);
    $hari[$k][$p['arah'] === 'MASUK' ? 'masuk' : 'pulang'] = $p;
    if ($p['nama'] !== '') $hari[$k]['nama'] = $p['nama'];
  }
  $out = array();
  foreach ($hari as $h) {
    $h['hitung'] = hitung_hari($h['masuk'], $h['pulang'], $set);
    $h['shift'] = $h['masuk'] ? $h['masuk']['shift'] : ($h['pulang'] ? $h['pulang']['shift'] : '');
    $h['menunggu'] = (($h['masuk'] && $h['masuk']['status'] === 'MENUNGGU') ||
                      ($h['pulang'] && $h['pulang']['status'] === 'MENUNGGU')) ? 1 : 0;
    $out[] = $h;
  }
  return array('dari' => $a, 'sampai' => $b, 'hari' => array_values($out), 'setting' => $set);
}

/* Antrean pengajuan — ketukan berstatus MENUNGGU. Diurutkan yang paling
   lama menunggu di atas: yang tertua adalah yang paling merugikan kalau
   terlupakan, karena kru tidak bisa berbuat apa-apa selain menunggu. */
function antrean() {
  $pdo = db(); pastikan_tabel($pdo);
  $st = $pdo->query('SELECT * FROM `abs_punch` WHERE `status`="MENUNGGU" ORDER BY `waktu` ASC LIMIT 500');
  $out = array();
  foreach ($st->fetchAll() as $r) {
    $p = bentuk_punch($r);
    $p['foto'] = $r['foto'];       // antrean memang butuh melihat wajahnya
    $out[] = $p;
  }
  return $out;
}

function ping() {
  $db = 'ok';
  try { db()->query('SELECT 1'); } catch (Exception $e) { $db = 'gagal: ' . $e->getMessage(); }
  return array('pong' => true, 'env' => ENV_LABEL, 'db' => $db,
               'jadwal' => (defined('JADWAL_API_URL') && JADWAL_API_URL !== '') ? JADWAL_API_URL : sisi_url('jadwal-api-mysql'),
               'dw' => (defined('DW_API_URL') && DW_API_URL !== '') ? DW_API_URL : sisi_url('dw-api-mysql'),
               'akun' => acc_url());
}
function stats() {
  $pdo = db(); pastikan_tabel($pdo);
  return array(
    'lokasi' => (int)$pdo->query('SELECT COUNT(*) FROM `abs_lokasi`')->fetchColumn(),
    'wajah'  => (int)$pdo->query('SELECT COUNT(*) FROM `abs_wajah`')->fetchColumn(),
    'punch'  => (int)$pdo->query('SELECT COUNT(*) FROM `abs_punch`')->fetchColumn(),
    'antre'  => (int)$pdo->query('SELECT COUNT(*) FROM `abs_punch` WHERE `status`="MENUNGGU"')->fetchColumn(),
  );
}
