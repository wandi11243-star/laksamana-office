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

Modul: `marketing` `reservasi` `event` `bd` `konten` `hr` `akademi` `finance`
`radar` `stock` `howandi_life` `jadwal` `dw` — plus `absensi`, yang letaknya
BERBEDA (lihat di bawah).

### Modul berpanel: `stock` dan `finance`

Dua modul TIDAK berbentuk satu `index.html`. `deploy/<modul>/index.html`-nya
adalah **pemilih panel** (~280 baris, tanpa aplikasi di dalamnya), dan
aplikasinya ada satu tingkat lebih dalam:

```
deploy/stock/index.html          pemilih   →  ordering/ purchasing/ tree/ usage/
deploy/finance/index.html        pemilih   →  omset/ kas/
deploy/finance/omset/index.html  BEKAS deploy/kompas/  (izin 'kompas')
deploy/finance/kas/index.html    BEKAS deploy/finance/ (izin 'finance')
```

**`kompas` sudah bukan modul.** Sejak 11 Agustus 2026 ia masuk ke `finance`
sebagai panel `omset`; `deploy/kompas/index.html` tinggal halaman pengalih
(alamat lama sudah tersebar sebagai pintasan di HP kasir). Kunci izinnya tetap
`kompas` — dua panel, dua kunci, supaya kasir yang mengisi omset tidak dengan
sendirinya melihat kas kecil perusahaan.

Konsekuensi yang paling sering menggigit: **seluruh jalur relatif di kedua
panel itu `../../`, bukan `../`** (`../../account-api-mysql/api.php`,
`../../assets/`, `location.replace('../../')`). Yang tertinggal satu tingkat
tidak melempar — ia memulangkan halaman 404 server, dan yang sampai ke layar
cuma "balasan bukan JSON".

`jadwal` (Jadwal Shift, Agustus 2026) dan `dw` (Daily Worker, Agustus 2026)
adalah dua modul yang **tidak** memakai pola `save()` kirim-seluruh-state: tiap
divisi punya head sendiri yang menyusun jadwal minggu depan di waktu berdekatan,
jadi blob satu baris membuat head yang menyimpan belakangan menghapus kerja head
lain tanpa error. Penulisannya granular per baris — `simpanSel` di jadwal,
`simpanAjuan`/`putusAjuan` di dw. Jangan "rapikan" kembali jadi `saveAll`.

### `dw` ↔ `jadwal`: satu arah, dan sengaja begitu

`dw` menyimpan pekerja harian (part time). Mereka **bukan** user Office — tidak
ada di `account-mysql`, tidak muncul di `listDivisiRoster`, dan **tidak punya
akun sama sekali**: sejak 14 Agustus 2026 gerbang no HP + PIN (`loginDW`)
dicabut seluruhnya. Alurnya sekarang **head mengajukan kebutuhan divisinya,
HRD menyetujui lalu menunjuk siapa yang dipakai**; orangnya dikabari lewat
WhatsApp. Itu sebabnya `dw` tetap punya tabel orang sendiri (`dw_pekerja`)
padahal `jadwal` sengaja tidak punya: mendaftarkan puluhan part-timer sebagai
user Office akan mencemari roster **setiap** modul.

Ajuan yang sudah `DISETUJUI` muncul di kalender `jadwal`. Yang terjadi adalah
**pembacaan**, bukan penyalinan baris ke `jadwal_sel`:

```
deploy/jadwal/index.html  →  GET ../dw-api-mysql/api.php?action=jadwalDW&dari=&sampai=
                          →  DW_ROWS  →  blokDW()  →  baris di bawah kru tetap
```

Konsekuensi yang harus dijaga saat menyunting keduanya:

- **Kode divisi (`bar` `kitchen` `floor` `cashier`) wajib identik** di `DIVISI`
  kedua modul. Mengganti salah satu membuat DW divisi itu hilang dari lembarnya
  tanpa error apa pun, dan tidak ada tempat yang melaporkannya.
- `muatDW()` di jadwal **tidak pernah melempar**. Backend `dw` yang mati tidak
  boleh membuat lembar kru tetap ikut blank — paling jauh satu baris peringatan
  (`panelGagalDW()`).
