<?php
/************************************************************************
 * HOWANDI LIFE OS — Lapisan data MySQL
 * ---------------------------------------------------------------------
 * Kontrak dijaga SAMA PERSIS dengan Apps Script lama:
 *   GET  ?action=getAll&token=...  -> {ok:true, data:{...S...}}
 *   POST {action:'saveAll', token, data:S} -> {ok:true, data:{...}}
 *
 * ATURAN JSON: selalu decode TANPA flag assoc.
 *   json_decode('{}', true) dan json_decode('[]', true) sama-sama
 *   menghasilkan [] — bedanya hilang permanen. Kalau objek kosong kembali
 *   ke frontend sebagai Array, properti bernama yang ditulis ke situ akan
 *   dibuang JSON.stringify saat simpan berikutnya: data hilang tanpa pesan
 *   error. Pelajaran ini datang dari modul HR; di sini dipakai sejak awal.
 *
 * PENJAGA BENTROK: sengaja TIDAK ADA, sama seperti Apps Script lama
 * (simpan = timpa). Ini OS pribadi satu orang. Dua tab/perangkat yang
 * dibuka bersamaan masih bisa saling menimpa — pola penutupnya ada di
 * hr-mysql/ (_rev + SELECT ... FOR UPDATE) kalau nanti diperlukan.
 ************************************************************************/

// Koleksi objek ber-id: nama di app -> nama tabel.
function hl_koleksi() {
  return [
    'businesses' => 'businesses',
    'projects'   => 'projects',
    'tasks'      => 'tasks',
    'goals'      => 'goals',
    'dreams'     => 'dreams',
    'roadmap'    => 'roadmap',
    'content'    => 'content',
    'learning'   => 'learning',
    'habits'     => 'habits',
    'events'     => 'events',
    'assets'     => 'assets',
    'reviews'    => 'reviews',
  ];
}

/* Kolom inti per tabel: kolom => field di app. Sisanya ikut di `data`. */
function hl_kolom() {
  return [
    'businesses' => ['nama'=>'name', 'bidang'=>'field'],
    'projects'   => ['nama'=>'name', 'biz'=>'biz', 'stage'=>'stage', 'pic'=>'pic', 'due'=>'due'],
    'tasks'      => ['nama'=>'name', 'biz'=>'biz', 'project'=>'project', 'owner'=>'owner',
                     'due'=>'due', 'done'=>'done'],
    'goals'      => ['nama'=>'name', 'area'=>'area'],
    'dreams'     => ['judul'=>'title', 'kategori'=>'cat', 'status'=>'status', 'tahun'=>'year'],
    'roadmap'    => ['judul'=>'title', 'tahun'=>'year', 'done'=>'done'],
    'content'    => ['judul'=>'title', 'channel'=>'channel', 'platform'=>'platform',
                     'stage'=>'stage', 'tanggal'=>'date'],
    'learning'   => ['judul'=>'title', 'jenis'=>'type', 'status'=>'status'],
    'habits'     => ['nama'=>'name', 'streak'=>'streak'],
    'events'     => ['judul'=>'title', 'tanggal'=>'date', 'jenis'=>'type'],
    'assets'     => ['nama'=>'name', 'kategori'=>'cat'],
    'reviews'    => ['week_start'=>'weekStart'],
    'ledger'     => ['bulan'=>'month', 'scope'=>'scope', 'income'=>'income', 'expense'=>'expense'],
  ];
}

// Kolom yang boleh NULL — bedakan "kosong" dari "tidak diisi".
function hl_kolom_null() {
  return ['dreams' => ['tahun'], 'roadmap' => ['tahun']];
}

/* Kunci top-level yang BUKAN koleksi ber-id. Disimpan di tabel settings
   sebagai JSON. `channels` dan `dump` termasuk di sini karena isinya
   ARRAY STRING BIASA (bukan objek ber-id) — urutan dump penting (unshift =
   terbaru di atas) dan JSON menjaganya tanpa perlu kolom urutan. */
function hl_settings_keys() {
  return ['firstRun', 'mood', 'energy', 'focus', 'weeklyTarget', 'auth', 'channels', 'dump'];
}

function hl_pdo() {
  $dsn = 'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
  return new PDO($dsn, DB_USER, DB_PASS, [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
  ]);
}

// =====================================================================
// BACA
// =====================================================================
function hl_ambil_semua($pdo) {
  $out = [];

  foreach (hl_koleksi() as $appKey => $tabel) {
    $rows = $pdo->query("SELECT `data` FROM `$tabel`")->fetchAll();
    $list = [];
    foreach ($rows as $r) {
      $o = json_decode($r['data']);          // tanpa assoc: {} tetap {}
      if (is_object($o)) $list[] = $o;
    }
    $out[$appKey] = $list;
  }

  // finance di app cuma pembungkus { ledger: [...] } — dirakit ulang di sini.
  $led = [];
  foreach ($pdo->query("SELECT `data` FROM `ledger` ORDER BY `bulan`")->fetchAll() as $r) {
    $o = json_decode($r['data']);
    if (is_object($o)) $led[] = $o;
  }
  $out['finance'] = (object)['ledger' => $led];

  // settings: skalar, auth, channels, dump
  foreach ($pdo->query("SELECT `k`, `v` FROM `settings`")->fetchAll() as $r) {
    $out[$r['k']] = json_decode($r['v']);
  }

  // Nilai bawaan kalau baris settings belum ada — bentuknya HARUS sama
  // dengan emptyState() di frontend, kalau tidak migrate() akan menimpanya.
  $bawaan = ['firstRun' => true, 'mood' => 3, 'energy' => 4, 'focus' => '',
             'weeklyTarget' => '', 'auth' => null, 'channels' => [], 'dump' => []];
  foreach ($bawaan as $k => $v) {
    if (!array_key_exists($k, $out)) {
      $out[$k] = ($k === 'auth') ? (object)['enabled' => false, 'hash' => ''] : $v;
    }
  }

  return $out;
}

