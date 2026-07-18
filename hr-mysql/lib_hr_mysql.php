<?php
/************************************************************************
 * HR / PEOPLE OS — Lapisan data MySQL
 * ---------------------------------------------------------------------
 * Kontrak dijaga SAMA PERSIS dengan Apps Script lama supaya frontend
 * cukup ganti URL:
 *   GET  ?action=getAll  -> {ok:true, data:{...S..., _rev, _savedAt, _savedBy}}
 *   POST {action:'saveAll', data:S, baseRev, by}
 *        -> {ok:true, data:{rev}}
 *        -> {ok:false, error:'conflict', savedBy, savedAt, rev}
 *
 * PENJAGA BENTROK (_rev):
 *   Client mengirim baseRev = revisi yang dia muat. Kalau server sudah
 *   lebih baru, simpanan DITOLAK — bukan digabung, bukan ditimpa. Ini
 *   memang galak, tapi HR menyimpan hal yang tidak boleh hilang diam-diam
 *   (SP, nilai review, poin). Frontend sudah punya modal "Muat ulang".
 *
 *   Pengecekan rev + penulisan HARUS satu transaksi dengan
 *   SELECT ... FOR UPDATE. Tanpa itu dua simpan bersamaan bisa sama-sama
 *   membaca rev=14, sama-sama lolos, dan yang belakangan menimpa yang
 *   duluan — persis lubang yang mau ditutup.
 ************************************************************************/

// ---------------------------------------------------------------------
// Koleksi array biasa: nama di app -> nama tabel.
// `audit` SENGAJA tidak di sini: append-only, ditangani terpisah.
// ---------------------------------------------------------------------
function hr_koleksi() {
  return [
    'divisions'       => 'divisions',
    'employees'       => 'employees',
    'kpiTemplates'    => 'kpi_templates',
    'okrs'            => 'okrs',
    'reviews'         => 'reviews',
    'competencies'    => 'competencies',
    'trainings'       => 'trainings',
    'trainingRecords' => 'training_records',
    'coachings'       => 'coachings',
    'rewards'         => 'rewards',
    'badges'          => 'badges',
    'violations'      => 'violations',
    'feedbacks'       => 'feedbacks',
    'careerPaths'     => 'career_paths',
    'successions'     => 'successions',
    'moods'           => 'moods',
    'suggestions'     => 'suggestions',
    'calendar'        => 'calendar',
  ];
}

/* Kolom inti per tabel: kolom => field di app.
   Sisanya ikut di `data` (JSON) yang jadi sumber kebenaran. */
function hr_kolom() {
  return [
    'divisions'       => ['nama'=>'name', 'warna'=>'color'],
    'employees'       => ['nama'=>'name', 'jabatan'=>'role', 'div_id'=>'divId',
                          'tingkat'=>'level', 'app_role'=>'appRole',
                          'join_date'=>'joinDate', 'status'=>'status'],
    'kpi_templates'   => ['div_id'=>'divId'],
    'okrs'            => ['owner_type'=>'ownerType', 'owner_id'=>'ownerId', 'periode'=>'period'],
    'reviews'         => ['emp_id'=>'empId', 'bulan'=>'month', 'status'=>'status'],
    'competencies'    => ['emp_id'=>'empId'],
    'trainings'       => ['judul'=>'title', 'div_id'=>'divId', 'jenis'=>'type', 'mandatory'=>'mandatory'],
    'training_records'=> ['training_id'=>'trainingId', 'emp_id'=>'empId',
                          'status'=>'status', 'skor'=>'score', 'tanggal'=>'date'],
    'coachings'       => ['emp_id'=>'empId', 'coach_id'=>'coachId', 'tanggal'=>'date', 'status'=>'status'],
    'rewards'         => ['emp_id'=>'empId', 'tanggal'=>'date', 'jenis'=>'type', 'points'=>'points'],
    'badges'          => ['emp_id'=>'empId', 'bulan'=>'month', 'badge'=>'badge'],
    'violations'      => ['emp_id'=>'empId', 'tanggal'=>'date', 'jenis'=>'type',
                          'severity'=>'severity', 'sp'=>'sp', 'status'=>'status'],
    'feedbacks'       => ['emp_id'=>'empId', 'tanggal'=>'date', 'kind'=>'kind'],
    'career_paths'    => ['track'=>'track'],
    'successions'     => ['posisi'=>'position', 'emp_id'=>'empId', 'readiness'=>'readiness'],
    'moods'           => ['emp_id'=>'empId', 'tanggal'=>'date', 'mood'=>'mood'],
    'suggestions'     => ['emp_id'=>'empId', 'tanggal'=>'date', 'status'=>'status'],
    'calendar'        => ['tanggal'=>'date', 'kind'=>'kind', 'judul'=>'title'],
  ];
}

