<?php
/************************************************************************
 * EVENT MANAGEMENT SYSTEM (EMS) LAKSAMANA MUDA — Konfigurasi
 * ---------------------------------------------------------------------
 * SATU-SATUNYA file yang perlu kamu edit. File logika (lib_event_mysql.php)
 * tidak perlu disentuh.
 *
 * CARA DAPAT KREDENSIAL DI RUMAHWEB (cPanel):
 *   1. cPanel > "MySQL Databases".
 *   2. Buat database baru, mis. "lakk5493_db_ems".
 *   3. Buat user MySQL + password, lalu "Add User to Database" (ALL PRIVILEGES).
 *   4. Salin nama db, user, dan password ke bawah ini.
 *      (Di cPanel nama db & user berprefix otomatis, mis. "lakk5493_...".)
 *
 * CATATAN: file ini berisi password — sudah di-ignore lewat .gitignore di
 * folder ini supaya tidak pernah ikut ter-commit ke repo.
 ************************************************************************/

// ---------- KONEKSI DATABASE ----------
define('DB_HOST', '127.0.0.1');            // di cPanel hampir selalu localhost/127.0.0.1
define('DB_PORT', 3306);
define('DB_NAME', 'lakk5493_db_ems');    // di cPanel diketik "db_ems" (prefix otomatis)
define('DB_USER', 'lakk5493_ems');       // di cPanel diketik "ems" (prefix otomatis)
define('DB_PASS', 'ISI_PASSWORD_DI_SINI'); // password saat bikin user di cPanel
define('DB_CHARSET', 'utf8mb4');

// ---------- (OPSIONAL) TOKEN AKSES API ----------
// Kosongkan = terbuka (sama seperti reservasi sekarang). Kalau diisi, request
// wajib menyertakan ?token=... yang sama.
define('API_TOKEN', '');