- Baris DW di lembar jadwal **read-only**. Yang mengubahnya HR di modul `dw`.
- `jadwalDW` sengaja tidak membalas `no_hp`. Modul jadwal dibuka seluruh kru
  yang punya akses jadwal.
- Semua backend memakai `PDO::ATTR_EMULATE_PREPARES => false`, jadi penanda
  bernama diikat **berdasarkan posisi**: satu nama yang dipakai dua kali dalam
  satu `prepare()` gagal dengan `SQLSTATE[HY093]` yang tidak menyebut kolom apa
  pun. Sudah kejadian 5 Agustus 2026 di `simpan_pekerja`.

### Hak akses DUA modul ini ditegakkan di SERVER (sejak 14 Agustus 2026)

Beda dengan modul lain, `dw` dan `jadwal` **tidak** lagi menjaga hak akses cuma
di layar. Tiap permintaan wajib membawa `sesi` (token sesi Office dari
`lm_session`); backend menanyakannya
balik ke `account-api?action=whoami` **server-ke-server** lewat
`<modul>-mysql/lib_sesi.php` — **berkas kembar, dua salinan identik**, kalau
salah satu disunting yang lain harus ikut.

Aturannya, dan ini yang tidak boleh dilonggarkan tanpa sengaja:

| | boleh |
|---|---|
| DW — memutuskan (setujui/tolak, talent pool, tandai bayar, **tugaskanDW**) | **HRD saja** (`dw_hrd`). Daftar `hr` kosong = semua pemegang modul dianggap HRD **KECUALI head divisi** — tanpa pengecualian itu setiap head jadi HRD begitu ia ikut memegang kunci modul, dan pembagian "head meminta, HRD memenuhi" runtuh diam-diam |
| DW — minta DW (`simpanPermintaan`) & tunjuk orang langsung (`simpanAjuan`) | **head divisi ITU** atau HRD (`wajib_minta`) |
| DW — `simpanSetting` | HRD, tapi daftar `hr` dipertahankan server kalau bukan admin modul |
| DW — MELIHAT seluruh isi modul | HRD **dan head divisi** (`dw_boleh_lihat`); peran dihitung server & dikirim sebagai `data.peran`, layar tidak menyimpulkannya sendiri |
| akses modul `dw` di Office | otomatis untuk Tim HRD/CEO, admin modul, Admin Akses, **dan head divisi** — head-nya ditanyakan ke `jadwal-api?action=headIds`, lazy + cache + gagal = kosong |
| akses modul `jadwal` di Office | **otomatis** untuk Tim Kitchen/Bar/Floor/Cashier/HRD/CEO + admin modul (`modul_bawaan_untuk`) — tidak perlu dicentang |
| Jadwal — tulis/hapus sel, putus pengajuan | **head divisi kru itu** (`jdw_wajib_boleh_baris`, diperiksa PER BARIS) |
| Jadwal — `simpanSetting` | admin modul saja (blob-nya memuat daftar head) |

**Matriks halaman × peran DW bisa disetel** (19 Agustus 2026) — `setting.akses`
`{halaman:{peran:0|1}}`, disunting admin modul di halaman Hak Akses. Yang perlu
diingat sebelum menyentuhnya:

- Ia **hanya mengubah halaman mana yang terlihat**. Siapa yang boleh
  MEMUTUSKAN tetap tabel di atas, dan tetap diperiksa server.
- Disimpan sebagai **selisih** dari `bolehBukaBawaan()`, bukan salinan penuh —
  salinan penuh membekukan aturan hari ini, sehingga halaman baru tidak pernah
  sampai ke pemasangan yang sudah jalan.
- `HALAMAN_KUNCI = ['akses']` tidak bisa dilonggarkan: yang bisa membukanya
  bisa mengubah matriksnya sendiri.
- `simpan_setting` **mempertahankan `akses`** persis seperti `hr` kalau yang
  menyimpan bukan admin modul. Tanpa itu penguncian cuma berlaku di layar.
- `bolehBuka()` menggabungkan SELURUH peran yang dipegang orangnya (dan `staf`
  selalu ikut). Melonggarkan sebuah baris untuk Staf = melonggarkannya untuk
  semua orang; itu disengaja, kalau tidak head bisa KEHILANGAN halaman gara-gara
  admin membukanya untuk staf.

