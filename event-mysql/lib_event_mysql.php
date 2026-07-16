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
  foreach ($rows as $r) {
    if (!is_array($r) || empty($r['id'])) continue;
    $id = (string)$r['id'];
    $ids[] = $id;

    $args = array(':id' => $id);
    foreach ($cols as $kolom => $def) $args[':' . $kolom] = ambil($r, $def[0], $def[1]);
    $args[':updated_at'] = ms_valid(isset($r['updatedAt']) ? $r['updatedAt'] : 0);
    if ($adaCreated) $args[':created_at'] = ms_valid(isset($r[$createdField]) ? $r[$createdField] : 0);
    $args[':data'] = json_enc($r);
    $st->execute($args);
  }

  hapus_yang_hilang($pdo, $tabel, 'id', $ids);
  return count($ids);
}

/* Hapus baris yang tidak ada di kiriman.
   JAGA-JAGA: kalau kiriman KOSONG tapi DB berisi, JANGAN hapus semua —
   lindungi dari state kosong yang tak sengaja (mis. aplikasi gagal load lalu
   menyimpan). Menghapus semua isi tabel harus lewat phpMyAdmin, bukan lewat
   satu request yang kebetulan kosong. */
function hapus_yang_hilang($pdo, $tabel, $kolomId, $ids) {
  if (count($ids) === 0) {
    $ada = (int)$pdo->query('SELECT COUNT(*) c FROM ' . $tabel)->fetch()['c'];
    return; // baik DB kosong maupun terisi: tidak menghapus apa pun
  }
  $place = implode(',', array_fill(0, count($ids), '?'));
  $del = $pdo->prepare('DELETE FROM ' . $tabel . ' WHERE ' . $kolomId . ' NOT IN (' . $place . ')');
  $del->execute($ids);
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

/* ==================== DIAGNOSTIK ==================== */
function stats() {
  $pdo = db();
  $out = array('backend' => 'php-mysql', 'db' => DB_NAME);
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
