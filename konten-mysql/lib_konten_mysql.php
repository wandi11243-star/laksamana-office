<?php
/************************************************************************
 * KONTEN / CONTENT OPERATIONS LAKSAMANA MUDA — Backend PHP + MySQL
 * ---------------------------------------------------------------------
 * Pengganti backend Google Apps Script. Pola sama dengan marketing-mysql:
 * aplikasi mengirim state UTUH, backend menulis PER-BARIS.
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
   kalau GC memakai payload, satu kiriman tanpa `content` akan menghapus SEMUA
   berkas. Database selalu lengkap. */
function key_terpakai($pdo) {
  $hidup = array();
  // Berkas bisa ditunjuk dari beberapa tempat; semuanya memakai bentuk
  // "...?action=receipt&key=xxx" atau {key:...} — dua-duanya ditangkap.
  $tabel = array('content', 'assets', 'bank');
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
  $st->execute(array(':k' => DB_NAME . ':konten_save'));
  $row = $st->fetch();
  if (empty($row['ok'])) throw new Exception('Server sedang sibuk menyimpan, coba lagi sebentar.');
  return true;
}
function db_unlock($h) {
  if (!$h) return;
  $st = db()->prepare('SELECT RELEASE_LOCK(:k)');
  $st->execute(array(':k' => DB_NAME . ':konten_save'));
}

/* ==================== PETA KOLEKSI → TABEL ====================
   Format: 'namaKolomDB' => array('fieldDiAplikasi', 'tipe')
   Tipe: str | int | bool | date | datetime | ms
   Menambah field baru di aplikasi TIDAK perlu diubah di sini — field ikut
   tersimpan di kolom `data`. Yang ditulis di sini hanya yang perlu diindeks. */
function collections() {
  return array(
    'users' => array('table' => 'users', 'cols' => array(
      'name'     => array('name', 'str'),
      'email'    => array('email', 'str'),
      'divisi'   => array('division', 'str'),   // "div" reserved word di MySQL
      'capacity' => array('capacity', 'int'),
      'avail'    => array('avail', 'str'),
    )),
    'brands' => array('table' => 'brands', 'cols' => array(
      'name' => array('name', 'str'),
    )),
    'campaigns' => array('table' => 'campaigns', 'cols' => array(
      'name'       => array('name', 'str'),
      'brand'      => array('brand', 'str'),
      'start_date' => array('start', 'date'),
      'end_date'   => array('end', 'date'),
    )),
    'content' => array('table' => 'content', 'created' => true, 'cols' => array(
      'title'        => array('title', 'str'),
      'brand'        => array('brand', 'str'),
      'campaign'     => array('campaign', 'str'),
      'platform'     => array('platform', 'str'),
      'pillar'       => array('pillar', 'str'),
      'content_type' => array('contentType', 'str'),
      'status'       => array('status', 'str'),
      'priority'     => array('priority', 'str'),
      'pic'          => array('pic', 'str'),
      'deadline'     => array('deadline', 'date'),
      'publish_date' => array('publishDate', 'date'),
      'publish_time' => array('publishTime', 'str'),
    )),
    // Task produksi berdiri sendiri (tidak menunjuk content), pelaksana = pic,
    // tanggal = date. Diverifikasi dari data live.
    'prodTasks' => array('table' => 'prod_tasks', 'cols' => array(
      'kind'     => array('kind', 'str'),
      'title'    => array('title', 'str'),
      'brand'    => array('brand', 'str'),
      'pic'      => array('pic', 'str'),
      'priority' => array('priority', 'str'),
      'status'   => array('status', 'str'),
      'tanggal'  => array('date', 'date'),
    )),
    'shootings' => array('table' => 'shootings', 'cols' => array(
      'title'    => array('title', 'str'),
      'tanggal'  => array('date', 'date'),
      'location' => array('location', 'str'),
      'status'   => array('status', 'str'),
    )),
    'assets' => array('table' => 'assets', 'cols' => array(
      'name'    => array('name', 'str'),
      'kind'    => array('type', 'str'),
      'by_user' => array('by', 'str'),
      'at_ms'   => array('at', 'ms'),
    )),
    // Bank ide: "type" ternyata tidak ada; yang ada category/platform/status.
    'bank' => array('table' => 'bank', 'cols' => array(
      'owner'    => array('owner', 'str'),
      'title'    => array('title', 'str'),
      'brand'    => array('brand', 'str'),
      'platform' => array('platform', 'str'),
      'kind'     => array('category', 'str'),
      'status'   => array('status', 'str'),
      'at_ms'    => array('at', 'ms'),
    )),
    // Bentuk asli (diverifikasi dari data live): kategori BANYAK (categories[]),
    // tarif = rateValue, kontak = whatsapp/instagram/tiktok. Tidak ada
    // phone/followers/status/platform seperti dugaan awal.
    'kols' => array('table' => 'kols', 'created' => true, 'cols' => array(
      'name'      => array('name', 'str'),
      'kol_type'  => array('type', 'str'),
      'instagram' => array('instagram', 'str'),
      'whatsapp'  => array('whatsapp', 'str'),
      'rate_value'=> array('rateValue', 'int'),
    )),
    'visits' => array('table' => 'visits', 'created' => true, 'cols' => array(
      'title'    => array('title', 'str'),
      'kol_id'   => array('kolId', 'str'),
      'brand'    => array('brand', 'str'),
      'pic'      => array('pic', 'str'),
      'tanggal'  => array('date', 'date'),
      'location' => array('location', 'str'),
      'status'   => array('status', 'str'),
    )),
    'ads' => array('table' => 'ads', 'created' => true, 'cols' => array(
      'name'       => array('name', 'str'),
      'brand'      => array('brand', 'str'),
      'platform'   => array('platform', 'str'),
      'objective'  => array('objective', 'str'),
      'status'     => array('status', 'str'),
      'budget'     => array('budget', 'int'),
      'spent'      => array('spent', 'int'),
      'start_date' => array('start', 'date'),
      'end_date'   => array('end', 'date'),
    )),
    'adFunds' => array('table' => 'ad_funds', 'created' => true, 'cols' => array(
      'platform' => array('platform', 'str'),
      'amount'   => array('amount', 'int'),
      'tanggal'  => array('date', 'date'),
    )),
    'notifs' => array('table' => 'notifs', 'cols' => array(
      'for_user' => array('to', 'str'),         // data live memakai "to", bukan "for"
      'kind'     => array('type', 'str'),
      'at_ms'    => array('at', 'ms'),
      'seen'     => array('read', 'bool'),      // "read" reserved word di MySQL
    )),
  );
}

