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
  curl_setopt_array($ch, $opt);
  $jawab = curl_exec($ch);
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
    ),
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

  $semua = array(); $url = array();
  /* Angka Input Performa per TAUTAN — dipakai melengkapi baris TikTok yang
     postingannya juga tercatat di Konten Planning. Hanya platform TikTok yang
     dicocokkan: tautan TikTok yang ditempel di catatan Instagram bukan angka
     TikTok. */
  $kp = cg_konten_perf($pdo); $kpUrl = array();
  foreach ($kp as $k) if ($k['url'] !== '' && cg_plat_norm($k['platform']) === 'TikTok') $kpUrl[$k['url']] = $k;
  foreach ($pdo->query("SELECT platform, judul, url, tayang_at, views, likes, comments, shares FROM cg_post WHERE hilang=0")->fetchAll() as $p) {
    $man = ((string)$p['url'] !== '' && isset($kpUrl[(string)$p['url']])) ? $kpUrl[(string)$p['url']] : null;
    $semua[] = array(
      'rinci' => cg_rinci(array('views' => $p['views'], 'likes' => $p['likes'], 'comments' => $p['comments'], 'shares' => $p['shares']), $man ? $man['m'] : null),
      'tercatat' => $man !== null,'platform' => cg_plat_norm($p['platform']), 'judul' => (string)$p['judul'] !== '' ? (string)$p['judul'] : '(tanpa keterangan)',
      'url' => (string)$p['url'], 'tanggal' => (int)$p['tayang_at'] > 0 ? gmdate('Y-m-d', (int)floor((int)$p['tayang_at'] / 1000) + 7 * 3600) : '',
      'views' => (float)$p['views'], 'likes' => (float)$p['likes'], 'comments' => (float)$p['comments'], 'shares' => (float)$p['shares'], 'sumber' => 'tiktok');
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
  $sumber = isset($d['sumber']) && in_array($d['sumber'], array('manual', 'tiktok', 'konten', 'ai'), true) ? $d['sumber'] : 'manual';
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
  $kategori = cg_kategori($pdo);
  $insight = array();
  foreach ($pdo->query('SELECT platform, kategori, temuan, aksi FROM cg_insight WHERE arsip=0 ORDER BY dibuat_at DESC LIMIT 30')->fetchAll() as $i) {
    $insight[] = array('platform' => $i['platform'], 'kategori' => $i['kategori'], 'temuan' => cg_potong($i['temuan'], 300), 'aksi' => cg_potong($i['aksi'], 300));
  }
  $bukti = cg_bukti_post($pdo, 20);
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
function cg_bukti_post($pdo, $n = 25) {
  cg_pastikan($pdo);
  $baris = array();
  foreach ($pdo->query('SELECT platform, judul, url, tayang_at, views, likes, comments, shares FROM cg_post WHERE hilang=0 ORDER BY views DESC LIMIT ' . (int)$n)->fetchAll() as $p) {
    $baris[] = array('platform' => $p['platform'], 'judul' => cg_potong($p['judul'], 220), 'url' => $p['url'],
      'tanggal' => $p['tayang_at'] ? gmdate('Y-m-d', (int)($p['tayang_at'] / 1000) + 7 * 3600) : '',
      'views' => (int)$p['views'], 'likes' => (int)$p['likes'], 'comments' => (int)$p['comments'], 'shares' => (int)$p['shares']);
  }
  foreach (cg_konten_perf($pdo) as $k) {
    if (count($baris) >= $n * 2) break;
    $baris[] = array('platform' => $k['platform'], 'judul' => cg_potong($k['judul'], 220), 'url' => $k['url'], 'tanggal' => $k['tanggal'],
      'views' => (int)$k['views'], 'likes' => (int)$k['likes'], 'comments' => (int)$k['comments'], 'shares' => (int)$k['shares']);
  }
  return $baris;
}

function cg_riset_jalankan($pdo, $d, $nama) {
  cg_pastikan($pdo);
  $topik = cg_potong(isset($d['topik']) ? $d['topik'] : '', 255);
  if ($topik === '') throw new Exception('Topik riset wajib diisi.');
  $platform = cg_potong(isset($d['platform']) ? $d['platform'] : 'TikTok, Instagram', 40);
  $catatan = cg_potong(isset($d['catatan']) ? $d['catatan'] : '', 1500);
  $profil = cg_set_baca($pdo, 'profil', CG_PROFIL_BAWAAN);
  $bukti = cg_bukti_post($pdo, 20);
  $hariIni = gmdate('Y-m-d', time() + 7 * 3600);

  $system = 'Kamu ahli strategi konten media sosial untuk bisnis F&B di Indonesia. Jawab dalam Bahasa Indonesia. '
    . 'Kamu TIDAK punya akses internet: yang kamu sebut tren adalah perkiraan dari pengetahuanmu dan dari data postingan brand yang diberikan, '
    . 'jadi jangan mengarang angka statistik, nama akun, atau tautan. Kalau tidak yakin, katakan. '
    . 'Balas HANYA dengan satu objek JSON, tanpa teks lain.';
  $prompt = "Tanggal hari ini: $hariIni.\nProfil brand: $profil\nTopik riset: $topik\nPlatform: $platform\n"
    . ($catatan !== '' ? "Catatan tambahan: $catatan\n" : '')
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
function cg_insight_ai($pdo) {
  $bukti = cg_bukti_post($pdo, 30);
  if (!$bukti) throw new Exception('Belum ada postingan yang bisa dianalisa. Hubungkan & sinkronkan akun TikTok, atau isi Input Performa di modul Konten.');
  $profil = cg_set_baca($pdo, 'profil', CG_PROFIL_BAWAAN);
  $kategori = cg_kategori($pdo);
  $system = 'Kamu analis konten media sosial. Jawab dalam Bahasa Indonesia. Analisa HANYA dari data yang diberikan; '
    . 'jangan mengarang angka atau tautan. Balas HANYA dengan satu objek JSON.';
  $prompt = "Profil brand: $profil\nPostingan (diurut views):\n" . json_encode($bukti, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
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

/* ==================== SETELAN (admin modul) ==================== */
function cg_setting_simpan($pdo, $d) {
  cg_pastikan($pdo);
  /* Kotak rahasia yang dikosongkan berarti "jangan diubah", bukan "hapus".
     Layar tidak pernah menampilkan isinya, jadi kotak kosong adalah keadaan
     normal tiap kali halamannya dibuka. Menghapus memakai kata HAPUS. */
  foreach (array('aiKeyMeta' => 'ai_key_meta', 'tiktokKey' => 'tiktok_key', 'tiktokSecret' => 'tiktok_secret') as $f => $k) {
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
  return array('ok' => true);
}

/* ==================== PINTU API ==================== */
function cg_aksi($action, $body) {
  $u = sesi_user($body);
  if (!$u) sesi_tolak_tak_dikenal();
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
    case 'campaignInsightAI':    return cg_insight_ai($pdo);
    case 'campaignBankGenerate': return cg_bank_generate($pdo, $d, $nama);
    case 'campaignBankSimpan':   return cg_bank_simpan($pdo, $d, $nama);
    case 'campaignBankHapus':    return cg_bank_hapus($pdo, isset($d['id']) ? $d['id'] : '');
    case 'campaignBankArsip':    return cg_bank_arsip($pdo, isset($d['id']) ? $d['id'] : '', !empty($d['arsip']), $nama);
    case 'campaignTiktokMulai':  return cg_tiktok_mulai($pdo, $nama);
    case 'campaignTiktokSync':   return cg_tiktok_sync($pdo);
    case 'campaignTop':          return cg_top($pdo, $d);
    case 'campaignTiktokPutus':  return cg_tiktok_putus($pdo, $nama);
    case 'campaignSetting':
      if (!sesi_admin_modul($u, 'campaign')) sesi_tolak_tak_berhak('Pengaturan Campaign hanya untuk admin modul Campaign.');
      return cg_setting_simpan($pdo, $d);
  }
  throw new Exception('Aksi tidak dikenal: ' . $action);
}
