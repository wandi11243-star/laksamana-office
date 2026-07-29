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
function pur_ck_produk($pdo) {
  $out = [];
  foreach ($pdo->query("SELECT `nama`,`data` FROM `products` ORDER BY `nama`")->fetchAll() as $r) {
    $d = json_decode($r['data']);
    if (!is_object($d)) continue;
    if (!isset($d->sumber) || $d->sumber !== 'ck') continue;
    $out[$r['nama']] = (object)[
      'packIsi'    => isset($d->packIsi) ? (float)$d->packIsi : 0,
      'packSatuan' => isset($d->packSatuan) ? (string)$d->packSatuan : '',
      'kategori'   => isset($d->kategori) ? (string)$d->kategori : '',
      'satuan'     => isset($d->satuan) && is_array($d->satuan) ? $d->satuan : [],
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
function pur_ck_saldo($pdo) {
  $produk = pur_ck_produk($pdo);

  $agg = [];
  $sql = "SELECT `item`,
                 SUM(CASE WHEN `arah`='masuk'  THEN `qty` ELSE 0 END) AS masuk,
                 SUM(CASE WHEN `arah`='keluar' THEN `qty` ELSE 0 END) AS keluar,
                 MAX(`tanggal`) AS terakhir
            FROM `ck_stock` GROUP BY `item`";
  foreach ($pdo->query($sql)->fetchAll() as $r) {
    $agg[$r['item']] = $r;
  }

  $out = [];
  foreach ($produk as $nama => $p) {
    $a = $agg[$nama] ?? null;
    $masuk  = $a ? (float)$a['masuk']  : 0;
    $keluar = $a ? (float)$a['keluar'] : 0;
    $out[$nama] = [
      'item'       => $nama,
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
function pur_ck_mutasi_ambil($pdo) {
  $sql = "SELECT `id`,`tanggal`,`item`,`arah`,`qty`,`qty_input`,`unit_input`,
                 `sebab`,`ref`,`tim`,`pic`,`waktu`,`data`
            FROM `ck_stock` WHERE 1=1";
  $par = [];
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
function pur_ck_simpan($pdo, $b) {
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
  $produk = pur_ck_produk($pdo);
  $p = $produk[$item] ?? null;
  if (!$p) return ['status' => 'error', 'message' => 'barang bukan barang Central Kitchen: ' . $item];

  $unitInput = trim((string)($b->unitInput ?? ''));
  if ($unitInput === '') $unitInput = $p->packSatuan !== '' ? $p->packSatuan : 'Pcs';

  $qty = pur_ck_ke_dasar($qtyInput, $unitInput, $p->packIsi, $p->packSatuan);

  $sebabSah = ['produksi', 'penyesuaian', 'rusak', 'pengajuan'];
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
    $st = $pdo->prepare("SELECT `ref` FROM `ck_stock` WHERE `id`=?");
    $st->execute([$id]);
    if ((string)$st->fetchColumn() !== '') {
      return ['status' => 'error', 'message' => 'mutasi dari pengajuan hanya berubah lewat check-in'];
    }
    $pdo->prepare("UPDATE `ck_stock` SET `tanggal`=?,`item`=?,`arah`=?,`qty`=?,`qty_input`=?,
                     `unit_input`=?,`sebab`=?,`tim`=?,`pic`=?,`data`=? WHERE `id`=?")
        ->execute([$tanggal, $item, $arah, $qty, $qtyInput, $unitInput, $sebab, $tim, $pic, $dataJson, $id]);
    return ['status' => 'success', 'id' => $id];
  }

  $id = pur_uid('CK');
  $pdo->prepare("INSERT INTO `ck_stock`
                   (`id`,`tanggal`,`item`,`arah`,`qty`,`qty_input`,`unit_input`,
                    `sebab`,`ref`,`tim`,`pic`,`waktu`,`data`)
                 VALUES (?,?,?,?,?,?,?,?,NULL,?,?,?,?)")
      ->execute([$id, $tanggal, $item, $arah, $qty, $qtyInput, $unitInput, $sebab, $tim, $pic, $waktu, $dataJson]);
  return ['status' => 'success', 'id' => $id];
}

function pur_ck_hapus($pdo, $id) {
  $id = trim((string)$id);
  if ($id === '') return ['status' => 'error', 'message' => 'id kosong'];
  $st = $pdo->prepare("SELECT `ref` FROM `ck_stock` WHERE `id`=?");
  $st->execute([$id]);
  $ref = $st->fetchColumn();
  if ($ref === false) return ['status' => 'error', 'message' => 'mutasi tidak ditemukan'];
  if ((string)$ref !== '') {
    return ['status' => 'error', 'message' => 'mutasi dari pengajuan hanya hilang bila check-in dibatalkan'];
  }
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

  $produk = pur_ck_produk($pdo);
  if (!$produk) return ['disinkron' => 0];

  // Peta nama barang tanpa memandang besar-kecil huruf: nama di order
  // diketik lewat autocomplete dan tidak dijamin sama persis dengan master.
  $petaLower = [];
  foreach ($produk as $nama => $p) $petaLower[pur_lower($nama)] = $nama;

  $isi = implode(',', array_fill(0, count($rows), '?'));
  $st = $pdo->prepare("SELECT `nomor_order`,`row_index`,`item`,`qty`,`unit`,`tgl_datang`,
                              `kedatangan`,`tim`,`pic`
                         FROM `orders` WHERE `row_index` IN ($isi)");
  $st->execute($rows);

  $n = 0;
  foreach ($st->fetchAll() as $o) {
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
         (`id`,`tanggal`,`item`,`arah`,`qty`,`qty_input`,`unit_input`,`sebab`,`ref`,`tim`,`pic`,`waktu`,`data`)
       VALUES (?,?,?,'keluar',?,?,?,'pengajuan',?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         `tanggal`=VALUES(`tanggal`), `item`=VALUES(`item`), `qty`=VALUES(`qty`),
         `qty_input`=VALUES(`qty_input`), `unit_input`=VALUES(`unit_input`),
         `tim`=VALUES(`tim`), `pic`=VALUES(`pic`), `data`=VALUES(`data`)");
    $ins->execute([
      pur_uid('CKO'),
      (string)$o['tgl_datang'] ?: date('Y-m-d'),
      $namaMaster, $qty, $qtyInput, $unit, $ref,
      (string)$o['tim'], (string)$o['pic'], date('Y-m-d H:i:s'),
      json_encode($rec, JSON_UNESCAPED_UNICODE),
    ]);
    $n++;
  }
  return ['disinkron' => $n];
}
