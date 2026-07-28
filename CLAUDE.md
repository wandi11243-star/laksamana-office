# Laksamana Office — panduan kerja untuk Claude

Tujuan berkas ini: **memangkas token yang terbuang untuk menemukan ulang hal
yang sudah diketahui**, bukan menambah aturan. Semua di bawah ini adalah fakta
repo yang kalau tidak ditulis, harus ditemukan ulang dengan belasan panggilan
`ls` / `find` / `grep` setiap sesi.

Bahasa kerja: **Indonesia** — UI, komentar kode, pesan commit, dan balasan ke
user. Istilah teknis (commit, merge, pager, endpoint) dibiarkan apa adanya.

---

## 1. Peta repo — jangan `find` lagi

```
deploy/<modul>/index.html   ← FRONTEND. Satu berkas HTML raksasa per modul.
                              Inilah yang di-deploy. 99% pekerjaan ada di sini.
deploy/assets/              ← logo & tema bersama antar modul
<modul>-mysql/              ← BACKEND PHP modul itu (api.php, lib_*.php, schema.sql)
account-mysql/              ← database USER/akun bersama. Sumber SSO & roster pegawai.
docs/                       ← Apps Script lama + catatan Office (arsip/rujukan)
.github/workflows/          ← deploy FTP otomatis
```

Modul: `marketing` `reservasi` `event` `bd` `konten` `hr` `akademi` `kompas`
`radar` `stock` `howandi_life`.

**Abaikan sepenuhnya** (jangan dibaca, jangan di-grep): `node_modules/`,
`vendor/`, `*.zip` di root (itu paket rilis backend, bukan sumber),
`.pratinjau/`, `hr/` dan `event/` di root (proyek Laravel lama, BUKAN modul
yang di-deploy — modulnya ada di `deploy/hr/` dan `deploy/event/`).

Ukuran frontend (per Juli 2026): reservasi ~8.300 baris, marketing ~8.300,
event/bd/konten ~3.000–3.400, sisanya di bawah 2.000.

---

## 2. Aturan paling penting: JANGAN baca index.html utuh

`deploy/marketing/index.html` ≈ 400 KB. Sekali `Read` tanpa batas menghabiskan
puluhan ribu token untuk mendapatkan satu fungsi.

**Alur yang benar — Grep dulu, Read seperlunya:**

1. `Grep` pola nama fungsi → dapat nomor baris
2. `Read` dengan `offset` + `limit` (biasanya 40–120 baris cukup)
3. `Edit` dengan `old_string` yang unik dan sependek mungkin

Konvensi nama yang bisa langsung di-grep. **Paling lengkap di `marketing`**
(rujukan terbaik saat butuh contoh); modul lain memakai sebagian saja —
`reservasi` dan `konten` mis. tidak punya `go()`, jadi jangan berasumsi.

| Pola | Isinya |
|---|---|
| `function render<Nama>(V)` | penggambar satu halaman; `V` = elemen `#view` |
| `function paint<Nama>()` | penggambar ulang sebagian (tabel di dalam halaman) |
| `const NAV_DEF` | daftar menu sidebar; **juga sumber daftar izin** |
| `const TITLES` | judul + subjudul tiap halaman |
| `function go(view,param)` | router. Peta `R={...}` di dalamnya → render mana |
| `function normalizeState(s)` | bentuk data + **semua migrasi data lama** |
| `function seed()` | state awal kosong |
| `const API_URL` | `"../<modul>-api-mysql/api.php"` |

Cari fitur berdasarkan **teks yang dilihat user**, bukan tebakan nama fungsi:
`Grep "Surat Penawaran"` jauh lebih cepat menemukan tempatnya daripada menebak
`function penawaran...`.

> Catatan: `index.html` beberapa modul memuat byte `\0` (data URI gambar), jadi
> ripgrep kadang melaporkannya sebagai berkas biner. Itu normal, bukan
> kerusakan. `Grep` tetap bekerja.

---

## 3. Arsitektur frontend — model mental yang sudah benar

Semua modul memakai pola yang sama, jadi paham satu berarti paham semuanya:

- **`S`** = seluruh state aplikasi (satu objek besar). **`ME`** = user yang login.
  Keduanya `let` di lingkup global skrip — **bukan** properti `window`.
