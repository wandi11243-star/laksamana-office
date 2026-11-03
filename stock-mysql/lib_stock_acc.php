<?php
/************************************************************************
 * STOCK — ACC HEAD untuk Form Order Belanja (3 November 2026)
 * ---------------------------------------------------------------------
 * Permintaan user: order belanja yang dibuat ANGGOTA di-ACC dulu oleh head
 * divisinya (Kitchen / Bar / Floor) sebelum sampai ke Purchasing. Order
 * yang dibuat HEAD sendiri tidak perlu ACC.
 *
 * KENAPA TABEL SENDIRI (`order_acc`), bukan status baru di tabel `orders`:
 * Purchasing, Check-in Penerimaan, rekap, dan pemeriksa duplikat semuanya
 * membaca `orders` dengan aturan `status !== 'Arsip'`. Baris yang menunggu
 * ACC di sana akan TERLIHAT sebagai order sah di seluruh layar itu — dan
 * cukup satu layar yang lupa menyaringnya untuk membuat barang yang belum
 * disetujui dibelanjakan. Di tabel terpisah, order baru lahir di `orders`
 * SESUDAH di-ACC, lewat pur_orders_batch() yang SAMA dengan kiriman biasa.
 *
 * SIAPA HEAD-nya: daftar `heads` modul Jadwal Shift (Pengaturan → Head
 * Divisi), ditanyakan server-ke-server lewat jadwal-api?action=headIds —
 * daftar yang sama yang dipakai DW dan Office. Tidak disalin ke sini.
 *
 * DIVISI pemesan: kolom Tim/Keterangan akun Office (pur_tim_pemanggil),
 * dinormalkan ke kitchen/bar/floor.
 *
 * GAGAL TERBUKA, dan itu keputusan sadar: kalau identitas pemesan tidak
 * bisa dipastikan (sesi kosong — mis. tab lama yang belum memuat versi ini
 * — atau API akun / modul Jadwal tidak menjawab), order langsung masuk
 * seperti sebelum fitur ini ada. Menahan order belanja dapur karena modul
 * lain sedang batuk lebih mahal daripada satu order yang lolos tanpa ACC.
 ************************************************************************/
require_once __DIR__ . '/lib_stock_catat.php';   // pur_whoami, pur_token_sesi, pur_tim_pemanggil

const PUR_ACC_DIVISI = ['kitchen', 'bar', 'floor'];

function pur_acc_pastikan($pdo) {
  static $sudah = false;
  if ($sudah) return;
  $pdo->exec("CREATE TABLE IF NOT EXISTS `order_acc` (
      `id`           VARCHAR(40)  NOT NULL PRIMARY KEY,
      `waktu`        DATETIME     NOT NULL,
      `pemohon_id`   VARCHAR(80)  NOT NULL DEFAULT '',
      `pemohon`      VARCHAR(160) NOT NULL DEFAULT '',
      `divisi`       VARCHAR(80)  NOT NULL DEFAULT '',
      `tim`          VARCHAR(160) NOT NULL DEFAULT '',
      `tgl_datang`   VARCHAR(20)  NOT NULL DEFAULT '',
      `status`       VARCHAR(20)  NOT NULL DEFAULT 'menunggu',
      `putus_oleh`   VARCHAR(160) NOT NULL DEFAULT '',
      `putus_at`     DATETIME     NULL,
      `alasan`       TEXT         NULL,
      `data`         LONGTEXT     NOT NULL,
      KEY `idx_acc_status` (`status`),
      KEY `idx_acc_pemohon` (`pemohon_id`)
    ) DEFAULT CHARSET=utf8mb4");
  $sudah = true;
}

/* Peta head dari modul Jadwal: userId => [divisi...]. null = tidak terbaca
   (BEDA dari [] = terbaca, memang belum ada head). */
