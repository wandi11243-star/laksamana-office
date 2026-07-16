# Konten / Content Operations — Backend MySQL

Backend modul **Konten** (`deploy/konten/`). Pengganti Google Apps Script.
Pola sama dengan `marketing-mysql/`: 1 baris per record, sumber kebenaran di
kolom `data` (JSON utuh), penjaga bentrok per-baris.

> **Belum tersambung ke frontend.** `deploy/konten/index.html` masih memakai
> Apps Script. Backend ini bisa dipasang & diuji tanpa mengganggu yang live.

## Isi folder

| File | Fungsi |
|---|---|
| `config.php` | **Satu-satunya yang perlu diedit** — kredensial MySQL (password sudah diisi) |
| `schema.sql` | 15 tabel (jalankan sekali) |
| `lib_konten_mysql.php` | Logika. Tidak perlu disentuh |
| `api.php` | Endpoint (getAll / saveAll / stats / ping / uploadReceipt / receipt) |
| `config.sample.php` | Contoh tanpa password (yang masuk repo) |

## Model data

16 koleksi aplikasi dipetakan ke 15 tabel:

| Aplikasi | Tabel | Isi |
|---|---|---|
| `content` | `content` | **inti** — Idea→Posted, caption, script, checklist, approvals, metrics |
| `prodTasks` | `prod_tasks` | task produksi (todo/doing/done) |
| `campaigns` `brands` | `campaigns` `brands` | kampanye & brand |
| `kols` `visits` | `kols` `visits` | KOL/media partner + kunjungan |
| `ads` `adFunds` | `ads` `ad_funds` | iklan berbayar + top-up dana |
| `shootings` `assets` `bank` | idem | jadwal shooting, aset, bank ide/caption |
| `users` `notifs` | idem | kru & notifikasi |
| `logs` | `logs` | **append-only** — jejak audit tidak pernah hilang |
| `settings` `perms` `seeded` | `settings` | konfigurasi (1 blob JSON per kunci) |

**Kunci top-level baru** yang belum dikenal backend tetap disimpan (berawalan
`extra:`), jadi aplikasi boleh berkembang tanpa datanya diam-diam hilang.

## Reserved word MySQL — sudah dihindari

Beberapa nama field aplikasi adalah kata kunci MySQL dan **akan menggagalkan
pembuatan tabel** kalau dipakai apa adanya. Yang dipetakan ulang:

| Aplikasi | Kolom DB | Alasan |
|---|---|---|
| `division` | `divisi` | `div` bermasalah, konsisten dgn marketing |
| `read` | `seen` | `read` = reserved word |
| `type` | `kind` / `kol_type` | lebih jelas & aman |
| `for` | `for_user` | `for` = reserved word |

## Perlindungan anti-timpa

1. **`baseUpdatedAt`** — klien mengirim versi baris yang dia pegang. Kalau kru
   lain sudah menyimpan duluan, baris itu **DITOLAK & dilaporkan** di
   `bentrok[]`, bukan ditimpa. saveAll tetap `ok:true` — perubahan lain tetap
   tersimpan. **Aplikasi wajib menampilkan `bentrok[]` ke user.**
2. **`updated_at`** — baris yang tidak diubah capnya tetap lama, jadi tidak
   menimpa baris server yang lebih baru.

## File (aset/thumbnail)

Tidak masuk MySQL — disimpan di `DATA_DIR` (di luar web root), disajikan lewat
`api.php?action=receipt&key=...`. Pola sama seperti foto reservasi & bukti
transfer marketing. Berkas yatim dibersihkan otomatis tiap saveAll (dengan jeda
aman 1 jam untuk berkas yang baru diunggah).

## Langkah pasang di Rumahweb (cPanel)

1. **Buat database + user** — cPanel → MySQL Databases → DB `db_konten`
   (jadi `lakk5493_db_konten`), user `konten` + password, Add User to Database
   → ALL PRIVILEGES. Password harus **sama dengan `DB_PASS` di `config.php`**
   (buka file itu untuk melihatnya).
2. **Buat tabel** — phpMyAdmin → pilih `lakk5493_db_konten` → tab SQL → tempel
   `schema.sql` → Go. Harus jadi **15 tabel**.
3. **Upload folder** ke `public_html/office/konten-api-mysql/`.
   (Jangan ikut-upload `config.local.php` kalau sempat dibuat untuk tes lokal.)
4. **Uji** — `.../konten-api-mysql/api.php?action=stats` harus `ok:true`,
   15 tabel bernilai 0.

## Yang sudah diuji

Dijalankan ke MySQL 8.1 sungguhan — **43 pemeriksaan, semua lulus**:
seluruh 14 koleksi round-trip utuh, struktur bersarang content (caption,
hashtags, checklist, comments, prod{}, metrics{}) kembali apa adanya,
`publishRecord: null` tetap null, kolom inti benar-benar terisi, reserved word
aman, penjaga bentrok menolak kiriman basi, `logs` append-only, kiriman kosong
tidak mengosongkan tabel, kunci baru tidak hilang.

**Belum diuji:** jalannya di Rumahweb, dan penyambungan ke frontend.
