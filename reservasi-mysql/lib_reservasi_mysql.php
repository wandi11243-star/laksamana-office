<?php
/************************************************************************
 * RESERVASI LAKSAMANA MUDA — Backend PHP + MySQL (Jalan B)
 * ---------------------------------------------------------------------
 * Pengganti lib_reservasi.php (yang menyimpan ke file data.json).
 * KONTRAK API-nya SAMA PERSIS, jadi api.php & aplikasi (index.html) tidak
 * perlu diubah logikanya — cukup arahkan ke api.php yang me-require file ini.
 *
 * BEDA UTAMA vs versi file:
 *   - State (reservations/master/audit) pindah ke MySQL, bukan data.json.
 *   - Simpan jadi PER-BARIS (INSERT ... ON DUPLICATE KEY UPDATE) dengan
 *     penjaga optimistic-lock via `updated_at`: baris yang datang lebih LAMA
 *     tidak menimpa baris server yang lebih baru. Ini menutup masalah
 *     "saling menimpa" saat banyak kru menyimpan bersamaan.
 *   - Foto TETAP di disk (1 file per foto), sama seperti versi lama —
 *     tidak dijejalkan ke MySQL. Lihat config.php DATA_DIR.
 *
 * File ini HANYA berisi fungsi (tanpa efek samping saat di-include).
 ************************************************************************/

require_once __DIR__ . '/config.php';

if (!defined('FILE_TAG')) define('FILE_TAG', '@f:');

/* ==================== KONEKSI MYSQL (PDO) ==================== */
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

/* ==================== FOLDER FOTO (di disk) ====================
   Sama seperti versi lama: foto disimpan 1 file per foto di <data>/files.
   <data> = DATA_DIR (config) kalau diisi; kalau kosong, default naik 3 tingkat
   keluar dari public_html (../../../reservasi-db), dgn cadangan ./db. */
function db_dir() {
  static $dir = null;
  if ($dir !== null) return $dir;

  if (defined('DATA_DIR') && DATA_DIR !== '') {
    if (!is_dir(DATA_DIR) && !@mkdir(DATA_DIR, 0775, true))
      throw new Exception('DATA_DIR tidak bisa dibuat: ' . DATA_DIR);
    $dir = realpath(DATA_DIR) ?: DATA_DIR;
    return $dir;
  }

  $luar  = __DIR__ . '/../../../reservasi-db';   // di luar public_html (disarankan)
  $dalam = __DIR__ . '/db';                       // cadangan (kurang aman)
  if (is_dir($luar) || @mkdir($luar, 0775, true))        $dir = $luar;
  else if (is_dir($dalam) || @mkdir($dalam, 0775, true)) $dir = $dalam;
  else throw new Exception('Tidak bisa membuat folder foto. Cek izin tulis di hosting.');
  $dir = realpath($dir) ?: $dir;
  return $dir;
}
function file_dir()  { return db_dir() . '/files'; }
function lock_file() { return db_dir() . '/.lock'; }
function db_di_dalam_web() { return strpos(db_dir(), realpath(__DIR__)) === 0; }

function db_pastikan_folder() {
  $dir = db_dir();
  if (!is_dir(file_dir())) @mkdir(file_dir(), 0775, true);
  if (!db_di_dalam_web()) return;
  $ht = $dir . '/.htaccess';
  if (!file_exists($ht)) @file_put_contents($ht,
    "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n" .
    "<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n");
}

/* ==================== KUNCI TULIS (kasar, anti tabrakan) ====================
   Tetap dipakai (api.php membungkus saveAll/putFile dgn db_lock) supaya dua
   penyimpanan tidak berjalin. Optimistic-lock via updated_at adalah lapis
   kedua yang mencegah salinan lama menimpa yang baru. */
function db_lock() {
  db_pastikan_folder();
  $fh = fopen(lock_file(), 'c');
  if ($fh) flock($fh, LOCK_EX);
  return $fh;
}
function db_unlock($fh) {
  if ($fh) { flock($fh, LOCK_UN); fclose($fh); }
}

/* ==================== BACA STATE (dari MySQL) ==================== */
/* JENDELA (24 September 2026). Tanpa argumen: SELURUH riwayat, persis seperti
   dulu — klien lama tidak berubah perilakunya. Dengan $dari/$sampai
   (YYYY-MM-DD): hanya reservasi yang tanggalnya di rentang itu, DITAMBAH yang
   tanggalnya kosong (tidak bisa ditempatkan di jendela mana pun, dan membuangnya
   membuatnya tak terlihat dari layar mana pun).

   Klien yang memuat berjendela WAJIB mengirim `dikenal` saat saveAll — lihat
   save_all(). Tanpa itu rekonsiliasi DELETE menghapus seluruh reservasi di luar
   jendelanya. */