// =====================================================================
// TULIS
// =====================================================================

/* Nilai kolom inti dari record app (stdClass). Selalu string/num — TIDAK
   pernah array/objek; yang bersarang biar dipegang `data`. */
function hl_nilai($rec, $field, $bolehNull) {
  if (!property_exists($rec, $field)) return $bolehNull ? null : '';
  $v = $rec->$field;
  if ($v === null) return $bolehNull ? null : '';
  if (is_bool($v)) return $v ? 1 : 0;
  if (is_array($v) || is_object($v)) return $bolehNull ? null : '';
  return $v;
}

function hl_simpan_koleksi($pdo, $tabel, $list) {
  $peta  = hl_kolom()[$tabel];
  $nulls = hl_kolom_null()[$tabel] ?? [];
  $kolom = array_keys($peta);

  $ids = [];
  foreach ($list as $rec) {
    if (!is_object($rec) || !isset($rec->id) || $rec->id === '') continue;
    $ids[] = $rec->id;

    $cols = array_merge(['id'], $kolom, ['data']);
    $ph   = implode(',', array_fill(0, count($cols), '?'));
    $upd  = [];
    foreach (array_merge($kolom, ['data']) as $c) $upd[] = "`$c`=VALUES(`$c`)";

    $vals = [$rec->id];
    foreach ($kolom as $c) $vals[] = hl_nilai($rec, $peta[$c], in_array($c, $nulls, true));
    $vals[] = json_encode($rec, JSON_UNESCAPED_UNICODE);

    $sql = "INSERT INTO `$tabel` (`" . implode('`,`', $cols) . "`) VALUES ($ph)
            ON DUPLICATE KEY UPDATE " . implode(',', $upd);
    $pdo->prepare($sql)->execute($vals);
  }

  // Baris yang hilang dari payload = dihapus di UI (client selalu kirim utuh).
  if ($ids) {
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $pdo->prepare("DELETE FROM `$tabel` WHERE `id` NOT IN ($ph)")->execute($ids);
  } else {
    $pdo->exec("DELETE FROM `$tabel`");
  }
}

function hl_simpan_settings($pdo, $data) {
  $st = $pdo->prepare("INSERT INTO `settings` (`k`, `v`) VALUES (?,?)
                       ON DUPLICATE KEY UPDATE `v`=VALUES(`v`)");
  foreach (hl_settings_keys() as $k) {
    if (!property_exists($data, $k)) continue;
    $st->execute([$k, json_encode($data->$k, JSON_UNESCAPED_UNICODE)]);
  }
}

/**
 * Simpan seluruh state. Mengembalikan ['ok'=>bool, 'error'=>?string].
 */
function hl_simpan_semua($pdo, $data) {
  // Penjaga payload rusak: jangan pernah mengosongkan tabel gara-gara
  // kiriman cacat. `tasks` dipakai sebagai penanda bentuk yang benar —
  // boleh ARRAY KOSONG, yang ditolak cuma kalau field-nya hilang/bukan array.
  if (!is_object($data) || !isset($data->tasks) || !is_array($data->tasks)) {
    return ['ok' => false, 'error' => 'payload_rusak'];
  }

  $pdo->beginTransaction();
  try {
    foreach (hl_koleksi() as $appKey => $tabel) {
      hl_simpan_koleksi($pdo, $tabel,
        isset($data->$appKey) && is_array($data->$appKey) ? $data->$appKey : []);
    }
    // finance:{ledger:[]} -> tabel ledger
    $led = (isset($data->finance) && is_object($data->finance) && isset($data->finance->ledger)
            && is_array($data->finance->ledger)) ? $data->finance->ledger : [];
    hl_simpan_koleksi($pdo, 'ledger', $led);

    hl_simpan_settings($pdo, $data);
    $pdo->commit();
    return ['ok' => true];
  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
  }
}

function hl_stats($pdo) {
  $out = [];
  foreach (hl_koleksi() as $appKey => $tabel) {
    $out[$appKey] = (int)$pdo->query("SELECT COUNT(*) c FROM `$tabel`")->fetch()['c'];
  }
  foreach (['ledger', 'settings'] as $t) {
    $out[$t] = (int)$pdo->query("SELECT COUNT(*) c FROM `$t`")->fetch()['c'];
  }
  return $out;
}