- **`save()`** mengirim `S` ke `api.php?action=saveAll`; **`normalizeState()`**
  merapikan yang pulang dari server.
- **Render itu total, bukan diferensial.** Setiap perubahan → `save()` lalu
  `go(...)` / `refreshView()` yang menggambar ulang halaman dari nol dengan
  string HTML. Tidak ada framework, tidak ada virtual DOM. Jangan mencoba
  memperbarui DOM secara manual kecuali memang sedang menghindari kehilangan
  fokus input (lihat `paintCRM`, `kalkHitung`).
- **Identitas dari Office (SSO).** Login lokal sudah tidak ada. Roster pegawai
  ditarik dari `account-mysql` lewat `listDivisiRoster` (semua user, tanpa PIN)
  dan `listModuleRoster` (anggota modul + flag admin).

### Helper bersama yang sudah ada — pakai ini, jangan bikin baru

`esc()` `escJs()` `rp()` `fmtDate()` `fmtDateLong()` `ago()` `today()`
`daysTo()` `uid()` `svg(IC.x)` `toast()` `modal()` `confirmUI()` `logAct()`
`pushNotif()` `can('aksi')` `stat()` `empty()` `pageHead()` `statusChip()`

**Marketing punya mesin tabel bersama** (`tblHead` / `tblUrut` / `tblPage` /
`tblPagerHtml` / `tblSortKlik`). Tabel daftar apa pun yang baru **wajib**
memakainya — cukup deklarasikan `const KOL_XXX=[{k,t,v,cls,turun,def}, …]`.
Pola yang sama sudah ada di reservasi (`tblPage`/`tblPagerHtml`).

### Hak akses

Satu matriks `(view × role) → 0 Tak Terlihat / 1 Lihat / 2 Boleh Ubah`.
`can('edit_event')` memetakan aksi → view lewat `ACTION_VIEW`. Daftar view
diambil dari `NAV_DEF`, jadi **menghapus baris `NAV_DEF` ikut menghapus baris
izinnya**. Kalau sebuah halaman perlu disembunyikan dari sidebar tapi izinnya
harus tetap ada, beri `hidden:1` (lihat baris `users` di marketing).

---

## 4. Verifikasi: pakai smoke test, jangan menebak

Repo ini tidak punya test suite. Tapi `jsdom` **sudah terpasang** di
`node_modules/`, dan modulnya berkas HTML mandiri — jadi seluruh frontend bisa
dirender di Node tanpa server. Ini pengganti "coba buka di browser" yang paling
murah, dan menangkap 90% kerusakan (halaman blank karena satu `TypeError`).

Harness siap pakai: **`tools/smoke-modul.js`**

```bash
node tools/smoke-modul.js marketing     # satu modul
node tools/smoke-modul.js               # semua modul; keluar 1 kalau ada yang gagal
```

**Cakupannya tidak seragam — jangan terlalu percaya "OK":**

| Modul | Yang benar-benar diuji |
|---|---|
| `marketing` | 20 halaman dirender satu per satu + wadah render tidak kosong |
| `kompas` | 10 halaman dirender (wadahnya tak dikenali, jadi hanya "tidak melempar") |
| sisanya | hanya boot — router/daftar halamannya tidak terbaca dari luar |

Harness mencetak sendiri alasannya di tiap baris. Kalau menggarap modul yang
cakupannya masih "hanya boot", **ujilah manual di browser** atau perluas
harness-nya lebih dulu.

Untuk pemeriksaan khusus perubahan yang sedang dikerjakan (mis. "pager muncul",
"kolom X hilang"), salin harness ke scratchpad dan tambahkan asersi — jangan
menumpuk asersi sekali-pakai ke dalam berkas repo.

**Jebakan yang sudah memakan satu siklus penuh:** `S` dan `ME` dideklarasikan
dengan `let`, jadi ada di lingkup leksikal global — **bukan** `window.S`.
Menulis `dom.window.S = ...` dari Node tidak akan terlihat oleh kode halaman.
Harus lewat `dom.window.eval("S = ...")`. Harness sudah menanganinya.

