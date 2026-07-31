<?php
/************************************************************************
 * LAKSAMANA MUDA TICKETING — logika situs customer
 * =====================================================================
 *
 * KENAPA ADA FOLDER API SENDIRI, PADAHAL DATABASENYA SAMA DENGAN EMS
 * ---------------------------------------------------------------------
 * EMS (event-api-mysql) hanya punya dua endpoint data: `getAll` dan
 * `saveAll`. Keduanya tidak boleh disentuh publik:
 *
 *   getAll  memulangkan SELURUH isi EMS — fee talent, pembayaran, catatan
 *           internal, data seluruh pembeli. Membukanya ke halaman customer
 *           sama dengan menerbitkan pembukuan perusahaan.
 *   saveAll menerima SELURUH state dan menimpanya. Siapa pun yang bisa
 *           memanggilnya bisa menghapus semua event, tiket, dan check-in
 *           dengan satu permintaan.
 *
 * Jadi situs customer memakai pintu sendiri: endpoint sempit, hanya
 * membaca yang memang boleh dilihat umum, dan hanya menulis baris yang
 * memang miliknya (orders, tickets, seat_holds, status kursi).
 *
 * HARGA SELALU DIHITUNG DI SINI, TIDAK PERNAH DITERIMA DARI BROWSER.
 * Total yang dikirim halaman customer hanya dipakai untuk ditampilkan;
 * yang ditagihkan ke Xendit adalah hasil hitungan server dari harga kelas
 * tiket di database. Tanpa aturan itu, mengubah satu angka di DevTools
 * cukup untuk membeli meja VIP seharga seribu rupiah.
 *
 * PENJAGA updated_at
 * ---------------------------------------------------------------------
 * Semua tulisan ke tabel milik bersama memakai penjaga yang sama dengan
 * EMS: baris hanya ditimpa kalau `updated_at` kiriman lebih baru. Itu yang
 * mencegah penyimpanan dari browser kru EMS — yang state-nya dimuat lima
 * menit lalu — mengembalikan kursi yang baru saja terjual jadi Available.
 ************************************************************************/

/* Berkas config mana yang MENANG dicatat, lalu dilaporkan di ?action=ping.
   Urutannya config.local.php > config.php > config.sample.php, dan yang
   pertama menang diam-diam. Kejadian 31 Juli 2026: sebuah baris di config.php
   diubah berkali-kali tanpa pengaruh apa pun, dan tidak ada satu pun cara
   dari luar untuk tahu bahwa yang dibaca server ternyata berkas lain. */
if (file_exists(__DIR__ . '/config.local.php'))      { require __DIR__ . '/config.local.php'; define('CONFIG_DIPAKAI', 'config.local.php'); }
else if (file_exists(__DIR__ . '/config.php'))       { require __DIR__ . '/config.php';       define('CONFIG_DIPAKAI', 'config.php'); }
else                                                 { require __DIR__ . '/config.sample.php'; define('CONFIG_DIPAKAI', 'config.sample.php (BELUM DIISI)'); }

define('LIB_VERSI', '2026-07-31a');

/* KENAPA identitas() IKUT MENCOBA MENYAMBUNG KE DATABASE

   Versi pertama hanya membacakan isi config apa adanya. Akibatnya ?action=ping
   membalas ok:true dengan nama database yang cantik, PADAHAL kredensialnya
   ditolak MySQL — dan itu justru satu-satunya hal yang ingin dibuktikan oleh
   ping. Sudah kejadian 31 Juli 2026 saat memasang di dev: nama database salah
   ketik (dev_db vs db_dev), ping tetap hijau, dan kesalahannya baru ketahuan
   setelah memanggil endpoint lain.

   Sekarang ping benar-benar bertanya ke database. Pesan galatnya dipendekkan —
   pesan PDO utuh memuat nama user & host, dan ini endpoint publik. */
