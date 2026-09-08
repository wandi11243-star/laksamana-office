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
define('LIB_VERSI', '2026-08-11');

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

/* ==================== KOLEKSI YANG TINGGAL DI `settings` ====================
   `designreqs` (Request Design & Video) dan `vip` (Reservasi VIP) adalah
   DAFTAR BARIS BER-ID, persis seperti events/clients — tapi keduanya tidak
   pernah punya tabel sendiri. Sampai 8 September 2026 mereka jatuh ke cabang
   TERAKHIR save_all() dan disimpan sebagai SATU gumpalan JSON lewat
   put_setting(), yaitu `ON DUPLICATE KEY UPDATE v = VALUES(v)`: TIMPA BUTA,
   tanpa satu pun penjaga.

   Akibatnya nyata dan dilaporkan user hari itu: siapa pun yang tab
   Marketing-nya terbuka sejak pagi, lalu menekan simpan apa pun sore hari,
   MENGGANTI seluruh daftar Request Design dan seluruh daftar Reservasi VIP
   dengan salinan lamanya. Ada 100 titik save() di modul itu, jadi hampir
   tindakan apa pun memicunya — dan tidak ada satu pun galat di layar siapa
   pun. Yang melaporkannya cuma bisa berkata `datanya hilang semua`.

   Sekarang keduanya digabung PER BARIS dengan penjaga yang SAMA PERSIS
   dengan upsert_collection(): cap urutan `updatedAt`, penjaga bentrok
   `baseUpdatedAt`, dan penghapusan yang dibatasi `_sejak`. Klien memang
   SUDAH mengirim ketiganya — `designreqs` dan `vip` ada di MKT_COLS sejak
   lama, jadi stampChanges() dan buildPayload() sudah mencapnya; servernya
   yang membuangnya.

   TIDAK dijadikan tabel baru, dan itu disengaja: berkas migrasi di repo ini
   rutin tertinggal di produksi, sehingga tabel yang lahir dari schema.sql
   saja berarti endpoint yang 500 di satu server dan 200 di server
   sebelahnya. Bentuk simpanannya tetap; yang berubah CARA MENULISNYA. */
function kol_settings() { return array('designreqs', 'vip'); }

/* Baris ber-id di dalam sebuah nilai settings. Nilai yang bukan array
   diperlakukan sebagai kosong, bukan dilempar: satu nilai rusak tidak boleh
   mematikan seluruh penyimpanan. */
function baris_settings($pdo, $nama) {
  $q = $pdo->prepare('SELECT v FROM settings WHERE k = :k');
  $q->execute(array(':k' => 'extra:' . $nama));
  $v = json_decode((string)$q->fetchColumn(), true);
  return is_array($v) ? $v : array();
}

/* Cap tertinggi di sebuah daftar baris. Dipakai baca_state() supaya koleksi
   yang tinggal di settings ikut menaikkan `_versi`. */
function versi_baris($rows) {
  $maks = 0;
  foreach ($rows as $r) {
    if (!is_array($r)) continue;
    $v = ms_valid(isset($r['updatedAt']) ? $r['updatedAt'] : 0);
    if ($v > $maks) $maks = $v;
  }
  return $maks;
}

/* Cap tulis satu baris. SUMBERNYA JAM SERVER, bukan jam perangkat yang
   menyimpan — dan itu inti perbaikan kedua 8 September 2026.

   `_versi` yang dipegang klien adalah cap TERTINGGI di seluruh data, dan
   penghapusan dibatasi `updated_at <= _sejak`. Selama capnya datang dari jam
   masing-masing perangkat, satu jam yang berjalan CEPAT menaikkan `_versi`
   melampaui waktu sebenarnya — dan sejak itu setiap baris yang dibuat
   perangkat berjam normal lahir dengan cap DI BAWAH `_sejak` orang lain,
   sehingga sah dihapus. Gejalanya: event yang baru dibuat rekan lenyap
   beberapa menit kemudian, tanpa galat di layar siapa pun.

   Komentar lama di baca_state() menyatakan cara ini `tetap sahih walau jam
   tiap perangkat berbeda`. Itu KELIRU, dan kekeliruannya yang membuat ini
   bertahan: mengambil maksimum dari tabel tidak menyatukan jamnya — ia
   justru memungut yang paling melenceng.

   Baris yang DIUBAH klien (punya baseUpdatedAt) dicap jam server, minimal
   satu di atas versi server supaya penjaga urutan tidak memblokir tulisan
   yang benar. Baris yang TIDAK diubah dijepit ke jam server: capnya cuma
   dipantulkan balik oleh klien, dan yang dipantulkan tidak boleh melompat ke
   masa depan. */
function cap_tulis($ua, $lolosBentrok, $verServer, $nowMs) {
  if ($lolosBentrok) {
    $ua = $nowMs;
    if ($verServer !== null && $ua <= $verServer) $ua = $verServer + 1;
    return $ua;
  }
  if ($ua > $nowMs) $ua = $nowMs;
  return $ua;
}

