<?php
/************************************************************************
 * EVENT MANAGEMENT SYSTEM (EMS) LAKSAMANA MUDA — Backend PHP + MySQL
 * ---------------------------------------------------------------------
 * Menyimpan state EMS (talent, event, jadwal, ticketing, dst) ke MySQL.
 * Pola-nya SAMA dengan reservasi-mysql, supaya sekali paham dipakai di dua
 * modul:
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
   Reservasi memakai file .lock karena punya folder foto. EMS tidak menyentuh
   disk sama sekali, jadi pakai kunci milik MySQL (GET_LOCK) — sekaligus benar
   walau nanti PHP jalan di beberapa proses/server. Optimistic-lock via
   updated_at tetap jadi lapis kedua. */
function db_lock() {
  $st = db()->prepare('SELECT GET_LOCK(:k, 10) AS ok');
  $st->execute(array(':k' => DB_NAME . ':ems_save'));
  $row = $st->fetch();
  if (empty($row['ok'])) throw new Exception('Server sedang sibuk menyimpan, coba lagi sebentar.');
  return true;
}
function db_unlock($h) {
  if (!$h) return;
  $st = db()->prepare('SELECT RELEASE_LOCK(:k)');
  $st->execute(array(':k' => DB_NAME . ':ems_save'));
}

/* ==================== PETA KOLEKSI → TABEL ====================
   Satu tempat untuk memetakan koleksi di aplikasi ke tabel + kolom inti.
   Menambah field baru di aplikasi TIDAK perlu ubah apa pun di sini: field
   ikut tersimpan di kolom `data`. Yang perlu ditambah di sini hanya kalau
   sebuah field mau dipakai untuk indeks/laporan.

   Format: 'namaKolomDB' => array('fieldDiAplikasi', 'tipe')
   Tipe: str | int | bool | date | time | datetime | ms
   'created' => true  berarti tabel punya kolom created_at (diisi sekali saat
   INSERT, tidak pernah ditimpa). */
function collections() {
  return array(
    'talents' => array('table' => 'talents', 'created' => true, 'cols' => array(
      'name'            => array('name', 'str'),
      'category'        => array('category', 'str'),
      'phone'           => array('phone', 'str'),
      'status'          => array('status', 'str'),
      'contract_status' => array('contract_status', 'str'),
      'default_fee'     => array('default_fee', 'int'),
    )),
    'events' => array('table' => 'events', 'created' => true, 'cols' => array(
      'title'          => array('title', 'str'),
      'category'       => array('category', 'str'),
      'status'         => array('status', 'str'),
      'venue'          => array('venue', 'str'),
      'start_datetime' => array('start_datetime', 'datetime'),
      'end_datetime'   => array('end_datetime', 'datetime'),
      'capacity'       => array('capacity', 'int'),
      'pic'            => array('pic', 'str'),
      'is_ticketed'    => array('is_ticketed', 'bool'),
      'idea_id'        => array('idea_id', 'str'),
    )),
    'schedules' => array('table' => 'schedules', 'created' => true, 'cols' => array(
      'talent_id'        => array('talent_id', 'str'),
      'event_id'         => array('event_id', 'str'),
      'tanggal'          => array('date', 'date'),
      'start_time'       => array('start_time', 'time'),
      'end_time'         => array('end_time', 'time'),
      'performance_type' => array('performance_type', 'str'),
      'fee'              => array('fee', 'int'),
      'status'           => array('status', 'str'),
      'source'           => array('source', 'str'),
    )),
    'recurringRules' => array('table' => 'recurring_rules', 'cols' => array(
      'talent_id'  => array('talent_id', 'str'),
      'valid_from' => array('valid_from', 'date'),
      'valid_to'   => array('valid_to', 'date'),
    )),
    'talentPayments' => array('table' => 'talent_payments', 'cols' => array(
      'talent_id'    => array('talent_id', 'str'),
      'period_month' => array('period_month', 'str'),
      'show_count'   => array('show_count', 'int'),
      'total_amount' => array('total_amount', 'int'),
      'status'       => array('status', 'str'),
    )),
    'ticketClasses' => array('table' => 'ticket_classes', 'cols' => array(
      'event_id'  => array('event_id', 'str'),
      'name'      => array('name', 'str'),
      'price'     => array('price', 'int'),
      'quota'     => array('quota', 'int'),
      'sold'      => array('sold', 'int'),
      'is_seated' => array('is_seated', 'bool'),
    )),
    'seats' => array('table' => 'seats', 'cols' => array(
      'event_id'        => array('event_id', 'str'),
      'ticket_class_id' => array('ticket_class_id', 'str'),
      'zone'            => array('zone', 'str'),
      'table_no'        => array('table_no', 'str'),
      'status'          => array('status', 'str'),
    )),
    'orders' => array('table' => 'orders', 'created' => true, 'created_field' => 'created', 'cols' => array(
      'event_id'       => array('event_id', 'str'),
      'buyer_name'     => array('buyer_name', 'str'),
      'phone'          => array('phone', 'str'),
      'email'          => array('email', 'str'),
      'total'          => array('total', 'int'),
      'payment_status' => array('payment_status', 'str'),
      'payment_ref'    => array('payment_ref', 'str'),
    )),
    'tickets' => array('table' => 'tickets', 'cols' => array(
      'order_item_id'   => array('order_item_id', 'str'),
      'ticket_class_id' => array('ticket_class_id', 'str'),
      'seat_id'         => array('seat_id', 'str'),
      'ticket_number'   => array('ticket_number', 'str'),
      'qr_token'        => array('qr_token', 'str'),
      'status'          => array('status', 'str'),
    )),
    'ideas' => array('table' => 'ideas', 'cols' => array(
      'name'       => array('name', 'str'),
      'category'   => array('category', 'str'),
      'frequency'  => array('frequency', 'str'),
      'difficulty' => array('difficulty', 'str'),
    )),
    'refunds' => array('table' => 'refunds', 'cols' => array(
      'order_id' => array('order_id', 'str'),
      'status'   => array('status', 'str'),
    )),
    'calendarExtra' => array('table' => 'calendar_extra', 'cols' => array(
      'type'    => array('type', 'str'),
      'title'   => array('title', 'str'),
      'tanggal' => array('date', 'date'),
    )),
  );
}

