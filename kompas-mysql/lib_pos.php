<?php
/************************************************************************
 * POS LAKSAMANA MUDA — penyimpanan bersama antar perangkat (27 Okt 2026)
 * ---------------------------------------------------------------------
 * Sampai tanggal ini POS menyimpan transaksi di localStorage peramban
 * saja, jadi order yang diinput di satu komputer kasir tidak terlihat di
 * komputer lain (permintaan user: "database tidak sync kalau input dari
 * beda device").
 *
 * MENUMPANG kompas-mysql, bukan backend sendiri: database & config.php-nya
 * sudah ada di kedua server dan folder ini sudah ikut kedua workflow FTP —
 * backend baru berarti database baru di cPanel + config.php manual, dan
 * yang tertinggal membuat POS mati di satu server tanpa satu pun galat.
 *
 * TABEL SENDIRI, bukan blob `app_state`: blob itu ditulis UTUH oleh
 * Cashier & Finance > Omset dan berpagar penjaga tulis-basi. Order POS
 * ditulis PER BARIS (pos_order), jadi dua kasir yang menyimpan bersamaan
 * tidak saling menimpa.
 *
 * TIDAK ADA DELETE. Order yang dibatalkan berstatus 'batal' dan tetap
 * tersimpan — jejak pembatalan di kasir justru yang paling sering dicari.
 ************************************************************************/