/* Kunci top-level yang BUKAN daftar. Disimpan apa adanya di tabel settings. */
/* Kunci top-level yang BUKAN daftar. */
function scalar_keys() { return array('settings', 'perms', 'seeded'); }

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

  // logs: append-only, terbaru dulu (dibatasi agar tidak membengkak)
  $act = array();
  foreach ($pdo->query('SELECT data FROM logs ORDER BY at_ms DESC, id DESC LIMIT 1000') as $row) {
    $r = json_decode($row['data'], true);
    if (is_array($r)) $act[] = $r;
  }
  $out['logs'] = $act;

  // settings + kunci tak dikenal (disimpan dengan awalan 'extra:')
  foreach ($pdo->query('SELECT k, v FROM settings') as $row) {
    $v = json_decode($row['v'], true);
    if (strpos($row['k'], 'extra:') === 0) $out[substr($row['k'], 6)] = $v;
    else                                   $out[$row['k']] = $v;
  }
  // jaring pengaman: aplikasi mengharapkan kunci ini selalu ada
  if (!isset($out['settings']) || !is_array($out['settings'])) $out['settings'] = new stdClass();
  if (!isset($out['perms']) || !is_array($out['perms'])) $out['perms'] = new stdClass();

  /* CATATAN: `_fitur` SENGAJA TIDAK dipasang di sini. Ia dipasang api.php,
     dan HANYA kalau lib ini memang punya hapus_id_eksplisit(). lib & api
     diunggah berkas-per-berkas oleh FTP, jadi "lib baru + api lama" mungkin
     terjadi — dan api lama tidak meneruskan `hapus`, sehingga save_all jatuh
     ke hapus_yang_hilang dengan kiriman sepotong = SEMUA baris non-dikirim
     terhapus. Iklan dari sisi yang benar-benar menangani `hapus` menutup itu. */
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
function upsert_collection($pdo, $c, $rows, &$bentrok, $namaKoleksi, $kenal = null, $hapus = null, &$versi = null) {
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

    $uaKirim = ms_valid(isset($simpan['updatedAt']) ? $simpan['updatedAt'] : 0);
    // Kalau sudah lolos cek bentrok, pastikan penjaga urutan `updated_at >=`
    // TIDAK ikut memblokir: naikkan cap minimal 1 di atas versi server. Tanpa
    // ini, tulisan yang benar bisa terbuang diam-diam kalau cap klien kebetulan
    // <= cap server (mis. jam antar-perangkat sedikit berbeda). Untuk baris
    // yang TIDAK diubah (tanpa baseUpdatedAt), penjaga urutan tetap berlaku.
    $ua = $uaKirim;
    if ($lolosBentrok && isset($verServer[$id]) && $ua <= $verServer[$id]) {
      $ua = $verServer[$id] + 1;
    }
    /* CAP YANG BENAR-BENAR DIPAKAI IKUT DITULIS KE `data` DAN DIPULANGKAN.
       Kalau server menaikkan cap (cap klien <= versi server), angka itu berbeda
       dari yang dipegang klien. Tanpa baris ini klien menyimpan acuan bentrok
       dari cap lamanya, lalu SETIAP suntingan berikutnya pada baris yang sama
       dilaporkan bentrok padahal tidak ada yang menyalip — persis yang sudah
       dibayar di modul Event & Marketing (lihat blok `versi` di sana). */
    if ($ua !== $uaKirim) {
      $simpan['updatedAt'] = $ua;
      if (is_array($versi)) $versi[$namaKoleksi . ':' . $id] = $ua;
    }

    $args = array(':id' => $id);
    foreach ($cols as $kolom => $def) $args[':' . $kolom] = ambil($simpan, $def[0], $def[1]);
    $args[':updated_at'] = $ua;
    if ($adaCreated) $args[':created_at'] = ms_valid(isset($simpan['createdAt']) ? $simpan['createdAt'] : 0);
    $args[':data'] = json_enc($simpan);
    $st->execute($args);
  }

  /* PENGHAPUSAN — TIGA JALUR, dan urutannya penting.

     1. `hapus` (MODE PARSIAL, 1 Oktober 2026). Klien hanya mengirim baris
        yang BERUBAH plus daftar id yang benar-benar dihapus di layar, jadi
        `kiriman` tidak lagi berarti "seluruh isi yang saya pegang".
        `dikenal − kiriman` di mode ini akan MENGHAPUS SEMUA baris yang tidak
        sedang disunting — karena itu jalur ini didahulukan dan
        `hapus_yang_hilang` dilewati sepenuhnya.

     2. `dikenal` (klien state-utuh sejak 1 Oktober 2026 pagi). Modul Konten
        tidak pernah menarik ulang data sesudah halaman dibuka, jadi satu tab
        bisa basi seharian; tanpa daftar ini tab basi MENGHAPUS konten, ads,
        KOL, atau shooting yang dibuat kru lain sesudah ia dibuka. Yang dihapus
        cuma dikenal − kiriman. Pola BD OS (24 September 2026).

     3. `hapus_yang_hilang` (klien lama tanpa daftar apa pun) — perilaku lama,
        hanya untuk kiriman state utuh. Kiriman KOSONG tidak pernah
        mengosongkan tabel.

     Jalur 1 & 2 sama-sama menahan kiriman KOSONG yang menghapus >3 baris —
     tidak ada satu tombol pun yang membuang empat baris sekaligus. */
  if (is_array($hapus)) {
    hapus_id_eksplisit($pdo, $tabel, $ids, $hapus);
    return count($ids);
  }
  if (is_array($kenal)) {
    $buang = array_values(array_diff(array_map('strval', $kenal), $ids));
    if (count($buang) && !(count($ids) === 0 && count($buang) > 3)) {
      $del = $pdo->prepare('DELETE FROM ' . $tabel . ' WHERE id IN (' .
                           implode(',', array_fill(0, count($buang), '?')) . ')');
      $del->execute($buang);
    }
    return count($ids);
  }

  hapus_yang_hilang($pdo, $tabel, 'id', $ids);
  return count($ids);
}

