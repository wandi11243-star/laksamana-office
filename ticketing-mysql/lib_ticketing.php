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
else if (file_exists(__DIR__ . '/config.sample.php')){ require __DIR__ . '/config.sample.php'; define('CONFIG_DIPAKAI', 'config.sample.php (BELUM DIISI)'); }
else {
  /* TIDAK ADA SATU PUN BERKAS CONFIG.
     Dulu baris ini `require` berkas contoh tanpa memeriksa — dan berkas
     contoh pun sengaja tidak pernah ikut deploy (pola config*.php). Jadi di
     server yang belum dipasang config-nya, PHP mati sebelum mencetak apa pun:
     HTTP 500 dengan badan KOSONG, tanpa satu pun petunjuk apa yang kurang.
     Sudah memakan waktu saat memasang produksi 31 Juli 2026.
     Sekarang gagalnya menjelaskan diri sendiri. */
  header('Content-Type: application/json; charset=utf-8');
  http_response_code(503);
  echo json_encode(array('ok' => false, 'error' =>
    'config.php belum ada di folder ini. Salin dari ticketing-mysql/config.sample.php di repo, '
    . 'isi kredensial database (samakan dengan event-api-mysql) + kunci Xendit, '
    . 'lalu simpan sebagai config.php di folder yang sama dengan api.php.',
    'folder' => basename(__DIR__)), JSON_UNESCAPED_UNICODE);
  exit;
}

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
/* ENV DISIMPULKAN DARI ALAMAT SERVER, BUKAN DARI CONFIG.

   ENV_LABEL harus diketik tangan di tiap server, dan itu terbukti jadi sumber
   kesalahan yang paling sering: berkasnya benar, databasenya benar, tapi satu
   baris tertinggal 'produksi' di server dev — dan akibatnya seluruh mode uji
   coba menolak menyala tanpa penjelasan yang terlihat.

   Nama host tidak bisa salah ketik: dev.laksamanamuda.id memang dev, dan
   laksamanamuda.id memang produksi. Yang PALING PENTING, arah amannya benar:
   host yang tidak dikenali dianggap PRODUKSI, jadi kesalahan konfigurasi
   menutup mode simulasi, bukan membukanya.

   ENV_LABEL tetap dibaca dan dilaporkan terpisah supaya ketidakcocokan antara
   config dan kenyataan tetap terlihat di ?action=ping. */
/* Alamat situs disimpulkan dari host yang sedang melayani permintaan.
   SITE_URL di config harus diketik tangan per server, dan kesalahannya tidak
   terlihat sampai SESUDAH orang membayar: pembeli di dev dilempar ke
   laksamanamuda.id yang belum ada isinya, tiketnya seolah hilang, padahal
   uangnya sudah masuk. Host yang melayani permintaan pasti benar. */
function site_url() {
  $h = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '';
  if ($h === '') return defined('SITE_URL') ? SITE_URL : '';
  $skema = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
  return $skema . '://' . $h . '/ticketing';
}
function env_nyata() {
  $h = strtolower(isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '');
  if ($h === '') return defined('ENV_LABEL') ? ENV_LABEL : '?';   // dipanggil dari CLI
  if (strpos($h, 'dev.') === 0 || strpos($h, 'localhost') !== false || strpos($h, '127.0.0.1') !== false) return 'dev';
  return 'produksi';
}
function identitas() {
  return array_merge(cek_db(), array(
    'env'        => env_nyata(),
    'env_config' => defined('ENV_LABEL') ? ENV_LABEL : '?',
    /* Nama database TIDAK lagi disebut di endpoint publik: ia setengah dari
       pasangan yang dibutuhkan penyerang, dan tidak menolong siapa pun yang
       memang berhak — yang berhak bisa membacanya di config. Yang dilaporkan
       cukup "tersambung atau tidak". */
    'penahan_percobaan' => penahan_aktif() ? 'aktif' : 'TIDAK AKTIF (tabel tix_gagal belum dibuat)',
    'versi'  => LIB_VERSI,
    // Mode Xendit dibaca dari awalan kuncinya sendiri, bukan dari tulisan
    // terpisah yang bisa lupa diubah saat kunci diganti.
    'xendit' => xendit_mode(),
    'simulasi_bayar' => mode_simulasi(),
    'config' => defined('CONFIG_DIPAKAI') ? CONFIG_DIPAKAI : '?',
    /* POSTER: dari mana gambarnya diambil.
       Poster pernah gagal tampil dua kali berturut-turut karena letak folder
       berkas EMS berbeda antara dev dan produksi, dan dari luar kegagalannya
       terlihat sama saja: kotak kosong. Sekarang ping menjawabnya langsung —
       'berkas' kalau ketemu di disk (beserta foldernya), 'alihkan' kalau
       browser diarahkan ke API EMS, atau 'tidak ada jalan' kalau dua-duanya
       gagal. Satu buka halaman, bukan satu putaran tebak-tebakan. */
    'poster' => (($d = event_files_dir()) !== '')
      ? array('cara' => 'berkas', 'folder' => $d)
      : (($u = poster_url_ems('CONTOH.jpg')) !== ''
          ? array('cara' => 'alihkan', 'ke' => $u)
          : array('cara' => 'tidak ada jalan')),
  ));
}
/* Tiga sebab "belum diisi" DIBEDAKAN, karena penanganannya berbeda dan dari
   luar ketiganya terlihat sama persis:
     tidak ada  -> barisnya belum ditulis sama sekali
     placeholder-> baris contoh masih menang. Di PHP define() yang PERTAMA
                   menang; baris baru yang ditempel di BAWAH baris lama
                   diabaikan tanpa pesan apa pun. Ini penyebab tersering.
     kosong     -> barisnya ada tapi nilainya ''
   Yang dilaporkan hanya sebabnya, tidak pernah isi kuncinya. */
function xendit_mode() {
  if (!defined('XENDIT_SECRET'))              return 'belum diisi (baris XENDIT_SECRET tidak ada)';
  if (strpos(XENDIT_SECRET, 'ISI_') === 0)    return 'belum diisi (masih teks contoh — ada define ganda?)';
  if (XENDIT_SECRET === '')                   return 'belum diisi (kosong)';
  if (strpos(XENDIT_SECRET, 'xnd_production') === 0) return 'LIVE';
  if (strpos(XENDIT_SECRET, 'xnd_development') === 0) return 'test';
  return 'terisi, tapi awalannya bukan xnd_development/xnd_production';
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
  /* Pesanan yang lewat batas bayarnya ikut ditutup di sini — lihat catatan di
     sapu_pesanan_kedaluwarsa(). Urutannya sesudah baris di atas: kunci milik
     pesanan baru boleh dilepas setelah pesanannya resmi Expired. */
  sapu_pesanan_kedaluwarsa();
}

/* ==================== BATAS WAKTU MEMBAYAR ====================
   Dulu pesanan diberi waktu SATU JAM sementara kursinya ditahan sejak awal —
   dan itu menghasilkan keadaan yang membingungkan: kursi sudah dilepas, tapi
   halaman pembayarannya masih hidup dan masih bisa dibayar. Kalau benar-benar
   dibayar, uangnya masuk untuk kursi yang barangkali sudah jadi milik orang
   lain.

   Sekarang satu angka mengatur ketiganya: masa tahan kursi, umur invoice
   Xendit, dan umur pesanan. Habis waktunya berarti habis semuanya sekaligus. */
function menit_bayar() {
  $m = defined('BAYAR_MENIT') ? (int)BAYAR_MENIT : 10;
  return max(3, min(60, $m));   // di bawah 3 menit tidak manusiawi, di atas 60 tidak ada gunanya
}

/* Pesanan yang lewat batas waktunya ditutup, dan kursinya dikembalikan.
   Dipanggil dari sapu_hold() — jalur yang sudah dilewati hampir semua
   permintaan — jadi tidak butuh cron sama sekali. Dibatasi 50 baris supaya
   satu permintaan tidak berubah jadi pekerjaan pembersihan raksasa. */
function sapu_pesanan_kedaluwarsa() {
  try {
    $st = db()->query("SELECT id, data FROM orders WHERE payment_status = 'Pending' ORDER BY created_at DESC LIMIT 50");
    $now = time();
    foreach ($st as $row) {
      $o = json_decode($row['data'], true);
      if (!is_array($o) || empty($o['expires_at'])) continue;
      if (strtotime($o['expires_at']) >= $now) continue;
      batalkan($row['id'], 'EXPIRED');   // menandai Expired + melepas kunci kursinya
    }
  } catch (Throwable $e) { /* pembersihan tidak boleh menggagalkan permintaan aslinya */ }
}

/* ==================== MEMERIKSA PEMBAYARAN TANPA DIMINTA ====================
   Webhook Xendit adalah jalur utama, tapi ia bisa tidak pernah sampai: URL
   salah didaftarkan, server sempat mati, jaringan putus. Sebelumnya jaring
   pengamannya hanya bekerja kalau PEMBELI membuka halaman tiketnya — jadi
   pesanan yang sudah dibayar tetap tertulis "menunggu pembayaran" sampai
   orangnya sendiri mengecek, dan kursinya ikut menggantung.

   Sekarang tiap permintaan biasa (membuka daftar event, membuka denah, membuka
   Tiket Saya) sekalian menanyakan beberapa pesanan yang masih menggantung ke
   Xendit. Tanpa cron, tanpa pekerjaan latar — cukup menumpang lalu lintas yang
   memang sudah ada.

   Dua penjaga supaya ini tidak berubah jadi beban: tiap pesanan hanya
   ditanyakan sekali per menit (_cek_at), dan sekali jalan paling banyak
   beberapa pesanan. */
