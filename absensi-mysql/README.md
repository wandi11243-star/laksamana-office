# Absensi Laksamana — backend

Absensi karyawan berbasis PWA: geofence + pengenalan wajah, tersambung ke
jadwal shift (`jadwal-api-mysql`) dan pekerja harian (`dw-api-mysql`).

Semuanya open-source dan tanpa biaya berjalan: tidak ada API berbayar, tidak
ada layanan pihak ketiga. Pengenalan wajah memakai
[`@vladmandic/face-api`](https://github.com/vladmandic/face-api) (MIT) yang
bobot modelnya **disimpan di repo** (`absensi/models/`, 6,5 MB) — bukan
diambil dari CDN, supaya aplikasinya tetap jalan setelah dipasang di HP dan
tidak bergantung pada layanan yang bisa hilang.

---

## Letaknya di server — BEDA dengan modul Office lain

| Yang ini | Produksi | Dev |
|---|---|---|
| `absensi/` (frontend) | `/public_html/absensi/` → **absensi.laksamanamuda.id** | `/absensi/` → dev.laksamanamuda.id/absensi/ |
| `absensi-mysql/` (backend) | `/public_html/absensi/api/` | `/absensi/api/` |

**Bukan** di dalam `/office/`. Modul ini dipasang sebagai aplikasi di layar
depan HP kru; ia tidak boleh menuntut orang membuka portal Office lebih dulu
setiap pagi.

Backend diletakkan **DI DALAM** folder situsnya (`absensi/api/`), bukan
sebagai folder tetangga. Kalau docroot subdomain adalah
`/public_html/absensi/`, maka `../absensi-api/` menunjuk **ke luar docroot**
dan tidak bisa dicapai lewat `absensi.laksamanamuda.id` sama sekali. Di dalam,
jalur `api/api.php` benar apa pun cara subdomainnya dibuat — dan juga benar di
dev, tempat situsnya duduk sebagai subfolder biasa.

Aman ditumpuk begini: FTP-Deploy-Action hanya menghapus berkas yang ada di
berkas state-nya sendiri, jadi job situs tidak menyapu `api/` milik job lain.

---

## Pemasangan (sekali saja, manual di cPanel)

1. **Subdomain.** cPanel → Domains → Create A New Domain:
   `absensi.laksamanamuda.id`, document root `/public_html/absensi`.
   Centang "Share document root" **jangan** dinyalakan.

2. **Database.** cPanel → MySQL Databases:
   * produksi: database `db_absensi`, user `absensi`
   * dev: database `db_dev_absensi`, user `dev_absensi`

   Lalu **Add User To Database → ALL PRIVILEGES**. Tanpa langkah ini modulnya
   akan menjawab `SQLSTATE[42000] 1044` yang tidak menyebut penyebabnya.

   Tabel dibuat sendiri saat pertama dipakai; `schema.sql` cuma untuk dibaca.

3. **config.php.** Salin `config.sample.php` → `config.php`, isi password,
   lalu unggah **manual** ke `/public_html/absensi/api/` (dev:
   `.../dev.laksamanamuda.id/absensi/api/`). Workflow FTP sengaja tidak
   mengirim `config*.php`.

4. **Alamat modul tetangga.** Ini bagian yang paling mudah terlewat.

   Backend absensi menebak alamat account/jadwal/dw dari **host yang sedang
   melayani**. Karena absensi berdiri di subdomain sendiri, tebakannya jadi
   `https://absensi.laksamanamuda.id/account-api-mysql/api.php` — yang tidak
   ada. **Ketiganya WAJIB diisi eksplisit di `config.php`:**

   ```php
   define('ACCOUNT_API_URL', 'https://team.laksamanamuda.id/account-api-mysql/api.php');
   define('JADWAL_API_URL',  'https://team.laksamanamuda.id/jadwal-api-mysql/api.php');
   define('DW_API_URL',      'https://team.laksamanamuda.id/dw-api-mysql/api.php');
   ```

   Untuk dev, tunjuk ke host dev. Salah tunjuk **tidak menimbulkan galat**:
   absensi dev akan menghitung telat terhadap jadwal produksi, dan semua
   angkanya terlihat wajar.

   Periksa dengan `?action=ping` — ketiganya ikut dibalas.

5. **Akses modul.** Office → Hak Akses → beri kru akses modul `absensi`.
   Tanpa itu login akan ditolak dengan pesan yang menyebutkan hal ini.

6. **Titik kerja.** Buka aplikasinya sebagai admin → tab **Atur** → berdiri di
   lokasi kantor → "Pakai lokasi saya sekarang". **Selama belum ada satu pun
   titik kerja, semua absen dianggap di dalam area** — disengaja, supaya hari
   pertama pemasangan tidak mengirim seluruh absensi ke antrean.

---

## Endpoint

| Aksi | Siapa | Keterangan |
|---|---|---|
| `masuk` | siapa saja | Diteruskan server-ke-server ke `account-api` (`login`). Peramban tidak pernah menghubungi API akun langsung, jadi CORS di sana tidak perlu dilonggarkan. |
| `konteks` | pemegang token | Semua yang dibutuhkan layar absen dalam satu panggilan: siapa, shift hari ini, daftar lokasi, aturan, absensi hari ini, waktu server. |
| `absen` | pemegang token | Merekam satu ketukan. |
| `daftarWajah` | diri sendiri; HR untuk orang lain | |
| `hapusWajah`, `wajahDaftar`, `antrean`, `putusAbsen`, `simpanLokasi`, `hapusLokasi`, `simpanSetting` | HR/admin | |
| `rekap` | pemegang token | Kru biasa **selalu** dipaksa melihat rekapnya sendiri, apa pun parameter yang dikirim. |
| `ping`, `stats` | terbuka | Diagnostik. |

---

## Keputusan yang sengaja diambil begini

**Waktu diambil dari server, bukan dari HP.** Jam HP bisa diputar mundur
lewat Pengaturan dalam sepuluh detik. Jam besar di layar pun jam server —
dihitung dari selisih yang diukur sekali saat memuat.

**Pencocokan wajah dikerjakan di server.** HP hanya mengubah wajah jadi 128
angka. Kalau dibalik — descriptor tersimpan dikirim ke HP lalu dibandingkan
di sana — siapa pun yang membuka Developer Tools bisa membalas "cocok" tanpa
menghadapkan wajah ke kamera.

**Subjek diambil dari token, tidak pernah dari badan permintaan.** Ini
satu-satunya baris yang menahan seseorang mengabsenkan rekannya, dan karena
itu ia tidak punya pengecualian "kecuali admin". Admin yang perlu
memperbaiki absensi orang lain memakai `putusAbsen`, yang meninggalkan jejak.

**Tidak ada tabel rekap harian.** Telat, lembur, dan durasi selalu dihitung
ulang dari ketukan + shift. Menyimpannya berarti angka tidak ikut berubah
ketika sebuah pengajuan disetujui belakangan — persis jenis kesalahan yang
tidak menimbulkan galat, cuma laporan yang salah.

**MASUK yang pertama menang, PULANG yang terakhir menang.** Kalau MASUK
ditimpa, orang yang terlanjur telat bisa "memperbaiki" catatannya. Orang
memang bisa pulang lalu diminta kembali, jadi jam pulang yang sah adalah yang
paling akhir.

**Tidak ada antrean absen offline.** Absen offline berarti waktunya dari jam
HP. Kru tanpa sinyal diberi pesan jelas, bukan janji palsu bahwa absennya
"tersimpan".

**Shift malam ditangani eksplisit.** Shift 18:00–02:00 berakhir keesokan hari;
ketukan pulang pukul 02:10 dilekatkan ke tanggal kerja saat ia masuk, bukan
ke tanggal jam dinding. Tanpa itu, jam pulang tercatat di hari yang tidak
punya jam masuk dan dua-duanya jadi tidak lengkap.