Sebelum menyerahkan pekerjaan, minimal jalankan:
```bash
node --check <blok-script-yang-diekstrak>   # sintaks
node tools/smoke-modul.js <modul>           # render semua halaman
```

---

## 5. Git & deploy

**Alur baku — berhenti di `develop`, jangan pernah menyentuh `main`:**

```bash
# 1. kerja di develop
git add <berkas> && git commit -m "…"

# 2. origin/develop sering sudah maju (sesi lain ikut push) — sinkronkan dulu,
#    kalau tidak push ditolak
git fetch origin && git rebase origin/develop

# 3. push
git push origin develop
```

**Naik ke produksi itu urusan user, bukan Claude.** Merge `develop` → `main`
dikerjakan user secara manual kalau perubahannya sudah dicoba di dev dan
dianggap beres. Jangan `git checkout main`, jangan merge ke `main`, jangan
`git push origin main` — walaupun kelihatannya itu langkah berikutnya yang
wajar, dan walaupun pekerjaannya sudah selesai. Cukup laporkan bahwa develop
sudah di-push dan tunggu.

**Push otomatis men-deploy.** `main` → `office.laksamanamuda.id` (produksi),
`develop` → server dev. Keduanya lewat FTP dengan verifikasi isi berkas
(transfer ke Rumahweb pernah putus di tengah dan melaporkan "sukses", sehingga
modul mati tanpa ada yang sadar — itu sebab ada 3× percobaan + langkah
Verifikasi di workflow). Jangan push kalau belum yakin.

Perubahan yang sudah di-commit tapi belum di-push **tidak ada di dev**. Kalau
user melaporkan perbaikannya "belum jalan" sambil menunjukkan layar dev,
periksa `git log origin/develop..develop` lebih dulu sebelum mencari bug —
sudah kejadian pada 28 Juli 2026 di modul kompas.

**Gaya pesan commit:** `<modul>: <apa yang berubah dari sudut pandang user>`,
bahasa Indonesia. Badan pesan menjelaskan **sebab** bug, bukan daftar berkas —
`git diff` sudah menyimpan daftar berkas.

### Jebakan shell: Bash vs PowerShell

Tool `Bash` di sini adalah **Git Bash (POSIX sh)**. Sintaks here-string
PowerShell `@'…'@` akan diterima sebagai teks biasa dan menyelipkan baris `@`
ke dalam pesan commit. Untuk pesan multi-baris di Bash pakai heredoc:

```bash
git commit -F- <<'MSG'
modul: ringkasan
…
MSG
```

---

## 6. Cara membaca & menulis komentar di repo ini

Kode di sini padat komentar berbahasa Indonesia yang menjelaskan **mengapa**,
sering menyebut kejadian nyata ("sudah kejadian 2× pada 16 Juli 2026",
"akibatnya kolom No. HP SELALU kosong"). Itu disengaja dan sangat berharga:

- **Baca komentar di sekitar kode sebelum mengubahnya.** Sering kali sebuah
  syarat yang tampak aneh (`!Array.isArray(x)` tanpa `|| !x.length`) sudah
  dijelaskan alasannya tepat di atasnya, dan "merapikannya" akan mengembalikan
  bug lama.
- **Tulis komentar dengan gaya yang sama** saat mengubah sesuatu: apa yang dulu
  salah, kenapa bentuk baru ini dipilih. Bukan mengulang apa yang kodenya sudah
  katakan.
- Jangan hapus komentar sejarah hanya karena kodenya berubah — perbarui isinya.

---

## 7. Kebiasaan yang menghemat token (ringkas)

- **Satu pesan, banyak tool call** untuk hal yang tidak saling bergantung.
- `Grep` dengan `output_mode:"content"` + `head_limit` daripada membaca berkas.
- Untuk penggantian berulang di berkas raksasa, satu skrip Python via `Bash`
  lebih murah daripada sepuluh `Edit`.
- Jangan `Read` ulang berkas yang baru saja di-`Edit` untuk "memastikan" — Edit
  sudah gagal kalau tidak cocok.
- Jangan panggil subagent kecuali user memintanya. Pekerjaan di repo ini hampir
  selalu terpusat di satu berkas; subagent hanya mengulang penelusuran yang
  sudah selesai.
- Berkas sementara → direktori scratchpad sesi, bukan repo.
