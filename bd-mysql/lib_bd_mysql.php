<?php
/************************************************************************
 * BD OS LAKSAMANA MUDA — Backend PHP + MySQL
 * ---------------------------------------------------------------------
 * Menyimpan state BD OS (kru, project, task, routine, koordinasi, PO,
 * agenda) ke MySQL. Pola-nya SAMA dengan event-mysql & reservasi-mysql,
 * supaya sekali paham dipakai di semua modul:
 *
 *   - Aplikasi mengirim state UTUH (objek DB di klien), backend menulis
 *     PER-BARIS (INSERT ... ON DUPLICATE KEY UPDATE).
 *   - Penjaga optimistic-lock via `updated_at`: baris kiriman yang LEBIH LAMA
 *     tidak menimpa baris server yang lebih baru → dua kru tidak saling
 *     menimpa.
 *   - Sumber kebenaran tiap baris = kolom `data` (JSON utuh). Kolom lain hasil
 *     ekstraksi untuk indeks/laporan.
 *
 * File ini HANYA berisi fungsi (tanpa efek samping saat di-include).
 ************************************************************************/

/* config.local.php dipakai KALAU ADA — untuk tes di laptop tanpa mengubah
   config.php produksi. Di server file itu tidak ada, jadi config.php yang
   terpakai. (config.local.php sudah di-ignore git.) */
if (file_exists(__DIR__ . '/config.local.php')) require_once __DIR__ . '/config.local.php';
else                                            require_once __DIR__ . '/config.php';

/* Versi backend. NAIKKAN tiap kali perilaku file ini berubah.

   Gunanya bukan kerapian: backend di-upload manual per server (office & dev
   punya salinannya masing-masing), jadi tanpa penanda ini tidak ada cara
   memastikan server mana yang sudah dapat perbaikan dan mana yang belum.
   Cukup buka ?action=ping dan bandingkan dengan nilai di repo. */
define('LIB_VERSI', '2026-07-23b');

/* Identitas server, ikut di ping & stats.

   env + db adalah pengaman zip tertukar. Zip dev dan zip office isinya nyaris
   sama; yang membedakan cuma isi config.php. Kalau zip produksi telanjur
   terupload ke dev, dev akan menulis ke database office TANPA satu pun pesan
   error — semuanya terlihat normal. Satu-satunya cara melihatnya adalah
   membaca env & db yang benar-benar sedang dipakai server itu. */