function pur_acc_jadwal_url() {
  if (defined('JADWAL_API_URL') && JADWAL_API_URL !== '') return JADWAL_API_URL;
  $host = $_SERVER['SERVER_NAME'] ?? ($_SERVER['HTTP_HOST'] ?? '');
  if ($host === '') return '';
  $skema = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
  return $skema . '://' . $host . '/jadwal-api-mysql/api.php';
}
function pur_acc_head_peta() {
  static $cache = false;
  if ($cache !== false) return $cache;
  $url = pur_acc_jadwal_url();
  if ($url === '') return $cache = null;
  $jawab = null;
  if (function_exists('curl_init')) {
    $ch = curl_init($url . '?action=headIds');
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 5,
                            CURLOPT_CONNECTTIMEOUT => 3, CURLOPT_FOLLOWLOCATION => true]);
    $jawab = curl_exec($ch);
    curl_close($ch);
  } else {
    $ctx = stream_context_create(['http' => ['timeout' => 5]]);
    $jawab = @file_get_contents($url . '?action=headIds', false, $ctx);
  }
  if (!is_string($jawab) || $jawab === '') return $cache = null;
  $d = json_decode($jawab, true);
  if (!is_array($d) || empty($d['ok']) || !isset($d['data']['heads']) || !is_array($d['data']['heads'])) return $cache = null;
  return $cache = $d['data']['heads'];
}

/* Divisi kitchen/bar/floor milik akun ini, dari kolom Tim/Keterangan. */
function pur_acc_divisi_akun($u) {
  $out = [];
  foreach (pur_tim_pemanggil($u) as $t) {
    $k = strtolower($t);
    if (in_array($k, PUR_ACC_DIVISI, true)) $out[] = $k;
  }
  return $out;
}
/* Divisi yang di-head akun ini (dari whoami; jatuh ke peta Jadwal). */
function pur_acc_head_akun($u) {
  $h = (isset($u['headDivisi']) && is_array($u['headDivisi'])) ? $u['headDivisi'] : null;
  if ($h === null) {
    $peta = pur_acc_head_peta();
    $id = (string)($u['id'] ?? '');
    $h = (is_array($peta) && isset($peta[$id]) && is_array($peta[$id])) ? $peta[$id] : [];
  }
  return array_values(array_intersect(array_map('strtolower', array_map('strval', $h)), PUR_ACC_DIVISI));
}
function pur_acc_admin($u) {
  $a = (isset($u['adminModules']) && is_array($u['adminModules'])) ? $u['adminModules'] : [];
  return in_array('*', $a, true) || in_array('ordering', $a, true);
}

/* Perlu ACC? Memulangkan daftar divisi yang head-nya harus meng-ACC, atau
   [] kalau order boleh langsung masuk. Lihat "GAGAL TERBUKA" di atas. */
function pur_acc_perlu($u) {
  if (!$u) return [];
  if (pur_acc_admin($u)) return [];
  $div = pur_acc_divisi_akun($u);
  if (!$div) return [];
  // Head divisinya sendiri = tidak perlu ACC (permintaan user).
  if (array_intersect($div, pur_acc_head_akun($u))) return [];
  $peta = pur_acc_head_peta();
  if (!is_array($peta)) return [];
  $adaHead = [];
  foreach ($peta as $uid => $ds) {
    if (!is_array($ds)) continue;
    foreach ($ds as $d) { $d = strtolower((string)$d); if (in_array($d, $div, true)) $adaHead[$d] = true; }
  }
  // Divisi tanpa head: order tidak tertahan selamanya — langsung masuk.
  return array_keys($adaHead);
}

