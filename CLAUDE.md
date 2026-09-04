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
`analytics`
`radar` `stock` `howandi_life` `jadwal` `dw` — plus `absensi`, yang letaknya
BERBEDA (lihat di bawah).

### Modul berpanel: `stock` dan `finance`

Dua modul TIDAK berbentuk satu `index.html`. `deploy/<modul>/index.html`-nya
adalah **pemilih panel** (~280 baris, tanpa aplikasi di dalamnya), dan
aplikasinya ada satu tingkat lebih dalam:

```
deploy/stock/index.html          pemilih   →  ordering/ purchasing/ tree/ usage/ hpp/
deploy/stock/hpp/index.html      HPP & Resep, izin SENDIRI 'hpp' (bukan 'stock')
deploy/finance/index.html        pemilih   →  omset/ kas/
deploy/finance/omset/index.html  BEKAS deploy/kompas/  (izin 'kompas')
deploy/finance/kas/index.html    BEKAS deploy/finance/ (izin 'finance')
```

### Modul berpanel `finance` sekarang TIGA panel

```
deploy/finance/index.html          pemilih  →  omset/ kas/ brankas/
deploy/finance/omset/index.html    BEKAS deploy/kompas/  (izin 'kompas')
deploy/finance/kas/index.html      BEKAS deploy/finance/ (izin 'finance')
deploy/finance/brankas/index.html  BARU 27 Agu 2026      (izin 'brankas')
```

**Brankas** — posisi kas perusahaan per bank, piutang, rencana pembayaran, dan
pengembalian modal investor. Asalnya berkas mandiri `Laksamana_Muda_BRANKAS.html`
(localStorage + PIN CFO/CEO + seluruh angkanya karangan); ketiganya dicabut saat
masuk ke sini.

**Kunci izinnya `brankas`, SENGAJA tidak dilebur ke `finance`.** Yang memegang
kas kecil tidak dengan sendirinya melihat posisi kas seluruh perusahaan dan
pengembalian modal investor — dan justru itu alasan panel ini berdiri sendiri.
Kuncinya harus disebut di **empat** tempat, dan yang terlewat gagal diam-diam:
penjaga `<head>` pemilih, `sesiOffice()` di badan pemilih, `panelBoleh()`, dan
`PANEL_URL`.

**SALDO REKENING TIDAK PERNAH DIKETIK.** Ia dihitung dari **Aktual Masuk** tiap
metode pembayaran di Rekap Penjualan:

```
kotor = Σ reports[tgl].pay[k].actual
akt   = aktual yang DIKETIK (reports[tgl].aktual[grup])   kalau ada
      = kotor − MDR tersimpan (reports[tgl].mdr[grup])    kalau tidak
tanpa MDR (cash, transfer) → akt = kotor
```

- `aktGrup()` adalah **BERKAS KEMBAR** `rkHitung()` di `deploy/finance/kas/`.
  Kalau di sana berubah, di sini HARUS ikut — dua rumus untuk satu angka berarti
  Saldo & Rekening bisa menyebut angka lain daripada Rekap Penjualan untuk hari
  yang sama, dan yang mencari sebabnya akan mengira uangnya hilang.
- MDR & aktual tersimpan **di dalam `reports[tgl]` sendiri**, bukan di kunci
  terpisah. Membaca kunci yang salah memulangkan saldo NOL tanpa satu pun galat
  — `kotor − 0` tetap kotor, dan angkanya kelihatan masuk akal.
- Kelompok `error_*` **tidak ada** di daftar: ia catatan salah input, bukan uang.
**METODE PEMBAYARAN BARU HARUS DIDAFTARKAN DI LIMA TEMPAT** (TikTok Go, 29
Agustus 2026). Yang terlewat gagal dengan cara yang berbeda-beda, dan tidak
satu pun melempar galat:

| tempat | kalau terlewat |
|---|---|
| `PAYS` di `deploy/cashier/`, `deploy/finance/omset/`, `deploy/finance/kas/` | kasir tidak punya kotak untuk mengetiknya |
| `RK_GRUP` di `deploy/finance/kas/` | tidak muncul di Rekap Penjualan |
| `RK_GRUP` **kembar** di `deploy/finance/brankas/` | uangnya tidak pernah masuk saldo bank mana pun |
| `MAP_BAWAAN` di brankas | metodenya menggantung — dilaporkan di halaman Saldo (jaring terakhir) |
| `$grup` di `kompas-mysql` | penanda dilaporkan sebagai `takDikenal` |
| `$bank` di `kompas-mysql` | **MDR yang diketik DIBUANG DIAM-DIAM** |

Yang terakhir paling berbahaya: daftar `$bank` tertutup, jadi menambah ojol
baru di frontend tanpa menambahnya di sana membuat potongan komisi yang sudah
diketik hilang tanpa satu pun pesan — dan saldo banknya jadi lebih besar
daripada yang benar-benar diterima.

Kuncinya ditulis **serangkai tanpa pemisah** (`gofood`, `grabfood`, `tiktokgo`)
— nama merek di daftar itu memang begitu, dan satu kunci yang pakai garis bawah
membuat orang berikutnya harus mengingat mana yang mana.

- **Setoran cash** (`rekap_setoran`) menambah bank tujuan dan mengurangi brankas
  fisik. `tujuan` teks bebas, jadi yang tidak cocok dengan BRI/Mandiri/BCA/UOB
  **dilaporkan di layar**, bukan dijatuhkan ke bank pertama.
- QR Order, Gofood, Grabfood, dan TikTok Go bawaannya **UOB**, sama dengan Transfer
  (ditetapkan user 27 Agustus 2026). Sempat dibiarkan kosong karena tidak ada
  yang bisa MENEBAK ke rekening mana settlement ojol masuk — tapi jawaban dari
  yang memegang rekeningnya bukan tebakan. Ini bawaan, bukan kunci mati:
  `setting.peta` menimpanya, jadi kalau settlement pindah bank yang diubah
  setelan di Pengaturan. Metode yang tidak punya tujuan tetap **dilaporkan di
  halaman Saldo**; itulah jaringnya kalau suatu hari ada metode baru.

**Piutang DIBACA dari modul Cashier**, tidak diketik di sini (27 Agustus 2026).
Bon tamu dicatat kasir di Cashier → Piutang / Bon, dan blob-nya SAMA dengan
Kompas — jadi sudah ikut di data yang dimuat halaman ini. Halaman Brankas-nya
read-only: bon yang bisa diketik di dua tempat akan punya dua angka berbeda
suatu hari, dan yang mencocokkannya tidak punya cara tahu mana yang benar.

**Mutasi & Transfer Wallet** punya tiga jenis, dan `pindah` adalah SATU baris
yang menyentuh dua wadah — bukan dua baris (keluar dari A, masuk ke B). Dua
baris yang salah satunya terhapus membuat uang perusahaan bertambah atau
hilang tanpa ada yang menyadarinya.

**Setoran cash dari Rekap Penjualan IKUT di Riwayat Mutasi** — dibaca, bukan
disalin. Uangnya memang berpindah wallet, jadi ia mutasi; saldonya sudah
bergeser sejak awal, tapi jejaknya sempat tidak ada di daftar perpindahan
wallet — sehingga perpindahan yang PALING SERING terjadi justru tidak
kelihatan di sana, dan yang menjumlahkan daftarnya mendapat angka yang tidak
cocok dengan saldo. Barisnya **tidak bisa dihapus dari Brankas**: yang
memegang setoran adalah Rekap Penjualan, dan menyalinnya ke `bk_state` berarti
setoran yang dibatalkan di sana meninggalkan mutasi hantu di sini.

**Pengembalian modal menyebut wallet asalnya** (`returns[].dari`). Tanpa itu
saldo rekening tetap utuh padahal uangnya sudah ditransfer ke investor. Baris
lama yang belum punya `dari` TIDAK dijatuhkan ke wadah mana pun — menebaknya
berarti mengurangi rekening yang uangnya tidak pernah keluar dari sana; yang
menggantung dilaporkan lewat `modalTanpaWadah()`.

**Pengembalian modal ikut tampil di halaman investor** sebagai riwayat dividen.
Jalurnya `kompas-api?action=investorRingkas` → `dividen_investor()` → ambil
`finance-api?action=brankasGet` SERVER-KE-SERVER. Dibalik (halaman investor
memanggil finance-api langsung) tidak boleh: finance-api tidak punya
`lib_sesi.php` dan seluruh aksinya terbuka — alamatnya berarti buku kas,
invoice, dan seluruh transaksi harian di HTML yang dibuka orang luar.

> **PLANNING PEMBAYARAN SUDAH PINDAH KE PANEL KAS KECIL** (2 September 2026,
> permintaan user). Halamannya sekarang `deploy/finance/kas/` → menu *Planning
> Pembayaran*, kunci izin **`finance`** — bukan `brankas` lagi. Seluruh
> keterangan bentuk lembar di bawah tetap berlaku, cuma letaknya yang berbeda.
> Rinciannya di bagian **Planning Pembayaran: layar di Kas Kecil, data di
> Brankas** sesudah blok ini.

**Planning Pembayaran berbentuk LEMBAR per tanggal** (28 Agustus 2026), menyalin
lembar Excel pembayaran mingguan: satu `batch` (tanggal bayar) berisi baris yang
dikelompokkan per rekening pembayar, dengan subtotal tiap kelompok.

- **Kelompok rekening DIHITUNG dari kolom `dari`, bukan diketik.** Di Excel judul
  kelompok cuma teks; baris yang nyasar ke kelompok salah tidak pernah ketahuan.
- **Penerima / bank / nomor rekening DIBACA dari Daftar Kontak Vendor di modul
  Purchasing**, tidak disalin. Nomor yang dibetulkan di sana harus langsung
  berlaku di sini — salinan berarti yang mentransfer memakai nomor lama tanpa
  satu pun tanda.
- **`bukti` menyimpan `{ok, at, by}`**, bukan boolean. Centang tanpa jejak tidak
  bisa diaudit, padahal justru kolom itu yang membuktikan uang keluar.
- **`byBayarGrup()` menandai satu kelompok rekening sekaligus** dan menyebut saldo
  sesudahnya. Orang menekan kirim di m-banking sekali untuk beberapa transfer;
  menandainya satu per satu membuat sebagian tertinggal tanpa disadari.
- **Satu lembar isian `.qa-sheet`, bukan form berlabel** (28 Agustus 2026,
  permintaan user). Kepala kolom (`.hd`), baris yang diketik (`.cel`), keterangan
  vendor (`.qa-note`, membentang `1/-1`), dan baris draf (`.qa-sel`) adalah sel di
  **grid yang sama** — jadi kolomnya tidak bisa melenceng satu sama lain.
  Percobaan sebelumnya memakai tiga wadah terpisah dengan lebar disalin tangan,
  dan lebar yang disalin pasti melenceng: judul kolomnya berhenti berada di atas
  kotak yang dimaksudnya. **Enter menambah ke draf.**
- **Kotaknya tidak bergaris sendiri** — yang memisahkan kolom adalah garis
  lembarnya, seperti Excel. Enam kotak bergaris masing-masing membaca sebagai
  enam benda terpisah, padahal yang sedang diisi satu baris ("terlalu kaku",
  koreksi user). Di bawah 860px grid jadi satu kolom dan tiap sel draf menulis
  judul kolomnya sendiri lewat `data-l` — tanpa itu barisnya menumpuk jadi
  deretan angka tanpa keterangan.
- **`DRAF` dikumpulkan dulu, disimpan SEKALI** (`bySimpanDraf`). Menyimpan per
  baris berarti 20 penulisan blob penuh + 20 gambar ulang halaman untuk satu
  lembar; dan kalau yang kesepuluh gagal, sembilan sudah masuk sementara sebelas
  belum, tanpa satu pun tempat yang mengatakan sampai mana. Gagal simpan
  **mengembalikan `BK.data.bayar` DAN drafnya** — baris yang tertinggal di layar
  padahal server tidak menerimanya adalah kegagalan paling mahal di halaman ini.
- **Draf hidup di peramban saja**, dan itu dikatakan di layar + ditahan
  `beforeunload` + konfirmasi saat pindah halaman (`go()` — perpindahan di dalam
  satu halaman tidak pernah sampai ke `beforeunload`). **Sengaja TIDAK ke
  localStorage**: draf yang bertahan berhari-hari di satu perangkat akan disimpan
  orang lain di perangkat lain tanpa tahu isinya sudah basi, dan uang keluar dua
  kali.
- **Kategori & rekening TIDAK dikosongkan sesudah baris masuk** (`QA.cat`,
  `QA.dari`), dan kursor kembali ke kotak Vendor (`QA.fokus`). Keduanya di luar
  DOM karena render di modul ini TOTAL — halaman digambar ulang tiap simpan,
  jadi apa pun yang cuma ada di DOM ikut hilang. Tanpa keduanya, menuangkan 20
  baris berarti dua pilihan + satu klik yang diulang 20 kali.
- **Vendor DIKETIK lewat `<datalist>`**, bukan dipilih dari `<select>`. 36 vendor
  di dropdown berarti menggulir untuk nama yang sudah diketahui sebelum kotaknya
  dibuka. Nama di luar master **tidak ditolak** — baris tanpa vendor memang ada
  di lembar Excel — tapi **dikatakan** di baris bawahnya, supaya salah ketik satu
  huruf tidak lolos diam-diam sebagai vendor baru. Yang tersimpan adalah yang
  DIKETIK; mencocokkannya ke master lalu menimpanya berarti ejaan yang beda tipis
  diganti tanpa yang mengetiknya tahu.