function identitas() {
  return array(
    'env'   => defined('ENV_LABEL') ? ENV_LABEL : '?',
    'db'    => DB_NAME,
    'versi' => LIB_VERSI,
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

/* ==================== KUNCI TULIS (anti tabrakan) ====================
   BD OS tidak menyentuh disk sama sekali, jadi pakai kunci milik MySQL
   (GET_LOCK) — sekaligus benar walau nanti PHP jalan di beberapa
   proses/server. Optimistic-lock via updated_at tetap jadi lapis kedua. */
function db_lock() {
  $st = db()->prepare('SELECT GET_LOCK(:k, 10) AS ok');
  $st->execute(array(':k' => DB_NAME . ':bd_save'));
  $row = $st->fetch();
  if (empty($row['ok'])) throw new Exception('Server sedang sibuk menyimpan, coba lagi sebentar.');
  return true;
}
function db_unlock($h) {
  if (!$h) return;
  $st = db()->prepare('SELECT RELEASE_LOCK(:k)');
  $st->execute(array(':k' => DB_NAME . ':bd_save'));
}

/* ==================== PETA KOLEKSI → TABEL ====================
   Satu tempat untuk memetakan koleksi di aplikasi ke tabel + kolom inti.
   Menambah field baru di aplikasi TIDAK perlu ubah apa pun di sini: field
   ikut tersimpan di kolom `data`. Yang perlu ditambah di sini hanya kalau
   sebuah field mau dipakai untuk indeks/laporan.

   Format: 'namaKolomDB' => array('fieldDiAplikasi', 'tipe')
   Tipe: str | int | bool | date | first

   'first' mengambil elemen PERTAMA dari sebuah array. Dipakai untuk `pic` di
   tasks & projects: satu baris kini boleh dipegang beberapa orang (`pics`),
   tapi kolom SQL-nya tetap satu supaya indeks & laporan phpMyAdmin tetap
   berguna. Daftar lengkapnya ada di kolom `data` — sumber kebenarannya tetap
   di sana, kolom ini cuma cuplikan.

   SENGAJA TIDAK ada tabel penghubung task_pics. Modul ini memuat state utuh
   ke klien dan menyaring di sana; tidak ada satu pun query yang mencari "task
   milik si A" di SQL. Menambah tabel penghubung berarti menambah tempat yang
   bisa menyimpang demi query yang tidak pernah dijalankan.

   'created' => true berarti tabel punya kolom created_at (diisi sekali saat
   INSERT, tidak pernah ditimpa).

   CATATAN NAMA KOLOM: field aplikasi `div` disimpan di kolom `divisi`.
   `DIV` adalah KATA KUNCI MariaDB/MySQL (operator pembagian bulat, `7 DIV 2`),
   jadi `CREATE TABLE … div VARCHAR(64)` ditolak dengan error 1064 — dan
   `INSERT INTO people (…,div,…)` pun ikut gagal. Backtick sebenarnya cukup,
   tapi mengganti namanya lebih baik: kolom yang butuh kutip di setiap query
   cepat atau lambat akan lolos tanpa kutip di satu tempat. JSON di kolom
   `data` tetap memakai `div`, jadi frontend tidak berubah sama sekali. */
function collections() {
  return array(
    'people' => array('table' => 'people', 'created' => true, 'cols' => array(
      'name'           => array('name', 'str'),
      'role'           => array('role', 'str'),
      'divisi'         => array('div', 'str'),
      'boss_id'        => array('boss', 'str'),
      'office_user_id' => array('officeUserId', 'str'),
      'active'         => array('active', 'bool'),
    )),
    'projects' => array('table' => 'projects', 'created' => true, 'cols' => array(
      'name'       => array('name', 'str'),
      'type'       => array('type', 'str'),
      'stage'      => array('stage', 'str'),
      'divisi'     => array('div', 'str'),
      'pic'        => array(array('pics','pic'), 'first'),
      'start_date' => array('start', 'date'),
      'end_date'   => array('end', 'date'),
      'budget'     => array('budget', 'int'),
      'spent'      => array('spent', 'int'),
      'health'     => array('health', 'str'),
    )),
    'tasks' => array('table' => 'tasks', 'created' => true, 'cols' => array(
      'name'       => array('name', 'str'),
      'divisi'     => array('div', 'str'),
      'pic'        => array(array('pics','pic'), 'first'),
      'status'     => array('status', 'str'),
      'priority'   => array('priority', 'str'),
      'deadline'   => array('deadline', 'date'),
      'important'  => array('important', 'bool'),
      'urgent'     => array('urgent', 'bool'),
      'type'       => array('type', 'str'),
      'project_id' => array('project', 'str'),
      'progress'   => array('progress', 'int'),
    )),
    'routines' => array('table' => 'routines', 'created' => true, 'cols' => array(
      'name'      => array('name', 'str'),
      'divisi'    => array('div', 'str'),
      'pic'       => array('pic', 'str'),
      'freq'      => array('freq', 'str'),
      'important' => array('important', 'bool'),
      'urgent'    => array('urgent', 'bool'),
      'active'    => array('active', 'bool'),
    )),
    'coord' => array('table' => 'coord_requests', 'created' => true, 'cols' => array(
      'title'        => array('title', 'str'),
      'from_div'     => array('fromDiv', 'str'),
      'to_div'       => array('toDiv', 'str'),
      'requested_by' => array('by', 'str'),
      'assignee'     => array('to', 'str'),
      'status'       => array('status', 'str'),
      'priority'     => array('priority', 'str'),
      'due_date'     => array('due', 'date'),
      'project_id'   => array('project', 'str'),
    )),
    'po' => array('table' => 'purchase_orders', 'created' => true, 'cols' => array(
      'item'       => array('item', 'str'),
      'vendor'     => array('vendor', 'str'),
      'qty'        => array('qty', 'int'),
      'unit'       => array('unit', 'str'),
      'divisi'     => array('div', 'str'),
      'amount'     => array('amount', 'int'),
      'status'     => array('status', 'str'),
      'payment'    => array('payment', 'str'),       // CASH/ONLINE/CREDIT
      'need_by'    => array('needBy', 'date'),
      'pic'        => array('pic', 'str'),          // PO: satu penanggung jawab
      'project_id' => array('project', 'str'),
      'pr_id'      => array('prId', 'str'),         // dokumen PR mingguan tempat baris ini ikut
    )),
    /* Dokumen PR mingguan. Item-nya TIDAK di sini — barisnya tinggal di
       purchase_orders dan menunjuk balik lewat pr_id, jadi tidak ada dua
       salinan isi yang bisa menyimpang. */
    'pr' => array('table' => 'purchase_requests', 'created' => true, 'cols' => array(
      'no'         => array('no', 'str'),
      'nama'       => array('nama', 'str'),
      'dept'       => array('dept', 'str'),
      'tanggal'    => array('tanggal', 'date'),
      'week_start' => array('weekStart', 'date'),
      'status'     => array('status', 'str'),
      'total'      => array('total', 'int'),
    )),
    'agenda' => array('table' => 'agenda', 'created' => true, 'cols' => array(
      'title'   => array('title', 'str'),
      'tanggal' => array('date', 'date'),
      'type'    => array('type', 'str'),
      'divisi'  => array('div', 'str'),
    )),
  );
}

/* ==================== NORMALISASI NILAI ==================== */
// 'YYYY-MM-DD' valid → dikembalikan; selain itu null (biar kolom DATE aman).
// Aplikasi memang bisa mengirim '' untuk task tanpa deadline; '' masuk ke
// kolom DATE akan jadi '0000-00-00' di MySQL mode longgar dan ERROR di mode
// ketat — dua-duanya salah, jadi disaring di sini.
function tanggal_valid($d) {
  $d = trim((string)$d);
  return preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) ? $d : null;
}
// Epoch ms. Menerima angka (ms) maupun string ISO. Gagal → 0.
function ms_valid($v) {
  if (is_int($v) || is_float($v)) return (int)$v;
  if (is_string($v) && $v !== '') {
    if (ctype_digit($v)) return (int)$v;
    $ts = strtotime($v);
    if ($ts !== false) return $ts * 1000;
  }
  return 0;
}
/* $field boleh berupa NAMA atau DAFTAR nama; yang dipakai adalah yang pertama
   benar-benar ada di baris. Itulah cara `pic` tetap terisi untuk baris lama:
   frontend versi sebelumnya hanya mengirim `pic` (string), yang sekarang
   mengirim `pics` (array), dan keduanya dipetakan ke kolom yang sama. */
function ambil($row, $field, $type) {
  $v = null;
  foreach ((array)$field as $f) {
    if (array_key_exists($f, $row)) { $v = $row[$f]; break; }
  }
  switch ($type) {
    case 'int':  return intval($v);
    case 'bool': return empty($v) ? 0 : 1;
    case 'date': return tanggal_valid($v);
    /* Elemen pertama sebuah array (lihat catatan `pics` di collections()).
       Frontend lama mengirim `pic` sebagai string, bukan array — bentuk itu
       tetap diterima di sini supaya baris yang tersimpan dari versi sebelumnya
       tidak kehilangan kolom pic-nya begitu backend ini naik lebih dulu. */
    case 'first':
      if (is_array($v)) return count($v) ? (string)$v[0] : null;
      return ($v === null || $v === '') ? null : (string)$v;
    default:     return $v === null ? null : (string)$v;
  }
}
function json_enc($v) { return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); }

