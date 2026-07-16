<?php
/************************************************************************
 * RESERVASI LAKSAMANA MUDA — Konfigurasi (versi MySQL / Jalan B)
 * ---------------------------------------------------------------------
 * CONTOH konfigurasi (tanpa kredensial asli). Salin file ini menjadi
 * `config.php`, lalu isi kredensial database yang sebenarnya.
 * `config.php` di-ignore lewat .gitignore supaya password tidak masuk repo.
 *
 * CARA DAPAT KREDENSIAL DI RUMAHWEB (cPanel):
 *   1. cPanel > "MySQL Databases".
 *   2. Buat database baru, mis. "lakk5493_reservasi".
 *   3. Buat user MySQL + password, lalu "Add User to Database" (ALL PRIVILEGES).
 *   4. Salin nama db, user, dan password ke bawah ini.
 ************************************************************************/

// ---------- KONEKSI DATABASE ----------
define('DB_HOST', '127.0.0.1');          // di cPanel hampir selalu localhost/127.0.0.1
define('DB_PORT', 3306);
define('DB_NAME', 'lakk5493_db_reservasi');   // di cPanel diketik "db_reservasi" (prefix otomatis)
define('DB_USER', 'lakk5493_reservasi');       // di cPanel diketik "reservasi" (prefix otomatis)
define('DB_PASS', 'ISI_PASSWORD_DI_SINI');     // password yang dipakai saat bikin user di cPanel
define('DB_CHARSET', 'utf8mb4');

// ---------- LOKASI FOTO (di disk, sama seperti versi lama) ----------
// Foto TIDAK dipindah ke MySQL — tetap 1 file per foto (base64) di folder ini.
// Kosongkan ('') untuk pakai default: naik 3 tingkat keluar dari public_html.
define('DATA_DIR', '/home/lakk5493/reservasi-db');  // folder foto yang sudah ada

// ---------- (OPSIONAL) TOKEN AKSES API ----------
// Kosongkan = terbuka. Kalau diisi, request wajib menyertakan ?token=... yang sama.
define('API_TOKEN', '');