/* ==================== NORMALISASI NILAI ==================== */
// 'YYYY-MM-DD' valid → dikembalikan; selain itu null (biar kolom DATE aman).
function tanggal_valid($d) {
  $d = trim((string)$d);
  return preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) ? $d : null;
}
// ISO 8601 (mis. "2026-07-23T12:00:00.000Z") → "2026-07-23 19:00:00" WIB.
//
// SENGAJA disimpan dalam WIB, bukan UTC. Alasannya: kolom `schedules.tanggal`
// berisi tanggal LOKAL (aplikasi menghasilkannya dari jam laptop), jadi kalau
// kolom jam event disimpan UTC, dua kolom itu beda zona — laporan di
// phpMyAdmin akan meleset 7 jam dan event malam bisa terbaca mundur sehari.
// Semua operasi Laksamana Muda memakai WIB, jadi kolom ini WIB juga.
// Sumber kebenaran tetap kolom `data` (tetap ISO/UTC, apa adanya dari aplikasi).
function datetime_valid($v) {
  $v = trim((string)$v);
  if ($v === '') return null;
  $ts = strtotime($v);
  if ($ts === false) return null;
  $d = new DateTime('@' . $ts);
  $d->setTimezone(new DateTimeZone('Asia/Jakarta'));
  return $d->format('Y-m-d H:i:s');
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
function ambil($row, $field, $type) {
  $v = isset($row[$field]) ? $row[$field] : null;
  switch ($type) {
    case 'int':      return intval($v);
    case 'bool':     return empty($v) ? 0 : 1;
    case 'date':     return tanggal_valid($v);
    case 'datetime': return datetime_valid($v);
    case 'time':     return $v === null ? null : substr((string)$v, 0, 8);
    case 'ms':       return ms_valid($v);
    default:         return $v === null ? null : (string)$v;
  }
}
function json_enc($v) { return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); }

/* ==================== BACA STATE (dari MySQL) ====================
   Bentuk hasilnya PERSIS objek DB yang dipakai aplikasi, jadi frontend tinggal
   memakainya apa adanya. */