function baca_state($dari = null, $sampai = null) {
  $pdo = db();
  $reservations = array();
  $dari   = $dari   !== null ? tanggal_valid($dari)   : null;
  $sampai = $sampai !== null ? tanggal_valid($sampai) : null;
  if ($dari === null && $sampai === null) {
    $q = $pdo->query('SELECT data FROM reservations ORDER BY created_at ASC, id ASC');
  } else {
    /* Tiap penanda bernama dipakai SEKALI — EMULATE_PREPARES=false mengikat
       menurut posisi, dan nama yang dipakai dua kali gagal dengan HY093. */
    $q = $pdo->prepare('SELECT data FROM reservations
                         WHERE tanggal IS NULL OR (tanggal >= :d AND tanggal <= :s)
                         ORDER BY created_at ASC, id ASC');
    $q->execute(array(':d' => $dari   !== null ? $dari   : '0000-01-01',
                      ':s' => $sampai !== null ? $sampai : '9999-12-31'));
  }
  foreach ($q as $row) {
    $r = json_decode($row['data'], true);
    if (is_array($r)) $reservations[] = $r;
  }
  $master = null;
  $st = $pdo->query("SELECT v FROM settings WHERE k='master' LIMIT 1")->fetch();
  if ($st && isset($st['v'])) { $m = json_decode($st['v'], true); if (is_array($m)) $master = $m; }

  $audit = array();
  foreach ($pdo->query('SELECT data FROM audit ORDER BY ts DESC LIMIT 500') as $row) {
    $a = json_decode($row['data'], true);
    if (is_array($a)) $audit[] = $a;
  }
  return array('reservations' => $reservations, 'master' => $master, 'audit' => $audit);
}

/* Nomor versi global untuk penjaga anti-timpa. Disimpan di tabel settings (k='_ver').
   Dikirim ke klien saat getAll, lalu disertakan kembali saat saveAll (baseVer). */
function read_ver() {
  $pdo = db();
  $st = $pdo->query("SELECT v FROM settings WHERE k='_ver' LIMIT 1")->fetch();
  if ($st && isset($st['v']) && ctype_digit((string)$st['v'])) return (int)$st['v'];
  return 0;
}

/* ==================== FOTO (disk, tidak berubah) ==================== */
function file_path($key) {
  $safe = preg_replace('/[^A-Za-z0-9._-]/', '_', (string)$key);
  return file_dir() . '/' . $safe . '.txt';
}
function get_file($key) {
  if (!$key) throw new Exception('key kosong');
  $p = file_path($key);
  $data = file_exists($p) ? file_get_contents($p) : '';
  return array('key' => $key, 'data' => $data === false ? '' : $data);
}
function put_file($payload) {
  if (!$payload || empty($payload['key'])) throw new Exception('key kosong');
  db_pastikan_folder();
  $key = $payload['key'];
  $data = isset($payload['data']) ? (string)$payload['data'] : '';
  $p = file_path($key);
  if ($data === '') { if (file_exists($p)) @unlink($p); return array('key' => $key, 'len' => 0, 'deleted' => true); }
  if (file_put_contents($p, $data) === false) throw new Exception('Gagal menulis foto (cek izin folder files)');
  return array('key' => $key, 'len' => strlen($data));
}

/* ==================== PEMISAHAN FOTO DARI STATE (tidak berubah) ==================== */
function is_inline($v) { return is_string($v) && substr($v, 0, 5) === 'data:'; }
function is_ref($v)    { return is_string($v) && substr($v, 0, strlen(FILE_TAG)) === FILE_TAG; }

function each_file_field(&$state, $fn) {
  if (!empty($state['reservations']) && is_array($state['reservations'])) {
    foreach ($state['reservations'] as &$r) {
      if (empty($r['id'])) continue;
      $fn($r, 'dpProofData', 'r:' . $r['id'] . ':dp');
      $fn($r, 'docReqData',  'r:' . $r['id'] . ':doc');
      if (!empty($r['dps']) && is_array($r['dps'])) {
        foreach ($r['dps'] as &$p) {
          if (!empty($p['id'])) $fn($p, 'proofData', 'p:' . $r['id'] . ':' . $p['id']);
        }
        unset($p);
      }
    }
    unset($r);
  }
  if (!empty($state['master']) && is_array($state['master'])) {
    if (!empty($state['master']['reviews']) && is_array($state['master']['reviews'])) {
      /* FOTO KEDUA IKUT DIPISAH (20 September 2026). Ia TERLEWAT sejak
         mekanisme ini lahir: `proofData` dipindah ke disk, `proof2Data` tidak
         — jadi ia tetap base64 di dalam blob dan ikut terseret bolak-balik
         pada SETIAP getAll dan SETIAP saveAll, di modul Reservasi maupun
         Service Excellent yang berbagi blob `master` ini.

         Diukur di dev 20 September 2026, dan sebabnya bukan dugaan:
             blob seluruhnya   306 KB
             proof2Data         218 KB   <- 71%, dari EMPAT baris saja
         Keluhan yang membawanya ke sini: "input dan simpan reservasi kok lama
         banget". Satu kali Simpan menarik lalu mengirim blob itu.

         KUNCINYA 'rv2:', BUKAN 'rv:'. Kunci yang sama membuat foto kedua
         MENIMPA foto pertama di disk — dan yang hilang adalah bukti yang
         dipakai memverifikasi poin review, tanpa satu pun galat.

         Sisi klien sudah siap menerimanya sejak lama: viewReviewProof() di
         modul Service Excellent melewatkan KEDUA foto lewat loadFile(), yang
         mengerti rujukan maupun data lama yang masih inline. Pembaca lain
         cuma memeriksa ada-tidaknya isinya, bukan bentuknya. */
      foreach ($state['master']['reviews'] as &$rv) {
        if (empty($rv['id'])) continue;
        $fn($rv, 'proofData',  'rv:'  . $rv['id']);
        $fn($rv, 'proof2Data', 'rv2:' . $rv['id']);
      }
      unset($rv);
    }
    if (!empty($state['master']['feedbacks']) && is_array($state['master']['feedbacks'])) {
      foreach ($state['master']['feedbacks'] as &$fb) if (!empty($fb['id'])) $fn($fb, 'proofData', 'fb:' . $fb['id']);
      unset($fb);
    }
  }
}
function externalize(&$state) {
  $moved = 0; $bytes = 0;
  each_file_field($state, function (&$obj, $field, $key) use (&$moved, &$bytes) {
    if (!isset($obj[$field]) || !is_inline($obj[$field])) return;
    $v = $obj[$field];
    put_file(array('key' => $key, 'data' => $v));
    $obj[$field] = FILE_TAG . $key;
    $moved++; $bytes += strlen($v);
  });
  return array('moved' => $moved, 'bytes' => $bytes);
}
function gc_files(&$state) {
  if (!is_dir(file_dir())) return 0;
  $hidup = array();
  each_file_field($state, function (&$obj, $field, $key) use (&$hidup) {
    if (empty($obj[$field])) return;
    if (is_ref($obj[$field])) $hidup[substr($obj[$field], strlen(FILE_TAG))] = true;
    $hidup[$key] = true;
  });
  $hidupFile = array();
  foreach ($hidup as $k => $_) $hidupFile[basename(file_path($k))] = true;
  $buang = 0;
  foreach (scandir(file_dir()) as $f) {
    if ($f === '.' || $f === '..' || substr($f, -4) !== '.txt') continue;
    if (empty($hidupFile[$f])) { @unlink(file_dir() . '/' . $f); $buang++; }
  }
  return $buang;
}

/* ==================== SIMPAN (dipanggil di dalam kunci) ====================
   Reconcile SELURUH state kiriman ke MySQL secara per-baris. Aplikasi mengirim
   state utuh (sudah digabung di klien); di sini:
     - reservations : UPSERT per-baris, dijaga updated_at (yang lama tidak menimpa yg baru)
     - reservasi yang HILANG dari kiriman → dihapus (kecuali kiriman kosong = jaga-jaga)
     - audit        : INSERT IGNORE per-id (append-only, tak pernah menimpa)
     - master       : simpan 1 blob di settings
   Semua dalam 1 transaksi. */
function save_all($state, $baseVer = null, $dikenal = null) {
  if (!is_array($state)) throw new Exception('Payload data kosong/invalid');
  /* baseVer WAJIB (penjaga anti-timpa). Tanpa ini, perangkat yang masih memakai aplikasi
     versi LAMA akan menghapus/menimpa baris kru lain lewat rekonsiliasi DELETE di bawah.
     Lebih baik GAGAL KERAS supaya kru menekan Ctrl+Shift+R, daripada diam-diam merusak data. */
  if ($baseVer === null || $baseVer === '') {
    throw new Exception('APP_LAWAS — aplikasi di perangkat ini belum diperbarui. Tekan Ctrl+Shift+R (muat ulang) lalu simpan lagi.');
  }

  $ext = externalize($state);      // foto inline → disk (hanya MENULIS; aman walau nanti ditolak)

  $pdo = db();
  $pdo->exec("INSERT IGNORE INTO settings (k,v) VALUES ('_ver','0')");   // pastikan baris versi ada
  $reservations = isset($state['reservations']) && is_array($state['reservations']) ? $state['reservations'] : array();
  $audit        = isset($state['audit']) && is_array($state['audit']) ? $state['audit'] : array();

  $curVer = 0; $newVer = 0; $buang = 0;
  $pdo->beginTransaction();
  try {
    /* PENJAGA VERSI GLOBAL. Kunci baris versi (FOR UPDATE) → dua saveAll bersamaan
       di-serialkan oleh MySQL, jauh lebih andal dari flock di shared hosting. Kalau versi
       server sudah maju (kru lain menyelip menyimpan lebih dulu), TOLAK: klien tarik ulang,
       gabungkan, lalu coba lagi. Inilah yang menutup kasus reservasi BARU kru lain terhapus
       oleh rekonsiliasi DELETE di bawah. */
    $curVer = (int)$pdo->query("SELECT v FROM settings WHERE k='_ver' FOR UPDATE")->fetch()['v'];
    if ((string)$curVer !== (string)$baseVer) {
      $pdo->rollBack();
      return array('conflict' => true, 'saved' => false, 'ver' => $curVer);
    }
    /* MODE PARSIAL (`dikenal` dikirim = klien cuma memegang sebagian reservasi):
       gc_files DILEWATI. Ia membuang berkas foto yang tidak disebut kiriman, dan
       kiriman parsial memang tidak menyebut foto milik reservasi di luar
       jendelanya — bukti DP berbulan-bulan akan hilang dari disk tanpa satu pun
       galat. Berkas yatim yang tertinggal tidak merugikan siapa pun; klien penuh
       berikutnya tetap membersihkannya. */
    $parsial = is_array($dikenal);
    $buang = $parsial ? 0 : gc_files($state);   // aman — kita pemegang kunci tulis

    // ---- reservations: UPSERT per-baris dgn penjaga updated_at ----
    $sql = 'INSERT INTO reservations
              (id,name,phone,tanggal,jam,pax,status,pic_name,source,dp_amount,updated_at,created_at,data)
            VALUES
              (:id,:name,:phone,:tanggal,:jam,:pax,:status,:pic_name,:source,:dp_amount,:updated_at,:created_at,:data)
            ON DUPLICATE KEY UPDATE
              name       = IF(VALUES(updated_at) >= updated_at, VALUES(name),       name),
              phone      = IF(VALUES(updated_at) >= updated_at, VALUES(phone),      phone),
              tanggal    = IF(VALUES(updated_at) >= updated_at, VALUES(tanggal),    tanggal),
              jam        = IF(VALUES(updated_at) >= updated_at, VALUES(jam),        jam),
              pax        = IF(VALUES(updated_at) >= updated_at, VALUES(pax),        pax),
              status     = IF(VALUES(updated_at) >= updated_at, VALUES(status),     status),
              pic_name   = IF(VALUES(updated_at) >= updated_at, VALUES(pic_name),   pic_name),
              source     = IF(VALUES(updated_at) >= updated_at, VALUES(source),     source),
              dp_amount  = IF(VALUES(updated_at) >= updated_at, VALUES(dp_amount),  dp_amount),
              data       = IF(VALUES(updated_at) >= updated_at, VALUES(data),       data),
              updated_at = IF(VALUES(updated_at) >= updated_at, VALUES(updated_at), updated_at)';
    $up = $pdo->prepare($sql);

    $ids = array();
    foreach ($reservations as $r) {
      if (!is_array($r) || empty($r['id'])) continue;
      $id = (string)$r['id'];
      $ids[] = $id;
      $up->execute(array(
        ':id'         => $id,
        ':name'       => isset($r['name'])   ? (string)$r['name']   : null,
        ':phone'      => isset($r['phone'])  ? (string)$r['phone']  : null,
        ':tanggal'    => tanggal_valid(isset($r['date']) ? $r['date'] : null),
        ':jam'        => isset($r['time'])   ? substr((string)$r['time'], 0, 8) : null,
        ':pax'        => intval(isset($r['pax']) ? $r['pax'] : 0),
        ':status'     => isset($r['status']) ? (string)$r['status'] : null,
        ':pic_name'   => isset($r['picName'])? (string)$r['picName']: null,
        ':source'     => isset($r['source']) ? (string)$r['source'] : null,
        ':dp_amount'  => intval(isset($r['dpAmount']) ? $r['dpAmount'] : 0),
        ':updated_at' => intval(isset($r['updatedAt']) ? $r['updatedAt'] : 0),
        ':created_at' => intval(isset($r['createdAt']) ? $r['createdAt'] : 0),
        ':data'       => json_encode($r, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
      ));
    }

    // ---- hapus reservasi yang hilang dari kiriman ----
    /* MODE PARSIAL: hanya yang PERNAH DIPEGANG klien (dikenal) tapi tidak ikut
       dikirim yang dianggap dihapus — pola yang sama dengan perbaikan PR-11 di
       BD OS (24 September 2026). Reservasi di luar jendela klien TIDAK disentuh.
       Kiriman kosong yang sekaligus menghapus >3 baris ditahan. */
    $dihapus = 0;
    if ($parsial) {
      $hapus = array_values(array_diff(array_unique(array_map('strval', $dikenal)), $ids));
      if (count($hapus) > 0 && !(count($ids) === 0 && count($hapus) > 3)) {
        $ph = implode(',', array_fill(0, count($hapus), '?'));
        $dh = $pdo->prepare('DELETE FROM reservations WHERE id IN (' . $ph . ')');
        $dh->execute($hapus);
        $dihapus = $dh->rowCount();
      }
    } else {
    // JAGA-JAGA: kalau kiriman kosong tapi DB berisi, JANGAN hapus semua
    // (lindungi dari state kosong yang tak sengaja). Aplikasi punya guard sendiri,
    // ini lapis tambahan.
    $adaDiDb = (int)$pdo->query('SELECT COUNT(*) c FROM reservations')->fetch()['c'];
    if (count($ids) === 0 && $adaDiDb > 0) {
      // lewati penghapusan
    } else if (count($ids) === 0) {
      // db juga kosong → tidak ada yang dihapus
    } else {
      $place = implode(',', array_fill(0, count($ids), '?'));
      $del = $pdo->prepare('DELETE FROM reservations WHERE id NOT IN (' . $place . ')');
      $del->execute($ids);
      $dihapus = $del->rowCount();
    }
    }

    // ---- audit: append-only per id ----
    $ai = $pdo->prepare('INSERT IGNORE INTO audit (id, ts, data) VALUES (:id,:ts,:data)');
    foreach ($audit as $a) {
      if (!is_array($a) || empty($a['id'])) continue;
      $ai->execute(array(
        ':id'   => (string)$a['id'],
        ':ts'   => intval(isset($a['ts']) ? $a['ts'] : 0),
        ':data' => json_encode($a, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
      ));
    }
    // batasi audit agar tak tumbuh tanpa batas (klien pun batasi 500)
    $pdo->exec('DELETE FROM audit WHERE id NOT IN (SELECT id FROM (SELECT id FROM audit ORDER BY ts DESC LIMIT 500) t)');

    // ---- master: 1 blob ----
    if (isset($state['master'])) {
      $ms = $pdo->prepare("INSERT INTO settings (k,v) VALUES ('master',:v)
                           ON DUPLICATE KEY UPDATE v = VALUES(v)");
      $ms->execute(array(':v' => json_encode($state['master'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)));
    }

    // ---- naikkan nomor versi (masih di dalam kunci FOR UPDATE) ----
    $newVer = $curVer + 1;
    $pdo->prepare("UPDATE settings SET v = :v WHERE k = '_ver'")->execute(array(':v' => (string)$newVer));

    $pdo->commit();
  } catch (Throwable $e) {
    $pdo->rollBack();
    throw $e;
  }

  return array(
    'saved'        => true,
    'ver'          => $newVer,
    'reservations' => count($reservations),
    'audit'        => count($audit),
    'blobChars'    => 0,                 // di MySQL tidak ada 1 blob; 0 = tidak relevan
    'fotoDipisah'  => $ext['moved'],
    'fotoDihapus'  => $buang,
    'parsial'      => $parsial,
    'dihapus'      => $dihapus,
    'backend'      => 'php-mysql',
    'ts'           => gmdate('c'),
  );
}

// 'YYYY-MM-DD' valid → dikembalikan; selain itu null (biar kolom DATE aman).
function tanggal_valid($d) {
  $d = trim((string)$d);
  return preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) ? $d : null;
}

/* ==================== RIWAYAT PER HALAMAN (24 September 2026) ====================
   Tab Riwayat dulu menyaring SELURUH reservasi di peramban lalu memotongnya
   jadi halaman. Sekarang penyaringan, pengurutan, dan pemotongannya di SQL:
   satu klik "halaman berikutnya" = satu SELECT berisi `per` baris saja.

   Aturannya SALINAN dari renderRiwayat() di deploy/reservasi/index.html —
   BERKAS KEMBAR LINTAS BAHASA. Kalau saringan di sana berubah, yang di sini
   HARUS ikut; kalau tidak, versi server dan versi cadangan peramban (dipakai
   selama backend lama) menampilkan isi berbeda untuk saringan yang sama.
     - arsip = tanggal < hari ini  ATAU  status No-show/Cancelled
       (tanggal kosong ikut: di peramban '' < hari ini bernilai benar)
     - mode month/year, status, kata kunci nama (tanpa huruf besar-kecil) / HP
     - urut tanggal+jam TERBARU dulu, lalu id supaya urutan stabil antar halaman

   HANYA MEMBACA. Tidak ada satu pun penulisan di fungsi ini. */
function riwayat_hal($p) {
  $pdo = db();
  $hariIni = tanggal_valid(isset($p['hariIni']) ? $p['hariIni'] : '');
  if ($hariIni === null) $hariIni = gmdate('Y-m-d', time() + 7 * 3600);   // WIB
  $per = (int)(isset($p['per']) ? $p['per'] : 10);
  if ($per < 1) $per = 10;
  if ($per > 100) $per = 100;
  $hal = max(1, (int)(isset($p['hal']) ? $p['hal'] : 1));

  $w = array("(tanggal IS NULL OR tanggal < :hari OR status IN ('No-show','Cancelled'))");
  $arg = array(':hari' => $hariIni);
  $mode = isset($p['mode']) ? (string)$p['mode'] : 'all';
  if ($mode === 'month' && isset($p['bulan']) && preg_match('/^\d{4}-\d{2}$/', (string)$p['bulan'])) {
    /* Batas atas = tanggal 1 bulan BERIKUTNYA, eksklusif. '2026-02-31' bukan
       tanggal sah, dan membandingkannya dengan kolom DATE bergantung pada mode
       SQL server — bisa jadi NULL dan bulan itu kosong tanpa satu pun galat. */
    $w[] = 'tanggal >= :bdari AND tanggal < :bsampai';
    $arg[':bdari'] = $p['bulan'] . '-01';
    $arg[':bsampai'] = date('Y-m-d', strtotime($p['bulan'] . '-01 +1 month'));
  } else if ($mode === 'year' && isset($p['tahun']) && preg_match('/^\d{4}$/', (string)$p['tahun'])) {
    $w[] = 'tanggal >= :tdari AND tanggal <= :tsampai';
    $arg[':tdari'] = $p['tahun'] . '-01-01';
    $arg[':tsampai'] = $p['tahun'] . '-12-31';
  }
  $status = isset($p['status']) ? (string)$p['status'] : '';
  if (in_array($status, array('Datang', 'No-show', 'Cancelled'), true)) {
    $w[] = 'status = :st';
    $arg[':st'] = $status;
  }
  $q = isset($p['q']) ? trim((string)$p['q']) : '';
  if ($q !== '') {
    /* % dan _ di-escape: nama tamu yang memuat garis bawah tidak boleh jadi
       wildcard yang mencocokkan apa saja. Dua penanda BERBEDA untuk nilai yang
       sama — EMULATE_PREPARES=false mengikat menurut posisi (HY093). */
    $pola = '%' . strtr(strtolower($q), array('\\' => '\\\\', '%' => '\\%', '_' => '\\_')) . '%';
    $w[] = '(LOWER(name) LIKE :q1 OR phone LIKE :q2)';
    $arg[':q1'] = $pola;
    $arg[':q2'] = $pola;
  }
  $where = implode(' AND ', $w);

  $c = $pdo->prepare('SELECT COUNT(*) c FROM reservations WHERE ' . $where);
  $c->execute($arg);
  $total = (int)$c->fetch()['c'];

  $maxHal = max(1, (int)ceil($total / $per));
  if ($hal > $maxHal) $hal = $maxHal;
  $mulai = ($hal - 1) * $per;

  $ekspor = !empty($p['ekspor']);
  if ($ekspor) {
    /* Ekspor CSV butuh SELURUH baris yang cocok, bukan satu halaman — tapi cukup
       id-nya: peramban menyusun CSV dari data yang sudah ia pegang. */
    $s = $pdo->prepare('SELECT id FROM reservations WHERE ' . $where .
                       ' ORDER BY tanggal DESC, jam DESC, id DESC');
    $s->execute($arg);
    $ids = array();
    foreach ($s as $row) $ids[] = $row['id'];
    return array('ids' => $ids, 'total' => $total);
  }

  $s = $pdo->prepare('SELECT data FROM reservations WHERE ' . $where .
                     ' ORDER BY tanggal DESC, jam DESC, id DESC LIMIT ' . (int)$per . ' OFFSET ' . (int)$mulai);
  $s->execute($arg);
  $rows = array();
  foreach ($s as $row) { $r = json_decode($row['data'], true); if (is_array($r)) $rows[] = $r; }
  return array('rows' => $rows, 'total' => $total, 'hal' => $hal, 'per' => $per, 'maxHal' => $maxHal);
}

/* ==================== TIGA TABEL PER HALAMAN (25 September 2026) ====================
   Daftar Reservasi, Dana Masuk, dan Audit Log dimuat per halaman dari server,
   permintaan user sesudah tab Riwayat. HANYA MEMBACA — tidak ada satu pun
   penulisan di blok ini.

   SELURUH ATURAN SARINGNYA BERKAS KEMBAR LINTAS BAHASA dengan
   deploy/reservasi/index.html:
     rsv_hal_recap()   <->  applyFilter() + recapList()
     rsv_hal_dana()    <->  financeTx() + financeList() (+ ensureDps, txBank, …)
     rsv_hal_audit()   <->  auditCocok()
   Kalau aturan di sana berubah, yang di sini HARUS ikut. Layar memakai jawaban
   server ini untuk memilih baris halaman itu; salinan yang menyimpang membuat
   tabel menampilkan baris yang berbeda dari kartu ringkas di atasnya.

   Saringan yang cuma bisa dihitung peramban (lantai, jenis pelanggan, sisa
   kursi) SENGAJA tidak ada di sini — layar tetap memotong sendiri untuk itu.

   Disaring di PHP, bukan SQL, karena sebagian besar field-nya hidup di blob
   data dan harus dinormalkan dulu persis seperti layar menormalkannya. */
function rsv_js_num($v) { return is_numeric($v) ? (float)$v : 0; }
function rsv_kecil($s) { $s = (string)$s; return function_exists('mb_strtolower') ? mb_strtolower($s, 'UTF-8') : strtolower($s); }
function rsv_ada($hay, $q) { return $q === '' || strpos(rsv_kecil($hay), $q) !== false; }
function rsv_norm_status($s) {            // kembar normStatus()
  if ($s === 'Checked-in' || $s === 'Completed') return 'Datang';
  if ($s === 'Booking') return 'Confirmed';
  return $s;
}
function rsv_hal_param($p) {
  $per = (int)(isset($p['per']) ? $p['per'] : 10);
  if ($per < 1) $per = 10;
  if ($per > 100) $per = 100;
  $hal = max(1, (int)(isset($p['hal']) ? $p['hal'] : 1));
  return array($hal, $per);
}
/* Potong daftar yang SUDAH tersaring & terurut jadi satu halaman. */
function rsv_potong($list, $p) {
  list($hal, $per) = rsv_hal_param($p);
  $total = count($list);
  $maxHal = max(1, (int)ceil($total / $per));
  if ($hal > $maxHal) $hal = $maxHal;
  return array('rows' => array_slice($list, ($hal - 1) * $per, $per), 'total' => $total,
               'hal' => $hal, 'per' => $per, 'maxHal' => $maxHal);
}
/* Urut STABIL: usort baru stabil sejak PHP 8.0, dan layar memakai sort JS yang
   stabil — tanpa indeks sebagai pemisah, baris berjam sama bisa bertukar
   tempat antar halaman dan satu tamu muncul di dua halaman. */
function rsv_urut_stabil(&$arr, $kunciFn, $turun) {
  $tmp = array();
  foreach ($arr as $i => $x) $tmp[] = array($kunciFn($x), $i, $x);
  usort($tmp, function ($a, $b) use ($turun) {
    $c = strcmp($a[0], $b[0]);
    if ($turun) $c = -$c;
    return $c !== 0 ? $c : ($a[1] - $b[1]);
  });
  $arr = array();
  foreach ($tmp as $t) $arr[] = $t[2];
}
function rsv_semua_res() {
  $out = array();
  foreach (db()->query('SELECT data FROM reservations ORDER BY created_at ASC, id ASC') as $row) {
    $r = json_decode($row['data'], true);
    if (!is_array($r)) continue;
    $r['status'] = rsv_norm_status(isset($r['status']) ? $r['status'] : '');
    $out[] = $r;
  }
  return $out;
}
function rsv_s($r, $k) { return isset($r[$k]) && $r[$k] !== null ? (string)$r[$k] : ''; }

/* ---- Daftar Reservasi ---- */
function rsv_hal_recap($p) {
  $g = function ($k) use ($p) { return isset($p[$k]) ? (string)$p[$k] : ''; };
  $mode = $g('mode');
  $list = array();
  foreach (rsv_semua_res() as $r) {
    $d = rsv_s($r, 'date');
    if ($mode === 'day' && $d !== $g('date')) continue;
    if ($mode === 'month' && substr($d, 0, 7) !== $g('month')) continue;
    if ($mode === 'year' && substr($d, 0, 4) !== $g('year')) continue;
    if ($mode === 'range' && $g('from') !== '' && $g('to') !== '' && !($d >= $g('from') && $d <= $g('to'))) continue;
    $t = rsv_s($r, 'time');
    if ($g('fh') !== '' && strcmp($t, $g('fh')) < 0) continue;
    if ($g('th') !== '' && strcmp($t, $g('th')) > 0) continue;
    if ($g('status') !== '' && $r['status'] !== $g('status')) continue;
    if ($g('category') !== '' && rsv_s($r, 'category') !== $g('category')) continue;
    if ($g('dp') !== '' && rsv_s($r, 'dpStatus') !== $g('dp')) continue;
    if ($g('pic') !== '' && rsv_s($r, 'picName') !== $g('pic')) continue;
    $q = rsv_kecil($g('q'));
    if ($q !== '' && !(rsv_ada(rsv_s($r, 'name'), $q) || strpos(rsv_s($r, 'phone'), $q) !== false)) continue;
    $list[] = $r;
  }
  rsv_urut_stabil($list, function ($r) { return rsv_s($r, 'date') . rsv_s($r, 'time'); }, false);
  $hq = rsv_kecil(trim($g('hq')));
  if ($hq !== '') {
    $list = array_values(array_filter($list, function ($r) use ($hq) {
      if (rsv_ada(rsv_s($r, 'name'), $hq) || strpos(rsv_s($r, 'phone'), $hq) !== false) return true;
      foreach (explode(',', rsv_s($r, 'table')) as $mj) { $mj = trim($mj); if ($mj !== '' && rsv_ada($mj, $hq)) return true; }
      return false;
    }));
  }
  $batal = 0;
  if ($g('status') !== 'Cancelled') {
    $n = count($list);
    $list = array_values(array_filter($list, function ($r) { return $r['status'] !== 'Cancelled'; }));
    $batal = $n - count($list);
  }
  $out = rsv_potong($list, $p);
  $out['batal'] = $batal;
  return $out;
}

/* ---- Dana Masuk (satu baris = satu cicilan DP) ---- */
function rsv_dps($r) {                    // kembar ensureDps() — TANPA menulis apa pun
  $dps = isset($r['dps']) && is_array($r['dps']) ? $r['dps'] : array();
  if (!count($dps) && rsv_s($r, 'dpStatus') === 'Sudah' && (rsv_js_num(isset($r['dpAmount']) ? $r['dpAmount'] : 0) > 0 || rsv_s($r, 'dpProofData') !== '')) {
    $dps = array(array(
      'amount' => rsv_js_num(isset($r['dpAmount']) ? $r['dpAmount'] : 0), 'method' => rsv_s($r, 'dpMethod'),
      'proofData' => rsv_s($r, 'dpProofData'), 'tfDate' => rsv_s($r, 'tfDate'), 'tfTime' => rsv_s($r, 'tfTime'),
      'tfBank' => rsv_s($r, 'tfBank'), 'tfName' => rsv_s($r, 'tfName'),
      'tfAmount' => rsv_js_num(isset($r['tfAmount']) ? $r['tfAmount'] : 0), 'tfStatus' => rsv_s($r, 'tfStatus'),
      'tfOcrAt' => isset($r['tfOcrAt']) ? $r['tfOcrAt'] : 0,
    ));
  }
  return $dps;
}
function rsv_tx_bank($x) {                // kembar txBank() + bankFromMethod()
  $b = rsv_s($x['p'], 'tfBank');
  return $b !== '' ? $b : trim(preg_replace('/^transfer\s+/i', '', rsv_s($x['p'], 'method')));
}
function rsv_tx_date($x) { $d = rsv_s($x['p'], 'tfDate'); return $d !== '' ? $d : rsv_s($x['r'], 'date'); }
function rsv_hal_dana($p) {
  $g = function ($k) use ($p) { return isset($p[$k]) ? (string)$p[$k] : ''; };
  $semua = array();
  foreach (rsv_semua_res() as $r) {
    foreach (rsv_dps($r) as $i => $dp) {
      if (!is_array($dp)) continue;
      if (!rsv_js_num(isset($dp['amount']) ? $dp['amount'] : 0) && rsv_s($dp, 'proofData') === '') continue;
      $semua[] = array('r' => $r, 'p' => $dp, 'ke' => $i + 1);
    }
  }
  $dari = $g('from'); $sampai = $g('to'); $basis = $g('basis'); $tab = $g('tab'); $st = $g('status');
  $q = rsv_kecil(trim($g('q')));
  $list = array();
  foreach ($semua as $x) {
    $d = $basis === 'masuk' ? rsv_tx_date($x) : rsv_s($x['r'], 'date');
    if ($d === '' || ($dari !== '' && $d < $dari) || ($sampai !== '' && $d > $sampai)) continue;
    if ($g('bank') !== '' && rsv_tx_bank($x) !== $g('bank')) continue;
    $tfs = rsv_s($x['p'], 'tfStatus');
    $scan = !empty($x['p']['tfOcrAt']) || rsv_s($x['p'], 'tfDate') !== '' || rsv_s($x['p'], 'tfTime') !== '';
    $a = rsv_js_num(isset($x['p']['tfAmount']) ? $x['p']['tfAmount'] : 0);
    $b = rsv_js_num(isset($x['p']['amount']) ? $x['p']['amount'] : 0);
    if ($st === 'unscanned' && $scan) continue;
    if ($st === 'pending' && $tfs !== '') continue;
    if ($st === 'verified' && $tfs !== 'verified') continue;
    if ($st === 'mismatch' && !($a > 0 && $b > 0 && $a != $b)) continue;
    if ($st === 'rejected' && $tfs !== 'rejected') continue;
    if ($tab === 'perlu' && ($tfs === 'verified' || $tfs === 'rejected')) continue;
    if ($tab === 'sudah' && $tfs !== 'verified') continue;
    if ($tab === 'tolak' && $tfs !== 'rejected') continue;
    if ($q !== '' && !(rsv_ada(rsv_s($x['r'], 'name'), $q) || strpos(rsv_s($x['r'], 'phone'), $q) !== false
        || rsv_ada(rsv_tx_bank($x), $q) || rsv_ada(rsv_s($x['p'], 'tfName'), $q))) continue;
    $list[] = $x;
  }
  rsv_urut_stabil($list, function ($x) { return rsv_tx_date($x) . rsv_s($x['p'], 'tfTime'); }, true);
  $out = rsv_potong($list, $p);
  /* Yang dipulangkan cuma PENUNJUK barisnya (id reservasi + urutan cicilan).
     Layar sudah memegang isinya; bukti transfer tidak perlu diseret lagi. */
  $out['rows'] = array_map(function ($x) { return array('res' => rsv_s($x['r'], 'id'), 'ke' => $x['ke']); }, $out['rows']);
  return $out;
}

/* ---- Audit Log ---- */
function rsv_hal_audit($p) {
  $label = array('host' => 'Host / Captain', 'marketing' => 'Marketing (PIC)', 'cashier' => 'Cashier',
                 'manager' => 'Manajer / Owner', 'viewer' => 'View Only', 'admin' => 'Admin Sistem');   // kembar ROLE_LABEL
  $q = rsv_kecil(trim(isset($p['q']) ? (string)$p['q'] : ''));
  $list = array();
  foreach (db()->query('SELECT data FROM audit ORDER BY ts DESC') as $row) {
    $a = json_decode($row['data'], true);
    if (!is_array($a)) continue;
    if ($q !== '') {
      $role = rsv_s($a, 'role');
      $cocok = false;
      foreach (array(rsv_s($a, 'user'), isset($label[$role]) ? $label[$role] : $role, rsv_s($a, 'action'), rsv_s($a, 'detail')) as $v) {
        if (rsv_ada($v, $q)) { $cocok = true; break; }
      }
      if (!$cocok) continue;
    }
    $list[] = $a;
  }
  return rsv_potong($list, $p);
}

/* ==================== RINGKASAN TAMU LAMA (tahap 2, 25 September 2026) ====================
   Profil tamu di layar (Loyal / Repeat / blacklist, jumlah kunjungan, member,
   dan isi-otomatis nama dari nomor HP) dihitung dari SELURUH riwayat. Klien
   berjendela tidak memegang riwayat di luar jendelanya, jadi ringkasan untuk
   reservasi BERTANGGAL SEBELUM :sebelum dihitung di sini, lalu klien
   menjumlahkannya dengan baris di jendelanya sendiri.

   KEMBAR LINTAS BAHASA: rsv_norm_hp() <-> normPhone(), dan isi tiap entri <->
   customerProfile() / guestDirectory() di deploy/reservasi/index.html.
   HANYA MEMBACA.

   Bentuk tiap entri SENGAJA array ringkas, bukan objek bernama: satu entri per
   nomor HP, dan di produksi itu ribuan entri.
     [0] n  [1] datang  [2] noshow  [3] member  [4] memberNo  [5] vip
     [6] kunjungan terakhir  [7] jumlah pax  [8] nama pertama  [9] nama terakhir */
function rsv_norm_hp($p) {               // kembar normPhone()
  $x = preg_replace('/[^0-9]/', '', (string)$p);
  if ($x === '') return '';
  if ($x[0] === '0') return '62' . substr($x, 1);
  if (strpos($x, '62') === 0) return $x;
  return '62' . $x;
}
function ringkas_tamu($sebelum) {
  $s = tanggal_valid($sebelum);
  if ($s === null) return array();
  $q = db()->prepare('SELECT data FROM reservations WHERE tanggal IS NOT NULL AND tanggal < :s ORDER BY created_at ASC, id ASC');
  $q->execute(array(':s' => $s));
  $out = array();
  foreach ($q as $row) {
    $r = json_decode($row['data'], true);
    if (!is_array($r)) continue;
    /* Kuncinya diawali 'k' supaya PHP tidak mengubah nomor HP jadi kunci
       integer — nomor yang melewati PHP_INT_MAX, atau yang kebetulan
       berurutan, akan mengubah bentuk JSON-nya jadi array. */
    $k = 'k' . rsv_norm_hp(isset($r['phone']) ? $r['phone'] : '');
    if (!isset($out[$k])) $out[$k] = array(0, 0, 0, 0, '', 0, '', 0, '', '');
    $st = rsv_norm_status(rsv_s($r, 'status'));
    $out[$k][0]++;
    if ($st === 'Datang') {
      $out[$k][1]++;
      $d = rsv_s($r, 'date');
      if (strcmp($d, $out[$k][6]) > 0) $out[$k][6] = $d;
    }
    if ($st === 'No-show') $out[$k][2]++;
    if (!empty($r['member'])) {
      $out[$k][3] = 1;
      if ($out[$k][4] === '' && rsv_s($r, 'memberNo') !== '') $out[$k][4] = rsv_s($r, 'memberNo');
    }
    if (!empty($r['vip'])) $out[$k][5] = 1;
    $out[$k][7] += rsv_js_num(isset($r['pax']) ? $r['pax'] : 0);
    if ($out[$k][0] === 1) $out[$k][8] = rsv_s($r, 'name');
    $nm = trim(rsv_s($r, 'name'));
    if ($nm !== '') $out[$k][9] = $nm;
  }
  return $out;
}

/* ==================== DIAGNOSTIK ==================== */
function stats() {
  $pdo = db();
  $resCount = (int)$pdo->query('SELECT COUNT(*) c FROM reservations')->fetch()['c'];

  // hitung foto inline/ref pada state (untuk pantau apakah pemisahan foto rapi)
  $state = baca_state();
  $blob = strlen(json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
  $inline = 0; $ref = 0;
  each_file_field($state, function (&$obj, $field, $key) use (&$inline, &$ref) {
    if (!isset($obj[$field])) return;
    if (is_inline($obj[$field])) $inline++;
    else if (is_ref($obj[$field])) $ref++;
  });
  $nfile = 0;
  if (is_dir(file_dir())) foreach (scandir(file_dir()) as $f) if (substr($f, -4) === '.txt') $nfile++;

  return array(
    'backend'          => 'php-mysql',
    'db'               => DB_NAME,
    'blobChars'        => $blob,
    'blobMB'           => round($blob / 1048576, 3),
    'reservations'     => $resCount,
    'fotoMasihInline'  => $inline,
    'fotoSudahDipisah' => $ref,
    'fileFoto'         => $nfile,
    'folderFoto'       => db_dir(),
    'amanDiLuarWeb'    => !db_di_dalam_web(),
  );
}
