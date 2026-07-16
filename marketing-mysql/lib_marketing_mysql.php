<?php
/************************************************************************
 * MARKETING / CRM LAKSAMANA MUDA — Backend PHP + MySQL
 * ---------------------------------------------------------------------
 * Pengganti backend Google Apps Script. Pola sama dengan reservasi-mysql &
 * event-mysql: aplikasi mengirim state UTUH, backend menulis PER-BARIS.
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
  $st->execute(array(':k' => DB_NAME . ':mkt_save'));
  $row = $st->fetch();
  if (empty($row['ok'])) throw new Exception('Server sedang sibuk menyimpan, coba lagi sebentar.');
  return true;
}
function db_unlock($h) {
  if (!$h) return;
  $st = db()->prepare('SELECT RELEASE_LOCK(:k)');
  $st->execute(array(':k' => DB_NAME . ':mkt_save'));
}

/* ==================== PETA KOLEKSI → TABEL ====================
   Format: 'namaKolomDB' => array('fieldDiAplikasi', 'tipe')
   Tipe: str | int | bool | date | datetime | ms
   Menambah field baru di aplikasi TIDAK perlu diubah di sini — field ikut
   tersimpan di kolom `data`. Yang ditulis di sini hanya yang perlu diindeks. */
function collections() {
  return array(
    'clients' => array('table' => 'clients', 'created' => true, 'cols' => array(
      'nama'         => array('nama', 'str'),
      'perusahaan'   => array('perusahaan', 'str'),
      'hp'           => array('hp', 'str'),
      'email'        => array('email', 'str'),
      'source'       => array('source', 'str'),
      'status'       => array('status', 'str'),
      'mkt_pic'      => array('mktPIC', 'str'),
      'last_contact' => array('lastContact', 'date'),
      'next_fu'      => array('nextFU', 'date'),
    )),
    'events' => array('table' => 'events', 'created' => true, 'cols' => array(
      'client_id'    => array('clientId', 'str'),
      'nama'         => array('nama', 'str'),
      'jenis'        => array('jenis', 'str'),
      'tanggal'      => array('tanggal', 'date'),
      'pax'          => array('pax', 'int'),
      'status'       => array('status', 'str'),
      'pipe_col'     => array('pipeCol', 'str'),
      'mkt_pic'      => array('mktPIC', 'str'),
      'invoice_sent' => array('invoiceSent', 'bool'),
    )),
    'followups' => array('table' => 'followups', 'cols' => array(
      'client_id' => array('clientId', 'str'),
      'event_id'  => array('eventId', 'str'),
      'by_user'   => array('by', 'str'),
      'at_time'   => array('at', 'datetime'),
      'next_fu'   => array('next', 'date'),
    )),
    'approvals' => array('table' => 'approvals', 'cols' => array(
      'event_id' => array('eventId', 'str'),
      'status'   => array('status', 'str'),
    )),
    'users' => array('table' => 'users', 'cols' => array(
      'name'   => array('name', 'str'),
      'role'   => array('role', 'str'),
      'divisi' => array('div', 'str'),
      'active' => array('active', 'bool'),
    )),
    'staff' => array('table' => 'staff', 'cols' => array(
      'nama' => array('nama', 'str'),
      'divisi' => array('div', 'str'),
    )),
    'taskTemplates'  => array('table' => 'task_templates', 'cols' => array(
      'divisi' => array('div', 'str'),
    )),
    'taskCategories' => array('table' => 'task_categories', 'cols' => array()),
    'categories'     => array('table' => 'categories', 'cols' => array()),
    'notifs' => array('table' => 'notifs', 'cols' => array(
      'at_time' => array('at', 'datetime'),
    )),
  );
}

/* Kunci top-level yang BUKAN daftar. Disimpan apa adanya di tabel settings. */
function scalar_keys() { return array('settings', 'baseline', 'rolePerms', 'roleNav'); }

