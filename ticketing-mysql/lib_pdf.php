<?php
/* =====================================================================
   PENULIS PDF SEDERHANA + LEMBAR E-TICKET

   Kenapa ditulis sendiri, bukan memakai pustaka: modul ini di-deploy lewat FTP
   ke shared hosting tanpa composer, dan `vendor/` memang tidak ikut terkirim
   (lihat CLAUDE.md). Menambah satu pustaka PDF berarti menambah satu hal yang
   bisa hilang saat transfer — dan kalau hilang, yang gagal bukan tampilan,
   tapi lampiran tiket orang yang sudah membayar.

   QR-nya digambar sebagai KOTAK VEKTOR, bukan gambar. Akibatnya tiga-tiganya
   menguntungkan: tidak perlu pengkode PNG sama sekali, hasilnya tajam di
   berapa pun perbesarannya (pemindai di pintu masuk memotret dari layar HP
   yang bisa di-zoom), dan berkasnya kecil — 10 tiket masih di bawah 100 KB
   setelah dikompres.

   Yang SENGAJA tidak ada di sini: gambar, font tertanam, dan Unicode di luar
   WinAnsi. Ketiganya melipatgandakan ukuran kode untuk hal yang tidak
   menentukan apakah tiket bisa dipindai atau tidak.
   ===================================================================== */
require_once __DIR__ . '/lib_qr.php';

/* Teks PDF memakai WinAnsi (CP1252). Nama orang Indonesia hampir selalu ASCII,
   tapi judul event kadang memuat tanda kutip melengkung atau em dash hasil
   salin-tempel dari WhatsApp. Yang tidak bisa dipetakan diubah jadi bentuk
   terdekatnya, bukan dibuang — nama yang kehilangan huruf lebih buruk daripada
   nama yang kehilangan aksen. */
function pdf_ansi($s) {
  $s = (string)$s;
  if (function_exists('iconv')) {
    $x = @iconv('UTF-8', 'CP1252//TRANSLIT//IGNORE', $s);
    if ($x !== false) $s = $x;
  } else {
    $s = preg_replace('/[^\x20-\x7E]/', '', $s);
  }
  return $s;
}
function pdf_str($s) {
  return '(' . str_replace(array('\\', '(', ')', "\r", "\n"),
                           array('\\\\', '\\(', '\\)', ' ', ' '), pdf_ansi($s)) . ')';
}
function pdf_n($v) { return rtrim(rtrim(number_format((float)$v, 2, '.', ''), '0'), '.'); }

/* Lebar teks Helvetica secukupnya untuk memotong judul yang kepanjangan.
   Bukan tabel metrik lengkap — 0.52em rata-rata cukup untuk memutuskan "muat
   atau tidak", dan judul yang meleber keluar kotak jauh lebih kelihatan
   daripada judul yang dipotong satu huruf terlalu awal. */
function pdf_potong($s, $ukuran, $lebarMaks) {
  $s = pdf_ansi($s);
  $maks = (int)floor($lebarMaks / ($ukuran * 0.52));
  if (strlen($s) <= $maks) return $s;
  return rtrim(substr($s, 0, max(1, $maks - 1))) . '.';
}

function pdf_teks($x, $y, $ukuran, $font, $teks, $warna = '0 0 0') {
  return "BT $warna rg /$font " . pdf_n($ukuran) . " Tf "
       . pdf_n($x) . ' ' . pdf_n($y) . " Td " . pdf_str($teks) . " Tj ET\n";
}
function pdf_kotak($x, $y, $w, $h, $warna) {
  return "$warna rg " . pdf_n($x) . ' ' . pdf_n($y) . ' ' . pdf_n($w) . ' ' . pdf_n($h) . " re f\n";
}
function pdf_garis($x1, $y1, $x2, $y2, $warna = '.85 .84 .81', $tebal = 1, $putus = false) {
  return ($putus ? "[3 3] 0 d\n" : "[] 0 d\n")
       . "$warna RG " . pdf_n($tebal) . " w "
       . pdf_n($x1) . ' ' . pdf_n($y1) . " m " . pdf_n($x2) . ' ' . pdf_n($y2) . " l S\n";
}

/* QR sebagai deretan kotak. Modul yang bersebelahan mendatar DIGABUNG jadi satu
   kotak panjang: itu memangkas jumlah operasi kira-kira separuh, dan yang
   dipangkas bukan cuma ukuran berkas tapi juga celah rambut antar kotak yang
   muncul di sebagian penampil PDF — celah yang bisa membuat pemindaian gagal. */
