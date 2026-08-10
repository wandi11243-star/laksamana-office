<?php
/* STOCK — endpoint ORDERS.
 * GET  -> [ {rowIndex, nomorOrder, timestamp, item, qty, unit, note,
 *            tglDatang, pic, status, kedatangan, catatan,
 *            batchId, batchName, tim}, ... ]
 * GET  ?action=batches[&tim=Kitchen][&tgl=2026-07-19] -> [ {batchId, batchName,
 *            tglDatang, tim, pic, waktu, jmlItem, terarsip}, ... ]
 *            Batch yang boleh digabungi, disaring per tim & tanggal kedatangan.
 *            Yang SUDAH DIARSIPKAN ikut (terarsip:true) — purchasing
 *            mengarsipkan begitu order diteruskan ke vendor, jadi menyaringnya
 *            keluar membuat fitur gabung batch praktis tidak pernah bisa
 *            dipakai. Yang penerimaannya sudah berjalan tetap dikecualikan.
 * POST {action:'batchOrder', orders:[{item,qty,unit,note,tglDatang,pic}],
 *       batchId:'' (kosong = batch baru), batchName:'' (opsional), tim:''}
 * POST {action:'archive',   rows:[rowIndex] | orderIds:['LKS-...']}
 * POST {action:'unarchive', rowIndex:N     | orderIds:['LKS-...']}
 * POST {action:'updateTglJemput', updates:[{rowIndex, tglJemput:'YYYY-MM-DD'|''}]}
 *
 * Path sendiri (bukan api.php?src=orders) karena frontend menempel
 * `?t=<timestamp>` ke URL ini — tanda tanya dobel akan merusaknya.
 */
require __DIR__ . '/_boot.php';

try {
  if ($metode === 'GET') {
    pur_cek_token();
    if ($aksiUrl === 'stats') pur_json(pur_stats(pur_pdo()));
    // Daftar batch aktif yang boleh digabungi, disaring per tim (?tim=Kitchen).
    // Endpoint sendiri, bukan diturunkan frontend dari GET orders penuh:
    // pengelompokan + syarat "belum ada yang datang" jauh lebih murah di SQL
    // daripada mengirim 682 baris lalu menyaringnya di HP kru dapur.
    if ($aksiUrl === 'batches') pur_json(pur_orders_batches(pur_pdo(),
                                          trim((string)($_GET['tim'] ?? '')),
                                          trim((string)($_GET['tgl'] ?? ''))));
    pur_json(pur_orders_ambil(pur_pdo()));          // array telanjang, seperti Apps Script
  }

  if ($metode === 'POST') {
    $b = pur_body();
    if (!$b) pur_json(['status' => 'error', 'message' => 'body bukan JSON'], 400);
    pur_cek_token($b);
    $pdo = pur_pdo();
    $a = $b->action ?? '';
    // $b dikirim utuh sebagai meta: batchId (kosong = batch baru), batchName, tim.
    if ($a === 'batchOrder') pur_json(pur_orders_batch($pdo, $b->orders ?? [], $b));
    if ($a === 'import')     pur_json(pur_orders_import($pdo, $b->orders ?? []));  // alat migrasi, idempoten
    if ($a === 'archive')    pur_json(pur_orders_arsip($pdo, $b, 'Arsip'));
    if ($a === 'unarchive')  pur_json(pur_orders_arsip($pdo, $b, 'Aktif'));
    // --- aksi dari modul ordering (tabel order yang sama) ---
    /* Kedatangan barang Central Kitchen = stok CK berkurang. Disinkronkan
       DI SINI, sesudah kolom kedatangan benar-benar tersimpan, bukan di
       frontend: barang yang sama bisa ditandai datang dari Check-in
       Penerimaan (Ordering) maupun tombol Selesai Dijemput (Purchasing),
       dan mutasi stok yang ditulis dari dua layar berbeda pasti akan
       berbeda perlakuannya cepat atau lambat. Satu pintu, satu aturan.
       pur_ck_sinkron_order() idempoten — lihat catatannya di lib. */
    if ($a === 'updateKedatangan') {
      $hasil = pur_orders_update_kedatangan($pdo, $b->updates ?? []);
      $baris = [];
      foreach (($b->updates ?? []) as $u) {
        if (is_object($u) && isset($u->rowIndex)) $baris[] = (int)$u->rowIndex;
      }
      /* Kegagalan sinkron stok TIDAK boleh menggagalkan check-in-nya:
         status kedatangan sudah tersimpan pada titik ini, dan melaporkan
         "gagal" akan membuat orang menyimpannya berulang kali untuk
         sesuatu yang sebenarnya sudah berhasil. Selisih stok yang timbul
         bisa dikoreksi lewat Penyesuaian; check-in yang hilang tidak. */
      try {
        require_once __DIR__ . '/lib_stock_ck.php';
        $hasil['ck'] = pur_ck_sinkron_order($pdo, $baris);
      } catch (Throwable $e) {
        error_log('[stock/orders] sinkron CK gagal: ' . $e->getMessage());
        $hasil['ck'] = ['error' => 'sinkron stok CK gagal'];
      }
      pur_json($hasil);
    }
    // Jadwal penjemputan (vendor yang barangnya tidak bisa diambil hari itu).
    // Tidak menyentuh stok CK: menjadwalkan penjemputan bukan kedatangan barang.
    if ($a === 'updateTglJemput')  pur_json(pur_orders_update_tgl_jemput($pdo, $b->updates ?? []));
    if ($a === 'updateOrderQty')   pur_json(pur_orders_update_qty($pdo, $b->rowIndex ?? 0, $b->newQty ?? null));
    if ($a === 'deleteRow')        pur_json(pur_orders_delete_row($pdo, $b->rowIndex ?? 0));
    pur_json(['status' => 'error', 'message' => 'action tidak dikenal: ' . $a], 400);
  }
  pur_json(['status' => 'error', 'message' => 'metode tidak didukung'], 405);
} catch (Throwable $e) {
  error_log('[stock/orders] ' . $e->getMessage());
  pur_json(['status' => 'error', 'message' => 'kesalahan server'], 500);
}
