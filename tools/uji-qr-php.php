<?php
/* Pembanding QR: PHP (ticketing-mysql/lib_qr.php) vs JS (deploy/ticketing).

   Dijalankan berpasangan oleh tools/uji-qr.js — skrip itu menjalankan versi JS
   di jsdom, skrip ini menjalankan versi PHP, lalu keduanya dibandingkan baris
   demi baris.

   Alasan uji ini ada: QR di layar dan QR di lampiran PDF harus benda yang SAMA
   PERSIS. Kalau menyimpang, yang ketahuan cuma saat petugas memindai lembar
   cetak di pintu masuk pada malam acara — waktu paling buruk untuk menemukan
   apa pun.

   Pemakaian:  php tools/uji-qr-php.php "teks1" "teks2" ...
   Keluaran:   satu baris JSON berisi matriks tiap teks (0/1 tanpa pemisah). */
require __DIR__ . '/../ticketing-mysql/lib_qr.php';

$out = array();
$argsv = array_slice($argv, 1);
if (!$argsv) $argsv = array('uji');
foreach ($argsv as $t) {
  $m = qr_matriks($t);
  $baris = array();
  foreach ($m as $r) $baris[] = implode('', $r);
  $out[$t] = $baris;
}
echo json_encode($out);
