<?php
/************************************************************************
 * IDENTITAS PEMANGGIL — siapa yang sedang memanggil API ini
 * ---------------------------------------------------------------------
 * BERKAS KEMBAR. Salinan yang sama persis ada di jadwal-mysql/lib_sesi.php.
 * Kalau salah satunya diperbaiki, yang satunya HARUS ikut — keduanya menjaga
 * pintu yang sama untuk dua modul yang dipakai orang yang sama.
 *
 * MASALAH YANG DIPECAHKAN BERKAS INI
 * ---------------------------------------------------------------------
 * Sebelum ini, seluruh hak akses kedua modul hidup HANYA di frontend:
 * isHR(), bolehUbah(divisi), HALAMAN_HR. Yang dijaga cuma layar. Backend-nya
 * tidak pernah menanyakan siapa pemanggilnya sama sekali — parameter `by`
 * yang dikirim frontend cuma NAMA untuk dicatat, bukan bukti, dan siapa pun
 * bisa mengetiknya.
 *
 * Akibatnya bukan teori:
 *   - satu GET ?action=getAll memulangkan nama + no HP SELURUH talent pool;
 *   - satu POST putusAjuan menyetujui shift siapa saja, dan shift itu
 *     langsung berdiri di kalender Jadwal Shift lalu ikut terhitung sebagai
 *     uang yang harus ditransfer di halaman Pembayaran;
 *   - Access-Control-Allow-Origin: * berarti ini bukan sekadar "kalau tahu
 *     URL-nya" — halaman web mana pun bisa membacanya dari peramban
 *     pengunjung, tanpa cookie, tanpa izin apa pun.
 *
 * CARANYA — DISALIN DARI stock-mysql/lib_stock_catat.php (pur_whoami), yang
 * sudah jalan di produksi. Peramban mengirim TOKEN SESI Office, dan kita
 * menanyakannya balik ke API akun (action=whoami) SERVER-KE-SERVER. Peramban
 * tidak pernah memegang jawabannya, jadi ia tidak bisa mengaku jadi orang
 * lain — itu bedanya dengan sekadar mengirim nama.
 *
 * TIDAK PERLU MENYENTUH config.php DI cPANEL. Alamat API akun diturunkan
 * sendiri dari host yang sedang melayani, jadi dev bertanya ke akun dev dan
 * produksi ke akun produksi, tanpa bisa tertukar. ACCOUNT_API_URL tetap
 * dihormati kalau suatu saat API akun pindah domain.
 ************************************************************************/

/* SERVER_NAME didahulukan, BUKAN HTTP_HOST: HTTP_HOST datang dari permintaan
   dan bisa dipalsukan, sehingga verifikasi bisa dialihkan ke server lain yang
   selalu menjawab "ok" — dan penjaga yang bisa dialihkan bukan penjaga. */
function sesi_akun_url() {
  if (defined('ACCOUNT_API_URL') && ACCOUNT_API_URL !== '') return ACCOUNT_API_URL;
  $host = isset($_SERVER['SERVER_NAME']) ? $_SERVER['SERVER_NAME']
        : (isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '');
  if ($host === '') return '';
  $skema = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
  return $skema . '://' . $host . '/account-api-mysql/api.php';
}

/* POST JSON server-ke-server. curl kalau ada, allow_url_fopen sebagai
   cadangan — sebagian hosting mematikan salah satunya. */
function sesi_post_json($url, $data) {
  $payload = json_encode($data);
  $jawab = null;
  if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, array(
      CURLOPT_POST           => true,
      CURLOPT_POSTFIELDS     => $payload,
      CURLOPT_HTTPHEADER     => array('Content-Type: text/plain;charset=utf-8'),
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_TIMEOUT        => 8,
      CURLOPT_FOLLOWLOCATION => true,
    ));
    $jawab = curl_exec($ch);
    curl_close($ch);
  } else {
    $ctx = stream_context_create(array('http' => array(
      'method'  => 'POST',
      'header'  => "Content-Type: text/plain;charset=utf-8\r\n",
      'content' => $payload,
      'timeout' => 8,
    )));
    $jawab = @file_get_contents($url, false, $ctx);
  }
  if (!is_string($jawab) || $jawab === '') return null;
  $d = json_decode($jawab, true);
  return is_array($d) ? $d : null;
}

/* Token ini milik siapa. null = tidak bisa dipastikan (token salah,
   kedaluwarsa, akun dinonaktifkan, atau API akun tak terjangkau).

   Di-cache selama satu permintaan: satu endpoint bisa menanyakannya beberapa
   kali, dan tiap tanya berarti satu HTTP penuh ke API akun. */
