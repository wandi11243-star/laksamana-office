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
| `schema.sql` | Struktur 9 tabel (jalankan sekali, di **tiap** database) |
| `hapus-data-contoh.sql` | Sekali pakai — bersihkan data contoh versi lama |
| `migrasi-2026-07-23-pr-mingguan.sql` | **Wajib** untuk database yang sudah ada: tabel PR + kolom payment/pr_id |
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

## Daftar kru datang dari database account

Tabel `people` **bukan** daftar kru tersendiri, melainkan lapisan tambahan di
atas akun Office. Saat boot, `deploy/bd/index.html` memanggil:

```
POST ../account-api-mysql/api.php   {action:"listModuleRoster", module:"bd"}
```

yang mengembalikan persis **pemegang hak akses modul `bd`** (termasuk yang
dapat lewat grant `*`). Tiap anggota yang belum punya baris dibuatkan
otomatis; `name` dan `active` disalin dari account tiap sinkron.

Yang dimiliki BD OS sendiri hanya **jabatan, divisi, dan atasan** — Office
tidak mengenal hierarki, padahal atasanlah yang menentukan siapa melihat task
siapa.

Konsekuensinya:

- **Menambah orang dilakukan di Office → Kelola Akses**, bukan di modul ini.
  Aplikasi tidak punya tombol "tambah kru", justru supaya tidak ada yang
  mengira menambah nama di sini sudah memberi orang itu akses.
- **Akses dicabut ≠ baris dihapus.** Yang kehilangan akses ditandai
  `tanpaAkses` dan tidak lagi muncul di pilihan PIC, tapi barisnya tetap ada
  supaya task lamanya tidak berubah jadi PIC "—".
- **Office mati bukan berarti BD OS mati.** Roster punya batas waktu 8 detik;
  kalau gagal, modul jalan memakai hasil sinkron terakhir dan menampilkan pita
  merah. Papan kerja yang mogok total gara-gara layanan lain sedang batuk lebih
  merugikan daripada daftar kru yang ketinggalan sehari.
- Modul `bd` **harus terdaftar & aktif** di tabel `modules` account. Tanpa itu
  grant `*` tidak mengembang ke `bd`, dan rosternya kosong.

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

## Tidak ada data contoh

Modul ini **tidak pernah mengisi database dengan data karangan**. Papan yang
baru dipasang memang kosong, lengkap dengan pesan "belum ada task".

Versi pertamanya sempat punya `SEED_CONTOH`: begitu database kosong, papan
diisi project, task, dan tujuh kru fiktif. Niatnya mengenalkan modul, hasilnya
sebaliknya — sesudah daftar kru beralih ke database account, tujuh nama
karangan itu berdiri di halaman Kru bertanda "akses dicabut", dan tiap task
contoh menempel pada orang yang tidak pernah ada. Kode pengisinya **dihapus**,
bukan dimatikan lewat saklar: saklar yang bisa dinyalakan pasti suatu saat
dinyalakan lagi di database yang sudah berisi data sungguhan.

Kalau data contoh dari versi lama telanjur masuk, bersihkan dengan
[`hapus-data-contoh.sql`](hapus-data-contoh.sql) lewat phpMyAdmin.

> Pengosongan **harus** lewat phpMyAdmin. Backend sengaja menolak menghapus
> isi tabel saat kiriman aplikasi kosong (`hapus_yang_hilang()`) — perlindungan
> terhadap aplikasi yang gagal memuat lalu menyimpan state kosong. Tanpa
> penjaga itu, satu kali gagal muat bisa mengosongkan seluruh papan kerja.

## Endpoint

| Aksi | Metode | Hasil |
|---|---|---|
| `?action=getAll` | GET | seluruh state: `people`, `projects`, `tasks`, `routines`, `coord`, `po`, `agenda`, `focus` |
| `?action=stats` | GET | jumlah baris per tabel + ukuran blob |
| `?action=ping` | GET | `env`, `db`, `versi` — pengaman zip tertukar |
| `saveAll` | POST | `{action:"saveAll", data:{…}}`, seluruh state |

Koleksi yang **tidak dikirim sama sekali** di `saveAll` tidak disentuh (bukan
dikosongkan), jadi klien boleh mengirim sebagian bila perlu.
