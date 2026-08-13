<?php
/* =====================================================================
   PEMBUAT QR CODE — mode byte, tingkat koreksi M, versi 1..10.

   Ini PORT LANGSUNG dari pembuat QR yang sudah dipakai halaman e-ticket
   (deploy/ticketing/index.html, fungsi qrMatrix). Ditulis ulang di PHP karena
   lampiran PDF dibuat di server, saat pesanan dilunaskan — di titik itu tidak
   ada peramban yang bisa dimintai tolong menggambar QR-nya.

   DUA HAL YANG WAJIB DIJAGA SAAT MENYUNTING SALAH SATUNYA:

   1. Keduanya harus memulangkan matriks yang SAMA PERSIS untuk teks yang sama.
      Kalau tidak, QR di layar dan QR di PDF adalah dua gambar berbeda untuk
      satu tiket — dan yang ketahuan cuma saat petugas memindai lembar cetak
      di pintu masuk, malam acara, ketika tidak ada yang bisa diperbaiki lagi.
      Uji pembandingnya ada di tools/uji-qr-php.php.

   2. Token tiket TIDAK BOLEH dikirim ke layanan QR pihak ketiga. Itu sebab
      keduanya ditulis sendiri, bukan memakai API gambar QR yang tinggal
      ditempel URL-nya: token itu satu-satunya yang menentukan siapa boleh
      masuk.
   ===================================================================== */

/* Kapasitas byte per versi (tingkat M) dan susunan bloknya:
   [kodeEC per blok, blokGrup1, dataGrup1, blokGrup2, dataGrup2] */
function qr_tabel_m() {
  return array(
    1  => array(10,1,16,0,0),  2 => array(16,1,28,0,0),  3 => array(26,1,44,0,0),
    4  => array(18,2,32,0,0),  5 => array(24,2,43,0,0),  6 => array(16,4,27,0,0),
    7  => array(18,4,31,0,0),  8 => array(22,2,38,2,39), 9 => array(22,3,36,2,37),
    10 => array(26,4,43,1,44)
  );
}
function qr_tabel_align() {
  return array(
    1=>array(), 2=>array(6,18), 3=>array(6,22), 4=>array(6,26), 5=>array(6,30),
    6=>array(6,34), 7=>array(6,22,38), 8=>array(6,24,42), 9=>array(6,26,46), 10=>array(6,28,50)
  );
}

/* ---- aritmetika GF(256) untuk Reed-Solomon ---- */
function &qr_gf() {
  static $t = null;
  if ($t === null) {
    $exp = array_fill(0, 512, 0); $log = array_fill(0, 256, 0);
    $x = 1;
    for ($i = 0; $i < 255; $i++) {
      $exp[$i] = $x; $log[$x] = $i;
      $x <<= 1; if ($x & 0x100) $x ^= 0x11d;      // polinomial 0x11d
    }
    for ($i = 255; $i < 512; $i++) $exp[$i] = $exp[$i - 255];
    $t = array('exp' => $exp, 'log' => $log);
  }
  return $t;
}
function qr_gfmul($a, $b) {
  if ($a === 0 || $b === 0) return 0;
  $g = &qr_gf();
  return $g['exp'][$g['log'][$a] + $g['log'][$b]];
}
/* Polinomial generator untuk n kodeword koreksi. Hasilnya DIBALIK karena
   qr_rs_encode memakai urutan derajat MENURUN — sama persis dengan catatan di
   rsGen() versi JS. Tanpa pembalikan itu kode koreksinya ngawur: datanya masih
   terbaca, tapi setiap pemindai yang memeriksa koreksi menolaknya, jadi
   galatnya baru kelihatan dengan pemindai sungguhan. */
function qr_rs_gen($n) {
  $g = &qr_gf();
  $poly = array(1);
  for ($i = 0; $i < $n; $i++) {
    $next = array_fill(0, count($poly) + 1, 0);
    for ($j = 0; $j < count($poly); $j++) {
      $next[$j]     ^= qr_gfmul($poly[$j], $g['exp'][$i]);
      $next[$j + 1] ^= $poly[$j];
    }
    $poly = $next;
  }
  return array_reverse($poly);
}
function qr_rs_encode($data, $n) {
  $gen = qr_rs_gen($n);
  $res = array_fill(0, $n, 0);
  foreach ($data as $d) {
    $faktor = $d ^ $res[0];
    array_shift($res); $res[] = 0;
    for ($j = 0; $j < $n; $j++) $res[$j] ^= qr_gfmul($gen[$j + 1], $faktor);
  }
  return $res;
}

