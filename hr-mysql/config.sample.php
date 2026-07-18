<?php
/************************************************************************
 * HR / PEOPLE OS LAKSAMANA MUDA — Konfigurasi
 * ---------------------------------------------------------------------
 * SATU-SATUNYA file yang perlu kamu edit.
 *
 * CARA DAPAT KREDENSIAL DI RUMAHWEB (cPanel):
 *   1. cPanel > "MySQL Databases".
 *   2. Buat database baru, mis. "lakk5493_db_hr".
 *   3. Buat user MySQL + password, lalu "Add User to Database" (ALL PRIVILEGES).
 *   4. Salin nama db, user, dan password ke bawah ini.
 *
 * CATATAN: config.php (berisi password) di-ignore lewat .gitignore.
 * File contoh inilah yang masuk repo.
 *
 * PERINGATAN ISI DATA: tabel `employees` berisi PIN akses, tanggal lahir,
 * telepon, dan email kru. Tabel `violations` berisi riwayat SP. Jangan
 * ekspor isinya ke repo, chat, atau layanan pihak ketiga.
 ************************************************************************/

define('DB_HOST', '127.0.0.1');
define('DB_PORT', 3306);
define('DB_NAME', 'lakk5493_db_hr');   // di cPanel diketik "db_hr"
define('DB_USER', 'lakk5493_hr');      // di cPanel diketik "hr"
define('DB_PASS', 'ISI_PASSWORD_DI_SINI');
define('DB_CHARSET', 'utf8mb4');

// Kosongkan = terbuka. Kalau diisi, request wajib menyertakan ?token=... sama.
define('API_TOKEN', '');

/* Penanda lingkungan. Muncul di ?action=stats supaya bisa dipastikan situs ini
   bicara ke database yang benar — nama file config selalu 'config.php' di
   kedua server, jadi zip tertukar tidak terlihat dari mana pun kecuali sini. */
define('ENV_LABEL', 'produksi');
