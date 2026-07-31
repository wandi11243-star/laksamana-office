<?php
/************************************************************************
 * LAKSAMANA MUDA TICKETING (situs customer) — Konfigurasi
 * ---------------------------------------------------------------------
 * DATABASE-NYA SAMA PERSIS DENGAN EMS (event-api-mysql). Itu memang
 * disengaja: kursi yang dijual di situs ini adalah kursi yang sama dengan
 * yang digambar di denah EMS, dan tiket yang lahir di sini harus bisa
 * di-scan di menu Check-In EMS. Dua database berarti dua kebenaran, dan
 * kursi yang sama akan terjual dua kali.
 *
 * Jadi: salin DB_NAME / DB_USER / DB_PASS PERSIS dari
 * event-api-mysql/config.php di server yang sama.
 *
 * Yang TIDAK boleh sama: file ini berisi kunci rahasia Xendit, sedangkan
 * config EMS tidak. Karena itu foldernya dipisah, bukan menumpang di
 * event-api-mysql.
 ************************************************************************/

// ---------- KONEKSI DATABASE (samakan dengan event-api-mysql) ----------
define('DB_HOST', '127.0.0.1');
define('DB_PORT', 3306);
define('DB_NAME', 'lakk5493_db_ems');      // SAMA dengan EMS
define('DB_USER', 'lakk5493_ems');         // SAMA dengan EMS
define('DB_PASS', 'ISI_PASSWORD_DI_SINI'); // SAMA dengan EMS
define('DB_CHARSET', 'utf8mb4');

// ---------- PENANDA SERVER ----------
/* WAJIB berbeda antara produksi dan dev. Inilah yang membuat "kok tiket
   yang dibeli di dev muncul di produksi" langsung ketahuan lewat ?action=ping,
   bukan setelah ada tamu yang ditolak di pintu. */
define('ENV_LABEL', 'produksi');           // dev memakai 'dev'

/* ==================== XENDIT ====================
   Ambil di dashboard Xendit → Settings → API Keys.

   PAKAI KUNCI TEST DULU DI DEV. Kunci live di server dev berarti tamu uji
   coba benar-benar ditagih, dan uangnya benar-benar masuk — kesalahan yang
   tidak bisa dibatalkan dengan git revert.

   XENDIT_SECRET  : Secret API key (diawali xnd_development_ / xnd_production_).
                    HANYA dipakai server. Jangan pernah ditaruh di HTML.
   XENDIT_CALLBACK: Callback Verification Token (Settings → Webhooks).
                    Dipakai memeriksa header x-callback-token pada webhook —
                    tanpa ini siapa pun yang tahu URL webhook bisa menandai
                    pesanan LUNAS tanpa membayar sepeser pun.
   ================================================================= */
define('XENDIT_SECRET',   'ISI_SECRET_KEY_XENDIT');
define('XENDIT_CALLBACK', 'ISI_CALLBACK_TOKEN_XENDIT');

/* Alamat situs customer — dipakai Xendit untuk memulangkan pembeli sesudah
   bayar, dan untuk menyusun tautan e-ticket. Tanpa garis miring di akhir. */
define('SITE_URL', 'https://laksamanamuda.id/ticketing');

/* ---------- ATURAN JUALAN ----------
   Biaya admin per tiket. Disamakan dengan yang dipakai kasir di EMS
   (doPurchase memakai 5000/tiket) supaya harga di situs dan di kasir tidak
   berbeda untuk kursi yang sama. */
define('ADMIN_FEE', 5000);

/* Berapa lama kursi ditahan setelah dipilih, dalam menit. Setelah lewat,
   kursinya dilepas sendiri dan boleh diambil orang lain. */
define('HOLD_MINUTES', 10);

/* Batas lembar tiket reguler per kategori dalam satu pesanan. Penahannya bukan
   kesopanan: pesanan Pending ikut mengurangi sisa kuota sampai invoicenya
   kedaluwarsa, jadi satu orang yang memesan 500 lembar lalu tidak membayar
   bisa mengunci penjualan selama sejam. */
define('MAX_PER_PESANAN', 10);

/* ==================== EMAIL (SMTP) ====================
   Dipakai mengirim e-ticket. Memakai akun email domain sendiri, BUKAN mail()
   bawaan PHP: kiriman mail() tidak terautentikasi dan sering mendarat di spam,
   dan e-ticket yang tidak terbaca sama saja dengan yang tidak terkirim.

   Nilainya ada di cPanel -> Email Accounts -> Connect Devices ->
   "Mail Client Manual Settings".

   SMTP_PORT 465 = SSL langsung (paling umum di cPanel).
   SMTP_PORT 587 = mulai polos lalu STARTTLS. Keduanya didukung.

   Password ditempel di antara kutip TUNGGAL supaya karakter seperti $ tidak
   ditafsirkan PHP sebagai variabel.
   ================================================================= */
define('SMTP_HOST', 'mail.laksamanamuda.id');
define('SMTP_PORT', 465);
define('SMTP_USER', 'tiket@laksamanamuda.id');
define('SMTP_PASS', 'ISI_PASSWORD_EMAIL');
define('SMTP_FROM_NAME', 'Laksamana Muda Ticketing');
