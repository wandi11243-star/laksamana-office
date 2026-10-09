<?php
/************************************************************************
 * STOCK — BREAK & LOSS (9 Oktober 2026)
 * ---------------------------------------------------------------------
 * Barang INVENTARIS (piring, gelas, sendok, alat bar, tray) yang pecah
 * (break) atau hilang (loss). Konsepnya sama dengan Waste Produk, bedanya
 * yang dicatat di sini barang yang dipakai berulang — bukan bahan yang
 * habis dimakan — jadi ia butuh dua hal yang waste tidak punya:
 *
 *   1. MASTER BARANG (`bl_item`) yang didaftarkan satu kali, berikut
 *      fotonya. Nama yang diketik bebas tiap kali mencatat akan punya tiga
 *      ejaan dalam sebulan, dan rekap per barang berhenti bisa dijumlahkan.
 *   2. STOK TERKINI. Dihitung dari jumlah seluruh mutasi yang TIDAK
 *      dibatalkan — tidak pernah disimpan sebagai angka tersendiri. Angka
 *      stok yang disimpan terpisah dari catatannya pasti menyimpang suatu
 *      hari, dan yang mencocokkannya tidak punya cara tahu mana yang benar.
 *
 * Mutasi (`bl_mutasi.qty` bertanda):
 *   masuk   +qty   barang baru datang / stok awal
 *   break   -qty   pecah / rusak
 *   loss    -qty   hilang
 *   opname  +/-    selisih hitungan fisik — DIHITUNG SERVER dari angka
 *                  fisik yang diketik, di dalam transaksi yang sama
 *
 * TIDAK ADA DELETE DI BERKAS INI, dan itu inti gunanya. Catatan barang
 * pecah adalah catatan pertanggungjawaban; yang barisnya bisa dihapus
 * orang yang membuatnya bukan catatan, cuma draf. Salah input DIBATALKAN
 * (`batal_at`) — barisnya tetap terlihat, dicoret, dan berhenti ikut
 * dihitung. Barang yang tidak dipakai lagi DINONAKTIFKAN, bukan dihapus:
 * riwayatnya tetap menunjuk ke barang yang ada.
 *
 * Tabel lahir sendiri lewat bl_pastikan(), BUKAN berkas migrasi — migrasi
 * di repo ini rutin tertinggal di produksi, dan endpoint yang tabelnya
 * belum ada gagal 500 di satu server sementara 200 di server sebelahnya.
 ************************************************************************/

/* Potong teks. mb_substr dipakai HANYA kalau ada: fungsi mbstring yang tidak
   terpasang di hosting mematikan SELURUH endpoint folder ini (lihat
   CLAUDE.md), dan memotong nama barang tidak sepenting endpoint yang hidup. */
function bl_potong($s, $a, $n) {
  return function_exists('mb_substr') ? mb_substr($s, $a, $n, 'UTF-8') : substr($s, $a, $n);
}

function bl_pastikan($pdo) {
  static $sudah = false;
  if ($sudah) return;
  $sudah = true;
  bl_pastikan_tabel($pdo);
  bl_pastikan_kolom($pdo);
}

/* Kolom yang lahir SESUDAH tabelnya sudah berisi. CREATE TABLE IF NOT EXISTS
   tidak pernah menyentuh tabel yang sudah ada, jadi tanpa ALTER ini kolomnya
   cuma ada di pemasangan baru sementara dev & produksi tertinggal — dan
   UPDATE yang menyebutnya gagal 500. Pola hpp_pastikan_kolom(). */
