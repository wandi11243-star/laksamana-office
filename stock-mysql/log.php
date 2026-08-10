<?php
/* STOCK — endpoint LOG AKTIVITAS (dipakai ordering & purchasing).
 *
 * GET  log.php[?dari=YYYY-MM-DD&ke=YYYY-MM-DD][&modul=ordering|purchasing]
 *              [&q=kata][&limit=300]
 *      -> [ {id, waktu, tanggal, modul, aksi, aktor, tim, ringkas, data}, ... ]
 *      Urut terbaru dulu, selalu dibatasi (bawaan 300, maksimum 2000).
 *
 * POST {action:'catat', entri:[{modul, aksi, aktor, tim, ringkas, data}, ...]}
 *      Beberapa baris sekaligus supaya satu tindakan atas 10 barang tidak
 *      jadi 10 permintaan. `waktu` DIISI SERVER — jam perangkat kru sering
 *      meleset, dan log yang urutannya kacau tidak menjawab apa pun.
 *
 * Tabelnya dibuat sendiri saat dipakai; tidak ada langkah migrasi manual.
 * Lihat catatan panjang di lib_stock_log.php.
 */
require __DIR__ . '/_boot.php';
require __DIR__ . '/lib_stock_log.php';

try {
  if ($metode === 'GET') {
    pur_cek_token();
    pur_json(pur_log_ambil(pur_pdo(),
      trim((string)($_GET['dari']  ?? '')),
      trim((string)($_GET['ke']    ?? '')),
      trim((string)($_GET['modul'] ?? '')),
      trim((string)($_GET['q']     ?? '')),
      (int)($_GET['limit'] ?? 300)));
  }

  if ($metode === 'POST') {
    $b = pur_body();
    if (!$b) pur_json(['status' => 'error', 'message' => 'body bukan JSON'], 400);
    pur_cek_token($b);
    $a = $b->action ?? '';
    if ($a === 'catat') pur_json(pur_log_catat(pur_pdo(), $b->entri ?? []));
    pur_json(['status' => 'error', 'message' => 'action tidak dikenal: ' . $a], 400);
  }
  pur_json(['status' => 'error', 'message' => 'metode tidak didukung'], 405);
} catch (Throwable $e) {
  error_log('[stock/log] ' . $e->getMessage());
  pur_json(['status' => 'error', 'message' => 'kesalahan server'], 500);
}