Sengaja **tetap terbuka**: `ping`, `stats`, `jadwalDW`, `shiftHari`, `headIds`, `probeTulis`.
`probeTulis` dipakai langkah Verifikasi kedua workflow FTP — probe lama memakai
`simpanSel`, dan begitu itu dijaga sesi **seluruh deploy gagal**. Dua yang
terakhir dipanggil backend Absensi server-ke-server, yang `config.php`-nya cuma
bisa disunting manual di cPanel — menutupnya mematikan absensi kedua situs
tanpa satu pun galat yang menyebut sebabnya.

`ACCOUNT_API_URL` **tidak perlu diisi**: alamatnya diturunkan dari `SERVER_NAME`
(bukan `HTTP_HOST`, yang bisa dipalsukan), jadi tidak ada langkah cPanel saat
mendarat. Yang berubah untuk pemakai: sesi Office lama yang belum menyimpan
`token` akan mendapat gerbang "Sesi berakhir" — satu kali masuk ulang, bukan
modul yang mati.

Ujinya **wajib dijalankan** setelah menyentuh salah satu penjaga itu:

```bash
node tools/uji-hak-akses.js     # 74 pemeriksaan, butuh php + pdo_sqlite di PATH
```

Ia menjalankan kedua API sungguhan lewat `php -S` dengan account-api tiruan
berisi lima peran (admin / HRD / staf biasa / head Bar / salah-centang). Hak akses adalah
satu-satunya bagian repo ini yang **kegagalannya tidak terlihat dari layar** —
penjaga yang longgar tidak menampilkan apa pun yang aneh.
- Kunci unik yang menahan bug diam-diam: `dw_pekerja.no_hp` (satu orang satu
  baris, riwayat no-show tidak pecah).

### DW: SATU ORANG BEBERAPA DIVISI & POSISI (19 Agustus 2026)

`dw_pekerja.divisi` dan `.posisi` sekarang **CSV**, bukan satu nilai —
`"floor,bar"`. **Yang pertama adalah yang utama**: itulah yang dipakai saat
sebuah pintu menjadwalkan orang tanpa menyebut divisinya, dan itu yang tampil
sebagai identitasnya di daftar. Kolomnya diperlebar otomatis oleh
`pastikan_lebar()` (VARCHAR 120/240) — tanpa itu MySQL **memotong diam-diam**.

- Layar: `divPekerja()` / `posPekerja()` / `punyaDiv()` / `punyaPos()` /
  `divUtama()` / `posUtama()`. **Jangan** bandingkan `p.divisi === div` lagi —
  orang berdivisi `"bar,floor"` tidak akan pernah cocok dengan satu pun.
- **`dw_ajuan.divisi`/`.posisi` TETAP TUNGGAL.** `simpan_ajuan` memakai
  `csv_utama()` saat mewarisi dari master; menyalin CSV ke sana tidak melempar
  apa pun — barisnya cuma tidak pernah cocok dengan lembar divisi mana pun,
  di sini maupun di modul Jadwal Shift, dan orangnya lenyap dari kalender.
- Tiap pintu yang menjadwalkan memilih posisi **yang berlaku di divisi itu**,
  bukan posisi pertama: posisi yang tidak berlaku membuat `tarifPosisi()`
  memulangkan 0, dan salahnya muncul sebagai uang.

### DW: HEAD TIDAK MELIHAT ANGKA UANG (19 Agustus 2026)

`bolehLihatUang()` = `isHR()`, satu penjaga untuk seluruh modul. Yang
disembunyikan: estimasi biaya di form Minta, kolom & kotak Est. Biaya di
Dashboard/Kalender, kolom & kotak Upah di Rekap Pegawai, chip upah di
`barisAjuan`, "Estimasi biaya" di modal detail ajuan, **dan baris kaki berkas
Excel ekspor kalender**. Yang terakhir paling mudah terlewat — tidak ada yang
membuka berkas ekspor untuk memeriksa apa ia menyembunyikan sesuatu.

Halaman yang perlu dijaga adalah yang terbuka untuk head: `dashboard`, `tamu`,
`kalender`, `rekap`, `pekerja`. `antrean`/`bayar`/`pengaturan`/`akses` sudah
HRD-only lewat `bolehBuka()`.