function sesi_whoami($token) {
  static $cache = array();
  $token = trim((string)$token);
  if ($token === '') return null;
  if (array_key_exists($token, $cache)) return $cache[$token];
  $url = sesi_akun_url();
  if ($url === '') return $cache[$token] = null;
  $d = sesi_post_json($url, array('action' => 'whoami', 'token' => $token));
  if (!is_array($d) || empty($d['ok']) || empty($d['user'])) return $cache[$token] = null;
  return $cache[$token] = $d['user'];
}

/* Token sesi dari query (GET) atau body (POST). Satu tempat saja, supaya tiap
   endpoint tidak menuliskan aturannya sendiri-sendiri lalu ada yang lupa. */
function sesi_token($body = null) {
  if (isset($_GET['sesi']) && $_GET['sesi'] !== '') return (string)$_GET['sesi'];
  if (is_array($body) && isset($body['sesi'])) return (string)$body['sesi'];
  return '';
}

function sesi_user($body = null) { return sesi_whoami(sesi_token($body)); }

/* Punya akses modul ini? '*' berarti seluruh modul (dipegang superadmin). */
function sesi_punya_modul($u, $kunci) {
  if (!$u) return false;
  $m = (isset($u['modules']) && is_array($u['modules'])) ? $u['modules'] : array();
  return in_array('*', $m, true) || in_array($kunci, $m, true);
}
function sesi_admin_modul($u, $kunci) {
  if (!$u) return false;
  $a = (isset($u['adminModules']) && is_array($u['adminModules'])) ? $u['adminModules'] : array();
  return in_array('*', $a, true) || in_array($kunci, $a, true);
}

/* Roster Office (id => {name, keterangan, active}).
   Dipakai modul Jadwal untuk tahu seorang kru ada di divisi mana — modul itu
   sengaja tidak punya daftar pegawai sendiri, jadi satu-satunya sumbernya
   memang Office. Di-cache per permintaan dengan alasan yang sama seperti
   whoami: satu simpanSel bisa memuat puluhan baris. */
function sesi_roster() {
  static $cache = null;
  if ($cache !== null) return $cache;
  $url = sesi_akun_url();
  if ($url === '') return $cache = array();
  $d = sesi_post_json($url, array('action' => 'listDivisiRoster'));
  if (!is_array($d) || empty($d['ok']) || !isset($d['members']) || !is_array($d['members'])) {
    return $cache = array();
  }
  $out = array();
  foreach ($d['members'] as $m) {
    if (!isset($m['id'])) continue;
    $out[(string)$m['id']] = $m;
  }
  return $cache = $out;
}

/* Penolakan yang SELALU berbentuk sama, dengan kode yang bisa dikenali
   frontend. `sesi_tidak_sah` khusus dibedakan dari "tidak berhak": yang
   pertama disembuhkan dengan masuk ulang, yang kedua tidak akan pernah
   sembuh sendiri, dan menyuruh orang login ulang untuk masalah kedua cuma
   membuatnya mencoba tiga kali lalu menyimpulkan modulnya rusak. */
function sesi_tolak_tak_dikenal() {
  throw new Exception('sesi_tidak_sah: Sesi Anda tidak dikenali atau sudah berakhir. Muat ulang halaman (Ctrl+F5), lalu masuk lagi lewat Laksamana Office.');
}
function sesi_tolak_tak_berhak($apa) {
  throw new Exception('tidak_berhak: ' . $apa);
}
/* Token SAH tapi akunnya tidak memegang kunci modul ini — beda dari token
   yang tidak dikenali, dan bedanya penting.

   Kalau keduanya dijawab `sesi_tidak_sah`, orangnya disuruh masuk ulang; ia
   masuk ulang, ditolak lagi, masuk ulang lagi — dan tidak ada satu pun layar
   yang menyebut apa yang sebenarnya kurang. Pesan ini menyebut NAMA CENTANG
   yang persis seperti tertulis di Kelola Akses, bukan nama modulnya: kartunya
   bernama "Roster" dan memuat DUA kunci bersebelahan ("Roster · Jadwal Shift"
   dan "Roster · Daily Worker"), jadi "minta akses Jadwal Shift" tidak cukup
   untuk menunjuk kotak mana yang harus dicentang. */
function sesi_tolak_tanpa_modul($labelCentang) {
  throw new Exception('tanpa_modul: Akun Anda belum diberi akses modul ini. '
    . 'Minta admin mencentang "' . $labelCentang . '" lewat Kelola Akses di Laksamana Office.');
}
