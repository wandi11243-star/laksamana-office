<?php
/* STOCK — endpoint GUDANG BAR (lihat lib_stock_gb.php).
 *
 * GET  gudang-bar.php[?dari=YYYY-MM-DD&ke=YYYY-MM-DD]
 *      -> { saldo:[{item, satuan, pilihan, isi, kategori, aktif, masuk, keluar, saldo, terakhir, hilang?}],
 *           mutasi:[{id, tanggal, item, arah, qty, qtyInput, unitInput, satuan, sebab, catatan, pic, waktu,
 *                    batalAt, batalOleh, batalAlasan}] }
 *      `saldo` tidak ikut rentang tanggal — sisa stok itu keadaan sekarang.
 * POST {action:'simpan', arah:'masuk'|'keluar', sebab, tanggal, pic, catatan, items:[{item, qty, unit, catatan?}]}
 * POST {action:'batal', id, alasan, oleh}
 */
require __DIR__ . '/_boot.php';
require __DIR__ . '/lib_stock_gb.php';

try {
  if ($metode === 'GET') {
    pur_cek_token();
    $pdo = pur_pdo();
    gb_pastikan($pdo);
    pur_json(['saldo' => gb_saldo($pdo), 'mutasi' => gb_mutasi($pdo)]);
  }
  if ($metode === 'POST') {
    $b = pur_body();
    if (!$b) pur_json(['status' => 'error', 'message' => 'body bukan JSON'], 400);
    pur_cek_token($b);
    $pdo = pur_pdo();
    gb_pastikan($pdo);
    $a = $b->action ?? '';
    if ($a === 'simpan') pur_json(gb_simpan($pdo, $b));
    if ($a === 'batal')  pur_json(gb_batal($pdo, $b));
    pur_json(['status' => 'error', 'message' => 'action tidak dikenal: ' . $a], 400);
  }
  pur_json(['status' => 'error', 'message' => 'metode tidak didukung'], 405);
} catch (Throwable $e) {
  error_log('[stock/gudang-bar] ' . $e->getMessage());
  pur_json(['status' => 'error', 'message' => 'kesalahan server'], 500);
}