Yang disembunyikan hanya **tampilannya**; `S.setting.tarif` tetap ikut dalam
balasan API. Kalau tarif harus benar-benar dirahasiakan dari head, yang perlu
diubah `baca_semua()` di server.

### DW: DOBEL SHIFT SEHARI diizinkan (19 Agustus 2026)

`dw_ajuan (dw_id, tgl)` **sudah bukan kunci unik**. Sampai 19 Agustus 2026 ia
memaksa satu DW punya paling banyak satu shift per hari, dan kunci itulah —
bukan aturan lapangan — yang membuat kandidat "sudah terjadwal" dimatikan
centangnya. Sekarang Bar 11:00–17:00 lalu Floor 18:00–23:00 di hari yang sama
adalah hal yang sah. Yang tetap mustahil cuma **jam yang bertindih**.

Yang ikut berubah, dan semuanya harus dijaga bersama:

- Penjaganya `bentrok_ajuan_row()` (backend) ↔ `bentrokOrangJam()` (layar).
  **Keduanya memeriksa TIGA hari** (kemarin/hari ini/besok) karena shift lewat
  tengah malam. Kalau salah satu diubah, yang lain harus ikut — yang lolos di
  layar akan ditolak backend dengan pesan yang datang sesudah form ditutup.
- `timpa` **tidak lagi menimpa dengan sendirinya**. Dulu INSERT jatuh ke baris
  yang sama karena kunci uniknya; sekarang `simpan_ajuan` harus menunjuk id
  baris bentrok secara eksplisit, kalau tidak "timpa" justru melahirkan shift
  kedua yang bertindih — kebalikan persis dari yang diminta orangnya.
- `lembarDW().peta[dwId|tgl]` sekarang **array**, bukan satu objek.
- **Absensi ikut**: `shift_hari('DW',…)` menerima menit ketukan dan memilih
  shift yang paling pas. Tanpa itu yang terambil selalu baris pertama —
  ketukan 18:05 dihitung terhadap shift pagi, tercatat telat 7 jam, dan
  salahnya muncul sebagai **uang**, bukan sebagai galat.
- Indeksnya dicabut lewat `cabut_indeks()` di `pastikan_tabel()`, **bukan**
  berkas migrasi: migrasi tidak ikut ter-deploy dan produksi rutin tertinggal.

### DW: shift dasar & tambahan shift panjang (19 Agustus 2026)

Tarif per posisi = harga **satu shift dasar** (`setting.jamDasar`, bawaan 6 jam).
Dua akibatnya, dan keduanya disetel HRD di Pengaturan:

- Permintaan yang **jam mulainya di luar shift siap pakai** langsung diisikan
  jam selesainya sepanjang shift dasar (`serapMinta`, hanya saat jam MULAI yang
  berubah — yang menyunting jam selesai dengan sengaja tidak boleh ditimpa).
- Shift **lebih panjang dari `jamDasar`** dapat tambahan sekali jalan
  (`setting.tambahanPanjang`, bawaan 20.000) lewat `tambahanJam()` → masuk ke
  `biayaAjuan()`, jadi seluruh halaman uang ikut sendiri.

`setting.jamBatas` (bawaan 12) **tidak mengubah harga** — ia cuma memunculkan
peringatan "sebaiknya dipecah dua shift". Jangan "melengkapinya" jadi batas
atas tambahan: kalau di atas 12 jam tarifnya kembali polos, shift 13 jam jadi
LEBIH MURAH daripada shift 7 jam, dan salah seperti itu muncul sebagai uang.

Uang di modul ini dihitung **frontend saja** — tidak ada satu pun tarif di PHP.

### DW: Kalender Tamu membaca TIGA modul (19 Agustus 2026)

`TAMU_SUMBER` = Marketing + Event + **Reservasi**. Total pax di layar adalah
gabungan ketiganya. Tapi `konteksHari()` — yang menentukan panduan jumlah DW —
sengaja memakai **`paxAcaraTgl()`, bukan `paxTgl()`**: venue ini hampir selalu
punya reservasi, jadi kalau ikut dijumlahkan maka setiap hari jadi "hari
event" dan seluruh kolom kuota di Pengaturan berubah arti tanpa ada yang
mengubahnya.

