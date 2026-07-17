# Akademi — Backend MySQL

Backend modul **Akademi** (`deploy/akademi/`). Pola sama dengan modul lain:
1 baris per record, sumber kebenaran di kolom `data`, penjaga bentrok per-baris.

## KENAPA MODUL INI PALING BUTUH DATABASE

Berbeda dari Marketing/Konten yang datanya di Apps Script, **Akademi tidak
punya server sama sekali**. Sinkron Apps Script tersedia di menu *Sinkronisasi
& Backup*, tapi **tidak pernah dipasang** (`syncUrl` kosong, status
"Belum terhubung"). Artinya sebelum ini:

- **Data hanya di localStorage browser tiap kru.** Progress belajar Rizki ada
  di browser Rizki, punya Cindy di browser Cindy — tidak pernah bertemu.
- **Hapus cache browser = progress kru itu HILANG**, tanpa cadangan apa pun.
- **Admin tidak pernah bisa melihat progress tim yang sebenarnya** — halaman
  "Progress Tim" cuma menampilkan isi browser yang sedang dipakai.

Backend ini menutup ketiganya.

## Isi folder

| File | Fungsi |
|---|---|
| `config.php` | **Satu-satunya yang perlu diedit** — kredensial MySQL (password sudah diisi) |
| `schema.sql` | 8 tabel (jalankan sekali) |
| `lib_akademi_mysql.php` | Logika. Tidak perlu disentuh |
| `api.php` | Endpoint (getAll / saveAll / stats / ping) |
| `config.sample.php` | Contoh tanpa password (yang masuk repo) |

## Dua bentuk data yang ditangani khusus

Modul ini beda dari yang lain, jadi ada penanganan tersendiri. **Frontend tidak
perlu tahu** — `getAll` merakit ulang persis bentuk aslinya.

**1. `progress` & `progProg` = MAP BERSARANG, bukan daftar ber-id**

```
progress[userId][materialId]            = {done, score, at}
progProg[userId][programId][materialId] = {done, score, at}
```

Di DB dipecah jadi baris dengan PRIMARY KEY gabungan. **Inilah nilai terbesar
pindah ke database** — laporan jadi bisa dijawab SQL:

```sql
-- berapa kru sudah LULUS kuis onboarding?
SELECT COUNT(*) FROM progress p JOIN materials m ON m.id = p.material_id
WHERE p.material_id = 'm_quiz_onb' AND p.score >= m.passing;
```

Sebelumnya jawaban itu harus dibaca dari blob JSON satu per satu — dan cuma
berlaku untuk browser yang sedang dipakai.

**2. `activity` tidak punya id**

Barisnya cuma `{ts, userId, action, detail}`. Id dibuat backend dari **sidik
jari isinya** (SHA1). Dengan `INSERT IGNORE`, aplikasi boleh mengirim ulang
seluruh daftar tanpa menggandakan baris.

## Reserved word MySQL — dihindari

| Aplikasi | Kolom DB | Alasan |
|---|---|---|
| `division` | `divisi` | `div` bermasalah, konsisten dgn modul lain |
| `type` | `kind` | lebih jelas & aman |

## Langkah pasang di Rumahweb (cPanel)

1. **Buat database + user** — cPanel → MySQL Databases → DB `db_akademi`
   (jadi `lakk5493_db_akademi`), user `akademi` + password, Add User to
   Database → ALL PRIVILEGES. Password harus **sama dengan `DB_PASS` di
   `config.php`** (buka file itu untuk melihatnya).
2. **Buat tabel** — phpMyAdmin → pilih `lakk5493_db_akademi` → tab SQL →
   tempel `schema.sql` → Go. Harus jadi **8 tabel**.
3. **Upload folder** ke `public_html/office/akademi-api-mysql/`.
4. **Uji** — `.../akademi-api-mysql/api.php?action=stats` harus `ok:true`.

## Yang sudah diuji

Dijalankan ke MySQL 8.1 memakai **backup asli dari browser** (bukan data
karangan) — **38 pemeriksaan, semua lulus**:

- 36 kru, 6 divisi, 13 materi, 1 program, 13 aktivitas masuk utuh.
- Isi materi yang rumit kembali apa adanya: 5 pertanyaan kuis + kunci jawaban,
  10 langkah SOP, `menu{}` bersarang, `division[]` jamak, body modul panjang.
- `progress`/`progProg` bolak-balik map↔baris tanpa berubah bentuk.
- Laporan SQL benar: 2 kru mengerjakan kuis, hanya 1 yang lulus (score ≥ passing).
- Kiriman kosong tidak menghapus materi/kru/progress.
- `activity` append-only & tidak menggandakan saat dikirim ulang.
- Penjaga bentrok menolak kiriman basi.

**Belum diuji:** jalannya di Rumahweb, dan penyambungan ke frontend.

## BELUM tersambung ke frontend

`deploy/akademi/index.html` masih menyimpan ke localStorage. Menyambungkannya
dikerjakan terpisah supaya bisa diuji sebelum menggantikan yang dipakai kru.
