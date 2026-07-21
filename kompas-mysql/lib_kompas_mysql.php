<?php
/************************************************************************
 * KOMPAS LAKSAMANA — Backend PHP + MySQL (Target & Omset Tracker)
 * ---------------------------------------------------------------------
 * Menggantikan localStorage. Polanya sama dengan modul lain:
 *
 *   - Aplikasi mengirim state UTUH, backend menulis PER-BARIS.
 *   - Penjaga `updated_at`: baris kiriman yang LEBIH LAMA tidak menimpa
 *     baris server yang lebih baru.
 *   - Penghapusan dibatasi updated_at terbaru di kiriman, supaya baris
 *     yang baru dibuat orang lain tidak ikut terhapus oleh pengirim yang
 *     datanya sudah basi.
 *   - Sumber kebenaran tiap baris = kolom `data` (JSON utuh).
 *
 * File ini HANYA berisi fungsi (tanpa efek samping saat di-include).
 ************************************************************************/

if (file_exists(__DIR__ . '/config.local.php')) require_once __DIR__ . '/config.local.php';
else                                            require_once __DIR__ . '/config.php';

function db() {
  static $pdo = null;
  if ($pdo !== null) return $pdo;
  $dsn = 'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
  $pdo = new PDO($dsn, DB_USER, DB_PASS, array(
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
  ));
  return $pdo;
}
function db_lock() {
  $st = db()->prepare('SELECT GET_LOCK(:k, 10) AS ok');
  $st->execute(array(':k' => DB_NAME . ':kompas_save'));
  $row = $st->fetch();
  if (empty($row['ok'])) throw new Exception('Server sedang sibuk menyimpan, coba lagi sebentar.');
  return true;
}
function db_unlock($h) {
  if (!$h) return;
  $st = db()->prepare('SELECT RELEASE_LOCK(:k)');
  $st->execute(array(':k' => DB_NAME . ':kompas_save'));
}

function json_enc($v) { return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); }
/* json_decode TANPA flag assoc.
   Dengan assoc=true, objek kosong {} dan array kosong [] jadi tidak bisa
   dibedakan — `targets.cashier` yang kosong akan kembali sebagai [] lalu
   menghancurkan bentuk datanya diam-diam saat disimpan ulang. */
function json_dec($s) { $v = json_decode((string)$s); return $v === null ? new stdClass() : $v; }
function ms($v) { $n = (int)$v; return ($n > 0 && $n < 4102444800000) ? $n : 0; }

/* ==================== BACA ==================== */
function baca_state() {
  $pdo = db();
  $out = array();

  $daily = new stdClass();
  foreach ($pdo->query('SELECT tanggal, data FROM `daily` ORDER BY tanggal ASC') as $r) {
    $daily->{$r['tanggal']} = json_dec($r['data']);
  }
  $out['daily'] = $daily;

  $targets = new stdClass();
  foreach ($pdo->query('SELECT bulan, data FROM `targets` ORDER BY bulan ASC') as $r) {
    $targets->{$r['bulan']} = json_dec($r['data']);
  }
  $out['targets'] = $targets;

  foreach (array('cashiers', 'pics') as $t) {
    $rows = array();
    foreach ($pdo->query('SELECT data FROM `' . $t . '` ORDER BY name ASC') as $r) {
      $d = json_dec($r['data']);
      if (is_object($d)) $rows[] = $d;
    }
    $out[$t] = $rows;
  }

  $set = new stdClass();
  foreach ($pdo->query('SELECT k, v FROM `settings`') as $r) $set->{$r['k']} = json_dec($r['v']);
  $out['settings'] = $set;

  $log = array();
  foreach ($pdo->query('SELECT at, `by`, action, detail FROM `log` ORDER BY at DESC, id DESC LIMIT 300') as $r) {
    $log[] = array('at' => $r['at'], 'by' => $r['by'], 'action' => $r['action'], 'detail' => $r['detail']);
  }
  $out['log'] = $log;

  return $out;
}

/* ==================== SIMPAN ====================
   Koleksi yang TIDAK dikirim sama sekali tidak disentuh — bukan
   dikosongkan. Ini yang membuat kiriman parsial (atau aplikasi yang gagal
   memuat sebagian) tidak menghapus data. */