### Tim HRD otomatis admin modul Roster (19 Agustus 2026)

`admin_modul_untuk()` di account-api menambahkan `jadwal` + `dw` untuk user
yang kolom Tim-nya memuat `hrd`/`hr`. **CEO tidak ikut** (ia perlu membaca
jadwal, bukan menyetel tarif). Tidak ada tabel deny untuk `admins`, jadi
aturan ini tidak bisa ditimpa per orang — cara mencabutnya mengubah kolom Tim,
dan Kelola Akses menuliskannya di kotak yang bersangkutan.

### DW: satu formulir, dua cara meminta (sejak 14 Agustus 2026)

Halaman **Ajukan Jadwal dihapus**. Ia pintu kedua ke tujuan yang sama dan
menulis langsung ke jadwal **tanpa melewati HRD** — kebalikan dari pembagian
yang justru sedang ditegakkan. Yang menggantikannya: satu form `bukaMinta()`
dengan centang *"saya sudah tahu orangnya"*.

- Nama yang dicentang head tersimpan sebagai **`dw_permintaan.usulan`** (CSV
  id, kolom sendiri), **bukan** baris `dw_ajuan`. Kalau langsung jadi ajuan,
  head efektif menjadwalkan sendiri. HRD menekan **Setujui** → jalur
  `tugaskanDW` yang sama dengan modal Tunjuk.
- Server **menyaring usulan**: id yang tidak ada / `NONAKTIF` dibuang, dan
  dipotong sebanyak `jumlah`. Usulan yang lebih banyak dari kebutuhan berarti
  head menaikkan anggarannya sendiri tanpa menyebutkannya.
- **Posisi terikat divisi**, dan sejak 14 Agustus 2026 **disimpan di
  `setting.posisiDivisi`** ({divisi: [posisi]}) yang bisa ditambah/dihapus HRD
  di Pengaturan → Posisi per Divisi. `POSISI_DIVISI` cuma nilai bawaannya.
  `posisiSemua()` (gabungan) dipakai tabel Tarif — tarif memang satu daftar
  untuk semua divisi. `normalPosisiDivisi()` memigrasi `setting.posisi` lama:
  posisi buatan sendiri masuk ke SEMUA divisi (tidak ada keterangan tersimpan
  yang bisa menebak divisinya), `POSISI_CABUT` (Runner, Event Crew) dibuang.
  Ejaan `Waiter/Waitress` dan `Dishwasher` **sengaja dipertahankan** — string
  itulah kunci `setting.tarif` dan isi `dw_pekerja.posisi`; menggantinya
  membuat `tarifPosisi()` memulangkan 0 tanpa satu pun galat, dan salahnya
  muncul sebagai uang. `opsiPosisi(div, terpilih)` tetap menggambar nilai lama
  yang sudah dihapus, ditandai `(lama)` — kalau tidak, membuka form seorang DW
  berposisi lama diam-diam mengganti posisinya (dan tarifnya) saat Simpan.
- Modal **Tunjuk** HRD ikut disaring posisi, dan pilihannya **dibatasi**
  sebanyak yang diminta (dulu cuma diberi pita peringatan lalu tetap dikirim).
- `kandidatDW(divisi, posisi, urut)` satu sumber untuk kedua daftar. Urutan
  **beda dan memang harus beda**: head `'sering'` (yang ia kenal kerjanya),
  HRD `'lama'` (menjaga giliran). **Tidak ada pelonggaran** — sempat dibuat
  melebar sendiri saat tak seorang pun cocok, dan hasilnya permintaan Cashier
  menampilkan Kitchen Helper lengkap dengan centangnya. Kosongnya dijelaskan
  `kosongKandidatHTML()`, yang membedakan "tidak ada yang berposisi itu" dari
  "divisinya memang belum punya siapa-siapa" — dua masalah dengan dua jalan
  keluar yang berbeda.

### DW: satu meja HRD, satu meja head (14 Agustus 2026)

