# Account — Backend MySQL

Daftar user & hak akses untuk portal Office.

Menggantikan Google Sheet + Apps Script yang selama ini memegang daftar
user Office (login, PIN, dan hak akses modul).

**Kenapa dipindah:** login lewat Apps Script memakan **16–23 detik** dan
itu terasa di semua modul, karena tiap modul menarik roster Office saat
dibuka. Lewat MySQL mestinya di bawah satu detik.

## PERINGATAN ISI DATA

- `users` — **PIN login** semua kru
- `grants` / `admins` — siapa boleh membuka & mengelola modul apa

`.gitignore` di folder ini menolak `config*.php`, `*.json`, dan `*.csv`.
Ekspor tab Sheet berisi PIN, jadi jangan ditaruh di dalam repo.

### Soal PIN yang disimpan apa adanya

PIN **tidak di-hash**, sama seperti di Sheet. Alasannya konkret: konsol
"Kelola User" di Office menampilkan PIN di daftar dan mengisinya ulang di
form saat mengedit ([`deploy/index.html`](../deploy/index.html) baris ~836
dan ~882). PIN yang di-hash akan mematikan layar itu.

Ini bukan kemunduran — sebelumnya PIN terbuka bagi siapa pun yang punya
link spreadsheet-nya; sekarang terkunci di balik kredensial database. Tapi
ini **memang utang** yang layak dibereskan kalau nanti konsolnya diubah
jadi "reset PIN" (bukan "lihat PIN").

## DUA SITUS, DUA DATABASE, SATU index.html

| Situs | Branch | Database |
|---|---|---|
| office.laksamanamuda.id | `main` | `lakk5493_db_account` |
| dev.laksamanamuda.id | `develop` | `lakk5493_db_dev_account` |

Frontend memanggil lewat **path relatif**, jadi `index.html`-nya sama
persis di kedua situs:

```
office.laksamanamuda.id/            -> office.../account-api-mysql/  -> db_account
dev.laksamanamuda.id/marketing/     -> dev.../account-api-mysql/     -> db_dev_account
```

Kalau ditulis URL lengkap, **dev akan memakai daftar user produksi** dan
mengubah PIN di dev ikut mengubahnya di produksi. Jangan diubah jadi
absolut.

Untuk memastikan tidak salah pasang:
`<situs>/account-api-mysql/api.php?action=ping` → balasannya menyebut `env`
dan `db`. Di dev harus `dev` / `lakk5493_db_dev_account`.

## Isi folder

| File | Fungsi |
|---|---|
| `schema.sql` | 4 tabel + registri modul awal. Dijalankan di KEDUA database |
| `lib_account_mysql.php` | Seluruh logika (13 aksi) |
| `api.php` | Router endpoint |
| `config.sample.php` | Contoh tanpa password (yang masuk repo) |

## Cara pasang

Lakukan **dua kali**: sekali untuk produksi, sekali untuk dev.

1. **cPanel > MySQL Databases** — buat database + user, `Add User to
   Database` → ALL PRIVILEGES.
   - produksi: `db_account` + user `office`
   - dev: `db_dev_account` + user `dev_office`
2. **phpMyAdmin** → pilih database → tab **SQL** → tempel `schema.sql` → Go.
   Aman dijalankan ulang.
3. **File Manager** → upload zip → Extract, sehingga jadi
   `<docroot>/account-api-mysql/api.php`.
4. **Ganti nama `config.sample.php` jadi `config.php`**, lalu isi
   `DB_NAME`, `DB_USER`, `DB_PASS`. Di dev, set `ENV_LABEL` jadi `'dev'`.
5. Buka `?action=ping` — **pastikan `db` yang disebut benar**.

Folder ini diupload manual lewat cPanel, jadi **aman dari sapuan FTP
deploy**: GitHub Action hanya menghapus berkas yang dia sendiri pernah
upload.

### Kalau backend belum terpasang

Office **tidak terkunci**. Login gagal menghubungi server akan jatuh ke
`SEED_USERS` di `deploy/index.html` (Admin / Howandi / Wandi, PIN 1111).
Jadi urutan pemasangannya bebas, dan salah langkah tidak mengunci siapa pun
di luar sistem.

### Akun awal

Kalau tabel `users` benar-benar kosong, `seed_bila_kosong()` membuat
**Admin, Howandi, Wandi** (PIN `1111`, semuanya superadmin; Wandi tanpa
`howandi_life`) — sama seperti `SEED_USERS` di landing. Hanya jalan saat
tabel kosong, jadi database yang sudah berisi tidak pernah tertimpa.

**Ganti PIN ketiganya setelah masuk pertama kali.**

## Talenta ID

Kolom `users.talenta_id` menyimpan **Employee ID** di aplikasi absensi
Talenta (mis. `118825`). Modul HR memakainya untuk mencocokkan report
absensi bulanan dengan akun Office.

Pencocokan **hanya** lewat kolom ini, tidak pernah menebak dari nama:
nama di Talenta dan di Office kerap berbeda (`M. Rizki Arfan` vs
`Rizki Arfan`), dan salah tebak berarti absensi orang lain masuk ke skor
seseorang. Nama yang tidak cocok dilaporkan di layar unggah, bukan ditebak.

Diisi lewat **Kelola User** di Office. Yang terisi wajib unik (dicek di
kode, bukan di database — baris kosong akan saling bentrok kalau dipaksa
UNIQUE). Kosong berarti "belum dipetakan" dan itu sah.

