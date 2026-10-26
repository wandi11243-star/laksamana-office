<?php
/************************************************************************
 * BD OS — PINTU UNTUK AI AGENT (reminder lewat chat)  · 26 Oktober 2026
 * ---------------------------------------------------------------------
 * Permintaan user: task yang jatuh tempo diingatkan lewat WhatsApp oleh AI
 * agent di VPS-nya sendiri; begitu orangnya membalas "Sudah", agent yang
 * menandai task itu Done di sini — tanpa ada yang membuka modul BD.
 *
 *   POST {action:"agentTugas",   agentToken, [tanggal], [dari], [sampai]}
 *        -> {ok,data:{tanggal, tugas:[…], ts}}
 *   POST {action:"agentSelesai", agentToken, id, noHp, [catatan]}
 *        -> {ok,data:{id, nama, status, doneAt, penerus, ts}}
 *   POST {action:"agentCatat",   agentToken, id, noHp, catatan}
 *        -> {ok,data:{id, ts}}
 *
 * YANG MENJAGA PINTU INI, dan jangan dilonggarkan:
 *
 * - AGENT_TOKEN di config.php. TIDAK DIDEFINISIKAN = SELURUH aksi agent
 *   MATI. Bawaannya tertutup, bukan terbuka: config.php tidak ikut deploy
 *   (dikecualikan workflow), jadi server yang belum disetel memang harus
 *   menolak — bukan menerima siapa saja.
 * - Token dibaca dari BADAN POST atau header X-Agent-Token, TIDAK PERNAH dari
 *   query string: URL tercatat di log server dan riwayat proxy.
 * - noHp WAJIB, dan harus milik salah satu PIC task itu (atau yang di-assign
 *   sub-task-nya). Agent yang tokennya bocor tetap tidak bisa menutup task
 *   orang lain atas nama nomor sembarangan — dan yang paling sering terjadi
 *   justru bukan kebocoran, melainkan agent yang salah memetakan balasan ke
 *   task: penjaga ini menolak yang begitu, bukan menutupnya diam-diam.
 *
 * MENULIS PER BARIS, BUKAN saveAll — alasan yang sama dengan addPo &
 * setRealisasi: saveAll merekonsiliasi seluruh state.
 *
 * TASK BERULANG: kejadian berikutnya TIDAK dibuat di sini. Aturannya hidup
 * di lahirkanUlang() di frontend, dan menyalinnya ke PHP berarti berkas
 * kembar lintas bahasa. Server cuma memasang penanda `penerusTertunda`;
 * tab BD mana pun yang terbuka (atau dibuka berikutnya) melahirkannya lewat
 * terapkanGulir(), dengan id TETAP supaya dua tab tidak melahirkan dua.
 ************************************************************************/

/* Tanggal usaha WIB, bukan zona server. */
function agent_hari_ini() { return gmdate('Y-m-d', time() + 7 * 3600); }

function agent_token_dari($body) {
  if (isset($body['agentToken'])) return (string)$body['agentToken'];
  if (isset($_SERVER['HTTP_X_AGENT_TOKEN'])) return (string)$_SERVER['HTTP_X_AGENT_TOKEN'];
  return '';
}

function agent_wajib_token($body) {
  if (!defined('AGENT_TOKEN') || AGENT_TOKEN === '')
    throw new Exception('Pintu agent belum dinyalakan: AGENT_TOKEN belum diisi di config.php server ini.');
  if (strlen(AGENT_TOKEN) < 24)
    throw new Exception('AGENT_TOKEN terlalu pendek (minimal 24 karakter).');
  if (!hash_equals(AGENT_TOKEN, agent_token_dari($body)))
    throw new Exception('agentToken salah');
}

/* 0812-3456 / +62812… / 62812… / 812… -> 62812… . Kosong kalau bukan nomor. */
function agent_norm_hp($hp) {
  $d = preg_replace('/[^0-9]/', '', (string)$hp);
  if ($d === '') return '';
  if (substr($d, 0, 1) === '0') $d = '62' . substr($d, 1);
  else if (substr($d, 0, 1) === '8') $d = '62' . $d;
  return strlen($d) >= 9 ? $d : '';
}

/* ---- roster Office (no HP ada di sana, bukan di tabel people BD) ---- */
function agent_akun_url() {
  if (defined('ACCOUNT_API_URL') && ACCOUNT_API_URL !== '') return ACCOUNT_API_URL;
  /* SERVER_NAME, bukan HTTP_HOST — alasan yang sama dengan lib_sesi.php:
     HTTP_HOST bisa dipalsukan pengirim. */
  $host = isset($_SERVER['SERVER_NAME']) ? $_SERVER['SERVER_NAME'] : '';
  if ($host === '') return '';
  $skema = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
  return $skema . '://' . $host . '/account-api-mysql/api.php';
}

