<?php
/************************************************************************
 * CAMPAIGN — insight konten, kalender posting, riset tren AI, akun TikTok
 * ---------------------------------------------------------------------
 * Modul `campaign` (deploy/campaign/). Lahir 11 Oktober 2026, permintaan
 * user: "riset tren dan campaign social media yang bisa auto ambil insight
 * dan auto scheduler untuk ngepost".
 *
 * MENUMPANG konten-mysql, BUKAN backend sendiri. Backend sendiri berarti
 * database baru yang harus dibuat manual di cPanel plus config.php baru — dan
 * langkah manual di repo ini rutin tertinggal di produksi. Tabelnya lahir
 * sendiri lewat cg_pastikan(), pola brankas_pastikan() di finance-mysql.
 *
 * TABEL SENDIRI, BUKAN koleksi saveAll. Modul Konten mengirim state utuhnya
 * tiap menyimpan; menaruh insight & jadwal di sana berarti satu simpan dari
 * layar Konten bisa menimpa jadwal yang baru dibuat di sini. Penulisannya
 * granular per baris, pola simpanSel di modul Jadwal.
 *
 * SELURUH AKSI BERPAGAR SESI (lib_sesi.php, kunci modul `campaign`). Beda
 * dari aksi Konten yang terbuka: di sini tersimpan token akses TikTok dan API
 * key AI, dan Access-Control-Allow-Origin: * berarti halaman web mana pun
 * bisa memanggilnya dari peramban pengunjung.
 *
 * RAHASIA TIDAK PERNAH DIPULANGKAN. Token TikTok, client secret, dan API key
 * AI cuma ditulis; yang dibaca layar hanya "sudah terisi atau belum".
 *
 * TIDAK ADA DELETE untuk catatan orang. Insight yang tidak dipakai lagi
 * DIARSIPKAN, jadwal yang batal ditandai BATAL. Yang di-DELETE cuma cache
 * postingan TikTok saat akunnya diputus — itu salinan data TikTok, bukan
 * catatan siapa pun, dan bisa ditarik ulang kapan saja.
 ************************************************************************/

require_once __DIR__ . '/lib_sesi.php';
/* Google Review (17 Okt 2026) — berkas sendiri supaya berkas ini tidak terus membengkak. */
require_once __DIR__ . '/lib_greview.php';

/* PENYEDIA AI (13 Okt 2026, permintaan user: "modelnya bisa dipilih, pakai
   Muse Spark dulu"). Keduanya bicara format Anthropic Messages yang SAMA —
   Meta Model API menyediakan endpoint Messages-kompatibel — jadi bedanya
   cuma alamat, header otentikasi, dan daftar modelnya. Key disimpan PER
   penyedia: berganti penyedia tidak menghapus key yang satunya.

   Model dipilih dari DAFTAR TERTUTUP. Nama model yang salah ketik tidak
   ditolak sampai tombol AI ditekan, dan pesannya dari penyedia — bukan dari
   layar tempat salah ketiknya terjadi.

   "-contributor" (Meta): harga jauh lebih murah KARENA prompt & jawaban
   boleh dipakai Meta melatih modelnya. Itu disebut di layar Pengaturan dan
   di deploy/legal/privacy.html — kalau daftar penyedia berubah, kebijakan
   privasinya ikut diubah.

   ANTHROPIC DICABUT (14 Okt 2026, permintaan user: "API Anthropic dihapus
   saja"). Tinggal Meta. Key Anthropic yang terlanjur tersimpan di cg_setting
   (ai_key, ai_model, ai_penyedia) SENGAJA TIDAK DIHAPUS — ia cuma tidak
   dibaca lagi. Menghapus data yang tidak bisa dikembalikan demi kerapian
   bukan pertukaran yang baik; mengembalikan penyedia cukup menambah barisnya
   lagi di sini. */
function cg_ai_daftar() {
  return array(
    'meta' => array('label' => 'Meta (Muse Spark)', 'url' => 'https://api.meta.ai/v1/messages',
      'model' => array('muse-spark-1.3-contributor', 'muse-spark-1.3', 'muse-spark-1.2-contributor', 'muse-spark-1.2'),
      'kunci' => 'ai_key_meta', 'kunciModel' => 'ai_model_meta', 'konstanta' => 'META_MODEL_API_KEY'),
  );
}
/* Penyedia yang dipakai: SELALU Meta. Setelan ai_penyedia lama yang masih
   berbunyi "anthropic" diabaikan — dibaca, ia menunjuk penyedia yang sudah
   tidak ada di daftar. */
function cg_ai_penyedia($pdo) { return 'meta'; }
/* KATEGORI POLA INSIGHT (14 Okt 2026, permintaan user: "saya ingin ada
   pengaturannya"). Disimpan di cg_setting 'kategori' (JSON). Dipakai DUA
   tempat dan keduanya membaca fungsi ini: formulir/penyaring di layar (lewat
   campaignGet) dan prompt Temukan insight. Daftar kedua di salah satu tempat
   akan menyimpang, dan AI lalu mengusulkan kategori yang tidak ada di
   pilihan formulir.

   Insight LAMA yang kategorinya sudah dicabut dari daftar TIDAK diubah —
   layar menggambarnya ditandai (lama). */
define('CG_KATEGORI_MAKS', 20);
function cg_kategori_bawaan() {
  return array('Hook 3 Detik & Retensi', 'Format Konten & Visual', 'Topik & Tren', 'Waktu Tayang',
    'Promo & Ajakan', 'Sentimen & Masukan', 'Kolaborasi & KOL');
}
/* Dirapikan di SATU tempat: dipangkas, dipotong 60 huruf (lebar kolom
   cg_insight.kategori), kembar dibuang tanpa memandang huruf besar-kecil. */
function cg_kategori_rapikan($daftar) {
  $out = array(); $sudah = array();
  if (!is_array($daftar)) return $out;
  foreach ($daftar as $k) {
    if (!is_string($k) && !is_numeric($k)) continue;
    $k = cg_potong(trim(preg_replace('/\s+/', ' ', (string)$k)), 60);
    if ($k === '') continue;
    $kunci = strtolower($k);
    if (isset($sudah[$kunci])) continue;
    $sudah[$kunci] = true; $out[] = $k;
    if (count($out) >= CG_KATEGORI_MAKS) break;
  }
  return $out;
}
function cg_kategori($pdo) {
  $j = json_decode(cg_set_baca($pdo, 'kategori', ''), true);
  $k = cg_kategori_rapikan($j);
  return $k ? $k : cg_kategori_bawaan();
}
function cg_ai_key_untuk($pdo, $p) {
  $d = cg_ai_daftar(); $c = $d[$p]['konstanta'];
  if (defined($c) && constant($c) !== '') return constant($c);
  return cg_set_baca($pdo, $d[$p]['kunci']);
}
function cg_ai_model_untuk($pdo, $p) {
  $d = cg_ai_daftar();
  $m = cg_set_baca($pdo, $d[$p]['kunciModel'], $d[$p]['model'][0]);
  return in_array($m, $d[$p]['model'], true) ? $m : $d[$p]['model'][0];
}
define('CG_PROFIL_BAWAAN', 'Laksamana Muda: coffee shop, resto, dan venue nongkrong di Pekanbaru, Riau. '
  . 'Ramai malam hari dan akhir pekan, punya live music, DJ, nobar, dan event. '
  . 'Kanal utama TikTok @laksamanamuda.id dan Instagram.');

/* Scope TikTok yang diminta saat Hubungkan. WAJIB sama dengan yang dicentang di
   app "Laksamana Campaign" di TikTok Developer Portal, dan wajib disebut di
   deploy/legal/privacy.html — scope baru berarti kebijakan privasi ikut diubah. */
define('CG_TIKTOK_SCOPE', 'user.info.basic,user.info.profile,user.info.stats,video.list');
/* Instagram API dengan login bisnis Instagram (14 Okt 2026). Scope WAJIB sama
   dengan izin yang ditambahkan di kasus penggunaan app Meta. */
define('CG_IG_SCOPE', 'instagram_business_basic,instagram_business_manage_insights');
define('CG_IG_GRAPH', 'https://graph.instagram.com/v23.0');
/* Meta Marketing API (iklan), 14 Okt 2026. */
define('CG_FB_GRAPH', 'https://graph.facebook.com/v23.0');

function cg_now_ms() { return (int)round(microtime(true) * 1000); }
function cg_uid($awal) { return $awal . base_convert((string)cg_now_ms(), 10, 36) . bin2hex(random_bytes(3)); }

function cg_potong($s, $n) {
  $s = trim((string)$s);
  if (function_exists('mb_substr')) return mb_substr($s, 0, $n);
  return substr($s, 0, $n);
}

function cg_kolom_ada($pdo, $tabel, $kolom) {
  $q = $pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t AND COLUMN_NAME = :k');
  $q->execute(array(':t' => $tabel, ':k' => $kolom));
  return (int)$q->fetchColumn() > 0;
}

