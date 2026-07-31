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
