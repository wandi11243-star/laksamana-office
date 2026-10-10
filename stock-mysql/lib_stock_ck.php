<?php
/************************************************************************
 * STOCK — CENTRAL KITCHEN: master barang produksi + buku besar stoknya.
 * ---------------------------------------------------------------------
 * Berkas TERPISAH dari lib_stock_mysql.php dengan alasan yang sama seperti
 * lib_stock_catat.php: lib utama sudah panjang, urusannya berbeda, dan
 * memasangnya ke server jadi MENAMBAH berkas — bukan menimpa berkas yang
 * sedang melayani ordering & purchasing. Kalau ada yang salah di sini,
 * yang sudah jalan tidak ikut terbawa.
 *
 * Dipakai oleh ck.php, dan oleh orders.php lewat pur_ck_sinkron_order().
 * Keduanya require _boot.php dulu (config + lib utama + ping).
 *
 * ================= DUA ATURAN YANG MENJAGA SALDO =================
 *
 * 1. SALDO TIDAK PERNAH DISIMPAN. Selalu SUM(masuk) - SUM(keluar) dari
 *    ck_stock. Angka saldo yang disimpan pasti menyimpang dari riwayatnya
 *    cepat atau lambat — satu penyimpanan gagal di tengah dan ia salah
 *    selamanya, tanpa cara tahu mana yang benar.
 *
 * 2. SEMUA qty DISIMPAN DALAM SATUAN DASAR barang itu (packSatuan).
 *    Konversi terjadi SEKALI, di pintu masuk (pur_ck_ke_dasar), bukan
 *    saat membaca. Kalau konversi terjadi saat membaca, mengubah isi pack
 *    sebuah barang akan diam-diam menulis ulang seluruh sejarahnya: 2 Pack
 *    yang dicatat waktu 1 pack = 500 gr mendadak jadi 2 Pack @ 250 gr.
 *    Yang sudah terjadi tidak boleh berubah karena masternya diperbarui.
 ************************************************************************/

/* Helper bersama (pur_uid, pur_data_obj, pur_filter_tanggal, pur_ada_baris)
   tinggal di lib_stock_catat.php. Ditarik DI SINI, bukan diserahkan ke tiap
   pemanggil: pur_ck_sinkron_order() dipanggil dari orders.php yang selama
   ini tidak pernah butuh lib catat, dan mengandalkan orders.php untuk
   mengingat require itu berarti satu berkas yang lupa = fatal error di
   endpoint yang sedang melayani seluruh alur order. require_once aman
   diulang, jadi endpoint yang sudah memuatnya tidak terpengaruh. */
require_once __DIR__ . '/lib_stock_catat.php';

/* ---------------------------------------------------------------------
   MASTER BARANG CK
   Dibaca dari `products` (data.sumber === 'ck'), bukan tabel sendiri.
   Lihat catatan di pur_product_simpan untuk alasannya.
   --------------------------------------------------------------------- */
/* =====================================================================
   DUA GUDANG, SATU MESIN (10 Oktober 2026, permintaan user: "Gudang Bar
   konsepnya samakan dengan Central Kitchen, jangan dibuat baru lagi").

   Seluruh berkas ini sekarang menerima `$gudang`: 'ck' (Central Kitchen,
   bawaan — perilaku lama persis) atau 'bar' (Gudang Bar). Tabelnya TETAP
   satu (`ck_stock`), dibedakan kolom `gudang`. Dua tabel untuk dua gudang
   berarti dua salinan aturan saldo, sinkron check-in, dan kiriman — dan
   salinan yang tertinggal satu revisi adalah kesalahan yang sudah berulang
   kali dibayar di repo ini.

   Barang Gudang Bar ditandai `sumber = 'bar'` di Atur Produk ("Vendor &
   Gudang Bar") — padanan 'both' untuk CK: dibeli ke vendor, disimpan di
   gudang bar, lalu diminta bar sedikit-sedikit. Pengajuannya ber-batch
   "Gudang Bar", padanan "Central Kitchen".

   Kolom `gudang` lahir lewat ALTER (pur_ck_pastikan), bukan migrasi: tabel
   ini sudah berisi di dev & produksi, dan migrasi di repo ini rutin
   tertinggal. DEFAULT 'ck' membuat seluruh baris lama otomatis milik CK.
   ===================================================================== */
