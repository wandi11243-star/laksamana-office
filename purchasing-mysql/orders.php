<?php
/* PURCHASING — endpoint ORDERS.
 * GET  -> [ {rowIndex, nomorOrder, timestamp, item, qty, unit, note,
 *            tglDatang, pic, status, kedatangan, catatan}, ... ]
 * POST {action:'batchOrder', orders:[{item,qty,unit,note,tglDatang,pic}]}
 * POST {action:'archive',   rows:[rowIndex] | orderIds:['LKS-...']}
 * POST {action:'unarchive', rowIndex:N     | orderIds:['LKS-...']}
 *
 * Path sendiri (bukan api.php?src=orders) karena frontend menempel
 * `?t=<timestamp>` ke URL ini — tanda tanya dobel akan merusaknya.
 */
require __DIR__ . '/_boot.php';

try {
  if ($metode === 'GET') {
    pur_cek_token();
    if ($aksiUrl === 'stats') pur_json(pur_stats(pur_pdo()));
    pur_json(pur_orders_ambil(pur_pdo()));          // array telanjang, seperti Apps Script
  }

  if ($metode === 'POST') {
    $b = pur_body();
    if (!$b) pur_json(['status' => 'error', 'message' => 'body bukan JSON'], 400);
    pur_cek_token($b);
    $pdo = pur_pdo();
    $a = $b->action ?? '';
    if ($a === 'batchOrder') pur_json(pur_orders_batch($pdo, $b->orders ?? []));
    if ($a === 'import')     pur_json(pur_orders_import($pdo, $b->orders ?? []));  // alat migrasi, idempoten
    if ($a === 'archive')    pur_json(pur_orders_arsip($pdo, $b, 'Arsip'));
    if ($a === 'unarchive')  pur_json(pur_orders_arsip($pdo, $b, 'Aktif'));
    pur_json(['status' => 'error', 'message' => 'action tidak dikenal: ' . $a], 400);
  }
  pur_json(['status' => 'error', 'message' => 'metode tidak didukung'], 405);
} catch (Throwable $e) {
  error_log('[purchasing/orders] ' . $e->getMessage());
  pur_json(['status' => 'error', 'message' => 'kesalahan server'], 500);
}
