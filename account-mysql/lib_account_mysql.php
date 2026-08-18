<?php
/************************************************************************
 * ACCOUNT — Backend PHP + MySQL (daftar user & hak akses Office)
 * ---------------------------------------------------------------------
 * Pengganti Apps Script + Google Sheet yang selama ini memegang daftar
 * user Office. Kontraknya DISALIN PERSIS dari docs/office-apps-script.gs:
 * nama aksi, bentuk balasan, dan kode error-nya tidak berubah, supaya
 * frontend cukup mengganti URL-nya saja.
 *
 * Perilaku yang sengaja dipertahankan apa adanya:
 *   - Login memakai nama + PIN. PIN BOLEH sama antar user; nama yang
 *     membedakan. Nama dicocokkan tanpa membedakan huruf besar-kecil.
 *   - grants '*' diperluas atas modul AKTIF, lalu baris per-modul menimpa:
 *     access=1 memberi, access=0 mencabut (termasuk mencabut dari '*').
 *   - Superadmin terakhir tidak boleh mencabut '*' dari dirinya sendiri,
 *     dan tidak ada yang boleh menghapus akunnya sendiri.
 *   - syncModules hanya MENAMBAH key baru; label & status milik admin
 *     tidak pernah ditimpa, dan baris tidak pernah dihapus.
 *   - listModuleRoster sengaja TANPA gerbang kredensial: dipanggil otomatis
 *     tiap modul saat boot. Yang dikembalikan hanya nama, keterangan,
 *     status aktif, dan apakah dia admin modul itu — tidak ada PIN.
 *
 * File ini HANYA berisi fungsi (tanpa efek samping saat di-include).
 ************************************************************************/

/* config.local.php dipakai KALAU ADA — untuk tes di laptop tanpa mengubah
   config.php produksi. (config.local.php sudah di-ignore git.) */
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
  pastikan_kolom_no_hp($pdo);
  return $pdo;
}
/* No HP ditambahkan belakangan. Database yang terlanjur dibuat tanpa kolom ini
   akan menabrak setiap SELECT yang menyebut no_hp. Daripada menyuruh admin
   menjalankan ALTER manual (butuh akses DB langsung yang tak selalu ada),
   kolomnya dibuat OTOMATIS saat koneksi pertama — cek information_schema dulu,
   ALTER hanya kalau memang belum ada. Sekali jadi, cek berikutnya nihil biaya. */
function pastikan_kolom_no_hp($pdo) {
  try {
    $st = $pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = \'users\' AND COLUMN_NAME = \'no_hp\'');
    $st->execute();
    if ((int)$st->fetchColumn() === 0)
      $pdo->exec('ALTER TABLE `users` ADD COLUMN `no_hp` VARCHAR(32) NOT NULL DEFAULT \'\' AFTER `keterangan`');
  } catch (Exception $e) { /* hak DDL tidak ada / balapan antar-request: abaikan, biar SELECT yang menegur */ }
}
function q($sql, $args = array()) { $st = db()->prepare($sql); $st->execute($args); return $st; }
function s($v) { return trim((string)$v); }

/* ==================== BACA DASAR ==================== */

/* Baris yang benar-benar berisi user. Menirukan realUsers_() di Apps
   Script, yang membuang baris Sheet setengah kosong supaya tidak muncul
   sebagai user hantu "?" di daftar. */