function pdf_qr($teks, $x, $y, $ukuran) {
  $m = qr_matriks($teks);
  $N = count($m);
  $tepi = 4;                                   // zona sunyi wajib, 4 modul
  $total = $N + $tepi * 2;
  $px = $ukuran / $total;
  $out = pdf_kotak($x, $y, $ukuran, $ukuran, '1 1 1');
  $out .= "0 0 0 rg\n";
  for ($r = 0; $r < $N; $r++) {
    $c = 0;
    while ($c < $N) {
      if (!$m[$r][$c]) { $c++; continue; }
      $mulai = $c;
      while ($c < $N && $m[$r][$c]) $c++;
      $lebar = ($c - $mulai) * $px;
      // Baris 0 matriks digambar di ATAS: sumbu y PDF naik, matriks turun.
      $gy = $y + $ukuran - ($r + $tepi + 1) * $px;
      $gx = $x + ($mulai + $tepi) * $px;
      $out .= pdf_n($gx) . ' ' . pdf_n($gy) . ' ' . pdf_n($lebar) . ' ' . pdf_n($px) . " re\n";
    }
  }
  return $out . "f\n";
}

/* Satu tiket digambar di dalam SLOT setinggi separuh A4. y0 = dasar slotnya.
   Dua tiket per halaman: pas dipotong jadi dua, dan 10 tiket cuma 5 lembar —
   pembeli rombongan mencetaknya sendiri di rumah dan tidak ada yang mau
   mencetak 10 lembar untuk satu meja. */
function pdf_slot_tiket($y0, $tinggi, $ev, $o, $t, $ke, $dari) {
  $L = 36; $R = 559; $W = $R - $L;
  $atas = $y0 + $tinggi;
  $s = '';

  // Kepala gelap
  $hT = 62;
  $s .= pdf_kotak($L, $atas - 30 - $hT, $W, $hT, '.165 .149 .125');
  $s .= pdf_teks($L + 16, $atas - 30 - 22, 8, 'F2', 'LAKSAMANA MUDA', '.784 .588 .122');
  $s .= pdf_teks($L + 16, $atas - 30 - 44, 15, 'F2',
        pdf_potong($ev && isset($ev['title']) ? $ev['title'] : 'Event Laksamana Muda', 15, $W - 32), '1 1 1');
  $s .= pdf_teks($R - 16 - 52, $atas - 30 - 22, 8, 'F1', 'E-TICKET ' . $ke . '/' . $dari, '.75 .73 .70');

  $qrUk = 132;
  $qrX = $R - 16 - $qrUk;
  $qrY = $atas - 30 - $hT - 14 - $qrUk;
  $s .= pdf_qr(isset($t['qr_token']) ? $t['qr_token'] : '', $qrX, $qrY, $qrUk);
  $s .= pdf_teks($qrX, $qrY - 12, 7, 'F1', 'Tunjukkan QR ini di pintu masuk', '.55 .53 .48');

  // Kolom keterangan
  $ky = $atas - 30 - $hT - 26;
  $baris = array();
  $baris[] = array('Nomor Tiket', isset($t['ticket_number']) ? $t['ticket_number'] : '-');
  $baris[] = array('Kategori',    isset($t['tier']) ? $t['tier'] : '-');

  $pt    = (int)(isset($t['pax_total']) ? $t['pax_total'] : 1);
  $jenis = isset($t['kind']) ? $t['kind'] : ($pt > 1 ? 'table' : 'seat');
  if ($jenis === 'general') {
    $tempat = 'Tanpa nomor tempat' . ($pt > 1 ? ' - tiket ' . (int)$t['pax_no'] . ' dari ' . $pt : '');
  } else {
    $tempat = ($jenis === 'table' ? 'Meja ' : '') . (isset($t['seat_label']) ? $t['seat_label'] : '-')
            . ($pt > 1 ? ' - tamu ' . (int)$t['pax_no'] . ' dari ' . $pt : '');
  }
  $baris[] = array('Tempat', $tempat);
  if ($ev && !empty($ev['start_datetime'])) {
    $baris[] = array('Waktu', str_replace('T', ' ', substr((string)$ev['start_datetime'], 0, 16)) . ' WIB');
  }
  if ($ev && !empty($ev['venue'])) $baris[] = array('Venue', $ev['venue']);
  $baris[] = array('Pemesan',      isset($o['buyer_name']) ? $o['buyer_name'] : '-');
  $baris[] = array('Kode Pesanan', isset($o['payment_ref']) ? $o['payment_ref'] : '-');

  $lebarKet = $qrX - $L - 26;
  foreach ($baris as $b) {
    $s .= pdf_teks($L + 16, $ky, 7.5, 'F1', strtoupper($b[0]), '.58 .56 .50');
    $s .= pdf_teks($L + 16, $ky - 13, 11, 'F2', pdf_potong($b[1], 11, $lebarKet));
    $ky -= 31;
  }

  // Garis potong antar tiket
  $s .= pdf_garis($L, $y0 + 6, $R, $y0 + 6, '.80 .78 .74', 1, true);
  return $s;
}