- **Tanggal lembar = tujuan baris berikutnya**, satu kendali. Sempat dua (dropdown
  batch di satu kartu, kotak tanggal di form), dan yang mengisi harus menebak mana
  yang menentukan.
- **Lembar berjalan = tanggal TERBARU, DIHITUNG bukan ditandai.** Tanggal baru
  otomatis mengarsipkan yang sebelumnya (permintaan user). Penanda yang harus
  diperbarui manual akan melenceng, dan lembar minggu lalu yang lupa ditandai
  terus menerima baris minggu ini tanpa satu pun tanda.
- **Lembar arsip tidak langsung menerima baris baru** — stripnya disembunyikan,
  diganti penjelasan + tombol ke lembar berjalan. Menambah ke sana tetap mungkin
  (`byPaksaArsip()`) tapi harus diminta, dan izinnya **berlaku satu lembar saja**:
  kalau menetap, lembar arsip berikutnya ikut terbuka untuk diisi tanpa ada yang
  memintanya. Bukti TF & status bayar di arsip TETAP bisa diubah — pembayaran
  minggu lalu sering baru dikonfirmasi minggu ini.
- **Chip arsip menyebut sisa yang belum terbayar** (`3 belum`). Mengarsipkan yang
  belum selesai persis begitulah pembayaran terlupakan: lembarnya turun dari layar
  dan tidak ada satu pun tempat yang menyebut masih ada sisa.
- Master vendor yang mati **tidak mematikan halaman** — nominalnya tetap terbaca,
  cuma kolom penerima yang kosong, dan itu dikatakan.

"Rekening Pribadi - Mandiri" di lembar Excel adalah **rekening Mandiri yang sama**
(ditegaskan user 28 Agustus 2026), bukan wadah terpisah — jadi tidak ada wadah
"pribadi", dan saldonya memang kas perusahaan.

### Planning Pembayaran: layar di Kas Kecil, data di Brankas (2 Sep 2026)

Permintaan user: "planning pembayaran yang berada di modul brankas saya ingin
pindahkan ke modul kas kecil saja". Yang pindah **layarnya**; **datanya tetap
di `bk_state`**, dan pemisahan itu yang harus dijaga.

**Kenapa datanya tidak ikut pindah.** Baris pembayaran berstatus `paid`
MENGURANGI saldo wallet di `saldoSemua()` panel Brankas. Memindahkan datanya
keluar berarti halaman Saldo di sana kehilangan hitungannya, dan yang
menggantikannya cuma ketergantungan yang arahnya terbalik — plus satu migrasi
data produksi yang bisa tertinggal.

| | di mana |
|---|---|
| layar & lembar isian | `deploy/finance/kas/` (kunci `finance`) |
| data `bayar` | `bk_state` di `finance-mysql`, bersama sisa blob brankas |
| saldo wallet yang menguranginya | halaman Saldo panel Brankas |

**Kas Kecil MEMBACA lewat `brankasGet`, MENULIS lewat `bayarSave`.** Bedanya
menentukan: `brankasSave` menulis SELURUH blob, jadi dua panel yang sama-sama
memakainya akan saling menimpa — panel yang menyimpan belakangan menghapus
mutasi atau pengembalian modal yang baru dicatat di panel sebelah, **tanpa satu
pun galat**. `brankas_bayar_simpan()` membaca blob dulu, mengganti hanya kunci
`bayar`, lalu menulis kembali lewat `brankas_simpan()` — jadi penyaringan kunci
tetap dikerjakan satu tempat.

Membacanya sengaja tetap `brankasGet`: halaman ini memang perlu seluruh state
untuk menghitung saldo wallet, dan user memutuskan (2 September 2026) bahwa
pemegang Kas Kecil boleh melihat saldo rekening perusahaan. **Itu melonggarkan
pemisahan `brankas` vs `finance` yang dulu dibuat sengaja** — kalau suatu hari
harus diketatkan lagi, yang perlu diubah `muatBayar()` di kas, bukan aksinya.

Yang lain yang perlu dijaga:

- **`bayar` WAJIB tetap ada** di daftar kunci `brankas_simpan()` dan di bentuk
  kosong `brankas_baca()`. Mencabutnya "karena halamannya sudah tidak di sana"
  membuang seluruh rencana pembayaran pada penyimpanan berikutnya, dan saldo
  wallet naik sendiri sebesar yang sudah terbayar.
- **`saldoSemua()` di kas dibangun di atas `rkHitung()` milik panel itu**, bukan
  disalin dari `aktGrup()` brankas. Keduanya sudah berkas kembar; menyalinnya
  sekali lagi berarti TIGA rumus untuk satu angka.
- **Dimuat MALAS** — `BK` & master vendor baru diambil saat menunya dibuka.
  Panel ini sudah menarik tiga sumber saat boot.
- **Penjaga draf ikut pindah** (`beforeunload` + konfirmasi di `go()`). Kalau
  tertinggal di panel lama, Brankas melempar `ReferenceError` tiap tab ditutup
  DAN Kas Kecil membuang 20 baris yang belum tersimpan tanpa peringatan.

```bash
node tools/uji-bayar-kas.js   # 98 pemeriksaan, jsdom + kompas/finance/stock tiruan
```

84 di antaranya **diiris apa adanya** dari `uji-brankas.js` — yang berpindah
halamannya, bukan aturannya, dan angkanya keluar sama persis sesudah pindah.

**Backend menumpang `finance-mysql`** (tabel `bk_state`, `bk_akses`, `bk_peran`),
bukan backend sendiri: tabelnya lahir sendiri lewat `brankas_pastikan()`, jadi
tidak ada database baru yang harus dibuat manual di cPanel dan tidak ada berkas
migrasi yang bisa tertinggal di produksi. Datanya blob satu baris — boleh karena
yang menyunting cuma CFO; kalau suatu hari dibuka untuk banyak orang, inilah yang
pertama harus dipecah.

**Blobnya DISARING daftar kunci tertutup di `brankas_simpan()`, dan itu satu-
satunya tempat yang memutuskan apa yang bertahan.** Kunci yang dipakai
`BK.data` tapi tidak disebut di sana hilang **tanpa satu pun galat**: server
tetap membalas `ok`, layar menggambar ulang dari memori sehingga barisnya
kelihatan sudah masuk, dan baru lenyap saat halaman dimuat ulang. Kejadian
2 September 2026 — `mutasi` tidak ada di daftar itu sejak panel ini lahir, jadi
seluruh Mutasi & Transfer Wallet hilang tiap refresh sementara 190 pemeriksaan
`uji-brankas.js` tetap hijau (servernya di sana tiruan, jadi ia cuma bisa
melihat apa yang DIKIRIM frontend, bukan apa yang DITULIS PHP). Kunci baru
wajib ditambahkan di **dua** tempat: daftar `foreach` itu, dan bentuk kosong di
`brankas_baca()`. Sekarang keduanya dibandingkan dengan daftar di `muatSemua()`
lewat uji yang membaca ketiga sumbernya — bukan menyalinnya.

Hak aksesnya matriks halaman × role yang **sama persis** dengan panel Kas Kecil
dan modul Reservasi (None/Lihat/Ubah). Bawaannya PENUH untuk `staf` — permintaan
user "masuk langsung full akses dulu, tapi ada kelola akses per role".

Ujinya:

