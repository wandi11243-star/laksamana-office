/*
  PANDUAN: Absensi
  ---------------------------------------------------------------------------
  Kuncinya 'absensi'. SATU-SATUNYA modul yang tidak tinggal di situs Office —
  ia berdiri di subdomainnya sendiri karena dipasang di layar depan HP kru dan
  tidak boleh menuntut orang membuka portal dulu tiap pagi. Nama halamannya
  disalin dari HALAMAN di absensi/index.html.
*/
LM_HELP_ISI('absensi', {
  ringkas: 'Absen masuk dan pulang lewat HP, dengan verifikasi lokasi dan wajah. Telat dan '
         + 'lembur dihitung sendiri dari jam shift.',
  untuk: 'semua kru',

  bagian: [

    {
      id: 'tentang', judul: 'Tentang Aplikasi Absensi',
      isi: [
        { t:'teks', isi:'Absensi punya alamatnya sendiri, terpisah dari Office. Kartunya di '
              + 'Office ada supaya kamu bisa menemukan alamatnya, tapi begitu terbuka ia berdiri '
              + 'sendiri — bisa disimpan di layar depan HP dan dibuka langsung tiap pagi.' },
        { t:'catatan', nada:'info', judul:'Loginnya terpisah, tapi akunnya sama',
          isi:'Kamu akan diminta masuk sekali lagi di sana walaupun sudah masuk di Office. Nama '
            + 'dan PIN-nya sama; yang berbeda cuma tempat sesinya disimpan. Sesi absensi bertahan '
            + '*30 hari*, jadi sesudah sekali masuk kamu tidak perlu mengetik PIN tiap pagi.' },
        { t:'tabel',
          kepala:['Tab','Isinya'],
          baris:[
            ['Absen','Tombol absen masuk dan pulang.'],
            ['Riwayat','Catatan absenmu sendiri.'],
            ['Wajah','Mendaftarkan atau memperbarui data wajahmu.'],
            ['Antrean','Absen yang perlu disetujui HR. Hanya HR.'],
            ['Atur','Pengaturan area dan aturan. Hanya HR.']
          ] }
      ]
    },

    {
      id: 'absen', judul: 'Cara Absen',
      isi: [
        { t:'langkah', isi:[
          'Buka aplikasinya, pastikan kamu ada di tab *Absen*.',
          'Izinkan akses *lokasi* dan *kamera* kalau diminta peramban.',
          'Arahkan kamera ke wajahmu sampai terbaca.',
          'Tekan tombol absen masuk, atau absen pulang.',
          'Tunggu sampai muncul tanda berhasil.'
        ]},
        { t:'catatan', nada:'awas', judul:'Absen di luar area atau di luar jam TETAP tercatat',
          isi:'Ia tidak ditolak — ia dicatat lalu masuk *antrean persetujuan HR*. Jadi kalau kamu '
            + 'sedang dinas di luar atau shift-mu mendadak berubah, tetap absen seperti biasa dan '
            + 'beritahu HR alasannya. Yang tidak absen sama sekali jauh lebih sulit dibereskan '
            + 'daripada yang absen lalu perlu disetujui.' },
        { t:'catatan', nada:'info', judul:'Wajah perlu didaftarkan sekali',
          isi:'Buka tab *Wajah* dan ikuti langkahnya. Kalau penampilanmu berubah banyak '
            + '(berkacamata baru, potongan rambut), daftarkan ulang — pemindaian yang sering gagal '
            + 'membuat orang berhenti mencoba dan akhirnya tidak absen.' }
      ]
    },

    {
      id: 'hitungan', judul: 'Telat & Lembur Dihitung dari Mana',
      isi: [
        { t:'teks', isi:'Keduanya dihitung dari *jam shift-mu di modul Jadwal Shift*, bukan dari '
              + 'angka yang disimpan di sini. Itu sebabnya shift yang salah di Jadwal akan muncul '
              + 'sebagai keterlambatan yang salah di sini.' },
        { t:'daftar', isi:[
          'Telat, lembur, dan lama kerja TIDAK disimpan — ketiganya dihitung ulang tiap kali dibaca.',
          'Jadi kalau shift-mu dibetulkan head besok, angka telatmu ikut betul sendiri.',
          'Begitu juga kalau pengajuan off-mu baru disetujui beberapa hari kemudian.'
        ]},
        { t:'catatan', nada:'info', judul:'Lembur dihitung dari lama kerja sungguhan',
          isi:'Dari selisih dua ketukan absenmu, bukan dari menebak tanggal jam pulang. Itu yang '
            + 'membuat shift pagi yang pulang lewat tengah malam tidak lagi tercatat sebagai '
            + '"pulang cepat 16 jam" seperti dulu.' },
        { t:'catatan', nada:'awas', judul:'Kalau modul Jadwal sedang tidak bisa dihubungi',
          isi:'Absenmu tetap tercatat, tapi sistem tidak tahu shift-mu apa — jadi ia TIDAK '
            + 'mengantrekannya ke HR dan tidak menghitung telat. Itu disengaja: satu gangguan di '
            + 'modul Jadwal tidak boleh mengirim setiap ketukan hari itu ke antrean persetujuan.' }
      ]
    },

    {
      id: 'masalah', judul: 'Masalah Umum',
      isi: [
        { t:'tabel',
          kepala:['Gejala','Kemungkinan sebabnya','Yang perlu dilakukan'],
          baris:[
            ['Kamera tidak mau menyala',
             'Izin kamera ditolak, atau dipakai aplikasi lain.',
             'Buka pengaturan situs di peramban, izinkan kamera. Tutup aplikasi kamera lain.'],
            ['Wajah tidak terbaca-baca',
             'Cahaya kurang, atau data wajahmu sudah lama.',
             'Cari tempat yang lebih terang. Kalau tetap, daftarkan ulang di tab Wajah.'],
            ['"Di luar area" padahal saya di tempat',
             'GPS HP meleset, biasa di dalam bangunan.',
             'Tetap absen. Ia masuk antrean HR dan bisa disetujui.'],
            ['Absen saya tidak muncul di riwayat',
             'Prosesnya mungkin belum selesai saat aplikasinya ditutup.',
             'Buka lagi tab Riwayat. Kalau tetap tidak ada, laporkan ke HR hari itu juga.'],
            ['Diminta login lagi padahal baru kemarin',
             'Sesi 30 hari habis, atau kamu membukanya dari peramban lain.',
             'Masuk sekali lagi dengan nama dan PIN yang sama.'],
            ['Telat saya terlihat salah',
             'Shift di modul Jadwal yang belum betul.',
             'Periksa Jadwal Saya. Kalau shift-nya salah, minta head membetulkannya — angkanya ikut betul sendiri.']
          ] },
        { t:'catatan', nada:'info', judul:'Absensi tidak menyimpan hitungan, jadi koreksi selalu berlaku surut',
          isi:'Kamu tidak perlu minta absenmu "dihitung ulang" — ia memang selalu dihitung ulang. '
            + 'Yang perlu dibetulkan cuma sumbernya: shift-nya, atau status pengajuanmu.' }
      ]
    }

  ]
});