function cek_db() {
  try {
    db()->query('SELECT 1');
    // Sekalian buktikan tabel milik bersama memang terlihat dari sini; nama
    // database yang benar tapi skema EMS belum ada sama saja tidak bisa dipakai.
    $t = db()->query("SHOW TABLES LIKE 'seats'")->fetch();
    $h = db()->query("SHOW TABLES LIKE 'seat_holds'")->fetch();
    return array('db_ok' => true, 'tabel_ems' => $t ? true : false, 'tabel_hold' => $h ? true : false);
  } catch (Throwable $e) {
    $p = $e->getCode() === '42000' || strpos($e->getMessage(), '1044') !== false
      ? 'akses ditolak / nama database salah'
      : 'tidak bisa menyambung';
    return array('db_ok' => false, 'db_error' => $p);
  }
}
function identitas() {
  return array_merge(cek_db(), array(
    'env'    => defined('ENV_LABEL') ? ENV_LABEL : '?',
    'db'     => DB_NAME,
    'versi'  => LIB_VERSI,
    // Mode Xendit dibaca dari awalan kuncinya sendiri, bukan dari tulisan
    // terpisah yang bisa lupa diubah saat kunci diganti.
    'xendit' => xendit_mode(),
    'simulasi_bayar' => mode_simulasi(),
    'config' => defined('CONFIG_DIPAKAI') ? CONFIG_DIPAKAI : '?',
  ));
}
function xendit_mode() {
  if (!defined('XENDIT_SECRET') || XENDIT_SECRET === '' || strpos(XENDIT_SECRET, 'ISI_') === 0) return 'belum diisi';
  if (strpos(XENDIT_SECRET, 'xnd_production') === 0) return 'LIVE';
  return 'test';
}

/* ==================== KONEKSI ==================== */
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
function now_ms() { return (int)round(microtime(true) * 1000); }
function uid($p = 'tx') { return $p . '_' . bin2hex(random_bytes(8)); }
function token_acak($n = 24) { return rtrim(strtr(base64_encode(random_bytes($n)), '+/', '-_'), '='); }

/* Kunci tulis MySQL — sama seperti EMS. Dipakai di jalur yang benar-benar
   berebut (menahan kursi, melunasi pesanan), bukan di jalur baca. */
function tx_lock() {
  $st = db()->prepare('SELECT GET_LOCK(:k, 10) AS ok');
  $st->execute(array(':k' => DB_NAME . ':tix'));
  $r = $st->fetch();
  if (empty($r['ok'])) throw new Exception('Server sedang sibuk, coba lagi sebentar.');
  return true;
}
function tx_unlock() { db()->prepare('SELECT RELEASE_LOCK(:k)')->execute(array(':k' => DB_NAME . ':tix')); }

/* Baris EMS = kolom inti + kolom `data` berisi JSON utuh, dan SUMBER
   KEBENARANNYA adalah `data`. Jadi selalu baca dari sana. */
function j($row) {
  $d = json_decode(isset($row['data']) ? $row['data'] : '{}', true);
  return is_array($d) ? $d : array();
}
function ambil($sql, $args = array()) {
  $st = db()->prepare($sql); $st->execute($args);
  $out = array();
  foreach ($st as $r) $out[] = j($r);
  return $out;
}

/* ==================== PEMBERSIH KUNCI KEDALUWARSA ====================
   Dijalankan di awal SETIAP permintaan yang menyentuh kursi. Tanpa ini,
   pembeli yang menutup tab meninggalkan kursi terkunci selamanya, dan
   denah perlahan penuh kursi kuning yang tak pernah dibayar. */
function sapu_hold() {
  db()->prepare('DELETE FROM seat_holds WHERE expires_at < :t AND (order_id IS NULL OR order_id = "")')
      ->execute(array(':t' => now_ms()));
}

/* ==================== EVENT ====================
   STATUS EVENT MENGIKUTI MESIN STATUS EMS YANG SEBENARNYA, yaitu daftar di
   cycleEventStatus() pada deploy/event/index.html:

       Draft → Upcoming → Today → Finished        (+ Cancelled)

   Versi pertama fungsi ini menyaring 'Published'/'Ongoing' — kosakata
   ticketing pada umumnya, yang TIDAK ADA di EMS. Akibatnya daftar event di
   situs customer selalu kosong dan tidak ada pesan galat apa pun yang
   menjelaskan kenapa: 6 event di database, nol yang lolos saringan.

   Yang boleh dijual ke umum:
     Upcoming  akan datang, tiket dibuka
     Today     hari-H, masih boleh beli di tempat
   Yang tidak:
     Draft     rencana yang belum tentu jadi; menjualnya berarti menagih uang
               untuk acara yang mungkin dibatalkan besok
     Finished  sudah lewat
     Cancelled batal */
function boleh_dijual($status) {
  return $status === 'Upcoming' || $status === 'Today';
}
function events_publik() {
  $rows = ambil('SELECT data FROM events ORDER BY start_datetime ASC');
  $out = array();
  foreach ($rows as $e) {
    if (!boleh_dijual(isset($e['status']) ? $e['status'] : '')) continue;
    $out[] = event_ringkas($e);
  }
  return $out;
}
/* Bidang yang dipulangkan disaring satu per satu — BUKAN "kirim semua lalu
   hapus yang rahasia". Daftar-izin tidak bocor saat EMS menambah field baru;
   daftar-larangan pasti bocor cepat atau lambat. */