```bash
node tools/uji-brankas.js    # 109 pemeriksaan, jsdom + finance/kompas/account tiruan
                             # (84 pemeriksaan lembar pembayaran pindah ke uji-bayar-kas.js)
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

### Modul `analytics`: laporan POS diurai DI PERAMBAN (29 Agustus 2026)

`deploy/analytics/index.html`, kunci izin `analytics`. Alurnya: unggah berkas
*Sales Recapitulation* dari POS → diurai di peramban → yang dikirim ke server
cuma **ringkasannya**.

**Backend MENUMPANG `kompas-mysql`** (tabel `an_state`, `an_akses`, `an_peran`,
lahir sendiri lewat `an_pastikan()`), aksi `analyticsGet/Save/Akses/Peran`.
Ditaruh di kompas karena yang dianalisis penjualan, dan halaman ini
membandingkan angka POS dengan Rekap Penjualan untuk hari yang sama.
**TABEL SENDIRI, bukan blob `settings` milik `saveAll`** — modul Omset mengirim
seluruh state-nya tiap menyimpan, jadi menaruh analytics di dalamnya berarti
satu simpan dari layar Omset menghapus seluruh riwayat unggahan.

**Diurai tanpa satu pun pustaka.** `.xlsx` adalah ZIP berisi XML, dan peramban
modern sudah punya `DecompressionStream('deflate-raw')` — yang perlu ditulis
cuma pembaca daftar isi ZIP-nya (~60 baris). Alternatifnya SheetJS ~900 KB dari
CDN, untuk satu berkas per bulan, dan CDN yang mati berarti modulnya ikut mati.
Berkas 9,4 MB terurai **~280 ms**. Yang perambannya terlalu tua DIKATAKAN, dan
jalur **CSV** tetap tersedia.

Yang menahan bug diam-diam:

- **KOLOM DICARI MENURUT NAMANYA** (`KOL_CARI`), bukan posisinya. POS mengubah
  urutan kolom antar versi tanpa memberi tahu siapa pun, dan pembaca yang
  menghitung kolom ke-41 akan membaca Tax sebagai Grand Total — salah yang
  muncul sebagai uang, bukan sebagai galat.
- **Baris kepala DICARI**, bukan dianggap baris pertama: berkas POS punya 10
  baris judul & penyaring di atasnya.
- **`isoDari()` satu pembaca untuk tiga bentuk tanggal** — serial Excel (46235),
  ISO, dan dd-mm-yyyy. Serialnya dihitung **UTC**; dibaca lokal, zona di timur
  menggeser tanggalnya satu hari. Rentangnya dijepit 20000–80000 supaya nomor
  meja tidak diam-diam jadi tanggal tahun 1900-an.
- **`dowDari()` pakai `getUTCDay`**, alasan yang sama. Salahnya cuma muncul
  sebagai "Sabtu ternyata sepi".
- **Hari dalam seminggu dibanding RATA-RATA, bukan jumlah.** Bulan dengan lima
  Sabtu dan empat Senin akan selalu menunjukkan Sabtu lebih besar kalau yang
  dibandingkan jumlahnya.
- **Jam di luar kedua shift TETAP dihitung** dan ditampilkan. Kalau dibuang,
  jumlah kedua shift tidak sama dengan total di Ringkasan.
- **Shift boleh melewati tengah malam** (`diRentang()` melingkar). Perbandingan
  lurus `a<=j&&j<b` memulangkan kosong untuk seluruh shift 18–02.
- **Rata-rata per TAMU disembunyikan kalau kolom Pax jarang terisi** — di data
  produksi cuma 318 dari 4.087 bill. Membaginya memberi angka belasan kali
  lipat dari kenyataan, dan angka semacam itu terlihat sangat meyakinkan.

**DUA BENTUK LAPORAN, dan bedanya menentukan apa yang bisa dijawab:**

| | isinya | menjawab |
|---|---|---|
| **Bill Report** | satu baris per bill | omset/hari, rata-rata per bill, sebaran jam |
| **Menu Report** | satu baris per menu terjual | menu terlaris + perkiraan bahan baku |

Berkas yang diunggah user pertama kali **Bill Report**, dan di dalamnya TIDAK
ada satu pun nama menu. Halaman Menu & Bahan Baku karena itu **mengatakan
laporan mana yang kurang**, bukan menggambar tabel kosong — tabel kosong
terbaca sebagai "tidak ada yang terjual".

**Perkiraan bahan baku = qty menu × resep HPP**, dan resepnya **bertingkat**
(`uraiResep()`): resep boleh memakai resep lain, `yield_qty` dibagi, base tidak
ikut jadi baris bahan. Kedalaman dibatasi 6 dan resep yang menunjuk dirinya
sendiri DILAPORKAN. Menu yang namanya tidak ada di HPP **disebutkan berikut
persentase nilainya** — tanpa itu perkiraan terlihat lengkap padahal separuh
menunya tidak ikut dihitung, dan selisih di lapangan akan dikira barang hilang.

**PENGARUH EVENT & PENGARUH MARKETING adalah DUA HALAMAN, satu penggambar**
(2 September 2026, permintaan user). Sebelumnya satu halaman yang mencampur
acara dari modul Event dan modul Marketing — dua hal yang direncanakan tim
berbeda dan dinilai dengan pertanyaan berbeda; dicampur, tidak satu pun
pertanyaan tentang salah satunya bisa dijawab tanpa memilah dengan mata.

Dipisah sebagai **parameter `vDampak(sumber)`, bukan disalin jadi dua fungsi**.
Kalau disalin, satu perbaikan rumus akan berlaku di satu halaman saja — dan dua
halaman yang menghitung "pengaruh" dengan cara berbeda lebih buruk daripada
satu halaman yang tercampur.

**Kategori datang dari dua nama kolom yang berbeda** dan disatukan di satu
tempat (`katEvent()`): `category` di modul Event, `jenis` di Marketing.
Dibiarkan berbeda sampai ke layar, tapis kategori di satu halaman tidak akan
pernah cocok dengan yang di sebelahnya. Yang kosong diberi nama sendiri
(`(tanpa kategori)`), tidak dibuang dan tidak dijatuhkan ke kategori pertama —
acara tanpa kategori tetap membawa omset, dan membuangnya membuat jumlah
kategori tidak pernah sama dengan totalnya.

Dua angka yang diminta user ada di tabel **Per Kategori**: omset yang masuk di
hari-hari kategori itu, dan **berapa persen kontribusinya terhadap seluruh
omset bulan itu**. Yang menahan bug diam-diam:

- **Penyebutnya total omset SEBULAN**, bukan omset hari berevent saja. Salah
  penyebut membuat tiap kategori terlihat menyumbang berlipat-lipat dan tidak
  ada satu pun angka yang kelihatan aneh.
- **Satu hari bisa punya acara dari dua kategori**, dan hari itu ikut dihitung
  di keduanya — jadi kolom Omset **tidak bisa dijumlahkan**. Itu DIKATAKAN di
  layar berikut angka yang tidak berganda; angka yang tidak bisa dijumlahkan
  tanpa penjelasan adalah angka yang berhenti dipercaya.
- **Angka di chip kategori dihitung dari SELURUH acara bulan itu**, bukan dari
  yang sedang tersaring. Kalau ikut, chip yang tidak dipilih selalu menulis
  `0 hari` — dan nol membaca sebagai "tidak ada acara kategori itu".

**Halaman Tren Bulanan** menjawab satu-satunya pertanyaan yang tidak terjawab
dari mana pun sebelumnya: "dibanding bulan lalu bagaimana". Grafiknya memakai
**Chart.js yang memang sudah dimuat modul ini sejak awal tapi belum pernah
dipakai sekali pun**.

- **Ketiadaan `Chart` DIKATAKAN dan tabelnya tetap digambar.** CDN yang mati
  membuat grafik hilang, dan grafik yang hilang diam-diam tidak bisa dibedakan
  dari data yang memang nol.
- **Dua sumbu Y**: total sebulan dan rata-rata sehari berbeda dua orde besaran;
  digambar di satu sumbu, garis rata-ratanya menempel di dasar grafik dan
  terbaca sebagai nol.
- **Menu Report dipisah, bukan digambar sebagai bulan beromset nol.** Batang nol
  di tengah grafik terbaca sebagai bulan yang sepi, bukan sebagai bulan yang
  laporannya berbeda jenis.
- **Satu bulan bukan tren**: kalau baru satu bulan diunggah, yang digambar
  penjelasan + cara melengkapinya, bukan grafik satu batang.
- Pembanding **dua bulan bebas** ada di bawahnya — tabel MoM cuma membandingkan
  dengan bulan tepat sebelumnya, dan "Agustus vs Agustus tahun lalu" tidak
  terjawab oleh selisih berurutan.

**`pilihBulan()` tidak lagi dipotong `slice(0, 14)`.** Bulan ke-15 dan
seterusnya hilang dari layar tanpa satu pun tanda, dan yang mencarinya akan
menyimpulkan laporannya belum pernah diunggah.

**Pengaruh event TIDAK disajikan sebagai sebab-akibat.** Event hampir selalu di
akhir pekan, dan akhir pekan memang lebih ramai tanpa event apa pun — jadi tiap
hari berevent dibandingkan dengan **rata-rata hari yang SAMA tanpa event**, dan
jumlah harinya selalu disebutkan. Peringatannya jangan dihapus supaya
halamannya terlihat lebih tegas.

Berkas POS **jangan di-commit** (sudah di `.gitignore`): satu berkas memuat
seluruh transaksi sebulan.

```bash
node tools/uji-analytics.js   # 118 pemeriksaan
```

Ujinya memakai **berkas POS asli** di root repo kalau ada (kalau tidak, bagian
itu MELEWAT dengan jelas). `DecompressionStream`/`Blob`/`Response` ada di Node
18+, jadi jalur yang dipakai peramban benar-benar dijalankan — bukan ditiru.

### HPP: SPARE MODAL, sekali dan hanya di menu jadi (2 September 2026)

`deploy/stock/hpp/`, kunci izin **`hpp`** (bukan `stock` — panel ini berdiri
sendiri di pemilih). Modal tiap **menu jadi** ditambah cadangan sekian persen —
penutup susut, ceceran, dan porsi yang meleset. Persentasenya setelan
(`SET.buffer`, halaman Pengaturan, bawaan 5%), tersimpan di `hpp_setting` lewat
`simpanSetting` — **backend tidak perlu diubah sama sekali**, kuncinya sudah ada
di sana sejak modul lahir.

**Kotak isiannya memang sudah ada sejak awal — yang tidak ada justru
pemakaiannya.** `SET.buffer` disimpan rapi ke server lalu tidak dibaca satu pun
perhitungan, jadi mengubahnya tidak menggeser satu angka pun. Ia setelan mati
selama dua minggu, dan tidak ada satu pun layar yang mengatakannya.

Rumusnya, dan pembagian tugas ketiga fungsinya:

```
modalResep(r)   bahan mentah saja, MEMOIZED di MEMO
modalDasar(r)   modalResep + jalur modal_manual   <- yang dipakai MENYUSUN resep lain
modalMenu(r)    modalDasar + spare kalau tipe==='dish'   <- modal RESMI seluruh layar
```

Yang menahan bug diam-diam, dan ketiganya muncul sebagai UANG bukan sebagai galat:

- **Spare dikenakan SEKALI, di menu jadi saja** (`kenaSpare()`). Kalau base ikut
  dipadding, menu yang memakai base kena 5% di atas 5% dan resep bertingkat tiga
  kena tiga kali. Karena itu `perUnitResep()` — harga per satuan sebuah base yang
  menyusun modal resep lain — memakai **`modalDasar`, bukan `modalMenu`**.
- **`modalMenu()` selalu membuat OBJEK BARU.** `modalResep()` memoize hasilnya
  dan memulangkan referensi yang sama tiap kali; menambahkan spare ke objek itu
  membuat resep yang digambar dua kali dapat spare dua kali. Render di modul ini
  TOTAL, jadi gejalanya modal yang **naik sendiri tiap halaman digambar ulang** —
  sudah diuji, tiga render membawa satu menu dari 7.293 ke 11.879.
- **`modalPratinjau()` memakai aturan yang SAMA.** Penyunting resep memakai
  fungsi itu, daftar memakai `modalMenu()`; kalau cuma salah satunya kena spare,
  yang menyunting menyimpan lalu mendapati modalnya berubah tanpa ia menyentuh
  apa pun.
- **Buffer negatif diabaikan**, nol tetap sah. Negatif MENGURANGI modal, dan
  modal yang lebih murah daripada bahannya adalah angka menyesatkan yang tidak
  akan dipertanyakan siapa pun. Nol wajib sah — itu satu-satunya cara mematikan
  spare tanpa menyunting kode.
- **Spare selalu ditulis sebagai barisnya sendiri** di penyunting, lembar PDF,
  dan kartu kalkulator; daftar Menu Jadi menyebutnya di keterangan tabel dan
  merincinya di `title` tiap sel Modal. Total yang 5% lebih besar daripada jumlah
  subtotal di atasnya akan dikira salah hitung, dan yang mencari selisihnya tidak
  punya satu pun petunjuk.
- Kalkulator HPP ikut menghitung spare: ia menimbang menu yang AKAN dijual, jadi
  harga yang diputuskan di sana harus sama dengan yang keluar di Daftar Resep
  begitu menunya benar-benar dibuat.

**Tapis Makanan / Minuman di Daftar Resep** (2 September 2026). Tapisnya sudah
ada sejak lama — tapi berupa **dropdown bertuliskan "Food" / "Drink"**, satu
dari empat kotak pilihan berjajar di baris atas. Yang mencari "minuman" tidak
menemukannya lalu menyimpulkan tapisnya tidak ada; itu permintaan yang datang
dari user, dan dua sebabnya (istilah data dipakai sebagai label, kendali
tenggelam di antara tiga kendali lain) sama-sama diperbaiki:

- Jadi **saklar `.seg`, sebaris dengan tab Menu Jadi / Base** — keduanya
  menjawab pertanyaan yang sama-sama dijawab sebelum melihat tabel: bagian mana
  yang sedang dilihat.
- **Nilainya TETAP `'food'`/`'drink'`.** Itu isi kolom `jenis` di data; saklar
  yang mengirim `'makanan'` membuat tidak satu pun resep cocok dan daftarnya
  kosong tanpa satu pun galat. Yang berubah cuma tulisannya, lewat
  `namaJenis()` — satu tempat, supaya tapis bertuliskan "Makanan" tidak pernah
  berdiri di atas kolom bertuliskan "Food".
- **Angka di tombol dihitung TANPA tapis jenis** (`resepTersaring(tipe, true)`).
  Kalau ikut, tombol yang tidak sedang dipilih selalu menulis `(0)` — dan nol
  membaca sebagai "tidak ada minuman sama sekali", bukan "kamu sedang melihat
  makanan". Tapis lain (seksi, aktif, kata kunci) **tetap** berlaku: angkanya
  harus menjanjikan apa yang benar-benar muncul kalau ditekan.

**Yield menu jadi = 1 Porsi, KECUALI resep sebatch.** September 2026 seluruh
menu jadi diisi yield "1 Porsi" (permintaan user) lewat alat sekali pakai di
Daftar Resep; alatnya **sudah dicabut lagi** begitu pekerjaannya selesai —
tombol yang tidak punya pekerjaan lagi akan ditekan lagi tanpa sebab.

Yang perlu bertahan bukan alatnya, tapi **kenapa sebagian sengaja TIDAK 1
Porsi** — dan itu jangan "dirapikan" belakangan. Resep yang ditulis untuk SATU
BATCH (Bubur Ayam & Soto Bening 10 Porsi, Bitterballen 25 Pcs, Chicken Skin
400 Gr, Hainan Chicken 1000 Gr, Nasi Kuning 6 Porsi, Tea Orange Extract
1600 Ml) memakai yield sebagai **PEMBAGI**, bukan keterangan:
`perUnitResep()` = modal ÷ yield, dan angka itulah yang dipakai resep lain yang
merujuknya sebagai bahan (`hitungBaris`, cabang `lewatResep`).

```
Nasi Campur Bali pakai 20 Gr Chicken Skin   (Chicken Skin hasil 400 Gr)
  yield 400 Gr  : (modal ÷ 400) × 20
  yield 1 Porsi : (modal ÷   1) × 20      -> 400 kali lipat
