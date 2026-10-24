<?php
/************************************************************************
 * GOOGLE REVIEW — panel Konten Analytics, menu "Google Review"
 * ---------------------------------------------------------------------
 * Lahir 17 Oktober 2026, permintaan user: "nambahkan API Google khususnya
 * google review", lalu "tombol AI yang menganalisa review", lalu "filter mana
 * yang harus kita tangani segera ... dan bisa dibalas langsung di sistem ini
 * tanpa harus buka google reviewnya".
 *
 * DUA SUMBER, dan bedanya menentukan apa yang bisa dikerjakan:
 *
 *   | sumber                         | otentikasi        | isi              | balas? |
 *   | Google Business Profile (gbp)  | OAuth pemilik/    | SELURUH review   | YA     |
 *   |                                | manager profil    | + balasannya     |        |
 *   | Places API (places)            | API key           | 5 review / tarik | TIDAK  |
 *
 * Membalas review HANYA mungkin lewat Business Profile API — Places API cuma
 * membaca, dan cuma 5 review "paling relevan" tiap kali ditarik. Places tetap
 * disediakan karena akses Business Profile API harus DIAJUKAN ke Google dulu
 * (kuotanya 0 sampai disetujui), sementara Places bisa dipakai hari itu juga.
 * Review Places DIKUMPULKAN tiap sinkron (upsert), jadi daftarnya tumbuh
 * pelan-pelan walau tiap tarikan cuma 5.
 *
 * Tempat yang sudah dicakup Business Profile (metadata.placeId sama) TIDAK
 * ditarik lagi lewat Places — kalau ditarik, satu review berdiri dua kali.
 *
 * TIDAK ADA DELETE. Review yang tidak lagi dipulangkan Google dibiarkan;
 * "sudah ditangani" adalah penanda, bukan penghapusan. Satu-satunya DELETE
 * yang dikirim adalah ke GOOGLE (hapus balasan kita sendiri), dan itu harus
 * diminta lewat tombolnya.
 *
 * Seluruh aksi lewat cg_aksi() → berpagar sesi + kunci modul `campaign`.
 ************************************************************************/

define('GR_SCOPE', 'https://www.googleapis.com/auth/business.manage');
define('GR_PLACES', 'https://places.googleapis.com/v1');
define('GR_MAKS_BALAS', 4000);
/* NOMOR RESERVASI RESMI di balasan Google Review (24 Okt 2026, permintaan user).
   Draf AI sempat menutup balasan dengan "Reservasi meja via chat 0812-7788-3818"
   — nomor yang tidak ada di kode maupun di profil bawaan: dikarang modelnya.
   Balasan review itu PUBLIK, jadi nomor karangan berarti tamu menghubungi orang
   lain. Dua lapis: AI diberi nomornya + dilarang mengarang, DAN setiap nomor HP
   Indonesia di hasilnya diganti nomor ini (gr_nomor_resmi). Ganti nomor = ubah
   baris ini saja. */
define('GR_NOMOR_RESERVASI', '+62 853-6523-4898');
function gr_nomor_resmi($teks) {
  $teks = (string)$teks;
  if ($teks === '') return $teks;
  /* +62 / 62 / 0 lalu 8, diikuti 8-12 angka yang boleh dipisah spasi, titik,
     atau tanda hubung. Kurung (0812) ikut tertangkap. Nomor yang sudah benar
     ikut diganti dengan bentuk bakunya — hasilnya sama. */
  return preg_replace('/\(?(?:\+62|62|0)\)?[\s.\-]?8(?:[\s.\-()]{0,2}\d){8,12}/', GR_NOMOR_RESERVASI, $teks);
}
function gr_aturan_nomor() {
  return ' Kalau perlu menyebut nomor kontak/reservasi, pakai HANYA ' . GR_NOMOR_RESERVASI . ' (WhatsApp/chat); jangan pernah mengarang nomor lain.';
}