function save_all($state) {
  if (!is_array($state) && !is_object($state)) throw new Exception('Payload kosong/invalid');
  $state = (object)$state;
  $pdo = db();
  $pdo->beginTransaction();
  try {
    $n = array();

    if (isset($state->daily)) {
      $st = $pdo->prepare(
        'INSERT INTO `daily` (tanggal,omset_total,omset_food,omset_bev,traffic,pax,transaksi,review,updated_at,updated_by,data)
         VALUES (:t,:ot,:of,:ob,:tr,:px,:trx,:rv,:ua,:ub,:d)
         ON DUPLICATE KEY UPDATE
           omset_total=IF(VALUES(updated_at)>=updated_at,VALUES(omset_total),omset_total),
           omset_food =IF(VALUES(updated_at)>=updated_at,VALUES(omset_food), omset_food),
           omset_bev  =IF(VALUES(updated_at)>=updated_at,VALUES(omset_bev),  omset_bev),
           traffic    =IF(VALUES(updated_at)>=updated_at,VALUES(traffic),    traffic),
           pax        =IF(VALUES(updated_at)>=updated_at,VALUES(pax),        pax),
           transaksi  =IF(VALUES(updated_at)>=updated_at,VALUES(transaksi),  transaksi),
           review     =IF(VALUES(updated_at)>=updated_at,VALUES(review),     review),
           updated_by =IF(VALUES(updated_at)>=updated_at,VALUES(updated_by), updated_by),
           data       =IF(VALUES(updated_at)>=updated_at,VALUES(data),       data),
           updated_at =IF(VALUES(updated_at)>=updated_at,VALUES(updated_at), updated_at)');
      $c = 0; $maxU = 0; $keys = array();
      foreach ((array)$state->daily as $tgl => $e) {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$tgl)) continue;
        $e = (object)$e;
        $num = function ($k) use ($e) { return isset($e->$k) ? (int)$e->$k : 0; };
        $tot = $num('omsetFood') + $num('omsetBev') + $num('omsetLain');
        $ua  = ms(isset($e->updatedAtMs) ? $e->updatedAtMs : 0);
        if ($ua > $maxU) $maxU = $ua;
        $keys[] = $tgl;
        $st->execute(array(
          ':t' => $tgl, ':ot' => $tot, ':of' => $num('omsetFood'), ':ob' => $num('omsetBev'),
          ':tr' => $num('traffic'), ':px' => $num('pax'), ':trx' => $num('transaksi'),
          ':rv' => $num('review'), ':ua' => $ua,
          ':ub' => isset($e->updatedBy) ? (string)$e->updatedBy : '',
          ':d'  => json_enc($e)));
        $c++;
      }
      hapus_hilang($pdo, 'daily', 'tanggal', $keys, $maxU);
      $n['daily'] = $c;
    }

    if (isset($state->targets)) {
      $st = $pdo->prepare(
        'INSERT INTO `targets` (bulan,omset_total,updated_at,data) VALUES (:b,:ot,:ua,:d)
         ON DUPLICATE KEY UPDATE
           omset_total=IF(VALUES(updated_at)>=updated_at,VALUES(omset_total),omset_total),
           data       =IF(VALUES(updated_at)>=updated_at,VALUES(data),       data),
           updated_at =IF(VALUES(updated_at)>=updated_at,VALUES(updated_at), updated_at)');
      $c = 0; $maxU = 0; $keys = array();
      foreach ((array)$state->targets as $bln => $t) {
        if (!preg_match('/^\d{4}-\d{2}$/', (string)$bln)) continue;
        $t = (object)$t;
        $ua = ms(isset($t->updatedAtMs) ? $t->updatedAtMs : 0);
        if ($ua > $maxU) $maxU = $ua;
        $keys[] = $bln;
        $st->execute(array(':b' => $bln,
          ':ot' => isset($t->omsetTotal) ? (int)$t->omsetTotal : 0,
          ':ua' => $ua, ':d' => json_enc($t)));
        $c++;
      }
      hapus_hilang($pdo, 'targets', 'bulan', $keys, $maxU);
      $n['targets'] = $c;
    }

    foreach (array('cashiers', 'pics') as $tab) {
      if (!isset($state->$tab)) continue;
      $st = $pdo->prepare(
        'INSERT INTO `' . $tab . '` (id,name,active,updated_at,data) VALUES (:i,:n,:a,:ua,:d)
         ON DUPLICATE KEY UPDATE
           name      =IF(VALUES(updated_at)>=updated_at,VALUES(name),      name),
           active    =IF(VALUES(updated_at)>=updated_at,VALUES(active),    active),
           data      =IF(VALUES(updated_at)>=updated_at,VALUES(data),      data),
           updated_at=IF(VALUES(updated_at)>=updated_at,VALUES(updated_at),updated_at)');
      $c = 0; $maxU = 0; $keys = array();
      foreach ((array)$state->$tab as $row) {
        $row = (object)$row;
        if (empty($row->id)) continue;
        $ua = ms(isset($row->updatedAtMs) ? $row->updatedAtMs : 0);
        if ($ua > $maxU) $maxU = $ua;
        $keys[] = (string)$row->id;
        $st->execute(array(':i' => (string)$row->id,
          ':n' => isset($row->name) ? (string)$row->name : '',
          ':a' => (!isset($row->active) || $row->active) ? 1 : 0,
          ':ua' => $ua, ':d' => json_enc($row)));
        $c++;
      }
      hapus_hilang($pdo, $tab, 'id', $keys, $maxU);
      $n[$tab] = $c;
    }

    if (isset($state->settings)) {
      $st = $pdo->prepare('INSERT INTO `settings` (k,v,updated_at) VALUES (:k,:v,:ua)
                           ON DUPLICATE KEY UPDATE v=VALUES(v), updated_at=VALUES(updated_at)');
      $c = 0;
      foreach ((array)$state->settings as $k => $v) {
        $st->execute(array(':k' => (string)$k, ':v' => json_enc($v), ':ua' => (int)(microtime(true) * 1000)));
        $c++;
      }
      $n['settings'] = $c;
    }

    /* Log APPEND-ONLY: hanya baris yang belum ada yang ditambahkan, dan
       tidak pernah ada yang dihapus. Riwayat siapa-mengubah-apa harus
       bertahan walau aplikasi mengirim daftar yang lebih pendek. */
    if (isset($state->log) && is_array($state->log)) {
      $ins = $pdo->prepare('INSERT INTO `log` (at,`by`,action,detail) VALUES (:at,:by,:ac,:de)');
      $ada = $pdo->prepare('SELECT 1 FROM `log` WHERE at=:at AND `by`=:by AND action=:ac AND detail=:de LIMIT 1');
      $c = 0;
      foreach (array_reverse($state->log) as $l) {
        $l = (object)$l;
        $at = isset($l->at) ? date('Y-m-d H:i:s', strtotime($l->at)) : date('Y-m-d H:i:s');
        $p = array(':at' => $at,
                   ':by' => isset($l->by) ? (string)$l->by : '',
                   ':ac' => isset($l->action) ? (string)$l->action : '',
                   ':de' => isset($l->detail) ? (string)$l->detail : '');
        $ada->execute($p);
        if (!$ada->fetch()) { $ins->execute($p); $c++; }
      }
      $n['log'] = $c;
    }

    $pdo->commit();
    return array('saved' => true, 'jumlah' => $n, 'ts' => gmdate('c'));
  } catch (Throwable $e) {
    $pdo->rollBack();
    throw $e;
  }
}

/* Hapus baris yang tidak ada di kiriman — dengan dua pengaman:
   1. kiriman kosong tidak menghapus apa pun (lindungi dari state kosong
      yang tak sengaja, mis. aplikasi gagal memuat lalu menyimpan);
   2. baris yang LEBIH BARU dari apa pun di kiriman tidak dihapus, karena
      mustahil diketahui pengirimnya — itu baris yang baru dibuat orang
      lain saat pengirim masih membuka data lama. */
function hapus_hilang($pdo, $tabel, $kolom, $keys, $batas) {
  if (count($keys) === 0) return;
  $place = implode(',', array_fill(0, count($keys), '?'));
  $sql = 'DELETE FROM `' . $tabel . '` WHERE `' . $kolom . '` NOT IN (' . $place . ')';
  $args = $keys;
  if ($batas > 0) { $sql .= ' AND updated_at <= ?'; $args[] = $batas; }
  $st = $pdo->prepare($sql);
  $st->execute($args);
}

/* ==================== DIAGNOSTIK ==================== */
function ping() {
  return array('pong' => true, 'backend' => 'php-mysql',
               'env' => defined('ENV_LABEL') ? ENV_LABEL : '?',
               'db' => DB_NAME, 'ts' => gmdate('c'));
}
function stats() {
  $pdo = db();
  $out = array('backend' => 'php-mysql',
               'env' => defined('ENV_LABEL') ? ENV_LABEL : '?', 'db' => DB_NAME);
  foreach (array('daily', 'targets', 'cashiers', 'pics', 'settings', 'log') as $t)
    $out[$t] = (int)$pdo->query('SELECT COUNT(*) c FROM `' . $t . '`')->fetch()['c'];
  $out['ts'] = gmdate('c');
  return $out;
}
