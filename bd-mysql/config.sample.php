<?php
/************************************************************************
 * BD OS LAKSAMANA MUDA — Konfigurasi (CONTOH)
 * ---------------------------------------------------------------------
 * SATU-SATUNYA file yang perlu kamu edit. File logika tidak perlu disentuh.
 *
 * PENTING — ADA DUA SITUS, DUA DATABASE, DUA config.php BERBEDA:
 *
 *   office.laksamanamuda.id (branch main)
 *     -> DB_NAME 'lakk5493_db_bd'       (data asli, dipakai kru)
 *
 *   dev.laksamanamuda.id (branch develop)
 *     -> DB_NAME 'lakk5493_db_dev_bd'   (salinan untuk coba-coba)
 *
 * File index.html-nya SAMA di kedua situs — yang membedakan hanya config.php
 * ini. Frontend memanggil API lewat path RELATIF (`../bd-api-mysql/api.php`),
 * jadi tiap situs otomatis memakai API + database miliknya sendiri tanpa
 * perlu cabang kode.
 *
 * JANGAN PERNAH mengisi config.php di dev dengan nama database produksi:
 * coba-coba di dev akan langsung mengubah data asli kru.
 *
 * Di repo sudah tersedia keduanya, tinggal isi passwordnya:
 *   config.php      -> produksi (upload apa adanya)
 *   config.dev.php  -> dev (upload, lalu RENAME jadi config.php di server)
 *
 * CARA DAPAT KREDENSIAL DI RUMAHWEB (cPanel):
 *   1. cPanel > "MySQL Databases".
 *   2. Buat database BARU, mis. ketik "db_bd" -> jadi "lakk5493_db_bd".
 *      >>> Database sendiri, JANGAN menumpang database modul lain. <<<
 *      Nama tabel di sini (tasks, projects, people) umum dipakai; menumpang
 *      di database Event/Marketing berisiko menabrak tabel yang sudah ada.
 *   3. Buat user MySQL + password, lalu "Add User to Database" (ALL PRIVILEGES).
 *   4. Salin nama db, user, dan password ke bawah ini.
 *
 * CATATAN: config.php & config.dev.php (berisi password) di-ignore lewat
 * .gitignore. File contoh inilah yang masuk repo.
 ************************************************************************/

define('DB_HOST', '127.0.0.1');
define('DB_PORT', 3306);

// GANTI sesuai situs tempat file ini dipasang — lihat penjelasan di atas.
define('DB_NAME', 'lakk5493_db_bd');   // dev: lakk5493_db_dev_bd
define('DB_USER', 'lakk5493_bd');      // dev: lakk5493_dev_bd
define('DB_PASS', 'ISI_PASSWORD_DI_SINI');
define('DB_CHARSET', 'utf8mb4');

/* Penanda server. WAJIB berbeda antara office dan dev — inilah yang membuat
   zip tertukar langsung ketahuan lewat ?action=ping. */
define('ENV_LABEL', 'produksi');   // dev: 'dev'

// Kosongkan = terbuka. Kalau diisi, request wajib menyertakan ?token=... sama.
define('API_TOKEN', '');