function cg_pastikan($pdo) {
  static $sudah = false;
  if ($sudah) return;
  $pdo->exec("CREATE TABLE IF NOT EXISTS cg_insight (
    id VARCHAR(40) NOT NULL PRIMARY KEY,
    platform VARCHAR(20) NOT NULL DEFAULT '',
    kategori VARCHAR(60) NOT NULL DEFAULT '',
    temuan TEXT NULL,
    url VARCHAR(600) NOT NULL DEFAULT '',
    tgl_tayang DATE NULL,
    metrik VARCHAR(255) NOT NULL DEFAULT '',
    aksi TEXT NULL,
    sumber VARCHAR(20) NOT NULL DEFAULT 'manual',
    arsip TINYINT(1) NOT NULL DEFAULT 0,
    dibuat_oleh VARCHAR(120) NOT NULL DEFAULT '',
    dibuat_at BIGINT NOT NULL DEFAULT 0,
    diubah_oleh VARCHAR(120) NOT NULL DEFAULT '',
    diubah_at BIGINT NOT NULL DEFAULT 0,
    KEY idx_cgi_tgl (tgl_tayang)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  $pdo->exec("CREATE TABLE IF NOT EXISTS cg_jadwal (
    id VARCHAR(40) NOT NULL PRIMARY KEY,
    platform VARCHAR(20) NOT NULL DEFAULT '',
    judul VARCHAR(200) NOT NULL DEFAULT '',
    caption TEXT NULL,
    tanggal DATE NULL,
    jam VARCHAR(5) NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'DRAF',
    insight_id VARCHAR(40) NOT NULL DEFAULT '',
    pic VARCHAR(120) NOT NULL DEFAULT '',
    tautan VARCHAR(600) NOT NULL DEFAULT '',
    catatan TEXT NULL,
    dibuat_oleh VARCHAR(120) NOT NULL DEFAULT '',
    dibuat_at BIGINT NOT NULL DEFAULT 0,
    diubah_oleh VARCHAR(120) NOT NULL DEFAULT '',
    diubah_at BIGINT NOT NULL DEFAULT 0,
    KEY idx_cgj_tgl (tanggal)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  $pdo->exec("CREATE TABLE IF NOT EXISTS cg_riset (
    id VARCHAR(40) NOT NULL PRIMARY KEY,
    jenis VARCHAR(20) NOT NULL DEFAULT 'tren',
    topik VARCHAR(255) NOT NULL DEFAULT '',
    platform VARCHAR(40) NOT NULL DEFAULT '',
    catatan TEXT NULL,
    hasil MEDIUMTEXT NULL,
    model VARCHAR(60) NOT NULL DEFAULT '',
    oleh VARCHAR(120) NOT NULL DEFAULT '',
    at BIGINT NOT NULL DEFAULT 0
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  $pdo->exec("CREATE TABLE IF NOT EXISTS cg_post (
    platform VARCHAR(20) NOT NULL,
    post_id VARCHAR(80) NOT NULL,
    judul TEXT NULL,
    url VARCHAR(600) NOT NULL DEFAULT '',
    cover VARCHAR(900) NOT NULL DEFAULT '',
    tayang_at BIGINT NOT NULL DEFAULT 0,
    views BIGINT NOT NULL DEFAULT 0,
    likes BIGINT NOT NULL DEFAULT 0,
    comments BIGINT NOT NULL DEFAULT 0,
    shares BIGINT NOT NULL DEFAULT 0,
    durasi INT NOT NULL DEFAULT 0,
    sync_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (platform, post_id)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  $pdo->exec("CREATE TABLE IF NOT EXISTS cg_akun (
    platform VARCHAR(20) NOT NULL PRIMARY KEY,
    nama VARCHAR(160) NOT NULL DEFAULT '',
    avatar VARCHAR(900) NOT NULL DEFAULT '',
    follower BIGINT NOT NULL DEFAULT 0,
    open_id VARCHAR(120) NOT NULL DEFAULT '',
    access_token TEXT NULL,
    refresh_token TEXT NULL,
    token_exp BIGINT NOT NULL DEFAULT 0,
    refresh_exp BIGINT NOT NULL DEFAULT 0,
    scope VARCHAR(255) NOT NULL DEFAULT '',
    sync_at BIGINT NOT NULL DEFAULT 0,
    sync_galat VARCHAR(400) NOT NULL DEFAULT '',
    oleh VARCHAR(120) NOT NULL DEFAULT '',
    at BIGINT NOT NULL DEFAULT 0
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  /* BANK KONTEN (14 Okt 2026): ide/rencana konten — hasil AI "Buat content
     planning", disimpan dari Riset Tren, atau diketik manual. Tidak ada
     DELETE: yang tidak dipakai DIARSIPKAN. Menjadwalkan sebuah ide
     melahirkan baris cg_jadwal dan menandai idenya TERJADWAL. */
  $pdo->exec("CREATE TABLE IF NOT EXISTS cg_bank (
    id VARCHAR(40) NOT NULL PRIMARY KEY,
    judul VARCHAR(200) NOT NULL DEFAULT '',
    platform VARCHAR(20) NOT NULL DEFAULT '',
    format VARCHAR(80) NOT NULL DEFAULT '',
    pilar VARCHAR(80) NOT NULL DEFAULT '',
    hook TEXT NULL,
    caption TEXT NULL,
    tanggal DATE NULL,
    jam VARCHAR(5) NOT NULL DEFAULT '',
    alasan TEXT NULL,
    sumber VARCHAR(20) NOT NULL DEFAULT 'manual',
    batch VARCHAR(40) NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'IDE',
    jadwal_id VARCHAR(40) NOT NULL DEFAULT '',
    dibuat_oleh VARCHAR(120) NOT NULL DEFAULT '',
    dibuat_at BIGINT NOT NULL DEFAULT 0,
    diubah_oleh VARCHAR(120) NOT NULL DEFAULT '',
    diubah_at BIGINT NOT NULL DEFAULT 0,
    KEY idx_cgb_tgl (tanggal)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  /* IKLAN META (14 Okt 2026): ringkasan performa per iklan per PERIODE
     ('7', '30', 'max'). Tidak ada DELETE: iklan yang tidak muncul lagi di
     sinkron berikutnya tertinggal dengan sync_at lama, dan yang dibaca cuma
     baris dari sinkron terakhir periode itu. */
  $pdo->exec("CREATE TABLE IF NOT EXISTS cg_iklan (
    ad_id VARCHAR(40) NOT NULL,
    periode VARCHAR(5) NOT NULL,
    akun VARCHAR(40) NOT NULL DEFAULT '',
    nama VARCHAR(255) NOT NULL DEFAULT '',
    kampanye VARCHAR(255) NOT NULL DEFAULT '',
    adset VARCHAR(255) NOT NULL DEFAULT '',
    objective VARCHAR(60) NOT NULL DEFAULT '',
    status VARCHAR(40) NOT NULL DEFAULT '',
    thumb VARCHAR(900) NOT NULL DEFAULT '',
    permalink VARCHAR(600) NOT NULL DEFAULT '',
    ig_media VARCHAR(80) NOT NULL DEFAULT '',
    spend DECIMAL(16,2) NOT NULL DEFAULT 0,
    impresi BIGINT NOT NULL DEFAULT 0,
    reach BIGINT NOT NULL DEFAULT 0,
    klik BIGINT NOT NULL DEFAULT 0,
    ctr DECIMAL(10,4) NOT NULL DEFAULT 0,
    cpm DECIMAL(16,2) NOT NULL DEFAULT 0,
    frekuensi DECIMAL(10,2) NOT NULL DEFAULT 0,
    video_view BIGINT NOT NULL DEFAULT 0,
    hasil_label VARCHAR(60) NOT NULL DEFAULT '',
    hasil_n BIGINT NOT NULL DEFAULT 0,
    tgl_mulai DATE NULL,
    tgl_selesai DATE NULL,
    actions MEDIUMTEXT NULL,
    sync_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (ad_id, periode)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  /* PERTUMBUHAN HARIAN (14 Okt 2026). Satu baris per platform per hari (WIB).
     Instagram: angka akun per hari dari Instagram account insights (sumber
     'api'). TikTok: potret angka akun saat sinkron (sumber 'potret') — API
     TikTok tidak punya insight harian, jadi kenaikannya selisih antar potret. */
  $pdo->exec("CREATE TABLE IF NOT EXISTS cg_harian (
    platform VARCHAR(20) NOT NULL,
    tgl DATE NOT NULL,
    follower BIGINT NULL,
    follower_baru BIGINT NULL,
    views BIGINT NULL,
    reach BIGINT NULL,
    likes BIGINT NULL,
    comments BIGINT NULL,
    shares BIGINT NULL,
    saves BIGINT NULL,
    interaksi BIGINT NULL,
    likes_total BIGINT NULL,
    jml_post BIGINT NULL,
    sumber VARCHAR(10) NOT NULL DEFAULT '',
    sync_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (platform, tgl)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  /* Iklan per HARI per akun iklan — dasar perbandingan hari beriklan vs tidak. */
  $pdo->exec("CREATE TABLE IF NOT EXISTS cg_iklan_harian (
    tgl DATE NOT NULL,
    akun VARCHAR(40) NOT NULL,
    spend DECIMAL(16,2) NOT NULL DEFAULT 0,
    impresi BIGINT NOT NULL DEFAULT 0,
    reach BIGINT NOT NULL DEFAULT 0,
    klik BIGINT NOT NULL DEFAULT 0,
    video_view BIGINT NOT NULL DEFAULT 0,
    interaksi BIGINT NOT NULL DEFAULT 0,
    chat BIGINT NOT NULL DEFAULT 0,
    sync_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (tgl, akun)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  $pdo->exec("CREATE TABLE IF NOT EXISTS cg_setting (
    k VARCHAR(60) NOT NULL PRIMARY KEY,
    v TEXT NULL
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  /* Kolom profil & statistik akun (scope user.info.profile + user.info.stats,
     13 Okt 2026). Lewat ALTER, bukan CREATE TABLE: tabel cg_akun sudah ada di
     produksi, dan CREATE TABLE IF NOT EXISTS tidak pernah menyentuhnya. */
  $kolomAkun = array(
    'bio'          => 'TEXT NULL',
    'profil_url'   => "VARCHAR(400) NOT NULL DEFAULT ''",
    'terverifikasi'=> 'TINYINT(1) NOT NULL DEFAULT 0',
    'following'    => 'BIGINT NOT NULL DEFAULT 0',
    'likes_total'  => 'BIGINT NOT NULL DEFAULT 0',
    'jml_video'    => 'BIGINT NOT NULL DEFAULT 0',
    'stats_ada'    => 'TINYINT(1) NOT NULL DEFAULT 0',
  );
  foreach ($kolomAkun as $k => $def) {
    if (!cg_kolom_ada($pdo, 'cg_akun', $k)) $pdo->exec('ALTER TABLE cg_akun ADD COLUMN `' . $k . '` ' . $def);
  }
  /* Video yang tidak lagi dipulangkan TikTok (dihapus/diprivat) — lihat
     langkah 3 cg_tiktok_sync(). Ditandai, tidak dihapus. */
  if (!cg_kolom_ada($pdo, 'cg_post', 'hilang')) $pdo->exec('ALTER TABLE cg_post ADD COLUMN hilang TINYINT(1) NOT NULL DEFAULT 0');
  /* Reach & saves (14 Okt 2026): cuma Instagram yang menyediakannya lewat
     API. NULL = tidak ada sumbernya (TikTok), beda dari 0 yang memang nol. */
  if (!cg_kolom_ada($pdo, 'cg_post', 'reach')) $pdo->exec('ALTER TABLE cg_post ADD COLUMN reach BIGINT NULL');
  if (!cg_kolom_ada($pdo, 'cg_post', 'saves')) $pdo->exec('ALTER TABLE cg_post ADD COLUMN saves BIGINT NULL');
  if (!cg_kolom_ada($pdo, 'cg_post', 'insight_at')) $pdo->exec('ALTER TABLE cg_post ADD COLUMN insight_at BIGINT NOT NULL DEFAULT 0');
  $sudah = true;
}

/* ==================== SETELAN ==================== */
function cg_set_baca($pdo, $k, $bawaan = '') {
  $q = $pdo->prepare('SELECT v FROM cg_setting WHERE k = :k');
  $q->execute(array(':k' => $k));
  $v = $q->fetchColumn();
  return ($v === false || $v === null || $v === '') ? $bawaan : (string)$v;
}
function cg_set_tulis($pdo, $k, $v) {
  $q = $pdo->prepare('INSERT INTO cg_setting (k, v) VALUES (:k, :v) ON DUPLICATE KEY UPDATE v = VALUES(v)');
  $q->execute(array(':k' => $k, ':v' => (string)$v));
}

/* Rahasia dari config.php MENANG atas yang diketik di layar: yang memegang
   cPanel boleh mengunci kuncinya di sana, dan isian layar tidak bisa
   menimpanya diam-diam. */
/* Key penyedia yang SEDANG dipakai. */
function cg_ai_key($pdo) { return cg_ai_key_untuk($pdo, cg_ai_penyedia($pdo)); }
function cg_tiktok_key($pdo) {
  if (defined('TIKTOK_CLIENT_KEY') && TIKTOK_CLIENT_KEY !== '') return TIKTOK_CLIENT_KEY;
  return cg_set_baca($pdo, 'tiktok_key');
}
function cg_tiktok_secret($pdo) {
  if (defined('TIKTOK_CLIENT_SECRET') && TIKTOK_CLIENT_SECRET !== '') return TIKTOK_CLIENT_SECRET;
  return cg_set_baca($pdo, 'tiktok_secret');
}

function cg_ig_id($pdo) {
  if (defined('INSTAGRAM_APP_ID') && INSTAGRAM_APP_ID !== '') return INSTAGRAM_APP_ID;
  return cg_set_baca($pdo, 'ig_id');
}
function cg_ig_secret($pdo) {
  if (defined('INSTAGRAM_APP_SECRET') && INSTAGRAM_APP_SECRET !== '') return INSTAGRAM_APP_SECRET;
  return cg_set_baca($pdo, 'ig_secret');
}
/* Token iklan: token PENGGUNA SISTEM dari Business Manager (ads_read).
   Tidak lewat OAuth — dibuat sekali oleh admin bisnis, berlaku tanpa
   kedaluwarsa, dan bisa dicabut kapan saja di Business Manager. */
function cg_ads_token($pdo) {
  if (defined('META_ADS_TOKEN') && META_ADS_TOKEN !== '') return META_ADS_TOKEN;
  return cg_set_baca($pdo, 'ads_token');
}
/* Daftar akun iklan, dibakukan jadi angka saja (boleh diketik "act_123"). */
function cg_ads_akun($pdo) {
  $out = array();
  foreach (preg_split('/[\s,;]+/', cg_set_baca($pdo, 'ads_akun')) as $a) {
    $a = preg_replace('/^act_/i', '', trim($a));
    if ($a !== '' && ctype_digit($a)) $out[] = $a;
  }
  return array_values(array_unique($out));
}
function cg_ig_redirect_uri() {
  $host = isset($_SERVER['SERVER_NAME']) ? $_SERVER['SERVER_NAME'] : '';
  if ($host === '') return '';
  return 'https://' . $host . '/konten-api-mysql/campaign-instagram.php';
}

/* Alamat balik OAuth. Diturunkan dari SERVER_NAME (bukan HTTP_HOST yang bisa
   dipalsukan), jadi dev & produksi masing-masing punya alamatnya sendiri —
   dan KEDUANYA harus didaftarkan di TikTok Developer Portal. */
function cg_redirect_uri() {
  $host = isset($_SERVER['SERVER_NAME']) ? $_SERVER['SERVER_NAME'] : '';
  if ($host === '') return '';
  return 'https://' . $host . '/konten-api-mysql/campaign-tiktok.php';
}
function cg_halaman_url() {
  $host = isset($_SERVER['SERVER_NAME']) ? $_SERVER['SERVER_NAME'] : '';
  /* Panel Analytics modul Konten (pindah dari /campaign/ 13 Okt 2026).
     /campaign/ lama tetap ada sebagai pengalih, tapi alamat balik langsung
     ke tempat barunya supaya tidak ada lompatan tambahan. */
  return 'https://' . $host . '/konten/analytics/';
}

/* ==================== HTTP KELUAR ==================== */
function cg_http($metode, $url, $header, $isi, $batas = 30) {
  if (!function_exists('curl_init')) throw new Exception('Server tidak punya cURL — modul Campaign tidak bisa menghubungi layanan luar.');
  $ch = curl_init($url);
  $opt = array(
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => $batas,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_HTTPHEADER     => $header,
    CURLOPT_CUSTOMREQUEST  => $metode,
  );
  if ($isi !== null) $opt[CURLOPT_POSTFIELDS] = $isi;
  /* IPv4 DIPAKSA (23 Okt 2026). Balasan Google Review gagal "Operation timed
     out after 10001 milliseconds with 0 out of 0 bytes received" — nol byte
     berarti sambungannya tidak pernah jadi. *.googleapis.com punya A DAN AAAA;
     server hosting yang jalur IPv6-nya tidak tembus menghabiskan seluruh
     CONNECTTIMEOUT untuk mencoba alamat IPv6 sebelum sempat ke IPv4 — dan
     gejalanya hilang-timbul, jadi tarikan review bisa jalan sementara balasan
     gagal. Bentuk yang sama dengan ETIMEDOUT di deploy FTP (lihat CLAUDE.md). */
  if (defined('CURLOPT_IPRESOLVE')) $opt[CURLOPT_IPRESOLVE] = CURL_IPRESOLVE_V4;
  curl_setopt_array($ch, $opt);
  $jawab = curl_exec($ch);
  /* Diulang SEKALI, dan hanya kalau sambungannya memang tidak pernah terbentuk
     (tidak ada kode HTTP, tidak ada byte terkirim). Di titik itu permintaannya
     belum sampai ke mana pun, jadi mengulangnya aman untuk metode apa pun —
     termasuk panggilan AI yang berbayar. Yang gagal SESUDAH tersambung tidak
     pernah diulang: bisa saja servernya sudah menerima dan memprosesnya. */
  if ($jawab === false && (int)curl_getinfo($ch, CURLINFO_HTTP_CODE) === 0
      && (float)curl_getinfo($ch, CURLINFO_SIZE_UPLOAD) == 0
      && (float)curl_getinfo($ch, CURLINFO_CONNECT_TIME) == 0
      && in_array(curl_errno($ch), array(6, 7, 28), true)) {
    $jawab = curl_exec($ch);
  }
  $kode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $galat = curl_error($ch);
  curl_close($ch);
  if ($jawab === false) throw new Exception('Gagal menghubungi ' . parse_url($url, PHP_URL_HOST) . ': ' . $galat);
  $d = json_decode($jawab, true);
  return array('kode' => $kode, 'data' => is_array($d) ? $d : null, 'mentah' => is_string($jawab) ? substr($jawab, 0, 400) : '');
}

/* ==================== BACA ==================== */
function cg_baca($pdo, $u) {
  cg_pastikan($pdo);
  $insight = $pdo->query('SELECT * FROM cg_insight ORDER BY (tgl_tayang IS NULL), tgl_tayang DESC, dibuat_at DESC LIMIT 1000')->fetchAll();
  $jadwal  = $pdo->query('SELECT * FROM cg_jadwal ORDER BY tanggal DESC, jam DESC LIMIT 1500')->fetchAll();
  $riset   = $pdo->query('SELECT id, jenis, topik, platform, catatan, hasil, model, oleh, at FROM cg_riset ORDER BY at DESC LIMIT 30')->fetchAll();
  $bank    = $pdo->query('SELECT * FROM cg_bank ORDER BY (tanggal IS NULL), tanggal ASC, dibuat_at DESC LIMIT 1000')->fetchAll();
  foreach ($riset as &$r) {
    $h = json_decode((string)$r['hasil'], true);
    $r['hasil'] = is_array($h) ? $h : null;
  }
  unset($r);
  /* Daftar postingan TIDAK lagi ikut campaignGet (13 Okt 2026): Konten
     terpopuler meminta SATU HALAMAN lewat campaignTop. Yang dikirim di sini
     cuma ringkasannya. */
  $postInfo = array(
    'total' => (int)$pdo->query("SELECT COUNT(*) FROM cg_post WHERE platform='tiktok' AND hilang=0")->fetchColumn(),
    'riwayatSelesai' => cg_set_baca($pdo, 'tiktok_bf_selesai') === '1',
    'igTotal' => (int)$pdo->query("SELECT COUNT(*) FROM cg_post WHERE platform='instagram' AND hilang=0")->fetchColumn(),
    'igRiwayatSelesai' => cg_set_baca($pdo, 'ig_bf_selesai') === '1',
    'igInsight' => (int)$pdo->query("SELECT COUNT(*) FROM cg_post WHERE platform='instagram' AND hilang=0 AND insight_at > 0")->fetchColumn(),
  );
  /* Akun TANPA token — kolom rahasia tidak pernah ikut SELECT ini. */
  $akun = $pdo->query('SELECT platform, nama, avatar, follower, bio, profil_url, terverifikasi, following, likes_total, jml_video, stats_ada, scope, token_exp, refresh_exp, sync_at, sync_galat, oleh, at FROM cg_akun')->fetchAll();
  foreach ($akun as &$a) {
    $a['terhubung'] = (int)$a['refresh_exp'] > cg_now_ms() || (int)$a['token_exp'] > cg_now_ms();
  }
  unset($a);
  return array(
    'insight' => $insight,
    'jadwal'  => $jadwal,
    'riset'   => $riset,
    'bank'    => $bank,
    'postInfo' => $postInfo,
    'akun'    => $akun,
    'setting' => array(
      'aiSiap'     => cg_ai_key($pdo) !== '',
      'aiModel'    => cg_ai_model_untuk($pdo, cg_ai_penyedia($pdo)),
      'ai'         => cg_ai_ringkas($pdo),
      'kategori'   => cg_kategori($pdo),
      'profil'     => cg_set_baca($pdo, 'profil', CG_PROFIL_BAWAAN),
      'tiktokSiap' => cg_tiktok_key($pdo) !== '' && cg_tiktok_secret($pdo) !== '',
      'tiktokDariConfig' => defined('TIKTOK_CLIENT_KEY') && TIKTOK_CLIENT_KEY !== '',
      'redirectUri' => cg_redirect_uri(),
      'tiktokScope' => CG_TIKTOK_SCOPE,
      'igSiap'      => cg_ig_id($pdo) !== '' && cg_ig_secret($pdo) !== '',
      'igDariConfig' => defined('INSTAGRAM_APP_ID') && INSTAGRAM_APP_ID !== '',
      'igRedirectUri' => cg_ig_redirect_uri(),
      'adsSiap'     => cg_ads_token($pdo) !== '' && count(cg_ads_akun($pdo)) > 0,
      'adsTokenAda' => cg_ads_token($pdo) !== '',
      'adsDariConfig' => defined('META_ADS_TOKEN') && META_ADS_TOKEN !== '',
      'adsAkun'     => implode(', ', cg_ads_akun($pdo)),
      'adsSyncAt'   => (int)cg_set_baca($pdo, 'ads_sync_at', '0'),
      'adsGalat'    => cg_set_baca($pdo, 'ads_galat'),
    ) + gr_setting_ringkas($pdo),
    'boleh' => array('admin' => sesi_admin_modul($u, 'campaign')),
  );
}

/* Angka performa yang sudah diisi tim di modul Konten (Input Performa,
   c.perf[<platform>]) — DIBACA, tidak disalin. Itulah sumber "konten
   terpopuler" selama akun TikTok belum terhubung, dan tetap satu-satunya
   sumber untuk Instagram & YouTube. */
function cg_konten_perf($pdo) {
  $out = array();
  try {
    $rows = $pdo->query("SELECT data FROM content")->fetchAll();
  } catch (Throwable $e) { return $out; }
  foreach ($rows as $row) {
    $c = json_decode((string)$row['data'], true);
    if (!is_array($c) || empty($c['perf']) || !is_array($c['perf'])) continue;
    $url = (isset($c['publishRecord']['url']) && is_string($c['publishRecord']['url'])) ? $c['publishRecord']['url'] : '';
    $tgl = isset($c['publishDate']) ? (string)$c['publishDate'] : '';
    foreach ($c['perf'] as $plat => $m) {
      if (!is_array($m)) continue;
      $views = (float)(isset($m['views']) ? $m['views'] : 0);
      if ($views <= 0) $views = (float)(isset($m['reach']) ? $m['reach'] : 0);
      $out[] = array(
        'platform' => (string)$plat,
        'id'       => (string)(isset($c['id']) ? $c['id'] : ''),
        'judul'    => (string)(isset($c['title']) ? $c['title'] : ''),
        'pillar'   => (string)(isset($c['pillar']) ? $c['pillar'] : ''),
        'url'      => $url,
        'tanggal'  => $tgl,
        'views'    => $views,
        'likes'    => (float)(isset($m['likes']) ? $m['likes'] : 0),
        'comments' => (float)(isset($m['comments']) ? $m['comments'] : 0),
        'shares'   => (float)(isset($m['shares']) ? $m['shares'] : 0),
        'saves'    => (float)(isset($m['saves']) ? $m['saves'] : 0),
        'm'        => $m,
      );
    }
  }
  return $out;
}

/* ==================== KONTEN TERPOPULER (per halaman) ====================
   13 Okt 2026, permintaan user: seluruh video, tapi yang dikirim ke peramban
   cuma SATU halaman. Penyaringan (platform, rentang tanggal tayang), urutan,
   dan pemotongan halaman dikerjakan di sini.

   Gabungannya BERKAS KEMBAR daftarTop() yang dulu di peramban: postingan
   TikTok tarikan API + angka Input Performa modul Konten, dan tautan yang
   sama dengan postingan TikTok tidak digambar dua kali.

   Tanggal tayang dibaca WIB (+7 tetap), bukan zona server. */
function cg_plat_norm($p) {
  $k = strtolower((string)$p);
  if (strpos($k, 'tiktok') !== false) return 'TikTok';
  if (strpos($k, 'insta') !== false || $k === 'ig' || strpos($k, 'reels') !== false) return 'Instagram';
  if (strpos($k, 'you') !== false || $k === 'yt') return 'YouTube';
  return $p !== '' ? (string)$p : 'Lainnya';
}
/* RINCIAN 9 ANGKA untuk panel detail Konten terpopuler (13 Okt 2026,
   permintaan user). Kuncinya SAMA dengan PK_KOLOM di
   deploy/assets/performa-konten.js (reach, impr, views, likes, comments,
   shares, saves, cta, follow) — itulah kotak Input Performa modul Konten.

   TikTok Display API cuma memberi views/likes/comments/shares, dan untuk
   keempatnya angka API MENANG: ia ditarik ulang tiap sinkron, sementara
   ketikan tangan membeku di hari diketik. Sisanya (reach, impression, saves,
   klik CTA, follower baru) hanya ada kalau diketik di Input Performa.

   Yang tidak ada dipulangkan NULL, bukan 0: nol berarti "diisi dan memang
   nol", null berarti "tidak ada sumbernya" — dua keadaan yang menuntut
   tindakan berbeda di layar. */
function cg_rinci($api, $manual) {
  $out = array();
  foreach (array('reach', 'impr', 'views', 'likes', 'comments', 'shares', 'saves', 'cta', 'follow') as $k) {
    if (is_array($api) && array_key_exists($k, $api)) { $out[$k] = array('v' => (float)$api[$k], 's' => 'api'); continue; }
    if (is_array($manual) && isset($manual[$k]) && $manual[$k] !== '' && is_numeric($manual[$k])) { $out[$k] = array('v' => (float)$manual[$k], 's' => 'manual'); continue; }
    $out[$k] = array('v' => null, 's' => '');
  }
  return $out;
}
function cg_top($pdo, $d) {
  cg_pastikan($pdo);
  $plat = isset($d['platform']) ? (string)$d['platform'] : '';
  $urut = (isset($d['urut']) && $d['urut'] === 'er') ? 'er' : 'views';
  $dari = cg_tgl_sah(isset($d['dari']) ? $d['dari'] : '');
  $sampai = cg_tgl_sah(isset($d['sampai']) ? $d['sampai'] : '');
  $per = max(5, min(50, (int)(isset($d['per']) ? $d['per'] : 10)));
  $hal = max(1, (int)(isset($d['hal']) ? $d['hal'] : 1));
  /* Kata kunci (14 Okt 2026, permintaan user): dicari di judul/caption,
     tanpa memandang huruf besar-kecil. */
  $cari = strtolower(trim((string)(isset($d['q']) ? $d['q'] : '')));

  $semua = array(); $url = array();
  /* Angka Input Performa per TAUTAN — dipakai melengkapi baris TikTok yang
     postingannya juga tercatat di Konten Planning. Hanya platform TikTok yang
     dicocokkan: tautan TikTok yang ditempel di catatan Instagram bukan angka
     TikTok. */
  $kp = cg_konten_perf($pdo); $kpUrl = array();
  /* Dicocokkan per PLATFORM + tautan: tautan TikTok yang ditempel di catatan
     Instagram bukan angka TikTok (dan sebaliknya). */
  foreach ($kp as $k) if ($k['url'] !== '') $kpUrl[cg_plat_norm($k['platform']) . '|' . $k['url']] = $k;
  foreach ($pdo->query("SELECT platform, post_id, judul, url, tayang_at, views, likes, comments, shares, reach, saves FROM cg_post WHERE hilang=0")->fetchAll() as $p) {
    $kunciKp = cg_plat_norm($p['platform']) . '|' . (string)$p['url'];
    $man = ((string)$p['url'] !== '' && isset($kpUrl[$kunciKp])) ? $kpUrl[$kunciKp] : null;
    $api = array('views' => $p['views'], 'likes' => $p['likes'], 'comments' => $p['comments'], 'shares' => $p['shares']);
    /* Reach & saves hanya dari API Instagram; NULL (TikTok) tidak ikut, jadi
       angka Input Performa tetap yang dipakai. */
    if ($p['reach'] !== null) $api['reach'] = $p['reach'];
    if ($p['saves'] !== null) $api['saves'] = $p['saves'];
    $semua[] = array(
      'rinci' => cg_rinci($api, $man ? $man['m'] : null),
      'tercatat' => $man !== null,'platform' => cg_plat_norm($p['platform']), 'judul' => (string)$p['judul'] !== '' ? (string)$p['judul'] : '(tanpa keterangan)',
      'url' => (string)$p['url'], 'tanggal' => (int)$p['tayang_at'] > 0 ? gmdate('Y-m-d', (int)floor((int)$p['tayang_at'] / 1000) + 7 * 3600) : '',
      'views' => (float)$p['views'], 'likes' => (float)$p['likes'], 'comments' => (float)$p['comments'], 'shares' => (float)$p['shares'], 'sumber' => (string)$p['platform'] === 'instagram' ? 'instagram' : 'tiktok', 'pid' => (string)$p['post_id']);
    if ((string)$p['url'] !== '') $url[(string)$p['url']] = true;
  }
  foreach ($kp as $k) {
    if ($k['url'] !== '' && isset($url[$k['url']])) continue;
    $semua[] = array('rinci' => cg_rinci(null, $k['m']), 'tercatat' => true,'platform' => cg_plat_norm($k['platform']), 'judul' => $k['judul'] !== '' ? $k['judul'] : '(tanpa judul)',
      'url' => $k['url'], 'tanggal' => substr($k['tanggal'], 0, 10), 'views' => $k['views'], 'likes' => $k['likes'],
      'comments' => $k['comments'], 'shares' => $k['shares'], 'sumber' => 'konten');
  }

  /* Rentang tanggal memakai tanggal TAYANG. Baris tanpa tanggal tidak ikut
     kalau rentangnya disetel — tidak ada cara tahu ia jatuh di mana. */
  $lolos = array();
  foreach ($semua as $e) {
    if ($plat !== '' && $e['platform'] !== $plat) continue;
    if ($cari !== '' && strpos(strtolower($e['judul']), $cari) === false) continue;
    if ($dari !== null || $sampai !== null) {
      if ($e['tanggal'] === '') continue;
      if ($dari !== null && $e['tanggal'] < $dari) continue;
      if ($sampai !== null && $e['tanggal'] > $sampai) continue;
    }
    $e['er'] = $e['views'] > 0 ? ($e['likes'] + $e['comments'] + $e['shares']) / $e['views'] : null;
    $lolos[] = $e;
  }
  usort($lolos, function($a, $b) use ($urut) {
    if ($urut === 'er') {
      /* Yang tidak punya nilai SELALU di bawah. */
      if ($a['er'] === null && $b['er'] === null) return 0;
      if ($a['er'] === null) return 1;
      if ($b['er'] === null) return -1;
      if ($a['er'] != $b['er']) return $a['er'] < $b['er'] ? 1 : -1;
    }
    if ($a['views'] != $b['views']) return $a['views'] < $b['views'] ? 1 : -1;
    return strcmp($b['tanggal'], $a['tanggal']);
  });
  $total = count($lolos);
  /* Postingan Instagram yang pernah DIPROMOSIKAN: ringkasan iklannya
     (sepanjang waktu) ikut di barisnya. Angka Instagram API organik saja —
     tanpa ini selisihnya dengan angka di aplikasi Instagram tidak terjelaskan. */
  $iklanIg = array();
  try {
    $ts = (int)$pdo->query("SELECT MAX(sync_at) FROM cg_iklan WHERE periode='max'")->fetchColumn();
    if ($ts > 0) {
      $qi = $pdo->prepare("SELECT ig_media, permalink, SUM(spend) sp, SUM(impresi) im, SUM(reach) re, SUM(video_view) vv, COUNT(*) n FROM cg_iklan WHERE periode='max' AND sync_at=:s AND (ig_media<>'' OR permalink<>'') GROUP BY ig_media, permalink");
      $qi->execute(array(':s' => $ts));
      foreach ($qi->fetchAll() as $r) {
        $isi = array('spend' => (float)$r['sp'], 'impresi' => (int)$r['im'], 'reach' => (int)$r['re'], 'videoView' => (int)$r['vv'], 'n' => (int)$r['n']);
        /* Dicocokkan lewat ID media DAN kode tautan: tautan iklan berbentuk
           /p/KODE/ sementara tautan reel organiknya /reel/KODE/. */
        if ((string)$r['ig_media'] !== '') $iklanIg['id:' . $r['ig_media']] = $isi;
        $kd = cg_ig_kode((string)$r['permalink']);
        if ($kd !== '') $iklanIg['kd:' . $kd] = $isi;
      }
    }
  } catch (Throwable $e) {}
  if ($iklanIg) foreach ($lolos as &$e) {
    if ($e['platform'] !== 'Instagram') continue;
    $kd = cg_ig_kode((string)$e['url']);
    if (isset($e['pid']) && isset($iklanIg['id:' . $e['pid']])) $e['iklan'] = $iklanIg['id:' . $e['pid']];
    elseif ($kd !== '' && isset($iklanIg['kd:' . $kd])) $e['iklan'] = $iklanIg['kd:' . $kd];
  }
  unset($e);
  $halMaks = max(1, (int)ceil($total / $per));
  if ($hal > $halMaks) $hal = $halMaks;   /* dijepit: halaman 7 yang sudah tidak ada = tabel kosong */
  return array('baris' => array_slice($lolos, ($hal - 1) * $per, $per), 'total' => $total,
    'hal' => $hal, 'per' => $per, 'halMaks' => $halMaks);
}

/* ==================== INSIGHT ==================== */
function cg_tgl_sah($t) {
  $t = trim((string)$t);
  if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $t, $m)) return null;
  return checkdate((int)$m[2], (int)$m[3], (int)$m[1]) ? $t : null;
}
function cg_url_sah($s) {
  $s = trim((string)$s);
  if ($s === '') return '';
  return preg_match('#^https://[^\s]+$#i', $s) ? $s : null;
}

function cg_insight_simpan($pdo, $d, $nama) {
  cg_pastikan($pdo);
  $temuan = cg_potong(isset($d['temuan']) ? $d['temuan'] : '', 2000);
  if ($temuan === '') throw new Exception('Temuan wajib diisi — itulah inti insight-nya.');
  $url = cg_url_sah(isset($d['url']) ? $d['url'] : '');
  if ($url === null) throw new Exception('Tautan konten harus diawali https:// .');
  if ($url === '') throw new Exception('Tautan konten wajib diisi, supaya insight bisa ditelusuri ke konten aslinya.');
  $tgl = cg_tgl_sah(isset($d['tglTayang']) ? $d['tglTayang'] : '');
  if ($tgl === null) throw new Exception('Tanggal konten tayang wajib diisi.');
  $now = cg_now_ms();
  $id = isset($d['id']) ? trim((string)$d['id']) : '';
  $nilai = array(
    ':pl' => cg_potong(isset($d['platform']) ? $d['platform'] : '', 20),
    ':ka' => cg_potong(isset($d['kategori']) ? $d['kategori'] : '', 60),
    ':te' => $temuan,
    ':ur' => cg_potong($url, 600),
    ':tg' => $tgl,
    ':me' => cg_potong(isset($d['metrik']) ? $d['metrik'] : '', 255),
    ':ak' => cg_potong(isset($d['aksi']) ? $d['aksi'] : '', 2000),
  );
  if ($id !== '') {
    $q = $pdo->prepare('UPDATE cg_insight SET platform=:pl, kategori=:ka, temuan=:te, url=:ur, tgl_tayang=:tg, metrik=:me, aksi=:ak, diubah_oleh=:by, diubah_at=:at WHERE id=:id');
    $q->execute($nilai + array(':by' => $nama, ':at' => $now, ':id' => $id));
    if ($q->rowCount() === 0) throw new Exception('Insight yang disunting tidak ditemukan.');
    return array('id' => $id);
  }
  $id = cg_uid('ins');
  $sumber = isset($d['sumber']) && in_array($d['sumber'], array('manual', 'tiktok', 'instagram', 'konten', 'ai'), true) ? $d['sumber'] : 'manual';
  $q = $pdo->prepare('INSERT INTO cg_insight (id, platform, kategori, temuan, url, tgl_tayang, metrik, aksi, sumber, dibuat_oleh, dibuat_at) VALUES (:id, :pl, :ka, :te, :ur, :tg, :me, :ak, :su, :by, :at)');
  $q->execute($nilai + array(':id' => $id, ':su' => $sumber, ':by' => $nama, ':at' => $now));
  return array('id' => $id);
}

function cg_insight_arsip($pdo, $id, $arsip, $nama) {
  cg_pastikan($pdo);
  $q = $pdo->prepare('UPDATE cg_insight SET arsip=:ar, diubah_oleh=:by, diubah_at=:at WHERE id=:id');
  $q->execute(array(':ar' => $arsip ? 1 : 0, ':by' => $nama, ':at' => cg_now_ms(), ':id' => (string)$id));
  return array('ok' => true);
}

/* ==================== KALENDER / JADWAL ==================== */
function cg_status_sah($s) {
  $s = strtoupper(trim((string)$s));
  return in_array($s, array('DRAF', 'TERJADWAL', 'TAYANG', 'BATAL'), true) ? $s : null;
}

function cg_jadwal_simpan($pdo, $d, $nama) {
  cg_pastikan($pdo);
  $judul = cg_potong(isset($d['judul']) ? $d['judul'] : '', 200);
  if ($judul === '') throw new Exception('Judul konten wajib diisi.');
  $tgl = cg_tgl_sah(isset($d['tanggal']) ? $d['tanggal'] : '');
  if ($tgl === null) throw new Exception('Tanggal tayang wajib diisi.');
  $jam = trim((string)(isset($d['jam']) ? $d['jam'] : ''));
  if ($jam !== '' && !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $jam)) throw new Exception('Jam tayang harus berbentuk JJ:MM (24 jam).');
  $status = cg_status_sah(isset($d['status']) ? $d['status'] : 'DRAF');
  if ($status === null) throw new Exception('Status tidak dikenal.');
  $tautan = cg_url_sah(isset($d['tautan']) ? $d['tautan'] : '');
  if ($tautan === null) throw new Exception('Tautan hasil tayang harus diawali https:// .');
  /* TAYANG tanpa tautan tidak bisa diperiksa siapa pun, dan tautan itulah
     yang nanti dipakai menarik angkanya jadi insight. */
  if ($status === 'TAYANG' && $tautan === '') throw new Exception('Tandai Tayang butuh tautan postingannya.');
  $now = cg_now_ms();
  $nilai = array(
    ':pl' => cg_potong(isset($d['platform']) ? $d['platform'] : '', 20),
    ':ju' => $judul,
    ':ca' => cg_potong(isset($d['caption']) ? $d['caption'] : '', 5000),
    ':tg' => $tgl,
    ':jm' => $jam,
    ':st' => $status,
    ':ii' => cg_potong(isset($d['insightId']) ? $d['insightId'] : '', 40),
    ':pc' => cg_potong(isset($d['pic']) ? $d['pic'] : '', 120),
    ':ta' => cg_potong($tautan, 600),
    ':ct' => cg_potong(isset($d['catatan']) ? $d['catatan'] : '', 2000),
  );
  $id = isset($d['id']) ? trim((string)$d['id']) : '';
  if ($id !== '') {
    $q = $pdo->prepare('UPDATE cg_jadwal SET platform=:pl, judul=:ju, caption=:ca, tanggal=:tg, jam=:jm, status=:st, insight_id=:ii, pic=:pc, tautan=:ta, catatan=:ct, diubah_oleh=:by, diubah_at=:at WHERE id=:id');
    $q->execute($nilai + array(':by' => $nama, ':at' => $now, ':id' => $id));
    if ($q->rowCount() === 0) throw new Exception('Jadwal yang disunting tidak ditemukan.');
    return array('id' => $id);
  }
  $id = cg_uid('jdw');
  $q = $pdo->prepare('INSERT INTO cg_jadwal (id, platform, judul, caption, tanggal, jam, status, insight_id, pic, tautan, catatan, dibuat_oleh, dibuat_at) VALUES (:id, :pl, :ju, :ca, :tg, :jm, :st, :ii, :pc, :ta, :ct, :by, :at)');
  $q->execute($nilai + array(':id' => $id, ':by' => $nama, ':at' => $now));
  /* Dijadwalkan dari Bank Konten: idenya ditandai TERJADWAL berikut id
     jadwalnya, supaya ide yang sama tidak dijadwalkan dua kali tanpa tanda. */
  $bankId = isset($d['bankId']) ? cg_potong($d['bankId'], 40) : '';
  if ($bankId !== '') {
    $q = $pdo->prepare("UPDATE cg_bank SET status='TERJADWAL', jadwal_id=:j, diubah_oleh=:by, diubah_at=:at WHERE id=:id");
    $q->execute(array(':j' => $id, ':by' => $nama, ':at' => $now, ':id' => $bankId));
  }
  return array('id' => $id);
}

/* ==================== BANK KONTEN ==================== */
function cg_plat_bank($p, $cadangan) {
  $p = strtolower(trim((string)$p));
  if (strpos($p, 'tik') !== false) return 'TikTok';
  if (strpos($p, 'insta') !== false || $p === 'ig') return 'Instagram';
  if (strpos($p, 'you') !== false) return 'YouTube';
  return $cadangan;
}
function cg_jam_sah($j) {
  $j = trim((string)$j);
  return preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $j) ? $j : '';
}
function cg_bank_nilai($d) {
  return array(
    ':ju' => cg_potong(isset($d['judul']) ? $d['judul'] : '', 200),
    ':pl' => cg_plat_bank(isset($d['platform']) ? $d['platform'] : '', 'TikTok'),
    ':fo' => cg_potong(isset($d['format']) ? $d['format'] : '', 80),
    ':pi' => cg_potong(isset($d['pilar']) ? $d['pilar'] : '', 80),
    ':ho' => cg_potong(isset($d['hook']) ? $d['hook'] : '', 1000),
    ':ca' => cg_potong(isset($d['caption']) ? $d['caption'] : '', 5000),
    ':tg' => cg_tgl_sah(isset($d['tanggal']) ? $d['tanggal'] : ''),
    ':jm' => cg_jam_sah(isset($d['jam']) ? $d['jam'] : ''),
    ':al' => cg_potong(isset($d['alasan']) ? $d['alasan'] : '', 2000),
  );
}
function cg_bank_tambah($pdo, $d, $sumber, $batch, $nama, $now) {
  $nilai = cg_bank_nilai($d);
  if ($nilai[':ju'] === '') return null;
  $id = cg_uid('bnk');
  $q = $pdo->prepare('INSERT INTO cg_bank (id, judul, platform, format, pilar, hook, caption, tanggal, jam, alasan, sumber, batch, status, dibuat_oleh, dibuat_at) VALUES (:id, :ju, :pl, :fo, :pi, :ho, :ca, :tg, :jm, :al, :su, :ba, \'IDE\', :by, :at)');
  $q->execute($nilai + array(':id' => $id, ':su' => $sumber, ':ba' => $batch, ':by' => $nama, ':at' => $now));
  return $id;
}
/* Tambah manual / dari Riset, atau sunting. Status & jadwal_id TIDAK disentuh
   di sini — itu urusan Jadwalkan & Arsip. */
function cg_bank_simpan($pdo, $d, $nama) {
  cg_pastikan($pdo);
  $nilai = cg_bank_nilai($d);
  if ($nilai[':ju'] === '') throw new Exception('Judul ide wajib diisi.');
  $now = cg_now_ms();
  $id = isset($d['id']) ? trim((string)$d['id']) : '';
  if ($id !== '') {
    $q = $pdo->prepare('UPDATE cg_bank SET judul=:ju, platform=:pl, format=:fo, pilar=:pi, hook=:ho, caption=:ca, tanggal=:tg, jam=:jm, alasan=:al, diubah_oleh=:by, diubah_at=:at WHERE id=:id');
    $q->execute($nilai + array(':by' => $nama, ':at' => $now, ':id' => $id));
    if ($q->rowCount() === 0) throw new Exception('Ide yang disunting tidak ditemukan.');
    return array('id' => $id);
  }
  $sumber = (isset($d['sumber']) && $d['sumber'] === 'riset') ? 'riset' : 'manual';
  return array('id' => cg_bank_tambah($pdo, $d, $sumber, cg_potong(isset($d['batch']) ? $d['batch'] : '', 40), $nama, $now));
}
/* Arsip / pulihkan. Yang dipulihkan kembali ke TERJADWAL kalau ia memang
   sudah punya jadwal — kalau tidak, ia muncul lagi sebagai ide yang belum
   dijadwalkan dan dijadwalkan dua kali. */
function cg_bank_arsip($pdo, $id, $arsip, $nama) {
  cg_pastikan($pdo);
  $q = $pdo->prepare("UPDATE cg_bank SET status = CASE WHEN :ar = 1 THEN 'ARSIP' WHEN jadwal_id <> '' THEN 'TERJADWAL' ELSE 'IDE' END, diubah_oleh=:by, diubah_at=:at WHERE id=:id");
  $q->execute(array(':ar' => $arsip ? 1 : 0, ':by' => $nama, ':at' => cg_now_ms(), ':id' => (string)$id));
  if ($q->rowCount() === 0) throw new Exception('Ide tidak ditemukan.');
  return array('id' => $id);
}

/* HAPUS PERMANEN (14 Okt 2026, permintaan user: "ide yang diarsipkan bisa
   dihapus"). HANYA yang sudah ARSIP — dua langkah dengan jeda di tengah
   (arsipkan dulu, baru hapus), dan jeda itulah yang menahan penghapusan
   karena salah klik. Syaratnya ditegakkan DI SQL, bukan cuma di layar:
   tombolnya memang hanya digambar di tab Arsip, tapi satu panggilan dari
   console melewati seluruh penjagaan layar. Jadwal yang pernah lahir dari
   ide ini TIDAK ikut terhapus — ia milik Kalender. */
function cg_bank_hapus($pdo, $id) {
  cg_pastikan($pdo);
  $q = $pdo->prepare("DELETE FROM cg_bank WHERE id=:id AND status='ARSIP'");
  $q->execute(array(':id' => (string)$id));
  if ($q->rowCount() === 0) throw new Exception('Hanya ide yang sudah diarsipkan yang bisa dihapus.');
  return array('id' => $id);
}

/* GENERATE CONTENT PLANNING (14 Okt 2026). AI menyusun rencana konten untuk
   satu rentang tanggal dari profil brand, insight yang masih aktif, kategori
   pola, dan postingan brand yang paling jalan. Hasilnya LANGSUNG masuk Bank
   Konten sebagai ide (bukan jadwal): yang menjadwalkan tetap orang. */
function cg_bank_generate($pdo, $d, $nama) {
  cg_pastikan($pdo);
  $dari = cg_tgl_sah(isset($d['dari']) ? $d['dari'] : '');
  $sampai = cg_tgl_sah(isset($d['sampai']) ? $d['sampai'] : '');
  if ($dari === null || $sampai === null) throw new Exception('Rentang tanggal wajib diisi.');
  if ($sampai < $dari) throw new Exception('Tanggal akhir tidak boleh sebelum tanggal awal.');
  if ((strtotime($sampai) - strtotime($dari)) / 86400 > 62) throw new Exception('Rentang maksimal 2 bulan.');
  $jumlah = max(3, min(20, (int)(isset($d['jumlah']) ? $d['jumlah'] : 10)));
  $platform = cg_potong(isset($d['platform']) ? $d['platform'] : 'TikTok, Instagram', 40);
  $fokus = cg_potong(isset($d['fokus']) ? $d['fokus'] : '', 1500);
  $profil = cg_set_baca($pdo, 'profil', CG_PROFIL_BAWAAN);
  /* Pilar ide = kategori konten Content Planning (F&B, Promosi, Entertainment,
     ...), bukan kategori pola insight (hook, format) — yang terakhir bukan
     jenis konten (29 Okt 2026). Periode data & fokus kategori dikirim sebagai
     dataDari/dataSampai/pilar: dari/sampai di sini rentang RENCANA. */
  $kategori = cg_pilar_daftar();
  list($dDari, $dSampai) = cg_rentang_bukti(array('dari' => isset($d['dataDari']) ? $d['dataDari'] : '', 'sampai' => isset($d['dataSampai']) ? $d['dataSampai'] : ''));
  $pilarFokus = cg_fokus_rapikan(isset($d['pilar']) ? $d['pilar'] : array());
  $insight = array();
  foreach ($pdo->query('SELECT platform, kategori, temuan, aksi FROM cg_insight WHERE arsip=0 ORDER BY dibuat_at DESC LIMIT 30')->fetchAll() as $i) {
    $insight[] = array('platform' => $i['platform'], 'kategori' => $i['kategori'], 'temuan' => cg_potong($i['temuan'], 300), 'aksi' => cg_potong($i['aksi'], 300));
  }
  $bukti = cg_bukti_post($pdo, 20, $dDari, $dSampai);
  $platPilih = cg_plat_bank($platform, 'TikTok');

  $system = 'Kamu ahli strategi konten media sosial untuk bisnis F&B di Indonesia. Jawab dalam Bahasa Indonesia. '
    . 'Susun rencana konten yang realistis dikerjakan tim kecil. Jangan mengarang angka statistik, nama akun, atau tautan. '
    . 'Balas HANYA dengan satu objek JSON, tanpa teks lain.';
  $prompt = "Profil brand: $profil
Rentang tanggal: $dari sampai $sampai
Platform: $platform
Jumlah konten: $jumlah
"
    . ($fokus !== '' ? "Fokus / catatan: $fokus
" : '')
    . "Pilar konten yang dipakai tim: " . implode(', ', $kategori) . "
"
    . ($pilarFokus ? 'Buat ide HANYA untuk pilar: ' . implode(', ', $pilarFokus) . ". Isi field pilar dengan salah satunya.\n" : '')
    . ($dDari !== '' ? "Postingan brand di bawah hanya yang tayang $dDari s/d $dSampai.\n" : '')
    . "
Insight tim yang masih berlaku (pakai sebagai dasar):
" . json_encode($insight, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
    . "

Postingan brand yang paling jalan (diurut views):
" . json_encode($bukti, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
    . "

Buat content planning berbentuk JSON persis:
"
    . '{"ringkasan":"1-2 kalimat strategi","ide":[{"judul":"","platform":"TikTok|Instagram|YouTube","format":"misal Reels/Video pendek/Carousel/Story",'
    . '"pilar":"salah satu pilar di atas","tanggal":"YYYY-MM-DD di dalam rentang","jam":"HH:MM WIB","hook":"kalimat 3 detik pertama",'
    . '"caption":"caption siap pakai dengan hashtag","alasan":"kenapa konten ini, sebut insight/postingan yang jadi dasarnya"}]}'
    . "
Buat tepat $jumlah ide, sebar merata di rentang tanggal, variasikan pilar dan format.";

  $r = cg_ai_tanya($pdo, $system, $prompt, 7000);
  /* Sambungan BARU: yang lama kemungkinan sudah diputus MySQL selama menunggu
     AI — lihat db() di lib_konten_mysql.php. */
  $pdo = db(true);
  $daftar = isset($r['hasil']['ide']) && is_array($r['hasil']['ide']) ? $r['hasil']['ide'] : array();
  $batch = cg_uid('gen');
  $now = cg_now_ms();
  $ids = array();
  foreach ($daftar as $ide) {
    if (!is_array($ide)) continue;
    /* Tanggal di luar rentang dikosongkan, bukan ditebak: yang menjadwalkan
       memilih sendiri. Pilar di luar daftar juga dikosongkan. */
    $tg = cg_tgl_sah(isset($ide['tanggal']) ? $ide['tanggal'] : '');
    $ide['tanggal'] = ($tg !== null && $tg >= $dari && $tg <= $sampai) ? $tg : '';
    if (!isset($ide['pilar']) || !in_array((string)$ide['pilar'], $kategori, true)) $ide['pilar'] = '';
    $ide['platform'] = cg_plat_bank(isset($ide['platform']) ? $ide['platform'] : '', $platPilih);
    $id = cg_bank_tambah($pdo, $ide, 'ai', $batch, $nama, $now);
    if ($id !== null) $ids[] = $id;
    if (count($ids) >= 20) break;
  }
  if (!$ids) throw new Exception('AI tidak menghasilkan satu pun ide yang bisa disimpan. Coba jalankan lagi.');
  return array('batch' => $batch, 'jumlah' => count($ids),
    'ringkasan' => isset($r['hasil']['ringkasan']) ? cg_potong($r['hasil']['ringkasan'], 600) : '', 'model' => $r['model']);
}

/* ==================== AI (Meta Model API, format Messages) ==================== */
/* Untuk layar Pengaturan: daftar penyedia & model, mana yang key-nya terisi
   — TANPA isi key-nya. */
function cg_ai_ringkas($pdo) {
  $out = array();
  foreach (cg_ai_daftar() as $p => $x) {
    $out[] = array('id' => $p, 'label' => $x['label'], 'model' => $x['model'],
      'modelPakai' => cg_ai_model_untuk($pdo, $p), 'siap' => cg_ai_key_untuk($pdo, $p) !== '',
      'dariConfig' => defined($x['konstanta']) && constant($x['konstanta']) !== '');
  }
  return $out;
}

function cg_ai_tanya($pdo, $system, $prompt, $maks = 6000) {
  $p = cg_ai_penyedia($pdo); $daftar = cg_ai_daftar(); $x = $daftar[$p];
  $key = cg_ai_key_untuk($pdo, $p);
  if ($key === '') throw new Exception('API key ' . $x['label'] . ' belum diisi. Admin modul bisa mengisinya di Pengaturan.');
  $model = cg_ai_model_untuk($pdo, $p);
  /* Muse Spark selalu MENALAR dulu, dan token penalarannya ikut dihitung di
     max_tokens. Tanpa tambahan jatah, jawabannya terpotong sebelum JSON-nya
     selesai — dan riset gagal tanpa sebab yang terbaca. */
  $maks = $maks + 8000;
  @set_time_limit(180);
  /* Meta: Authorization Bearer. */
  $header = array('content-type: application/json', 'Authorization: Bearer ' . $key);
  $r = cg_http('POST', $x['url'], $header, json_encode(array(
    'model' => $model,
    'max_tokens' => $maks,
    'system' => $system,
    'messages' => array(array('role' => 'user', 'content' => $prompt)),
  ), JSON_UNESCAPED_UNICODE), 160);
  if ($r['kode'] !== 200 || !$r['data']) {
    $pesan = isset($r['data']['error']['message']) ? $r['data']['error']['message'] : $r['mentah'];
    throw new Exception($x['label'] . ' menolak (' . $r['kode'] . '): ' . (is_string($pesan) ? $pesan : json_encode($pesan)));
  }
  /* Bentuk jawaban dibaca longgar (14 Okt 2026): blok content bertipe text
     (format Messages), content berupa string, atau bentuk
     choices[0].message.content. Yang dibaca satu bentuk saja menulis "bukan
     JSON" untuk jawaban yang sebenarnya utuh. */
  $teks = '';
  $isi = isset($r['data']['content']) ? $r['data']['content'] : null;
  if (is_string($isi)) $teks = $isi;
  elseif (is_array($isi)) foreach ($isi as $b) {
    if (is_array($b) && isset($b['type']) && $b['type'] === 'text' && isset($b['text']) && is_string($b['text'])) $teks .= $b['text'];
  }
  if ($teks === '' && isset($r['data']['choices'][0]['message']['content']) && is_string($r['data']['choices'][0]['message']['content'])) $teks = $r['data']['choices'][0]['message']['content'];
  /* Ambil JSON pertama di jawabannya — model kadang membungkusnya dengan
     ```json, dan menolak jawaban gara-gara pagar itu membuang satu riset
     yang sudah dibayar. */
  /* Terpotong batas token: dikatakan apa adanya, bukan "bukan JSON". */
  $henti = isset($r['data']['stop_reason']) ? (string)$r['data']['stop_reason'] : '';
  if ($henti === 'max_tokens') throw new Exception('Jawaban AI terpotong karena terlalu panjang (batas token). Coba topik yang lebih sempit, atau jalankan lagi.');
  if (trim($teks) === '') throw new Exception('AI tidak memberi jawaban teks' . ($henti !== '' ? ' (berhenti: ' . $henti . ')' : '') . '. Coba jalankan lagi.');
  $a = strpos($teks, '{'); $z = strrpos($teks, '}');
  /* Potongan jawabannya ikut disebut — tanpa itu "bukan JSON" tidak bisa
     dibedakan dari penolakan, jawaban kosong, atau model yang menjawab prosa. */
  if ($a === false || $z === false || $z <= $a) throw new Exception('Jawaban AI bukan JSON (' . $model . '): "' . cg_potong(preg_replace('/\s+/', ' ', $teks), 160) . '". Coba jalankan lagi.');
  $j = json_decode(substr($teks, $a, $z - $a + 1), true);
  if (!is_array($j)) throw new Exception('Jawaban AI tidak bisa dibaca. Coba jalankan lagi.');
  return array('hasil' => $j, 'model' => $model);
}

/* Ringkasan postingan terbaik yang diberikan ke AI sebagai bukti. TANPA itu
   AI cuma mengarang dari pengetahuan umumnya — dengan itu ia membaca pola
   dari konten brand ini sendiri. */
/* Kategori konten (pilar) = BERKAS KEMBAR PILLARS di deploy/konten/planning/
   dan KONTEN_PILAR di deploy/konten/analytics/. Dipakai sebagai FOKUS analisa
   (29 Okt 2026, permintaan user: FNB, Entertainment, Promosi, ...). Nilai di
   luar daftar dibuang, bukan ditebak. */
function cg_pilar_daftar() {
  return array('Product & Menu','Promotion','Event','Entertainment','Education','Lifestyle','BTS','Corporate','Community','Information');
}
function cg_fokus_rapikan($f) {
  $out = array(); if (!is_array($f)) return $out;
  $sah = cg_pilar_daftar();
  foreach ($f as $x) if (is_string($x) && in_array($x, $sah, true) && !in_array($x, $out, true)) $out[] = $x;
  return $out;
}
/* Rentang data yang dibaca AI. Kosong = semua waktu (perilaku lama). Tanggal
   tidak sah DITOLAK, bukan diabaikan: diabaikan, analisa "7 hari terakhir"
   diam-diam membaca seluruh riwayat dan tetap terlihat wajar. */
function cg_rentang_bukti($d) {
  $dari = isset($d['dari']) ? trim((string)$d['dari']) : '';
  $sampai = isset($d['sampai']) ? trim((string)$d['sampai']) : '';
  if ($dari === '' && $sampai === '') return array('', '');
  $a = cg_tgl_sah($dari); $b = cg_tgl_sah($sampai);
  if ($a === null || $b === null) throw new Exception('Rentang tanggal tidak sah.');
  if ($a > $b) throw new Exception('Tanggal mulai lebih besar dari tanggal akhir.');
  return array($a, $b);
}
/* Tautan dibakukan untuk dicocokkan: tanpa query/hash/garis miring ekor. */
function cg_url_kunci($u) {
  $u = strtolower(trim((string)$u));
  $u = preg_replace('/[?#].*$/', '', $u);
  return rtrim($u, '/');
}
/* Peta tautan -> pilar dari baris konten modul Konten. Postingan TikTok/IG
   tidak punya pilar sendiri; yang tautannya dicatat di Content Planning
   kebagian pilarnya, sisanya kosong (AI menilainya dari judul). */
function cg_peta_pilar($pdo) {
  $peta = array();
  try { $rows = $pdo->query('SELECT data FROM content')->fetchAll(); } catch (Throwable $e) { return $peta; }
  foreach ($rows as $row) {
    $c = json_decode((string)$row['data'], true);
    if (!is_array($c) || empty($c['pillar'])) continue;
    $u = isset($c['publishRecord']['url']) && is_string($c['publishRecord']['url']) ? cg_url_kunci($c['publishRecord']['url']) : '';
    if ($u !== '') $peta[$u] = (string)$c['pillar'];
  }
  return $peta;
}
function cg_bukti_post($pdo, $n = 25, $dari = '', $sampai = '') {
  cg_pastikan($pdo);
  $baris = array();
  $where = 'hilang=0'; $arg = array();
  if ($dari !== '') {
    /* Hari WIB: 00:00 WIB = 17:00 UTC hari sebelumnya. */
    $where .= ' AND tayang_at >= :a AND tayang_at < :b';
    $arg[':a'] = (strtotime($dari . ' 00:00:00 UTC') - 7 * 3600) * 1000;
    $arg[':b'] = (strtotime($sampai . ' 00:00:00 UTC') + 86400 - 7 * 3600) * 1000;
  }
  $pilar = cg_peta_pilar($pdo);
  $q = $pdo->prepare('SELECT platform, judul, url, tayang_at, views, likes, comments, shares FROM cg_post WHERE ' . $where . ' ORDER BY views DESC LIMIT ' . (int)$n);
  $q->execute($arg);
  foreach ($q->fetchAll() as $p) {
    $uk = cg_url_kunci($p['url']);
    $baris[] = array('platform' => $p['platform'], 'judul' => cg_potong($p['judul'], 220), 'url' => $p['url'],
      'tanggal' => $p['tayang_at'] ? gmdate('Y-m-d', (int)($p['tayang_at'] / 1000) + 7 * 3600) : '',
      'pilar' => isset($pilar[$uk]) ? $pilar[$uk] : '',
      'views' => (int)$p['views'], 'likes' => (int)$p['likes'], 'comments' => (int)$p['comments'], 'shares' => (int)$p['shares']);
  }
  foreach (cg_konten_perf($pdo) as $k) {
    if (count($baris) >= $n * 2) break;
    $tk = substr((string)$k['tanggal'], 0, 10);
    if ($dari !== '' && ($tk === '' || $tk < $dari || $tk > $sampai)) continue;
    $baris[] = array('platform' => $k['platform'], 'judul' => cg_potong($k['judul'], 220), 'url' => $k['url'], 'tanggal' => $k['tanggal'],
      'pilar' => $k['pillar'],
      'views' => (int)$k['views'], 'likes' => (int)$k['likes'], 'comments' => (int)$k['comments'], 'shares' => (int)$k['shares']);
  }
  return $baris;
}
/* Kalimat periode + fokus untuk prompt, satu tempat untuk riset & insight. */
function cg_prompt_fokus($dari, $sampai, $fokus) {
  $t = '';
  if ($dari !== '') $t .= "Periode data: $dari s/d $sampai (hanya postingan yang tayang di rentang ini).\n";
  if ($fokus) $t .= 'FOKUS analisa HANYA pada konten kategori: ' . implode(', ', $fokus)
    . '. Kolom "pilar" di data menyebut kategori postingan yang sudah diketahui; yang kosong nilai sendiri dari judul/caption-nya, dan abaikan yang jelas bukan kategori fokus.' . "\n";
  return $t;
}

function cg_riset_jalankan($pdo, $d, $nama) {
  cg_pastikan($pdo);
  $topik = cg_potong(isset($d['topik']) ? $d['topik'] : '', 255);
  if ($topik === '') throw new Exception('Topik riset wajib diisi.');
  $platform = cg_potong(isset($d['platform']) ? $d['platform'] : 'TikTok, Instagram', 40);
  $catatan = cg_potong(isset($d['catatan']) ? $d['catatan'] : '', 1500);
  $profil = cg_set_baca($pdo, 'profil', CG_PROFIL_BAWAAN);
  list($dari, $sampai) = cg_rentang_bukti($d);
  $fokus = cg_fokus_rapikan(isset($d['fokus']) ? $d['fokus'] : array());
  $bukti = cg_bukti_post($pdo, 20, $dari, $sampai);
  $hariIni = gmdate('Y-m-d', time() + 7 * 3600);

  $system = 'Kamu ahli strategi konten media sosial untuk bisnis F&B di Indonesia. Jawab dalam Bahasa Indonesia. '
    . 'Kamu TIDAK punya akses internet: yang kamu sebut tren adalah perkiraan dari pengetahuanmu dan dari data postingan brand yang diberikan, '
    . 'jadi jangan mengarang angka statistik, nama akun, atau tautan. Kalau tidak yakin, katakan. '
    . 'Balas HANYA dengan satu objek JSON, tanpa teks lain.';
  $prompt = "Tanggal hari ini: $hariIni.\nProfil brand: $profil\nTopik riset: $topik\nPlatform: $platform\n"
    . ($catatan !== '' ? "Catatan tambahan: $catatan\n" : '')
    . cg_prompt_fokus($dari, $sampai, $fokus)
    . "\nData postingan brand ini (diurut dari views terbanyak):\n" . json_encode($bukti, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
    . "\n\nBuat riset dengan bentuk JSON persis berikut:\n"
    . '{"ringkasan":"2-3 kalimat","pola":[{"temuan":"pola dari data postingan brand di atas","bukti":"judul/tautan postingan yang jadi buktinya","aksi":"yang sebaiknya dilakukan"}],'
    . '"tren":[{"judul":"","penjelasan":"","platform":"","keyakinan":"tinggi|sedang|rendah"}],'
    . '"ide":[{"judul":"","platform":"TikTok|Instagram|YouTube","format":"","hook":"kalimat 3 detik pertama","caption":"caption siap pakai dengan hashtag","hari":"hari & jam tayang yang disarankan","alasan":""}],'
    . '"waktuTayang":["..."],"hashtag":["#..."],"peringatan":["hal yang perlu dicek manual"]}'
    . "\nBerikan 3-5 pola, 4-6 tren, dan 8 ide konten. Pola WAJIB bersumber dari data postingan di atas; kalau datanya kosong, kosongkan array pola.";

  $r = cg_ai_tanya($pdo, $system, $prompt, 7000);
  /* Sambungan BARU sesudah menunggu AI — tanpa ini INSERT di bawah gagal
     "MySQL server has gone away" (lihat db()). Sudah kejadian 14 Okt 2026. */
  $pdo = db(true);
  /* Periode & fokus ikut tersimpan supaya riwayat riset menyebut data apa
     yang dibacanya — dua riset bertopik sama dari periode berbeda terbaca
     sama persis tanpa ini. */
  if (is_array($r['hasil'])) $r['hasil']['_meta'] = array('dari' => $dari, 'sampai' => $sampai, 'fokus' => $fokus, 'nBukti' => count($bukti));
  $id = cg_uid('rst');
  $q = $pdo->prepare('INSERT INTO cg_riset (id, jenis, topik, platform, catatan, hasil, model, oleh, at) VALUES (:id, :je, :to, :pl, :ca, :ha, :mo, :by, :at)');
  $q->execute(array(':id' => $id, ':je' => 'tren', ':to' => $topik, ':pl' => $platform, ':ca' => $catatan,
    ':ha' => json_encode($r['hasil'], JSON_UNESCAPED_UNICODE), ':mo' => $r['model'], ':by' => $nama, ':at' => cg_now_ms()));
  return array('id' => $id, 'hasil' => $r['hasil'], 'model' => $r['model']);
}

/* Insight OTOMATIS dari postingan yang sudah ditarik. Hasilnya cuma USULAN —
   tidak ada yang tersimpan sampai orang menekan Simpan di layar. Insight yang
   lahir sendiri tanpa dibaca siapa pun adalah tebakan mesin yang menyamar
   jadi temuan tim. */
function cg_insight_ai($pdo, $d = array()) {
  list($dari, $sampai) = cg_rentang_bukti($d);
  $fokus = cg_fokus_rapikan(isset($d['fokus']) ? $d['fokus'] : array());
  $bukti = cg_bukti_post($pdo, 30, $dari, $sampai);
  if (!$bukti && $dari !== '') throw new Exception("Tidak ada postingan yang tayang $dari s/d $sampai. Pilih rentang yang lebih panjang.");
  if (!$bukti) throw new Exception('Belum ada postingan yang bisa dianalisa. Hubungkan & sinkronkan akun TikTok, atau isi Input Performa di modul Konten.');
  $profil = cg_set_baca($pdo, 'profil', CG_PROFIL_BAWAAN);
  $kategori = cg_kategori($pdo);
  $system = 'Kamu analis konten media sosial. Jawab dalam Bahasa Indonesia. Analisa HANYA dari data yang diberikan; '
    . 'jangan mengarang angka atau tautan. Balas HANYA dengan satu objek JSON.';
  $prompt = "Profil brand: $profil\n" . cg_prompt_fokus($dari, $sampai, $fokus) . "Postingan (diurut views):\n" . json_encode($bukti, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
    . "\n\nTemukan 4-6 pola yang membuat postingan teratas lebih berhasil daripada yang bawah (hook, topik, format, waktu tayang, ajakan). Bentuk JSON:\n"
    . '{"insight":[{"platform":"TikTok|Instagram|YouTube","kategori":"' . implode('|', $kategori) . '",'
    . '"temuan":"","url":"tautan PERSIS dari data di atas yang paling mewakili","tglTayang":"YYYY-MM-DD dari data","metrik":"angka dari data","aksi":""}]}';
  $r = cg_ai_tanya($pdo, $system, $prompt, 4000);
  $daftar = isset($r['hasil']['insight']) && is_array($r['hasil']['insight']) ? $r['hasil']['insight'] : array();
  /* Tautan yang tidak ada di data DIBUANG: insight yang menunjuk konten
     karangan tidak bisa ditelusuri, padahal itu syarat tiap insight. */
  $sah = array();
  foreach ($bukti as $b) if ($b['url'] !== '') $sah[$b['url']] = true;
  $out = array();
  foreach ($daftar as $i) {
    if (!is_array($i)) continue;
    $url = isset($i['url']) ? (string)$i['url'] : '';
    if (!isset($sah[$url])) $url = '';
    $i['url'] = $url;
    /* Kategori di luar daftar yang disetel DIKOSONGKAN, bukan ditebak: yang
       menyimpan usulannya memilih sendiri dari formulirnya. */
    if (!isset($i['kategori']) || !in_array((string)$i['kategori'], $kategori, true)) $i['kategori'] = '';
    $out[] = $i;
  }
  return array('usulan' => $out, 'model' => $r['model']);
}

/* ==================== TIKTOK ==================== */
function cg_tiktok_mulai($pdo, $nama) {
  cg_pastikan($pdo);
  $key = cg_tiktok_key($pdo);
  if ($key === '' || cg_tiktok_secret($pdo) === '') throw new Exception('Client key & secret TikTok belum diisi di Pengaturan.');
  /* state sekali pakai, berumur 15 menit — tanpa itu siapa pun bisa
     menyodorkan kode otorisasi akunnya sendiri ke alamat balik kita. */
  $state = bin2hex(random_bytes(16));
  cg_set_tulis($pdo, 'tiktok_state', json_encode(array('s' => $state, 'exp' => cg_now_ms() + 15 * 60000, 'by' => $nama)));
  $q = http_build_query(array(
    'client_key' => $key,
    /* Daftar ini WAJIB sama dengan scope yang dicentang di app TikTok
       Developer Portal. Meminta scope yang tidak dicentang di sana membuat
       TikTok menolak otorisasinya sama sekali. */
    'scope' => CG_TIKTOK_SCOPE,
    'response_type' => 'code',
    'redirect_uri' => cg_redirect_uri(),
    'state' => $state,
  ));
  return array('url' => 'https://www.tiktok.com/v2/auth/authorize/?' . $q);
}

function cg_tiktok_simpan_token($pdo, $t, $nama) {
  $now = cg_now_ms();
  /* Akun BERBEDA yang dihubungkan: penanda riwayat milik akun lama dibuang,
     kalau tidak cursor-nya dipakai untuk akun baru dan riwayat akun baru
     tidak pernah tertarik. Perbarui token (akun sama) tidak menyentuhnya. */
  $baru = (string)(isset($t['open_id']) ? $t['open_id'] : '');
  $lq = $pdo->prepare('SELECT open_id FROM cg_akun WHERE platform = :p');
  $lq->execute(array(':p' => 'tiktok'));
  $lama = (string)$lq->fetchColumn();
  if ($baru !== '' && $lama !== '' && $lama !== $baru) {
    cg_set_tulis($pdo, 'tiktok_bf_cursor', '');
    cg_set_tulis($pdo, 'tiktok_bf_selesai', '');
  }
  $q = $pdo->prepare('INSERT INTO cg_akun (platform, open_id, access_token, refresh_token, token_exp, refresh_exp, scope, oleh, at)
    VALUES (:pl, :oi, :ac, :rf, :te, :re, :sc, :by, :at)
    ON DUPLICATE KEY UPDATE open_id=VALUES(open_id), access_token=VALUES(access_token), refresh_token=VALUES(refresh_token),
      token_exp=VALUES(token_exp), refresh_exp=VALUES(refresh_exp), scope=VALUES(scope), oleh=VALUES(oleh), at=VALUES(at)');
  $q->execute(array(':pl' => 'tiktok', ':oi' => (string)(isset($t['open_id']) ? $t['open_id'] : ''),
    ':ac' => (string)$t['access_token'], ':rf' => (string)(isset($t['refresh_token']) ? $t['refresh_token'] : ''),
    ':te' => $now + (int)(isset($t['expires_in']) ? $t['expires_in'] : 0) * 1000,
    ':re' => $now + (int)(isset($t['refresh_expires_in']) ? $t['refresh_expires_in'] : 0) * 1000,
    ':sc' => (string)(isset($t['scope']) ? $t['scope'] : ''), ':by' => $nama, ':at' => $now));
}

function cg_tiktok_token_minta($pdo, $form) {
  $r = cg_http('POST', 'https://open.tiktokapis.com/v2/oauth/token/',
    array('Content-Type: application/x-www-form-urlencoded', 'Cache-Control: no-cache'),
    http_build_query($form + array('client_key' => cg_tiktok_key($pdo), 'client_secret' => cg_tiktok_secret($pdo))), 30);
  if (!$r['data'] || empty($r['data']['access_token'])) {
    $p = isset($r['data']['error_description']) ? $r['data']['error_description'] : (isset($r['data']['error']) ? $r['data']['error'] : $r['mentah']);
    throw new Exception('TikTok menolak token: ' . $p);
  }
  return $r['data'];
}

/* Dipanggil campaign-tiktok.php (alamat balik OAuth). */
function cg_tiktok_callback($pdo, $code, $state) {
  cg_pastikan($pdo);
  $st = json_decode(cg_set_baca($pdo, 'tiktok_state'), true);
  if (!is_array($st) || !hash_equals((string)$st['s'], (string)$state)) throw new Exception('Tautan otorisasi tidak dikenal. Ulangi dari tombol Hubungkan.');
  if ((int)$st['exp'] < cg_now_ms()) throw new Exception('Tautan otorisasi sudah kedaluwarsa (15 menit). Ulangi dari tombol Hubungkan.');
  cg_set_tulis($pdo, 'tiktok_state', '');
  $t = cg_tiktok_token_minta($pdo, array('code' => $code, 'grant_type' => 'authorization_code', 'redirect_uri' => cg_redirect_uri()));
  cg_tiktok_simpan_token($pdo, $t, (string)$st['by']);
  return cg_tiktok_sync($pdo);
}

function cg_tiktok_token($pdo) {
  $q = $pdo->prepare('SELECT * FROM cg_akun WHERE platform = :p');
  $q->execute(array(':p' => 'tiktok'));
  $a = $q->fetch();
  if (!$a || (string)$a['access_token'] === '') throw new Exception('Akun TikTok belum terhubung.');
  /* Token akses berumur 24 jam; diperbarui satu menit sebelum habis. */
  if ((int)$a['token_exp'] - 60000 < cg_now_ms()) {
    if ((string)$a['refresh_token'] === '' || (int)$a['refresh_exp'] < cg_now_ms()) {
      throw new Exception('Izin TikTok sudah habis masa berlakunya. Tekan Hubungkan lagi.');
    }
    $t = cg_tiktok_token_minta($pdo, array('grant_type' => 'refresh_token', 'refresh_token' => $a['refresh_token']));
    cg_tiktok_simpan_token($pdo, $t, (string)$a['oleh']);
    return (string)$t['access_token'];
  }
  return (string)$a['access_token'];
}

function cg_tiktok_sync($pdo) {
  cg_pastikan($pdo);
  $now = cg_now_ms();
  try {
    $tok = cg_tiktok_token($pdo);
    $auth = array('Authorization: Bearer ' . $tok);

    /* Field yang diminta mengikuti scope yang BENAR-BENAR diberikan saat akun
       dihubungkan (kolom `scope`), bukan daftar yang kita harapkan: akun yang
       dihubungkan sebelum 13 Okt 2026 cuma punya user.info.basic, dan meminta
       field di luar izinnya membuat TikTok menolak SELURUH permintaan —
       nama & avatar pun ikut tidak terbaca. */
    $qs = $pdo->prepare('SELECT scope FROM cg_akun WHERE platform = :p');
    $qs->execute(array(':p' => 'tiktok'));
    $izin = array_map('trim', explode(',', (string)$qs->fetchColumn()));
    $adaProfil = in_array('user.info.profile', $izin, true);
    $adaStats  = in_array('user.info.stats', $izin, true);
    $fu = 'open_id,display_name,avatar_url';
    if ($adaProfil) $fu .= ',bio_description,profile_web_link,is_verified';
    if ($adaStats)  $fu .= ',follower_count,following_count,likes_count,video_count';
    $u = cg_http('GET', 'https://open.tiktokapis.com/v2/user/info/?fields=' . $fu, $auth, null, 30);
    $user = isset($u['data']['data']['user']) ? $u['data']['data']['user'] : array();
    if ($user) {
      $g = function($k) use ($user) { return isset($user[$k]) ? $user[$k] : null; };
      $q = $pdo->prepare('UPDATE cg_akun SET nama=:n, avatar=:a, bio=:b, profil_url=:pu, terverifikasi=:tv,
        follower=:f, following=:fg, likes_total=:lk, jml_video=:jv, stats_ada=:sa WHERE platform=:p');
      $q->execute(array(':n' => (string)$g('display_name'), ':a' => (string)$g('avatar_url'),
        ':b' => cg_potong((string)$g('bio_description'), 1000), ':pu' => cg_potong((string)$g('profile_web_link'), 400),
        ':tv' => $g('is_verified') ? 1 : 0,
        ':f' => (int)$g('follower_count'), ':fg' => (int)$g('following_count'),
        ':lk' => (int)$g('likes_count'), ':jv' => (int)$g('video_count'),
        /* Penanda TERPISAH dari angkanya: follower 0 yang memang nol dan
           follower 0 karena izinnya belum ada tidak boleh berbunyi sama. */
        ':sa' => $adaStats ? 1 : 0, ':p' => 'tiktok'));
      /* Potret harian akun TikTok (follower & total likes akun). Hanya kalau
         izin statistiknya ada — tanpa itu angkanya 0 dan selisihnya bohong. */
      if ($adaStats) cg_harian_simpan($pdo, 'tiktok', cg_wib_hari(0), array('follower' => (int)$g('follower_count'),
        'likes_total' => (int)$g('likes_count'), 'jml_post' => (int)$g('video_count')), 'potret');
    }

    $fields = 'id,title,video_description,create_time,cover_image_url,share_url,view_count,like_count,comment_count,share_count,duration';
    $n = 0;
    $ins = $pdo->prepare('INSERT INTO cg_post (platform, post_id, judul, url, cover, tayang_at, views, likes, comments, shares, durasi, sync_at, hilang)
      VALUES (:pl, :id, :ju, :ur, :co, :ta, :vi, :li, :cm, :sh, :du, :sy, 0)
      ON DUPLICATE KEY UPDATE judul=VALUES(judul), url=VALUES(url), cover=VALUES(cover), tayang_at=VALUES(tayang_at),
        views=VALUES(views), likes=VALUES(likes), comments=VALUES(comments), shares=VALUES(shares), durasi=VALUES(durasi),
        sync_at=VALUES(sync_at), hilang=0');
    $simpan = function($v) use ($ins, $now, &$n) {
      $judul = trim((string)(isset($v['video_description']) ? $v['video_description'] : ''));
      if ($judul === '') $judul = (string)(isset($v['title']) ? $v['title'] : '');
      $ins->execute(array(':pl' => 'tiktok', ':id' => (string)$v['id'], ':ju' => $judul,
        ':ur' => (string)(isset($v['share_url']) ? $v['share_url'] : ''),
        ':co' => cg_potong(isset($v['cover_image_url']) ? $v['cover_image_url'] : '', 900),
        ':ta' => (int)(isset($v['create_time']) ? $v['create_time'] : 0) * 1000,
        ':vi' => (int)(isset($v['view_count']) ? $v['view_count'] : 0), ':li' => (int)(isset($v['like_count']) ? $v['like_count'] : 0),
        ':cm' => (int)(isset($v['comment_count']) ? $v['comment_count'] : 0), ':sh' => (int)(isset($v['share_count']) ? $v['share_count'] : 0),
        ':du' => (int)(isset($v['duration']) ? $v['duration'] : 0), ':sy' => $now));
      $n++;
    };
    /* Satu halaman video.list (maks 20 — batas TikTok). Cursor = penanda
       waktu; halaman berikutnya selalu video yang LEBIH LAMA. */
    $halaman = function($cursor) use ($auth, $fields) {
      $isi = array('max_count' => 20);
      if ($cursor !== null && $cursor !== '') $isi['cursor'] = (int)$cursor;
      $r = cg_http('POST', 'https://open.tiktokapis.com/v2/video/list/?fields=' . $fields,
        array_merge($auth, array('Content-Type: application/json')), json_encode($isi), 30);
      $data = isset($r['data']['data']) ? $r['data']['data'] : null;
      if (!$data) {
        $p = isset($r['data']['error']['message']) ? $r['data']['error']['message'] : $r['mentah'];
        throw new Exception('Daftar video TikTok tidak terbaca: ' . $p);
      }
      return $data;
    };

    /* SATU SINKRON TETAP RINGAN — paling banyak 9 permintaan ke TikTok,
       berapa pun jumlah video akunnya (13 Okt 2026, permintaan user: "semua
       data, tapi per page per API page aja, jadi sistemnya tidak berat").
       Sebelumnya cuma 100 video TERBARU yang pernah ditarik, jadi video lama
       yang justru paling banyak ditonton (mis. Okt 2025, ±1 jt views) tidak
       pernah muncul di Konten terpopuler.

       1. TERBARU — 2 halaman (40 video): angkanya paling cepat berubah. */
    $lanjut = null; $habis = false;
    for ($h = 0; $h < 2; $h++) {
      $data = $halaman($lanjut);
      foreach ((isset($data['videos']) ? $data['videos'] : array()) as $v) $simpan($v);
      if (empty($data['has_more'])) { $habis = true; break; }
      $lanjut = isset($data['cursor']) ? (string)$data['cursor'] : null;
    }

    /* 2. RIWAYAT — dilanjutkan dari cursor TERSIMPAN, 5 halaman (100 video)
       per sinkron, sampai TikTok bilang tidak ada lagi. Cursornya disimpan
       tiap halaman, jadi sinkron yang putus di tengah tidak mengulang dari
       awal. Pertama kali, ia mulai tepat di ujung halaman terbaru di atas. */
    $selesai = cg_set_baca($pdo, 'tiktok_bf_selesai') === '1';
    if (!$selesai) {
      $c = cg_set_baca($pdo, 'tiktok_bf_cursor');
      if ($c === '') $c = $habis ? null : $lanjut;
      if ($c === null) $selesai = true;
      for ($h = 0; !$selesai && $h < 5; $h++) {
        $data = $halaman($c);
        foreach ((isset($data['videos']) ? $data['videos'] : array()) as $v) $simpan($v);
        if (empty($data['has_more'])) { $selesai = true; break; }
        $c = isset($data['cursor']) ? (string)$data['cursor'] : '';
        if ($c === '') { $selesai = true; break; }
        cg_set_tulis($pdo, 'tiktok_bf_cursor', $c);
      }
      if ($selesai) { cg_set_tulis($pdo, 'tiktok_bf_selesai', '1'); cg_set_tulis($pdo, 'tiktok_bf_cursor', ''); }
    }

    /* 3. SEGARKAN YANG LAMA — 2 x 20 video yang paling lama tidak disegarkan,
       lewat video/query (pakai id, satu permintaan per 20 video). Tanpa ini
       angka video lama membeku di hari ia pertama ditarik. Video yang tidak
       dipulangkan TikTok (dihapus/diprivat) ditandai `hilang` — bukan dihapus
       dari tabel — dan berhenti tampil; kalau tidak ditandai ia selalu jadi
       yang "paling lama" dan menahan giliran video lain selamanya. */
    $tua = $pdo->prepare("SELECT post_id FROM cg_post WHERE platform='tiktok' AND hilang=0 AND sync_at < :s ORDER BY sync_at ASC LIMIT 40");
    $tua->execute(array(':s' => $now));
    $ids = array_map('strval', $tua->fetchAll(PDO::FETCH_COLUMN));
    foreach (array_chunk($ids, 20) as $kelompok) {
      $r = cg_http('POST', 'https://open.tiktokapis.com/v2/video/query/?fields=' . $fields,
        array_merge($auth, array('Content-Type: application/json')), json_encode(array('filters' => array('video_ids' => $kelompok))), 30);
      $data = isset($r['data']['data']) ? $r['data']['data'] : null;
      if (!$data) break;   /* segar ulang gagal bukan alasan menggagalkan sinkron */
      $ada = array();
      foreach ((isset($data['videos']) ? $data['videos'] : array()) as $v) { $simpan($v); $ada[(string)$v['id']] = true; }
      $tandai = $pdo->prepare("UPDATE cg_post SET hilang=1, sync_at=:s WHERE platform='tiktok' AND post_id=:id");
      foreach ($kelompok as $id) if (!isset($ada[$id])) $tandai->execute(array(':s' => $now, ':id' => $id));
    }

    $q = $pdo->prepare('UPDATE cg_akun SET sync_at=:s, sync_galat=:g WHERE platform=:p');
    $q->execute(array(':s' => $now, ':g' => '', ':p' => 'tiktok'));
    $total = (int)$pdo->query("SELECT COUNT(*) FROM cg_post WHERE platform='tiktok' AND hilang=0")->fetchColumn();
    return array('jumlah' => $n, 'total' => $total, 'riwayatSelesai' => $selesai);
  } catch (Throwable $e) {
    /* Galat sinkron DISIMPAN, bukan cuma dilempar: sinkron otomatis berjalan
       tanpa ada yang menunggu jawabannya, jadi tanpa ini kegagalannya tidak
       pernah dibaca siapa pun. */
    try {
      $q = $pdo->prepare('UPDATE cg_akun SET sync_galat=:g WHERE platform=:p');
      $q->execute(array(':g' => cg_potong($e->getMessage(), 400), ':p' => 'tiktok'));
    } catch (Throwable $e2) {}
    throw $e;
  }
}

function cg_tiktok_putus($pdo, $nama) {
  cg_pastikan($pdo);
  $q = $pdo->prepare("UPDATE cg_akun SET access_token='', refresh_token='', token_exp=0, refresh_exp=0, oleh=:by, at=:at WHERE platform=:p");
  $q->execute(array(':by' => $nama, ':at' => cg_now_ms(), ':p' => 'tiktok'));
  return array('ok' => true);
}

/* ==================== INSTAGRAM (login bisnis Instagram) ====================
   14 Okt 2026. Pola yang SAMA dengan TikTok: state OAuth sekali pakai,
   token ditukar server-ke-server (App Secret tidak pernah menyentuh
   peramban), postingan masuk cg_post dengan platform 'instagram'.

   Bedanya: token Instagram berumur 60 HARI dan TIDAK punya refresh token —
   token itu sendiri yang diperbarui (ig_refresh_token), syaratnya sudah
   berumur >= 24 jam dan belum kedaluwarsa. Diperbarui begitu sisa umurnya
   di bawah 30 hari; kalau gagal, token lama tetap dipakai sampai habis. */
function cg_ig_mulai($pdo, $nama) {
  cg_pastikan($pdo);
  $id = cg_ig_id($pdo);
  if ($id === '' || cg_ig_secret($pdo) === '') throw new Exception('Instagram App ID & App Secret belum diisi di Pengaturan.');
  $state = bin2hex(random_bytes(16));
  cg_set_tulis($pdo, 'ig_state', json_encode(array('s' => $state, 'exp' => cg_now_ms() + 15 * 60000, 'by' => $nama)));
  $q = http_build_query(array(
    'client_id' => $id,
    'redirect_uri' => cg_ig_redirect_uri(),
    'response_type' => 'code',
    'scope' => CG_IG_SCOPE,
    'state' => $state,
    'enable_fb_login' => '0',
    'force_authentication' => '1',
  ));
  return array('url' => 'https://www.instagram.com/oauth/authorize?' . $q);
}

function cg_ig_galat($r, $awal) {
  $p = isset($r['data']['error']['message']) ? $r['data']['error']['message']
    : (isset($r['data']['error_message']) ? $r['data']['error_message'] : $r['mentah']);
  return $awal . ': ' . (is_string($p) ? $p : json_encode($p));
}

function cg_ig_simpan_token($pdo, $tok, $exp, $userId, $scope, $nama) {
  $now = cg_now_ms();
  $lq = $pdo->prepare('SELECT open_id FROM cg_akun WHERE platform = :p');
  $lq->execute(array(':p' => 'instagram'));
  $lama = (string)$lq->fetchColumn();
  /* Akun BERBEDA: penanda riwayat akun lama dibuang. */
  if ($userId !== '' && $lama !== '' && $lama !== $userId) {
    cg_set_tulis($pdo, 'ig_bf_after', '');
    cg_set_tulis($pdo, 'ig_bf_selesai', '');
  }
  $q = $pdo->prepare('INSERT INTO cg_akun (platform, open_id, access_token, refresh_token, token_exp, refresh_exp, scope, oleh, at)
    VALUES (:pl, :oi, :ac, :rf, :te, :re, :sc, :by, :at)
    ON DUPLICATE KEY UPDATE open_id=VALUES(open_id), access_token=VALUES(access_token), refresh_token=VALUES(refresh_token),
      token_exp=VALUES(token_exp), refresh_exp=VALUES(refresh_exp), scope=VALUES(scope), oleh=VALUES(oleh), at=VALUES(at)');
  $q->execute(array(':pl' => 'instagram', ':oi' => $userId, ':ac' => $tok, ':rf' => '',
    ':te' => $exp, ':re' => $exp, ':sc' => $scope, ':by' => $nama, ':at' => $now));
}

/* Dipanggil campaign-instagram.php (alamat balik OAuth). */
function cg_ig_callback($pdo, $code, $state) {
  cg_pastikan($pdo);
  $st = json_decode(cg_set_baca($pdo, 'ig_state'), true);
  if (!is_array($st) || !hash_equals((string)$st['s'], (string)$state)) throw new Exception('Tautan otorisasi tidak dikenal. Ulangi dari tombol Hubungkan.');
  if ((int)$st['exp'] < cg_now_ms()) throw new Exception('Tautan otorisasi sudah kedaluwarsa (15 menit). Ulangi dari tombol Hubungkan.');
  cg_set_tulis($pdo, 'ig_state', '');
  /* Instagram kadang menempelkan "#_" di ujung kodenya. */
  $code = preg_replace('/#_$/', '', (string)$code);
  /* 1. Kode -> token berumur pendek (1 jam). */
  $r = cg_http('POST', 'https://api.instagram.com/oauth/access_token', array('Content-Type: application/x-www-form-urlencoded'),
    http_build_query(array('client_id' => cg_ig_id($pdo), 'client_secret' => cg_ig_secret($pdo), 'grant_type' => 'authorization_code',
      'redirect_uri' => cg_ig_redirect_uri(), 'code' => $code)), 30);
  $d = $r['data'];
  if (isset($d['data'][0]) && is_array($d['data'][0])) $d = $d['data'][0];   /* bentuk lama */
  if (!$d || empty($d['access_token'])) throw new Exception(cg_ig_galat($r, 'Instagram menolak token'));
  $userId = (string)(isset($d['user_id']) ? $d['user_id'] : '');
  $izin = isset($d['permissions']) ? (is_array($d['permissions']) ? implode(',', $d['permissions']) : (string)$d['permissions']) : CG_IG_SCOPE;
  /* 2. Token pendek -> token 60 hari. */
  $r2 = cg_http('GET', 'https://graph.instagram.com/access_token?' . http_build_query(array('grant_type' => 'ig_exchange_token',
    'client_secret' => cg_ig_secret($pdo), 'access_token' => (string)$d['access_token'])), array(), null, 30);
  if (!$r2['data'] || empty($r2['data']['access_token'])) throw new Exception(cg_ig_galat($r2, 'Instagram menolak token jangka panjang'));
  $exp = cg_now_ms() + (int)(isset($r2['data']['expires_in']) ? $r2['data']['expires_in'] : 5184000) * 1000;
  cg_ig_simpan_token($pdo, (string)$r2['data']['access_token'], $exp, $userId, $izin, (string)$st['by']);
  return cg_ig_sync($pdo);
}

function cg_ig_token($pdo) {
  $q = $pdo->prepare('SELECT * FROM cg_akun WHERE platform = :p');
  $q->execute(array(':p' => 'instagram'));
  $a = $q->fetch();
  if (!$a || (string)$a['access_token'] === '') throw new Exception('Akun Instagram belum terhubung.');
  $now = cg_now_ms();
  if ((int)$a['token_exp'] < $now) throw new Exception('Izin Instagram sudah habis masa berlakunya (60 hari). Tekan Hubungkan lagi.');
  $tok = (string)$a['access_token'];
  if ((int)$a['token_exp'] - $now < 30 * 86400000 && $now - (int)$a['at'] > 86400000) {
    $r = cg_http('GET', 'https://graph.instagram.com/refresh_access_token?' . http_build_query(array('grant_type' => 'ig_refresh_token', 'access_token' => $tok)), array(), null, 30);
    if ($r['data'] && !empty($r['data']['access_token'])) {
      $tok = (string)$r['data']['access_token'];
      cg_ig_simpan_token($pdo, $tok, $now + (int)(isset($r['data']['expires_in']) ? $r['data']['expires_in'] : 5184000) * 1000,
        (string)$a['open_id'], (string)$a['scope'], (string)$a['oleh']);
    }
  }
  return $tok;
}

/* Angka per postingan dari /{media}/insights. Metrik yang tidak berlaku untuk
   jenis medianya membuat SELURUH permintaan ditolak, jadi dicoba bertingkat:
   lengkap dulu, lalu yang paling dasar. Yang gagal dipulangkan null — bukan
   0 — supaya kolomnya tetap terbaca "belum ada". */
function cg_ig_insight_media($tok, $id) {
  foreach (array('views,reach,saved,shares', 'reach,saved', 'reach') as $m) {
    $r = cg_http('GET', CG_IG_GRAPH . '/' . rawurlencode($id) . '/insights?' . http_build_query(array('metric' => $m, 'access_token' => $tok)), array(), null, 20);
    if (!$r['data'] || !isset($r['data']['data']) || !is_array($r['data']['data'])) continue;
    $out = array();
    foreach ($r['data']['data'] as $x) {
      if (!isset($x['name'])) continue;
      $v = isset($x['values'][0]['value']) ? $x['values'][0]['value'] : (isset($x['total_value']['value']) ? $x['total_value']['value'] : null);
      if (is_numeric($v)) $out[$x['name']] = (int)$v;
    }
    return $out;
  }
  return null;
}

function cg_ig_sync($pdo) {
  cg_pastikan($pdo);
  @set_time_limit(150);
  $now = cg_now_ms();
  try {
    $tok = cg_ig_token($pdo);

    /* Profil + statistik akun. */
    $u = cg_http('GET', CG_IG_GRAPH . '/me?' . http_build_query(array('fields' => 'user_id,username,name,profile_picture_url,followers_count,follows_count,media_count,biography', 'access_token' => $tok)), array(), null, 30);
    if (!$u['data'] || isset($u['data']['error'])) throw new Exception(cg_ig_galat($u, 'Profil Instagram tidak terbaca'));
    $p = $u['data'];
    $g = function($k) use ($p) { return isset($p[$k]) ? $p[$k] : null; };
    $uname = (string)$g('username');
    $q = $pdo->prepare('UPDATE cg_akun SET nama=:n, avatar=:a, bio=:b, profil_url=:pu, terverifikasi=0,
      follower=:f, following=:fg, likes_total=0, jml_video=:jv, stats_ada=1 WHERE platform=:p');
    $q->execute(array(':n' => (string)($g('name') ? $g('name') : $uname), ':a' => cg_potong((string)$g('profile_picture_url'), 900),
      ':b' => cg_potong((string)$g('biography'), 1000), ':pu' => $uname !== '' ? 'https://www.instagram.com/' . rawurlencode($uname) . '/' : '',
      ':f' => (int)$g('followers_count'), ':fg' => (int)$g('follows_count'), ':jv' => (int)$g('media_count'), ':p' => 'instagram'));
    cg_ig_harian($pdo, $tok, (int)$g('followers_count'));

    $fields = 'id,caption,media_type,media_product_type,permalink,timestamp,thumbnail_url,media_url,like_count,comments_count';
    /* VIEWS SEBELUMNYA CUMA TERISI 30 POSTINGAN PER SINKRON (14 Okt 2026,
       keluhan user: "views terbanyak cuma 29 rb padahal ada yang 300-an rb").
       Postingan yang belum kebagian giliran berdiri dengan views 0, jadi reel
       yang paling laris bisa tidak muncul di Konten terpopuler sama sekali.
       Sekarang insight ikut DIEKSPANSI di daftar media — satu permintaan
       untuk 50 postingan. Kalau Instagram menolak ekspansinya (metrik yang
       tidak berlaku untuk salah satu jenis media menolak SELURUH permintaan),
       daftar ditarik ulang tanpa insight dan giliran langkah 3 yang mengisi. */
    $fieldsIns = $fields . ',insights.metric(views,reach,saved,shares)';
    $pakaiIns = true;
    $insUp = $pdo->prepare("UPDATE cg_post SET views=:vi, reach=:re, saves=:sa, shares=:sh, insight_at=:at WHERE platform='instagram' AND post_id=:id");
    $insDari = function($m) {
      if (!isset($m['insights']['data']) || !is_array($m['insights']['data'])) return null;
      $o = array();
      foreach ($m['insights']['data'] as $x) {
        if (!isset($x['name'])) continue;
        $v = isset($x['values'][0]['value']) ? $x['values'][0]['value'] : (isset($x['total_value']['value']) ? $x['total_value']['value'] : null);
        if (is_numeric($v)) $o[$x['name']] = (int)$v;
      }
      return $o ? $o : null;
    };
    $n = 0;
    $ins = $pdo->prepare('INSERT INTO cg_post (platform, post_id, judul, url, cover, tayang_at, views, likes, comments, shares, durasi, sync_at, hilang)
      VALUES (:pl, :id, :ju, :ur, :co, :ta, 0, :li, :cm, 0, 0, :sy, 0)
      ON DUPLICATE KEY UPDATE judul=VALUES(judul), url=VALUES(url), cover=VALUES(cover), tayang_at=VALUES(tayang_at),
        likes=VALUES(likes), comments=VALUES(comments), sync_at=VALUES(sync_at), hilang=0');
    $simpan = function($m) use ($ins, $now, &$n, $insDari, $insUp) {
      $ts = isset($m['timestamp']) ? strtotime((string)$m['timestamp']) : 0;
      $cover = isset($m['thumbnail_url']) ? $m['thumbnail_url'] : (isset($m['media_url']) && (!isset($m['media_type']) || $m['media_type'] !== 'VIDEO') ? $m['media_url'] : '');
      $ins->execute(array(':pl' => 'instagram', ':id' => (string)$m['id'], ':ju' => (string)(isset($m['caption']) ? $m['caption'] : ''),
        ':ur' => cg_potong(isset($m['permalink']) ? $m['permalink'] : '', 600), ':co' => cg_potong((string)$cover, 900),
        ':ta' => $ts ? $ts * 1000 : 0, ':li' => (int)(isset($m['like_count']) ? $m['like_count'] : 0),
        ':cm' => (int)(isset($m['comments_count']) ? $m['comments_count'] : 0), ':sy' => $now));
      $n++;
      $ix = $insDari($m);
      if ($ix) $insUp->execute(array(':vi' => isset($ix['views']) ? $ix['views'] : (isset($ix['reach']) ? $ix['reach'] : 0),
        ':re' => isset($ix['reach']) ? $ix['reach'] : null, ':sa' => isset($ix['saved']) ? $ix['saved'] : null,
        ':sh' => isset($ix['shares']) ? $ix['shares'] : 0, ':at' => $now, ':id' => (string)$m['id']));
    };
    $halaman = function($after) use ($tok, $fields, $fieldsIns, &$pakaiIns) {
      $qs = array('fields' => $pakaiIns ? $fieldsIns : $fields, 'limit' => 50, 'access_token' => $tok);
      if ($after !== null && $after !== '') $qs['after'] = $after;
      $r = cg_http('GET', CG_IG_GRAPH . '/me/media?' . http_build_query($qs), array(), null, 30);
      if ($pakaiIns && (!$r['data'] || !isset($r['data']['data']))) {
        $pakaiIns = false;
        $qs['fields'] = $fields;
        $r = cg_http('GET', CG_IG_GRAPH . '/me/media?' . http_build_query($qs), array(), null, 30);
      }
      if (!$r['data'] || !isset($r['data']['data'])) throw new Exception(cg_ig_galat($r, 'Daftar postingan Instagram tidak terbaca'));
      return $r['data'];
    };
    $lanjut = function($data) {
      return (!empty($data['paging']['next']) && isset($data['paging']['cursors']['after'])) ? (string)$data['paging']['cursors']['after'] : '';
    };

    /* 1. TERBARU — 1 halaman (50 postingan). */
    $data = $halaman(null);
    foreach ($data['data'] as $m) $simpan($m);
    $after = $lanjut($data);

    /* 2. RIWAYAT — SELURUH postingan akun, bukan cuma yang terbaru (14 Okt
       2026, permintaan user: "samakan dengan konsep TikTok"). Dilanjutkan
       dari cursor TERSIMPAN, 4 halaman (200 postingan) per sinkron, sampai
       Instagram bilang tidak ada lagi. Cursor disimpan tiap halaman, jadi
       sinkron yang putus di tengah tidak mengulang dari awal. */
    /* SEKALI SAJA sesudah ekspansi insight lahir: riwayat yang sudah
       tertarik tanpa views ditarik ulang dari awal supaya ikut terisi. */
    if ($pakaiIns && cg_set_baca($pdo, 'ig_bf_v') !== '2') {
      cg_set_tulis($pdo, 'ig_bf_selesai', ''); cg_set_tulis($pdo, 'ig_bf_after', ''); cg_set_tulis($pdo, 'ig_bf_v', '2');
    }
    $selesai = cg_set_baca($pdo, 'ig_bf_selesai') === '1';
    if (!$selesai) {
      $c = cg_set_baca($pdo, 'ig_bf_after');
      if ($c === '') $c = $after;
      if ($c === '') $selesai = true;
      for ($h = 0; !$selesai && $h < 4; $h++) {
        $data = $halaman($c);
        foreach ($data['data'] as $m) $simpan($m);
        $c = $lanjut($data);
        if ($c === '') { $selesai = true; break; }
        cg_set_tulis($pdo, 'ig_bf_after', $c);
      }
      if ($selesai) { cg_set_tulis($pdo, 'ig_bf_selesai', '1'); cg_set_tulis($pdo, 'ig_bf_after', ''); }
    }

    /* 3. SEGARKAN YANG LAMA + INSIGHT per postingan — padanan langkah 3
       TikTok. Tiap sinkron menyentuh 30 postingan yang paling lama tidak
       disegarkan (yang belum pernah punya insight duluan): likes & komentar
       ditarik ulang, lalu views, reach, saves, share. Berputar terus, jadi
       SELURUH postingan kebagian dan angkanya tidak membeku di hari ia
       pertama ditarik. Postingan yang sudah tidak dipulangkan Instagram
       (dihapus/diarsipkan) ditandai `hilang`, bukan dihapus dari tabel. */
    $tua = $pdo->query("SELECT post_id FROM cg_post WHERE platform='instagram' AND hilang=0 ORDER BY insight_at ASC, tayang_at DESC LIMIT 30")->fetchAll(PDO::FETCH_COLUMN);
    $up = $pdo->prepare("UPDATE cg_post SET views=:vi, reach=:re, saves=:sa, shares=:sh, insight_at=:at WHERE platform='instagram' AND post_id=:id");
    $tandai = $pdo->prepare("UPDATE cg_post SET insight_at=:at WHERE platform='instagram' AND post_id=:id");
    $dasar = $pdo->prepare("UPDATE cg_post SET likes=:li, comments=:cm, sync_at=:sy WHERE platform='instagram' AND post_id=:id");
    $hilang = $pdo->prepare("UPDATE cg_post SET hilang=1, insight_at=:at WHERE platform='instagram' AND post_id=:id");
    foreach ($tua as $id) {
      $mb = cg_http('GET', CG_IG_GRAPH . '/' . rawurlencode((string)$id) . '?' . http_build_query(array('fields' => 'id,like_count,comments_count', 'access_token' => $tok)), array(), null, 20);
      if (isset($mb['data']['error'])) {
        /* Kode 100 = objek tidak ada / tidak bisa dibaca lagi. Galat lain
           (batas permintaan, jaringan) TIDAK menandai hilang. */
        if ((int)(isset($mb['data']['error']['code']) ? $mb['data']['error']['code'] : 0) === 100) { $hilang->execute(array(':at' => $now, ':id' => $id)); continue; }
      } elseif ($mb['data']) {
        $dasar->execute(array(':li' => (int)(isset($mb['data']['like_count']) ? $mb['data']['like_count'] : 0),
          ':cm' => (int)(isset($mb['data']['comments_count']) ? $mb['data']['comments_count'] : 0), ':sy' => $now, ':id' => $id));
      }
      $ix = cg_ig_insight_media($tok, (string)$id);
      if ($ix === null) { $tandai->execute(array(':at' => $now, ':id' => $id)); continue; }
      $up->execute(array(':vi' => isset($ix['views']) ? $ix['views'] : (isset($ix['reach']) ? $ix['reach'] : 0),
        ':re' => isset($ix['reach']) ? $ix['reach'] : null, ':sa' => isset($ix['saved']) ? $ix['saved'] : null,
        ':sh' => isset($ix['shares']) ? $ix['shares'] : 0, ':at' => $now, ':id' => $id));
    }

    $q = $pdo->prepare('UPDATE cg_akun SET sync_at=:s, sync_galat=:g WHERE platform=:p');
    $q->execute(array(':s' => $now, ':g' => '', ':p' => 'instagram'));
    $total = (int)$pdo->query("SELECT COUNT(*) FROM cg_post WHERE platform='instagram' AND hilang=0")->fetchColumn();
    return array('jumlah' => $n, 'total' => $total, 'riwayatSelesai' => $selesai);
  } catch (Throwable $e) {
    try {
      $q = $pdo->prepare('UPDATE cg_akun SET sync_galat=:g WHERE platform=:p');
      $q->execute(array(':g' => cg_potong($e->getMessage(), 400), ':p' => 'instagram'));
    } catch (Throwable $e2) {}
    throw $e;
  }
}

function cg_ig_putus($pdo, $nama) {
  cg_pastikan($pdo);
  $q = $pdo->prepare("UPDATE cg_akun SET access_token='', refresh_token='', token_exp=0, refresh_exp=0, oleh=:by, at=:at WHERE platform=:p");
  $q->execute(array(':by' => $nama, ':at' => cg_now_ms(), ':p' => 'instagram'));
  return array('ok' => true);
}

/* ==================== PERTUMBUHAN HARIAN ==================== */
function cg_wib_hari($offset = 0) { return gmdate('Y-m-d', time() + 7 * 3600 + $offset * 86400); }
/* Upsert satu hari. Kolom NULL di $isi TIDAK menimpa yang sudah ada —
   potret follower siang tidak boleh menghapus angka insight hari itu. */
function cg_harian_simpan($pdo, $platform, $tgl, $isi, $sumber) {
  $kol = array('follower', 'follower_baru', 'views', 'reach', 'likes', 'comments', 'shares', 'saves', 'interaksi', 'likes_total', 'jml_post');
  $nilai = array(':pl' => $platform, ':tg' => $tgl, ':su' => $sumber, ':sy' => cg_now_ms());
  $set = array();
  foreach ($kol as $k) {
    $nilai[':' . $k] = (isset($isi[$k]) && $isi[$k] !== null) ? (int)$isi[$k] : null;
    $set[] = "`$k` = COALESCE(VALUES(`$k`), `$k`)";
  }
  $q = $pdo->prepare('INSERT INTO cg_harian (platform, tgl, ' . implode(', ', $kol) . ', sumber, sync_at) VALUES (:pl, :tg, :'
    . implode(', :', $kol) . ', :su, :sy) ON DUPLICATE KEY UPDATE ' . implode(', ', $set) . ', sumber=VALUES(sumber), sync_at=VALUES(sync_at)');
  $q->execute($nilai);
}

/* Insight AKUN Instagram per hari (views, reach, likes, komentar, share,
   saves, interaksi). Satu permintaan per hari (metric_type=total_value),
   jadi dicicil: 3 hari terakhir selalu disegarkan (angkanya masih bergerak),
   lalu hari lama yang belum ada sampai 90 hari ke belakang, 15 per sinkron.
   Follower baru per hari dari follower_count (Instagram cuma menyediakan 30
   hari terakhir). Galat di sini TIDAK menggagalkan sinkron postingan. */
function cg_ig_harian($pdo, $tok, $follower) {
  cg_harian_simpan($pdo, 'instagram', cg_wib_hari(0), array('follower' => $follower), 'api');
  try {
    $ada = array();
    foreach ($pdo->query("SELECT tgl FROM cg_harian WHERE platform='instagram' AND reach IS NOT NULL")->fetchAll(PDO::FETCH_COLUMN) as $t) $ada[$t] = true;
    $daftar = array();
    for ($i = 1; $i <= 90; $i++) {
      $t = cg_wib_hari(-$i);
      if ($i <= 3 || !isset($ada[$t])) $daftar[] = $t;
      if (count($daftar) >= 15) break;
    }
    $metrikSet = array('views,reach,likes,comments,shares,saves,total_interactions', 'reach,likes,comments,shares,saves,total_interactions', 'reach');
    $pakai = 0;
    foreach ($daftar as $t) {
      $mulai = strtotime($t . ' 00:00:00 UTC') - 7 * 3600;
      $hasil = null;
      for ($m = $pakai; $m < count($metrikSet); $m++) {
        $r = cg_http('GET', CG_IG_GRAPH . '/me/insights?' . http_build_query(array('metric' => $metrikSet[$m], 'period' => 'day',
          'metric_type' => 'total_value', 'since' => $mulai, 'until' => $mulai + 86400, 'access_token' => $tok)), array(), null, 20);
        if ($r['data'] && isset($r['data']['data']) && is_array($r['data']['data'])) { $hasil = $r['data']['data']; $pakai = $m; break; }
      }
      if ($hasil === null) continue;
      $o = array();
      foreach ($hasil as $x) {
        if (!isset($x['name'])) continue;
        $v = isset($x['total_value']['value']) ? $x['total_value']['value'] : (isset($x['values'][0]['value']) ? $x['values'][0]['value'] : null);
        if (is_numeric($v)) $o[$x['name']] = (int)$v;
      }
      cg_harian_simpan($pdo, 'instagram', $t, array('views' => isset($o['views']) ? $o['views'] : null,
        'reach' => isset($o['reach']) ? $o['reach'] : null, 'likes' => isset($o['likes']) ? $o['likes'] : null,
        'comments' => isset($o['comments']) ? $o['comments'] : null, 'shares' => isset($o['shares']) ? $o['shares'] : null,
        'saves' => isset($o['saves']) ? $o['saves'] : null, 'interaksi' => isset($o['total_interactions']) ? $o['total_interactions'] : null), 'api');
    }
    /* Follower baru per hari, 30 hari terakhir (deret waktu). */
    $r = cg_http('GET', CG_IG_GRAPH . '/me/insights?' . http_build_query(array('metric' => 'follower_count', 'period' => 'day',
      'since' => strtotime(cg_wib_hari(-29) . ' 00:00:00 UTC') - 7 * 3600, 'until' => strtotime(cg_wib_hari(0) . ' 00:00:00 UTC') - 7 * 3600, 'access_token' => $tok)), array(), null, 20);
    if ($r['data'] && isset($r['data']['data'][0]['values']) && is_array($r['data']['data'][0]['values'])) {
      foreach ($r['data']['data'][0]['values'] as $v) {
        if (!isset($v['end_time'], $v['value']) || !is_numeric($v['value'])) continue;
        /* end_time = akhir hari; hari yang dimaksud sehari sebelumnya (WIB). */
        $t = gmdate('Y-m-d', strtotime((string)$v['end_time']) + 7 * 3600 - 86400);
        cg_harian_simpan($pdo, 'instagram', $t, array('follower_baru' => (int)$v['value']), 'api');
      }
    }
  } catch (Throwable $e) {}
}

/* Data halaman Pertumbuhan: harian platform + iklan harian, untuk rentang
   yang diminta DAN rentang sebelumnya (pembanding "naik/turun"). */
function cg_tumbuh($pdo, $d) {
  cg_pastikan($pdo);
  $hari = max(7, min(90, (int)(isset($d['hari']) ? $d['hari'] : 30)));
  $dari = cg_wib_hari(-$hari * 2);
  $q = $pdo->prepare('SELECT * FROM cg_harian WHERE tgl >= :d ORDER BY tgl ASC');
  $q->execute(array(':d' => $dari));
  $h = $q->fetchAll();
  $q = $pdo->prepare('SELECT tgl, SUM(spend) spend, SUM(impresi) impresi, SUM(reach) reach, SUM(klik) klik, SUM(video_view) video_view, SUM(interaksi) interaksi, SUM(chat) chat
    FROM cg_iklan_harian WHERE tgl >= :d GROUP BY tgl ORDER BY tgl ASC');
  $q->execute(array(':d' => $dari));
  return array('hari' => $hari, 'kini' => cg_wib_hari(0), 'harian' => $h, 'iklan' => $q->fetchAll(),
    'iklanAda' => (int)$pdo->query('SELECT COUNT(*) FROM cg_iklan_harian')->fetchColumn() > 0);
}

/* ==================== IKLAN META (Marketing API) ====================
   14 Okt 2026, permintaan user: "setting utk ambil ads juga, jadi tau ads
   mana yg works dan yang tidak". Insight per IKLAN (level=ad) untuk tiga
   periode. "Hasil" tiap iklan dipilih menurut TUJUAN kampanyenya — biaya
   per chat, per klik, dan per 1.000 jangkauan tidak bisa dibandingkan satu
   sama lain, jadi penilaian works/tidak dikerjakan layar DALAM label hasil
   yang sama. */
function cg_ads_hasil($objective, $actions, $reach) {
  $a = array();
  if (is_array($actions)) foreach ($actions as $x) {
    if (isset($x['action_type'], $x['value'])) $a[(string)$x['action_type']] = (float)$x['value'];
  }
  $o = strtoupper((string)$objective);
  $coba = function($daftar) use ($a) {
    foreach ($daftar as $k => $label) if (isset($a[$k]) && $a[$k] > 0) return array($label, $a[$k]);
    return null;
  };
  $chat = array('onsite_conversion.messaging_conversation_started_7d' => 'Chat dimulai', 'onsite_conversion.total_messaging_connection' => 'Chat dimulai');
  $klik = array('link_click' => 'Klik tautan', 'landing_page_view' => 'Klik tautan');
  $lead = array('lead' => 'Prospek (lead)', 'onsite_conversion.lead_grouped' => 'Prospek (lead)', 'offsite_conversion.fb_pixel_lead' => 'Prospek (lead)');
  $beli = array('purchase' => 'Pembelian', 'offsite_conversion.fb_pixel_purchase' => 'Pembelian', 'omni_purchase' => 'Pembelian');
  $video = array('video_view' => 'Video views');
  $intr = array('post_engagement' => 'Interaksi', 'page_engagement' => 'Interaksi');
  if (strpos($o, 'AWARENESS') !== false || $o === 'REACH' || $o === 'BRAND_AWARENESS') return array('Jangkauan', (float)$reach);
  if ($o === 'VIDEO_VIEWS') { $r = $coba($video); if ($r) return $r; }
  if (strpos($o, 'LEAD') !== false) { $r = $coba($lead); if ($r) return $r; }
  if (strpos($o, 'SALES') !== false || $o === 'CONVERSIONS') { $r = $coba($beli); if ($r) return $r; }
  if (strpos($o, 'TRAFFIC') !== false || $o === 'LINK_CLICKS') { $r = $coba($klik); if ($r) return $r; }
  if (strpos($o, 'ENGAGEMENT') !== false || $o === 'MESSAGES' || $o === 'POST_ENGAGEMENT') {
    $r = $coba($chat); if ($r) return $r;
    $r = $coba($intr); if ($r) return $r;
  }
  $r = $coba($chat + $lead + $beli + $klik + $video + $intr);
  return $r ? $r : array('', 0);
}

function cg_ads_get($url) {
  $r = cg_http('GET', $url, array(), null, 40);
  if (!$r['data'] || isset($r['data']['error'])) {
    $p = isset($r['data']['error']['message']) ? $r['data']['error']['message'] : $r['mentah'];
    throw new Exception('Meta Ads menolak: ' . (is_string($p) ? $p : json_encode($p)));
  }
  return $r['data'];
}

function cg_ads_sync($pdo) {
  cg_pastikan($pdo);
  @set_time_limit(170);
  $tok = cg_ads_token($pdo);
  $akunList = cg_ads_akun($pdo);
  if ($tok === '' || !$akunList) throw new Exception('Token iklan & ID akun iklan belum diisi di Pengaturan.');
  $now = cg_now_ms();
  try {
    $up = $pdo->prepare('INSERT INTO cg_iklan (ad_id, periode, akun, nama, kampanye, adset, objective, status, thumb, permalink, ig_media,
        spend, impresi, reach, klik, ctr, cpm, frekuensi, video_view, hasil_label, hasil_n, tgl_mulai, tgl_selesai, actions, sync_at)
      VALUES (:id, :pe, :ak, :nm, :ka, :as, :ob, :st, :th, :pl, :ig, :sp, :im, :re, :kl, :ct, :cp, :fr, :vv, :hl, :hn, :tm, :ts, :ac, :sy)
      ON DUPLICATE KEY UPDATE akun=VALUES(akun), nama=VALUES(nama), kampanye=VALUES(kampanye), adset=VALUES(adset), objective=VALUES(objective),
        status=VALUES(status), thumb=VALUES(thumb), permalink=VALUES(permalink), ig_media=VALUES(ig_media), spend=VALUES(spend),
        impresi=VALUES(impresi), reach=VALUES(reach), klik=VALUES(klik), ctr=VALUES(ctr), cpm=VALUES(cpm), frekuensi=VALUES(frekuensi),
        video_view=VALUES(video_view), hasil_label=VALUES(hasil_label), hasil_n=VALUES(hasil_n), tgl_mulai=VALUES(tgl_mulai),
        tgl_selesai=VALUES(tgl_selesai), actions=VALUES(actions), sync_at=VALUES(sync_at)');
    $jumlah = 0;
    foreach ($akunList as $akun) {
      /* 1. Daftar iklan: status, tanggal mulai, materi (gambar & postingan Instagram-nya). */
      $meta = array();
      $url = CG_FB_GRAPH . '/act_' . $akun . '/ads?' . http_build_query(array('fields' => 'id,effective_status,created_time,campaign{objective},creative{thumbnail_url,image_url,instagram_permalink_url,effective_instagram_media_id}',
        'limit' => 200, 'access_token' => $tok));
      for ($h = 0; $url !== '' && $h < 10; $h++) {
        $d = cg_ads_get($url);
        foreach ((isset($d['data']) ? $d['data'] : array()) as $ad) $meta[(string)$ad['id']] = $ad;
        $url = !empty($d['paging']['next']) ? (string)$d['paging']['next'] : '';
      }
      /* 2. Insight per iklan untuk tiap periode. */
      foreach (array('7' => 'last_7d', '30' => 'last_30d', 'max' => 'maximum') as $pe => $preset) {
        $url = CG_FB_GRAPH . '/act_' . $akun . '/insights?' . http_build_query(array('level' => 'ad', 'date_preset' => $preset,
          'fields' => 'ad_id,ad_name,adset_name,campaign_name,objective,spend,impressions,reach,clicks,inline_link_clicks,ctr,cpm,frequency,actions,video_play_actions,date_start,date_stop',
          'limit' => 200, 'access_token' => $tok));
        for ($h = 0; $url !== '' && $h < 10; $h++) {
          $d = cg_ads_get($url);
          foreach ((isset($d['data']) ? $d['data'] : array()) as $x) {
            $id = (string)(isset($x['ad_id']) ? $x['ad_id'] : '');
            if ($id === '') continue;
            $m = isset($meta[$id]) ? $meta[$id] : array();
            $cr = isset($m['creative']) ? $m['creative'] : array();
            $obj = isset($x['objective']) ? (string)$x['objective'] : (isset($m['campaign']['objective']) ? (string)$m['campaign']['objective'] : '');
            $acts = isset($x['actions']) ? $x['actions'] : array();
            $hs = cg_ads_hasil($obj, $acts, isset($x['reach']) ? $x['reach'] : 0);
            $vv = 0;
            if (isset($x['video_play_actions'][0]['value'])) $vv = (int)$x['video_play_actions'][0]['value'];
            foreach ($acts as $ac) if (isset($ac['action_type']) && $ac['action_type'] === 'video_view') $vv = max($vv, (int)$ac['value']);
            $up->execute(array(':id' => $id, ':pe' => $pe, ':ak' => $akun,
              ':nm' => cg_potong(isset($x['ad_name']) ? $x['ad_name'] : '', 255), ':ka' => cg_potong(isset($x['campaign_name']) ? $x['campaign_name'] : '', 255),
              ':as' => cg_potong(isset($x['adset_name']) ? $x['adset_name'] : '', 255), ':ob' => cg_potong($obj, 60),
              ':st' => cg_potong(isset($m['effective_status']) ? $m['effective_status'] : '', 40),
              ':th' => cg_potong(isset($cr['thumbnail_url']) ? $cr['thumbnail_url'] : (isset($cr['image_url']) ? $cr['image_url'] : ''), 900),
              ':pl' => cg_potong(isset($cr['instagram_permalink_url']) ? $cr['instagram_permalink_url'] : '', 600),
              ':ig' => cg_potong(isset($cr['effective_instagram_media_id']) ? $cr['effective_instagram_media_id'] : '', 80),
              ':sp' => (float)(isset($x['spend']) ? $x['spend'] : 0), ':im' => (int)(isset($x['impressions']) ? $x['impressions'] : 0),
              ':re' => (int)(isset($x['reach']) ? $x['reach'] : 0),
              ':kl' => (int)(isset($x['inline_link_clicks']) ? $x['inline_link_clicks'] : (isset($x['clicks']) ? $x['clicks'] : 0)),
              ':ct' => (float)(isset($x['ctr']) ? $x['ctr'] : 0), ':cp' => (float)(isset($x['cpm']) ? $x['cpm'] : 0),
              ':fr' => (float)(isset($x['frequency']) ? $x['frequency'] : 0), ':vv' => $vv,
              ':hl' => cg_potong($hs[0], 60), ':hn' => (int)round($hs[1]),
              ':tm' => cg_tgl_sah(isset($x['date_start']) ? $x['date_start'] : ''), ':ts' => cg_tgl_sah(isset($x['date_stop']) ? $x['date_stop'] : ''),
              ':ac' => json_encode($acts, JSON_UNESCAPED_UNICODE), ':sy' => $now));
            if ($pe === 'max') $jumlah++;
          }
          $url = !empty($d['paging']['next']) ? (string)$d['paging']['next'] : '';
        }
      }
    }
    /* 3. Iklan per HARI (90 hari, tingkat akun) untuk halaman Pertumbuhan. */
    $uh = $pdo->prepare('INSERT INTO cg_iklan_harian (tgl, akun, spend, impresi, reach, klik, video_view, interaksi, chat, sync_at)
      VALUES (:tg, :ak, :sp, :im, :re, :kl, :vv, :in, :ch, :sy)
      ON DUPLICATE KEY UPDATE spend=VALUES(spend), impresi=VALUES(impresi), reach=VALUES(reach), klik=VALUES(klik),
        video_view=VALUES(video_view), interaksi=VALUES(interaksi), chat=VALUES(chat), sync_at=VALUES(sync_at)');
    foreach ($akunList as $akun) {
      $url = CG_FB_GRAPH . '/act_' . $akun . '/insights?' . http_build_query(array('level' => 'account', 'date_preset' => 'last_90d', 'time_increment' => 1,
        'fields' => 'spend,impressions,reach,inline_link_clicks,actions,date_start', 'limit' => 100, 'access_token' => $tok));
      for ($h = 0; $url !== '' && $h < 5; $h++) {
        $d = cg_ads_get($url);
        foreach ((isset($d['data']) ? $d['data'] : array()) as $x) {
          $tg = cg_tgl_sah(isset($x['date_start']) ? $x['date_start'] : ''); if ($tg === null) continue;
          $ac = array();
          foreach ((isset($x['actions']) ? $x['actions'] : array()) as $a) if (isset($a['action_type'], $a['value'])) $ac[$a['action_type']] = (int)$a['value'];
          $uh->execute(array(':tg' => $tg, ':ak' => $akun, ':sp' => (float)(isset($x['spend']) ? $x['spend'] : 0),
            ':im' => (int)(isset($x['impressions']) ? $x['impressions'] : 0), ':re' => (int)(isset($x['reach']) ? $x['reach'] : 0),
            ':kl' => (int)(isset($x['inline_link_clicks']) ? $x['inline_link_clicks'] : 0),
            ':vv' => isset($ac['video_view']) ? $ac['video_view'] : 0, ':in' => isset($ac['post_engagement']) ? $ac['post_engagement'] : 0,
            ':ch' => isset($ac['onsite_conversion.messaging_conversation_started_7d']) ? $ac['onsite_conversion.messaging_conversation_started_7d'] : 0,
            ':sy' => $now));
        }
        $url = !empty($d['paging']['next']) ? (string)$d['paging']['next'] : '';
      }
    }
    cg_set_tulis($pdo, 'ads_sync_at', (string)$now);
    cg_set_tulis($pdo, 'ads_galat', '');
    return array('jumlah' => $jumlah);
  } catch (Throwable $e) {
    try { cg_set_tulis($pdo, 'ads_galat', cg_potong($e->getMessage(), 400)); } catch (Throwable $e2) {}
    throw $e;
  }
}

/* ==================== KELOLA IKLAN (29 Okt 2026) ====================
   Permintaan user: dari saran AI "langsung klik, lanjutkan / setting Ads".
   Yang bisa diubah dari sini SENGAJA sempit: status (jeda / lanjutkan) di
   tingkat iklan, set iklan, kampanye — dan budget yang SUDAH ADA di set
   iklan atau kampanye. Membuat iklan baru tetap di Ads Manager.

   - Token wajib punya ads_management; tanpa itu Meta menolak dengan kode 200
     dan pesannya diterjemahkan supaya yang membacanya tahu harus membuat
     token baru, bukan mencari bug.
   - Objek yang diubah DIPERIKSA milik akun iklan yang disetel di Pengaturan
     (account_id dibaca dari Meta, bukan dari kiriman layar). Tanpa itu satu
     token yang punya akses ke beberapa akun bisa dipakai mengubah iklan
     bisnis lain lewat id yang diketik di console.
   - Tiap perubahan DICATAT di cg_ads_log (siapa, kapan, sebelum, sesudah).
     Perubahan uang tanpa jejak tidak bisa diaudit. Log tidak pernah dihapus. */
function cg_ads_log_pastikan($pdo) {
  $pdo->exec("CREATE TABLE IF NOT EXISTS cg_ads_log (
    id VARCHAR(40) NOT NULL PRIMARY KEY,
    at BIGINT NOT NULL,
    oleh VARCHAR(120) NOT NULL DEFAULT '',
    tingkat VARCHAR(12) NOT NULL DEFAULT '',
    obj_id VARCHAR(40) NOT NULL DEFAULT '',
    nama VARCHAR(255) NOT NULL DEFAULT '',
    aksi VARCHAR(40) NOT NULL DEFAULT '',
    sebelum VARCHAR(120) NOT NULL DEFAULT '',
    sesudah VARCHAR(120) NOT NULL DEFAULT '',
    KEY idx_obj (obj_id), KEY idx_at (at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}
/* Satuan budget Meta = satuan TERKECIL mata uang. Mata uang tanpa sen
   (termasuk IDR) dikali 1, sisanya 100. Salah di sini = budget seratus kali
   lipat, jadi daftarnya ditulis eksplisit. */
function cg_ads_faktor($cur) {
  $tanpaSen = array('CLP','COP','CRC','HUF','ISK','IDR','JPY','KRW','PYG','TWD','VND');
  return in_array(strtoupper((string)$cur), $tanpaSen, true) ? 1 : 100;
}
function cg_ads_galat_teks($pesan) {
  $p = (string)$pesan;
  if (preg_match('/ads_management|\(#200\)|permission/i', $p))
    return 'Token iklan belum punya izin ads_management. Buat token baru di Business Manager → Pengguna Sistem (centang ads_management + ads_read, akun iklan "Kelola kampanye"), lalu tempel di Pengaturan → Iklan Meta. Pesan Meta: ' . $p;
  return 'Meta Ads menolak: ' . $p;
}
function cg_ads_obj($tok, $id, $fields) {
  if (!preg_match('/^(act_)?\d{5,25}$/', (string)$id)) throw new Exception('ID iklan tidak sah.');
  $r = cg_http('GET', CG_FB_GRAPH . '/' . $id . '?' . http_build_query(array('fields' => $fields, 'access_token' => $tok)), array(), null, 30);
  if (!$r['data'] || isset($r['data']['error'])) throw new Exception(cg_ads_galat_teks(isset($r['data']['error']['message']) ? $r['data']['error']['message'] : $r['mentah']));
  return $r['data'];
}
function cg_ads_cek_akun($pdo, $akunId) {
  $a = preg_replace('/^act_/i', '', (string)$akunId);
  if (!in_array($a, cg_ads_akun($pdo), true)) throw new Exception('Iklan ini bukan milik akun iklan yang disetel di Pengaturan.');
  return $a;
}
function cg_ads_info($pdo, $d) {
  $tok = cg_ads_token($pdo);
  if ($tok === '') throw new Exception('Token iklan belum diisi di Pengaturan.');
  $id = isset($d['adId']) ? (string)$d['adId'] : '';
  if (!ctype_digit($id)) throw new Exception('ID iklan tidak sah.');
  $x = cg_ads_obj($tok, $id, 'id,name,status,effective_status,account_id,adset{id,name,status,effective_status,daily_budget,lifetime_budget,end_time},campaign{id,name,status,effective_status,daily_budget,lifetime_budget}');
  $akun = cg_ads_cek_akun($pdo, isset($x['account_id']) ? $x['account_id'] : '');
  $acc = cg_ads_obj($tok, 'act_' . $akun, 'currency');
  $cur = isset($acc['currency']) ? (string)$acc['currency'] : 'IDR';
  $f = cg_ads_faktor($cur);
  $bentuk = function ($o, $tingkat) use ($f) {
    if (!is_array($o)) return null;
    $db = isset($o['daily_budget']) ? (int)$o['daily_budget'] : 0;
    $lb = isset($o['lifetime_budget']) ? (int)$o['lifetime_budget'] : 0;
    return array('tingkat' => $tingkat, 'id' => (string)$o['id'], 'nama' => isset($o['name']) ? (string)$o['name'] : '',
      'status' => isset($o['status']) ? (string)$o['status'] : '', 'efektif' => isset($o['effective_status']) ? (string)$o['effective_status'] : '',
      'budgetJenis' => $db > 0 ? 'harian' : ($lb > 0 ? 'total' : ''), 'budget' => $db > 0 ? $db / $f : ($lb > 0 ? $lb / $f : 0),
      'selesai' => isset($o['end_time']) ? (string)$o['end_time'] : '');
  };
  cg_ads_log_pastikan($pdo);
  $ids = array((string)$x['id']);
  if (isset($x['adset']['id'])) $ids[] = (string)$x['adset']['id'];
  if (isset($x['campaign']['id'])) $ids[] = (string)$x['campaign']['id'];
  $ph = implode(',', array_fill(0, count($ids), '?'));
  $q = $pdo->prepare("SELECT at, oleh, tingkat, nama, aksi, sebelum, sesudah FROM cg_ads_log WHERE obj_id IN ($ph) ORDER BY at DESC LIMIT 20");
  $q->execute($ids);
  return array('mataUang' => $cur, 'iklan' => $bentuk($x, 'iklan'),
    'adset' => $bentuk(isset($x['adset']) ? $x['adset'] : null, 'adset'),
    'kampanye' => $bentuk(isset($x['campaign']) ? $x['campaign'] : null, 'kampanye'),
    'log' => $q->fetchAll());
}
/* YANG SEDANG BERJALAN (29 Okt 2026, permintaan user: "lihat yang lagi
   running apa dan dana saat ini berapa"). Dibaca LANGSUNG dari Meta, bukan
   dari tabel sinkron (yang bisa basi 6 jam): kampanye berstatus aktif berikut
   budget-nya, belanja hari ini & bulan ini per kampanye, dan angka akun.
   "Saldo" prabayar tidak diambil — Meta tidak memulangkannya lewat field
   umum, dan angka yang ditebak di kolom uang lebih buruk daripada kolom yang
   tidak ada. Yang ada: total belanja akun, batas belanja (spend cap) & sisa
   menuju batas itu, dan tagihan berjalan (balance). */
function cg_ads_jalan($pdo) {
  $tok = cg_ads_token($pdo);
  $akunList = cg_ads_akun($pdo);
  if ($tok === '' || !$akunList) throw new Exception('Token iklan & ID akun iklan belum diisi di Pengaturan.');
  $out = array('akun' => array(), 'kampanye' => array());
  foreach ($akunList as $akun) {
    $a = cg_ads_obj($tok, 'act_' . $akun, 'name,currency,account_status,amount_spent,balance,spend_cap');
    $f = cg_ads_faktor(isset($a['currency']) ? $a['currency'] : 'IDR');
    $cap = isset($a['spend_cap']) ? (float)$a['spend_cap'] / $f : 0;
    $spent = isset($a['amount_spent']) ? (float)$a['amount_spent'] / $f : 0;
    $out['akun'][] = array('id' => $akun, 'nama' => isset($a['name']) ? (string)$a['name'] : '', 'mataUang' => isset($a['currency']) ? (string)$a['currency'] : '',
      'status' => isset($a['account_status']) ? (int)$a['account_status'] : 0, 'totalBelanja' => $spent,
      'tagihan' => isset($a['balance']) ? (float)$a['balance'] / $f : 0, 'batas' => $cap, 'sisaBatas' => $cap > 0 ? max(0, $cap - $spent) : null);
    /* Belanja per kampanye: hari ini & bulan ini, satu panggilan masing-masing. */
    /* maximum = sejak kampanye mulai — itu "biaya yang sudah berjalan". */
    $belanja = array('today' => array(), 'this_month' => array(), 'maximum' => array());
    foreach (array_keys($belanja) as $pr) {
      $url = CG_FB_GRAPH . '/act_' . $akun . '/insights?' . http_build_query(array('level' => 'campaign', 'date_preset' => $pr,
        'fields' => 'campaign_id,spend', 'limit' => 200, 'access_token' => $tok));
      for ($h = 0; $url !== '' && $h < 5; $h++) {
        $d = cg_ads_get($url);
        foreach ((isset($d['data']) ? $d['data'] : array()) as $x) if (isset($x['campaign_id'])) $belanja[$pr][(string)$x['campaign_id']] = (float)(isset($x['spend']) ? $x['spend'] : 0);
        $url = !empty($d['paging']['next']) ? (string)$d['paging']['next'] : '';
      }
    }
    $url = CG_FB_GRAPH . '/act_' . $akun . '/campaigns?' . http_build_query(array(
      'fields' => 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time,adsets.limit(50){id,name,effective_status,daily_budget,lifetime_budget,start_time,end_time},ads.limit(50){id,effective_status}',
      'effective_status' => json_encode(array('ACTIVE', 'PAUSED')), 'limit' => 100, 'access_token' => $tok));
    for ($h = 0; $url !== '' && $h < 5; $h++) {
      $d = cg_ads_get($url);
      foreach ((isset($d['data']) ? $d['data'] : array()) as $c) {
        $id = (string)$c['id'];
        /* Kampanye yang DIJEDA ikut dibaca untuk daftar "iklan terakhir" (permintaan
           user 30 Okt 2026, buat direview). Set iklannya berstatus CAMPAIGN_PAUSED,
           jadi untuk kampanye yang tidak aktif budget & tanggal dihitung dari
           SELURUH set — kalau tetap cuma yang ACTIVE, keduanya selalu kosong. */
        $stKamp = isset($c['effective_status']) ? (string)$c['effective_status'] : '';
        $setDihitung = function($s) use ($stKamp) { return $stKamp !== 'ACTIVE' || (isset($s['effective_status']) ? $s['effective_status'] : '') === 'ACTIVE'; };
        $db = isset($c['daily_budget']) ? (int)$c['daily_budget'] / $f : 0;
        $lb = isset($c['lifetime_budget']) ? (int)$c['lifetime_budget'] / $f : 0;
        $sumber = 'kampanye';
        /* Budget di tingkat set iklan (bukan CBO): dijumlahkan dari set iklan
           yang AKTIF saja — set yang dijeda tidak menghabiskan apa pun. */
        if ($db == 0 && $lb == 0) {
          $sumber = 'set iklan';
          foreach ((isset($c['adsets']['data']) ? $c['adsets']['data'] : array()) as $s) {
            if (!$setDihitung($s)) continue;
            $db += isset($s['daily_budget']) ? (int)$s['daily_budget'] / $f : 0;
            $lb += isset($s['lifetime_budget']) ? (int)$s['lifetime_budget'] / $f : 0;
          }
        }
        /* Tanggal: iklan "Promosikan postingan" menaruh mulai & selesai di SET
           IKLAN, bukan di kampanye. Mulai = yang paling awal; selesai = yang
           paling akhir, tapi KOSONG kalau ada satu saja set aktif tanpa tanggal
           selesai — kampanyenya memang jalan terus sampai dijeda. */
        $mulai = isset($c['start_time']) ? substr((string)$c['start_time'], 0, 10) : '';
        $selesai = isset($c['stop_time']) ? substr((string)$c['stop_time'], 0, 10) : '';
        $setSelesai = ''; $adaTanpaAkhir = false;
        foreach ((isset($c['adsets']['data']) ? $c['adsets']['data'] : array()) as $s) {
          $sm = isset($s['start_time']) ? substr((string)$s['start_time'], 0, 10) : '';
          if ($sm !== '' && ($mulai === '' || $sm < $mulai)) $mulai = $sm;
          if (!$setDihitung($s)) continue;
          $se = isset($s['end_time']) ? substr((string)$s['end_time'], 0, 10) : '';
          if ($se === '') $adaTanpaAkhir = true; elseif ($se > $setSelesai) $setSelesai = $se;
        }
        if ($selesai === '' && !$adaTanpaAkhir) $selesai = $setSelesai;
        $iklanAktif = 0; $adPertama = '';
        foreach ((isset($c['ads']['data']) ? $c['ads']['data'] : array()) as $ad) {
          if ($adPertama === '') $adPertama = (string)$ad['id'];
          if ((isset($ad['effective_status']) ? $ad['effective_status'] : '') === 'ACTIVE') { $iklanAktif++; if ($iklanAktif === 1) $adPertama = (string)$ad['id']; }
        }
        $out['kampanye'][] = array('id' => $id, 'akun' => $akun, 'nama' => isset($c['name']) ? (string)$c['name'] : '',
          'objective' => isset($c['objective']) ? (string)$c['objective'] : '', 'budgetHarian' => $db, 'budgetTotal' => $lb, 'budgetDi' => $sumber,
          'mulai' => $mulai, 'selesai' => $selesai, 'status' => $stKamp,
          'sejakMulai' => isset($belanja['maximum'][$id]) ? $belanja['maximum'][$id] : 0,
          'hariIni' => isset($belanja['today'][$id]) ? $belanja['today'][$id] : 0, 'bulanIni' => isset($belanja['this_month'][$id]) ? $belanja['this_month'][$id] : 0,
          'iklanAktif' => $iklanAktif, 'adId' => $adPertama);
      }
      $url = !empty($d['paging']['next']) ? (string)$d['paging']['next'] : '';
    }
    /* Belanja bulan ini SELURUH akun, termasuk kampanye yang sudah berhenti. */
    $tot = cg_ads_get(CG_FB_GRAPH . '/act_' . $akun . '/insights?' . http_build_query(array('date_preset' => 'this_month', 'fields' => 'spend', 'access_token' => $tok)));
    $out['akun'][count($out['akun']) - 1]['bulanIni'] = isset($tot['data'][0]['spend']) ? (float)$tot['data'][0]['spend'] : 0;
    $tot = cg_ads_get(CG_FB_GRAPH . '/act_' . $akun . '/insights?' . http_build_query(array('date_preset' => 'today', 'fields' => 'spend', 'access_token' => $tok)));
    $out['akun'][count($out['akun']) - 1]['hariIni'] = isset($tot['data'][0]['spend']) ? (float)$tot['data'][0]['spend'] : 0;
  }
  $out['at'] = cg_now_ms();
  return $out;
}
function cg_ads_ubah($pdo, $d, $nama) {
  $tok = cg_ads_token($pdo);
  if ($tok === '') throw new Exception('Token iklan belum diisi di Pengaturan.');
  $tingkat = isset($d['tingkat']) ? (string)$d['tingkat'] : '';
  if (!in_array($tingkat, array('iklan', 'adset', 'kampanye'), true)) throw new Exception('Tingkat tidak dikenal.');
  $id = isset($d['id']) ? (string)$d['id'] : '';
  if (!ctype_digit($id)) throw new Exception('ID iklan tidak sah.');
  /* Keadaan SEKARANG dibaca dari Meta, bukan dipercaya dari layar: yang
     dicatat sebagai "sebelum" harus angka yang benar-benar diganti. */
  $o = cg_ads_obj($tok, $id, $tingkat === 'iklan' ? 'id,name,status,account_id' : 'id,name,status,account_id,daily_budget,lifetime_budget');
  $akun = cg_ads_cek_akun($pdo, isset($o['account_id']) ? $o['account_id'] : '');
  $kirim = array(); $aksi = ''; $sebelum = ''; $sesudah = '';
  if (isset($d['status'])) {
    $st = (string)$d['status'];
    if (!in_array($st, array('ACTIVE', 'PAUSED'), true)) throw new Exception('Status hanya boleh ACTIVE atau PAUSED.');
    $kirim['status'] = $st; $aksi = $st === 'PAUSED' ? 'jeda' : 'lanjutkan';
    $sebelum = (string)(isset($o['status']) ? $o['status'] : ''); $sesudah = $st;
  } elseif (isset($d['budget'])) {
    if ($tingkat === 'iklan') throw new Exception('Budget diatur di set iklan atau kampanye, bukan di iklan.');
    $acc = cg_ads_obj($tok, 'act_' . $akun, 'currency');
    $f = cg_ads_faktor(isset($acc['currency']) ? $acc['currency'] : 'IDR');
    $db = isset($o['daily_budget']) ? (int)$o['daily_budget'] : 0;
    $lb = isset($o['lifetime_budget']) ? (int)$o['lifetime_budget'] : 0;
    $kolom = $db > 0 ? 'daily_budget' : ($lb > 0 ? 'lifetime_budget' : '');
    if ($kolom === '') throw new Exception('Budget-nya tidak diatur di tingkat ini — ubah di tingkat ' . ($tingkat === 'adset' ? 'kampanye' : 'set iklan') . '.');
    $lama = ($db > 0 ? $db : $lb) / $f;
    $baru = (float)$d['budget'];
    if (!is_finite($baru) || $baru <= 0 || floor($baru) != $baru) throw new Exception('Budget harus angka bulat lebih dari nol.');
    /* Salah ketik satu nol = budget sepuluh kali lipat dan uang yang langsung
       terpakai. Lompatan sebesar itu dikerjakan di Ads Manager, bukan dari sini. */
    if ($lama > 0 && $baru > $lama * 5) throw new Exception('Budget baru lebih dari 5× budget sekarang (' . number_format($lama, 0, ',', '.') . '). Kalau memang begitu, ubah langsung di Ads Manager.');
    $kirim[$kolom] = (int)round($baru * $f);
    $aksi = $kolom === 'daily_budget' ? 'budget harian' : 'budget total';
    $sebelum = (string)$lama; $sesudah = (string)$baru;
  } else throw new Exception('Tidak ada yang diubah.');
  $kirim['access_token'] = $tok;
  $r = cg_http('POST', CG_FB_GRAPH . '/' . $id, array('Content-Type: application/x-www-form-urlencoded'), http_build_query($kirim), 30);
  if (!$r['data'] || isset($r['data']['error']) || empty($r['data']['success']))
    throw new Exception(cg_ads_galat_teks(isset($r['data']['error']['message']) ? $r['data']['error']['message'] : $r['mentah']));
  cg_ads_log_pastikan($pdo);
  $q = $pdo->prepare('INSERT INTO cg_ads_log (id, at, oleh, tingkat, obj_id, nama, aksi, sebelum, sesudah) VALUES (:id, :at, :by, :ti, :ob, :nm, :ak, :sb, :sd)');
  $q->execute(array(':id' => cg_uid('adl'), ':at' => cg_now_ms(), ':by' => cg_potong($nama, 120), ':ti' => $tingkat, ':ob' => $id,
    ':nm' => cg_potong(isset($o['name']) ? $o['name'] : '', 255), ':ak' => $aksi, ':sb' => cg_potong($sebelum, 120), ':sd' => cg_potong($sesudah, 120)));
  /* Status iklan di tabel sinkron ikut disegarkan supaya daftar tidak
     menyebut "Aktif" untuk iklan yang barusan dijeda sampai sinkron berikutnya. */
  if ($tingkat === 'iklan' && isset($kirim['status'])) {
    $u = $pdo->prepare('UPDATE cg_iklan SET status = :s WHERE ad_id = :a');
    $u->execute(array(':s' => $kirim['status'], ':a' => $id));
  }
  return array('ok' => true, 'aksi' => $aksi, 'sebelum' => $sebelum, 'sesudah' => $sesudah);
}

function cg_ig_kode($url) {
  return preg_match('#instagram.com/(?:[^/]+/)?(?:p|reel|reels|tv)/([A-Za-z0-9_-]+)#', (string)$url, $m) ? $m[1] : '';
}
/* SARAN AI untuk iklan (14 Okt 2026, permintaan user: "minta AI untuk
   generate mana iklan yang oke untuk kita teruskan"). Hasilnya USULAN:
   tidak tersimpan dan tidak mengubah apa pun di Meta. ad_id yang tidak ada
   di data DIBUANG — saran untuk iklan karangan tidak bisa ditindaklanjuti. */
function cg_ads_ai($pdo, $d) {
  $data = cg_ads_baca($pdo, $d);
  if (!$data['baris']) throw new Exception('Belum ada data iklan pada periode ini. Tekan Sinkronkan dulu.');
  $ringkas = array(); $ada = array();
  foreach (array_slice($data['baris'], 0, 60) as $r) {
    $n = (int)$r['hasil_n']; $sp = (float)$r['spend'];
    $ringkas[] = array('ad_id' => $r['ad_id'], 'nama' => $r['nama'], 'kampanye' => $r['kampanye'], 'tujuan' => $r['objective'],
      'status' => $r['status'], 'biaya' => round($sp), 'impresi' => (int)$r['impresi'], 'jangkauan' => (int)$r['reach'],
      'ctr' => (float)$r['ctr'], 'frekuensi' => (float)$r['frekuensi'], 'hasil' => $r['hasil_label'], 'jumlah_hasil' => $n,
      'biaya_per_hasil' => $n > 0 ? round($r['hasil_label'] === 'Jangkauan' ? $sp / $n * 1000 : $sp / $n) : null,
      'mulai' => $r['tgl_mulai'], 'selesai' => $r['tgl_selesai']);
    $ada[(string)$r['ad_id']] = (string)$r['nama'];
  }
  $profil = cg_set_baca($pdo, 'profil', CG_PROFIL_BAWAAN);
  $periode = $data['periode'] === 'max' ? 'sepanjang waktu' : $data['periode'] . ' hari terakhir';
  $system = 'Kamu media buyer iklan Meta (Facebook & Instagram) untuk bisnis F&B di Indonesia. Jawab dalam Bahasa Indonesia. '
    . 'Nilai HANYA dari data yang diberikan; jangan mengarang angka. Bandingkan biaya per hasil hanya antar iklan dengan jenis hasil yang sama. '
    . 'Iklan dengan biaya kecil (di bawah Rp50.000) belum cukup data — sebutkan, jangan dihakimi. Mata uang Rupiah. Balas HANYA satu objek JSON.';
  $prompt = "Profil brand: $profil
Periode: $periode
Data iklan (biaya_per_hasil untuk Jangkauan = per 1.000 orang):
"
    . json_encode($ringkas, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
    . "

Bentuk JSON:
"
    . '{"ringkasan":"2-3 kalimat kondisi iklan secara umum",'
    . '"lanjutkan":[{"ad_id":"","nama":"","alasan":"angka yang mendukung","saran":"mis. naikkan budget bertahap 20%"}],'
    . '"perbaiki":[{"ad_id":"","nama":"","alasan":"","saran":"apa yang diubah: materi, hook, target, tujuan"}],'
    . '"hentikan":[{"ad_id":"","nama":"","alasan":"","saran":""}],'
    . '"saranUmum":["..."]}'
    . "
Maksimal 5 iklan per kelompok. ad_id WAJIB persis dari data.";
  $r = cg_ai_tanya($pdo, $system, $prompt, 3000);
  $h = $r['hasil'];
  $out = array('ringkasan' => isset($h['ringkasan']) ? cg_potong($h['ringkasan'], 800) : '', 'model' => $r['model']);
  foreach (array('lanjutkan', 'perbaiki', 'hentikan') as $k) {
    $out[$k] = array();
    foreach ((isset($h[$k]) && is_array($h[$k]) ? $h[$k] : array()) as $x) {
      if (!is_array($x) || !isset($x['ad_id']) || !isset($ada[(string)$x['ad_id']])) continue;
      $out[$k][] = array('ad_id' => (string)$x['ad_id'], 'nama' => $ada[(string)$x['ad_id']],
        'alasan' => cg_potong(isset($x['alasan']) ? $x['alasan'] : '', 400), 'saran' => cg_potong(isset($x['saran']) ? $x['saran'] : '', 400));
      if (count($out[$k]) >= 5) break;
    }
  }
  $out['saranUmum'] = array();
  foreach ((isset($h['saranUmum']) && is_array($h['saranUmum']) ? $h['saranUmum'] : array()) as $x) if (is_string($x)) $out['saranUmum'][] = cg_potong($x, 300);
  return $out;
}

/* Daftar iklan satu periode, HANYA dari sinkron terakhir periode itu. */
function cg_ads_baca($pdo, $d) {
  cg_pastikan($pdo);
  $pe = isset($d['periode']) && in_array($d['periode'], array('7', '30', 'max'), true) ? $d['periode'] : '30';
  $q = $pdo->prepare('SELECT MAX(sync_at) FROM cg_iklan WHERE periode = :p');
  $q->execute(array(':p' => $pe));
  $terakhir = (int)$q->fetchColumn();
  $q = $pdo->prepare('SELECT ad_id, akun, nama, kampanye, adset, objective, status, thumb, permalink, ig_media, spend, impresi, reach, klik, ctr, cpm,
      frekuensi, video_view, hasil_label, hasil_n, tgl_mulai, tgl_selesai FROM cg_iklan WHERE periode = :p AND sync_at = :s ORDER BY spend DESC LIMIT 1000');
  $q->execute(array(':p' => $pe, ':s' => $terakhir));
  $baris = $q->fetchAll();
  /* Postingan Instagram yang diiklankan: keterangan & angka ORGANIK-nya
     dibaca dari cg_post (dicocokkan lewat ID media, lalu kode tautan —
     tautan iklan /p/KODE/, tautan reel organik /reel/KODE/). */
  $pid = array(); $pkd = array();
  foreach ($pdo->query("SELECT post_id, url, judul, views, likes, comments, tayang_at FROM cg_post WHERE platform='instagram'")->fetchAll() as $p) {
    $isi = array('judul' => cg_potong((string)$p['judul'], 300), 'url' => (string)$p['url'], 'views' => (int)$p['views'],
      'likes' => (int)$p['likes'], 'comments' => (int)$p['comments'],
      'tanggal' => (int)$p['tayang_at'] > 0 ? gmdate('Y-m-d', (int)floor((int)$p['tayang_at'] / 1000) + 7 * 3600) : '');
    $pid[(string)$p['post_id']] = $isi;
    $kd = cg_ig_kode((string)$p['url']); if ($kd !== '') $pkd[$kd] = $isi;
  }
  foreach ($baris as &$r) {
    $kd = cg_ig_kode((string)$r['permalink']);
    $r['post'] = ((string)$r['ig_media'] !== '' && isset($pid[(string)$r['ig_media']])) ? $pid[(string)$r['ig_media']] : ($kd !== '' && isset($pkd[$kd]) ? $pkd[$kd] : null);
    $r['kode'] = $kd;
  }
  unset($r);
  return array('periode' => $pe, 'baris' => $baris, 'syncAt' => $terakhir);
}

/* ==================== SETELAN (admin modul) ==================== */
function cg_setting_simpan($pdo, $d) {
  cg_pastikan($pdo);
  /* Kotak rahasia yang dikosongkan berarti "jangan diubah", bukan "hapus".
     Layar tidak pernah menampilkan isinya, jadi kotak kosong adalah keadaan
     normal tiap kali halamannya dibuka. Menghapus memakai kata HAPUS. */
  foreach (array('aiKeyMeta' => 'ai_key_meta', 'tiktokKey' => 'tiktok_key', 'tiktokSecret' => 'tiktok_secret', 'igId' => 'ig_id', 'igSecret' => 'ig_secret', 'adsToken' => 'ads_token') as $f => $k) {
    if (!isset($d[$f])) continue;
    $v = trim((string)$d[$f]);
    if ($v === '') continue;
    cg_set_tulis($pdo, $k, $v === 'HAPUS' ? '' : $v);
  }
  $daftar = cg_ai_daftar();
  /* Model hanya dari daftar penyedia — lihat cg_ai_daftar(). */
  if (isset($d['aiModelMeta']) && in_array((string)$d['aiModelMeta'], $daftar['meta']['model'], true)) cg_set_tulis($pdo, $daftar['meta']['kunciModel'], (string)$d['aiModelMeta']);
  /* Daftar kosong DITOLAK, bukan disimpan: formulir insight tanpa satu pun
     kategori tidak bisa diisi siapa pun. */
  if (isset($d['kategori'])) {
    $k = cg_kategori_rapikan($d['kategori']);
    if (!$k) throw new Exception('Kategori pola minimal satu.');
    cg_set_tulis($pdo, 'kategori', json_encode($k, JSON_UNESCAPED_UNICODE));
  }
  if (isset($d['profil'])) cg_set_tulis($pdo, 'profil', cg_potong($d['profil'], 1500));
  /* ID akun iklan bukan rahasia; yang bukan angka ditolak supaya salah tempel
     (mis. token ke kotak ini) tidak tersimpan diam-diam. */
  if (isset($d['adsAkun'])) {
    $akun = array();
    foreach (preg_split('/[\s,;]+/', (string)$d['adsAkun']) as $a) {
      $a = preg_replace('/^act_/i', '', trim($a));
      if ($a === '') continue;
      if (!ctype_digit($a) || strlen($a) > 25) throw new Exception('ID akun iklan harus angka (contoh: act_1234567890 atau 1234567890).');
      $akun[] = $a;
    }
    cg_set_tulis($pdo, 'ads_akun', implode(',', array_unique($akun)));
  }
  gr_setting_simpan($pdo, $d);
  return array('ok' => true);
}

/* ==================== PINTU API ==================== */
function cg_aksi($action, $body) {
  $u = sesi_user($body);
  if (!$u) sesi_tolak_tak_dikenal();
  /* Satu-satunya aksi yang TIDAK menuntut kunci Campaign: dibaca modul
     Service Excellent untuk membantu memverifikasi klaim review. Ia cuma
     membaca, dan isinya disaring sempit di gr_cocok(). */
  if ($action === 'campaignGoogleCocok') {
    if (!sesi_punya_modul($u, 'service_excellent') && !sesi_punya_modul($u, 'campaign')) sesi_tolak_tanpa_modul('Service Excellent');
    return gr_cocok(db(), isset($body['data']) && is_array($body['data']) ? $body['data'] : array());
  }
  if (!sesi_punya_modul($u, 'campaign')) sesi_tolak_tanpa_modul('Campaign');
  $nama = (string)(isset($u['name']) ? $u['name'] : '');
  $pdo = db();
  $d = isset($body['data']) && is_array($body['data']) ? $body['data'] : array();
  switch ($action) {
    case 'campaignGet':          return cg_baca($pdo, $u);
    case 'campaignInsightSimpan': return cg_insight_simpan($pdo, $d, $nama);
    case 'campaignInsightArsip': return cg_insight_arsip($pdo, isset($d['id']) ? $d['id'] : '', !empty($d['arsip']), $nama);
    case 'campaignJadwalSimpan': return cg_jadwal_simpan($pdo, $d, $nama);
    case 'campaignRiset':        return cg_riset_jalankan($pdo, $d, $nama);
    case 'campaignInsightAI':    return cg_insight_ai($pdo, $d);
    case 'campaignBankGenerate': return cg_bank_generate($pdo, $d, $nama);
    case 'campaignBankSimpan':   return cg_bank_simpan($pdo, $d, $nama);
    case 'campaignBankHapus':    return cg_bank_hapus($pdo, isset($d['id']) ? $d['id'] : '');
    case 'campaignBankArsip':    return cg_bank_arsip($pdo, isset($d['id']) ? $d['id'] : '', !empty($d['arsip']), $nama);
    case 'campaignTiktokMulai':  return cg_tiktok_mulai($pdo, $nama);
    case 'campaignTiktokSync':   return cg_tiktok_sync($pdo);
    case 'campaignTop':          return cg_top($pdo, $d);
    case 'campaignTiktokPutus':  return cg_tiktok_putus($pdo, $nama);
    case 'campaignIgMulai':      return cg_ig_mulai($pdo, $nama);
    case 'campaignIgSync':       return cg_ig_sync($pdo);
    case 'campaignIgPutus':      return cg_ig_putus($pdo, $nama);
    case 'campaignAdsSync':      return cg_ads_sync($pdo);
    case 'campaignAds':          return cg_ads_baca($pdo, $d);
    case 'campaignAdsAI':        return cg_ads_ai($pdo, $d);
    case 'campaignAdsInfo':      return cg_ads_info($pdo, $d);
    case 'campaignAdsJalan':     return cg_ads_jalan($pdo);
    /* Mengubah iklan = mengubah uang yang keluar: admin modul saja. */
    case 'campaignAdsUbah':
      if (!sesi_admin_modul($u, 'campaign')) sesi_tolak_tak_berhak('Mengubah iklan hanya untuk admin modul Campaign.');
      return cg_ads_ubah($pdo, $d, $nama);
    case 'campaignTumbuh':       return cg_tumbuh($pdo, $d);
    /* Google Review — lihat lib_greview.php. */
    case 'campaignGoogle':       return gr_baca($pdo);
    case 'campaignGoogleSync':   return gr_sync($pdo);
    case 'campaignGoogleMulai':  return gr_mulai($pdo, $nama);
    case 'campaignGoogleLokasi': return array('jumlah' => gr_lokasi_tarik($pdo));
    case 'campaignGoogleBalas':  return gr_balas($pdo, $d, $nama);
    case 'campaignGoogleBalasHapus': return gr_balas_hapus($pdo, $d);
    case 'campaignGoogleTangani': return gr_tangani($pdo, $d, $nama);
    case 'campaignGoogleAI':     return gr_ai($pdo, $d, $nama);
    case 'campaignGoogleDraf':   return gr_ai_draf($pdo, $d);
    case 'campaignGoogleCari':
      if (!sesi_admin_modul($u, 'campaign')) sesi_tolak_tak_berhak('Mencari tempat hanya untuk admin modul Campaign.');
      return gr_cari($pdo, $d);
    case 'campaignGooglePutus':
      if (!sesi_admin_modul($u, 'campaign')) sesi_tolak_tak_berhak('Memutus akun Google hanya untuk admin modul Campaign.');
      return gr_putus($pdo, $nama);
    case 'campaignSetting':
      if (!sesi_admin_modul($u, 'campaign')) sesi_tolak_tak_berhak('Pengaturan Campaign hanya untuk admin modul Campaign.');
      return cg_setting_simpan($pdo, $d);
  }
  throw new Exception('Aksi tidak dikenal: ' . $action);
}