function baca_state() {
  $pdo = db();
  $out = array();

  foreach (collections() as $nama => $c) {
    $urut = isset($c['created']) ? 'created_at ASC, id ASC' : 'id ASC';
    $rows = array();
    foreach ($pdo->query('SELECT data FROM ' . $c['table'] . ' ORDER BY ' . $urut) as $row) {
      $r = json_decode($row['data'], true);
      if (is_array($r)) $rows[] = $r;
    }
    $out[$nama] = $rows;
  }

  // checkins: append-only, terbaru dulu (dibatasi supaya tak membengkak)
  $ci = array();
  foreach ($pdo->query('SELECT data FROM checkins ORDER BY checked_in_at DESC LIMIT 2000') as $row) {
    $r = json_decode($row['data'], true);
    if (is_array($r)) $ci[] = $r;
  }
  $out['checkins'] = $ci;

  // eventDetails: map event_id → detail
  $ed = array();
  foreach ($pdo->query('SELECT event_id, data FROM event_details') as $row) {
    $r = json_decode($row['data'], true);
    if (is_array($r)) $ed[$row['event_id']] = $r;
  }
  $out['eventDetails'] = $ed;

  // settings kecil
  $out['entertainmentRules'] = get_setting('entertainmentRules', array());
  $out['role']               = get_setting('role', 'Director');
  /* Pustaka template denah: satu denah yang sudah jadi bisa dipakai ulang oleh
     event berikutnya. Disimpan sebagai setting (bukan tabel sendiri) karena
     bentuknya memang satu dokumen JSON yang dibaca/ditulis utuh, dan jumlahnya
     hitungan lusinan — bukan ribuan baris yang perlu diindeks. */
  $out['layoutTemplates']    = get_setting('layoutTemplates', array());

  return $out;
}

