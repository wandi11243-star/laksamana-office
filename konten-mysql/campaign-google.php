<?php
/************************************************************************
 * CAMPAIGN — alamat balik OAuth Google Business Profile (Google Review)
 * ---------------------------------------------------------------------
 * Google mengarahkan peramban ke sini sesudah pemilik/manager profil bisnis
 * menekan "Izinkan":  GET campaign-google.php?code=...&state=...
 * Kodenya ditukar jadi token server-ke-server (Client secret tidak pernah
 * menyentuh peramban), daftar lokasi & review ditarik sekali, lalu orangnya
 * dikembalikan ke menu Google Review.
 *
 * Alamat ini WAJIB terdaftar persis di Google Cloud Console → Credentials →
 * OAuth client → Authorized redirect URIs, untuk dev DAN produksi.
 *
 * Tidak berpagar sesi Office: penjaganya `state` sekali pakai dari gr_mulai().
 ************************************************************************/

require __DIR__ . '/lib_konten_mysql.php';
require __DIR__ . '/lib_campaign.php';

function gr_kembali($status, $pesan) {
  header('Location: ' . cg_halaman_url() . '?google=' . $status . '&pesan=' . rawurlencode($pesan) . '#greview');
  exit;
}

try {
  if (isset($_GET['error'])) gr_kembali('gagal', 'Google membatalkan: ' . $_GET['error']);
  $code = isset($_GET['code']) ? (string)$_GET['code'] : '';
  $state = isset($_GET['state']) ? (string)$_GET['state'] : '';
  if ($code === '' || $state === '') gr_kembali('gagal', 'Jawaban Google tidak lengkap.');
  $r = gr_callback(db(), $code, $state);
  gr_kembali('ok', 'Google Business Profile terhubung, ' . $r['jumlah'] . ' review ditarik.'
    . ($r['galat'] ? ' Sebagian gagal: ' . implode(' | ', $r['galat']) : ''));
} catch (Throwable $e) {
  gr_kembali('gagal', $e->getMessage());
}
