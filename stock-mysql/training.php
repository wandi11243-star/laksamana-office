<?php
/* TRAINING — titipan berkas data latih untuk model prakiraan.
 *
 * GET  -> { status, sales_detail:{last_date,next_from,files}, usage:{...} }
 * GET  ?action=list&target=usage        -> daftar berkas (nama, ukuran, waktu)
 * GET  ?action=get&target=usage&name=X  -> unduh SATU berkas (biner)
 * POST { type:'training', target:'usage'|'sales_detail', filename, content_b64 }
 *      -> simpan berkas apa adanya ke folder data latih
 *
 * KENAPA list/get BUTUH TOKEN, sementara ringkasan tidak:
 * dua aksi itu mengeluarkan DATA PENJUALAN MENTAH dari server. Ringkasan hanya
 * menyebut jumlah berkas & tanggal. Karena itu list/get menolak jalan kalau
 * API_TOKEN kosong — lebih baik gagal terang-terangan saat dipasang daripada
 * diam-diam membuka arsip penjualan ke siapa pun yang menebak URL-nya.
 *
 * LINGKUP SENGAJA SEMPIT: endpoint ini HANYA menyimpan berkas. Hitung-ulang
 * model (SARIMA/ML, ~10 menit) tetap proses Python terpisah di Code/ — PHP
 * tidak menjalankannya, dan tidak pura-pura menjalankannya. Alur lengkap:
 *
 *   admin unggah di sini -> berkas menumpuk di TRAINING_DIR
 *     -> operator jalankan hitung-ulang Python (baca folder yang sama)
 *     -> export_forecast.py terbitkan hasilnya ke Apps Script
 *     -> aplikasi ordering/purchasing ambil angka baru sendiri
 *
 * Jadi angka prakiraan TIDAK berubah tepat setelah unggah; frontend sudah
 * mengatakan itu ke admin supaya tidak ada yang menunggu sia-sia.
 */
require __DIR__ . '/_boot.php';

/* Folder tujuan. Di luar document root bila memungkinkan supaya berkas
   mentah tidak bisa diunduh siapa pun lewat URL tebak-tebakan. */
$TRAINING_DIR = defined('TRAINING_DIR') ? TRAINING_DIR : (__DIR__ . '/../data-latih');

/* Hanya dua tujuan yang dikenal, dipetakan ke sub-folder tetap. Nama berkas
   dari browser TIDAK pernah dipakai sebagai path — lihat pur_training_nama(). */
$TARGET = [
  'usage'        => 'usage',
  'sales_detail' => 'sales_detail',
];

/* Nama berkas aman: buang segala komponen path, sisakan basename, lalu beri
   stempel waktu. Tanpa ini 'filename' dari klien bisa berisi '../' dan menulis
   ke mana saja. Ekstensi dibatasi xlsx/xls. */
function pur_training_nama($mentah) {
  $base = basename(str_replace('\\', '/', (string)$mentah));
  $ext  = strtolower(pathinfo($base, PATHINFO_EXTENSION));
  if (!in_array($ext, ['xlsx', 'xls'], true)) return null;
  $stem = pathinfo($base, PATHINFO_FILENAME);
  $stem = preg_replace('/[^A-Za-z0-9 _.-]/', '_', $stem);
  $stem = trim(substr($stem, 0, 80)) ?: 'data';
  return gmdate('Ymd-His') . '_' . $stem . '.' . $ext;
}

/* Ringkas isi satu sub-folder: berapa berkas dan kapan yang terbaru masuk.
   Tanggal arsip dibaca dari nama berkas (stempel waktu unggah), BUKAN dari
   isi xlsx — PHP di sini tidak membuka spreadsheet. */
function pur_training_ringkas($dir) {
  if (!is_dir($dir)) return ['files' => 0, 'last_date' => null, 'next_from' => null];
  $f = glob($dir . '/*.{xlsx,xls}', GLOB_BRACE) ?: [];
  if (!$f) return ['files' => 0, 'last_date' => null, 'next_from' => null];
  sort($f);
  $terbaru = end($f);
  $ts = filemtime($terbaru) ?: time();
  return [
    'files'     => count($f),
    'last_date' => gmdate('d M Y', $ts),
    'next_from' => gmdate('d M Y', $ts + 86400),
  ];
}

/* Penjaga khusus aksi yang MENGELUARKAN berkas mentah. Sengaja menolak saat
   API_TOKEN kosong: pur_cek_token() lolos begitu saja bila token tak diatur,
   dan itu aman untuk ringkasan tapi TIDAK untuk isi arsip penjualan. */