function bl_pastikan_kolom($pdo) {
  $perlu = [
    'diubah_oleh' => "VARCHAR(120) NOT NULL DEFAULT ''",
    'diubah_at'   => 'DATETIME NULL',
    'riwayat'     => 'TEXT NULL',
  ];
  $st = $pdo->prepare("SELECT COLUMN_NAME FROM information_schema.COLUMNS
                       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bl_mutasi'");
  $st->execute();
  $ada = array_map('strtolower', $st->fetchAll(PDO::FETCH_COLUMN));
  foreach ($perlu as $k => $def) {
    if (!in_array($k, $ada, true)) $pdo->exec("ALTER TABLE `bl_mutasi` ADD COLUMN `$k` $def");
  }
}

function bl_pastikan_tabel($pdo) {
  $pdo->exec("CREATE TABLE IF NOT EXISTS `bl_item` (
      `id`          VARCHAR(40)   NOT NULL,
      `nama`        VARCHAR(160)  NOT NULL,
      `kategori`    VARCHAR(80)   NOT NULL DEFAULT '',
      `satuan`      VARCHAR(30)   NOT NULL DEFAULT 'pcs',
      `lokasi`      VARCHAR(80)   NOT NULL DEFAULT '',
      `harga`       DECIMAL(14,2) NOT NULL DEFAULT 0,
      `stok_min`    DECIMAL(12,2) NOT NULL DEFAULT 0,
      `aktif`       TINYINT(1)    NOT NULL DEFAULT 1,
      `catatan`     TEXT          NULL,
      `thumb`       MEDIUMTEXT    NULL,
      `foto`        LONGTEXT      NULL,
      `foto_nama`   VARCHAR(200)  NOT NULL DEFAULT '',
      `dibuat_oleh` VARCHAR(120)  NOT NULL DEFAULT '',
      `dibuat_at`   DATETIME      NULL,
      `diubah_oleh` VARCHAR(120)  NOT NULL DEFAULT '',
      `diubah_at`   DATETIME      NULL,
      PRIMARY KEY (`id`),
      UNIQUE KEY `uk_bl_item_nama` (`nama`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  $pdo->exec("CREATE TABLE IF NOT EXISTS `bl_mutasi` (
      `id`           VARCHAR(40)   NOT NULL,
      `item_id`      VARCHAR(40)   NOT NULL,
      `tanggal`      DATE          NOT NULL,
      `jenis`        VARCHAR(12)   NOT NULL,
      `qty`          DECIMAL(12,2) NOT NULL DEFAULT 0,
      `harga`        DECIMAL(14,2) NOT NULL DEFAULT 0,
      `sebab`        VARCHAR(200)  NOT NULL DEFAULT '',
      `pic`          VARCHAR(120)  NOT NULL DEFAULT '',
      `tim`          VARCHAR(40)   NOT NULL DEFAULT '',
      `catatan`      TEXT          NULL,
      `foto`         LONGTEXT      NULL,
      `foto_nama`    VARCHAR(200)  NOT NULL DEFAULT '',
      `oleh`         VARCHAR(120)  NOT NULL DEFAULT '',
      `waktu`        DATETIME      NOT NULL,
      `batal_at`     DATETIME      NULL,
      `batal_oleh`   VARCHAR(120)  NOT NULL DEFAULT '',
      `batal_alasan` VARCHAR(300)  NOT NULL DEFAULT '',
      PRIMARY KEY (`id`),
      KEY `ix_bl_mutasi_item` (`item_id`),
      KEY `ix_bl_mutasi_tgl` (`tanggal`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

/* Nama yang tercatat sebagai pencatat. Diambil dari SESI Office kalau bisa
   ditanyakan — nama yang dikirim layar bisa diketik siapa saja. Kalau
   account-api tidak menjawab, jatuh ke nama yang dikirim layar supaya
   pencatatan tidak ikut mati; di situ ia memang cuma keterangan. */
function bl_nama_pemanggil($b) {
  $u = function_exists('pur_whoami') ? pur_whoami(pur_token_sesi($b)) : null;
  if ($u && !empty($u['name'])) return (string)$u['name'];
  return bl_potong(trim((string)($b->oleh ?? '')), 0, 120);
}

/* Foto WAJIB data URI gambar. Tanpa pemeriksaan ini satu kiriman bisa
   menaruh apa saja ke kolom yang nanti digambar sebagai <img src>. */
function bl_foto_sah($s, $maks) {
  $s = (string)$s;
  if ($s === '') return true;
  if (strlen($s) > $maks) return false;
  return (bool)preg_match('#^data:image/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$#', $s);
}

function bl_tanggal_sah($t) {
  if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', (string)$t, $m)) return false;
  return checkdate((int)$m[2], (int)$m[3], (int)$m[1]);
}

/* Stok terkini SATU barang. Dipakai di dalam transaksi opname, jadi baris
   barangnya sudah dikunci (FOR UPDATE) oleh pemanggilnya. */
function bl_stok_satu($pdo, $itemId) {
  $st = $pdo->prepare("SELECT COALESCE(SUM(`qty`),0) FROM `bl_mutasi`
                       WHERE `item_id`=? AND `batal_at` IS NULL");
  $st->execute([$itemId]);
  return (float)$st->fetchColumn();
}

/* Daftar barang + stok terkini + mutasi dalam rentang (?dari=&ke=).
 *
 * `thumb` (±10-20KB) IKUT, `foto` TIDAK — sama alasannya dengan daftar
 * waste: seratus barang dengan foto penuh berarti puluhan megabita hanya
 * untuk menggambar daftar. Foto penuh ditarik satu per satu lewat
 * ?action=foto saat diklik.
 *
 * Stok dihitung dari SELURUH riwayat, bukan rentang yang dipilih: stok
 * hari ini tidak bergantung bulan yang sedang dilihat. */
function bl_daftar($pdo) {
  bl_pastikan($pdo);
  $items = [];
  $st = $pdo->query("SELECT i.`id`,i.`nama`,i.`kategori`,i.`satuan`,i.`lokasi`,i.`harga`,i.`stok_min`,
                            i.`aktif`,i.`catatan`,i.`thumb`,(COALESCE(i.`foto`,'') <> '') AS ada_foto,
                            i.`dibuat_oleh`,i.`dibuat_at`,i.`diubah_oleh`,i.`diubah_at`,
                            COALESCE(s.stok,0) AS stok, COALESCE(s.n,0) AS n_mutasi,
                            COALESCE(s.tot_break,0) AS tot_break, COALESCE(s.tot_loss,0) AS tot_loss
                     FROM `bl_item` i
                     LEFT JOIN (SELECT `item_id`, SUM(`qty`) AS stok, COUNT(*) AS n,
                                       SUM(CASE WHEN `jenis`='break' THEN -`qty` ELSE 0 END) AS tot_break,
                                       SUM(CASE WHEN `jenis`='loss'  THEN -`qty` ELSE 0 END) AS tot_loss
                                FROM `bl_mutasi` WHERE `batal_at` IS NULL GROUP BY `item_id`) s
                       ON s.`item_id` = i.`id`
                     ORDER BY i.`kategori`, i.`nama`");
  foreach ($st->fetchAll() as $r) {
    $items[] = [
      'id' => $r['id'], 'nama' => $r['nama'], 'kategori' => $r['kategori'],
      'satuan' => $r['satuan'], 'lokasi' => $r['lokasi'],
      'harga' => (float)$r['harga'], 'stokMin' => (float)$r['stok_min'],
      'aktif' => (int)$r['aktif'] === 1, 'catatan' => (string)$r['catatan'],
      'thumb' => (string)$r['thumb'], 'adaFoto' => (bool)$r['ada_foto'],
      'stok' => (float)$r['stok'], 'nMutasi' => (int)$r['n_mutasi'],
      // Sepanjang waktu, bukan periode report: kartu barang tidak boleh
      // berubah angkanya tiap kali periode di layar lain diganti.
      'totBreak' => (float)$r['tot_break'], 'totLoss' => (float)$r['tot_loss'],
      'dibuatOleh' => $r['dibuat_oleh'], 'dibuatAt' => $r['dibuat_at'],
      'diubahOleh' => $r['diubah_oleh'], 'diubahAt' => $r['diubah_at'],
    ];
  }

  $sql = "SELECT `id`,`item_id`,`tanggal`,`jenis`,`qty`,`harga`,`sebab`,`pic`,`tim`,`catatan`,
                 (COALESCE(`foto`,'') <> '') AS ada_foto,`oleh`,`waktu`,
                 `batal_at`,`batal_oleh`,`batal_alasan`,`diubah_oleh`,`diubah_at`,`riwayat`
          FROM `bl_mutasi` WHERE 1=1";
  $par = [];
  pur_filter_tanggal($sql, $par);
  $sql .= " ORDER BY `tanggal` DESC, `waktu` DESC LIMIT 3000";
  $q = $pdo->prepare($sql); $q->execute($par);
  $mutasi = [];
  foreach ($q->fetchAll() as $r) {
    $mutasi[] = [
      'id' => $r['id'], 'itemId' => $r['item_id'], 'tanggal' => $r['tanggal'],
      'jenis' => $r['jenis'], 'qty' => (float)$r['qty'], 'harga' => (float)$r['harga'],
      'sebab' => $r['sebab'], 'pic' => $r['pic'], 'tim' => $r['tim'],
      'catatan' => (string)$r['catatan'], 'adaFoto' => (bool)$r['ada_foto'],
      'oleh' => $r['oleh'], 'waktu' => $r['waktu'],
      'batalAt' => $r['batal_at'], 'batalOleh' => $r['batal_oleh'], 'batalAlasan' => $r['batal_alasan'],
      'diubahOleh' => $r['diubah_oleh'], 'diubahAt' => $r['diubah_at'],
      'riwayat' => ($rw = json_decode((string)$r['riwayat'], true)) && is_array($rw) ? $rw : [],
    ];
  }
  return ['status' => 'success', 'items' => $items, 'mutasi' => $mutasi];
}

function bl_foto($pdo, $jenis, $id) {
  bl_pastikan($pdo);
  $tabel = $jenis === 'mutasi' ? 'bl_mutasi' : 'bl_item';   // daftar tertutup, bukan dari permintaan
  $st = $pdo->prepare("SELECT `foto`,`foto_nama` FROM `$tabel` WHERE `id`=? LIMIT 1");
  $st->execute([$id]);
  $r = $st->fetch();
  if (!$r || (string)$r['foto'] === '') return ['status' => 'error', 'message' => 'foto tidak ada'];
  return ['status' => 'success', 'foto' => $r['foto'], 'fotoNama' => $r['foto_nama']];
}

/* Daftarkan / sunting barang.
   `foto` & `thumb` TIDAK dikirim (null) = pertahankan yang lama; string
   kosong = sengaja dihapus. Tanpa pembedaan itu, menyunting harga tanpa
   memilih ulang berkas menghapus fotonya diam-diam (pelajaran waste). */
function bl_item_simpan($pdo, $b) {
  bl_pastikan($pdo);
  $id     = trim((string)($b->id ?? ''));
  $nama   = bl_potong(trim(preg_replace('/\s+/', ' ', (string)($b->nama ?? ''))), 0, 160);
  if ($nama === '') return ['status' => 'error', 'message' => 'nama barang wajib diisi', 'kurang' => ['nama']];
  $kat    = bl_potong(trim((string)($b->kategori ?? '')), 0, 80);
  $satuan = bl_potong(trim((string)($b->satuan ?? '')), 0, 30);
  if ($satuan === '') $satuan = 'pcs';
  $lokasi = bl_potong(trim((string)($b->lokasi ?? '')), 0, 80);
  $harga  = isset($b->harga) ? (float)$b->harga : 0;
  $min    = isset($b->stokMin) ? (float)$b->stokMin : 0;
  if ($harga < 0 || $min < 0) return ['status' => 'error', 'message' => 'harga & stok minimum tidak boleh minus'];
  if (floor($min) != $min) return ['status' => 'error', 'message' => 'stok minimum harus bilangan bulat'];
  $cat    = trim((string)($b->catatan ?? ''));
  $foto   = $b->foto ?? null;
  $thumb  = $b->thumb ?? null;
  if ($foto !== null && !bl_foto_sah($foto, 4 * 1024 * 1024))  return ['status' => 'error', 'message' => 'foto tidak sah atau terlalu besar'];
  if ($thumb !== null && !bl_foto_sah($thumb, 300 * 1024))     return ['status' => 'error', 'message' => 'thumbnail tidak sah'];
  $oleh = bl_nama_pemanggil($b);
  $kini = date('Y-m-d H:i:s');

  try {
    if ($id !== '') {
      $ada = $pdo->prepare("SELECT 1 FROM `bl_item` WHERE `id`=?"); $ada->execute([$id]);
      if (!$ada->fetchColumn()) return ['status' => 'error', 'message' => 'barang tidak ditemukan'];
      $set = "`nama`=?,`kategori`=?,`satuan`=?,`lokasi`=?,`harga`=?,`stok_min`=?,`catatan`=?,`diubah_oleh`=?,`diubah_at`=?";
      $par = [$nama, $kat, $satuan, $lokasi, $harga, $min, $cat, $oleh, $kini];
      if ($foto !== null) { $set .= ",`foto`=?,`foto_nama`=?"; $par[] = (string)$foto; $par[] = bl_potong(trim((string)($b->fotoNama ?? '')), 0, 200); }
      if ($thumb !== null) { $set .= ",`thumb`=?"; $par[] = (string)$thumb; }
      $par[] = $id;
      $pdo->prepare("UPDATE `bl_item` SET $set WHERE `id`=?")->execute($par);
      return ['status' => 'success', 'id' => $id];
    }

    /* Stok awal dicatat sebagai MUTASI 'masuk', bukan kolom di barangnya —
       stok di modul ini selalu jumlah catatannya, tanpa pengecualian. Satu
       transaksi: barang yang lahir tanpa stok awalnya meninggalkan stok nol
       yang terbaca seolah semuanya sudah pecah. */
    $awal = isset($b->stokAwal) ? (float)$b->stokAwal : 0;
    if ($awal < 0 || floor($awal) != $awal) return ['status' => 'error', 'message' => 'stok awal harus bilangan bulat dan tidak minus'];
    $id = pur_uid('BLI');
    $pdo->beginTransaction();
    $pdo->prepare("INSERT INTO `bl_item`
        (`id`,`nama`,`kategori`,`satuan`,`lokasi`,`harga`,`stok_min`,`aktif`,`catatan`,`thumb`,`foto`,`foto_nama`,`dibuat_oleh`,`dibuat_at`)
        VALUES (?,?,?,?,?,?,?,1,?,?,?,?,?,?)")
      ->execute([$id, $nama, $kat, $satuan, $lokasi, $harga, $min, $cat,
                 (string)($thumb ?? ''), (string)($foto ?? ''),
                 bl_potong(trim((string)($b->fotoNama ?? '')), 0, 200), $oleh, $kini]);
    if ($awal > 0) {
      $pdo->prepare("INSERT INTO `bl_mutasi`
          (`id`,`item_id`,`tanggal`,`jenis`,`qty`,`harga`,`sebab`,`catatan`,`oleh`,`waktu`)
          VALUES (?,?,?,?,?,?,?,?,?,?)")
        ->execute([pur_uid('BLM'), $id, date('Y-m-d'), 'masuk', $awal, $harga, 'Stok awal', '', $oleh, $kini]);
    }
    $pdo->commit();
    return ['status' => 'success', 'id' => $id];
  } catch (PDOException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    // 23000 = melanggar kunci unik nama. Dua barang bernama sama memecah
    // rekapnya jadi dua baris dan tidak ada yang bisa menjumlahkannya lagi.
    if ($e->getCode() === '23000') return ['status' => 'error', 'message' => 'Nama barang "' . $nama . '" sudah terdaftar.', 'kurang' => ['nama']];
    throw $e;
  }
}

/* Nonaktifkan / aktifkan lagi. TIDAK menghapus — riwayat break & loss
   barang itu tetap harus menunjuk ke namanya. */
function bl_item_aktif($pdo, $b) {
  bl_pastikan($pdo);
  $id = trim((string)($b->id ?? ''));
  $aktif = !empty($b->aktif) ? 1 : 0;
  $st = $pdo->prepare("SELECT 1 FROM `bl_item` WHERE `id`=?"); $st->execute([$id]);
  if (!$st->fetchColumn()) return ['status' => 'error', 'message' => 'barang tidak ditemukan'];
  $pdo->prepare("UPDATE `bl_item` SET `aktif`=?,`diubah_oleh`=?,`diubah_at`=? WHERE `id`=?")
      ->execute([$aktif, bl_nama_pemanggil($b), date('Y-m-d H:i:s'), $id]);
  return ['status' => 'success'];
}

/* Catat satu mutasi. Satu transaksi, dan baris barangnya DIKUNCI: opname
   menghitung selisih dari stok saat ini, dan dua opname yang berjalan
   bersamaan tanpa kunci sama-sama membaca stok lama — selisihnya terhitung
   dua kali. */
function bl_mutasi_simpan($pdo, $b) {
  bl_pastikan($pdo);
  $itemId  = trim((string)($b->itemId ?? ''));
  $jenis   = trim((string)($b->jenis ?? ''));
  $tanggal = trim((string)($b->tanggal ?? ''));
  $sebab   = bl_potong(trim((string)($b->sebab ?? '')), 0, 200);
  $kurang  = [];
  if ($itemId === '') $kurang[] = 'itemId';
  if (!in_array($jenis, ['break', 'loss', 'masuk', 'opname'], true)) return ['status' => 'error', 'message' => 'jenis tidak dikenal'];
  if (!bl_tanggal_sah($tanggal)) $kurang[] = 'tanggal';
  if (($jenis === 'break' || $jenis === 'loss') && $sebab === '') $kurang[] = 'sebab';

  $qty = null; $fisik = null;
  if ($jenis === 'opname') {
    $fisik = isset($b->fisik) && $b->fisik !== '' ? (float)$b->fisik : null;
    if ($fisik === null || $fisik < 0 || floor($fisik) != $fisik) $kurang[] = 'fisik';
  } else {
    $qty = isset($b->qty) ? (float)$b->qty : 0;
    // Bilangan bulat: barang inventaris dihitung per buah (permintaan user).
    if ($qty <= 0 || floor($qty) != $qty) $kurang[] = 'qty';
  }
  if ($kurang) return ['status' => 'error', 'message' => 'Belum lengkap: ' . implode(', ', $kurang), 'kurang' => $kurang];

  $foto = (string)($b->foto ?? '');
  if (!bl_foto_sah($foto, 4 * 1024 * 1024)) return ['status' => 'error', 'message' => 'foto tidak sah atau terlalu besar'];
  $oleh = bl_nama_pemanggil($b);

  $pdo->beginTransaction();
  try {
    $st = $pdo->prepare("SELECT `harga`,`aktif` FROM `bl_item` WHERE `id`=? FOR UPDATE");
    $st->execute([$itemId]);
    $it = $st->fetch();
    if (!$it) { $pdo->rollBack(); return ['status' => 'error', 'message' => 'barang tidak ditemukan']; }
    // Barang nonaktif tidak menerima catatan baru: ia sudah dinyatakan
    // tidak dipakai, dan catatan untuknya hampir selalu salah pilih barang.
    if ((int)$it['aktif'] !== 1) { $pdo->rollBack(); return ['status' => 'error', 'message' => 'barang ini sudah dinonaktifkan']; }

    $stokSebelum = bl_stok_satu($pdo, $itemId);
    if ($jenis === 'opname') $delta = round($fisik - $stokSebelum, 2);
    else $delta = $jenis === 'masuk' ? $qty : -$qty;

    $id = pur_uid('BLM');
    /* Harga DISALIN ke barisnya: nilai kerugian bulan lalu tidak boleh ikut
       berubah waktu harga barangnya disunting bulan ini. */
    $pdo->prepare("INSERT INTO `bl_mutasi`
        (`id`,`item_id`,`tanggal`,`jenis`,`qty`,`harga`,`sebab`,`pic`,`tim`,`catatan`,`foto`,`foto_nama`,`oleh`,`waktu`)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      ->execute([$id, $itemId, $tanggal, $jenis, $delta, (float)$it['harga'], $sebab,
                 bl_potong(trim((string)($b->pic ?? '')), 0, 120),
                 bl_potong(trim((string)($b->tim ?? '')), 0, 40),
                 trim((string)($b->catatan ?? '')), $foto,
                 bl_potong(trim((string)($b->fotoNama ?? '')), 0, 200), $oleh, date('Y-m-d H:i:s')]);
    $pdo->commit();
    return ['status' => 'success', 'id' => $id, 'delta' => $delta, 'stok' => $stokSebelum + $delta];
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
  }
}

/* UBAH catatan break / loss (permintaan user 10 Oktober 2026: "report break
 * & loss bisa di edit").
 *
 * HANYA break & loss yang belum dibatalkan. Masuk & opname tidak: selisih
 * opname dihitung dari stok SAAT itu, dan menyuntingnya belakangan
 * menghasilkan angka yang tidak pernah benar di titik waktu mana pun — yang
 * salah di sana dibatalkan lalu dicatat ulang.
 *
 * Catatan pertanggungjawaban yang angkanya bisa ditimpa tanpa jejak sama
 * saja dengan draf, jadi NILAI SEBELUMNYA disimpan di `riwayat` (JSON, 20
 * terakhir) berikut siapa & kapan mengubahnya.
 *
 * Harga: barang yang SAMA mempertahankan harga barisnya (harga saat
 * kejadian); barang yang DIGANTI memakai harga barang barunya — harga lama
 * milik barang lain dan tidak berarti apa pun untuk barang ini.
 *
 * Foto: tidak dikirim (null) = pertahankan; string kosong = dihapus. */
function bl_mutasi_ubah($pdo, $b) {
  bl_pastikan($pdo);
  $id      = trim((string)($b->id ?? ''));
  $itemId  = trim((string)($b->itemId ?? ''));
  $jenis   = trim((string)($b->jenis ?? ''));
  $tanggal = trim((string)($b->tanggal ?? ''));
  $sebab   = bl_potong(trim((string)($b->sebab ?? '')), 0, 200);
  $qty     = isset($b->qty) ? (float)$b->qty : 0;
  if ($id === '') return ['status' => 'error', 'message' => 'catatan tidak disebut'];
  if (!in_array($jenis, ['break', 'loss'], true)) return ['status' => 'error', 'message' => 'hanya break & loss yang bisa diubah'];
  $kurang = [];
  if ($itemId === '') $kurang[] = 'itemId';
  if (!bl_tanggal_sah($tanggal)) $kurang[] = 'tanggal';
  if ($sebab === '') $kurang[] = 'sebab';
  if ($qty <= 0 || floor($qty) != $qty) $kurang[] = 'qty';
  if ($kurang) return ['status' => 'error', 'message' => 'Belum lengkap: ' . implode(', ', $kurang), 'kurang' => $kurang];
  $foto = $b->foto ?? null;
  if ($foto !== null && !bl_foto_sah($foto, 4 * 1024 * 1024)) return ['status' => 'error', 'message' => 'foto tidak sah atau terlalu besar'];
  $oleh = bl_nama_pemanggil($b);

  $pdo->beginTransaction();
  try {
    $st = $pdo->prepare("SELECT * FROM `bl_mutasi` WHERE `id`=? FOR UPDATE");
    $st->execute([$id]);
    $lama = $st->fetch();
    if (!$lama) { $pdo->rollBack(); return ['status' => 'error', 'message' => 'catatan tidak ditemukan']; }
    if ($lama['batal_at'] !== null) { $pdo->rollBack(); return ['status' => 'error', 'message' => 'catatan yang sudah dibatalkan tidak bisa diubah']; }
    if (!in_array($lama['jenis'], ['break', 'loss'], true)) { $pdo->rollBack(); return ['status' => 'error', 'message' => 'catatan masuk / opname tidak bisa diubah — batalkan lalu catat ulang']; }

    $st = $pdo->prepare("SELECT `harga`,`aktif` FROM `bl_item` WHERE `id`=? FOR UPDATE");
    $st->execute([$itemId]);
    $it = $st->fetch();
    if (!$it) { $pdo->rollBack(); return ['status' => 'error', 'message' => 'barang tidak ditemukan']; }
    $gantiBarang = $itemId !== $lama['item_id'];
    // Pindah KE barang nonaktif ditolak (sama dengan catatan baru); catatan
    // lama milik barang yang kemudian dinonaktifkan tetap boleh dibetulkan.
    if ($gantiBarang && (int)$it['aktif'] !== 1) { $pdo->rollBack(); return ['status' => 'error', 'message' => 'barang tujuan sudah dinonaktifkan']; }
    $harga = $gantiBarang ? (float)$it['harga'] : (float)$lama['harga'];

    $riwayat = json_decode((string)($lama['riwayat'] ?? ''), true);
    if (!is_array($riwayat)) $riwayat = [];
    $riwayat[] = ['at' => date('Y-m-d H:i:s'), 'oleh' => $oleh, 'sebelum' => [
      'itemId' => $lama['item_id'], 'tanggal' => $lama['tanggal'], 'jenis' => $lama['jenis'],
      'qty' => (float)$lama['qty'], 'harga' => (float)$lama['harga'], 'sebab' => $lama['sebab'],
      'tim' => $lama['tim'], 'catatan' => (string)$lama['catatan'], 'adaFoto' => (string)$lama['foto'] !== '',
    ]];
    $riwayat = array_slice($riwayat, -20);

    $set = "`item_id`=?,`tanggal`=?,`jenis`=?,`qty`=?,`harga`=?,`sebab`=?,`tim`=?,`catatan`=?,`diubah_oleh`=?,`diubah_at`=?,`riwayat`=?";
    $par = [$itemId, $tanggal, $jenis, -$qty, $harga, $sebab,
            bl_potong(trim((string)($b->tim ?? '')), 0, 40), trim((string)($b->catatan ?? '')),
            $oleh, date('Y-m-d H:i:s'), json_encode($riwayat, JSON_UNESCAPED_UNICODE)];
    if ($foto !== null) {
      $set .= ",`foto`=?,`foto_nama`=?";
      $par[] = (string)$foto; $par[] = bl_potong(trim((string)($b->fotoNama ?? '')), 0, 200);
    }
    $par[] = $id;
    $pdo->prepare("UPDATE `bl_mutasi` SET $set WHERE `id`=?")->execute($par);
    $stok = bl_stok_satu($pdo, $itemId);
    $pdo->commit();
    return ['status' => 'success', 'id' => $id, 'stok' => $stok];
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
  }
}

/* Batalkan catatan salah input. Alasan WAJIB, dan baris yang sudah batal
   tidak bisa dibatalkan lagi — kalau bisa, jejak pembatal pertama tertimpa. */
function bl_mutasi_batal($pdo, $b) {
  bl_pastikan($pdo);
  $id = trim((string)($b->id ?? ''));
  $alasan = bl_potong(trim((string)($b->alasan ?? '')), 0, 300);
  if ($alasan === '') return ['status' => 'error', 'message' => 'alasan pembatalan wajib diisi'];
  $st = $pdo->prepare("UPDATE `bl_mutasi` SET `batal_at`=?,`batal_oleh`=?,`batal_alasan`=?
                       WHERE `id`=? AND `batal_at` IS NULL");
  $st->execute([date('Y-m-d H:i:s'), bl_nama_pemanggil($b), $alasan, $id]);
  if ($st->rowCount()) return ['status' => 'success'];
  return ['status' => 'error', 'message' => 'catatan tidak ditemukan atau sudah dibatalkan'];
}
