<?php
/************************************************************************
 * PERANTARA API POS ESB (20 Oktober 2026)
 * ---------------------------------------------------------------------
 * Permintaan user: data penjualan modul Analytics ditarik langsung dari
 * API POS ESB, bukan lewat unggah Excel.
 *
 * KENAPA LEWAT SERVER, BUKAN DIPANGGIL PERAMBAN LANGSUNG
 *   Kunci ESB membuka SELURUH penjualan perusahaan. Ditulis di HTML modul
 *   Analytics, siapa pun yang menekan View Source bisa membacanya. Di sini
 *   ia tinggal di config.php (sudah di-.gitignore), dan pintunya berpagar
 *   sesi Office + kunci modul `analytics`.
 *
 * KENAPA SATU HALAMAN PER PERMINTAAN
 *   ESB memecah datanya per halaman (~20 bill), dan September 2026 berisi
 *   270-an halaman. Ditarik seluruhnya dalam satu proses PHP, hosting
 *   memotongnya di tengah (max_execution_time) — dan yang tersisa data
 *   separuh bulan yang kelihatan seperti sebulan penuh. Jadi perulangannya
 *   dikerjakan peramban, satu halaman per panggilan ke sini, dan berhentinya
 *   di halaman berapa selalu terlihat.
 *
 * TIDAK MENULIS APA PUN KE DATABASE. Yang dipulangkan bill mentah; diringkas
 * di peramban dengan pengurai yang SAMA dengan unggahan Excel, lalu disimpan
 * lewat analyticsSave seperti biasa. Pengurai kedua di PHP berarti berkas
 * kembar LINTAS BAHASA — bentuk yang paling sulit dicocokkan.
 *
 * KONFIGURASI (config.php):
 *   define('ESB_TOKEN', '...');   // WAJIB. Boleh dengan atau tanpa "Bearer ".
 *   define('ESB_URL', '...');     // opsional, bawaannya alamat di bawah.
 *
 * Bentuk kuncinya dibuktikan, bukan ditebak: ESB tanpa token menjawab
 * 401 + `www-authenticate: Bearer realm="api"`.
 ************************************************************************/

function esb_url_dasar() {
  return (defined('ESB_URL') && ESB_URL !== '')
    ? ESB_URL : 'https://core-api.esb.co.id/corev1/sales/sales-information';
}

function esb_tanggal_sah($t) {
  if (!is_string($t) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $t, $m)) return false;
  return checkdate((int)$m[2], (int)$m[3], (int)$m[1]);
}

/* Jumlah halaman dicari di DUA tempat. Contoh balasan dari user berupa
   daftar bill TELANJANG — tanda khas API berbasis Yii2, yang menaruh paginasi
   di HEADER (X-Pagination-Page-Count dkk.). Kalau suatu hari ESB
   membungkusnya jadi objek, kunci-kunci umum di badannya ikut diperiksa.
   Yang tidak ketemu dipulangkan null — peramban lalu berhenti di halaman
   kosong pertama, bukan menebak angkanya. */
function esb_cari_angka($arr, $kunci) {
  if (!is_array($arr)) return null;
  foreach ($kunci as $k) {
    if (isset($arr[$k]) && is_numeric($arr[$k])) return (int)$arr[$k];
  }
  return null;
}