function pur_training_wajib_token() {
  if (!defined('API_TOKEN') || API_TOKEN === '') {
    pur_json(['status' => 'error',
              'message' => 'unduh arsip butuh API_TOKEN diatur di config.php'], 403);
  }
  pur_cek_token();
}

try {
  if ($metode === 'GET') {

    /* --- daftar berkas dalam satu target --- */
    if ($aksiUrl === 'list') {
      pur_training_wajib_token();
      $target = $_GET['target'] ?? '';
      if (!isset($TARGET[$target])) {
        pur_json(['status' => 'error', 'message' => 'target tidak dikenal'], 400);
      }
      $dir = $TRAINING_DIR . '/' . $TARGET[$target];
      $out = [];
      foreach ((glob($dir . '/*.{xlsx,xls}', GLOB_BRACE) ?: []) as $p) {
        $out[] = ['name' => basename($p), 'size' => filesize($p), 'mtime' => filemtime($p)];
      }
      pur_json(['status' => 'success', 'target' => $target, 'files' => $out]);
    }

    /* --- unduh satu berkas --- */
    if ($aksiUrl === 'get') {
      pur_training_wajib_token();
      $target = $_GET['target'] ?? '';
      if (!isset($TARGET[$target])) {
        pur_json(['status' => 'error', 'message' => 'target tidak dikenal'], 400);
      }
      /* basename() lagi: parameter `name` datang dari klien, jadi ia tidak
         boleh dipercaya membawa path meski hanya dipakai untuk membaca. */
      $nama = basename(str_replace('\\', '/', (string)($_GET['name'] ?? '')));
      $ext  = strtolower(pathinfo($nama, PATHINFO_EXTENSION));
      if ($nama === '' || !in_array($ext, ['xlsx', 'xls'], true)) {
        pur_json(['status' => 'error', 'message' => 'nama berkas tidak sah'], 400);
      }
      $path = $TRAINING_DIR . '/' . $TARGET[$target] . '/' . $nama;
      if (!is_file($path)) {
        pur_json(['status' => 'error', 'message' => 'berkas tidak ada'], 404);
      }
      header('Content-Type: application/octet-stream');
      header('Content-Length: ' . filesize($path));
      header('Content-Disposition: attachment; filename="' . $nama . '"');
      header('Cache-Control: no-store');
      readfile($path);
      exit;
    }

    /* --- ringkasan (dipakai frontend ordering) --- */
    pur_cek_token();
    pur_json([
      'status'       => 'success',
      'usage'        => pur_training_ringkas($TRAINING_DIR . '/usage'),
      'sales_detail' => pur_training_ringkas($TRAINING_DIR . '/sales_detail'),
    ]);
  }

  if ($metode === 'POST') {
    $b = pur_body();
    if (!$b) pur_json(['status' => 'error', 'message' => 'body bukan JSON'], 400);
    pur_cek_token($b);

    $target = isset($b->target) ? (string)$b->target : '';
    if (!isset($TARGET[$target])) {
      pur_json(['status' => 'error', 'message' => 'target tidak dikenal'], 400);
    }

    $nama = pur_training_nama($b->filename ?? '');
    if ($nama === null) {
      pur_json(['status' => 'error', 'message' => 'hanya berkas .xlsx/.xls'], 400);
    }

    /* strict=true: base64 rusak ditolak, bukan diam-diam dipotong jadi
       berkas cacat yang baru ketahuan saat hitung-ulang berjalan. */
    $isi = base64_decode((string)($b->content_b64 ?? ''), true);
    if ($isi === false || $isi === '') {
      pur_json(['status' => 'error', 'message' => 'isi berkas tidak terbaca'], 400);
    }

    $dir = $TRAINING_DIR . '/' . $TARGET[$target];
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
      pur_json(['status' => 'error', 'message' => 'folder data latih tidak bisa dibuat'], 500);
    }

    if (file_put_contents($dir . '/' . $nama, $isi) === false) {
      pur_json(['status' => 'error', 'message' => 'gagal menyimpan berkas'], 500);
    }

    pur_json([
      'status'   => 'success',
      'saved_as' => $nama,
      'size_kb'  => (int)round(strlen($isi) / 1024),
    ]);
  }

  pur_json(['status' => 'error', 'message' => 'metode tidak didukung'], 405);
} catch (Throwable $e) {
  error_log('[stock/training] ' . $e->getMessage());
  pur_json(['status' => 'error', 'message' => 'kesalahan server'], 500);
}
