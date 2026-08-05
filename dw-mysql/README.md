# dw-api-mysql — backend modul Daily Worker

Folder di repo: `dw-mysql/` → folder di server: `/dw-api-mysql/`
(nama sengaja berbeda; frontend memanggil `../dw-api-mysql/api.php`).

## Apa yang diurus modul ini

Pekerja harian / part time yang **bukan pegawai Office**. Alurnya:

1. DW mengajukan sendiri "saya bisa masuk tanggal sekian, jam sekian"
   (masuk pakai **no HP + PIN**, bukan akun Office) — atau HR mengisikan
   atas namanya.
2. HR menyetujui / menolak di halaman **Antrean Ajuan**.
3. Yang **DISETUJUI** langsung muncul di kalender modul **Jadwal Shift**,
   di blok terpisah di bawah kru tetap dan disorot emas.

Langkah 3 adalah **pembacaan**, bukan penyalinan baris ke `jadwal_sel`.
Modul Jadwal memanggil `?action=jadwalDW&dari=&sampai=` tiap kali memuat
rentang tanggal. Kalau barisnya disalin, ada dua kebenaran untuk hari yang
sama: ajuan yang dibatalkan di sini tidak ikut hilang dari sana.

## Kenapa ada tabel orang di sini (beda dengan jadwal-api-mysql)

Modul Jadwal sengaja **tidak** punya tabel pegawai — namanya ditarik dari
Office. Di sini kebalikannya, dan itu disengaja: daily worker tidak punya
akun Office, tidak masuk Kelola Akses, dan daftarnya berganti tiap bulan.
Mendaftarkan mereka sebagai user Office akan mencemari roster **setiap**
modul (Marketing, HR, Kompas) dengan puluhan nama yang tidak pernah membuka
Office sama sekali.

`no_hp` dipakai sebagai kunci unik. Tanpa itu, orang yang sama didaftarkan
dua kali oleh dua staf HR akan punya dua riwayat no-show yang masing-masing
terlihat bersih — dan yang paling sering bermasalah justru yang paling
sering didaftar ulang.

## Pemasangan sekali di tiap lingkungan

1. **cPanel > MySQL Databases** — buat database dan user, lalu *Add User to
   Database* dengan ALL PRIVILEGES.
   - produksi: `lakk5493_db_dw` / `lakk5493_dw`
   - dev: `lakk5493_db_dev_dw` / `lakk5493_dev_dw`
2. Salin `config.sample.php` → `config.php` (produksi) dan
   `config.dev.php` (dev), isi passwordnya. Keduanya di-gitignore.

   | Berkas di repo | Untuk | Diunggah ke server sebagai |
   |---|---|---|
   | `config.php`     | produksi | `config.php` |
   | `config.dev.php` | dev      | `config.php` ← **ganti namanya** |

   Nama di server **selalu** `config.php`; `lib_dw_mysql.php` tidak mencari
   nama lain.
3. **Unggah MANUAL** ke `/dw-api-mysql/` lewat File Manager atau FTP.
   Workflow GitHub sengaja tidak pernah mengirim `config*.php`.
4. Tabel dibuat sendiri saat modul pertama kali menyimpan. Menjalankan
   `schema.sql` di phpMyAdmin sifatnya opsional.
5. Cek dengan membuka `https://<situs>/dw-api-mysql/api.php?action=ping`.
   Balasannya harus memuat `"env":"dev"` atau `"env":"produksi"` yang sesuai.

## Aksi API

| Aksi | Metode | Isi |
|---|---|---|
| `getAll` | GET | `?dari=&sampai=` — seluruh pekerja + ajuan dalam rentang + semua ajuan MENUNGGU + setting |
| `jadwalDW` | GET | `?dari=&sampai=` — **untuk modul Jadwal Shift**. Hanya ajuan DISETUJUI, tanpa no HP / PIN |
| `ping` / `stats` | GET | diagnostik |
| `loginDW` | POST | `{hp,pin}` — gerbang DW mandiri. Yang BLOKIR/NONAKTIF ditolak di sini, bukan di frontend |
| `ajuanSaya` | POST | `{dwId}` — riwayat satu orang saja, supaya DW tidak menerima seluruh talent pool |
| `simpanPekerja` | POST | `{row:{id?,nama,hp,pin?,divisi,posisi,…}, by}` — `pin` hanya ditulis kalau dikirim |
| `hapusPekerja` | POST | `{id}` — ajuannya **tidak** ikut terhapus (riwayat kerja tetap) |
| `simpanAjuan` | POST | `{row:{id?,dwId,tgl,m,s,divisi,posisi,catatan}, by}` — status **selalu** dipaksa `MENUNGGU` |
| `putusAjuan` | POST | `{id,status,nota,by}` |
| `putusBanyak` | POST | `{ids:[…],status,nota,by}` — satu transaksi |
| `hapusAjuan` | POST | `{id}` |
| `simpanHadir` | POST | `{id,hadir,nota,by}` — `hadir` = HADIR/TELAT/ALFA. **Tidak ada penilaian**: skor bintang 1–5 dibuang 5 Agustus 2026 karena tidak pernah dipakai memutuskan apa pun tapi selalu menuntut diisi |
| `simpanSetting` | POST | `{data:{tarif,jam,posisi,kuota,batasHari}, by}` |

> Database kedua lingkungan sudah terpasang (5 Agustus 2026) dan verifikasi di
> `.github/workflows/` sekarang **menggagalkan build** kalau salah satu dari
> ini terjadi: `env` tidak sesuai lingkungan, atau `stats` tidak membalas
> `"ada":true`.
>
> Pemeriksaannya sengaja memakai **`stats`, bukan `ping`**. `ping` hanya
> membacakan isi `config.php` tanpa menjalankan satu kueri pun, jadi ia tetap
> hijau walau database menolak kredensialnya — dan itu sudah benar-benar
> terjadi: pada 5 Agustus 2026 `ping` membalas `"env":"produksi"` dengan
> meyakinkan selama satu siklus deploy penuh sementara MySQL menolak
> passwordnya (`1045`), sehingga modulnya tidak bisa menyimpan apa pun.
> `stats` yang menyentuh DB sungguhan.

## Kunci unik yang penting dipahami

- `dw_pekerja.no_hp` **UNIK** — satu orang satu baris, riwayatnya tidak pecah.
- `dw_ajuan (dw_id, tgl)` **UNIK** — satu orang satu sel kalender per hari.
  Mengirim ulang untuk tanggal yang sama **menimpa** baris lama dan
  mengembalikan statusnya ke `MENUNGGU`; ajuan yang jamnya diubah harus
  disetujui ulang, tidak boleh diam-diam tetap `DISETUJUI` dengan jam yang
  sudah berbeda.
