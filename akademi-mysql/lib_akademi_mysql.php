<?php
/************************************************************************
 * AKADEMI LAKSAMANA MUDA — Backend PHP + MySQL
 * ---------------------------------------------------------------------
 * Sebelumnya data akademi HANYA di localStorage tiap browser (sinkron Apps
 * Script tidak pernah dipasang: syncUrl kosong). Artinya progress belajar tiap
 * kru terkurung di device-nya sendiri, dan hilang kalau cache dibersihkan.
 * Backend ini membuat satu data dipakai bersama semua device.
 *
 * Pola sama dengan modul lain: aplikasi mengirim state UTUH, backend menulis
 * PER-BARIS dengan penjaga updated_at + baseUpdatedAt.
 *
 * BEDA UTAMA vs Apps Script yang lama:
 *   - Dulu: satu nomor `_rev` untuk SELURUH database. Dua kru yang menyimpan
 *     bersamaan saling ditolak walau mengedit event BERBEDA, lalu muncul
 *     dialog "Timpa punya X / Muat ulang" — dan "timpa" berarti membuang kerja
 *     orang lain.
 *   - Sekarang: penjaga `updated_at` PER BARIS. Dua kru yang menyentuh event
 *     berbeda sama-sama tersimpan. Baris yang datang lebih LAMA tidak pernah
 *     menimpa baris server yang lebih baru.
 *
 * File ini HANYA berisi fungsi (tanpa efek samping saat di-include).
 ************************************************************************/

/* config.local.php dipakai KALAU ADA — untuk tes di laptop tanpa mengubah
   config.php produksi. Di server file itu tidak ada. */
if (file_exists(__DIR__ . '/config.local.php')) require_once __DIR__ . '/config.local.php';
else                                            require_once __DIR__ . '/config.php';

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

/* ==================== FILE BUKTI TRANSFER (di disk) ====================
   Pola sama reservasi: file disimpan di DATA_DIR (di luar web root), TIDAK di
   MySQL. Beda kecil: di sini disimpan biner ASLI (bukan base64) supaya bisa
   langsung disajikan ke browser dengan Content-Type yang benar lewat
   ?action=receipt&key=... — frontend menautkannya sebagai <a href>. */
function receipt_dir() {
  static $dir = null;
  if ($dir !== null) return $dir;
  if (defined('DATA_DIR') && DATA_DIR !== '') {
    if (!is_dir(DATA_DIR) && !@mkdir(DATA_DIR, 0775, true))
      throw new Exception('DATA_DIR tidak bisa dibuat: ' . DATA_DIR);
    $dir = realpath(DATA_DIR) ?: DATA_DIR;
  } else {
    $luar = __DIR__ . '/../../../marketing-db';
    $dalam = __DIR__ . '/db';
    if (is_dir($luar) || @mkdir($luar, 0775, true))        $dir = $luar;
    else if (is_dir($dalam) || @mkdir($dalam, 0775, true)) $dir = $dalam;
    else throw new Exception('Tidak bisa membuat folder bukti. Cek izin tulis hosting.');
    $dir = realpath($dir) ?: $dir;
  }
  return $dir;
}
function receipt_files_dir() { return receipt_dir() . '/receipts'; }
function receipt_di_dalam_web() { return strpos(receipt_dir(), realpath(__DIR__)) === 0; }
function receipt_pastikan_folder() {
  if (!is_dir(receipt_files_dir())) @mkdir(receipt_files_dir(), 0775, true);
  if (!receipt_di_dalam_web()) return;
  // Kalau terpaksa di dalam web root, tutup akses langsung.
  $ht = receipt_dir() . '/.htaccess';
  if (!file_exists($ht)) @file_put_contents($ht,
    "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n" .
    "<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n");
}
// Ekstensi aman dari mime/nama; default bin. Hanya gambar & PDF yang diterima.
function receipt_ext($mime, $name) {
  $mime = strtolower((string)$mime);
  $peta = array('image/jpeg'=>'jpg','image/jpg'=>'jpg','image/png'=>'png',
                'image/webp'=>'webp','image/gif'=>'gif','application/pdf'=>'pdf');
  if (isset($peta[$mime])) return $peta[$mime];
  $e = strtolower(pathinfo((string)$name, PATHINFO_EXTENSION));
  return in_array($e, array('jpg','jpeg','png','webp','gif','pdf'), true) ? ($e==='jpeg'?'jpg':$e) : 'bin';
}
function receipt_ctype($ext) {
  $peta = array('jpg'=>'image/jpeg','png'=>'image/png','webp'=>'image/webp',
                'gif'=>'image/gif','pdf'=>'application/pdf');
  return isset($peta[$ext]) ? $peta[$ext] : 'application/octet-stream';
}
// key -> path aman (cegah path traversal). key yang kita buat sendiri: rc_<uid>.<ext>
function receipt_path($key) {
  $safe = preg_replace('/[^A-Za-z0-9._-]/', '_', (string)$key);
  return receipt_files_dir() . '/' . $safe;
}
function save_receipt($payload) {
  if (!$payload || empty($payload['dataBase64'])) throw new Exception('file kosong');
  receipt_pastikan_folder();
  $ext = receipt_ext(isset($payload['mimeType']) ? $payload['mimeType'] : '',
                     isset($payload['fileName']) ? $payload['fileName'] : '');
  $bin = base64_decode(preg_replace('#^data:[^,]+,#', '', $payload['dataBase64']), true);
  if ($bin === false) throw new Exception('base64 tidak valid');
  if (strlen($bin) > 8 * 1024 * 1024) throw new Exception('file melebihi 8MB');
  $key = 'rc_' . bin2hex(random_bytes(8)) . '.' . $ext;
  if (file_put_contents(receipt_path($key), $bin) === false)
    throw new Exception('gagal menulis file (cek izin folder)');
  // name = nama asli untuk ditampilkan; url dibangun frontend dari key.
  return array('key' => $key, 'name' => isset($payload['fileName']) ? (string)$payload['fileName'] : $key);
}
/* Kumpulkan semua key berkas yang MASIH dipakai, dibaca dari DATABASE.
   Sengaja TIDAK dari payload kiriman: save_all mendukung kiriman parsial, jadi
   kalau GC memakai payload, satu kiriman tanpa `materials` akan menghapus SEMUA
   berkas. Database selalu lengkap. */