/* Kutip nama tabel/kolom dengan backtick.

   Nama-nama di sini datang dari collections() — kode kita sendiri, bukan input
   pengguna — jadi ini BUKAN penangkal SQL injection. Gunanya menutup kelas
   masalah yang sudah sempat kejadian: `div` ternyata kata kunci MySQL, dan
   query yang dirakit tanpa kutip langsung ditolak error 1064. Kata kunci baru
   bermunculan tiap versi MySQL/MariaDB; dengan backtick, kolom bernama
   `status`, `type`, atau `rank` tetap aman tanpa perlu ada yang ingat.

   Karakter selain huruf/angka/garis bawah dibuang, dan backtick di dalam nama
   tidak mungkin lolos — kalau suatu saat nama kolom datang dari tempat lain,
   fungsi ini tidak berubah jadi lubang. */
function q($ident) {
  return '`' . preg_replace('/[^A-Za-z0-9_]/', '', (string)$ident) . '`';
}

/* ==================== BACA STATE (dari MySQL) ====================
   Bentuk hasilnya PERSIS objek DB yang dipakai aplikasi, jadi frontend tinggal
   memakainya apa adanya. */
function baca_state() {
  $pdo = db();
  $out = array();

  foreach (collections() as $nama => $c) {
    $urut = isset($c['created']) ? '`created_at` ASC, `id` ASC' : '`id` ASC';
    $rows = array();
    foreach ($pdo->query('SELECT `data` FROM ' . q($c['table']) . ' ORDER BY ' . $urut) as $row) {
      $r = json_decode($row['data'], true);
      if (is_array($r)) $rows[] = $r;
    }
    $out[$nama] = $rows;
  }

  // Fokus harian per orang: {peopleId: {teks, tgl}}
  $out['focus'] = get_setting('focus', new stdClass());

  return $out;
}

