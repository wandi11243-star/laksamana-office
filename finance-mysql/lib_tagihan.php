<?php
/************************************************************************
 * TAGIHAN RUTIN — langganan & tagihan berulang (10 Oktober 2026)
 * ---------------------------------------------------------------------
 * Permintaan user: Wifi CK, Wifi Biznet, Wifi Indihome, Claude, ChatGPT,
 * Spotify, YouTube — "dibayar setiap kapan, dan sudah berapa total yang
 * kita bayarkan". Halamannya di panel Kas Kecil (deploy/finance/kas/,
 * menu Tagihan Rutin, kunci izin 'finance').
 *
 * DUA TABEL, dan pemisahannya yang membuat angka totalnya bisa dipercaya:
 *
 *   kk_tagihan        daftar tagihannya (nama, nominal, tiap berapa bulan,
 *                     jatuh tempo pertama). Yang BERUBAH-UBAH.
 *   kk_tagihan_bayar  satu baris per pembayaran yang benar-benar terjadi,
 *                     berikut nominal SAAT ITU. Yang tidak boleh berubah.
 *
 * Nominal DISALIN ke baris pembayaran, tidak dibaca dari master: harga
 * langganan naik, dan "total yang sudah kita bayarkan" yang dihitung ulang
 * dari harga hari ini akan diam-diam menulis ulang sejarah.
 *
 * JATUH TEMPO TIDAK DISIMPAN. Ia dihitung layar dari `mulai` + `siklus`,
 * sama seperti saldo kas kecil: menyimpannya berarti dua sumber untuk satu
 * tanggal, dan yang satu pasti tertinggal begitu siklusnya diubah.
 *
 * TIDAK ADA DELETE untuk pembayaran. Salah input DIBATALKAN (batal_at):
 * barisnya tetap terlihat, dicoret, dan tidak ikut dijumlahkan. Catatan
 * uang yang barisnya bisa dihapus bukan catatan. Tagihan yang tidak dipakai
 * lagi DINONAKTIFKAN, bukan dihapus — riwayat bayarnya tetap terbaca.
 *
 * Tabelnya lahir sendiri lewat tg_pastikan(), bukan berkas migrasi:
 * migrasi-*.sql di repo ini rutin tertinggal di produksi.
 *
 * TIAP PENANDA BERNAMA DIPAKAI SEKALI per prepare() (EMULATE_PREPARES=false
 * mengikatnya menurut posisi — lihat kepala lib_finance_mysql.php).
 ************************************************************************/

/* Siklus yang boleh, dalam bulan. Daftar tertutup: angka bebas (mis. 5)
   membuat jatuh tempo bergeser ke bulan yang tidak dipakai penyedia mana pun,
   dan salahnya baru ketahuan waktu tagihannya sudah lewat. */
function tg_siklus_sah() { return array(1, 2, 3, 6, 12); }