function key_terpakai($pdo) {
  $hidup = array();
  // Berkas bisa ditunjuk dari beberapa tempat; semuanya memakai bentuk
  // "...?action=receipt&key=xxx" atau {key:...} — dua-duanya ditangkap.
  $tabel = array('materials');
  foreach ($tabel as $t) {
    foreach ($pdo->query('SELECT data FROM ' . $t) as $row) {
      $s = (string)$row['data'];
      if (preg_match_all('/[?&]key=([^&"\'\\\\]+)/', $s, $m)) {
        foreach ($m[1] as $k) $hidup[urldecode($k)] = true;
      }
      if (preg_match_all('/"key"\s*:\s*"([^"]+)"/', $s, $m2)) {
        foreach ($m2[1] as $k) $hidup[$k] = true;
      }
    }
  }
  return $hidup;
}

/* Buang berkas yatim: ada di disk tapi tidak ditunjuk data mana pun lagi
   (mis. lampiran sudah dihapus dari event, atau bukti transfer diganti).

   JEDA AMAN 1 JAM: berkas yang baru diunggah sengaja dilewati. Unggah dan
   penyimpanan event adalah dua langkah terpisah — tanpa jeda ini, GC yang
   dipicu simpanan kru LAIN bisa menghapus berkas yang baru saja diunggah
   sebelum sempat tercatat ke event-nya. */
function gc_receipts($pdo) {
  $dir = receipt_files_dir();
  if (!is_dir($dir)) return 0;
  $hidup = key_terpakai($pdo);
  $batas = time() - 3600;
  $buang = 0;
  foreach (scandir($dir) as $f) {
    if ($f === '.' || $f === '..') continue;
    if (isset($hidup[$f])) continue;                       // masih dipakai
    $p = $dir . '/' . $f;
    if (!is_file($p)) continue;
    if (filemtime($p) > $batas) continue;                  // baru diunggah -> jangan sentuh
    if (@unlink($p)) $buang++;
  }
  return $buang;
}

function stream_receipt($key) {
  $key = (string)$key;
  if ($key === '' || strpos($key, '..') !== false) { http_response_code(400); exit; }
  $p = receipt_path($key);
  if (!is_file($p)) { http_response_code(404); exit; }
  $ext = strtolower(pathinfo($p, PATHINFO_EXTENSION));
  header('Content-Type: ' . receipt_ctype($ext));
  header('Content-Length: ' . filesize($p));
  header('Content-Disposition: inline; filename="' . basename($p) . '"');
  header('Cache-Control: private, max-age=86400');
  readfile($p);
  exit;
}

/* ==================== KUNCI TULIS ==================== */
function db_lock() {
  $st = db()->prepare('SELECT GET_LOCK(:k, 10) AS ok');
  $st->execute(array(':k' => DB_NAME . ':akademi_save'));
  $row = $st->fetch();
  if (empty($row['ok'])) throw new Exception('Server sedang sibuk menyimpan, coba lagi sebentar.');
  return true;
}
function db_unlock($h) {
  if (!$h) return;
  $st = db()->prepare('SELECT RELEASE_LOCK(:k)');
  $st->execute(array(':k' => DB_NAME . ':akademi_save'));
}

