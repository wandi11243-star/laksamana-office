# Tangkapan layar Help Center

Panduan memanggil gambar lewat blok `gambar`, dan jalurnya SELALU relatif
terhadap folder ini:

```js
{ t:'gambar', berkas:'reservasi/dashboard.png',
  teks:'Keterangan di bawah gambar',
  tandai:['Bagian 1','Bagian 2'] }
```

berarti berkasnya `deploy/help/gambar/reservasi/dashboard.png`.

## Aturan

1. **Satu folder per kunci modul.** `reservasi/`, `event/`, `portal/`, dan
   seterusnya. Nama foldernya sama dengan nama berkas panduannya.

2. **Berkas yang belum ada TIDAK merusak halaman.** Yang tergambar adalah kotak
   bergaris yang menyebut jalur berkas yang ditunggu, jadi siapa pun yang
   membacanya tahu persis apa yang harus ditaruh dan di mana. Panduan boleh
   ditulis lebih dulu, gambarnya menyusul.

3. **PNG, lebar 1200 sampai 1600 px, di bawah 300 KB.** Gambar yang jauh lebih
   besar dari itu ikut terunduh tiap panduannya dibuka, sementara di layar ia
   toh dikecilkan ke lebar kolom.

4. **JANGAN memuat data sungguhan.** Tangkapan layar ini dibaca seluruh kru
   yang punya akses Help, termasuk yang tidak berhak melihat isi modulnya.
   Nama tamu, nomor HP, nominal uang, dan nama pegawai wajib disamarkan lebih
   dulu, atau diambil dari server dev dengan data contoh.

5. **Ambil dari modul yang sungguhan, jangan digambar ulang.** Ilustrasi buatan
   yang tidak sama dengan layar aslinya membuat orang mencari tombol yang tidak
   ada. Kalau modulnya berubah, gambarnya diganti, bukan panduannya saja.

6. **Gambar tetap gambar.** Jangan pernah menyalin potongan HTML modul ke dalam
   panduan supaya "terlihat hidup". Help yang memuat UI modul pelan-pelan jadi
   aplikasi kedua yang tampilannya menyimpang dari yang asli, dan orang
   mengikuti layar yang salah.

## Cara mengambilnya

Buka modulnya di peramban dengan akun yang berhak, lalu tangkap layarnya
seperti biasa. Belum ada alat otomatis untuk ini, dan itu disengaja: modul di
repo ini menuntut sesi Office yang hidup dan data yang masuk akal, sehingga
tangkapan otomatis dari halaman kosong justru memperlihatkan layar yang tidak
pernah dilihat siapa pun.