function tg_pastikan() {
  $pdo = db();
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS `kk_tagihan` (
       `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
       `nama`        VARCHAR(120) NOT NULL,
       `kategori`    VARCHAR(80)  NOT NULL DEFAULT \'\',
       `nominal`     BIGINT       NOT NULL DEFAULT 0,
       `siklus`      TINYINT UNSIGNED NOT NULL DEFAULT 1,
       `mulai`       DATE         NULL,
       `metode`      VARCHAR(120) NOT NULL DEFAULT \'\',
       `catatan`     VARCHAR(500) NOT NULL DEFAULT \'\',
       `aktif`       TINYINT(1)   NOT NULL DEFAULT 1,
       `dibuat_oleh` VARCHAR(80)  NOT NULL DEFAULT \'\',
       `dibuat_at`   BIGINT       NOT NULL DEFAULT 0,
       `diubah_oleh` VARCHAR(80)  NOT NULL DEFAULT \'\',
       `diubah_at`   BIGINT       NOT NULL DEFAULT 0
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
  $pdo->exec(
    'CREATE TABLE IF NOT EXISTS `kk_tagihan_bayar` (
       `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
       `tagihan_id`   INT UNSIGNED NOT NULL,
       `periode`      DATE         NOT NULL,
       `tgl_bayar`    DATE         NOT NULL,
       `nominal`      BIGINT       NOT NULL DEFAULT 0,
       `catatan`      VARCHAR(255) NOT NULL DEFAULT \'\',
       `oleh`         VARCHAR(80)  NOT NULL DEFAULT \'\',
       `at`           BIGINT       NOT NULL DEFAULT 0,
       `batal_at`     BIGINT       NULL,
       `batal_oleh`   VARCHAR(80)  NOT NULL DEFAULT \'\',
       `batal_alasan` VARCHAR(255) NOT NULL DEFAULT \'\',
       KEY `idx_tgb_tagihan` (`tagihan_id`, `periode`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
}

function tg_ms() { return (int)round(microtime(true) * 1000); }
function tg_teks($in, $k, $max) {
  $v = isset($in[$k]) ? trim((string)$in[$k]) : '';
  return substr($v, 0, $max);   // substr, bukan mb_substr: mbstring tidak dijamin terpasang
}
/* Tanggal diperiksa checkdate(), bukan cuma polanya: 2026-02-31 lolos regex
   tapi MySQL menyimpannya 0000-00-00 tanpa satu pun galat, dan barisnya lalu
   hilang dari setiap hitungan jatuh tempo. */
function tg_tanggal($v) {
  $v = trim((string)$v);
  if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m)) return null;
  if (!checkdate((int)$m[2], (int)$m[3], (int)$m[1])) return null;
  return $v;
}
function tg_angka($v) {
  if (is_int($v)) return $v;
  $s = preg_replace('/[^0-9-]/', '', (string)$v);
  return $s === '' || $s === '-' ? 0 : (int)$s;
}

function tg_baca() {
  tg_pastikan();
  $pdo = db();
  $t = $pdo->query('SELECT * FROM `kk_tagihan` ORDER BY `aktif` DESC, `nama` ASC')->fetchAll();
  $b = $pdo->query('SELECT * FROM `kk_tagihan_bayar` ORDER BY `tgl_bayar` DESC, `id` DESC')->fetchAll();
  $tagihan = array();
  foreach ($t as $r) {
    $tagihan[] = array(
      'id' => (int)$r['id'], 'nama' => $r['nama'], 'kategori' => $r['kategori'],
      'nominal' => (int)$r['nominal'], 'siklus' => (int)$r['siklus'],
      'mulai' => $r['mulai'] ? $r['mulai'] : '', 'metode' => $r['metode'],
      'catatan' => $r['catatan'], 'aktif' => (int)$r['aktif'] === 1,
      'dibuatOleh' => $r['dibuat_oleh'], 'dibuatAt' => (int)$r['dibuat_at'],
      'diubahOleh' => $r['diubah_oleh'], 'diubahAt' => (int)$r['diubah_at'],
    );
  }
  $bayar = array();
  foreach ($b as $r) {
    $bayar[] = array(
      'id' => (int)$r['id'], 'tagihanId' => (int)$r['tagihan_id'],
      'periode' => $r['periode'], 'tglBayar' => $r['tgl_bayar'],
      'nominal' => (int)$r['nominal'], 'catatan' => $r['catatan'],
      'oleh' => $r['oleh'], 'at' => (int)$r['at'],
      'batalAt' => $r['batal_at'] === null ? null : (int)$r['batal_at'],
      'batalOleh' => $r['batal_oleh'], 'batalAlasan' => $r['batal_alasan'],
    );
  }
  return array('tagihan' => $tagihan, 'bayar' => $bayar);
}