Ikut dikirim di `listUsers` **dan** `listModuleRoster`, supaya modul HR
bisa mencocokkan tanpa kredensial superadmin. Ini bukan data sensitif:
nomor pegawai, bukan PIN.

## Nama resmi vs nama panggilan

`users` punya dua kolom nama, dan bedanya penting:

| Kolom | Untuk apa | Siapa yang mengubah |
|---|---|---|
| `name` | **Kredensial login** (nama + PIN), wajib unik, kunci lintas modul | admin saja |
| `display_name` | Sapaan di layar. Boleh kembar, boleh kosong | pemiliknya sendiri, atau admin |

Aturan tampilannya sengaja dipisah tegas:

- **Nama panggilan** hanya di layar "diri sendiri" — sapaan beranda Office,
  footer sidebar modul, kartu skor pribadi.
- **Nama resmi** di semua layar yang dipakai mengambil keputusan tentang
  seseorang: Kelola User, Kelola Akses, Kru, Kehadiran, People Score,
  Disiplin. Di Kelola User, nama panggilan ikut tampil kecil di sebelah nama
  resmi supaya kru yang menyebut dirinya "Chris" tetap ketemu.

`display_name` **tidak pernah** dipakai untuk mencari atau mencocokkan orang.
Pencocokan tetap lewat `id`, absensi lewat `talenta_id`. Itu sebabnya kolom
ini tidak unik: dua orang boleh sama-sama memilih "Adit".

Aksi `setDisplayName` adalah satu-satunya aksi tulis selain `changePin` yang
boleh dipanggil non-superadmin. Gerbangnya **wajib name + PIN yang cocok**,
dan baris yang ditulis ditentukan dari hasil pencocokan kredensial itu —
bukan dari `id` yang dikirim client. Kalau `id` ikut dipercaya, kredensial
sendiri bisa dipakai untuk menulis ke baris orang lain.

## Memindahkan data dari Sheet

Belum wajib — kalau dilewati, Office mulai dengan tiga akun benih di atas
dan sisanya didaftarkan ulang lewat konsol Kelola User.

Kalau isinya mau dipindahkan, ekspor tab `Users`, `Modules`, `Grants`,
`Admins` lalu POST:

```json
{ "action":"import",
  "callerName":"Howandi", "callerPin":"1111",
  "users":  [{"id":"u-christy","name":"Christy","pin":"4821","active":"TRUE","keterangan":"Marketing"}],
  "modules":[{"key":"konten","label":"Konten","active":"TRUE"}],
  "grants": [{"userId":"u-christy","module":"konten","access":"TRUE"}],
  "admins": [{"userId":"u-christy","module":"konten"}] }
```

Idempoten — aman diulang kalau terputus di tengah, dan tidak pernah
menghapus baris yang sudah ada.

## Kontrak API

Bentuk balasan, nama aksi, dan **kode error-nya disalin persis** dari
Apps Script (`ok`, `invalid`, `forbidden`, `name_taken`, `bad_pin`,
`last_superadmin`, `cannot_delete_self`, `unknown_action`), supaya
frontend tidak perlu diubah selain URL-nya.

Semua aksi lewat POST JSON dengan `Content-Type: text/plain` — disengaja,
supaya tidak memicu preflight CORS. Sama seperti sebelumnya.

```
{action:"login", name, pin}         -> {ok,user:{id,name,modules,adminModules}}
{action:"changePin", name, newPin}
-- superadmin, wajib callerName + callerPin --
{action:"listUsers"} {action:"saveUser"} {action:"deleteUser"}
{action:"listModules"} {action:"syncModules"} {action:"saveModule"}
{action:"setAdmin"} {action:"listAccess"} {action:"setModuleAccess"}
{action:"import"}
-- admin modul --
{action:"listModuleMembers", module}
-- tanpa gerbang, dipanggil tiap modul saat boot --
{action:"listModuleRoster", module}
GET ?action=ping   ?action=stats
```

### Aturan akses (jangan diubah tanpa membaca ini)

`grants` adalah satu-satunya sumber "modul apa yang boleh dibuka".
Urutan resolusinya penting:

1. baris `'*'` diperluas dulu atas **modul aktif**,
2. baru baris per-modul menimpa (`access=1` memberi, `access=0` mencabut).

Dibalik urutannya, deny spesifik akan tertelan `'*'` — dan "Wandi boleh
semua KECUALI howandi_life" diam-diam berubah jadi "boleh semua".

`admins` terpisah dari `grants`: mengelola sebuah modul **tidak** otomatis
memberi hak membukanya.

`listModuleRoster` sengaja **tanpa gerbang kredensial** — dipanggil
otomatis tiap modul saat boot, supaya dropdown PIC ikut roster Office tanpa
tiap orang login dulu. Karena itu balasannya tidak pernah memuat PIN.

## Yang berubah dari Apps Script

| Hal | Sheet | Di sini |
|---|---|---|
| Baris grant kembar | bisa terjadi | dicegah `PRIMARY KEY (user_id, module)` |
| Hapus user | Grants & Admins yatim tertinggal | ikut terhapus |
| Baris kosong | muncul sebagai user hantu "?" | disaring di query |
| Urutan modul | urutan baris Sheet | kolom `urut` |

## Yang BELUM dikerjakan

**Daftar user internal tiap modul belum disatukan.** Konten, Reservasi,
Stock, HR, dan Akademi masih punya daftar sendiri, dan Office tidak
mengisinya otomatis — itu "Tingkat 2" yang sengaja ditunda. Akibatnya satu
orang masih bisa muncul dua kali dengan id berbeda di sebuah modul
(mis. `u_howandi` vs `u-howandi` di Akademi).
