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

/* Versi backend. NAIKKAN tiap kali perilaku file ini berubah.

   Gunanya bukan kerapian: backend di-upload manual per server (office & dev
   punya salinannya masing-masing), jadi tanpa penanda ini tidak ada cara
   memastikan server mana yang sudah dapat perbaikan dan mana yang belum.
   Cukup buka ?action=ping dan bandingkan dengan nilai di repo. */
define('LIB_VERSI', '2026-07-27');

/* Identitas server, ikut di ping & stats.

   env + db adalah pengaman zip tertukar. Zip dev dan zip office isinya nyaris
   sama; yang membedakan cuma isi config.php. Kalau zip produksi telanjur
   terupload ke dev, dev akan menulis ke database office TANPA satu pun pesan
   error — semuanya terlihat normal. Satu-satunya cara melihatnya adalah
   membaca env & db yang benar-benar sedang dipakai server itu.

   ENV_LABEL sengaja tidak diwajibkan: config.php lama (yang belum punya
   baris itu) tetap jalan, dan nilainya muncul sebagai '?' — itu sendiri
   sudah memberi tahu bahwa config di server masih versi lama. */
/* `aksi` = daftar action yang DIDUKUNG backend ini. Ada gunanya yang konkret:
   frontend bisa lebih baru daripada backend yang ter-upload di hosting, dan
   gejalanya muncul jauh dari sebabnya — "Aksi tidak dikenal: uploadChunk" saat
   mengunggah, padahal yang salah adalah paket API-nya belum diperbarui.
   Dengan ini, ?action=ping langsung memberi tahu versi mana yang sedang hidup
   tanpa perlu menebak dari gejala. */
function identitas() {
  return array(
    'env'   => defined('ENV_LABEL') ? ENV_LABEL : '?',
    'db'    => DB_NAME,
    'versi' => LIB_VERSI,
    'aksi'  => array('getAll','stats','ping','receipt','uploadReceipt','uploadChunk','saveAll'),
    'maksUnggahMB' => 40,
  );
}

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
  /* Batas atas SEMUA unggahan. Dinaikkan 8MB -> 40MB untuk Surat Penawaran,
     yang sering penuh gambar venue/layout beresolusi tinggi. Batas per fitur
     tetap dipegang frontend (lampiran event & bukti transfer masih 8MB); ini
     jaring pengaman terakhir supaya berkas raksasa tidak menghabiskan disk.
     CATATAN: base64 membengkakkan ~33%, jadi 40MB berkas = ~54MB body. PHP
     akan MEMBUANG body yang melewati post_max_size (php://input jadi kosong)
     sebelum baris ini sempat jalan — lihat .user.ini di folder ini. */
  if (strlen($bin) > 40 * 1024 * 1024) throw new Exception('file melebihi 40MB');
  $key = 'rc_' . bin2hex(random_bytes(8)) . '.' . $ext;
  if (file_put_contents(receipt_path($key), $bin) === false)
    throw new Exception('gagal menulis file (cek izin folder)');
  // name = nama asli untuk ditampilkan; url dibangun frontend dari key.
  return array('key' => $key, 'name' => isset($payload['fileName']) ? (string)$payload['fileName'] : $key);
}

/* ==================== UNGGAH BERTAHAP (CHUNK) ====================
   save_receipt() mengirim seluruh berkas dalam SATU permintaan. Untuk berkas
   besar itu tidak bisa diandalkan di shared hosting: base64 membengkakkan
   ukuran ~33%, lalu `post_max_size` (bawaan 8M) membuang seluruh body sebelum
   PHP sempat jalan — dan batas itu tidak bisa diubah dari kode. Sebagian host
   juga menolak POST besar di level web server (413) sebelum PHP tersentuh.

   Jalan keluarnya bukan menaikkan batas, tapi TIDAK PERNAH MENYENTUHNYA:
   berkas dipotong ~2MB per permintaan lalu disambung di sini. Tiap potongan
   di-base64 sendiri-sendiri, jadi tidak ada masalah batas antar-potongan.
   Dengan begitu unggahan 40MB tetap jalan di server ber-post_max_size 8M. */
