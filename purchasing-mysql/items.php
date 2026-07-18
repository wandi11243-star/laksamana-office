<?php
/* PURCHASING — endpoint ITEMS (produk).
 * GET  -> {products: {"Nama Produk": {utama, cadangan[]}}}  (peta, berkunci NAMA)
 * POST {action:'addProduct', productName, primaryVendor, backupVendors, oldProductName}
 * POST {action:'deleteProduct', productName}
 */
require __DIR__ . '/_boot.php';

try {
  if ($metode === 'GET') {
    pur_cek_token();
    // Dibungkus {products:...} karena frontend membaca `itemsRes.products`.
    pur_json(['products' => pur_products_ambil(pur_pdo())]);
  }

  if ($metode === 'POST') {
    $b = pur_body();
    if (!$b) pur_json(['status' => 'error', 'message' => 'body bukan JSON'], 400);
    pur_cek_token($b);
    $pdo = pur_pdo();
    $a = $b->action ?? '';
    if ($a === 'addProduct') {
      pur_json(pur_product_simpan($pdo, $b->productName ?? '', $b->primaryVendor ?? '',
                                  $b->backupVendors ?? [], $b->oldProductName ?? ''));
    }
    if ($a === 'deleteProduct') pur_json(pur_product_hapus($pdo, $b->productName ?? ''));
    pur_json(['status' => 'error', 'message' => 'action tidak dikenal: ' . $a], 400);
  }
  pur_json(['status' => 'error', 'message' => 'metode tidak didukung'], 405);
} catch (Throwable $e) {
  error_log('[purchasing/items] ' . $e->getMessage());
  pur_json(['status' => 'error', 'message' => 'kesalahan server'], 500);
}