| halaman | siapa | isinya |
|---|---|---|
| **Antrean Pengajuan** | **HRD saja** (`bolehBuka('antrean') = isHR()`) | permintaan head **dan** pengajuan DW dalam satu tabel, dibedakan kolom Jenis |
| **Permintaan DW** | **head saja** (`isHeadDW() && !isHR()`) | permintaan divisinya sendiri + putusannya, tanpa tombol putusan |

Digabung karena yang punya dua meja masuk selalu lupa membuka salah satunya:
permintaan untuk Sabtu bisa menganggur tiga hari sementara HRD merasa
antreannya kosong. HRD **tidak** melihat menu Permintaan DW — isinya sudah ada
di Antrean miliknya, dan dua pintu ke daftar yang sama membuat ia memutuskan di
satu tempat lalu mencarinya lagi di tempat lain.

`Setujui semua` di baris kepala tanggal hanya menyapu **pengajuan**, tidak
permintaan: tiap permintaan perlu diputuskan siapa orangnya, dan tombol yang
menyapu keduanya melewati justru bagian yang butuh dipikirkan.

Antrian ↔ Riwayat dipisah menurut **masih ada pekerjaannya atau tidak**
(`entriPerluDikerjakan`), **bukan** menurut status. Permintaan `DISETUJUI` yang
orangnya belum lengkap ("0 dari 1", terjadi begitu penugasannya ditolak/ditarik)
masuk **Antrian**: selama pemisahnya status, baris itu duduk di Riwayat lengkap
dengan tombol Setuju & Pilih DW-nya sementara Antrian menulis 0 — pekerjaan yang
disembunyikan di balik tab bernama Riwayat, dan yang terlewat adalah shift yang
malam itu kurang orang. Lencana sidebar memakai fungsi yang sama
(`antreanPerluDikerjakan`); dulu ia cuma menghitung ajuan `MENUNGGU`.

Di **Riwayat**, permintaan yang **terpenuhi penuh** tidak diulang
(`mintaTerwakiliAjuan`): baris penugasannya menceritakan hal yang sama dengan
lebih lengkap, dan dua baris untuk satu shift membuat kolom Upah terbaca dua
kali. Jejak "dari permintaan `<head>`" pindah ke baris penugasannya
(`asalPermintaanHTML`). `viewPermintaan` (halaman head) **sengaja tetap memakai
status** — di sana pertanyaannya "sudah diputuskan atau belum".

**Putusan bisa ditarik** (`kembalikanAjuan` / `kembalikanPermintaan`, HRD saja):
statusnya kembali `MENUNGGU`, catatan putusan lama dibuang, `putus_oleh`/`putus_at`
ditimpa dan tergambar sebagai "dikembalikan `<nama>`" (`kataPutusan('MENUNGGU')`).
Backend sudah menerima `MENUNGGU` sejak awal — tidak ada endpoint baru.
Permintaan **ditahan** kalau masih punya penugasan hidup: `kurang` jadi nol, jadi
Setuju & Pilih DW tidak muncul satu pun dan barisnya duduk di antrean selamanya.

Uang satu orang satu shift dihitung **satu tempat**: `biayaSatuOrang()` →
`biayaAjuan()` dan `biayaPermintaan()`. Sempat dua tempat, dan yang di baris
permintaan tertinggal saat tambahan shift panjang lahir — Antrean menulis
Rp 50.000 untuk shift yang ditagih Rp 70.000 begitu orangnya ditugaskan.

### DW: `KEDALUWARSA` ditulis saat DIBACA, bukan lewat cron

`tutup_kedaluwarsa()` dipanggil di awal `baca_semua()`: permintaan & ajuan
`MENUNGGU` yang tanggalnya sudah lewat jadi `KEDALUWARSA`, `putus_oleh` =
`(sistem)`. Bukan cron — hosting ini tidak punya penjadwal yang bisa
diandalkan, dan penutupan yang bergantung pada cron yang mati adalah
penutupan yang tidak pernah terjadi. Idempoten, jadi dipanggil seratus kali
sehari pun sama saja. Bukan `DITOLAK`: tidak ada manusia yang menolaknya.
Hari ini dihitung **WIB**, kalau UTC maka setiap sore lewat 17.00 permintaan
untuk HARI INI ikut tertutup.

### `absensi` — SATU-SATUNYA modul yang TIDAK di bawah `deploy/`

