<?php
/* STOCK — endpoint VENDORS.
 * GET  -> {vendors: {"Nama Vendor": {whatsapp, penerima, bank, norek, …}}}  (peta, berkunci NAMA)
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
      // perluJadwalJemput dilewatkan null bila tidak dikirim — preserve-if-null,
      // sama seperti field opsional di items.php.
      // tutupHari: daftar hari vendor tutup (0 Minggu … 6 Sabtu), aturan
      // preserve-if-null yang sama.
      // penerima/bank/norek: rekening transfer, dipakai lembar pembayaran
      // Brankas. Aturan preserve-if-null yang sama.
      pur_json(pur_vendor_simpan($pdo, $b->vendorName ?? '', $b->vendorPhone ?? '', $b->oldVendorName ?? '',
                                 $b->perluJadwalJemput ?? null, $b->tutupHari ?? null,
                                 $b->penerima ?? null, $b->bank ?? null, $b->norek ?? null));
    }
    // Impor massal dari Excel/CSV. Upsert berdasarkan NAMA; tidak ada yang
    // dihapus. Lihat catatan panjang di pur_vendors_impor.
    if ($a === 'importVendors') pur_json(pur_vendors_impor($pdo, $b->rows ?? null));
    if ($a === 'deleteVendor') pur_json(pur_vendor_hapus($pdo, $b->vendorName ?? ''));
    pur_json(['status' => 'error', 'message' => 'action tidak dikenal: ' . $a], 400);
  }
  pur_json(['status' => 'error', 'message' => 'metode tidak didukung'], 405);
} catch (Throwable $e) {
  error_log('[stock/vendors] ' . $e->getMessage());
  pur_json(['status' => 'error', 'message' => 'kesalahan server'], 500);
}
