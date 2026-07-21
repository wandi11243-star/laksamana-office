<?php
/************************************************************************
 * ACCOUNT — Backend PHP + MySQL (daftar user & hak akses Office)
 * ---------------------------------------------------------------------
 * Pengganti Apps Script + Google Sheet yang selama ini memegang daftar
 * user Office. Kontraknya DISALIN PERSIS dari docs/office-apps-script.gs:
 * nama aksi, bentuk balasan, dan kode error-nya tidak berubah, supaya
 * frontend cukup mengganti URL-nya saja.
 *
 * Perilaku yang sengaja dipertahankan apa adanya:
 *   - Login memakai nama + PIN. PIN BOLEH sama antar user; nama yang
 *     membedakan. Nama dicocokkan tanpa membedakan huruf besar-kecil.
 *   - grants '*' diperluas atas modul AKTIF, lalu baris per-modul menimpa:
 *     access=1 memberi, access=0 mencabut (termasuk mencabut dari '*').
 *   - Superadmin terakhir tidak boleh mencabut '*' dari dirinya sendiri,
 *     dan tidak ada yang boleh menghapus akunnya sendiri.
 *   - syncModules hanya MENAMBAH key baru; label & status milik admin
 *     tidak pernah ditimpa, dan baris tidak pernah dihapus.
 *   - listModuleRoster sengaja TANPA gerbang kredensial: dipanggil otomatis
 *     tiap modul saat boot. Yang dikembalikan hanya nama, keterangan,
 *     status aktif, dan apakah dia admin modul itu — tidak ada PIN.
 *
 * File ini HANYA berisi fungsi (tanpa efek samping saat di-include).
 ************************************************************************/

/* config.local.php dipakai KALAU ADA — untuk tes di laptop tanpa mengubah
   config.php produksi. (config.local.php sudah di-ignore git.) */
if (file_exists(__DIR__ . '/config.local.php')) require_once __DIR__ . '/config.local.php';
else                                            require_once __DIR__ . '/config.php';

/* ==================== KONEKSI MYSQL (PDO) ==================== */
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
function q($sql, $args = array()) { $st = db()->prepare($sql); $st->execute($args); return $st; }
function s($v) { return trim((string)$v); }

/* ==================== BACA DASAR ==================== */

/* Baris yang benar-benar berisi user. Menirukan realUsers_() di Apps
   Script, yang membuang baris Sheet setengah kosong supaya tidak muncul
   sebagai user hantu "?" di daftar. */
