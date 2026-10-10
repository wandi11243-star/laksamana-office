<?php
/************************************************************************
 * STOCK — GUDANG BAR: buku stok gudang khusus bar (10 Oktober 2026).
 * ---------------------------------------------------------------------
 * Permintaan user: "tambahin sub menu baru, gudang bar — konsepnya seperti
 * central kitchen, tapi dikhususkan untuk di-view oleh bar". Halamannya di
 * panel Ordering (menu Gudang Bar), hak aksesnya lewat matriks per sub-menu
 * di Kelola Akses panel itu.
 *
 * BARANGNYA = master `products` yang area-nya memuat "Bar" (kolom Area di
 * Purchasing → Atur Produk). Tidak ada daftar kedua: barang bar yang baru
 * didaftarkan di Purchasing langsung muncul di sini, dan yang area-nya
 * dicabut berhenti ditawarkan — tapi saldonya TETAP tampil (ditandai
 * `hilang`) selama masih ada mutasinya, aturan yang sama dengan CK.
 *
 * DUA ATURAN YANG SAMA DENGAN CENTRAL KITCHEN, dan alasannya sama:
 *  1. SALDO TIDAK PERNAH DISIMPAN — selalu SUM(masuk) - SUM(keluar).
 *  2. qty DISIMPAN DALAM SATUAN DASAR barang (satuanDasar + peta `isi`),
 *     dikonversi SEKALI di pintu masuk. Mengubah isi satuan di master tidak
 *     boleh menulis ulang sejarah.
 *
 * BEDANYA DARI CK: TIDAK ADA DELETE. Mutasi salah DIBATALKAN (batal_at,
 * alasan wajib) — barisnya tetap terbaca dan tidak ikut dijumlahkan. Buku
 * stok yang barisnya bisa dihapus tidak bisa dipakai menjawab "ke mana
 * botol itu pergi".
 *
 * TABELNYA LAHIR SENDIRI lewat gb_pastikan(), bukan berkas migrasi:
 * migrasi-*.sql di repo ini rutin tertinggal di produksi — persis yang
 * membuat stock_settings tidak pernah ada di server mana pun.
 ************************************************************************/
require_once __DIR__ . '/lib_stock_catat.php';

