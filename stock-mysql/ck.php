<?php
/* STOCK — endpoint CENTRAL KITCHEN (barang produksi dapur + stoknya).
 *
 * GET  ck.php[?dari=YYYY-MM-DD&ke=YYYY-MM-DD]
 *      -> { saldo:[{item, packIsi, packSatuan, kategori, masuk, keluar,
 *                   saldo, terakhir, hilang?}, ...],
 *           mutasi:[{id, tanggal, item, arah, qty, qtyInput, unitInput,
 *                    sebab, ref, tim, pic, waktu, catatan}, ...] }
 *      `saldo` TIDAK ikut rentang tanggal — sisa stok itu keadaan sekarang,
 *      bukan ringkasan sebuah periode. Yang disaring cuma `mutasi`.
 *
 * Daftar PENGAJUAN barang CK sengaja TIDAK punya endpoint sendiri: halaman
 * Purchasing menyusunnya dari daftar order yang sudah ada di layar itu
 * (appState.orders) + master produk. Endpoint terpisah cuma menambah satu
 * sumber kebenaran yang bisa berbeda dari daftar order di sebelahnya.
 *
 * GET  ck.php?action=pending
 *      -> [{id, tanggal, item, qty, qtyInput, unitInput, tim, pic, waktu,
 *           catatan, packIsi, packSatuan}, ...]  kiriman outlet yang
 *      masih menunggu dikonfirmasi diterima CK.
 *
 * POST {action:'simpan', id?, tanggal, item, arah:'masuk'|'keluar',
 *       qtyInput, unitInput, sebab, tim, pic, catatan}
 * POST {action:'hapus', id}
 *
 * --- arah OUTLET -> CK (dua langkah) ---
 * POST {action:'kirim', tanggal, item, qtyInput, unitInput, tim, pic, catatan}
 *      Outlet mencatat kiriman. Tercatat 'pending' dan BELUM menambah saldo.
 * POST {action:'konfirmasi', items:[id | {id, qtyTerima}], terima:true|false}
 *      CK menerima (masuk ke saldo) atau menolak (barisnya dihapus).
 *      qtyTerima opsional = jumlah yang benar-benar sampai; itulah yang
 *      dihitung, bukan jumlah yang diklaim pengirim.
 *
 * Mutasi yang lahir dari pengajuan (kolom `ref` terisi) TIDAK bisa disimpan
 * atau dihapus lewat sini — ia cerminan status kedatangan sebuah order, dan
 * satu-satunya cara mengubahnya adalah lewat check-in/jemput. Lihat
 * pur_ck_sinkron_order() di lib_stock_ck.php.
 */
require __DIR__ . '/_boot.php';
require __DIR__ . '/lib_stock_ck.php';

try {
  if ($metode === 'GET') {
    pur_cek_token();
    $pdo = pur_pdo();
    if ($aksiUrl === 'pending') pur_json(pur_ck_kiriman_pending($pdo));
    pur_json(['saldo' => pur_ck_saldo($pdo), 'mutasi' => pur_ck_mutasi_ambil($pdo)]);
  }

  if ($metode === 'POST') {
    $b = pur_body();
    if (!$b) pur_json(['status' => 'error', 'message' => 'body bukan JSON'], 400);
    pur_cek_token($b);
    $pdo = pur_pdo();
    $a = $b->action ?? '';
    if ($a === 'simpan') pur_json(pur_ck_simpan($pdo, $b));
    if ($a === 'hapus')  pur_json(pur_ck_hapus($pdo, $b->id ?? ''));
    if ($a === 'kirim')  pur_json(pur_ck_kiriman_simpan($pdo, $b));
    if ($a === 'konfirmasi') {
      // `terima` dibaca ketat: apa pun selain false berarti diterima.
      // Default menerima, karena menolak adalah tindakan yang harus
      // disengaja — bukan yang terjadi kalau satu field lupa dikirim.
      $terima = !(isset($b->terima) && $b->terima === false);
      pur_json(pur_ck_kiriman_konfirmasi($pdo, $b->items ?? [], $terima));
    }
    pur_json(['status' => 'error', 'message' => 'action tidak dikenal: ' . $a], 400);
  }

  pur_json(['status' => 'error', 'message' => 'metode tidak didukung'], 405);
} catch (Throwable $e) {
  error_log('[stock/ck] ' . $e->getMessage());
  pur_json(['status' => 'error', 'message' => 'kesalahan server'], 500);
}
