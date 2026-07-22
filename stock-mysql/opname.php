<?php
/* STOCK — endpoint DAILY STOCK OPNAME.
 *
 * GET  opname.php[?dari=YYYY-MM-DD&ke=YYYY-MM-DD]
 *      -> [ {id, tanggal, pic, tim, status, waktu, catatan,
 *            items:[{item,unit,sistem,fisik,note}]}, ... ]
 *      `sistem`/`fisik` bisa null = belum dihitung. Itu BEDA dari 0
 *      (dihitung, hasilnya nol), dan bedanya menentukan saat menilai selisih.
 *      `selisih` tidak disimpan — selalu fisik − sistem, dihitung saat tampil.
 *
 * POST {action:'simpan', id?, tanggal, pic, tim, status:'Draft'|'Selesai',
 *       catatan, items:[...]}      id kosong = opname baru
 * POST {action:'hapus', id}
 */
require __DIR__ . '/_boot.php';
require __DIR__ . '/lib_stock_catat.php';

try {
  if ($metode === 'GET') {
    pur_cek_token();
    pur_json(pur_opname_ambil(pur_pdo()));
  }

  if ($metode === 'POST') {
    $b = pur_body();
    if (!$b) pur_json(['status' => 'error', 'message' => 'body bukan JSON'], 400);
    pur_cek_token($b);
    $pdo = pur_pdo();
    $a = $b->action ?? '';
    if ($a === 'simpan') pur_json(pur_opname_simpan($pdo, $b));
    if ($a === 'hapus')  pur_json(pur_opname_hapus($pdo, $b->id ?? ''));
    pur_json(['status' => 'error', 'message' => 'action tidak dikenal: ' . $a], 400);
  }

  pur_json(['status' => 'error', 'message' => 'metode tidak didukung'], 405);
} catch (Throwable $e) {
  error_log('[stock/opname] ' . $e->getMessage());
  pur_json(['status' => 'error', 'message' => 'kesalahan server'], 500);
}
