# Howandi Life OS — Backend MySQL

Backend modul **Howandi Life** (`deploy/howandi_life/`). Menggantikan Apps
Script + Google Sheet. Pola sama dengan modul lain: 1 baris per record,
sumber kebenaran di kolom `data` (JSON), kolom inti hanya untuk query.

## Isi folder

| File | Fungsi |
|---|---|
| `config.php` | **Satu-satunya yang perlu diedit** — kredensial MySQL (password sudah diisi) |
| `schema.sql` | 14 tabel (jalankan sekali) |
| `lib_hlife_mysql.php` | Logika. Tidak perlu disentuh |
| `api.php` | Endpoint (getAll / saveAll / stats / ping) |
| `config.sample.php` | Contoh tanpa password (yang masuk repo) |

## Cara pasang di Rumahweb

1. **cPanel > MySQL Databases**
   - Database: ketik `db_hlife` → jadi `lakk5493_db_hlife`
   - User: ketik `hlife` → jadi `lakk5493_hlife`, isi password
   - **Add User to Database** → centang **ALL PRIVILEGES**
2. **cPanel > phpMyAdmin** → pilih `lakk5493_db_hlife` → tab **SQL** →
   tempel seluruh isi `schema.sql` → **Go**. Aman dijalankan ulang.
3. **cPanel > File Manager** → masuk `public_html/` → **Upload**
   `howandi-life-api-mysql.zip` → **Extract**. Hasil akhirnya:
   `public_html/howandi-life-api-mysql/api.php`
4. Cek: `https://office.laksamanamuda.id/howandi-life-api-mysql/api.php?action=ping`
   → harus muncul `{"ok":true,...}`

## Kontrak API

Sengaja **sama persis** dengan Apps Script lama, jadi frontend cuma ganti
nilai `APPS_SCRIPT_URL` — seluruh kode lain tidak disentuh.

```
GET  ?action=ping                -> {ok:true, data:{time}}
GET  ?action=stats&token=...     -> {ok:true, data:{jumlah per tabel}}
GET  ?action=getAll&token=...    -> {ok:true, data:{...S...}}
POST {action:'saveAll', token, data:S} -> {ok:true, data:{saved:true}}
```

POST dikirim `text/plain` (simple request) supaya tidak kena preflight CORS.

Balasan `saveAll` sengaja ringan: Apps Script lama mengembalikan seluruh
state, tapi frontend **membuangnya** (`flushSave` cuma `await apiSaveState(S)`,
nilainya tidak dipakai). Membaca ulang semua tabel tiap simpan hanya
memperlambat tanpa ada yang membacanya.

## Soal API_TOKEN — jujur saja

Token ada di dalam HTML yang dikirim ke browser, jadi **siapa pun yang membuka
halamannya bisa membacanya**. Dia bukan rahasia: fungsinya menyaring
permintaan asal-asalan, bukan menahan orang yang memang niat. Yang
benar-benar menjaga modul ini adalah **gerbang SSO Office (`lm_session`)**
di bagian atas halaman. Token dibiarkan sama dengan yang lama supaya
perilakunya tidak berubah saat pindah backend.

## Catatan pemetaan — bentuk diambil dari DATA LIVE + KODE

| Field aplikasi | Kolom |
|---|---|
| `field` | `bidang` (businesses) |
| `title` | `judul` |
| `cat` | `kategori` |
| `year` | `tahun` |
| `date` | `tanggal` |
| `month` | `bulan` (ledger) |
| `type` | `jenis` |
| `weekStart` | `week_start` |

Tiga hal yang **tidak** mengikuti pola "objek ber-id", dan gampang salah
kalau cuma menebak dari nama:

- **`channels` dan `dump` adalah ARRAY STRING BIASA**, bukan objek ber-id.
  Buktinya di kode: `S.dump.unshift(v)` dengan `v = el.value.trim()`, dan
  `S.channels = ...split('\n').map(s=>s.trim())`. Kalau dipaksa masuk tabel
  ber-id, isinya hilang semua. Keduanya disimpan sebagai JSON di `settings` —
  urutan `dump` penting (unshift = terbaru di atas) dan JSON menjaganya.
- **`finance` cuma pembungkus** `{ ledger: [...] }`. Yang punya tabel adalah
  `ledger`; pembungkusnya dirakit ulang saat `getAll`.
- **`auth` = `{ enabled, hash }`** — hash SHA-256 kata sandi kunci layar.
  Masuk `settings`, **tidak pernah** dipetakan ke kolom inti mana pun.

## Aturan JSON yang wajib dipatuhi

Selalu `json_decode` **tanpa** flag assoc. `json_decode('{}', true)` dan
`json_decode('[]', true)` sama-sama menghasilkan `[]` — bedanya hilang
permanen. Objek kosong yang kembali ke frontend sebagai Array akan membuat
properti bernama yang ditulis ke situ dibuang `JSON.stringify` saat simpan
berikutnya: **data hilang tanpa pesan error apa pun**. Pelajaran ini datang
dari modul HR; di sini dipakai sejak awal.

## Yang BELUM ada: penjaga bentrok

Modul ini **tidak punya penjaga bentrok**, sama seperti versi Apps
Script-nya — simpan berarti menimpa. Ini OS pribadi satu orang, jadi
risikonya kecil, tapi **dua tab atau dua perangkat yang dibuka bersamaan
tetap bisa saling menimpa**. Kalau nanti mau ditutup, polanya sudah ada di
`hr-mysql/`: revisi dokumen `_rev` + `SELECT ... FOR UPDATE`, plus frontend
yang menangani balasan `conflict`.