function get_setting($k, $default) {
  $st = db()->prepare('SELECT v FROM settings WHERE k = :k LIMIT 1');
  $st->execute(array(':k' => $k));
  $row = $st->fetch();
  if (!$row) return $default;
  $v = json_decode($row['v'], true);
  return $v === null ? $default : $v;
}
function put_setting($pdo, $k, $v) {
  $st = $pdo->prepare('INSERT INTO settings (k, v) VALUES (:k, :v)
                       ON DUPLICATE KEY UPDATE v = VALUES(v)');
  $st->execute(array(':k' => $k, ':v' => json_enc($v)));
}

/* ==================== UPSERT SATU KOLEKSI ====================
   Menulis per-baris dengan penjaga updated_at, lalu menghapus baris yang
   HILANG dari kiriman. Mengembalikan jumlah baris yang diproses. */
function upsert_collection($pdo, $c, $rows) {
  $tabel = $c['table'];
  $cols  = $c['cols'];
  $adaCreated = !empty($c['created']);
  $createdField = isset($c['created_field']) ? $c['created_field'] : 'createdAt';

  // Susun daftar kolom: id, <kolom inti>, updated_at, [created_at], data
  $names = array_merge(array('id'), array_keys($cols), array('updated_at'));
  if ($adaCreated) $names[] = 'created_at';
  $names[] = 'data';

  $ph = array();
  foreach ($names as $n) $ph[] = ':' . $n;

  // Yang ditimpa saat duplikat: semua kecuali id & created_at (created_at
  // sengaja tidak pernah diubah — waktu lahir baris itu tetap).
  $upd = array();
  foreach (array_merge(array_keys($cols), array('data')) as $n) {
    $upd[] = $n . ' = IF(VALUES(updated_at) >= updated_at, VALUES(' . $n . '), ' . $n . ')';
  }
  $upd[] = 'updated_at = IF(VALUES(updated_at) >= updated_at, VALUES(updated_at), updated_at)';

  $sql = 'INSERT INTO ' . $tabel . ' (' . implode(',', $names) . ') VALUES (' . implode(',', $ph) . ')
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
    if ($adaCreated) $args[':created_at'] = ms_valid(isset($r[$createdField]) ? $r[$createdField] : 0);
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
     batas di bawah ini: kasir A membuka aplikasi (10 tiket termuat), kasir B
     menjual tiket ke-11, lalu kasir A menyimpan — kiriman A tidak memuat
     tiket ke-11, sehingga tiket yang sah itu IKUT TERHAPUS tanpa jejak.

     $batas = updated_at terbaru yang ADA di kiriman. Baris yang lebih baru
     dari itu mustahil diketahui pengirimnya, jadi tidak boleh dihapus
     olehnya. Baris lama yang memang sengaja dihapus tetap terhapus. */
  $place = implode(',', array_fill(0, count($ids), '?'));
  $sql   = 'DELETE FROM ' . $tabel . ' WHERE ' . $kolomId . ' NOT IN (' . $place . ')';
  $args  = $ids;
  if ($batas > 0) { $sql .= ' AND updated_at <= ?'; $args[] = $batas; }
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

    // ---- checkins: append-only, tidak pernah ditimpa/dihapus ----
    if (isset($state['checkins']) && is_array($state['checkins'])) {
      $ci = $pdo->prepare('INSERT IGNORE INTO checkins
              (id, ticket_id, checked_in_at, staff, gate, result, data)
              VALUES (:id,:ticket_id,:checked_in_at,:staff,:gate,:result,:data)');
      $n = 0;
      foreach ($state['checkins'] as $c2) {
        if (!is_array($c2) || empty($c2['id'])) continue;
        $ci->execute(array(
          ':id'            => (string)$c2['id'],
          ':ticket_id'     => ambil($c2, 'ticket_id', 'str'),
          ':checked_in_at' => ambil($c2, 'checked_in_at', 'datetime'),
          ':staff'         => ambil($c2, 'staff', 'str'),
          ':gate'          => ambil($c2, 'gate', 'str'),
          ':result'        => ambil($c2, 'result', 'str'),
          ':data'          => json_enc($c2),
        ));
        $n++;
      }
      $hitung['checkins'] = $n;
    }

    // ---- eventDetails: 1 baris per event ----
    if (isset($state['eventDetails']) && is_array($state['eventDetails'])) {
      $ed = $pdo->prepare('INSERT INTO event_details (event_id, updated_at, data)
              VALUES (:event_id,:updated_at,:data)
              ON DUPLICATE KEY UPDATE
                data       = IF(VALUES(updated_at) >= updated_at, VALUES(data),       data),
                updated_at = IF(VALUES(updated_at) >= updated_at, VALUES(updated_at), updated_at)');
      $ids = array();
      foreach ($state['eventDetails'] as $eid => $d) {
        if (!is_array($d)) continue;
        $ids[] = (string)$eid;
        $ed->execute(array(
          ':event_id'   => (string)$eid,
          ':updated_at' => ms_valid(isset($d['updatedAt']) ? $d['updatedAt'] : 0),
          ':data'       => json_enc($d),
        ));
      }
      hapus_yang_hilang($pdo, 'event_details', 'event_id', $ids);
      $hitung['eventDetails'] = count($ids);
    }

    // ---- settings kecil ----
    if (isset($state['entertainmentRules'])) put_setting($pdo, 'entertainmentRules', $state['entertainmentRules']);
    if (isset($state['role']))               put_setting($pdo, 'role', $state['role']);
    if (isset($state['layoutTemplates']))    put_setting($pdo, 'layoutTemplates', $state['layoutTemplates']);

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

/* ==================== EVENT SATU HARI (dibaca modul lain) ====================
   Pasangan dari events_hari() di marketing-mysql, dipakai Finance > Omset >
   Breakdown Sumber untuk memunculkan event internal hari itu secara otomatis.
   Sempit dengan sengaja — getAll memulangkan seluruh database event (talent,
   tiket, order, checkin), dan halaman Breakdown dibuka tiap hari.

   Yang TIDAK ikut hanya event yang belum jadi. Filternya ditulis sebagai
   daftar-yang-dibuang, bukan daftar-yang-diambil, justru karena status di
   tabel ini bercampur dua generasi: migrasi lima-status-jadi-tiga
   (Draft/Today/Finished/Confirmed/Ongoing -> Planning/Upcoming/Event Done)
   hidup di JavaScript dan baru tertulis ke DB saat event itu tersentuh
   simpan. Baris lama yang tidak pernah disentuh lagi MASIH berstatus 'Today'
   atau 'Finished' di kolom ini. Daftar-yang-diambil akan membuang event yang
   benar-benar terjadi, diam-diam, dan tidak ada layar yang melaporkannya.

   Nominal TIDAK dipulangkan: modul event tidak menyimpan nilai rupiah event
   (yang ada cuma penjualan tiket, itu pun tidak selalu). Kolom Nominal di
   Breakdown tetap diisi tangan; yang dihemat endpoint ini adalah nama event
   dan PIC-nya.

   SIAPA YANG MENGINPUT ikut dipulangkan (4 September 2026). Kolom `pic` di
   modul ini teks bebas, dan di produksi seluruhnya berisi jabatan "Event
   Manager" — jadi Breakdown Omset tidak punya satu pun nama orang yang bisa
   dicocokkan dengan roster Office, dan omset event tidak diakui untuk siapa
   pun. Jejaknya tidak punya kolom sendiri: ia field aplikasi, jadi tempatnya
   di dalam blob `data` (lihat collections()). */
function events_hari($tgl) {
  if (!tanggal_valid($tgl)) throw new Exception('tanggal tidak sah: ' . $tgl);
  $pdo = db();
  $st = $pdo->prepare(
    "SELECT id, title, status, venue, pic, start_datetime, data
       FROM events
      WHERE DATE(start_datetime) = :tgl
        AND status NOT IN ('Planning', 'Draft', 'Cancelled')
      ORDER BY start_datetime, title");
  $st->execute(array(':tgl' => $tgl));
  $out = array();
  foreach ($st->fetchAll() as $r) {
    /* Event yang lahir SEBELUM 4 September 2026 tidak punya createdBy, dan itu
       bukan galat — jejak siapa yang menginput memang belum pernah dicatat.
       Dipulangkan sebagai string kosong, bukan null: yang membacanya
       memperlakukannya sebagai "tidak ketemu" dan punya jalan mundurnya
       sendiri. Blob yang gagal di-decode diperlakukan sama, bukan dilempar —
       satu baris rusak tidak boleh menghapus seluruh daftar event hari itu
       dari layar Breakdown. */
    $d = json_decode((string)$r['data'], true);
    if (!is_array($d)) $d = array();
    $out[] = array(
      'id'          => $r['id'],
      'nama'        => $r['title'],
      'status'      => $r['status'],
      'venue'       => $r['venue'],
      'picName'     => $r['pic'],      // di modul ini PIC memang teks nama
      'inputOleh'   => isset($d['createdBy'])   ? (string)$d['createdBy']   : '',
      'inputOlehId' => isset($d['createdById']) ? (string)$d['createdById'] : '',
      'mulai'       => $r['start_datetime'],
    );
  }
  return array('events' => $out);
}

/* ==================== DIAGNOSTIK ==================== */
function stats() {
  $pdo = db();
  $out = array_merge(array('backend' => 'php-mysql'), identitas());
  $tabel = array('talents','events','event_details','schedules','recurring_rules',
                 'talent_payments','ticket_classes','seats','orders','tickets',
                 'checkins','refunds','ideas','calendar_extra');
  foreach ($tabel as $t) {
    $out[$t] = (int)$pdo->query('SELECT COUNT(*) c FROM ' . $t)->fetch()['c'];
  }
  $blob = strlen(json_enc(baca_state()));
  $out['blobChars'] = $blob;
  $out['blobMB']    = round($blob / 1048576, 3);
  $out['ts']        = gmdate('c');
  return $out;
}

/* ==================== BERKAS (foto & dokumen) ====================
   EMS menyimpan tiga macam berkas: bukti transfer talent, dokumen talent
   (KTP/NPWP/kontrak/portfolio), dan poster event.

   Berkasnya TIDAK ikut masuk ke JSON state. State EMS dikirim utuh setiap
   kali menyimpan, jadi menaruh gambar base64 di dalamnya berarti mengirim
   ulang seluruh gambar pada tiap ketukan simpan — beberapa MB per simpan,
   dan blob-nya membengkak tanpa batas. Yang disimpan di state cuma
   penunjuknya: {key,name,size,at}.

   Polanya disamakan dengan marketing-mysql: biner asli di disk (bukan
   base64), disajikan lewat ?action=file&key=... dengan Content-Type benar.
   Foldernya diusahakan DI LUAR web root supaya tidak bisa diambil orang
   yang menebak URL-nya — dokumen KTP tidak boleh terbuka begitu saja. */
function berkas_dir() {
  static $dir = null;
  if ($dir !== null) return $dir;
  if (defined('DATA_DIR') && DATA_DIR !== '') {
    if (!is_dir(DATA_DIR) && !@mkdir(DATA_DIR, 0775, true))
      throw new Exception('DATA_DIR tidak bisa dibuat: ' . DATA_DIR);
    $dir = realpath(DATA_DIR) ?: DATA_DIR;
  } else {
    $luar  = __DIR__ . '/../../../event-db';   // di luar public_html
    $dalam = __DIR__ . '/db';                  // terpaksa: ditutup .htaccess
    if (is_dir($luar) || @mkdir($luar, 0775, true))        $dir = $luar;
    else if (is_dir($dalam) || @mkdir($dalam, 0775, true)) $dir = $dalam;
    else throw new Exception('Tidak bisa membuat folder berkas. Cek izin tulis hosting.');
    $dir = realpath($dir) ?: $dir;
  }
  return $dir;
}
function berkas_files_dir()  { return berkas_dir() . '/files'; }
function berkas_di_web()     { return strpos(berkas_dir(), realpath(__DIR__)) === 0; }
function berkas_siapkan() {
  if (!is_dir(berkas_files_dir())) @mkdir(berkas_files_dir(), 0775, true);
  if (!berkas_di_web()) return;
  $ht = berkas_dir() . '/.htaccess';
  if (!file_exists($ht)) @file_put_contents($ht,
    "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n" .
    "<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n");
}
// Ekstensi aman dari mime/nama; hanya gambar & PDF yang diterima.
function berkas_ext($mime, $name) {
  $mime = strtolower((string)$mime);
  $peta = array('image/jpeg'=>'jpg','image/jpg'=>'jpg','image/png'=>'png',
                'image/webp'=>'webp','image/gif'=>'gif','application/pdf'=>'pdf');
  if (isset($peta[$mime])) return $peta[$mime];
  $e = strtolower(pathinfo((string)$name, PATHINFO_EXTENSION));
  return in_array($e, array('jpg','jpeg','png','webp','gif','pdf'), true) ? ($e==='jpeg'?'jpg':$e) : 'bin';
}
function berkas_ctype($ext) {
  $peta = array('jpg'=>'image/jpeg','png'=>'image/png','webp'=>'image/webp',
                'gif'=>'image/gif','pdf'=>'application/pdf');
  return isset($peta[$ext]) ? $peta[$ext] : 'application/octet-stream';
}
// key -> path aman (cegah path traversal). key buatan kita: ev_<acak>.<ext>
function berkas_path($key) {
  $safe = preg_replace('/[^A-Za-z0-9._-]/', '_', (string)$key);
  return berkas_files_dir() . '/' . $safe;
}
function simpan_berkas($payload) {
  if (!$payload || empty($payload['dataBase64'])) throw new Exception('file kosong');
  berkas_siapkan();
  $ext = berkas_ext(isset($payload['mimeType']) ? $payload['mimeType'] : '',
                    isset($payload['fileName']) ? $payload['fileName'] : '');
  if ($ext === 'bin') throw new Exception('hanya gambar (jpg/png/webp/gif) atau PDF');
  $bin = base64_decode(preg_replace('#^data:[^,]+,#', '', $payload['dataBase64']), true);
  if ($bin === false) throw new Exception('base64 tidak valid');
  if (strlen($bin) > 8 * 1024 * 1024) throw new Exception('file melebihi 8MB');
  $key = 'ev_' . bin2hex(random_bytes(8)) . '.' . $ext;
  if (file_put_contents(berkas_path($key), $bin) === false)
    throw new Exception('gagal menulis file (cek izin folder)');
  return array('key'  => $key,
               'name' => isset($payload['fileName']) ? (string)$payload['fileName'] : $key,
               'size' => strlen($bin),
               'at'   => gmdate('c'));
}
/* Sengaja TIDAK ada pembersih berkas yatim di sini. State EMS bisa dikirim
   sebagian, jadi penyapu otomatis berisiko menghapus berkas yang sebenarnya
   masih dipakai. Berkas yang tidak terpakai hanya memakan ruang — jauh lebih
   murah daripada kehilangan KTP atau bukti transfer. */
function sajikan_berkas($key) {
  $key = (string)$key;
  if ($key === '' || strpos($key, '..') !== false) { http_response_code(400); exit; }
  $p = berkas_path($key);
  if (!is_file($p)) { http_response_code(404); exit; }
  $ext = strtolower(pathinfo($p, PATHINFO_EXTENSION));
  header('Content-Type: ' . berkas_ctype($ext));
  header('Content-Length: ' . filesize($p));
  header('Content-Disposition: inline; filename="' . basename($p) . '"');
  header('Cache-Control: private, max-age=86400');
  readfile($p);
  exit;
}
