/*
  PANDUAN: Konten
  ---------------------------------------------------------------------------
  Kuncinya 'konten'. Nama menu disalin dari NAV di deploy/konten/index.html.
  Halaman Workload, Content Bank, dan Reports sudah DICABUT (18 September 2026)
  dan sengaja tidak disebut di sini — panduan yang menyuruh membuka menu yang
  tidak ada membuat orang mencarinya sampai menyerah.
*/
LM_HELP_ISI('konten', {
  ringkas: 'Merencanakan konten, mengerjakan produksinya, menayangkannya, lalu mengukur '
         + 'hasilnya per platform.',
  untuk: 'tim konten dan content director',

  bagian: [

    {
      id: 'tentang', judul: 'Alur Kerja di Modul Ini',
      isi: [
        { t:'tabel',
          kepala:['Kelompok','Menu','Untuk apa'],
          baris:[
            ['Operasi','Dashboard, Content Planning, Pipeline, Calendar','Merencanakan dan melihat apa yang sedang berjalan.'],
            ['Produksi','Shooting Schedule, Design Queue, Editing Queue, Asset Management','Antrian pekerjaan per tahap.'],
            ['Kontrol','Approval, Publishing, Input Performa, Performa Konten, Performa Desain','Menyetujui, menayangkan, lalu mengukur.'],
            ['Promosi','KOL & Medpar, Ads Management, Report Percakapan','Iklan dan kerja sama.'],
            ['Brand','Brand Management','Data induk brand.'],
            ['Sistem','Activity Log, Pengaturan','Riwayat, kru, dan hak akses.']
          ] },
        { t:'catatan', nada:'info', judul:'Yang sudah selesai diarsipkan sendiri',
          isi:'Content Planning dan ketiga antrian produksi terbuka di *Aktif* — yang sudah '
            + 'tayang atau selesai tidak lagi ditampilkan. Jumlah yang disembunyikan disebut '
            + 'angkanya di kepala halaman, jadi daftar yang menyusut bukan data yang hilang. '
            + 'Untuk melihatnya, ganti saringannya ke *Arsip* atau *Semua*.' },
        { t:'catatan', nada:'info', judul:'Kalau menekan Reset, saringannya kembali ke Aktif',
          isi:'Bukan ke Semua. Reset yang justru memunculkan seluruh arsip adalah kebalikan dari '
            + 'yang diharapkan orang yang menekannya.' }
      ]
    },

    {
      id: 'rencana', judul: 'Merencanakan Konten',
      isi: [
        { t:'langkah', isi:[
          'Buka *Content Planning*, buat konten baru.',
          'Isi judul, *brand*, dan *pillar*-nya.',
          'Pilih *platform* tempat ia akan tayang. Boleh lebih dari satu.',
          'Tentukan *PIC* dan *tanggal tayang* yang direncanakan.',
          'Simpan.'
        ]},
        { t:'catatan', nada:'awas', judul:'Isi platformnya sejak awal',
          isi:'Konten yang belum punya satu pun platform tidak akan pernah bisa dinyatakan '
            + 'lengkap di halaman Input Performa — angkanya diisi PER PLATFORM. Halaman itu '
            + 'menyebutkan konten mana yang belum punya platform, tapi jauh lebih murah '
            + 'mengisinya sekarang.' },
        { t:'catatan', nada:'info', judul:'Menyaring per PIC',
          isi:'Baris penyaring di Pipeline dan Content Planning menyebut jumlah konten tiap '
            + 'orang di pilihannya — itu yang dicari kalau kamu ingin tahu siapa yang sedang '
            + 'menumpuk pekerjaan. Ada juga pilihan *Belum ada PIC*.' },
        { t:'catatan', nada:'info', judul:'Kartu Tugas Saya membaca DEADLINE',
          isi:'Di Dashboard, kartu itu mengumpulkan dari tiga sumber sekaligus: konten yang '
            + 'PIC-nya kamu, sub-tugas produksi di dalamnya, dan tugas produksi mandiri. Yang '
            + 'paling lewat tenggat berdiri paling atas.' }
      ]
    },

    {
      id: 'produksi', judul: 'Antrian Produksi',
      isi: [
        { t:'teks', isi:'Tiga halaman — *Shooting Schedule*, *Design Queue*, dan *Editing '
              + 'Queue* — bentuknya sama: daftar pekerjaan yang belum selesai di tahap itu, '
              + 'dengan kotak cari dan penyaring di atasnya.' },
        { t:'langkah', isi:[
          'Buka antrian tahapmu.',
          'Cari pekerjaanmu, atau saring per PIC.',
          'Kerjakan, lalu centang selesai.',
          'Begitu dicentang, ia pindah ke arsip dan tahap berikutnya bisa mulai.'
        ]},
        { t:'catatan', nada:'info', judul:'Mengetik di kotak cari tidak lagi melempar fokus',
          isi:'Dulu hanya huruf pertama yang masuk karena seluruh halaman digambar ulang tiap '
            + 'ketukan. Sekarang yang digambar ulang cuma tabelnya. Kalau suatu hari gejala itu '
            + 'kembali, laporkan — jangan diakali dengan mengetik lambat-lambat.' },
        { t:'catatan', nada:'info', judul:'Satu pekerjaan bisa punya lebih dari satu jenis',
          isi:'Satu materi bisa dipakai sebagai Reel sekaligus Story; satu desain bisa dicetak '
            + 'A4 sekaligus X Banner. Itu sebabnya kolom jenis di Performa Desain tidak bisa '
            + 'dijumlahkan — angkanya disebut di kartunya.' }
      ]
    },

    {
      id: 'performa', judul: 'Mengisi & Membaca Angka Performa',
      isi: [
        { t:'teks', isi:'Angka insight dari tiap platform diketik di halaman *Input Performa*, '
              + 'lalu dibaca di *Performa Konten* dan *Performa Desain*. Tanpa langkah pertama, '
              + 'kedua halaman analisa itu kosong.' },
        { t:'langkah', isi:[
          'Buka *Input Performa*. Bawaannya menampilkan yang *belum lengkap*.',
          'Pilih kontennya, lalu isi angkanya PER PLATFORM.',
          'Isi *reach* kalau ada. Kalau tidak, isi *impression*.',
          'Isi like, komentar, share, save, dan klik CTA sesuai yang tersedia di insight.',
          'Simpan, dan tunggu sampai server menjawab.'
        ]},
        { t:'catatan', nada:'awas', judul:'Reach dan impression bukan hal yang sama',
          isi:'Impression selalu lebih besar atau sama dengan reach, jadi baris yang terpaksa '
            + 'memakai impression akan berbunyi rasio LEBIH KECIL daripada seharusnya. Itu bukan '
            + 'konten yang gagal — itu penyebut yang berbeda, dan tiap selnya menyebutkan yang '
            + 'mana yang dipakai. Isilah reach kalau platformnya menyediakannya.' },
        { t:'tabel',
          kepala:['Angka','Rumusnya','Menjawab'],
          baris:[
            ['Engagement Rate','(like + komentar + share + save) dibagi reach','Seberapa banyak yang bereaksi.'],
            ['Virality Index','(share + save) dibagi reach','Seberapa banyak yang MENERUSKANNYA ke orang lain.'],
            ['CTA Click Rate','klik CTA dibagi reach','Seberapa banyak yang menindaklanjuti.']
          ] },
        { t:'catatan', nada:'info', judul:'Kenapa Virality tidak memakai like & komentar',
          isi:'Keduanya berhenti di layar orang yang sudah melihat. Yang membawa kontenmu ke '
            + 'orang berikutnya cuma share dan save.' },
        { t:'catatan', nada:'awas', judul:'Mengosongkan seluruh kotak sebuah platform = menghapus catatannya',
          isi:'Itu memang satu-satunya cara membatalkan angka yang salah masuk, dan ia ditanya '
            + 'dulu dengan pertanyaan yang menyebut platform mana. Jangan mengosongkannya cuma '
            + 'karena angkanya belum sempat dicek.' },
        { t:'catatan', nada:'info', judul:'Konten yang tayang di dua platform bukan dua konten',
          isi:'Kartu dan tabel pillar menghitung KONTEN; tabel per platform menghitung BARIS. '
            + 'Bedanya disebut di kartunya, jadi jangan menyimpulkan salah satunya salah hitung.' },
        { t:'catatan', nada:'info', judul:'Bulan tayang dibaca dari kapan ia BENAR-BENAR tayang',
          isi:'Bukan dari tanggal rencananya. Konten yang mundur seminggu dihitung di bulan ia '
            + 'benar-benar tayang, supaya angka bulan lalu tidak berubah sendiri tiap ada yang mundur.' }
      ]
    },

    {
      id: 'iklan', judul: 'Ads & Report Percakapan',
      isi: [
        { t:'langkah', judul:'Mencatat iklan', isi:[
          'Buka *Ads Management*, tambahkan iklan.',
          'Isi nama, platform, tanggal mulai, dan dana keluarnya.',
          'Isi *Link Video yang Dipromosikan*. Tempel tautan lengkapnya.'
        ]},
        { t:'catatan', nada:'info', judul:'Tautan tanpa http akan dirapikan, yang bukan tautan ditolak',
          isi:'Tanpa itu, tombol bukanya justru membuka halaman modul ini sendiri — dan yang '
            + 'mengkliknya mengira videonya sudah dihapus. Platform materinya dibaca dari alamat '
            + 'tautannya, bukan dari kolom platform iklan: satu iklan Meta bisa mendorong reel '
            + 'Instagram maupun video Facebook.' },
        { t:'teks', isi:'*Report Percakapan* membandingkan iklan dari dua sisi: mana yang paling '
              + 'banyak menghasilkan chat, dan mana yang paling murah per chat. Keduanya sering '
              + 'menjawab berbeda — iklan berbudget besar hampir selalu menang di kolom jumlah, '
              + 'sementara yang dipakai memutuskan anggaran kolom biaya per chat.' },
        { t:'catatan', nada:'awas', judul:'Iklan yang dana keluarnya belum diisi dikeluarkan dari peringkat termurah',
          isi:'Kalau ikut, ia SELALU jadi juara — Rp0 per chat. Itu kesalahan yang tidak akan '
            + 'dipertanyakan siapa pun karena angkanya memang yang paling kecil. Jumlah iklan '
            + 'yang dikeluarkan disebut berikut cara membetulkannya.' }
      ]
    },

    {
      id: 'masalah', judul: 'Masalah Umum',
      isi: [
        { t:'tabel',
          kepala:['Gejala','Kemungkinan sebabnya','Yang perlu dilakukan'],
          baris:[
            ['Konten yang saya cari tidak ada di daftar',
             'Ia sudah tayang atau selesai, jadi masuk arsip.',
             'Ganti saringannya ke Arsip atau Semua.'],
            ['Halaman Performa Konten kosong',
             'Angkanya belum diisi di Input Performa.',
             'Buka Input Performa. Ia menyebut berapa konten tayang yang belum diisi.'],
            ['Rasio sebuah konten berbunyi tanda hubung',
             'Reach dan impression dua-duanya kosong.',
             'Isi salah satunya. Tanda hubung sengaja dipakai, bukan nol — nol berarti hal lain.'],
            ['Performa Desain tidak menghitung request dari Marketing',
             'Memang tidak ikut, dan itu disebut di kartunya.',
             'Request yang sudah dikerjakan tidak pernah sampai ke modul ini. Bukan kerusakan.'],
            ['Saya tidak bisa membuka daftar kru',
             'Daftar kru pindah ke halaman Pengaturan.',
             'Buka Pengaturan. Content Director tetap bisa melihatnya walau kartu pengaturan lain tertutup.'],
            ['Menu Workload / Content Bank / Reports hilang',
             'Ketiganya memang dicabut.',
             'Ekspor CSV pindah ke Pengaturan. Angka performa pindah ke Performa Konten.']
          ] }
      ]
    }

  ]
});
