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
function baca_state() {
  $pdo = db();
  $reservations = array();
  foreach ($pdo->query('SELECT data FROM reservations ORDER BY created_at ASC, id ASC') as $row) {
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
function save_all($state, $baseVer = null) {
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
    $buang = gc_files($state);   // aman dijalankan sekarang — kita pemegang kunci tulis

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
    'backend'      => 'php-mysql',
    'ts'           => gmdate('c'),
  );
}

// 'YYYY-MM-DD' valid → dikembalikan; selain itu null (biar kolom DATE aman).
function tanggal_valid($d) {
  $d = trim((string)$d);
  return preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) ? $d : null;
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
