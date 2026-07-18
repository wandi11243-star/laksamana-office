<?php
/* PURCHASING — endpoint SETTINGS (matriks hak akses per peran/halaman).
 * Baris tunggal di `stock_settings` (modul='purchasing'), TERPISAH dari
 * ordering-settings.php walau sama-sama nulis ke tabel stock_settings —
 * tiap endpoint cuma boleh sentuh baris modulnya sendiri.
 *
 * GET  -> {perms: {"<page>": {"<role>": 0|1|2}}}
 * POST {action:'savePerms', perms:{...}}
 */
require __DIR__ . '/_boot.php';

const MODUL_INI = 'purchasing';

try {
  if ($metode === 'GET') {
    pur_cek_token();
    pur_json(['perms' => pur_settings_ambil(pur_pdo(), MODUL_INI)]);
  }

  if ($metode === 'POST') {
    $b = pur_body();
    if (!$b) pur_json(['status' => 'error', 'message' => 'body bukan JSON'], 400);
    pur_cek_token($b);
    $pdo = pur_pdo();
    $a = $b->action ?? '';
    if ($a === 'savePerms') pur_json(pur_settings_simpan($pdo, MODUL_INI, $b->perms ?? null));
    pur_json(['status' => 'error', 'message' => 'action tidak dikenal: ' . $a], 400);
  }
  pur_json(['status' => 'error', 'message' => 'metode tidak didukung'], 405);
} catch (Throwable $e) {
  error_log('[stock/purchasing-settings] ' . $e->getMessage());
  pur_json(['status' => 'error', 'message' => 'kesalahan server'], 500);
}
