<?php
/************************************************************************
 * MARKETING / CRM LAKSAMANA MUDA — Konfigurasi
 * ---------------------------------------------------------------------
 * SATU-SATUNYA file yang perlu kamu edit. File logika tidak perlu disentuh.
 *
 * CARA DAPAT KREDENSIAL DI RUMAHWEB (cPanel):
 *   1. cPanel > "MySQL Databases".
 *   2. Buat database baru, mis. "lakk5493_db_marketing".
 *   3. Buat user MySQL + password, lalu "Add User to Database" (ALL PRIVILEGES).
 *   4. Salin nama db, user, dan password ke bawah ini.
 *
 * CATATAN: config.php (berisi password) di-ignore lewat .gitignore.
 * File contoh ini yang masuk repo.
 ************************************************************************/

define('DB_HOST', '127.0.0.1');
define('DB_PORT', 3306);
define('DB_NAME', 'lakk5493_db_marketing');  // di cPanel diketik "db_marketing"
define('DB_USER', 'lakk5493_marketing');     // di cPanel diketik "marketing"
define('DB_PASS', 'ISI_PASSWORD_DI_SINI');
define('DB_CHARSET', 'utf8mb4');

// Kosongkan = terbuka. Kalau diisi, request wajib menyertakan ?token=... sama.
define('API_TOKEN', '');
