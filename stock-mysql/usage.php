<?php
/* STOCK — endpoint PEMAKAIAN BAHAN UNTUK EVENT.
 *
 * GET  usage.php[?dari=YYYY-MM-DD&ke=YYYY-MM-DD]
 *      -> [ {id, tanggal, jenis, namaEvent, status, pic, tim, waktu,
 *            catatan, items:[{item,qty,unit,note}]}, ... ]
 *
 * POST {action:'simpan', id?, tanggal, jenis, namaEvent, status, pic, tim,
 *       catatan, items:[...]}      id kosong = catatan baru
 * POST {action:'status', id, status:'Rencana'|'Selesai'}
 * POST {action:'hapus',  id}
 *
 * Path sendiri (bukan api.php?src=usage) — sama alasannya dengan endpoint
 * lain di folder ini: frontend menempel `?t=<timestamp>` ke URL, dan tanda
 * tanya dobel merusak parameternya.
 */
require __DIR__ . '/_boot.php';
require __DIR__ . '/lib_stock_catat.php';

try {
  if ($metode === 'GET') {
    pur_cek_token();
    pur_json(pur_usage_ambil(pur_pdo(), pur_batas_tim()));
  }

  if ($metode === 'POST') {
    $b = pur_body();
    if (!$b) pur_json(['status' => 'error', 'message' => 'body bukan JSON'], 400);
    pur_cek_token($b);
    $pdo = pur_pdo();
    $a = $b->action ?? '';
    if ($a === 'simpan') pur_json(pur_usage_simpan($pdo, $b));
    if ($a === 'status') pur_json(pur_usage_status($pdo, $b->id ?? '', $b->status ?? ''));
    if ($a === 'hapus')  pur_json(pur_usage_hapus($pdo, $b->id ?? ''));
    pur_json(['status' => 'error', 'message' => 'action tidak dikenal: ' . $a], 400);
  }

  pur_json(['status' => 'error', 'message' => 'metode tidak didukung'], 405);
} catch (Throwable $e) {
  error_log('[stock/usage] ' . $e->getMessage());
  pur_json(['status' => 'error', 'message' => 'kesalahan server'], 500);
}
