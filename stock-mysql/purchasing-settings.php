<?php
/* PURCHASING — endpoint SETTINGS: matriks hak akses + template chat WhatsApp.
 * Baris tunggal di `stock_settings` (modul='purchasing'), TERPISAH dari
 * ordering-settings.php walau sama-sama nulis ke tabel stock_settings —
 * tiap endpoint cuma boleh sentuh baris modulnya sendiri.
 *
 * GET  -> {perms: {"<page>": {"<role>": 0|1|2}}, templates: {item, gabungan}}
 * POST {action:'savePerms',     perms:{...}}
 * POST {action:'saveTemplates', templates:{item, gabungan}}
 *
 * ---------------------------------------------------------------------------
 * BENTUK `data` BERUBAH, DAN YANG LAMA HARUS TETAP TERBACA.
 *
 * Dulu kolom `data` berisi matriks hak akses LANGSUNG di akarnya:
 *     {"dashboard": {"full": 2}, "overview": {...}}
 * Sekarang dibungkus supaya bisa menampung lebih dari satu jenis pengaturan:
 *     {"perms": {...}, "templates": {...}}
 *
 * Baris yang sudah tersimpan di dev/produksi masih berbentuk lama. Kalau
 * dibaca mentah-mentah sebagai bentuk baru, `perms` akan kosong dan SEMUA
 * hak akses jatuh ke default — diam-diam mengubah siapa boleh apa. Karena
 * itu bentuk lama dikenali dan diterjemahkan saat dibaca, lalu ditulis ulang
 * dalam bentuk baru pada penyimpanan berikutnya.
 */
require __DIR__ . '/_boot.php';

const MODUL_INI = 'purchasing';

/* Baca `data` apa adanya lalu normalkan ke bentuk baru.
   Penanda bentuk lama: TIDAK punya kunci `perms`, tapi punya kunci lain
   (nama halaman). Objek kosong dianggap bentuk baru yang masih kosong. */
function pur_ps_baca($pdo) {
  $d = pur_settings_ambil($pdo, MODUL_INI);
  if (isset($d->perms) || isset($d->templates)) {
    return ['perms'     => $d->perms     ?? (object)[],
            'templates' => $d->templates ?? (object)[]];
  }
  // bentuk lama (atau kosong): seluruh isinya adalah perms
  return ['perms' => $d, 'templates' => (object)[]];
}

try {
  if ($metode === 'GET') {
    pur_cek_token();
    $s = pur_ps_baca(pur_pdo());
    pur_json(['perms' => $s['perms'], 'templates' => $s['templates']]);
  }

  if ($metode === 'POST') {
    $b = pur_body();
    if (!$b) pur_json(['status' => 'error', 'message' => 'body bukan JSON'], 400);
    pur_cek_token($b);
    $pdo = pur_pdo();
    $a = $b->action ?? '';

    // Baca-ubah-tulis: menyimpan salah satu bagian TIDAK BOLEH menghapus yang
    // lain. Tanpa ini, mengubah template chat akan menghapus seluruh matriks
    // hak akses — dan itu baru ketahuan saat ada yang kehilangan akses.
    if ($a === 'savePerms' || $a === 'saveTemplates') {
      $s = pur_ps_baca($pdo);
      if ($a === 'savePerms') {
        if (!is_object($b->perms ?? null)) pur_json(['status'=>'error','message'=>'perms bukan objek'], 400);
        $s['perms'] = $b->perms;
      } else {
        if (!is_object($b->templates ?? null)) pur_json(['status'=>'error','message'=>'templates bukan objek'], 400);
        $s['templates'] = $b->templates;
      }
      pur_json(pur_settings_simpan($pdo, MODUL_INI, (object)$s));
    }

    pur_json(['status' => 'error', 'message' => 'action tidak dikenal: ' . $a], 400);
  }
  pur_json(['status' => 'error', 'message' => 'metode tidak didukung'], 405);
} catch (Throwable $e) {
  error_log('[stock/purchasing-settings] ' . $e->getMessage());
  pur_json(['status' => 'error', 'message' => 'kesalahan server'], 500);
}
