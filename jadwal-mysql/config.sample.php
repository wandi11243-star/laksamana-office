<?php
/************************************************************************
 * JADWAL SHIFT LAKSAMANA — Konfigurasi
 * ---------------------------------------------------------------------
 * cPanel > MySQL Databases: buat database + user, lalu "Add User to
 * Database" (ALL PRIVILEGES). Salin kredensialnya ke bawah ini, simpan
 * sebagai config.php, lalu unggah MANUAL ke /jadwal-api-mysql/ di server.
 *
 * Workflow FTP sengaja TIDAK mengirim config*.php (lihat exclude di
 * .github/workflows/): dev dan produksi menunjuk database yang berbeda,
 * dan file ini berisi password.
 ************************************************************************/
define('DB_HOST', '127.0.0.1');
define('DB_PORT', 3306);
define('DB_NAME', 'lakk5493_db_jadwal');   // di cPanel diketik "db_jadwal"
define('DB_USER', 'lakk5493_jadwal');      // di cPanel diketik "jadwal"
define('DB_PASS', 'ISI_PASSWORD_DI_SINI');
define('DB_CHARSET', 'utf8mb4');

// Ikut dibalas ?action=ping — satu-satunya cara cepat memastikan config dev
// tidak salah terpasang di produksi.
define('ENV_LABEL', 'produksi');   // dev: 'dev'

define('API_TOKEN', '');