function receipt_tmp_dir() { return receipt_dir() . '/receipts_tmp'; }
function receipt_tmp_path($uploadId) {
  $safe = preg_replace('/[^A-Za-z0-9._-]/', '_', (string)$uploadId);
  if ($safe === '' || strlen($safe) > 80) throw new Exception('uploadId tidak sah');
  return receipt_tmp_dir() . '/up_' . $safe . '.part';
}
// Buang potongan menggantung (unggahan yang ditinggal di tengah jalan).
function receipt_tmp_bersihkan() {
  $dir = receipt_tmp_dir();
  if (!is_dir($dir)) return;
  foreach (glob($dir . '/up_*.part') as $p)
    if (filemtime($p) < time() - 86400) @unlink($p);
}
function save_receipt_chunk($payload) {
  if (!$payload || !isset($payload['uploadId'])) throw new Exception('uploadId kosong');
  receipt_pastikan_folder();
  if (!is_dir(receipt_tmp_dir())) @mkdir(receipt_tmp_dir(), 0775, true);
  $path  = receipt_tmp_path($payload['uploadId']);
  $seq   = isset($payload['seq']) ? (int)$payload['seq'] : 0;
  $last  = !empty($payload['last']);

  if ($seq === 0) @unlink($path);            // potongan pertama = mulai dari nol
  elseif (!file_exists($path)) throw new Exception('potongan awal hilang — ulangi unggahan');

  if (isset($payload['dataBase64']) && $payload['dataBase64'] !== '') {
    $bin = base64_decode(preg_replace('#^data:[^,]+,#', '', $payload['dataBase64']), true);
    if ($bin === false) throw new Exception('base64 tidak valid');
    /* clearstatcache WAJIB: filesize() dilayani dari stat cache PHP, dan tiap
       potongan datang sebagai permintaan yang berbeda ke berkas yang sama.
       Tanpa ini ukuran yang terbaca tertinggal satu potongan — penjaga 40MB
       jadi longgar dan angka kemajuan yang dibalas ke frontend meleset. */
    clearstatcache(true, $path);
    // Batas diperiksa saat menyambung, bukan cuma di akhir, supaya kiriman
    // yang kebablasan berhenti lebih awal dan tidak menghabiskan disk.
    if ((file_exists($path) ? filesize($path) : 0) + strlen($bin) > 40 * 1024 * 1024) {
      @unlink($path);
      throw new Exception('file melebihi 40MB');
    }
    if (file_put_contents($path, $bin, FILE_APPEND) === false)
      throw new Exception('gagal menulis potongan (cek izin folder)');
    clearstatcache(true, $path);
  }
  if (!$last) return array('ok' => true, 'seq' => $seq, 'bytes' => (int)@filesize($path));

  $ext = receipt_ext(isset($payload['mimeType']) ? $payload['mimeType'] : '',
                     isset($payload['fileName']) ? $payload['fileName'] : '');
  $key = 'rc_' . bin2hex(random_bytes(8)) . '.' . $ext;
  if (!@rename($path, receipt_path($key))) {
    @unlink($path);
    throw new Exception('gagal menyimpan berkas gabungan');
  }
  receipt_tmp_bersihkan();
  return array('key' => $key, 'name' => isset($payload['fileName']) ? (string)$payload['fileName'] : $key);
}
/* Kumpulkan semua key berkas yang MASIH dipakai, dibaca dari DATABASE.
   Sengaja TIDAK dari payload kiriman: save_all mendukung kiriman parsial
   (koleksi yang tidak dikirim dilewati), jadi kalau GC memakai payload, satu
   kiriman tanpa `events` akan menghapus SEMUA lampiran. Database adalah
   satu-satunya sumber yang selalu lengkap. */
/* Kumpulkan key dari SEMUA bentuk lampiran, sedalam apa pun letaknya.

   Dulu fungsi ini hanya tahu `detail.attachFiles`. Begitu field lampiran
   baru ditambahkan di frontend — gambar layout, denah area, lampiran
   rundown, gambar voucher — GC tidak mengenalinya, menganggapnya yatim,
   lalu MENGHAPUSNYA satu jam setelah diunggah. Kerusakan yang sunyi:
   event-nya tersimpan rapi, gambarnya hilang belakangan.

   Menelusuri seluruh isi (bukan daftar nama field) membuat kesalahan itu
   tidak bisa terulang saat field lampiran berikutnya ditambahkan. */
