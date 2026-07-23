# BD OS — Backend MySQL

Backend modul **BD OS** (`deploy/bd/`): Business Development, Project &
Purchasing. Menyimpan kru, project, task, routine, koordinasi antar-divisi,
purchase order, dan agenda ke **MySQL** — bukan localStorage, jadi datanya
dipakai bersama semua kru, bukan per-browser.

Polanya **sama persis dengan `event-mysql/` dan `reservasi-mysql/`**: sekali
paham, kepakai di semua modul.

## Isi folder

| File | Fungsi |
|---|---|
| `config.php` | **Satu-satunya yang perlu kamu edit** — kredensial MySQL **produksi** |
| `config.dev.php` | Kredensial **dev**. Upload lalu **rename jadi `config.php`** di server |
| `config.sample.php` | Contoh yang masuk repo (dua config di atas di-ignore git) |
| `schema.sql` | Struktur 8 tabel (jalankan sekali, di **tiap** database) |
| `lib_bd_mysql.php` | Logika. Tidak perlu disentuh |
| `api.php` | Endpoint (`getAll` / `saveAll` / `stats` / `ping`) |
| `.gitignore` | Mengunci `config*.php` agar password tidak ikut ter-commit |

## Dua situs, dua database

| Situs | Branch | Database | `ENV_LABEL` |
|---|---|---|---|
| `office.laksamanamuda.id` | `main` | `lakk5493_db_bd` | `produksi` |
| `dev.laksamanamuda.id` | `develop` | `lakk5493_db_dev_bd` | `dev` |

`deploy/bd/index.html` memanggil API lewat path **relatif**
(`../bd-api-mysql/api.php`), jadi tiap situs otomatis memakai API + database
miliknya sendiri — tidak perlu cabang kode. Yang membedakan **hanya**
`config.php`. Kalau config produksi telanjur ter-upload ke dev, dev menulis ke
database office tanpa satu pun pesan error; `?action=ping` adalah satu-satunya
cara melihatnya.

## Model data

- **1 baris per record.** Kolom inti (untuk indeks/laporan) + kolom `data`
  berisi JSON utuh. **Sumber kebenaran = `data`** — aplikasi boleh menambah
  field baru tanpa mengubah skema.
- **Penjaga `updated_at`.** Simpan per-baris pakai `INSERT ... ON DUPLICATE KEY
  UPDATE`: **baris kiriman yang lebih lama tidak menimpa baris server yang lebih
  baru**. Ini yang menutup masalah "kru saling menimpa".
- **Penghapusan dibatasi.** Baris yang lebih baru dari apa pun yang ada di
  kiriman tidak ikut terhapus — supaya task yang baru dibuat kru lain tidak
  hilang saat orang lain menyimpan dari layar yang sudah basi.
- **`important` + `urgent` dua kolom terpisah.** Kuadran Eisenhower adalah
  turunan dari keduanya dan tidak pernah disimpan; menyimpan turunan berarti
  ada dua kebenaran yang bisa menyimpang.
- **Tidak ada tabel berkas.** BD OS tidak mengunggah apa pun. Kalau nanti perlu
  (mis. lampiran penawaran vendor), ikuti pola `DATA_DIR` di `event-mysql` —
  biner di disk, bukan base64 di dalam state.

## Langkah pasang di Rumahweb (cPanel)

1. **Buat database + user MySQL — DATABASE BARU, jangan menumpang.**
   cPanel → *MySQL Databases* → buat DB (mis. `lakk5493_db_bd`), buat user +
   password, *Add User to Database* → **ALL PRIVILEGES**.

   > Nama tabel di skema ini (`tasks`, `projects`, `orders`, `people`) umum
   > dipakai. Kalau dijalankan di database modul lain, `CREATE TABLE IF NOT
   > EXISTS` justru berbahaya: tabel senama yang sudah ada tidak dibuat ulang
   > dan **tidak ada peringatan** — backend BD lalu menulis ke tabel milik
   > modul lain dan merusaknya diam-diam.

2. **Salin `config.sample.php` → `config.php`**, isi `DB_NAME`, `DB_USER`,
   `DB_PASS`, dan `ENV_LABEL` (`produksi` di office, `dev` di dev).

3. **Buat tabel**
   cPanel → *phpMyAdmin* → pilih database → tab **SQL** → tempel isi
   `schema.sql` → *Go*. Harus muncul **8 tabel**.

4. **Upload folder ini** ke:
   ```
   public_html/office/bd-api-mysql/
   ```
   > Namanya harus `bd-api-mysql` — itu yang ditunjuk `deploy/bd/index.html`
   > (`const API_URL`). Nama folder di repo (`bd-mysql`) memang berbeda; ikuti
   > pola yang sama dengan `event-mysql` → `event-api-mysql`.
   >
   > **Backend TIDAK ikut auto-deploy.** Workflow FTP hanya mengirim `./deploy/`.
   > Folder ini di-upload manual lewat cPanel File Manager.
   >
   > **Jangan ikut-upload `config.local.php`** kalau kamu sempat membuatnya
   > untuk tes lokal: file itu menimpa `config.php` dan membuat server nyambung
   > ke database yang salah.

5. **Uji endpoint** (belum menyentuh aplikasi):
   ```
   https://team.laksamanamuda.id/bd-api-mysql/api.php?action=ping
   https://team.laksamanamuda.id/bd-api-mysql/api.php?action=stats
   ```
   `ping` harus menyebut `env` dan `db` yang **benar**. Kalau `env` di dev
   tertulis `produksi`, berarti zip tertukar — hentikan dan perbaiki
   `config.php` sebelum ada yang menulis data.

6. **Beri akses modul** di Office: tab *Modules* / *Kelola Akses*, kunci modul
   **`bd`**. Tanpa itu kartu BD OS tidak muncul dan penjaga di `deploy/bd/`
   akan melempar kru kembali ke portal.

## Data contoh

`deploy/bd/index.html` punya `SEED_CONTOH = true`: kalau database benar-benar
kosong (tidak ada kru, task, maupun project), aplikasi mengisi contoh sekali
lalu menyimpannya. **Setelah tim mulai input data beneran, ganti ke `false`** —
supaya database yang sengaja dikosongkan tidak diam-diam terisi ulang data
karangan.

## Endpoint

| Aksi | Metode | Hasil |
|---|---|---|
| `?action=getAll` | GET | seluruh state: `people`, `projects`, `tasks`, `routines`, `coord`, `po`, `agenda`, `focus` |
| `?action=stats` | GET | jumlah baris per tabel + ukuran blob |
| `?action=ping` | GET | `env`, `db`, `versi` — pengaman zip tertukar |
| `saveAll` | POST | `{action:"saveAll", data:{…}}`, seluruh state |

Koleksi yang **tidak dikirim sama sekali** di `saveAll` tidak disentuh (bukan
dikosongkan), jadi klien boleh mengirim sebagian bila perlu.