function semua_user() {
  return q('SELECT id, name, pin, active, keterangan, no_hp, talenta_id, username FROM `users`
            WHERE TRIM(id) <> \'\' AND TRIM(name) <> \'\'
            ORDER BY name ASC')->fetchAll();
}
function user_by_id($id) {
  $r = q('SELECT id, name, pin, active, keterangan, no_hp, talenta_id, username FROM `users` WHERE id = :i LIMIT 1',
         array(':i' => s($id)))->fetch();
  return $r ?: null;
}
/* Cocokkan nama + PIN + tidak nonaktif. PIN boleh duplikat antar user
   karena nama ikut jadi kunci — persis findUserByCreds_(). LOWER() dipakai
   eksplisit supaya tidak bergantung pada collation database. */
function user_by_creds($name, $pin) {
  /* Yang diketik boleh USERNAME atau NAMA RESMI. Username didahulukan:
     kalau seseorang menetapkan username yang kebetulan sama dengan nama
     resmi orang lain, pemilik username-lah yang menang — dan itu tidak akan
     terjadi karena username_bentrok() menolaknya sejak awal. Urutan ini
     ditulis eksplisit supaya perilakunya pasti, bukan bergantung pada
     urutan baris di tabel.

     Username kosong TIDAK boleh ikut tercocokkan: kalau tidak, login dengan
     nama kosong akan menyambar user pertama yang belum punya username. */
  $u = mb_strtolower(trim(s($name)), 'UTF-8');
  if ($u === '') return null;

  $r = q('SELECT id, name, pin, active, keterangan, talenta_id, username FROM `users`
          WHERE TRIM(username) <> \'\' AND LOWER(TRIM(username)) = :n
            AND TRIM(pin) = :p AND active = 1
          LIMIT 1',
         array(':n' => $u, ':p' => s($pin)))->fetch();
  if ($r) return $r;

  $r = q('SELECT id, name, pin, active, keterangan, talenta_id, username FROM `users`
          WHERE LOWER(TRIM(name)) = :n AND TRIM(pin) = :p AND active = 1
          LIMIT 1',
         array(':n' => $u, ':p' => s($pin)))->fetch();
  return $r ?: null;
}

/* Apakah $cand sudah dipakai orang lain, sebagai username ATAU sebagai nama
   resmi? Dipakai sebelum menyimpan username maupun sebelum admin mengubah
   nama resmi. Tanpa pemeriksaan LINTAS KOLOM ini, "Rizky Kemala" bisa
   mengambil username "Rizki Arfan" dan login jadi mengarah ke akun keliru. */
function identitas_bentrok($cand, $kecualiId) {
  $c = mb_strtolower(trim(s($cand)), 'UTF-8');
  if ($c === '') return null;
  /* :c1 dan :c2 sengaja DUA placeholder berbeda meski nilainya sama.
     Koneksi ini memakai PDO::ATTR_EMULATE_PREPARES = false, jadi prepared
     statement-nya asli MySQL — dan di mode itu satu placeholder bernama
     hanya boleh muncul SEKALI. Memakai :c dua kali menghasilkan
     SQLSTATE[HY093] Invalid parameter number. */
  $r = q('SELECT id, name, username FROM `users`
          WHERE id <> :i AND (LOWER(TRIM(name)) = :c1
                          OR (TRIM(username) <> \'\' AND LOWER(TRIM(username)) = :c2))
          LIMIT 1',
         array(':i' => s($kecualiId), ':c1' => $c, ':c2' => $c))->fetch();
  return $r ?: null;
}

/* Aturan bentuk username. Longgar tapi cukup untuk mencegah kegagalan login
   yang tidak bisa dijelaskan: tanpa spasi (orang tidak sadar mengetik dua),
   tanpa karakter tak terlihat, dan cukup panjang untuk tidak asal tabrakan. */
function username_valid($v) {
  return (bool)preg_match('/^[A-Za-z0-9._-]{3,40}$/', $v);
}
// Key modul AKTIF di registri.
/* ==================== AKSES BAWAAN ====================
   Modul yang dipegang seseorang TANPA perlu dicentang di Kelola Akses.

   Sekarang cuma satu: `jadwal`. Alasannya, dan ini yang membuat aturannya
   layak ditulis di kode alih-alih jadi empat puluhan centang:

   Jadwal Shift adalah PAPAN JADWAL. Siapa pun yang namanya digambar di salah
   satu lembar divisi jelas perlu membukanya untuk melihat jadwalnya sendiri.
   Memberikannya lewat centang berarti satu kotak yang harus diingat tiap kali
   ada orang baru — dan yang terlewat tidak pernah melapor: orangnya cuma
   tidak bisa membuka modulnya. Lebih buruk lagi karena kartu Roster memuat DUA
   kunci bersebelahan di Kelola Akses ("Roster · Jadwal Shift" dan
   "Roster · Daily Worker"), jadi yang tertukar centang mendarat di modul
   Daily Worker — alat HR berisi nomor HP seluruh pekerja harian, yang sama
   sekali bukan urusan kru dapur.

   DASARNYA KOLOM TIM, bukan "punya akun". Yang otomatis dapat: kru shift
   (Kitchen, Bar, Floor, Cashier), ditambah HRD dan CEO yang tidak masuk lembar
   mana pun tapi memang perlu membaca jadwal seluruh perusahaan. Admin modul
   Jadwal juga, karena mustahil mengelola modul yang tidak bisa dibuka.

   Katanya SENGAJA SAMA dengan DIV_SINONIM di deploy/jadwal/index.html, dan itu
   bukan kebetulan: yang menentukan seseorang masuk lembar Bar adalah kata yang
   sama persis. Jadi aturannya bisa dibaca sebagai satu kalimat — kalau namanya
   muncul di sebuah lembar divisi, ia bisa membuka lembarnya. Kalau salah satu
   daftar diubah tanpa yang lain, akan ada orang yang tergambar di lembar tapi
   tidak bisa membukanya, dan tidak ada satu layar pun yang menyebut kenapa.

   `dw` sengaja TIDAK pernah bawaan: daily worker BUKAN pegawai tetap dan tidak
   punya akun di sini sama sekali; modulnya alat HR dan tetap harus dicentang. */
function tim_bawaan_jadwal() {
  return array(
    'kitchen', 'dapur',
    'bar', 'bartender',
    'floor', 'service', 'waiter', 'waitress', 'host', 'hostess',
    'cashier', 'kasir',
    'hrd', 'hr',
    'ceo',
  );
}
/* Dicocokkan sebagai KATA UTUH — "Barista" tidak boleh terbaca sebagai "bar",
   dan "Chef" tidak terbaca sebagai apa pun. Aturan yang sama dipakai modul
   lain saat membaca kolom Tim (lihat pur_tim_pemanggil di stock-mysql). */
function tim_cocok($keterangan, $daftar) {
  $kata = preg_split('/[^a-z]+/', strtolower((string)$keterangan), -1, PREG_SPLIT_NO_EMPTY);
  if (!is_array($kata)) return false;
  foreach ($daftar as $x) if (in_array($x, $kata, true)) return true;
  return false;
}
/* ==================== AKSES TERBATAS ====================
   Kebalikan dari bawaan: modul yang TIDAK BOLEH dipegang siapa pun di luar
   peran tertentu — bahkan kalau kotaknya terlanjur tercentang, bahkan kalau
   orangnya punya '*'.

   Sekarang cuma `dw`. Modul Daily Worker adalah alat HR: isinya nomor HP
   SELURUH pekerja harian, status PIN masing-masing, daftar transfer beserta
   nomor rekening, dan tombol yang menyetujui shift — dan shift yang disetujui
   itu langsung jadi uang yang harus ditransfer minggu itu. Tidak ada satu pun
   alasan kru dapur atau kasir perlu membukanya.

   Ditulis sebagai aturan, bukan diserahkan ke ketelitian mencentang: kartu
   Roster memuat dua kunci bersebelahan yang namanya sama-sama diawali
   "Roster · ", dan yang tertukar sudah terbukti terjadi berulang kali. Yang
   tertukar sekarang tidak berakibat apa-apa — grant-nya diabaikan.

   Daily worker SENDIRI tidak lewat sini sama sekali: mereka tidak punya akun
   Office, tidak muncul di Kelola User, dan membuka modulnya langsung lewat
   tautannya sendiri dengan no HP + PIN (lihat loginDW di dw-mysql). */
function tim_boleh_dw() {
  return array('hrd', 'hr', 'ceo');
}

/* ==================== SIAPA HEAD DIVISI ====================
   Daftarnya TIDAK ada di sini. Ia tinggal di `jadwal_setting` milik modul
   Jadwal Shift, karena di sanalah admin menunjuknya lewat layar Head Divisi —
   dan menyalinnya ke Office berarti dua daftar yang bisa berbeda isi, dengan
   yang salah selalu yang jarang dilihat.

   Jadi ditanyakan langsung, server-ke-server, lewat action=headIds. Yang
   dipulangkan cuma id + kode divisi.

   TIGA HAL YANG MENJAGA INI TIDAK MERUSAK LOGIN:
     1. Hanya dipanggil saat memang perlu — lihat modul_bawaan_untuk(), yang
        menanyakannya HANYA untuk orang yang belum lolos lewat kolom Tim atau
        status admin. Jadi HRD, CEO, dan kru shift biasa tidak pernah memicu
        satu pun permintaan tambahan.
     2. Di-cache sepanjang satu permintaan.
     3. Gagal = array kosong, BUKAN melempar. Modul Jadwal yang mati tidak
        boleh mematikan login seluruh Office; yang terjadi paling jauh seorang
        head kehilangan kunci modul DW-nya sampai modul itu hidup lagi. */
function jadwal_api_url() {
  if (defined('JADWAL_API_URL') && JADWAL_API_URL !== '') return JADWAL_API_URL;
  $host = isset($_SERVER['SERVER_NAME']) ? $_SERVER['SERVER_NAME']
        : (isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '');
  if ($host === '') return '';
  $skema = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
  return $skema . '://' . $host . '/jadwal-api-mysql/api.php';
}
/* Berkas cache berumur pendek untuk daftar head.
   ---------------------------------------------------------------------
   TANPA INI biayanya nyata dan tersembunyi. modul_untuk() memanggil
   adalah_head() untuk SETIAP orang yang tidak lolos lewat kolom Tim atau
   status admin — dan itu mencakup seluruh kru shift, yaitu hampir semua
   orang. modul_untuk() sendiri dijalankan oleh whoami, yang dipanggil:

     - dw-mysql dan jadwal-mysql pada TIAP permintaan API, dan
     - absensi-mysql pada TIAP KETUKAN ABSEN.

   Jadi satu ketukan absen memicu rantai HTTP bersarang absensi -> account ->
   jadwal, masing-masing dengan timeout sendiri. Saat modul Jadwal lambat,
   yang melambat adalah absensi — modul yang sama sekali tidak ada urusannya,
   dan tidak ada satu pun layar yang bisa menjelaskan kenapa.

   60 detik dipilih karena "siapa head divisi" berubah paling sering sebulan
   sekali; basi satu menit tidak pernah merugikan siapa pun, sedangkan satu
   permintaan HTTP per ketukan absen jelas merugikan.

   Kegagalan menulis/membaca cache DIABAIKAN — ia kembali ke perilaku tanpa
   cache, bukan menggagalkan apa pun. */
function head_cache_path() {
  $dir = sys_get_temp_dir();
  if (!$dir || !is_dir($dir)) return '';
  /* Nama memuat DB_NAME: dev dan produksi bisa berbagi host, dan cache yang
     tertukar berarti head dev dipakai memutuskan hak akses produksi. */
  $kunci = defined('DB_NAME') ? DB_NAME : 'lm';
  return $dir . DIRECTORY_SEPARATOR . 'lm-head-' . md5((string)$kunci) . '.json';
}
function head_divisi_peta() {
  static $cache = null;
  if ($cache !== null) return $cache;

  $berkas = head_cache_path();
  if ($berkas !== '' && is_file($berkas) && (time() - (int)@filemtime($berkas)) < 60) {
    $isi = @file_get_contents($berkas);
    if ($isi !== false && $isi !== '') {
      $d = json_decode($isi, true);
      if (is_array($d)) return $cache = $d;
    }
  }

  $cache = array();
  $url = jadwal_api_url();
  if ($url === '') return $cache;
  $berhasil = false;
  try {
    $jawab = null;
    /* Timeout PENDEK (3 detik), bukan 8 seperti panggilan lain: ini duduk di
       jalur login dan whoami, dan yang menunggu adalah orang yang sedang
       menatap layar putih. Lebih baik seorang head kehilangan kunci DW-nya
       selama modul Jadwal bermasalah daripada seluruh Office terasa mati. */
    if (function_exists('curl_init')) {
      $ch = curl_init($url . '?action=headIds');
      curl_setopt_array($ch, array(
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 3,
        CURLOPT_CONNECTTIMEOUT => 2, CURLOPT_FOLLOWLOCATION => true,
      ));
      $jawab = curl_exec($ch);
      curl_close($ch);
    } else {
      $ctx = stream_context_create(array('http' => array('timeout' => 3)));
      $jawab = @file_get_contents($url . '?action=headIds', false, $ctx);
    }
    if (!is_string($jawab) || $jawab === '') return $cache;
    $d = json_decode($jawab, true);
    if (is_array($d) && !empty($d['ok']) && isset($d['data']['heads']) && is_array($d['data']['heads'])) {
      $cache = $d['data']['heads'];
      $berhasil = true;
    }
  } catch (Exception $e) { $cache = array(); }

  /* Hanya hasil yang BERHASIL yang di-cache. Menyimpan hasil gagal berarti
     memperpanjang gangguan modul Jadwal selama satu menit lagi untuk seluruh
     Office — dan daftar head yang kosong karena gangguan tidak bisa dibedakan
     dari daftar head yang memang belum diisi. Daftar kosong yang SAH tetap
     di-cache: itu jawaban yang benar, dan pemasangan yang belum menunjuk head
     justru yang paling sering menanyakannya. */
  if ($berhasil && $berkas !== '') {
    @file_put_contents($berkas, json_encode($cache), LOCK_EX);
  }
  return $cache;
}
function adalah_head($userId) {
  $peta = head_divisi_peta();
  return isset($peta[s($userId)]) && count($peta[s($userId)]) > 0;
}
function aturan_terbatas() {
  return array(array('module' => 'dw', 'tim' => tim_boleh_dw(),
                     'adminModul' => true, 'head' => true));
}
/* Boleh memegang modul yang dibatasi? Superadmin ('*' di tabel admins) dan
   admin modul itu sendiri selalu boleh — mustahil mengelola modul yang tidak
   bisa dibuka. */
function boleh_modul_terbatas($userId, $aturan) {
  try {
    $u = user_by_id($userId);
    $ket = $u ? s($u['keterangan']) : '';
    $adm = admin_modul_untuk($userId);
    if (in_array('*', $adm, true)) return true;
    if (!empty($aturan['adminModul']) && in_array($aturan['module'], $adm, true)) return true;
    if (tim_cocok($ket, $aturan['tim'])) return true;
    /* Head divisi ikut boleh. Head-lah yang mengajukan kebutuhan daily worker
       divisinya, jadi mustahil ia diminta melakukannya tanpa bisa membuka
       modulnya. Ditanyakan paling akhir supaya HRD/CEO/admin tidak pernah
       memicu permintaan ke modul Jadwal. */
    return !empty($aturan['head']) && adalah_head($userId);
  } catch (Exception $e) {
    /* Gagal memastikan = JANGAN dicabut. Fungsi ini dipakai login dan whoami
       setiap modul; mencabut akses gara-gara satu kueri gagal akan terbaca
       sebagai "modulnya hilang" oleh orang yang memang berhak. */
    return true;
  }
}

/* Aturan akses bawaan dalam bentuk yang bisa dikirim ke layar. Dipulangkan
   listUsers/listAccess/listModules supaya Kelola Akses menggambar centangnya
   sebagai OTOMATIS untuk orang yang memenuhi syarat — kotak kosong di sana
   terbaca "belum punya akses" padahal punya, dan admin akan menambahkan
   centang yang tidak menambah apa pun. */
function aturan_bawaan() {
  return array(array('module' => 'jadwal', 'tim' => tim_bawaan_jadwal(), 'adminModul' => true));
}
function modul_bawaan_untuk($userId) {
  static $cache = array();
  $uid = s($userId);
  if (isset($cache[$uid])) return $cache[$uid];
  $out = array();
  try {
    $u = user_by_id($uid);
    $ket = $u ? s($u['keterangan']) : '';
    $adm = admin_modul_untuk($uid);
    if (tim_cocok($ket, tim_bawaan_jadwal())
        || in_array('*', $adm, true) || in_array('jadwal', $adm, true)) {
      $out[] = 'jadwal';
    }
    /* Modul Daily Worker OTOMATIS untuk HRD/CEO dan untuk HEAD DIVISI —
       head yang mengajukan kebutuhan DW divisinya, HRD yang menyetujui dan
       menunjuk orangnya. Keduanya tidak perlu dicentang satu per satu.

       `adalah_head()` ditanyakan PALING AKHIR dan hanya kalau syarat lain
       belum terpenuhi: ia memicu satu permintaan ke modul Jadwal, dan tidak
       ada gunanya membayar itu untuk orang yang sudah jelas berhak. */
    if (tim_cocok($ket, tim_boleh_dw())
        || in_array('*', $adm, true) || in_array('dw', $adm, true)
        || adalah_head($uid)) {
      $out[] = 'dw';
    }
  } catch (Exception $e) {
    /* Diam, dan memulangkan kosong. Fungsi pemanggilnya (modul_untuk) dipakai
       login dan whoami SETIAP modul — satu galat di sini mematikan seluruh
       Office, bukan cuma fitur ini. Gagal di sini artinya kembali ke perilaku
       lama: aksesnya harus dicentang manual. */
    $out = array();
  }
  return $cache[$uid] = $out;
}
function semua_modul_aktif() {
  $out = array();
  foreach (q('SELECT `key` FROM `modules` WHERE active = 1 ORDER BY urut ASC, `key` ASC') as $r)
    if (s($r['key']) !== '') $out[] = s($r['key']);
  return $out;
}

/* ==================== RESOLUSI AKSES ==================== */

/* Modul yang boleh DIBUKA user. grants adalah satu-satunya sumber.
   Urutannya penting dan disalin dari modulesFor_():
     1) '*' lebih dulu -> semua modul aktif masuk,
     2) baris per-modul menimpa (1 = beri, 0 = cabut).
   Dibalik urutannya, deny spesifik akan tertelan oleh '*'. */
function modul_untuk($userId) {
  $uid = s($userId);
  $rows = q('SELECT `module`, `access` FROM `grants` WHERE user_id = :u', array(':u' => $uid))->fetchAll();

  $eff = array();
  /* 0) AKSES BAWAAN menurut kolom Tim — lihat modul_bawaan_untuk().
     Ditaruh PALING DULU supaya baris deny eksplisit (access=0) di langkah 2
     tetap bisa mencabutnya untuk orang tertentu; kalau ditaruh belakangan,
     pencabutan itu tidak akan pernah berlaku dan tidak ada satu layar pun yang
     menjelaskan kenapa. */
  foreach (modul_bawaan_untuk($uid) as $k) $eff[$k] = true;
  foreach ($rows as $g) {                       // 1) bintang
    if (s($g['module']) !== '*') continue;
    if ((int)$g['access'] === 1)
      foreach (semua_modul_aktif() as $k) $eff[$k] = true;
  }
  foreach ($rows as $g) {                       // 2) per modul
    $m = s($g['module']);
    if ($m === '' || $m === '*') continue;
    if ((int)$g['access'] === 1) $eff[$m] = true;
    else                        unset($eff[$m]);
  }
  /* 3) AKSES TERBATAS — dijalankan PALING AKHIR supaya tidak ada satu pun
     langkah di atas yang bisa mengembalikannya, termasuk '*'. Modul Daily
     Worker dicabut dari siapa pun di luar HRD/CEO/admin modul, apa pun yang
     tercentang. Lihat aturan_terbatas(). */
  foreach (aturan_terbatas() as $r) {
    if (isset($eff[$r['module']]) && !boleh_modul_terbatas($uid, $r)) unset($eff[$r['module']]);
  }
  $out = array_keys($eff);
  sort($out);
  return $out;
}
// Modul yang boleh DIKELOLA (buka konsol Kelola Akses). '*' = semua.
function admin_modul_untuk($userId) {
  $out = array();
  foreach (q('SELECT `module` FROM `admins` WHERE user_id = :u', array(':u' => s($userId))) as $r)
    if (s($r['module']) !== '') $out[] = s($r['module']);
  return $out;
}
/* Modul yang PUNYA baris grant access=1, apa adanya ('*' tetap '*').
   Dipakai form Kelola Akses supaya centangnya mencerminkan isi tabel,
   bukan hasil perluasan. */
function grant_mentah_untuk($userId) {
  $out = array();
  foreach (q('SELECT `module` FROM `grants` WHERE user_id = :u AND access = 1', array(':u' => s($userId))) as $r)
    if (s($r['module']) !== '') $out[] = s($r['module']);
  return $out;
}
/* Modul yang PUNYA baris grant access=0 — pengecualian eksplisit.
   ---------------------------------------------------------------------
   Baris ini menimpa '*' (lihat modul_untuk) dan TIDAK pernah hilang
   sendiri: sekali sebuah modul dilepas centangnya, memberi '*' kemudian
   tidak mengembalikannya. Sebelumnya baris ini tidak pernah dikirim ke
   frontend, jadi Kelola Akses menggambar centang yang BOHONG: modul yang
   ditolak tetap tampak tercentang karena user punya '*', dan tidak ada
   satu pun cara di layar untuk melihat — apalagi mencabut — penolakannya. */
function deny_mentah_untuk($userId) {
  $out = array();
  foreach (q('SELECT `module` FROM `grants` WHERE user_id = :u AND access = 0', array(':u' => s($userId))) as $r)
    if (s($r['module']) !== '') $out[] = s($r['module']);
  return $out;
}

/* ==================== PREDIKAT OTORISASI ====================
   Setiap tulisan membawa nama+PIN pemanggil dan diverifikasi ULANG di
   sini. Browser hanya menyembunyikan tombol; server yang menentukan. */
function butuh_superadmin($body) {
  $caller = user_by_creds(isset($body['callerName']) ? $body['callerName'] : '',
                          isset($body['callerPin'])  ? $body['callerPin']  : '');
  if (!$caller) return null;
  return in_array('*', admin_modul_untuk($caller['id']), true) ? $caller : null;
}
function butuh_admin_modul($body, $module) {
  $caller = user_by_creds(isset($body['callerName']) ? $body['callerName'] : '',
                          isset($body['callerPin'])  ? $body['callerPin']  : '');
  if (!$caller) return null;
  $adm = admin_modul_untuk($caller['id']);
  return (in_array('*', $adm, true) || in_array($module, $adm, true)) ? $caller : null;
}

/* ==================== AUTH ==================== */

/* Token sesi. Dibuat saat login, dipakai modul lain untuk membuktikan siapa
   yang memanggil API-nya tanpa pernah menyentuh PIN.

   Sesi kedaluwarsa dibersihkan sambil lalu di sini, bukan lewat cron: tabelnya
   kecil dan ini satu-satunya jalan masuk, jadi tidak ada yang menumpuk. */
/* Tabel sessions dibuat sendiri saat pertama dibutuhkan.
   ---------------------------------------------------------------------
   Dibuat begini karena tidak ada yang menjalankan schema.sql otomatis saat
   deploy: kode baru mendarat lebih dulu, tabelnya menyusul manual. Sekali
   urutan itu meleset, SELURUH login mati — dan itu memang sempat terjadi di
   dev begitu deploy otomatis menyalip pembuatan tabelnya.

   Dijalankan sekali per permintaan (penanda statis), dan CREATE TABLE IF NOT
   EXISTS memang tidak melakukan apa-apa kalau tabelnya sudah ada. */
function pastikan_tabel_sessions() {
  static $sudah = false;
  if ($sudah) return;
  $sudah = true;
  q('CREATE TABLE IF NOT EXISTS `sessions` (
       `token`   VARCHAR(64) NOT NULL,
       `user_id` VARCHAR(64) NOT NULL,
       `expiry`  BIGINT      NOT NULL,
       `dibuat`  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (`token`),
       KEY `idx_sessions_user` (`user_id`),
       KEY `idx_sessions_expiry` (`expiry`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
}

/* Kegagalan di sini TIDAK BOLEH menggagalkan login.
   Token itu tambahan: tanpanya orang tetap bisa masuk dan memakai Office,
   yang hilang cuma pembatasan per tim di modul stock. Membiarkan galatnya
   naik akan menukar fitur tambahan dengan satu-satunya pintu masuk — harga
   yang tidak sebanding, dan persis itu yang terjadi di dev. */
function buat_token_sesi($userId) {
  try {
    pastikan_tabel_sessions();
    $token = bin2hex(random_bytes(32));
    $sekarang = (int)(microtime(true) * 1000);
    $expiry = $sekarang + (24 * 3600 * 1000);   // 24 jam, sama dengan SESSION_HOURS di Office
    q('DELETE FROM `sessions` WHERE expiry < :n', array(':n' => $sekarang));
    q('INSERT INTO `sessions` (token, user_id, expiry) VALUES (:t, :u, :e)',
      array(':t' => $token, ':u' => s($userId), ':e' => $expiry));
    return $token;
  } catch (Throwable $e) {
    return '';      // login tetap jalan, cuma tanpa token
  }
}

/* Siapa pemilik token ini. null = token tidak dikenal, kedaluwarsa, atau
   akunnya sudah dinonaktifkan. Yang terakhir penting: menonaktifkan akun
   harus langsung berlaku, bukan menunggu tokennya habis sendiri. */
function user_dari_token($token) {
  $token = s($token);
  if ($token === '') return null;
  try {
    pastikan_tabel_sessions();
    $r = q('SELECT user_id, expiry FROM `sessions` WHERE token = :t LIMIT 1',
           array(':t' => $token))->fetch();
    if (!$r) return null;
    if ((int)$r['expiry'] < (int)(microtime(true) * 1000)) {
      q('DELETE FROM `sessions` WHERE token = :t', array(':t' => $token));
      return null;
    }
    $u = user_by_id(s($r['user_id']));
    if (!$u || (int)$u['active'] !== 1) return null;
    return $u;
  } catch (Throwable $e) {
    // Tidak bisa dipastikan = tidak diakui. Aman ke arah yang benar:
    // gagal di sini berarti menolak, bukan meloloskan.
    return null;
  }
}

/* Dipanggil modul lain (mis. stock) untuk menanyakan "token ini milik siapa,
   dan dia berhak apa". Tidak pernah membalas PIN.

   `keterangan` ikut dibalas karena itulah tim kru (Kitchen/Bar/Floor) —
   modul stock memakainya untuk membatasi data yang boleh dilihat. */
function aksi_whoami($body) {
  $u = user_dari_token(isset($body['token']) ? $body['token'] : '');
  if (!$u) return array('ok' => false, 'error' => 'invalid_token');
  return array('ok' => true, 'user' => array(
    'id'           => s($u['id']),
    'name'         => s($u['name']),
    'username'     => s($u['username']),
    'keterangan'   => s($u['keterangan']),
    'modules'      => modul_untuk($u['id']),
    'adminModules' => admin_modul_untuk($u['id']),
    /* Divisi yang di-head orang ini, mis. ['bar']. Ikut dibawa supaya modul
       yang menanyakan identitas (dw, jadwal) tidak perlu bertanya sekali lagi
       ke modul Jadwal — satu perjalanan server-ke-server, bukan dua. Kosong
       untuk yang bukan head. */
    'headDivisi'   => (function ($id) {
                        $p = head_divisi_peta();
                        return isset($p[$id]) ? array_values($p[$id]) : array();
                      })(s($u['id'])),
  ));
}

function aksi_logout($body) {
  $t = s(isset($body['token']) ? $body['token'] : '');
  if ($t !== '') q('DELETE FROM `sessions` WHERE token = :t', array(':t' => $t));
  return array('ok' => true);
}

function aksi_login($name, $pin) {
  $name = s($name); $pin = s($pin);
  if ($name === '' || $pin === '') return array('ok' => false, 'error' => 'missing');
  $u = user_by_creds($name, $pin);
  if (!$u) return array('ok' => false, 'error' => 'invalid');
  return array('ok' => true, 'user' => array(
    'id'           => s($u['id']) !== '' ? s($u['id']) : ('u-' . mb_strtolower($name, 'UTF-8')),
    'name'         => s($u['name']),
    'username'     => s($u['username']),
    'keterangan'   => s($u['keterangan']),
    'modules'      => modul_untuk($u['id']),
    'adminModules' => admin_modul_untuk($u['id']),
    'token'        => buat_token_sesi($u['id']),
  ));
}
/* User mengganti PIN-nya sendiri. TANPA verifikasi PIN lama: identitasnya
   sudah dibuktikan oleh sesi Office yang sedang berjalan. PIN baru tidak
   dicek keunikannya — tabrakan antar user tidak masalah. */
function aksi_ganti_pin($body) {
  $name = s(isset($body['name']) ? $body['name'] : '');
  if ($name === '') return array('ok' => false, 'error' => 'missing');
  $next = s(isset($body['newPin']) ? $body['newPin'] : '');
  if (!preg_match('/^\d{4,8}$/', $next)) return array('ok' => false, 'error' => 'bad_pin');

  $st = q('UPDATE `users` SET pin = :p WHERE LOWER(TRIM(name)) = :n AND active = 1',
          array(':p' => $next, ':n' => mb_strtolower($name, 'UTF-8')));
  return $st->rowCount() > 0
    ? array('ok' => true)
    // rowCount 0 bisa berarti PIN barunya sama dengan yang lama, jadi
    // keberadaan akunnya diperiksa terpisah sebelum menyebut not_found.
    : (user_by_creds($name, $next)
        ? array('ok' => true)
        : array('ok' => false, 'error' => 'not_found'));
}

/* Kru mengganti NAMA TAMPILANNYA SENDIRI.
   ---------------------------------------------------------------------
   Ini satu-satunya aksi tulis yang boleh dipanggil non-superadmin selain
   changePin, jadi gerbangnya ditulis eksplisit di sini:

   - Wajib name + PIN yang COCOK (user_by_creds). Beda dari changePin yang
     hanya butuh nama: changePin dipanggil tepat setelah orangnya login,
     sedangkan ini bisa dipanggil kapan saja dari halaman profil. Tanpa
     PIN, siapa pun yang tahu nama orang lain bisa mengganti nama tampilan
     orang itu — nama orang lain di sini semuanya publik lewat roster.
   - Baris yang diubah DITENTUKAN dari hasil user_by_creds, BUKAN dari id
     yang dikirim client. Kalau id ikut dipercaya, kredensial sendiri bisa
     dipakai untuk menulis ke baris orang lain.

   username WAJIB unik lintas kolom (lihat identitas_bentrok): sejak login
   menerima username maupun nama resmi, username kembar berarti login bisa
   mengarah ke akun yang salah. */
function aksi_set_username($body) {
  $name = s(isset($body['name']) ? $body['name'] : '');
  $pin  = s(isset($body['pin'])  ? $body['pin']  : '');
  if ($name === '' || $pin === '') return array('ok' => false, 'error' => 'missing');

  $u = user_by_creds($name, $pin);
  if (!$u) return array('ok' => false, 'error' => 'forbidden');

  $baru = trim(s(isset($body['username']) ? $body['username'] : ''));

  // Kosong = hapus username, kembali login dengan nama resmi. Itu sah.
  if ($baru === '') {
    q('UPDATE `users` SET username = \'\' WHERE id = :i', array(':i' => s($u['id'])));
    return array('ok' => true, 'username' => '');
  }

  if (!username_valid($baru)) return array('ok' => false, 'error' => 'bad_username');

  $bentrok = identitas_bentrok($baru, s($u['id']));
  if ($bentrok) return array('ok' => false, 'error' => 'username_taken');

  q('UPDATE `users` SET username = :u WHERE id = :i',
    array(':u' => $baru, ':i' => s($u['id'])));
  return array('ok' => true, 'username' => $baru);
}

/* ==================== USERS CRUD (superadmin) ==================== */

function aksi_list_users($body) {
  if (!butuh_superadmin($body)) return array('ok' => false, 'error' => 'forbidden');
  $users = array();
  foreach (semua_user() as $u) {
    $users[] = array(
      'id'           => s($u['id']),
      'name'         => s($u['name']),
      'pin'          => s($u['pin']),
      'active'       => ((int)$u['active'] === 1),
      'keterangan'   => s($u['keterangan']),
      'noHp'         => s($u['no_hp']),
      'talentaId'    => s($u['talenta_id']),
      'username'     => s($u['username']),
      'modules'      => modul_untuk($u['id']),        // hasil perluasan '*' + deny
      'grants'       => grant_mentah_untuk($u['id']), // baris mentah, untuk centang form
      'denies'       => deny_mentah_untuk($u['id']),  // pengecualian yang menimpa '*'
      'adminModules' => admin_modul_untuk($u['id']),
    );
  }
  return array('ok' => true, 'users' => $users, 'modules' => semua_modul_aktif(),
               'bawaan' => aturan_bawaan(), 'terbatas' => aturan_terbatas());
}

/* Tambah (tanpa id) atau ubah (id ada). Nama wajib unik tanpa membedakan
   huruf besar-kecil. PIN TIDAK perlu unik — disengaja. */
function aksi_simpan_user($body) {
  if (!butuh_superadmin($body)) return array('ok' => false, 'error' => 'forbidden');

  $name = s(isset($body['name']) ? $body['name'] : '');
  $pin  = s(isset($body['pin']) ? $body['pin'] : '');
  if ($pin === '') $pin = '1111';
  $ket    = s(isset($body['keterangan']) ? $body['keterangan'] : '');
  $hp     = s(isset($body['noHp']) ? $body['noHp'] : '');
  $tid    = s(isset($body['talentaId']) ? $body['talentaId'] : '');
  $active = (isset($body['active']) && $body['active'] === false) ? 0 : 1;
  if ($name === '') return array('ok' => false, 'error' => 'missing_fields');

  $editId = s(isset($body['id']) ? $body['id'] : '');

  /* Nama resmi diperiksa LINTAS KOLOM: bentrok dengan nama orang lain MAUPUN
     dengan username orang lain. Sejak login menerima keduanya, memberi nama
     "arfan" ke seseorang padahal itu username orang lain akan membuat login
     mengarah ke akun yang salah. */
  $bentrok = identitas_bentrok($name, $editId);
  if ($bentrok) return array('ok' => false, 'error' => 'name_taken',
                             'takenBy' => s($bentrok['name']));

  /* talenta_id yang terisi wajib unik: dua kru berbagi satu Employee ID
     berarti absensi orang lain masuk ke skor seseorang. Yang KOSONG bebas
     bentrok — itu artinya "belum dipetakan", bukan sebuah identitas. */
  if ($tid !== '') {
    $dobel = q('SELECT id, name FROM `users` WHERE TRIM(talenta_id) = :t AND id <> :i LIMIT 1',
               array(':t' => $tid, ':i' => $editId))->fetch();
    if ($dobel) return array('ok' => false, 'error' => 'talenta_taken',
                             'takenBy' => s($dobel['name']));
  }

  if ($editId !== '') {
    /* username hanya ditulis kalau field-nya MEMANG dikirim. Form Kelola User
       mengirimnya; pemanggil lain (mis. tombol aktif/nonaktif yang mengirim
       ulang baris seadanya) tidak. Tanpa penjaga ini, satu klik nonaktifkan
       akan menghapus username yang dipilih kru — dan orang itu tiba-tiba
       tidak bisa login dengan yang biasa dia ketik. */
    if (array_key_exists('username', $body)) {
      $un = trim(s($body['username']));
      if ($un !== '') {
        if (!username_valid($un)) return array('ok' => false, 'error' => 'bad_username');
        $du = identitas_bentrok($un, $editId);
        if ($du) return array('ok' => false, 'error' => 'username_taken',
                              'takenBy' => s($du['name']));
        // Username tidak boleh sama dengan nama resmi orang ITU SENDIRI di
        // baris yang sama — itu bukan bentrok, tapi juga tidak ada gunanya.
      }
      $st = q('UPDATE `users` SET name = :n, pin = :p, active = :a, keterangan = :k, no_hp = :h,
                 talenta_id = :t, username = :u WHERE id = :i',
              array(':n' => $name, ':p' => $pin, ':a' => $active, ':k' => $ket, ':h' => $hp,
                    ':t' => $tid, ':u' => $un, ':i' => $editId));
    } else {
      $st = q('UPDATE `users` SET name = :n, pin = :p, active = :a, keterangan = :k, no_hp = :h, talenta_id = :t WHERE id = :i',
              array(':n' => $name, ':p' => $pin, ':a' => $active, ':k' => $ket, ':h' => $hp, ':t' => $tid, ':i' => $editId));
    }
    // rowCount 0 kalau tidak ada yang berubah, jadi keberadaannya dicek sendiri.
    if ($st->rowCount() === 0 && !user_by_id($editId))
      return array('ok' => false, 'error' => 'not_found');
    return array('ok' => true, 'id' => $editId);
  }

  // id baru: 'u-' + nama disederhanakan, ditambah angka bila sudah terpakai.
  $base = 'u-' . preg_replace('/[^a-z0-9]+/', '', mb_strtolower($name, 'UTF-8'));
  if ($base === 'u-') $base = 'u-user';
  $id = $base; $n = 2;
  while (user_by_id($id)) { $id = $base . $n; $n++; }
  q('INSERT INTO `users` (id, name, pin, active, keterangan, no_hp, talenta_id) VALUES (:i, :n, :p, :a, :k, :h, :t)',
    array(':i' => $id, ':n' => $name, ':p' => $pin, ':a' => $active, ':k' => $ket, ':h' => $hp, ':t' => $tid));
  return array('ok' => true, 'id' => $id);
}

function aksi_hapus_user($body) {
  $caller = butuh_superadmin($body);
  if (!$caller) return array('ok' => false, 'error' => 'forbidden');
  $id = s(isset($body['id']) ? $body['id'] : '');
  if ($id !== '' && s($caller['id']) === $id)
    return array('ok' => false, 'error' => 'cannot_delete_self');
  if (!user_by_id($id)) return array('ok' => false, 'error' => 'not_found');

  // Hak aksesnya ikut dibuang. Di Sheet baris Grants/Admins yatim ini
  // tertinggal dan hidup lagi kalau id yang sama dipakai ulang.
  q('DELETE FROM `grants` WHERE user_id = :i', array(':i' => $id));
  q('DELETE FROM `admins` WHERE user_id = :i', array(':i' => $id));
  q('DELETE FROM `users`  WHERE id = :i',      array(':i' => $id));
  return array('ok' => true);
}

/* ==================== REGISTRI MODUL (superadmin) ==================== */

function aksi_list_modules($body) {
  if (!butuh_superadmin($body)) return array('ok' => false, 'error' => 'forbidden');
  $wantAll = (isset($body['all']) && $body['all'] === true);
  $sql = 'SELECT `key`, `label`, `active` FROM `modules` '
       . ($wantAll ? '' : 'WHERE active = 1 ')
       . 'ORDER BY urut ASC, `key` ASC';
  $mods = array();
  foreach (q($sql) as $m) {
    if (s($m['key']) === '') continue;
    $mods[] = array('key' => s($m['key']), 'label' => s($m['label']),
                    'active' => ((int)$m['active'] === 1));
  }
  /* Aturan akses bawaan ikut dikirim supaya Kelola Akses bisa menggambar
     centangnya sebagai OTOMATIS untuk orang yang memenuhi syarat — bukan kotak
     kosong yang terbaca "belum punya akses" padahal punya. Dikirim sebagai
     ATURAN (modul + daftar tim), bukan daftar jadi, karena syaratnya berbeda
     per user dan yang tahu Tim seseorang adalah form yang sedang membukanya. */
  return array('ok' => true, 'modules' => $mods, 'bawaan' => aturan_bawaan(), 'terbatas' => aturan_terbatas());
}

/* Sinkronkan registri dari daftar modul aplikasi (BRANCHES di landing).
   Key baru DITAMBAH; key yang sudah ada TIDAK disentuh sama sekali —
   label & status aktif milik admin harus bertahan. Tidak pernah menghapus. */
function aksi_sync_modules($body) {
  if (!butuh_superadmin($body)) return array('ok' => false, 'error' => 'forbidden');
  $incoming = (isset($body['modules']) && is_array($body['modules'])) ? $body['modules'] : array();
  $urut = (int)q('SELECT COALESCE(MAX(urut),0) m FROM `modules`')->fetch()['m'];
  $added = array();
  foreach ($incoming as $m) {
    $key = s(isset($m['key']) ? $m['key'] : '');
    if ($key === '') continue;
    if (q('SELECT 1 FROM `modules` WHERE `key` = :k LIMIT 1', array(':k' => $key))->fetch()) continue;
    $label = s(isset($m['label']) ? $m['label'] : '');
    if ($label === '') $label = $key;
    $urut += 10;
    q('INSERT INTO `modules` (`key`, `label`, `active`, `urut`) VALUES (:k, :l, 1, :u)',
      array(':k' => $key, ':l' => $label, ':u' => $urut));
    $added[] = $key;
  }
  /* Akses bawaan TIDAK disimpan di tabel ini. Ia aturan, bukan setelan:
     sumbernya tim_bawaan_jadwal() di berkas ini, satu tempat, berlaku seketika
     begitu berkasnya mendarat. Sempat dirancang sebagai kolom `modules.bawaan`
     dan dibatalkan — bentuk itu menuntut ALTER TABLE berhasil DAN superadmin
     membuka panel ini sekali supaya tandanya tertulis, dua langkah yang
     kegagalannya tidak terlihat di layar mana pun. */
  return array('ok' => true, 'added' => $added);
}

/* Ubah label / status aktif satu modul. `key` tidak pernah diubah: itu
   identitas yang dipakai grants & admins. */
function aksi_simpan_module($body) {
  if (!butuh_superadmin($body)) return array('ok' => false, 'error' => 'forbidden');
  $key = s(isset($body['key']) ? $body['key'] : '');
  if ($key === '') return array('ok' => false, 'error' => 'missing_key');
  if (!q('SELECT 1 FROM `modules` WHERE `key` = :k LIMIT 1', array(':k' => $key))->fetch())
    return array('ok' => false, 'error' => 'not_found');

  if (isset($body['label']) && $body['label'] !== null)
    q('UPDATE `modules` SET label = :l WHERE `key` = :k',
      array(':l' => s($body['label']), ':k' => $key));
  if (isset($body['active']) && $body['active'] !== null) {
    $aktif = ($body['active'] === true || strtoupper(s($body['active'])) === 'TRUE') ? 1 : 0;
    q('UPDATE `modules` SET active = :a WHERE `key` = :k', array(':a' => $aktif, ':k' => $key));
  }
  return array('ok' => true);
}

/* Angkat/cabut user sebagai admin sebuah modul. module '*' = superadmin. */
function aksi_set_admin($body) {
  $caller = butuh_superadmin($body);
  if (!$caller) return array('ok' => false, 'error' => 'forbidden');
  $userId = s(isset($body['userId']) ? $body['userId'] : '');
  $module = s(isset($body['module']) ? $body['module'] : '');
  if ($userId === '' || $module === '') return array('ok' => false, 'error' => 'missing_fields');
  $grant = (isset($body['access']) && ($body['access'] === true || strtoupper(s($body['access'])) === 'TRUE'));

  // Cegah superadmin TERAKHIR mengunci dirinya sendiri di luar sistem.
  if ($module === '*' && !$grant && s($caller['id']) === $userId) {
    $n = (int)q('SELECT COUNT(*) c FROM `admins` WHERE `module` = \'*\'')->fetch()['c'];
    if ($n <= 1) return array('ok' => false, 'error' => 'last_superadmin');
  }
  if ($grant) q('INSERT IGNORE INTO `admins` (user_id, `module`) VALUES (:u, :m)',
                array(':u' => $userId, ':m' => $module));
  else        q('DELETE FROM `admins` WHERE user_id = :u AND `module` = :m',
                array(':u' => $userId, ':m' => $module));
  return array('ok' => true);
}

/* ==================== PEMBERIAN AKSES MODUL (superadmin) ==================== */

function aksi_list_access($body) {
  if (!butuh_superadmin($body)) return array('ok' => false, 'error' => 'forbidden');
  $users = array();
  foreach (semua_user() as $u) {
    $users[] = array(
      'id'           => s($u['id']),
      'name'         => s($u['name']),
      'keterangan'   => s($u['keterangan']),
      'active'       => ((int)$u['active'] === 1),
      'modules'      => modul_untuk($u['id']),
      'adminModules' => admin_modul_untuk($u['id']),
    );
  }
  return array('ok' => true, 'users' => $users, 'modules' => semua_modul_aktif(),
               'bawaan' => aturan_bawaan(), 'terbatas' => aturan_terbatas());
}

function aksi_set_module_access($body) {
  $caller = butuh_superadmin($body);
  if (!$caller) return array('ok' => false, 'error' => 'forbidden');
  $userId = s(isset($body['userId']) ? $body['userId'] : '');
  $module = s(isset($body['module']) ? $body['module'] : '');
  if ($userId === '' || $module === '') return array('ok' => false, 'error' => 'missing_fields');
  $access = (isset($body['access']) && ($body['access'] === true || strtoupper(s($body['access'])) === 'TRUE')) ? 1 : 0;

  // Upsert: primary key (user_id, module) membuat ini idempoten.
  q('INSERT INTO `grants` (user_id, `module`, `access`, granted_by, ts)
     VALUES (:u, :m, :a, :b, NOW())
     ON DUPLICATE KEY UPDATE `access` = VALUES(`access`), granted_by = VALUES(granted_by), ts = VALUES(ts)',
    array(':u' => $userId, ':m' => $module, ':a' => $access, ':b' => s($caller['id'])));
  return array('ok' => true);
}

/* ==================== ANGGOTA MODUL ==================== */

// Untuk konsol Kelola Akses INTERNAL sebuah modul — admin modul itu saja.
function aksi_list_module_members($body) {
  $module = s(isset($body['module']) ? $body['module'] : '');
  if (!butuh_admin_modul($body, $module)) return array('ok' => false, 'error' => 'forbidden');
  return array('ok' => true, 'members' => anggota_modul($module, false));
}

/* Roster HANYA-BACA. Dipanggil OTOMATIS tiap modul saat boot supaya daftar
   staf (mis. dropdown PIC di Marketing) ikut roster Office tanpa perlu tiap
   orang login dulu. Karena itu TANPA gerbang kredensial — dan karena itu
   pula balasannya tidak pernah memuat PIN. */
function aksi_list_module_roster($body) {
  $module = s(isset($body['module']) ? $body['module'] : '');
  if ($module === '') return array('ok' => false, 'error' => 'missing_module');
  return array('ok' => true, 'members' => anggota_modul($module, true));
}

/* Semua user + timnya (keterangan), TANPA gerbang PIN — dipakai modul lain
   (mis. Kompas) untuk memetakan kru per DIVISI (Marketing/Event/Kasir) secara
   otomatis. listModuleRoster memfilter per akses modul, sedangkan divisi tidak
   selalu punya modul sendiri (mis. Kasir), jadi butuh daftar utuh. Tingkat
   keterbukaannya sama: hanya nama & keterangan, TIDAK ada PIN. */
function aksi_list_divisi_roster($body) {
  $out = array();
  foreach (semua_user() as $u) {
    $out[] = array(
      'id'         => s($u['id']),
      'name'       => s($u['name']),
      'keterangan' => s($u['keterangan']),
      'noHp'       => s($u['no_hp']),
      /* Employee ID Talenta ikut sejak 18 Agustus 2026, dengan alasan yang
         sama seperti di anggota_modul(): ekspor jadwal shift dibuat untuk
         diimpor kembali ke Talenta, dan Talenta mencocokkan barisnya lewat
         kolom ini — bukan lewat nama, yang ditulis berbeda di dua sistem
         lebih sering daripada tidak. Bukan data sensitif: nomor pegawai,
         bukan PIN, dan endpoint ini memang tidak pernah membalas PIN. */
      'talentaId'  => s($u['talenta_id']),
      'active'     => ((int)$u['active'] === 1),
    );
  }
  return array('ok' => true, 'members' => $out);
}

function anggota_modul($module, $withAdminFlag) {
  $out = array();
  foreach (semua_user() as $u) {
    if (!in_array($module, modul_untuk($u['id']), true)) continue;   // hanya anggota modul ini
    /* talentaId ikut di roster (bukan cuma di listUsers) supaya modul HR
       bisa mencocokkan report absensi Talenta tanpa kredensial superadmin.
       Ini bukan data sensitif: nomor pegawai, bukan PIN. */
    $row = array(
      'id'         => s($u['id']),
      'name'       => s($u['name']),
      'keterangan' => s($u['keterangan']),
      'noHp'       => s($u['no_hp']),
      'talentaId'  => s($u['talenta_id']),
      'username'   => s($u['username']),
      'active'     => ((int)$u['active'] === 1),
    );
    if ($withAdminFlag) {
      $adm = admin_modul_untuk($u['id']);
      $row['isModuleAdmin'] = in_array('*', $adm, true) || in_array($module, $adm, true);
    }
    $out[] = $row;
  }
  return $out;
}

/* Menyegarkan sesi yang sudah berjalan.
   Daftar modul disimpan di dalam sesi saat login dan berlaku 24 jam. Tanpa
   penyegaran ini, modul yang BARU didaftarkan tidak muncul sampai orangnya
   keluar-masuk lagi — dan sebaliknya, akses yang DICABUT masih terpakai
   sampai sesinya habis.

   Sengaja tanpa PIN: yang dikembalikan cuma daftar modul milik satu user,
   dan itu sudah bisa disimpulkan dari listModuleRoster yang juga terbuka.
   Tidak ada yang bisa MASUK karenanya — masuk tetap butuh nama + PIN. */
function aksi_segarkan_sesi($body) {
  $id = s(isset($body['userId']) ? $body['userId'] : '');
  if ($id === '') return array('ok' => false, 'error' => 'missing');
  $u = user_by_id($id);
  if (!$u) return array('ok' => false, 'error' => 'not_found');
  if ((int)$u['active'] !== 1) return array('ok' => false, 'error' => 'inactive');
  return array('ok' => true, 'user' => array(
    'id'           => s($u['id']),
    'name'         => s($u['name']),
    'username'     => s($u['username']),
    'keterangan'   => s($u['keterangan']),
    'modules'      => modul_untuk($u['id']),
    'adminModules' => admin_modul_untuk($u['id']),
  ));
}

/* ==================== PEMINDAHAN DATA DARI SHEET ====================
   Dipanggil sekali saat pindah dari Google Sheet. Isi tiap tab dikirim
   apa adanya; aksinya IDEMPOTEN, jadi aman diulang kalau terputus di
   tengah. Tidak pernah menghapus baris yang sudah ada di database.

   Bentuk kiriman (semua opsional):
     users:   [{id,name,pin,active,keterangan,talentaId}, ...]
     modules: [{key,label,active}, ...]
     grants:  [{userId,module,access,grantedBy,ts}, ...]
     admins:  [{userId,module}, ...]                                    */
function aksi_import($body) {
  if (!butuh_superadmin($body)) return array('ok' => false, 'error' => 'forbidden');
  $n = array('users' => 0, 'modules' => 0, 'grants' => 0, 'admins' => 0);
  $bool = function ($v, $default = true) {
    if ($v === null || $v === '') return $default;
    if (is_bool($v)) return $v;
    $t = strtoupper(trim((string)$v));
    return !($t === 'FALSE' || $t === '0' || $t === 'NO' || $t === 'TIDAK');
  };

  foreach ((isset($body['users']) && is_array($body['users'])) ? $body['users'] : array() as $u) {
    $id = s(isset($u['id']) ? $u['id'] : ''); $nm = s(isset($u['name']) ? $u['name'] : '');
    if ($id === '' || $nm === '') continue;             // baris kosong Sheet dilewati
    /* talenta_id: kiriman KOSONG tidak menghapus yang sudah ada. Ekspor tab
       Sheet lama tidak punya kolom ini, jadi impor ulang tanpa penjaga ini
       akan memutus semua pemetaan absensi yang sudah dibuat lewat UI. */
    q('INSERT INTO `users` (id, name, pin, active, keterangan, talenta_id) VALUES (:i,:n,:p,:a,:k,:t)
       ON DUPLICATE KEY UPDATE name=VALUES(name), pin=VALUES(pin), active=VALUES(active),
         keterangan=VALUES(keterangan),
         talenta_id=IF(VALUES(talenta_id)=\'\', talenta_id, VALUES(talenta_id))',
      array(':i' => $id, ':n' => $nm,
            ':p' => s(isset($u['pin']) ? $u['pin'] : '') !== '' ? s($u['pin']) : '1111',
            ':a' => $bool(isset($u['active']) ? $u['active'] : null) ? 1 : 0,
            ':k' => s(isset($u['keterangan']) ? $u['keterangan'] : ''),
            ':t' => s(isset($u['talentaId']) ? $u['talentaId'] : '')));
    $n['users']++;
  }
  foreach ((isset($body['modules']) && is_array($body['modules'])) ? $body['modules'] : array() as $m) {
    $k = s(isset($m['key']) ? $m['key'] : ''); if ($k === '') continue;
    q('INSERT INTO `modules` (`key`,`label`,`active`) VALUES (:k,:l,:a)
       ON DUPLICATE KEY UPDATE `label`=VALUES(`label`), `active`=VALUES(`active`)',
      array(':k' => $k, ':l' => s(isset($m['label']) ? $m['label'] : '') !== '' ? s($m['label']) : $k,
            ':a' => $bool(isset($m['active']) ? $m['active'] : null) ? 1 : 0));
    $n['modules']++;
  }
  foreach ((isset($body['grants']) && is_array($body['grants'])) ? $body['grants'] : array() as $g) {
    $u = s(isset($g['userId']) ? $g['userId'] : ''); $m = s(isset($g['module']) ? $g['module'] : '');
    if ($u === '' || $m === '') continue;
    q('INSERT INTO `grants` (user_id,`module`,`access`,granted_by,ts) VALUES (:u,:m,:a,:b,NOW())
       ON DUPLICATE KEY UPDATE `access`=VALUES(`access`)',
      array(':u' => $u, ':m' => $m,
            ':a' => $bool(isset($g['access']) ? $g['access'] : null) ? 1 : 0,
            ':b' => s(isset($g['grantedBy']) ? $g['grantedBy'] : 'import')));
    $n['grants']++;
  }
  foreach ((isset($body['admins']) && is_array($body['admins'])) ? $body['admins'] : array() as $a) {
    $u = s(isset($a['userId']) ? $a['userId'] : ''); $m = s(isset($a['module']) ? $a['module'] : '');
    if ($u === '' || $m === '') continue;
    q('INSERT IGNORE INTO `admins` (user_id,`module`) VALUES (:u,:m)', array(':u' => $u, ':m' => $m));
    $n['admins']++;
  }
  return array('ok' => true, 'diproses' => $n);
}

/* ==================== BENIH AWAL ====================
   HANYA jalan kalau tabel users benar-benar kosong, supaya database yang
   sudah berisi tidak pernah terisi ulang diam-diam. Tanpa ini, database
   baru tidak punya satu pun superadmin dan tidak ada yang bisa masuk. */
function seed_bila_kosong() {
  $n = (int)q('SELECT COUNT(*) c FROM `users`')->fetch()['c'];
  if ($n > 0) return false;
  $orang = array(
    array('u-admin',   'Admin'),
    array('u-howandi', 'Howandi'),
    array('u-wandi',   'Wandi'),
  );
  foreach ($orang as $o) {
    q('INSERT IGNORE INTO `users` (id,name,pin,active,keterangan) VALUES (:i,:n,\'1111\',1,\'\')',
      array(':i' => $o[0], ':n' => $o[1]));
    q('INSERT IGNORE INTO `grants` (user_id,`module`,`access`,granted_by) VALUES (:u,\'*\',1,\'seed\')',
      array(':u' => $o[0]));
    q('INSERT IGNORE INTO `admins` (user_id,`module`) VALUES (:u,\'*\')', array(':u' => $o[0]));
  }
  // Wandi tetap tanpa Howandi Life OS, sama seperti SEED_USERS di landing.
  q('INSERT IGNORE INTO `grants` (user_id,`module`,`access`,granted_by)
     VALUES (\'u-wandi\',\'howandi_life\',0,\'seed\')');
  return true;
}

/* ==================== DIAGNOSTIK ====================
   env & db ikut dibalas supaya ketahuan kalau zip dev terpasang di
   produksi (atau sebaliknya) — satu-satunya pengaman terhadap salah unggah. */
function ping() {
  return array('pong' => true, 'backend' => 'php-mysql',
               'env' => defined('ENV_LABEL') ? ENV_LABEL : '?',
               'db' => DB_NAME, 'ts' => gmdate('c'));
}
function stats() {
  $out = array('backend' => 'php-mysql',
               'env' => defined('ENV_LABEL') ? ENV_LABEL : '?',
               'db' => DB_NAME);
  foreach (array('users', 'modules', 'grants', 'admins') as $t)
    $out[$t] = (int)q('SELECT COUNT(*) c FROM `' . $t . '`')->fetch()['c'];
  $out['superadmin'] = (int)q('SELECT COUNT(*) c FROM `admins` WHERE `module` = \'*\'')->fetch()['c'];
  $out['ts'] = gmdate('c');
  return $out;
}
