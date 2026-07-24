<?php
/* STOCK — endpoint SERAH TERIMA BARANG (pengeluaran ke Kitchen/Bar).
 *
 * GET  serah.php[?dari=YYYY-MM-DD&ke=YYYY-MM-DD]
 *      -> [ {id, tanggal, tujuan, penerima, pic, tim, waktu,
 *            fotoNama, adaFoto, catatan, items:[{item,qty,unit}]}, ... ]
 *      `foto` TIDAK ikut di daftar (bisa puluhan MB) — ditarik terpisah.
 *
 * GET  serah.php?action=foto&id=SRH-...
 *      -> {status:'success', foto:'data:image/...', fotoNama}
 *
 * POST {action:'simpan', id?, tanggal, tujuan, penerima, tim, pic, catatan,
 *       items:[{item,qty,unit}], foto?, fotoNama?}
 *      foto WAJIB untuk catatan baru; null saat edit = pertahankan yang lama.
 * POST {action:'hapus', id}
 */
require __DIR__ . '/_boot.php';
require __DIR__ . '/lib_stock_catat.php';

try {
  if ($metode === 'GET') {
    pur_cek_token();
    if ($aksiUrl === 'foto') pur_json(pur_serah_foto(pur_pdo(), trim((string)($_GET['id'] ?? ''))));
    pur_json(pur_serah_ambil(pur_pdo(), pur_batas_tim()));
  }

  if ($metode === 'POST') {
    $b = pur_body();
    if (!$b) pur_json(['status' => 'error', 'message' => 'body bukan JSON'], 400);
    pur_cek_token($b);
    $pdo = pur_pdo();
    $a = $b->action ?? '';
    if ($a === 'simpan') pur_json(pur_serah_simpan($pdo, $b));
    if ($a === 'hapus')  pur_json(pur_serah_hapus($pdo, $b->id ?? ''));
    pur_json(['status' => 'error', 'message' => 'action tidak dikenal: ' . $a], 400);
  }

  pur_json(['status' => 'error', 'message' => 'metode tidak didukung'], 405);
} catch (Throwable $e) {
  error_log('[stock/serah] ' . $e->getMessage());
  pur_json(['status' => 'error', 'message' => 'kesalahan server'], 500);
}
