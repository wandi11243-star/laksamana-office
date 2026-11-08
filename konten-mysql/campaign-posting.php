<?php
/************************************************************************
 * CAMPAIGN — pemicu POSTING OTOMATIS Instagram dari penjadwal luar
 * ---------------------------------------------------------------------
 *   GET campaign-posting.php?kunci=<CG_POSTING_KUNCI>
 *
 * Hosting ini tidak punya cron yang bisa diandalkan, jadi posting otomatis
 * juga dipicu halaman Konten Analytics yang terbuka. Supaya jadwal tetap
 * jalan walau tidak ada yang membuka halaman, alamat ini boleh dipanggil
 * penjadwal luar (cron-job.org, VPS) tiap 5 menit.
 *
 * Penjaganya CG_POSTING_KUNCI di config.php (minimal 24 karakter).
 * KOSONG = TERTUTUP — alamat ini menulis ke akun Instagram perusahaan.
 ************************************************************************/

require __DIR__ . '/lib_konten_mysql.php';
require __DIR__ . '/lib_campaign.php';

header('Content-Type: application/json; charset=utf-8');

$kunci = defined('CG_POSTING_KUNCI') ? (string)CG_POSTING_KUNCI : '';
$kirim = isset($_GET['kunci']) ? (string)$_GET['kunci'] : '';
if (strlen($kunci) < 24 || !hash_equals($kunci, $kirim)) {
  http_response_code(403);
  echo json_encode(array('ok' => false, 'error' => 'kunci salah atau belum disetel'));
  exit;
}
try {
  $r = cg_ig_posting_jatuh_tempo(db(), '(otomatis) penjadwal');
  echo json_encode(array('ok' => true, 'data' => $r), JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
  echo json_encode(array('ok' => false, 'error' => $e->getMessage()), JSON_UNESCAPED_UNICODE);
}