function pur_ck_gudang($g) {
  return strtolower(trim((string)$g)) === 'bar' ? 'bar' : 'ck';
}
function pur_ck_nama_gudang($g) {
  return pur_ck_gudang($g) === 'bar' ? 'Gudang Bar' : 'Central Kitchen';
}
function pur_ck_pastikan($pdo) {
  static $sudah = false;
  if ($sudah) return;
  $st = $pdo->prepare("SELECT COUNT(*) FROM information_schema.COLUMNS
                        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ck_stock' AND COLUMN_NAME = 'gudang'");
  $st->execute();
  if ((int)$st->fetchColumn() === 0) {
    $pdo->exec("ALTER TABLE `ck_stock` ADD COLUMN `gudang` VARCHAR(10) NOT NULL DEFAULT 'ck', ADD KEY `idx_ck_gudang` (`gudang`)");
  }
  $sudah = true;
}

function pur_ck_produk($pdo, $gudang = 'ck') {
  $gudang = pur_ck_gudang($gudang);
  $out = [];
  foreach ($pdo->query("SELECT `nama`,`data` FROM `products` ORDER BY `nama`")->fetchAll() as $r) {
    $d = json_decode($r['data']);
    if (!is_object($d)) continue;
    /* Sejak 31 Juli 2026 sumber punya nilai ketiga 'both' — barang yang
       dibeli ke vendor TAPI juga disimpan di Central Kitchen (diantar ke CK,
       lalu diambil lagi sedikit-sedikit). Halaman CK harus memuat keduanya;
       memakai perbandingan === 'ck' seperti dulu akan membuat barang 'both'
       tidak punya saldo di mana pun padahal barangnya jelas ada di rak CK. */
    $sumber = isset($d->sumber) ? (string)$d->sumber : '';
    if ($gudang === 'bar') { if ($sumber !== 'bar') continue; }
    elseif ($sumber !== 'ck' && $sumber !== 'both') continue;
    $out[$r['nama']] = (object)[
      'sumber'     => $sumber,
      'packIsi'    => isset($d->packIsi) ? (float)$d->packIsi : 0,
      'packSatuan' => isset($d->packSatuan) ? (string)$d->packSatuan : '',
      'kategori'   => isset($d->kategori) ? (string)$d->kategori : '',
      'satuan'     => isset($d->satuan) && is_array($d->satuan) ? $d->satuan : [],
      // Barang ini juga disimpan di outlet, jadi bisa dikirim BALIK ke CK
      // (retur sisa, titipan stok berlebih). Barang yang cuma ada di CK
      // tidak pernah dipegang outlet, jadi tidak ada yang bisa dikirimnya.
      // Barang 'both' selalu lewat outlet, jadi selalu bisa dikirim balik.
      'diOutlet'   => ($sumber === 'both' || $sumber === 'bar') || !empty($d->diOutlet),
    ];
  }
  return $out;
}

/* Ubah angka yang diketik orang menjadi SATUAN DASAR barang itu.
   Satuan yang tidak dikenal dipakai apa adanya, TIDAK ditolak: menolak
   akan menggagalkan penyimpanan untuk barang CK yang packSatuan-nya belum
   diisi admin, dan orang yang mencatat produksi tidak punya cara
   memperbaikinya sendiri. Diambil apa adanya paling buruk menghasilkan
   saldo yang perlu dikoreksi; ditolak berarti catatannya hilang. */
function pur_ck_ke_dasar($qty, $unit, $packIsi, $packSatuan) {
  $qty = (float)$qty;
  $unit = trim((string)$unit);
  if (strcasecmp($unit, 'Pack') === 0 && (float)$packIsi > 0) return $qty * (float)$packIsi;
  return $qty;
}

/* ---------------------------------------------------------------------
   SALDO per barang. Dihitung di SQL, bukan di PHP: daftar mutasi tumbuh
   terus dan tidak ada gunanya mengirim setahun penuh ke browser hanya
   untuk menjumlahkannya di sana.

   Barang CK yang belum punya mutasi sama sekali TETAP muncul (saldo 0).
   Kalau tidak, barang yang baru didaftarkan tidak kelihatan di halaman
   stok sampai ada yang mencatat produksi pertamanya — dan orang akan
   menyimpulkan pendaftarannya gagal.
   --------------------------------------------------------------------- */
function pur_ck_saldo($pdo, $gudang = 'ck') {
  $gudang = pur_ck_gudang($gudang);
  pur_ck_pastikan($pdo);
  $produk = pur_ck_produk($pdo, $gudang);

  /* SEMUA baris dihitung, tanpa memandang `status`. Dulu status='pending'
     dikeluarkan karena kiriman outlet baru sah setelah dikonfirmasi orang CK;
     langkah konfirmasi itu dibuang 31 Juli 2026, jadi tidak ada lagi baris
     yang "belum tentu jadi".

     Filternya sengaja dibuang, bukan dibiarkan sambil mengandalkan migrasi
     mengosongkan kolomnya: kalau migrasinya belum dijalankan, baris pending
     peninggalan aturan lama akan diam-diam tidak pernah masuk saldo — stok
     yang barangnya ada di rak tapi tidak ada angkanya, tanpa satu pun
     petunjuk di layar. */
  $agg = [];
  $sql = "SELECT `item`,
                 SUM(CASE WHEN `arah`='masuk'  THEN `qty` ELSE 0 END) AS masuk,
                 SUM(CASE WHEN `arah`='keluar' THEN `qty` ELSE 0 END) AS keluar,
                 MAX(`tanggal`) AS terakhir
            FROM `ck_stock` WHERE `gudang` = ? GROUP BY `item`";
  $stA = $pdo->prepare($sql);
  $stA->execute([$gudang]);
  foreach ($stA->fetchAll() as $r) {
    $agg[$r['item']] = $r;
  }

  $out = [];
  foreach ($produk as $nama => $p) {
    $a = $agg[$nama] ?? null;
    $masuk  = $a ? (float)$a['masuk']  : 0;
    $keluar = $a ? (float)$a['keluar'] : 0;
    $out[$nama] = [
      'item'       => $nama,
      // Ikut dikirim supaya tabel Stok Item bisa membedakan barang produksi
      // dapur dari barang vendor yang cuma dititipkan di CK — dua-duanya
      // punya saldo di sini, tapi yang habis ditangani dengan cara berbeda
      // (yang satu diproduksi, yang satu dipesan ulang ke vendor).
      'sumber'     => $p->sumber,
      'packIsi'    => $p->packIsi,
      'packSatuan' => $p->packSatuan,
      'kategori'   => $p->kategori,
      'masuk'      => $masuk,
      'keluar'     => $keluar,
      'saldo'      => $masuk - $keluar,
      'terakhir'   => $a ? (string)$a['terakhir'] : '',
    ];
  }

  /* Mutasi untuk barang yang SUDAH TIDAK terdaftar sebagai barang CK
     (dihapus, atau sumbernya diubah kembali ke vendor) tetap ditampilkan,
     ditandai `hilang`. Menyembunyikannya berarti stok yang secara angka
     masih ada mendadak lenyap dari layar tanpa jejak — dan selisihnya baru
     ketahuan saat stok opname, tanpa petunjuk apa pun soal sebabnya. */
  foreach ($agg as $nama => $a) {
    if (isset($out[$nama])) continue;
    $masuk  = (float)$a['masuk'];
    $keluar = (float)$a['keluar'];
    if ($masuk == 0 && $keluar == 0) continue;
    $out[$nama] = [
      'item' => $nama, 'packIsi' => 0, 'packSatuan' => '', 'kategori' => '',
      'masuk' => $masuk, 'keluar' => $keluar, 'saldo' => $masuk - $keluar,
      'terakhir' => (string)$a['terakhir'], 'hilang' => true,
    ];
  }

  ksort($out);
  return array_values($out);
}

/* ---------------------------------------------------------------------
   DAFTAR MUTASI. Menghormati ?dari=&ke= seperti endpoint catat lainnya.
   --------------------------------------------------------------------- */
function pur_ck_mutasi_ambil($pdo, $gudang = 'ck') {
  pur_ck_pastikan($pdo);
  $sql = "SELECT `id`,`tanggal`,`item`,`arah`,`qty`,`qty_input`,`unit_input`,
                 `sebab`,`status`,`ref`,`tim`,`pic`,`waktu`,`data`
            FROM `ck_stock` WHERE `gudang` = ?";
  $par = [pur_ck_gudang($gudang)];
  pur_filter_tanggal($sql, $par);
  $sql .= " ORDER BY `tanggal` DESC, `waktu` DESC";
  $st = $pdo->prepare($sql);
  $st->execute($par);

  $out = [];
  foreach ($st->fetchAll() as $r) {
    $d = pur_data_obj($r['data']);
    $out[] = [
      'id'        => $r['id'],
      'tanggal'   => $r['tanggal'],
      'item'      => $r['item'],
      'arah'      => $r['arah'],
      'qty'       => (float)$r['qty'],
      'qtyInput'  => (float)$r['qty_input'],
      'unitInput' => $r['unit_input'],
      'sebab'     => $r['sebab'],
      'status'    => $r['status'],
      'ref'       => $r['ref'] === null ? '' : $r['ref'],
      'tim'       => $r['tim'],
      'pic'       => $r['pic'],
      'waktu'     => $r['waktu'],
      'catatan'   => isset($d->catatan) ? (string)$d->catatan : '',
      // packIsi/packSatuan SAAT DICATAT, bukan yang berlaku sekarang —
      // supaya riwayat lama tetap terbaca dengan isi pack yang benar
      // walau masternya sudah diubah sejak itu.
      'packIsi'    => isset($d->packIsi) ? (float)$d->packIsi : 0,
      'packSatuan' => isset($d->packSatuan) ? (string)$d->packSatuan : '',
    ];
  }
  return $out;
}

/* ---------------------------------------------------------------------
   SIMPAN MUTASI MANUAL (produksi masuk, penyesuaian, rusak).
   `ref` sengaja TIDAK bisa diisi dari sini: kolom itu milik sinkronisasi
   otomatis, dan mutasi manual ber-ref akan bertabrakan dengan baris yang
   dibuat pur_ck_sinkron_order — lalu salah satunya terhapus diam-diam.
   --------------------------------------------------------------------- */
function pur_ck_simpan($pdo, $b, $gudang = 'ck') {
  $gudang = pur_ck_gudang($gudang);
  pur_ck_pastikan($pdo);
  $id    = trim((string)($b->id ?? ''));
  $item  = trim((string)($b->item ?? ''));
  $arah  = strtolower(trim((string)($b->arah ?? '')));
  $sebab = strtolower(trim((string)($b->sebab ?? '')));

  if ($item === '') return ['status' => 'error', 'message' => 'barang kosong'];
  if ($arah !== 'masuk' && $arah !== 'keluar') return ['status' => 'error', 'message' => 'arah harus masuk/keluar'];

  $qtyInput = (float)($b->qtyInput ?? 0);
  if ($qtyInput <= 0) return ['status' => 'error', 'message' => 'jumlah harus lebih dari 0'];

  // Isi pack diambil dari MASTER, bukan dari yang dikirim browser: kalau
  // dari browser, halaman yang cache-nya basi bisa menghitung dengan isi
  // pack lama dan menulis saldo yang salah tanpa ada yang tahu.
  $produk = pur_ck_produk($pdo, $gudang);
  $p = $produk[$item] ?? null;
  if (!$p) return ['status' => 'error', 'message' => 'barang bukan barang ' . pur_ck_nama_gudang($gudang) . ': ' . $item];

  $unitInput = trim((string)($b->unitInput ?? ''));
  if ($unitInput === '') $unitInput = $p->packSatuan !== '' ? $p->packSatuan : 'Pcs';

  $qty = pur_ck_ke_dasar($qtyInput, $unitInput, $p->packIsi, $p->packSatuan);

  /* 'terima' = barang masuk ke gudang dari pembelian. Untuk CK sebab masuk
     yang lazim 'produksi'; Gudang Bar tidak memproduksi apa pun, jadi masuk
     manualnya penerimaan. Keduanya sah di kedua gudang. */
  $sebabSah = ['produksi', 'terima', 'penyesuaian', 'rusak', 'pengajuan'];
  if (!in_array($sebab, $sebabSah, true)) $sebab = ($arah === 'masuk') ? 'produksi' : 'penyesuaian';

  $rec = (object)[
    'catatan'    => trim((string)($b->catatan ?? '')),
    'packIsi'    => $p->packIsi,
    'packSatuan' => $p->packSatuan,
  ];

  $tanggal = trim((string)($b->tanggal ?? '')) ?: date('Y-m-d');
  $waktu   = date('Y-m-d H:i:s');
  $tim     = trim((string)($b->tim ?? ''));
  $pic     = trim((string)($b->pic ?? ''));
  $dataJson = json_encode($rec, JSON_UNESCAPED_UNICODE);

  if ($id !== '' && pur_ada_baris($pdo, 'ck_stock', $id)) {
    // Baris otomatis (ber-ref) tidak boleh disunting tangan: ia cerminan
    // status kedatangan sebuah order, dan mengubahnya di sini membuat
    // stok tidak lagi cocok dengan apa yang benar-benar diserahkan.
    $st = $pdo->prepare("SELECT `ref`,`gudang` FROM `ck_stock` WHERE `id`=?");
    $st->execute([$id]);
    $lama = $st->fetch();
    // Baris gudang lain tidak bisa disunting dari layar gudang ini — kalau
    // bisa, satu klik memindahkan stok dari CK ke Gudang Bar diam-diam.
    if ($lama && (string)$lama['gudang'] !== $gudang) {
      return ['status' => 'error', 'message' => 'mutasi ini milik ' . pur_ck_nama_gudang($lama['gudang'])];
    }
    if ($lama && (string)$lama['ref'] !== '') {
      return ['status' => 'error', 'message' => 'mutasi dari pengajuan hanya berubah lewat check-in'];
    }
    $pdo->prepare("UPDATE `ck_stock` SET `tanggal`=?,`item`=?,`arah`=?,`qty`=?,`qty_input`=?,
                     `unit_input`=?,`sebab`=?,`tim`=?,`pic`=?,`data`=? WHERE `id`=?")
        ->execute([$tanggal, $item, $arah, $qty, $qtyInput, $unitInput, $sebab, $tim, $pic, $dataJson, $id]);
    return ['status' => 'success', 'id' => $id];
  }

  $id = pur_uid($gudang === 'bar' ? 'GB' : 'CK');
  $pdo->prepare("INSERT INTO `ck_stock`
                   (`id`,`tanggal`,`item`,`arah`,`qty`,`qty_input`,`unit_input`,
                    `sebab`,`ref`,`tim`,`pic`,`waktu`,`data`,`gudang`)
                 VALUES (?,?,?,?,?,?,?,?,NULL,?,?,?,?,?)")
      ->execute([$id, $tanggal, $item, $arah, $qty, $qtyInput, $unitInput, $sebab, $tim, $pic, $waktu, $dataJson, $gudang]);
  return ['status' => 'success', 'id' => $id];
}

function pur_ck_hapus($pdo, $id, $gudang = 'ck') {
  pur_ck_pastikan($pdo);
  $id = trim((string)$id);
  if ($id === '') return ['status' => 'error', 'message' => 'id kosong'];
  $st = $pdo->prepare("SELECT `ref`,`gudang` FROM `ck_stock` WHERE `id`=?");
  $st->execute([$id]);
  $row = $st->fetch();
  if (!$row) return ['status' => 'error', 'message' => 'mutasi tidak ditemukan'];
  if ((string)$row['gudang'] !== pur_ck_gudang($gudang)) {
    return ['status' => 'error', 'message' => 'mutasi ini milik ' . pur_ck_nama_gudang($row['gudang'])];
  }
  if ((string)$row['ref'] !== '') {
    return ['status' => 'error', 'message' => 'mutasi dari pengajuan hanya hilang bila check-in dibatalkan'];
  }
  /* Penjagaan status='pending' DIBUANG 31 Juli 2026. Dulu baris pending tidak
     boleh dihapus karena menghapusnya sama artinya dengan menolak kiriman
     lewat tombol yang tidak mengatakan begitu — penolakan punya tempatnya
     sendiri di tab Terima Kiriman. Tab itu sudah tidak ada, dan baris pending
     peninggalannya sekarang ikut dihitung ke saldo seperti mutasi biasa.
     Membiarkan penjagaannya berarti satu-satunya baris yang tidak bisa
     dikoreksi adalah justru baris yang paling mungkin salah, dengan pesan
     yang menyuruh membuka layar yang tidak bisa dibuka lagi. */
  $st = $pdo->prepare("DELETE FROM `ck_stock` WHERE `id`=?");
  $st->execute([$id]);
  return ['status' => 'success', 'deleted' => $st->rowCount()];
}

/* =====================================================================
   SINKRONISASI OTOMATIS: pengajuan yang DATANG = stok CK berkurang.
   ---------------------------------------------------------------------
   Dipanggil orders.php sesudah updateKedatangan. Barang CK yang ditandai
   datang (baik lewat Check-in Penerimaan maupun tombol Selesai Dijemput
   di Purchasing) berarti barangnya sudah keluar dari Central Kitchen.

   IDEMPOTEN. Kuncinya UNIQUE (ref, arah) di ck_stock: `ref` = nomor_order.
   Menyimpan check-in dua kali — dan itu terjadi terus-menerus, karena
   saveCheckinData mengirim SELURUH baris PO tiap kali disimpan, bukan
   yang berubah saja — tidak bisa mengurangi stok dua kali.

   Kedatangan yang DIBATALKAN menghapus baris keluarnya. Bukan menambah
   baris masuk penyeimbang: yang dibatalkan itu koreksi kesalahan input,
   bukan barang yang benar-benar kembali ke Central Kitchen, dan riwayat
   yang penuh pasangan keluar-masuk palsu tidak bisa dibaca lagi.

   qty diambil dari qty ORDER, memakai isi pack yang berlaku SAAT ITU.
   ===================================================================== */
function pur_ck_sinkron_order($pdo, $rowIndexes) {
  if (!is_array($rowIndexes) || !$rowIndexes) return ['disinkron' => 0];

  $rows = array_values(array_filter(array_map('intval', $rowIndexes), fn($n) => $n > 0));
  if (!$rows) return ['disinkron' => 0];

  pur_ck_pastikan($pdo);
  /* Master & peta nama dibuat PER GUDANG: barang yang diminta lewat batch
     "Gudang Bar" dicocokkan ke master gudang bar, bukan CK. Peta nama tanpa
     memandang besar-kecil huruf: nama di order diketik lewat autocomplete. */
  $produkG = ['ck' => pur_ck_produk($pdo, 'ck'), 'bar' => pur_ck_produk($pdo, 'bar')];
  if (!$produkG['ck'] && !$produkG['bar']) return ['disinkron' => 0];
  $petaG = [];
  foreach ($produkG as $g => $daftar) {
    $petaG[$g] = [];
    foreach ($daftar as $nama => $p) $petaG[$g][pur_lower($nama)] = $nama;
  }

  $isi = implode(',', array_fill(0, count($rows), '?'));
  $st = $pdo->prepare("SELECT `nomor_order`,`row_index`,`item`,`qty`,`unit`,`tgl_datang`,
                              `kedatangan`,`tim`,`pic`,`batch_name`
                         FROM `orders` WHERE `row_index` IN ($isi)");
  $st->execute($rows);

  $n = 0;
  foreach ($st->fetchAll() as $o) {
    /* HANYA PENGAJUAN DARI TAB CENTRAL KITCHEN YANG MENYENTUH STOK CK
       (permintaan user 10 Agustus 2026: "yang CK itu hanya dari menu tab
       Central Kitchen").

       Yang menentukan BUKAN jenis barangnya, melainkan LEWAT MANA ia diajukan.
       pur_ck_produk() memulangkan 'ck' DAN 'both', jadi tanpa penjagaan ini
       barang 'both' yang DIBELI KE VENDOR lewat Form Order Belanja ikut
       diproses di sini: begitu di-check-in, ia menulis mutasi 'keluar' dan
       MENGURANGI saldo Central Kitchen — untuk barang yang justru baru saja
       datang dari vendor dan tidak pernah diambil dari rak CK.

       Salah dua kali sekaligus: arahnya terbalik, dan gudangnya bukan gudang
       yang bersangkutan. Saldo CK ikut turun tiap kali outlet berbelanja
       barang 'both', tanpa satu pun tanda di layar mana pun.

       Penandanya `batch_name` — nilai yang sama yang ditulis submitCKOrder dan
       dibaca pesananCK() di purchasing serta dariFormCK() di ordering. Satu
       istilah, satu arti, di empat tempat. */
    $bn = strtolower(trim((string)($o['batch_name'] ?? '')));
    if ($bn === 'central kitchen') $gudang = 'ck';
    elseif ($bn === 'gudang bar')  $gudang = 'bar';
    else continue;
    $produk = $produkG[$gudang];
    $petaLower = $petaG[$gudang];

    $namaMaster = isset($produk[$o['item']]) ? $o['item'] : ($petaLower[pur_lower($o['item'])] ?? '');
    if ($namaMaster === '') continue;              // bukan barang CK — tidak diurus di sini
    $p = $produk[$namaMaster];

    $ref = (string)$o['nomor_order'];
    if ($ref === '') continue;

    if ((string)$o['kedatangan'] !== 'Datang') {
      // Dibatalkan: baris keluarnya ikut hilang.
      $del = $pdo->prepare("DELETE FROM `ck_stock` WHERE `ref`=? AND `arah`='keluar'");
      $del->execute([$ref]);
      $n += $del->rowCount();
      continue;
    }

    $qtyInput = (float)$o['qty'];
    $unit     = (string)$o['unit'];
    $qty      = pur_ck_ke_dasar($qtyInput, $unit, $p->packIsi, $p->packSatuan);
    $rec = (object)['catatan' => 'Pengajuan ' . $ref, 'packIsi' => $p->packIsi, 'packSatuan' => $p->packSatuan];

    /* INSERT ... ON DUPLICATE KEY UPDATE, bukan SELECT-lalu-INSERT: dua
       orang bisa menyimpan check-in PO yang sama pada detik yang sama, dan
       pemeriksaan terpisah akan lolos dua-duanya. Yang menahannya harus
       kunci unik di tabel, bukan urutan perintah di PHP. */
    $ins = $pdo->prepare(
      "INSERT INTO `ck_stock`
         (`id`,`tanggal`,`item`,`arah`,`qty`,`qty_input`,`unit_input`,`sebab`,`ref`,`tim`,`pic`,`waktu`,`data`,`gudang`)
       VALUES (?,?,?,'keluar',?,?,?,'pengajuan',?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         `tanggal`=VALUES(`tanggal`), `item`=VALUES(`item`), `qty`=VALUES(`qty`),
         `qty_input`=VALUES(`qty_input`), `unit_input`=VALUES(`unit_input`),
         `tim`=VALUES(`tim`), `pic`=VALUES(`pic`), `data`=VALUES(`data`), `gudang`=VALUES(`gudang`)");
    $ins->execute([
      pur_uid('CKO'),
      (string)$o['tgl_datang'] ?: date('Y-m-d'),
      $namaMaster, $qty, $qtyInput, $unit, $ref,
      (string)$o['tim'], (string)$o['pic'], date('Y-m-d H:i:s'),
      json_encode($rec, JSON_UNESCAPED_UNICODE),
      $gudang,
    ]);
    $n++;
  }
  return ['disinkron' => $n];
}

/* =====================================================================
   KIRIMAN OUTLET → CENTRAL KITCHEN
   ---------------------------------------------------------------------
   Arah kebalikan dari pengajuan: outlet mengirim barang KE CK (retur
   sisa yang tidak terpakai, titipan stok berlebih). Hanya untuk barang
   yang memang disimpan di dua tempat (`diOutlet`) — barang yang cuma ada
   di CK tidak pernah dipegang outlet, jadi tidak ada yang bisa dikirim.

   SATU LANGKAH sejak 31 Juli 2026 (keputusan user). Kiriman LANGSUNG
   menambah saldo CK; tidak ada lagi status 'pending' dan tidak ada layar
   konfirmasi penerimaan.

   Aturan lama dua langkah — tercatat 'pending' dulu, baru dihitung setelah
   orang CK menekan konfirmasi — dibuang bersama tab "Terima Kiriman" di
   Purchasing. Alasan aslinya masih benar (selisih kirim 5 kg / sampai 4 kg
   tidak tertangkap), tapi harganya adalah satu layar yang HARUS dibuka tiap
   hari supaya stok tidak macet, dan layar yang cuma berisi tombol
   "iya, sampai" akan ditekan tanpa dibaca. Selisih kiriman sekarang
   diselesaikan lewat mutasi Penyesuaian, sama seperti selisih lain.

   Baris lama yang telanjur 'pending' dinormalkan oleh
   migrasi-2026-07-31-ck-kiriman-langsung.sql.
   ===================================================================== */
function pur_ck_kiriman_simpan($pdo, $b, $gudang = 'ck') {
  $gudang = pur_ck_gudang($gudang);
  pur_ck_pastikan($pdo);
  $item = trim((string)($b->item ?? ''));
  if ($item === '') return ['status' => 'error', 'message' => 'barang kosong'];

  $qtyInput = (float)($b->qtyInput ?? 0);
  if ($qtyInput <= 0) return ['status' => 'error', 'message' => 'jumlah harus lebih dari 0'];

  // Isi pack dibaca dari MASTER, bukan dari yang dikirim browser: halaman
  // yang cache-nya basi bisa menghitung dengan isi pack lama dan menulis
  // saldo yang salah tanpa ada yang tahu.
  $produk = pur_ck_produk($pdo, $gudang);
  $p = $produk[$item] ?? null;
  if (!$p) return ['status' => 'error', 'message' => 'barang bukan barang ' . pur_ck_nama_gudang($gudang) . ': ' . $item];
  if (!$p->diOutlet) {
    return ['status' => 'error', 'message' => 'barang ini tidak disimpan di outlet, jadi tidak bisa dikirim ke ' . pur_ck_nama_gudang($gudang)];
  }

  $unitInput = trim((string)($b->unitInput ?? ''));
  if ($unitInput === '') $unitInput = $p->packSatuan !== '' ? $p->packSatuan : 'Pcs';
  $qty = pur_ck_ke_dasar($qtyInput, $unitInput, $p->packIsi, $p->packSatuan);

  $rec = (object)[
    'catatan'    => trim((string)($b->catatan ?? '')),
    'packIsi'    => $p->packIsi,
    'packSatuan' => $p->packSatuan,
  ];

  $id = pur_uid($gudang === 'bar' ? 'GBK' : 'CKK');
  // status '' = mutasi biasa yang LANGSUNG dihitung ke saldo. Kolomnya tetap
  // ada supaya baris pending peninggalan aturan lama masih bisa dibaca.
  $pdo->prepare("INSERT INTO `ck_stock`
                   (`id`,`tanggal`,`item`,`arah`,`qty`,`qty_input`,`unit_input`,
                    `sebab`,`status`,`ref`,`tim`,`pic`,`waktu`,`data`,`gudang`)
                 VALUES (?,?,?,'masuk',?,?,?,'kiriman','',NULL,?,?,?,?,?)")
      ->execute([
        $id,
        trim((string)($b->tanggal ?? '')) ?: date('Y-m-d'),
        $item, $qty, $qtyInput, $unitInput,
        trim((string)($b->tim ?? '')),
        trim((string)($b->pic ?? '')),
        date('Y-m-d H:i:s'),
        json_encode($rec, JSON_UNESCAPED_UNICODE),
        $gudang,
      ]);
  return ['status' => 'success', 'id' => $id];
}

/* pur_ck_kiriman_pending() dan pur_ck_kiriman_konfirmasi() DIHAPUS 31 Juli
   2026 bersama tab "Terima Kiriman" di Purchasing. Kiriman outlet sekarang
   langsung menambah saldo (lihat catatan di pur_ck_kiriman_simpan), jadi
   tidak ada lagi antrean yang perlu ditampilkan maupun dikonfirmasi.

   Kolom `status` di ck_stock sengaja TIDAK di-DROP: baris peninggalan aturan
   lama masih memakainya, dan menghapus kolomnya berarti riwayat itu tidak
   bisa dibaca lagi. Ia cuma tidak pernah dilihat lagi oleh perhitungan mana
   pun — pur_ck_saldo() menjumlah semua baris tanpa memandang status. */