/* Membangun PDF lengkap. Memulangkan string biner.
   $maks membatasi berapa tiket yang ikut — bukan batas teknis, tapi batas
   lampiran email: pesanan 200 tiket akan menghasilkan berkas puluhan megabyte
   yang ditolak server penerima, dan penolakan itu terjadi diam-diam. Yang
   melebihi batas tetap bisa dibuka lewat tautan halaman e-ticket. */
function pdf_eticket($o, $tiket, $ev = null, $maks = 30) {
  $tiket = array_values($tiket);
  if ($maks > 0 && count($tiket) > $maks) $tiket = array_slice($tiket, 0, $maks);
  $n = count($tiket);
  if (!$n) throw new Exception('Tidak ada tiket untuk dicetak.');

  $Wh = 595.28; $Hh = 841.89;
  $halaman = array();
  for ($i = 0; $i < $n; $i += 2) {
    $isi = "q\n";
    $isi .= pdf_slot_tiket($Hh / 2, $Hh / 2, $ev, $o, $tiket[$i], $i + 1, $n);
    if (isset($tiket[$i + 1])) $isi .= pdf_slot_tiket(0, $Hh / 2, $ev, $o, $tiket[$i + 1], $i + 2, $n);
    $isi .= "Q\n";
    $halaman[] = $isi;
  }

  /* Objek disusun dulu sebagai array, xref dihitung belakangan dari panjang
     yang benar-benar tertulis. Menghitung offset sambil menyusun teks adalah
     cara paling mudah menghasilkan PDF yang "hampir benar" — dan PDF yang
     hampir benar dibuka baik-baik saja oleh sebagian penampil lalu ditolak
     oleh yang lain, tanpa pesan yang bisa dipakai. */
  $obj = array();
  $jml = count($halaman);
  $idPage1 = 5;                                  // 1 katalog, 2 pages, 3-4 font
  $kids = array();
  for ($i = 0; $i < $jml; $i++) $kids[] = ($idPage1 + $i * 2) . ' 0 R';

  $obj[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  $obj[2] = "<< /Type /Pages /Count $jml /Kids [" . implode(' ', $kids) . "] >>";
  $obj[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  $obj[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

  for ($i = 0; $i < $jml; $i++) {
    $idP = $idPage1 + $i * 2; $idC = $idP + 1;
    $obj[$idP] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " . pdf_n($Wh) . ' ' . pdf_n($Hh) . "] "
               . "/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents $idC 0 R >>";
    $isi = $halaman[$i];
    /* Dikompres kalau zlib ada. Kalau tidak ada, PDF-nya tetap sah — cuma
       lebih besar. Menggagalkan pembuatan tiket karena kompresi tidak
       tersedia adalah menukar hal penting dengan hal yang tidak penting. */
    if (function_exists('gzcompress')) {
      $pak = gzcompress($isi, 6);
      $obj[$idC] = "<< /Length " . strlen($pak) . " /Filter /FlateDecode >>\nstream\n" . $pak . "\nendstream";
    } else {
      $obj[$idC] = "<< /Length " . strlen($isi) . " >>\nstream\n" . $isi . "endstream";
    }
  }

  $out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  $offset = array();
  ksort($obj);
  foreach ($obj as $id => $isi) {
    $offset[$id] = strlen($out);
    $out .= "$id 0 obj\n" . $isi . "\nendobj\n";
  }
  $maksId = max(array_keys($obj));
  $mulaiXref = strlen($out);
  $out .= "xref\n0 " . ($maksId + 1) . "\n0000000000 65535 f \n";
  for ($i = 1; $i <= $maksId; $i++) {
    $o2 = isset($offset[$i]) ? $offset[$i] : 0;
    $out .= sprintf("%010d 00000 n \n", $o2);
  }
  $out .= "trailer\n<< /Size " . ($maksId + 1) . " /Root 1 0 R >>\nstartxref\n$mulaiXref\n%%EOF\n";
  return $out;
}

/* Nama berkas lampiran. Hanya karakter aman: nama berkas yang memuat spasi atau
   tanda baca sering dipotong klien email di tengah, dan yang sampai ke pembeli
   jadi "E-Ticket" tanpa .pdf — berkas yang tidak bisa dibuka dengan sekali
   ketuk, persis pada orang yang sedang berdiri di antrean. */
function pdf_nama_eticket($o) {
  $ref = preg_replace('/[^A-Za-z0-9._-]/', '', (string)(isset($o['payment_ref']) ? $o['payment_ref'] : 'tiket'));
  if ($ref === '') $ref = 'tiket';
  return 'E-Ticket-' . $ref . '.pdf';
}