/* ---- info format & versi (BCH) ---- */
function qr_panjang_bit($x) { $n = 0; while ($x) { $n++; $x >>= 1; } return $n; }
function qr_bch($nilai, $gen, $bit) {
  $v = $nilai << ($bit - 1);
  while (qr_panjang_bit($v) >= qr_panjang_bit($gen)) $v ^= $gen << (qr_panjang_bit($v) - qr_panjang_bit($gen));
  return $v;
}
// Tingkat M = 00, digabung nomor mask, lalu di-XOR topeng standar.
function qr_format_bits($mask) {
  $data = (0 << 3) | $mask;
  return (($data << 10) | qr_bch($data, 0x537, 11)) ^ 0x5412;
}
function qr_version_bits($v) { return ($v << 12) | qr_bch($v, 0x1f25, 13); }

/* Letak 15 bit info format, dua salinan. Ditulis SEKALI lalu dipakai bersama
   oleh pemesanan sel dan penulisannya, supaya keduanya mustahil berbeda. */
function qr_format_sel($N) {
  $s = array();
  for ($i = 0; $i <= 5; $i++) $s[] = array($i, 8);          // bit 0..5
  $s[] = array(7, 8);                                        // bit 6
  $s[] = array(8, 8);                                        // bit 7
  $s[] = array(8, 7);                                        // bit 8
  for ($i = 9; $i < 15; $i++) $s[] = array(8, 14 - $i);      // bit 9..14
  for ($i = 0; $i < 8; $i++)  $s[] = array(8, $N - 1 - $i);  // salinan 2: bit 0..7
  for ($i = 8; $i < 15; $i++) $s[] = array($N - 15 + $i, 8); // salinan 2: bit 8..14
  return $s;
}

/* Denda sesuai standar: deret sewarna, blok 2x2, pola mirip finder,
   timpang hitam-putih. */
function qr_denda($m, $N) {
  $s = 0;
  for ($r = 0; $r < $N; $r++) for ($arah = 0; $arah < 2; $arah++) {
    $run = 1;
    for ($i = 1; $i < $N; $i++) {
      $a = $arah ? $m[$i - 1][$r] : $m[$r][$i - 1];
      $b = $arah ? $m[$i][$r]     : $m[$r][$i];
      if ($a === $b) { $run++; if ($run === 5) $s += 3; else if ($run > 5) $s++; }
      else $run = 1;
    }
  }
  for ($r = 0; $r < $N - 1; $r++) for ($c = 0; $c < $N - 1; $c++)
    if ($m[$r][$c] === $m[$r][$c + 1] && $m[$r][$c] === $m[$r + 1][$c] && $m[$r][$c] === $m[$r + 1][$c + 1]) $s += 3;
  $pola  = array(1,0,1,1,1,0,1,0,0,0,0);
  $polaR = array(0,0,0,0,1,0,1,1,1,0,1);
  for ($r = 0; $r < $N; $r++) for ($c = 0; $c <= $N - 11; $c++) {
    $c1 = true; $c2 = true; $c3 = true; $c4 = true;
    for ($i = 0; $i < 11; $i++) {
      if ($m[$r][$c + $i] !== $pola[$i])  $c1 = false;
      if ($m[$r][$c + $i] !== $polaR[$i]) $c2 = false;
      if ($m[$c + $i][$r] !== $pola[$i])  $c3 = false;
      if ($m[$c + $i][$r] !== $polaR[$i]) $c4 = false;
    }
    if ($c1) $s += 40; if ($c2) $s += 40; if ($c3) $s += 40; if ($c4) $s += 40;
  }
  $hitam = 0;
  for ($r = 0; $r < $N; $r++) for ($c = 0; $c < $N; $c++) $hitam += $m[$r][$c];
  $s += (int)floor(abs($hitam * 100 / ($N * $N) - 50) / 5) * 10;
  return $s;
}