function kumpulkan_key($nilai, &$hidup) {
  if (!is_array($nilai)) return;
  // Bentuk satu lampiran: {key:'rc_xxx', name:'...'}
  if (isset($nilai['key']) && is_string($nilai['key']) && $nilai['key'] !== '')
    $hidup[$nilai['key']] = true;
  foreach ($nilai as $v) if (is_array($v)) kumpulkan_key($v, $hidup);
}
function key_terpakai($pdo) {
  $hidup = array();
  foreach ($pdo->query('SELECT data FROM events') as $row) {
    $e = json_decode($row['data'], true);
    if (!is_array($e)) continue;

    // Semua lampiran di mana pun letaknya di dalam event ini.
    kumpulkan_key($e, $hidup);
    // Bukti transfer: payments[].receiptUrl memuat "...?action=receipt&key=xxx".
    // Bukti lama masih berupa URL Google Drive — tidak punya key, otomatis terlewat.
    if (!empty($e['payments']) && is_array($e['payments'])) {
      foreach ($e['payments'] as $p) {
        if (empty($p['receiptUrl'])) continue;
        if (preg_match('/[?&]key=([^&"\']+)/', (string)$p['receiptUrl'], $m))
          $hidup[urldecode($m[1])] = true;
      }
    }
  }
  return $hidup;
}

/* Berkas yatim: ada di disk tapi tidak ditunjuk data mana pun lagi (mis.
   lampiran sudah dihapus dari event, atau bukti transfer diganti).

   ============================================================================
   TIDAK DIHAPUS. DIPINDAHKAN KE TEMPAT SAMPAH.
   ============================================================================
   Versi sebelumnya memanggil unlink() langsung, dan itu sudah memakan korban:
   selama key_terpakai() belum mengenali layoutImgs/areaImgs/rundownFiles/
   voucherImgs, GC menganggapnya yatim lalu menghapusnya satu jam setelah
   diunggah. Event tersimpan rapi, gambarnya lenyap belakangan, tanpa satu pun
   pesan error. Yang tersisa di database cuma key yang menunjuk ke ketiadaan.
   Kerusakannya baru ketahuan berhari-hari kemudian, dan saat itu tidak ada
   yang bisa dikembalikan.

   Pemindahan ke sampah membuat kesalahan seperti itu BISA DIBATALKAN. Kalau
   suatu hari ada lagi tempat penyimpanan lampiran yang belum dikenali
   kumpulkan_key(), berkasnya menunggu di folder sampah, bukan hilang.
   Memulihkan = pindahkan kembali dari `receipts_sampah/` ke `receipts/`
   lewat File Manager. Nama berkasnya tidak berubah, jadi key di database
   langsung hidup lagi tanpa menyentuh data.

   JEDA AMAN 7 HARI (dulu 1 jam). Unggah dan penyimpanan event adalah dua
   langkah terpisah, dan jarak antara keduanya TIDAK selalu sebentar:
   simpanan bisa ditolak penjaga bentrok karena kru lain menyimpan duluan,
   atau gagal karena jaringan lalu tabnya telanjur ditutup. Satu jam
   mengasumsikan semuanya lancar dalam hitungan menit; kalau tidak, berkas
   yang baru diunggah mati sebelum sempat tercatat. Tujuh hari memberi ruang
   untuk menyelesaikan bentrok keesokan harinya.

   Sampah dibersihkan sendiri setelah 60 hari, jadi ini tidak jadi tumpukan
   selamanya. */
define('GC_JEDA_AMAN',   7 * 24 * 3600);    // yatim -> sampah
define('GC_UMUR_SAMPAH', 60 * 24 * 3600);   // sampah -> benar-benar dibuang

function receipt_sampah_dir() { return receipt_dir() . '/receipts_sampah'; }

