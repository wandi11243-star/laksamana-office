<?php
/************************************************************************
 * CAMPAIGN — alamat balik OAuth Instagram (login bisnis Instagram)
 * ---------------------------------------------------------------------
 * Instagram mengarahkan peramban ke sini sesudah orangnya menekan "Izinkan":
 *   GET campaign-instagram.php?code=...&state=...
 * Kodenya ditukar jadi token (server-ke-server, App Secret tidak pernah
 * menyentuh peramban), postingannya ditarik sekali, lalu orangnya dikembalikan
 * ke panel Konten Analytics dengan keterangan berhasil/gagal.
 *
 * Alamat ini WAJIB terdaftar persis di app Meta → Instagram → Pengaturan
 * login bisnis → URI pengalihan OAuth, untuk dev DAN produksi.
 *
 * Tidak berpagar sesi Office: penjaganya `state` sekali pakai yang dibuat
 * cg_ig_mulai().
 ************************************************************************/

require __DIR__ . '/lib_konten_mysql.php';
require __DIR__ . '/lib_campaign.php';

function cg_ig_kembali($status, $pesan) {
  header('Location: ' . cg_halaman_url() . '?instagram=' . $status . '&pesan=' . rawurlencode($pesan) . '#insight');
  exit;
}

try {
  if (isset($_GET['error'])) {
    cg_ig_kembali('gagal', 'Instagram membatalkan: ' . (isset($_GET['error_description']) ? $_GET['error_description'] : $_GET['error']));
  }
  $code = isset($_GET['code']) ? (string)$_GET['code'] : '';
  $state = isset($_GET['state']) ? (string)$_GET['state'] : '';
  if ($code === '' || $state === '') cg_ig_kembali('gagal', 'Jawaban Instagram tidak lengkap.');
  $r = cg_ig_callback(db(), $code, $state);
  cg_ig_kembali('ok', 'Akun Instagram terhubung, ' . $r['jumlah'] . ' postingan ditarik.');
} catch (Throwable $e) {
  cg_ig_kembali('gagal', $e->getMessage());
}