function event_ringkas($e) {
  $eid = $e['id'];
  $kelas = kelas_event($eid);
  $harga = array();
  foreach ($kelas as $c) if ((int)$c['price'] > 0) $harga[] = (int)$c['price'];
  return array(
    'id'         => $eid,
    'title'      => isset($e['title']) ? $e['title'] : '',
    'category'   => isset($e['category']) ? $e['category'] : '',
    'start'      => isset($e['start_datetime']) ? $e['start_datetime'] : '',
    'end'        => isset($e['end_datetime']) ? $e['end_datetime'] : '',
    'venue'      => isset($e['venue']) ? $e['venue'] : 'Laksamana Muda',
    'poster'     => isset($e['poster']) ? $e['poster'] : '',
    'desc'       => isset($e['description']) ? $e['description'] : '',
    'capacity'   => (int)(isset($e['capacity']) ? $e['capacity'] : 0),
    'price_from' => $harga ? min($harga) : 0,
    'is_ticketed'=> !empty($e['is_ticketed']),
    'classes'    => array_map(function ($c) {
      return array('id' => $c['id'], 'name' => $c['name'], 'price' => (int)$c['price'],
                   'quota' => (int)$c['quota'], 'sold' => (int)$c['sold'],
                   'is_seated' => !empty($c['is_seated']),
                   'benefit' => isset($c['benefit']) ? $c['benefit'] : '',
                   'description' => isset($c['description']) ? $c['description'] : '');
    }, $kelas),
  );
}
function event_satu($id) {
  $rows = ambil('SELECT data FROM events WHERE id = :i', array(':i' => $id));
  if (!$rows) return null;
  $e = $rows[0];
  if (!boleh_dijual(isset($e['status']) ? $e['status'] : '')) return null;
  return event_ringkas($e);
}
function kelas_event($eid) {
  return ambil('SELECT data FROM ticket_classes WHERE event_id = :e', array(':e' => $eid));
}

/* ==================== DENAH ====================
   Objek denah dikirim APA ADANYA (x, y, w, h, bentuk, warna, lantai),
   supaya situs customer menggambar denah yang SAMA dengan yang dirancang
   kru di EMS — bukan tafsir ulang yang mirip. Satu denah, dua tampilan. */
function denah($eid, $holdToken = '') {
  sapu_hold();
  $seats = ambil('SELECT data FROM seats WHERE event_id = :e', array(':e' => $eid));
  $kelas = kelas_event($eid);
  $kelasById = array(); $kelasByNama = array();
  foreach ($kelas as $c) { $kelasById[$c['id']] = $c; $kelasByNama[$c['name']] = $c; }

  // Kursi yang sudah punya tiket hidup = terjual, apa pun isi seats.status.
  // Tiket adalah bukti transaksi; status kursi hanya cerminan yang bisa
  // tertinggal kalau ada penyimpanan EMS yang lewat.
  $terjual = array();
  $st = db()->prepare('SELECT seat_id, status FROM tickets WHERE seat_id IS NOT NULL');
  $st->execute();
  foreach ($st as $r) {
    if ($r['status'] === 'Cancelled') continue;
    $terjual[$r['seat_id']] = $r['status'] === 'Checked-In' ? 'checked' : 'sold';
  }
  $hold = array();
  $st = db()->prepare('SELECT seat_id, hold_token FROM seat_holds WHERE event_id = :e');
  $st->execute(array(':e' => $eid));
  foreach ($st as $r) $hold[$r['seat_id']] = $r['hold_token'];

  $out = array();
  foreach ($seats as $s) {
    $id   = $s['id'];
    $kind = isset($s['kind']) ? $s['kind'] : 'seat';
    $tier = isset($s['tier']) ? $s['tier'] : (isset($s['zone']) ? $s['zone'] : '');
    $c    = null;
    if (!empty($s['ticket_class_id']) && isset($kelasById[$s['ticket_class_id']])) $c = $kelasById[$s['ticket_class_id']];
    else if ($tier !== '' && isset($kelasByNama[$tier]))                            $c = $kelasByNama[$tier];

    $status = 'available';
    if ($kind === 'area')                          $status = 'area';   // dekorasi/zona, tidak dijual
    else if (isset($terjual[$id]))                 $status = $terjual[$id];
    else if (($s['status'] ?? '') === 'Sold')      $status = 'sold';
    else if (isset($hold[$id]))                    $status = ($holdToken !== '' && $hold[$id] === $holdToken) ? 'mine' : 'held';

    $out[] = array(
      'id'       => $id,
      'kind'     => $kind,
      'shape'    => isset($s['shape']) ? $s['shape'] : 'rect',
      'label'    => isset($s['table_no']) ? $s['table_no'] : (isset($s['seat_no']) ? $s['seat_no'] : ''),
      'tier'     => $tier,
      'zone'     => isset($s['zone']) ? $s['zone'] : '',
      'floor'    => (string)(isset($s['floor']) ? $s['floor'] : '1'),
      'capacity' => (int)(isset($s['capacity']) ? $s['capacity'] : 1),
      'x' => (float)($s['x'] ?? 0), 'y' => (float)($s['y'] ?? 0),
      'w' => (float)($s['w'] ?? 40), 'h' => (float)($s['h'] ?? 40),
      'warna'    => isset($s['warna']) ? $s['warna'] : '',
      'pola'     => isset($s['pola']) ? $s['pola'] : '',
      'status'   => $status,
      'price'    => $c ? (int)$c['price'] : 0,
      'class_id' => $c ? $c['id'] : '',
    );
  }
  return $out;
}

