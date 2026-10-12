<?php
/************************************************************************
 * CAMPAIGN — alamat balik OAuth TikTok
 * ---------------------------------------------------------------------
 * TikTok mengarahkan peramban ke sini sesudah orangnya menekan "Izinkan":
 *   GET campaign-tiktok.php?code=...&state=...
 * Kita tukar kodenya jadi token (server-ke-server, client secret tidak pernah
 * menyentuh peramban), tarik postingannya sekali, lalu kembalikan orangnya ke
 * halaman Campaign dengan keterangan berhasil/gagal.
 *
 * Alamat ini WAJIB didaftarkan persis di TikTok Developer Portal → Login Kit
 * → Redirect URI, untuk dev DAN produksi. Halaman Pengaturan modul Campaign
 * menuliskan alamat yang harus didaftarkan.
 *
 * Tidak berpagar sesi Office: yang datang ke sini peramban yang dialihkan
 * TikTok, dan penjaganya `state` sekali pakai yang dibuat cg_tiktok_mulai().
 ************************************************************************/

require __DIR__ . '/lib_konten_mysql.php';
require __DIR__ . '/lib_campaign.php';

function cg_kembali($status, $pesan) {
  header('Location: ' . cg_halaman_url() . '?tiktok=' . $status . '&pesan=' . rawurlencode($pesan) . '#insight');
  exit;
}

try {
  if (isset($_GET['error'])) {
    cg_kembali('gagal', 'TikTok membatalkan: ' . (isset($_GET['error_description']) ? $_GET['error_description'] : $_GET['error']));
  }
  $code = isset($_GET['code']) ? (string)$_GET['code'] : '';
  $state = isset($_GET['state']) ? (string)$_GET['state'] : '';
  if ($code === '' || $state === '') cg_kembali('gagal', 'Jawaban TikTok tidak lengkap.');
  $r = cg_tiktok_callback(db(), $code, $state);
  cg_kembali('ok', 'Akun TikTok terhubung, ' . $r['jumlah'] . ' postingan ditarik.');
} catch (Throwable $e) {
  cg_kembali('gagal', $e->getMessage());
}
