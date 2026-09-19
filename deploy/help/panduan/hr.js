/*
  PANDUAN: Staff Performance
  ---------------------------------------------------------------------------
  Kuncinya 'hr'. Nama menu disalin dari PAGES di deploy/hr/index.html.
  BEDA dari modul Roster: yang ini menilai KINERJA, yang itu mengurus JADWAL
  dan DATA DIRI. Pemisahan itu ditegaskan di bagian pertama karena keduanya
  sama-sama sering disebut "modul HR".
*/
LM_HELP_ISI('hr', {
  ringkas: 'Menilai kinerja kru: KPI divisi, OKR, performance review, coaching, dan '
         + 'pengembangan kariernya.',
  untuk: 'HRD, head divisi, dan manajemen',

  bagian: [

    {
      id: 'tentang', judul: 'Tentang Modul Staff Performance',
      isi: [
        { t:'catatan', nada:'awas', judul:'Ini BUKAN modul yang mengatur jadwal atau data pegawai',
          isi:'Jadwal shift, pengajuan cuti, dan data diri kru ada di modul *Roster → Jadwal '
            + 'Shift*. Modul ini menilai KINERJA. Keduanya sering sama-sama disebut "HR", dan '
            + 'yang salah masuk akan mencari menu yang memang tidak ada di sini.' },
        { t:'tabel',
          kepala:['Kelompok','Menu'],
          baris:[
            ['Utama','Anjungan, People Score'],
            ['Kinerja','Kehadiran, KPI Divisi, OKR & Target, Performance Review'],
            ['Pengembangan','Training Center, Competency Matrix, Coaching Log, Career & Succession'],
            ['Budaya','Reward & Recognition, Disiplin, Engagement'],
            ['Data','Kru, Kalender HR, Pengaturan, Audit Log']
          ] }
      ]
    },

    {
      id: 'nilai', judul: 'Menilai Kinerja',
      isi: [
        { t:'teks', isi:'Empat halaman di kelompok Kinerja menjawab pertanyaan yang berbeda, dan '
              + 'sebaiknya diisi dengan urutan ini.' },
        { t:'tabel',
          kepala:['Menu','Menjawab','Periodenya'],
          baris:[
            ['Kehadiran','Seberapa rutin ia datang dan tepat waktu.','Harian, terkumpul per bulan.'],
            ['KPI Divisi','Apakah divisinya mencapai angkanya.','Bulanan.'],
            ['OKR & Target','Apakah sasaran besarnya tercapai.','Kuartalan atau tahunan.'],
            ['Performance Review','Penilaian menyeluruh per orang.','Periodik.']
          ] },
        { t:'catatan', nada:'info', judul:'People Score menggabungkan keempatnya',
          isi:'Jadi angkanya baru berarti sesudah sumbernya terisi. Score yang rendah karena '
            + 'datanya kosong terbaca sama dengan score yang rendah karena kinerjanya — dan itu '
            + 'kesimpulan yang tidak ditanggung datanya.' },
        { t:'catatan', nada:'awas', judul:'Isi Coaching Log SAAT kejadiannya, bukan saat review',
          isi:'Catatan coaching yang baru ditulis menjelang penilaian berisi apa yang masih '
            + 'diingat, bukan apa yang terjadi. Dan yang dinilai berhak tahu masalahnya saat itu '
            + 'juga, bukan tiga bulan kemudian.' }
      ]
    },

    {
      id: 'kembang', judul: 'Pengembangan & Budaya',
      isi: [
        { t:'daftar', isi:[
          '*Competency Matrix* memetakan siapa menguasai apa — dipakai memutuskan siapa yang bisa menggantikan siapa.',
          '*Career & Succession* menyambungnya ke rencana karier dan pengganti.',
          '*Training Center* mencatat training yang diikuti. Materinya sendiri ada di modul Akademi.',
          '*Reward & Recognition* dan *Disiplin* dua sisi dari hal yang sama: konsekuensi.',
          '*Engagement* untuk mengukur suasana kerja.'
        ]},
        { t:'catatan', nada:'info', judul:'Disiplin dicatat berikut kronologinya',
          isi:'Catatan disiplin tanpa kronologi tidak bisa dipertanggungjawabkan saat diperiksa '
            + 'ulang, dan yang dicatat berhak tahu persis apa yang tertulis.' },
        { t:'catatan', nada:'awas', judul:'Papan yang isinya hukuman saja berhenti dibaca',
          isi:'Reward & Recognition bukan pelengkap. Divisi yang tidak pernah terlihat dihargai '
            + 'akan berhenti melaporkan apa pun ke modul ini.' }
      ]
    },

    {
      id: 'masalah', judul: 'Masalah Umum',
      isi: [
        { t:'tabel',
          kepala:['Gejala','Kemungkinan sebabnya','Yang perlu dilakukan'],
          baris:[
            ['Saya mencari jadwal shift, tidak ada menunya',
             'Jadwal ada di modul Roster, bukan di sini.',
             'Buka kartu Roster di Office.'],
            ['Data kehadiran kosong',
             'Belum ditarik untuk periode itu.',
             'Absensi harian ada di modul Absensi; yang di sini rekapnya.'],
            ['People Score semua orang rendah',
             'Sumber penilaiannya belum diisi.',
             'Isi KPI, OKR, dan review-nya lebih dulu.'],
            ['Nama kru tidak muncul',
             'Akunnya nonaktif, atau kolom Tim-nya kosong.',
             'Periksa di modul Roster → Data Pegawai.'],
            ['Saya head tapi hanya melihat sebagian',
             'Sebagian halaman memang hanya untuk HRD.',
             'Itu bukan kerusakan.']
          ] }
      ]
    }

  ]
});
