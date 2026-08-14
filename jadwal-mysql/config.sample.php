<?php
/************************************************************************
 * JADWAL SHIFT LAKSAMANA — Konfigurasi
 * ---------------------------------------------------------------------
 * cPanel > MySQL Databases: buat database + user, lalu "Add User to
 * Database" (ALL PRIVILEGES). Salin kredensialnya ke bawah ini, simpan
 * sebagai config.php, lalu unggah MANUAL ke /jadwal-api-mysql/ di server.
 *
 * Workflow FTP sengaja TIDAK mengirim config*.php (lihat exclude di
 * .github/workflows/): dev dan produksi menunjuk database yang berbeda,
 * dan file ini berisi password.
 ************************************************************************/
/* Nama di bawah mengikuti pola yang SUDAH dipakai semua modul lain di akun
 * cPanel ini (kompas, marketing, konten, akademi, account, …):
 *
 *   produksi   DB_NAME lakk5493_db_jadwal       DB_USER lakk5493_jadwal
 *   dev        DB_NAME lakk5493_db_dev_jadwal   DB_USER lakk5493_dev_jadwal
 *
 * Awalan `lakk5493_` DITAMBAHKAN SENDIRI oleh cPanel. Di kotak isian cPanel
 * yang diketik hanya bagian belakangnya — "db_jadwal" dan "jadwal" (atau
 * "db_dev_jadwal" dan "dev_jadwal" untuk dev). Kalau Anda terlanjur memberi
 * nama lain saat membuatnya, yang benar adalah nama di cPanel: sesuaikan dua
 * baris di bawah, jangan mengganti nama database-nya.
 */
define('DB_HOST', '127.0.0.1');
define('DB_PORT', 3306);
define('DB_NAME', 'lakk5493_db_jadwal');   // dev: lakk5493_db_dev_jadwal
define('DB_USER', 'lakk5493_jadwal');      // dev: lakk5493_dev_jadwal
define('DB_PASS', 'ISI_PASSWORD_DI_SINI');
define('DB_CHARSET', 'utf8mb4');

// Ikut dibalas ?action=ping — satu-satunya cara cepat memastikan config dev
// tidak salah terpasang di produksi.
define('ENV_LABEL', 'produksi');   // dev: 'dev'

define('API_TOKEN', '');

/* ---------------------------------------------------------------------
   ACCOUNT_API_URL — BIASANYA TIDAK PERLU DIISI.

   Sejak modul ini punya penjaga sendiri ("jadwal divisi ini disusun
   head-nya", ditegakkan di server), tiap permintaan membawa token sesi
   Office dan backend menanyakannya balik ke API akun (action=whoami),
   server-ke-server. Alamatnya DITURUNKAN SENDIRI dari host yang sedang
   melayani, jadi dev bertanya ke akun dev dan produksi ke akun produksi
   tanpa bisa tertukar — dan tidak ada satu baris pun yang harus disunting
   di cPanel saat versi ini mendarat.

   Isi HANYA kalau API akun suatu saat pindah ke domain lain. Salah isi di
   sini tidak menimbulkan galat: head dev akan diverifikasi memakai akun
   produksi, dan sebaliknya.

   define('ACCOUNT_API_URL', 'https://team.laksamanamuda.id/account-api-mysql/api.php');
   --------------------------------------------------------------------- */