/* ==================== PETA KOLEKSI → TABEL ====================
   Format: 'namaKolomDB' => array('fieldDiAplikasi', 'tipe')
   Tipe: str | int | bool | date | datetime | ms
   Menambah field baru di aplikasi TIDAK perlu diubah di sini — field ikut
   tersimpan di kolom `data`. Yang ditulis di sini hanya yang perlu diindeks. */
function collections() {
  return array(
    'users' => array('table' => 'users', 'cols' => array(
      'name'   => array('name', 'str'),
      'role'   => array('role', 'str'),
      'divisi' => array('division', 'str'),   // "div" reserved word di MySQL
      'title'  => array('title', 'str'),
      'active' => array('active', 'bool'),
    )),
    'divisions' => array('table' => 'divisions', 'cols' => array(
      'name' => array('name', 'str'),
    )),
    'materials' => array('table' => 'materials', 'created' => true, 'cols' => array(
      'title'     => array('title', 'str'),
      'kind'      => array('type', 'str'),     // app: type
      'cat'       => array('cat', 'str'),
      'mandatory' => array('mandatory', 'bool'),
      'published' => array('published', 'bool'),
      'passing'   => array('passing', 'int'),
    )),
    'programs' => array('table' => 'programs', 'created' => true, 'cols' => array(
      'title'    => array('title', 'str'),
      'bulan'    => array('bulan', 'str'),
      'deadline' => array('deadline', 'date'),
    )),
  );
}

/* Kunci top-level yang BUKAN daftar. Disimpan apa adanya di tabel settings. */
/* Kunci top-level yang BUKAN daftar. */
function scalar_keys() { return array('settings', 'version', 'createdAt'); }

/* ==================== NORMALISASI NILAI ==================== */
function tanggal_valid($d) {
  $d = trim((string)$d);
  return preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) ? $d : null;
}
// Kolom datetime hanya untuk indeks/laporan; sumber kebenaran tetap `data`.
// Modul Konten kebanyakan memakai epoch ms (createdAt/at) + tanggal polos
// (deadline/publishDate), jadi fungsi ini jarang terpakai. Tetap disediakan
// supaya aman kalau nanti ada field waktu bergaya ISO, dengan aturan:
//   - Ada penanda zona (Z / +07:00) = waktu-instan sungguhan -> konversi ke WIB.
//   - Tanpa penanda zona = jam-dinding yang ditampilkan apa adanya oleh
//     aplikasi -> disimpan apa adanya, jangan digeser. Kalau digeser, kolom
//     laporan beda 7 jam dari yang tampil di layar.
function datetime_valid($v) {
  $v = trim((string)$v);
  if ($v === '') return null;
  $adaZona = preg_match('/(Z|[+\-]\d{2}:?\d{2})$/', $v);
  if ($adaZona) {
    $ts = strtotime($v);
    if ($ts === false) return null;
    $d = new DateTime('@' . $ts);
    $d->setTimezone(new DateTimeZone('Asia/Jakarta'));
    return $d->format('Y-m-d H:i:s');
  }
  // tanpa zona: pakai jam-dindingnya apa adanya (T -> spasi, buang milidetik).
  // Dibangun & diformat di UTC supaya tidak digeser zona server sama sekali.
  $v = str_replace('T', ' ', $v);
  $v = preg_replace('/\.\d+$/', '', $v);
  try { return (new DateTime($v, new DateTimeZone('UTC')))->format('Y-m-d H:i:s'); }
  catch (Throwable $e) { return null; }
}
function ms_valid($v) {
  if (is_int($v) || is_float($v)) return (int)$v;
  if (is_string($v) && $v !== '') {
    if (ctype_digit($v)) return (int)$v;
    $ts = strtotime($v);
    if ($ts !== false) return $ts * 1000;
  }
  return 0;
}
function ambil($row, $field, $type) {
  $v = isset($row[$field]) ? $row[$field] : null;
  switch ($type) {
    case 'int':      return intval($v);
    case 'bool':     return empty($v) ? 0 : 1;
    case 'date':     return tanggal_valid($v);
    case 'datetime': return datetime_valid($v);
    case 'ms':       return ms_valid($v);
    default:         return $v === null ? null : (string)$v;
  }
}
function json_enc($v) { return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); }

/* ==================== BACA STATE ====================
   Bentuk hasilnya PERSIS objek S yang dipakai aplikasi. */