function agent_post_json($url, $data) {
  $payload = json_encode($data);
  $jawab = null;
  if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, array(
      CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload,
      CURLOPT_HTTPHEADER => array('Content-Type: text/plain;charset=utf-8'),
      CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8, CURLOPT_FOLLOWLOCATION => true,
    ));
    $jawab = curl_exec($ch);
    curl_close($ch);
  } else {
    $ctx = stream_context_create(array('http' => array(
      'method' => 'POST', 'header' => "Content-Type: text/plain;charset=utf-8\r\n",
      'content' => $payload, 'timeout' => 8,
    )));
    $jawab = @file_get_contents($url, false, $ctx);
  }
  if (!is_string($jawab) || $jawab === '') return null;
  $d = json_decode($jawab, true);
  return is_array($d) ? $d : null;
}

/* {officeUserId: {nama, noHp, aktif}} — null kalau Office tidak menjawab.
   null DIBEDAKAN dari peta kosong: yang pertama membuat agentSelesai menolak
   ("tidak bisa memastikan"), bukan menganggap nomornya tidak cocok. */
function agent_roster() {
  static $peta = false;
  if ($peta !== false) return $peta;
  $url = agent_akun_url();
  $j = $url ? agent_post_json($url, array('action' => 'listDivisiRoster')) : null;
  if (!$j || empty($j['ok']) || !isset($j['members']) || !is_array($j['members'])) { $peta = null; return null; }
  $peta = array();
  foreach ($j['members'] as $m) {
    if (!isset($m['id'])) continue;
    $peta[(string)$m['id']] = array(
      'nama'  => isset($m['name']) ? (string)$m['name'] : '',
      'noHp'  => agent_norm_hp(isset($m['noHp']) ? $m['noHp'] : ''),
      'aktif' => !isset($m['active']) || !empty($m['active']),
    );
  }
  return $peta;
}

/* ---- baca tabel ---- */
function agent_semua($tabel) {
  $out = array();
  foreach (db()->query('SELECT `data` FROM ' . q($tabel)) as $row) {
    $r = json_decode($row['data'], true);
    if (is_array($r) && !empty($r['id'])) $out[(string)$r['id']] = $r;
  }
  return $out;
}

function agent_pics($t) {
  if (isset($t['pics']) && is_array($t['pics'])) return $t['pics'];
  return !empty($t['pic']) ? array($t['pic']) : array();
}

/* Orang yang dianggap "pelaksana" task: PIC + yang di-assign sub-task.
   Sama dengan pelaksana() di frontend. */
function agent_pelaksana($t) {
  $ids = agent_pics($t);
  if (isset($t['subtasks']) && is_array($t['subtasks']))
    foreach ($t['subtasks'] as $s) if (!empty($s['p'])) $ids[] = $s['p'];
  return array_values(array_unique(array_filter($ids)));
}

function agent_orang($peopleId, $people, $roster) {
  $p = isset($people[$peopleId]) ? $people[$peopleId] : null;
  $oid = $p && !empty($p['officeUserId']) ? (string)$p['officeUserId'] : '';
  $r = ($roster && $oid !== '' && isset($roster[$oid])) ? $roster[$oid] : null;
  return array(
    'id'           => $peopleId,
    'nama'         => $p && !empty($p['name']) ? $p['name'] : ($r ? $r['nama'] : ''),
    'officeUserId' => $oid,
    'noHp'         => $r ? $r['noHp'] : '',
  );
}

function agent_tgl_sah($d) { return is_string($d) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $d); }

/* ==================== agentTugas ====================
   Bawaan: task belum Done yang deadline-nya HARI INI atau sudah lewat.
   `dari`/`sampai` dipakai kalau agent mau mengingatkan lebih awal (mis. H-1).
   Task tanpa deadline tidak pernah ikut: tidak ada yang bisa "jatuh tempo". */
