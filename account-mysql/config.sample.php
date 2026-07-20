<?php
/************************************************************************
 * ACCOUNT — Konfigurasi
 * ---------------------------------------------------------------------
 * SATU-SATUNYA file yang perlu diedit. lib_account_mysql.php tidak usah
 * disentuh.
 *
 * CARA DAPAT KREDENSIAL DI RUMAHWEB (cPanel):
 *   1. cPanel > "MySQL Databases".
 *   2. Buat database baru, mis. "lakk5493_db_account".
 *   3. Buat user MySQL + password, lalu "Add User to Database"
 *      (ALL PRIVILEGES).
 *   4. Salin nama db, user, dan password ke bawah ini.
 *
 * CATATAN: file ini berisi password — sudah di-ignore lewat .gitignore
 * di folder ini supaya tidak pernah ikut ter-commit.
 ************************************************************************/

// ---------- KONEKSI DATABASE ----------
define('DB_HOST', '127.0.0.1');
define('DB_PORT', 3306);
define('DB_NAME', 'lakk5493_db_account');   // di cPanel diketik "db_account"
define('DB_USER', 'lakk5493_account');      // di cPanel diketik "account"
define('DB_PASS', 'ISI_PASSWORD_DI_SINI');
define('DB_CHARSET', 'utf8mb4');

// ---------- PENANDA LINGKUNGAN ----------
// Ikut dibalas oleh ?action=ping dan ?action=stats. Ini satu-satunya cara
// cepat memastikan zip dev tidak salah terpasang di produksi.
define('ENV_LABEL', 'produksi');   // dev: 'dev'

// ---------- (OPSIONAL) TOKEN AKSES API ----------
// Kosongkan = terbuka, sama seperti Web App Apps Script yang lama.
// Tulisan tetap dijaga oleh callerName + callerPin di tiap permintaan.
define('API_TOKEN', '');
