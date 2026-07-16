<?php
/************************************************************************
 * KONTEN / CONTENT OPERATIONS LAKSAMANA MUDA — Konfigurasi
 * ---------------------------------------------------------------------
 * SATU-SATUNYA file yang perlu kamu edit.
 *
 * CARA DAPAT KREDENSIAL DI RUMAHWEB (cPanel):
 *   1. cPanel > "MySQL Databases".
 *   2. Buat database baru, mis. "lakk5493_db_konten".
 *   3. Buat user MySQL + password, lalu "Add User to Database" (ALL PRIVILEGES).
 *   4. Salin nama db, user, dan password ke bawah ini.
 *
 * CATATAN: config.php (berisi password) di-ignore lewat .gitignore.
 * File contoh inilah yang masuk repo.
 ************************************************************************/

define('DB_HOST', '127.0.0.1');
define('DB_PORT', 3306);
define('DB_NAME', 'lakk5493_db_konten');   // di cPanel diketik "db_konten"
define('DB_USER', 'lakk5493_konten');      // di cPanel diketik "konten"
define('DB_PASS', 'ISI_PASSWORD_DI_SINI');
define('DB_CHARSET', 'utf8mb4');

// ---------- LOKASI FILE (aset/thumbnail) ----------
// File TIDAK masuk MySQL — 1 file per berkas di folder ini, di LUAR web root
// supaya tidak bisa diakses langsung tanpa lewat api.php. Pola sama seperti
// foto reservasi & bukti transfer marketing.
define('DATA_DIR', '/home/lakk5493/konten-db');

// Kosongkan = terbuka. Kalau diisi, request wajib menyertakan ?token=... sama.
define('API_TOKEN', '');