function pos_pastikan() {
  static $sudah = false;
  if ($sudah) return;
  $pdo = db();
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS `pos_order` (
       `id`         VARCHAR(40)  NOT NULL PRIMARY KEY,
       `tgl`        DATE         NULL,
       `status`     VARCHAR(12)  NOT NULL DEFAULT \'\',
       `data`       LONGTEXT     NOT NULL,
       `updated_at` BIGINT       NOT NULL DEFAULT 0,
       `oleh`       VARCHAR(120) NOT NULL DEFAULT \'\',
       KEY `idx_pos_tgl` (`tgl`),
       KEY `idx_pos_status` (`status`),
       KEY `idx_pos_upd` (`updated_at`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
  /* Pengaturan POS yang DIPAKAI BERSAMA (pengguna & PIN, menu, persen SC/PB1).
     SATU baris. Setelan printer TIDAK di sini — ia milik komputer kasir
     masing-masing (printer & lebar kertasnya bisa berbeda). */
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS `pos_setting` (
       `id`         TINYINT UNSIGNED NOT NULL PRIMARY KEY,
       `data`       LONGTEXT NOT NULL,
       `updated_at` BIGINT   NOT NULL DEFAULT 0,
       `oleh`       VARCHAR(120) NOT NULL DEFAULT \'\'
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
  $sudah = true;
}

function pos_tgl_sah($t) {
  $t = (string)$t;
  if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $t, $m)) return null;
  return checkdate((int)$m[2], (int)$m[3], (int)$m[1]) ? $t : null;
}

/* Order SEJAK tanggal `dari` + SELURUH order yang masih terbuka (tanggal apa
   pun), plus setelan bersama. `ver` = cap terbaru, dipakai klien untuk
   melewatkan penggambaran ulang kalau tidak ada yang berubah. */
function pos_list($dari) {
  pos_pastikan();
  $pdo = db();
  $d = pos_tgl_sah($dari);
  if ($d === null) $d = date('Y') . '-01-01';
  $st = $pdo->prepare('SELECT `data`, `updated_at` FROM `pos_order`
                       WHERE `tgl` >= :d OR `status` = \'open\'
                       ORDER BY `updated_at` DESC LIMIT 20000');
  $st->execute(array(':d' => $d));
  $orders = array();
  $ver = 0;
  foreach ($st->fetchAll() as $r) {
    $o = json_decode($r['data'], true);
    if (!is_array($o)) continue;
    $o['updatedAt'] = (int)$r['updated_at'];
    $orders[] = $o;
    if ((int)$r['updated_at'] > $ver) $ver = (int)$r['updated_at'];
  }
  $set = null;
  $row = $pdo->query('SELECT `data`, `updated_at` FROM `pos_setting` WHERE `id` = 1')->fetch();
  if ($row) {
    $s = json_decode($row['data'], true);
    if (is_array($s)) { $s['ts'] = (int)$row['updated_at']; $set = $s; }
  }
  return array('orders' => $orders, 'setting' => $set, 'ver' => $ver);
}

/* Simpan SATU order. Penjaga urutan: kiriman yang capnya LEBIH TUA dari yang
   tersimpan ditolak dan versi server dipulangkan — kalau tidak, komputer yang
   lama offline lalu tersambung lagi akan mengembalikan order yang sudah
   dibayar di komputer lain menjadi "open". */
function pos_simpan($o, $base, $nama) {
  if (!is_array($o)) return array('ok' => false, 'error' => 'Data order tidak terbaca.');
  $id = isset($o['id']) ? trim((string)$o['id']) : '';
  if ($id === '' || strlen($id) > 40 || !preg_match('/^[A-Za-z0-9_.-]+$/', $id))
    return array('ok' => false, 'error' => 'Id order tidak sah.');
  $status = isset($o['status']) ? (string)$o['status'] : '';
  if (!in_array($status, array('open', 'paid', 'batal'), true))
    return array('ok' => false, 'error' => 'Status order tidak sah: ' . $status);
  if (!isset($o['items']) || !is_array($o['items']))
    return array('ok' => false, 'error' => 'Daftar item tidak terbaca.');
  $ua = isset($o['updatedAt']) ? (int)$o['updatedAt'] : 0;
  if ($ua <= 0) $ua = (int)round(microtime(true) * 1000);
  $tgl = pos_tgl_sah(isset($o['tgl']) ? $o['tgl'] : '');

  pos_pastikan();
  $pdo = db();
  $pdo->beginTransaction();
  try {
    $st = $pdo->prepare('SELECT `data`, `updated_at` FROM `pos_order` WHERE `id` = :id FOR UPDATE');
    $st->execute(array(':id' => $id));
    $lama = $st->fetch();
    /* Yang dibandingkan VERSI YANG DIPEGANG klien (base) dengan yang
       tersimpan, bukan cap kirimannya: kasir A yang membuka order lalu
       menyimpannya SESUDAH kasir B membayarnya punya cap lebih baru, dan
       aturan "yang terbaru menang" akan mengembalikan order lunas jadi open. */
    if ($lama && (int)$lama['updated_at'] !== (int)$base) {
      $pdo->commit();
      $srv = json_decode($lama['data'], true);
      if (is_array($srv)) $srv['updatedAt'] = (int)$lama['updated_at'];
      return array('ok' => false, 'konflik' => true, 'server' => $srv,
                   'error' => 'Order ini sudah diubah di perangkat lain.');
    }
    unset($o['_naik'], $o['_base']);
    $o['updatedAt'] = $ua;
    $json = json_encode($o, JSON_UNESCAPED_UNICODE);
    $up = $pdo->prepare('INSERT INTO `pos_order` (`id`,`tgl`,`status`,`data`,`updated_at`,`oleh`)
                         VALUES (:id,:tgl,:st,:dt,:ua,:ol)
                         ON DUPLICATE KEY UPDATE `tgl`=VALUES(`tgl`), `status`=VALUES(`status`),
                           `data`=VALUES(`data`), `updated_at`=VALUES(`updated_at`), `oleh`=VALUES(`oleh`)');
    $up->execute(array(':id' => $id, ':tgl' => $tgl, ':st' => $status, ':dt' => $json,
                       ':ua' => $ua, ':ol' => mb_potong_pos($nama)));
    $pdo->commit();
  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
  }
  return array('ok' => true, 'id' => $id, 'updatedAt' => $ua);
}

function mb_potong_pos($s) { return substr((string)$s, 0, 120); }

/* Setelan bersama. Hanya kunci yang dikenal yang disimpan — kiriman tidak
   boleh menyelundupkan setelan printer satu komputer ke semua komputer. */
function pos_setting_simpan($d, $nama) {
  if (!is_array($d)) return array('ok' => false, 'error' => 'Setelan tidak terbaca.');
  $users = (isset($d['users']) && is_array($d['users'])) ? array_values($d['users']) : array();
  $adaAdmin = false;
  foreach ($users as $u) {
    if (is_array($u) && isset($u['role']) && $u['role'] === 'admin' && (!isset($u['aktif']) || $u['aktif'] !== false)) $adaAdmin = true;
  }
  if (!$adaAdmin) return array('ok' => false, 'error' => 'Harus tetap ada minimal satu Admin aktif.');
  $sc = isset($d['sc']) ? (float)$d['sc'] : 5;
  $pb = isset($d['pb1']) ? (float)$d['pb1'] : 10;
  if ($sc < 0 || $sc > 50 || $pb < 0 || $pb > 50) return array('ok' => false, 'error' => 'Persen SC/PB1 harus 0–50.');
  $simpan = array(
    'users'    => $users,
    'menu'     => (isset($d['menu']) && is_array($d['menu'])) ? $d['menu'] : new stdClass(),
    'menuBaru' => (isset($d['menuBaru']) && is_array($d['menuBaru'])) ? array_values($d['menuBaru']) : array(),
    'sc'       => $sc,
    'pb1'      => $pb
  );
  $ts = (int)round(microtime(true) * 1000);
  pos_pastikan();
  $st = db()->prepare('INSERT INTO `pos_setting` (`id`,`data`,`updated_at`,`oleh`) VALUES (1,:dt,:ts,:ol)
                       ON DUPLICATE KEY UPDATE `data`=VALUES(`data`), `updated_at`=VALUES(`updated_at`), `oleh`=VALUES(`oleh`)');
  $st->execute(array(':dt' => json_encode($simpan, JSON_UNESCAPED_UNICODE), ':ts' => $ts, ':ol' => mb_potong_pos($nama)));
  return array('ok' => true, 'ts' => $ts);
}

/* ---------------------------------------------------------------------
   PINDAH SERVER / DOMAIN (27 Okt 2026, permintaan user: "suatu saat mau
   pindahin, tolong dibuat gampang — data lain jangan terganggu, data tak
   penting jangan ikut nyangkut").

   SELURUH data POS hanya ada di DUA tabel ini: pos_order & pos_setting.
   Tidak ada satu pun tabel/blob modul lain yang disentuh POS, jadi
   memindahkannya cukup memindahkan dua tabel itu — lewat berkas cadangan
   (posEkspor di server lama, posImpor di server baru), atau ekspor
   phpMyAdmin kedua tabel itu saja.

   IMPOR HANYA MENAMBAH. Order yang id-nya sudah ada di server tujuan
   DILEWATI, bukan ditimpa; setelan hanya dipasang kalau server tujuan
   belum punya. Impor yang bisa menimpa berarti cadangan lama yang
   kebetulan diunggah ulang mengembalikan order lunas jadi "open".
   --------------------------------------------------------------------- */
function pos_ekspor() {
  pos_pastikan();
  $pdo = db();
  $orders = array();
  foreach ($pdo->query('SELECT `data`, `updated_at` FROM `pos_order` ORDER BY `updated_at`')->fetchAll() as $r) {
    $o = json_decode($r['data'], true);
    if (!is_array($o)) continue;
    $o['updatedAt'] = (int)$r['updated_at'];
    $orders[] = $o;
  }
  $set = null;
  $row = $pdo->query('SELECT `data`, `updated_at` FROM `pos_setting` WHERE `id` = 1')->fetch();
  if ($row) { $s = json_decode($row['data'], true); if (is_array($s)) { $s['ts'] = (int)$row['updated_at']; $set = $s; } }
  return array('format' => 'lm-pos-cadangan', 'versi' => 1, 'dibuat' => date('c'),
               'orders' => $orders, 'setting' => $set);
}

function pos_impor($orders, $setting, $nama) {
  if (!is_array($orders)) $orders = array();
  if (count($orders) > 2000) return array('ok' => false, 'error' => 'Kirim paling banyak 2000 order per permintaan.');
  pos_pastikan();
  $pdo = db();
  $baru = 0; $ada = 0; $tolak = 0;
  $cek = $pdo->prepare('SELECT 1 FROM `pos_order` WHERE `id` = :id');
  $ins = $pdo->prepare('INSERT INTO `pos_order` (`id`,`tgl`,`status`,`data`,`updated_at`,`oleh`)
                        VALUES (:id,:tgl,:st,:dt,:ua,:ol)');
  $pdo->beginTransaction();
  try {
    foreach ($orders as $o) {
      if (!is_array($o)) { $tolak++; continue; }
      $id = isset($o['id']) ? trim((string)$o['id']) : '';
      $status = isset($o['status']) ? (string)$o['status'] : '';
      if ($id === '' || strlen($id) > 40 || !preg_match('/^[A-Za-z0-9_.-]+$/', $id)
          || !in_array($status, array('open', 'paid', 'batal'), true)
          || !isset($o['items']) || !is_array($o['items'])) { $tolak++; continue; }
      $cek->execute(array(':id' => $id));
      if ($cek->fetch()) { $ada++; continue; }
      unset($o['_naik'], $o['_base']);
      $ua = isset($o['updatedAt']) ? (int)$o['updatedAt'] : 0;
      if ($ua <= 0) $ua = (int)round(microtime(true) * 1000);
      $o['updatedAt'] = $ua;
      $ins->execute(array(':id' => $id, ':tgl' => pos_tgl_sah(isset($o['tgl']) ? $o['tgl'] : ''),
                          ':st' => $status, ':dt' => json_encode($o, JSON_UNESCAPED_UNICODE),
                          ':ua' => $ua, ':ol' => mb_potong_pos($nama)));
      $baru++;
    }
    $pdo->commit();
  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
  }
  $setDipasang = false;
  if (is_array($setting)) {
    $row = $pdo->query('SELECT 1 FROM `pos_setting` WHERE `id` = 1')->fetch();
    if (!$row) {
      $r = pos_setting_simpan($setting, $nama);
      if (!$r['ok']) return array('ok' => false, 'error' => 'Order masuk (' . $baru . '), tapi setelan ditolak: ' . $r['error'], 'baru' => $baru, 'ada' => $ada, 'tolak' => $tolak);
      $setDipasang = true;
    }
  }
  return array('ok' => true, 'baru' => $baru, 'ada' => $ada, 'tolak' => $tolak, 'setting' => $setDipasang);
}