```

Sembilan resep merujuk ketujuh batch itu. Menuliskannya 1 Porsi tanpa ikut
membagi takaran bahannya **tidak melempar apa pun** — yang berubah cuma angka
modal, dan angka modal yang salah terlihat persis seperti yang benar.
Membaginya otomatis juga bukan jawabannya: takaran sebatch tidak selalu habis
dibagi rata (satu telur untuk 10 porsi).

Resep BARU tidak menambah pekerjaan ini: bawaan form sudah `1 Porsi`.

```bash
node tools/uji-spare-hpp.js   # 47 pemeriksaan, jsdom + stock-api tiruan
```

Ujinya membuat resep bertingkat (bahan → base → menu, dan menu berisi dua base)
justru supaya spare berlipat punya tempat untuk muncul. `smoke-modul.js` **tidak
cukup** untuk modul ini — ia melaporkan `hanya boot yang diuji`, jadi seluruh
aritmetikanya lewat tanpa disentuh.

### Pemakaian Bahan Baku: pemilih bulan di KETIGA report (2 September 2026)

`deploy/stock/usage/`. Modul ini punya tiga layar report — **Pemakaian**,
**Waste**, dan **Serah Terima** — dan sampai 2 September 2026 cuma Pemakaian
yang punya pemilih bulan. Dua lainnya hanya 7 Hari / Bulan Ini / Semua, jadi
waste bulan lalu dan serah terima bulan lalu hanya bisa dilihat dengan menarik
SELURUH data lewat "Semua" lalu mencarinya dengan mata (permintaan user).

**`rentangBulan(ym)` adalah SATU rumus untuk ketiganya.** Sebelumnya hitungan
hari terakhir bulan ada inline di `rentang()` milik Pemakaian; menyalinnya ke
dua layar baru berarti tiga tempat menghitungnya sendiri-sendiri, dan yang
meleset di Februari **tidak melempar apa pun** — ia cuma kehilangan catatan
tanggal 29, dan tidak ada satu pun layar yang menyebutkannya.

Yang perlu dijaga saat menyentuhnya:

- **Akhir rentang = hari terakhir BULAN ITU, bukan hari ini.** Bulan lalu harus
  terambil penuh. `new Date(th, bl, 0)` = tanggal 0 bulan berikutnya = hari
  terakhir bulan ini, dan itu benar juga untuk Februari maupun tahun kabisat.
- **`isiPilihanBulan(id)` menerima id kotaknya.** Tiga layar, tiga `<select>`;
  yang cuma diisi satu membuat dua kotak lain tampil kosong — terbaca sebagai
  "tidak ada bulan yang bisa dipilih", bukan sebagai bug.
- **Tombol periode dan pemilih bulan saling meniadakan.** Menekan "7 Hari"
  sesudah memilih Februari harus benar-benar memberi 7 hari; tombol yang
  menyala untuk rentang yang tidak diberikannya adalah kebohongan yang paling
  sulit dilacak di layar penyaring.
- **Saat sebuah bulan dipilih, tidak ada tombol periode yang menyala** — itu
  memang benar, yang berlaku bukan salah satu dari ketiganya. Yang menggantikan
  tandanya tombol **✕** di sebelah pemilih bulan, dan ✕ itu pula satu-satunya
  jalan keluar: tanpa itu, memilih satu bulan berarti terkurung di bulan itu
  sampai halaman dimuat ulang.
- Periode disaring **di server** (`dari`/`ke` jadi query string ke `usage.php` /
  `waste.php` / `serah.php`). Rentang yang salah tetap menggambar layar yang
  rapi, cuma dengan isi bulan yang keliru — karena itu ujinya memeriksa **URL
  yang benar-benar diminta**, bukan tampilannya.
- Pemilih bulan Pemakaian ada **di dalam laci filter** (layar itu punya lima
  penyaring); Waste dan Serah tidak punya laci, jadi pemilihnya langsung
  terlihat. Perbedaan itu disengaja — laci untuk layar yang penyaringnya
  menumpuk, bukan untuk semua.

```bash
node tools/uji-bulan-usage.js   # 37 pemeriksaan, jsdom + stock-api tiruan
```

Ujinya memuat modulnya sungguhan (termasuk `catat-common.js`) tapi **membuang
skrip CDN Tailwind & FontAwesome** — keduanya tidak bisa dimuat jsdom dan
tumpukan galatnya menenggelamkan baris OK/GAGAL. `smoke-modul.js` **tidak
cukup**: ia melaporkan `hanya boot yang diuji` untuk modul ini.

### Denah meja: Marketing MENGIKUTI Reservasi, tidak menyalinnya (2 Sep 2026)

`deploy/marketing/` → *Pilih & Kunci Meja* (Reservasi VIP dan pemilih meja
Event) menggambar denah venue yang SAMA dengan `deploy/reservasi/` dan menulis
kunciannya ke database Reservasi. Dua modul, satu ruangan — dan tiap kali
keduanya menyimpang, gejalanya bukan galat melainkan kru yang berdebat meja
mana yang benar.

Koordinat mejanya sudah lama satu sumber (`deploy/assets/venue-layouts.js`).
Yang **belum** ikut sampai 2 September 2026, dan semuanya keluhan user:

- **`layoutTanggal` tidak dibaca sama sekali.** Modul Reservasi punya denah
  KHUSUS SATU TANGGAL yang menang atas segalanya (`getLayout()`); Marketing cuma
  membaca `master.layouts`. Akibatnya meja yang digeser untuk satu malam tetap
  tergambar di posisi lamanya. `vipDenah()` sekarang memakai urutan yang sama:
  **denah tanggal > template hasil edit > bawaan**.
- **Minggu bukan akhir pekan.** Di sini dulu cuma Jumat & Sabtu, sementara
  Reservasi sudah memasukkan Minggu — jadi tiap Minggu kedua modul menggambar
  denah yang berbeda untuk ruangan yang sama, tanpa satu pun tanda.
- **Lantai 2 memakai `layoutOverrides2`**, kunci yang terpisah. Menumpangkannya
  di `layoutOverrides` berarti menjadwalkan denah lantai bawah ikut mengganti
  denah atas.

**KUNCI MEJA H-3 JAM, bukan sehari penuh.** `rsvMejaTerpakai()` dulu memblokir
meja untuk SATU HARI PENUH: tamu jam 12:00 membuat mejanya tak bisa dipakai
acara jam 20:00 di hari yang sama, padahal modul Reservasi sendiri
mengizinkannya. Kru Marketing karena itu melihat denah yang jauh lebih penuh
daripada kenyataan, lalu menolak acara yang sebenarnya masih muat.

`vipLockStart/vipLockEnd/vipLocksRange` adalah **BERKAS KEMBAR**
`lockStart/lockEnd/locksRange` di `deploy/reservasi/`. Kalau di sana berubah, di
sini HARUS ikut — dua aturan untuk satu meja berarti satu modul menjualnya
sementara modul lain menganggapnya penuh. Yang perlu dijaga:

- **`jam` kosong = SEHARI PENUH**, bukan "tidak ada yang terkunci". Tanpa jam
  tidak ada cara tahu jendela mana yang bentrok, dan menganggapnya kosong
  berarti menjanjikan meja yang mungkin sudah dipesan.
- **Reservasi lintas hari ikut dipertimbangkan** (±1 hari): booking 02:00 dini
  hari mengunci mejanya sejak 23:00 malam sebelumnya. Penyaring lama
  (`r.date !== tanggal`) membuat kuncian itu tidak terlihat sama sekali.
- **Jamnya wajib ikut di pemeriksaan terakhir sebelum menulis**, bukan cuma di
  denah. Kalau tidak, orang memilih meja yang terlihat kosong lalu ditolak saat
  menekan Simpan.
- Pemilih meja Event mengambil jamnya dari `tamuDatang` lalu `mulaiSetup` —
  **sumber yang sama** dengan yang ditulis ke Reservasi saat menyimpan.

**Nada warna & ukuran** juga disamakan: latar `--paper`, `aspect-ratio
1600/1160`, meja diwarnai per ZONA dengan nilai yang disalin dari `.seat.zone-*`
di Reservasi, terpilih = garis emas di LUAR kotak (warna zonanya tetap
terbaca), terkunci = pudar + ✕. Lebar maksimumnya naik dari 1180px ke 1560px
dan ukuran hurufnya `clamp()` — denah yang dibesarkan tapi hurufnya tetap 9,5px
tidak menyelesaikan keluhannya. Zona yang **tidak dikenal dibiarkan tanpa
kelas**, bukan dijatuhkan ke warna pertama: meja berzona baru harus terlihat
berbeda supaya CSS-nya ditambah.

**Jam kosong diarahkan ke `00:00`, dan itu DIKATAKAN** (3 September 2026,
permintaan user). Sebelumnya jam kosong berarti seluruh hari terkunci — aman,
tapi denahnya tampak penuh merah begitu tanggalnya baru dipilih. Akibat 00:00
harus terlihat: jendela H-3 jadi 21:00 malam sebelumnya sampai 03:00, jadi meja
yang dipesan tamu jam 20:00 tampil **bebas**. `vipCatatanJam()` memasang pita
peringatan selama jamnya belum diisi; tanpa itu dua pihak bisa memegang meja
yang sama tanpa satu pun tanda. Peringatannya hilang sendiri begitu jamnya
diisi — peringatan yang selalu muncul berhenti dibaca.

**Denah bawaan yang tidak berlaku hari itu TIDAK ditawarkan** (permintaan user).
Dulu empat tombol berjajar — Weekday/Weekend × Lt.1/Lt.2 — padahal dua di
antaranya jelas bukan denah hari itu, dan denah hari kerja yang dibuka pada hari
Sabtu menggambar meja di posisi yang malam itu tidak ada. Sekarang tinggal dua.

- **Template custom TIDAK ikut disaring**: namanya bebas, dan menebak jenis
  harinya dari nama berarti menyembunyikan denah yang mungkin justru dibuat
  untuk hari itu.
- **`vipDenahKeys(d, tanggal, semua)` — `semua=true` membuka lagi seluruhnya**,
  dan itu wajib untuk dua pemakai: `vipDenahKunci()` (mencari denah mana yang
  memuat meja sebuah reservasi lama, bisa saja denah jenis hari lain) dan
  pengumpul kapasitas `VIP_CAP`. Tanpa itu reservasi lama tampil dengan denah
  yang semua mejanya pudar — terbaca sebagai "mejanya hilang" — dan ringkasan
  slot berubah jadi "? org".

```bash
node tools/uji-denah-marketing.js   # 57 pemeriksaan, jsdom
```

Ujinya membaca **kedua berkas** lalu membandingkannya — angka H-3 jam, aturan
akhir pekan, dan tujuh warna zona diambil dari `deploy/reservasi/index.html`,
bukan ditulis ulang. Yang disalin tangan pasti menyimpang.

### Konten: yang selesai otomatis diarsipkan (4 September 2026)

`deploy/konten/`. Permintaan user: Content Planning, Shooting, Design, dan
Editing hanya menampilkan **task yang masih berjalan**; yang sudah tayang atau
selesai diarsipkan sendiri.

- **Antrian produksi** (`queueState`) bawaannya `status:todo`, bukan ``.
  Kotak pilihannya sekarang berbunyi *Aktif / Arsip / Semua* — kendalinya
  memang sudah ada, yang berubah bawaannya dan kata-katanya.
- **Content Planning** punya tapis `arsip` sendiri (`aktif`/`arsip`/``),
  terpisah dari tapis per-status yang sudah ada. `STATUS_ARSIP` =
  `[Posted,Cancelled]`, satu daftar dipakai tapis dan penghitungnya.
- **Dua tapis tidak boleh saling meniadakan.** Memilih status `Posted`
  sementara tapis arsip masih `aktif` akan memulangkan tabel KOSONG — dan
  kosong terbaca sebagai "belum ada yang tayang", bukan sebagai "tapisnya
  bertabrakan". Karena itu status arsip yang dipilih eksplisit MENANG atas
  tapis arsip.
- **Reset kembali ke AKTIF, bukan ke Semua.** Kalau tidak, menekan Reset justru
  memunculkan seluruh arsip — kebalikan dari yang diharapkan yang menekannya.
- **Yang disembunyikan disebut angkanya** di kepala halaman dan di baris
  penyaring antrian. Daftar yang menyusut tanpa keterangan terbaca sebagai data
  yang hilang, dan dilaporkan sebagai bug.

**Mengetik di antrian produksi tidak lagi melempar fokus** (4 September 2026,
keluhan user "typing-nya error" di Shooting/Design/Editing). `queueF()` dulu
memanggil `route()`, yang menulis ulang `innerHTML` SELURUH `#view` — termasuk
kotak carinya sendiri. Kotak yang dibuat ulang kehilangan fokus, jadi **hanya
huruf pertama yang masuk**.

`prodQueue()` sekarang dipisah jadi tiga: `prodRows()` (data), `prodQueue()`
(kerangka + baris penyaring), `renderQueueTable()` (isi tabel). Yang dipanggil
tiap ketukan cuma yang terakhir. Bentuknya disamakan dengan Content Planning,
yang memang tidak pernah kena karena sudah memisahkan keduanya sejak awal
(`planF` → `renderPlanTable`).

- **Jangan "perbaiki" dengan menyimpan-mengembalikan posisi kursor.** Yang
  menggambar ulang kotak yang sedang diketik akan selalu punya masalah
  berikutnya: teks yang sedang dipilih, komposisi IME, autocomplete.
- **`AFTER.shooting/design/editing` wajib ada.** `#queueTable` belum ada di DOM
  saat `VIEWS.*` dipanggil; mengisinya di sana gagal diam-diam (elemennya null)
  dan yang tampil halaman tanpa tabel sama sekali.
- **Angka "x / y pekerjaan" disegarkan `renderQueueTable()`**, bukan cuma
  ditulis di kerangka — kalau tidak ia membeku di hasil pencarian pertama dan
  berbohong sejak ketukan kedua.

**Pipeline bisa disaring per PIC** (permintaan user), berikut **jumlah konten
tiap orang di pilihannya** — yang membuka tapis ini justru sedang mencari siapa
yang menumpuk pekerjaan. Pilihan **Belum ada PIC** memakai nilai `__none__` dan
disaring lewat cabangnya sendiri: dibandingkan langsung dengan `c.pic` ia tidak
akan pernah cocok, dan kanbannya kosong tanpa satu pun keterangan.

**Pilihan PIC dibuat SATU tempat** (`picOptions()` + `picCocok()`), dipakai
Pipeline dan Content Planning. Dua dropdown yang disusun sendiri-sendiri akan
menyimpang begitu ada pilihan baru — dan yang membacanya tidak punya cara tahu
kenapa "Belum ada PIC" cuma ada di satu halaman.

- **Baris penyaring Pipeline berbentuk KARTU**, sama dengan halaman lain.
  Sebelumnya kotak PIC-nya diselipkan ke `.page-head` bersama tombol Konten
  Baru; `.page-head` memakai `align-items:flex-end` + `flex-wrap`, jadi begitu
  isinya tiga benda ia membungkus dan kotaknya berdiri sendiri di kanan atas
  tanpa sejajar dengan apa pun (keluhan user 4 September 2026).
- **`hitung()` diberikan pemanggilnya**, karena yang dihitung memang berbeda:
  Pipeline menghitung konten aktif, Content Planning menghitung yang lolos
  saringan halamannya sendiri. Yang sama bentuk daftarnya, bukan angkanya.
- **Angka PIC di Planning dihitung TANPA tapis PIC-nya sendiri**
  (`filteredContent(true)`). Kalau ikut, tiap nama yang tidak sedang dipilih
  selalu menulis `(0)` — dan nol membaca sebagai "orang itu tidak pegang
  apa-apa". Saringan lain (arsip, status, kata kunci) TETAP berlaku: angkanya
  harus menjanjikan apa yang benar-benar muncul kalau ditekan.
- **Orang yang tidak memegang apa pun tidak ditawarkan**; memilihnya cuma
  memulangkan daftar kosong, dan daftar kosong terbaca sebagai bug.
- **`__none__` untuk "Belum ada PIC"**, bukan `` yang sudah berarti semua.
  Dibandingkan langsung dengan `c.pic` ia tidak akan pernah cocok.

