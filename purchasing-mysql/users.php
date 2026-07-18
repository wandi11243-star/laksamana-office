<?php
/* PURCHASING — endpoint USERS. BERISI PIN LOGIN.
 * GET  -> {users: [{id, name, pin, role, keterangan}]}
 * POST {action:'add'|'update'|'delete', user:{...}}
 */
require __DIR__ . '/_boot.php';

try {
  if ($metode === 'GET') {
    pur_cek_token();
    pur_json(['users' => pur_users_ambil(pur_pdo())]);
  }

  if ($metode === 'POST') {
    $b = pur_body();
    if (!$b) pur_json(['status' => 'error', 'message' => 'body bukan JSON'], 400);
    pur_cek_token($b);
    $pdo = pur_pdo();
    $a = $b->action ?? '';
    if ($a === 'add' || $a === 'update') pur_json(pur_user_simpan($pdo, $b->user ?? null));
    if ($a === 'delete')                 pur_json(pur_user_hapus($pdo, $b->user ?? null));
    pur_json(['status' => 'error', 'message' => 'action tidak dikenal: ' . $a], 400);
  }
  pur_json(['status' => 'error', 'message' => 'metode tidak didukung'], 405);
} catch (Throwable $e) {
  error_log('[purchasing/users] ' . $e->getMessage());
  pur_json(['status' => 'error', 'message' => 'kesalahan server'], 500);
}
