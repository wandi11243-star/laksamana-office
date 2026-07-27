# Marketing / CRM — Backend MySQL

Backend modul **Marketing** (`deploy/marketing/`). Pengganti Google Apps Script.
Pola sama dengan `reservasi-mysql/` & `event-mysql/`: 1 baris per record, sumber
kebenaran di kolom `data` (JSON utuh), penjaga `updated_at` per-baris.

> **Mulai dari kosong.** Data lama di Apps Script TIDAK dimigrasi (sesuai
> keputusan). Sheet lama tetap utuh sebagai arsip, jadi kalau nanti berubah
> pikiran masih bisa ditarik.

## Isi folder

| File | Fungsi |
|---|---|
| `config.php` | **Satu-satunya yang perlu diedit** — kredensial MySQL (password sudah diisi) |
| `schema.sql` | 12 tabel (jalankan sekali) |
| `lib_marketing_mysql.php` | Logika. Tidak perlu disentuh |
| `api.php` | Endpoint (getAll / saveAll / stats / ping) |
| `config.sample.php` | Contoh tanpa password (yang masuk repo) |

## Perlindungan anti-timpa (dua lapis)

Ini jawaban atas masalah "dua kru pilih tempat bersamaan, yang terakhir menimpa":

1. **`baseUpdatedAt` — penjaga bentrok.** Klien ikut mengirim versi baris yang
   dia pegang saat mulai edit. Kalau server sudah lebih baru (orang lain
   menyimpan duluan), baris itu **DITOLAK dan dilaporkan** di `bentrok[]`, bukan
   ditimpa. saveAll tetap `ok:true` — perubahan lain yang tidak bertabrakan
   tetap tersimpan. **Aplikasi wajib menampilkan `bentrok[]` ke user.**
2. **`updated_at` — penjaga urutan.** Baris yang tidak diubah klien capnya tetap
   lama, jadi tidak menimpa baris server yang lebih baru.

Beda dengan Apps Script lama yang mengunci SELURUH database (`_rev`): dua kru
yang mengedit event BERBEDA dulu saling ditolak; sekarang keduanya tersimpan.

## Langkah pasang di Rumahweb (cPanel)

1. **Buat database + user** — cPanel → MySQL Databases → DB `db_marketing`
   (jadi `lakk5493_db_marketing`), user `marketing` + password, Add User to
   Database → ALL PRIVILEGES. Password harus sama dengan `DB_PASS` di `config.php`.
2. **Buat tabel** — phpMyAdmin → pilih `lakk5493_db_marketing` → tab SQL →
   tempel `schema.sql` → Go. Harus jadi **12 tabel**.
3. **Upload folder** ke `public_html/office/marketing-api-mysql/`.
   (Jangan ikut-upload `config.local.php` kalau sempat dibuat untuk tes lokal.
   `.user.ini` HARUS ikut — lihat batas unggahan di bawah.)
4. **Uji** — `.../marketing-api-mysql/api.php?action=stats` harus `ok:true`,
   12 tabel bernilai 0.
5. **Alihkan frontend** — di `deploy/marketing/index.html`, ganti backend dari
   `WEB_APP_URL` (Apps Script) ke `API_URL` MySQL. (Langkah ini BELUM dilakukan
   — lihat catatan di bawah.)

## Batas unggahan berkas

Surat Penawaran boleh sampai **40MB** (lampiran event & bukti transfer tetap
8MB, dijaga di frontend).

**Unggahannya BERTAHAP** (`action=uploadChunk`): frontend memotong berkas jadi
~2MB per permintaan dan `save_receipt_chunk()` menyambungnya di server. Ini
bukan sekadar kerapian — mengirim berkas besar sekaligus tidak bisa diandalkan
di shared hosting:

* base64 membengkakkan ukuran ~33%, jadi 40MB berkas = ~54MB body;
* `post_max_size` bawaan PHP cuma 8M, dan begitu body melewatinya PHP
  **membuang seluruh isinya sebelum `api.php` sempat jalan** — batas yang
  tidak bisa diubah dari kode karena bertipe `PHP_INI_PERDIR`;
* sebagian host juga menolak POST besar di level web server (HTTP 413),
  bahkan sebelum PHP tersentuh.

Dengan dipotong, tiap permintaan hanya ~2,7MB sehingga **tetap jalan walau
konfigurasi server tidak pernah diubah**. `.user.ini` di folder ini menaikkan
`post_max_size`/`memory_limit` sebagai cadangan (dan mempercepat unggahan
lewat jalur satu-tembak `uploadReceipt` yang masih dipakai lampiran lain), tapi
sudah **tidak wajib** untuk Surat Penawaran. Kalau server memakai mod_php,
`.user.ini` memang diabaikan — dan itu tidak lagi jadi masalah.

Potongan sementara ditulis ke `receipts_tmp/` dan dihapus begitu berkas
tersambung; unggahan yang ditinggal di tengah jalan dibersihkan setelah 24 jam.
Folder itu di luar jangkauan GC lampiran, jadi tidak saling mengganggu.

Kalau unggahan masih gagal, pesan galat di aplikasi sekarang menyebut sebabnya
apa adanya — status HTTP dan cuplikan balasan server, bukan "Unexpected token".

## Yang sudah diuji

Dijalankan ke MySQL 8.1 sungguhan — **34 pemeriksaan, semua lulus**:
round-trip utuh (termasuk `detail` 144-field & nilai non-string), penjaga
bentrok dua arah (kerja orang lain tidak tertimpa, lalu berhasil setelah muat
ulang), dua kru baris berbeda sama-sama masuk, kiriman kosong tidak
mengosongkan tabel, `activities` append-only, kunci top-level baru tidak hilang.

**Belum diuji:** jalannya di Rumahweb, dan tampilan di browser sungguhan.

## BELUM tersambung ke frontend

`deploy/marketing/index.html` **masih memakai Apps Script**. Menyambungkannya
perlu: ganti alamat backend + tambahkan `baseUpdatedAt` pada baris yang diubah +
tampilkan `bentrok[]` ke user + cap `updatedAt`. Dikerjakan terpisah supaya
bisa diuji sebelum menggantikan yang live.
