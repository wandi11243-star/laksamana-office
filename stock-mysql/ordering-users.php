<?php
/* ORDERING — endpoint USERS (daftar kru dapur, terpisah dari users.php
 * purchasing). BERISI PIN LOGIN. Tabel `ordering_users` di DB yang sama.
 *
 * GET  -> {users: [{id, name, pin, role, keterangan}]}
 * POST {action:'saveUser', user:{...}}       tambah/edit satu user
 * POST {action:'bulkSeed', users:[{...}]}     isi awal / seed (tidak menghapus)
 * POST {action:'deleteUser', user:{id}|id}    hapus (jaga-jaga; ordering tak pakai)
 */
require __DIR__ . '/_boot.php';

try {
  if ($metode === 'GET') {
    pur_cek_token();
    // ordering menerima array telanjang ATAU {users:[...]}; pakai yang kedua
    // supaya seragam dengan users.php purchasing.
    pur_json(['users' => pur_ordering_users_ambil(pur_pdo())]);
  }

  if ($metode === 'POST') {
    $b = pur_body();
    if (!$b) pur_json(['status' => 'error', 'message' => 'body bukan JSON'], 400);
    pur_cek_token($b);
    $pdo = pur_pdo();
    $a = $b->action ?? '';
    if ($a === 'saveUser')   pur_json(pur_ordering_user_simpan($pdo, $b->user ?? null));
    if ($a === 'bulkSeed')   pur_json(pur_ordering_users_seed($pdo, $b->users ?? []));
    if ($a === 'deleteUser') pur_json(pur_ordering_user_hapus($pdo, $b->user ?? null));
    pur_json(['status' => 'error', 'message' => 'action tidak dikenal: ' . $a], 400);
  }
  pur_json(['status' => 'error', 'message' => 'metode tidak didukung'], 405);
} catch (Throwable $e) {
  error_log('[stock/ordering-users] ' . $e->getMessage());
  pur_json(['status' => 'error', 'message' => 'kesalahan server'], 500);
}
