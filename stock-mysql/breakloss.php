<?php
/* STOCK — endpoint BREAK & LOSS (barang inventaris pecah / hilang).
 *
 * GET  breakloss.php[?dari=YYYY-MM-DD&ke=YYYY-MM-DD]
 *      -> {status, items:[{id,nama,kategori,satuan,lokasi,harga,stokMin,aktif,
 *                          thumb,adaFoto,stok,...}],
 *                  mutasi:[{id,itemId,tanggal,jenis,qty,harga,sebab,pic,tim,
 *                           catatan,adaFoto,oleh,waktu,batalAt,...}]}
 *      Stok = jumlah SELURUH mutasi yang tidak dibatalkan; rentang tanggal
 *      cuma menyaring daftar mutasinya.
 *
 * GET  breakloss.php?action=foto&jenis=item|mutasi&id=...
 *
 * POST {action:'itemSimpan', id?, nama, kategori, satuan, lokasi, harga,
 *       stokMin, catatan, stokAwal?, foto?, thumb?, fotoNama?}
 * POST {action:'itemAktif', id, aktif}
 * POST {action:'mutasiSimpan', itemId, jenis:break|loss|masuk|opname,
 *       tanggal, qty | fisik, sebab, pic, tim, catatan, foto?, fotoNama?}
 * POST {action:'mutasiBatal', id, alasan}
 *
 * Tidak ada aksi hapus — lihat kepala lib_stock_breakloss.php.
 */
require __DIR__ . '/_boot.php';
require __DIR__ . '/lib_stock_catat.php';
require __DIR__ . '/lib_stock_breakloss.php';

try {
  if ($metode === 'GET') {
    pur_cek_token();
    $pdo = pur_pdo();
    if ($aksiUrl === 'foto') {
      pur_json(bl_foto($pdo, (string)($_GET['jenis'] ?? 'item'), trim((string)($_GET['id'] ?? ''))));
    }
    pur_json(bl_daftar($pdo));
  }

  if ($metode === 'POST') {
    $b = pur_body();
    if (!$b) pur_json(['status' => 'error', 'message' => 'body bukan JSON'], 400);
    pur_cek_token($b);
    $pdo = pur_pdo();
    $a = $b->action ?? '';
    if ($a === 'itemSimpan')   pur_json(bl_item_simpan($pdo, $b));
    if ($a === 'itemAktif')    pur_json(bl_item_aktif($pdo, $b));
    if ($a === 'mutasiSimpan') pur_json(bl_mutasi_simpan($pdo, $b));
    if ($a === 'mutasiBatal')  pur_json(bl_mutasi_batal($pdo, $b));
    pur_json(['status' => 'error', 'message' => 'action tidak dikenal: ' . $a], 400);
  }

  pur_json(['status' => 'error', 'message' => 'metode tidak didukung'], 405);
} catch (Throwable $e) {
  error_log('[stock/breakloss] ' . $e->getMessage());
  pur_json(['status' => 'error', 'message' => 'kesalahan server'], 500);
}
