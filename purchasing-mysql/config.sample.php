<?php
/************************************************************************
 * PURCHASING LAKSAMANA MUDA — Konfigurasi
 * ---------------------------------------------------------------------
 * SATU-SATUNYA file yang perlu kamu edit.
 *
 * PENTING — ADA DUA SITUS, DUA DATABASE, DUA config.php BERBEDA:
 *
 *   office.laksamanamuda.id (branch main)
 *     -> DB_NAME 'lakk5493_db_purchasing'   (data asli, dipakai kru)
 *
 *   dev.laksamanamuda.id (branch develop)
 *     -> DB_NAME 'lakk5493_db_dev_purchasing'   (salinan untuk coba-coba)
 *
 * File index.html-nya SAMA di kedua situs — yang membedakan hanya
 * config.php ini. Frontend memanggil API lewat path RELATIF
 * (`../../purchasing-api-mysql/...`), jadi tiap situs otomatis memakai
 * API + database miliknya sendiri tanpa perlu cabang kode.
 *
 * JANGAN PERNAH mengisi config.php di dev dengan nama database produksi:
 * coba-coba di dev akan langsung mengubah data asli kru.
 *
 * CARA DAPAT KREDENSIAL DI RUMAHWEB (cPanel):
 *   1. cPanel > "MySQL Databases".
 *   2. Buat database (mis. "db_purchasing" -> jadi "lakk5493_db_purchasing").
 *   3. Buat user MySQL + password, lalu "Add User to Database" (ALL PRIVILEGES).
 *   4. Salin nama db, user, dan password ke bawah ini.
 *
 * CATATAN: config.php (berisi password) di-ignore lewat .gitignore.
 * File contoh inilah yang masuk repo.
 ************************************************************************/

define('DB_HOST', '127.0.0.1');
define('DB_PORT', 3306);

// GANTI sesuai situs tempat file ini dipasang — lihat penjelasan di atas.
define('DB_NAME', 'lakk5493_db_purchasing');   // dev: lakk5493_db_dev_purchasing
define('DB_USER', 'lakk5493_purchasing');      // dev: lakk5493_dev_purchasing
define('DB_PASS', 'ISI_PASSWORD_DI_SINI');
define('DB_CHARSET', 'utf8mb4');

/* Label lingkungan. Muncul di balasan ?action=ping supaya kamu bisa
   memastikan situs mana bicara ke database mana — tanpa ini, salah pasang
   config baru ketahuan setelah data produksi terlanjur berubah. */
define('ENV_LABEL', 'produksi');   // dev: 'dev'

// Kosongkan = terbuka. Kalau diisi, request wajib menyertakan ?token=... sama.
define('API_TOKEN', '');
