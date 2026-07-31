-- ======================================================================
-- LAKSAMANA MUDA TICKETING — tabel tambahan
-- Dijalankan SEKALI di database yang SAMA dengan EMS (event-api-mysql).
--
-- Hanya SATU tabel baru. Semua yang lain (events, ticket_classes, seats,
-- orders, tickets, checkins) sudah ada milik EMS dan sengaja dipakai
-- bersama — itulah yang membuat kedua sistem terintegrasi, bukan sekadar
-- saling kirim data.
-- ======================================================================

/* ---------------------------------------------------------------------
   KENAPA KUNCI KURSI PUNYA TABEL SENDIRI, BUKAN seats.status='Locked'
   ---------------------------------------------------------------------
   EMS menyimpan dengan `saveAll`: browser kru mengirim SELURUH koleksi
   seats sekaligus. Kalau kunci sementara ditulis ke seats.status, maka
   satu penyimpanan dari EMS — yang state-nya dimuat sebelum ada pembeli —
   akan menghapus kunci itu, dan kursi yang sedang di halaman pembayaran
   customer mendadak bisa diambil orang lain.

   Sebaliknya juga berbahaya: kunci dari situs customer akan ikut terbawa
   ke state EMS dan tampil sebagai kursi "Locked" yang tidak pernah bisa
   dibersihkan kru.

   Tabel terpisah tidak pernah disentuh saveAll. Kunci hidup di sini,
   penjualan permanen tetap di seats.status='Sold' + baris tickets —
   dan itu yang dilihat EMS.
   --------------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS seat_holds (
  id          VARCHAR(64)  NOT NULL PRIMARY KEY,
  event_id    VARCHAR(64)      NULL,
  seat_id     VARCHAR(64)      NULL,
  hold_token  VARCHAR(64)      NULL,   -- milik satu sesi pembeli
  order_id    VARCHAR(64)      NULL,   -- terisi saat lanjut ke pembayaran
  expires_at  BIGINT       NOT NULL DEFAULT 0,   -- epoch ms
  created_at  BIGINT       NOT NULL DEFAULT 0,
  -- Satu kursi hanya boleh ditahan satu kali. Ini penjaga di level DATABASE:
  -- dua pembeli yang menekan "pilih" pada detik yang sama tidak mungkin
  -- dua-duanya berhasil, sekalipun aplikasinya lengah.
  UNIQUE KEY uq_sh_seat (seat_id),
  KEY idx_sh_event (event_id),
  KEY idx_sh_token (hold_token),
  KEY idx_sh_exp   (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/* ---------------------------------------------------------------------
   AKUN PEMBELI
   ---------------------------------------------------------------------
   Dipisah dari tabel `users` milik Office: itu akun KRU, dengan role dan
   hak akses modul. Mencampur pembeli ke sana berarti satu kebocoran di
   situs publik menyentuh daftar pegawai — dan tiap kolom baru untuk
   pembeli ikut membebani tabel yang dipakai seluruh Office.

   email UNIQUE dan disimpan huruf kecil: "Budi@x.com" dan "budi@x.com"
   adalah orang yang sama, dan membiarkan keduanya terdaftar berarti dua
   akun memperebutkan riwayat tiket yang sama.
   --------------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS tix_users (
  id         VARCHAR(64)  NOT NULL PRIMARY KEY,
  email      VARCHAR(191)     NULL,
  pass_hash  VARCHAR(255)     NULL,
  name       VARCHAR(255)     NULL,
  phone      VARCHAR(32)      NULL,
  created_at BIGINT       NOT NULL DEFAULT 0,
  UNIQUE KEY uq_tu_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/* Sesi disimpan di tabel, bukan PHP session: backend ini dipanggil dari
   halaman yang bisa berada di domain berbeda, dan cookie session PHP tidak
   selalu ikut terkirim di situ. Token acak jauh lebih sederhana daripada
   menambal cookie lintas domain. */
CREATE TABLE IF NOT EXISTS tix_sessions (
  token      VARCHAR(64)  NOT NULL PRIMARY KEY,
  user_id    VARCHAR(64)      NULL,
  expires_at BIGINT       NOT NULL DEFAULT 0,
  created_at BIGINT       NOT NULL DEFAULT 0,
  KEY idx_ts_user (user_id),
  KEY idx_ts_exp  (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/* Token reset password. Tabel sendiri, bukan menumpang tix_sessions: sesi
   memberi AKSES, token reset memberi HAK MENGGANTI PASSWORD — dua kewenangan
   berbeda yang tidak boleh saling tertukar kalau salah satu bocor.
   Sekali pakai (dihapus setelah dipakai) dan berumur pendek. */
CREATE TABLE IF NOT EXISTS tix_reset (
  token      VARCHAR(64)  NOT NULL PRIMARY KEY,
  user_id    VARCHAR(64)      NULL,
  expires_at BIGINT       NOT NULL DEFAULT 0,
  created_at BIGINT       NOT NULL DEFAULT 0,
  KEY idx_tr_user (user_id),
  KEY idx_tr_exp  (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
