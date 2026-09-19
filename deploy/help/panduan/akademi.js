/*
  PANDUAN: Akademi
  ---------------------------------------------------------------------------
  Kuncinya 'akademi'. Nama menu disalin dari daftar halaman di
  deploy/akademi/index.html.
*/
LM_HELP_ISI('akademi', {
  ringkas: 'Materi training kru, program bulanan, dan catatan siapa sudah lulus apa.',
  untuk: 'semua kru, head divisi, dan HRD',

  bagian: [

    {
      id: 'tentang', judul: 'Tentang Modul Akademi',
      isi: [
        { t:'tabel',
          kepala:['Menu','Untuk siapa','Isinya'],
          baris:[
            ['Beranda','semua','Ringkasan: apa yang perlu kamu kerjakan.'],
            ['Materi Saya','semua','Materi yang ditugaskan kepadamu.'],
            ['Program Bulanan','semua','Program training bulan berjalan.'],
            ['Perpustakaan','semua','Seluruh materi yang tersedia.'],
            ['Struktur Organisasi','semua','Siapa di mana.'],
            ['Progress & Sertifikat','semua','Capaianmu sendiri.'],
            ['Progress Tim','head & HRD','Capaian seluruh anggota tim.'],
            ['Anjungan','HRD','Papan pengelola.'],
            ['Log Aktivitas','HRD','Riwayat.'],
            ['Sinkronisasi & Backup','HRD','Perawatan data.']
          ] }
      ]
    },

    {
      id: 'belajar', judul: 'Mengerjakan Materi',
      isi: [
        { t:'langkah', isi:[
          'Buka *Materi Saya*. Yang ditugaskan kepadamu ada di situ.',
          'Buka materinya, baca atau tonton sampai selesai.',
          'Kerjakan penilaiannya kalau ada.',
          'Progressmu tercatat sendiri di *Progress & Sertifikat*.'
        ]},
        { t:'catatan', nada:'info', judul:'Perpustakaan berisi lebih banyak daripada Materi Saya',
          isi:'Yang ditugaskan kepadamu ada di *Materi Saya*; seluruh materi yang boleh kamu buka '
            + 'ada di *Perpustakaan*. Kalau kamu ingin belajar sesuatu yang belum ditugaskan, '
            + 'carilah di sana.' },
        { t:'catatan', nada:'info', judul:'Sertifikat lahir dari materi yang selesai',
          isi:'Ia tidak diterbitkan manual. Kalau sertifikat yang kamu harapkan belum muncul, '
            + 'periksa apakah seluruh bagian materinya sudah ditandai selesai.' }
      ]
    },

    {
      id: 'tim', judul: 'Memantau Tim (Head & HRD)',
      isi: [
        { t:'langkah', isi:[
          'Buka *Progress Tim*.',
          'Lihat siapa yang sudah menyelesaikan apa.',
          'Yang tertinggal terlihat dari barisnya sendiri.'
        ]},
        { t:'catatan', nada:'info', judul:'Program Bulanan yang menentukan apa yang wajib',
          isi:'Materi di Perpustakaan boleh dibuka siapa saja; yang MENUNTUT dikerjakan adalah '
            + 'yang masuk program bulan itu. Kalau seluruh tim terlihat tertinggal, periksa dulu '
            + 'apakah programnya memang sudah disusun untuk bulan itu.' }
      ]
    },

    {
      id: 'masalah', judul: 'Masalah Umum',
      isi: [
        { t:'tabel',
          kepala:['Gejala','Kemungkinan sebabnya','Yang perlu dilakukan'],
          baris:[
            ['Materi Saya kosong',
             'Belum ada yang ditugaskan kepadamu bulan ini.',
             'Buka Perpustakaan kalau ingin belajar sendiri.'],
            ['Nama saya tidak ada di Progress Tim',
             'Penempatan divisimu di Office belum diisi.',
             'Minta HRD mengisi kolom Tim akunmu.'],
            ['Materi sudah saya baca tapi progressnya tidak naik',
             'Ada bagian yang belum ditandai selesai.',
             'Buka materinya lagi dan periksa bagian mana yang belum.'],
            ['Saya tidak bisa membuka Anjungan',
             'Halaman itu untuk HRD.',
             'Bukan kerusakan.']
          ] }
      ]
    }

  ]
});