/* ==================== TABEL ==================== */
function gr_pastikan($pdo) {
  static $sudah = false;
  if ($sudah) return;
  cg_pastikan($pdo);
  /* Tempat yang dipantau. id = place_id (Places) atau "accounts/A/locations/L"
     (Business Profile). place_id dipisah supaya dua sumber untuk tempat yang
     sama bisa dikenali. */
  $pdo->exec("CREATE TABLE IF NOT EXISTS cg_gtempat (
    id VARCHAR(190) NOT NULL PRIMARY KEY,
    sumber VARCHAR(10) NOT NULL DEFAULT '',
    place_id VARCHAR(190) NOT NULL DEFAULT '',
    nama VARCHAR(255) NOT NULL DEFAULT '',
    alamat VARCHAR(500) NOT NULL DEFAULT '',
    rating DECIMAL(3,2) NULL,
    total INT NULL,
    url VARCHAR(600) NOT NULL DEFAULT '',
    aktif TINYINT(1) NOT NULL DEFAULT 1,
    sync_at BIGINT NOT NULL DEFAULT 0,
    galat VARCHAR(600) NOT NULL DEFAULT ''
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  /* Potret rating & jumlah ulasan per hari — satu-satunya cara melihat
     rating naik/turun, karena Google tidak menyimpan riwayatnya. */
  $pdo->exec("CREATE TABLE IF NOT EXISTS cg_gtempat_harian (
    tempat_id VARCHAR(190) NOT NULL,
    tgl DATE NOT NULL,
    rating DECIMAL(3,2) NULL,
    total INT NULL,
    PRIMARY KEY (tempat_id, tgl)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  /* id = sha1(nama resource review). Nama resource bisa > 190 huruf, dan
     kunci utama yang terpotong membuat dua review saling menimpa. */
  $pdo->exec("CREATE TABLE IF NOT EXISTS cg_greview (
    id VARCHAR(40) NOT NULL PRIMARY KEY,
    nama_res VARCHAR(600) NOT NULL DEFAULT '',
    sumber VARCHAR(10) NOT NULL DEFAULT '',
    tempat_id VARCHAR(190) NOT NULL DEFAULT '',
    penulis VARCHAR(200) NOT NULL DEFAULT '',
    penulis_url VARCHAR(600) NOT NULL DEFAULT '',
    foto VARCHAR(900) NOT NULL DEFAULT '',
    rating TINYINT NOT NULL DEFAULT 0,
    teks TEXT NULL,
    waktu_ms BIGINT NOT NULL DEFAULT 0,
    url VARCHAR(600) NOT NULL DEFAULT '',
    balasan TEXT NULL,
    balasan_at BIGINT NOT NULL DEFAULT 0,
    balasan_oleh VARCHAR(120) NOT NULL DEFAULT '',
    ditangani TINYINT(1) NOT NULL DEFAULT 0,
    tangani_catatan TEXT NULL,
    tangani_oleh VARCHAR(120) NOT NULL DEFAULT '',
    tangani_at BIGINT NOT NULL DEFAULT 0,
    pertama_at BIGINT NOT NULL DEFAULT 0,
    sync_at BIGINT NOT NULL DEFAULT 0,
    KEY idx_gr_tempat (tempat_id),
    KEY idx_gr_waktu (waktu_ms)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  $sudah = true;
}

/* ==================== SETELAN ==================== */
/* Rahasia dari config.php MENANG atas isian layar — aturan yang sama dengan
   kunci TikTok/Instagram/Meta. */
function gr_client_id($pdo) {
  if (defined('GOOGLE_CLIENT_ID') && GOOGLE_CLIENT_ID !== '') return GOOGLE_CLIENT_ID;
  return cg_set_baca($pdo, 'google_client_id');
}
function gr_client_secret($pdo) {
  if (defined('GOOGLE_CLIENT_SECRET') && GOOGLE_CLIENT_SECRET !== '') return GOOGLE_CLIENT_SECRET;
  return cg_set_baca($pdo, 'google_client_secret');
}
function gr_places_key($pdo) {
  if (defined('GOOGLE_PLACES_KEY') && GOOGLE_PLACES_KEY !== '') return GOOGLE_PLACES_KEY;
  return cg_set_baca($pdo, 'google_places_key');
}
/* Daftar Place ID yang dipantau lewat Places API. */
function gr_places_ids($pdo) {
  $out = array();
  foreach (preg_split('/[\s,;]+/', cg_set_baca($pdo, 'google_places')) as $p) {
    $p = trim($p);
    if ($p !== '' && preg_match('/^[A-Za-z0-9_\-]{10,190}$/', $p)) $out[] = $p;
  }
  return array_values(array_unique($out));
}
function gr_redirect_uri() {
  $host = isset($_SERVER['SERVER_NAME']) ? $_SERVER['SERVER_NAME'] : '';
  if ($host === '') return '';
  return 'https://' . $host . '/konten-api-mysql/campaign-google.php';
}
/* Ringkasan untuk layar — rahasia tidak pernah ikut. */
function gr_setting_ringkas($pdo) {
  return array(
    'googleOauthSiap'  => gr_client_id($pdo) !== '' && gr_client_secret($pdo) !== '',
    'googleDariConfig' => defined('GOOGLE_CLIENT_ID') && GOOGLE_CLIENT_ID !== '',
    'googleRedirectUri' => gr_redirect_uri(),
    'placesKeyAda'     => gr_places_key($pdo) !== '',
    'placesDariConfig' => defined('GOOGLE_PLACES_KEY') && GOOGLE_PLACES_KEY !== '',
    'placesIds'        => implode(', ', gr_places_ids($pdo)),
  );
}
function gr_setting_simpan($pdo, $d) {
  foreach (array('googleClientId' => 'google_client_id', 'googleClientSecret' => 'google_client_secret', 'placesKey' => 'google_places_key') as $f => $k) {
    if (!isset($d[$f])) continue;
    $v = trim((string)$d[$f]);
    if ($v === '') continue;
    cg_set_tulis($pdo, $k, $v === 'HAPUS' ? '' : $v);
  }
  /* Place ID bukan rahasia. Yang bukan bentuk Place ID DITOLAK — salah tempel
     (mis. tautan Maps utuh) tidak boleh tersimpan diam-diam lalu tidak pernah
     menarik apa pun. */
  if (isset($d['placesIds'])) {
    $ids = array();
    foreach (preg_split('/[\s,;]+/', (string)$d['placesIds']) as $p) {
      $p = trim($p);
      if ($p === '') continue;
      if (!preg_match('/^[A-Za-z0-9_\-]{10,190}$/', $p)) throw new Exception('Place ID tidak sah: "' . cg_potong($p, 60) . '". Pakai tombol Cari tempat untuk mendapatkannya.');
      $ids[] = $p;
    }
    cg_set_tulis($pdo, 'google_places', implode(',', array_unique($ids)));
  }
}

/* ==================== OAUTH (Business Profile) ==================== */
function gr_mulai($pdo, $nama) {
  gr_pastikan($pdo);
  if (!gr_client_id($pdo) || !gr_client_secret($pdo)) throw new Exception('Client ID & Client secret Google belum diisi di Pengaturan.');
  $state = bin2hex(random_bytes(16));
  cg_set_tulis($pdo, 'google_state', json_encode(array('s' => $state, 'exp' => cg_now_ms() + 15 * 60000, 'by' => $nama)));
  /* access_type=offline + prompt=consent: TANPA keduanya Google tidak
     memberi refresh token pada izin kedua, dan sambungannya putus sejam
     kemudian tanpa jalan memperbaruinya. */
  return array('url' => 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query(array(
    'client_id' => gr_client_id($pdo), 'redirect_uri' => gr_redirect_uri(), 'response_type' => 'code',
    'scope' => GR_SCOPE, 'access_type' => 'offline', 'prompt' => 'consent', 'include_granted_scopes' => 'true', 'state' => $state)));
}

function gr_galat($r, $awal) {
  $p = isset($r['data']['error']['message']) ? $r['data']['error']['message']
    : (isset($r['data']['error_description']) ? $r['data']['error_description']
    : (isset($r['data']['error']) && is_string($r['data']['error']) ? $r['data']['error'] : $r['mentah']));
  $p = is_string($p) ? $p : json_encode($p);
  /* Kuota 0 = akses Business Profile API belum disetujui. Pesan aslinya
     ("Quota exceeded ... 0") terbaca seperti pemakaian berlebih. */
  if (stripos($p, 'quota') !== false && (isset($r['kode']) && $r['kode'] == 429)) {
    $p .= ' — kemungkinan besar akses Business Profile API untuk project Google Cloud ini BELUM disetujui Google (kuotanya 0 sampai pengajuan disetujui).';
  }
  if (isset($r['kode']) && $r['kode'] == 403 && stripos($p, 'has not been used') !== false) {
    $p .= ' — aktifkan API itu di Google Cloud Console → APIs & Services → Library.';
  }
  return $awal . ' (' . (isset($r['kode']) ? $r['kode'] : '?') . '): ' . $p;
}

function gr_simpan_token($pdo, $tok, $exp, $refresh, $scope, $nama, $email) {
  $q = $pdo->prepare('INSERT INTO cg_akun (platform, nama, open_id, access_token, refresh_token, token_exp, refresh_exp, scope, sync_galat, oleh, at)
    VALUES (:pl, :nm, :oi, :ac, :rf, :te, :re, :sc, :sg, :by, :at)
    ON DUPLICATE KEY UPDATE nama=VALUES(nama), open_id=VALUES(open_id), access_token=VALUES(access_token), refresh_token=VALUES(refresh_token),
      token_exp=VALUES(token_exp), refresh_exp=VALUES(refresh_exp), scope=VALUES(scope), sync_galat=VALUES(sync_galat), oleh=VALUES(oleh), at=VALUES(at)');
  /* Refresh token Google tidak punya tanggal kedaluwarsa (selama tidak dicabut
     dan app-nya bukan berstatus Testing) — dicatat jauh ke depan; kalau Google
     menolaknya, refresh_exp dinolkan di gr_token(). */
  $q->execute(array(':pl' => 'google', ':nm' => $email, ':oi' => $email, ':ac' => $tok, ':rf' => $refresh,
    ':te' => $exp, ':re' => cg_now_ms() + 3650 * 86400000, ':sc' => $scope, ':sg' => '', ':by' => $nama, ':at' => cg_now_ms()));
}

function gr_callback($pdo, $code, $state) {
  gr_pastikan($pdo);
  $st = json_decode(cg_set_baca($pdo, 'google_state'), true);
  if (!is_array($st) || !hash_equals((string)$st['s'], (string)$state)) throw new Exception('Tautan otorisasi tidak dikenal. Ulangi dari tombol Hubungkan.');
  if ((int)$st['exp'] < cg_now_ms()) throw new Exception('Tautan otorisasi sudah kedaluwarsa (15 menit). Ulangi dari tombol Hubungkan.');
  cg_set_tulis($pdo, 'google_state', '');
  $r = cg_http('POST', 'https://oauth2.googleapis.com/token', array('Content-Type: application/x-www-form-urlencoded'),
    http_build_query(array('code' => $code, 'client_id' => gr_client_id($pdo), 'client_secret' => gr_client_secret($pdo),
      'redirect_uri' => gr_redirect_uri(), 'grant_type' => 'authorization_code')), 30);
  if (!$r['data'] || empty($r['data']['access_token'])) throw new Exception(gr_galat($r, 'Google menolak token'));
  $d = $r['data'];
  $lamaRefresh = '';
  if (empty($d['refresh_token'])) {
    $q = $pdo->prepare("SELECT refresh_token FROM cg_akun WHERE platform = 'google'");
    $q->execute(); $lamaRefresh = (string)$q->fetchColumn();
    if ($lamaRefresh === '') throw new Exception('Google tidak memberi refresh token. Cabut akses app ini di myaccount.google.com/permissions lalu Hubungkan lagi.');
  }
  /* Email akun yang mengizinkan — supaya layar bisa menyebut SIAPA yang
     terhubung; id_token tidak diminta, jadi dibaca dari tokeninfo. */
  $email = '';
  $ti = cg_http('GET', 'https://oauth2.googleapis.com/tokeninfo?access_token=' . rawurlencode((string)$d['access_token']), array(), null, 20);
  if ($ti['data'] && !empty($ti['data']['email'])) $email = (string)$ti['data']['email'];
  gr_simpan_token($pdo, (string)$d['access_token'], cg_now_ms() + (int)(isset($d['expires_in']) ? $d['expires_in'] : 3600) * 1000,
    !empty($d['refresh_token']) ? (string)$d['refresh_token'] : $lamaRefresh, (string)(isset($d['scope']) ? $d['scope'] : GR_SCOPE), (string)$st['by'], $email);
  gr_lokasi_tarik($pdo);
  return gr_sync($pdo);
}

/* Token akses yang masih berlaku; diperbarui lewat refresh token kalau
   tinggal < 2 menit. */
function gr_token($pdo) {
  $q = $pdo->prepare("SELECT * FROM cg_akun WHERE platform = 'google'");
  $q->execute();
  $a = $q->fetch();
  if (!$a || (string)$a['refresh_token'] === '') throw new Exception('Akun Google Business Profile belum terhubung.');
  if ((int)$a['refresh_exp'] < cg_now_ms()) throw new Exception('Izin Google sudah dicabut atau kedaluwarsa. Tekan Hubungkan lagi.');
  if ((int)$a['token_exp'] - cg_now_ms() > 120000) return (string)$a['access_token'];
  $r = cg_http('POST', 'https://oauth2.googleapis.com/token', array('Content-Type: application/x-www-form-urlencoded'),
    http_build_query(array('client_id' => gr_client_id($pdo), 'client_secret' => gr_client_secret($pdo),
      'refresh_token' => (string)$a['refresh_token'], 'grant_type' => 'refresh_token')), 30);
  if (!$r['data'] || empty($r['data']['access_token'])) {
    /* invalid_grant = refresh token dicabut / app masih berstatus Testing
       (refresh token Testing cuma 7 hari). Ditandai putus supaya layar
       menyuruh Hubungkan lagi, bukan mengulang galat yang sama tiap sinkron. */
    if (isset($r['data']['error']) && $r['data']['error'] === 'invalid_grant') {
      $pdo->prepare("UPDATE cg_akun SET refresh_exp = 0, sync_galat = :g WHERE platform = 'google'")
        ->execute(array(':g' => 'Izin Google dicabut/kedaluwarsa. Kalau app OAuth masih berstatus Testing, izinnya cuma bertahan 7 hari — terbitkan (Publish) app-nya.'));
      throw new Exception('Izin Google dicabut atau kedaluwarsa (invalid_grant). Tekan Hubungkan lagi. Kalau terulang tiap ±7 hari, app OAuth-nya masih berstatus Testing.');
    }
    throw new Exception(gr_galat($r, 'Google menolak memperbarui token'));
  }
  $tok = (string)$r['data']['access_token'];
  $pdo->prepare("UPDATE cg_akun SET access_token = :t, token_exp = :e WHERE platform = 'google'")
    ->execute(array(':t' => $tok, ':e' => cg_now_ms() + (int)(isset($r['data']['expires_in']) ? $r['data']['expires_in'] : 3600) * 1000));
  return $tok;
}

function gr_get($tok, $url) {
  $r = cg_http('GET', $url, array('Authorization: Bearer ' . $tok), null, 40);
  if ($r['kode'] !== 200 || !is_array($r['data'])) throw new Exception(gr_galat($r, 'Google Business Profile menolak'));
  return $r['data'];
}

/* Daftar lokasi bisnis dari seluruh akun yang bisa diakses orangnya. Lokasi
   lama yang tidak dipulangkan lagi DINONAKTIFKAN, bukan dihapus — review-nya
   tetap tersimpan. */
function gr_lokasi_tarik($pdo) {
  gr_pastikan($pdo);
  $tok = gr_token($pdo);
  $akun = array(); $url = 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20';
  for ($h = 0; $url !== '' && $h < 5; $h++) {
    $d = gr_get($tok, $url);
    foreach ((isset($d['accounts']) ? $d['accounts'] : array()) as $a) $akun[] = (string)$a['name'];
    $url = !empty($d['nextPageToken']) ? 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20&pageToken=' . rawurlencode($d['nextPageToken']) : '';
  }
  $ada = array();
  $up = $pdo->prepare('INSERT INTO cg_gtempat (id, sumber, place_id, nama, alamat, url, aktif) VALUES (:id, :su, :pi, :nm, :al, :ur, 1)
    ON DUPLICATE KEY UPDATE sumber=VALUES(sumber), place_id=VALUES(place_id), nama=VALUES(nama), alamat=VALUES(alamat), url=VALUES(url), aktif=1');
  foreach ($akun as $acc) {
    $base = 'https://mybusinessbusinessinformation.googleapis.com/v1/' . $acc . '/locations?pageSize=100&readMask=name,title,storefrontAddress,metadata';
    $url = $base;
    for ($h = 0; $url !== '' && $h < 10; $h++) {
      $d = gr_get($tok, $url);
      foreach ((isset($d['locations']) ? $d['locations'] : array()) as $l) {
        /* Profil yang ditandai Google sebagai DUPLIKAT dilewati (17 Okt 2026:
           akun Laksamana memegang 1 profil terverifikasi + 2 duplikat di alamat
           yang sama). Duplikat tidak tampil ke publik dan tidak menerima review;
           ditarik, ia cuma melahirkan kartu kembar berisi galat. Karena tidak
           masuk $ada, baris lamanya ikut dinonaktifkan di bawah. */
        if (!empty($l['metadata']['duplicateLocation'])) continue;
        /* Nama v4 untuk review = accounts/A/locations/L. */
        $locId = preg_replace('#^locations/#', '', (string)$l['name']);
        $id = $acc . '/locations/' . $locId;
        $alamat = '';
        if (isset($l['storefrontAddress']['addressLines'])) $alamat = implode(', ', (array)$l['storefrontAddress']['addressLines']);
        if (isset($l['storefrontAddress']['locality'])) $alamat .= ($alamat !== '' ? ', ' : '') . $l['storefrontAddress']['locality'];
        $up->execute(array(':id' => $id, ':su' => 'gbp',
          ':pi' => isset($l['metadata']['placeId']) ? (string)$l['metadata']['placeId'] : '',
          ':nm' => cg_potong(isset($l['title']) ? $l['title'] : '', 250), ':al' => cg_potong($alamat, 490),
          ':ur' => isset($l['metadata']['mapsUri']) ? cg_potong($l['metadata']['mapsUri'], 590) : ''));
        $ada[$id] = true;
      }
      $url = !empty($d['nextPageToken']) ? $base . '&pageToken=' . rawurlencode($d['nextPageToken']) : '';
    }
  }
  foreach ($pdo->query("SELECT id FROM cg_gtempat WHERE sumber = 'gbp'")->fetchAll() as $t) {
    if (!isset($ada[$t['id']])) $pdo->prepare('UPDATE cg_gtempat SET aktif = 0 WHERE id = :id')->execute(array(':id' => $t['id']));
  }
  return count($ada);
}

/* ==================== SIMPAN REVIEW ==================== */
function gr_review_simpan($pdo, $r, $now) {
  /* Kolom milik kita (balasan dari sistem, penanda ditangani) TIDAK ditimpa
     sinkron — kecuali balasan yang memang datang dari Google (dibalas lewat
     Google Maps langsung), dan itu hanya untuk sumber gbp. */
  $q = $pdo->prepare('INSERT INTO cg_greview (id, nama_res, sumber, tempat_id, penulis, penulis_url, foto, rating, teks, waktu_ms, url, balasan, balasan_at, pertama_at, sync_at)
    VALUES (:id, :nr, :su, :ti, :pe, :pu, :fo, :ra, :te, :wa, :ur, :ba, :bt, :pa, :sy)
    ON DUPLICATE KEY UPDATE nama_res=VALUES(nama_res), tempat_id=VALUES(tempat_id), penulis=VALUES(penulis), penulis_url=VALUES(penulis_url),
      foto=VALUES(foto), rating=VALUES(rating), teks=VALUES(teks), waktu_ms=VALUES(waktu_ms), url=VALUES(url),
      balasan=IF(VALUES(sumber)=\'gbp\', VALUES(balasan), balasan), balasan_at=IF(VALUES(sumber)=\'gbp\', VALUES(balasan_at), balasan_at),
      sync_at=VALUES(sync_at)');
  $q->execute(array(':id' => sha1($r['nama_res']), ':nr' => cg_potong($r['nama_res'], 590), ':su' => $r['sumber'], ':ti' => $r['tempat_id'],
    ':pe' => cg_potong($r['penulis'], 190), ':pu' => cg_potong($r['penulis_url'], 590), ':fo' => cg_potong($r['foto'], 890),
    ':ra' => max(0, min(5, (int)$r['rating'])), ':te' => cg_potong($r['teks'], 6000), ':wa' => (int)$r['waktu_ms'],
    ':ur' => cg_potong($r['url'], 590), ':ba' => $r['balasan'], ':bt' => (int)$r['balasan_at'], ':pa' => $now, ':sy' => $now));
}
function gr_iso_ms($t) {
  $x = strtotime((string)$t);
  return $x ? $x * 1000 : 0;
}
function gr_harian($pdo, $tempatId, $rating, $total) {
  $q = $pdo->prepare('INSERT INTO cg_gtempat_harian (tempat_id, tgl, rating, total) VALUES (:t, :g, :r, :n)
    ON DUPLICATE KEY UPDATE rating=VALUES(rating), total=VALUES(total)');
  $q->execute(array(':t' => $tempatId, ':g' => cg_wib_hari(0), ':r' => $rating, ':n' => $total));
}

/* ==================== SINKRON ==================== */
function gr_sync($pdo) {
  gr_pastikan($pdo);
  @set_time_limit(170);
  $now = cg_now_ms();
  $jumlah = 0; $galat = array(); $dicakup = array();
  /* 1. Business Profile — seluruh review tiap lokasi. */
  $q = $pdo->prepare("SELECT refresh_token FROM cg_akun WHERE platform = 'google' AND refresh_exp > :n");
  $q->execute(array(':n' => $now));
  if ((string)$q->fetchColumn() !== '') {
    try {
      $tok = gr_token($pdo);
      if (!(int)$pdo->query("SELECT COUNT(*) FROM cg_gtempat WHERE sumber='gbp'")->fetchColumn()) gr_lokasi_tarik($pdo);
      foreach ($pdo->query("SELECT * FROM cg_gtempat WHERE sumber='gbp' AND aktif=1")->fetchAll() as $t) {
        if ((string)$t['place_id'] !== '') $dicakup[(string)$t['place_id']] = true;
        try {
          $base = 'https://mybusiness.googleapis.com/v4/' . $t['id'] . '/reviews?pageSize=50&orderBy=' . rawurlencode('updateTime desc');
          $url = $base; $rating = null; $total = null;
          /* Riwayat penuh sekali (sampai 40 halaman = 2.000 review), sesudahnya
             cuma halaman pertama — review baru & yang baru disunting selalu di
             depan karena diurut updateTime. */
          $penuh = cg_set_baca($pdo, 'gbp_bf_' . sha1($t['id'])) !== '1';
          for ($h = 0; $url !== '' && $h < ($penuh ? 40 : 2); $h++) {
            $d = gr_get($tok, $url);
            if (isset($d['averageRating'])) $rating = (float)$d['averageRating'];
            if (isset($d['totalReviewCount'])) $total = (int)$d['totalReviewCount'];
            foreach ((isset($d['reviews']) ? $d['reviews'] : array()) as $rv) {
              $bintang = array('ONE' => 1, 'TWO' => 2, 'THREE' => 3, 'FOUR' => 4, 'FIVE' => 5);
              $rep = isset($rv['reviewReply']) ? $rv['reviewReply'] : null;
              gr_review_simpan($pdo, array('nama_res' => (string)$rv['name'], 'sumber' => 'gbp', 'tempat_id' => (string)$t['id'],
                'penulis' => isset($rv['reviewer']['displayName']) ? (string)$rv['reviewer']['displayName'] : 'Pengguna Google',
                'penulis_url' => '', 'foto' => isset($rv['reviewer']['profilePhotoUrl']) ? (string)$rv['reviewer']['profilePhotoUrl'] : '',
                'rating' => isset($rv['starRating'], $bintang[$rv['starRating']]) ? $bintang[$rv['starRating']] : 0,
                'teks' => isset($rv['comment']) ? gr_buang_terjemahan((string)$rv['comment']) : '',
                'waktu_ms' => gr_iso_ms(isset($rv['createTime']) ? $rv['createTime'] : ''),
                'url' => (string)$t['url'],
                'balasan' => $rep && isset($rep['comment']) ? (string)$rep['comment'] : null,
                'balasan_at' => $rep && isset($rep['updateTime']) ? gr_iso_ms($rep['updateTime']) : 0), $now);
              $jumlah++;
            }
            $url = !empty($d['nextPageToken']) ? $base . '&pageToken=' . rawurlencode($d['nextPageToken']) : '';
          }
          if ($penuh && $url === '') cg_set_tulis($pdo, 'gbp_bf_' . sha1($t['id']), '1');
          $pdo->prepare('UPDATE cg_gtempat SET rating = :r, total = :n, sync_at = :s, galat = \'\' WHERE id = :id')
            ->execute(array(':r' => $rating, ':n' => $total, ':s' => $now, ':id' => $t['id']));
          gr_harian($pdo, (string)$t['id'], $rating, $total);
        } catch (Throwable $e) {
          $galat[] = $t['nama'] . ': ' . $e->getMessage();
          $pdo->prepare('UPDATE cg_gtempat SET galat = :g WHERE id = :id')->execute(array(':g' => cg_potong($e->getMessage(), 590), ':id' => $t['id']));
        }
      }
      $pdo->prepare("UPDATE cg_akun SET sync_at = :s, sync_galat = :g WHERE platform = 'google'")
        ->execute(array(':s' => $now, ':g' => cg_potong(implode(' | ', $galat), 390)));
    } catch (Throwable $e) {
      $galat[] = $e->getMessage();
      $pdo->prepare("UPDATE cg_akun SET sync_at = :s, sync_galat = :g WHERE platform = 'google'")
        ->execute(array(':s' => $now, ':g' => cg_potong($e->getMessage(), 390)));
    }
  }
  /* 2. Places API — tempat yang tidak dicakup Business Profile. */
  $key = gr_places_key($pdo);
  if ($key !== '') {
    foreach (gr_places_ids($pdo) as $pid) {
      if (isset($dicakup[$pid])) continue;
      try { $jumlah += gr_places_tarik($pdo, $key, $pid, $now); }
      catch (Throwable $e) {
        $galat[] = $pid . ': ' . $e->getMessage();
        $pdo->prepare("INSERT INTO cg_gtempat (id, sumber, place_id, galat) VALUES (:id, 'places', :pi, :g) ON DUPLICATE KEY UPDATE galat = VALUES(galat)")
          ->execute(array(':id' => $pid, ':pi' => $pid, ':g' => cg_potong($e->getMessage(), 590)));
      }
    }
    /* Place ID yang sudah dicabut dari Pengaturan dinonaktifkan (review-nya
       tetap tersimpan). */
    $aktif = array_flip(gr_places_ids($pdo));
    foreach ($pdo->query("SELECT id FROM cg_gtempat WHERE sumber = 'places'")->fetchAll() as $t) {
      $pdo->prepare('UPDATE cg_gtempat SET aktif = :a WHERE id = :id')->execute(array(':a' => isset($aktif[$t['id']]) ? 1 : 0, ':id' => $t['id']));
    }
  }
  cg_set_tulis($pdo, 'google_sync_at', (string)$now);
  cg_set_tulis($pdo, 'google_galat', cg_potong(implode(' | ', $galat), 900));
  return array('jumlah' => $jumlah, 'galat' => $galat);
}

/* Business Profile menempelkan terjemahan otomatis: "teks asli\n\n(Translated
   by Google)\nterjemahan" atau sebaliknya "(Original)". Yang disimpan teks
   ASLI tamunya. */
function gr_buang_terjemahan($s) {
  if (preg_match('/\(Original\)\s*(.+)$/s', $s, $m)) return trim($m[1]);
  $p = strpos($s, '(Translated by Google)');
  if ($p !== false) return trim(substr($s, 0, $p));
  return $s;
}

function gr_places_tarik($pdo, $key, $pid, $now) {
  $r = cg_http('GET', GR_PLACES . '/places/' . rawurlencode($pid) . '?languageCode=id',
    array('X-Goog-Api-Key: ' . $key, 'X-Goog-FieldMask: id,displayName,formattedAddress,rating,userRatingCount,googleMapsUri,reviews'), null, 30);
  if ($r['kode'] !== 200 || !is_array($r['data'])) throw new Exception(gr_galat($r, 'Places API menolak'));
  $d = $r['data'];
  $rating = isset($d['rating']) ? (float)$d['rating'] : null;
  $total = isset($d['userRatingCount']) ? (int)$d['userRatingCount'] : null;
  $pdo->prepare("INSERT INTO cg_gtempat (id, sumber, place_id, nama, alamat, rating, total, url, aktif, sync_at, galat)
      VALUES (:id, 'places', :pi, :nm, :al, :ra, :to, :ur, 1, :sy, '')
      ON DUPLICATE KEY UPDATE nama=VALUES(nama), alamat=VALUES(alamat), rating=VALUES(rating), total=VALUES(total), url=VALUES(url), aktif=1, sync_at=VALUES(sync_at), galat=''")
    ->execute(array(':id' => $pid, ':pi' => $pid, ':nm' => cg_potong(isset($d['displayName']['text']) ? $d['displayName']['text'] : $pid, 250),
      ':al' => cg_potong(isset($d['formattedAddress']) ? $d['formattedAddress'] : '', 490), ':ra' => $rating, ':to' => $total,
      ':ur' => cg_potong(isset($d['googleMapsUri']) ? $d['googleMapsUri'] : '', 590), ':sy' => $now));
  gr_harian($pdo, $pid, $rating, $total);
  $n = 0;
  foreach ((isset($d['reviews']) ? $d['reviews'] : array()) as $rv) {
    if (empty($rv['name'])) continue;
    $teks = isset($rv['originalText']['text']) ? (string)$rv['originalText']['text'] : (isset($rv['text']['text']) ? (string)$rv['text']['text'] : '');
    gr_review_simpan($pdo, array('nama_res' => (string)$rv['name'], 'sumber' => 'places', 'tempat_id' => $pid,
      'penulis' => isset($rv['authorAttribution']['displayName']) ? (string)$rv['authorAttribution']['displayName'] : 'Pengguna Google',
      'penulis_url' => isset($rv['authorAttribution']['uri']) ? (string)$rv['authorAttribution']['uri'] : '',
      'foto' => isset($rv['authorAttribution']['photoUri']) ? (string)$rv['authorAttribution']['photoUri'] : '',
      'rating' => isset($rv['rating']) ? (int)$rv['rating'] : 0, 'teks' => $teks,
      'waktu_ms' => gr_iso_ms(isset($rv['publishTime']) ? $rv['publishTime'] : ''),
      'url' => isset($rv['googleMapsUri']) ? (string)$rv['googleMapsUri'] : (isset($d['googleMapsUri']) ? (string)$d['googleMapsUri'] : ''),
      'balasan' => null, 'balasan_at' => 0), $now);
    $n++;
  }
  return $n;
}

/* Cari Place ID dari nama tempat — orang tidak hafal Place ID-nya. */
function gr_cari($pdo, $d) {
  $key = gr_places_key($pdo);
  if ($key === '') throw new Exception('API key Places belum diisi (simpan dulu pengaturannya).');
  $q = cg_potong(isset($d['q']) ? $d['q'] : '', 200);
  if ($q === '') throw new Exception('Ketik nama tempatnya.');
  $r = cg_http('POST', GR_PLACES . '/places:searchText',
    array('Content-Type: application/json', 'X-Goog-Api-Key: ' . $key, 'X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount'),
    json_encode(array('textQuery' => $q, 'languageCode' => 'id', 'pageSize' => 8)), 30);
  if ($r['kode'] !== 200 || !is_array($r['data'])) throw new Exception(gr_galat($r, 'Places API menolak'));
  $out = array();
  foreach ((isset($r['data']['places']) ? $r['data']['places'] : array()) as $p) {
    $out[] = array('id' => (string)$p['id'], 'nama' => isset($p['displayName']['text']) ? $p['displayName']['text'] : '',
      'alamat' => isset($p['formattedAddress']) ? $p['formattedAddress'] : '',
      'rating' => isset($p['rating']) ? (float)$p['rating'] : null, 'total' => isset($p['userRatingCount']) ? (int)$p['userRatingCount'] : null);
  }
  return array('hasil' => $out);
}

/* ==================== BACA ==================== */
function gr_baca($pdo) {
  gr_pastikan($pdo);
  $tempat = $pdo->query('SELECT * FROM cg_gtempat ORDER BY aktif DESC, nama ASC')->fetchAll();
  $q = $pdo->prepare('SELECT * FROM cg_gtempat_harian WHERE tgl >= :d ORDER BY tgl ASC');
  $q->execute(array(':d' => cg_wib_hari(-120)));
  $harian = $q->fetchAll();
  $review = $pdo->query('SELECT id, sumber, tempat_id, penulis, penulis_url, foto, rating, teks, waktu_ms, url, balasan, balasan_at, balasan_oleh,
      ditangani, tangani_catatan, tangani_oleh, tangani_at, pertama_at FROM cg_greview ORDER BY waktu_ms DESC LIMIT 3000')->fetchAll();
  $totalTersimpan = (int)$pdo->query('SELECT COUNT(*) FROM cg_greview')->fetchColumn();
  $q = $pdo->prepare("SELECT nama, refresh_exp, sync_at, sync_galat, oleh, at FROM cg_akun WHERE platform = 'google'");
  $q->execute();
  $akun = $q->fetch();
  if ($akun) $akun['terhubung'] = (int)$akun['refresh_exp'] > cg_now_ms();
  $ai = json_decode(cg_set_baca($pdo, 'gr_ai'), true);
  /* Analisa yang tersimpan SEBELUM nomor resmi dipasang masih membawa nomor
     karangan di usulanBalasan — disaring saat dibaca, supaya "Pakai draf dari
     analisa AI" tidak menempelkannya tanpa harus menganalisa ulang. */
  if (is_array($ai) && isset($ai['tangani']) && is_array($ai['tangani'])) {
    foreach ($ai['tangani'] as $i => $t) {
      if (is_array($t) && isset($t['usulanBalasan'])) $ai['tangani'][$i]['usulanBalasan'] = gr_nomor_resmi($t['usulanBalasan']);
    }
  }
  return array('tempat' => $tempat, 'harian' => $harian, 'review' => $review, 'totalTersimpan' => $totalTersimpan,
    'akun' => $akun ?: null, 'ai' => is_array($ai) ? $ai : null,
    'syncAt' => (int)cg_set_baca($pdo, 'google_sync_at', '0'), 'galat' => cg_set_baca($pdo, 'google_galat'));
}

/* ==================== BALAS & TANGANI ==================== */
function gr_review_by_id($pdo, $id) {
  $q = $pdo->prepare('SELECT * FROM cg_greview WHERE id = :id');
  $q->execute(array(':id' => (string)$id));
  $r = $q->fetch();
  if (!$r) throw new Exception('Review tidak ditemukan. Muat ulang halamannya.');
  return $r;
}

/* Balasan TERBIT DI GOOGLE MAPS atas nama bisnis — dilihat publik. Yang
   menulis dicatat (balasan_oleh) karena Google sendiri cuma mencatat nama
   bisnisnya. */
function gr_balas($pdo, $d, $nama) {
  gr_pastikan($pdo);
  $r = gr_review_by_id($pdo, isset($d['id']) ? $d['id'] : '');
  if ($r['sumber'] !== 'gbp') throw new Exception('Review ini ditarik lewat Places API — Google tidak mengizinkan membalasnya dari luar. Hubungkan Google Business Profile di Pengaturan supaya review bisa dibalas dari sini.');
  $teks = trim((string)(isset($d['teks']) ? $d['teks'] : ''));
  if ($teks === '') throw new Exception('Isi balasannya dulu.');
  if (mb_strlen_aman($teks) > GR_MAKS_BALAS) throw new Exception('Balasan terlalu panjang (maks ' . GR_MAKS_BALAS . ' huruf).');
  $tok = gr_token($pdo);
  $res = cg_http('PUT', 'https://mybusiness.googleapis.com/v4/' . $r['nama_res'] . '/reply',
    array('Authorization: Bearer ' . $tok, 'Content-Type: application/json'), json_encode(array('comment' => $teks), JSON_UNESCAPED_UNICODE), 30);
  if ($res['kode'] !== 200) throw new Exception(gr_galat($res, 'Google menolak balasan'));
  $now = cg_now_ms();
  $pdo->prepare('UPDATE cg_greview SET balasan = :b, balasan_at = :t, balasan_oleh = :o WHERE id = :id')
    ->execute(array(':b' => $teks, ':t' => $now, ':o' => $nama, ':id' => $r['id']));
  return array('ok' => true, 'at' => $now);
}
function gr_balas_hapus($pdo, $d) {
  gr_pastikan($pdo);
  $r = gr_review_by_id($pdo, isset($d['id']) ? $d['id'] : '');
  if ($r['sumber'] !== 'gbp') throw new Exception('Review ini tidak bisa dikelola dari sini (sumber Places API).');
  $tok = gr_token($pdo);
  $res = cg_http('DELETE', 'https://mybusiness.googleapis.com/v4/' . $r['nama_res'] . '/reply', array('Authorization: Bearer ' . $tok), null, 30);
  if ($res['kode'] !== 200 && $res['kode'] !== 204 && $res['kode'] !== 404) throw new Exception(gr_galat($res, 'Google menolak menghapus balasan'));
  $pdo->prepare('UPDATE cg_greview SET balasan = NULL, balasan_at = 0, balasan_oleh = \'\' WHERE id = :id')->execute(array(':id' => $r['id']));
  return array('ok' => true);
}
function mb_strlen_aman($s) { return function_exists('mb_strlen') ? mb_strlen($s, 'UTF-8') : strlen($s); }

/* Penanda "sudah ditangani" — untuk tindak lanjut di dalam (tamu dihubungi,
   masalah dapur diperbaiki), terpisah dari balasan publik. */
function gr_tangani($pdo, $d, $nama) {
  gr_pastikan($pdo);
  $r = gr_review_by_id($pdo, isset($d['id']) ? $d['id'] : '');
  $ya = !empty($d['ditangani']);
  $pdo->prepare('UPDATE cg_greview SET ditangani = :y, tangani_catatan = :c, tangani_oleh = :o, tangani_at = :t WHERE id = :id')
    ->execute(array(':y' => $ya ? 1 : 0, ':c' => $ya ? cg_potong(isset($d['catatan']) ? $d['catatan'] : '', 1500) : null,
      ':o' => $ya ? $nama : '', ':t' => $ya ? cg_now_ms() : 0, ':id' => $r['id']));
  return array('ok' => true);
}

/* ==================== ANALISA AI ==================== */
function gr_ai($pdo, $d, $nama) {
  gr_pastikan($pdo);
  $hari = max(7, min(365, (int)(isset($d['hari']) ? $d['hari'] : 90)));
  $dari = (time() - $hari * 86400) * 1000;
  $tempat = isset($d['tempat']) ? (string)$d['tempat'] : '';
  $sql = 'SELECT g.id, g.penulis, g.rating, g.teks, g.waktu_ms, g.balasan, g.ditangani, t.nama tnama FROM cg_greview g LEFT JOIN cg_gtempat t ON t.id = g.tempat_id
    WHERE g.waktu_ms >= :d' . ($tempat !== '' ? ' AND g.tempat_id = :t' : '') . ' ORDER BY g.waktu_ms DESC LIMIT 250';
  $q = $pdo->prepare($sql);
  $q->execute($tempat !== '' ? array(':d' => $dari, ':t' => $tempat) : array(':d' => $dari));
  $baris = $q->fetchAll();
  if (!$baris) throw new Exception('Belum ada review dalam ' . $hari . ' hari terakhir untuk dianalisa. Sinkronkan dulu, atau pilih rentang yang lebih panjang.');
  /* Id pendek (r1, r2, …) untuk AI: hemat token, dan id yang dikarang AI
     bisa dikenali lalu dibuang. */
  $peta = array(); $data = array();
  foreach ($baris as $i => $b) {
    $k = 'r' . ($i + 1); $peta[$k] = $b['id'];
    $data[] = array('id' => $k, 'bintang' => (int)$b['rating'], 'tanggal' => $b['waktu_ms'] ? gmdate('Y-m-d', (int)($b['waktu_ms'] / 1000) + 7 * 3600) : '',
      'tempat' => (string)$b['tnama'], 'teks' => cg_potong((string)$b['teks'], 700), 'sudahDibalas' => $b['balasan'] !== null && $b['balasan'] !== '',
      'sudahDitangani' => (int)$b['ditangani'] === 1);
  }
  $profil = cg_set_baca($pdo, 'profil', CG_PROFIL_BAWAAN);
  $system = 'Kamu manajer pengalaman tamu (guest experience) untuk bisnis F&B di Indonesia. Jawab dalam Bahasa Indonesia. '
    . 'Analisa HANYA dari review yang diberikan; jangan mengarang review, angka, atau kejadian. Setiap temuan wajib menyebut id review buktinya. '
    . 'Balas HANYA dengan satu objek JSON, tanpa teks lain.' . gr_aturan_nomor();
  $prompt = "Profil bisnis: $profil\nReview Google ($hari hari terakhir, terbaru dulu):\n" . json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
    . "\n\nBuat analisa dengan bentuk JSON persis berikut:\n"
    . '{"ringkasan":"3-4 kalimat kondisi umum","sentimen":{"positif":0,"netral":0,"negatif":0},'
    . '"kekuatan":[{"tema":"","penjelasan":"","bukti":["r1"]}],'
    . '"perbaikan":[{"masalah":"","area":"Makanan|Minuman|Pelayanan|Kecepatan|Kebersihan|Harga|Suasana|Fasilitas|Lainnya","jumlah":0,"prioritas":"tinggi|sedang|rendah","saran":"langkah konkret yang bisa dikerjakan tim","bukti":["r2"]}],'
    . '"tangani":[{"review":"r3","urgensi":"segera|tinggi|sedang","alasan":"kenapa perlu ditangani","tindakan":"tindak lanjut internal yang disarankan","usulanBalasan":"draf balasan publik yang sopan, minta maaf bila perlu, tanpa janji yang tidak bisa ditepati, maks 600 huruf"}]}'
    . "\nAturan: sentimen berisi JUMLAH review. 3-6 kekuatan, 3-8 perbaikan diurut prioritas. 'tangani' berisi review yang mengeluh/kecewa dan BELUM dibalas atau BELUM ditangani, "
    . "diurut paling mendesak (bintang rendah, keluhan berat seperti keracunan/kebersihan/perlakuan kasar/uang, review terbaru), maksimal 15. Jangan masukkan review yang sudah dibalas DAN sudah ditangani.";
  $r = cg_ai_tanya($pdo, $system, $prompt, 9000);
  /* Sambungan BARU sesudah menunggu AI — lihat db(). */
  $pdo = db(true);
  $h = $r['hasil'];
  $bersihBukti = function($arr) use ($peta) {
    $o = array();
    if (is_array($arr)) foreach ($arr as $x) if (isset($peta[(string)$x])) $o[] = $peta[(string)$x];
    return array_values(array_unique($o));
  };
  $out = array('ringkasan' => isset($h['ringkasan']) ? cg_potong($h['ringkasan'], 1500) : '',
    'sentimen' => isset($h['sentimen']) && is_array($h['sentimen']) ? $h['sentimen'] : null,
    'kekuatan' => array(), 'perbaikan' => array(), 'tangani' => array());
  foreach ((isset($h['kekuatan']) && is_array($h['kekuatan']) ? $h['kekuatan'] : array()) as $x) {
    if (!is_array($x)) continue;
    $out['kekuatan'][] = array('tema' => cg_potong(isset($x['tema']) ? $x['tema'] : '', 200), 'penjelasan' => cg_potong(isset($x['penjelasan']) ? $x['penjelasan'] : '', 600),
      'bukti' => $bersihBukti(isset($x['bukti']) ? $x['bukti'] : array()));
  }
  foreach ((isset($h['perbaikan']) && is_array($h['perbaikan']) ? $h['perbaikan'] : array()) as $x) {
    if (!is_array($x)) continue;
    $out['perbaikan'][] = array('masalah' => cg_potong(isset($x['masalah']) ? $x['masalah'] : '', 250), 'area' => cg_potong(isset($x['area']) ? $x['area'] : '', 40),
      'jumlah' => (int)(isset($x['jumlah']) ? $x['jumlah'] : 0), 'prioritas' => in_array(isset($x['prioritas']) ? $x['prioritas'] : '', array('tinggi', 'sedang', 'rendah'), true) ? $x['prioritas'] : 'sedang',
      'saran' => cg_potong(isset($x['saran']) ? $x['saran'] : '', 800), 'bukti' => $bersihBukti(isset($x['bukti']) ? $x['bukti'] : array()));
  }
  /* Review "tangani" yang id-nya dikarang DIBUANG — usulan balasan untuk
     review yang tidak ada tidak bisa dipakai siapa pun. */
  foreach ((isset($h['tangani']) && is_array($h['tangani']) ? $h['tangani'] : array()) as $x) {
    if (!is_array($x) || !isset($x['review'], $peta[(string)$x['review']])) continue;
    $out['tangani'][] = array('id' => $peta[(string)$x['review']],
      'urgensi' => in_array(isset($x['urgensi']) ? $x['urgensi'] : '', array('segera', 'tinggi', 'sedang'), true) ? $x['urgensi'] : 'sedang',
      'alasan' => cg_potong(isset($x['alasan']) ? $x['alasan'] : '', 500), 'tindakan' => cg_potong(isset($x['tindakan']) ? $x['tindakan'] : '', 600),
      'usulanBalasan' => gr_nomor_resmi(cg_potong(isset($x['usulanBalasan']) ? $x['usulanBalasan'] : '', 1200)));
  }
  $out['meta'] = array('at' => cg_now_ms(), 'oleh' => $nama, 'model' => $r['model'], 'hari' => $hari, 'jumlah' => count($baris), 'tempat' => $tempat);
  cg_set_tulis($pdo, 'gr_ai', json_encode($out, JSON_UNESCAPED_UNICODE));
  return $out;
}

/* Draf balasan untuk SATU review (tombol "Buat draf AI" di kotak balas).
   Tidak tersimpan; yang mengirim tetap orang. */
function gr_ai_draf($pdo, $d) {
  gr_pastikan($pdo);
  $r = gr_review_by_id($pdo, isset($d['id']) ? $d['id'] : '');
  $profil = cg_set_baca($pdo, 'profil', CG_PROFIL_BAWAAN);
  $system = 'Kamu menulis balasan review Google atas nama bisnis F&B di Indonesia. Bahasa mengikuti bahasa review (default Indonesia), sopan, hangat, personal, '
    . 'tidak defensif, tidak menjanjikan kompensasi yang tidak disebut, maksimal 600 huruf. Balas HANYA dengan JSON {"balasan":"..."}.' . gr_aturan_nomor();
  $prompt = "Profil bisnis: $profil\nNama tamu: " . $r['penulis'] . "\nBintang: " . (int)$r['rating'] . "\nReview: " . cg_potong((string)$r['teks'], 2000)
    . (isset($d['arahan']) && trim($d['arahan']) !== '' ? "\nArahan dari tim: " . cg_potong($d['arahan'], 500) : '');
  $x = cg_ai_tanya($pdo, $system, $prompt, 1500);
  return array('balasan' => gr_nomor_resmi(cg_potong(isset($x['hasil']['balasan']) ? $x['hasil']['balasan'] : '', GR_MAKS_BALAS)));
}

function gr_putus($pdo, $nama) {
  gr_pastikan($pdo);
  /* Token dikosongkan; review & tempat yang sudah ditarik TETAP tersimpan. */
  $pdo->prepare("UPDATE cg_akun SET access_token = '', refresh_token = '', token_exp = 0, refresh_exp = 0, oleh = :o, at = :a WHERE platform = 'google'")
    ->execute(array(':o' => $nama, ':a' => cg_now_ms()));
  return array('ok' => true);
}
