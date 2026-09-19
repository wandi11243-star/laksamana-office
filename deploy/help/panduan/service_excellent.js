/*
  PANDUAN: Service Excellent
  ---------------------------------------------------------------------------
  Kuncinya 'service_excellent'. Nama menu disalin dari NAV_SECTIONS di
  deploy/service_excellent/index.html.
*/
LM_HELP_ISI('service_excellent', {
  ringkas: 'Mengajak tamu menulis Google Review, memverifikasi buktinya, dan mencatat pujian '
         + 'serta keluhan per divisi.',
  untuk: 'host, floor, dan manajemen',

  bagian: [

    {
      id: 'tentang', judul: 'Tentang Modul Service Excellent',
      isi: [
        { t:'tabel',
          kepala:['Menu','Isinya'],
          baris:[
            ['Dashboard','Capaian review dan posisi tiap kru terhadap tangga rewardnya.'],
            ['Google Review','Ajakan review, bukti yang masuk, dan verifikasinya.'],
            ['Catat Feedback','Pujian dan keluhan tamu, per divisi.'],
            ['Kelola Role','Siapa boleh melihat dan mengubah halaman mana.'],
            ['Setelan','Tautan review, saklar WhatsApp, dan nominal reward.']
          ] },
        { t:'catatan', nada:'info', judul:'Setelan berdiri sendiri, bukan di dalam Google Review',
          isi:'Isinya keputusan yang diambil sekali — tautan, saklar, dan nominal — jadi ia tidak '
            + 'perlu digulir melewati daftar review tiap kali.' }
      ]
    },

    {
      id: 'review', judul: 'Google Review',
      isi: [
        { t:'langkah', isi:[
          'Buka *Google Review*.',
          'Ajak tamunya menulis review lewat tautan yang tersedia.',
          'Begitu tamu mengirim buktinya, barisnya muncul di daftar.',
          'Periksa buktinya: apakah review-nya memang ada dan sesuai.',
          'Verifikasi, atau tolak berikut alasannya.'
        ]},
        { t:'catatan', nada:'awas', judul:'Verifikasi bukan formalitas',
          isi:'Angka yang lolos verifikasi langsung menentukan reward kru. Bukti yang diterima '
            + 'tanpa diperiksa membuat tangga rewardnya berhenti berarti bagi yang benar-benar '
            + 'mengerjakannya.' },
        { t:'catatan', nada:'info', judul:'Tolak selalu disertai alasan',
          isi:'Kru yang ditolak tanpa keterangan akan mengirim bukti yang sama lagi. Tulis apa '
            + 'yang kurang.' }
      ]
    },

    {
      id: 'reward', judul: 'Papan Reward',
      isi: [
        { t:'teks', isi:'Di *Dashboard* ada papan yang menjelaskan aturan rewardnya: empat kartu '
              + 'ringkas, satu tabel tangga, dan keterangannya.' },
        { t:'catatan', nada:'awas', judul:'Tiap kru dihitung di SATU tangga saja',
          isi:'Yaitu tangga yang dibayarkan. Kru dengan 120 review ada di tangga 100 — ia tidak '
            + 'ikut dihitung lagi di tangga 40 dan 70. Kalau ikut, jumlah ketiga tangga akan lebih '
            + 'besar daripada jumlah kru yang dapat, dan angka yang tidak bisa dijumlahkan adalah '
            + 'angka yang berhenti dipercaya.' },
        { t:'catatan', nada:'info', judul:'Yang belum lolos syarat minimum diukur ke SYARAT, bukan ke tangga',
          isi:'Syarat minimum menang atas tangga. Menulis "kurang 2 lagi ke tangga 40" untuk orang '
            + 'yang belum lolos minimum adalah janji yang tidak akan ditepati.' },
        { t:'catatan', nada:'info', judul:'Siapa dapat berapa ada di tabel Perolehan per Kru',
          isi:'Papan reward menjelaskan ATURANNYA; tabel di bawahnya menyebut angkanya per orang, '
            + 'berikut kurang berapa lagi. Keduanya dihitung dari daftar yang sama, jadi mereka '
            + 'tidak mungkin berselisih.' }
      ]
    },

    {
      id: 'feedback', judul: 'Catat Feedback',
      isi: [
        { t:'langkah', isi:[
          'Buka *Catat Feedback*.',
          'Pilih apakah ia pujian atau keluhan.',
          'Pilih *divisi* yang dimaksud.',
          'Tulis isinya apa adanya, termasuk kalau tidak enak dibaca.',
          'Simpan.'
        ]},
        { t:'catatan', nada:'awas', judul:'Keluhan yang dihaluskan berhenti berguna',
          isi:'Catatan ini dibaca untuk memperbaiki sesuatu. Keluhan yang ditulis ulang supaya '
            + 'terdengar netral menghilangkan justru bagian yang membuatnya perlu ditindak.' },
        { t:'catatan', nada:'info', judul:'Pujian juga dicatat, bukan cuma keluhan',
          isi:'Papan yang isinya keluhan saja membuat divisi yang dipuji tidak pernah terlihat '
            + 'dipuji — dan itu membuat orang berhenti melaporkan apa pun.' }
      ]
    },

    {
      id: 'masalah', judul: 'Masalah Umum',
      isi: [
        { t:'tabel',
          kepala:['Gejala','Kemungkinan sebabnya','Yang perlu dilakukan'],
          baris:[
            ['Tautan review tidak berfungsi',
             'Tautannya belum diisi di Setelan.',
             'Isi di menu Setelan.'],
            ['Angka review saya tidak bertambah',
             'Buktinya belum diverifikasi.',
             'Hanya yang terverifikasi yang dihitung. Tanyakan ke yang memverifikasi.'],
            ['Saya tidak bisa membuka Setelan atau Kelola Role',
             'Keduanya hanya untuk manajemen.',
             'Minta admin modul ini kalau memang perlu.'],
            ['Reward saya tidak sesuai tangga',
             'Mungkin syarat minimumnya belum terpenuhi.',
             'Papan reward menyebut kurang berapa lagi, dan ke arah mana.']
          ] }
      ]
    }

  ]
});
