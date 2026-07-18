<?php
/* Dipakai bersama keempat endpoint: muat config + lib, layani ping/stats.
   config.local.php: untuk tes di laptop tanpa menyentuh kredensial asli. */
if (file_exists(__DIR__ . '/config.local.php')) require_once __DIR__ . '/config.local.php';
else                                            require_once __DIR__ . '/config.php';
require_once __DIR__ . '/lib_stock_mysql.php';

$metode = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$aksiUrl = $_GET['action'] ?? '';

// ping SEBELUM cek token & sebelum sentuh DB: dipakai untuk memastikan
// endpoint hidup dan — penting — situs ini bicara ke database yang MANA.
if ($metode === 'GET' && $aksiUrl === 'ping') {
  pur_json(['status' => 'success', 'ok' => true, 'time' => gmdate('c'),
            'env' => defined('ENV_LABEL') ? ENV_LABEL : '(tidak diberi label)',
            'db'  => DB_NAME]);
}