/* Simpan kiriman sebagai pengajuan menunggu ACC. */
function pur_acc_simpan($pdo, $u, $divisi, $b) {
  pur_acc_pastikan($pdo);
  $orders = [];
  foreach (($b->orders ?? []) as $o) {
    if (!is_object($o) || trim((string)($o->item ?? '')) === '') continue;
    $orders[] = ['item' => (string)$o->item, 'qty' => (float)($o->qty ?? 0), 'unit' => (string)($o->unit ?? ''),
                 'note' => (string)($o->note ?? '-'), 'tglDatang' => (string)($o->tglDatang ?? ''),
                 'pic' => (string)($o->pic ?? '')];
  }
  if (!$orders) return ['status' => 'error', 'message' => 'orders kosong'];
  $id = 'ACC-' . date('ymd-His') . '-' . strtoupper(bin2hex(random_bytes(2)));
  $data = ['orders' => $orders,
           'batchId' => trim((string)($b->batchId ?? '')),
           'batchName' => trim((string)($b->batchName ?? ''))];
  $st = $pdo->prepare("INSERT INTO `order_acc`
      (`id`,`waktu`,`pemohon_id`,`pemohon`,`divisi`,`tim`,`tgl_datang`,`status`,`data`)
      VALUES (?,?,?,?,?,?,?,'menunggu',?)");
  $st->execute([$id, date('Y-m-d H:i:s'), (string)($u['id'] ?? ''), (string)($u['name'] ?? ''),
                implode(',', $divisi), trim((string)($b->tim ?? '')), (string)$orders[0]['tglDatang'],
                json_encode($data, JSON_UNESCAPED_UNICODE)]);
  return ['status' => 'success', 'menungguAcc' => true, 'accId' => $id, 'divisi' => $divisi,
          'created' => 0, 'merged' => 0, 'jumlah' => count($orders)];
}

function pur_acc_baris($r) {
  $d = json_decode($r['data'], true);
  if (!is_array($d)) $d = [];
  return ['id' => $r['id'], 'waktu' => $r['waktu'], 'pemohonId' => $r['pemohon_id'], 'pemohon' => $r['pemohon'],
          'divisi' => $r['divisi'] === '' ? [] : explode(',', $r['divisi']), 'tim' => $r['tim'],
          'tglDatang' => $r['tgl_datang'], 'status' => $r['status'], 'putusOleh' => $r['putus_oleh'],
          'putusAt' => $r['putus_at'], 'alasan' => (string)($r['alasan'] ?? ''),
          'orders' => $d['orders'] ?? [], 'batchId' => $d['batchId'] ?? '', 'batchName' => $d['batchName'] ?? '',
          'hasil' => $d['hasil'] ?? null];
}

/* Daftar untuk pemanggil: yang menunggu ACC-nya + pengajuannya sendiri. */
function pur_acc_daftar($pdo, $u) {
  if (!$u) return ['status' => 'error', 'message' => 'sesi_tidak_sah'];
  pur_acc_pastikan($pdo);
  $head = pur_acc_head_akun($u);
  $admin = pur_acc_admin($u);
  $rows = $pdo->query("SELECT * FROM `order_acc`
                       WHERE `status` IN ('menunggu','diproses') OR `waktu` >= DATE_SUB(NOW(), INTERVAL 14 DAY)
                       ORDER BY `waktu` DESC LIMIT 400")->fetchAll();
  $tunggu = []; $milik = [];
  foreach ($rows as $r) {
    $x = pur_acc_baris($r);
    if ($x['status'] === 'menunggu' && ($admin || array_intersect($x['divisi'], $head))) $tunggu[] = $x;
    if ($x['pemohonId'] !== '' && $x['pemohonId'] === (string)($u['id'] ?? '')) $milik[] = $x;
  }
  return ['status' => 'success', 'head' => $head, 'admin' => $admin,
          'menunggu' => $tunggu, 'milik' => array_slice($milik, 0, 30)];
}

/* ACC / tolak. Penjaga di SERVER: head divisi pengajuan itu, atau admin
   modul Ordering. $b->orders (opsional) = jumlah yang diubah head. */
function pur_acc_putus($pdo, $u, $b) {
  if (!$u) return ['status' => 'error', 'message' => 'sesi_tidak_sah: Sesi tidak dikenali. Muat ulang halaman (Ctrl+F5).'];
  pur_acc_pastikan($pdo);
  $id = trim((string)($b->id ?? ''));
  $setuju = (($b->keputusan ?? '') === 'setuju');
  $st = $pdo->prepare("SELECT * FROM `order_acc` WHERE `id` = ?");
  $st->execute([$id]);
  $r = $st->fetch();
  if (!$r) return ['status' => 'error', 'message' => 'Pengajuan tidak ditemukan.'];
  $x = pur_acc_baris($r);
  if (!pur_acc_admin($u) && !array_intersect($x['divisi'], pur_acc_head_akun($u))) {
    return ['status' => 'error', 'message' => 'Hanya head divisi ' . implode('/', $x['divisi']) . ' yang bisa meng-ACC pengajuan ini.'];
  }
  if ($x['status'] !== 'menunggu') return ['status' => 'error', 'message' => 'Pengajuan ini sudah diputuskan (' . $x['status'] . ').'];
  $nama = (string)($u['name'] ?? '');

  if (!$setuju) {
    $alasan = trim((string)($b->alasan ?? ''));
    if ($alasan === '') return ['status' => 'error', 'message' => 'Alasan penolakan wajib diisi.'];
    $up = $pdo->prepare("UPDATE `order_acc` SET `status`='ditolak', `putus_oleh`=?, `putus_at`=NOW(), `alasan`=?
                         WHERE `id`=? AND `status`='menunggu'");
    $up->execute([$nama, $alasan, $id]);
    if ($up->rowCount() !== 1) return ['status' => 'error', 'message' => 'Pengajuan sudah diputuskan orang lain.'];
    return ['status' => 'success', 'keputusan' => 'ditolak'];
  }

  // Klaim dulu (atomik) supaya dua head yang menekan bersamaan tidak
  // melahirkan order dua kali.
  $klaim = $pdo->prepare("UPDATE `order_acc` SET `status`='diproses' WHERE `id`=? AND `status`='menunggu'");
  $klaim->execute([$id]);
  if ($klaim->rowCount() !== 1) return ['status' => 'error', 'message' => 'Pengajuan sudah diputuskan orang lain.'];

  // Jumlah yang diubah head (per nomor urut baris). 0 = baris dibuang.
  $orders = $x['orders'];
  $ubah = (isset($b->orders) && is_array($b->orders)) ? $b->orders : null;
  $kirim = [];
  foreach ($orders as $i => $o) {
    if ($ubah !== null && isset($ubah[$i]) && is_object($ubah[$i]) && isset($ubah[$i]->qty)) {
      $q = (float)$ubah[$i]->qty;
      if ($q < 0) $q = 0;
      if ((float)$o['qty'] !== $q) $o['note'] = trim(($o['note'] === '-' ? '' : $o['note']) . ' | diubah head ' . $o['qty'] . '→' . $q, ' |');
      $o['qty'] = $q;
    }
    if ((float)$o['qty'] <= 0) continue;
    $kirim[] = (object)$o;
  }
  $kembali = function () use ($pdo, $id) {
    $pdo->prepare("UPDATE `order_acc` SET `status`='menunggu' WHERE `id`=? AND `status`='diproses'")->execute([$id]);
  };
  if (!$kirim) { $kembali(); return ['status' => 'error', 'message' => 'Tidak ada barang tersisa — tolak saja pengajuannya.']; }

  $meta = (object)['batchId' => $x['batchId'], 'batchName' => $x['batchName'], 'tim' => $x['tim']];
  try {
    $hasil = pur_orders_batch($pdo, $kirim, $meta);
    // Batch tujuan gabung sudah tidak tersedia -> jadi batch baru, tidak gagal.
    if (($hasil['status'] ?? '') !== 'success' && $x['batchId'] !== '') {
      $meta->batchId = '';
      $hasil = pur_orders_batch($pdo, $kirim, $meta);
    }
  } catch (Throwable $e) {
    $kembali();
    throw $e;
  }
  if (($hasil['status'] ?? '') !== 'success') { $kembali(); return $hasil; }

  $d = json_decode($r['data'], true);
  if (!is_array($d)) $d = [];
  $d['hasil'] = ['batchId' => $hasil['batchId'] ?? '', 'created' => $hasil['created'] ?? 0, 'merged' => $hasil['merged'] ?? 0];
  $d['ordersAcc'] = array_map(function ($o) { return (array)$o; }, $kirim);
  $pdo->prepare("UPDATE `order_acc` SET `status`='disetujui', `putus_oleh`=?, `putus_at`=NOW(), `data`=? WHERE `id`=?")
      ->execute([$nama, json_encode($d, JSON_UNESCAPED_UNICODE), $id]);
  return ['status' => 'success', 'keputusan' => 'disetujui', 'created' => $hasil['created'] ?? 0,
          'merged' => $hasil['merged'] ?? 0, 'batchId' => $hasil['batchId'] ?? ''];
}

/* Pemohon menarik pengajuannya sendiri selama belum diputuskan. */
function pur_acc_batal($pdo, $u, $b) {
  if (!$u) return ['status' => 'error', 'message' => 'sesi_tidak_sah'];
  pur_acc_pastikan($pdo);
  $up = $pdo->prepare("UPDATE `order_acc` SET `status`='dibatalkan', `putus_oleh`=?, `putus_at`=NOW()
                       WHERE `id`=? AND `status`='menunggu' AND `pemohon_id`=?");
  $up->execute([(string)($u['name'] ?? ''), trim((string)($b->id ?? '')), (string)($u['id'] ?? '')]);
  if ($up->rowCount() !== 1) return ['status' => 'error', 'message' => 'Pengajuan tidak bisa dibatalkan (sudah diputuskan, atau bukan milikmu).'];
  return ['status' => 'success'];
}