/* ==================== NORMALISASI NILAI ==================== */
function tanggal_valid($d) {
  $d = trim((string)$d);
  return preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) ? $d : null;
}
// Kolom datetime hanya untuk indeks/laporan; sumber kebenaran tetap `data`.
// Aplikasi memakai DUA bentuk waktu, jadi diperlakukan berbeda supaya kolom
// COCOK dengan yang dilihat kru di layar:
//   - Ada penanda zona (Z / +07:00), mis. activities.at dari toISOString():
//     itu waktu-instan sungguhan -> dikonversi ke WIB.
//   - Tanpa penanda zona, mis. followups.at dari toISOString().slice(0,16):
//     aplikasi menampilkannya APA ADANYA (tidak pernah diparse) -> disimpan
//     apa adanya juga, jangan digeser. Kalau digeser, kolom laporan beda 7 jam
//     dari yang tampil di aplikasi.
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

  // activities: append-only, terbaru dulu (dibatasi agar tidak membengkak)
  $act = array();
  foreach ($pdo->query('SELECT data FROM activities ORDER BY at_time DESC, id DESC LIMIT 1000') as $row) {
    $r = json_decode($row['data'], true);
    if (is_array($r)) $act[] = $r;
  }
  $out['activities'] = $act;

  // settings + kunci tak dikenal (disimpan dengan awalan 'extra:')
  foreach ($pdo->query('SELECT k, v FROM settings') as $row) {
    $v = json_decode($row['v'], true);
    if (strpos($row['k'], 'extra:') === 0) $out[substr($row['k'], 6)] = $v;
    else                                   $out[$row['k']] = $v;
  }
  // jaring pengaman: aplikasi mengharapkan kunci ini selalu ada
  if (!isset($out['settings']) || !is_array($out['settings'])) $out['settings'] = new stdClass();
  if (!isset($out['baseline'])) $out['baseline'] = 0;

  return $out;
}

function put_setting($pdo, $k, $v) {
  $st = $pdo->prepare('INSERT INTO settings (k, v) VALUES (:k, :v)
                       ON DUPLICATE KEY UPDATE v = VALUES(v)');
  $st->execute(array(':k' => $k, ':v' => json_enc($v)));
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
    $known = array('activities', '_rev');

    foreach (collections() as $nama => $c) {
      $known[] = $nama;
      if (!array_key_exists($nama, $state)) continue;      // tidak dikirim → lewati
      $rows = is_array($state[$nama]) ? $state[$nama] : array();
      $hitung[$nama] = upsert_collection($pdo, $c, $rows, $bentrok, $nama);
    }

    // ---- activities: append-only ----
    if (isset($state['activities']) && is_array($state['activities'])) {
      $ai = $pdo->prepare('INSERT IGNORE INTO activities
              (id, ref_type, ref_id, action, by_user, at_time, data)
              VALUES (:id,:ref_type,:ref_id,:action,:by_user,:at_time,:data)');
      $n = 0;
      foreach ($state['activities'] as $a) {
        if (!is_array($a) || empty($a['id'])) continue;
        $ai->execute(array(
          ':id'       => (string)$a['id'],
          ':ref_type' => ambil($a, 'refType', 'str'),
          ':ref_id'   => ambil($a, 'refId', 'str'),
          ':action'   => ambil($a, 'action', 'str'),
          ':by_user'  => ambil($a, 'by', 'str'),
          ':at_time'  => ambil($a, 'at', 'datetime'),
          ':data'     => json_enc($a),
        ));
        $n++;
      }
      $hitung['activities'] = $n;
      // batasi agar tidak tumbuh tanpa batas
      $pdo->exec('DELETE FROM activities WHERE id NOT IN
                  (SELECT id FROM (SELECT id FROM activities ORDER BY at_time DESC, id DESC LIMIT 5000) t)');
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

  return array(
    'saved'   => true,
    'jumlah'  => $hitung,
    // Baris yang DITOLAK karena orang lain sudah menyimpan duluan. Kosong =
    // semuanya masuk. Aplikasi wajib memberitahu user kalau ini terisi —
    // kalau didiamkan, user mengira perubahannya tersimpan padahal tidak.
    'bentrok' => $bentrok,
    'backend' => 'php-mysql',
    'ts'      => gmdate('c'),
  );
}

/* ==================== DIAGNOSTIK ==================== */
function stats() {
  $pdo = db();
  $out = array('backend' => 'php-mysql', 'db' => DB_NAME);
  $tabel = array('clients','events','followups','approvals','users','staff',
                 'task_templates','task_categories','categories','notifs','activities');
  foreach ($tabel as $t) {
    $out[$t] = (int)$pdo->query('SELECT COUNT(*) c FROM ' . $t)->fetch()['c'];
  }
  $blob = strlen(json_enc(baca_state()));
  $out['blobChars'] = $blob;
  $out['blobMB']    = round($blob / 1048576, 3);
  $out['ts']        = gmdate('c');
  return $out;
}