function gc_receipts($pdo) {
  $dir = receipt_files_dir();
  if (!is_dir($dir)) return 0;
  $hidup = key_terpakai($pdo);
  $batas = time() - GC_JEDA_AMAN;
  $sampah = receipt_sampah_dir();
  $buang = 0;
  foreach (scandir($dir) as $f) {
    if ($f === '.' || $f === '..') continue;
    if (isset($hidup[$f])) continue;                       // masih dipakai
    $p = $dir . '/' . $f;
    if (!is_file($p)) continue;
    if (filemtime($p) > $batas) continue;                  // baru diunggah -> jangan sentuh
    if (!is_dir($sampah) && !@mkdir($sampah, 0775, true)) continue;  // gagal bikin folder -> JANGAN hapus
    if (@rename($p, $sampah . '/' . $f)) {
      // mtime disetel ulang supaya umur di sampah dihitung sejak DIPINDAHKAN,
      // bukan sejak diunggah. Tanpa ini, berkas lama yang baru jadi yatim
      // hari ini akan langsung lewat batas 60 hari dan dibuang seketika.
      @touch($sampah . '/' . $f);
      $buang++;
    }
  }
  gc_sampah();
  return $buang;
}

/* Pembersih tempat sampah. Berkas yang sudah 60 hari di sana dianggap memang
   tidak diperlukan lagi. Dipisah dari gc_receipts supaya batas waktunya bisa
   dibaca dan diubah sendiri tanpa menyentuh logika yatim. */
function gc_sampah() {
  $sampah = receipt_sampah_dir();
  if (!is_dir($sampah)) return 0;
  $batas = time() - GC_UMUR_SAMPAH;
  $n = 0;
  foreach (scandir($sampah) as $f) {
    if ($f === '.' || $f === '..') continue;
    $p = $sampah . '/' . $f;
    if (!is_file($p) || filemtime($p) > $batas) continue;
    if (@unlink($p)) $n++;
  }
  return $n;
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

/* ==================== DIAGNOSTIK ==================== */
function stats() {
  $pdo = db();
  $out = array_merge(array('backend' => 'php-mysql'), identitas());
  $tabel = array('clients','events','followups','approvals','users','staff',
                 'task_templates','task_categories','categories','notifs','activities');
  foreach ($tabel as $t) {
    $out[$t] = (int)$pdo->query('SELECT COUNT(*) c FROM ' . $t)->fetch()['c'];
  }
  $blob = strlen(json_enc(baca_state()));
  $out['blobChars'] = $blob;
  $out['blobMB']    = round($blob / 1048576, 3);

  // Berkas di disk (lampiran + bukti transfer) — untuk memantau tanpa perlu
  // membuka File Manager. `berkasYatim` yang terus bertambah = GC bermasalah.
  $dir = receipt_files_dir();
  $hidup = key_terpakai($pdo);
  $n = 0; $byte = 0; $yatim = 0;
  if (is_dir($dir)) {
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
  $out['berkasYatim']  = $yatim;      // menunggu jeda aman sebelum ke sampah

  /* ARAH SEBALIKNYA, dan ini yang paling penting: key yang tercatat di
     database tapi berkasnya TIDAK ADA di disk. Itulah gambar rusak yang
     dilihat kru — data menunjuk ke ketiadaan.

     Dulu angka ini tidak pernah dihitung, jadi ketika GC lama menghapus
     layoutImgs/areaImgs, tidak ada satu pun ukuran yang berubah. Kerusakan
     baru ketahuan saat ada orang membuka event dan melihat gambarnya patah.
     `berkasYatim` tidak menolong sama sekali di sana — angkanya justru
     bagus (0) tepat KARENA berkasnya sudah telanjur dihapus.

     Naik dari 0 = ada lampiran yang hilang. Periksa folder sampah. */
  $hilang = 0;
  foreach (array_keys($hidup) as $k) {
    if (!is_file(receipt_path($k))) $hilang++;
  }
  $out['berkasHilang'] = $hilang;

  $sampah = receipt_sampah_dir();
  $ns = 0; $bs = 0;
  if (is_dir($sampah)) {
    foreach (scandir($sampah) as $f) {
      if ($f === '.' || $f === '..') continue;
      $p = $sampah . '/' . $f;
      if (!is_file($p)) continue;
      $ns++; $bs += filesize($p);
    }
  }
  $out['sampah']       = $ns;         // bisa dipulihkan: pindahkan balik ke receipts/
  $out['sampahMB']     = round($bs / 1048576, 3);

  $out['folderBerkas'] = $dir;
  $out['folderSampah'] = $sampah;
  $out['amanDiLuarWeb'] = !receipt_di_dalam_web();

  $out['ts'] = gmdate('c');
  return $out;
}