function sekarang_ms() { return (int)round(microtime(true) * 1000); }

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

  /* `_versi` = cap tertinggi di seluruh tabel saat data ini dibaca.
     Klien menyimpannya lalu mengirimkannya balik sebagai `_sejak` waktu
     menyimpan, dan itulah yang menahan kirimannya menghapus baris yang lahir
     sesudah ia memuat halaman (lihat hapus_yang_hilang).

     Diambil dari kolom updated_at TABEL YANG SAMA, bukan dari jam server —
     jadi perbandingannya tetap sahih walau jam tiap perangkat berbeda. */
  $maks = 0;
  foreach (collections() as $c) {
    try {
      $v = (int)$pdo->query('SELECT COALESCE(MAX(updated_at),0) FROM ' . $c['table'])->fetchColumn();
      if ($v > $maks) $maks = $v;
    } catch (Throwable $e) { /* tabel belum ada: abaikan */ }
  }
  /* Koleksi yang tinggal di `settings` WAJIB ikut dihitung. Kalau tidak,
     menambah satu Request Design atau satu Reservasi VIP tidak menaikkan
     `_versi` sama sekali — dan penyegar otomatis di klien berhenti lebih awal
     begitu versinya sama (lihat pemeriksaan vSrv===_sejakVersi di modul
     Marketing). Tab orang lain karena itu TIDAK PERNAH menarik baris baru
     itu, lalu kirimannya yang basi menghapusnya. Dua bug yang saling memberi
     makan, dan yang kedua tidak akan pernah ketahuan tanpa yang pertama. */
  foreach (kol_settings() as $nama) {
    $v = versi_baris(isset($out[$nama]) && is_array($out[$nama]) ? $out[$nama] : array());
    if ($v > $maks) $maks = $v;
  }
  $out['_versi'] = $maks;

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
function upsert_collection($pdo, $c, $rows, &$bentrok, $namaKoleksi, $sejak, $nowMs, &$versi) {
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
    $ua = cap_tulis($uaKirim, $lolosBentrok, isset($verServer[$id]) ? $verServer[$id] : null, $nowMs);
    /* Cap yang dipakai DIKEMBALIKAN ke klien kalau berbeda dari yang ia kirim.
       Lihat catatan panjang di save_all() — tanpa ini penjaga bentrok
       melaporkan bentrok pada setiap suntingan kedua. */
    if ($ua !== $uaKirim) $versi[$namaKoleksi . ':' . $id] = $ua;
    /* Cap yang benar-benar dipakai WAJIB ikut tersimpan di `data`.
       Klien membaca versinya dari situ (`r.updatedAt`) lalu mengirimkannya
       balik sebagai baseUpdatedAt, sementara penjaga bentrok di sini
       membandingkannya dengan KOLOM `updated_at`. Kalau keduanya berbeda —
       dan sejak cap ditentukan server keduanya PASTI berbeda — setiap
       penyuntingan berikutnya dilaporkan bentrok padahal tidak ada yang
       menyalip, dan perubahan yang sah ditolak. */
    $simpan['updatedAt'] = $ua;

    $args = array(':id' => $id);
    foreach ($cols as $kolom => $def) $args[':' . $kolom] = ambil($simpan, $def[0], $def[1]);
    $args[':updated_at'] = $ua;
    if ($adaCreated) $args[':created_at'] = ms_valid(isset($simpan['createdAt']) ? $simpan['createdAt'] : 0);
    $args[':data'] = json_enc($simpan);
    $st->execute($args);
  }

  hapus_yang_hilang($pdo, $tabel, 'id', $ids, $sejak);
  return count($ids);
}

/* Hapus baris yang tidak ada di kiriman.

   INI PERNAH MENGHAPUS KERJA ORANG LAIN, dan tanpa satu pun galat.

   Aplikasi mengirim state UTUH, jadi "tidak ada di kiriman" dulu langsung
   diartikan "dihapus user". Padahal ada arti kedua yang jauh lebih sering:
   "dibuat orang lain SESUDAH aku memuat halaman". Kejadiannya sehari-hari —
   Andi membuka Marketing pagi hari, Budi membuat event jam 10, Andi membuat
   event jam 10.05: kiriman Andi tidak memuat event Budi, dan baris Budi
   dihapus. Ikut terhapus juga client-nya, baris user-nya, dan log
   aktivitasnya. Terbukti lewat harness pada 8 Agustus 2026.

   Sekarang penghapusan dibatasi `updated_at <= :sejak`, dengan `sejak` =
   versi server yang dipegang klien saat memuat. Artinya:
     - baris yang memang sudah ada saat klien memuat, lalu hilang dari
       kiriman  -> benar-benar dihapus user. Dihapus.
     - baris yang lahir/berubah SESUDAH itu -> klien tidak mungkin tahu, jadi
       ketiadaannya bukan keputusan siapa pun. DILINDUNGI.

   `sejak` 0 atau tidak dikirim = klien versi lama yang belum mengenal
   mekanisme ini: TIDAK MENGHAPUS APA PUN. Arah gagal ini disengaja — baris
   yang seharusnya hilang tapi masih ada bisa dihapus ulang; baris yang
   hilang padahal tidak seharusnya tidak bisa dikembalikan.

   JAGA-JAGA LAMA yang tetap dipertahankan: kiriman KOSONG tidak pernah
   mengosongkan tabel (mis. aplikasi gagal load lalu menyimpan). */
