<?php
/************************************************************************
 * DAILY WORKER LAKSAMANA — Konfigurasi
 * ---------------------------------------------------------------------
 * cPanel > MySQL Databases: buat database + user, lalu "Add User to
 * Database" (ALL PRIVILEGES). Salin kredensialnya ke bawah ini, simpan
 * sebagai config.php, lalu unggah MANUAL ke /dw-api-mysql/ di server.
 *
 * Workflow FTP sengaja TIDAK mengirim config*.php (lihat exclude di
 * .github/workflows/): dev dan produksi menunjuk database yang berbeda,
 * dan file ini berisi password.
 ************************************************************************/
/* Nama di bawah mengikuti pola yang SUDAH dipakai semua modul lain di akun
 * cPanel ini (jadwal, kompas, marketing, account, …):
 *
 *   produksi   DB_NAME lakk5493_db_dw       DB_USER lakk5493_dw
 *   dev        DB_NAME lakk5493_db_dev_dw   DB_USER lakk5493_dev_dw
 *
 * Awalan `lakk5493_` DITAMBAHKAN SENDIRI oleh cPanel. Di kotak isian cPanel
 * yang diketik hanya bagian belakangnya — "db_dw" dan "dw" (atau "db_dev_dw"
 * dan "dev_dw" untuk dev).
 *
 * Password-nya ditulis di berkas ini LEBIH DULU, lalu ditempelkan apa adanya
 * saat membuat MySQL user di cPanel. Jangan menekan tombol Password
 * Generator milik cPanel — hasilnya akan berbeda dari yang tertulis di sini
 * dan koneksinya ditolak tanpa penjelasan.
 */
define('DB_HOST', '127.0.0.1');
define('DB_PORT', 3306);
define('DB_NAME', 'lakk5493_db_dw');   // dev: lakk5493_db_dev_dw
define('DB_USER', 'lakk5493_dw');      // dev: lakk5493_dev_dw
define('DB_PASS', 'ISI_PASSWORD_DI_SINI');
define('DB_CHARSET', 'utf8mb4');

// Ikut dibalas ?action=ping — satu-satunya cara cepat memastikan config dev
// tidak salah terpasang di produksi.
define('ENV_LABEL', 'produksi');   // dev: 'dev'

define('API_TOKEN', '');

/* ---------------------------------------------------------------------
   ACCOUNT_API_URL — BIASANYA TIDAK PERLU DIISI.

   Sejak modul ini punya penjaga sendiri, tiap permintaan membawa token sesi
   Office dan backend menanyakannya balik ke API akun (action=whoami),
   server-ke-server. Alamatnya DITURUNKAN SENDIRI dari host yang sedang
   melayani, jadi dev bertanya ke akun dev dan produksi ke akun produksi
   tanpa bisa tertukar — dan tidak ada satu baris pun yang harus disunting
   di cPanel saat versi ini mendarat.

   Isi HANYA kalau API akun suatu saat pindah ke domain lain. Salah isi di
   sini adalah jenis kesalahan yang tidak menimbulkan galat: kru dev akan
   diverifikasi memakai akun produksi, dan sebaliknya.

   define('ACCOUNT_API_URL', 'https://team.laksamanamuda.id/account-api-mysql/api.php');
   --------------------------------------------------------------------- */