/* Memulangkan matriks NxN berisi 0/1. Melempar kalau teksnya terlalu panjang
   untuk versi 10 (~210 karakter) — token tiket jauh di bawah itu, jadi kalau
   ini pernah terlempar berarti yang dikirim bukan token. */
function qr_matriks($text) {
  $bytes = array();
  $len = strlen($text);
  for ($i = 0; $i < $len; $i++) $bytes[] = ord($text[$i]);

  $QRM = qr_tabel_m();
  $ver = 0;
  for ($v = 1; $v <= 10; $v++) {
    list($ec, $b1, $d1, $b2, $d2) = $QRM[$v];
    if (count($bytes) + 2 <= $b1 * $d1 + $b2 * $d2) { $ver = $v; break; }
  }
  if (!$ver) throw new Exception('Teks terlalu panjang untuk QR versi 10 (maks ~210 karakter)');

  list($ecLen, $b1, $d1, $b2, $d2) = $QRM[$ver];
  $totalData = $b1 * $d1 + $b2 * $d2;

  // --- rangkaian bit: mode 0100 + panjang + isi + penutup + isian
  $bits = array();
  $push = function ($nilai, $n) use (&$bits) {
    for ($i = $n - 1; $i >= 0; $i--) $bits[] = ($nilai >> $i) & 1;
  };
  $push(4, 4);
  $push(count($bytes), $ver <= 9 ? 8 : 16);
  foreach ($bytes as $b) $push($b, 8);
  for ($i = 0; $i < 4 && count($bits) < $totalData * 8; $i++) $bits[] = 0;
  while (count($bits) % 8) $bits[] = 0;
  $kata = array();
  for ($i = 0; $i < count($bits); $i += 8) {
    $v = 0;
    for ($k = 0; $k < 8; $k++) $v = ($v << 1) | $bits[$i + $k];
    $kata[] = $v;
  }
  $isian = array(0xec, 0x11);
  for ($i = 0; count($kata) < $totalData; $i++) $kata[] = $isian[$i % 2];

  // --- bagi per blok, hitung koreksi, lalu susun berselang-seling
  $blokData = array(); $blokEc = array(); $p = 0;
  for ($i = 0; $i < $b1 + $b2; $i++) {
    $n = $i < $b1 ? $d1 : $d2;
    $d = array_slice($kata, $p, $n); $p += $n;
    $blokData[] = $d; $blokEc[] = qr_rs_encode($d, $ecLen);
  }
  $akhir = array();
  $maxD = max($d1, $d2);
  for ($i = 0; $i < $maxD; $i++) foreach ($blokData as $b) if ($i < count($b)) $akhir[] = $b[$i];
  for ($i = 0; $i < $ecLen; $i++) foreach ($blokEc as $b) $akhir[] = $b[$i];

  // --- kerangka matriks (null = belum diisi)
  $N = $ver * 4 + 17;
  $m = array();
  for ($r = 0; $r < $N; $r++) $m[$r] = array_fill(0, $N, null);
  $taruh = function ($r, $c, $v) use (&$m, $N) {
    if ($r >= 0 && $r < $N && $c >= 0 && $c < $N) $m[$r][$c] = $v;
  };
  $finder = function ($r, $c) use ($taruh, $N) {
    for ($dr = -1; $dr <= 7; $dr++) for ($dc = -1; $dc <= 7; $dc++) {
      $rr = $r + $dr; $cc = $c + $dc;
      if ($rr < 0 || $rr >= $N || $cc < 0 || $cc >= $N) continue;
      $di = ($dr >= 0 && $dr <= 6 && $dc >= 0 && $dc <= 6);
      $hitam = $di && (($dr === 0 || $dr === 6 || $dc === 0 || $dc === 6)
                    || ($dr >= 2 && $dr <= 4 && $dc >= 2 && $dc <= 4));
      $taruh($rr, $cc, $hitam ? 1 : 0);
    }
  };
  $finder(0, 0); $finder(0, $N - 7); $finder($N - 7, 0);

  for ($i = 8; $i < $N - 8; $i++) { $v = ($i % 2 === 0) ? 1 : 0; $taruh(6, $i, $v); $taruh($i, 6, $v); }

  $ALIGN = qr_tabel_align();
  foreach ($ALIGN[$ver] as $r) foreach ($ALIGN[$ver] as $c) {
    if (($r <= 8 && $c <= 8) || ($r <= 8 && $c >= $N - 9) || ($r >= $N - 9 && $c <= 8)) continue;
    for ($dr = -2; $dr <= 2; $dr++) for ($dc = -2; $dc <= 2; $dc++)
      $taruh($r + $dr, $c + $dc, (abs($dr) === 2 || abs($dc) === 2 || ($dr === 0 && $dc === 0)) ? 1 : 0);
  }
  $taruh($N - 8, 8, 1);                                  // modul gelap

  // tempat info format dipesan dulu supaya tidak terpakai data
  $selFmt = qr_format_sel($N);
  foreach ($selFmt as $rc) if ($m[$rc[0]][$rc[1]] === null) $m[$rc[0]][$rc[1]] = 0;

  if ($ver >= 7) {
    $vb = qr_version_bits($ver);
    for ($i = 0; $i < 18; $i++) {
      $bit = ($vb >> $i) & 1;
      $taruh((int)floor($i / 3), $N - 11 + ($i % 3), $bit);
      $taruh($N - 11 + ($i % 3), (int)floor($i / 3), $bit);
    }
  }

  // --- isi data zig-zag dari kanan bawah
  $kosong = array();
  for ($r = 0; $r < $N; $r++) {
    $kosong[$r] = array();
    for ($c = 0; $c < $N; $c++) $kosong[$r][$c] = ($m[$r][$c] === null);
  }
  $bitIdx = 0;
  $ambilBit = function () use (&$bitIdx, $akhir) {
    $i = $bitIdx >> 3;
    $byte = isset($akhir[$i]) ? $akhir[$i] : null;
    $b = ($byte === null) ? 0 : (($byte >> (7 - ($bitIdx & 7))) & 1);
    $bitIdx++; return $b;
  };
  $naik = true;
  for ($col = $N - 1; $col > 0; $col -= 2) {
    if ($col === 6) $col--;                              // lajur timing dilewati
    for ($i = 0; $i < $N; $i++) {
      $row = $naik ? $N - 1 - $i : $i;
      foreach (array($col, $col - 1) as $c) if ($kosong[$row][$c]) $m[$row][$c] = $ambilBit();
    }
    $naik = !$naik;
  }

  // --- pilih mask dengan denda terkecil
  $terbaik = null; $dendaMin = PHP_INT_MAX;
  for ($mask = 0; $mask < 8; $mask++) {
    $uji = $m;
    for ($r = 0; $r < $N; $r++) for ($c = 0; $c < $N; $c++) {
      if (!$kosong[$r][$c]) continue;
      $kena = false;
      switch ($mask) {
        case 0: $kena = (($r + $c) % 2 === 0); break;
        case 1: $kena = ($r % 2 === 0); break;
        case 2: $kena = ($c % 3 === 0); break;
        case 3: $kena = (($r + $c) % 3 === 0); break;
        case 4: $kena = (((($r >> 1) + (int)floor($c / 3)) % 2) === 0); break;
        case 5: $kena = ((($r * $c) % 2 + ($r * $c) % 3) === 0); break;
        case 6: $kena = (((($r * $c) % 2 + ($r * $c) % 3) % 2) === 0); break;
        case 7: $kena = (((($r + $c) % 2 + ($r * $c) % 3) % 2) === 0); break;
      }
      if ($kena) $uji[$r][$c] ^= 1;
    }
    $fb = qr_format_bits($mask);
    foreach ($selFmt as $i => $rc) $uji[$rc[0]][$rc[1]] = ($fb >> ($i % 15)) & 1;
    $uji[$N - 8][8] = 1;                                 // modul gelap
    $d = qr_denda($uji, $N);
    if ($d < $dendaMin) { $dendaMin = $d; $terbaik = $uji; }
  }
  return $terbaik;
}