function get_setting($k, $default) {
  $st = db()->prepare('SELECT `v` FROM `settings` WHERE `k` = :k LIMIT 1');
  $st->execute(array(':k' => $k));
  $row = $st->fetch();
  if (!$row) return $default;
  $v = json_decode($row['v'], true);
  return $v === null ? $default : $v;
}
function put_setting($pdo, $k, $v) {
  $st = $pdo->prepare('INSERT INTO `settings` (`k`, `v`) VALUES (:k, :v)
                       ON DUPLICATE KEY UPDATE `v` = VALUES(`v`)');
  $st->execute(array(':k' => $k, ':v' => json_enc($v)));
}

/* ==================== UPSERT SATU KOLEKSI ====================
   Menulis per-baris dengan penjaga updated_at, lalu menghapus baris yang
   HILANG dari kiriman. Mengembalikan jumlah baris yang diproses. */
function upsert_collection($pdo, $c, $rows) {
  $tabel = $c['table'];
  $cols  = $c['cols'];
  $adaCreated = !empty($c['created']);

  // Susun daftar kolom: id, <kolom inti>, updated_at, [created_at], data
  $names = array_merge(array('id'), array_keys($cols), array('updated_at'));
  if ($adaCreated) $names[] = 'created_at';
  $names[] = 'data';

  $ph = array();
  foreach ($names as $n) $ph[] = ':' . $n;

  $kolomSql = array();
  foreach ($names as $n) $kolomSql[] = q($n);

  // Yang ditimpa saat duplikat: semua kecuali id & created_at (created_at
  // sengaja tidak pernah diubah — waktu lahir baris itu tetap).
  $upd = array();
  foreach (array_merge(array_keys($cols), array('data')) as $n) {
    $upd[] = q($n) . ' = IF(VALUES(`updated_at`) >= `updated_at`, VALUES(' . q($n) . '), ' . q($n) . ')';
  }
  $upd[] = '`updated_at` = IF(VALUES(`updated_at`) >= `updated_at`, VALUES(`updated_at`), `updated_at`)';

  $sql = 'INSERT INTO ' . q($tabel) . ' (' . implode(',', $kolomSql) . ') VALUES (' . implode(',', $ph) . ')
          ON DUPLICATE KEY UPDATE ' . implode(', ', $upd);
  $st = $pdo->prepare($sql);

  $ids = array();
  $maxUpd = 0;                      // updated_at terbaru yang ADA di kiriman ini
  foreach ($rows as $r) {
    if (!is_array($r) || empty($r['id'])) continue;
    $id = (string)$r['id'];
    $ids[] = $id;

    $args = array(':id' => $id);
    foreach ($cols as $kolom => $def) $args[':' . $kolom] = ambil($r, $def[0], $def[1]);
    $args[':updated_at'] = ms_valid(isset($r['updatedAt']) ? $r['updatedAt'] : 0);
    if ($args[':updated_at'] > $maxUpd) $maxUpd = $args[':updated_at'];
    if ($adaCreated) $args[':created_at'] = ms_valid(isset($r['createdAt']) ? $r['createdAt'] : 0);
    $args[':data'] = json_enc($r);
    $st->execute($args);
  }

  hapus_yang_hilang($pdo, $tabel, 'id', $ids, $maxUpd);
  return count($ids);
}

/* Hapus baris yang tidak ada di kiriman.
   JAGA-JAGA: kalau kiriman KOSONG tapi DB berisi, JANGAN hapus semua —
   lindungi dari state kosong yang tak sengaja (mis. aplikasi gagal load lalu
   menyimpan). Menghapus semua isi tabel harus lewat phpMyAdmin, bukan lewat
   satu request yang kebetulan kosong. */
function hapus_yang_hilang($pdo, $tabel, $kolomId, $ids, $batas = 0) {
  if (count($ids) === 0) {
    return; // kiriman kosong: tidak menghapus apa pun (lihat catatan di atas)
  }
  /* PENJAGA BARIS BARU DARI KRU LAIN.
     Penjaga updated_at hanya melindungi PERUBAHAN, bukan PENGHAPUSAN. Tanpa
     batas di bawah ini: Nadia membuka BD OS (12 task termuat), Galih membuat
     task ke-13, lalu Nadia menyimpan — kiriman Nadia tidak memuat task ke-13,
     sehingga task yang sah itu IKUT TERHAPUS tanpa jejak.

     $batas = updated_at terbaru yang ADA di kiriman. Baris yang lebih baru
     dari itu mustahil diketahui pengirimnya, jadi tidak boleh dihapus
     olehnya. Baris lama yang memang sengaja dihapus tetap terhapus. */
  $place = implode(',', array_fill(0, count($ids), '?'));
  $sql   = 'DELETE FROM ' . q($tabel) . ' WHERE ' . q($kolomId) . ' NOT IN (' . $place . ')';
  $args  = $ids;
  if ($batas > 0) { $sql .= ' AND `updated_at` <= ?'; $args[] = $batas; }
  $del = $pdo->prepare($sql);
  $del->execute($args);
}

/* ==================== SIMPAN (dipanggil di dalam kunci) ====================
   Reconcile SELURUH state kiriman ke MySQL, semua dalam 1 transaksi.
   Koleksi yang TIDAK dikirim sama sekali → tidak disentuh (bukan dikosongkan). */
function save_all($state) {
  if (!is_array($state)) throw new Exception('Payload data kosong/invalid');

  $pdo = db();
  $pdo->beginTransaction();
  try {
    $hitung = array();

    foreach (collections() as $nama => $c) {
      if (!array_key_exists($nama, $state)) continue;          // tidak dikirim → lewati
      $rows = is_array($state[$nama]) ? $state[$nama] : array();
      $hitung[$nama] = upsert_collection($pdo, $c, $rows);
    }

    if (isset($state['focus'])) put_setting($pdo, 'focus', $state['focus']);

    $pdo->commit();
  } catch (Throwable $e) {
    $pdo->rollBack();
    throw $e;
  }

  return array(
    'saved'   => true,
    'jumlah'  => $hitung,
    'backend' => 'php-mysql',
    'ts'      => gmdate('c'),
  );
}

/* ==================== TAMBAH PO DARI MODUL LAIN ====================
   Dipakai modul Marketing untuk mengirim request pembelian ke papan
   Purchasing milik BD.

   TIDAK boleh lewat saveAll, dan ini bukan soal kerapian. saveAll melakukan
   REKONSILIASI: baris yang tidak ada di kiriman akan DIHAPUS. Marketing tidak
   memegang state BD, jadi kirimannya hanya berisi dua-tiga baris baru — dan
   saveAll akan menganggap SELURUH purchase_orders lainnya sudah dihapus, lalu
   membuangnya. Satu panggilan salah dari modul tetangga cukup untuk
   mengosongkan papan purchasing.

   Fungsi ini HANYA menyisipkan. Tidak menghapus, tidak menimpa: id yang
   kebetulan sudah ada dilewati (INSERT IGNORE), bukan ditulis ulang. */
function tambah_po($rows) {
  if (!is_array($rows) || !count($rows)) throw new Exception('Tidak ada baris untuk ditambahkan');
  if (count($rows) > 200) throw new Exception('Terlalu banyak baris sekaligus (maks 200)');

  $c    = collections();
  $cols = $c['po']['cols'];
  $pdo  = db();

  $names = array_merge(array('id'), array_keys($cols), array('updated_at','created_at','data'));
  $ph = array(); $q = array();
  foreach ($names as $n) { $ph[] = ':' . $n; $q[] = q($n); }

  $st = $pdo->prepare('INSERT IGNORE INTO ' . q($c['po']['table']) .
        ' (' . implode(',', $q) . ') VALUES (' . implode(',', $ph) . ')');

  $now = (int)round(microtime(true) * 1000);
  $n = 0;
  $pdo->beginTransaction();
  try {
    foreach ($rows as $r) {
      if (!is_array($r)) continue;
      if (empty($r['item'])) continue;                    // baris tanpa nama barang dilewati
      /* id SELALU dibuat di sini, tidak menerima kiriman: id dari luar bisa
         bertabrakan dengan baris yang sudah ada, dan INSERT IGNORE akan
         diam-diam membuang baris barunya tanpa satu pun pesan. */
      $r['id'] = 'po' . bin2hex(random_bytes(5));
      if (empty($r['status'])) $r['status'] = 'Diajukan';
      $r['updatedAt'] = $now;
      $r['createdAt'] = $now;

      $args = array(':id' => $r['id']);
      foreach ($cols as $kolom => $def) $args[':' . $kolom] = ambil($r, $def[0], $def[1]);
      $args[':updated_at'] = $now;
      $args[':created_at'] = $now;
      $args[':data']       = json_enc($r);
      $st->execute($args);
      $n++;
    }
    $pdo->commit();
  } catch (Throwable $e) { $pdo->rollBack(); throw $e; }

  return array('added' => $n, 'ts' => gmdate('c'));
}

/* ==================== DIAGNOSTIK ==================== */
function stats() {
  $pdo = db();
  $out = array_merge(array('backend' => 'php-mysql'), identitas());
  $tabel = array('people','projects','tasks','routines','coord_requests',
                 'purchase_orders','purchase_requests','agenda','settings');
  foreach ($tabel as $t) {
    $out[$t] = (int)$pdo->query('SELECT COUNT(*) c FROM ' . q($t))->fetch()['c'];
  }
  $blob = strlen(json_enc(baca_state()));
  $out['blobChars'] = $blob;
  $out['blobMB']    = round($blob / 1048576, 3);
  $out['ts']        = gmdate('c');
  return $out;
}