function agent_tugas($body) {
  $hariIni = agent_hari_ini();
  $tanggal = isset($body['tanggal']) && agent_tgl_sah($body['tanggal']) ? $body['tanggal'] : $hariIni;
  $dari    = isset($body['dari']) && agent_tgl_sah($body['dari']) ? $body['dari'] : '0000-00-00';
  $sampai  = isset($body['sampai']) && agent_tgl_sah($body['sampai']) ? $body['sampai'] : $tanggal;

  $c = collections();
  $tasks    = agent_semua($c['tasks']['table']);
  $people   = agent_semua($c['people']['table']);
  $projects = agent_semua($c['projects']['table']);
  $roster   = agent_roster();

  $out = array();
  foreach ($tasks as $t) {
    if (isset($t['status']) && $t['status'] === 'Done') continue;
    $dl = isset($t['deadline']) ? $t['deadline'] : '';
    if (!agent_tgl_sah($dl) || $dl < $dari || $dl > $sampai) continue;
    /* Task di project yang sudah ditutup (stage Done; 'Completed' bentuk
       lamanya, lihat STAGE_LAMA) tidak diingatkan: pekerjaannya sudah
       dinyatakan selesai di tingkat project. */
    $pid = isset($t['project']) ? (string)$t['project'] : '';
    $proj = ($pid !== '' && isset($projects[$pid])) ? $projects[$pid] : null;
    if ($proj && isset($proj['stage']) && in_array($proj['stage'], array('Done','Completed'), true)) continue;

    $subs = isset($t['subtasks']) && is_array($t['subtasks']) ? $t['subtasks'] : array();
    $subOut = array();
    foreach ($subs as $s) $subOut[] = array(
      'teks' => isset($s['t']) ? $s['t'] : '', 'selesai' => !empty($s['done']),
      'deadline' => isset($s['d']) ? $s['d'] : '',
      'pelaksana' => !empty($s['p']) ? agent_orang($s['p'], $people, $roster) : null,
    );
    $picOut = array();
    foreach (agent_pics($t) as $pidOrang) $picOut[] = agent_orang($pidOrang, $people, $roster);

    $out[] = array(
      'id'        => $t['id'],
      'nama'      => isset($t['name']) ? $t['name'] : '',
      'deskripsi' => isset($t['desc']) ? $t['desc'] : '',
      'deadline'  => $dl,
      'lewatHari' => max(0, (int)round((strtotime($hariIni) - strtotime($dl)) / 86400)),
      'status'    => isset($t['status']) ? $t['status'] : '',
      'divisi'    => isset($t['div']) ? $t['div'] : '',
      'project'   => $proj ? (isset($proj['name']) ? $proj['name'] : '') : ($pid === '' && !empty($t['daily']) ? 'Daily Task' : ''),
      'berulang'  => isset($t['ulang']) ? $t['ulang'] : '',
      'terlewat'  => isset($t['terlewat']) && is_array($t['terlewat']) ? count($t['terlewat']) : 0,
      'pic'       => $picOut,
      'subtask'   => $subOut,
    );
  }
  usort($out, function ($a, $b) { return strcmp($a['deadline'], $b['deadline']); });

  return array(
    'tanggal'      => $tanggal,
    'rosterTerbaca'=> $roster !== null,   // false = noHp kosong semua, dan sebabnya Office tak menjawab
    'tugas'        => $out,
    'ts'           => gmdate('c'),
  );
}

/* ---- penjaga nomor: pengirim harus pelaksana task itu ---- */
function agent_pastikan_pelaksana($t, $noHp) {
  $hp = agent_norm_hp($noHp);
  if ($hp === '') throw new Exception('noHp wajib diisi (nomor WhatsApp pengirim).');
  $roster = agent_roster();
  if ($roster === null) throw new Exception('Daftar akun Office tidak terbaca — nomor pengirim tidak bisa dipastikan. Coba lagi.');
  $people = agent_semua(collections()['people']['table']);
  foreach (agent_pelaksana($t) as $pid) {
    $o = agent_orang($pid, $people, $roster);
    if ($o['noHp'] !== '' && $o['noHp'] === $hp) return $o;
  }
  throw new Exception('Nomor ' . $hp . ' bukan PIC / pelaksana task ini.');
}

function agent_ambil_task($id) {
  $id = trim((string)$id);
  if ($id === '') throw new Exception('id task kosong');
  $tabel = q(collections()['tasks']['table']);
  $st = db()->prepare('SELECT `data` FROM ' . $tabel . ' WHERE `id` = :id LIMIT 1');
  $st->execute(array(':id' => $id));
  $row = $st->fetch();
  if (!$row) throw new Exception('Task tidak ditemukan: ' . $id);
  $t = json_decode($row['data'], true);
  if (!is_array($t)) throw new Exception('Data task rusak: ' . $id);
  return $t;
}

