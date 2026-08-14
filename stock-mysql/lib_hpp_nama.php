<?php
/************************************************************************
 * SATU NAMA UNTUK DUA MODUL — ganti nama bahan yang merambat sendiri.
 * ---------------------------------------------------------------------
 * Permintaan user 14 Agustus 2026: "kalau saya ubah nama di HPP & Resep ATAU
 * ubah nama item di database vendor Purchasing, nama di tempat lain ikut
 * berubah."
 *
 * Arah HPP -> Purchasing dikerjakan layarnya (penyunting bahan memanggil
 * items.php addProduct berikut oldProductName). Arah sebaliknya TIDAK BISA
 * diserahkan ke layar: yang mengganti nama di sana adalah modul Purchasing,
 * yang tidak tahu-menahu soal HPP dan memang tidak boleh tahu. Jadi
 * penyambungnya ditaruh di SERVER, tepat di jalur ganti-nama produk
 * (pur_product_simpan), sehingga siapa pun yang memanggilnya — layar
 * purchasing, skrip, atau modul lain nanti — ikut membawa HPP serta.
 *
 * TIGA HAL YANG DIJAGA:
 *   1. Tidak pernah menjatuhkan penggantian nama di Purchasing. Semua
 *      dibungkus try/catch di sisi pemanggil: HPP yang bermasalah tidak boleh
 *      membuat purchasing gagal menyimpan.
 *   2. Tidak menimpa bahan yang sudah ada. Kalau nama tujuan sudah dipakai
 *      baris HPP lain, penggantian DILEWATI — menggabung dua bahan berharga
 *      beda itu keputusan manusia.
 *   3. Baris resep ikut ditambal. Resep menyimpan rujukan berupa NAMA, jadi
 *      mengganti nama bahan tanpa menyentuh resep memutus rujukannya diam-diam
 *      dan modal resep itu turun tanpa ada yang tahu sebabnya.
 ************************************************************************/

function hpp_tabel_ada($pdo, $nama) {
  try {
    $st = $pdo->prepare('SHOW TABLES LIKE ?');
    $st->execute(array($nama));
    return (bool)$st->fetchColumn();
  } catch (Throwable $e) { return false; }
}

/**
 * Bahan baru di Purchasing ikut lahir di HPP (permintaan user 14 Agustus 2026:
 * "jika ada penambahan bahan baku di modul purchasing, HPP & Resep tetap harus
 * sync"). Barisnya dibuat dengan HARGA NOL — harga bukan milik purchasing dan
 * tidak boleh ditebak; yang penting namanya sudah berdiri di kedua daftar,
 * sehingga resep bisa langsung memakainya dan halaman Bahan & Harga tinggal
 * memintanya diisi.
 *
 * IDEMPOTEN: dipanggil tiap kali produk disimpan (baru maupun disunting), jadi
 * ia harus aman diulang. Bahan yang sudah ada TIDAK disentuh sama sekali —
 * menimpanya berarti mengembalikan harga yang sudah susah payah diisi ke nol.
 */
