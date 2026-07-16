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
   (Jangan ikut-upload `config.local.php` kalau sempat dibuat untuk tes lokal.)
4. **Uji** — `.../marketing-api-mysql/api.php?action=stats` harus `ok:true`,
   12 tabel bernilai 0.
5. **Alihkan frontend** — di `deploy/marketing/index.html`, ganti backend dari
   `WEB_APP_URL` (Apps Script) ke `API_URL` MySQL. (Langkah ini BELUM dilakukan
   — lihat catatan di bawah.)

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