**Kartu "Tugas Saya" di dashboard berbasis DEADLINE** (permintaan user: yang
overdue atau dekat, dan hanya milik yang login). `tugasSaya()` mengumpulkan
dari **tiga sumber**: konten yang PIC-nya saya, sub-tugas produksi di dalam
konten itu, dan tugas produksi mandiri. Kartu yang cuma membaca `DB.content`
akan menulis "Bersih!" untuk orang yang besok pagi harus menyerahkan tiga
video — kesalahan paling mahal di layar yang justru dibuka untuk memastikan
tidak ada yang terlewat.

- Diurutkan **yang paling lewat tenggat di paling atas**; tanpa itu kartunya
  cuma tujuh baris pertama menurut urutan input data, dan yang terlambat bisa
  tidak pernah kelihatan.
- Yang **tanpa deadline tetap ikut**, ditaruh paling belakang (`sisa` null).
  Membuangnya berarti tugas yang lupa diberi tenggat menghilang dari
  satu-satunya layar yang menampilkannya.
- `DEADLINE_DEKAT = 3` hari, satu tempat.

### Reservasi: siapa yang terakhir mengubah denah (4 September 2026)

Permintaan user. Capnya **menempel di objek denahnya** (`_editBy`, `_editAt`
lewat `leCap()`), bukan disimpulkan dari Audit Log: audit dipotong di 500
baris, jadi denah yang disunting lama justru yang paling pasti sudah kehilangan
jejaknya di sana. Audit **tetap** dicatat — yang satu menjawab "siapa yang
terakhir", yang satu "apa saja yang pernah terjadi".

- Dipasang di **kedua** jalur simpan: `leSave()` (template) dan
  `leSimpanTanggal()` (denah khusus tanggal). Yang terlewat tidak melempar apa
  pun — denahnya cuma tidak pernah punya jejak.
- Ditampilkan di penyunting denah, di baris Hari-H, dan di daftar template.
- **Denah bawaan yang belum pernah disunting tidak diberi keterangan**:
  `leCapTeks()` memulangkan kosong. "Terakhir diubah: -" membuat orang mencari
  orang yang tidak pernah ada.
- Aman terhadap backend: `master` disimpan sebagai **satu blob JSON tanpa
  penyaringan kunci** (`json_encode($state[master])`), jadi kunci baru tidak
  hilang diam-diam seperti kasus `mutasi` di brankas.

```bash
node tools/uji-arsip-konten.js   # 66 pemeriksaan, jsdom (Konten + Reservasi)
```

Modul Konten seluruhnya terbungkus IIFE (`const COMS = (function(){…})()`), jadi
`planFilters`/`queueState` TIDAK ada di `window` — ujinya menyuntikkan jembatan
`eval` KE DALAM IIFE saat uji jalan, bukan menambah kait ke berkas yang
di-deploy. Pola yang sama dengan `uji-vendor.js` untuk modul BD.

### Master Vendor: di PURCHASING, dibaca Finance & BD (28 Agustus 2026)

`deploy/stock/purchasing/` → tab **Database & Vendor** → *Daftar Kontak Vendor*.
Sudah ada sejak lama berisi nama, WhatsApp, jadwal jemput, hari tutup, dan barang
apa saja yang dipasoknya. Yang **ditambahkan** 28 Agustus 2026 cuma tiga kolom:
`penerima` (nama sesuai buku rekening), `bank`, `norek` — disimpan di dalam blob
`data` tabel `vendors` yang sudah ada, jadi tidak ada berkas migrasi yang bisa
tertinggal di produksi.

**Sempat salah tempat.** Percobaan pertama pagi itu membuat master vendor BARU di
BD OS; dicabut hari yang sama atas koreksi user. Alasannya bukan selera: dua
daftar vendor untuk perusahaan yang sama pasti berbeda ejaan dalam sebulan, dan
yang mentransfer tidak punya cara tahu mana yang lebih baru. Jangan dibuat lagi —
kalau butuh kolom baru tentang vendor, tambahkan di Purchasing.

Yang menahan bug diam-diam:

- **Nama pendek ≠ nama penerima.** Yang diketik sehari-hari "Toffin"; yang harus
  sama persis dengan buku rekening "CV. Toffin Riau Jaya". Beda satu huruf
  membuat transfer ditolak bank — baru ketahuan sesudah uangnya dikirim.
  `penerima` kosong berarti "sama dengan nama vendor".
- **Nomor rekening disimpan apa adanya** (boleh bertanda hubung — begitulah
  tertulis di buku rekening dan begitu pula yang dicocokkan mata), tapi
  DIBANDINGKAN lewat `norekBersih()`. Tanpa itu `034-2928-828` dan `0342928828`
  terbaca sebagai dua rekening berbeda. Impor Excel **tidak** membakukannya
  seperti nomor WhatsApp.
- **`preserve-if-null` WAJIB mencakup ketiga kolom** di `pur_vendor_simpan()`.
  Impor Excel mengirim baris yang cuma punya nama + WhatsApp; tanpa itu satu kali
  impor MENGOSONGKAN nomor rekening seluruh vendor, dan yang menyadarinya adalah
  orang yang mentransfer minggu depan.
- **Ketiganya ikut di ekspor–impor** (`KOL_VENDOR`). Kalau tidak, satu putaran
  ekspor–sunting–impor mengembalikan seluruh vendor tanpa rekening.
- **Rekening kembar cuma DIPERINGATKAN.** Satu perusahaan wajar punya beberapa
  nama dagang yang setor ke rekening yang sama; yang tidak wajar adalah tidak
  menyadarinya.
- **Bank daftar tertutup, tapi nilai lama tetap digambar** ditandai `(lama)` lewat
  `opsiBank()` — pola yang sama dengan `opsiPosisi()` di DW. Tanpa itu, membuka
  vendor yang banknya diimpor dengan ejaan lain menggantinya ke pilihan pertama
  begitu Simpan ditekan, dan transfernya nyasar.

**Kuncinya NAMA, bukan id** — Purchasing memang tidak punya id vendor, nama itulah
kunci tabelnya. Karena itu baris pembayaran di Brankas menyimpan `vendor` (nama),
dan justru itu lebih tahan: vendor yang dihapus dari master tetap meninggalkan
namanya di lembar pembayaran lama, ditandai `tak ada di master`. Bentuk lama
`vendorId` masih dibaca (`vendorBaris()`) untuk baris percobaan di dev.

**Dua pembaca, keduanya read-only:**

| pembaca | jalur | kalau Purchasing mati |
|---|---|---|
| Brankas → lembar pembayaran | `../../stock-api-mysql/vendors.php` | pita peringatan, nominal tetap terbaca |
| BD OS → kolom Vendor di Purchase Order | `../stock-api-mysql/vendors.php` | kotaknya tetap bisa diketik, dan dikatakan daftarnya belum terbaca |

`vendors.php` membalas `{vendors:{…}}` **TANPA kunci `ok`** — beda dari
finance-api & kompas-api. Memeriksa `.ok` membuang balasan yang sebenarnya
baik-baik saja, dan gejalanya cuma kolom penerima yang selalu kosong tanpa satu
pun galat.

`muatVendorPur()` di BD dipanggil **saat form PO digambar**, bukan saat boot:
daftarnya cuma dipakai satu form. Idempoten, dan kegagalannya tidak pernah
dilempar.

Kolom `vendor` di 51 baris PO produksi **kosong seluruhnya** — belum pernah diisi
sekali pun, karena selama ini teks bebas. Nama tersimpan yang tidak ada di master
tetap digambar ditandai `(lama)`, dan penandanya dibuang lagi saat menyimpan —
kalau tidak ia menular jadi bagian nama.

```bash
node tools/uji-vendor.js   # 104 pemeriksaan
```

Ujinya tiga bagian: fungsi Purchasing **dipotong dari sumbernya** saat uji jalan
(modul itu memuat Tailwind & FontAwesome dari CDN, jadi merendernya utuh di jsdom
bukan yang diuji), modul BD dirender penuh dengan jembatan **DI DALAM IIFE**
(`DB` tidak ada di `window`) termasuk form PO-nya lewat `APP.poModal()`, dan
Brankas diperiksa sumbernya saja — isi lembarnya
sudah diuji `tools/uji-brankas.js`. Stub `fetch` untuk BD wajib menyediakan
`text()`: `bacaJawaban()` membaca respons sebagai teks dulu, dan stub yang cuma
punya `json()` membuat boot menggantung tanpa satu pun galat.

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
| Jadwal — **mengesahkan** pengajuan (`DISETUJUI`) | **admin modul saja = HRD**, dan hanya dari `MENUNGGU_HRD` |
| Jadwal — `simpanSetting` | admin modul saja (blob-nya memuat daftar head) |
| Jadwal — halaman **Data Pegawai** (`rosterSaveUser`, `rosterSetActive` di account-api) | admin modul `jadwal` — dan itu sudah berarti HRD, lihat `admin_modul_untuk`. Gerbangnya **token sesi**, bukan callerName+callerPin |

### Jadwal: ekspor Excel bisa dipilih orangnya (29 Agustus 2026)

`exportExcel()` sekarang MEMBUKA PEMILIH, tidak langsung mengunduh — yang
mengerjakan ekspornya `tulisExcel(lingkup, emps, total)`.

- **Bawaannya semua tercentang.** Beda dari modal Isi Jadwal yang sengaja
  kosong: di sana satu klik menimpa jadwal orang lain, di sini yang terjadi
  cuma berkas terunduh. Memaksa mencentang 39 nama untuk pekerjaan yang
  hampir selalu berarti "semuanya" adalah pekerjaan tanpa alasan.
- **"Kosongkan" hanya menyentuh yang sedang tampil** di kotak cari
  (`eksDaftar()`). Menekannya sesudah menyaring lalu mendapati orang di luar
  saringan ikut hilang centangnya adalah kejutan yang tidak diminta siapa pun.
- **Berkas sebagian DITANDAI DI NAMANYA** (`_2dari4`). Berkas berisi 3 dari 39
  orang yang namanya sama persis dengan ekspor lengkap akan dikirim ke Talenta
  sebagai jadwal seluruh divisi — dan 36 orang yang tidak ikut tidak terjadwal
  tanpa satu pun pesan.
- Yang **belum punya Employee ID** ditandai di daftar pilihnya, bukan cuma
  dihitung sesudah berkasnya terunduh: barisnya diterima Talenta tanpa keluhan
  lalu dilewati.

### Jadwal: pengajuan lewat DUA persetujuan (29 Agustus 2026)

Permintaan user: pengajuan off/izin/cuti disetujui **head dulu, baru HRD**.

```
MENUNGGU  --head meloloskan-->  MENUNGGU_HRD  --HRD mengesahkan-->  DISETUJUI
    |                                |
    +-- head menolak --> DITOLAK     +-- HRD menolak --> DITOLAK
```

- **Urutannya ditegakkan di SERVER** (`putus_pengajuan`), bukan cuma di layar.
  Tanpa itu head tinggal mengirim `status:'DISETUJUI'` sekali dari console dan
  langkah HRD terlewat seluruhnya — sel jadwalnya ikut terisi. Bahaya yang sama
  sudah tercatat di komentar `putusPengajuan` untuk kasus kru yang menyetujui
  cutinya sendiri; yang berubah cuma siapa yang melompat.
- **Sel jadwal baru ditulis di langkah KEDUA.** `kirimPutusan` hanya menulis
  saat `DISETUJUI`, jadi persetujuan head tidak menyentuh lembar sama sekali.
  Kalau ditulis di langkah pertama, jadwal sudah berubah sebelum HRD setuju.
- **Kata di tombolnya beda per langkah**: head melihat *Teruskan ke HRD*, HRD
  melihat *Sahkan*. Tombol bertuliskan "Setujui" yang ternyata belum menyetujui
  apa pun adalah janji yang tidak ditepati.
- **`head_at` / `head_oleh` kolom SENDIRI**, terpisah dari `putus_*`. Kalau
  ditumpuk, nama head yang meloloskan tertimpa nama HRD begitu langkah kedua
  ditekan — dan pertanyaan "siapa head yang menyetujui cuti ini" tidak punya
  jawaban di layar mana pun. Keduanya lahir lewat `pastikan_kolom()`, bukan
  berkas migrasi.
- **HRD TIDAK bisa melakukan langkah pertama** (29 Agustus 2026, permintaan
  user). Sempat boleh dengan alasan head yang cuti tidak boleh menghentikan
  divisinya — tapi akibatnya HRD bisa menekan Teruskan lalu Sahkan berturut-
  turut, dan dua langkahnya jadi hiasan. Tombol HRD baru muncul SESUDAH head
  meneruskan.
- **Satu pengecualian, dan cuma satu**: divisi yang belum punya head sama
  sekali (`divPunyaHead` / `jdw_div_punya_head`). Tanpa itu pengajuan dari
  divisi seperti Marketing menggantung selamanya tanpa satu pun yang berhak
  meneruskan. Head yang berhalangan diselesaikan dengan MENUNJUK head kedua di
  Pengaturan — bukan dengan melonggarkan gerbang ini.
- **Jejaknya ditulis "✓ Disetujui head: <nama>"**, bukan "head: <nama>". Nama
  saja tidak mengatakan apa yang ia lakukan — ia bisa saja yang menolak. Yang
  perlu terbaca HRD sebelum menekan Sahkan adalah langkah pertama SUDAH lewat.