function semua_user() {
  return q('SELECT id, name, pin, active, keterangan, talenta_id FROM `users`
            WHERE TRIM(id) <> \'\' AND TRIM(name) <> \'\'
            ORDER BY name ASC')->fetchAll();
}
function user_by_id($id) {
  $r = q('SELECT id, name, pin, active, keterangan, talenta_id FROM `users` WHERE id = :i LIMIT 1',
         array(':i' => s($id)))->fetch();
  return $r ?: null;
}
/* Cocokkan nama + PIN + tidak nonaktif. PIN boleh duplikat antar user
   karena nama ikut jadi kunci — persis findUserByCreds_(). LOWER() dipakai
   eksplisit supaya tidak bergantung pada collation database. */
function user_by_creds($name, $pin) {
  $r = q('SELECT id, name, pin, active, keterangan FROM `users`
          WHERE LOWER(TRIM(name)) = :n AND TRIM(pin) = :p AND active = 1
          LIMIT 1',
         array(':n' => mb_strtolower(s($name), 'UTF-8'), ':p' => s($pin)))->fetch();
  return $r ?: null;
}
// Key modul AKTIF di registri.
function semua_modul_aktif() {
  $out = array();
  foreach (q('SELECT `key` FROM `modules` WHERE active = 1 ORDER BY urut ASC, `key` ASC') as $r)
    if (s($r['key']) !== '') $out[] = s($r['key']);
  return $out;
}

/* ==================== RESOLUSI AKSES ==================== */

/* Modul yang boleh DIBUKA user. grants adalah satu-satunya sumber.
   Urutannya penting dan disalin dari modulesFor_():
     1) '*' lebih dulu -> semua modul aktif masuk,
     2) baris per-modul menimpa (1 = beri, 0 = cabut).
   Dibalik urutannya, deny spesifik akan tertelan oleh '*'. */
function modul_untuk($userId) {
  $uid = s($userId);
  $rows = q('SELECT `module`, `access` FROM `grants` WHERE user_id = :u', array(':u' => $uid))->fetchAll();

  $eff = array();
  foreach ($rows as $g) {                       // 1) bintang
    if (s($g['module']) !== '*') continue;
    if ((int)$g['access'] === 1)
      foreach (semua_modul_aktif() as $k) $eff[$k] = true;
  }
  foreach ($rows as $g) {                       // 2) per modul
    $m = s($g['module']);
    if ($m === '' || $m === '*') continue;
    if ((int)$g['access'] === 1) $eff[$m] = true;
    else                        unset($eff[$m]);
  }
  $out = array_keys($eff);
  sort($out);
  return $out;
}
// Modul yang boleh DIKELOLA (buka konsol Kelola Akses). '*' = semua.
function admin_modul_untuk($userId) {
  $out = array();
  foreach (q('SELECT `module` FROM `admins` WHERE user_id = :u', array(':u' => s($userId))) as $r)
    if (s($r['module']) !== '') $out[] = s($r['module']);
  return $out;
}
/* Modul yang PUNYA baris grant access=1, apa adanya ('*' tetap '*').
   Dipakai form Kelola Akses supaya centangnya mencerminkan isi tabel,
   bukan hasil perluasan. */
function grant_mentah_untuk($userId) {
  $out = array();
  foreach (q('SELECT `module` FROM `grants` WHERE user_id = :u AND access = 1', array(':u' => s($userId))) as $r)
    if (s($r['module']) !== '') $out[] = s($r['module']);
  return $out;
}

/* ==================== PREDIKAT OTORISASI ====================
   Setiap tulisan membawa nama+PIN pemanggil dan diverifikasi ULANG di
   sini. Browser hanya menyembunyikan tombol; server yang menentukan. */
function butuh_superadmin($body) {
  $caller = user_by_creds(isset($body['callerName']) ? $body['callerName'] : '',
                          isset($body['callerPin'])  ? $body['callerPin']  : '');
  if (!$caller) return null;
  return in_array('*', admin_modul_untuk($caller['id']), true) ? $caller : null;
}
function butuh_admin_modul($body, $module) {
  $caller = user_by_creds(isset($body['callerName']) ? $body['callerName'] : '',
                          isset($body['callerPin'])  ? $body['callerPin']  : '');
  if (!$caller) return null;
  $adm = admin_modul_untuk($caller['id']);
  return (in_array('*', $adm, true) || in_array($module, $adm, true)) ? $caller : null;
}

/* ==================== AUTH ==================== */

function aksi_login($name, $pin) {
  $name = s($name); $pin = s($pin);
  if ($name === '' || $pin === '') return array('ok' => false, 'error' => 'missing');
  $u = user_by_creds($name, $pin);
  if (!$u) return array('ok' => false, 'error' => 'invalid');
  return array('ok' => true, 'user' => array(
    'id'           => s($u['id']) !== '' ? s($u['id']) : ('u-' . mb_strtolower($name, 'UTF-8')),
    'name'         => s($u['name']),
    'modules'      => modul_untuk($u['id']),
    'adminModules' => admin_modul_untuk($u['id']),
  ));
}
/* User mengganti PIN-nya sendiri. TANPA verifikasi PIN lama: identitasnya
   sudah dibuktikan oleh sesi Office yang sedang berjalan. PIN baru tidak
   dicek keunikannya — tabrakan antar user tidak masalah. */
function aksi_ganti_pin($body) {
  $name = s(isset($body['name']) ? $body['name'] : '');
  if ($name === '') return array('ok' => false, 'error' => 'missing');
  $next = s(isset($body['newPin']) ? $body['newPin'] : '');
  if (!preg_match('/^\d{4,8}$/', $next)) return array('ok' => false, 'error' => 'bad_pin');

  $st = q('UPDATE `users` SET pin = :p WHERE LOWER(TRIM(name)) = :n AND active = 1',
          array(':p' => $next, ':n' => mb_strtolower($name, 'UTF-8')));
  return $st->rowCount() > 0
    ? array('ok' => true)
    // rowCount 0 bisa berarti PIN barunya sama dengan yang lama, jadi
    // keberadaan akunnya diperiksa terpisah sebelum menyebut not_found.
    : (user_by_creds($name, $next)
        ? array('ok' => true)
        : array('ok' => false, 'error' => 'not_found'));
}

/* ==================== USERS CRUD (superadmin) ==================== */

function aksi_list_users($body) {
  if (!butuh_superadmin($body)) return array('ok' => false, 'error' => 'forbidden');
  $users = array();
  foreach (semua_user() as $u) {
    $users[] = array(
      'id'           => s($u['id']),
      'name'         => s($u['name']),
      'pin'          => s($u['pin']),
      'active'       => ((int)$u['active'] === 1),
      'keterangan'   => s($u['keterangan']),
      'talentaId'    => s($u['talenta_id']),
      'modules'      => modul_untuk($u['id']),        // hasil perluasan '*' + deny
      'grants'       => grant_mentah_untuk($u['id']), // baris mentah, untuk centang form
      'adminModules' => admin_modul_untuk($u['id']),
    );
  }
  return array('ok' => true, 'users' => $users, 'modules' => semua_modul_aktif());
}

/* Tambah (tanpa id) atau ubah (id ada). Nama wajib unik tanpa membedakan
   huruf besar-kecil. PIN TIDAK perlu unik — disengaja. */
function aksi_simpan_user($body) {
  if (!butuh_superadmin($body)) return array('ok' => false, 'error' => 'forbidden');

  $name = s(isset($body['name']) ? $body['name'] : '');
  $pin  = s(isset($body['pin']) ? $body['pin'] : '');
  if ($pin === '') $pin = '1111';
  $ket    = s(isset($body['keterangan']) ? $body['keterangan'] : '');
  $tid    = s(isset($body['talentaId']) ? $body['talentaId'] : '');
  $active = (isset($body['active']) && $body['active'] === false) ? 0 : 1;
  if ($name === '') return array('ok' => false, 'error' => 'missing_fields');

  $editId = s(isset($body['id']) ? $body['id'] : '');

  $bentrok = q('SELECT id FROM `users` WHERE LOWER(TRIM(name)) = :n AND id <> :i LIMIT 1',
               array(':n' => mb_strtolower($name, 'UTF-8'), ':i' => $editId))->fetch();
  if ($bentrok) return array('ok' => false, 'error' => 'name_taken');

  /* talenta_id yang terisi wajib unik: dua kru berbagi satu Employee ID
     berarti absensi orang lain masuk ke skor seseorang. Yang KOSONG bebas
     bentrok — itu artinya "belum dipetakan", bukan sebuah identitas. */
  if ($tid !== '') {
    $dobel = q('SELECT id, name FROM `users` WHERE TRIM(talenta_id) = :t AND id <> :i LIMIT 1',
               array(':t' => $tid, ':i' => $editId))->fetch();
    if ($dobel) return array('ok' => false, 'error' => 'talenta_taken',
                             'takenBy' => s($dobel['name']));
  }

  if ($editId !== '') {
    $st = q('UPDATE `users` SET name = :n, pin = :p, active = :a, keterangan = :k, talenta_id = :t WHERE id = :i',
            array(':n' => $name, ':p' => $pin, ':a' => $active, ':k' => $ket, ':t' => $tid, ':i' => $editId));
    // rowCount 0 kalau tidak ada yang berubah, jadi keberadaannya dicek sendiri.
    if ($st->rowCount() === 0 && !user_by_id($editId))
      return array('ok' => false, 'error' => 'not_found');
    return array('ok' => true, 'id' => $editId);
  }

  // id baru: 'u-' + nama disederhanakan, ditambah angka bila sudah terpakai.
  $base = 'u-' . preg_replace('/[^a-z0-9]+/', '', mb_strtolower($name, 'UTF-8'));
  if ($base === 'u-') $base = 'u-user';
  $id = $base; $n = 2;
  while (user_by_id($id)) { $id = $base . $n; $n++; }
  q('INSERT INTO `users` (id, name, pin, active, keterangan, talenta_id) VALUES (:i, :n, :p, :a, :k, :t)',
    array(':i' => $id, ':n' => $name, ':p' => $pin, ':a' => $active, ':k' => $ket, ':t' => $tid));
  return array('ok' => true, 'id' => $id);
}

function aksi_hapus_user($body) {
  $caller = butuh_superadmin($body);
  if (!$caller) return array('ok' => false, 'error' => 'forbidden');
  $id = s(isset($body['id']) ? $body['id'] : '');
  if ($id !== '' && s($caller['id']) === $id)
    return array('ok' => false, 'error' => 'cannot_delete_self');
  if (!user_by_id($id)) return array('ok' => false, 'error' => 'not_found');

  // Hak aksesnya ikut dibuang. Di Sheet baris Grants/Admins yatim ini
  // tertinggal dan hidup lagi kalau id yang sama dipakai ulang.
  q('DELETE FROM `grants` WHERE user_id = :i', array(':i' => $id));
  q('DELETE FROM `admins` WHERE user_id = :i', array(':i' => $id));
  q('DELETE FROM `users`  WHERE id = :i',      array(':i' => $id));
  return array('ok' => true);
}

/* ==================== REGISTRI MODUL (superadmin) ==================== */

function aksi_list_modules($body) {
  if (!butuh_superadmin($body)) return array('ok' => false, 'error' => 'forbidden');
  $wantAll = (isset($body['all']) && $body['all'] === true);
  $sql = 'SELECT `key`, `label`, `active` FROM `modules` '
       . ($wantAll ? '' : 'WHERE active = 1 ')
       . 'ORDER BY urut ASC, `key` ASC';
  $mods = array();
  foreach (q($sql) as $m) {
    if (s($m['key']) === '') continue;
    $mods[] = array('key' => s($m['key']), 'label' => s($m['label']),
                    'active' => ((int)$m['active'] === 1));
  }
  return array('ok' => true, 'modules' => $mods);
}

/* Sinkronkan registri dari daftar modul aplikasi (BRANCHES di landing).
   Key baru DITAMBAH; key yang sudah ada TIDAK disentuh sama sekali —
   label & status aktif milik admin harus bertahan. Tidak pernah menghapus. */
function aksi_sync_modules($body) {
  if (!butuh_superadmin($body)) return array('ok' => false, 'error' => 'forbidden');
  $incoming = (isset($body['modules']) && is_array($body['modules'])) ? $body['modules'] : array();
  $urut = (int)q('SELECT COALESCE(MAX(urut),0) m FROM `modules`')->fetch()['m'];
  $added = array();
  foreach ($incoming as $m) {
    $key = s(isset($m['key']) ? $m['key'] : '');
    if ($key === '') continue;
    if (q('SELECT 1 FROM `modules` WHERE `key` = :k LIMIT 1', array(':k' => $key))->fetch()) continue;
    $label = s(isset($m['label']) ? $m['label'] : '');
    if ($label === '') $label = $key;
    $urut += 10;
    q('INSERT INTO `modules` (`key`, `label`, `active`, `urut`) VALUES (:k, :l, 1, :u)',
      array(':k' => $key, ':l' => $label, ':u' => $urut));
    $added[] = $key;
  }
  return array('ok' => true, 'added' => $added);
}

/* Ubah label / status aktif satu modul. `key` tidak pernah diubah: itu
   identitas yang dipakai grants & admins. */
function aksi_simpan_module($body) {
  if (!butuh_superadmin($body)) return array('ok' => false, 'error' => 'forbidden');
  $key = s(isset($body['key']) ? $body['key'] : '');
  if ($key === '') return array('ok' => false, 'error' => 'missing_key');
  if (!q('SELECT 1 FROM `modules` WHERE `key` = :k LIMIT 1', array(':k' => $key))->fetch())
    return array('ok' => false, 'error' => 'not_found');

  if (isset($body['label']) && $body['label'] !== null)
    q('UPDATE `modules` SET label = :l WHERE `key` = :k',
      array(':l' => s($body['label']), ':k' => $key));
  if (isset($body['active']) && $body['active'] !== null) {
    $aktif = ($body['active'] === true || strtoupper(s($body['active'])) === 'TRUE') ? 1 : 0;
    q('UPDATE `modules` SET active = :a WHERE `key` = :k', array(':a' => $aktif, ':k' => $key));
  }
  return array('ok' => true);
}

/* Angkat/cabut user sebagai admin sebuah modul. module '*' = superadmin. */
function aksi_set_admin($body) {
  $caller = butuh_superadmin($body);
  if (!$caller) return array('ok' => false, 'error' => 'forbidden');
  $userId = s(isset($body['userId']) ? $body['userId'] : '');
  $module = s(isset($body['module']) ? $body['module'] : '');
  if ($userId === '' || $module === '') return array('ok' => false, 'error' => 'missing_fields');
  $grant = (isset($body['access']) && ($body['access'] === true || strtoupper(s($body['access'])) === 'TRUE'));

  // Cegah superadmin TERAKHIR mengunci dirinya sendiri di luar sistem.
  if ($module === '*' && !$grant && s($caller['id']) === $userId) {
    $n = (int)q('SELECT COUNT(*) c FROM `admins` WHERE `module` = \'*\'')->fetch()['c'];
    if ($n <= 1) return array('ok' => false, 'error' => 'last_superadmin');
  }
  if ($grant) q('INSERT IGNORE INTO `admins` (user_id, `module`) VALUES (:u, :m)',
                array(':u' => $userId, ':m' => $module));
  else        q('DELETE FROM `admins` WHERE user_id = :u AND `module` = :m',
                array(':u' => $userId, ':m' => $module));
  return array('ok' => true);
}

/* ==================== PEMBERIAN AKSES MODUL (superadmin) ==================== */

function aksi_list_access($body) {
  if (!butuh_superadmin($body)) return array('ok' => false, 'error' => 'forbidden');
  $users = array();
  foreach (semua_user() as $u) {
    $users[] = array(
      'id'           => s($u['id']),
      'name'         => s($u['name']),
      'keterangan'   => s($u['keterangan']),
      'active'       => ((int)$u['active'] === 1),
      'modules'      => modul_untuk($u['id']),
      'adminModules' => admin_modul_untuk($u['id']),
    );
  }
  return array('ok' => true, 'users' => $users, 'modules' => semua_modul_aktif());
}

function aksi_set_module_access($body) {
  $caller = butuh_superadmin($body);
  if (!$caller) return array('ok' => false, 'error' => 'forbidden');
  $userId = s(isset($body['userId']) ? $body['userId'] : '');
  $module = s(isset($body['module']) ? $body['module'] : '');
  if ($userId === '' || $module === '') return array('ok' => false, 'error' => 'missing_fields');
  $access = (isset($body['access']) && ($body['access'] === true || strtoupper(s($body['access'])) === 'TRUE')) ? 1 : 0;

  // Upsert: primary key (user_id, module) membuat ini idempoten.
  q('INSERT INTO `grants` (user_id, `module`, `access`, granted_by, ts)
     VALUES (:u, :m, :a, :b, NOW())
     ON DUPLICATE KEY UPDATE `access` = VALUES(`access`), granted_by = VALUES(granted_by), ts = VALUES(ts)',
    array(':u' => $userId, ':m' => $module, ':a' => $access, ':b' => s($caller['id'])));
  return array('ok' => true);
}

/* ==================== ANGGOTA MODUL ==================== */

// Untuk konsol Kelola Akses INTERNAL sebuah modul — admin modul itu saja.
function aksi_list_module_members($body) {
  $module = s(isset($body['module']) ? $body['module'] : '');
  if (!butuh_admin_modul($body, $module)) return array('ok' => false, 'error' => 'forbidden');
  return array('ok' => true, 'members' => anggota_modul($module, false));
}

/* Roster HANYA-BACA. Dipanggil OTOMATIS tiap modul saat boot supaya daftar
   staf (mis. dropdown PIC di Marketing) ikut roster Office tanpa perlu tiap
   orang login dulu. Karena itu TANPA gerbang kredensial — dan karena itu
   pula balasannya tidak pernah memuat PIN. */
function aksi_list_module_roster($body) {
  $module = s(isset($body['module']) ? $body['module'] : '');
  if ($module === '') return array('ok' => false, 'error' => 'missing_module');
  return array('ok' => true, 'members' => anggota_modul($module, true));
}

function anggota_modul($module, $withAdminFlag) {
  $out = array();
  foreach (semua_user() as $u) {
    if (!in_array($module, modul_untuk($u['id']), true)) continue;   // hanya anggota modul ini
    /* talentaId ikut di roster (bukan cuma di listUsers) supaya modul HR
       bisa mencocokkan report absensi Talenta tanpa kredensial superadmin.
       Ini bukan data sensitif: nomor pegawai, bukan PIN. */
    $row = array(
      'id'         => s($u['id']),
      'name'       => s($u['name']),
      'keterangan' => s($u['keterangan']),
      'talentaId'  => s($u['talenta_id']),
      'active'     => ((int)$u['active'] === 1),
    );
    if ($withAdminFlag) {
      $adm = admin_modul_untuk($u['id']);
      $row['isModuleAdmin'] = in_array('*', $adm, true) || in_array($module, $adm, true);
    }
    $out[] = $row;
  }
  return $out;
}

/* ==================== PEMINDAHAN DATA DARI SHEET ====================
   Dipanggil sekali saat pindah dari Google Sheet. Isi tiap tab dikirim
   apa adanya; aksinya IDEMPOTEN, jadi aman diulang kalau terputus di
   tengah. Tidak pernah menghapus baris yang sudah ada di database.

   Bentuk kiriman (semua opsional):
     users:   [{id,name,pin,active,keterangan,talentaId}, ...]
     modules: [{key,label,active}, ...]
     grants:  [{userId,module,access,grantedBy,ts}, ...]
     admins:  [{userId,module}, ...]                                    */
function aksi_import($body) {
  if (!butuh_superadmin($body)) return array('ok' => false, 'error' => 'forbidden');
  $n = array('users' => 0, 'modules' => 0, 'grants' => 0, 'admins' => 0);
  $bool = function ($v, $default = true) {
    if ($v === null || $v === '') return $default;
    if (is_bool($v)) return $v;
    $t = strtoupper(trim((string)$v));
    return !($t === 'FALSE' || $t === '0' || $t === 'NO' || $t === 'TIDAK');
  };

  foreach ((isset($body['users']) && is_array($body['users'])) ? $body['users'] : array() as $u) {
    $id = s(isset($u['id']) ? $u['id'] : ''); $nm = s(isset($u['name']) ? $u['name'] : '');
    if ($id === '' || $nm === '') continue;             // baris kosong Sheet dilewati
    /* talenta_id: kiriman KOSONG tidak menghapus yang sudah ada. Ekspor tab
       Sheet lama tidak punya kolom ini, jadi impor ulang tanpa penjaga ini
       akan memutus semua pemetaan absensi yang sudah dibuat lewat UI. */
    q('INSERT INTO `users` (id, name, pin, active, keterangan, talenta_id) VALUES (:i,:n,:p,:a,:k,:t)
       ON DUPLICATE KEY UPDATE name=VALUES(name), pin=VALUES(pin), active=VALUES(active),
         keterangan=VALUES(keterangan),
         talenta_id=IF(VALUES(talenta_id)=\'\', talenta_id, VALUES(talenta_id))',
      array(':i' => $id, ':n' => $nm,
            ':p' => s(isset($u['pin']) ? $u['pin'] : '') !== '' ? s($u['pin']) : '1111',
            ':a' => $bool(isset($u['active']) ? $u['active'] : null) ? 1 : 0,
            ':k' => s(isset($u['keterangan']) ? $u['keterangan'] : ''),
            ':t' => s(isset($u['talentaId']) ? $u['talentaId'] : '')));
    $n['users']++;
  }
  foreach ((isset($body['modules']) && is_array($body['modules'])) ? $body['modules'] : array() as $m) {
    $k = s(isset($m['key']) ? $m['key'] : ''); if ($k === '') continue;
    q('INSERT INTO `modules` (`key`,`label`,`active`) VALUES (:k,:l,:a)
       ON DUPLICATE KEY UPDATE `label`=VALUES(`label`), `active`=VALUES(`active`)',
      array(':k' => $k, ':l' => s(isset($m['label']) ? $m['label'] : '') !== '' ? s($m['label']) : $k,
            ':a' => $bool(isset($m['active']) ? $m['active'] : null) ? 1 : 0));
    $n['modules']++;
  }
  foreach ((isset($body['grants']) && is_array($body['grants'])) ? $body['grants'] : array() as $g) {
    $u = s(isset($g['userId']) ? $g['userId'] : ''); $m = s(isset($g['module']) ? $g['module'] : '');
    if ($u === '' || $m === '') continue;
    q('INSERT INTO `grants` (user_id,`module`,`access`,granted_by,ts) VALUES (:u,:m,:a,:b,NOW())
       ON DUPLICATE KEY UPDATE `access`=VALUES(`access`)',
      array(':u' => $u, ':m' => $m,
            ':a' => $bool(isset($g['access']) ? $g['access'] : null) ? 1 : 0,
            ':b' => s(isset($g['grantedBy']) ? $g['grantedBy'] : 'import')));
    $n['grants']++;
  }
  foreach ((isset($body['admins']) && is_array($body['admins'])) ? $body['admins'] : array() as $a) {
    $u = s(isset($a['userId']) ? $a['userId'] : ''); $m = s(isset($a['module']) ? $a['module'] : '');
    if ($u === '' || $m === '') continue;
    q('INSERT IGNORE INTO `admins` (user_id,`module`) VALUES (:u,:m)', array(':u' => $u, ':m' => $m));
    $n['admins']++;
  }
  return array('ok' => true, 'diproses' => $n);
}

/* ==================== BENIH AWAL ====================
   HANYA jalan kalau tabel users benar-benar kosong, supaya database yang
   sudah berisi tidak pernah terisi ulang diam-diam. Tanpa ini, database
   baru tidak punya satu pun superadmin dan tidak ada yang bisa masuk. */
function seed_bila_kosong() {
  $n = (int)q('SELECT COUNT(*) c FROM `users`')->fetch()['c'];
  if ($n > 0) return false;
  $orang = array(
    array('u-admin',   'Admin'),
    array('u-howandi', 'Howandi'),
    array('u-wandi',   'Wandi'),
  );
  foreach ($orang as $o) {
    q('INSERT IGNORE INTO `users` (id,name,pin,active,keterangan) VALUES (:i,:n,\'1111\',1,\'\')',
      array(':i' => $o[0], ':n' => $o[1]));
    q('INSERT IGNORE INTO `grants` (user_id,`module`,`access`,granted_by) VALUES (:u,\'*\',1,\'seed\')',
      array(':u' => $o[0]));
    q('INSERT IGNORE INTO `admins` (user_id,`module`) VALUES (:u,\'*\')', array(':u' => $o[0]));
  }
  // Wandi tetap tanpa Howandi Life OS, sama seperti SEED_USERS di landing.
  q('INSERT IGNORE INTO `grants` (user_id,`module`,`access`,granted_by)
     VALUES (\'u-wandi\',\'howandi_life\',0,\'seed\')');
  return true;
}

/* ==================== DIAGNOSTIK ====================
   env & db ikut dibalas supaya ketahuan kalau zip dev terpasang di
   produksi (atau sebaliknya) — satu-satunya pengaman terhadap salah unggah. */
function ping() {
  return array('pong' => true, 'backend' => 'php-mysql',
               'env' => defined('ENV_LABEL') ? ENV_LABEL : '?',
               'db' => DB_NAME, 'ts' => gmdate('c'));
}
function stats() {
  $out = array('backend' => 'php-mysql',
               'env' => defined('ENV_LABEL') ? ENV_LABEL : '?',
               'db' => DB_NAME);
  foreach (array('users', 'modules', 'grants', 'admins') as $t)
    $out[$t] = (int)q('SELECT COUNT(*) c FROM `' . $t . '`')->fetch()['c'];
  $out['superadmin'] = (int)q('SELECT COUNT(*) c FROM `admins` WHERE `module` = \'*\'')->fetch()['c'];
  $out['ts'] = gmdate('c');
  return $out;
}