function baca_state() {
  $pdo = db();
  $out = array();

  foreach (collections() as $nama => $c) {
    $urut = isset($c['created']) ? 'created_at DESC, id DESC' : 'id ASC';
    $rows = array();
    foreach ($pdo->query('SELECT data FROM ' . $c['table'] . ' ORDER BY ' . $urut) as $row) {
      $r = json_decode($row['data'], true);
      if (is_array($r)) $rows[] = $r;
    }
    $out[$nama] = $rows;
  }

  // activity: append-only, terbaru dulu (dibatasi agar tidak membengkak)
  $act = array();
  foreach ($pdo->query('SELECT data FROM activity ORDER BY ts DESC, id DESC LIMIT 1000') as $row) {
    $r = json_decode($row['data'], true);
    if (is_array($r)) $act[] = $r;
  }
  $out['activity'] = $act;

  /* progress & progProg: di DB berbentuk BARIS, di aplikasi berbentuk MAP
     bersarang. Dirakit ulang di sini supaya frontend tidak perlu tahu
     bedanya sama sekali. */
  $pr = array();
  foreach ($pdo->query('SELECT user_id, material_id, data FROM progress') as $row) {
    $r = json_decode($row['data'], true);
    if (!is_array($r)) continue;
    if (!isset($pr[$row['user_id']])) $pr[$row['user_id']] = array();
    $pr[$row['user_id']][$row['material_id']] = $r;
  }
  $out['progress'] = $pr ? $pr : new stdClass();

  $pp = array();
  foreach ($pdo->query('SELECT user_id, program_id, material_id, data FROM prog_prog') as $row) {
    $r = json_decode($row['data'], true);
    if (!is_array($r)) continue;
    $u = $row['user_id']; $g = $row['program_id'];
    if (!isset($pp[$u])) $pp[$u] = array();
    if (!isset($pp[$u][$g])) $pp[$u][$g] = array();
    $pp[$u][$g][$row['material_id']] = $r;
  }
  $out['progProg'] = $pp ? $pp : new stdClass();

  // settings + kunci tak dikenal (disimpan dengan awalan 'extra:')
  foreach ($pdo->query('SELECT k, v FROM settings') as $row) {
    $v = json_decode($row['v'], true);
    if (strpos($row['k'], 'extra:') === 0) $out[substr($row['k'], 6)] = $v;
    else                                   $out[$row['k']] = $v;
  }
  // jaring pengaman: aplikasi mengharapkan kunci ini selalu ada
  if (!isset($out['settings']) || !is_array($out['settings'])) $out['settings'] = new stdClass();
  if (!isset($out['version'])) $out['version'] = 2;

  return $out;
}