/* Hapus baris yang disebut EKSPLISIT oleh klien mode parsial (`hapus`).
   Hanya id yang benar-benar dihapus orang di layar yang masuk daftar ini;
   baris yang tidak pernah dilihat tab itu tidak mungkin ada di sini, berapa
   pun jam perangkatnya. Penjaga kiriman KOSONG yang membuang >3 baris tetap
   ada — tidak ada satu tombol pun yang menghapus empat baris sekaligus. */
function hapus_id_eksplisit($pdo, $tabel, $ids, $hapus) {
  $hapus = array_values(array_unique(array_map('strval', $hapus)));
  if (!count($hapus)) return 0;
  /* Penjaga >3 baris di sini BEDA dari mode state-utuh. Di mode parsial,
     koleksi tanpa baris yang berubah (count($ids) === 0) adalah keadaan
     NORMAL untuk penghapusan murni — memakai syarat lama berarti hapus
     berantai (konten beserta shooting-nya, client beserta followup-nya)
     DITOLAK diam-diam, layar menganggapnya terhapus, dan barisnya muncul
     lagi saat dimuat ulang. Yang tetap ditahan cuma penghapusan >3 baris
     yang akan MENGOSONGKAN tabel — itu niat asli penjaganya. */
  if (count($hapus) > 3) {
    $q = $pdo->prepare('SELECT COUNT(*) FROM ' . $tabel . ' WHERE id NOT IN (' .
                       implode(',', array_fill(0, count($hapus), '?')) . ')');
    $q->execute($hapus);
    if ((int)$q->fetchColumn() === 0) return 0;
  }
  $del = $pdo->prepare('DELETE FROM ' . $tabel . ' WHERE id IN (' .
                       implode(',', array_fill(0, count($hapus), '?')) . ')');
  $del->execute($hapus);
  return $del->rowCount();
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
function save_all($state, $dikenal = null, $hapus = null) {
  if (!is_array($state)) throw new Exception('Payload data kosong/invalid');

  /* MODE PARSIAL: kehadiran `hapus` (array) menandai klien yang mengirim baris
     BERUBAH saja. Baris yang tidak dikirim TIDAK dihapus; penghapusan lewat
     daftar id eksplisit. Klien lama (tanpa `hapus`) tetap memakai perilaku
     lama (`dikenal`, atau hapus_yang_hilang). */
  $modeParsial = is_array($hapus);

  $pdo = db();
  $pdo->beginTransaction();
  try {
    $hitung = array();
    $bentrok = array();
    $versi = array();          // cap yang digeser server, berkunci <koleksi>:<id>
    $known = array('logs', '_rev', '_fitur');

    foreach (collections() as $nama => $c) {
      $known[] = $nama;
      $ada = array_key_exists($nama, $state);
      if (!$ada && !$modeParsial) continue;                // tidak dikirim → lewati
      $rows = ($ada && is_array($state[$nama])) ? $state[$nama] : array();
      $kenal = (is_array($dikenal) && isset($dikenal[$nama]) && is_array($dikenal[$nama]))
             ? $dikenal[$nama] : null;
      $h = $modeParsial
         ? (isset($hapus[$nama]) && is_array($hapus[$nama]) ? $hapus[$nama] : array())
         : null;
      $hitung[$nama] = upsert_collection($pdo, $c, $rows, $bentrok, $nama, $kenal, $h, $versi);
    }

    // ---- logs: append-only (jejak audit tidak pernah ditimpa/dihapus) ----
    if (isset($state['logs']) && is_array($state['logs'])) {
      $ai = $pdo->prepare('INSERT IGNORE INTO logs
              (id, ref_id, action, by_user, at_ms, data)
              VALUES (:id,:ref_id,:action,:by_user,:at_ms,:data)');
      $n = 0;
      foreach ($state['logs'] as $a) {
        if (!is_array($a) || empty($a['id'])) continue;
        $ai->execute(array(
          ':id'      => (string)$a['id'],
          ':ref_id'  => ambil($a, 'target', 'str'),   // data live memakai "target"
          ':action'  => ambil($a, 'action', 'str'),
          ':by_user' => ambil($a, 'by', 'str'),
          ':at_ms'   => ambil($a, 'at', 'ms'),
          ':data'    => json_enc($a),
        ));
        $n++;
      }
      $hitung['logs'] = $n;
      // batasi agar tidak tumbuh tanpa batas
      $pdo->exec('DELETE FROM logs WHERE id NOT IN
                  (SELECT id FROM (SELECT id FROM logs ORDER BY at_ms DESC, id DESC LIMIT 5000) t)');
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
    /* Cap yang digeser server (klien <= versi server), berkunci
       `<koleksi>:<id>` — bentuk yang SAMA dengan `_eachRow()` di klien. Klien
       memasangnya supaya acuan bentrok berikutnya tidak basi. */
    'versi'   => (object)$versi,
    'backend' => 'php-mysql',
    'ts'      => gmdate('c'),
  );
}

/* ==================== DIAGNOSTIK ==================== */
function stats() {
  $pdo = db();
  $out = array('backend' => 'php-mysql', 'db' => DB_NAME);
  $tabel = array('users','brands','campaigns','content','prod_tasks','shootings',
                 'assets','bank','kols','visits','ads','ad_funds','notifs','logs');
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
