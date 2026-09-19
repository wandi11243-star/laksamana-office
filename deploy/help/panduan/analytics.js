/*
  PANDUAN: Analytics
  ---------------------------------------------------------------------------
  Kuncinya 'analytics'. Nama menu disalin dari TITLES di deploy/analytics/.
  Modul ini punya 15 halaman analisa yang seluruhnya diturunkan dari SATU
  berkas POS per bulan, jadi bagian "Unggah Laporan" ditaruh paling depan —
  tanpa itu tidak satu pun halaman lain punya isi.
*/
LM_HELP_ISI('analytics', {
  ringkas: 'Menganalisa penjualan dari berkas POS yang diunggah: menu, jam, meja, promo, '
         + 'void, dan pengaruh acara terhadap omset.',
  untuk: 'finance dan manajemen',

  bagian: [

    {
      id: 'unggah', judul: 'Mulai dari sini: Unggah Laporan',
      isi: [
        { t:'teks', isi:'Seluruh halaman di modul ini diturunkan dari berkas *Sales '
              + 'Recapitulation* yang diekspor dari POS. Tanpa berkas bulan itu, halaman lainnya '
              + 'kosong — dan itu bukan kerusakan.' },
        { t:'langkah', isi:[
          'Ekspor laporan dari POS untuk bulan yang dimaksud.',
          'Buka *Unggah Laporan* di modul ini.',
          'Pilih berkasnya. Ia diurai di peramban, bukan dikirim mentah ke server.',
          'Periksa pratinjaunya: jumlah baris, rentang tanggal, dan peringatan kalau ada.',
          'Simpan.'
        ]},
        { t:'catatan', nada:'awas', judul:'ADA DUA BENTUK LAPORAN, dan bedanya menentukan apa yang bisa dijawab',
          isi:'*Sales Recapitulation Report* (Bill Report) satu baris per bill — cukup untuk '
            + 'omset per hari dan sebaran jam, tapi di dalamnya TIDAK ADA satu pun nama menu. '
            + '*Sales Recapitulation DETAIL Report* satu baris per menu terjual — itulah yang '
            + 'dibutuhkan halaman Menu, Kategori, dan Metode Kunjungan.' },
        { t:'catatan', nada:'awas', judul:'Satu bulan menyimpan SATU laporan',
          isi:'Mengunggah bentuk yang lain untuk bulan yang sama akan menggantikannya, bukan '
            + 'menambah. Jadi kalau kamu perlu nama menu, unggahlah Detail Report.' },
        { t:'catatan', nada:'info', judul:'Kalau sebuah halaman menyuruh "unggah ulang"',
          isi:'Itu berarti berkas bulan itu diunggah sebelum kolom yang dibutuhkan halaman '
            + 'tersebut mulai dibaca. Unggah ulang berkas yang sama — tidak perlu ekspor baru '
            + 'dari POS, kecuali pesannya memang menyuruh begitu.' },
        { t:'catatan', nada:'awas', judul:'Berkas POS jangan disebar',
          isi:'Satu berkas memuat seluruh transaksi sebulan berikut nomor bill-nya, dan nomor '
            + 'bill di POS ini memuat stempel waktu transaksinya.' }
      ]
    },

    {
      id: 'peta', judul: 'Halaman Mana Menjawab Apa',
      isi: [
        { t:'tabel',
          kepala:['Halaman','Menjawab'],
          baris:[
            ['Ringkasan','Angka pokok bulan itu, dan jembatan ke tiga layar Office yang angkanya berbeda.'],
            ['Hari & Jam','Hari apa yang ramai, dan jam berapa.'],
            ['Menu & Bahan Baku','Menu apa yang laku, dan perkiraan bahan yang seharusnya keluar gudang.'],
            ['Kategori Menu','Omset per kategori, termasuk EVENT.'],
            ['Metode Kunjungan','Dari kanal mana tamunya datang: Dine In, GrabFood, GoFood, TikTok Go, ESB Order.'],
            ['Performa Meja','Omset tiap meja dan omset per kursinya.'],
            ['Performa Talent','Kontribusi tiap penampil, dihitung dari jam tampilnya sendiri.'],
            ['Error & Koreksi Bill','Bill yang ditandai error: sebabnya, nilainya, siapa yang memegangnya.'],
            ['Void & Cancel Menu','Siapa yang membatalkan, alasannya, itemnya, dan jamnya.'],
            ['Promo & Klaim','Promo mana yang paling banyak diklaim.'],
            ['Tren Bulanan','Perbandingan bulan ke bulan.'],
            ['Pengaruh Event / Marketing','Apakah hari berevent memang lebih besar daripada hari biasa.'],
            ['Performa Konten / Desain','Dibaca dari modul Konten, bukan dari berkas POS.']
          ] }
      ]
    },

    {
      id: 'tiga-angka', judul: 'Kenapa Angka Omset Berbeda di Tiga Layar',
      isi: [
        { t:'teks', isi:'Ini pertanyaan yang paling sering datang, dan jawabannya: ketiganya '
              + 'memang berbeda, dan ketiganya benar. Yang berbeda konvensinya.' },
        { t:'tabel',
          kepala:['Sebutan','Rumusnya','Dipajang di'],
          baris:[
            ['net','food + bev + lainnya − discount','Dashboard Omset'],
            ['tagihan','net + service + pajak','Rekap Penjualan, kartu Realisasi'],
            ['netSales','tagihan − compliment','Laporan CFO dan halaman investor']
          ] },
        { t:'catatan', nada:'info', judul:'Kartu Jembatan di halaman Ringkasan menjabarkannya',
          isi:'Ia tabel rekonsiliasi baris demi baris. Bacalah itu sebelum menyimpulkan ada uang '
            + 'yang hilang — dari sekian banyak baris di sana, hanya SATU yang benar-benar '
            + 'selisih: POS dibanding ketikan harian. Sisanya beda konvensi.' },
        { t:'catatan', nada:'info', judul:'Kalau selisih POS vs Rekap memang ada',
          isi:'Halaman Ringkasan punya tabel *Selisihnya Ada di Hari Mana* yang memecahnya per '
            + 'tanggal, lengkap dengan kolom letak: apakah selisihnya di net, atau di tax & '
            + 'service. Dua sebab itu dicari di tempat yang berbeda.' }
      ]
    },

    {
      id: 'membaca', judul: 'Membaca Angkanya dengan Benar',
      isi: [
        { t:'catatan', nada:'awas', judul:'Kolom TRANSAKSI sering tidak bisa dijumlahkan',
          isi:'Satu bill yang dibayar dua metode dihitung PENUH di tiap metodenya. Kolom omsetnya '
            + 'tetap berjumlah pas ke total sebulan; kolom transaksinya tidak. Selisihnya disebut '
            + 'angkanya di layar — jangan dilaporkan sebagai salah hitung.' },
        { t:'catatan', nada:'awas', judul:'Kolom persen selalu menyebut PENYEBUTNYA',
          isi:'Baca angka kecil di bawah tiap selnya, bukan cuma kepala kolomnya. Beberapa kolom '
            + 'penyebutnya omset sebulan, beberapa omset hari itu, beberapa lagi nilai menu — dan '
            + 'salah baca membuat angka yang benar terlihat aneh.' },
        { t:'catatan', nada:'info', judul:'Rata-rata dan kontribusi menjawab hal yang berbeda',
          isi:'*Rata-rata* menjawab "hari mana yang lebih ramai" dan itu adil. *Kontribusi* '
            + 'menjawab "dari mana omsetnya datang" dan dihitung dari JUMLAH — jadi bulan dengan '
            + 'lima Sabtu akan mengangkat Sabtu. Keduanya dipertahankan karena keduanya perlu.' },
        { t:'catatan', nada:'awas', judul:'Pengaruh Event bukan sebab-akibat',
          isi:'Acara hampir selalu ditaruh di akhir pekan, dan akhir pekan memang lebih ramai '
            + 'tanpa acara apa pun. Itu sebabnya tiap hari berevent dibandingkan dengan rata-rata '
            + '*hari yang SAMA tanpa acara*, dan jumlah hari pembandingnya selalu disebut. '
            + 'Halaman ini hanya menghitung acara berstatus *Event Done*.' },
        { t:'catatan', nada:'info', judul:'Dua daftar bahan baku sengaja TIDAK dijumlahkan',
          isi:'*Bahan Mentah* adalah yang benar-benar dibeli — itu yang dicocokkan dengan stok '
            + 'gudang. *Bahan Prep* adalah base yang harus diproduksi dapur. Menjumlahkannya '
            + 'menghitung barang yang sama dua kali, karena bahan penyusun base sudah ikut terurai '
            + 'di daftar pertama.' }
      ]
    },

    {
      id: 'masalah', judul: 'Masalah Umum',
      isi: [
        { t:'tabel',
          kepala:['Gejala','Kemungkinan sebabnya','Yang perlu dilakukan'],
          baris:[
            ['Halaman Menu kosong padahal berkas sudah diunggah',
             'Yang diunggah Bill Report, yang tidak punya nama menu.',
             'Unggah Detail Report untuk bulan itu.'],
            ['Peringatan "laporan belum memuat kategori menu"',
             'Berkasnya diunggah sebelum kolom itu dibaca.',
             'Unggah ulang berkas bulan itu.'],
            ['Perkiraan bahan baku tidak terhitung',
             'Resep dari modul HPP tidak terbaca.',
             'Pesannya menyebut sebabnya. Biasanya modul HPP sedang tidak bisa dihubungi.'],
            ['Banyak menu berbunyi "belum ada resep"',
             'Menunya memang belum punya resep di HPP.',
             'Daftarnya bisa disalin sebagai teks lalu ditempel ke Excel, untuk dikerjakan di HPP.'],
            ['Peringatan "resep menunjuk dirinya sendiri"',
             'Nama bahan sama persis dengan nama resepnya.',
             'Pitanya menyebut nama resepnya. Betulkan di modul HPP.'],
            ['Performa Talent bilang belum ada data POS',
             'Bulan itu diunggah sebelum data jam per tanggal mulai disimpan.',
             'Unggah ulang berkas bulan itu.'],
            ['Performa Meja: kapasitas kosong semua',
             'Denah dari modul Reservasi tidak termuat.',
             'Omset per meja tetap terbaca. Laporkan kalau menetap.']
          ] }
      ]
    }

  ]
});
