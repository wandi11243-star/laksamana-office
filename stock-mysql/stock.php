<?php
/* STOCK — sisa bahan "Stock Today" (dipakai bersama ordering + purchasing).
 *
 * GET  -> { stock: {"<Nama>": {stock_now, stock_unit}}, as_of, count }
 *         (bentuk SAMA dengan Apps Script lama -> forecasting tidak berubah)
 * POST { type:'stock', as_of, stock:{...} }  -> tulis ulang snapshot stok
 *
 * Frontend menempel '?type=stock' pada URL; parameter itu tidak masalah di
 * sini (endpoint menentukan aksi dari metode GET/POST, bukan dari ?type).
 */
require __DIR__ . '/_boot.php';

try {
  if ($metode === 'GET') {
    pur_cek_token();
    pur_json(pur_stock_ambil(pur_pdo()));
  }

  if ($metode === 'POST') {
    $b = pur_body();
    if (!$b) pur_json(['status' => 'error', 'message' => 'body bukan JSON'], 400);
    pur_cek_token($b);
    pur_json(pur_stock_simpan(pur_pdo(), $b->stock ?? null, $b->as_of ?? ''));
  }
  pur_json(['status' => 'error', 'message' => 'metode tidak didukung'], 405);
} catch (Throwable $e) {
  error_log('[stock/stock] ' . $e->getMessage());
  pur_json(['status' => 'error', 'message' => 'kesalahan server'], 500);
}
