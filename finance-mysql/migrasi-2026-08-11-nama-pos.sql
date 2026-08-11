-- Migrasi Kas Kecil: bakukan nama pos pembayaran (11 Agustus 2026)
--
-- SEBAB. Dua dari tiga pos bernama "Pengajuan Pembayaran (PO)" dan "Pengajuan
-- Pembayaran" — beda satu kurung. Di dropdown Input Transaksi keduanya terbaca
-- sama, dan satu-satunya cara tahu mana yang PO adalah membuka halaman Pos &
-- Kategori. Untuk data uang, dua pilihan yang tidak bisa dibedakan mata adalah
-- undangan salah pos, dan salah pos baru ketahuan saat saldo dicocokkan.
--
-- YANG DILAKUKAN: hanya mengganti NAMA. id tidak disentuh, jadi seluruh baris
-- kk_trx_baris yang sudah menunjuk pos ini tetap utuh dan saldo historis tidak
-- bergerak satu rupiah pun.
--
-- Jalankan SEKALI di phpMyAdmin database finance (dev maupun produksi).
-- Berkas migrasi TIDAK ikut ter-deploy — ini pekerjaan tangan, dan kalau
-- dilewat gejalanya cuma nama lama yang bertahan, bukan galat.
--
-- Aman dijalankan dua kali: yang dicari nama lama, dan sesudah migrasi nama itu
-- sudah tidak ada lagi sehingga UPDATE kedua tidak mengenai baris mana pun.

UPDATE `kk_pos` SET `nama` = 'Purchase Order',     `urut` = 20
  WHERE `nama` = 'Pengajuan Pembayaran (PO)';

UPDATE `kk_pos` SET `nama` = 'Pengajuan Terpisah', `urut` = 30
  WHERE `nama` = 'Pengajuan Pembayaran';

UPDATE `kk_pos` SET `urut` = 10 WHERE `nama` = 'Kas Kecil';

-- Periksa hasilnya: harus tepat tiga baris, urut 10/20/30.
-- SELECT `id`,`nama`,`urut`,`aktif` FROM `kk_pos` ORDER BY `urut`;
