<?php
/************************************************************************
 * HOWANDI LIFE OS — Konfigurasi
 * ---------------------------------------------------------------------
 * SATU-SATUNYA file yang perlu kamu edit.
 *
 * CARA DAPAT KREDENSIAL DI RUMAHWEB (cPanel):
 *   1. cPanel > "MySQL Databases".
 *   2. Buat database baru, mis. "lakk5493_db_hlife".
 *   3. Buat user MySQL + password, lalu "Add User to Database" (ALL PRIVILEGES).
 *   4. Salin nama db, user, dan password ke bawah ini.
 *
 * CATATAN: config.php (berisi password) di-ignore lewat .gitignore.
 * File contoh inilah yang masuk repo.
 ************************************************************************/

define('DB_HOST', '127.0.0.1');
define('DB_PORT', 3306);
define('DB_NAME', 'lakk5493_db_hlife');   // di cPanel diketik "db_hlife"
define('DB_USER', 'lakk5493_hlife');      // di cPanel diketik "hlife"
define('DB_PASS', 'ISI_PASSWORD_DI_SINI');
define('DB_CHARSET', 'utf8mb4');

/* Token API — HARUS SAMA dengan API_TOKEN di deploy/howandi_life/index.html.
 *
 * Jujur soal seberapa kuat ini: token itu ada di dalam HTML yang dikirim ke
 * browser, jadi siapa pun yang membuka halamannya bisa membacanya. Dia BUKAN
 * rahasia — fungsinya cuma menyaring permintaan asal-asalan, bukan menahan
 * orang yang memang niat. Yang benar-benar menjaga modul ini adalah gerbang
 * SSO Office (lm_session) di bagian atas halaman.
 *
 * Dibiarkan sama dengan token Apps Script lama supaya perilakunya tidak
 * berubah saat pindah backend. */
define('API_TOKEN', 'HL-5mHh8Lfu8bpiPMkgtRphSmvM');