function put_setting($pdo, $k, $v) {
  $st = $pdo->prepare('INSERT INTO settings (k, v) VALUES (:k, :v)
                       ON DUPLICATE KEY UPDATE v = VALUES(v)');
  $st->execute(array(':k' => $k, ':v' => json_enc($v)));
}

/* ==================== KHUSUS AKADEMI ====================
   Dua bentuk data di modul ini tidak seperti modul lain, jadi ditangani
   tersendiri. Frontend TIDAK perlu tahu: baca_state() merakitnya kembali
   persis seperti bentuk aslinya. */

/* Baris activity tidak punya id di aplikasi. Id dibuat dari sidik jari isinya
   (ts + user + action + detail) supaya kiriman ulang daftar yang sama tidak
   menggandakan baris — jejak aktivitas harus akurat, bukan menggembung. */
function id_activity($a) {
  $kunci = (isset($a['ts']) ? $a['ts'] : '') . '|' .
           (isset($a['userId']) ? $a['userId'] : '') . '|' .
           (isset($a['action']) ? $a['action'] : '') . '|' .
           (isset($a['detail']) ? $a['detail'] : '');
  return 'ac_' . substr(sha1($kunci), 0, 24);
}

/* progress[userId][materialId] = {done,score,at,...}  ->  1 baris per pasangan.
   Dipecah begini supaya laporan "siapa lulus kuis apa" bisa dijawab SQL. */
function simpan_progress($pdo, $map) {
  $st = $pdo->prepare('INSERT INTO progress
          (user_id, material_id, done, score, at_ms, updated_at, data)
          VALUES (:u,:m,:done,:score,:at,:upd,:data)
          ON DUPLICATE KEY UPDATE
            done       = IF(VALUES(updated_at) >= updated_at, VALUES(done),       done),
            score      = IF(VALUES(updated_at) >= updated_at, VALUES(score),      score),
            at_ms      = IF(VALUES(updated_at) >= updated_at, VALUES(at_ms),      at_ms),
            data       = IF(VALUES(updated_at) >= updated_at, VALUES(data),       data),
            updated_at = IF(VALUES(updated_at) >= updated_at, VALUES(updated_at), updated_at)');
  $n = 0; $pasangan = array();
  foreach ($map as $uid => $mats) {
    if (!is_array($mats)) continue;
    foreach ($mats as $mid => $r) {
      if (!is_array($r)) continue;
      $st->execute(array(
        ':u' => (string)$uid, ':m' => (string)$mid,
        ':done'  => empty($r['done']) ? 0 : 1,
        ':score' => isset($r['score']) ? intval($r['score']) : null,
        ':at'    => ms_valid(isset($r['at']) ? $r['at'] : 0),
        ':upd'   => ms_valid(isset($r['updatedAt']) ? $r['updatedAt'] : (isset($r['at']) ? $r['at'] : 0)),
        ':data'  => json_enc($r),
      ));
      $pasangan[] = array((string)$uid, (string)$mid);
      $n++;
    }
  }
  hapus_progress_hilang($pdo, 'progress', array('user_id','material_id'), $pasangan);
  return $n;
}

/* progProg[userId][programId][materialId] -> 1 baris per tiga serangkai. */
function simpan_progprog($pdo, $map) {
  $st = $pdo->prepare('INSERT INTO prog_prog
          (user_id, program_id, material_id, done, score, at_ms, updated_at, data)
          VALUES (:u,:p,:m,:done,:score,:at,:upd,:data)
          ON DUPLICATE KEY UPDATE
            done       = IF(VALUES(updated_at) >= updated_at, VALUES(done),       done),
            score      = IF(VALUES(updated_at) >= updated_at, VALUES(score),      score),
            at_ms      = IF(VALUES(updated_at) >= updated_at, VALUES(at_ms),      at_ms),
            data       = IF(VALUES(updated_at) >= updated_at, VALUES(data),       data),
            updated_at = IF(VALUES(updated_at) >= updated_at, VALUES(updated_at), updated_at)');
  $n = 0; $tiga = array();
  foreach ($map as $uid => $progs) {
    if (!is_array($progs)) continue;
    foreach ($progs as $pid => $mats) {
      if (!is_array($mats)) continue;
      foreach ($mats as $mid => $r) {
        if (!is_array($r)) continue;
        $st->execute(array(
          ':u' => (string)$uid, ':p' => (string)$pid, ':m' => (string)$mid,
          ':done'  => empty($r['done']) ? 0 : 1,
          ':score' => isset($r['score']) ? intval($r['score']) : null,
          ':at'    => ms_valid(isset($r['at']) ? $r['at'] : 0),
          ':upd'   => ms_valid(isset($r['updatedAt']) ? $r['updatedAt'] : (isset($r['at']) ? $r['at'] : 0)),
          ':data'  => json_enc($r),
        ));
        $tiga[] = array((string)$uid, (string)$pid, (string)$mid);
        $n++;
      }
    }
  }
  hapus_progress_hilang($pdo, 'prog_prog', array('user_id','program_id','material_id'), $tiga);
  return $n;
}

/* Hapus baris progress yang tidak ada lagi di kiriman.
   JAGA-JAGA sama seperti koleksi lain: kiriman KOSONG tidak pernah
   mengosongkan tabel — progress belajar kru terlalu mahal untuk hilang gara-
   gara satu kiriman yang kebetulan kosong. */
function hapus_progress_hilang($pdo, $tabel, $kolom, $baris) {
  if (count($baris) === 0) return;
  $satuan = '(' . implode(',', array_fill(0, count($kolom), '?')) . ')';
  $place = implode(',', array_fill(0, count($baris), $satuan));
  $sql = 'DELETE FROM ' . $tabel . ' WHERE (' . implode(',', $kolom) . ') NOT IN (' . $place . ')';
  $args = array();
  foreach ($baris as $b) foreach ($b as $v) $args[] = $v;
  $pdo->prepare($sql)->execute($args);
}

/* ==================== UPSERT SATU KOLEKSI ====================
   Dua lapis perlindungan:

   1. `baseUpdatedAt` (penjaga bentrok sungguhan).
      Klien ikut mengirim "versi baris yang dia pegang saat mulai mengedit".
      Kalau versi di server sudah lebih baru, berarti orang lain menyimpan
      duluan sesudah klien memuat -> baris itu DITOLAK dan dilaporkan, bukan
      ditimpa diam-diam.

      Ini menutup kasus nyata: Budi buka Event A jam 10:00, Andi ubah Pax jam
      10:01, Budi ubah Area jam 10:02. Tanpa lapis ini, kiriman Budi (cap 10:02,
      tapi isinya salinan jam 10:00) menang dan perubahan Andi lenyap.

   2. `updated_at` (penjaga urutan).
      Untuk baris yang TIDAK diubah klien (dikirim apa adadanya karena aplikasi
      mengirim state utuh): capnya tetap lama, jadi tidak akan menimpa baris
      server yang lebih baru.

   Bentrok dikumpulkan, bukan membatalkan seluruh simpanan — perubahan lain
   yang tidak bertabrakan tetap tersimpan. */
function upsert_collection($pdo, $c, $rows, &$bentrok, $namaKoleksi) {
  $tabel = $c['table'];
  $cols  = $c['cols'];
  $adaCreated = !empty($c['created']);

  // versi server untuk baris yang dikirim (sekali query, bukan per baris)
  $kirimIds = array();
  foreach ($rows as $r) if (is_array($r) && !empty($r['id'])) $kirimIds[] = (string)$r['id'];
  $verServer = array();
  if ($kirimIds) {
    $place = implode(',', array_fill(0, count($kirimIds), '?'));
    $q = $pdo->prepare('SELECT id, updated_at FROM ' . $tabel . ' WHERE id IN (' . $place . ')');
    $q->execute($kirimIds);
    foreach ($q as $row) $verServer[$row['id']] = (int)$row['updated_at'];
  }

  $names = array_merge(array('id'), array_keys($cols), array('updated_at'));
  if ($adaCreated) $names[] = 'created_at';
  $names[] = 'data';

  $ph = array();
  foreach ($names as $n) $ph[] = ':' . $n;

  // created_at sengaja tidak pernah ditimpa: waktu lahir baris itu tetap.
  $upd = array();
  foreach (array_merge(array_keys($cols), array('data')) as $n) {
    $upd[] = $n . ' = IF(VALUES(updated_at) >= updated_at, VALUES(' . $n . '), ' . $n . ')';
  }
  $upd[] = 'updated_at = IF(VALUES(updated_at) >= updated_at, VALUES(updated_at), updated_at)';

  $sql = 'INSERT INTO ' . $tabel . ' (' . implode(',', $names) . ') VALUES (' . implode(',', $ph) . ')
          ON DUPLICATE KEY UPDATE ' . implode(', ', $upd);
  $st = $pdo->prepare($sql);

  $ids = array();
  foreach ($rows as $r) {
    if (!is_array($r) || empty($r['id'])) continue;
    $id = (string)$r['id'];
    $ids[] = $id;   // tetap dihitung "ada" walau bentrok, supaya tidak ikut terhapus

    // --- penjaga bentrok: hanya untuk baris yang memang diubah klien ---
    $lolosBentrok = false;
    if (array_key_exists('baseUpdatedAt', $r)) {
      $base = ms_valid($r['baseUpdatedAt']);
      if (isset($verServer[$id]) && $verServer[$id] > $base) {
        $bentrok[] = array(
          'koleksi'   => $namaKoleksi,
          'id'        => $id,
          'nama'      => isset($r['nama']) ? (string)$r['nama'] : (isset($r['name']) ? (string)$r['name'] : $id),
          'versiKamu' => $base,
          'versiServer' => $verServer[$id],
        );
        continue;   // JANGAN timpa kerja orang lain
      }
      // Lolos cek bentrok = tidak ada yang menyalip. Baris ini WAJIB masuk.
      $lolosBentrok = true;
    }

    // baseUpdatedAt hanya metadata kiriman — jangan ikut tersimpan di `data`.
    $simpan = $r; unset($simpan['baseUpdatedAt']);

    $ua = ms_valid(isset($simpan['updatedAt']) ? $simpan['updatedAt'] : 0);
    // Kalau sudah lolos cek bentrok, pastikan penjaga urutan `updated_at >=`
    // TIDAK ikut memblokir: naikkan cap minimal 1 di atas versi server. Tanpa
    // ini, tulisan yang benar bisa terbuang diam-diam kalau cap klien kebetulan
    // <= cap server (mis. jam antar-perangkat sedikit berbeda). Untuk baris
    // yang TIDAK diubah (tanpa baseUpdatedAt), penjaga urutan tetap berlaku.
    if ($lolosBentrok && isset($verServer[$id]) && $ua <= $verServer[$id]) {
      $ua = $verServer[$id] + 1;
    }

    $args = array(':id' => $id);
    foreach ($cols as $kolom => $def) $args[':' . $kolom] = ambil($simpan, $def[0], $def[1]);
    $args[':updated_at'] = $ua;
    if ($adaCreated) $args[':created_at'] = ms_valid(isset($simpan['createdAt']) ? $simpan['createdAt'] : 0);
    $args[':data'] = json_enc($simpan);
    $st->execute($args);
  }

  hapus_yang_hilang($pdo, $tabel, 'id', $ids);
  return count($ids);
}

/* Hapus baris yang tidak ada di kiriman.
   JAGA-JAGA: kiriman KOSONG tidak pernah mengosongkan tabel — lindungi dari
   state kosong yang tak sengaja (mis. aplikasi gagal load lalu menyimpan). */
function hapus_yang_hilang($pdo, $tabel, $kolomId, $ids) {
  if (count($ids) === 0) return;
  $place = implode(',', array_fill(0, count($ids), '?'));
  $del = $pdo->prepare('DELETE FROM ' . $tabel . ' WHERE ' . $kolomId . ' NOT IN (' . $place . ')');
  $del->execute($ids);
}

/* ==================== SIMPAN ==================== */
function save_all($state) {
  if (!is_array($state)) throw new Exception('Payload data kosong/invalid');

  $pdo = db();
  $pdo->beginTransaction();
  try {
    $hitung = array();
    $bentrok = array();
    $known = array('activity', 'progress', 'progProg', '_rev');

    foreach (collections() as $nama => $c) {
      $known[] = $nama;
      if (!array_key_exists($nama, $state)) continue;      // tidak dikirim → lewati
      $rows = is_array($state[$nama]) ? $state[$nama] : array();
      $hitung[$nama] = upsert_collection($pdo, $c, $rows, $bentrok, $nama);
    }

    // ---- activity: append-only (jejak tidak pernah ditimpa/dihapus) ----
    // Baris activity TIDAK punya id di aplikasi (cuma ts+userId+action+detail),
    // jadi id dibuat dari sidik jari isinya. Dengan INSERT IGNORE, kiriman
    // ulang daftar yang sama tidak menggandakan baris.
    if (isset($state['activity']) && is_array($state['activity'])) {
      $ai = $pdo->prepare('INSERT IGNORE INTO activity
              (id, ts, user_id, action, data) VALUES (:id,:ts,:user_id,:action,:data)');
      $n = 0;
      foreach ($state['activity'] as $a) {
        if (!is_array($a)) continue;
        $ai->execute(array(
          ':id'      => id_activity($a),
          ':ts'      => ms_valid(isset($a['ts']) ? $a['ts'] : 0),
          ':user_id' => ambil($a, 'userId', 'str'),
          ':action'  => ambil($a, 'action', 'str'),
          ':data'    => json_enc($a),
        ));
        $n++;
      }
      $hitung['activity'] = $n;
      // batasi agar tidak tumbuh tanpa batas
      $pdo->exec('DELETE FROM activity WHERE id NOT IN
                  (SELECT id FROM (SELECT id FROM activity ORDER BY ts DESC, id DESC LIMIT 5000) t)');
    }

    // ---- progress: map bersarang -> baris ----
    if (isset($state['progress']) && is_array($state['progress'])) {
      $hitung['progress'] = simpan_progress($pdo, $state['progress']);
    }
    // ---- progProg: map 3 tingkat -> baris ----
    if (isset($state['progProg']) && is_array($state['progProg'])) {
      $hitung['progProg'] = simpan_progprog($pdo, $state['progProg']);
    }

    // ---- settings & kunci non-daftar ----
    foreach (scalar_keys() as $k) {
      $known[] = $k;
      if (array_key_exists($k, $state)) put_setting($pdo, $k, $state[$k]);
    }

    // ---- kunci top-level yang belum dikenal backend ----
    // Disimpan apa adanya (awalan 'extra:') supaya aplikasi boleh menambah
    // bagian baru tanpa datanya diam-diam hilang di sini.
    foreach ($state as $k => $v) {
      if (in_array($k, $known, true)) continue;
      put_setting($pdo, 'extra:' . $k, $v);
    }

    $pdo->commit();
  } catch (Throwable $e) {
    $pdo->rollBack();
    throw $e;
  }

  // Bersihkan berkas yatim SETELAH commit: menghapus file tidak bisa di-rollback,
  // jadi jangan sampai transaksi gagal tapi berkasnya sudah telanjur hilang.
  // Dijalankan di dalam kunci tulis (api.php membungkus saveAll dgn db_lock).
  $buang = 0;
  try { $buang = gc_receipts($pdo); }
  catch (Throwable $e) { /* gagal bersih-bersih bukan alasan menggagalkan simpanan */ }

  return array(
    'saved'   => true,
    'jumlah'  => $hitung,
    'berkasDibuang' => $buang,
    // Baris yang DITOLAK karena orang lain sudah menyimpan duluan. Kosong =
    // semuanya masuk. Aplikasi wajib memberitahu user kalau ini terisi —
    // kalau didiamkan, user mengira perubahannya tersimpan padahal tidak.
    'bentrok' => $bentrok,
    'backend' => 'php-mysql',
    'ts'      => gmdate('c'),
  );
}

/* ==================== TRAINING STATS (untuk Staff Performance) ====================
   Peta { userId: {mandPct,mandTotal,mandDone,total,done,certified} }, dibaca modul
   `hr` untuk komponen Training 10% di People Score. Baca-saja, satu arah: Akademi
   tidak pernah membaca balik dari hr. Lihat docs/hr-akademi-integration.md.

   MENIRU userStats() di klien Akademi PERSIS supaya angkanya tidak pernah beda:
     matsForUser : materi published yang cocok divisi user (division 'all' -> semua)
     isDone      : quiz -> data.passed === true; selain itu -> data.status === 'done'
     mandPct     : dari materi WAJIB. Tanpa materi wajib -> 100.

   CATATAN kolom: jangan pakai kolom `progress.done` sebagai penentu lulus. Kolom
   itu turunan (`empty($r['done']) ? 0 : 1`) dan TIDAK sama dengan `passed` kuis.
   Sumber kebenaran tetap kolom `data` (JSON), sama seperti baca_state(). */
function training_stats() {
  $pdo = db();

  // Materi published saja, sekalian ambil division[] dari `data` (JAMAK).
  $mats = array();
  foreach ($pdo->query('SELECT id, kind, mandatory, published, data FROM materials') as $row) {
    if (empty($row['published'])) continue;
    $d = json_decode($row['data'], true);
    $div = (is_array($d) && isset($d['division'])) ? $d['division'] : array();
    if (!is_array($div)) $div = $div === null || $div === '' ? array() : array($div);
    $mats[] = array(
      'id'        => $row['id'],
      'kind'      => $row['kind'],
      'mandatory' => !empty($row['mandatory']),
      'division'  => $div,
    );
  }

  // progress[userId][materialId] = data JSON utuh (punya passed/status).
  $prog = array();
  foreach ($pdo->query('SELECT user_id, material_id, data FROM progress') as $row) {
    $r = json_decode($row['data'], true);
    if (!is_array($r)) continue;
    if (!isset($prog[$row['user_id']])) $prog[$row['user_id']] = array();
    $prog[$row['user_id']][$row['material_id']] = $r;
  }

  $out = array();
  foreach ($pdo->query('SELECT id, divisi, active FROM users') as $u) {
    if (empty($u['active'])) continue;              // kru nonaktif dikecualikan
    $uid    = $u['id'];
    $divisi = $u['divisi'];
    $pByU   = isset($prog[$uid]) ? $prog[$uid] : array();

    $total = 0; $done = 0; $mandTotal = 0; $mandDone = 0;
    foreach ($mats as $m) {
      $cocok = ($divisi === 'all')
        || in_array('all', $m['division'], true)
        || in_array($divisi, $m['division'], true);
      if (!$cocok) continue;

      $p = isset($pByU[$m['id']]) ? $pByU[$m['id']] : null;
      $selesai = false;
      if (is_array($p)) {
        $selesai = ($m['kind'] === 'quiz')
          ? (isset($p['passed']) && $p['passed'] === true)
          : (isset($p['status']) && $p['status'] === 'done');
      }

      $total++;
      if ($selesai) $done++;
      if ($m['mandatory']) {
        $mandTotal++;
        if ($selesai) $mandDone++;
      }
    }

    $out[$uid] = array(
      'mandPct'   => $mandTotal ? (int)round($mandDone / $mandTotal * 100) : 100,
      'mandTotal' => $mandTotal,
      'mandDone'  => $mandDone,
      'total'     => $total,
      'done'      => $done,
      'certified' => $mandTotal > 0 && $mandDone === $mandTotal,
    );
  }
  return $out ? $out : new stdClass();
}

/* ==================== DIAGNOSTIK ==================== */
function stats() {
  $pdo = db();
  $out = array('backend' => 'php-mysql', 'db' => DB_NAME);
  $tabel = array('users','divisions','materials','programs','progress','prog_prog','activity');
  foreach ($tabel as $t) {
    $out[$t] = (int)$pdo->query('SELECT COUNT(*) c FROM ' . $t)->fetch()['c'];
  }
  $blob = strlen(json_enc(baca_state()));
  $out['blobChars'] = $blob;
  $out['blobMB']    = round($blob / 1048576, 3);

  // Berkas di disk (lampiran + bukti transfer) — untuk memantau tanpa perlu
  // membuka File Manager. `berkasYatim` yang terus bertambah = GC bermasalah.
  $dir = receipt_files_dir();
  $n = 0; $byte = 0; $yatim = 0;
  if (is_dir($dir)) {
    $hidup = key_terpakai($pdo);
    foreach (scandir($dir) as $f) {
      if ($f === '.' || $f === '..') continue;
      $p = $dir . '/' . $f;
      if (!is_file($p)) continue;
      $n++; $byte += filesize($p);
      if (!isset($hidup[$f])) $yatim++;
    }
  }
  $out['berkas']       = $n;
  $out['berkasMB']     = round($byte / 1048576, 3);
  $out['berkasYatim']  = $yatim;      // menunggu jeda aman 1 jam sebelum dibuang
  $out['folderBerkas'] = $dir;
  $out['amanDiLuarWeb'] = !receipt_di_dalam_web();

  $out['ts'] = gmdate('c');
  return $out;
}
