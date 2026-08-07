<?php
/************************************************************************
 * ABSENSI LAKSAMANA — Konfigurasi DEV (contoh)
 * ---------------------------------------------------------------------
 * cPanel > MySQL Databases: buat database + user, lalu "Add User to
 * Database" (ALL PRIVILEGES). Salin kredensialnya ke bawah ini, simpan
 * sebagai config.php, lalu unggah MANUAL ke /absensi-api-mysql/ di server.
 *
 * Workflow FTP sengaja TIDAK mengirim config*.php: dev dan produksi
 * menunjuk database yang berbeda, dan berkas ini berisi password.
 ************************************************************************/
/* Awalan `lakk5493_` DITAMBAHKAN SENDIRI oleh cPanel. Di kotak isian cPanel
 * yang diketik hanya bagian belakangnya — "db_absensi" dan "absensi" (atau
 * "db_dev_absensi" dan "dev_absensi" untuk dev).
 *
 *   produksi   DB_NAME lakk5493_db_absensi       DB_USER lakk5493_absensi
 *   dev        DB_NAME lakk5493_db_dev_absensi   DB_USER lakk5493_dev_absensi
 */
define('DB_HOST', '127.0.0.1');
define('DB_PORT', 3306);
define('DB_NAME', 'lakk5493_db_dev_absensi');
define('DB_USER', 'lakk5493_dev_absensi');
define('DB_PASS', '&_nN;i#SlBAx%H~p');
define('DB_CHARSET', 'utf8mb4');

// Ikut dibalas ?action=ping — satu-satunya cara cepat memastikan config dev
// tidak salah terpasang di produksi.
define('ENV_LABEL', 'dev');

/* ---------------------------------------------------------------------
 * ALAMAT MODUL TETANGGA
 * ---------------------------------------------------------------------
 * KOSONGKAN SAJA kecuali salah satunya dipindah ke domain lain. Kalau
 * kosong, alamatnya diturunkan sendiri dari situs yang sedang melayani —
 * jadi dev otomatis bertanya ke jadwal/dw/akun dev, dan produksi ke
 * produksi, TANPA perlu disetel per situs dan tanpa bisa tertukar.
 *
 * Salah setel di sini adalah jenis kesalahan yang tidak menimbulkan galat:
 * absensi dev akan menghitung telat terhadap jadwal PRODUKSI, dan semua
 * angkanya terlihat wajar.
 * ------------------------------------------------------------------- */
define('ACCOUNT_API_URL', '');   // mis. 'https://team.laksamanamuda.id/account-api-mysql/api.php'
define('JADWAL_API_URL',  '');   // mis. 'https://team.laksamanamuda.id/jadwal-api-mysql/api.php'
define('DW_API_URL',      '');   // mis. 'https://team.laksamanamuda.id/dw-api-mysql/api.php'
