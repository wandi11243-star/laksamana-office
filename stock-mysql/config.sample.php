<?php
/************************************************************************
 * STOCK LAKSAMANA MUDA (purchasing + ordering) — Konfigurasi
 * ---------------------------------------------------------------------
 * SATU-SATUNYA file yang perlu kamu edit.
 *
 * PENTING — ADA DUA SITUS, DUA DATABASE, DUA config.php BERBEDA:
 *
 *   office.laksamanamuda.id (branch main)
 *     -> DB_NAME 'lakk5493_db_stock'   (data asli, dipakai kru)
 *
 *   dev.laksamanamuda.id (branch develop)
 *     -> DB_NAME 'lakk5493_db_dev_stock'   (salinan untuk coba-coba)
 *
 * File index.html-nya SAMA di kedua situs — yang membedakan hanya
 * config.php ini. Frontend memanggil API lewat path RELATIF
 * (`../../stock-api-mysql/...`), jadi tiap situs otomatis memakai
 * API + database miliknya sendiri tanpa perlu cabang kode.
 *
 * JANGAN PERNAH mengisi config.php di dev dengan nama database produksi:
 * coba-coba di dev akan langsung mengubah data asli kru.
 *
 * CARA DAPAT KREDENSIAL DI RUMAHWEB (cPanel):
 *   1. cPanel > "MySQL Databases".
 *   2. Buat database (mis. "db_stock" -> jadi "lakk5493_db_stock").
 *   3. Buat user MySQL + password, lalu "Add User to Database" (ALL PRIVILEGES).
 *   4. Salin nama db, user, dan password ke bawah ini.
 *
 * CATATAN: config.php (berisi password) di-ignore lewat .gitignore.
 * File contoh inilah yang masuk repo.
 ************************************************************************/

define('DB_HOST', '127.0.0.1');
define('DB_PORT', 3306);

// GANTI sesuai situs tempat file ini dipasang — lihat penjelasan di atas.
define('DB_NAME', 'lakk5493_db_stock');   // dev: lakk5493_db_dev_stock
define('DB_USER', 'lakk5493_stock');      // dev: lakk5493_dev_stock
define('DB_PASS', 'ISI_PASSWORD_DI_SINI');
define('DB_CHARSET', 'utf8mb4');

/* Label lingkungan. Muncul di balasan ?action=ping supaya kamu bisa
   memastikan situs mana bicara ke database mana — tanpa ini, salah pasang
   config baru ketahuan setelah data produksi terlanjur berubah. */
define('ENV_LABEL', 'produksi');   // dev: 'dev'

// Kosongkan = terbuka. Kalau diisi, request wajib menyertakan ?token=... sama.
define('API_TOKEN', '');

/* ===================================================================
 * IDENTITAS PEMANGGIL (dipakai pembatasan per tim)
 * -------------------------------------------------------------------
 * API ini aslinya hanya dijaga API_TOKEN — satu token yang sama untuk
 * semua orang. Server jadi tidak tahu SIAPA yang memanggil, sehingga
 * aturan "tim Bar hanya melihat data Bar" tidak mungkin ditegakkan di
 * server; paling jauh cuma bisa disembunyikan di layar, dan itu bukan
 * pembatasan.
 *
 * Sekarang browser ikut mengirim token sesi Office, dan endpoint ini
 * menanyakannya balik ke API akun (action=whoami) untuk tahu siapa
 * pemiliknya dan apa timnya.
 *
 * ACCOUNT_API_URL: alamat api.php milik account-api-mysql DI SITUS YANG
 * SAMA. Dev menunjuk dev, produksi menunjuk produksi — kalau tertukar,
 * kru dev akan diverifikasi memakai akun produksi.
 */
define('ACCOUNT_API_URL', 'https://office.laksamanamuda.id/account-api-mysql/api.php');
// dev: 'https://dev.laksamanamuda.id/account-api-mysql/api.php'

/* Saklar pembatasan per tim. Sengaja MATI secara bawaan.
 *
 * Menyalakannya sebelum seluruh kru punya token (yaitu sebelum Office versi
 * baru terpasang DAN mereka login ulang) akan membuat daftar tampak kosong
 * untuk semua orang — kelihatan seperti data hilang, padahal cuma ditolak.
 * Nyalakan setelah memastikan whoami menjawab dengan benar.
 *
 * Saat menyala: admin modul melihat semua; kru melihat timnya sendiri; kru
 * yang timnya belum diisi tidak melihat apa pun (pilihan sadar — lihat
 * catatan di pur_tim_pemanggil).
 */
define('BATAS_PER_TIM', false);