function sapu_pending_xendit($maks = 3) {
  if (strpos(xendit_mode(), 'belum diisi') === 0) return 0;   // kunci belum dipasang
  $n = 0;
  try {
    $st = db()->query("SELECT id, data FROM orders WHERE payment_status = 'Pending' ORDER BY created_at DESC LIMIT 30");
    $now = now_ms();
    foreach ($st as $row) {
      if ($n >= $maks) break;
      $o = json_decode($row['data'], true);
      if (!is_array($o)) continue;
      $inv = isset($o['payment']['invoice_id']) ? $o['payment']['invoice_id'] : '';
      if ($inv === '' || strpos($inv, 'SIM-') === 0) continue;
      // Sudah ditanyakan kurang dari semenit lalu → lewati.
      if (isset($o['_cek_at']) && ($now - (float)$o['_cek_at']) < 60000) continue;
      $o['_cek_at'] = $now;
      simpan_order($o);
      selaraskan_xendit($o);   // yang menerbitkan tiket / membatalkan kalau perlu
      $n++;
    }
  } catch (Throwable $e) { /* jangan sampai menggagalkan permintaan aslinya */ }
  return $n;
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
  // Menumpang lalu lintas yang memang sudah ada — lihat sapu_pending_xendit().
  sapu_pending_xendit(2);
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
  $sisa  = sisa_kelas($eid);
  $harga = array();
  foreach ($kelas as $c) if ((int)$c['price'] > 0) $harga[] = (int)$c['price'];
  return array(
    'id'         => $eid,
    'title'      => isset($e['title']) ? $e['title'] : '',
    'category'   => isset($e['category']) ? $e['category'] : '',
    'start'      => isset($e['start_datetime']) ? $e['start_datetime'] : '',
    'end'        => isset($e['end_datetime']) ? $e['end_datetime'] : '',
    'venue'      => isset($e['venue']) ? $e['venue'] : 'Laksamana Muda',
    /* DUA HAL BERBEDA YANG DULU DIKIRIM SEBAGAI SATU.
       `poster` di EMS isinya EMOJI ('🎪') — cadangan waktu belum ada gambar.
       Poster sungguhan yang diunggah kru tersimpan terpisah di `poster_img`.
       Halaman customer dulu memasang nilai `poster` langsung ke <img src>, jadi
       yang termuat adalah gambar rusak: emoji bukan alamat gambar. Itu sebabnya
       poster tidak pernah muncul walaupun sudah diunggah.
       Sekarang keduanya dikirim terpisah, dan gambarnya diambil lewat
       ?action=poster (lihat sajikan_poster()). */
    'poster'     => isset($e['poster']) ? $e['poster'] : '',
    'poster_img' => !empty($e['poster_img']['key']),
    'desc'       => isset($e['description']) ? $e['description'] : '',
    'capacity'   => (int)(isset($e['capacity']) ? $e['capacity'] : 0),
    'price_from' => $harga ? min($harga) : 0,
    'is_ticketed'=> !empty($e['is_ticketed']),
    /* `sisa` dihitung server, bukan quota-sold di browser: pesanan yang sedang
       menunggu pembayaran juga sudah memegang tiket, dan halaman yang tidak
       tahu itu akan menawarkan tiket yang sebentar lagi tidak ada. */
    'classes'    => array_map(function ($c) use ($sisa) {
      return array('id' => $c['id'], 'name' => $c['name'], 'price' => (int)$c['price'],
                   'quota' => (int)$c['quota'], 'sold' => (int)$c['sold'],
                   'sisa' => isset($sisa[$c['id']]) ? $sisa[$c['id']] : 0,
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

/* SISA TIKET YANG BOLEH DIJUAL, per kelas.
   Bukan sekadar quota - sold. Pesanan yang sedang di halaman pembayaran belum
   menaikkan `sold`, jadi tiket terakhir bisa dijual berkali-kali selama belum
   ada satu pun yang lunas — dan yang kalah baru tahu SETELAH uangnya keluar.
   Pesanan Pending karena itu ikut mengurangi sisa sampai invoicenya
   kedaluwarsa; setelah itu tiketnya bebas lagi dengan sendirinya.

   Kursi bernomor sebenarnya sudah dijaga seat_holds, tapi ikut dihitung juga
   supaya angka "sisa" yang dibaca pembeli punya arti yang sama di semua
   kategori. */
function sisa_kelas($eid) {
  $out = array();
  foreach (kelas_event($eid) as $c) $out[$c['id']] = max(0, (int)$c['quota'] - (int)$c['sold']);
  $st = db()->prepare("SELECT data FROM orders WHERE event_id = :e AND payment_status = 'Pending'");
  $st->execute(array(':e' => $eid));
  $now = time();
  foreach ($st as $row) {
    $o = json_decode($row['data'], true);
    if (!is_array($o) || empty($o['items'])) continue;
    if (!empty($o['expires_at']) && strtotime($o['expires_at']) < $now) continue;
    foreach ($o['items'] as $it) {
      $cid = isset($it['class_id']) ? $it['class_id'] : '';
      if ($cid === '' || !isset($out[$cid])) continue;
      $out[$cid] = max(0, $out[$cid] - max(1, (int)(isset($it['capacity']) ? $it['capacity'] : 1)));
    }
  }
  return $out;
}

/* ==================== POSTER EVENT ====================
   Berkas poster diunggah lewat EMS dan disimpan di DISK, bukan di database —
   jadi berbagi database saja tidak cukup untuk menampilkannya di sini.

   Yang disajikan HANYA poster event yang memang sedang dijual, dan hanya lewat
   id event. Endpoint ini sengaja TIDAK menerima nama berkas bebas seperti milik
   EMS: folder yang sama juga memuat KTP talent dan bukti transfer, dan situs
   publik tidak boleh jadi pintu untuk mengambil berkas apa pun asal tahu
   namanya.

   Foldernya ditebak dari susunan yang dipakai event-api-mysql (lihat
   berkas_dir() di lib_event_mysql.php). Keduanya di-deploy ke server yang sama
   dan sama-sama satu tingkat di bawah docroot, jadi jalur relatifnya sama
   persis. Kalau hostingnya lain, isi EVENT_FILES_DIR di config. */
/* KENAPA KANDIDATNYA BANYAK, BUKAN SATU TEBAKAN.
   Versi pertama menebak satu jalur dengan anggapan ticketing-api dan
   event-api-mysql sama-sama satu tingkat di bawah docroot. Di dev memang begitu,
   TAPI DI PRODUKSI TIDAK: modul Office tinggal di /public_html/office/ sementara
   situs customer di /public_html/ticketing/ — jadi "naik tiga tingkat" dari
   ticketing-api mendarat di tempat yang berbeda, dan posternya tetap 404.
   Itu sebab bug ini tidak selesai pada percobaan pertama.

   Sekarang semua susunan yang masuk akal dicoba, dan yang ketemu diingat.
   Kalau tak satu pun ketemu, masih ada jalan kedua (lihat poster_url_ems). */
function event_files_dir() {
  static $ketemu = null;
  if ($ketemu !== null) return $ketemu;
  if (defined('EVENT_FILES_DIR') && EVENT_FILES_DIR !== '' && is_dir(EVENT_FILES_DIR))
    return $ketemu = rtrim(EVENT_FILES_DIR, '/\\');
  $doc = isset($_SERVER['DOCUMENT_ROOT']) ? rtrim($_SERVER['DOCUMENT_ROOT'], '/\\') : '';
  $cal = array(
    __DIR__ . '/../../../event-db/files',                 // ticketing-api sejajar event-api (dev)
    __DIR__ . '/../../event-db/files',
    __DIR__ . '/../event-db/files',
    __DIR__ . '/../event-api-mysql/db/files',             // berkas terpaksa di dalam web
    __DIR__ . '/../office/event-api-mysql/db/files',
    __DIR__ . '/../../office/event-api-mysql/db/files',
  );
  if ($doc !== '') {
    $cal[] = $doc . '/../event-db/files';
    $cal[] = $doc . '/../../event-db/files';
    $cal[] = $doc . '/event-api-mysql/db/files';
    $cal[] = $doc . '/office/event-api-mysql/db/files';
  }
  foreach ($cal as $d) if (is_dir($d)) return $ketemu = $d;
  return $ketemu = '';
}
/* JALAN KEDUA: minta gambarnya ke API EMS sendiri.
   EMS sudah menyajikan poster yang sama dengan sukses lewat ?action=file, jadi
   kalau berkasnya tidak terjangkau dari sini, browser pembeli tinggal diarahkan
   ke sana. Gambar tidak terikat aturan CORS, jadi beda domain bukan masalah.
   Alamatnya boleh dipatok di config (EVENT_API_URL); kalau tidak, disimpulkan
   dari host — produksi memakai subdomain office, dev satu domain dengan
   modulnya. */
function poster_url_ems($key) {
  if (defined('EVENT_API_URL') && EVENT_API_URL !== '')
    return EVENT_API_URL . '?action=file&key=' . rawurlencode($key);
  $h = strtolower(isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '');
  if ($h === '') return '';
  $skema = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
  $host  = (strpos($h, 'dev.') === 0) ? $h : ('office.' . preg_replace('/^www\./', '', $h));
  return $skema . '://' . $host . '/event-api-mysql/api.php?action=file&key=' . rawurlencode($key);
}
function sajikan_poster($eid) {
  $rows = ambil('SELECT data FROM events WHERE id = :i', array(':i' => (string)$eid));
  if (!$rows || !boleh_dijual(isset($rows[0]['status']) ? $rows[0]['status'] : '')) { http_response_code(404); exit; }
  $key = isset($rows[0]['poster_img']['key']) ? (string)$rows[0]['poster_img']['key'] : '';
  if ($key === '') { http_response_code(404); exit; }
  $dir = event_files_dir();
  // Nama berkas dibersihkan dengan aturan yang sama seperti saat disimpan.
  $p = $dir === '' ? '' : $dir . '/' . preg_replace('/[^A-Za-z0-9._-]/', '_', $key);
  if ($p === '' || !is_file($p)) {
    $alt = poster_url_ems($key);
    if ($alt !== '') { header('Location: ' . $alt, true, 302); exit; }
    http_response_code(404); exit;
  }
  $ext  = strtolower(pathinfo($p, PATHINFO_EXTENSION));
  $peta = array('jpg'=>'image/jpeg','jpeg'=>'image/jpeg','png'=>'image/png',
                'webp'=>'image/webp','gif'=>'image/gif');
  header('Content-Type: ' . (isset($peta[$ext]) ? $peta[$ext] : 'application/octet-stream'));
  header('Content-Length: ' . filesize($p));
  // Poster jarang berubah dan dibuka berulang kali oleh calon pembeli yang
  // bolak-balik antar event; boleh disimpan peramban.
  header('Cache-Control: public, max-age=86400');
  readfile($p);
  exit;
}

/* ---------- PALET NAMA RUANG ----------
   Salinan LDZ_RUANG dari deploy/event/index.html. Ditaruh di SERVER, bukan di
   halaman customer, karena halaman customer sebelumnya menyimpan salinannya
   sendiri — tiga tempat yang harus diubah bersamaan tiap kali palet berubah,
   dan yang lupa akan menampilkan denah berbeda untuk ruangan yang sama.
   Sekarang halaman customer tidak tahu apa-apa soal warna: ia memakai apa yang
   dikirim di sini. Tinggal dua tempat, dan yang satu (EMS) adalah sumbernya. */
function palet_ruang() {
  return array(
    array('/^stage$|panggung/i',      '#3f4a5a', '#2b3340'),
    array('/^meja ?dj$/i',            '#a9791f', '#7a560f'),
    array('/talent/i',                '#6d5aa8', '#4e3f80'),
    array('/entrance|masuk|keluar/i', '#e08a1e', '#a86212'),
    array('/tangga/i',                '#8a6242', '#63452e'),
    array('/operator|foh/i',          '#2f3a4a', '#1d2530'),
    array('/^void/i',                 '#eceae4', '#c9c4b8'),
    array('/reguler|regular/i',       '#5b7fa6', '#3f5d7d'),
    array('/^ext/i',                  '#f2c14e', '#c9432b'),
  );
}
function warna_ruang($label) {
  $t = trim((string)$label);
  if ($t === '') return null;
  foreach (palet_ruang() as $r) if (preg_match($r[0], $t)) return array('bg' => $r[1], 'tepi' => $r[2]);
  return null;
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
  /* KUNCI YANG SUDAH TERIKAT PESANAN bukan lagi isi keranjang.
     Begitu checkout jadi, kunci kursinya diberi order_id dan masa tahannya
     diperpanjang jadi satu jam. Kursi itu sedang menunggu DIBAYAR — ia bukan
     pilihan yang masih menggantung di halaman denah.
     Dulu keduanya tak dibedakan, jadi membuka halaman "Pilih tempat" lagi
     memunculkan delapan kursi tercentang sendiri dari pesanan-pesanan lama,
     dengan hitung mundur 57 menit (sisa satu jam) alih-alih 10 menit.
     Dilaporkan 3 Agustus 2026. */
  $hold = array(); $holdExp = array(); $holdOrder = array();
  $st = db()->prepare('SELECT seat_id, hold_token, expires_at, order_id FROM seat_holds WHERE event_id = :e');
  $st->execute(array(':e' => $eid));
  foreach ($st as $r) {
    $hold[$r['seat_id']]      = $r['hold_token'];
    $holdExp[$r['seat_id']]   = (float)$r['expires_at'];
    $holdOrder[$r['seat_id']] = isset($r['order_id']) ? (string)$r['order_id'] : '';
  }

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
    else if (isset($hold[$id])) {
      // Milik sendiri HANYA kalau belum terikat pesanan; kalau sudah, ia sedang
      // menunggu pembayaran dan harus tampil terkunci — juga bagi pemesannya.
      $punyaku = ($holdToken !== '' && $hold[$id] === $holdToken && $holdOrder[$id] === '');
      $status  = $punyaku ? 'mine' : 'held';
    }

    /* MEJA TIDAK DIJUAL PER MEJA.
       Keputusan user 31 Juli 2026: tidak ada yang memesan satu meja utuh, jadi
       meja di denah adalah PERABOT — penanda tempat duduk berada, bukan barang
       dagangan. Ia tetap digambar supaya pembeli mengenali ruangannya, tapi
       tidak bisa diklik dan tidak pernah punya harga. Ditetapkan di server,
       bukan di halaman: harga yang tetap terkirim ke browser akan tetap terbaca
       oleh siapa pun yang membuka DevTools, dan `dijual` yang hanya dijaga
       tampilan bukan penjagaan sama sekali (lihat tahan_kursi()). */
    $dijual = ($kind !== 'area' && $kind !== 'table');
    if ($kind === 'table' && $status === 'available') $status = 'perabot';

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
      /* Warna eksplisit per objek MENANG atas palet nama ruang — kalau tidak,
         warna yang sengaja dipatok kru akan ditimpa tebakan dari namanya. */
      'warna'      => isset($s['warna']) ? $s['warna'] : '',
      'warna_bg'   => ($w = warna_ruang(isset($s['table_no']) ? $s['table_no'] : '')) ? $w['bg'] : '',
      'warna_tepi' => $w ? $w['tepi'] : '',
      'pola'     => isset($s['pola']) ? $s['pola'] : '',
      'status'   => $status,
      'dijual'   => $dijual,
      /* Kapan kunci INI habis (epoch ms), hanya untuk kursi yang dipegang
         pemanggil sendiri. Tanpa ini, pembeli yang menyegarkan halaman melihat
         hitung mundur mulai lagi dari 10:00 padahal servernya tinggal
         menghitung 40 detik — lalu kursinya lepas mendadak tanpa peringatan. */
      'hold_exp' => ($status === 'mine' && isset($holdExp[$id])) ? $holdExp[$id] : 0,
      'price'    => ($dijual && $c) ? (int)$c['price'] : 0,
      'class_id' => ($dijual && $c) ? $c['id'] : '',
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
      // Meja & zona: perabot, bukan dagangan. Dijaga di sini, bukan cuma di
      // tampilan — permintaan `hold` datang dari browser dan browser bisa
      // dikarang isinya.
      if (empty($s['dijual']))            { $tolak[] = array($sid, 'bukan tempat yang dijual'); continue; }
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

/* ==================== PENAHAN PERCOBAAN BERULANG ====================
   Password 8 karakter aman dari tebakan ACAK, tapi tidak dari daftar password
   yang paling sering dipakai orang: mesin bisa mencoba ribuan per menit tanpa
   penahan apa pun. Di sistem yang memegang uang, itu satu-satunya pintu yang
   tidak butuh kecerdasan untuk dibuka — cukup kesabaran.

   Yang dicatat hanya percobaan GAGAL, dan yang disimpan cuma sidik jarinya
   (hash dari kunci), bukan email atau IP-nya sendiri: tabel ini tidak boleh
   berubah jadi daftar siapa mencoba masuk dari mana.

   TIDAK MEMBLOKIR SELAMANYA, dan tidak memblokir akunnya. Yang ditahan
   pasangan (email + alamat asal) selama beberapa menit — memblokir akun berarti
   siapa pun bisa mengunci akun orang lain hanya dengan salah memasukkan
   password sepuluh kali.

   Kalau tabelnya belum ada (schema-tambahan.sql belum dijalankan), penahannya
   DIAM-DIAM tidak aktif — sengaja, supaya pemasangan yang belum lengkap tidak
   membuat seluruh situs tak bisa dipakai. ?action=ping melaporkan keadaannya
   supaya ketidakaktifan itu tidak luput dari perhatian. */
function asal_pemanggil() {
  $ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '?';
  return $ip;
}
function kunci_gagal($jenis, $siapa) {
  // Digabung dengan callback token sebagai garam supaya isi tabelnya tidak bisa
  // dicocokkan balik ke daftar email lewat pencocokan hash.
  $garam = defined('XENDIT_CALLBACK') ? XENDIT_CALLBACK : 'lm';
  return hash('sha256', $jenis . '|' . strtolower(trim((string)$siapa)) . '|' . asal_pemanggil() . '|' . $garam);
}
function tahan_percobaan($jenis, $siapa, $maks = 8, $menit = 15) {
  $k = kunci_gagal($jenis, $siapa);
  try {
    $st = db()->prepare('SELECT COUNT(*) FROM tix_gagal WHERE kunci = :k AND at > :t');
    $st->execute(array(':k' => $k, ':t' => now_ms() - $menit * 60000));
    if ((int)$st->fetchColumn() >= $maks)
      throw new Exception('Terlalu banyak percobaan. Coba lagi dalam ' . $menit . ' menit.');
  } catch (PDOException $e) { /* tabel belum ada — lihat catatan di atas */ }
}
function catat_gagal($jenis, $siapa) {
  try {
    db()->prepare('INSERT INTO tix_gagal (id,kunci,at) VALUES (:i,:k,:a)')
        ->execute(array(':i' => uid('g'), ':k' => kunci_gagal($jenis, $siapa), ':a' => now_ms()));
    // Sapu jejak lama: tabel ini tidak punya guna sebagai arsip.
    db()->prepare('DELETE FROM tix_gagal WHERE at < :t')->execute(array(':t' => now_ms() - 24 * 3600000));
  } catch (PDOException $e) { /* tabel belum ada */ }
}
function penahan_aktif() {
  try { db()->query('SELECT 1 FROM tix_gagal LIMIT 1'); return true; }
  catch (Throwable $e) { return false; }
}

/* ==================== MEMASTIKAN PEMBAYARAN KE XENDIT ====================
   Webhook dipercaya karena membawa callback token rahasia. Tapi token itu satu
   nilai statis yang hidup di config, dikirim lewat jaringan tiap kali, dan
   pernah tertulis di tempat yang tidak seharusnya (percakapan, tangkapan
   layar). Kalau ia bocor, siapa pun yang tahu alamat webhook bisa mengirim
   {external_id, status:PAID} dan MENCETAK TIKET TANPA MEMBAYAR — kerugiannya
   langsung berupa kursi yang hilang dan tamu yang tidak bisa masuk.

   Karena itu webhook tidak lagi jadi bukti tunggal: sebelum tiket terbit,
   status invoicenya DITANYAKAN LANGSUNG ke Xendit dengan secret key kita. Yang
   bisa memalsukan itu hanya orang yang sudah memegang secret key — dan pada
   titik itu tokennya bukan lagi masalah terbesar.

   Kalau Xendit tidak bisa dihubungi, webhooknya DITOLAK dengan 500 supaya
   Xendit mengirim ulang beberapa saat lagi; halaman e-ticket juga tetap
   menanyakan sendiri (selaraskan_xendit). Jadi tiket tidak hilang, cuma
   tertunda. */
function xendit_invoice_lunas($invoiceId) {
  if ($invoiceId === '' || strpos($invoiceId, 'SIM-') === 0) return null;  // invoice simulasi
  if (strpos(xendit_mode(), 'belum diisi') === 0) return null;             // kunci belum dipasang
  $ch = curl_init('https://api.xendit.co/v2/invoices/' . rawurlencode($invoiceId));
  curl_setopt_array($ch, array(CURLOPT_RETURNTRANSFER => true, CURLOPT_USERPWD => XENDIT_SECRET . ':', CURLOPT_TIMEOUT => 20));
  $res = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  if ($res === false || $code >= 300) return null;   // tak terjangkau: BUKAN berarti lunas
  $d  = json_decode($res, true);
  $st = strtoupper(isset($d['status']) ? $d['status'] : '');
  return array('lunas' => ($st === 'PAID' || $st === 'SETTLED'), 'status' => $st, 'data' => $d);
}

/* ==================== AKUN PEMBELI ====================
   Sengaja TIDAK memakai tabel `users` milik Office: itu akun kru dengan role
   dan hak akses modul. Satu kebocoran di situs publik tidak boleh menyentuh
   daftar pegawai.

   BELI WAJIB PAKAI AKUN — sejak 3 Agustus 2026 (keputusan user).
   Sebelumnya tidak: memaksa mendaftar di tengah checkout memang membuat
   sebagian orang batal membeli, dan itu alasan yang dulu dipakai. Yang
   mengalahkannya: tiket harus jelas MILIK SIAPA. Tanpa akun, satu-satunya
   pegangan pembeli adalah tautan ber-access_token di emailnya — begitu email
   itu hilang atau salah ketik, tiketnya tidak bisa ditemukan siapa pun,
   termasuk kru. Dengan akun, "Tiket Saya" selalu jadi jalan pulang.

   access_token tetap ada dan tetap bekerja: tautan dari email masih membuka
   e-ticket tanpa perlu masuk, supaya tiket bisa diteruskan ke teman yang ikut
   datang. Yang berubah cuma pembuatannya. */
function email_rapi($e) { return strtolower(trim((string)$e)); }

function user_baris($email) {
  $st = db()->prepare('SELECT * FROM tix_users WHERE email = :e');
  $st->execute(array(':e' => email_rapi($email)));
  $r = $st->fetch();
  return $r ? $r : null;
}
function user_by_id($id) {
  $st = db()->prepare('SELECT * FROM tix_users WHERE id = :i');
  $st->execute(array(':i' => $id));
  $r = $st->fetch();
  return $r ? $r : null;
}
function user_publik($u) {
  return $u ? array('id' => $u['id'], 'email' => $u['email'],
                    'name' => $u['name'], 'phone' => $u['phone']) : null;
}

/* Sesi 30 hari. Tokennya acak penuh, bukan turunan email atau id — token
   yang bisa ditebak sama saja dengan tidak ada. */
function buat_sesi($userId) {
  $tok = token_acak(24);
  db()->prepare('INSERT INTO tix_sessions (token,user_id,expires_at,created_at) VALUES (:t,:u,:x,:c)')
      ->execute(array(':t' => $tok, ':u' => $userId,
                      ':x' => now_ms() + 30 * 24 * 3600 * 1000, ':c' => now_ms()));
  db()->prepare('DELETE FROM tix_sessions WHERE expires_at < :n')->execute(array(':n' => now_ms()));
  return $tok;
}
function user_dari_sesi($tok) {
  if (!$tok) return null;
  $st = db()->prepare('SELECT user_id FROM tix_sessions WHERE token = :t AND expires_at > :n');
  $st->execute(array(':t' => $tok, ':n' => now_ms()));
  $r = $st->fetch();
  return $r ? user_by_id($r['user_id']) : null;
}

function daftar($b) {
  $email = email_rapi(isset($b['email']) ? $b['email'] : '');
  $pass  = (string)(isset($b['password']) ? $b['password'] : '');
  $nama  = trim((string)(isset($b['name']) ? $b['name'] : ''));
  $hp    = trim((string)(isset($b['phone']) ? $b['phone'] : ''));
  if ($nama === '' || $email === '') throw new Exception('Nama dan email wajib diisi.');
  if (!filter_var($email, FILTER_VALIDATE_EMAIL)) throw new Exception('Format email tidak valid.');
  /* Delapan karakter, bukan aturan rumit huruf besar-angka-simbol. Aturan
     rumit membuat orang menulis passwordnya di catatan HP, dan itu jauh
     lebih berbahaya daripada password panjang yang sederhana. */
  if (strlen($pass) < 8) throw new Exception('Password minimal 8 karakter.');
  if (user_baris($email)) throw new Exception('Email ini sudah terdaftar. Silakan masuk.');

  $id = uid('usr');
  db()->prepare('INSERT INTO tix_users (id,email,pass_hash,name,phone,created_at) VALUES (:i,:e,:p,:n,:h,:c)')
      ->execute(array(':i' => $id, ':e' => $email, ':p' => password_hash($pass, PASSWORD_DEFAULT),
                      ':n' => $nama, ':h' => $hp, ':c' => now_ms()));
  $n = tautkan_pesanan_lama($id, $email);
  return array('user' => user_publik(user_by_id($id)), 'token' => buat_sesi($id), 'pesanan_lama' => $n);
}

function masuk($b) {
  $email = email_rapi(isset($b['email']) ? $b['email'] : '');
  $pass  = (string)(isset($b['password']) ? $b['password'] : '');
  tahan_percobaan('masuk', $email);          // lihat catatan di tahan_percobaan()
  $u = user_baris($email);
  /* Pesan yang sama untuk email tak terdaftar dan password salah. Pesan yang
     membedakan keduanya memberi tahu orang asing email mana yang punya akun
     di sini — itu daftar yang tidak perlu dibagikan. */
  if (!$u || !password_verify($pass, $u['pass_hash'])) {
    catat_gagal('masuk', $email);
    throw new Exception('Email atau password salah.');
  }
  tautkan_pesanan_lama($u['id'], $u['email']);
  return array('user' => user_publik($u), 'token' => buat_sesi($u['id']));
}
function keluar_sesi($tok) {
  if ($tok) db()->prepare('DELETE FROM tix_sessions WHERE token = :t')->execute(array(':t' => $tok));
  return array('keluar' => true);
}

/* PESANAN LAMA IKUT TERTAUT saat orang mendaftar/masuk dengan email yang
   sama. Tanpa ini, seluruh riwayat pembeliannya hilang tepat pada saat ia
   membuat akun — kebalikan dari yang ia harapkan. */
function tautkan_pesanan_lama($userId, $email) {
  $st = db()->prepare('SELECT id, data FROM orders WHERE email = :e');
  $st->execute(array(':e' => $email));
  $n = 0;
  foreach ($st as $row) {
    $o = json_decode($row['data'], true);
    if (!is_array($o) || !empty($o['user_id'])) continue;
    $o['user_id'] = $userId;
    db()->prepare('UPDATE orders SET updated_at = :u, data = :d WHERE id = :i')
        ->execute(array(':u' => now_ms(), ':d' => json_encode($o, JSON_UNESCAPED_UNICODE), ':i' => $row['id']));
    $n++;
  }
  return $n;
}

/* Berapa orang yang ditampung sekumpulan item pesanan — sekaligus berapa tiket
   yang terbit untuknya. Dipakai bersama oleh riwayat dan email supaya keduanya
   tidak pernah menyebut angka yang berbeda untuk pesanan yang sama. */
/* "Kursi 78, 70" / "3 tiket Reguler". Dipakai di daftar Tiket Saya. */
function ringkas_tempat($items) {
  $kursi = array(); $umum = array();
  foreach ((array)$items as $it) {
    $jenis = isset($it['kind']) ? $it['kind'] : 'seat';
    if ($jenis === 'general') {
      $nama = isset($it['tier']) ? $it['tier'] : 'Reguler';
      $umum[$nama] = (isset($umum[$nama]) ? $umum[$nama] : 0) + max(1, (int)(isset($it['capacity']) ? $it['capacity'] : 1));
    } else if (isset($it['label']) && $it['label'] !== '') {
      $kursi[] = ($jenis === 'table' ? 'Meja ' : '') . $it['label'];
    }
  }
  $bagian = array();
  if ($kursi) $bagian[] = 'Kursi ' . implode(', ', $kursi);
  foreach ($umum as $nama => $n) $bagian[] = $n . ' tiket ' . $nama;
  return implode(' · ', $bagian);
}

function jml_pax($items) {
  $n = 0;
  foreach ((array)$items as $it) $n += max(1, (int)(isset($it['capacity']) ? $it['capacity'] : 1));
  return $n;
}

/* Daftar tiket milik satu akun. Tiap pesanan dibawa lengkap dengan
   access_token-nya sendiri, supaya halaman Tiket Saya membuka e-ticket lewat
   jalur yang SAMA dengan tautan dari email — bukan jalur kedua yang bisa
   diam-diam berbeda aturannya. */
function tiket_saya($u) {
  if (!$u) throw new Exception('Silakan masuk dulu.');
  /* Ditanyakan ke Xendit DULU, baru daftarnya disusun — supaya pembeli yang
     baru saja membayar langsung melihat "Lunas" begitu halaman ini terbuka,
     bukan harus mengetuk pesanannya satu per satu untuk memicu pemeriksaan.
     Itu keluhannya: "saya klik dulu baru dia mengecek". */
  sapu_pending_xendit(5);
  $pesanan = array();
  $st = db()->prepare('SELECT id, data FROM orders WHERE email = :e ORDER BY created_at DESC');
  $st->execute(array(':e' => $u['email']));
  foreach ($st as $row) {
    $o = json_decode($row['data'], true);
    if (is_array($o)) $pesanan[$row['id']] = $o;
  }
  /* PESANAN YANG EMAILNYA BEDA TAPI AKUNNYA SAMA.
     Formulir checkout boleh diisi email lain — orang membelikan tiket untuk
     temannya, dan e-ticket memang harus mendarat di email temannya itu.
     Checkout sudah menyimpan user_id pembelinya, tapi daftar ini dulu hanya
     menyaring email, jadi pesanan seperti itu HILANG dari Tiket Saya.

     Gejalanya membingungkan dan sudah dilaporkan: pembelian kedua berisi dua
     kursi (78 & 70) tidak pernah muncul, dan satu-satunya baris yang ada —
     pembelian pertama berisi kursi 80 — terbuka setiap kali diketuk, seolah
     tiket keduanya berubah jadi tiket pertama.

     user_id tersimpan di dalam JSON, dan JSON_EXTRACT tidak ada di MySQL 5.6
     (server ini masih harus aman di sana), jadi yang dipindai dibatasi pesanan
     terbaru — bukan seluruh tabel yang akan terus tumbuh. Pesanan lama tetap
     terjangkau lewat penyaringan email di atas. */
  $st2 = db()->query('SELECT id, data FROM orders ORDER BY created_at DESC LIMIT 1000');
  foreach ($st2 as $row) {
    if (isset($pesanan[$row['id']])) continue;
    $o = json_decode($row['data'], true);
    if (is_array($o) && !empty($o['user_id']) && $o['user_id'] === $u['id']) $pesanan[$row['id']] = $o;
  }
  // Terbaru di atas, sesudah kedua sumber digabung.
  $urut = array_values($pesanan);
  usort($urut, function ($a, $b) {
    return strcmp(isset($b['created']) ? $b['created'] : '', isset($a['created']) ? $a['created'] : '');
  });

  $out = array();
  foreach ($urut as $o) {
    $ev = event_satu_apa_adanya($o['event_id']);
    $out[] = array(
      'ref' => $o['payment_ref'], 'access_token' => $o['access_token'],
      'status' => $o['payment_status'], 'total' => (int)$o['total'],
      'created' => isset($o['created']) ? $o['created'] : '',
      // Jumlah TIKET, bukan jumlah tempat: satu meja 6 orang menerbitkan 6
      // tiket, dan riwayat yang menulis "1 tiket" untuk pesanan itu membuat
      // pembelinya mengira lima QR-nya hilang.
      'jml_tiket' => jml_pax(isset($o['items']) ? $o['items'] : array()),
      // Nomor tempatnya ikut, supaya dua pembelian di event yang sama bisa
      // dibedakan tanpa harus membuka keduanya satu per satu.
      'tempat' => ringkas_tempat(isset($o['items']) ? $o['items'] : array()),
      'event' => $ev ? array('title' => $ev['title'], 'start' => $ev['start'], 'venue' => $ev['venue']) : null,
    );
  }
  return $out;
}
/* Event pada riwayat dibaca TANPA saringan status: acara yang sudah lewat
   atau dibatalkan tetap harus muncul di riwayat pembelinya. Yang disaring
   status hanyalah daftar yang DIJUAL. */
function event_satu_apa_adanya($id) {
  $rows = ambil('SELECT data FROM events WHERE id = :i', array(':i' => $id));
  return $rows ? event_ringkas($rows[0]) : null;
}

/* ==================== LUPA & RESET PASSWORD ====================
   Ini yang menutup satu-satunya kelemahan besar akun berpassword: tanpa jalan
   pemulihan, lupa password berarti tiket yang sudah dibayar tidak bisa diakses
   lagi kecuali admin turun tangan.
   ================================================================= */

/* JAWABANNYA SELALU SAMA, terdaftar atau tidak. Kalau dibedakan, siapa pun
   bisa memakai halaman ini untuk memeriksa email mana yang punya akun di sini
   — daftar yang tidak perlu dibagikan ke orang asing. */
function lupa_password($email) {
  /* Dibatasi supaya kotak masuk seseorang tidak bisa dijadikan sasaran kiriman
     bertubi-tubi lewat formulir ini, dan supaya jatah kirim SMTP tidak habis
     dalam semenit. */
  tahan_percobaan('lupa', $email, 5, 30);
  catat_gagal('lupa', $email);   // tiap permintaan dihitung, berhasil atau tidak
  $u = user_baris($email);
  if ($u) {
    // Token lama dibuang: satu permintaan baru harus membatalkan yang lama,
    // kalau tidak tautan dari email minggu lalu masih bisa dipakai.
    db()->prepare('DELETE FROM tix_reset WHERE user_id = :u')->execute(array(':u' => $u['id']));
    $tok = token_acak(24);
    db()->prepare('INSERT INTO tix_reset (token,user_id,expires_at,created_at) VALUES (:t,:u,:x,:c)')
        ->execute(array(':t' => $tok, ':u' => $u['id'],
                        ':x' => now_ms() + 3600000, ':c' => now_ms()));   // 1 jam
    if (smtp_siap()) {
      $tautan = site_url() . '/#reset/' . rawurlencode($tok);
      try {
        kirim_email($u['email'], 'Atur ulang password \u2014 Laksamana Muda Ticketing',
          '<div style="font-family:Arial,sans-serif;background:#F7F6F4;padding:24px">'
          . '<div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #E7E1D3;'
          . 'border-radius:14px;padding:24px">'
          . '<p>Halo <b>' . htmlspecialchars($u['name']) . '</b>,</p>'
          . '<p>Ada permintaan mengatur ulang password akun tiketmu. Tautan ini berlaku <b>1 jam</b> '
          . 'dan hanya bisa dipakai sekali.</p>'
          . '<p><a href="' . htmlspecialchars($tautan) . '" style="display:inline-block;background:#A9791F;'
          . 'color:#fff;padding:12px 20px;border-radius:9px;text-decoration:none;font-weight:bold">'
          . 'ATUR ULANG PASSWORD</a></p>'
          . '<p style="font-size:12px;color:#8C8677">Kalau bukan kamu yang meminta, abaikan saja email ini '
          . '\u2014 passwordmu tidak berubah selama tautan di atas tidak dibuka.</p>'
          . '</div></div>');
      } catch (Throwable $e) { /* ditelan: jangan sampai kegagalan kirim membocorkan bahwa emailnya terdaftar */ }
    }
  }
  return array('terkirim' => true,
    'pesan' => 'Kalau email itu terdaftar, tautan pengaturan ulang sudah kami kirim. Cek inbox dan folder spam.');
}

function reset_password($tok, $baru) {
  if (strlen((string)$baru) < 8) throw new Exception('Password minimal 8 karakter.');
  db()->prepare('DELETE FROM tix_reset WHERE expires_at < :n')->execute(array(':n' => now_ms()));
  $st = db()->prepare('SELECT user_id FROM tix_reset WHERE token = :t AND expires_at > :n');
  $st->execute(array(':t' => $tok, ':n' => now_ms()));
  $r = $st->fetch();
  if (!$r) throw new Exception('Tautan sudah kedaluwarsa atau pernah dipakai. Minta tautan baru.');
  db()->prepare('UPDATE tix_users SET pass_hash = :p WHERE id = :i')
      ->execute(array(':p' => password_hash($baru, PASSWORD_DEFAULT), ':i' => $r['user_id']));
  // Sekali pakai.
  db()->prepare('DELETE FROM tix_reset WHERE token = :t')->execute(array(':t' => $tok));
  /* SEMUA SESI LAMA DIPUTUS. Orang mengganti password justru ketika ia curiga
     akunnya dipakai orang lain; membiarkan sesi lama tetap hidup membuat
     penggantian itu tidak menyelesaikan apa pun. */
  db()->prepare('DELETE FROM tix_sessions WHERE user_id = :u')->execute(array(':u' => $r['user_id']));
  $u = user_by_id($r['user_id']);
  return array('user' => user_publik($u), 'token' => buat_sesi($u['id']));
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

  /* WAJIB MASUK. Keputusan user 3 Agustus 2026: tiket harus tercatat atas nama
     akun, supaya "Tiket Saya" berguna, tiket bisa dibuka lagi dari perangkat
     lain, dan kru punya cara mengenali pemiliknya kalau QR-nya hilang.

     Diperiksa DI SINI, bukan cuma di halaman: penjaga yang hanya ada di layar
     bisa dilewati siapa pun yang memanggil api.php langsung. Sesi juga dibaca
     ulang di bawah untuk mengisi user_id — jadi angkanya satu, tidak mungkin
     pesanannya lolos tanpa pemilik. */
  $sesiUser = user_dari_sesi(isset($b['sesi']) ? $b['sesi'] : '');
  if (!$sesiUser) throw new Exception('Silakan masuk dulu — tiket dicatat atas nama akunmu.');
  $ev = event_satu($eid);
  if (!$ev) throw new Exception('Event tidak ditemukan atau belum dibuka untuk umum.');

  sapu_hold();
  // Kursi yang dibayar = kursi yang MASIH dipegang token ini di database.
  // Bukan daftar dari browser: daftar dari browser bisa memuat kursi yang
  // kuncinya sudah kedaluwarsa atau tidak pernah ada.
  /* HANYA kursi yang BELUM terikat pesanan lain.
     Kunci yang sudah punya order_id adalah milik pesanan yang sedang menunggu
     pembayaran (masa tahannya diperpanjang jadi 1 jam, dan sapu_hold sengaja
     tidak menyapunya). Tanpa saringan ini, checkout berikutnya dengan token yang
     sama IKUT MENYERET kursi-kursi itu ke pesanan baru: keranjang di layar
     menampilkan satu kursi, tagihan Xendit berisi tiga.
     Sudah kejadian 3 Agustus 2026 di produksi — dua percobaan checkout gagal
     (kunci Xendit belum berizin) meninggalkan kursi 70 & 81 tergantung, lalu
     ikut tertagih bersama kursi 82 yang baru dipilih. */
  $st = db()->prepare('SELECT seat_id FROM seat_holds
                       WHERE hold_token = :t AND event_id = :e AND expires_at > :n
                         AND (order_id IS NULL OR order_id = \'\')');
  $st->execute(array(':t' => $tok, ':e' => $eid, ':n' => now_ms()));
  $seatIds = array(); foreach ($st as $r) $seatIds[] = $r['seat_id'];

  /* DUA CARA MEMBELI DALAM SATU PESANAN.
     Tiket bernomor tempat ditahan lebih dulu di denah; tiket reguler (berdiri /
     bebas duduk) tidak punya tempat untuk ditahan, jadi yang dikirim cuma
     "kelas ini, sekian lembar". Keduanya berakhir sebagai baris item yang
     bentuknya sama, supaya pelunasan, e-ticket, dan riwayat tidak perlu tahu
     bedanya. */
  $umum = (isset($b['umum']) && is_array($b['umum'])) ? $b['umum'] : array();
  if (!$seatIds && !$umum)
    throw new Exception('Belum ada tiket yang dipilih — atau kursi yang ditahan sudah kedaluwarsa. Silakan pilih ulang.');

  /* PENJAGA TABRAKAN, sejajar dengan yang dipakai reservasi (kunci baris versi
     FOR UPDATE di lib_reservasi_mysql.php) dan dengan tahan_kursi() di berkas
     ini: seluruh pemeriksaan "masih ada?" sampai pesanannya tersimpan berjalan
     di dalam SATU kunci, jadi dua pembeli yang menekan Bayar pada milidetik
     yang sama diproses berurutan, bukan bersamaan.

     Untuk kursi bernomor sebenarnya sudah ada dua lapis lain (UNIQUE(seat_id)
     di seat_holds + pemeriksaan status di bawah). Yang benar-benar butuh kunci
     ini adalah tiket REGULER: sisanya dihitung dari angka, dan tanpa kunci dua
     pesanan bisa sama-sama membaca "sisa 1" lalu sama-sama lolos.

     Kuncinya dilepas SEBELUM memanggil Xendit. Permintaan ke luar bisa makan
     beberapa detik, dan menahan kunci selama itu membuat semua pembeli lain
     antre di belakang satu jaringan yang lambat. */
  tx_lock();
  try {
  $peta = array(); foreach (denah($eid, $tok) as $s) $peta[$s['id']] = $s;
  $items = array(); $subtotal = 0;
  foreach ($seatIds as $sid) {
    $s = isset($peta[$sid]) ? $peta[$sid] : null;
    if (!$s || $s['price'] <= 0) throw new Exception('Ada kursi yang harganya belum ditetapkan. Hubungi admin.');
    if ($s['status'] === 'sold' || $s['status'] === 'checked') throw new Exception('Kursi ' . $s['label'] . ' keburu terjual. Silakan pilih ulang.');
    /* Meja dibeli sebagai SATU tempat, tapi menampung `capacity` orang — dan
       tiap orang perlu QR-nya sendiri (lihat lunaskan()). Kapasitasnya
       dinormalkan di sini, bukan saat pelunasan: kalau denah berubah setelah
       pesanan dibuat, jumlah tiket yang terbit harus tetap sama dengan yang
       dilihat pembeli waktu membayar.
       Kursi biasa dipaksa 1 — kursi dengan capacity aneh dari denah lama tidak
       boleh diam-diam melahirkan dua tiket. */
    $pax = ($s['kind'] === 'table') ? max(1, (int)$s['capacity']) : 1;
    $items[] = array('seat_id' => $sid, 'label' => $s['label'], 'tier' => $s['tier'],
                     'class_id' => $s['class_id'], 'kind' => $s['kind'],
                     'capacity' => $pax, 'price' => $s['price']);
    $subtotal += $s['price'];
  }

  /* --- tiket reguler: kelas + jumlah lembar --- */
  if ($umum) {
    $kelas = array(); foreach (kelas_event($eid) as $c) $kelas[$c['id']] = $c;
    $sisa  = sisa_kelas($eid);
    foreach ($umum as $u) {
      $cid = isset($u['class_id']) ? $u['class_id'] : '';
      $qty = (int)(isset($u['qty']) ? $u['qty'] : 0);
      if (!isset($kelas[$cid])) throw new Exception('Kategori tiket tidak dikenal.');
      $c = $kelas[$cid];
      if (!empty($c['is_seated']))
        throw new Exception('Kategori "' . $c['name'] . '" harus dipilih tempatnya di denah.');
      if ((int)$c['price'] <= 0) throw new Exception('Kategori "' . $c['name'] . '" belum punya harga. Hubungi admin.');
      // Batas per pesanan menahan pemborong yang mengunci seluruh kuota lalu
      // tidak membayar; sisanya baru bebas lagi setelah invoice kedaluwarsa.
      if ($qty < 1 || $qty > (defined('MAX_PER_PESANAN') ? MAX_PER_PESANAN : 10))
        throw new Exception('Jumlah tiket "' . $c['name'] . '" tidak masuk akal.');
      $ada = isset($sisa[$cid]) ? $sisa[$cid] : 0;
      if ($qty > $ada)
        throw new Exception('Sisa tiket "' . $c['name'] . '" tinggal ' . $ada . ' lembar.');
      /* Satu baris item untuk sekian lembar — bentuknya sama persis dengan meja
         berkapasitas banyak, jadi lunaskan(), naikkan_sold(), dan jml_pax()
         tidak perlu tahu ini tiket reguler. Harga baris = harga × lembar. */
      $items[] = array('seat_id' => '', 'label' => '', 'tier' => $c['name'],
                       'class_id' => $cid, 'kind' => 'general',
                       'capacity' => $qty, 'price' => (int)$c['price'] * $qty);
      $subtotal += (int)$c['price'] * $qty;
    }
  }

  /* Biaya admin dihitung PER TIKET, bukan per baris pesanan: tiga tiket reguler
     dalam satu baris tetap tiga tiket yang terbit dan tiga orang yang masuk. */
  $fee   = (defined('ADMIN_FEE') ? ADMIN_FEE : 0) * jml_pax($items);
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
    // Pemiliknya sudah dipastikan di awal fungsi ini — pesanan tanpa akun tidak
    // pernah sampai ke baris ini.
    'user_id' => $sesiUser['id'],
    'expires_at' => gmdate('c', (int)(now_ms() / 1000) + menit_bayar() * 60),
    'created' => gmdate('c'),
  );
  simpan_order($order);
  /* Kunci kursinya diikat ke pesanan: mulai sekarang ia tidak lagi ikut tersapu
     oleh sapu_hold(), karena orangnya sedang di halaman pembayaran.
     Hanya kalau memang ADA kursi — pesanan tiket reguler murni tidak menahan
     apa pun, dan "seat_id IN ()" bukan SQL yang sah: kueri itu melempar, dan
     yang gagal adalah checkout yang sebetulnya sudah benar. */
  if ($seatIds) {
    $in = implode(',', array_fill(0, count($seatIds), '?'));
    db()->prepare("UPDATE seat_holds SET order_id = ?, expires_at = ? WHERE seat_id IN ($in)")
        ->execute(array_merge(array($oid, now_ms() + menit_bayar() * 60000), $seatIds));
  }
  } finally { tx_unlock(); }   // di sinilah pembeli berikutnya boleh masuk

  /* KALAU XENDIT MENOLAK, PESANANNYA DIBATALKAN — bukan ditinggal menggantung.
     Pesanan tanpa invoice tidak akan pernah bisa dibayar, tapi kunci kursinya
     sudah terikat padanya selama satu jam. Akibatnya kursi itu mati untuk semua
     orang (termasuk pembelinya sendiri, yang cuma melihat kursinya "sedang
     dipilih orang lain"), dan pesanan hantu menumpuk di daftar EMS.
     batalkan() menandainya Failed sekaligus melepas kuncinya. */
  try {
    $inv = xendit_invoice($order, $ev);
  } catch (Throwable $e) {
    batalkan($oid, 'FAILED');
    throw $e;
  }
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
  // Dinilai dari host, bukan config — lihat env_nyata().
  if (env_nyata() === 'produksi') return false;
  return true;
}
function xendit_invoice($o, $ev) {
  if (mode_simulasi()) {
    return array('gateway' => 'simulasi', 'invoice_id' => 'SIM-' . $o['payment_ref'],
      'invoice_url' => site_url() . '/#simbayar/' . $o['payment_ref'] . '/' . $o['access_token'],
      'expiry_date' => '', 'status' => 'PENDING', 'simulasi' => true);
  }
  if (strpos(xendit_mode(), 'belum diisi') === 0)
    throw new Exception('Pembayaran belum dikonfigurasi di server: ' . xendit_mode());
  $body = array(
    // external_id inilah yang dipulangkan webhook. Dipakai id pesanan kita
    // supaya pencocokannya tidak bergantung pada apa pun yang bisa berubah.
    'external_id'           => $o['id'],
    'amount'                => $o['total'],
    'payer_email'           => $o['email'],
    'description'           => $ev['title'] . ' — ' . count($o['items']) . ' tiket',
    // Invoice mati bersamaan dengan kursinya — lihat menit_bayar().
    'invoice_duration'      => menit_bayar() * 60,
    'success_redirect_url'  => site_url() . '/#tiket/' . $o['payment_ref'] . '/' . $o['access_token'],
    'failure_redirect_url'  => site_url() . '/#gagal/' . $o['payment_ref'],
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

  if ($status === 'PAID' || $status === 'SETTLED') {
    /* TOKEN SAJA TIDAK CUKUP UNTUK MENERBITKAN TIKET.
       Lihat catatan panjang di xendit_invoice_lunas(): kalau callback token
       bocor, badan permintaan bisa dikarang siapa pun. Jadi status lunasnya
       ditanyakan langsung ke Xendit memakai secret key kita sebelum satu tiket
       pun terbit. */
    $rows = ambil('SELECT data FROM orders WHERE id = :i', array(':i' => $oid));
    if (!$rows) throw new Exception('Pesanan tidak ditemukan: ' . $oid);
    $inv = isset($rows[0]['payment']['invoice_id']) ? $rows[0]['payment']['invoice_id'] : '';
    $cek = xendit_invoice_lunas($inv);
    if ($cek === null && $inv !== '' && strpos($inv, 'SIM-') !== 0) {
      // Tidak bisa memastikan → JANGAN terbitkan. 500 membuat Xendit mengirim
      // ulang; halaman e-ticket juga menanyakan sendiri saat dibuka.
      throw new Exception('Belum bisa memastikan status ke Xendit — coba lagi.');
    }
    if ($cek !== null && !$cek['lunas'])
      throw new Exception('Xendit menyatakan invoice belum lunas (' . $cek['status'] . ') — webhook diabaikan.');
    return lunaskan($oid, $cek ? $cek['data'] : $body);
  }
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
    /* SATU MEJA = SATU TIKET PER TAMU.
       Meja 6 orang yang menerbitkan satu QR berarti petugas memindai sekali dan
       lima tamu sisanya masuk tanpa tercatat — atau ditolak di pintu, tergantung
       petugasnya. Kuota kelas di EMS pun sudah dihitung per ORANG (ldzSyncQuota
       menjumlahkan capacity tiap objek), jadi satu tiket per meja membuat angka
       "sisa" ikut meleset sebanyak kapasitas mejanya.

       Nomor tiket berjalan untuk SELURUH pesanan ($urut), bukan indeks item:
       dengan indeks item, enam tamu di meja yang sama akan memegang nomor tiket
       yang sama persis. */
    $urut = 0;
    foreach ($o['items'] as $it) {
      $pax = max(1, (int)(isset($it['capacity']) ? $it['capacity'] : 1));
      // Pesanan lama (sebelum 'kind' ikut disimpan) hanya bisa dikenali dari
      // kapasitasnya. Itu cukup: yang berkapasitas lebih dari satu memang meja.
      $jenis = isset($it['kind']) ? $it['kind'] : ($pax > 1 ? 'table' : 'seat');
      for ($p = 1; $p <= $pax; $p++) {
        $tk = array(
          'id' => uid('tk'), 'order_item_id' => $oid, 'ticket_class_id' => $it['class_id'],
          'seat_id' => $it['seat_id'],
          'ticket_number' => 'LM-' . (1000 + $no + $urut),
          // Token QR: acak penuh, bukan turunan id pesanan. Nomor urut atau
          // id yang bisa ditebak berarti QR palsu bisa dibuat dari rumah.
          'qr_token' => 'QR' . token_acak(20),
          'status' => 'Valid', 'pdf_url' => '', 'seat_label' => $it['label'], 'tier' => $it['tier'],
          // Tamu ke berapa dari meja yang mana. Tanpa ini enam tiket satu meja
          // tampil identik di halaman e-ticket, dan tak ada yang tahu QR mana
          // yang sudah diberikan ke siapa.
          'kind' => $jenis, 'pax_no' => $p, 'pax_total' => $pax,
          'buyer_name' => $o['buyer_name'], 'issued_at' => gmdate('c'),
        );
        $insT->execute(array(':i' => $tk['id'], ':o' => $oid, ':c' => $tk['ticket_class_id'], ':s' => $tk['seat_id'],
          ':n' => $tk['ticket_number'], ':q' => $tk['qr_token'], ':st' => 'Valid', ':u' => now_ms(),
          ':d' => json_encode($tk, JSON_UNESCAPED_UNICODE)));
        $tiket[] = $tk;
        $urut++;
      }
      // Kursinya ditandai terjual SEKALI per tempat, bukan per tiket: satu meja
      // tetap satu baris `seats`, sebanyak apa pun tamu yang duduk di sana.
      if ($it['seat_id']) $updS($it['seat_id']);
    }
    // Kuota kelas tiket ikut naik, supaya angka "sisa" di EMS benar.
    naikkan_sold($o['items']);
    $o['email_eticket'] = kirim_eticket($o, $tiket);
    simpan_order($o);
    // Kunci kursi dilepas: perannya sudah digantikan tiket + status Sold.
    db()->prepare('DELETE FROM seat_holds WHERE order_id = :o')->execute(array(':o' => $oid));
    return array('order_id' => $oid, 'tiket' => count($tiket));
  } finally { tx_unlock(); }
}
/* Yang dihitung ORANG, bukan tempat. Kuota kelas di EMS dibangun dengan
   menjumlahkan capacity tiap objek denah (satu meja 6 orang menyumbang 6),
   jadi menaikkan sold satu per meja membuat "sisa kuota" di EMS melar terus:
   kelas yang tempatnya sudah habis masih dilaporkan menyisakan puluhan tiket. */
function naikkan_sold($items) {
  $hit = array();
  foreach ($items as $it) {
    if (!$it['class_id']) continue;
    $pax = max(1, (int)(isset($it['capacity']) ? $it['capacity'] : 1));
    $hit[$it['class_id']] = (isset($hit[$it['class_id']]) ? $hit[$it['class_id']] : 0) + $pax;
  }
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

/* ==================== KIRIM EMAIL (SMTP) ====================
   Memakai akun email domain sendiri, BUKAN fungsi mail() bawaan PHP. Email
   dari mail() tidak terautentikasi, jadi ia sering mendarat di spam \u2014 dan
   e-ticket yang tidak terbaca sama saja dengan e-ticket yang tidak terkirim.
   Lewat SMTP akun sendiri, kirimannya lolos SPF/DKIM domain.

   Ditulis langsung di atas soket, tanpa pustaka. Repo ini tidak memakai
   composer, dan menambahkan satu hanya untuk mengirim email berarti seluruh
   alur deploy FTP harus ikut memikirkan vendor/.

   PENGIRIMAN TIDAK PERNAH MENGGAGALKAN PELUNASAN. Kalau SMTP mati, uang sudah
   diterima dan tiket sudah terbit \u2014 melempar galat di titik itu akan membuat
   webhook Xendit mengulang terus dan (kalau lunaskan tidak idempoten) bisa
   menerbitkan tiket berkali-kali. Jadi kegagalannya dicatat di pesanan, bukan
   dilempar ke atas. */
function smtp_siap() {
  return defined('SMTP_HOST') && SMTP_HOST !== '' && strpos(SMTP_HOST, 'ISI_') !== 0
      && defined('SMTP_USER') && SMTP_USER !== '' && strpos(SMTP_USER, 'ISI_') !== 0;
}
function smtp_baca($fp, $harap) {
  $balas = '';
  while (($baris = fgets($fp, 515)) !== false) {
    $balas .= $baris;
    if (isset($baris[3]) && $baris[3] === ' ') break;   // baris terakhir multi-line
  }
  $kode = (int)substr($balas, 0, 3);
  if ($harap && $kode !== $harap) throw new Exception('SMTP ' . $kode . ': ' . trim($balas));
  return $balas;
}
function smtp_tulis($fp, $baris, $harap) {
  fwrite($fp, $baris . "\r\n");
  return $harap ? smtp_baca($fp, $harap) : '';
}
function kirim_email($ke, $subjek, $html) {
  if (!smtp_siap()) throw new Exception('SMTP belum dikonfigurasi di server.');
  $port = defined('SMTP_PORT') ? (int)SMTP_PORT : 465;
  // Port 465 memakai TLS sejak detik pertama; 587 mulai polos lalu STARTTLS.
  $alamat = ($port === 465 ? 'ssl://' : 'tcp://') . SMTP_HOST . ':' . $port;
  $ctx = stream_context_create(array('ssl' => array('verify_peer' => true, 'verify_peer_name' => true)));
  $fp = @stream_socket_client($alamat, $errno, $errstr, 20, STREAM_CLIENT_CONNECT, $ctx);
  if (!$fp) throw new Exception('Tidak bisa menghubungi server email: ' . $errstr);
  stream_set_timeout($fp, 20);
  try {
    smtp_baca($fp, 220);
    $host = defined('SMTP_HOST') ? SMTP_HOST : 'localhost';
    smtp_tulis($fp, 'EHLO ' . $host, 250);
    if ($port !== 465) {
      smtp_tulis($fp, 'STARTTLS', 220);
      if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT))
        throw new Exception('Gagal menyalakan TLS.');
      smtp_tulis($fp, 'EHLO ' . $host, 250);
    }
    smtp_tulis($fp, 'AUTH LOGIN', 334);
    smtp_tulis($fp, base64_encode(SMTP_USER), 334);
    smtp_tulis($fp, base64_encode(SMTP_PASS), 235);
    $dari = SMTP_USER;
    $nama = defined('SMTP_FROM_NAME') ? SMTP_FROM_NAME : 'Laksamana Muda';
    smtp_tulis($fp, 'MAIL FROM:<' . $dari . '>', 250);
    smtp_tulis($fp, 'RCPT TO:<' . $ke . '>', 250);
    smtp_tulis($fp, 'DATA', 354);
    $isi = 'From: =?UTF-8?B?' . base64_encode($nama) . "?= <" . $dari . ">\r\n"
         . 'To: <' . $ke . ">\r\n"
         . 'Subject: =?UTF-8?B?' . base64_encode($subjek) . "?=\r\n"
         . "MIME-Version: 1.0\r\n"
         . "Content-Type: text/html; charset=UTF-8\r\n"
         . "Content-Transfer-Encoding: base64\r\n\r\n"
         . chunk_split(base64_encode($html));
    fwrite($fp, $isi . "\r\n.\r\n");
    smtp_baca($fp, 250);
    smtp_tulis($fp, 'QUIT', 0);
  } finally { fclose($fp); }
  return true;
}

/* Isi email e-ticket. QR-nya TIDAK ditempel sebagai gambar: gambar tertanam
   sering diblokir peramban email sampai penerima menekan "tampilkan gambar",
   dan QR yang tidak tampil di pintu masuk adalah kegagalan yang paling buruk
   waktunya. Yang dikirim tautan permanen ke halaman e-ticket \u2014 di sana QR-nya
   digambar, dan statusnya selalu yang terbaru (termasuk kalau sudah check-in). */
function email_eticket_html($o, $tiket) {
  $ev = event_satu_apa_adanya($o['event_id']);
  $judul = $ev ? $ev['title'] : 'Event Laksamana Muda';
  $tautan = site_url() . '/#tiket/' . rawurlencode($o['payment_ref']) . '/' . rawurlencode($o['access_token']);
  $baris = '';
  foreach ($tiket as $t) {
    /* Tiga bentuk tempat, tiga cara menyebutnya. Tiga baris bertuliskan hal
       yang sama persis membuat pembelinya mengira sistemnya salah mengirim
       tiket berulang, lalu meminta dikirim ulang. */
    $pt    = (int)(isset($t['pax_total']) ? $t['pax_total'] : 1);
    $jenis = isset($t['kind']) ? $t['kind'] : ($pt > 1 ? 'table' : 'seat');
    if ($jenis === 'general') {
      $tmp = 'Tanpa nomor tempat' . ($pt > 1 ? ' &middot; Tiket ' . (int)$t['pax_no'] . ' dari ' . $pt : '');
    } else {
      $tmp = ($jenis === 'table' ? 'Meja ' : '') . htmlspecialchars($t['seat_label'])
           . ($pt > 1 ? ' &middot; Tamu ' . (int)$t['pax_no'] . ' dari ' . $pt : '');
    }
    $baris .= '<tr><td style="padding:6px 0;border-bottom:1px solid #E7E1D3">'
      . '<b>' . htmlspecialchars($t['ticket_number']) . '</b> &middot; '
      . $tmp . ' <span style="color:#8C8677">(' . htmlspecialchars($t['tier']) . ')</span>'
      . '</td></tr>';
  }
  return '<div style="font-family:Arial,Helvetica,sans-serif;background:#F7F6F4;padding:24px">'
    . '<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #E7E1D3;border-radius:14px;overflow:hidden">'
    . '<div style="background:#2A2620;color:#fff;padding:20px 24px">'
    . '<div style="font-size:12px;color:#C8961F;letter-spacing:1px">LAKSAMANA MUDA</div>'
    . '<div style="font-size:22px;font-weight:bold;margin-top:4px">' . htmlspecialchars($judul) . '</div>'
    . ($ev ? '<div style="font-size:13px;color:#ccc;margin-top:4px">' . htmlspecialchars($ev['venue']) . '</div>' : '')
    . '</div>'
    . '<div style="padding:22px 24px">'
    . '<p style="margin:0 0 14px">Halo <b>' . htmlspecialchars($o['buyer_name']) . '</b>, pembayaranmu sudah kami terima. Tiketmu siap.</p>'
    . '<table style="width:100%;border-collapse:collapse;font-size:14px">' . $baris . '</table>'
    . '<p style="margin:18px 0 8px;font-size:13px;color:#5C574D">Tunjukkan QR di halaman berikut kepada petugas saat masuk:</p>'
    . '<p><a href="' . htmlspecialchars($tautan) . '" style="display:inline-block;background:#A9791F;color:#fff;'
    . 'padding:12px 20px;border-radius:9px;text-decoration:none;font-weight:bold">Buka e-ticket</a></p>'
    . '<p style="font-size:12px;color:#8C8677;margin-top:16px">Simpan email ini. Tautan di atas berlaku permanen dan hanya bisa dibuka olehmu.<br>'
    . 'Kode pesanan: <b>' . htmlspecialchars($o['payment_ref']) . '</b></p>'
    . '</div></div></div>';
}

/* Dipanggil dari lunaskan(). Sengaja menelan galatnya sendiri \u2014 lihat
   catatan di atas: uang sudah masuk dan tiket sudah terbit, jadi email yang
   gagal tidak boleh membatalkan apa pun. Jejaknya disimpan di pesanan supaya
   bisa ditelusuri, bukan hilang tanpa bekas. */
function kirim_eticket($o, $tiket) {
  if (!smtp_siap()) return array('ok' => false, 'sebab' => 'SMTP belum dikonfigurasi');
  try {
    $ev = event_satu_apa_adanya($o['event_id']);
    kirim_email($o['email'], 'E-Ticket ' . ($ev ? $ev['title'] : 'Laksamana Muda') . ' \u2014 ' . $o['payment_ref'],
                email_eticket_html($o, $tiket));
    return array('ok' => true, 'at' => gmdate('c'));
  } catch (Throwable $e) {
    return array('ok' => false, 'sebab' => $e->getMessage(), 'at' => gmdate('c'));
  }
}

/* ==================== STATUS PESANAN & E-TICKET ====================
   Dibuka dengan ref + access_token, bukan dengan email saja. Email mudah
   ditebak; kalau itu kuncinya, siapa pun bisa memanggil QR tiket orang
   lain dan masuk lebih dulu. */
/* JANGAN HANYA BERGANTUNG PADA WEBHOOK.
   Webhook bisa tidak pernah sampai: URL-nya salah didaftarkan, tokennya beda,
   server sempat mati, atau jaringannya putus. Kalau itu satu-satunya jalan,
   pembeli sudah membayar tapi tiketnya tidak pernah terbit — dan tidak ada
   seorang pun yang tahu sampai ia mengeluh di pintu masuk. Sudah terjadi saat
   pemasangan ini: pembayaran sampai ke Xendit, tickets tidak bertambah satu pun.

   Jadi saat halaman tiket dibuka dan pesanannya masih Pending, kita TANYA
   Xendit langsung. Kalau di sana sudah PAID, pelunasannya dijalankan lewat
   lunaskan() yang sama dengan jalur webhook — idempoten, jadi webhook yang
   datang terlambat tidak menerbitkan tiket kedua. */
function selaraskan_xendit($o) {
  if ($o['payment_status'] !== 'Pending') return $o;
  $inv = isset($o['payment']['invoice_id']) ? $o['payment']['invoice_id'] : '';
  if ($inv === '' || strpos($inv, 'SIM-') === 0) return $o;   // invoice simulasi tak ada di Xendit
  if (strpos(xendit_mode(), 'belum diisi') === 0) return $o;
  $ch = curl_init('https://api.xendit.co/v2/invoices/' . rawurlencode($inv));
  curl_setopt_array($ch, array(CURLOPT_RETURNTRANSFER => true, CURLOPT_USERPWD => XENDIT_SECRET . ':', CURLOPT_TIMEOUT => 20));
  $res = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  if ($res === false || $code >= 300) return $o;
  $d = json_decode($res, true);
  $st = strtoupper(isset($d['status']) ? $d['status'] : '');
  if ($st === 'PAID' || $st === 'SETTLED') {
    lunaskan($o['id'], $d);
    $r2 = ambil('SELECT data FROM orders WHERE id = :i', array(':i' => $o['id']));
    if ($r2) return $r2[0];
  } else if ($st === 'EXPIRED') {
    batalkan($o['id'], 'EXPIRED');
  }
  return $o;
}
function status_pesanan($ref, $akses) {
  /* Ditahan juga di sini: access_token 24 karakter acak memang tidak realistis
     ditebak, tapi endpoint ini membuka DATA PEMBELI (nama, email) dan QR-nya.
     Membiarkan ribuan percobaan per menit berjalan diam-diam berarti tidak ada
     yang pernah tahu kalau ada yang mencoba. */
  tahan_percobaan('tiket', $ref, 20, 10);
  $rows = ambil('SELECT data FROM orders WHERE payment_ref = :r', array(':r' => $ref));
  if (!$rows) { catat_gagal('tiket', $ref); throw new Exception('Pesanan tidak ditemukan.'); }
  $o = $rows[0];
  if (!isset($o['access_token']) || !hash_equals((string)$o['access_token'], (string)$akses)) {
    catat_gagal('tiket', $ref);
    throw new Exception('Tautan tiket tidak sah.');
  }
  $o = selaraskan_xendit($o);
  $ev = event_satu($o['event_id']);
  $tiket = array();
  if ($o['payment_status'] === 'Paid') {
    foreach (ambil('SELECT data FROM tickets WHERE order_item_id = :o', array(':o' => $o['id'])) as $t) {
      $tiket[] = array('ticket_number' => $t['ticket_number'], 'qr_token' => $t['qr_token'],
                       'seat_label' => isset($t['seat_label']) ? $t['seat_label'] : '',
                       'kind' => isset($t['kind']) ? $t['kind'] : 'seat',
                       'pax_no' => (int)(isset($t['pax_no']) ? $t['pax_no'] : 1),
                       'pax_total' => (int)(isset($t['pax_total']) ? $t['pax_total'] : 1),
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