function tg_simpan($in) {
  tg_pastikan();
  $d = isset($in['data']) && is_array($in['data']) ? $in['data'] : $in;
  $oleh = tg_teks($in, 'oleh', 80);
  $nama = tg_teks($d, 'nama', 120);
  if ($nama === '') throw new Exception('Nama tagihan wajib diisi.');
  $nominal = tg_angka(isset($d['nominal']) ? $d['nominal'] : 0);
  if ($nominal < 0) throw new Exception('Nominal tidak boleh minus.');
  $siklus = (int)(isset($d['siklus']) ? $d['siklus'] : 1);
  if (!in_array($siklus, tg_siklus_sah(), true)) throw new Exception('Siklus tidak dikenal: ' . $siklus . ' bulan.');
  /* `mulai` BOLEH kosong — tagihan yang tanggalnya belum diketahui tetap
     bisa didaftarkan dan dicatat pembayarannya; layarnya menandai
     "jatuh tempo belum diisi". Yang diisi tapi tidak sah DITOLAK, bukan
     dikosongkan diam-diam. */
  $mulaiMentah = isset($d['mulai']) ? trim((string)$d['mulai']) : '';
  $mulai = null;
  if ($mulaiMentah !== '') {
    $mulai = tg_tanggal($mulaiMentah);
    if ($mulai === null) throw new Exception('Tanggal jatuh tempo pertama tidak sah: ' . $mulaiMentah);
  }
  $kategori = tg_teks($d, 'kategori', 80);
  $metode   = tg_teks($d, 'metode', 120);
  $catatan  = tg_teks($d, 'catatan', 500);
  $id  = isset($d['id']) ? (int)$d['id'] : 0;
  $now = tg_ms();
  $pdo = db();
  if ($id > 0) {
    $st = $pdo->prepare('UPDATE `kk_tagihan` SET `nama`=:nama, `kategori`=:kat, `nominal`=:nom,
        `siklus`=:sik, `mulai`=:mul, `metode`=:met, `catatan`=:cat, `diubah_oleh`=:oleh, `diubah_at`=:at
      WHERE `id`=:id');
    $st->execute(array(':nama' => $nama, ':kat' => $kategori, ':nom' => $nominal, ':sik' => $siklus,
      ':mul' => $mulai, ':met' => $metode, ':cat' => $catatan, ':oleh' => $oleh, ':at' => $now, ':id' => $id));
    if ($st->rowCount() === 0) {
      $c = $pdo->prepare('SELECT COUNT(*) AS n FROM `kk_tagihan` WHERE `id`=:id');
      $c->execute(array(':id' => $id));
      if ((int)$c->fetch()['n'] === 0) throw new Exception('Tagihan tidak ditemukan (id ' . $id . ').');
    }
  } else {
    $st = $pdo->prepare('INSERT INTO `kk_tagihan`
        (`nama`,`kategori`,`nominal`,`siklus`,`mulai`,`metode`,`catatan`,`dibuat_oleh`,`dibuat_at`)
      VALUES (:nama,:kat,:nom,:sik,:mul,:met,:cat,:oleh,:at)');
    $st->execute(array(':nama' => $nama, ':kat' => $kategori, ':nom' => $nominal, ':sik' => $siklus,
      ':mul' => $mulai, ':met' => $metode, ':cat' => $catatan, ':oleh' => $oleh, ':at' => $now));
    $id = (int)$pdo->lastInsertId();
  }
  return array('id' => $id);
}

function tg_aktif($in) {
  tg_pastikan();
  $id = isset($in['id']) ? (int)$in['id'] : 0;
  $st = db()->prepare('UPDATE `kk_tagihan` SET `aktif`=:a, `diubah_oleh`=:oleh, `diubah_at`=:at WHERE `id`=:id');
  $st->execute(array(':a' => !empty($in['aktif']) ? 1 : 0, ':oleh' => tg_teks($in, 'oleh', 80),
    ':at' => tg_ms(), ':id' => $id));
  return array('diubah' => $st->rowCount());
}

/* Satu jatuh tempo dibayar SEKALI. Dua orang finance yang sama-sama melihat
   "Wifi Biznet terlambat" lalu sama-sama menekan Bayar akan melipatgandakan
   total yang tercatat — dan angka itu persis yang ditanyakan halaman ini.
   Penjaganya di server, di dalam transaksi + FOR UPDATE pada baris
   tagihannya, karena pemeriksaan di layar sudah basi begitu orang kedua
   menekan tombolnya. Pembayaran yang DIBATALKAN tidak ikut menahan. */
function tg_bayar($in) {
  tg_pastikan();
  $d = isset($in['data']) && is_array($in['data']) ? $in['data'] : $in;
  $tid = isset($d['tagihanId']) ? (int)$d['tagihanId'] : 0;
  if ($tid <= 0) throw new Exception('Tagihan belum dipilih.');
  $periode = tg_tanggal(isset($d['periode']) ? $d['periode'] : '');
  if ($periode === null) throw new Exception('Periode (jatuh tempo yang dibayar) wajib diisi.');
  $tgl = tg_tanggal(isset($d['tglBayar']) ? $d['tglBayar'] : '');
  if ($tgl === null) throw new Exception('Tanggal bayar wajib diisi.');
  $nominal = tg_angka(isset($d['nominal']) ? $d['nominal'] : 0);
  if ($nominal <= 0) throw new Exception('Nominal yang dibayar wajib diisi.');
  $catatan = tg_teks($d, 'catatan', 255);
  $oleh = tg_teks($in, 'oleh', 80);
  $pdo = db();
  $pdo->beginTransaction();
  try {
    $c = $pdo->prepare('SELECT `id`,`nama` FROM `kk_tagihan` WHERE `id`=:id FOR UPDATE');
    $c->execute(array(':id' => $tid));
    $t = $c->fetch();
    if (!$t) throw new Exception('Tagihan tidak ditemukan (id ' . $tid . ').');
    $g = $pdo->prepare('SELECT `tgl_bayar`,`oleh` FROM `kk_tagihan_bayar`
      WHERE `tagihan_id`=:tid AND `periode`=:per AND `batal_at` IS NULL LIMIT 1');
    $g->execute(array(':tid' => $tid, ':per' => $periode));
    $ada = $g->fetch();
    if ($ada) throw new Exception('"' . $t['nama'] . '" jatuh tempo ' . $periode . ' sudah tercatat dibayar '
      . $ada['tgl_bayar'] . ($ada['oleh'] !== '' ? ' oleh ' . $ada['oleh'] : '')
      . '. Kalau catatan itu salah, batalkan dulu di Riwayat.');
    $st = $pdo->prepare('INSERT INTO `kk_tagihan_bayar`
        (`tagihan_id`,`periode`,`tgl_bayar`,`nominal`,`catatan`,`oleh`,`at`)
      VALUES (:tid,:per,:tgl,:nom,:cat,:oleh,:at)');
    $st->execute(array(':tid' => $tid, ':per' => $periode, ':tgl' => $tgl, ':nom' => $nominal,
      ':cat' => $catatan, ':oleh' => $oleh, ':at' => tg_ms()));
    $id = (int)$pdo->lastInsertId();
    $pdo->commit();
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
  }
  return array('id' => $id);
}

function tg_batal($in) {
  tg_pastikan();
  $id = isset($in['id']) ? (int)$in['id'] : 0;
  $alasan = tg_teks($in, 'alasan', 255);
  if ($alasan === '') throw new Exception('Alasan pembatalan wajib diisi.');
  $st = db()->prepare('UPDATE `kk_tagihan_bayar` SET `batal_at`=:at, `batal_oleh`=:oleh, `batal_alasan`=:al
    WHERE `id`=:id AND `batal_at` IS NULL');
  $st->execute(array(':at' => tg_ms(), ':oleh' => tg_teks($in, 'oleh', 80), ':al' => $alasan, ':id' => $id));
  if ($st->rowCount() === 0) throw new Exception('Pembayaran tidak ditemukan atau sudah dibatalkan.');
  return array('dibatalkan' => 1);
}