- **`AJU_BERJALAN`** (`['MENUNGGU','MENUNGGU_HRD']`) dipakai bersama oleh
  lencana sidebar, tab Antrian, dan tombol Batal. Tiga tempat yang menghitung
  sendiri pasti menyimpang begitu ada status baru — dan `MENUNGGU_HRD` yang
  jatuh ke tab Riwayat adalah pekerjaan yang disembunyikan di balik nama yang
  mengatakan sudah selesai.
- Query `getAll` juga memakai kedua status itu sebagai "masih berjalan"; kalau
  tidak, pengajuan yang sudah diloloskan head masuk potongan 200 baris terakhir
  dan bisa hilang dari layar HRD tanpa pernah diputuskan.
- **`putuskan()` mengoper `status` apa adanya.** Dulu di situ tertulis
  `DISETUJUI` mati — warisan dari waktu putusannya satu langkah — jadi tombol
  "Teruskan ke HRD" tetap mengirim DISETUJUI dan ditolak server dengan pesan
  yang membingungkan. **Ujinya lolos** karena memanggil `kirimPutusan()`
  langsung, melewati `putuskan()`. Uji tombol harus MENGKLIK tombolnya.
- **Pengajuan SATU TANGGAL**, bukan rentang (29 Agustus 2026). Rentang membuat
  satu persetujuan menimpa belasan sel sekaligus tanpa pernah melihat isinya.
  `sampai` tetap ada di data (pengajuan lama menyimpannya) dan disamakan
  dengan `dari` saat dikirim.
- **Form menampilkan shift yang SEKARANG ada** di tanggal itu
  (`gambarShiftSekarang`). Tanpa itu yang mengajukan tukar shift tidak melihat
  apa yang sedang ia tukar, dan head tidak tahu apa yang akan tertimpa.
- **`bisaLihatAju()` TERPISAH dari `bisaPutuskan()`.** Penyaring daftarnya
  sempat memakai `bisaPutuskan`, dan begitu langkah HRD lahir akibatnya
  langsung terasa: pengajuan yang baru diteruskan head LENYAP dari layarnya
  sendiri — sama persis seperti kalau ia menolaknya. Siapa yang boleh MELIHAT
  tidak boleh bergantung status.
- **Pita menyebut DUA angka**: yang menunggu keputusan saya, dan yang sudah
  saya teruskan ke HRD. Tanpa yang kedua, head yang barusan meneruskan tidak
  punya satu pun tanda bahwa pengajuannya masih hidup.
- Urutan daftar memakai `ajuBerjalan`, bukan `status===MENUNGGU` — kalau
  tidak, baris yang baru diteruskan jatuh ke bawah bersama riwayat.
- **Kru boleh menarik pengajuannya selama belum disahkan**, termasuk saat sudah
  di meja HRD.

### Jadwal: "Isi Sel Kosong" jadi "Isi Jadwal" (29 Agustus 2026)

Permintaan user. Tiga perubahan yang saling terkait:

- **Tidak ada hari yang tercentang saat dibuka** (`hari:[0,0,0,0,0,0,0]`).
  Sebelumnya ketujuhnya menyala, jadi satu klik shift menyentuh seluruh minggu.
- **`timpa` bawaannya `true`** — sel yang sudah terisi ikut diganti.
- **Namanya ikut berubah.** Alat bernama "Isi Sel Kosong" yang menimpa sel
  terisi adalah cara tercepat menghapus kerja head lain; jawabannya mengganti
  NAMANYA, bukan membatasi alatnya. Yang menahan salah tekan bukan lagi nama,
  melainkan konfirmasi bentrok di `isiSisaPilih()` — tiap sel yang tertimpa
  disebut satu per satu, dan yang lahir dari pengajuan disetujui ditandai.

### Jadwal: HRD mengurus DATA DIRI, bukan hak akses (19 Agustus 2026)

Halaman **Data Pegawai** di modul Jadwal Shift memberi HRD dua hal yang dulu
harus menunggu superadmin: **menambah kru baru** dan **menonaktifkan yang
keluar**, plus membetulkan data dirinya (Tim, no HP, Employee ID Talenta,
jabatan, status kerja, tanggal masuk). Yang **tidak** ikut, dan pemisahan
inilah alasan halamannya ada: modul mana yang boleh dibuka siapa, dan siapa
yang jadi admin modul — keduanya tetap di **Kelola Akses** superadmin.

Ditegakkan di server lewat dua endpoint account-api yang **tidak menyentuh
tabel `grants` maupun `admins` sama sekali**. Yang harus dijaga saat
menyentuhnya:

- `simpan_user_inti()` adalah isi `saveUser` **tanpa gerbang**, dipakai
  bersama oleh jalur superadmin dan jalur roster. Ia **selalu menulis kolom
  `pin` dan `active`** saat mengubah, dan yang tidak dikirim dianggap
  `'1111'` / aktif. `aksi_roster_simpan_user()` karena itu **menyisipkan
  keduanya dari baris lama**. Menghapus dua baris itu tidak melempar apa pun:
  gejalanya PIN seluruh kru jadi 1111 satu per satu, dan kru yang sudah keluar
  hidup lagi begitu nomor HP-nya dibetulkan.
- **Kolom Tim memang memberi akses modul bawaan** (`tim_bawaan_jadwal`), jadi
  HRD menulis "Bar" = orang itu bisa membuka modul Jadwal. Disengaja — tanpa
  Tim, kru baru tidak muncul di lembar mana pun. Yang tetap mustahil: modul di
  LUAR bawaan Tim, dan mengangkat siapa pun jadi admin.
- **Hapus permanen ADA sejak 29 Agustus 2026**, dan hanya untuk akun yang
  **sudah dinonaktifkan** (`rosterHapusUser`). Yang diminta user: nomor HP,
  username, dan Employee ID-nya bisa dipakai lagi. Syarat nonaktif dulu itu
  pagarnya — dua langkah dengan jeda di tengah, dan jeda itulah yang menahan
  penghapusan karena salah klik. **Ditegakkan di server** (`must_deactivate_
  first`), bukan cuma di layar.
- **`grants` & `admins` ikut dibuang.** Kalau tidak, barisnya jadi yatim dan
  HIDUP LAGI begitu id yang sama dipakai ulang — memberi akses modul kepada
  orang yang tidak pernah diberi apa pun. Justru itu yang membuat "id-nya bisa
  dipakai lagi" berbahaya kalau dikerjakan setengah.
- Superadmin dan diri sendiri tetap tidak bisa dihapus dari sini, alasan yang
  sama dengan nonaktif.
- Nonaktif **bukan** hapus. `kruDivisi()` menyaring `active!==false`, jadi yang
  dinonaktifkan hilang dari **seluruh** lembar termasuk bulan lalu — selnya
  tetap tersimpan dan kembali saat diaktifkan lagi. Menghapus akun (hanya bisa
  superadmin) membuat jadwal lama benar-benar kehilangan namanya.
- **Rekap Pegawai membaca SEMUA divisi** sejak tanggal yang sama
  (`rekapKandidat` tidak lagi dipotong `divisiLihat()`). Hak MENGUBAH sel di
  halaman itu tetap `bolehUbah(div)`.
- **Daftarnya menjelaskan saringannya sendiri.** Tiga kendali berdiri berjauhan
(tapis Aktif/Nonaktif, divisi, kotak cari), dan yang paling sering terjadi:
orang mencari nama yang ADA tapi tapisnya masih di "Aktif" sementara orangnya
sudah nonaktif — lalu menyimpulkan datanya hilang. Sekarang saringan yang
sedang berlaku disebut dengan KATA di atas tabel, berikut tautan **Bersihkan
saringan** yang mengembalikan ketiganya sekaligus. Bagian yang cocok dengan
kotak cari **disorot** (`sorot()`, di-esc dulu baru ditandai), dan baris kru
nonaktif diredupkan (`.peg-mati`).

Empat kolom kepegawaian adalah **daftar tertutup** di layar ini:
  `HR_BRANCH` / `HR_ORG` / `HR_LEVEL` / `HR_STATUS`. Nilai tersimpan yang tidak
  ada di daftar tetap digambar dan ditandai `(lama)` lewat `opsiHR()` — tanpa
  itu, membuka form seorang kru yang datanya diimpor dengan ejaan lain akan
  MENGGANTI kolomnya ke pilihan pertama begitu Simpan ditekan, tanpa satu pun
  galat. `jobPosition` sengaja tetap teks bebas: isinya jabatan sungguhan, dan
  daftar tertutup di situ akan basi tiap ada posisi baru.

### Portal: Kelola User dilipat, dan hapus permanen berpagar (2 September 2026)

`deploy/index.html` → **Kelola Akses** → tab **User** (superadmin, di balik PIN).
Beda dari halaman **Data Pegawai** di modul Jadwal: yang ini mengurus **hak
akses modul & admin modul**, yang itu mengurus **data diri**. Pemisahan itu
sengaja — lihat bagian Data Pegawai di atas.

**Formulirnya dilipat jadi empat seksi `<details class="af-sec">`** — Identitas
& akun, Data kepegawaian (tertutup, 6 kolom Talenta), Modul yang boleh dibuka,
Kelola akses. Dulu ketiganya digelar sekaligus bersama **sepuluh paragraf
penjelasan**, jadi tombol Simpan berada dua layar penuh di bawah kotak Nama dan
membetulkan satu nomor HP berarti menggulir turun lalu naik lagi.

- **Penjelasannya TIDAK dibuang satu kata pun** — ia pindah ke
  `<details class="af-help">` di dalam seksinya. Paragraf itu ditulis untuk
  orang yang sedang memutuskan centang mana yang diberikan, dan justru pada
  detik itulah ia dibutuhkan. `tools/uji-kelola-user.js` menghitung **10**
  paragraf dan memeriksa isi tiap-tiapnya: paragraf yang jatuh saat menyunting
  formulir tidak menimbulkan galat apa pun, cuma centang yang diberikan tanpa
  tahu akibatnya.
- **Baris tombol ada DI LUAR `.af-scroll`.** Yang menggulir cuma isiannya, jadi
  Simpan / Batal / Hapus selalu di tempat yang sama. Centang *Akun aktif* ikut
  pindah ke baris itu — ia keadaan akun, sama seperti Simpan dan Hapus.
- **Kedua kolom menggulir sendiri** di atas 900px (`position:sticky` +
  `max-height:calc(100vh - 108px)`), jadi halamannya tidak bergerak sama sekali
  dan kotak cari tidak ikut hanyut saat menggulir ke user ke-38. Di bawah 900px
  gulir bersarang **dimatikan**: dua kotak gulir di dalam halaman yang juga
  menggulir membuat orang menggeser yang salah lalu mengira daftarnya mentok.

**Hapus permanen hanya untuk akun yang SUDAH dinonaktifkan.** Aturan yang sama
dengan `rosterHapusUser` di Data Pegawai, dan alasannya sama: dua langkah
dengan jeda di tengah, dan jeda itulah yang menahan penghapusan karena salah
klik. Yang perlu dijaga:

- **Ditegakkan di server** (`must_deactivate_first` di `aksi_hapus_user`), bukan
  cuma di layar. Tombolnya memang hanya digambar untuk baris nonaktif, tapi satu
  panggilan dari console peramban melewati seluruh penjagaan layar.
- **`grants` & `admins` ikut dibuang** — sudah begitu sejak awal, dan itu justru
  yang membuat "id-nya bisa dipakai ulang" aman: baris yatim akan HIDUP LAGI
  begitu id yang sama dipakai lagi.
- **Tapis Aktif / Nonaktif / Semua**, bawaannya **Aktif**. Tanpa itu, menemukan
  akun nonaktif yang mau dihapus berarti menyisir seluruh daftar mencari baris
  yang justru paling sulit dilihat (`.u-row.inactive` diredupkan). Angka di tiap
  tombol dihitung dari **kata kunci yang sedang berlaku**, bukan dari seluruh
  daftar — kalau tidak, mencari nama yang ternyata nonaktif memperlihatkan
  "Nonaktif 6" sementara daftarnya kosong.
- **Keadaan kosong menyebut tapisnya**, bukan cuma kata kuncinya. Salah paham
  yang sudah tercatat di Data Pegawai: orang mencari nama yang ADA tapi orangnya
  nonaktif, tapisnya masih di Aktif, lalu menyimpulkan akunnya sudah terhapus.
- **Yang BELUM dipagari, dan disengaja:** tidak ada penjaga "superadmin
terakhir" di `aksi_hapus_user`. Menonaktifkan superadmin terakhir sudah mengunci
semua orang di luar sebelum sampai ke penghapusan, jadi pagarnya ada di langkah
sebelumnya — tapi kalau suatu hari nonaktif dilonggarkan, ini yang pertama harus
ditambahkan.

```bash
node tools/uji-kelola-user.js   # 39 pemeriksaan, jsdom + account-api tiruan
```

Ujinya memanggil `renderAdminList` / `fillAdminForm` langsung — panel ini di
balik gerbang PIN (`verifyAdminPin`), dan yang diuji isinya, bukan gerbangnya.
Daftar user disuntikkan ke `admin-list._users`, tempat yang sama yang diisi
`loadAdminUsers()`, jadi kode yang jalan tetap kode sungguhan.

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
node tools/uji-hak-akses.js     # 88 pemeriksaan, butuh php + pdo_sqlite di PATH
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
  Sama berbahayanya: memakai `p.divisi` utuh sebagai **kunci pengelompokan**.
  Terjadi 19 Agustus 2026 di kotak pilihan Rekap Pegawai — kelompok bernama
  `"floor,bar"` tidak sama dengan kode divisi mana pun, jadi orangnya **lenyap
  dari daftar** tanpa galat sementara chip di sebelahnya tetap menulis kedua
  divisinya. Kelompokkan per divisi yang ia pegang (satu orang boleh muncul di
  beberapa kelompok), dan sediakan keranjang terakhir untuk kode tak dikenal —
  daftar pilihan tidak boleh pernah menjatuhkan orang diam-diam.
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

