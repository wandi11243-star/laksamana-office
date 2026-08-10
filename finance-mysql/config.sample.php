<?php
/************************************************************************
 * FINANCE LAKSAMANA — Konfigurasi (Kas Kecil)
 * ---------------------------------------------------------------------
 * cPanel > MySQL Databases: buat database + user, lalu "Add User to
 * Database" (ALL PRIVILEGES). Salin kredensialnya ke bawah ini.
 *
 * DATABASE SENDIRI, terpisah dari db_kompas. Modul Finance memang membaca
 * omset dari kompas-api-mysql, tapi Kas Kecil tidak ada hubungannya dengan
 * data itu — dan menaruhnya di database yang sama berarti satu restore
 * cadangan kas kecil ikut memundurkan seluruh omset perusahaan.
 *
 * Berisi password — sudah di-ignore lewat .gitignore di folder ini.
 ************************************************************************/
define('DB_HOST', '127.0.0.1');
define('DB_PORT', 3306);
define('DB_NAME', 'lakk5493_db_finance');   // di cPanel diketik "db_finance"
define('DB_USER', 'lakk5493_finance');      // di cPanel diketik "finance"
define('DB_PASS', 'ISI_PASSWORD_DI_SINI');
define('DB_CHARSET', 'utf8mb4');

// Ikut dibalas ?action=ping — satu-satunya cara cepat memastikan zip dev
// tidak salah terpasang di produksi.
define('ENV_LABEL', 'produksi');   // dev: 'dev'

define('API_TOKEN', '');
