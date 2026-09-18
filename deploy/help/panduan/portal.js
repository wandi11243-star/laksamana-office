/*
  PANDUAN: Office & Cara Masuk
  ---------------------------------------------------------------------------
  Satu-satunya bab yang TIDAK dijaga kunci izin (lihat `izin:null` di
  daftar.js), karena isinya tentang portalnya sendiri, dan setiap orang yang
  bisa membuka Help memang perlu membacanya.

  Kunci yang didaftarkan di bawah HARUS sama dengan nama berkas ini ('portal').
  Kalau berbeda, mesinnya memuat berkas ini dengan selamat lalu mendapati tidak
  ada yang terdaftar, dan babnya berbunyi "Panduan gagal dimuat".
*/
LM_HELP_ISI('portal', {
  ringkas: 'Office adalah pintu masuk ke semua modul Laksamana Muda. Satu akun, satu PIN, '
         + 'lalu pilih modul yang mau dibuka.',
  untuk: 'semua kru',

  bagian: [

    {
      id: 'tentang', judul: 'Tentang Office',
      isi: [
        { t:'teks', isi:'Office bukan aplikasi yang berisi data. Ia halaman pemilih: tempat kamu '
              + 'masuk sekali, lalu membuka modul yang kamu perlukan tanpa login lagi di tiap modul.' },
        { t:'teks', isi:'Kartu yang muncul di Office adalah modul yang boleh kamu buka. Kru lain '
              + 'yang membuka Office dengan akunnya sendiri bisa melihat kartu yang berbeda, dan itu '
              + 'memang seharusnya begitu.' },
        { t:'gambar', berkas:'portal/beranda.png',
          teks:'Halaman Office sesudah berhasil masuk, dengan kartu modul dikelompokkan per bidang.',
          tandai:[
            'Nama kamu dan tombol keluar, di bagian atas.',
            'Kelompok kartu: Operasional, Tim & Kru, Marketing & Event, Bisnis & Target.',
            'Satu kartu sama dengan satu modul. Menekannya membuka modul itu.'
          ] }
      ]
    },

    {
      id: 'masuk', judul: 'Cara Masuk',
      isi: [
        { t:'langkah', isi:[
          'Buka alamat Office di peramban (Chrome atau Safari di HP juga bisa).',
          'Isi kotak pertama dengan *nama panggilan* atau *nama lengkap* kamu, sesuai yang terdaftar di Office.',
          'Isi *PIN* kamu. PIN adalah angka, bukan kata sandi berhuruf.',
          'Tekan *Masuk*. Kalau berhasil, kartu modul langsung muncul.'
        ]},
        { t:'catatan', nada:'info', judul:'PIN awal',
          isi:'Akun yang baru dibuat biasanya berisi PIN bawaan dari admin. Gantilah lewat menu '
            + 'profil di Office begitu kamu berhasil masuk pertama kali.' },
        { t:'catatan', nada:'info', judul:'Berapa lama tidak perlu login lagi',
          isi:'Sesi bertahan *24 jam* di peramban yang sama. Sesudah itu Office akan meminta nama '
            + 'dan PIN sekali lagi. Menutup tab tidak membuat kamu keluar.' }
      ]
    },

    {
      id: 'buka-modul', judul: 'Membuka Modul',
      isi: [
        { t:'langkah', isi:[
          'Cari kartu modul yang kamu perlukan. Kartunya dikelompokkan per bidang kerja.',
          'Tekan kartunya. Modul terbuka di halaman yang sama.',
          'Untuk kembali, pakai tombol *Keluar* atau *Kembali ke Office* di dalam modul itu.'
        ]},
        { t:'catatan', nada:'info', judul:'"Keluar" di dalam modul bukan logout',
          isi:'Di kebanyakan modul, tombol keluar berarti *kembali ke Office*, bukan mengakhiri '
            + 'sesimu. Untuk benar-benar keluar, pakai tombol keluar yang ada di halaman Office.' },
        { t:'teks', isi:'Beberapa modul berisi lebih dari satu panel, misalnya Stock dan Finance. '
              + 'Kartunya membuka halaman pemilih panel dulu, baru panelnya. Panel yang tidak boleh '
              + 'kamu buka tidak ditampilkan di pemilih itu.' }
      ]
    },

    {
      id: 'akses', judul: 'Kalau Sebuah Modul Tidak Muncul',
      isi: [
        { t:'teks', isi:'Kartu modul yang tidak muncul hampir selalu berarti satu hal: akun kamu '
              + 'belum diberi akses ke modul itu. Ini bukan kerusakan, dan memuat ulang halaman '
              + 'tidak akan memunculkannya.' },
        { t:'tabel',
          kepala:['Yang kamu lihat','Artinya','Yang perlu dilakukan'],
          baris:[
            ['Kartunya tidak ada sama sekali',
             'Akun kamu belum dicentang untuk modul itu.',
             'Minta admin Office mencentangkannya di *Kelola Akses*.'],
            ['Kartunya ada, tapi begitu ditekan kembali lagi ke Office',
             'Kamu punya kartu modulnya, tapi tidak punya kunci panel di dalamnya.',
             'Sebutkan panel mana yang kamu perlukan saat meminta akses.'],
            ['Diminta login lagi padahal tadi sudah masuk',
             'Sesi 24 jam kamu sudah habis, atau kamu membukanya dari peramban lain.',
             'Masuk sekali lagi dengan nama dan PIN yang sama.'],
            ['"Nama pengguna atau PIN salah" padahal yakin benar',
             'Bisa berarti nama yang diketik bukan nama yang terdaftar.',
             'Coba nama lengkap, lalu nama panggilan. Kalau tetap, hubungi admin.']
          ] },
        { t:'catatan', nada:'awas', judul:'Akses di Office dan akses di dalam modul itu dua hal',
          isi:'Akses Office menentukan modul mana yang bisa kamu buka. Di dalam modulnya sendiri '
            + 'masih ada pengaturan siapa boleh melihat dan siapa boleh mengubah halaman tertentu. '
            + 'Jadi bisa saja kamu bisa membuka sebuah modul tapi tombol simpannya tidak muncul. '
            + 'Itu diatur admin modul yang bersangkutan, bukan admin Office.' }
      ]
    },

    {
      id: 'help', judul: 'Tentang Help Center Ini',
      isi: [
        { t:'teks', isi:'Halaman yang sedang kamu baca hanya berisi panduan. Ia tidak menyimpan '
              + 'dan tidak mengubah apa pun: gambar di dalamnya adalah tangkapan layar, bukan '
              + 'tombol. Semua pekerjaan tetap dilakukan di modul aslinya.' },
        { t:'daftar', isi:[
          'Daftar panduan di kiri mengikuti hak akses kamu, sama persis dengan kartu di Office.',
          'Kotak *Cari panduan* menyisir seluruh panduan yang boleh kamu baca, termasuk isi tiap bagiannya.',
          'Bab bertanda *Segera* berarti modulnya sudah jalan, panduannya yang belum ditulis.'
        ]},
        { t:'tanya', isi:[
          { t:'Kenapa daftar panduan saya lebih pendek daripada punya rekan kerja?',
            j:'Karena Help hanya menampilkan modul yang boleh kamu buka. Daftar yang lebih panjang '
             + 'berarti orang itu memegang kunci modul yang lebih banyak, bukan berarti Help kamu rusak.' },
          { t:'Saya menemukan langkah di panduan yang tidak cocok dengan layar saya.',
            j:'Modulnya mungkin sudah berubah sesudah panduannya ditulis. Laporkan ke admin Office '
             + 'supaya panduannya diperbarui, dan sementara itu ikuti layar yang sebenarnya, bukan panduannya.' },
          { t:'Bisakah saya membuka modul lewat gambar di panduan?',
            j:'Tidak. Gambar di sini sengaja hanya gambar. Bukalah modulnya lewat kartu di Office.' }
        ]}
      ]
    }

  ]
});
