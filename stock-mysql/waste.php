<?php
/* STOCK — endpoint WASTE PRODUK.
 *
 * GET  waste.php[?dari=YYYY-MM-DD&ke=YYYY-MM-DD]
 *      -> [ {id, tanggal, item, qty, unit, sebab, pic, tim, waktu,
 *            fotoNama, adaFoto, catatan}, ... ]
 *      CATATAN: `foto` TIDAK ikut di sini. Lihat pur_waste_ambil —
 *      menyertakannya membuat daftar sebulan jadi puluhan megabita.
 *
 * GET  waste.php?action=foto&id=WST-...
 *      -> {status:'success', foto:'data:image/...', fotoNama}
 *
 * POST {action:'simpan', id?, tanggal, item, qty, unit, sebab, pic, tim,
 *       catatan, foto?, fotoNama?}
 *      `foto` TIDAK dikirim = pertahankan yang lama;
 *      dikirim string kosong = hapus fotonya.
 * POST {action:'hapus', id}
 */
require __DIR__ . '/_boot.php';
require __DIR__ . '/lib_stock_catat.php';

try {
  if ($metode === 'GET') {
    pur_cek_token();
    // Foto dilayani lewat aksi terpisah supaya daftar tetap ringan.
    if ($aksiUrl === 'foto') pur_json(pur_waste_foto(pur_pdo(), trim((string)($_GET['id'] ?? ''))));
    pur_json(pur_waste_ambil(pur_pdo(), pur_batas_tim()));
  }

  if ($metode === 'POST') {
    $b = pur_body();
    if (!$b) pur_json(['status' => 'error', 'message' => 'body bukan JSON'], 400);
    pur_cek_token($b);
    $pdo = pur_pdo();
    $a = $b->action ?? '';
    if ($a === 'simpan') pur_json(pur_waste_simpan($pdo, $b));
    if ($a === 'hapus')  pur_json(pur_waste_hapus($pdo, $b->id ?? ''));
    pur_json(['status' => 'error', 'message' => 'action tidak dikenal: ' . $a], 400);
  }

  pur_json(['status' => 'error', 'message' => 'metode tidak didukung'], 405);
} catch (Throwable $e) {
  error_log('[stock/waste] ' . $e->getMessage());
  pur_json(['status' => 'error', 'message' => 'kesalahan server'], 500);
}
