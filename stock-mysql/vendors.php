<?php
/* STOCK — endpoint VENDORS.
 * GET  -> {vendors: {"Nama Vendor": {whatsapp}}}   (peta, berkunci NAMA)
 * POST {action:'addVendor', vendorName, vendorPhone, oldVendorName}
 * POST {action:'deleteVendor', vendorName}
 */
require __DIR__ . '/_boot.php';

try {
  if ($metode === 'GET') {
    pur_cek_token();
    // Dibungkus {vendors:...} karena frontend membaca `vendorsRes.vendors`.
    pur_json(['vendors' => pur_vendors_ambil(pur_pdo())]);
  }

  if ($metode === 'POST') {
    $b = pur_body();
    if (!$b) pur_json(['status' => 'error', 'message' => 'body bukan JSON'], 400);
    pur_cek_token($b);
    $pdo = pur_pdo();
    $a = $b->action ?? '';
    if ($a === 'addVendor') {
      pur_json(pur_vendor_simpan($pdo, $b->vendorName ?? '', $b->vendorPhone ?? '', $b->oldVendorName ?? ''));
    }
    if ($a === 'deleteVendor') pur_json(pur_vendor_hapus($pdo, $b->vendorName ?? ''));
    pur_json(['status' => 'error', 'message' => 'action tidak dikenal: ' . $a], 400);
  }
  pur_json(['status' => 'error', 'message' => 'metode tidak didukung'], 405);
} catch (Throwable $e) {
  error_log('[stock/vendors] ' . $e->getMessage());
  pur_json(['status' => 'error', 'message' => 'kesalahan server'], 500);
}
