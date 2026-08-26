<?php
/*
  CONTOH API untuk aplikasi mobile Laksamana Muda.
  Upload file ini ke hosting (mis. public_html/app-api/api.php), lalu ganti
  4 baris koneksi di bawah dengan data database Anda (dari cPanel > MySQL
  Databases). Nama tabel & kolom pada query juga disesuaikan dengan database
  Anda yang sebenarnya (lihat di phpMyAdmin).

  Uji di browser dulu:  https://DOMAIN-ANDA/app-api/api.php?action=ping
*/

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *'); // izinkan app memanggil

// ============ GANTI 4 BARIS INI ============
$DB_HOST = 'localhost';
$DB_NAME = 'namauser_laksamana';   // nama database
$DB_USER = 'namauser_appuser';     // username MySQL
$DB_PASS = 'PASSWORD_DB';          // password MySQL
// ===========================================

try {
  $pdo = new PDO(
    "mysql:host=$DB_HOST;dbname=$DB_NAME;charset=utf8mb4",
    $DB_USER, $DB_PASS,
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
  );
} catch (Exception $e) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'Koneksi database gagal']);
  exit;
}

$action = $_GET['action'] ?? '';

// Endpoint uji: memastikan file & koneksi jalan, tanpa menyentuh tabel apa pun.
if ($action === 'ping') {
  echo json_encode(['ok' => true, 'pesan' => 'API & database tersambung']);
  exit;
}

// Contoh: ambil daftar event. GANTI nama tabel & kolom sesuai database Anda.
if ($action === 'events') {
  try {
    $rows = $pdo->query(
      "SELECT id, judul, tanggal, harga FROM events ORDER BY tanggal"
    )->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(['ok' => true, 'data' => $rows]);
  } catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Query gagal, cek nama tabel/kolom']);
  }
  exit;
}

http_response_code(404);
echo json_encode(['ok' => false, 'error' => 'action tidak dikenal']);