### Dua situs yang TIDAK di bawah `deploy/`: `absensi` dan `investor`

```
absensi/                    ← FRONTEND (PWA)  -> /public_html/absensi/
                               = absensi.laksamanamuda.id
                               (dev: dev.laksamanamuda.id/absensi/)
absensi-mysql/              ← BACKEND         -> /public_html/absensi/api/
                               dipanggil sebagai 'api/api.php' — DI DALAM,
                               bukan folder tetangga

investor/                   ← Investor Compass, SATU berkas HTML mandiri
                               -> /public_html/investor.laksamanamuda.id/
                               = investor.laksamanamuda.id
                               (dev: /public_html/dev.investor.laksamanamuda.id/
                                     = dev.investor.laksamanamuda.id)
                               TIDAK punya backend: tidak memanggil API mana
                               pun dan tidak membaca sesi Office.
```

Perhatikan bedanya penamaan folder di server: `absensi` memakai nama pendek,
`investor` memakai NAMA DOMAIN PENUH — begitulah subdomainnya dibuat di cPanel,
dan menyamakannya "biar rapi" akan membuat deploy mendarat di folder yang tidak
dilayani siapa pun. Salahnya tidak melempar apa pun; yang membuka alamatnya
cuma melihat 404.

**Investor punya workflow SENDIRI: `.github/workflows/deploy-investor.yml`.**
Ia tidak ada di `deploy.yml` maupun `deploy-dev.yml` — jadi kalau menambah
sesuatu di kedua berkas itu, investor memang tidak perlu ikut. Cabangnya tetap
sama (`develop` → dev, `main` → produksi); yang membedakan cuma penyaring
`paths: investor/**`, supaya menyunting satu berkas HTML tidak memicu 40-an
langkah FTP milik seluruh modul Office. Berkas workflow-nya sendiri ikut di
`paths` — tanpa itu, memperbaiki workflow-nya tidak pernah bisa diuji.

**Kedua targetnya memakai secret `FTP_*` (produksi), termasuk yang dev** —
bukan salah ketik. Susunannya:

```
/public_html/
├── dev.laksamanamuda.id/            ← rumah akun FTP dev; "/" baginya
├── dev.investor.laksamanamuda.id/   ← docroot dev.investor, SEJAJAR
└── investor.laksamanamuda.id/       ← docroot investor (produksi)
```

Akun FTP dev terkurung di docroot-nya sendiri, jadi folder sejajar mustahil
dicapai olehnya (`../` ditolak server). Akun produksi rumahnya di home akun —
itu sebabnya seluruh job di `deploy.yml` berawalan `/public_html/` — jadi ia
bisa menulis ke kedua tempat. Percobaan pertama memakai `DEV_FTP_*` dan
BERHASIL tanpa satu pun galat, tapi foldernya lahir DI DALAM docroot dev
sementara subdomainnya tetap 403.

Yang paling sering disalahpahami soal jalur ini: **merge `develop` → `main`
TIDAK menyalin apa pun dari server dev ke server produksi.** Keduanya diisi
dari isi folder `investor/` di repo. Berkas yang disunting langsung di server
lewat cPanel karena itu akan tertimpa pada deploy berikutnya, tanpa satu pun
peringatan.

Workflow-nya punya langkah **Verifikasi** yang membuka alamat situsnya lalu
membandingkan isinya dengan repo (sesudah CRLF dibuang — FTP mengubah akhir
baris). Kalau `https` gagal karena sertifikat subdomainnya belum terbit, ia
mencoba `http` dulu sebelum menyerah: SSL yang belum siap bukan tanda deploy
gagal, dan menggagalkan run karenanya cuma melatih orang mengabaikan tanda
merah.

### Investor Compass: SSO Office, dan tidak satu pun angka contoh

Sampai 27 Agustus 2026 halaman ini dijaga **satu kata sandi yang tertulis di
dalam HTML** (`CONFIG.password`) dan seluruh isinya — omset, dividen, laporan,
program, event, buku — adalah **angka karangan di objek `CONFIG`**. Keduanya
sudah dicabut, dan alasan mencabutnya perlu diingat sebelum ada yang
"mengembalikannya biar cepat":

- Kata sandi di dalam HTML dipegang siapa pun yang menekan View Source, dan
  satu kata sandi untuk semua orang berarti mencabut akses **satu** investor
  mengharuskan mengganti kata sandi **semua** orang.
- Angka contoh yang tampil rapi di halaman investor adalah kesalahan yang
  paling mahal di repo ini: tidak ada satu pun tanda di layar yang
  membedakannya dari angka sungguhan.

Sekarang gerbangnya **akun Office yang sama** (`account-api?action=login`,
nama/username + PIN), dan yang lolos hanya pemegang kunci modul **`investor`**.
Kuncinya terdaftar lewat kartu `key:'investor'` di `BRANCHES`
(`deploy/index.html`) — tanpa baris itu kotak centangnya tidak pernah muncul di
Kelola Akses dan tidak ada seorang pun yang bisa masuk, tanpa satu layar pun
yang menyebutkan sebabnya.

**Omsetnya nyata, lewat endpoint berpagar sendiri:**

```
investor/index.html  →  POST kompas-api-mysql/api.php {action:'investorRingkas', sesi:<token>}
                     →  lib_sesi.php  →  account-api?action=whoami  (server-ke-server)
                     →  ringkas_investor()  →  angka yang SUDAH dijumlahkan
```

- **Bukan `getAll`.** getAll memulangkan seluruh blob omset — pegawai, 222
  baris compliment berikut pemberinya, piutang, pemilik, breakdown per kasir —
  dan ia **tidak menanyakan siapa pun**. Menyuruh halaman investor
  memanggilnya berarti menuliskan alamat blob itu di HTML yang dibuka orang
  luar perusahaan.
- `kompas-mysql/lib_sesi.php` adalah **salinan KETIGA** berkas kembar
  (dw-mysql, jadwal-mysql). Menyunting satu berarti menyunting tiga.
- `investorRingkas` adalah **satu-satunya** aksi berpagar di kompas-api. Aksi
  lain sengaja dibiarkan terbuka: semuanya dipanggil dari dalam Office, dan
  memasang gerbang di sana sekarang akan mematikan panel Finance.
- **TIGA KONVENSI PENJUALAN HIDUP BERDAMPINGAN DI OFFICE, dan ketiganya sah.**
  Ini sumber salah paham paling mahal di sekitar angka omset — dua kali
  ditanyakan dalam satu hari (27 Agustus 2026):

  | | rumus | dipajang di | Agustus 2026 |
  |---|---|---|---|
  | **net** | `food+bev+lainnya−discount` | Dashboard Omset ("Total Omset Hari Ini (net)") | Rp 546.005.454 |
  | **tagihan** | net + service + pajak | Rekap Penjualan ("after tax & service") | Rp 622.035.872 |
  | **netSales** | tagihan − compliment | Laporan CFO, **dan halaman investor** | Rp 610.400.022 |

  Menyebut "angka omset" tanpa menyebut layarnya karena itu selalu ambigu.

  **Compliment adalah selisih ketiga↔kedua.** Di Office ia METODE PEMBAYARAN
  (`reports[].pay.compliment`): barangnya tetap ditagihkan lalu "dibayar"
  pakai compliment, jadi ia ADA di dalam tagihan. Di laporan CFO ia baris
  diskon yang memotong penjualan, karena tamunya memang tidak membayar.
  `daily.discount` TIDAK memuatnya — itu cuma bill discount — jadi
  mengurangkannya aman. Kalau suatu hari compliment ikut dimasukkan ke kolom
  Discount di Input Omset Harian, pengurangannya WAJIB dicabut di
  `kp_netsales_hari()` DAN di `laba_rugi_bulanan()`.

  **`kp_peta_harian()` adalah satu-satunya tempat blob dibaca**, dan kedua tab
  halaman investor dihitung darinya. Sebelumnya masing-masing punya loop
  sendiri dengan aturan compliment yang beda tipis, sehingga kartu "Omset"
  bisa menyebut angka lain daripada "Net Sales" di tab sebelahnya — persis
  yang dikeluhkan user. Selisih semacam itu sekarang mustahil secara
  konstruksi, bukan karena dijaga. Jangan pisahkan lagi.

  Balasan API memuat KETIGANYA (`omset`, `dibayarTamu`, `netSales`) dan tidak
  memilih. Yang memilih adalah layar, jadi konvensinya bisa diganti tanpa
  menyentuh server. Halaman investor memakai `netSales` di SELURUH tab
  Ringkasan — kartu, grafik tahunan, grafik harian, sorotan, rata-rata per
  transaksi, dan persentase target. Seragam, karena kartu satu konvensi di
  atas grafik konvensi lain membuat yang menjumlahkan batangnya mendapat
  angka lain daripada yang tertulis besar di atasnya.

  Baris keterangan kecil di bawah kartu menyebut service, pajak, compliment,
  **dan angka tagihan POS-nya utuh** — itulah jembatan ke kartu Dibayar Tamu
  di Rekap Penjualan. Kedua layar itu MEMANG harus beda sebesar compliment:
  Rekap mencocokkan POS dengan setoran bank dan `compliment` adalah salah satu
  METODE PEMBAYARAN di daftarnya, jadi mengeluarkannya membuat jumlah metode
  tidak lagi sama dengan totalnya. Barisnya tidak digambar kalau service,
  pajak, dan compliment ketiganya nol.
**Satu berkas HTML, dua situs.** Alamat Office diturunkan dari host yang
membuka (`dev.` → `https://dev.laksamanamuda.id`, selain itu
`https://team.laksamanamuda.id` — **bukan** `office.laksamanamuda.id`, yang
tidak ada di DNS). Kalau dipatok satu, halaman dev akan memajang omset
PRODUKSI dengan angka yang kelihatan wajar.

**Bagian "Omset Harian" DICABUT dari dashboard** (29 Agustus 2026, permintaan
user). Sempat ada sebagai grafik + tabel per bulan; dibuang atas permintaan yang
sama sehari kemudian.

Yang TETAP ada: `harian` di balasan `investorRingkas` — Sorotan menghitung hari
terbaik dan rata-rata dari sana. Mencabutnya karena grafiknya hilang akan
mematikan Sorotan diam-diam. Isinya SELURUH hari yang ada datanya (bukan 30
hari terakhir seperti dulu), ~365 baris setahun.

**Angka uang SELALU PENUH** (29 Agustus 2026, permintaan user). Bentuk singkat
`rpShort` ("Rp 622 jt") dicabut dari seluruh teks dan diganti `rp()`.
Pembulatan ke jutaan menyembunyikan sampai Rp 999.999, dan di halaman yang
dibaca investor selisih sebesar itu adalah selisih yang ditanyakan. Yang tetap
singkat cuma **sumbu Y grafik** (`rpSumbu`) — sembilan digit per garis
mendorong grafiknya keluar layar, dan angka pastinya sudah ada di tooltip.

**Laporan PDF bulanan: Balance Report & General Ledger** (29 Agustus 2026).
Daftarnya **satu bulan saja, dipilih lewat penyaring** — bukan seluruh bulan
ditumpuk jadi kartu. Daftar yang memanjang tiap bulan mendorong form unggahnya
dua belas kartu ke bawah sesudah setahun. Bentuk penyaringnya sengaja sama
dengan yang di tab Laba Rugi: dua daftar bulanan di satu halaman yang cara
memilihnya berbeda membuat orang mengira salah satunya tidak bisa dipilih.
Sesudah unggah, penyaring **pindah ke bulan yang barusan diunggah** — kalau
tidak, yang mengunggah bulan baru tidak melihat perubahan apa pun dan mengira
unggahannya gagal.
Satu kali unggah untuk kedua berkas — keduanya selalu terbit bersamaan dari
sistem akuntansi, dan dua form berarti dua kali memilih bulan yang sama.

- **Binernya di disk, bukan di database** (`inv_lapor_dir()`), pola yang sama
  dengan event-mysql & marketing-mysql. General Ledger sebulan bisa belasan MB;
  di LONGTEXT tiap pembacaan daftar ikut menyeret isinya melewati
  `max_allowed_packet`. Foldernya **diusahakan di luar web root**; kalau
  terpaksa di dalam, ditutup `.htaccess` — ini neraca perusahaan.
- Tabel `inv_lapor`, kunci **(bulan, jenis) UNIK**: unggah ulang MENGGANTI,
  bukan menumpuk. Dua Balance Report untuk bulan yang sama berarti investor
  melihat dua tombol berbeda isi tanpa tanda mana yang terbaru.
- Berkas lama dihapus **SESUDAH** yang baru berhasil ditulis. Dibalik, satu
  kegagalan tulis meninggalkan bulan itu tanpa laporan sama sekali.
- **PDF diperiksa dari ISI berkasnya** (`%PDF` di empat byte pertama), bukan
  namanya: nama diketik orang dan ekstensi bisa diganti.
