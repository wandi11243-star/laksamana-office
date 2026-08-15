<?php
/* STOCK — endpoint ITEMS (produk).
 * GET  -> {products: {"Nama Produk": {utama, cadangan[], satuan[]}}}  (peta, berkunci NAMA)
 * POST {action:'addProduct', productName, primaryVendor, backupVendors, oldProductName,
 *       units:[]  <- satuan sah bahan ini; TIDAK dikirim = pertahankan yang lama}
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
      // `units` sengaja dilewatkan APA ADANYA (null bila tidak dikirim), supaya
      // pur_product_simpan bisa membedakan "dikosongkan" dari "tidak disertakan".
      // `units`, `kategori`, `area` dilewatkan null bila tidak dikirim, supaya
      // pur_product_simpan bisa membedakan "dikosongkan" dari "tidak disertakan".
      // sumber/packIsi/packSatuan (Central Kitchen) ikut aturan
      // preserve-if-null yang sama: tidak dikirim = pertahankan yang lama.
      pur_json(pur_product_simpan($pdo, $b->productName ?? '', $b->primaryVendor ?? '',
                                  $b->backupVendors ?? [], $b->oldProductName ?? '',
                                  $b->units ?? null, $b->kategori ?? null, $b->area ?? null,
                                  $b->caraBeli ?? null, $b->sumber ?? null,
                                  $b->packIsi ?? null, $b->packSatuan ?? null,
                                  $b->diOutlet ?? null,
                                  // satuanDasar/isi: ukuran satuan per barang,
                                  // ikut aturan preserve-if-null yang sama.
                                  $b->satuanDasar ?? null, $b->isi ?? null));
    }
    if ($a === 'deleteProduct') pur_json(pur_product_hapus($pdo, $b->productName ?? ''));
    pur_json(['status' => 'error', 'message' => 'action tidak dikenal: ' . $a], 400);
  }
  pur_json(['status' => 'error', 'message' => 'metode tidak didukung'], 405);
} catch (Throwable $e) {
  error_log('[stock/items] ' . $e->getMessage());
  pur_json(['status' => 'error', 'message' => 'kesalahan server'], 500);
}
