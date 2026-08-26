<?php
/*
  API untuk aplikasi mobile Laksamana Muda.
  Upload ke hosting, mis. public_html/app-api/api.php, BERSAMA config.php di
  folder yang sama. Kredensial database ada di config.php (tidak masuk git).

  PENTING: file ini HANYA MEMBACA (SELECT). Ia sengaja tidak pernah menulis ke
  database operasional Office. Idealnya user MySQL yang dipakai pun read-only.

  Uji di browser:
    https://DOMAIN-ANDA/app-api/api.php?action=ping
    https://DOMAIN-ANDA/app-api/api.php?action=reservations
*/

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *'); // izinkan app memanggil

function keluar($arr, $code = 200) {
  http_response_code($code);
  echo json_encode($arr, JSON_UNESCAPED_UNICODE);
  exit;
}

// Kredensial dipisah ke config.php (diabaikan git). Kalau hilang, berhenti jelas.
$cfgPath = __DIR__ . '/config.php';
if (!file_exists($cfgPath)) {
  keluar(['ok' => false, 'error' => 'config.php tidak ditemukan di server'], 500);
}
$cfg = require $cfgPath;

try {
  $pdo = new PDO(
    "mysql:host={$cfg['host']};dbname={$cfg['name']};charset=utf8mb4",
    $cfg['user'], $cfg['pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
  );
} catch (Exception $e) {
  keluar(['ok' => false, 'error' => 'Koneksi database gagal'], 500);
}

$action = $_GET['action'] ?? '';

// --- Uji koneksi, tidak menyentuh tabel apa pun ---
if ($action === 'ping') {
  keluar(['ok' => true, 'pesan' => 'API & database tersambung']);
}

// --- Daftar reservasi (baca saja) ---
// Opsional: ?phone=0812... untuk menyaring reservasi milik satu nomor.
if ($action === 'reservations') {
  try {
    $phone = trim($_GET['phone'] ?? '');
    $sql = "SELECT id, name, phone, tanggal, jam, pax, status, source, dp_amount, created_at
            FROM reservations";
    $params = [];
    if ($phone !== '') {
      $sql .= " WHERE phone = ?";
      $params[] = $phone;
    }
    $sql .= " ORDER BY tanggal DESC, created_at DESC LIMIT 100";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    keluar(['ok' => true, 'jumlah' => count($rows), 'data' => $rows]);
  } catch (Exception $e) {
    keluar(['ok' => false, 'error' => 'Query gagal: ' . $e->getMessage()], 500);
  }
}

keluar(['ok' => false, 'error' => 'action tidak dikenal'], 404);