- **Dua pagar berbeda:** unggah/hapus = `sesi_admin_modul($u,'investor')`;
  membaca = `sesi_punya_modul`. Investor perlu membaca neraca, tidak
  menggantinya. `bolehUnggah` **dihitung server** dan ikut di balasan
  `investorRingkas` — halaman investor tidak menyimpan `adminModules` sama
  sekali, dan kalaupun menyimpan, apa pun di peramban bisa diketik ulang.
- **Isi berkas dikirim sebagai BINER lewat POST**, bukan base64 di JSON dan
  bukan `<a href>`: base64 membengkakkan 12 MB jadi 16 MB, dan URL dengan
  token tercatat di log server serta riwayat peramban.
- Kalau satu dari dua berkas gagal, **yang berhasil TETAP tersimpan** dan yang
  gagal disebut namanya. Membatalkan keduanya berarti mengunggah ulang berkas
  10 MB yang sebenarnya sudah sampai dengan selamat.

**Tab Laporan Keuangan = Profit Loss Report, tapi separuh** (27 Agustus 2026).
Susunannya disalin persis dari laporan bulanan CFO — urutan dan nama barisnya
sama — supaya investor tidak perlu mencocokkan dua penyusunan yang berbeda.
Yang perlu dijaga:

- **Hanya blok Pendapatan yang punya sumber.** COGS, Operational Expense,
  Other Income & Expense, dan Depreciation dicatat di pembukuan Finance dan
  tidak ada satu pun layar Office yang menginputnya. Barisnya tetap digambar,
  ditandai `belum ada inputnya`. Menghapusnya membuat halaman terbaca seolah
  Net Sales itu laba; mengisinya nol membuat Gross Profit = Net Sales dan Net
  Profit = Net Sales — dua angka salah yang terlihat sangat meyakinkan.
- **Compliment adalah baris pengurang TERSENDIRI**, dan itu bukan kosmetik.
  Di Office ia metode pembayaran (`reports[].pay.compliment`) dengan register
  sendiri (`compliments[]`), sementara `daily.discount` cuma bill discount.
  Karena terpisah, menjumlahkan keduanya aman. Kalau suatu hari compliment
  ikut dimasukkan ke kolom Discount di Input Omset Harian, baris ini WAJIB
  dicabut — kalau tidak Net Sales menyusut dua kali lipat tanpa satu pun galat.
- **`Income Pb 1` itu `daily.tax`, `Income service charge` itu
  `daily.service_charge`.** Keduanya IKUT di Total Sales di sini — beda dari
  KPI Ringkasan yang memakai net. Itu memang bentuk laporan CFO, dan itulah
  sebabnya angka di tab Laporan lebih besar daripada angka di tab Ringkasan
  untuk bulan yang sama.
- **Juni 2026 tidak bisa ditampilkan.** `daily` produksi baru mulai
  2026-07-31, jadi laporan PDF Juni tidak punya pasangan di sistem. Bulan yang
  tidak ada datanya memang tidak muncul di pemilih — bukan digambar nol.
- Berkas PDF laporan CFO **jangan di-commit**: isinya bertanda "PRIBADI DAN
  RAHASIA" dan memuat neraca serta gaji.

**Kerangkanya menyalin modul Reservasi** (27 Agustus 2026): menu di kiri
(`aside.sidebar` + `.side-nav`), tombol Keluar berupa ikon kecil di kaki sidebar
bersama avatar & nama pemakainya (`.side-user > .logout-x`). CSS-nya SALINAN,
bukan berkas bersama — mengubah sidebar Reservasi tidak ikut mengubah yang di
sini.

Tab **Desain Buku** dan blok **Yang Baru & Akan Launching** DIHAPUS di tanggal
yang sama atas permintaan user; keduanya tidak punya sumber data dan cuma
memajang keadaan kosong. Sisa tab lama "Program & Event" tinggal agendanya,
jadi namanya jadi **Upcoming Event** — menu bernama "Program & Event" yang
isinya cuma event adalah janji yang tidak ditepati tiap kali dibuka.

**Upcoming Event & Promo lewat SATU pintu berpagar** (27 Agustus 2026).
`kompas-api?action=investorAgenda` mengumpulkan agenda dari Marketing, Event,
dan BD OS **server-ke-server**, lalu memulangkan daftar pendek berisi judul,
tanggal, tempat. Peramban tidak pernah memegang alamat `getAll` ketiganya —
marketing membawa CRM klien, pipeline, dan invoice; bd membawa purchase order
berikut harganya, dan ketiganya tidak menanyakan siapa pun.

Ditaruh di kompas-api karena `lib_sesi.php` sudah ada di sana. Menaruh gerbang
di tiga modul berarti tiga salinan baru berkas kembar itu — dari tiga jadi
enam — dan berkas kembar yang terlalu banyak adalah yang salah satunya pasti
tertinggal.

Yang perlu dijaga:

- **Aksi TERPISAH dari `investorRingkas`**, dan dimuat MALAS di layar (hanya
  saat tab Event/Promo dibuka, hanya sekali). Ia memicu tiga permintaan HTTP;
  tab Ringkasan yang paling sering dibuka tidak perlu membayar itu.
- **`poster` promo sengaja tidak ikut.** Isinya data URI hasil unggahan, bisa
  400 KB per promo.
- Modul yang tidak menjawab **dilaporkan** (`gagal`) dan digambar sebagai pita
  peringatan. Daftar kosong yang sebenarnya berarti "servernya mati" terbaca
  sebagai "memang tidak ada acara" — dan yang kedua tidak membuat siapa pun
  memeriksa apa pun.
- Batas **200 event / 50 promo**, dan yang terpotong disebutkan jumlahnya.
  Event dibatasi longgar karena kalendernya butuh SELURUH acara di bulan yang
  sedang dilihat — potongan 20 baris membuat bulan berikutnya tergambar kosong
  padahal acaranya ada.
- **Upcoming Event punya dua bentuk**: tabel berhalaman (10 baris) dan
  kalender bulanan. Keduanya menggambar dari `AG.event` yang SAMA — datanya
  tidak diambil dua kali. Kalendernya mulai hari **Minggu**, sama dengan Radar:
  dua kalender di satu perusahaan yang kolom pertamanya berbeda hari membuat
  orang salah baca tanggal saat berpindah layar.
- Nomor halaman dipangkas jadi jendela 5 di sekitar yang aktif, dan `EV_HAL`
  dijepit ke rentang sah tiap kali digambar — daftar yang menyusut
  meninggalkan halaman 4 yang sudah tidak ada, dan tabelnya tergambar kosong
  padahal datanya ada.

**Tab yang masih kosong itu disengaja.** Dividen, laporan keuangan, program,
event, dan desain buku tidak punya sumber data di Office mana pun. Yang tampil
adalah keadaan kosong yang menyebutkan apa yang kurang. Tabnya **tidak
dihapus**: kalau dihapus, tidak ada satu pun tempat yang mengingatkan bahwa
lima hal itu pernah dijanjikan ada di sana.

Ujinya:

```bash
node tools/uji-investor.js   # 209 pemeriksaan, jsdom + account-api/kompas-api tiruan
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

### Service Excellent: papan Reward (27 Agustus 2026)

Aturan reward dulu cuma SATU BARIS teks di atas tabel Perolehan per Kru
(`rewardAturanTeks`, sudah dibuang). Sekarang `rewardPapanHtml()`: empat kartu
`.recap` + SATU tabel tangga + satu baris keterangan.

**Papan ini TIDAK punya satu pun kelas CSS sendiri, dan itu disengaja.** Versi
pertamanya (pagi yang sama) punya deret tangga bergaya `.rw-*` buatan sendiri
plus dua tabel kru — hasilnya terlihat seperti tempelan dari modul lain dan
lebih panjang daripada tabel Perolehan per Kru yang justru jadi isi halaman.
Sekarang seluruhnya memakai `.recap`, `.table-wrap`, dan `.hint` milik modul,
jadi apa pun yang berubah di gaya modul otomatis ikut.

**Jangan tambahkan daftar kru di papan ini.** Kolom Reward di tabel Perolehan
per Kru sudah menuliskan siapa dapat berapa dan siapa kurang berapa, untuk
orang yang sama, di layar yang sama.

Dua hal yang harus dijaga saat menyentuhnya:

- **Tiap kru dihitung di SATU tangga saja**, yaitu yang dibayarkan. Kru dengan
  120 review ada di tangga 100; menghitungnya juga di tangga 40 dan 70 membuat
  jumlah ketiganya lebih besar daripada jumlah kru yang dapat — dan angka yang
  tidak bisa dijumlahkan adalah angka yang berhenti dipercaya.
- **Yang belum lolos syarat minimum diukur jaraknya ke SYARAT, bukan ke
  tangga.** Syarat menang atas tangga di `rewardOf()`, jadi menulis "kurang 2
  ke tangga 40" untuk orang yang belum lolos minimum adalah janji yang tidak
  akan ditepati.

Papannya dihitung dari `baris` yang SAMA dengan tabel di bawahnya — dua tempat
yang menghitung reward sendiri-sendiri akan berselisih suatu hari, dan yang
selisih itu uang.

```bash
node tools/uji-reward-se.js   # 36 pemeriksaan, fungsinya dipotong dari sumber
```

Ujinya sengaja TERISOLASI, bukan merender seluruh modul: halaman itu memuat
`assets/venue-layouts.js` yang tidak ada di jsdom, jadi boot-nya selalu gagal
dan uji apa pun di sana akan gagal karena sebab yang tidak ada hubungannya
dengan reward. Fungsinya DIPOTONG dari berkas aslinya saat uji jalan, bukan
disalin — supaya ujinya ikut basi kalau fungsinya berubah.

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

### HAK AKSES TIDAK IKUT MERGE

Kode ada di git; **centang Kelola Akses ada di database**, dan dev memakai
`lakk5493_db_dev_account` sementara produksi memakai `lakk5493_db_account`.
Dua database, dua isi. Merge `develop` → `main` menyalin berkas, bukan baris
`grants`/`admins`.

Gejalanya selalu sama dan selalu membingungkan: modul barunya jalan mulus di
dev, lalu di produksi **tidak seorang pun bisa membukanya** — tanpa satu pun
galat, karena memang tidak ada yang rusak. Sudah kejadian 27 Agustus 2026 saat
modul `investor` naik: dev 6 pemegang, produksi 0.

Dua langkah yang keduanya perlu, dan yang kedua sering dikira sudah otomatis:

1. **Kunci modulnya didaftarkan.** `syncModules` cuma jalan saat superadmin
   MEMBUKA panel Kelola Akses (`openAdminPanel`) — bukan saat portal dimuat.
   Jadi di server yang panelnya belum pernah dibuka sejak modulnya lahir,
   kotak centangnya memang belum ada.
2. **Orangnya dicentang**, di server itu, satu per satu.

Untuk langkah 2 ada alat penyalin:

```bash
node tools/samakan-akses.js investor                 # lihat rencananya (tidak menulis)
LM_ADMIN="Admin" LM_PIN="…" node tools/samakan-akses.js investor --terapkan
```

PIN dibaca dari environment, **tidak pernah dari argumen** — argumen tercatat
di riwayat shell dan daftar proses. Secara bawaan alat ini **hanya menambah**:
akses yang ada di produksi tapi tidak di dev cuma dilaporkan. Dev itu tempat
main-main dan isinya rutin tertinggal; menjadikannya sumber kebenaran untuk
pencabutan berarti satu percobaan di dev bisa memutus akses orang yang sedang
bekerja. `--cabut` ada, tapi bacalah daftarnya dulu.

### Monarx memblokir langkah verifikasi backend (29 Agustus 2026)

Rumahweb memasang **Monarx** (WAF) di depan domainnya. Untuk IP runner GitHub
Actions ia menyajikan halaman *Access Denied / Human Verification*, jadi
`curl "…/account-api-mysql/api.php?action=ping"` memulangkan HTML challenge,
bukan JSON. Langkah **Verifikasi backend hidup dan versi terbaru** karena itu
melaporkan `GAGAL env BUKAN produksi — config.php salah` untuk backend yang
sebenarnya sehat.

Halaman itu sekarang **dikenali** (`mx-page` / `monarx` / `Access Denied`) dan
dilaporkan `LEWAT`, bukan `GAGAL`. Alasannya sama dengan sertifikat SSL yang
belum terbit di `deploy-investor.yml`: run merah yang penyebabnya di luar repo
cuma melatih orang mengabaikan tanda merah.

**Yang TIDAK ikut dilonggarkan**, dan sengaja: config dev yang terpasang di
produksi (`env` salah), parse error PHP, dan balasan kosong tetap GAGAL. Itu
kesalahan termahal di repo ini, dan halaman Monarx bisa dibedakan darinya.

Verifikasi isi berkas (`deploy/**`) TIDAK terpengaruh — ia membandingkan HTML
yang memang dilayani ke peramban biasa.

Kalau ingin pemeriksaannya jalan lagi: minta Rumahweb mengecualikan
`/*-api-mysql/*.php` dari Monarx.

**Push otomatis men-deploy.** `main` → **`team.laksamanamuda.id`** (produksi),
`develop` → `dev.laksamanamuda.id`. Berkas ini sempat menulis
`office.laksamanamuda.id`; nama itu **tidak ada di DNS** dan tidak pernah ada —
mencarinya di situ memakan satu putaran penuh pada 27 Agustus 2026 waktu
halaman investor perlu tahu ke mana harus meminta angka omset.

Keduanya lewat FTP dengan verifikasi isi berkas
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
