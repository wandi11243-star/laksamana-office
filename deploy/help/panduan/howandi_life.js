/*
  PANDUAN: Howandi Life OS
  ---------------------------------------------------------------------------
  Kuncinya 'howandi_life'. Modul pribadi Nahkoda, dan gerbangnya GRANT modul
  biasa — bukan status superadmin — supaya superadmin pun bisa dikecualikan.
  Nama menu disalin dari data-view di deploy/howandi_life/index.html.

  Panduan ini sengaja PENDEK. Isinya milik satu orang yang menyusunnya sendiri;
  yang perlu ditulis cuma peta menunya dan hal-hal yang menyentuh modul lain.
*/
LM_HELP_ISI('howandi_life', {
  ringkas: 'Pusat kendali pribadi: agenda, task, project, konten, goal, keuangan pribadi, dan '
         + 'portofolio usaha.',
  untuk: 'Nahkoda',

  bagian: [

    {
      id: 'tentang', judul: 'Peta Menu',
      isi: [
        { t:'tabel',
          kepala:['Kelompok','Menu'],
          baris:[
            ['Cockpit','Command Center, Calendar'],
            ['Execution','Tasks, Projects, Content'],
            ['Growth','Goals, Roadmap, Learning, Evaluasi Diri'],
            ['Portfolio','Finance, Businesses'],
            ['Sistem','Life OS (pengaturan)']
          ] },
        { t:'catatan', nada:'info', judul:'Modul ini berdiri sendiri',
          isi:'Ia tidak membaca dan tidak menulis ke modul Office mana pun. Angka di sini — net '
            + 'worth, aset, goal — diketik sendiri, bukan ditarik dari Finance perusahaan.' }
      ]
    },

    {
      id: 'akses', judul: 'Siapa yang Bisa Membukanya',
      isi: [
        { t:'catatan', nada:'awas', judul:'Gerbangnya kunci modul, BUKAN status superadmin',
          isi:'Itu disengaja: superadmin mengelola seluruh modul Office, tapi tidak dengan '
            + 'sendirinya berhak membuka isi modul ini. Mencabutnya cukup dengan mencabut '
            + 'centangnya di Kelola Akses — tanpa mengubah status siapa pun.' },
        { t:'catatan', nada:'info', judul:'Kartunya berdiri terpisah di portal',
          isi:'Bukan di antara kartu modul kerja, melainkan di bagian modul khusus dengan '
            + 'penandanya sendiri.' }
      ]
    },

    {
      id: 'masalah', judul: 'Masalah Umum',
      isi: [
        { t:'tabel',
          kepala:['Gejala','Kemungkinan sebabnya','Yang perlu dilakukan'],
          baris:[
            ['Kartunya tidak muncul di Office',
             'Akunmu belum dicentang untuk modul ini.',
             'Centangkan di Kelola Akses.'],
            ['Angka keuangan tidak cocok dengan modul Finance',
             'Keduanya memang tidak terhubung.',
             'Modul ini diisi manual; Finance perusahaan berdiri sendiri.'],
            ['Kalender kosong',
             'Belum ada agenda yang diisi.',
             'Agenda di sini tidak ditarik dari Radar maupun modul lain.']
          ] }
      ]
    }

  ]
});