function agent_tulis_task($t, $now) {
  $t['updatedAt'] = $now;
  $tabel = q(collections()['tasks']['table']);
  /* Kolom status & progress ikut ditulis, bukan cuma JSON-nya — kolom SQL
     yang tertinggal berbohong bagi siapa pun yang membaca lewat phpMyAdmin.
     Alasan yang sama dengan set_realisasi(). */
  $up = db()->prepare('UPDATE ' . $tabel . ' SET `data` = :data, `status` = :st, `progress` = :pg, `updated_at` = :ts WHERE `id` = :id');
  $up->execute(array(
    ':data' => json_enc($t),
    ':st'   => isset($t['status']) ? (string)$t['status'] : '',
    ':pg'   => isset($t['progress']) ? (int)$t['progress'] : 0,
    ':ts'   => $now,
    ':id'   => $t['id'],
  ));
}

/* Jejak dari agent, 30 terakhir — ditampilkan di modal task. */
function agent_log_tambah(&$t, $jenis, $oleh, $teks, $now) {
  if (!isset($t['agentLog']) || !is_array($t['agentLog'])) $t['agentLog'] = array();
  $t['agentLog'][] = array('at' => $now, 'jenis' => $jenis, 'oleh' => $oleh,
                           'teks' => substr(trim((string)$teks), 0, 500));
  if (count($t['agentLog']) > 30) $t['agentLog'] = array_slice($t['agentLog'], -30);
}

/* ==================== agentSelesai ==================== */
function agent_selesai($body) {
  $t = agent_ambil_task(isset($body['id']) ? $body['id'] : '');
  $o = agent_pastikan_pelaksana($t, isset($body['noHp']) ? $body['noHp'] : '');
  $now = (int)round(microtime(true) * 1000);
  $catatan = isset($body['catatan']) ? (string)$body['catatan'] : '';

  if (isset($t['status']) && $t['status'] === 'Done') {
    /* Klik ganda / pesan terkirim dua kali: bukan galat, cukup dilaporkan. */
    return array('id' => $t['id'], 'nama' => $t['name'], 'status' => 'Done',
                 'doneAt' => isset($t['doneAt']) ? $t['doneAt'] : '', 'sudahSebelumnya' => true,
                 'penerus' => false, 'ts' => gmdate('c'));
  }

  /* Urutan (dependsOn) dihormati — sama dengan cekBolehDone() di frontend.
     Prasyarat yang sudah dihapus tidak menghalangi. */
  if (!empty($t['dependsOn']) && is_array($t['dependsOn'])) {
    $tasks = agent_semua(collections()['tasks']['table']);
    $tahan = array();
    foreach ($t['dependsOn'] as $d)
      if ($d !== $t['id'] && isset($tasks[$d]) && (!isset($tasks[$d]['status']) || $tasks[$d]['status'] !== 'Done'))
        $tahan[] = isset($tasks[$d]['name']) ? $tasks[$d]['name'] : $d;
    if ($tahan) throw new Exception('Belum bisa Done — selesaikan dulu: ' . implode(', ', $tahan));
  }

  $t['status']   = 'Done';
  $t['progress'] = 100;
  $t['doneAt']   = agent_hari_ini();
  $t['doneVia']  = 'agent';
  $t['doneBy']   = $o['nama'];
  $penerus = !empty($t['ulang']);
  if ($penerus) $t['penerusTertunda'] = true;
  agent_log_tambah($t, 'selesai', $o['nama'], $catatan, $now);
  agent_tulis_task($t, $now);

  return array('id' => $t['id'], 'nama' => isset($t['name']) ? $t['name'] : '', 'status' => 'Done',
               'doneAt' => $t['doneAt'], 'oleh' => $o['nama'], 'sudahSebelumnya' => false,
               'penerus' => $penerus, 'ts' => gmdate('c'));
}

/* ==================== agentCatat ====================
   Untuk balasan selain "Sudah" (mis. "Belum, genset sedang diservis"):
   dicatat di task tanpa mengubah statusnya. */
function agent_catat($body) {
  $catatan = trim(isset($body['catatan']) ? (string)$body['catatan'] : '');
  if ($catatan === '') throw new Exception('catatan kosong');
  $t = agent_ambil_task(isset($body['id']) ? $body['id'] : '');
  $o = agent_pastikan_pelaksana($t, isset($body['noHp']) ? $body['noHp'] : '');
  $now = (int)round(microtime(true) * 1000);
  agent_log_tambah($t, 'catatan', $o['nama'], $catatan, $now);
  agent_tulis_task($t, $now);
  return array('id' => $t['id'], 'ts' => gmdate('c'));
}