function hapus_yang_hilang($pdo, $tabel, $kolomId, $ids, $sejak) {
  if (count($ids) === 0) return 0;
  $sejak = (int)$sejak;
  if ($sejak <= 0) return 0;
  $place = implode(',', array_fill(0, count($ids), '?'));
  $del = $pdo->prepare('DELETE FROM ' . $tabel . '
                         WHERE ' . $kolomId . ' NOT IN (' . $place . ')
                           AND updated_at <= ?');
  $par = $ids; $par[] = $sejak;
  $del->execute($par);
  return $del->rowCount();
}

/* Gabung satu koleksi yang tinggal di `settings`, dengan penjaga yang sama
   persis dengan upsert_collection(). Lihat kol_settings() di atas untuk
   alasannya. Yang berbeda cuma tempat simpanannya: satu nilai JSON di tabel
   `settings`, bukan tabel tersendiri — jadi penggabungannya dikerjakan di
   PHP, bukan diserahkan ke ON DUPLICATE KEY UPDATE. */
function upsert_settings_collection($pdo, $nama, $rows, &$bentrok, $sejak, $nowMs, &$versi) {
  $lama = baris_settings($pdo, $nama);

  /* Baris yang sudah ada, dikunci id. Yang TIDAK ber-id sengaja tidak ikut:
     tanpa id ia tidak bisa dicocokkan, jadi mempertahankannya berarti ia
     berlipat tiap kali disimpan. Klien selalu memberi id (uid()), dan
     _eachRow() di sana pun melewati baris tanpa id. */
  $adaId = array();
  foreach ($lama as $r) {
    if (!is_array($r) || !isset($r['id']) || $r['id'] === '') continue;
    $adaId[(string)$r['id']] = $r;
  }

  $kirimId = array();
  foreach ($rows as $r) {
    if (!is_array($r) || !isset($r['id']) || $r['id'] === '') continue;
    $id = (string)$r['id'];
    $kirimId[$id] = 1;

    $verServer = null;
    if (isset($adaId[$id])) {
      $verServer = ms_valid(isset($adaId[$id]['updatedAt']) ? $adaId[$id]['updatedAt'] : 0);
    }

    // --- penjaga bentrok: hanya untuk baris yang memang diubah klien ---
    $lolosBentrok = false;
    if (array_key_exists('baseUpdatedAt', $r)) {
      $base = ms_valid($r['baseUpdatedAt']);
      if ($verServer !== null && $verServer > $base) {
        $bentrok[] = array(
          'koleksi'     => $nama,
          'id'          => $id,
          'nama'        => isset($r['nama']) ? (string)$r['nama'] : (isset($r['judul']) ? (string)$r['judul'] : $id),
          'versiKamu'   => $base,
          'versiServer' => $verServer,
        );
        continue;   // JANGAN timpa kerja orang lain
      }
      $lolosBentrok = true;
    }

    // baseUpdatedAt hanya metadata kiriman — jangan ikut tersimpan.
    $simpan = $r; unset($simpan['baseUpdatedAt']);
    $uaKirim = ms_valid(isset($simpan['updatedAt']) ? $simpan['updatedAt'] : 0);
    $ua = cap_tulis($uaKirim, $lolosBentrok, $verServer, $nowMs);
    if ($ua !== $uaKirim) $versi[$nama . ':' . $id] = $ua;

    /* Penjaga urutan untuk baris yang TIDAK diubah klien: aplikasi mengirim
       state utuh, jadi baris ini cuma pantulan salinan yang dipegang klien.
       Yang lebih lama tidak boleh menimpa yang lebih baru di server. */
    if (!$lolosBentrok && $verServer !== null && $ua < $verServer) continue;

    $simpan['updatedAt'] = $ua;
    $adaId[$id] = $simpan;
  }

  /* Penghapusan dibatasi `_sejak`, aturan yang SAMA dengan
     hapus_yang_hilang(): baris yang lahir sesudah klien memuat tidak mungkin
     ia ketahui, jadi ketiadaannya di kiriman bukan keputusan siapa pun.
     Dua jaring lama ikut dipertahankan: `_sejak` yang tidak dikirim (klien
     versi lama) tidak menghapus apa pun, dan kiriman kosong tidak pernah
     mengosongkan daftar. */
  $sejak = (int)$sejak;
  $bolehHapus = ($sejak > 0 && count($kirimId) > 0);
  $hasil = array();
  foreach ($adaId as $id => $r) {
    if (isset($kirimId[$id]) || !$bolehHapus) { $hasil[] = $r; continue; }
    $v = ms_valid(isset($r['updatedAt']) ? $r['updatedAt'] : 0);
    if ($v > $sejak) { $hasil[] = $r; continue; }   // lahir sesudah klien memuat: DILINDUNGI
  }

  put_setting($pdo, 'extra:' . $nama, $hasil);
  return count($hasil);
}

/* ==================== SIMPAN ==================== */
function save_all($state) {
  if (!is_array($state)) throw new Exception('Payload data kosong/invalid');

  $pdo = db();
  $pdo->beginTransaction();
  try {
    $hitung = array();
    $bentrok = array();
    /* `_sejak` = versi server yang dipegang klien saat ia memuat data.
       Dipakai HANYA untuk membatasi penghapusan — lihat hapus_yang_hilang(). */
    $sejak = isset($state['_sejak']) ? ms_valid($state['_sejak']) : 0;
    $known = array('activities', '_rev', '_sejak', '_versi');
    /* Satu cap untuk SELURUH kiriman, diambil sekali. Dipanggil per baris, dua
       baris yang disimpan bersamaan bisa dapat cap berbeda tanpa alasan. */
    $nowMs = sekarang_ms();
    /* CAP YANG BENAR-BENAR DIPAKAI, dikembalikan ke klien.

       Sejak cap ditentukan JAM SERVER (lihat cap_tulis), nilai yang tersimpan
       hampir selalu BERBEDA dari yang dikirim klien — waktu memang sudah maju
       antara klien mencap dan server menulis. Klien mencatat acuan bentroknya
       sendiri lewat refreshSnapshot(), yang membaca `r.updatedAt` dari salinan
       DI LAYARNYA; jadi acuannya cap klien, sementara yang dibandingkan server
       cap server.

       Akibatnya SETIAP suntingan KEDUA pada baris yang sama dilaporkan
       bentrok — `Sebagian Perubahan Tidak Tersimpan`, padahal tidak ada
       seorang pun yang menyalip. Kejadian di produksi 8 September 2026,
       beberapa jam setelah cap server dipasang, dan dilaporkan user sebagai
       modal yang `muncul terus`.

       Dua penjaga yang membandingkan angka dari DUA JAM yang berbeda selalu
       salah; yang menentukan bukan jamnya melainkan bahwa kedua sisi memakai
       angka YANG SAMA. Karena itu server memberitahukan cap yang ia pakai,
       dan klien memasangnya sebelum mencatat acuan berikutnya. Hanya baris
       yang capnya BERGESER yang dikirim balik — kiriman utuh berisi ribuan
       baris client tidak perlu ikut memantulkan angka yang tidak berubah. */
    $versi = array();

    foreach (collections() as $nama => $c) {
      $known[] = $nama;
      if (!array_key_exists($nama, $state)) continue;      // tidak dikirim → lewati
      $rows = is_array($state[$nama]) ? $state[$nama] : array();
      $hitung[$nama] = upsert_collection($pdo, $c, $rows, $bentrok, $nama, $sejak, $nowMs, $versi);
    }

    /* Koleksi yang tinggal di `settings` — digabung PER BARIS, bukan ditimpa.
       WAJIB sebelum cabang `extra:` di bawah, dan namanya WAJIB masuk $known:
       kalau tidak, put_setting() di sana menimpa balik hasil penggabungan ini
       dengan salinan mentah dari kiriman, dan seluruh penjaga di atas jadi
       hiasan yang tidak menahan apa pun. */
    foreach (kol_settings() as $nama) {
      $known[] = $nama;
      if (!array_key_exists($nama, $state)) continue;   // tidak dikirim -> lewati
      $rows = is_array($state[$nama]) ? $state[$nama] : array();
      $hitung[$nama] = upsert_settings_collection($pdo, $nama, $rows, $bentrok, $sejak, $nowMs, $versi);
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
    /* Cap baru untuk baris yang capnya digeser server, berkunci
       `<koleksi>:<id>` — bentuk yang SAMA dengan kunci _eachRow() di klien.
       Beda satu huruf tidak melempar apa pun: klien cuma tidak menemukan
       barisnya, dan bentrok palsunya kembali. */
    'versi'   => $versi,
    'backend' => 'php-mysql',
    'ts'      => gmdate('c'),
  );
}

/* ==================== EVENT SATU HARI (dibaca modul lain) ====================
   Dipakai Finance > Omset > Breakdown Sumber untuk memunculkan event marketing
   hari itu secara otomatis, supaya orang finance tidak mengetik ulang nama
   event & PIC yang sudah ada di sini.

   MEMULANGKAN DUA DAFTAR, bukan satu (11 Agustus 2026): `events` (tabel
   events) dan `vip` (Reservasi VIP). Keduanya sama-sama omset yang ditutup
   marketing dan sama-sama masuk perhitungan Marketing Performance, jadi
   Breakdown yang cuma menarik `events` diam-diam melewatkan setengah kerja
   tim marketing — dan yang terlewat itu tidak muncul di layar mana pun.

   Endpoint ini SENGAJA SEMPIT, bukan getAll. getAll memulangkan seluruh
   database marketing (megabyte, tumbuh tiap bulan) dan halaman Breakdown
   dibuka tiap hari — polanya sama persis dengan `shiftHari` yang dibuat untuk
   absensi, dengan alasan yang sama.

   Yang dipulangkan hanya event yang SUDAH JADI: status 'Deal' dan
   'Event Done'. Lead/Prospect/Quotation Terkirim/Lost tidak ikut — event yang
   belum tentu terjadi tidak boleh muncul sebagai baris omset yang menunggu
   diisi. (Permintaan user 11 Agustus 2026.)

   `data` TIDAK dipulangkan mentah-mentah: yang dibutuhkan pemanggil cuma
   `detail` (bahan rumus nilai event) — payments/tasks di dalamnya bisa
   berlipat-lipat lebih besar dan tidak dipakai sama sekali.

   Rumus nilainya sendiri TIDAK dihitung di sini. Ia hidup di JavaScript
   (eventFinance di deploy/marketing/index.html) dan bercabang banyak
   (fbManual/fbDeal/rincian/pax x harga, tax inclusive, service opsional);
   menyalinnya ke PHP berarti dua rumus yang pasti berbeda diam-diam begitu
   salah satunya diubah. Pemanggil menyalin rumus JS-nya apa adanya, dan
   `settings` di bawah adalah dua angka yang dibutuhkannya. */
function events_hari($tgl) {
  if (!tanggal_valid($tgl)) throw new Exception('tanggal tidak sah: ' . $tgl);
  $pdo = db();
  /* LEFT JOIN, bukan JOIN: event yang PIC-nya kosong atau menunjuk user yang
     sudah dihapus tetap harus muncul — kalau hilang, orang finance mengira
     event itu memang tidak ada dan mengetiknya lagi sebagai baris manual. */
  /* ACARA LINTAS HARI IKUT MUNCUL DI SETIAP HARINYA (5 September 2026,
     permintaan user: "karena ada 2 hari yang diinput di hari itu, maka omset
     yang ditampilkan di tanggal selesainya juga").

     Modul marketing punya saklar "Berlangsung lebih dari satu hari" yang
     menulis `tanggalSelesai`, dan kalendernya sudah menggambar acaranya di
     semua hari itu. Breakdown TIDAK — ia mencocokkan `e.tanggal = :tgl`
     persis, jadi acara 7-8 Agustus cuma muncul tanggal 7. Omset hari kedua
     karena itu tidak punya barisnya sendiri, dan yang mengisi harus
     mengetiknya sebagai baris manual tanpa satu pun penanda sumber.

     `tanggalSelesai` TIDAK punya kolom sendiri — ia field aplikasi, jadi
     tempatnya di dalam blob `data`. Karena itu tidak bisa disaring di SQL
     tanpa berkas migrasi; yang dilakukan: ambil jendela ke belakang lalu
     saring di PHP. Jendelanya dijepit 60 hari supaya tetap memakai
     idx_ev_tanggal dan tidak pernah berubah jadi pemindaian tabel penuh —
     acara di venue ini tidak ada yang lebih panjang dari itu, dan yang lebih
     panjang lebih baik tidak muncul daripada membuat halaman Breakdown
     menggantung tiap kali dibuka. */
  $batas = date('Y-m-d', strtotime($tgl . ' 00:00:00 -60 days'));
  $st = $pdo->prepare(
    "SELECT e.id, e.nama, e.tanggal, e.status, e.pax, e.mkt_pic, e.data, u.name AS pic_name
       FROM events e
       LEFT JOIN users u ON u.id = e.mkt_pic
      WHERE e.status IN ('Deal', 'Event Done')
        AND e.tanggal <= :tgl AND e.tanggal >= :batas
      ORDER BY e.nama");
  $st->execute(array(':tgl' => $tgl, ':batas' => $batas));
  $out = array();
  foreach ($st->fetchAll() as $r) {
    $d = json_decode(isset($r['data']) ? $r['data'] : '', true);
    if (!is_array($d)) $d = array();
    $mulai   = (string)$r['tanggal'];
    $selesai = isset($d['tanggalSelesai']) ? (string)$d['tanggalSelesai'] : '';
    /* Acara sehari TIDAK punya tanggalSelesai sama sekali — bentuk yang sama
       dengan tglSelesai()/multiHari() di deploy/marketing. Yang tanggalnya
       bukan hari ini HANYA lolos kalau ia benar-benar masih berlangsung;
       tanpa syarat kedua ini, seluruh acara 60 hari terakhir ikut tertarik. */
    if ($mulai !== $tgl && !($selesai !== '' && $selesai >= $tgl)) continue;
    $hari = 1; $totalHari = 1;
    if ($selesai !== '' && $selesai > $mulai) {
      $hb = strtotime($mulai . ' 00:00:00');
      $totalHari = (int)floor((strtotime($selesai . ' 00:00:00') - $hb) / 86400) + 1;
      $hari      = (int)floor((strtotime($tgl     . ' 00:00:00') - $hb) / 86400) + 1;
    }
    $out[] = array(
      'id'      => $r['id'],
      'nama'    => $r['nama'],
      'tanggal' => $r['tanggal'],
      'status'  => $r['status'],
      'pax'     => (int)$r['pax'],
      'picId'   => $r['mkt_pic'],
      'picName' => $r['pic_name'],
      /* Penentu SIAPA YANG DIAKUI menerima omsetnya, dan karena itu penentu
         ada tidaknya potongan kasir di Breakdown. 'tetap' = menu disepakati
         di depan, omsetnya milik marketing, kasir dipotong. 'ditempat' = tamu
         memesan di meja, omsetnya tetap milik kasir. Kosong = belum diputuskan
         orangnya, dan Finance HARUS memperlakukannya sebagai belum diputuskan
         — bukan diam-diam salah satu. Lihat MENU_FIX di deploy/marketing. */
      'menuFix' => isset($d['menuFix']) ? (string)$d['menuFix'] : '',
      /* Hari keberapa dari acara ini, dan berapa hari seluruhnya. Dipakai
         Breakdown untuk MENAHAN tombol "salin ke kolom": nilai yang dipulangkan
         adalah nilai SELURUH acara, jadi menyalinnya di dua hari membuat omset
         acara itu terhitung dua kali — tanpa satu pun galat, dan dengan angka
         yang kelihatan wajar di kedua harinya. */
      'selesai'   => $selesai,
      'hari'      => $hari,
      'totalHari' => $totalHari,
      'detail'  => isset($d['detail']) && is_array($d['detail']) ? $d['detail'] : array(),
    );
  }
  /* Tabel `settings` di sini bentuknya k/v dengan v berupa JSON — seluruh
     objek S.settings tersimpan di bawah satu kunci 'settings'. */
  $sq = $pdo->prepare('SELECT v FROM settings WHERE k = :k');
  $sq->execute(array(':k' => 'settings'));
  $set = json_decode((string)$sq->fetchColumn(), true);
  if (!is_array($set)) $set = array();
  return array(
    'events'   => $out,
    'vip'      => vip_hari($pdo, $tgl),
    /* Dua angka ini bagian dari rumus nilai event, jadi harus datang dari
       sumber yang sama dengan eventnya. Kalau pemanggil memakai persentasenya
       sendiri, nilai yang tampil di Breakdown akan beda dari yang tertulis di
       Surat Penawaran tanpa ada yang salah di kedua layar. */
    'settings' => array(
      'serviceCharge' => isset($set['serviceCharge']) ? (float)$set['serviceCharge'] : 5,
      'pb1'           => isset($set['pb1'])           ? (float)$set['pb1']           : 10,
    ),
  );
}

/* ---------- RESERVASI VIP SATU HARI ----------
   Bagian kedua dari events_hari(). Dipisah jadi fungsi sendiri karena sumber
   datanya sama sekali berbeda dari tabel `events`.

   VIP TIDAK PUNYA TABEL. `S.vip` adalah kunci top-level yang belum dikenal
   backend, jadi ia tersimpan utuh sebagai SATU baris JSON di tabel settings
   dengan kunci 'extra:vip' (lihat baca_state/simpan_state). Artinya di sini
   tidak ada `WHERE tanggal = ?` yang bisa dipakai — seluruh daftar terpaksa
   di-decode lalu disaring di PHP. Itu masih jauh lebih murah daripada getAll
   (satu baris settings, bukan seluruh database), tapi kalau suatu hari VIP
   dipromosikan jadi tabel sungguhan, ganti bagian ini dengan query bertanggal
   dan jangan pertahankan pola blob-nya.

   YANG DITARIK HANYA 'Assisted' YANG TIDAK DIBATALKAN:
   - Regular = marketing cuma membantukan booking meja; nominalnya bukan omzet
     marketing (lihat vipNominal() di deploy/marketing/index.html, yang juga
     memulangkan 0 untuk Regular). Menariknya ke Breakdown berarti memotong
     kasir untuk uang yang tidak diakui ke PIC mana pun.
   - `batalAt` terisi = reservasi dibatalkan. Sudah dikeluarkan dari seluruh
     angka omzet di modul marketing; kalau ikut ke sini, Breakdown akan
     menuntut alokasi untuk uang yang tidak pernah masuk.

   Nominalnya SATU angka, tanpa pecahan tax/service — beda dari event, yang
   punya rumus tiga komponen. Pemanggil menaruhnya di kolom Omset saja. */
function vip_hari($pdo, $tgl) {
  $vq = $pdo->prepare('SELECT v FROM settings WHERE k = :k');
  $vq->execute(array(':k' => 'extra:vip'));
  $semua = json_decode((string)$vq->fetchColumn(), true);
  if (!is_array($semua)) return array();

  $pilih = array();
  foreach ($semua as $v) {
    if (!is_array($v)) continue;
    if (tanggal_valid(isset($v['tanggal']) ? $v['tanggal'] : '') !== $tgl) continue;
    if (!empty($v['batalAt'])) continue;
    if ((isset($v['jenis']) ? $v['jenis'] : '') !== 'Assisted') continue;
    $pilih[] = $v;
  }
  if (!$pilih) return array();

  /* Nama PIC & perusahaan diambil belakangan, hanya untuk baris yang lolos
     saringan — bukan dengan memuat seluruh tabel users/clients lebih dulu.
     Tabel clients di sini bisa puluhan ribu baris. */
  $userIds = array(); $clientIds = array();
  foreach ($pilih as $v) {
    if (!empty($v['mktPIC']))  $userIds[(string)$v['mktPIC']]   = 1;
    if (!empty($v['clientId'])) $clientIds[(string)$v['clientId']] = 1;
  }
  $namaUser   = peta_kolom($pdo, 'users',   'name',       array_keys($userIds));
  $namaClient = peta_kolom($pdo, 'clients', 'perusahaan', array_keys($clientIds));
  $namaOrang  = peta_kolom($pdo, 'clients', 'nama',       array_keys($clientIds));

  $out = array();
  foreach ($pilih as $v) {
    $cid = isset($v['clientId']) ? (string)$v['clientId'] : '';
    /* Sama urutannya dengan vipPerusahaan() di modul marketing: perusahaan
       client dulu, namanya kalau kosong, teks lama `perusahaan` paling akhir.
       Kalau urutannya beda, satu reservasi tampil dengan dua nama berbeda di
       dua layar dan tidak ada yang tahu mana yang benar. */
    $pt = ($cid !== '' && isset($namaClient[$cid]) && $namaClient[$cid] !== '') ? $namaClient[$cid]
        : (($cid !== '' && isset($namaOrang[$cid])) ? $namaOrang[$cid]
        : (isset($v['perusahaan']) ? (string)$v['perusahaan'] : ''));
    $pid = isset($v['mktPIC']) ? (string)$v['mktPIC'] : '';
    $jam = trim(implode(' - ', array_filter(array(
      isset($v['jamMulai'])   ? (string)$v['jamMulai']   : '',
      isset($v['jamSelesai']) ? (string)$v['jamSelesai'] : ''))));
    $out[] = array(
      'id'         => isset($v['id']) ? $v['id'] : '',
      'nama'       => isset($v['nama']) ? $v['nama'] : '',
      'perusahaan' => $pt,
      'tanggal'    => $tgl,
      'jam'        => $jam,
      // paxMax dulu, sama seperti vipPax() di modul marketing.
      'pax'        => (int)(!empty($v['paxMax']) ? $v['paxMax'] : (isset($v['paxMin']) ? $v['paxMin'] : 0)),
      'meja'       => isset($v['meja']) && is_array($v['meja']) ? array_values($v['meja']) : array(),
      /* WAJIB (int), JANGAN (float). Pemanggilnya membaca angka dengan num()
         (deploy/finance/omset/index.html), yang MEMBUANG semua karakter bukan
         digit sebelum parseInt — jadi 5000000.0 yang keluar dari json_encode
         terbaca sebagai 50000000. Sepuluh kali lipat, tanpa galat, dan angkanya
         terlihat wajar di layar. Rupiah memang tidak berdesimal. */
      'nominal'    => (int)round((float)(isset($v['nominal']) ? $v['nominal'] : 0)),
      'picId'      => $pid,
      'picName'    => ($pid !== '' && isset($namaUser[$pid])) ? $namaUser[$pid] : null,
      // Sama artinya dengan menuFix pada event — lihat catatan di events_hari().
      'menuFix'    => isset($v['menuFix']) ? (string)$v['menuFix'] : '',
    );
  }
  return $out;
}
/* {id => <kolom>} untuk sekumpulan id. Placeholder-nya POSISIONAL (`?`):
   EMULATE_PREPARES mati, jadi penanda bernama yang dipakai berulang akan
   gagal dengan HY093 tanpa menyebut kolom apa pun. */
function peta_kolom($pdo, $tabel, $kolom, $ids) {
  if (!$ids) return array();
  $tanya = implode(',', array_fill(0, count($ids), '?'));
  $st = $pdo->prepare('SELECT id, ' . $kolom . ' AS v FROM ' . $tabel . ' WHERE id IN (' . $tanya . ')');
  $st->execute(array_values($ids));
  $peta = array();
  foreach ($st->fetchAll() as $r) $peta[(string)$r['id']] = (string)$r['v'];
  return $peta;
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

/* ==================== REQUEST DESIGN & VIDEO ====================
   Marketing mengajukan kebutuhan desain / video; modul Konten membacanya di
   Design Queue & Editing Queue. Dibaca lewat DUA endpoint sempit
   (designReqs / designReqSet), BUKAN getAll — getAll di modul ini memulangkan
   seluruh client, event, dan aktivitas, dan halaman antrian di Konten membukanya
   tiap kali orang menekan tombol.

   SATU SUMBER KEBENARAN, DUA PENULIS YANG TIDAK PERNAH BERTABRAKAN:

   - Isi permintaannya (judul, brief, deadline) ada di `extra:designreqs` —
     itu `S.designreqs` milik modul Marketing, ditulis lewat saveAll biasa.
     Konten tidak pernah menulis ke sana.
   - Kemajuannya (sudah dikerjakan / siapa yang pegang) ada di kunci TERPISAH
     `extra:designreqprog`, dan HANYA design_req_set() yang menulisnya.

   Dipisah karena kalau keduanya satu blob, urutan ini akan terjadi dan tidak
   mengeluarkan galat apa pun: desainer menandai selesai jam 10, seorang
   marketing yang membuka halamannya sejak jam 9 menekan Simpan jam 11, dan
   seluruh blob-nya — termasuk status "selesai" — tertimpa oleh salinan lama
   yang ada di layarnya. Yang hilang justru satu-satunya kabar yang ditunggu.

   Sisi Marketing ikut menjaga pemisahan itu: buildPayload() di
   deploy/marketing/index.html membuang `designreqprog` sebelum mengirim,
   persis seperti `_versi`. Kalau baris itu dihapus, perlindungan di sini
   ikut hilang — server tidak punya cara membedakan "tidak dikirim" dari
   "dikirim kosong". */
function design_req_blob($pdo, $k) {
  $q = $pdo->prepare('SELECT v FROM settings WHERE k = :k');
  $q->execute(array(':k' => $k));
  $v = json_decode((string)$q->fetchColumn(), true);
  return is_array($v) ? $v : array();
}

/* $hanyaAktif = true -> yang sudah selesai tidak ikut. Dipakai antrian di
   modul Konten, yang memang cuma mengurus pekerjaan yang belum kelar.
   Yang dibatalkan marketing (`batalAt`) tidak pernah ikut, apa pun nilainya. */
function design_reqs($hanyaAktif) {
  $pdo  = db();
  $reqs = design_req_blob($pdo, 'extra:designreqs');
  $prog = design_req_blob($pdo, 'extra:designreqprog');
  $out  = array();
  foreach ($reqs as $r) {
    if (!is_array($r) || empty($r['id'])) continue;
    if (!empty($r['batalAt'])) continue;
    $id = (string)$r['id'];
    $p  = (isset($prog[$id]) && is_array($prog[$id])) ? $prog[$id] : array();
    $st = (isset($p['status']) && $p['status'] === 'done') ? 'done' : 'todo';
    if ($hanyaAktif && $st === 'done') continue;
    $out[] = array(
      'id'        => $id,
      'jenis'     => (isset($r['jenis']) && $r['jenis'] === 'edit') ? 'edit' : 'design',
      'judul'     => isset($r['judul'])     ? (string)$r['judul']     : '',
      'brief'     => isset($r['brief'])     ? (string)$r['brief']     : '',
      'acara'     => isset($r['acara'])     ? (string)$r['acara']     : '',
      'deadline'  => tanggal_valid(isset($r['deadline']) ? $r['deadline'] : ''),
      'prioritas' => isset($r['prioritas']) ? (string)$r['prioritas'] : 'medium',
      'pemohon'   => isset($r['byNama'])    ? (string)$r['byNama']    : '',
      'at'        => isset($r['at'])        ? (string)$r['at']        : '',
      'brand'     => isset($r['brand'])     ? (string)$r['brand']     : '',
      'brandNama' => isset($r['brandNama']) ? (string)$r['brandNama'] : '',
      'platforms' => (isset($r['platforms']) && is_array($r['platforms'])) ? array_values($r['platforms']) : array(),
      'picMinta'  => isset($r['picNama'])   ? (string)$r['picNama']   : '',
      'picId'     => isset($r['pic'])       ? (string)$r['pic']       : '',
      'nRef'      => (isset($r['refs']) && is_array($r['refs'])) ? count($r['refs']) : 0,
      'status'    => $st,
      'pic'       => isset($p['picNama'])   ? (string)$p['picNama']   : '',
      'doneAt'    => isset($p['at'])        ? (string)$p['at']        : '',
    );
  }
  /* `opsi` menempel di balasan yang sama, bukan endpoint sendiri: modul
     Marketing membutuhkannya tepat saat halaman requestnya dibuka — yaitu saat
     ia memanggil ini juga. Satu perjalanan, bukan dua. */
  return array('reqs' => $out, 'opsi' => design_req_blob(db(), 'extra:designreqopsi'));
}

/* SATU permintaan, LENGKAP dengan referensinya (termasuk data gambar).
   Dipisah dari daftar dengan sengaja: referensi gambar tersimpan sebagai data
   URI base64, dan mengikutkannya di daftar berarti antrian produksi di modul
   Konten menarik belasan megabyte tiap kali halamannya dibuka — untuk gambar
   yang belum tentu ada yang membukanya. Daftar cuma membawa jumlahnya
   (`nRef`); isinya diambil saat briefnya benar-benar dibuka. */
function design_req_satu($id) {
  $id   = trim((string)$id);
  if ($id === '') throw new Exception('id permintaan kosong');
  $pdo  = db();
  $reqs = design_req_blob($pdo, 'extra:designreqs');
  foreach ($reqs as $r) {
    if (!is_array($r) || (string)(isset($r['id']) ? $r['id'] : '') !== $id) continue;
    $prog = design_req_blob($pdo, 'extra:designreqprog');
    $p = (isset($prog[$id]) && is_array($prog[$id])) ? $prog[$id] : array();
    $r['status']  = (isset($p['status']) && $p['status'] === 'done') ? 'done' : 'todo';
    $r['picDone'] = isset($p['picNama']) ? (string)$p['picNama'] : '';
    return array('req' => $r);
  }
  return array('req' => null);
}

/* PILIHAN BRAND / PIC / PLATFORM — dicerminkan DARI modul Konten.
   Brand dan daftar kru adalah data milik modul Konten, dan modul Marketing
   tidak punya cara membacanya: backend Konten tidak ikut ter-deploy otomatis,
   jadi menambahkan endpoint di sana berarti satu langkah unggah manual tiap
   kali. Jadi arahnya dibalik — modul Konten MENITIPKAN daftar pilihannya ke
   sini tiap kali antrian produksinya dibuka, dan formulir request memakainya.

   Konsekuensinya jujur dan disebutkan di layar: kalau modul Konten belum
   pernah dibuka sejak fitur ini terpasang, daftarnya kosong dan formulirnya
   jatuh ke isian bebas. Itu memperbaiki dirinya sendiri pada pembukaan
   pertama — bukan keadaan yang perlu diperbaiki manual. */
function design_req_opsi_set($opsi) {
  if (!is_array($opsi)) throw new Exception('opsi kosong/invalid');
  $bersih = array(
    'brands'    => array(),
    'pics'      => array(),
    'platforms' => array(),
    'at'        => gmdate('c'),
  );
  if (isset($opsi['brands']) && is_array($opsi['brands'])) {
    foreach ($opsi['brands'] as $b) {
      if (!is_array($b) || empty($b['id'])) continue;
      $bersih['brands'][] = array(
        'id'   => (string)$b['id'],
        'name' => isset($b['name']) ? (string)$b['name'] : '',
      );
    }
  }
  if (isset($opsi['pics']) && is_array($opsi['pics'])) {
    foreach ($opsi['pics'] as $u) {
      if (!is_array($u) || empty($u['id'])) continue;
      /* `prod` = kru yang memang mengerjakan desain/video/foto. Formulir
         request MENDAHULUKAN mereka di dropdown PIC, tidak menyembunyikan
         sisanya — kru yang rangkap kerja ikut ditawarkan di kelompok kedua.
         Kalau penanda ini dibuang dari daftar putih di bawah, seluruh kru
         jatuh ke kelompok "lainnya": tidak ada galat, cuma urutan yang
         membuat nama yang paling sering dipilih tenggelam di tengah daftar. */
      $bersih['pics'][] = array(
        'id'   => (string)$u['id'],
        'name' => isset($u['name']) ? (string)$u['name'] : '',
        'peran'=> isset($u['peran']) ? (string)$u['peran'] : '',
        'prod' => (!empty($u['prod'])) ? 1 : 0,
      );
    }
  }
  if (isset($opsi['platforms']) && is_array($opsi['platforms'])) {
    foreach ($opsi['platforms'] as $p) {
      if (is_string($p) && $p !== '') $bersih['platforms'][] = $p;
    }
  }
  /* Titipan KOSONG tidak pernah menghapus daftar yang sudah ada. Modul Konten
     yang gagal memuat datanya lalu tetap mengirim akan mengosongkan seluruh
     pilihan di formulir request — dan yang membukanya cuma melihat dropdown
     yang tiba-tiba kosong, tanpa sebab yang bisa ditelusuri. */
  if (!$bersih['brands'] && !$bersih['pics'] && !$bersih['platforms']) {
    return array('disimpan' => false, 'sebab' => 'titipan kosong diabaikan');
  }
  put_setting(db(), 'extra:designreqopsi', $bersih);
  return array('disimpan' => true,
               'brands' => count($bersih['brands']),
               'pics' => count($bersih['pics']),
               'platforms' => count($bersih['platforms']));
}

/* Menandai satu permintaan selesai / dibuka lagi. Ditulis dari modul Konten.
   Baris permintaannya sendiri TIDAK disentuh — lihat keterangan di atas. */
function design_req_set($id, $status, $picNama) {
  $id = trim((string)$id);
  if ($id === '') throw new Exception('id permintaan kosong');
  $status = ($status === 'done') ? 'done' : 'todo';
  $pdo  = db();
  $prog = design_req_blob($pdo, 'extra:designreqprog');
  $prog[$id] = array(
    'status'  => $status,
    'picNama' => (string)$picNama,
    'at'      => gmdate('c'),
  );
  put_setting($pdo, 'extra:designreqprog', $prog);
  return array('id' => $id, 'status' => $status);
}