function esb_halaman($dari, $sampai, $page) {
  if (!defined('ESB_TOKEN') || trim((string)ESB_TOKEN) === '')
    return array('ok' => false, 'error' => 'Token ESB belum dipasang. Isi define(\'ESB_TOKEN\', \'...\') '
      . 'di config.php folder kompas-api-mysql di server ini.');
  if (!esb_tanggal_sah($dari) || !esb_tanggal_sah($sampai))
    return array('ok' => false, 'error' => 'Tanggal tidak sah (harus YYYY-MM-DD).');
  if ($dari > $sampai) return array('ok' => false, 'error' => 'Tanggal awal sesudah tanggal akhir.');
  $page = (int)$page;
  if ($page < 1 || $page > 20000) return array('ok' => false, 'error' => 'Nomor halaman tidak sah.');

  $token = trim((string)ESB_TOKEN);
  if (stripos($token, 'bearer ') === 0) $token = trim(substr($token, 7));

  $url = esb_url_dasar() . '?' . http_build_query(array(
    'salesDateFrom' => $dari, 'salesDateTo' => $sampai, 'page' => $page));
  $hdrKirim = array('Authorization: Bearer ' . $token, 'Accept: application/json',
                    'Content-Type: application/json');

  $hdr = array(); $kode = 0; $jawab = null;
  if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, array(
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_TIMEOUT        => 45,
      CURLOPT_CONNECTTIMEOUT => 15,
      CURLOPT_FOLLOWLOCATION => true,
      CURLOPT_HTTPHEADER     => $hdrKirim,
      CURLOPT_HEADERFUNCTION => function ($c, $baris) use (&$hdr) {
        $p = strpos($baris, ':');
        if ($p !== false) $hdr[strtolower(trim(substr($baris, 0, $p)))] = trim(substr($baris, $p + 1));
        return strlen($baris);
      },
    ));
    $jawab = curl_exec($ch);
    $kode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $galat = curl_error($ch);
    curl_close($ch);
    if ($jawab === false) return array('ok' => false, 'error' => 'ESB tidak terhubung: ' . $galat);
  } else {
    $ctx = stream_context_create(array('http' => array(
      'method' => 'GET', 'timeout' => 45, 'ignore_errors' => true,
      'header' => implode("\r\n", $hdrKirim))));
    $jawab = @file_get_contents($url, false, $ctx);
    if (isset($http_response_header) && is_array($http_response_header)) {
      foreach ($http_response_header as $baris) {
        if (preg_match('#^HTTP/\S+\s+(\d{3})#', $baris, $m)) { $kode = (int)$m[1]; continue; }
        $p = strpos($baris, ':');
        if ($p !== false) $hdr[strtolower(trim(substr($baris, 0, $p)))] = trim(substr($baris, $p + 1));
      }
    }
    if (!is_string($jawab)) return array('ok' => false, 'error' => 'ESB tidak terhubung.');
  }

  $d = json_decode($jawab, true);
  /* 401 DIBEDAKAN dari galat lain: jalan keluarnya mengganti token di
     config.php, bukan mencoba ulang. */
  if ($kode === 401 || $kode === 403)
    return array('ok' => false, 'error' => 'Token ESB ditolak (HTTP ' . $kode . '). '
      . 'Token di config.php salah atau sudah kedaluwarsa — ganti dengan yang berlaku di Postman.');
  if ($kode >= 400 || !is_array($d)) {
    $pesan = (is_array($d) && isset($d['message'])) ? (string)$d['message'] : substr((string)$jawab, 0, 200);
    return array('ok' => false, 'error' => 'ESB menjawab HTTP ' . $kode . ': ' . $pesan);
  }

  $bills = null; $meta = array();
  if (array_keys($d) === range(0, count($d) - 1)) $bills = $d;            /* daftar telanjang */
  else {
    foreach (array('data', 'items', 'result', 'results') as $k)
      if (isset($d[$k]) && is_array($d[$k])) { $bills = $d[$k]; break; }
    $meta = isset($d['_meta']) && is_array($d['_meta']) ? $d['_meta']
          : (isset($d['meta']) && is_array($d['meta']) ? $d['meta'] : $d);
  }
  if (!is_array($bills)) $bills = array();
  if (count($d) === 0) $bills = array();

  $hCount = isset($hdr['x-pagination-page-count']) ? (int)$hdr['x-pagination-page-count'] : null;
  $hTotal = isset($hdr['x-pagination-total-count']) ? (int)$hdr['x-pagination-total-count'] : null;
  $hPer   = isset($hdr['x-pagination-per-page'])    ? (int)$hdr['x-pagination-per-page']    : null;

  return array('ok' => true, 'data' => array(
    'bills'     => $bills,
    'page'      => $page,
    'pageCount' => $hCount !== null ? $hCount
                 : esb_cari_angka($meta, array('pageCount', 'page_count', 'totalPage', 'totalPages', 'total_page', 'lastPage', 'last_page')),
    'totalCount'=> $hTotal !== null ? $hTotal
                 : esb_cari_angka($meta, array('totalCount', 'total_count', 'total', 'totalData', 'total_data')),
    'perPage'   => $hPer !== null ? $hPer
                 : esb_cari_angka($meta, array('perPage', 'per_page', 'pageSize', 'limit')),
  ));
}