function hpp_ikut_tambah($pdo, $nama, $satuan = array()) {
  $nama = trim((string)$nama);
  if ($nama === '') return false;
  if (!hpp_tabel_ada($pdo, 'hpp_bahan')) return false;
  try {
    $st = $pdo->prepare('SELECT COUNT(*) FROM hpp_bahan WHERE nama=:n');
    $st->execute(array(':n' => $nama));
    if ((int)$st->fetchColumn()) return false;      // sudah ada — jangan diapa-apakan
    $sat = '';
    if (is_array($satuan) && count($satuan)) $sat = mb_substr(trim((string)$satuan[0]), 0, 32);
    $pdo->prepare(
      'INSERT INTO hpp_bahan (nama,satuan,qty_beli,harga_beli,vendor,produk,kategori,catatan,updated_at,updated_by)
       VALUES (:n,:s,0,0,\'\',\'\',\'\',:c,:ua,\'purchasing\')')
      ->execute(array(':n' => $nama, ':s' => $sat,
                      ':c' => 'Dibuat otomatis dari Purchasing — harga belum diisi.',
                      ':ua' => (int)(microtime(true) * 1000)));
    return true;
  } catch (Throwable $e) {
    error_log('[stock/hpp-nama] tambah: ' . $e->getMessage());
    return false;
  }
}

/**
 * Ganti nama satu bahan di seluruh data HPP.
 * Memulangkan array laporan; tidak pernah melempar ke pemanggil.
 */
function hpp_ikut_ganti_nama($pdo, $lama, $baru) {
  $lama = trim((string)$lama); $baru = trim((string)$baru);
  $out = array('bahan' => 0, 'resep' => 0, 'pakai' => 0, 'lewat' => '');
  if ($lama === '' || $baru === '' || $lama === $baru) return $out;
  if (!hpp_tabel_ada($pdo, 'hpp_bahan')) return $out;   // modul HPP belum pernah dipakai di situs ini

  try {
    $st = $pdo->prepare('SELECT COUNT(*) FROM hpp_bahan WHERE nama=:n');
    $st->execute(array(':n' => $lama));
    if (!(int)$st->fetchColumn()) return $out;          // bahan ini memang tidak ada di HPP

    $st->execute(array(':n' => $baru));
    if ((int)$st->fetchColumn()) {                      // nama tujuan sudah dipakai bahan lain
      $out['lewat'] = 'nama "' . $baru . '" sudah dipakai bahan HPP lain';
      return $out;
    }

    $pdo->prepare('UPDATE hpp_bahan SET nama=:b WHERE nama=:l')
        ->execute(array(':b' => $baru, ':l' => $lama));
    $out['bahan'] = 1;

    /* Penanda pasangan lama (sisa masa pencocokan) ikut diarahkan ulang, kalau
       tidak ia akan menunjuk nama purchasing yang sudah tidak ada. */
    $pdo->prepare('UPDATE hpp_bahan SET produk=:b WHERE produk=:l')
        ->execute(array(':b' => $baru, ':l' => $lama));

    if (hpp_tabel_ada($pdo, 'hpp_pakai')) {
      /* Pemakaian bulanan berkunci (bulan, bahan). Baris bulan yang sama untuk
         nama baru bisa saja SUDAH ada — di situ penggantian dilewati supaya
         tidak menabrak primary key dan tidak menimpa angka opname orang. */
      $st2 = $pdo->prepare('SELECT bulan FROM hpp_pakai WHERE bahan=:l');
      $st2->execute(array(':l' => $lama));
      $up = $pdo->prepare('UPDATE hpp_pakai SET bahan=:b WHERE bahan=:l AND bulan=:m');
      $cek = $pdo->prepare('SELECT COUNT(*) FROM hpp_pakai WHERE bahan=:b AND bulan=:m');
      foreach ($st2->fetchAll(PDO::FETCH_COLUMN) as $bl) {
        $cek->execute(array(':b' => $baru, ':m' => $bl));
        if ((int)$cek->fetchColumn()) continue;
        $up->execute(array(':b' => $baru, ':l' => $lama, ':m' => $bl));
        $out['pakai']++;
      }
    }

    if (hpp_tabel_ada($pdo, 'hpp_resep')) {
      /* Disaring dengan LIKE dulu supaya tidak membaca & menulis ulang 365
         resep hanya untuk mengganti satu nama. Pencocokannya tetap dilakukan
         per baris di PHP — LIKE cuma penyaring kasar, bukan penentu. */
      $st3 = $pdo->prepare('SELECT id, bahan FROM hpp_resep WHERE bahan LIKE :p');
      $st3->execute(array(':p' => '%' . str_replace(array('%','_'), array('\\%','\\_'), $lama) . '%'));
      $tulis = $pdo->prepare('UPDATE hpp_resep SET bahan=:b WHERE id=:i');
      foreach ($st3->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $baris = json_decode((string)$r['bahan'], true);
        if (!is_array($baris)) continue;
        $ubah = false;
        foreach ($baris as &$ln) {
          if (isset($ln['nama']) && $ln['nama'] === $lama) { $ln['nama'] = $baru; $ubah = true; }
        }
        unset($ln);
        if ($ubah) {
          $tulis->execute(array(':b' => json_encode($baris, JSON_UNESCAPED_UNICODE), ':i' => $r['id']));
          $out['resep']++;
        }
      }
    }
  } catch (Throwable $e) {
    error_log('[stock/hpp-nama] ' . $e->getMessage());
    $out['lewat'] = 'kesalahan server saat menyesuaikan HPP';
  }
  return $out;
}