```
absensi/                    ← FRONTEND (PWA)  -> /public_html/absensi/
                               = absensi.laksamanamuda.id
                               (dev: dev.laksamanamuda.id/absensi/)
absensi-mysql/              ← BACKEND         -> /public_html/absensi/api/
                               dipanggil sebagai 'api/api.php' — DI DALAM,
                               bukan folder tetangga
```

Dua hal yang akan membuang waktu kalau tidak diketahui lebih dulu:

- **`absensi/` bukan di `deploy/`.** Ia berdiri sebagai situs sendiri di
  subdomain sendiri. Backend-nya DI DALAM (`api/api.php`), bukan sejajar
  seperti ticketing: kalau docroot subdomain adalah `/public_html/absensi/`,
  maka `../` menunjuk ke luar docroot dan tidak bisa dicapai lewat host itu.
- **Punya job SENDIRI di KEDUA workflow.** `deploy.yml` hanya untuk `main`,
  `deploy-dev.yml` hanya untuk `develop` — menambah modul di satu berkas saja
  membuat push ke cabang satunya tidak menghasilkan apa pun, tanpa galat.
  Sudah kejadian saat modul ini lahir.
- **Sesi Office tidak terbaca dari sana.** `localStorage` terikat origin, jadi
  `lm_session` milik `team.laksamanamuda.id` tidak ada di subdomain absensi.
  Modul ini punya login sendiri (kunci `lm_absensi_sesi`, 30 hari) yang
  **diteruskan backend-nya** ke `account-api` lewat `action=masuk` — akun tetap
  akun Office yang sama, tapi peramban tidak pernah menyentuh API akun langsung.
- **`ACCOUNT_API_URL` / `JADWAL_API_URL` / `DW_API_URL` WAJIB diisi di
  `config.php`.** Modul lain menebaknya dari host yang melayani; di subdomain
  sendiri tebakan itu salah dan tidak menimbulkan galat — absensi dev akan
  menghitung telat terhadap jadwal produksi dengan angka yang terlihat wajar.

Absensi **membaca** shift, tidak menyalinnya: `jadwal-api-mysql?action=shiftHari`
(kru tetap) dan `dw-api-mysql?action=jadwalDW` (pekerja harian). `shiftHari`
adalah endpoint sempit yang dibuat khusus untuk ini — jangan diganti `getAll`,
yang memulangkan seluruh sel + 200 pengajuan tiap kali orang menekan tombol.

`shift_hari()` memulangkan **tiga** keadaan, dan bedanya menentukan apakah
seluruh absensi hari itu masuk antrean HR: `array` (ketemu), `null` (modulnya
menjawab, orangnya memang tidak dijadwalkan), `false` (modulnya **tidak
menjawab**). Yang `false` **tidak** diantrekan — kalau disamakan dengan `null`,
satu gangguan di modul Jadwal mengirim setiap ketukan hari itu ke antrean
persetujuan tanpa satu pun pesan yang menyebut sebabnya. Jejaknya disimpan di
`shift_sumber` = `TAK_TERBACA`.

Lembur & pulang-cepat dihitung dari **lama kerja sungguhan** (`durasi`, dari
selisih dua stempel waktu), bukan dari menebak tanggal jam pulang. Tebakan lama
(`jam_pulang + 720 < jam_mulai`) tidak pernah menyala untuk shift pagi, jadi kru
pagi yang pulang lewat tengah malam tercatat **pulang cepat 16 jam**.

Yang **tidak** disimpan, dan jangan "dioptimalkan" jadi disimpan: telat, lembur,
durasi kerja. Semuanya dihitung ulang dari ketukan + shift tiap kali dibaca,
karena shift bisa berubah sesudah absen dan pengajuan bisa disetujui
berhari-hari kemudian.

Berkas berat yang memang harus ikut ter-deploy: `absensi/vendor/face-api.min.js`
(1,3 MB) dan `absensi/models/` (6,5 MB). Tanpa model, pengenalan wajah mati
total tanpa satu pun pesan galat.

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

### Graphify — untuk pertanyaan "siapa yang memanggil ini"

`Grep` menjawab **"di mana"**. Yang mahal justru **"apa saja yang ikut rusak
kalau ini kuubah"** — itu butuh beberapa `Grep` beruntun, dan gampang ada yang
terlewat. Untuk itu ada graf panggilan yang sudah terpasang:

```bash
graphify affected "infoCK" --depth 2   # siapa saja yang terdampak (radius perubahan)
graphify explain  "viewBreakdown"      # pemanggil + yang dipanggil + nomor baris
graphify update .                      # bangun ulang graf (tanpa LLM, tanpa biaya)
```

**Nomor baris yang dilaporkan graphify LANGSUNG dipakai.** `explain` menjawab
`tools/graph-src/finance.omset.js L1497`, dan baris **1497** di
`deploy/finance/omset/index.html` memang `function viewBreakdown(){`. Berkas kerangka
itu ditulis sejajar baris demi baris dengan aslinya justru untuk ini — jadi
`explain` lalu `Read` dengan `offset` itu, tanpa `Grep` sama sekali.

**Kapan TIDAK usah dipakai:** kalau cuma mau menemukan satu fitur, `Grep` teks
yang dilihat user tetap yang tercepat. Graf tidak tahu apa-apa soal string HTML,
teks tombol, atau CSS.

**Yang perlu diketahui soal berkas kerangka di `tools/graph-src/`:**

- Isinya **turunan**, dihasilkan `tools/graph-src.ps1`. **Jangan pernah
  disunting**, dan jangan tertukar saat `Grep` — kode sebenarnya ada di
  `deploy/<modul>/index.html`. Isinya sengaja cuma tanda tangan fungsi +
  panggilannya (tanpa badan fungsi) supaya hasil `Grep` tidak berlipat dua.
- graphify **menghormati `.gitignore`** (sudah diuji 31 Juli 2026), jadi
  kerangkanya wajib ter-track — tidak bisa disembunyikan di direktori terabaikan.
- **Perbarui setelah menambah/menghapus/mengganti nama fungsi**, kalau tidak
  grafnya berbohong — dan graf yang berbohong lebih berbahaya daripada tidak ada
  graf, karena ia dipercaya:

  ```bash
  powershell -ExecutionPolicy Bypass -File tools/graph-src.ps1
  graphify update .
  ```

- `graphify-out/` **tidak** masuk repo (sudah di `.gitignore`) — ia keluaran
  mesin, ukurannya megabyte, dan bisa dibangun ulang kapan saja. `tools/`
  maupun `graphify-out/` tidak pernah ikut ter-deploy: workflow FTP hanya
  mengunggah `deploy/` dan `<modul>-mysql/`.

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
| `marketing` | 22 halaman dirender satu per satu + wadah render tidak kosong |
| `event` | 10 halaman dirender + wadah render tidak kosong |
| `jadwal` | 5 halaman dirender + wadah render tidak kosong |
| `finance.omset` | 12 halaman dirender (wadahnya tak dikenali, jadi hanya "tidak melempar") |
| `cashier` | 6 halaman dirender (wadah tak dikenali) |
| sisanya | hanya boot — router/daftar halamannya tidak terbaca dari luar |

Harness mengenali **dua gaya router**: `go(view)` (marketing dkk) dan
`router()` + `location.hash = '#/<halaman>'` (modul Event). Modul dengan router
lain tetap dilaporkan apa adanya sebagai "hanya boot", bukan diam-diam
dianggap lulus. State disiapkan untuk dua penamaan: `S` (normalizeState+seed)
dan `DB` (normalize({})).

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

### `tools/uji-qr.js` — kalau menyentuh QR tiket

Pembuat QR ada **dua kali** di repo ini, dan itu disengaja: versi JS di
`deploy/ticketing/index.html` (menggambar QR di layar) dan versi PHP di
`ticketing-mysql/lib_qr.php` (menggambar QR di lampiran PDF, dibuat di server
saat pesanan dilunaskan). Keduanya **harus** memulangkan matriks yang sama
persis untuk teks yang sama.

Kalau menyimpang, tidak ada galat sama sekali — yang terjadi cuma petugas
gagal memindai lembar cetak di pintu masuk, malam acara. Karena itu ada
pembanding otomatis:

```bash
node tools/uji-qr.js        # butuh `php` di PATH; kalau tidak ada, ia melewat, bukan gagal
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