function gb_pastikan($pdo) {
  $pdo->exec("CREATE TABLE IF NOT EXISTS `gb_stock` (
      `id`           VARCHAR(40)  NOT NULL PRIMARY KEY,
      `tanggal`      DATE         NOT NULL,
      `item`         VARCHAR(160) NOT NULL,
      `arah`         VARCHAR(10)  NOT NULL,
      `qty`          DOUBLE       NOT NULL DEFAULT 0,
      `qty_input`    DOUBLE       NOT NULL DEFAULT 0,
      `unit_input`   VARCHAR(30)  NOT NULL DEFAULT '',
      `satuan`       VARCHAR(30)  NOT NULL DEFAULT '',
      `sebab`        VARCHAR(30)  NOT NULL DEFAULT '',
      `catatan`      VARCHAR(255) NOT NULL DEFAULT '',
      `pic`          VARCHAR(80)  NOT NULL DEFAULT '',
      `waktu`        DATETIME     NOT NULL,
      `batal_at`     DATETIME     NULL,
      `batal_oleh`   VARCHAR(80)  NOT NULL DEFAULT '',
      `batal_alasan` VARCHAR(255) NOT NULL DEFAULT '',
      KEY `idx_gb_item` (`item`),
      KEY `idx_gb_tgl`  (`tanggal`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

/* Sebab yang sah per arah. Daftar tertutup: sebab bebas membuat rekap
   "keluar karena apa" pecah jadi ejaan-ejaan yang tidak bisa dijumlahkan. */
function gb_sebab_sah() {
  return [
    'masuk'  => ['terima', 'retur', 'penyesuaian'],
    'keluar' => ['ambil', 'rusak', 'penyesuaian'],
  ];
}

/* Master barang bar. Area dicocokkan tanpa memandang huruf besar-kecil:
   isinya dipilih di Purchasing, tapi data lama bisa saja diketik. */
function gb_produk($pdo) {
  $out = [];
  foreach ($pdo->query("SELECT `nama`,`data` FROM `products` ORDER BY `nama`")->fetchAll() as $r) {
    $d = json_decode($r['data']);
    if (!is_object($d)) continue;
    $area = isset($d->area) && is_array($d->area) ? $d->area : [];
    $bar = false;
    foreach ($area as $a) if (strtolower(trim((string)$a)) === 'bar') $bar = true;
    if (!$bar) continue;
    $satuan = isset($d->satuan) && is_array($d->satuan) ? array_values(array_map('strval', $d->satuan)) : [];
    $dasar = isset($d->satuanDasar) ? trim((string)$d->satuanDasar) : '';
    if ($dasar === '') $dasar = $satuan ? $satuan[0] : 'Pcs';
    $isi = [];
    if (isset($d->isi) && is_object($d->isi)) foreach ($d->isi as $u => $f) if ((float)$f > 0) $isi[(string)$u] = (float)$f;
    $out[$r['nama']] = (object)[
      'satuan'   => $satuan,
      'dasar'    => $dasar,
      'isi'      => $isi,
      'kategori' => isset($d->kategori) ? (string)$d->kategori : '',
      'aktif'    => !(isset($d->aktif) && $d->aktif === false),
    ];
  }
  return $out;
}

/* Ubah jumlah yang diketik ke satuan dasar. Satuan yang tidak punya isi di
   master dipakai apa adanya (aturan CK): ditolak, barang yang masternya
   belum lengkap tidak bisa dicatat sama sekali oleh orang bar. Yang tidak
   terkonversi DITANDAI (`ok` false) supaya layar bisa mengatakannya. */
function gb_ke_dasar($qty, $unit, $p) {
  $qty = (float)$qty; $unit = trim((string)$unit);
  if ($unit === '' || strcasecmp($unit, $p->dasar) === 0) return [$qty, true];
  foreach ($p->isi as $u => $f) if (strcasecmp($u, $unit) === 0) return [$qty * $f, true];
  return [$qty, false];
}

function gb_saldo($pdo) {
  $produk = gb_produk($pdo);
  $agg = [];
  $sql = "SELECT `item`,
                 SUM(CASE WHEN `arah`='masuk'  THEN `qty` ELSE 0 END) AS masuk,
                 SUM(CASE WHEN `arah`='keluar' THEN `qty` ELSE 0 END) AS keluar,
                 MAX(`tanggal`) AS terakhir
            FROM `gb_stock` WHERE `batal_at` IS NULL GROUP BY `item`";
  foreach ($pdo->query($sql)->fetchAll() as $r) $agg[$r['item']] = $r;

  $out = [];
  foreach ($produk as $nama => $p) {
    $a = $agg[$nama] ?? null;
    $m = $a ? (float)$a['masuk'] : 0; $k = $a ? (float)$a['keluar'] : 0;
    $out[$nama] = ['item' => $nama, 'satuan' => $p->dasar, 'pilihan' => $p->satuan,
                   'isi' => (object)$p->isi, 'kategori' => $p->kategori, 'aktif' => $p->aktif,
                   'masuk' => $m, 'keluar' => $k, 'saldo' => $m - $k,
                   'terakhir' => $a ? (string)$a['terakhir'] : ''];
  }
  foreach ($agg as $nama => $a) {
    if (isset($out[$nama])) continue;
    $m = (float)$a['masuk']; $k = (float)$a['keluar'];
    if ($m == 0 && $k == 0) continue;
    $out[$nama] = ['item' => $nama, 'satuan' => '', 'pilihan' => [], 'isi' => (object)[],
                   'kategori' => '', 'aktif' => false, 'masuk' => $m, 'keluar' => $k,
                   'saldo' => $m - $k, 'terakhir' => (string)$a['terakhir'], 'hilang' => true];
  }
  ksort($out);
  return array_values($out);
}

function gb_mutasi($pdo) {
  $sql = "SELECT * FROM `gb_stock` WHERE 1=1";
  $par = [];
  pur_filter_tanggal($sql, $par);
  $sql .= " ORDER BY `tanggal` DESC, `waktu` DESC LIMIT 2000";
  $st = $pdo->prepare($sql);
  $st->execute($par);
  $out = [];
  foreach ($st->fetchAll() as $r) {
    $out[] = ['id' => $r['id'], 'tanggal' => $r['tanggal'], 'item' => $r['item'], 'arah' => $r['arah'],
              'qty' => (float)$r['qty'], 'qtyInput' => (float)$r['qty_input'], 'unitInput' => $r['unit_input'],
              'satuan' => $r['satuan'], 'sebab' => $r['sebab'], 'catatan' => $r['catatan'],
              'pic' => $r['pic'], 'waktu' => $r['waktu'],
              'batalAt' => $r['batal_at'], 'batalOleh' => $r['batal_oleh'], 'batalAlasan' => $r['batal_alasan']];
  }
  return $out;
}

/* Satu kiriman boleh membawa beberapa barang (`items`), dan disimpan dalam
   SATU transaksi: berhenti di tengah meninggalkan penerimaan yang tercatat
   separuh, dan tidak ada layar yang bisa menyebut sampai mana. */
function gb_simpan($pdo, $b) {
  $arah = strtolower(trim((string)($b->arah ?? '')));
  $sah = gb_sebab_sah();
  if (!isset($sah[$arah])) return ['status' => 'error', 'message' => 'arah harus masuk/keluar'];
  $sebab = strtolower(trim((string)($b->sebab ?? '')));
  if (!in_array($sebab, $sah[$arah], true)) return ['status' => 'error', 'message' => 'sebab tidak dikenal untuk arah ' . $arah . ': ' . $sebab];
  $tanggal = trim((string)($b->tanggal ?? ''));
  if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $tanggal, $m) || !checkdate((int)$m[2], (int)$m[3], (int)$m[1]))
    return ['status' => 'error', 'message' => 'tanggal tidak sah'];
  $pic = substr(trim((string)($b->pic ?? '')), 0, 80);
  $catatanUmum = substr(trim((string)($b->catatan ?? '')), 0, 255);
  $items = isset($b->items) && is_array($b->items) ? $b->items : [];
  if (!$items) return ['status' => 'error', 'message' => 'belum ada barang'];

  $produk = gb_produk($pdo);
  $baris = []; $salah = [];
  foreach ($items as $it) {
    $nama = trim((string)($it->item ?? ''));
    if ($nama === '') continue;
    $p = $produk[$nama] ?? null;
    if (!$p) { $salah[] = $nama . ' (bukan barang Gudang Bar)'; continue; }
    $q = (float)($it->qty ?? 0);
    if ($q <= 0) { $salah[] = $nama . ' (jumlah harus lebih dari 0)'; continue; }
    $unit = trim((string)($it->unit ?? '')) ?: $p->dasar;
    list($dasar) = gb_ke_dasar($q, $unit, $p);
    $baris[] = [$nama, $dasar, $q, $unit, $p->dasar,
                substr(trim((string)($it->catatan ?? '')) ?: $catatanUmum, 0, 255)];
  }
  if ($salah) return ['status' => 'error', 'message' => 'ditolak: ' . implode(', ', $salah)];
  if (!$baris) return ['status' => 'error', 'message' => 'belum ada barang'];

  $waktu = date('Y-m-d H:i:s');
  $ins = $pdo->prepare("INSERT INTO `gb_stock`
      (`id`,`tanggal`,`item`,`arah`,`qty`,`qty_input`,`unit_input`,`satuan`,`sebab`,`catatan`,`pic`,`waktu`)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
  $pdo->beginTransaction();
  try {
    $ids = [];
    foreach ($baris as $i => $x) {
      $id = pur_uid('GB') . dechex($i);
      $ins->execute([$id, $tanggal, $x[0], $arah, $x[1], $x[2], $x[3], $x[4], $sebab, $x[5], $pic, $waktu]);
      $ids[] = $id;
    }
    $pdo->commit();
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
  }
  return ['status' => 'success', 'ids' => $ids];
}

function gb_batal($pdo, $b) {
  $id = trim((string)($b->id ?? ''));
  $alasan = substr(trim((string)($b->alasan ?? '')), 0, 255);
  if ($id === '') return ['status' => 'error', 'message' => 'id kosong'];
  if ($alasan === '') return ['status' => 'error', 'message' => 'alasan pembatalan wajib diisi'];
  $st = $pdo->prepare("UPDATE `gb_stock` SET `batal_at`=?, `batal_oleh`=?, `batal_alasan`=?
                        WHERE `id`=? AND `batal_at` IS NULL");
  $st->execute([date('Y-m-d H:i:s'), substr(trim((string)($b->oleh ?? '')), 0, 80), $alasan, $id]);
  if ($st->rowCount() === 0) return ['status' => 'error', 'message' => 'mutasi tidak ditemukan atau sudah dibatalkan'];
  return ['status' => 'success'];
}
