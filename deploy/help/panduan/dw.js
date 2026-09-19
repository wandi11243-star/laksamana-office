/*
  PANDUAN: Roster, Daily Worker
  ---------------------------------------------------------------------------
  Kuncinya 'dw'. Modul ini punya pembagian peran yang tegas dan ditegakkan di
  SERVER — head meminta, HRD memenuhi — jadi tiap langkah di sini menyebut
  siapa yang boleh mengerjakannya. Nama menu disalin dari NAV_DEF di
  deploy/dw/index.html.
*/
LM_HELP_ISI('dw', {
  ringkas: 'Mengatur pekerja harian: head mengajukan kebutuhan divisinya, HRD menyetujui dan '
         + 'menunjuk orangnya, lalu kehadirannya dikonfirmasi di lokasi.',
  untuk: 'head divisi dan HRD',

  bagian: [

    {
      id: 'tentang', judul: 'Tentang Modul Daily Worker',
      isi: [
        { t:'teks', isi:'Daily worker adalah pekerja harian, bukan pegawai tetap. Mereka tidak '
              + 'punya akun Office dan tidak ada di roster modul lain — datanya berdiri sendiri '
              + 'di modul ini, dan mereka dikabari lewat WhatsApp.' },
        { t:'teks', isi:'Alurnya satu arah dan itu yang membuat modul ini bisa dipercaya: '
              + '*head mengajukan kebutuhan divisinya, HRD menyetujui lalu menunjuk siapa yang '
              + 'dipakai.* Head tidak bisa menjadwalkan sendiri, dan itu disengaja.' },
        { t:'tabel',
          kepala:['Menu','Untuk siapa','Isinya'],
          baris:[
            ['Dashboard','head & HRD','DW yang masuk hari ini.'],
            ['Konfirmasi Kehadiran','head & HRD','Siapa yang benar-benar datang. Inilah dasar pembayarannya.'],
            ['Kalender Tamu','head & HRD','Pax dari Marketing, Event, dan Reservasi. Klik harinya untuk mengajukan.'],
            ['Kalender DW','head & HRD','Sebulan penuh per divisi.'],
            ['Permintaan DW','head','Permintaan divisimu sendiri berikut putusannya.'],
            ['Antrean Pengajuan','HRD','Menyetujui atau menolak, lalu menunjuk orangnya.'],
            ['Pembayaran','HRD','Rekap mingguan dan daftar transfer.'],
            ['Database DW','HRD','Talent pool daily worker.'],
            ['Pengaturan','HRD','Tarif, posisi per divisi, jam bawaan, panduan jumlah DW.']
          ] },
        { t:'catatan', nada:'info', judul:'Head tidak melihat angka uang',
          isi:'Estimasi biaya, kolom upah, dan tarif sengaja tidak digambar untuk head divisi — '
            + 'termasuk di baris kaki berkas Excel yang diekspor dari Kalender DW. Itu bukan '
            + 'kerusakan.' }
      ]
    },

    {
      id: 'minta', judul: 'Mengajukan Kebutuhan DW (Head)',
      isi: [
        { t:'langkah', isi:[
          'Buka *Kalender Tamu* untuk melihat perkiraan pax hari itu, atau langsung ke form Minta DW.',
          'Pilih *tanggal*, *divisi*, dan *posisi* yang dibutuhkan.',
          'Isi *jumlah orang* dan *jam*-nya.',
          'Tulis *keterangan*. Ini WAJIB.',
          'Kalau kamu sudah tahu orangnya, centang pilihan itu lalu pilih namanya.',
          'Kirim.'
        ]},
        { t:'catatan', nada:'awas', judul:'Keterangan wajib diisi, dan kirimannya ditahan kalau kosong',
          isi:'Yang ditanyakan di situ *kenapa DW-nya dibutuhkan*, dan itulah yang dibaca HRD '
            + 'sebelum memutuskan. Tanpa keterangan, antreannya jadi daftar angka yang tidak bisa '
            + 'dinilai siapa pun. Kotak yang kosong akan ditandai merah dan kirimannya tidak berangkat.' },
        { t:'catatan', nada:'info', judul:'Mencentang nama bukan berarti menjadwalkan',
          isi:'Nama yang kamu centang tersimpan sebagai *usulan*. HRD yang memutuskan apakah '
            + 'orang itu yang dipakai. Kalau head bisa menjadwalkan sendiri, pembagian '
            + '"head meminta, HRD memenuhi" hilang artinya.' },
        { t:'catatan', nada:'info', judul:'Kandidat yang ditawarkan dijepit ke divisi & posisi',
          isi:'Daftar tidak melebar sendiri kalau tidak ada yang cocok. Kalau daftarnya kosong, '
            + 'keterangannya membedakan dua hal: tidak ada yang berposisi itu, atau divisinya '
            + 'memang belum punya siapa-siapa. Keduanya dibereskan dengan cara yang berbeda.' }
      ]
    },

    {
      id: 'setujui', judul: 'Menyetujui & Menunjuk Orang (HRD)',
      isi: [
        { t:'langkah', isi:[
          'Buka *Antrean Pengajuan*. Isinya permintaan head DAN pengajuan langsung, dibedakan kolom Jenis.',
          'Baca keterangannya, lalu putuskan.',
          'Untuk permintaan, tekan *Pilih DW* dan tunjuk orangnya sebanyak yang diminta.',
          'Kirim putusannya.'
        ]},
        { t:'catatan', nada:'info', judul:'Antrian vs Riwayat dipisah menurut ADA-TIDAKNYA pekerjaan',
          isi:'Bukan menurut status. Permintaan yang sudah disetujui tapi orangnya belum lengkap '
            + 'tetap ada di *Antrian* — kalau ia pindah ke Riwayat, shift yang malam itu kurang '
            + 'orang akan tersembunyi di balik tab yang namanya mengatakan sudah selesai.' },
        { t:'catatan', nada:'info', judul:'Putusan bisa ditarik',
          isi:'Kalau salah tekan, kembalikan statusnya ke menunggu. Permintaan yang sudah punya '
            + 'penugasan hidup ditahan dulu — tarik dulu penugasannya, baru permintaannya.' },
        { t:'catatan', nada:'info', judul:'Yang tanggalnya lewat ditutup sendiri',
          isi:'Permintaan dan pengajuan yang masih menunggu sementara tanggalnya sudah berlalu '
            + 'ditandai kedaluwarsa oleh sistem, bukan ditolak oleh orang. Itu sebabnya '
            + 'penutupnya tertulis "(sistem)".' }
      ]
    },

    {
      id: 'hadir', judul: 'Konfirmasi Kehadiran — ini yang menentukan upahnya',
      isi: [
        { t:'teks', isi:'Halaman ini yang dipakai malam itu juga, oleh head yang ada di lokasi. '
              + 'HRD juga bisa, tapi menunggu HRD berarti konfirmasinya baru masuk keesokan '
              + 'harinya — dan yang terlambat dikonfirmasi biasanya tidak pernah dikonfirmasi.' },
        { t:'tabel',
          kepala:['Penandanya','Dibayar?','Kapan dipakai'],
          baris:[
            ['Hadir','Ya, penuh','Datang seperti dijadwalkan.'],
            ['Telat','Ya, penuh','Datang terlambat. Potongan keterlambatan belum pernah diputuskan.'],
            ['Tidak hadir (Alfa)','TIDAK','Tidak datang sama sekali.'],
            ['(belum ditandai)','Ya, penuh','Belum sempat dikonfirmasi. Dihitung terpisah dan disebut angkanya.']
          ] },
        { t:'catatan', nada:'awas', judul:'Yang belum ditandai TETAP dibayar',
          isi:'Itu disengaja, dan bukan celah. Seluruh baris yang lahir sebelum fitur ini ada '
            + 'kolomnya memang kosong — kalau kekosongan diperlakukan sebagai tidak hadir, '
            + 'seluruh riwayat pembayaran DW berbulan-bulan jatuh ke nol sekaligus tanpa satu pun '
            + 'galat. Yang belum dikonfirmasi dihitung terpisah dan disebut jumlahnya di halaman '
            + 'Pembayaran.' },
        { t:'langkah', judul:'Menandai dari Dashboard', isi:[
          'Buka *Dashboard*, cari barisnya.',
          'Di kolom paling kanan ada tombol *Chat* dan tombol kehadiran.',
          'Tekan *Tidak hadir* kalau memang tidak datang. Bisa dibatalkan satu klik — tombolnya berubah jadi Batal.'
        ]},
        { t:'catatan', nada:'info', judul:'Tombol kehadiran baru muncul untuk tanggal yang sudah lewat',
          isi:'Shift nanti malam memang belum bisa dikonfirmasi. Tombol *Chat* tidak dibatasi — '
            + 'justru sebelum harinya ia berguna untuk memastikan orangnya jadi datang.' },
        { t:'langkah', judul:'Kalau ada yang berhalangan dan diganti orang lain', isi:[
          'Buka *Konfirmasi Kehadiran* pada tanggalnya.',
          'Pada baris orang yang berhalangan, pilih ganti orang.',
          'Pilih penggantinya.',
          'Simpan.'
        ]},
        { t:'catatan', nada:'info', judul:'Baris yang lama tidak dihapus',
          isi:'Ia ditandai tidak hadir berikut sebabnya ("Digantikan <nama>"), lalu baris '
            + 'penggantinya lahir sendiri. Jejak bahwa orang pertama pernah disetujui lalu '
            + 'berhalangan tetap ada — dan riwayat itulah yang dicari HR sebelum memanggil orang '
            + 'yang sama lagi.' },
        { t:'catatan', nada:'awas', judul:'Estimasi biaya mengikuti kehadiran',
          isi:'Begitu seseorang ditandai tidak hadir, Est. Biaya dan Total Jam di Dashboard, '
            + 'Kalender DW, dan berkas Excel-nya ikut menyusut. Angka yang turun itu benar — '
            + 'kartunya menyebutkan berapa orang yang tidak dihitung.' }
      ]
    },

    {
      id: 'masalah', judul: 'Masalah Umum',
      isi: [
        { t:'tabel',
          kepala:['Gejala','Kemungkinan sebabnya','Yang perlu dilakukan'],
          baris:[
            ['Dashboard cuma menampilkan satu divisi',
             'Kamu head, dan halaman ini memang disaring ke divisimu.',
             'Itu tertulis di pitanya. HRD melihat semuanya.'],
            ['Saya head tapi tidak punya divisi apa pun',
             'Penempatan head belum diisi.',
             'Minta HRD mengisinya di modul Jadwal Shift → Pengaturan → Head Divisi.'],
            ['Tombol setujui tidak muncul',
             'Hanya HRD yang boleh memutuskan.',
             'Head melihat daftarnya tanpa tombol putusan. Itu memang aturannya.'],
            ['Satu orang tidak bisa dijadwalkan dua shift sehari',
             'Bisa, asal jamnya tidak bertindih.',
             'Periksa jamnya. Yang ditolak cuma yang beririsan, termasuk shift lewat tengah malam.'],
            ['Upah seseorang terlihat nol',
             'Ia ditandai tidak hadir.',
             'Buka Konfirmasi Kehadiran pada tanggal itu dan periksa penandanya.'],
            ['Tombol chat tidak bisa ditekan',
             'Nomor WhatsApp-nya belum diisi.',
             'Lengkapi di Database DW.']
          ] }
      ]
    }

  ]
});