/* ==================== MENAHAN KURSI ====================
   Dibungkus kunci MySQL + UNIQUE(seat_id) di tabel seat_holds. Dua lapis,
   karena dua pembeli yang menekan kursi yang sama pada detik yang sama
   adalah kejadian normal saat tiket laris — bukan kasus langka. */
function tahan_kursi($eid, $seatIds, $holdToken) {
  sapu_hold();
  if (!$holdToken) $holdToken = token_acak(12);
  $exp = now_ms() + (defined('HOLD_MINUTES') ? HOLD_MINUTES : 10) * 60000;
  $peta = array(); foreach (denah($eid, $holdToken) as $s) $peta[$s['id']] = $s;

  $ok = array(); $tolak = array();
  tx_lock();
  try {
    $ins = db()->prepare('INSERT INTO seat_holds (id,event_id,seat_id,hold_token,expires_at,created_at)
                          VALUES (:i,:e,:s,:t,:x,:c)
                          ON DUPLICATE KEY UPDATE
                            hold_token = IF(hold_token = VALUES(hold_token), hold_token, hold_token),
                            expires_at = IF(hold_token = VALUES(hold_token), VALUES(expires_at), expires_at)');
    foreach ($seatIds as $sid) {
      $s = isset($peta[$sid]) ? $peta[$sid] : null;
      if (!$s)                            { $tolak[] = array($sid, 'tidak ada di denah'); continue; }
      if ($s['status'] === 'area')        { $tolak[] = array($sid, 'bukan kursi yang dijual'); continue; }
      if ($s['status'] === 'sold' || $s['status'] === 'checked') { $tolak[] = array($sid, 'sudah terjual'); continue; }
      if ($s['status'] === 'held')        { $tolak[] = array($sid, 'sedang dipilih orang lain'); continue; }
      if ($s['price'] <= 0)               { $tolak[] = array($sid, 'belum punya harga'); continue; }
      $ins->execute(array(':i' => uid('hold'), ':e' => $eid, ':s' => $sid,
                          ':t' => $holdToken, ':x' => $exp, ':c' => now_ms()));
      // Pastikan yang memegang memang kita — ON DUPLICATE di atas sengaja
      // TIDAK merebut kunci milik orang lain, jadi baris bisa saja tetap
      // milik pembeli lain dan itu harus dilaporkan sebagai gagal.
      $cek = db()->prepare('SELECT hold_token FROM seat_holds WHERE seat_id = :s');
      $cek->execute(array(':s' => $sid));
      $row = $cek->fetch();
      if ($row && $row['hold_token'] === $holdToken) $ok[] = $sid;
      else $tolak[] = array($sid, 'sedang dipilih orang lain');
    }
  } finally { tx_unlock(); }

  return array('hold_token' => $holdToken, 'expires_at' => $exp,
               'held' => $ok, 'ditolak' => $tolak);
}
function lepas_kursi($holdToken, $seatIds = null) {
  if (!$holdToken) return array('released' => 0);
  if (is_array($seatIds) && $seatIds) {
    $in = implode(',', array_fill(0, count($seatIds), '?'));
    $st = db()->prepare("DELETE FROM seat_holds WHERE hold_token = ? AND order_id IS NULL AND seat_id IN ($in)");
    $st->execute(array_merge(array($holdToken), $seatIds));
  } else {
    $st = db()->prepare('DELETE FROM seat_holds WHERE hold_token = :t AND order_id IS NULL');
    $st->execute(array(':t' => $holdToken));
  }
  return array('released' => $st->rowCount());
}

/* ==================== CHECKOUT ====================
   Menyusun pesanan (Pending) lalu meminta invoice ke Xendit.
   Kursi TIDAK ditandai Sold di sini — hanya kalau uangnya benar-benar
   masuk (lihat lunaskan()). Menandai terjual saat orang baru berniat
   membayar akan mengosongkan denah dengan pesanan yang tak pernah dibayar. */
function checkout($b) {
  $eid   = isset($b['event_id']) ? $b['event_id'] : '';
  $tok   = isset($b['hold_token']) ? $b['hold_token'] : '';
  $nama  = trim(isset($b['name']) ? $b['name'] : '');
  $email = trim(isset($b['email']) ? $b['email'] : '');
  $hp    = trim(isset($b['phone']) ? $b['phone'] : '');
  if ($nama === '' || $email === '' || $hp === '') throw new Exception('Nama, email, dan nomor HP wajib diisi.');
  if (!filter_var($email, FILTER_VALIDATE_EMAIL))  throw new Exception('Format email tidak valid.');
  $ev = event_satu($eid);
  if (!$ev) throw new Exception('Event tidak ditemukan atau belum dibuka untuk umum.');

  sapu_hold();
  // Kursi yang dibayar = kursi yang MASIH dipegang token ini di database.
  // Bukan daftar dari browser: daftar dari browser bisa memuat kursi yang
  // kuncinya sudah kedaluwarsa atau tidak pernah ada.
  $st = db()->prepare('SELECT seat_id FROM seat_holds WHERE hold_token = :t AND event_id = :e AND expires_at > :n');
  $st->execute(array(':t' => $tok, ':e' => $eid, ':n' => now_ms()));
  $seatIds = array(); foreach ($st as $r) $seatIds[] = $r['seat_id'];
  if (!$seatIds) throw new Exception('Kursi tidak lagi ditahan — waktunya habis. Silakan pilih ulang di denah.');

  $peta = array(); foreach (denah($eid, $tok) as $s) $peta[$s['id']] = $s;
  $items = array(); $subtotal = 0;
  foreach ($seatIds as $sid) {
    $s = isset($peta[$sid]) ? $peta[$sid] : null;
    if (!$s || $s['price'] <= 0) throw new Exception('Ada kursi yang harganya belum ditetapkan. Hubungi admin.');
    if ($s['status'] === 'sold' || $s['status'] === 'checked') throw new Exception('Kursi ' . $s['label'] . ' keburu terjual. Silakan pilih ulang.');
    $items[] = array('seat_id' => $sid, 'label' => $s['label'], 'tier' => $s['tier'],
                     'class_id' => $s['class_id'], 'capacity' => $s['capacity'], 'price' => $s['price']);
    $subtotal += $s['price'];
  }
  $fee   = (defined('ADMIN_FEE') ? ADMIN_FEE : 0) * count($items);
  $total = $subtotal + $fee;

  $oid    = uid('ord');
  $ref    = 'LM' . strtoupper(bin2hex(random_bytes(4)));
  $akses  = token_acak(18);   // kunci pribadi untuk membuka e-ticket tanpa login
  $order  = array(
    'id' => $oid, 'event_id' => $eid, 'buyer_name' => $nama, 'phone' => $hp, 'email' => $email,
    'birthdate' => '', 'notes' => isset($b['notes']) ? $b['notes'] : '',
    'subtotal' => $subtotal, 'fee' => $fee, 'total' => $total,
    'payment_status' => 'Pending', 'payment_ref' => $ref,
    // Jejak asal — supaya di EMS jelas mana yang dari kasir dan mana yang
    // dibeli sendiri oleh customer lewat web.
    'recorded_by' => 'Website', 'recorded_via' => 'ticketing-web',
    'channel' => 'online', 'items' => $items, 'access_token' => $akses,
    'expires_at' => gmdate('c', (int)(now_ms() / 1000) + 3600),
    'created' => gmdate('c'),
  );
  simpan_order($order);
  // Kunci kursinya diikat ke pesanan: mulai sekarang ia tidak lagi ikut
  // tersapu oleh sapu_hold(), karena orangnya sedang di halaman pembayaran.
  $in = implode(',', array_fill(0, count($seatIds), '?'));
  db()->prepare("UPDATE seat_holds SET order_id = ?, expires_at = ? WHERE seat_id IN ($in)")
      ->execute(array_merge(array($oid, now_ms() + 3600000), $seatIds));

  $inv = xendit_invoice($order, $ev);
  $order['payment'] = $inv;
  simpan_order($order);
  return array('order_id' => $oid, 'ref' => $ref, 'access_token' => $akses,
               'total' => $total, 'invoice_url' => isset($inv['invoice_url']) ? $inv['invoice_url'] : '');
}

function simpan_order($o) {
  $st = db()->prepare('INSERT INTO orders (id,event_id,buyer_name,phone,email,total,payment_status,payment_ref,updated_at,created_at,data)
    VALUES (:i,:e,:b,:p,:m,:t,:s,:r,:u,:c,:d)
    ON DUPLICATE KEY UPDATE buyer_name=VALUES(buyer_name), phone=VALUES(phone), email=VALUES(email),
      total=VALUES(total), payment_status=VALUES(payment_status), payment_ref=VALUES(payment_ref),
      updated_at=VALUES(updated_at), data=VALUES(data)');
  $st->execute(array(':i' => $o['id'], ':e' => $o['event_id'], ':b' => $o['buyer_name'], ':p' => $o['phone'],
    ':m' => $o['email'], ':t' => $o['total'], ':s' => $o['payment_status'], ':r' => $o['payment_ref'],
    ':u' => now_ms(), ':c' => now_ms(), ':d' => json_encode($o, JSON_UNESCAPED_UNICODE)));
}

/* ==================== XENDIT ==================== */
/* ---- MODE SIMULASI ----
   Supaya seluruh alur (denah → pilih → checkout → tiket → scan) bisa dicoba
   di dev SEBELUM kunci Xendit ada. Halaman bayarnya diganti halaman
   konfirmasi milik kita sendiri.

   PENJAGANYA SENGAJA BERLAPIS DAN GALAK: mode ini menerbitkan tiket tanpa
   uang masuk. Kalau sampai hidup di produksi, siapa pun bisa mencetak tiket
   gratis sebanyak yang ia mau. Karena itu ia menolak jalan ketika
   ENV_LABEL='produksi', apa pun isi config-nya — bukan sekadar "jangan lupa
   dimatikan". */
function mode_simulasi() {
  if (!defined('XENDIT_MOCK') || !XENDIT_MOCK) return false;
  if (defined('ENV_LABEL') && ENV_LABEL === 'produksi') return false;
  return true;
}
function xendit_invoice($o, $ev) {
  if (mode_simulasi()) {
    return array('gateway' => 'simulasi', 'invoice_id' => 'SIM-' . $o['payment_ref'],
      'invoice_url' => SITE_URL . '/#simbayar/' . $o['payment_ref'] . '/' . $o['access_token'],
      'expiry_date' => '', 'status' => 'PENDING', 'simulasi' => true);
  }
  if (xendit_mode() === 'belum diisi') throw new Exception('Pembayaran belum dikonfigurasi di server (XENDIT_SECRET kosong).');
  $body = array(
    // external_id inilah yang dipulangkan webhook. Dipakai id pesanan kita
    // supaya pencocokannya tidak bergantung pada apa pun yang bisa berubah.
    'external_id'           => $o['id'],
    'amount'                => $o['total'],
    'payer_email'           => $o['email'],
    'description'           => $ev['title'] . ' — ' . count($o['items']) . ' tiket',
    'invoice_duration'      => 3600,
    'success_redirect_url'  => SITE_URL . '/#tiket/' . $o['payment_ref'] . '/' . $o['access_token'],
    'failure_redirect_url'  => SITE_URL . '/#gagal/' . $o['payment_ref'],
    'customer'              => array('given_names' => $o['buyer_name'], 'email' => $o['email'], 'mobile_number' => $o['phone']),
    'items'                 => array_map(function ($it) use ($ev) {
      return array('name' => $ev['title'] . ' · ' . $it['label'], 'quantity' => 1, 'price' => $it['price'], 'category' => $it['tier']);
    }, $o['items']),
    'fees'                  => $o['fee'] > 0 ? array(array('type' => 'Biaya Admin', 'value' => $o['fee'])) : array(),
  );
  $ch = curl_init('https://api.xendit.co/v2/invoices');
  curl_setopt_array($ch, array(
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_USERPWD        => XENDIT_SECRET . ':',
    CURLOPT_HTTPHEADER     => array('Content-Type: application/json'),
    CURLOPT_POSTFIELDS     => json_encode($body, JSON_UNESCAPED_UNICODE),
    CURLOPT_TIMEOUT        => 30,
  ));
  $res  = curl_exec($ch);
  $err  = curl_error($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  if ($res === false) throw new Exception('Gagal menghubungi Xendit: ' . $err);
  $d = json_decode($res, true);
  if ($code >= 300 || !isset($d['invoice_url'])) {
    throw new Exception('Xendit menolak: ' . (isset($d['message']) ? $d['message'] : substr((string)$res, 0, 200)));
  }
  return array('gateway' => 'xendit', 'invoice_id' => $d['id'], 'invoice_url' => $d['invoice_url'],
               'expiry_date' => isset($d['expiry_date']) ? $d['expiry_date'] : '', 'status' => 'PENDING');
}

/* Webhook Xendit — SATU-SATUNYA jalan sebuah pesanan menjadi Paid.
   Tombol "saya sudah bayar" di halaman customer sengaja tidak ada: yang
   menentukan lunas adalah uang yang masuk, bukan pengakuan pembeli. */
function webhook_xendit($body, $headerToken) {
  if (!defined('XENDIT_CALLBACK') || XENDIT_CALLBACK === '' || strpos(XENDIT_CALLBACK, 'ISI_') === 0)
    throw new Exception('XENDIT_CALLBACK belum diisi — webhook ditolak demi keamanan.');
  if (!hash_equals(XENDIT_CALLBACK, (string)$headerToken))
    throw new Exception('Token callback salah.');

  $oid    = isset($body['external_id']) ? $body['external_id'] : '';
  $status = strtoupper(isset($body['status']) ? $body['status'] : '');
  if ($oid === '') throw new Exception('external_id kosong.');

  if ($status === 'PAID' || $status === 'SETTLED') return lunaskan($oid, $body);
  if ($status === 'EXPIRED' || $status === 'FAILED') return batalkan($oid, $status);
  return array('diabaikan' => $status);
}

/* Melunasi pesanan: menerbitkan tiket + QR, menandai kursi terjual.
   IDEMPOTEN — Xendit boleh mengirim webhook yang sama berkali-kali (dan
   memang melakukannya kalau balasan kita lambat). Tanpa penjaga ini, satu
   pesanan bisa melahirkan dua set tiket dengan QR berbeda, dan tamu yang
   membawa QR lama ditolak di pintu. */
function lunaskan($oid, $body = array()) {
  tx_lock();
  try {
    $rows = ambil('SELECT data FROM orders WHERE id = :i', array(':i' => $oid));
    if (!$rows) throw new Exception('Pesanan tidak ditemukan: ' . $oid);
    $o = $rows[0];
    if ($o['payment_status'] === 'Paid') return array('sudah' => true, 'order_id' => $oid);

    $o['payment_status'] = 'Paid';
    $o['paid_at']        = gmdate('c');
    $o['payment']        = array_merge(isset($o['payment']) ? $o['payment'] : array(), array(
      'status'         => 'PAID',
      'payment_method' => isset($body['payment_method']) ? $body['payment_method'] : '',
      'channel'        => isset($body['payment_channel']) ? $body['payment_channel'] : '',
      'paid_amount'    => isset($body['paid_amount']) ? (int)$body['paid_amount'] : $o['total'],
    ));

    $tiket = array();
    $no = (int)db()->query('SELECT COUNT(*) c FROM tickets')->fetch()['c'];
    $insT = db()->prepare('INSERT INTO tickets (id,order_item_id,ticket_class_id,seat_id,ticket_number,qr_token,status,updated_at,data)
      VALUES (:i,:o,:c,:s,:n,:q,:st,:u,:d)');
    /* Status kursi ditulis di PHP, bukan dengan JSON_SET: fungsi itu baru ada
       di MySQL 5.7 dan akan MELEMPAR di server yang masih 5.6 — tepat pada
       langkah paling tidak boleh gagal, yaitu saat uang sudah masuk tapi
       tiketnya belum terbit. */
    $updS = function ($seatId) {
      $rows = ambil('SELECT data FROM seats WHERE id = :i', array(':i' => $seatId));
      if (!$rows) return;
      $s = $rows[0]; $s['status'] = 'Sold';
      db()->prepare('UPDATE seats SET status = "Sold", updated_at = :u, data = :d WHERE id = :i')
          ->execute(array(':u' => now_ms(), ':d' => json_encode($s, JSON_UNESCAPED_UNICODE), ':i' => $seatId));
    };
    foreach ($o['items'] as $idx => $it) {
      $tk = array(
        'id' => uid('tk'), 'order_item_id' => $oid, 'ticket_class_id' => $it['class_id'],
        'seat_id' => $it['seat_id'],
        'ticket_number' => 'LM-' . (1000 + $no + $idx),
        // Token QR: acak penuh, bukan turunan id pesanan. Nomor urut atau
        // id yang bisa ditebak berarti QR palsu bisa dibuat dari rumah.
        'qr_token' => 'QR' . token_acak(20),
        'status' => 'Valid', 'pdf_url' => '', 'seat_label' => $it['label'], 'tier' => $it['tier'],
        'buyer_name' => $o['buyer_name'], 'issued_at' => gmdate('c'),
      );
      $insT->execute(array(':i' => $tk['id'], ':o' => $oid, ':c' => $tk['ticket_class_id'], ':s' => $tk['seat_id'],
        ':n' => $tk['ticket_number'], ':q' => $tk['qr_token'], ':st' => 'Valid', ':u' => now_ms(),
        ':d' => json_encode($tk, JSON_UNESCAPED_UNICODE)));
      if ($tk['seat_id']) $updS($tk['seat_id']);
      $tiket[] = $tk;
    }
    // Kuota kelas tiket ikut naik, supaya angka "sisa" di EMS benar.
    naikkan_sold($o['items']);
    simpan_order($o);
    // Kunci kursi dilepas: perannya sudah digantikan tiket + status Sold.
    db()->prepare('DELETE FROM seat_holds WHERE order_id = :o')->execute(array(':o' => $oid));
    return array('order_id' => $oid, 'tiket' => count($tiket));
  } finally { tx_unlock(); }
}
function naikkan_sold($items) {
  $hit = array();
  foreach ($items as $it) if ($it['class_id']) $hit[$it['class_id']] = (isset($hit[$it['class_id']]) ? $hit[$it['class_id']] : 0) + 1;
  foreach ($hit as $cid => $n) {
    $rows = ambil('SELECT data FROM ticket_classes WHERE id = :i', array(':i' => $cid));
    if (!$rows) continue;
    $c = $rows[0]; $c['sold'] = (int)$c['sold'] + $n;
    db()->prepare('UPDATE ticket_classes SET sold = :s, updated_at = :u, data = :d WHERE id = :i')
        ->execute(array(':s' => $c['sold'], ':u' => now_ms(), ':d' => json_encode($c, JSON_UNESCAPED_UNICODE), ':i' => $cid));
  }
}
function batalkan($oid, $sebab) {
  $rows = ambil('SELECT data FROM orders WHERE id = :i', array(':i' => $oid));
  if (!$rows) return array('order_id' => $oid, 'tidak_ada' => true);
  $o = $rows[0];
  if ($o['payment_status'] === 'Paid') return array('order_id' => $oid, 'sudah_lunas' => true);
  $o['payment_status'] = ($sebab === 'EXPIRED') ? 'Expired' : 'Failed';
  simpan_order($o);
  db()->prepare('DELETE FROM seat_holds WHERE order_id = :o')->execute(array(':o' => $oid));
  return array('order_id' => $oid, 'status' => $o['payment_status']);
}

/* Pelunasan versi simulasi. Tetap lewat lunaskan() yang sama dengan jalur
   Xendit — jadi yang diuji di dev benar-benar jalur produksinya, bukan jalur
   kembar yang bisa diam-diam berbeda perilakunya. */
function simulasi_bayar($ref, $akses) {
  if (!mode_simulasi()) throw new Exception('Mode simulasi tidak aktif di server ini.');
  $rows = ambil('SELECT data FROM orders WHERE payment_ref = :r', array(':r' => $ref));
  if (!$rows) throw new Exception('Pesanan tidak ditemukan.');
  $o = $rows[0];
  if (!isset($o['access_token']) || !hash_equals((string)$o['access_token'], (string)$akses))
    throw new Exception('Tautan tidak sah.');
  return lunaskan($o['id'], array('payment_method' => 'SIMULASI', 'paid_amount' => $o['total']));
}

/* ==================== STATUS PESANAN & E-TICKET ====================
   Dibuka dengan ref + access_token, bukan dengan email saja. Email mudah
   ditebak; kalau itu kuncinya, siapa pun bisa memanggil QR tiket orang
   lain dan masuk lebih dulu. */
function status_pesanan($ref, $akses) {
  $rows = ambil('SELECT data FROM orders WHERE payment_ref = :r', array(':r' => $ref));
  if (!$rows) throw new Exception('Pesanan tidak ditemukan.');
  $o = $rows[0];
  if (!isset($o['access_token']) || !hash_equals((string)$o['access_token'], (string)$akses))
    throw new Exception('Tautan tiket tidak sah.');
  $ev = event_satu($o['event_id']);
  $tiket = array();
  if ($o['payment_status'] === 'Paid') {
    foreach (ambil('SELECT data FROM tickets WHERE order_item_id = :o', array(':o' => $o['id'])) as $t) {
      $tiket[] = array('ticket_number' => $t['ticket_number'], 'qr_token' => $t['qr_token'],
                       'seat_label' => isset($t['seat_label']) ? $t['seat_label'] : '',
                       'tier' => isset($t['tier']) ? $t['tier'] : '', 'status' => $t['status']);
    }
  }
  return array(
    'ref' => $ref, 'status' => $o['payment_status'], 'total' => (int)$o['total'],
    'buyer' => $o['buyer_name'], 'email' => $o['email'],
    'invoice_url' => isset($o['payment']['invoice_url']) ? $o['payment']['invoice_url'] : '',
    'event' => $ev ? array('title' => $ev['title'], 'start' => $ev['start'], 'venue' => $ev['venue']) : null,
    'items' => $o['items'], 'tickets' => $tiket,
  );
}
