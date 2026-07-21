# HR / People OS — Backend MySQL

Backend modul **HR** (`deploy/hr/`). Menggantikan Apps Script yang dipakai
sekarang. Pola sama dengan modul lain: 1 baris per record, sumber kebenaran
di kolom `data` (JSON), kolom inti hanya untuk query.

## PERINGATAN ISI DATA — baca dulu

Database ini berisi data paling sensitif di seluruh sistem Office:

- `employees` — **PIN akses**, tanggal lahir, telepon, email 30 kru
- `violations` — riwayat pelanggaran & SP per orang
- `reviews`, `moods`, `suggestions` — penilaian dan suara kru (saran bisa anonim)

Jangan pernah mengekspor isi tabel ini ke repo, chat, atau layanan pihak
ketiga. `.gitignore` di folder ini sudah menolak `*.json`, `*.csv`, dan
`config.php`, tapi itu jaring pengaman terakhir — bukan pengganti kehati-hatian.

## BEDA PENTING dari modul lain: penjaga bentrok pakai `_rev`

Marketing/Konten/Akademi memakai penjaga **per-baris** (`baseUpdatedAt`).
HR memakai revisi **seluruh dokumen** (`_rev`), dan itu **sengaja dipertahankan**:

- Frontend HR sudah punya alur bentrok yang matang — modal *"Perubahan Tidak
  Tersimpan"*, badge sinkron, dan `refreshIfStale()` saat tab kembali aktif.
  Mengganti ke per-baris berarti membongkar semua itu tanpa keuntungan nyata
  untuk modul yang penggunanya sedikit (HRD + CEO).
- Modelnya **lebih galak**: dua orang menyunting kru BERBEDA tetap dianggap
  bentrok. Tapi tidak pernah menimpa kerja orang diam-diam, dan itu yang
  penting untuk data seperti SP dan nilai review.

Pengecekan `rev` + penulisan dijalankan dalam **satu transaksi** dengan
`SELECT ... FOR UPDATE` pada baris `meta`. Tanpa kunci itu, dua simpan
bersamaan bisa sama-sama membaca `rev=14`, sama-sama lolos, lalu yang
belakangan menimpa yang duluan — persis lubang yang mau ditutup.

## Isi folder

| File | Fungsi |
|---|---|
| `config.php` | **Satu-satunya yang perlu diedit** — kredensial MySQL (password sudah diisi) |
| `schema.sql` | 23 tabel (jalankan sekali) |
| `lib_hr_mysql.php` | Logika. Tidak perlu disentuh |
| `api.php` | Endpoint (getAll / saveAll / stats / ping) |
| `config.sample.php` | Contoh tanpa password (yang masuk repo) |

## Cara pasang di Rumahweb

1. **cPanel > MySQL Databases**
   - Database: ketik `db_hr` → jadi `lakk5493_db_hr`
   - User: ketik `hr` → jadi `lakk5493_hr`, isi password
   - **Add User to Database** → centang **ALL PRIVILEGES**
2. **cPanel > phpMyAdmin** → pilih `lakk5493_db_hr` → tab **SQL** →
   tempel seluruh isi `schema.sql` → **Go**. Aman dijalankan ulang
   (`CREATE TABLE IF NOT EXISTS`, dan `rev` tidak ikut direset).
3. **cPanel > File Manager** → masuk `public_html/` → **Upload**
   `hr-api-mysql.zip` → **Extract**. Hasil akhirnya:
   `public_html/hr-api-mysql/api.php`
4. Cek: buka `https://office.laksamanamuda.id/hr-api-mysql/api.php?action=ping`
   → harus muncul `{"ok":true,...}`

## Kontrak API

Sengaja dibuat **sama persis** dengan Apps Script lama, supaya frontend cukup
ganti URL tanpa ubah logika.

```
GET  ?action=ping    -> {ok:true, data:{time}}
GET  ?action=stats   -> {ok:true, data:{jumlah per tabel, _rev, _savedBy}}
GET  ?action=getAll  -> {ok:true, data:{...S..., _rev, _savedAt, _savedBy}}

POST {action:'saveAll', data:S, baseRev, by}
     -> {ok:true,  data:{rev}}                         diterima
     -> {ok:false, error:'conflict', savedBy, savedAt} ditolak, server lebih baru
```

POST dikirim `text/plain` (simple request) supaya tidak kena preflight CORS.

## Catatan pemetaan kolom

Nama kolom sengaja menghindari kata kunci MySQL. Yang dipetakan ulang:

| Field aplikasi | Kolom |
|---|---|
| `type` | `jenis` (rewards, violations, trainings) |
| `level` | `tingkat` (employees) |
| `role` | `jabatan` (employees) |
| `date` | `tanggal` |
| `month` | `bulan` |
| `position` | `posisi` (successions) |
| `period` | `periode` (okrs) |
| `score` | `skor` (training_records) |

**Bentuk record diambil dari KODE, bukan dari komentar seed di frontend.**
Komentar di sana sudah basi di dua tempat: `okrs` ditulis `owner`/`divId`/`month`
padahal aslinya `ownerType`/`ownerId`/`period`, dan `audit` tidak menyebut
`userName` padahal kode menulisnya. Kalau menambah koleksi baru, cek titik
`.push(...)`-nya.

Dua koleksi berbentuk peta bersarang, dipipihkan jadi baris supaya bisa di-query:

- `kpiActuals` `{divId: {bulan: {itemId: nilai}}}` → `kpi_actuals(div_id, bulan, item_id, nilai)`
- `monthlyInputs` `{empId: {bulan: {...}}}` → `monthly_inputs(emp_id, bulan, data)`

## Kehadiran (`attendance`)

Hasil unggah report Talenta, dipecah jadi dua tabel:
`attendance_months` (ringkasan + jejak berkas) dan `attendance_days`
(satu baris per kru per hari). Halaman **Kehadiran** yang mengisinya.

Tiga hal yang beda dari koleksi lain, semuanya disengaja:

1. **Ditulis per bulan**, bukan hapus-semua-lalu-tulis-ulang. Satu bulan
   ~1.600 baris; menulis ulang seluruh riwayat tiap kali ada perubahan di
   halaman lain akan memperpanjang transaksi tanpa alasan.
2. **Bulan yang hilang dari kiriman ikut dihapus**, supaya "Hapus bulan
   ini" di UI benar-benar sampai ke database. Penjaganya: peta kosong
   tidak menghapus apa pun (itu lebih mungkin gagal muat daripada niat).
3. **Skor tidak pernah disimpan.** Yang tersimpan hanya data harian; skor
   dihitung ulang di frontend dari `settings.attendanceRules` tiap kali
   dibaca. Karena itu mengubah toleransi terlambat berlaku **surut** ke
   semua bulan tanpa perlu unggah ulang berkas apa pun.

Baris dengan `emp_id` kosong sengaja tetap disimpan: itu kru yang
`talenta_id`-nya belum diisi di Office. Begitu dipetakan, skor bulan lama
langsung ikut benar. Kalau baris tak cocok dibuang saat impor, datanya
hilang selamanya.

`suggestions.emp_id` **boleh NULL** — saran anonim mengirim `null`. Jangan
diubah jadi `NOT NULL`: itu akan membuat saran anonim ketahuan pemiliknya.

`audit` bersifat **append-only** — `saveAll` hanya menambah, tidak pernah
menghapus. Log audit yang bisa dihapus lewat UI tidak ada gunanya.