/* Kolom yang boleh NULL — bedakan "kosong" dari "tidak diisi".
   suggestions.emp_id: saran anonim WAJIB tersimpan sebagai NULL. */
function hr_kolom_null() {
  return ['suggestions' => ['emp_id'], 'moods' => ['mood'],
          'training_records' => ['skor']];
}

function hr_pdo() {
  $dsn = 'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
  return new PDO($dsn, DB_USER, DB_PASS, [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
  ]);
}

// =====================================================================
// BACA
//
// ATURAN PENTING: JSON di-decode TANPA flag assoc, jadi objek tetap
// stdClass dan array tetap array.
//
// Kenapa ini bukan gaya-gayaan: json_decode('{}', true) dan
// json_decode('[]', true) SAMA-SAMA menghasilkan []. Bedanya hilang
// permanen. Kalau peta kosong dikirim balik sebagai [], frontend memegang
// Array, menulis properti bernama ke situ (S.kpiActuals['d_kitchen']=...),
// lalu JSON.stringify MEMBUANG properti itu saat menyimpan. Hasilnya:
// nilai KPI / layer review hilang, layar tetap bilang "tersimpan", dan
// tidak ada satu pun pesan error. Paling kena: kpiActuals, monthlyInputs,
// dan reviews.layers yang memang mulai dari {}.
// =====================================================================
function hr_ambil_semua($pdo) {
  $out = [];

  foreach (hr_koleksi() as $appKey => $tabel) {
    $rows = $pdo->query("SELECT `data` FROM `$tabel`")->fetchAll();
    $list = [];
    foreach ($rows as $r) {
      $o = json_decode($r['data']);          // tanpa assoc: {} tetap {}
      if (is_object($o)) $list[] = $o;
    }
    $out[$appKey] = $list;                   // koleksi memang LIST -> [] benar
  }

  // audit: terbaru dulu — frontend memakai unshift(), jadi urutannya menurun.
  $rows = $pdo->query("SELECT `id`, `at`, `user_id`, `user_name`, `action`, `detail`
                       FROM `audit` ORDER BY `at` DESC, `id` DESC")->fetchAll();
  $out['audit'] = array_map(function ($r) {
    return (object)['id' => $r['id'], 'at' => $r['at'], 'userId' => $r['user_id'],
            'userName' => $r['user_name'], 'action' => $r['action'],
            'detail' => $r['detail'] === null ? '' : $r['detail']];
  }, $rows);

  // kpiActuals: baris -> peta bersarang { divId: { bulan: { itemId: nilai } } }
  // Tiga tingkat peta, nilai terdalam angka. Dipaksa objek di tiap tingkat.
  $ka = [];
  foreach ($pdo->query("SELECT `div_id`, `bulan`, `item_id`, `nilai` FROM `kpi_actuals`")->fetchAll() as $r) {
    $ka[$r['div_id']][$r['bulan']][$r['item_id']] =
      $r['nilai'] === null ? null : (float)$r['nilai'];
  }
  foreach ($ka as $d => $perBulan) {
    foreach ($perBulan as $b => $perItem) $ka[$d][$b] = (object)$perItem;
    $ka[$d] = (object)$ka[$d];
  }
  $out['kpiActuals'] = (object)$ka;

  // monthlyInputs: baris -> peta { empId: { bulan: {...isi...} } }
  // Dua tingkat peta; isi terdalam dibiarkan apa adanya (sudah stdClass).
  $mi = [];
  foreach ($pdo->query("SELECT `emp_id`, `bulan`, `data` FROM `monthly_inputs`")->fetchAll() as $r) {
    $o = json_decode($r['data']);
    $mi[$r['emp_id']][$r['bulan']] = is_object($o) ? $o : (object)[];
  }
  foreach ($mi as $e => $perBulan) $mi[$e] = (object)$perBulan;
  $out['monthlyInputs'] = (object)$mi;

  // settings + kunci top-level lain yang disimpan di sana
  $set = [];
  foreach ($pdo->query("SELECT `k`, `v` FROM `settings`")->fetchAll() as $r) {
    $nilai = json_decode($r['v']);           // tanpa assoc: bentuk asli terjaga
    if (strpos($r['k'], 'extra:') === 0) {
      // kunci top-level tak dikenal, disimpan supaya tidak hilang
      $out[substr($r['k'], 6)] = $nilai;
    } else {
      $set[$r['k']] = $nilai;
    }
  }
  // settings adalah PETA, bukan list. Kalau kosong harus {} — bukan [] —
  // supaya migrate() di frontend mengisinya sebagai objek, bukan Array.
  $out['settings'] = (object)$set;

  $m = $pdo->query("SELECT rev, saved_at, saved_by, versi FROM meta WHERE id=1")->fetch();
  $out['version']  = $m ? (int)$m['versi'] : 1;
  $out['_rev']     = $m ? (int)$m['rev'] : 0;
  $out['_savedAt'] = $m ? $m['saved_at'] : '';
  $out['_savedBy'] = $m ? $m['saved_by'] : '';

  return $out;
}

// =====================================================================
// TULIS
// =====================================================================

/* Nilai kolom inti dari record app (stdClass). Selalu string/num — TIDAK
   pernah array/objek (kalau field ternyata bersarang, biarkan `data` yang
   pegang; kolom inti cuma untuk query). */
function hr_nilai($rec, $field, $bolehNull) {
  if (!property_exists($rec, $field)) return $bolehNull ? null : '';
  $v = $rec->$field;
  if ($v === null) return $bolehNull ? null : '';
  if (is_bool($v)) return $v ? 1 : 0;
  if (is_array($v) || is_object($v)) return $bolehNull ? null : '';
  return $v;
}

function hr_simpan_koleksi($pdo, $tabel, $list) {
  $peta   = hr_kolom()[$tabel];
  $nulls  = hr_kolom_null()[$tabel] ?? [];
  $kolom  = array_keys($peta);

  $ids = [];
  foreach ($list as $rec) {
    if (!is_object($rec) || !isset($rec->id) || $rec->id === '') continue;
    $ids[] = $rec->id;

    $cols = array_merge(['id'], $kolom, ['data']);
    $ph   = implode(',', array_fill(0, count($cols), '?'));
    $upd  = [];
    foreach (array_merge($kolom, ['data']) as $c) $upd[] = "`$c`=VALUES(`$c`)";

    $vals = [$rec->id];
    foreach ($kolom as $c) {
      $vals[] = hr_nilai($rec, $peta[$c], in_array($c, $nulls, true));
    }
    // $rec masih stdClass -> {} tetap tersimpan sebagai {} (mis. reviews.layers).
    $vals[] = json_encode($rec, JSON_UNESCAPED_UNICODE);

    $sql = "INSERT INTO `$tabel` (`" . implode('`,`', $cols) . "`) VALUES ($ph)
            ON DUPLICATE KEY UPDATE " . implode(',', $upd);
    $st = $pdo->prepare($sql);
    $st->execute($vals);
  }

  // Baris yang hilang dari payload = dihapus di UI. Client selalu mengirim
  // dokumen utuh, dan penjaga _rev sudah memastikan dia tidak basi.
  if ($ids) {
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $pdo->prepare("DELETE FROM `$tabel` WHERE id NOT IN ($ph)")->execute($ids);
  } else {
    $pdo->exec("DELETE FROM `$tabel`");
  }
}

/* $map = stdClass { divId: { bulan: { itemId: angka } } }.
   foreach jalan pada stdClass (properti publik), jadi bentuknya tetap dijaga. */
function hr_simpan_kpi_actuals($pdo, $map) {
  $pdo->exec("DELETE FROM `kpi_actuals`");
  if (!is_object($map)) return;
  $st = $pdo->prepare("INSERT INTO `kpi_actuals` (`div_id`, `bulan`, `item_id`, `nilai`)
                       VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE `nilai`=VALUES(`nilai`)");
  foreach ($map as $divId => $perBulan) {
    if (!is_object($perBulan)) continue;
    foreach ($perBulan as $bulan => $perItem) {
      if (!is_object($perItem)) continue;
      foreach ($perItem as $itemId => $nilai) {
        $st->execute([(string)$divId, (string)$bulan, (string)$itemId,
                      is_numeric($nilai) ? $nilai : null]);
      }
    }
  }
}

function hr_simpan_monthly($pdo, $map) {
  $pdo->exec("DELETE FROM `monthly_inputs`");
  if (!is_object($map)) return;
  $st = $pdo->prepare("INSERT INTO `monthly_inputs` (`emp_id`, `bulan`, `data`)
                       VALUES (?,?,?) ON DUPLICATE KEY UPDATE `data`=VALUES(`data`)");
  foreach ($map as $empId => $perBulan) {
    if (!is_object($perBulan)) continue;
    foreach ($perBulan as $bulan => $isi) {
      $st->execute([(string)$empId, (string)$bulan,
                    json_encode($isi, JSON_UNESCAPED_UNICODE)]);
    }
  }
}

/* audit: append-only. Yang sudah ada TIDAK disentuh, yang baru ditambah.
   Menghapus jejak audit lewat saveAll akan membuat log ini tidak ada gunanya. */
function hr_simpan_audit($pdo, $list) {
  if (!is_array($list)) return;
  $st = $pdo->prepare("INSERT INTO `audit` (`id`, `at`, `user_id`, `user_name`, `action`, `detail`)
                       VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE `id`=`id`");
  foreach ($list as $r) {
    if (!is_object($r) || !isset($r->id) || $r->id === '') continue;
    $st->execute([$r->id, (string)($r->at ?? ''), (string)($r->userId ?? ''),
                  (string)($r->userName ?? ''), (string)($r->action ?? ''),
                  (string)($r->detail ?? '')]);
  }
}

/* settings + kunci top-level tak dikenal. Kunci asing disimpan dengan
   prefix "extra:" supaya fitur baru di frontend tidak hilang datanya. */
function hr_simpan_settings($pdo, $data) {
  $lewati = array_merge(array_keys(hr_koleksi()),
    ['audit', 'kpiActuals', 'monthlyInputs', 'settings', 'version',
     '_rev', '_savedAt', '_savedBy']);

  $pdo->exec("DELETE FROM `settings`");
  $st = $pdo->prepare("INSERT INTO `settings` (`k`, `v`) VALUES (?,?)
                       ON DUPLICATE KEY UPDATE `v`=VALUES(`v`)");

  if (isset($data->settings) && is_object($data->settings)) {
    foreach ($data->settings as $k => $v) {
      $st->execute([(string)$k, json_encode($v, JSON_UNESCAPED_UNICODE)]);
    }
  }
  foreach ($data as $k => $v) {
    if (in_array($k, $lewati, true)) continue;
    $st->execute(['extra:' . $k, json_encode($v, JSON_UNESCAPED_UNICODE)]);
  }
}

/**
 * Simpan seluruh dokumen. Mengembalikan:
 *   ['ok'=>true,  'rev'=>N]
 *   ['ok'=>false, 'error'=>'conflict', 'savedBy'=>..., 'savedAt'=>..., 'rev'=>N]
 *   ['ok'=>false, 'error'=>'payload_kosong']
 */
function hr_simpan_semua($pdo, $data, $baseRev, $by) {
  // Penjaga payload kosong: jangan pernah mengosongkan tabel gara-gara
  // kiriman rusak/kosong. Data HR tidak punya cadangan otomatis.
  // `employees` boleh ARRAY KOSONG (roster HR memang sengaja mulai kosong,
  // kru muncul sendiri dari sinkron Office) — yang ditolak adalah kalau
  // field-nya tidak ada sama sekali atau bukan array.
  if (!is_object($data) || !isset($data->employees) || !is_array($data->employees)) {
    return ['ok' => false, 'error' => 'payload_kosong'];
  }

  $pdo->beginTransaction();
  try {
    // FOR UPDATE mengunci baris meta: simpan bersamaan jadi antre, tidak
    // sama-sama lolos cek rev.
    $m = $pdo->query("SELECT `rev`, `saved_at`, `saved_by` FROM `meta` WHERE `id`=1 FOR UPDATE")->fetch();
    if (!$m) {
      $pdo->exec("INSERT INTO `meta` (`id`, `rev`, `saved_at`, `saved_by`, `versi`) VALUES (1,0,'','',1)");
      $m = ['rev' => 0, 'saved_at' => '', 'saved_by' => ''];
    }
    $revServer = (int)$m['rev'];

    // baseRev null = client belum pernah tahu rev (mis. pertama kali pasang).
    // Hanya boleh lolos kalau server memang masih kosong.
    if ($baseRev === null || $baseRev === '') {
      if ($revServer > 0) {
        $pdo->rollBack();
        return ['ok' => false, 'error' => 'conflict', 'savedBy' => $m['saved_by'],
                'savedAt' => $m['saved_at'], 'rev' => $revServer];
      }
    } elseif ((int)$baseRev !== $revServer) {
      $pdo->rollBack();
      return ['ok' => false, 'error' => 'conflict', 'savedBy' => $m['saved_by'],
              'savedAt' => $m['saved_at'], 'rev' => $revServer];
    }

    foreach (hr_koleksi() as $appKey => $tabel) {
      hr_simpan_koleksi($pdo, $tabel,
        isset($data->$appKey) && is_array($data->$appKey) ? $data->$appKey : []);
    }
    hr_simpan_audit($pdo, $data->audit ?? []);
    hr_simpan_kpi_actuals($pdo, $data->kpiActuals ?? null);
    hr_simpan_monthly($pdo, $data->monthlyInputs ?? null);
    hr_simpan_settings($pdo, $data);

    $revBaru = $revServer + 1;
    $st = $pdo->prepare("UPDATE `meta` SET `rev`=?, `saved_at`=?, `saved_by`=?, `versi`=? WHERE `id`=1");
    $st->execute([$revBaru, gmdate('Y-m-d\TH:i:s.000\Z'), (string)$by,
                  isset($data->version) ? (int)$data->version : 1]);

    $pdo->commit();
    return ['ok' => true, 'rev' => $revBaru];
  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
  }
}

function hr_stats($pdo) {
  $out = [];
  foreach (hr_koleksi() as $appKey => $tabel) {
    $out[$appKey] = (int)$pdo->query("SELECT COUNT(*) c FROM `$tabel`")->fetch()['c'];
  }
  foreach (['audit', 'kpi_actuals', 'monthly_inputs', 'settings'] as $t) {
    $out[$t] = (int)$pdo->query("SELECT COUNT(*) c FROM `$t`")->fetch()['c'];
  }
  $m = $pdo->query("SELECT rev, saved_at, saved_by FROM meta WHERE id=1")->fetch();
  $out['_rev']     = $m ? (int)$m['rev'] : 0;
  $out['_savedAt'] = $m ? $m['saved_at'] : '';
  $out['_savedBy'] = $m ? $m['saved_by'] : '';
  // Penanda lingkungan + nama database. Ini satu-satunya cara memastikan
  // situs ini bicara ke database yang BENAR — nama file config selalu
  // 'config.php' di kedua server, jadi zip yang tertukar tidak akan terlihat
  // dari mana pun kecuali dari sini.
  $out['env'] = defined('ENV_LABEL') ? ENV_LABEL : '(tidak diberi label)';
  $out['db']  = DB_NAME;
  return $out;
}
